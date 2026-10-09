/* The REAL derived-figures block, lifted out of operation_reports.html and
   run against batches whose true pre/main split is known. */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');

const start = src.indexOf('  // ── Derived figures ──');
const end   = src.indexOf('  // Years/suppliers offered by their pickers', start);
if (start < 0 || end < 0) { console.log('could not find the block'); process.exit(1); }
const block = src.slice(start, end);

const derive = new Function('rowsByBatch', 'asAt', '_losAgeMonths', '_losAgeLabel', block + '\nreturn rowsByBatch;');
const noAge = () => null, noLabel = () => '';

function run(name, f) {
  const r = Object.assign({
    batch:name, planted:0, cull1:0, cull2:0, cull3:0, trans:0, sales:0,
    calibration:0, calibrationPre:0, salesPre:0, received:0, damaged:0,
  }, f);
  derive({ [name]: r }, null, noAge, noLabel);
  return r;
}

const cases = [
  { name:'A — nothing sold yet',
    f:{ planted:1000, cull1:100, trans:600 },
    truth:{ pre: 300, main: 600 } },

  { name:'B — 150 of the 200 sold came OUT OF PRE-NURSERY',
    f:{ planted:1000, cull1:100, trans:600, sales:200, salesPre:150 },
    truth:{ pre: 1000-100-600-150, main: 600-50 } },

  { name:'C — sold ONLY from pre-nursery, never transplanted',
    f:{ planted:1000, cull1:0, trans:0, sales:400, salesPre:400 },
    truth:{ pre: 600, main: 0 } },

  { name:'D — a calibration of −50 filed against a PRE-NURSERY tray',
    f:{ planted:1000, cull1:100, trans:600, calibration:-50, calibrationPre:-50 },
    truth:{ pre: 1000-100-600-50, main: 600 } },

  { name:'E — 3rd culling in the field',
    f:{ planted:1000, cull1:100, trans:600, cull3:80 },
    truth:{ pre: 300, main: 600-80 } },
];

console.log('case                                                 pre   main  | truth pre  main');
console.log('─'.repeat(88));
let bad = 0;
for (const c of cases) {
  const r = run(c.name, c.f);
  const ok = r.preBalance === c.truth.pre && r.mainBalance === c.truth.main;
  if (!ok) bad++;
  console.log(
    c.name.padEnd(52) +
    String(r.preBalance).padStart(5) + String(r.mainBalance).padStart(7) + '  | ' +
    String(c.truth.pre).padStart(8) + String(c.truth.main).padStart(6) +
    (ok ? '   ok' : '   ✗ WRONG'));
}
/* THE BALANCE AND THE MAIN-NURSERY FIGURE.
   The Balance used to span both halves, so `pre + main === balance` was its
   own guard and mainBalance was literally `balance − preBalance`. The office
   asked for the Balance to become the FIELD side on its own —
   transplant qty − 3rd culling − TOTAL sales + approved calibration — so
   there is no total left to split, and that identity is gone.
   What replaces it: the Balance and mainBalance are the SAME NUMBER on every
   batch that sells out of the field, which is every batch the office
   reconciles. Where they differ, the difference is accounted for to the
   seedling by the two TRAY figures the Balance carries and the field figure
   does not — the tray sales it takes off anyway, and the tray calibration it
   adds in anyway. Checking the gap is what stops mainBalance quietly
   drifting into a formula of its own. */
console.log('\nBalance (total sales and calibration) against the main-nursery figure:');
for (const c of cases) {
  const r = run(c.name, c.f);
  const gap = (r.salesPre || 0) - (r.calibrationPre || 0);
  const ok = r.mainBalance - r.balance === gap;
  if (!ok) bad++;
  console.log('  ' + c.name.slice(0, 1) + ': balance=' + String(r.balance).padStart(5) +
              '  main=' + String(r.mainBalance).padStart(5) +
              '  main less balance=' + String(r.mainBalance - r.balance).padStart(5) +
              '  tray sales less tray calibration=' + String(gap).padStart(5) +
              (ok ? '  ok' : '  ✗'));
}
console.log('\n' + bad + ' of ' + cases.length + ' cases wrong');
process.exit(bad ? 1 : 0);
