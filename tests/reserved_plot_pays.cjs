/* A transfer plot's work reaches the payroll.

   "Plot Reserved" on Tab 6 is a -R plot: one made by a 3rd-culling transfer.
   It is in no hardcoded list anywhere. The Work Maintenance schedule grew
   ways to draw one -- a capacity keyed against it, or rows of its own -- and
   the SALARY CLAIM never did: shared_maint_plots.js knew the built-in plots
   and the ones somebody added by hand, and nothing else.

   So a maintenance record on B3-R resolved to no nursery, fell onto the
   orphan list, and its capacity paid nobody. Same shape as the UNN 2 bug that
   file was written for, pointing at a different set of plots.

   shared_plots is where the office says which nursery a plot is in, and it
   names the nursery the way Seedling Stock spells it -- "UNN 1" with the
   space -- so this checks the bridging too.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/reserved_plot_pays.cjs
   (no browser, no server: the module is plain JavaScript.)              */
const fs = require('fs'), vm = require('vm');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../shared/shared_maint_plots.js', 'utf8'), sandbox);
const P = sandbox.window.MJMMaintPlots;

/* A Supabase stand-in: one table at a time, and either can be made to fail. */
function sb(tables, failing) {
  return {
    from: (t) => ({
      select: () => ({
        then: (a, b) => Promise.resolve(
          failing === t ? { error: new Error('nope') } : { data: tables[t] || [] }
        ).then(a, b)
      })
    })
  };
}

const STOCK = [
  // Named the way Seedling Stock spells it, space and all.
  { nursery_name: 'BNN',   plot_name: 'B3-R' },
  { nursery_name: 'BNN',   plot_name: 'B4-R' },
  { nursery_name: 'UNN 1', plot_name: 'U12-R' },
  { nursery_name: 'UNN 2', plot_name: 'N5-R' },
  { nursery_name: 'UNN 2', plot_name: 'NP-R' },
  // The ordinary plots are in there too; they must not be duplicated.
  { nursery_name: 'BNN',   plot_name: 'B4' },
  { nursery_name: 'UNN 2', plot_name: 'N5' },
  // A nursery this page has no schedule for at all.
  { nursery_name: 'Somewhere Else', plot_name: 'X1' },
  { nursery_name: 'BNN',   plot_name: '   ' }
];
const CUSTOM = [{ nursery: 'BNN', plot: 'B99' }];

(async () => {
  console.log('\nBefore: the built-in list knows nothing of a transfer plot');
  {
    const idx = P.index({});
    check('B3-R belongs to nobody', P.nurseryOfPlot('B3-R', idx), null);
    check('…and B4 is fine, as it always was', P.nurseryOfPlot('B4', idx), 'BNN');
  }

  console.log('\nSeedling Stock says whose plot it is');
  {
    const extra = await P.loadAll(sb({ shared_plots: STOCK, nops_maint_custom_plots: CUSTOM }));
    const idx = P.index(extra);
    check('B3-R PAYS INTO BNN', P.nurseryOfPlot('B3-R', idx), 'BNN');
    check('B4-R too', P.nurseryOfPlot('B4-R', idx), 'BNN');
    check('U12-R into UNN1, across the space in "UNN 1"',
          P.nurseryOfPlot('U12-R', idx), 'UNN1');
    check('N5-R into UNN2', P.nurseryOfPlot('N5-R', idx), 'UNN2');
    check('NP-R, which has no numbered parent, still lands',
          P.nurseryOfPlot('NP-R', idx), 'UNN2');
    check('a plot keyed with a stray space is the same plot',
          P.nurseryOfPlot('b3 r', idx), 'BNN');
    check('a hand-added plot still works', P.nurseryOfPlot('B99', idx), 'BNN');
    check('a nursery this page has no schedule for is not invented',
          P.nurseryOfPlot('X1', idx), null);

    const bnn = P.merged(extra).BNN;
    check('B4 is listed once, not twice',
          bnn.filter((p) => P.plotKey(p) === 'B4').length, 1);
    check('and the blank plot name was dropped',
          bnn.filter((p) => !P.plotKey(p)).length, 0);
  }

  console.log('\nIf one read fails the other still answers');
  {
    const onlyStock = await P.loadAll(sb({ shared_plots: STOCK }, 'nops_maint_custom_plots'));
    check('stock alone still places B3-R',
          P.nurseryOfPlot('B3-R', P.index(onlyStock)), 'BNN');

    const onlyCustom = await P.loadAll(sb({ nops_maint_custom_plots: CUSTOM }, 'shared_plots'));
    check('custom alone still places B99',
          P.nurseryOfPlot('B99', P.index(onlyCustom)), 'BNN');
    check('…and B4 is never lost whatever fails',
          P.nurseryOfPlot('B4', P.index(onlyCustom)), 'BNN');
  }

  console.log('\nNo database at all');
  {
    const none = await P.loadAll(null);
    check('the built-in plots still answer', P.nurseryOfPlot('N20', P.index(none)), 'UNN2');
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
