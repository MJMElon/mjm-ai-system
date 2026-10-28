/* One stage logged in two parts back to back is ONE row.

   And the other shape of it, N14: Pengambilan opened on 7 Oct and opened
   AGAIN on 20 Oct with nothing closed, drawn as two running rows.

   The PALMS board showed a plot as
       13  Membesar  16 Oct 2026  running      12d so far  270d  258d left
       12  Membesar  01 Sep 2026  16 Oct 2026  45d         270d  225d ahead
   which is one stretch of Membesar keyed twice. The office: "这种情况请
   combine". Shown as two it was also WRONG: the open half was timed from 16
   Oct, so the plot read 45 days more time left than it has.

   This drives the shipped shared_palms.js (mergeSpells, computeStatus) and
   checks the board's round table reads through it.

   Run: node tests/one_stage_in_two_parts_is_one_row.cjs                    */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const ROOT = path.join(__dirname, '..');
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'shared', 'shared_palms.js'), 'utf8'), { window: win });
const P = win.MJMPalms;
const MEMBESAR = 13;   // any stage number does; the name comes off the list

const today = P.todayStr();
const ago = (n) => P.addDays(today, -n);
const row = (uid, n, s, e, by, no) => ({ client_uid: uid, plot_name: 'N2', act_n: n,
  start_date: s, end_date: e, ideal_days: 270, recorded_by: by, seq_no: no });

console.log('— the office\'s case: closed on a day, opened again the same day');
const logs = P.logsFromRows([
  row('a', MEMBESAR, ago(57), ago(12), 'Handan', 1),
  row('b', MEMBESAR, ago(12), null, 'Handan', 2)
]);
const merged = P.mergeSpells(logs.N2);
check('one row', merged.length, 1);
check('…from the first start, still running',
  [merged[0].start, merged[0].end, merged[0].parts], [ago(57), null, 2]);
check('…one name, not the same name twice', merged[0].by, 'Handan');
const st = P.computeStatus(logs, 'N2');
check('the board times it from the FIRST start: 213 days left, not 258',
  [st.start, st.left], [ago(57), 213]);

console.log('— a day between the two is still one spell');
const l2 = P.logsFromRows([
  row('a', MEMBESAR, ago(30), ago(10), 'A', 1),
  row('b', MEMBESAR, ago(9), ago(2), 'B', 2)
]);
const m2 = P.mergeSpells(l2.N2);
check('one row, both hands named', [m2.length, m2[0].start, m2[0].end, m2[0].by], [1, ago(30), ago(2), 'A, B']);

console.log('— a real gap is two spells, and is left as two');
const l3 = P.logsFromRows([
  row('a', MEMBESAR, ago(60), ago(40), 'A', 1),
  row('b', MEMBESAR, ago(20), null, 'A', 2)
]);
check('two rows', P.mergeSpells(l3.N2).length, 2);
check('…and the running one is timed from its own start', P.computeStatus(l3, 'N2').start, ago(20));

console.log('— a different stage in between does not stop it, and is not swallowed');
const l4 = P.logsFromRows([
  row('a', MEMBESAR, ago(50), ago(20), 'A', 1),
  row('w', 5, ago(25), ago(22), 'A', 2),
  row('b', MEMBESAR, ago(20), null, 'A', 3)
]);
const m4 = P.mergeSpells(l4.N2);
check('Membesar is one row and the other stage keeps its own',
  m4.map((e) => [e.actN, e.start, e.end]), [[MEMBESAR, ago(50), null], [5, ago(25), ago(22)]]);

console.log('— two parts BOTH open is one spell too (N14, Pengambilan x2 open)');
const l5 = P.logsFromRows([
  row('a', 10, ago(21), null, 'Amri', 1),
  row('b', 10, ago(8), null, 'Azhar', 2)
]);
const m5 = P.mergeSpells(l5.N2);
check('one row, from the first start, running, both hands',
  [m5.length, m5[0].start, m5[0].end, m5[0].by, m5[0].parts], [1, ago(21), null, 'Amri, Azhar', 2]);
check('…and the board times it from that first start', P.computeStatus(l5, 'N2').start, ago(21));

console.log('— an open part with a closed one started inside it is one spell, still running');
const l6 = P.logsFromRows([
  row('a', 10, ago(21), null, 'A', 1),
  row('b', 10, ago(15), ago(12), 'B', 2)
]);
check('one row, running', P.mergeSpells(l6.N2).map((e) => [e.start, e.end]), [[ago(21), null]]);

console.log('— the log itself is not changed');
check('the rows are still two', logs.N2.length, 2);
check('…with their own dates', logs.N2.map((e) => [e.start, e.end]), [[ago(57), ago(12)], [ago(12), null]]);

console.log('— the board reads its round through it');
const BOARD = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'nursery_ops_palms_board.html'), 'utf8');
check('drawPvRound folds the spells', /MJMPalms\.mergeSpells\(cur \? cur\.entries/.test(BOARD), true);
check('…and says when a row is two entries combined', /entries combined/.test(BOARD), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
