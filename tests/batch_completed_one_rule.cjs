/* IS THIS BATCH FINISHED? ONE RULE, AND BOTH LISTS ASK IT.

   The Batch Record list and Life of Seedlings used to answer this
   differently. The Batch Record asked whether every plot the batch reached
   had been 3rd culled, proofed against its drone map and signed off; Life
   of Seedlings asked whether its own arithmetic came to nought. A batch
   could sit in Completed on one screen and Active on the other.

   The office asked for them to agree, so the rule moved into
   shared/shared_batch_completed.js and both pages read it. This file holds
   the rule to its cases AND holds both pages to the file — a shared rule
   that one page has quietly stopped calling is two rules again, with
   nothing saying so. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const M   = require(path.join(root, 'shared', 'shared_batch_completed.js'));
const rec = fs.readFileSync(path.join(root, 'operation', 'operation_batch_record.html'), 'utf8');
const los = fs.readFileSync(path.join(root, 'operation', 'operation_reports.html'), 'utf8');

let pass = 0, fail = 0;
const is = (what, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log('  ok   ' + what + ' → ' + a); }
  else { fail++; console.log('  FAIL ' + what + '\n         got  ' + a + '\n         want ' + b); }
};

const TX  = (batch, plot, type) => ({ batch_name: batch, plot_name: plot,
                                      transaction_type: type || 'Transplanted' });
const C3  = (batch, plot, culled, map, extra) => ({ batch_name: batch, plot_name: plot,
  quantity_change: culled,
  remark: '3rd Culling. Remaining Balance: ' + (culled - (map || 0)) + ', Culled: ' + culled
        + ', DestType: main' + (map == null ? '' : ' MapQty: ' + map) + (extra || '') });
const RV  = (batch, key) => ({ batch_name: batch, plot_name: key });
const SV  = (batch, stage) => ({ batch_name: batch, stage });

const done = (input) => [...M.compute(input).completed].sort();

console.log('\n── Counted, proofed and signed is finished ──');
is('one plot, culled to its drone map, signed row by row',
  done({ transplants: [TX('A', 'U1')],
         cull3: [C3('A', 'U1', 131, 131)],
         rowVerifications: [RV('A', 'cull_3::U1|main')] }), ['A']);
is('the whole stage signed counts just the same',
  done({ transplants: [TX('A', 'U1')],
         cull3: [C3('A', 'U1', 131, 131)],
         stageVerifications: [SV('A', 'cull_3')] }), ['A']);
is('and the dest type on the sign-off key is not matched',
  done({ transplants: [TX('A', 'U1')],
         cull3: [C3('A', 'U1', 131, 131)],
         rowVerifications: [RV('A', 'cull_3::U1|doubletone')] }), ['A']);

console.log('\n── Every plot, or none of it ──');
is('one of two plots done holds the batch',
  done({ transplants: [TX('B', 'U1'), TX('B', 'U2')],
         cull3: [C3('B', 'U1', 10, 10)],
         stageVerifications: [SV('B', 'cull_3')] }), []);
is('both done finishes it',
  done({ transplants: [TX('B', 'U1'), TX('B', 'U2')],
         cull3: [C3('B', 'U1', 10, 10), C3('B', 'U2', 20, 20)],
         stageVerifications: [SV('B', 'cull_3')] }), ['B']);

console.log('\n── Nothing left standing is culled MINUS the drone map ──');
is('500 to cull and no map is 500 short',
  done({ transplants: [TX('C', 'U1')], cull3: [C3('C', 'U1', 500, null)],
         stageVerifications: [SV('C', 'cull_3')] }), []);
is('a map that disagrees with the cull holds it too',
  done({ transplants: [TX('C', 'U1')], cull3: [C3('C', 'U1', 500, 499)],
         stageVerifications: [SV('C', 'cull_3')] }), []);

console.log('\n── A nought has to be a REAL nought ──');
/* A plot all sold out has nothing to cull and no map to attach: 0 − 0 = 0.
   A plot nobody has touched comes to zero the same way, and treating them
   alike swept batches into Completed that had barely started. So the row
   must SAY it is nought. */
is('a sold-out plot, whose record says Remaining Balance: 0, is done',
  done({ transplants: [TX('D', 'U1')],
         cull3: [{ batch_name: 'D', plot_name: 'U1', quantity_change: 0,
                   remark: '3rd Culling. Remaining Balance: 0, Culled: 0, DestType: main' }],
         stageVerifications: [SV('D', 'cull_3')] }), ['D']);
is('a row that says nothing at all is not',
  done({ transplants: [TX('D', 'U1')],
         cull3: [{ batch_name: 'D', plot_name: 'U1', quantity_change: 0, remark: '' }],
         stageVerifications: [SV('D', 'cull_3')] }), []);

console.log('\n── Counted but not checked is not finished ──');
is('no signature at all holds the batch',
  done({ transplants: [TX('E', 'U1')], cull3: [C3('E', 'U1', 10, 10)] }), []);
is('a signature on the OTHER plot does not cover this one',
  done({ transplants: [TX('E', 'U1'), TX('E', 'U2')],
         cull3: [C3('E', 'U1', 10, 10), C3('E', 'U2', 20, 20)],
         rowVerifications: [RV('E', 'cull_3::U1|main')] }), []);

console.log('\n── Premium Care is a holding tray, not a plot to cull ──');
/* The 3rd Culling report does not list premium, so a premium-ONLY plot
   could never receive a record and would block the batch for ever. */
is('a premium-only transplant does not hold the batch',
  done({ transplants: [TX('F', 'U1'), TX('F', 'PREMIUM CARE', 'Transplanted_Premium')],
         cull3: [C3('F', 'U1', 10, 10)],
         stageVerifications: [SV('F', 'cull_3')] }), ['F']);
is('but a d-tone one is a plot like any other',
  done({ transplants: [TX('F', 'U1'), TX('F', 'U2', 'Transplanted_DoubleTone')],
         cull3: [C3('F', 'U1', 10, 10)],
         stageVerifications: [SV('F', 'cull_3')] }), []);

console.log('\n── A transfer ADDS a plot, it does not veto the batch ──');
/* Any Cull3_Transfer at all used to keep a batch Active for ever. A "-R"
   plot is a row on the P-R Culling tab now. Batch 225 is why. */
is('the plot transferred into must be culled too',
  done({ transplants: [TX('G', 'U1')], transfers: [{ batch_name: 'G', plot_name: 'B4-R' }],
         cull3: [C3('G', 'U1', 10, 10)],
         stageVerifications: [SV('G', 'cull_3')] }), []);
is('and once it is, the transfer is no obstacle',
  done({ transplants: [TX('G', 'U1')], transfers: [{ batch_name: 'G', plot_name: 'B4-R' }],
         cull3: [C3('G', 'U1', 10, 10), C3('G', 'B4-R', 5, 5)],
         stageVerifications: [SV('G', 'cull_3')] }), ['G']);

console.log('\n── An open rejection holds it, and says so ──');
const held = M.compute({ transplants: [TX('H', 'U1')], cull3: [C3('H', 'U1', 10, 10)],
  stageVerifications: [SV('H', 'cull_3')],
  rejections: [{ batch_name: 'H', plot_name: 'cull_3::U1' }] });
is('not completed',          [...held.completed], []);
is('but named as held, not as still counting',
  held.heldByIssue['H'], 'Amendment needed — a report was rejected');

console.log('\n── A batch that reached no plot is not "finished" ──');
is('nothing transplanted, nothing to be done about it',
  done({ transplants: [], cull3: [], stageVerifications: [SV('I', 'cull_3')] }), []);

console.log('\n── A legacy row with no DestType covers one slot for its plot ──');
is('an old row still finishes its plot',
  done({ transplants: [TX('J', 'U1')],
         cull3: [{ batch_name: 'J', plot_name: 'U1', quantity_change: 10,
                   remark: '3rd Culling. Culled: 10 MapQty: 10' }],
         stageVerifications: [SV('J', 'cull_3')] }), ['J']);

console.log('\n── The plot is matched on case and spacing ──');
is('" u1 " and "U1" are the same plot',
  done({ transplants: [TX('K', ' u1 ')], cull3: [C3('K', 'U1', 10, 10)],
         rowVerifications: [RV('K', 'cull_3:: U1 |main')] }), ['K']);

/* ── AND BOTH PAGES ACTUALLY ASK IT ──────────────────────────────────────
   A shared rule one page has stopped calling is two rules again. */
console.log('\n── Both lists read the one file ──');
is('the Batch Record list loads it',
  /<script src="\.\.\/shared\/shared_batch_completed\.js"><\/script>/.test(rec), true);
is('and calls it',  /MJMBatchCompleted\.compute\(\{/.test(rec), true);
is('Life of Seedlings loads it',
  /<script src="\.\.\/shared\/shared_batch_completed\.js"><\/script>/.test(los), true);
is('and calls it',  /MJMBatchCompleted\.compute\(\{/.test(los), true);
is('neither keeps a second copy of the drone-map test',
  /culled\s*-\s*mapQty\s*!==\s*0/.test(rec) || /culled\s*-\s*mapQty\s*!==\s*0/.test(los), false);
is('nor of the real-nought test',
  /Remaining Balance:\\s\*0/.test(rec) || /Remaining Balance:\\s\*0/.test(los), false);
is('and Life of Seedlings no longer derives it from its own arithmetic',
  /r\.completed\s*=\s*r\.anyOut/.test(los), false);

/* Life of Seedlings cuts the LINES at its As At date and never the
   SIGNATURES — the same split every other As At rule there follows. */
console.log('\n── Life of Seedlings asks it as at its own date ──');
is('the transplants, transfers and cullings are cut',
  /transplants:\s+_losOfType\(\[[^\]]*\], true\)/.test(los)
  && /transfers:\s+_losOfType\(\['Cull3_Transfer'\], true\)/.test(los)
  && /cull3:\s+_losOfType\(\['3rd_Culling'\], true\)/.test(los), true);
is('and the rejections are not',
  /rejections:\s+_losOfType\(\['Review_Rejection'\], false\)/.test(los), true);
/* The sign-offs come out of their OWN read and never out of the ledger
   query: that one asks for the transaction types this report draws figures
   from, and Row_Verification is not among them. Taking them from it gives
   an empty list, so no batch could be completed by the row-by-row route at
   all — which is what the two-page harness caught. */
is('and the row sign-offs come from the read that exists for them',
  /rowVerifications:\s+\(rowVerRes && rowVerRes\.data\) \|\| \[\]/.test(los), true);
is('never out of the ledger query, which does not ask for them',
  /rowVerifications:\s+_losOfType/.test(los), false);
is('it reads the rejection rows at all',
  /'Review_Rejection'\]\)/.test(los), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
