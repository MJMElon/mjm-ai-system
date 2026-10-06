/* THE SALARY CLAIM IS THE FOURTH READER OF nops_maint_records, AND IT NEVER
 * ASKED THE MONTH.
 *
 * That list is ONE list for the whole system and every row carries _month.
 * The Work Maintenance page asks for it in all three of its readers. This
 * claim did not, so it summed every month at once: UNN 1 weeding read 191,515
 * against the 183,996 on its own Worker Record, the difference being one U18
 * row stamped Aug 2026.
 *
 * It was invisible while no other month held a CHECKED row. The moment one
 * did, it walked onto the claim and was priced.
 *
 * Lifts the REAL maintTotals out of npayroll_script.js.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'npayroll', 'npayroll_script.js'), 'utf8');

function slice(a, b, label) {
  const i = SRC.indexOf(a);
  if (i < 0) throw new Error(`cannot find the start of ${label}`);
  const j = SRC.indexOf(b, i);
  if (j < 0) throw new Error(`cannot find the end of ${label}`);
  return SRC.slice(i, j + b.length);
}

const body = slice('function _maintInMonth(r, m)', '\n  return per;\n}', 'maintTotals');

const MAINT_TYPES = [
  { code: 'weeding', label: 'Weeding', unit: 'Bag', jenis: 'Merumput', mark: [] },
];

function run(records) {
  const maint = { ticks: {}, records, why: {} };
  const env = { maint };
  const fn = new Function('env', 'MAINT_TYPES', `
    const maint = env.maint;
    const maintWorkerNames = () => ['Asriawan', 'Haerul'];
    const maintFieldCredits = () => ({ credits: {}, unmatched: [], noTaker: {} });
    const monthValue = () => '2026-09';
    const PlotMovement = { recQty: (r) => ({ value: Number(r.qtyFrozen || r.qty || 0) }) };
    ${body}
    return maintTotals;
  `)(env, MAINT_TYPES);
  const per = fn('UNN1', 'Sep 2026', '2026-09');
  return { per, why: maint.why.weeding };
}

const row = (id, month, cap, checked) => ({
  id, _month: month, plot: 'U18', jenis: 'Merumput',
  qtyFrozen: String(cap), checked, __nursery: 'UNN1',
});

let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'pass' : 'FAIL'}  ${what}`); if (!c) fails++; };

/* September's two U18 rows, plus the August one that was leaking in. */
const r = run([
  row(1, 'Sep 2026', 7519, '1'),
  row(2, 'Sep 2026', 7519, '1'),
  row(3, 'Aug 2026', 7519, '1'),     // another month, CHECKED -- the leak
  row(4, 'Oct 2026', 4000, '1'),     // and a later one
  row(5, null,       1234, '1'),     // no month at all
]);

ok(r.why.capAll === 15038,
   `Total Workdone counts September only  (got ${r.why.capAll}, want 15,038)`);
ok(r.why.otherMonth === 2,
   `the August and October rows are turned away and COUNTED  (got ${r.why.otherMonth})`);
ok(r.why.noMonth === 1,
   `a row with no month answers to no month, and is counted  (got ${r.why.noMonth})`);
ok(r.why.rows === 2, `only September rows reach the claim  (got ${r.why.rows})`);

/* The whole point: the claim card and the Worker Record foot now count the
   same set of rows, so the difference between them can only ever be a row
   with nobody ticked on it. */
const workerRecordFoot = [1, 2].reduce((a) => a + 7519, 0);
ok(r.why.capAll === workerRecordFoot,
   'the claim card and the Worker Record foot agree on the same set of rows');

/* And the old behaviour would have failed this: 15,038 + 7,519 + 4,000. */
ok(r.why.capAll !== 26557, 'it is not summing every month at once any more');

console.log(fails ? `\n${fails} failed` : '\nall good');
process.exit(fails ? 1 : 0);
