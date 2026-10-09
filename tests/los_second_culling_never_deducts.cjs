/* THE 2ND CULLING NEVER DEDUCTS. NOT EVEN WHILE NO 3RD EXISTS.

   Life of Seedlings used to read `cull3 > 0 ? cull3 : cull2` — the 2nd
   standing in for the 3rd until a 3rd was keyed — and its own comment claimed
   that was "the same rule as the Movement Report's netOfRow()". It was not.
   The two readers it has to agree with both say the opposite, in their own
   words, in this repository:

     netOfRow(), operation_reports.html:
       "2nd Culled never deducts here, B/F included — 2nd Culling is Tab 6's
        own live snapshot as a batch works through 3rd Culling, not a separate
        loss on top of it."

     the culling rate, operation_batch_record.html:
       (1st culled + 3rd culled) / (transplanted + 1st culled), with cull2
       "carried for reference only — it is inside cull3".

   So every batch 2nd culled and not yet 3rd culled had its Total Culling
   overstated by the 2nd culling and its Balance understated by the same — on
   the one report the office reconciles against, in a column headed "Total
   Culling (1st + 3rd)", with the Movement Report beside it disagreeing.

   The REAL derived block is lifted out of operation_reports.html, and the
   Batch Report's REAL culling rate out of operation_batch_record.html, so
   the two are compared rather than restated. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const los  = fs.readFileSync(path.join(root, 'operation', 'operation_reports.html'), 'utf8');
const rec  = fs.readFileSync(path.join(root, 'operation', 'operation_batch_record.html'), 'utf8');

const start = los.indexOf('  // ── Derived figures ──');
const end   = los.indexOf('  // Years/suppliers offered by their pickers', start);
if (start < 0 || end < 0) throw new Error('could not find the derived-figures block');
const derive = new Function('rowsByBatch', 'asAt', '_losAgeMonths', '_losAgeLabel',
  los.slice(start, end) + '\nreturn rowsByBatch;');

// The Batch Report's own rate, lifted whole.
const rateSrc = rec.slice(rec.indexOf('const cullRate = denom > 0'),
                          rec.indexOf(';', rec.indexOf('Math.round(((cull1 + cull3)')) + 1);
const batchRate = new Function('cull1', 'cull3', 'denom', rateSrc + '\nreturn cullRate;');

const run = (f) => {
  const r = Object.assign({
    batch: 'x', planted: 0, cull1: 0, cull2: 0, cull3: 0, trans: 0, sales: 0,
    calibration: 0, calibrationPre: 0, salesPre: 0, received: 0, damaged: 0,
    ver: {}, rec: {},
  }, f);
  derive({ x: r }, null, () => null, () => '');
  return r;
};

let pass = 0, fail = 0;
const is = (what, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log('  ok   ' + what + ' → ' + a); }
  else { fail++; console.log('  FAIL ' + what + '\n         got  ' + a + '\n         want ' + b); }
};

console.log('\n── A batch 2nd culled and NOT yet 3rd culled ──');
// 10,000 planted, 800 culled in the tray, 9,200 out, and 150 found dead in
// the plot on the 2nd culling. No 3rd culling yet.
const open2nd = run({ received: 10500, damaged: 0, planted: 10000, cull1: 800, trans: 9200, cull2: 150 });
is('Total Culling is 1st + 3rd, which is 800 + nothing', open2nd.cullTotal, 800);
is('the 2nd culling does not stand in for the 3rd',      open2nd.postCull, 0);
is('so the Balance keeps the 150',                       open2nd.balance, 10000 - 800);
is('and the 2nd Culled column still carries it',         open2nd.cull2, 150);

console.log('\n── Once the 3rd culling is keyed ──');
// The 3rd is keyed against the original transplanted figure, so it already
// contains the 150.
const with3rd = run({ received: 10500, damaged: 0, planted: 10000, cull1: 800, trans: 9200, cull2: 150, cull3: 400 });
is('Total Culling is 1st + 3rd',          with3rd.cullTotal, 1200);
is('the 2nd is not added on top of it',   with3rd.postCull, 400);
is('and the Balance is planted less that', with3rd.balance, 10000 - 1200);

console.log('\n── It agrees with the Batch Report’s own culling rate ──');
// (1st + 3rd) / (transplanted + 1st) — the Batch Report's real formula,
// lifted out of its own file. The report and the rate have to be made of the
// same numerator, or one screen says a batch has been culled and the other
// says it has not.
[open2nd, with3rd].forEach((r, i) => {
  const denom = r.trans + r.cull1;
  const theirs = batchRate(r.cull1, r.cull3, denom);
  const ours   = Math.round((r.cullTotal / denom) * 10000) / 100;
  is('case ' + (i + 1) + ': Total Culling over the same base equals the Batch Report rate',
    ours, theirs);
});

console.log('\n── A batch with no culling at all is untouched ──');
const none = run({ received: 1000, damaged: 0, planted: 1000, trans: 1000 });
is('Total Culling', none.cullTotal, 0);
is('Balance',       none.balance, 1000);

console.log('\n── And the figure the drilldown opens cannot disagree with it ──');
const collectSrc = los.slice(los.indexOf('    if (spec.list === \'cullTotal\') {'),
                             los.indexOf('    } else {', los.indexOf('    if (spec.list === \'cullTotal\') {')));
is('the records behind Total Culling are the 1st and the 3rd, never the 2nd',
  /rec\.cull2/.test(collectSrc), false);
is('and it does take the 3rd', /rec\.cull3/.test(collectSrc), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
