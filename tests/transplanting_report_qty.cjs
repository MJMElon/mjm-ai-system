/* THE TRANSPLANTING REPORT QUOTES WHAT TAB 3 QUOTES.

   Batch 241's N3 read 6,362 on the Transplanting Report and 6,363 on Tab 3
   of the batch: the approved +1 was only MARKED on the cell, never added to
   it. Two screens, two figures, one plot.

   The arithmetic that fixes it has one trap in it. An adjustment is keyed
   against a BATCH AND PLOT, while this report splits a plot into one line
   per date it was transplanted on -- and the same adjustment is attached to
   every one of those lines. Adding it to each would count it as many times
   as there are dates, which is exactly the kind of sum that still adds up.
   So it lands on the latest line still on screen and nowhere else.

   The merge, the ownership and the two totals are lifted out of the real
   page, so this is the code that runs, not a copy of it.

   Run: node tests/transplanting_report_qty.cjs
*/
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');

const i = src.indexOf('async function runTransplantingReport');
if (i < 0) { console.log('FAILED  runTransplantingReport is gone'); process.exit(1); }
const from = src.indexOf('  const merged = new Map();', i);
const endMark = '  const totalRecorded = rows.reduce((s, r) => s + r.qty, 0);';
const to = src.indexOf(endMark, from);
if (from < 0 || to < 0) { console.log('FAILED  could not lift the merge/total block'); process.exit(1); }
const body = src.slice(from, to + endMark.length);

const run = (input) => new Function('rows', body + '\nreturn { rows, total, totalRecorded };')(input);

/* A report line as the mapper above it builds one. */
const R = (date, plot, batch, qty, cal) => ({
  date, plot, batch, qty, maturity: null, nursery: 'UNN 2', breed: 'AA Hybrida 1S',
  cal: cal ? cal.map(q => ({ date: '2025-12-27', qty: q, label: 'found' })) : null
});

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const byPlotDate = (o) => o.rows.slice()
  .sort((a, b) => (a.date + a.plot).localeCompare(b.date + b.plot))
  .map(r => [r.date, r.plot, r.qty, r.adj, r.final]);

console.log('\nA plot with no adjustment reads exactly what was keyed');
{
  const o = run([R('2025-12-19', 'N3', '241', 6362, null)]);
  check('the figure is the recorded one', byPlotDate(o), [['2025-12-19', 'N3', 6362, 0, 6362]]);
  check('and the two totals agree', [o.total, o.totalRecorded], [6362, 6362]);
}

console.log('\n241 N3: the approved +1 is IN the figure now');
{
  const o = run([R('2025-12-19', 'N3', '241', 6362, [1])]);
  check('the row reads 6,363', byPlotDate(o), [['2025-12-19', 'N3', 6362, 1, 6363]]);
  check('the total reads 6,363', o.total, 6363);
  /* The recorded total is kept so the Total line can say what it was
     before, rather than quietly disagreeing with a figure somebody wrote
     down last week. */
  check('and what it was before is still known', o.totalRecorded, 6362);
  check('the row keeps its hover detail', o.rows[0].cal.length, 1);
}

console.log('\n234 U11: the approved +6 is IN the figure now');
{
  const o = run([R('2025-10-30', 'U11', '234', 9433, [6])]);
  check('the row reads 9,439', byPlotDate(o), [['2025-10-30', 'U11', 9433, 6, 9439]]);
  check('and so does the total', [o.total, o.totalRecorded], [9439, 9433]);
}

console.log('\nTwo transplant dates on one plot: the adjustment is counted ONCE');
{
  /* The page attaches the same cal to every line of the plot -- it is keyed
     by batch and plot, and knows nothing about dates. */
  const o = run([
    R('2025-12-19', 'N3', '241', 6362, [1]),
    R('2026-01-05', 'N3', '241', 500,  [1])
  ]);
  check('only the later line carries it',
        byPlotDate(o),
        [['2025-12-19', 'N3', 6362, 0, 6362], ['2026-01-05', 'N3', 500, 1, 501]]);
  check('so the total is up by 1, not by 2', o.total, 6863);
  check('and the earlier line is not marked either',
        o.rows.filter(r => r.cal && r.cal.length).length, 1);
}

console.log('\nTwo log rows of the same move are still one line');
{
  const o = run([
    R('2025-12-19', 'N3', '241', 6000, [1]),
    R('2025-12-19', 'N3', '241', 362,  [1])
  ]);
  check('merged, then adjusted once', byPlotDate(o), [['2025-12-19', 'N3', 6362, 1, 6363]]);
  check('total', o.total, 6363);
}

console.log('\nA loss reads as a loss');
{
  const o = run([R('2025-11-01', 'U3', '242', 1053, [-53])]);
  check('1,053 keyed, 53 gone, 1,000 standing', byPlotDate(o), [['2025-11-01', 'U3', 1053, -53, 1000]]);
  check('the total comes down with it', [o.total, o.totalRecorded], [1000, 1053]);
}

console.log('\nEach plot owns its own');
{
  const o = run([
    R('2025-12-19', 'N3', '241', 6362, [1]),
    R('2025-12-19', 'B7', '227', 140,  [-140])
  ]);
  check('two plots, two adjustments',
        byPlotDate(o),
        [['2025-12-19', 'B7', 140, -140, 0], ['2025-12-19', 'N3', 6362, 1, 6363]]);
  check('netted in the total', [o.total, o.totalRecorded], [6363, 6502]);
}

console.log('\nSeveral adjustments on one plot are summed');
{
  const o = run([R('2025-12-19', 'N3', '241', 6362, [1, 5, -2])]);
  check('+1 +5 -2 is +4', byPlotDate(o), [['2025-12-19', 'N3', 6362, 4, 6366]]);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
