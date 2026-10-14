/* "As At — Sep 2026" must count the batch as it stood on 30 Sep 2026, not as
   it stands today. The REAL accumulator is lifted out of the page and fed a
   batch whose life straddles the cut-off. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');

const i = src.indexOf('async function _losBuildAllRows(asAt) {');
const body = src.slice(src.indexOf('  // ── One row per batch ──', i),
                       src.indexOf('  // Years/suppliers offered by their pickers', i));

// The log rows: everything about batch 268, before and after 30 Sep 2026.
const logs = [
  { batch_name:'268', transaction_type:'Seeds_Received', transaction_date:'2026-03-01', quantity_change:1000, remark:'', plot_name:'Pre-Nursery' },
  { batch_name:'268', transaction_type:'Planted',        transaction_date:'2026-03-05', quantity_change:1000, remark:'', plot_name:'Pre-Nursery' },
  { batch_name:'268', transaction_type:'1st_Culling',    transaction_date:'2026-09-07', quantity_change:100,  remark:'', plot_name:'P14' },
  { batch_name:'268', transaction_type:'Transplanted',   transaction_date:'2026-09-23', quantity_change:600,  remark:'', plot_name:'B4' },
  // ── everything below happened AFTER 30 Sep 2026 ──
  { batch_name:'268', transaction_type:'3rd_Culling',    transaction_date:'2026-10-15', quantity_change:80,   remark:'', plot_name:'B4' },
  // a batch that did not exist yet on 30 Sep
  { batch_name:'999', transaction_type:'Seeds_Received', transaction_date:'2026-10-02', quantity_change:500,  remark:'', plot_name:'Pre-Nursery' },
  { batch_name:'999', transaction_type:'Planted',        transaction_date:'2026-10-04', quantity_change:500,  remark:'', plot_name:'Pre-Nursery' },
];
const dos = [
  { do_number:'DO-1', delivery_date:'2026-09-28', status:'Delivered', remark:'', plot_1:'B4', qty_1:50,  batch_1:'268' },
  { do_number:'DO-2', delivery_date:'2026-10-20', status:'Delivered', remark:'', plot_1:'B4', qty_1:200, batch_1:'268' },
];

/* The real tray matcher, lifted rather than copied — it decides which half
   of the Transplant Details split a row lands in. */
const grab = (name) => new Function('return ' + src.slice(
  src.indexOf('= ', src.indexOf('const ' + name + ' ')) + 2,
  src.indexOf('\n', src.indexOf('const ' + name + ' '))).replace(/;$/, ''))();

function build(asAt) {
  const fn = new Function('asAt','logsRes','dosRes','_logDate','_mvBatchKey','nurseryOf',
    'PRE_NURSERY_PLOTS','_losAgeMonths','_losAgeLabel',
    '_RE_LOS_SUPPLIER','_RE_LOS_MPOB','_RE_LOS_DONO','_RE_LOS_DO_QTY','_RE_LOS_FOC_PCT',
    '_RE_LOS_REPL','_RE_LOS_FROM_TRAY','_RE_LOS_FROM_PLOT','_RE_LOS_APPROVED',
    '_RE_LOS_CAL_REPORT','_RE_LOS_CAL_SIDE','_losTrayKey','_LOS_CAL_SEED_REPORTS',
    body + '\nreturn rows;');
  const never = /NEVERMATCH_x([0-9])/;
  return fn(asAt, { data: logs }, { data: dos },
    (l) => l.transaction_date || null,
    (b) => String(b || '').trim(),
    (plot) => (['Pre-Nursery','DOUBLE-TONE','PREMIUM CARE','P14'].includes(plot) ? 'Pre-Nursery' : 'BNN'),
    ['Pre-Nursery','DOUBLE-TONE','PREMIUM CARE'],
    () => null, () => '',
    never, never, never, never, never, never, never, never, never, never, never,
    grab('_losTrayKey'), grab('_LOS_CAL_SEED_REPORTS'));
}

const show = (label, asAt, want) => {
  const rows = build(asAt);
  const r = rows.find(x => x.batch === '268') || {};
  const got = { planted:r.planted|0, cull1:r.cull1|0, trans:r.trans|0, cull3:r.cull3|0,
                sales:r.sales|0, balance:r.balance|0, pre:r.preBalance|0, main:r.mainBalance|0,
                batches: rows.length };
  const ok = Object.keys(want).every(k => got[k] === want[k]);
  console.log('\n  ' + label);
  console.log('    planted ' + got.planted + ' · 1st cull ' + got.cull1 + ' · transplanted ' + got.trans +
              ' · 3rd cull ' + got.cull3 + ' · sold ' + got.sales);
  console.log('    balance ' + got.balance + '  (pre ' + got.pre + ' / main ' + got.main + ')' +
              '  · batches listed: ' + got.batches);
  console.log('    ' + (ok ? 'ok' : '✗ WRONG — expected ' + JSON.stringify(want)));
  return ok;
};

console.log('Batch 268: planted 1,000 · culled 100 (7 Sep) · transplanted 600 (23 Sep)');
console.log('           sold 50 (28 Sep) · 3rd-culled 80 (15 Oct) · sold 200 (20 Oct)');
console.log('Batch 999: received 2 Oct — did not exist on 30 Sep');

let ok = true;
ok &= show('As At — Sep 2026  (cut off at 30 Sep)', '2026-09-30',
  { planted:1000, cull1:100, trans:600, cull3:0, sales:50, balance:550, pre:300, main:550, batches:1 });
ok &= show('All years  (no cut-off — everything to date)', '',
  { planted:1000, cull1:100, trans:600, cull3:80, sales:250, balance:270, pre:300, main:270, batches:2 });
console.log('\n' + (ok ? 'all correct' : 'FAILED'));
process.exit(ok ? 0 : 1);
