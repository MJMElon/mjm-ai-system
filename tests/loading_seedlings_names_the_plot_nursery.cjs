/* LOADING SEEDLINGS SAYS WHICH NURSERY THE DO CAME OUT OF.

   The office: a column after the DO number showing BNN / UNN1 / UNN2, from
   the plot. The sheet is the GANG that loaded, so a UNN 2 DO carried by the
   UNN 1 gang sits on the UNN 1 sheet -- this column is what says the plot
   was UNN 2.

   Drives the SHIPPED _doPlotNurseries over the shipped _doLines.

   Run: node tests/loading_seedlings_names_the_plot_nursery.cjs
*/
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'nursery_ops/plot_maintenance_script.js'), 'utf8');
let failed = 0;
const is = (got, want, m) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'ok    ' : 'FAIL  ') + m + (ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want)));
  if (!ok) failed++;
};
function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  if (at < 0) return 'function ' + name + '() { return []; }';
  let depth = 0;
  for (let j = SRC.indexOf('{', at); j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}' && --depth === 0) return SRC.slice(at, j + 1);
  }
  return '';
}
const NURSERY_PLOTS = { PN: ['P01'], BNN: ['B1', 'B2'], UNN1: ['U1', 'U3'], UNN2: ['N12'] };
const fn = new Function('NURSERY_PLOTS', 'MJMMaintPlots', '_doPlotIndex',
  lift('_doLines') + '\n' + lift('_doPlotNurseries') + '\nreturn _doPlotNurseries;')(NURSERY_PLOTS, {}, null);

is(fn({ plot_1: 'U1', qty_1: 109, total_qty: 109 }), ['UNN1'], 'a DO off U1 reads UNN1');
is(fn({ plot_1: 'N12', qty_1: 400 }), ['UNN2'], 'a DO off N12 reads UNN2, whichever gang loaded it');
is(fn({ plot_1: 'N12', qty_1: 100, plot_2: 'B2', qty_2: 50 }), ['BNN', 'UNN2'], 'a DO off two nurseries names both, in nursery order');
is(fn({ plot_1: 'U1', qty_1: 60, plot_2: 'U3', qty_2: 40 }), ['UNN1'], 'two plots of one nursery name it once');
is(fn({ plot_1: 'ZZ9', qty_1: 10 }), [], 'a plot nothing can place names nothing (the cell reads a dash)');

const body = SRC.slice(SRC.indexOf('function renderLoadingSeedlingsPayroll'));
const draw = body.slice(0, body.indexOf('\n}\n'));
is(/pay\.doNumber[\s\S]{0,80}pay\.doNursery[\s\S]{0,80}pay\.qtyLoaded/.test(draw), true, 'the Nursery column sits after DO Number and before the quantity');
is(/_doPlotNurseries\(d\)\.join\(' \/ '\)/.test(draw), true, 'each row draws its plot nurseries');
is((draw.match(/colspan="\$\{5 \+ wk\.length \+ 1\}"/g) || []).length, 2, 'the title row and the empty row span the extra column');
is(/colspan="4">\$\{t\('pay\.totalCap'\)\}/.test(draw), true, 'the total row spans it too');
is((SRC.match(/'pay\.doNursery':/g) || []).length, 2, 'the heading is in both languages');

console.log(failed ? '\n' + failed + ' FAILED' : '\nall checks passed');
process.exit(failed ? 1 : 0);
