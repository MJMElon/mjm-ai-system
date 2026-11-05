/* CHECKED LOCKS THE CAPACITY. IT DOES NOT LOCK WHO DID THE WORK.
 *
 * The office hit the refusal on their own Oct 2026 Manuring sheet and said
 * what the rule is: "这边lock的只有capacity 但是是哪一个工人做的 还是可以改".
 *
 * It had been locked for a month, on the argument that a row's capacity is
 * SHARED between the workers ticked on it, so moving a tick moves what the
 * others are paid while the row's own figure does not budge. True as far as
 * it goes -- and it was never asked for. The two things are not alike:
 *
 *   the QUANTITY  is a live sum of the ledger, which goes on moving after the
 *                 row is agreed. That is the whole reason Checked writes it
 *                 down (qtyFrozen), and that half is untouched.
 *   the CREW      is a fact about a morning, recorded NOWHERE ELSE in this
 *                 system. A wrong name has one place to be put right, and
 *                 the office -- who read the claim and find it -- must be
 *                 able to fix it where they find it.
 *
 * TWO WRITERS, AND THEY NO LONGER ANSWER THE SAME WAY. That asymmetry is the
 * point of this file rather than an oversight in it:
 *
 *   togglePayrollTick  somebody pressing the cell          -- ALLOWED now
 *   syncTicks          applyFieldRecords, on every load    -- still REFUSED
 *
 * A person correcting a name is what was asked for. A page load re-writing an
 * agreed row is not a person: it moves the piece-rate split with nobody
 * acting and nothing on screen saying so. Same shape as "the field fills an
 * empty cell, it never writes over a full one", one row along.
 *
 * Both are lifted out of the shipped page rather than described.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'nursery_ops', 'plot_maintenance_script.js'), 'utf8');

function slice(startMark, endMark, label) {
  const a = SRC.indexOf(startMark);
  if (a < 0) throw new Error(`cannot find the start of ${label} -- has it been renamed?`);
  const b = SRC.indexOf(endMark, a);
  if (b < 0) throw new Error(`cannot find the end of ${label}`);
  return SRC.slice(a, b + endMark.length);
}

let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? 'pass' : 'FAIL'}  ${what}`);
  if (!cond) fails++;
};

/* ── 1. the cell somebody presses ─────────────────────────────────────── */
{
  const body = slice('function togglePayrollTick(recId, worker) {',
                     '\n}', 'togglePayrollTick');
  const env = {
    records: [
      { id: 1, checked: false, plot: 'B1', jenis: 'Membaja' },
      { id: 2, checked: true,  plot: 'B1', jenis: 'Membaja' },
    ],
    payrollData: {},
    _payrollView: 'manuring',
    alerts: 0,
    renders: 0,
    persists: 0,
  };
  /* _recLocked, alert AND the old _denyPayrollLocked are still in scope on
     purpose. If the refusal came back, the harness RUNS it rather than dying
     on an undefined name -- so the checks below fail by name, which is the
     whole value of running this against the previous code. */
  const fn = new Function('env', `
    const records = env.records;
    const payrollData = env.payrollData;
    let _payrollView = env._payrollView;
    const getNursery = () => 'BNN';
    const getMonth   = () => 'Sep 2026';
    const payrollKey = (n, m, t) => n + '_' + m + '_' + t;
    const renderPayroll  = () => { env.renders++; };
    const persistPayroll = () => { env.persists++; };
    const _recLocked = (r) => !!(r && r.checked);
    const alert = () => { env.alerts++; };
    const _denyPayrollLocked = () => { alert(); };
    /* THE SHEET'S OWN VERIFY & LOCK is a different gate and arrived later:
       wrAllows() refuses every press on a sheet somebody has signed off
       (tests/the_worker_record_is_verified_and_locked.cjs holds it). This
       file is about the per-ROW Checked rule, so the sheet is OPEN here.
       env.sheetShut drives it, and the pair of checks after section 1 turns
       it on, so the two gates are seen not to have become one.
       NO BACKTICK IN THIS COMMENT: it is inside a template literal, and one
       would end it -- the trap CLAUDE.md names about a design note in a
       template literal, met here in a test harness. */
    const wrAllows = () => { if (!env.sheetShut) return true; alert(); return false; };
    ${body}
    return togglePayrollTick;
  `)(env);

  const k = 'BNN_Sep 2026_manuring';

  fn(1, 'Andi Rosmini');
  ok(env.payrollData[k] && env.payrollData[k][1] &&
     env.payrollData[k][1]['Andi Rosmini'] === 1,
     'an unchecked row takes a tick');

  // THE OFFICE'S OWN CASE: the row is Checked and the name is still keyable.
  fn(2, 'Haerul');
  ok(env.payrollData[k] && env.payrollData[k][2] &&
     env.payrollData[k][2]['Haerul'] === 1,
     'a CHECKED row takes a tick -- the lock is on the capacity, not the crew');

  /* And it comes off again, or a wrong name could be added and never
     removed. Asked as a PAIR -- on a page that refused the first press there
     is nothing to untick, so "it is absent now" passes for the wrong reason
     and proves nothing about unticking. */
  const wasOn = !!(env.payrollData[k] && env.payrollData[k][2] &&
                   env.payrollData[k][2]['Haerul']);
  fn(2, 'Haerul');
  ok(wasOn && !((env.payrollData[k] || {})[2] || {})['Haerul'],
     '...and a second press takes it off a checked row again');

  ok(env.alerts === 0, 'nothing is alerted at a person correcting a name');

  ok(env.renders === 3 && env.persists === 3,
     'every press redraws and saves, the checked row included');

  /* A cell drawn before the row was checked used to be the trap: the refusal
     had to live in the function and not only in the markup. There is no
     refusal now, so the opposite is what must hold -- the row's state does
     not change the answer at all. */
  env.records[0].checked = true;
  fn(1, 'Yuyak');
  ok(env.payrollData[k][1] && env.payrollData[k][1]['Yuyak'] === 1,
     'checking a row between the draw and the press changes nothing');

  /* ── THE TWO GATES ARE NOT ONE ──────────────────────────────────────
     Checked is per ROW and about the CAPACITY; Verify & lock is per SHEET
     and shuts the lot, which the office asked for later. The whole value
     of this file is that the first one does not refuse a press, so the
     second one arriving must not quietly make it look as though it does.
     Driven as a PAIR, for the reason the untick above is: a press that
     changes nothing proves nothing unless something changed before it. */
  const beforeShut = JSON.stringify(env.payrollData);
  env.sheetShut = true;
  fn(1, 'Sabri');
  ok(JSON.stringify(env.payrollData) === beforeShut,
     'a VERIFIED sheet refuses the same press the checked row allows');
  env.sheetShut = false;
  fn(1, 'Sabri');
  ok(env.payrollData[k][1] && env.payrollData[k][1]['Sabri'] === 1,
     '...and unlocking the sheet gives the press straight back');
}

/* ── 2. the field, on every page load, is NOT a person ────────────────── */
{
  const body = slice('const syncTicks = (rec, group) => {',
                     '\n  };', 'syncTicks');
  const make = (checked) => {
    const env = { payrollData: {}, unmatched: new Set(), touched: new Set() };
    const fn = new Function('env', `
      const payrollData = env.payrollData;
      const unmatched = env.unmatched;
      const touched = env.touched;
      const nursery = 'BNN', monthLbl = 'Sep 2026';
      const payrollKey = (n, m, t) => n + '_' + m + '_' + t;
      const _PAYROLL_TYPE_BY_JENIS = { 'Membaja': 'manuring' };
      const _matchWorkerName = (n, name) => name;
      const _recLocked = (r) => !!(r && r.checked);
      ${body}
      return syncTicks;
    `)(env);
    const rec = { id: 7, checked, jenis: 'Membaja' };
    fn(rec, { workers: ['Andi Rosmini', 'Yuyak'] });
    return env;
  };

  const open = make(false);
  ok(open.payrollData['BNN_Sep 2026_manuring'] &&
     open.payrollData['BNN_Sep 2026_manuring'][7],
     'the field still fills an unchecked row');

  const shut = make(true);
  ok(Object.keys(shut.payrollData).length === 0,
     'the field does NOT reopen a checked row, even now the screen will');
  ok(shut.touched.size === 0,
     'and does not mark the sheet for saving, so nothing is written back');
}

/* ── 3. the markup, because a refusal left in it is a cell that lies ──── */
{
  /* The maintenance tick cell carries NO lock class and NO conditional
     handler: a greyed cell over a gate that allows the press is the worst
     kind of wrong, because it looks configured. */
  let cell = '';
  try {
    cell = slice("${wk.map(w => `<td class=\"check-td${cells[w] ? ' ticked' : ''}",
                  '</td>`).join(\'\')}', 'the maintenance tick cell');
  } catch (e) { cell = '[the cell could not be found: ' + e.message + ']'; }
  ok(!/\blocked\b/.test(cell),
     'the maintenance tick cell is drawn with no lock state');
  ok(cell.includes('onclick="togglePayrollTick(') && !cell.includes('_deny'),
     '...and its handler is the toggle, unconditionally');

  ok(!SRC.includes('_denyPayrollLocked'),
     'the refusal is gone from the page, not merely unreachable');
  ok(!SRC.includes('pay.lockedTitle'),
     'and so is the label that said Checked -- locked');

  /* THE LOADING SEEDLINGS SHEET HAS ITS OWN LOCK AND IT IS NOT THIS ONE.
     That one is a 🔒 somebody deliberately presses on a DO's gang, stored as
     worked_by_locked_at, and the office did not ask for it to move. Taking
     the Checked lock off must not take that one with it. */
  ok(SRC.includes('_denyDoLocked') && SRC.includes('function _doLocked'),
     'the DO gang lock on Loading Seedlings is untouched');
  ok(SRC.includes('lockDoWorkers('),
     '...and the button that sets it is still there');
}

console.log(fails ? `\n${fails} failed` : '\nall good');
process.exit(fails ? 1 : 0);
