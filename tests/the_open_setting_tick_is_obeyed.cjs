/* THE OFFICE TICKED "OPEN SETTING" AND NOTHING HAPPENED.

   A normal-level user was granted *Open Setting (piece rates, plots,
   workers)* on the Nursery Maintenance module. It saved, it showed as set
   on the User Access screen afterwards, and she opened the page to find
   no Setting tab at all.

   The tick was written by nursery_ops_user_access.html and READ BY
   NOTHING. The Setting tab asked one question -- is this person an admin
   of the nursery_ops module -- and that was the whole gate, so a tick
   that is not a module level could never move it. A permission saved and
   not obeyed looks configured, which is why it is the worst kind: the
   office has no reason to look again.

   Two things are held here, and the second is what stops it coming back:

     1. the page obeys the tick, and
     2. THE PAGE AND THE SCREEN CONCLUDE THE SAME THING. The screen draws
        a tick from effectiveActions(); the page opens the tab from
        maySetting(). Two readers of one answer is how they drift, so the
        same saved rows go through BOTH -- lifted out of the shipped files
        rather than transcribed -- and any row where they disagree is a
        failure.

   Run: node tests/the_open_setting_tick_is_obeyed.cjs
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

/* ── The page's rule, lifted out of the shipped file ───────────────────
   IT STILL RUNS ON A VERSION THAT HAS NO maySetting. A test that throws
   on the previous code reports nothing about it, and what the previous
   code DID is the whole argument for the change -- so the absence is one
   named failure and every case below then answers the way that version
   answered: the module level, and nothing else. */
let _noMaySetting = false;
function liftMaySetting(perms, admin) {
  const at = SCRIPT.indexOf('function maySetting()');
  if (at < 0) {
    if (!_noMaySetting) {
      _noMaySetting = true;
      fail('maySetting is not in plot_maintenance_script.js — the gate is the '
         + 'module level alone, so the tick is read by nothing');
    }
    return admin;                       // what the Setting tab used to ask
  }
  const end = SCRIPT.indexOf('\n}', at);
  const ctx = {
    isNopsAdmin: admin,
    MJMAccess: { permissions: () => perms },
  };
  vm.createContext(ctx);
  vm.runInContext(SCRIPT.slice(at, end + 2) + '; _r = maySetting();', ctx);
  return ctx._r;
}

/* ── The screen's rule, lifted out of the shipped shared file ────────── */
function liftEffective(perms, lvl) {
  const at = SHARED.indexOf('function effectiveActions(perms, d)');
  if (at < 0) throw new Error('effectiveActions is not in shared_module_access.js');
  /* It closes on a line of its own at this indent. */
  const end = SHARED.indexOf('\n    }', at);
  const ctx = { ACT_KEY: 'nursery_ops_actions', MODULE: 'nursery_ops' };
  vm.createContext(ctx);
  const page = {
    key: 'maintenance',
    actions: [
      { key: 'add_record' }, { key: 'tick_schedule' },
      { key: 'worker_record' }, { key: 'setting', adminOnly: true },
    ],
  };
  const p = JSON.parse(JSON.stringify(perms || {}));
  p.modules = Object.assign({}, p.modules, { nursery_ops: lvl });
  vm.runInContext(SHARED.slice(at, end + 6) + '; _r = effectiveActions(P, D);',
                  Object.assign(ctx, { P: p, D: page }));
  return ctx._r;
}

/* Every shape a row comes in, and what each one means. `admin` is what
   MJMAccess.isAdminOf('nursery_ops') answers, which is the module level. */
const CASES = [
  { what: 'the office ticked it for a NORMAL user',
    lvl: 'normal',
    perms: { modules: { nursery_ops: 'normal' },
             nursery_ops_actions: { maintenance: { view: true, add_record: true,
               tick_schedule: true, worker_record: true, setting: true } } },
    want: true },

  { what: 'a normal user nobody has ticked it for',
    lvl: 'normal',
    perms: { modules: { nursery_ops: 'normal' },
             nursery_ops_actions: { maintenance: { view: true, add_record: true,
               tick_schedule: true, worker_record: true, setting: false } } },
    want: false },

  /* NOBODY HAS BEEN ASKED. The module level decides, which is what
     governed this before the tick existed -- and it is the case a
     generic canDo() gets wrong, because absent means yes to everything
     there and this function is admin-only. */
  { what: 'a normal user with no saved row at all',
    lvl: 'normal',
    perms: { modules: { nursery_ops: 'normal' } },
    want: false },

  { what: 'an ADMIN with no saved row',
    lvl: 'admin',
    perms: { modules: { nursery_ops: 'admin' } },
    want: true },

  /* A saved row is authoritative for an admin too: unticking it for one
     is a decision somebody made, not an oversight, and a screen drawing
     it unticked over a gate that allows it is the worst kind of wrong. */
  { what: 'an admin the office has deliberately unticked',
    lvl: 'admin',
    perms: { modules: { nursery_ops: 'admin' },
             nursery_ops_actions: { maintenance: { view: true, setting: false } } },
    want: false },

  /* The page closed closes every function on it. */
  { what: 'the whole page closed, tick or no tick',
    lvl: 'normal',
    perms: { modules: { nursery_ops: 'normal' },
             nursery_ops_actions: { maintenance: { view: false, setting: true } } },
    want: false },
];

console.log('\n-- 1. The page obeys the tick --');
CASES.forEach((c) => {
  is(c.what, liftMaySetting(c.perms, c.lvl === 'admin'), c.want);
});

console.log('\n-- 2. The screen and the page agree, row for row --');
CASES.forEach((c) => {
  const eff = liftEffective(c.perms, c.lvl);
  const screenSays = !!eff.setting;
  const pageSays = liftMaySetting(c.perms, c.lvl === 'admin');
  if (screenSays === pageSays) pass(c.what + '  → both ' + screenSays);
  else fail(c.what + '\n        the screen draws ' + screenSays
                   + ' and the page opens ' + pageSays);
});

console.log('\n-- 3. Unreadable permissions do not open the piece rates --');
{
  /* Failing OPEN is right for a door somebody already held; it is wrong
     for this one, which is the money side of the module. The old tab had
     the same safe default and it is deliberately kept. */
  const at = SCRIPT.indexOf('function maySetting()');
  const end = SCRIPT.indexOf('\n}', at);
  const body = at < 0 ? 'function maySetting() { return isNopsAdmin; }'
                      : SCRIPT.slice(at, end + 2);
  const run = (admin, access) => {
    const ctx = { isNopsAdmin: admin, MJMAccess: access };
    vm.createContext(ctx);
    vm.runInContext(body + '; _r = maySetting();', ctx);
    return ctx._r;
  };
  is('no MJMAccess at all, and not an admin', run(false, undefined), false);
  is('permissions() throws, and not an admin',
     run(false, { permissions: () => { throw new Error('nope'); } }), false);
  is('but an admin still gets in', run(true, undefined), true);
}

console.log('\n-- 4. Nothing else moved --');
{
  /* isNopsAdmin answers two OTHER questions, and neither is "may you open
     Setting". Widening those would have handed a DO lock override and the
     culling-incentive crew to anybody ticked for piece rates. */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const body = strip(SCRIPT);
  is('a locked DO still asks the module level',
     /_doLocked\(d\)\s*\{[^}]*isNopsAdmin/.test(body), true);
  is('and so does handing out culling incentive',
     /_cullMayHand\(\)\s*\{\s*if \(isNopsAdmin\)/.test(body), true);

  /* The four doors into Setting all ask the one function. A guard left on
     the module level is a tab somebody can open and a save that refuses. */
  const gates = (body.match(/maySetting\(\)/g) || []).length;
  is('all four Setting gates ask it', gates >= 4, true);
  is('the tab button is one of them', /tab-btn-setting[\s\S]{0,120}may/.test(body), true);
  is('switching to it is another', /name === 'setting' && !maySetting\(\)/.test(body), true);
  is('saving the piece rates is the third',
     /savePieceRates[\s\S]{0,200}maySetting\(\)/.test(body), true);
  is('and unlocking them the fourth',
     /unlockPieceRates[\s\S]{0,200}maySetting\(\)/.test(body), true);
}

console.log('\n-- 5. The tick the screen offers is the key the page reads --');
{
  /* A case nobody would catch by looking: the screen writing `settings`
     and the page reading `setting` saves cleanly, shows as set, and does
     nothing -- which is this fault exactly, one letter along. */
  is('the screen offers a "setting" action under maintenance',
     /key:'maintenance'[\s\S]{0,900}key:'setting'/.test(SCREEN), true);
  is('and declares it admin-only, which is what "no saved row" falls back to',
     /key:'setting'[\s\S]{0,300}adminOnly:true/.test(SCREEN), true);
  is('the page reads that exact key',
     /nursery_ops_actions && [\s\S]{0,60}\.maintenance[\s\S]{0,120}acts\.setting/.test(SCRIPT), true);
}

console.log('\n' + (failed ? 'FAILURES: ' + failed : 'all good'));
process.exit(failed ? 1 : 0);
