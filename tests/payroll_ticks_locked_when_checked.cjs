/* CHECKED LOCKS THE WORKER RECORD'S TICKS, ROW BY ROW.
 *
 * The Work Maintenance list already locks a Checked row, because Checked is
 * what sends it to the payroll claim. The Worker Record decides something the
 * claim reads just as directly: a row's capacity is SHARED between the workers
 * ticked on it, so adding or removing one tick changes what everybody else on
 * that row is paid while the row's own figure does not move a seedling.
 *
 * There are TWO ways a tick gets written, and a lock on one of them is
 * decoration:
 *
 *   togglePayrollTick  somebody pressing the cell
 *   syncTicks          applyFieldRecords, on every page load, from the field
 *
 * The second is the dangerous one. If only the screen were locked, the next
 * page load would quietly move the ticks under a row the office has agreed --
 * a permission saved but not obeyed, which this codebase has been bitten by
 * three times.
 *
 * So both are tested here, by lifting the REAL functions out of the page
 * rather than describing them.
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
    function _denyPayrollLocked() { alert(); }
    ${body}
    return togglePayrollTick;
  `)(env);

  fn(1, 'Andi Rosmini');
  const k = 'BNN_Sep 2026_manuring';
  ok(env.payrollData[k] && env.payrollData[k][1] &&
     env.payrollData[k][1]['Andi Rosmini'] === 1,
     'an unchecked row still takes a tick');

  const before = JSON.stringify(env.payrollData);
  fn(2, 'Andi Rosmini');
  ok(JSON.stringify(env.payrollData) === before,
     'a CHECKED row refuses the tick');
  ok(env.alerts === 1, 'and says why, rather than doing nothing');

  // And it must not be fooled by a stale cell drawn before the row was checked.
  env.records[0].checked = true;
  const before2 = JSON.stringify(env.payrollData);
  fn(1, 'Yuyak');
  ok(JSON.stringify(env.payrollData) === before2,
     'a cell drawn BEFORE the row was checked is still refused');
}

/* ── 2. the field, on every page load ─────────────────────────────────── */
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
     'the field does NOT reopen a checked row');
  ok(shut.touched.size === 0,
     'and does not mark the sheet for saving, so nothing is written back');
}

/* ── 3. the row still shows who did the work ──────────────────────────── */
{
  // A locked row that hid its ticks would be useless: who did the work is the
  // thing the sheet is for. The render keeps the ticked class and only adds
  // the lock, so this guards the markup rather than the behaviour.
  const draws = SRC.includes("${cells[w] ? ' ticked' : ''}${locked ? ' locked' : ''}");
  ok(draws, 'a locked row still draws its ticks, it only stops taking new ones');
}

console.log(fails ? `\n${fails} failed` : '\nall good');
process.exit(fails ? 1 : 0);
