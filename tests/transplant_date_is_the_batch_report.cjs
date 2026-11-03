/* Worker Activity -> Transplanting: the Date column is the BATCH REPORT date.

   The office: "这边的日期 要跟着batch report的日期". Every row read 28/10/2026,
   which is the day the Field Conductor KEYED the four jobs, not the day the
   seedlings went into the plot. The batch report (Tab 3) day is the
   transaction_date of the plot Transplanted row, and a second delivery into
   one plot shows its OWN day -- B11 took 269 in September and 271 on 24 Oct.

   Lifts the shipped helpers out of plot_maintenance_script.js and drives them.
   Run: node tests/transplant_date_is_the_batch_report.cjs                  */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'nursery_ops', 'plot_maintenance_script.js'), 'utf8');

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
};

const a = src.indexOf('const _tpKey = ');
const b = src.indexOf('function tpDateText(');
const end = src.indexOf('\n}\n', b) + 3;
if (a < 0 || b < 0) { console.log('  FAIL helpers not found in the shipped file'); process.exit(1); }
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(src.slice(a, end) + '\nthis.api = { tpIndexLedgerDates, tpBatchDate, tpShownDate, tpDateText };', ctx);
const { tpIndexLedgerDates, tpBatchDate, tpShownDate } = ctx.api;

const T = (plot, batch, d, extra) => Object.assign(
  { transaction_type: 'Transplanted', plot_name: plot, batch_name: batch, transaction_date: d }, extra || {});
const ix = tpIndexLedgerDates([
  T('B11', '269', '2026-09-27'),
  T('B11', '269', '2026-09-29'),
  T('B11', '271', '2026-10-24'),
  T('B2',  '270', '2026-10-17'),
  T('B 3', '271', '2026-10-20'),
  { transaction_type: 'Seeds_Received', plot_name: 'B2', batch_name: '270', transaction_date: '2026-07-01' },
]);

console.log('\n1  a record shows its own delivery day, not the day it was keyed');
check('B11 batch 271 -> 24 Oct', tpBatchDate(ix, { plot_name: 'B11', batch_name: '271', work_date: '2026-10-28' }), '2026-10-24');
check('B11 batch 269 -> its last day, 29 Sep', tpBatchDate(ix, { plot_name: 'B11', batch_name: '269' }), '2026-09-29');
check('B11 both batches -> the day the plot was finished', tpBatchDate(ix, { plot_name: 'B11', batch_name: '271, 269' }), '2026-10-24');
check('B2, a single delivery', tpBatchDate(ix, { plot_name: 'B2', batch_name: '270' }), '2026-10-17');

console.log('\n2  matched on letters and digits');
check('"B3" finds the ledger "B 3"', tpBatchDate(ix, { plot_name: 'B3', batch_name: ' 271 ' }), '2026-10-20');

console.log('\n3  only Transplanted rows count');
check('a Seeds_Received row is not a transplant day', ix.B2.length, 1);

console.log('\n4  nothing goes blank');
check('a record with no batch takes the plot latest day', tpBatchDate(ix, { plot_name: 'B11', batch_name: '' }), '2026-10-24');
check('a batch the ledger has not got -> no batch day', tpBatchDate(ix, { plot_name: 'B11', batch_name: '999' }), null);
check('and the keyed date is shown instead', tpShownDate({ work_date: '2026-10-28', _batchDate: null }), '2026-10-28');
check('the batch day wins when there is one', tpShownDate({ work_date: '2026-10-28', _batchDate: '2026-10-24' }), '2026-10-24');

console.log('\n5  the screen and the PDF both read it, and the month is not moved');
const strip = src.replace(/\/\*[\s\S]*?\*\//g, '');
check('no Date cell renders work_date directly any more',
  (strip.match(/r\.work_date \? new Date\(r\.work_date\)\.toLocaleDateString/g) || []).length, 0);
check('both the screen and the PDF call tpDateText', (strip.match(/tpDateText\(r\)/g) || []).length >= 2, true);
check('the read still asks by schedule_month', /\.eq\('schedule_month', m\)/.test(strip), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
