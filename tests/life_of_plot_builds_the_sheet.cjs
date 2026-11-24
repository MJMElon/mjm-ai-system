// Life of Plot: the page's pure builder (lifted out of operation_life_of_plot.html) over
// real B4 and B11 records. Run: node tests/life_of_plot_builds_the_sheet.cjs
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_life_of_plot.html'), 'utf8');
const block = src.slice(src.indexOf('// ── BEGIN build'), src.indexOf('// ── END build'));
const NURSERY_LABEL = { BNN: 'BNN', UNN1: 'UNN 1', UNN2: 'UNN 2', OTHER: 'Not in Seedling Stock' };
const NURSERY_ORDER = ['BNN', 'UNN1', 'UNN2', 'OTHER'];
const { buildPlotHistory } = new Function('NURSERY_LABEL', 'NURSERY_ORDER', block + '\nreturn { buildPlotHistory };')(NURSERY_LABEL, NURSERY_ORDER);

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')); } };
const T = (plot, batch, date, qty, remark) => ({ plot_name: plot, transaction_type: 'Transplanted', transaction_date: date, quantity_change: qty, batch_name: batch, remark: remark || ('Transplanted from tray [P1] to Main Plot [' + plot + ']. Date: ' + date) });

const plots = [
  { plot_name: 'B4', nursery_name: 'BNN' }, { plot_name: 'B11', nursery_name: 'BNN' },
  { plot_name: 'B14', nursery_name: 'BNN' }, { plot_name: 'B4-R', nursery_name: 'BNN' },
];
const rows = [
  // B4, batch 242: two trays on 18 Jan; 2nd cull dated by CullDate; 3rd cull dated by CullDate
  T('B4', '242', '2026-01-18', 1190), T('B4', '242', '2026-01-18', 998),
  { plot_name: 'B4', transaction_type: '2nd_Culling', transaction_date: null, quantity_change: 7, batch_name: '242', remark: '2nd Culling. Alive: 2181, Dead: 7, Cull: 0.32%. Transplanted: 2188. CullDate: 2026-05-14 MapUrl:x' },
  { plot_name: 'B4', transaction_type: '3rd_Culling', transaction_date: null, quantity_change: 218, batch_name: '242', remark: '3rd Culling. Transplanted: 2188, Remaining Balance: 211, Culled: 218, Cull Rate: 9.96%, 2ndCulled: 7, Sales: 1944, DestType: main MapQty: 218 CullDate:2026-09-11 DocName:x' },
  // B4, batch 238: double-tone tray, 2nd and 3rd culls
  T('B4', '238', '2026-01-18', 200),
  { plot_name: 'B4', transaction_type: '2nd_Culling', transaction_date: null, quantity_change: 1, batch_name: '238', remark: '2nd Culling. Alive: 199, Dead: 1, Cull: 0.50%. Transplanted: 200. CullDate: 2026-06-30 MapUrl:x' },
  { plot_name: 'B4', transaction_type: '3rd_Culling', transaction_date: null, quantity_change: 8, batch_name: '238', remark: '3rd Culling. Transplanted: 200, Remaining Balance: 7, Culled: 8, Cull Rate: 4.00%, 2ndCulled: 1, Sales: 192, DestType: main MapQty: 8 CullDate:2026-09-11 DocName:x' },
  // B4, batch 233: 2nd and 3rd cull rows with nothing transplanted on this plot; three sale calibrations that are NOT transplanting reports
  { plot_name: 'B4', transaction_type: '2nd_Culling', transaction_date: null, quantity_change: 0, batch_name: '233', remark: '2nd Culling. Alive: 435, Dead: 0, Cull: 0.00%. Transplanted: 435. CullDate: 2026-05-14' },
  { plot_name: 'B4', transaction_type: 'Stock_Calibration', transaction_date: '2026-08-12', quantity_change: -370, batch_name: '233', remark: 'BNN Sales calibration — DO CAL-BNN-20260812' },
  { plot_name: 'B4', transaction_type: 'Stock_Calibration', transaction_date: '2026-08-12', quantity_change: -370, batch_name: '233', remark: 'CAL-BNN 20260812 — line 233/B4' },
  // B4, batch 264: a transplant with no date; the day is in the remark
  { plot_name: 'B4', transaction_type: 'Transplanted', transaction_date: null, quantity_change: 96, batch_name: '264', remark: 'Transplanted from tray [DOUBLE-TONE] to Main Plot [B4]. Date: 2026-09-23 MapUrl:x' },
  // B11, batch 265: four trays; an approved transplanting calibration of -127 against the batch
  T('B11', '265', '2026-07-24', 2520), T('B11', '265', '2026-07-24', 2397), T('B11', '265', '2026-07-24', 2326), T('B11', '265', '2026-07-24', 210),
  { plot_name: 'B11', transaction_type: 'Stock_Calibration', transaction_date: '2026-08-26', quantity_change: -127, batch_name: '265', remark: 'Report: Transplanting. Plot: B11. STOCK CALIBRATION APPROVED BY COCO LAU [APPROVED by estherwong.puigroups@gmail.com on 2026-10-07T07:54:48.477Z]' },
  // An unapproved transplanting calibration does not count
  { plot_name: 'B11', transaction_type: 'Stock_Calibration', transaction_date: '2026-08-26', quantity_change: -50, batch_name: '265', remark: 'Report: Transplanting. Plot: B11. waiting for approval' },
  // A -R replant plot is on no list
  T('B4-R', '242', '2026-03-01', 999),
];
const m = buildPlotHistory(plots, rows);
const plotOf = n => m.groups.flatMap(g => g.plots).find(p => p.plot === n);
const bOf = (n, b) => plotOf(n).batches.find(x => x.batch === b);

console.log('1. the timeline of one plot (B4)');
ok(plotOf('B4').batches.map(b => b.batch).join() === '238,242,264,233', 'B4 batches run in transplant-date order, undated-by-transplant 233 last', plotOf('B4').batches.map(b => b.batch));
const b242 = bOf('B4', '242');
ok(b242.tDate === '2026-01-18' && b242.tQty === 2188 && b242.adj === 0 && b242.tAdj === 2188, 'batch 242: transplanted 18 Jan, 2,188 (1,190 + 998)', b242);
ok(b242.c2Date === '2026-05-14' && b242.c2Qty === 7, 'batch 242: 2nd cull 14 May, 7 dead', b242);
ok(b242.c3Date === '2026-09-11' && b242.c3Qty === 218, 'batch 242: 3rd cull 11 Sep, 218 culled', b242);
const b238 = bOf('B4', '238');
ok(b238.tQty === 200 && b238.c2Date === '2026-06-30' && b238.c2Qty === 1 && b238.c3Date === '2026-09-11' && b238.c3Qty === 8, 'batch 238: 200 in, 2nd cull 30 Jun (1), 3rd cull 11 Sep (8)', b238);
const b264 = bOf('B4', '264');
ok(b264.tDate === '2026-09-23' && b264.tQty === 96, 'batch 264: the undated transplant is dated by its remark, 23 Sep, 96', b264);
const b233 = bOf('B4', '233');
ok(b233.tQty === 0 && b233.adj === 0 && b233.c2Qty === 0 && b233.c2Date === '2026-05-14', 'batch 233 shows its cull but not the sale calibrations (not transplanting reports)', b233);
ok(plotOf('B4').tAdj === 2188 + 200 + 96, 'B4 transplanted total (adjusted) is 2,484', plotOf('B4').tAdj);
ok(plotOf('B4').c2 === 8 && plotOf('B4').c3 === 226, 'B4 2nd cull total 8 (7 + 1 + 0), 3rd cull total 226 (218 + 8)', [plotOf('B4').c2, plotOf('B4').c3]);

console.log('2. the calibration is taken off the batch it corrects, in the transplant month');
const b265 = bOf('B11', '265');
ok(b265.tQty === 7453 && b265.adj === -127 && b265.tAdj === 7326 && b265.tDate === '2026-07-24', 'B11 batch 265: 7,453 transplanted on 24 Jul, approved -127 → 7,326', b265);
ok(b265.adj !== -177, 'an unapproved -50 transplanting calibration is not counted (only the approved -127)', b265.adj);

console.log('3. what is left out');
ok(!plotOf('B4-R') && !m.groups.flatMap(g => g.plots).some(p => /-R/.test(p.plot)), 'a -R replant plot has no timeline');
ok(plotOf('B14') && plotOf('B14').batches.length === 0 && plotOf('B14').tAdj === 0, 'a plot with nothing recorded still shows, empty');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
