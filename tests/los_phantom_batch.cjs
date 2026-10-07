/* A ledger line can carry a batch name and contribute nothing — an
   unapproved calibration, a transfer of nought. That must not become a row
   of dashes and noughts on the report. The real builder is lifted out. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');
const i = src.indexOf('async function _losBuildAllRows(asAt) {');
const body = src.slice(src.indexOf('  // ── One row per batch ──', i),
                       src.indexOf('  // Years/suppliers offered by their pickers', i));

const L = (batch, type, date, qty, remark, plot) => ({ batch_name:batch, transaction_type:type,
  transaction_date:date, created_at:date, quantity_change:qty, remark:remark||'', plot_name:plot||'Pre-Nursery' });

const logs = [
  // A real batch.
  L('268','Seeds_Received','2026-03-01',1000), L('268','Planted','2026-03-05',1000),
  // 211 — nothing but a calibration of NOUGHT. Approval decides nothing
  //       any more, so what makes this a phantom is the figure, not a missing
  //       signature: nought adjusted is nothing happening.
  L('211','Stock_Calibration','2026-09-12',0,'Report: Life of Seedling. Plot: B2.','B2'),
  // 212 — a transfer of nought.
  L('212','Cull3_Transfer','2026-09-12',0,'','B2'),
  // 213 — received, but somebody keyed nought. A real keying error: KEEP it.
  L('213','Seeds_Received','2026-02-02',0),
  // 214 — an APPROVED calibration and nothing else. Something happened: KEEP.
  L('214','Stock_Calibration','2026-09-12',-5,'[APPROVED by Ali on 2026-09-12] Plot: B2.','B2'),
];

const fn = new Function('asAt','logsRes','dosRes','_logDate','_mvBatchKey','nurseryOf',
  'PRE_NURSERY_PLOTS','_losAgeMonths','_losAgeLabel','_RE_LOS_SUPPLIER','_RE_LOS_MPOB',
  '_RE_LOS_DONO','_RE_LOS_DO_QTY','_RE_LOS_FOC_PCT','_RE_LOS_REPL','_RE_LOS_FROM_TRAY',
  '_RE_LOS_FROM_PLOT','_RE_LOS_APPROVED','_RE_LOS_CAL_REPORT','_RE_LOS_CAL_SIDE',
  body + '\nreturn rows;');
const never = /NEVERMATCH_x([0-9])/;
const rows = fn('', { data: logs }, { data: [] }, (l) => l.transaction_date || null,
  (b) => String(b || '').trim(), () => 'Pre-Nursery', ['Pre-Nursery'],
  () => null, () => '',
  never, never, never, never, never, never, never, never,
  /\[APPROVED by/, never, never);

const listed = rows.map(r => r.batch).sort();
const want   = ['213', '214', '268'];
console.log('  on the report :', listed.join(', '));
console.log('  should be     :', want.join(', '));
console.log('    268  a real batch                               ' + (listed.includes('268') ? 'listed  ok' : 'MISSING ✗'));
console.log('    213  received, quantity keyed as nought         ' + (listed.includes('213') ? 'listed  ok' : 'MISSING ✗  (a keying error must stay visible)'));
console.log('    214  an approved calibration and nothing else   ' + (listed.includes('214') ? 'listed  ok' : 'MISSING ✗'));
console.log('    211  a calibration of nought only                ' + (listed.includes('211') ? 'LISTED ✗  (the phantom row)' : 'gone    ok'));
console.log('    212  a transfer of nought                       ' + (listed.includes('212') ? 'LISTED ✗' : 'gone    ok'));
const ok = JSON.stringify(listed) === JSON.stringify(want);
console.log('\n' + (ok ? 'all correct' : 'FAILED'));
process.exit(ok ? 0 : 1);
