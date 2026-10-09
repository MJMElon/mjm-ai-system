/* ONE BATCH, ONE RECEPTION — THE NEWEST ROW WINS.

   Life of Seedlings used to ADD UP every Seeds_Received row a batch had, and
   a batch is only ever meant to have one. Saving the Seeds In form twice used
   to leave a second (batch 261 went in seven times, 260 twice), and the
   224-241 range was damaged again by an update keyed on created_at — both are
   named in the comments around that form's save.

   So batch 224 read 997,500 seeds received against 9,920 planted, a Variance
   of minus nine hundred and eighty-seven thousand, and dragged the report's
   own total down with it — while the form it was keyed on, and the batch list
   beside it, both read 10,500.

   The other two readers had already settled this: operation_batch_detail.html
   loads the newest row with `.limit(1)` and operation_batch_record.html
   de-dupes to the newest per batch_name. This is the third reader agreeing
   with them.

   The REAL builder is lifted out of operation_reports.html, so a change that
   goes back to summing fails here instead of passing. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');
const i = src.indexOf('async function _losBuildAllRows(asAt) {');
const body = src.slice(src.indexOf('  // ── One row per batch ──', i),
                       src.indexOf('  // Years/suppliers offered by their pickers', i));

const L = (o) => Object.assign({ transaction_type: 'Seeds_Received',
  plot_name: 'Pre-Nursery', quantity_change: 0, remark: '' }, o);

/* Batch 224 as the ledger actually holds it: the real delivery, and a stale
   row left behind. 940,000 + 5% = 987,000; with the real 10,500 that is the
   997,500 the report was showing, and 950,000 + FOC 47,500 underneath it. */
const REAL_224 = L({ batch_name: '224', breed_name: 'IOI DxP HYBRID',
  transaction_date: '2024-12-16', created_at: '2026-08-21T11:49:00Z', quantity_change: 10500,
  remark: 'Seeds received. Supplier: Pamol Plantations Sdn Bhd. MPOB: 506471-921000. D/O: 8032165591. DO_Qty: 10000. Incl. 5% FOC.' });
const STALE_224 = L({ batch_name: '224', breed_name: 'IOI DxP HYBRID',
  transaction_date: '2024-12-16', created_at: '2025-03-02T00:00:00Z', quantity_change: 987000,
  remark: 'Seeds received. Supplier: Wrong Supplier Bhd. MPOB: 000000-000000. DO_Qty: 940000. Incl. 5% FOC.' });

const logs = [
  STALE_224, REAL_224,                                   // deliberately oldest first
  L({ batch_name: '224', transaction_type: 'Planted', transaction_date: '2025-01-05', quantity_change: 9920 }),
  // 225, which has one row and must be left exactly as it was.
  L({ batch_name: '225', breed_name: 'AA Hybrida 1S',
      transaction_date: '2024-12-19', created_at: '2024-12-19T00:00:00Z', quantity_change: 10500,
      remark: 'Seeds received. Supplier: Applied Agricultural Resources Sdn. Bhd.. MPOB: 549080-021000. DO_Qty: 10000. Incl. 5% FOC.' }),
  L({ batch_name: '225', transaction_type: 'Damaged_Seeds', transaction_date: '2024-12-20', quantity_change: -42 }),
  L({ batch_name: '225', transaction_type: 'Planted', transaction_date: '2024-12-21', quantity_change: 10423 }),
];

const fn = new Function('asAt','logsRes','dosRes','_logDate','_mvBatchKey','nurseryOf',
  'PRE_NURSERY_PLOTS','_losAgeMonths','_losAgeLabel','_RE_LOS_SUPPLIER','_RE_LOS_MPOB',
  '_RE_LOS_DONO','_RE_LOS_DO_QTY','_RE_LOS_FOC_PCT','_RE_LOS_REPL','_RE_LOS_FROM_TRAY',
  '_RE_LOS_FROM_PLOT','_RE_LOS_APPROVED','_RE_LOS_CAL_REPORT','_RE_LOS_CAL_SIDE','_losTrayKey',
  body + '\nreturn rows;');

// The real patterns, lifted too — a stubbed regex would pass over the bug.
const grab = (name) => new Function('return ' + src.slice(
  src.indexOf('= ', src.indexOf('const ' + name + ' ')) + 2,
  src.indexOf('\n', src.indexOf('const ' + name + ' '))).replace(/;$/, ''))();

const rows = fn('', { data: logs }, { data: [] },
  (l) => l.transaction_date || (l.created_at || '').slice(0, 10) || null,
  (b) => String(b || '').trim(), () => 'Pre-Nursery', ['Pre-Nursery'],
  () => 21, () => '21 months',
  grab('_RE_LOS_SUPPLIER'), grab('_RE_LOS_MPOB'), grab('_RE_LOS_DONO'),
  grab('_RE_LOS_DO_QTY'), grab('_RE_LOS_FOC_PCT'), grab('_RE_LOS_REPL'),
  grab('_RE_LOS_FROM_TRAY'), grab('_RE_LOS_FROM_PLOT'), grab('_RE_LOS_APPROVED'),
  grab('_RE_LOS_CAL_REPORT'), grab('_RE_LOS_CAL_SIDE'), grab('_losTrayKey'));

const by = {}; rows.forEach(r => { by[r.batch] = r; });
let pass = 0, fail = 0;
const is = (what, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log('  ok   ' + what + ' → ' + a); }
  else { fail++; console.log('  FAIL ' + what + '\n         got  ' + a + '\n         want ' + b); }
};

console.log('\n── 224, which carries a stale reception row ──');
is('Seed Received is the newest row, not the sum', by['224'].received, 10500);
is('and so is the D/O quantity',                   by['224'].doQty,    10000);
is('and the FOC quantity',                         by['224'].focQty,   500);
is('so the Variance is the real one',              by['224'].variance, 9920 - 10500);
is('the supplier is the newest row\'s too',        by['224'].supplier, 'Pamol Plantations Sdn Bhd');
is('and the MPOB licence',                         by['224'].mpob,     '506471-921000');
is('both rows are still listed behind the figure', by['224'].rec.received.length, 2);
is('and the row SAYS there are two',               by['224'].srRows,   2);

console.log('\n── 225, which has one, is untouched ──');
is('Seed Received', by['225'].received, 10500);
is('D/O',           by['225'].doQty,    10000);
is('FOC',           by['225'].focQty,   500);
is('Variance',      by['225'].variance, 10423 - (10500 - 42));
is('supplier survives the periods in its name',
  by['225'].supplier, 'Applied Agricultural Resources Sdn. Bhd.');
is('and nothing is flagged', by['225'].srRows, 1);

console.log('\n── The totals stop being dragged down ──');
const totalReceived = rows.reduce((s, r) => s + r.received, 0);
is('two batches of 10,500', totalReceived, 21000);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
