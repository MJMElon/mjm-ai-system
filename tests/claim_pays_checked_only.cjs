/* Only a row the office has ticked Checked reaches the salary claim, and the
   claim says what it is holding back. The real maintTotals is lifted out. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'npayroll', 'npayroll_script.js'), 'utf8');
const i = src.indexOf('function maintTotals(');
const body = src.slice(i, src.indexOf('\n}\n', i) + 3);

const MAINT_TYPES = [
  { code: 'weeding',  label: 'Weeding',        jenis: 'Merumput' },
  { code: 'interrow', label: 'Interrow Spray', jenis: 'Meracun rumput secara selingan' },
];
const rec = (id, jenis, qty, checked) =>
  ({ id, jenis, qty, checked, plot: 'B1', __nursery: 'BNN' });

const records = [
  rec(1, 'Merumput', 2353, 1),                        // checked → pays
  rec(2, 'Merumput', 1200, 0),                        // not checked → held
  rec(3, 'Meracun rumput secara selingan', 599,  0),  // not checked → held
  rec(4, 'Meracun rumput secara selingan', 2353, 1),  // checked → pays
];
// Both workers ticked on every row.
const ticks = {};
MAINT_TYPES.forEach(t => { ticks[`BNN_Sep 2026_${t.code}`] =
  Object.fromEntries(records.map(r => [r.id, { Ali: 1, Siti: 1 }])); });

const maint = { records, ticks, why: {}, rows: {}, workers: {}, linked: {}, field: [] };
const fn = new Function('maint', 'MAINT_TYPES', 'PlotMovement',
  'maintWorkerNames', 'cap2', 'maintFieldCredits',
  body + '\nreturn maintTotals(arguments[6], arguments[7], arguments[8]);');

const per = fn(maint, MAINT_TYPES,
  { recQty: (r) => ({ value: r.qty }), ready: () => true },
  () => ['Ali', 'Siti'], (v) => Math.round(Number(v || 0) * 100) / 100,
  () => ({ credits: {}, noTaker: {}, unmatched: [] }),
  'BNN', 'Sep 2026', '2026-09');

const w = maint.why;
console.log('  job             rows paid   capAll   held rows   held capacity');
console.log('  ' + '-'.repeat(62));
let bad = 0;
const want = {
  weeding:  { rows: 1, capAll: 2353, unchecked: 1, uncheckedCap: 1200 },
  interrow: { rows: 1, capAll: 2353, unchecked: 1, uncheckedCap: 599  },
};
MAINT_TYPES.forEach(t => {
  const d = w[t.code] || {}, e = want[t.code];
  const ok = d.rows === e.rows && d.capAll === e.capAll
          && d.unchecked === e.unchecked && d.uncheckedCap === e.uncheckedCap;
  if (!ok) bad++;
  console.log(`  ${t.label.padEnd(16)}${String(d.rows).padEnd(11)}${String(d.capAll).padEnd(9)}${
    String(d.unchecked).padEnd(12)}${String(d.uncheckedCap).padEnd(8)}${ok ? 'ok' : '✗ want ' + JSON.stringify(e)}`);
});
console.log('');
console.log('  Ali is paid on weeding :', per.Ali.weeding, '(half of 2,353 — the checked row only)');
console.log('  the 1,200 unchecked row:', per.Ali.weeding * 2 === 2353 ? 'is NOT in the capacity  ok' : '✗ leaked in');
if (per.Ali.weeding * 2 !== 2353) bad++;
console.log('\n' + (bad ? 'FAILED' : 'all correct'));
process.exit(bad ? 1 : 0);
