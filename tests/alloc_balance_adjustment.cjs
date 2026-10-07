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
   standing, and what is left over.

   `plotLoss` is EVERY approved Transplanting adjustment; `trayLoss` is the
   subset of them that NAMES A TRAY. The two kinds are not the same
   correction -- one says the seedlings are still in the nursery and only the
   count of what left the tray was wrong, the other says they reached the
   plot and then went -- so only the second moves the base. */
function balance({ planted, dtone = 0, seedAdj = 0, plotLoss = 0, trayLoss = 0, totalMain, culled = 0 }) {
  const goneLoss      = plotLoss - trayLoss;   // the ones naming no tray
  const allocBase     = planted + dtone + seedAdj + goneLoss;
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

  console.log('\nA tray-named one moves what is standing and NOT the base');
  /* Batch 234: six more left the tray than the row said. The batch still has
     them -- what was wrong is how many reached a main plot -- so the base
     stays and Pending closes by exactly six. The old sum put the +6 on both
     sides and cancelled it, and the tab went on looking for six seedlings
     that were already standing in the plot. */
  const tray = balance({ planted: 15734, dtone: 190, totalMain: 14785, culled: 1133,
                         plotLoss: 6, trayLoss: 6 });
  check('the base is untouched', tray.allocBase, 15734 + 190);
  check('what is standing carries the six', tray.mainStanding, 14785 + 6);
  check('PENDING CLOSES', tray.rawPending, 0);
  const trayNone = balance({ planted: 15734, dtone: 190, totalMain: 14785, culled: 1133 });
  check('\u2026and without it, six are left unaccounted for', trayNone.rawPending, 6);

  /* The same figure naming NO tray is the other correction and must not
     close it: those six are gone, so both sides drop and Pending is what it
     was. */
  const trayless = balance({ planted: 15734, dtone: 190, totalMain: 14785, culled: 1133,
                             plotLoss: -6 });
  check('naming no tray takes it off the base as well', trayless.allocBase, 15734 + 190 - 6);
  check('\u2026and leaves Pending exactly where it was', trayless.rawPending, 6);

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
  checkTrue('\u2026and the tray-named subset of it is taken too',
            /const trayLossT3 = adjustTrayNamedTotal\('Transplanting'\)/.test(src));
  checkTrue('the base uses only the ones naming no tray',
            /const goneLossT3 = plotLossT3 - trayLossT3/.test(src)
         && /allocBase = totalPlantedRaw \+ getDtoneNurseryQty\(\) \+ adjustNetTotal\(\)\s*\n\s*\+ goneLossT3/.test(src));
  checkTrue('what is standing uses every one of them',
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
