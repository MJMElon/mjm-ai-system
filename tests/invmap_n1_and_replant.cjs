// Inventory Map: N1 batch 255 (3rd Culling row keyed, nothing culled, no map)
// stays on the map; a -R plot is shown on its parent; the holding trays are
// not field plots; the sidebar lists plots in sequence.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../operation/operation_stock_sales.js', 'utf8');
function lift(name) {
  const i = src.indexOf('function ' + name + '(');
  let d = 0, j = src.indexOf('{', src.indexOf(')', i));
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
}
const _invmap = { plotBatches: { 'N5': [], 'N5-R': [{ balance: 5 }], 'N15-R': [], 'N50': [] } };
const INVMAP_NURSERY_ORDER = ['PN', 'BNN', 'UNN1', 'UNN2'];
eval(['invmapKey', 'invmapReportStanding', '_invmapCull3Done', 'invmapReplantsOf', 'invmapIsHoldingTray', 'invmapPlotCmp'].map(lift).join('\n'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('ok  ', n); } else { fail++; console.log('FAIL', n); } };
ok('N1 255: keyed, nothing culled, no map -> still standing',
  !_invmapCull3Done({ quantity_change: 0, remark: '3rd Culling. Transplanted: 5690, Remaining Balance: 5690, Culled: 0, Cull Rate: 0.00%, DestType: main' }));
ok('a row with a drone map is done', _invmapCull3Done({ quantity_change: 899, remark: 'Remaining Balance: 828, Culled: 899, MapQty: 899' }));
ok('N2 253: Culled 4,952 with NO map -> still standing (the report shows 4,952)',
  !_invmapCull3Done({ quantity_change: 4952, remark: '3rd Culling. Transplanted: 4952, Remaining Balance: 4929, Culled: 4952, Cull Rate: 100.00%, 2ndCulled: 23, Sales: 0, DestType: main' }));
ok('N2 244: Culled 33 with NO map -> still standing',
  !_invmapCull3Done({ quantity_change: 33, remark: 'Remaining Balance: 33, Culled: 33, Cull Rate: 100.00%' }));
// The Summary Report decides the roster: N2 as the view answers it.
const rep = invmapReportStanding({ data: [
  { plot_name: 'N2', batch_name: '253', qty: 4952 },
  { plot_name: 'N2', batch_name: '244', qty: 33 },
  { plot_name: 'N2', batch_name: '230', qty: 0 },
  { plot_name: 'B6-R', batch_name: '244', qty: 143 }] });
ok('report: N2 stands 253 and 244', rep && rep['N2|253'].qty === 4952 && rep['N2|244'].qty === 33);
ok('report: nought stands nothing (230)', rep && !rep['N2|230']);
ok('report: a -R plot keys apart from its parent', rep && rep['B6R|244'].qty === 143 && !rep['B6|244']);
ok('report that failed -> null (fall back)', invmapReportStanding({ error: 'x' }) === null && invmapReportStanding({ data: [] }) === null);
ok('the map reads the Summary Report view', /from\('shared_plot_batch_balance'\)/.test(src));
ok('N5 carries N5-R', JSON.stringify(invmapReplantsOf('N5')) === '["N5-R"]');
ok('N1 does not carry N15-R', invmapReplantsOf('N1').length === 0);
ok('a -R plot has no replant of its own', invmapReplantsOf('N5-R').length === 0);
ok('Premium Care is a holding tray', invmapIsHoldingTray('PREMIUM CARE') && invmapIsHoldingTray('DOUBLE-TONE') && !invmapIsHoldingTray('N5'));
const p2n = { B10: 'BNN', B2: 'BNN', N1: 'UNN 2', 'N5-R': 'UNN 2', N5: 'UNN 2', N10: 'UNN 2', U3: 'UNN 1' };
const order = Object.keys(p2n).sort((a, b) => invmapPlotCmp(a, b, p2n));
ok('plots in sequence: ' + order.join(' '), order.join(' ') === 'B2 B10 U3 N1 N5 N5-R N10');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
