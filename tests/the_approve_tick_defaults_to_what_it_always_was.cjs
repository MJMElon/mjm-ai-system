/* APPROVE HAD NO GATE AT ALL, SO IT HAD TO BE ADDED WITHOUT TAKING IT AWAY.

   approveSubmission() in plot_maintenance_script.js lets the office accept
   a Worker Portal field record that the Field Conductor rejected — it
   moves the record into the approved list and starts counting towards the
   week. Nothing asked a permission question before today: anybody who
   could open the Nursery Maintenance page could already press it.

   Feature Permission Control asked for a standardized Approve tick on
   every module that has something to approve (operation's Batch Records
   already has one, under the key 'review' — "Review & approve reports" —
   and canDoOperation() already reads a saved tick for it ahead of the
   admin-only legacy fallback, so that one needed no change). Nursery
   Maintenance's Approve had no tick and no gate at all, which is the shape
   this file holds.

   THE TRAP IS THE SAME ONE VERIFY AND UNLOCK ALREADY HIT: a brand new
   action key added to a page that already has saved rows reads as
   UNTICKED on every one of them, because effectiveActions() treats an
   absent key as "the office said no" for anyone it has a saved opinion
   about at all. Reading that as denied would take Approve away from
   every nursery_ops normal user already configured on this page the
   moment this shipped -- the office never asked for that, and nobody
   would notice until somebody tried to press it.

   So the action carries `fallbackTo:'view'`: a row with no opinion on
   'approve' reads whatever 'view' (the page being open at all) answers --
   which is exactly the ungated behaviour this is standing in for. Once an
   admin explicitly ticks or unticks it and saves, their own answer is
   what is read from then on. plot_maintenance_script.js's own
   mayMaintAct('approve', 'view') is the same fallback, by name, so the
   runtime gate and the screen's own tick cannot disagree.

   Run: node tests/the_approve_tick_defaults_to_what_it_always_was.cjs
   No build, no browser and no server needed.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

let failed = 0;
const fail = (m) => { console.log('FAIL  ' + m); failed++; };
const pass = (m) => console.log('pass  ' + m);
const is = (m, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass(m + '  → ' + JSON.stringify(got));
  else fail(m + '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want));
};

const SCRIPT = read('nursery_ops', 'plot_maintenance_script.js');
const SCREEN = read('nursery_ops', 'nursery_ops_user_access.html');
const SHARED = read('shared', 'shared_module_access.js');

/* ── The page's own runtime gate, lifted out of the shipped file ─────── */
function liftMayApprove(perms) {
  const at = SCRIPT.indexOf('function mayMaintAct(key, fallbackKey)');
  if (at < 0) throw new Error('mayMaintAct is not in plot_maintenance_script.js');
  const levelAt = SCRIPT.indexOf('function _nopsLevel()', at);
  const levelEnd = SCRIPT.indexOf('\n}', levelAt);
  const end = levelEnd;
  const ctx = { MJMAccess: { permissions: () => perms } };
  vm.createContext(ctx);
  vm.runInContext(SCRIPT.slice(at, end + 2) + '; _r = mayMaintAct("approve", "view");', ctx);
  return ctx._r;
}

/* ── The screen's rule, lifted out of the shipped shared file ────────── */
function liftEffective(perms, lvl) {
  const at = SHARED.indexOf('function effectiveActions(perms, d)');
  if (at < 0) throw new Error('effectiveActions is not in shared_module_access.js');
  const end = SHARED.indexOf('\n    }', at);
  const ctx = { ACT_KEY: 'nursery_ops_actions', MODULE: 'nursery_ops' };
  vm.createContext(ctx);
  const page = {
    key: 'maintenance',
    actions: [
      { key: 'add_record' }, { key: 'tick_schedule' }, { key: 'worker_record' },
      { key: 'approve', fallbackTo: 'view' },
      { key: 'setting', adminOnly: true },
    ],
  };
  const p = JSON.parse(JSON.stringify(perms || {}));
  p.modules = Object.assign({}, p.modules, { nursery_ops: lvl });
  vm.runInContext(SHARED.slice(at, end + 6) + '; _r = effectiveActions(P, D);',
                  Object.assign(ctx, { P: p, D: page }));
  return ctx._r;
}

const CASES = [
  { what: 'a normal user with no saved row at all — the module level decides',
    lvl: 'normal', perms: { modules: { nursery_ops: 'normal' } }, want: true },

  { what: 'an admin with no saved row',
    lvl: 'admin', perms: { modules: { nursery_ops: 'admin' } }, want: true },

  { what: 'a none-level login with no saved row',
    lvl: 'none', perms: { modules: { nursery_ops: 'none' } }, want: false },

  /* THE ROW THIS TICK HAD TO BE ADDED AROUND. Saved before 'approve'
     existed, so it carries every other key and no opinion on this one —
     reading that as off would be the exact fault the house style keeps
     a heading about. */
  { what: 'a row saved BEFORE this tick existed still allows it',
    lvl: 'normal',
    perms: { modules: { nursery_ops: 'normal' },
             nursery_ops_actions: { maintenance: { view: true, add_record: true,
               tick_schedule: true, worker_record: true } } },
    want: true },

  /* A saved row is authoritative once the office has actually touched it,
     for an admin too — same rule Verify/Unlock and Open Setting follow. */
  { what: 'an admin the office has deliberately unticked',
    lvl: 'admin',
    perms: { modules: { nursery_ops: 'admin' },
             nursery_ops_actions: { maintenance: { view: true, approve: false } } },
    want: false },

  { what: 'a normal user the office has deliberately ticked',
    lvl: 'normal',
    perms: { modules: { nursery_ops: 'normal' },
             nursery_ops_actions: { maintenance: { view: true, approve: true } } },
    want: true },

  /* The page closed closes every function on it, approve included. */
  { what: 'the whole page closed, tick or no tick',
    lvl: 'normal',
    perms: { modules: { nursery_ops: 'normal' },
             nursery_ops_actions: { maintenance: { view: false, approve: true } } },
    want: false },
];

console.log('-- 1. The page obeys the tick --');
for (const c of CASES) is(c.what, liftMayApprove(c.perms), c.want);

console.log('\n-- 2. The screen and the page agree, row for row --');
for (const c of CASES) {
  const screenSays = !!liftEffective(c.perms, c.lvl).approve;
  const pageSays = liftMayApprove(c.perms);
  is(c.what, [pageSays, screenSays], [c.want, c.want]);
}

console.log('\n-- 3. The tick the screen offers is the key the page reads --');
{
  const at = SCREEN.indexOf("key:'maintenance'");
  const end = SCREEN.indexOf('actions:[]', at) >= 0 && SCREEN.indexOf('actions:[]', at) < SCREEN.indexOf(']}', at)
    ? SCREEN.indexOf('actions:[]', at) : SCREEN.indexOf(']}', at);
  const block = SCREEN.slice(at, end);
  const offers = /key:\s*'approve'/.test(block) && /fallbackTo:\s*'view'/.test(block);
  if (offers) pass('the screen offers an "approve" action under maintenance, falling back to view');
  else fail('the screen does not offer the approve/fallbackTo:view action under maintenance');
}

console.log('\n-- 4. The runtime write asks before the write, not after --');
{
  const at = SCRIPT.indexOf('async function approveSubmission(id)');
  if (at < 0) { fail('approveSubmission is not in plot_maintenance_script.js'); }
  else {
    const end = SCRIPT.indexOf('\n}', at);
    const body = SCRIPT.slice(at, end);
    const askIdx = body.indexOf("mayMaintAct('approve'");
    const confirmIdx = body.indexOf('confirm(');
    const updateIdx = body.indexOf(".from('nops_maint_field_records')");
    is('the gate is asked', askIdx >= 0, true);
    if (askIdx >= 0 && confirmIdx >= 0) is('before the confirm dialog', askIdx < confirmIdx, true);
    if (askIdx >= 0 && updateIdx >= 0) is('and before the write', askIdx < updateIdx, true);
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nall good');
process.exit(failed ? 1 : 0);
