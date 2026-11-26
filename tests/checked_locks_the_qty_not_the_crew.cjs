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
 *   togglePayrollTick  somebody pressing the cell          -- ALLOWED
 *   syncTicks          applyFieldRecords, on every load    -- ADDS ONLY
 *
 * syncTicks refused a checked row outright for a month. The office found the
 * case that was wrong -- "如果我check了 还有工人的工作没被approved FC
 * approved了 所有资料一模一样 除了地图 和 员工 就给他进来就对了" -- and it is
 * the ADDITION half: a second worker verified after the row was checked
 * reached no tick at all, so his share of the plot was simply gone.
 *
 * WHAT STAYS REFUSED IS THE REMOVAL. A settled row must not lose a worker to
 * a record being deleted or unverified again: nobody acted, and the office
 * agreed that row with him on it. Same shape as "the field fills an empty
 * cell, it never writes over a full one", one row along.
 *
 * Both writers are lifted out of the shipped page rather than described.
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

/* ── 2. the field on a page load: it ADDS, and it never takes away ───── */
{
  const body = slice('const syncTicks = (rec, group) => {',
                     '\n  };', 'syncTicks');
  const K = 'BNN_Sep 2026_manuring';
  /* `seed` is what the sheet already holds for this row, so the two
     directions can be told apart: a group that GREW and a group that
     SHRANK. Asked of a row with nothing on it, both answer the same and
     the removal half is tested nowhere. */
  const run = (checked, seed, workers) => {
    const env = { payrollData: {}, unmatched: new Set(), touched: new Set() };
    if (seed) env.payrollData[K] = { 7: Object.assign({}, seed) };
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
    fn({ id: 7, checked, jenis: 'Membaja' }, { workers });
    return env;
  };
  const who = (env) => Object.keys((env.payrollData[K] || {})[7] || {}).sort();

  ok(who(run(false, null, ['Andi Rosmini', 'Yuyak'])).join() === 'Andi Rosmini,Yuyak',
     'the field still fills an unchecked row');

  /* THE OFFICE OWN CASE. The conductor pressed Verify after the row was
     checked; refused, this worker is credited by nothing at all. */
  ok(who(run(true, { 'Andi Rosmini': 'field' }, ['Andi Rosmini', 'Yuyak']))
       .join() === 'Andi Rosmini,Yuyak',
     'a worker verified AFTER the row was checked is let in');
  ok(run(true, { 'Andi Rosmini': 'field' }, ['Andi Rosmini', 'Yuyak'])
       .touched.has('manuring'),
     '...and the sheet is marked, so the tick is actually written back');

  ok(who(run(true, { 'Andi Rosmini': 'field', 'Yuyak': 'field' }, ['Andi Rosmini']))
       .join() === 'Andi Rosmini,Yuyak',
     'but NOBODY is taken off a settled row');
  ok(run(true, { 'Andi Rosmini': 'field', 'Yuyak': 'field' }, ['Andi Rosmini'])
       .touched.size === 0,
     '...and with nothing to add it writes nothing at all');

  /* A hand tick is the office own answer and this is a page load. */
  const hand = run(true, { 'Andi Rosmini': 1 }, ['Andi Rosmini', 'Yuyak']);
  ok(who(hand).join() === 'Andi Rosmini' && hand.touched.size === 0,
     'a row somebody corrected BY HAND is left alone, checked or not');

  /* The removal is still right where the office has settled nothing. */
  ok(who(run(false, { 'Andi Rosmini': 'field', 'Yuyak': 'field' }, ['Andi Rosmini']))
       .join() === 'Andi Rosmini',
     'an UNCHECKED row still follows its group both ways');
}

/* ── 3. and the WALK comes with him, which is the other half asked for ── */
{
  ok(!SRC.includes('if (!plots.includes(r.plot) || r.checked) return;'),
     'applyFieldRecords no longer skips a checked row outright');

  let branch = '';
  try {
    branch = slice('    if (r.checked) {\n      const gc', '\n    }',
                   'the checked-row branch of applyFieldRecords');
  } catch (e) { branch = '[not found: ' + e.message + ']'; }

  ok(/_fieldTracks/.test(branch), 'a checked row is handed the walk');
  ok(/_fieldIds/.test(branch),    '...and the records behind it, for the Audit column');
  ok(/syncTicks/.test(branch),    '...and the worker');
  /* EXACTLY TWO THINGS, which is the office own wording: 除了地图 和 员工.
     A date or a batch written here would move a settled row. */
  ok(!/tarikh|\.batch/.test(branch),
     'and nothing else -- no date and no batch reach a settled row');
  ok(/_chemMatched/.test(branch),
     '...and the chemical is asked, because one round can be two rows');
}

/* ── 3b. one round can be TWO rows, so the chemical is asked as well ──── */
{
  /* The office own U1: "Round 1: Antracol 50gm + Bond 15mL" and "Round 1:
     Cyper 60mL + Bond 15mL" are two P & D rows of the same plot in the same
     week, so ONE field group answers for both. On a checked row that would
     let a worker walk in off the other round and move a settled split. The
     REAL chemKey is used rather than a restatement of it. */
  require(path.join(__dirname, '..', 'shared', 'shared_maint_field.js'));
  const body = slice('function _chemMatched(row, list) {', '\n}', '_chemMatched');
  const fn = new Function('_chemKey', `${body}\nreturn _chemMatched;`)(
    globalThis.MJMMaintField.chemKey);

  const anta = { id: 1, chemical: 'Round 1: Antracol 50gm + Bond 15mL' };
  const cyp  = { id: 2, chemical: 'Cyper 60mL + Bond 15mL' };
  const bare = { id: 3, chemical: '' };
  const ids  = (xs) => xs.map((x) => x.id).join();

  ok(ids(fn({ racun: 'Round 1: Antracol 50gm + Bond 15mL' }, [anta, cyp])) === '1',
     'a checked row takes its own chemical and leaves the other round alone');
  ok(ids(fn({ racun: 'Antracol 50gm + Bond 15mL' }, [anta])) === '1',
     '...and the Round label off the front is not a difference');
  ok(ids(fn({ racun: 'Round 1: Antracol 50gm + Bond 15mL' }, [bare])) === '3',
     'a record with NO chemical has nothing to match on and keeps the round');
  ok(ids(fn({ racun: '' }, [anta, cyp])) === '1,2',
     'and a row with no chemical asks nothing -- it is a narrowing, never a widening');
  ok(fn({ racun: 'Round 1: Antracol 50gm + Bond 15mL' }, [cyp]).length === 0,
     'nothing left means nothing reaches the row at all');
}

/* ── 4. the markup, because a refusal left in it is a cell that lies ──── */
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
