/* A STOCK_CALIBRATION ROW THAT NAMES NO REPORT IS NOT AN ADJUSTMENT.

   Every row the Adjustments tab has ever written starts
   "Report: X. Plot: Y." -- saveCalibration builds it that way and
   _parseCalibration reads it back. A Stock_Calibration row carrying no
   Report: was not raised there.

   This database has 206 of them against 12 real ones: all negative, all
   dated within two days of each other, many in exact triplicate. Something
   wrote them in bulk. They sat inert for as long as a figure needed an
   approval, because not one of them has one.

   The day the approval step was dropped they would have taken 196,777
   seedlings off the piece-rate quantity, the Movement Report and Life of
   Seedlings in one go -- and said nothing, because the Adjustments tab reads
   the REPORT to decide where a figure lands, so the one screen somebody
   would have been looking at went on showing no adjustment at all.

   So the three readers that do not look at the report have to test the
   label. Checked here against the source of all three, because a live render
   of each is three harnesses for one rule and the rule is one line in each.

   Run: node tests/adjustment_names_its_report.cjs
   No server needed.                                                        */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

const root = path.join(__dirname, '..');
const movement = fs.readFileSync(path.join(root, 'shared', 'shared_plot_movement.js'), 'utf8');
const reports  = fs.readFileSync(path.join(root, 'operation', 'operation_reports.html'), 'utf8');
const detail   = fs.readFileSync(path.join(root, 'operation', 'operation_batch_detail.html'), 'utf8');

console.log('\nThe three readers that do not look at the report all test the label');

/* The piece-rate quantity. This is the one that is money: a plot's live count
   feeds the Work Maintenance list, the Worker Record capacity totals and the
   salary claim. */
checkTrue('shared_plot_movement.js knows what an adjustment looks like',
          /const IS_ADJUSTMENT = \/Report:/.test(movement));
checkTrue('…and turns away a Stock_Calibration without one',
          /t === 'Stock_Calibration' && !IS_ADJUSTMENT\.test\(l\.remark \|\| ''\)\) return/.test(movement));

/* Life of Seedlings: the calibration column, and the Pre-Nursery split of it. */
checkTrue('Life of Seedlings takes the report out of the remark first',
          /const rep  = body\.match\(_RE_LOS_CAL_REPORT\);/.test(reports));
checkTrue('…and leaves if there is none, before adding anything up',
          /if \(!rep\) return;[\s\S]{0,120}r\.calibration \+= signed;/.test(reports));

/* The Movement Report's Stock Adjustment column. */
checkTrue('the Movement Report tests the label too',
          /if \(!\/Report:\\s\*\\S\/\.test\(l\.remark \|\| ''\)\) return;/.test(reports));

console.log('\nAnd the gate is the LABEL, not the approval');
/* The approval step is gone on purpose. A test that passed because somebody
   quietly put it back would be the wrong kind of green. */
const approvalGates = [
  ['shared_plot_movement.js', /Stock_Calibration'\s*&&\s*!APPROVED/.test(movement)],
  ['the reports page',        /!approved \|\| !pass(Main|Loc)/.test(reports)]
];
check('no reader is waiting for a signature again',
      approvalGates.filter(([, bad]) => bad).map(([who]) => who), []);

console.log('\nThe Adjustments tab is where a row with no report shows up');
/* It never counted them -- it reads the report to decide where a figure
   lands, and ADJUST_APPLIES_TO has no entry for '' -- but the history table
   has to go on LISTING them, or the 206 rows cannot be found and deleted. */
checkTrue('the history table reads every Stock_Calibration on the batch',
          /\.eq\('transaction_type', 'Stock_Calibration'\)/.test(detail));
checkTrue('…and the per-report strips only take rows whose report matches',
          /rows\.filter\(r => r\.report\.toLowerCase\(\) === want\)/.test(detail));
checkTrue('…so a row naming no report lands on no tab',
          /\(ADJUST_APPLIES_TO\[r\.report\.toLowerCase\(\)\] \|\| \[\]\)/.test(detail));

console.log('\nWhat the rule actually does to a remark');
/* The one-line version of each reader, run on the shapes that matter, so
   this is not only a grep over comments. */
const isAdjustment = (remark) => /Report:\s*\S/.test(remark || '');
check('a row the Adjustments tab wrote', isAdjustment('Report: Transplanting. Plot: B14. 53 short'), true);
check('…one with a tray split',          isAdjustment('Report: Transplanting. Plot: B14. Tray: P4. short'), true);
check('…one approved long ago',          isAdjustment('Report: 1st Culling. Plot: P4. x [APPROVED by a on b]'), true);
check('a bulk row with no report',       isAdjustment('Plot: B8.'), false);
check('…an empty remark',                isAdjustment(''), false);
check('…a null one',                     isAdjustment(null), false);
check('…and "Report:" with nothing after it', isAdjustment('Report:   '), false);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
