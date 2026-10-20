const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'operation', 'operation_reports.html'),'utf8');
const grab = (name) => {
  const i = src.indexOf('function ' + name + '(');
  const j = src.indexOf('\n}', i);
  return src.slice(i, j + 2);
};
const _losAsAt = new Function('return ' + grab('_losAsAt'))();
console.log('AS AT — what the two pickers actually produce');
console.log('─'.repeat(58));
for (const [y, m, how] of [
  ['',     '',  'All years · All months'],
  ['',     '8', 'All years · September'],
  ['',     '0', 'All years · January'],
  ['2026', '',  '2026 · All months'],
  ['2026', '8', '2026 · September'],
]) console.log('  ' + how.padEnd(26) + '→ ' + (_losAsAt(y, m) || '(no cut-off at all)'));

/* WHETHER A BATCH IS FINISHED USED TO BE ASKED HERE, off this report's own
   arithmetic: something has left the batch and nothing of it is standing
   anywhere. It is the Batch Record's rule now — every plot the batch used
   3rd culled, proofed against its drone map and signed off — because the
   two lists answering differently is how a batch sits in Completed on one
   screen and Active on the other.

   So the cases below are the same batches, asked the new way, and what
   they show is that the answer MOVED and in which direction. A batch sold
   entirely out of the tray reached no plot, so the Batch Record has nothing
   to call finished; this report used to say Completed. That difference is
   the point of the change, not a casualty of it — the Batch Record is the
   list the nursery works from.

   shared/shared_batch_completed.js is the rule and
   tests/batch_completed_one_rule.cjs holds it to its cases. */
const M = require(require('path').join(__dirname, '..', 'shared', 'shared_batch_completed.js'));
const TX = (plot, type) => ({ batch_name: 'x', plot_name: plot,
                              transaction_type: type || 'Transplanted' });
const C3 = (plot, qty) => ({ batch_name: 'x', plot_name: plot, quantity_change: qty,
  remark: '3rd Culling. Remaining Balance: 0, Culled: ' + qty
        + ', DestType: main MapQty: ' + qty });
const SIGNED = [{ batch_name: 'x', stage: 'cull_3' }];
const fin = (input) => M.compute(Object.assign({ stageVerifications: SIGNED }, input))
                        .completed.has('x');

console.log('\nSTATUS — is the batch finished?');
console.log('─'.repeat(58));
const cases = [
  ['received, not planted yet',      {},                                             'active'],
  ['planted, nothing has left',      { transplants: [] },                            'active'],
  ['transplanted, not yet culled',   { transplants: [TX('U1')] },                    'active'],
  ['transplanted and culled to the map',
                                     { transplants: [TX('U1')], cull3: [C3('U1', 900)] }, 'completed'],
  ['sold out of the plot — nothing to cull, and the record says so',
                                     { transplants: [TX('U1')], cull3: [C3('U1', 0)] },   'completed'],
  ['two plots, one culled',          { transplants: [TX('U1'), TX('U2')],
                                       cull3: [C3('U1', 900)] },                     'active'],
  ['sold ENTIRELY out of the tray — it reached no plot',
                                     {},                                             'active'],
];
let bad = 0;
for (const [name, input, want] of cases) {
  const got = fin(input) ? 'completed' : 'active';
  if (got !== want) bad++;
  console.log('  ' + name.padEnd(62) + got.padEnd(11) + '(should be ' + want + ')' +
              (got === want ? '' : '   ✗'));
}
console.log('\n' + bad + ' wrong');
process.exit(bad ? 1 : 0);
