// Life of Plot: the page's pure builder (lifted out of operation_life_of_plot.html)
// over the Transplant Record 2026 sheet's own figures. Run: node tests/life_of_plot_builds_the_sheet.cjs
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_life_of_plot.html'), 'utf8');
const block = src.slice(src.indexOf('// ── BEGIN build'), src.indexOf('// ── END build'));
const NURSERY_LABEL = { BNN: 'BNN', UNN1: 'UNN 1', UNN2: 'UNN 2', OTHER: 'Not in Seedling Stock' };
const NURSERY_ORDER = ['BNN', 'UNN1', 'UNN2', 'OTHER'];
const { buildLifePlot } = new Function('NURSERY_LABEL', 'NURSERY_ORDER', block + '\nreturn { buildLifePlot };')(NURSERY_LABEL, NURSERY_ORDER);

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')); } };

const plots = [
  { plot_name: 'B1', nursery_name: 'BNN', is_active: true },
  { plot_name: 'B2', nursery_name: 'BNN', is_active: true },
  { plot_name: 'B1-R', nursery_name: 'BNN', is_active: true },
  { plot_name: 'U17', nursery_name: 'UNN 1', is_active: true },
  { plot_name: 'N7', nursery_name: 'UNN 2', is_active: true },
];
const rows = [
  { plot_name: 'B1', transaction_date: '2026-06-14', quantity_change: 599 },
  { plot_name: 'B1', transaction_date: '2026-08-23', quantity_change: 1754 },
  { plot_name: 'B2', transaction_date: '2026-03-08', quantity_change: 3151 },
  { plot_name: 'B2', transaction_date: '2026-10-24', quantity_change: 3164 },
  { plot_name: 'U17', transaction_date: '2026-01-22', quantity_change: 6872 },
  { plot_name: 'N7', transaction_date: '2026-02-20', quantity_change: 7518 },
  { plot_name: 'N7', transaction_date: '2026-10-31', quantity_change: 7757 },
  { plot_name: 'B1-R', transaction_date: '2026-06-15', quantity_change: 50 },   // replant plot: on no PALMS/sheet row
  { plot_name: 'ZZ9', transaction_date: '2026-05-02', quantity_change: 40 },    // not in Seedling Stock
  { plot_name: 'B1', transaction_date: '2025-06-14', quantity_change: 999 },    // other year
  { plot_name: 'B1', transaction_date: null, quantity_change: 500 },            // no date: not in any month
];
const m = buildLifePlot(plots, rows, 2026);
const grp = k => m.groups.find(g => g.key === k);
const plotRow = (k, name) => grp(k).plots.find(p => p.plot === name);

console.log('1. one plot, one month');
ok(plotRow('BNN', 'B1').m[5] === 599 && plotRow('BNN', 'B1').m[7] === 1754, 'B1 June 599 and August 1,754, as the sheet has them');
ok(plotRow('BNN', 'B1').total === 2353, 'B1 year total is its twelve months added', plotRow('BNN', 'B1').total);
ok(plotRow('BNN', 'B2').m[2] === 3151 && plotRow('BNN', 'B2').m[9] === 3164, 'B2 March 3,151 and October 3,164');
ok(plotRow('UNN2', 'N7').m[1] === 7518 && plotRow('UNN2', 'N7').m[9] === 7757, 'N7 February 7,518 and October 7,757');
ok(plotRow('UNN1', 'U17').m[0] === 6872, 'U17 January 6,872 (the sheet UNN 1 January figure)');

console.log('2. what must NOT be counted');
ok(!grp('BNN').plots.some(p => /-R/.test(p.plot)), 'a -R replant plot is on no nursery row');
ok(m.total === 3151 + 3164 + 599 + 1754 + 6872 + 7518 + 7757 + 40, 'the grand total leaves out -R, the other year and the undated record', m.total);
ok(!!grp('OTHER') && grp('OTHER').plots[0].plot === 'ZZ9' && grp('OTHER').total === 40, 'a plot Seedling Stock does not hold is named under Not in Seedling Stock');

console.log('3. the month and cumulative rows');
ok(m.m[0] === 6872 && m.m[1] === 7518 && m.m[2] === 3151, 'monthly grand totals');
ok(m.cum[11] === m.total, 'the cumulative row ends on the year total', m.cum[11]);
ok(grp('BNN').m[0] === 0, 'a nursery with no January transplant reads nought');

console.log('4. plots in Seedling Stock with nothing this year still get a row');
const empty = buildLifePlot([{ plot_name: 'B14', nursery_name: 'BNN', is_active: true }], [], 2026);
ok(empty.groups[0].plots.length === 1 && empty.total === 0, 'B14 shows, with nothing transplanted');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
