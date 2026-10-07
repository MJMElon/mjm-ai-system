/* EVERY STOCK_CALIBRATION COUNTS. NOTHING GATES IT.

   Two gates have stood in front of a stock adjustment and both are gone.
   This exists so neither comes back by accident, because each one was a
   plausible-looking line of code that silently removed a figure from the
   reports:

     THE APPROVAL. A figure did not move until somebody pressed Approve. The
     person keying the correction is the person who went and counted, so
     holding their answer behind a second signature only kept a report that
     was known to be wrong looking right until somebody got round to it.

     THE "Report:" LABEL. 206 of this ledger's 218 adjustments carry no
     report at all. They look machine-written -- all negative, all dated
     within two days of each other, many in exact triplicate -- and the
     obvious reading was that they were not adjustments anybody raised. They
     ARE: the office confirmed them as real plot corrections that have to
     count. A Stock_Calibration row is an adjustment because of what it is,
     not because of how its remark happens to be worded.

   What the label still decides is WHERE a figure lands on the batch report's
   own tabs -- ADJUST_APPLIES_TO -- which is a different question. A row
   naming no report lands on no tab there and still moves the plot's live
   count, the Movement Report and Life of Seedlings, because a seedling that
   is gone is gone whichever report noticed.

   Checked against the source of all three readers: a live render of each is
   three harnesses for one rule, and the rule is one line in each.

   Run: node tests/every_adjustment_counts.cjs
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

/* The Stock_Calibration branch of each reader, on its own, so a `return`
   belonging to some other transaction type cannot be mistaken for a gate on
   this one. */
function branch(src, startMarker, endMarker, last) {
  const i = last ? src.lastIndexOf(startMarker) : src.indexOf(startMarker);
  if (i < 0) return '';
  const j = src.indexOf(endMarker, i);
  return src.slice(i, j < 0 ? i + 2000 : j);
}
/* Two branches in this file open with the same line — Life of Seedlings
   first, the Movement Report second — so they are told apart by position,
   not by a comment that a later edit could reword. */
const CAL_BRANCH = "if (t === 'Stock_Calibration') {";

console.log('\nNobody is waiting for a signature');
/* The marker is still STRIPPED off old rows -- it is not part of the reason
   somebody wrote -- but no reader may TEST it. */
const approvalGates = [
  ['shared_plot_movement.js',
   /Stock_Calibration'\s*&&\s*!APPROVED/.test(movement)],
  ['Life of Seedlings',
   /const ok = _RE_LOS_APPROVED\.test/.test(reports) || /if \(ok\) r\.calibration/.test(reports)],
  ['the Movement Report',
   /if \(!approved \|\| !passMain/.test(reports)],
  ['the Transplanting Report',
   /const approved = [^\n]*\n\s*if \(!approved\) return;/.test(reports)]
];
check('no reader tests the approval marker',
      approvalGates.filter(([, bad]) => bad).map(([who]) => who), []);
checkTrue('…but it is still stripped, so it stays out of the Reason column',
          /replace\(\/\\\[APPROVED by \[\^\\\]\]\+ on \[\^\\\]\]\+\\\]\//.test(reports));

console.log('\nAnd nobody demands a report label either');
const labelGates = [
  ['shared_plot_movement.js',
   /Stock_Calibration'\s*&&\s*!IS_ADJUSTMENT/.test(movement)],
  ['Life of Seedlings',
   /if \(!rep\) return;|!rep\s*\)\s*return/.test(branch(reports, CAL_BRANCH, 'calibrationPre'))],
  ['the Movement Report',
   /Report:/.test(branch(reports, CAL_BRANCH, "push('main'", true)
                  .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'))]
];
check('all three take a row whose remark names no report',
      labelGates.filter(([, bad]) => bad).map(([who]) => who), []);

console.log('\nThe label still decides WHERE it lands on the batch tabs');
/* Which is not the same question. ADJUST_APPLIES_TO has no entry for '', so
   a row naming no report lands on no tab -- and that is correct, because
   there is no tab it could be about. */
checkTrue('the batch tabs read the report to place a figure',
          /\(ADJUST_APPLIES_TO\[r\.report\.toLowerCase\(\)\] \|\| \[\]\)/.test(detail));
checkTrue('…and the per-report strips only take rows whose report matches',
          /rows\.filter\(r => r\.report\.toLowerCase\(\) === want\)/.test(detail));
checkTrue('the history table still lists every one of them',
          /\.eq\('transaction_type', 'Stock_Calibration'\)/.test(detail));

console.log('\nThe shapes that actually exist in the ledger');
/* _parseCalibration is what the batch page reads a row with. None of these
   may throw, and the one with no report has to come back with an empty
   report rather than a guess. */
const parseSrc = branch(detail, 'function _parseCalibration(r) {', '\n        /* The net of APPROVED');
checkTrue('it is there to be read', parseSrc.length > 200);
checkTrue('a missing Report: leaves the field empty, it is never guessed',
          /report: rep  \? rep\[1\]\.trim\(\)  : '',/.test(parseSrc));
checkTrue('the quantity is the row\'s own signed value',
          /qty: Number\(r\.quantity_change\) \|\| 0,/.test(parseSrc));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
