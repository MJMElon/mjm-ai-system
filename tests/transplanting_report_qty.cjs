/* AN AMENDMENT GOES INTO THE TOTAL, ON ITS OWN DATE, AND THE TOTAL SAYS SO.

   Batch 225 went out long before December and was amended IN December. The
   Transplanting Report placed every amendment by the date of the TRANSPLANT
   it corrected, so a December range showed one record of 6,362 and the
   amendment was nowhere -- the correction happened in December whatever
   month the seedlings went out in.

   The rows stay what was keyed on the day: a record is a record. What moves
   is the TOTAL, which is the one figure on the page claiming to be how many
   went out. Where it carries an amendment it is dotted, and the hover names
   the calibration date, the batch, the plot and the amount.

   The build -- the maturity lookup, which amendments are in view, the
   filter, the merge and the two sums -- is lifted out of the real page, so
   this is the code that runs, not a copy of it.

   Run: node tests/transplanting_report_qty.cjs
*/
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');

const i = src.indexOf('async function runTransplantingReport');
if (i < 0) { console.log('FAILED  runTransplantingReport is gone'); process.exit(1); }
const from0 = src.indexOf('  const locOf = (plot) =>', i);
const endMark = '.map(a => ({ date: a.date, qty: a.qty, label: a.batch + \' · \' + a.plot }));';
const to0 = src.indexOf(endMark, from0);
if (from0 < 0 || to0 < 0) { console.log('FAILED  could not lift the build block'); process.exit(1); }
const body = src.slice(from0, to0 + endMark.length);

/* Everything the block closes over, handed in rather than stubbed in place. */
function run({ logs = [], cals = [], from = '', to = '', locs = [], breed = '' } = {}) {
  const fn = new Function(
    'logsRes', 'calEntries', 'calByBatchPlot', 'plotToLoc', 'batchBreed',
    'PRE_NURSERY_PLOTS', '_logDate', '_mvBatchKey', 'maturityOf',
    'from', 'to', 'fromTs', 'toTs', 'selectedLocs', 'breed',
    body + '\nreturn { rows, recorded, amendNet, total, amendTip };');
  const calByBatchPlot = {};
  cals.forEach(c => {
    const k = String(c.batch) + '::' + c.plot;
    (calByBatchPlot[k] = calByBatchPlot[k] || []).push(c);
  });
  const maturityOf = (d) => {
    const dt = new Date(d);
    if (isNaN(dt)) return null;
    dt.setMonth(dt.getMonth() + 9);
    return dt.toISOString().slice(0, 10);
  };
  return fn(
    { data: logs }, cals, calByBatchPlot,
    { N3: 'UNN 2', N19: 'UNN 2', U11: 'UNN 1', B7: 'UNN 1' }, { '225': 'AA Hybrida 1S' },
    ['PREMIUM CARE', 'DOUBLE-TONE'],
    (l) => (l.transaction_date || String(l.created_at || '').slice(0, 10) || null),
    (v) => String(v == null ? '' : v).trim(), maturityOf,
    from, to,
    from ? new Date(from).getTime() : -Infinity,
    to ? new Date(to).getTime() + 86400000 : Infinity,
    new Set(locs), breed);
}

const TX = (batch, plot, date, qty) => ({
  batch_name: batch, plot_name: plot, transaction_date: date, created_at: date,
  quantity_change: qty, breed_name: 'AA Hybrida 1S', remark: ''
});
const AM = (batch, plot, date, qty, label) => ({ batch, plot, date, qty, label: label || 'found' });

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const lines = (o) => o.rows.map(r => [r.date, r.batch, r.plot, r.qty]);
const tip   = (o) => o.amendTip.map(t => [t.date, t.label, t.qty]);

console.log('\nDecember, with the amendment keyed in December and the transplant long before');
{
  const o = run({
    logs: [TX('241', 'N3', '2025-12-19', 6362), TX('225', 'N19', '2025-03-20', 9658)],
    cals: [AM('225', 'N19', '2025-12-27', 1)],
    from: '2025-12-01', to: '2025-12-31'
  });
  check('the rows are the records, untouched', lines(o), [['2025-12-19', '241', 'N3', 6362]]);
  check('no amendment became a row', o.rows.length, 1);
  check('the rows still add to 6,362', o.recorded, 6362);
  check('and the TOTAL is 6,363', o.total, 6363);
  /* Which is the whole point of the dotted underline: the total is no
     longer what the rows above it add up to, so it has to say why. */
  check('the hover names date, batch, plot and amount',
        tip(o), [['2025-12-27', '225 · N19', 1]]);
}

console.log('\nThe transplant is in range and the amendment is not');
{
  const o = run({
    logs: [TX('225', 'N19', '2025-03-20', 9658)],
    cals: [AM('225', 'N19', '2025-12-27', 1)],
    from: '2025-03-01', to: '2025-03-31'
  });
  check('March shows the record alone', lines(o), [['2025-03-20', '225', 'N19', 9658]]);
  check('the total is what was keyed in March', o.total, 9658);
  check('and the total is not dotted', o.amendTip.length, 0);
}

console.log('\nA month with an amendment and no transplant at all');
{
  const o = run({
    logs: [TX('225', 'N19', '2025-03-20', 9658)],
    cals: [AM('225', 'N19', '2025-12-27', 1)],
    from: '2025-12-01', to: '2025-12-31'
  });
  /* No rows, but December really did move by 1 and the report has to carry
     it rather than print nothing. */
  check('no rows', o.rows.length, 0);
  check('the total is the amendment', o.total, 1);
  check('and it is dotted', tip(o), [['2025-12-27', '225 · N19', 1]]);
}

console.log('\nWith no range at all, every amendment is in');
{
  const o = run({
    logs: [TX('241', 'N3', '2025-12-19', 6362), TX('225', 'N19', '2025-03-20', 9658)],
    cals: [AM('225', 'N19', '2025-12-27', 1), AM('241', 'N3', '2026-02-02', -5)]
  });
  check('two records', o.rows.length, 2);
  check('netted into the total', [o.recorded, o.amendNet, o.total], [16020, -4, 16016]);
  check('newest first in the hover',
        tip(o), [['2026-02-02', '241 · N3', -5], ['2025-12-27', '225 · N19', 1]]);
}

console.log('\n234 U11: the +6 reaches the total on its own date');
{
  const o = run({
    logs: [TX('234', 'U11', '2025-10-30', 9433)],
    cals: [AM('234', 'U11', '2025-11-14', 6)]
  });
  check('the record still reads 9,433', lines(o), [['2025-10-30', '234', 'U11', 9433]]);
  check('and the total reads 9,439', o.total, 9439);
}

console.log('\nAn amendment keyed on the day of the transplant is still only in the total');
{
  const o = run({
    logs: [TX('234', 'U11', '2025-10-30', 9433)],
    cals: [AM('234', 'U11', '2025-10-30', 6)]
  });
  check('one row, not two', o.rows.length, 1);
  check('the row is the record', lines(o), [['2025-10-30', '234', 'U11', 9433]]);
  check('total 9,439', o.total, 9439);
}

console.log('\nAn amendment of nought is not in the hover');
{
  const o = run({ logs: [TX('234', 'U11', '2025-10-30', 9433)], cals: [AM('234', 'U11', '2025-11-14', 0)] });
  check('nothing to show', o.amendTip.length, 0);
  check('and the total is the rows', o.total, 9433);
}

console.log('\nThe nursery filter holds for an amendment too');
{
  const o = run({
    logs: [TX('241', 'N3', '2025-12-19', 6362), TX('234', 'U11', '2025-12-02', 9433)],
    cals: [AM('234', 'U11', '2025-12-27', 6)],
    locs: ['UNN 2']
  });
  check('UNN 1 is out, amendment and all', lines(o), [['2025-12-19', '241', 'N3', 6362]]);
  check('so the total is UNN 2 alone', o.total, 6362);
  check('and nothing is dotted', o.amendTip.length, 0);
}

console.log('\nTwo log rows of the same move are still one record line');
{
  const o = run({ logs: [TX('241', 'N3', '2025-12-19', 6000), TX('241', 'N3', '2025-12-19', 362)] });
  check('merged', lines(o), [['2025-12-19', '241', 'N3', 6362]]);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
