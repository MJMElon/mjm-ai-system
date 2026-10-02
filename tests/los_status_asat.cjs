/* Status decides which As At applies.
   Active → a DAY (what was standing then). Completed → a month/year window
   on WHEN the batch finished. The real accumulator is lifted out of the page. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');
const i = src.indexOf('async function _losBuildAllRows(asAt) {');
const body = src.slice(src.indexOf('  // ── One row per batch ──', i),
                       src.indexOf('  const rows = Object.values(rowsByBatch);', i));
const grab = (name) => { const a = src.indexOf('function ' + name + '('); return src.slice(a, src.indexOf('\n}', a) + 2); };
const _losFinishedWindow = new Function('return ' + grab('_losFinishedWindow'))();
const _losAsAt           = new Function('return ' + grab('_losAsAt'))();

// Four batches, finishing in four different months — plus one still going.
const logs = [];
const add = (b, t, d, q, plot) => logs.push({ batch_name:b, transaction_type:t,
  transaction_date:d, quantity_change:q, remark:'', plot_name:plot || 'Pre-Nursery' });
const life = (b, seed, cull, culled, tr, trq) => {
  add(b,'Seeds_Received',seed,1000); add(b,'Planted',seed,1000);
  add(b,'1st_Culling',cull,culled,'P14'); add(b,'Transplanted',tr,trq,'B4');
};
life('259','2026-01-10','2026-05-02',100,'2026-06-01',900);
life('264','2026-02-10','2026-05-02',100,'2026-06-01',900);
life('268','2026-03-01','2026-09-07',100,'2026-09-23',900);
life('270','2026-03-20','2026-09-07',100,'2026-09-23',900);
life('275','2026-04-01','2026-09-07',100,'2026-09-23',900);   // still going
const dos = [
  { do_number:'D1', delivery_date:'2026-08-28', status:'Delivered', remark:'', plot_1:'B4', qty_1:900, batch_1:'259' },
  { do_number:'D2', delivery_date:'2026-09-04', status:'Delivered', remark:'', plot_1:'B4', qty_1:900, batch_1:'264' },
  { do_number:'D3', delivery_date:'2026-09-23', status:'Delivered', remark:'', plot_1:'B4', qty_1:900, batch_1:'268' },
  { do_number:'D4', delivery_date:'2026-10-11', status:'Delivered', remark:'', plot_1:'B4', qty_1:900, batch_1:'270' },
  // 275 sells only half — never finishes
  { do_number:'D5', delivery_date:'2026-09-25', status:'Delivered', remark:'', plot_1:'B4', qty_1:400, batch_1:'275' },
];

function build(asAt) {
  const fn = new Function('asAt','logsRes','dosRes','_logDate','_mvBatchKey','nurseryOf',
    'PRE_NURSERY_PLOTS','_losAgeMonths','_losAgeLabel','_RE_LOS_SUPPLIER','_RE_LOS_MPOB',
    '_RE_LOS_DONO','_RE_LOS_DO_QTY','_RE_LOS_FOC_PCT','_RE_LOS_REPL','_RE_LOS_FROM_TRAY',
    '_RE_LOS_FROM_PLOT','_RE_LOS_APPROVED','_RE_LOS_CAL_REPORT','_RE_LOS_CAL_SIDE',
    body + '\nreturn Object.values(rowsByBatch);');
  const never = /NEVERMATCH_x([0-9])/;
  return fn(asAt, { data: logs }, { data: dos }, (l) => l.transaction_date || null,
    (b) => String(b || '').trim(),
    (plot) => (['Pre-Nursery','P14'].includes(plot) ? 'Pre-Nursery' : 'BNN'),
    ['Pre-Nursery'], () => null, () => '',
    never, never, never, never, never, never, never, never, never, never, never);
}

// The two modes, exactly as _losBuildData assembles them.
function list(status, dayPick, year, month) {
  const done = status === 'completed';
  const asAt = done ? _losAsAt(year, month) : dayPick;
  const fin  = done && year ? _losFinishedWindow(year, month) : null;
  return build(asAt).filter(r => {
    if (status === 'active' && r.completed) return false;
    if (done && !r.completed) return false;
    if (fin) { const f = r.lastDate || ''; if (!f || f < fin.from || f > fin.to) return false; }
    return true;
  }).map(r => r.batch).sort();
}

console.log('259 finished 28 Aug · 264 finished 04 Sep · 268 finished 23 Sep');
console.log('270 finished 11 Oct · 275 never finished\n');
const cases = [
  ['Completed · Sep 2026',           ['completed','', '2026','8'],  ['264','268']],
  ['Completed · Aug 2026',           ['completed','', '2026','7'],  ['259']],
  ['Completed · Oct 2026',           ['completed','', '2026','9'],  ['270']],
  ['Completed · 2026 (all months)',  ['completed','', '2026','']],
  ['Completed · all years',          ['completed','', '','']],
  ['Active · as at today',           ['active','', '','']],
  ['Active · as at 30 Jun 2026',     ['active','2026-06-30','','']],
  ['Active & completed · today',     ['','', '','']],
];
let bad = 0;
for (const [label, args, want] of cases) {
  const got = list(...args);
  const ok = !want || JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log('  ' + label.padEnd(32) + got.join(', ').padEnd(26) +
              (want ? (ok ? 'ok' : '✗ expected ' + want.join(', ')) : ''));
}
console.log('\n' + (bad ? bad + ' WRONG' : 'all correct'));
process.exit(bad ? 1 : 0);
