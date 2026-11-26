// Life of Plot: the page's pure builder (lifted out of operation_life_of_plot.html) over
// real B4 and B11 records. Run: node tests/life_of_plot_builds_the_sheet.cjs
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_life_of_plot.html'), 'utf8');
const block = src.slice(src.indexOf('// ── BEGIN build'), src.indexOf('// ── END build'));
const NURSERY_LABEL = { BNN: 'BNN', UNN1: 'UNN 1', UNN2: 'UNN 2', OTHER: 'Not in Seedling Stock' };
const NURSERY_ORDER = ['BNN', 'UNN1', 'UNN2', 'OTHER'];
const { buildPlotHistory, buildTransplantYear, lpYears } = new Function('NURSERY_LABEL', 'NURSERY_ORDER', block + '\nreturn { buildPlotHistory, buildTransplantYear, lpYears: typeof lpYears === "function" ? lpYears : null };')(NURSERY_LABEL, NURSERY_ORDER);

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

console.log('4. a plot is read by CYCLE, never mixed (the office B11, from its own sheet)');
{
  const c3 = (plot, b, date, qty) => ({ plot_name: plot, transaction_type: '3rd_Culling', transaction_date: null, quantity_change: qty, batch_name: b, remark: `3rd Culling. Culled: ${qty} MapQty: ${qty} CullDate:${date}` });
  const c2 = (plot, b, date, qty) => ({ plot_name: plot, transaction_type: '2nd_Culling', transaction_date: null, quantity_change: qty, batch_name: b, remark: `2nd Culling. Dead: ${qty}. CullDate: ${date}` });
  const r2 = [
    T('B11', '228', '2025-05-22', 3074), T('B11', '229', '2025-05-22', 9047),
    c2('B11', '228', '2025-09-14', 95), c2('B11', '229', '2025-09-14', 69),
    c3('B11', '228', '2026-06-12', 178), c3('B11', '229', '2026-06-12', 2884),
    T('B11', '263', '2026-07-22', 1646), T('B11', '265', '2026-07-24', 7453),
    { plot_name: 'B11', transaction_type: 'Stock_Calibration', transaction_date: '2026-08-26', quantity_change: -127, batch_name: '265', remark: 'Report: Transplanting. Plot: B11. [APPROVED by x]' },
    c2('B11', '263', '2026-11-12', 60), c2('B11', '265', '2026-11-12', 41),
    T('B11', '269', '2026-09-10', 3168), T('B11', '271', '2026-10-24', 135),
    T('B4', '242', '2026-01-18', 1000),
  ];
  const m2 = buildPlotHistory([{ plot_name: 'B11', nursery_name: 'BNN' }, { plot_name: 'B4', nursery_name: 'BNN' }, { plot_name: 'B13', nursery_name: 'BNN' }], r2);
  const p11 = m2.groups.flatMap(g => g.plots).find(p => p.plot === 'B11');
  const cy = p11.cycles || [];
  ok(cy.length === 2, 'B11 has two cycles', cy.length);
  ok(cy[0] && cy[0].batches.map(b => b.batch).join() === '228,229' && cy[0].tAdj === 12121 && cy[0].start === '2025-05-22' && cy[0].end === '2026-06-12',
     'cycle 1: 228 + 229, 12,121 transplanted, 22 May 2025 to its 3rd cull 12 Jun 2026 (the sheet total 12,121)', cy[0] && [cy[0].batches.map(b => b.batch), cy[0].tAdj, cy[0].start, cy[0].end]);
  ok(cy[1] && cy[1].batches.map(b => b.batch).join() === '263,265,269,271' && cy[1].tAdj === 12275 && cy[1].current && !cy[1].end,
     'cycle 2: 263, 265, 269, 271 — 12,275 transplanted, running now (the sheet total 12,275)', cy[1] && [cy[1].batches.map(b => b.batch), cy[1].tAdj, cy[1].end]);
  ok(cy[1] && cy[1].c2 === 101 && cy[0].c3 === 3062, 'each cycle carries its own culls: cycle 2 2nd cull 101, cycle 1 3rd cull 3,062', cy[1] && [cy[1].c2, cy[0].c3]);

  console.log('5. the transplant record by year is the office sheet');
  const R = buildTransplantYear(m2, 2026);
  const bnn = R.groups.find(g => g.key === 'BNN');
  const row = n => bnn.plots.find(p => p.plot === n);
  ok(row('B11').months.join() === '0,0,0,0,0,0,8972,0,3168,135,0,0', 'B11 2026: Jul 8,972 (1,646 + 7,453 − 127), Sep 3,168, Oct 135 — as the office sheet reads', row('B11').months);
  ok(row('B4').months[0] === 1000 && row('B13') && row('B13').total === 0, 'B4 Jan 1,000; B13 keeps its empty row', [row('B4').months[0], row('B13') && row('B13').total]);
  ok(bnn.months[6] === 8972 && bnn.total === 1000 + 8972 + 3168 + 135, 'the BNN total row adds the plots', [bnn.months[6], bnn.total]);
  ok(R.thisY[6] === 8972 && R.thisCum[11] === R.total && R.prevY[4] === 12121, 'summary: 2026 by month and cumulative, and 2025 beside it (May 2025: 12,121)', [R.thisY[6], R.thisCum[11], R.prevY[4]]);
  ok(lpYears && lpYears(m2).join() === '2025,2026', 'the years offered are the years with a transplant', lpYears && lpYears(m2));
}

{
  console.log('6. the figures are the batch report own readings');
  const R = (type, qty, remark, created) => ({ plot_name: 'N7', transaction_type: type, transaction_date: type === 'Transplanted' ? '2026-03-30' : null, quantity_change: qty, batch_name: '250', remark, created_at: created });
  const m6 = buildPlotHistory([{ plot_name: 'N7', nursery_name: 'UNN 2' }], [
    R('Transplanted', 3000, 'Transplanted from tray [P2] to Main Plot [N7]. Date: 2026-03-14', '2026-03-30T00:00:00Z'),
    // saved twice: the batch report keeps the newest per destination, never the sum
    R('2nd_Culling', 40, '2nd Culling. Dead: 40. CullDate: 2026-06-01 DestType: main', '2026-06-02T00:00:00Z'),
    R('2nd_Culling', 45, '2nd Culling. Dead: 45. CullDate: 2026-06-03 DestType: main', '2026-06-05T00:00:00Z'),
    // a 3rd culling with no CullDate keyed: the batch report shows no date
    R('3rd_Culling', 600, '3rd Culling. Transplanted: 3000, Culled: 600, DestType: main MapQty: 2400', '2026-09-20T00:00:00Z'),
  ]);
  const b = m6.groups.find(g => g.key === 'UNN2').plots[0].batches[0];
  ok(b.tDate === '2026-03-14', 'the transplant day is Tab 3 own: the Date: in the remark before transaction_date', b.tDate);
  ok(b.c2Qty === 45 && b.c2Date === '2026-06-03', 'a 2nd culling saved twice is the newest save (45 on 3 Jun), never 85', [b.c2Qty, b.c2Date]);
  ok(b.c3Qty === 600 && b.c3Date === null && b.c3Sort === '2026-09-20', 'a 3rd culling with no CullDate shows no date, as Tab 6 does; the cycle still closes on its save day', [b.c3Qty, b.c3Date, b.c3Sort]);
}

{
  // B1: 234 3rd culled 1 Jun 2026, 252 went in 14 Jun, 237 3rd culled 2 Aug. The new
  // cycle starts after the FIRST real culling, not the last.
  const C3 = (b, day, q) => ({ plot_name: 'B1', transaction_type: '3rd_Culling', transaction_date: null, quantity_change: q, batch_name: b, remark: '3rd Culling. Culled: ' + q + ', DestType: main MapQty: ' + q + ' CullDate:' + day });
  const mB1 = buildPlotHistory([{ plot_name: 'B1', nursery_name: 'BNN' }], [
    T('B1', '234', '2025-09-19', 137), T('B1', '237', '2025-09-19', 1182), T('B1', '252', '2026-06-14', 157), T('B1', '268', '2026-08-23', 1365),
    C3('234', '2026-06-01', 8), C3('237', '2026-08-02', 90),
  ]);
  const pB1 = mB1.groups.find(g => g.key === 'BNN').plots[0];
  ok(pB1.cycles.length === 2 && pB1.cycles[0].batches.map(b => b.batch).join() === '234,237' && pB1.cycles[1].batches.map(b => b.batch).join() === '252,268',
     'B1: 252 went in after 234 was 3rd culled, so it starts cycle 2, though 237 was culled later', pB1.cycles.map(c => c.batches.map(b => b.batch)));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
