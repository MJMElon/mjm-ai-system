/* ONE STAGE LOGGED TWICE IS NOT A PLOT DOING IT TWICE.

   The PALMS board read

       2 running: Membesar

   One job, reported as two, which is the office asking why a plot is doing
   the same work twice. It is not: the plot has two log entries OPEN on the
   same act_n -- a phone pushing its old entries back, or the same day saved
   from two devices.

   `openActivities` in shared_palms.js has deduped that since it was written,
   and its comment names this exact sentence. The two pages that draw the
   cell were each using it for half the answer:

     · the BOARD named the activities (ln.status, deduped) and counted the
       ROWS, so "2 running: Membesar";
     · PLOT LIFE did neither, so it read "2 running: Membesar + Membesar",
       which is the phrase shared_palms.js calls "not a plot doing anything
       twice".

   Two copies of one rule, one of them thinner, again. So: the count counts
   what the name names, both pages ask openActivities, and the duplicate is
   kept out of the COUNT without being kept out of SIGHT -- the row carries a
   mark saying the log has N entries open on that one stage.

   The rule is driven out of the shipped shared_palms.js; the wiring is
   asserted against both shipped pages, because what is being checked is
   which call each one makes.

   Run: node tests/one_stage_logged_twice_is_not_two.cjs
*/
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'shared', 'shared_palms.js'), 'utf8');
const BOARD = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'nursery_ops_palms_board.html'), 'utf8');
const LIFE = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'nursery_ops_plot_life.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

/* The real module, loaded as the pages load it. */
const win = {};
new Function('window', SRC + '\n')(win);
const P = win.MJMPalms;

const ROW = (plot, actN, start, end) => ({
  client_uid: plot + '-' + actN + '-' + start + (end || ''),
  plot_name: plot, act_n: actN, start_date: start, end_date: end || null,
  ideal_days: null, recorded_by: 'Ali', seq_no: 1
});
// 4 Membersih, 5 Meracun secara selingan, 10 Membesar — the built-in eleven.
const logsOf = (rows) => P.logsFromRows(rows);

console.log('\nTwo rows open on one stage are ONE stage');
{
  const logs = logsOf([ROW('N14', 10, '2026-03-05'), ROW('N14', 10, '2026-03-05')]);
  check('two rows are open', P.currentEntries(logs, 'N14').length, 2);
  check('…and they are one activity', P.openActivities(logs, 'N14').map(a => a.name), ['Membesar']);
  check('so the line names it once', P.plotLine(logs, 'N14').status, 'Membesar');
}
{
  // Different start days, same stage. Still one stage.
  const logs = logsOf([ROW('N15', 10, '2026-01-02'), ROW('N15', 10, '2026-04-09')]);
  check('whatever day each was keyed', P.openActivities(logs, 'N15').map(a => a.name), ['Membesar']);
}

console.log('\nTwo DIFFERENT stages really are two, and PALMS allows that');
{
  const logs = logsOf([ROW('N16', 4, '2026-10-01'), ROW('N16', 5, '2026-10-02')]);
  check('both are named', P.openActivities(logs, 'N16').map(a => a.name),
        ['Membersih', 'Meracun secara selingan']);
  check('…in stage order, which is what the board prints',
        P.plotLine(logs, 'N16').status, 'Membersih + Meracun secara selingan');
}
{
  // The mixed case: one stage doubled, one on its own. Two running, not three.
  const logs = logsOf([ROW('N17', 10, '2026-01-01'), ROW('N17', 10, '2026-02-01'),
                       ROW('N17', 4, '2026-03-01')]);
  check('three rows', P.currentEntries(logs, 'N17').length, 3);
  check('two stages', P.openActivities(logs, 'N17').map(a => a.n), [4, 10]);
}

console.log('\nA closed row is not running at all');
{
  const logs = logsOf([ROW('B1', 10, '2026-02-01'), ROW('B1', 4, '2025-01-01', '2025-01-02')]);
  check('only the open one counts', P.openActivities(logs, 'B1').map(a => a.name), ['Membesar']);
}

console.log('\nBoth pages ask openActivities, and neither counts rows for display');
[['the board', BOARD], ['plot life', LIFE]].forEach(([who, src]) => {
  checkTrue(who + ' reads the open ACTIVITIES', /MJMPalms\.openActivities\(/.test(src));
  /* `many` is what decides whether the cell gives up and shows a placeholder
     instead of the stage. Taken off the rows, a plot on ONE stage with a
     duplicate loses its dropdown selection and its colour for no reason. */
  checkTrue(who + ' decides "more than one" on activities, not rows',
            /const many = openActs\.length > 1;/.test(src));
  checkTrue(who + ' takes the current stage from them too',
            /openActs\.length === 1 \? openActs\[0\]\.n : null/.test(src));
  checkTrue(who + ' counts activities in the label',
            /openActs\.length \+ ' running: '/.test(src));
  /* The old shapes. Either one back is the bug back. */
  check(who + ' no longer counts rows in the label',
        /(cur|open)\.length \+ ' running: '/.test(src), false);
  check(who + ' no longer builds the names off the rows',
        /actByN\(e\.actN\); return a \? a\.name : '\?'/.test(src), false);
});

console.log('\nThe duplicate is out of the count, not out of sight');
[['the board', BOARD], ['plot life', LIFE]].forEach(([who, src]) => {
  checkTrue(who + ' works out how many rows are extra',
            /const dupes = (cur|open)\.length - openActs\.length;/.test(src));
  checkTrue(who + ' marks the row when there are', /class="st-dup"/.test(src));
  checkTrue(who + ' styles that mark', /\.st-dup \{/.test(src));
  /* The words matter more than the mark: "2 running" was read as two jobs,
     so what replaces it has to say it is one stage logged twice. */
  checkTrue(who + ' says what it means',
            /one stage logged ' \+ (cur|open)\.length \+ ' times/.test(src));
  checkTrue(who + ' and that picking a stage clears it',
            /Picking a stage closes every one of them/.test(src));
});

console.log('\nThe confirm panel promises what the save does');
/* Every open ROW is closed, so the count carries the duplicates — and the
   NAME does not, because "Membesar + Membesar" describes nothing. */
checkTrue('the board counts the rows it is about to close',
          /'All ' \+ open\.length \+ ' open entries are closed today'/.test(BOARD));
checkTrue('…and names the stages once', /MJMPalms\.openActivities\(LOGS, unit\)\.map\(\(a\) => a\.name\)/.test(BOARD));
checkTrue('plot life says so too', /all \$\{open\.length\} open entries/.test(LIFE));
checkTrue('…and names the stages once', /MJMPalms\.openActivities\(PALMS_LOGS, plotName\)\.map\(a => a\.name\)/.test(LIFE));

console.log('\nThe detail views still show every row, which is where a duplicate is seen');
checkTrue('the motion study lists the open entries themselves',
          /const open = PLOT \? MJMPalms\.currentEntries\(LOGS, PLOT\) : \[\];/
            .test(fs.readFileSync(path.join(ROOT, 'nursery_ops', 'nursery_ops_palms_motion.html'), 'utf8')));
checkTrue('and the plot history does', /const open = MJMPalms\.currentEntries\(PALMS_LOGS, plotName\);/.test(LIFE));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
