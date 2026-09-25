/* A plot losing seedlings must not make the batch over-allocated.

   Batch 242 read OVER ALLOCATED BY 127 with the -127 sitting in the
   Adjustment column of the same screen. The allocation base had the loss
   taken off it, while the transplant rows still counted every seedling
   they sent out -- so the tab was short by exactly the amount that had
   already been explained. Batch 234 read it by 53 for the same reason,
   and the file already carries that story as a warning.

   Both sides of the sum have to move: the loss comes off the base AND
   off what is standing in the main plots, which is what the list's own
   Final Qty column already shows.

   This checks the arithmetic itself, with the figures from the screenshot
   it was reported from: 10,223 transplanted, -127 adjusted, 10,096
   standing.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/alloc_balance_adjustment.cjs
   No server needed.                                                      */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

/* The sum as the tab does it, lifted out so the balance can be exercised
   without a loaded batch. Mirrors calcTransplanting: base, what is
   standing, and what is left over. */
function balance({ planted, dtone = 0, seedAdj = 0, plotLoss = 0, totalMain, culled = 0 }) {
  const allocBase     = planted + dtone + seedAdj + plotLoss;
  const mainStanding  = totalMain + plotLoss;
  const fullyAccounted = mainStanding + culled;
  const rawPending    = allocBase - fullyAccounted;
  return { allocBase, mainStanding, rawPending,
           over: rawPending < 0 ? Math.abs(rawPending) : 0 };
}

(async () => {
  console.log('\nBatch 242, the screenshot it was reported from');
  // 10,223 went out to main plots, nothing culled yet, and they came from
  // exactly that many planted. Then 127 were found missing in B11.
  const before = balance({ planted: 10223, totalMain: 10223 });
  check('with nothing adjusted it balances', before.rawPending, 0);

  const after = balance({ planted: 10223, totalMain: 10223, plotLoss: -127 });
  check('losing 127 from a plot does NOT make it over-allocated', after.over, 0);
  check('…it still balances', after.rawPending, 0);
  check('…the base comes down by the 127', after.allocBase, 10223 - 127);
  check('…and so does what is standing', after.mainStanding, 10096);
  checkTrue('…which is the Final Qty the list shows', after.mainStanding === 10096);

  console.log('\nThe bug it replaces');
  // The old sum took the loss off the base only.
  const oldWay = (10223 - 127) - (10223 + 0);
  check('taking it off the base alone read over-allocated by exactly the 127',
        Math.abs(oldWay), 127);
  check('…which is the number that was already on the screen', Math.abs(oldWay), 127);

  console.log('\nIt still catches a genuine over-allocation');
  const genuine = balance({ planted: 1000, totalMain: 1053 });
  check('sending out more than was planted is over by the difference', genuine.over, 53);
  const genuineWithLoss = balance({ planted: 1000, totalMain: 1053, plotLoss: -10 });
  check('…and a loss on top does not hide it', genuineWithLoss.over, 53);

  console.log('\nAnd a seed-count adjustment still moves the base on its own');
  /* A seed adjustment says there were never that many — it belongs to the
     base only, and nothing is standing that has to move with it. */
  const seed = balance({ planted: 1000, totalMain: 1000, seedAdj: -20 });
  check('twenty seeds that never existed leave the tab over by twenty', seed.over, 20);

  console.log('\nThe tab does the same sum');
  const src = fs.readFileSync(path.join(__dirname, '..', 'operation',
                                        'operation_batch_detail.html'), 'utf8');
  checkTrue('the loss is taken once, into a name',
            /const plotLossT3 = adjustPlotLossTotal\('Transplanting'\)/.test(src));
  checkTrue('the base uses it', /allocBase = totalPlantedRaw \+ getDtoneNurseryQty\(\) \+ adjustNetTotal\(\)\s*\n\s*\+ plotLossT3/.test(src));
  checkTrue('what is standing uses it too',
            /const mainStanding = totalMain \+ plotLossT3/.test(src));
  checkTrue('the balance check is against what is standing',
            /const fullyAccounted = mainStanding \+ mockCullingTab4/.test(src));
  checkTrue('so is the pending figure', /allocBase\s*\n\s*- mainStanding/.test(src));
  checkTrue('and the main-plot percentage, so it cannot read over 100%',
            /pctMain\s*=\s*allocBase > 0 \? \(mainStanding \/ allocBase\)/.test(src));
  check('nothing still balances against the pre-loss figure',
        /fullyAccounted = totalMain \+/.test(src), false);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
