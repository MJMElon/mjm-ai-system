/* A phone record whose plot, job and round match a CHECKED row is the same
   work, and the approved one wins: it is not waiting for anybody and it is
   not unpaired. Nothing is rejected, verified or written.

   The rule lives in nursery_ops/plot_maintenance_script.js as
   _checkedRoundKeys / _coveredByChecked. This lifts those two functions out
   of the shipped file (with _recInMonth, which they call) and drives them
   against the shared pairing rule, so the test asks the same question the
   page asks. Run: node tests/covered_round_is_the_same_work.cjs */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'plot_maintenance_script.js'), 'utf8');

/* Lift a top-level function by name, matching braces. */
function lift(name) {
  const start = SRC.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in plot_maintenance_script.js`);
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) break; }
  }
  return SRC.slice(start, i + 1);
}

require(path.join(ROOT, 'shared', 'shared_maint_field.js'));
const MJMMaintField = globalThis.MJMMaintField;

const JENIS_BY_WORK = (f) => f.jenis || MJMMaintField.JENIS[f.work_type] || '';
const _rejJenis = JENIS_BY_WORK;

const code = [lift('_recInMonth'), lift('_checkedRoundKeys'), lift('_coveredByChecked'),
  lift('_coveredByVerifiedMorning')].join('\n');

/* The schedule the way the office holds it: one element per row, `_src`
   naming its slot. Only the fields the rule reads. */
const SCHEDULE = [
  // U1 Interrow Round 1 (slot ir|1 = week 2), checked on 13 Nov
  { id: 1, _month: 'Nov 2026', plot: 'U1', jenis: 'Meracun rumput secara selingan', _src: 'ir|1|0|U1', checked: '1', racun: 'Round 1: Acosta 120mL + Activator 15mL' },
  // U1 P&D Round 2 (slot pd|W2 = week 2), checked on 14 Nov
  { id: 2, _month: 'Nov 2026', plot: 'U1', jenis: 'Penyemburan racun kulat dan serangga', _src: 'pd|W2|D|U1', checked: '1', racun: 'Round 2: Antracol 50gm + Bond 15mL' },
  // U3 Manuring Round 1 (slot mn|0 = week 1), checked, dated 2 Nov
  { id: 3, _month: 'Nov 2026', plot: 'U3', jenis: 'Membaja', _src: 'mn|0|0|U3', checked: '1', racun: 'Round 1: Yaramila 20gm' },
  // U9 Manuring Round 1 — exists but NOT checked
  { id: 4, _month: 'Nov 2026', plot: 'U9', jenis: 'Membaja', _src: 'mn|0|0|U9', checked: null, racun: 'Round 1: Yaramila 20gm' },
  // U7 Weeding Round 1 checked in OCTOBER only
  { id: 5, _month: 'Oct 2026', plot: 'U7', jenis: 'Merumput', _src: 'wd|R1|U7', checked: '1', racun: 'Round 1: Merumput dalam polibeg' },
];

/* The lifted functions read `records` as a free name, exactly as the page
   does, so they are evaluated with this schedule as their `records`. */
const api = new Function(
  'MJMMaintField', '_rejJenis', 'records',
  `${code}\nreturn { _checkedRoundKeys, _coveredByChecked, _coveredByVerifiedMorning };`
)(MJMMaintField, _rejJenis, SCHEDULE);
const keys = api._checkedRoundKeys('Nov 2026');

let n = 0;
const ok = (label, got, want) => {
  n++;
  assert.strictEqual(got, want, label);
  console.log(`  ok  ${label}`);
};

console.log('A phone record of an approved round is the same work');

/* The four duplicates the office was looking at — phone records with no
   batch, no quantity and no week, sent on 18 Nov. */
ok('Wina U1 Interrow 13 Nov (no week_no) matches checked Round 1',
   api._coveredByChecked({ id: 3337, plot_name: 'U1', jenis: 'Meracun rumput secara selingan', work_date: '2026-11-13', week_no: null, batch_name: null, qty: null }, keys), true);
ok('Wina U1 P&D 14 Nov matches checked Round 2',
   api._coveredByChecked({ id: 3339, plot_name: 'U1', jenis: 'Penyemburan racun kulat dan serangga', work_date: '2026-11-14', week_no: null, batch_name: null, qty: null }, keys), true);
ok('Repi U3 Manuring 7 Nov matches checked Round 1 (week 1), though dated 2 Nov on the office row',
   api._coveredByChecked({ id: 3305, plot_name: 'U3', jenis: 'Membaja', work_date: '2026-11-07', week_no: null, batch_name: null, qty: null }, keys), true);
ok('Haerul U3 Manuring 7 Nov matches the same round',
   api._coveredByChecked({ id: 3356, plot_name: 'U3', jenis: 'Membaja', work_date: '2026-11-07', week_no: null, batch_name: null, qty: null }, keys), true);
ok('a record WITH a batch on an approved round is still the same work (the rule is round-level)',
   api._coveredByChecked({ id: 9001, plot_name: 'U1', jenis: 'Meracun rumput secara selingan', work_date: '2026-11-13', week_no: 2, batch_name: '250, 252', qty: 4648 }, keys), true);
ok('plot name normalised like the pairing (lower case, dash dropped)',
   api._coveredByChecked({ id: 9002, plot_name: 'u1', jenis: 'Meracun rumput secara selingan', work_date: '2026-11-13', week_no: 2 }, keys), true);

console.log('\nWhat is NOT the same work stays where it is');

ok('same plot and job but a different round (week 4) is not covered',
   api._coveredByChecked({ id: 9010, plot_name: 'U1', jenis: 'Meracun rumput secara selingan', work_date: '2026-11-27', week_no: 4 }, keys), false);
ok('same round on a plot nobody checked is not covered',
   api._coveredByChecked({ id: 9011, plot_name: 'U9', jenis: 'Membaja', work_date: '2026-11-06', week_no: 1 }, keys), false);
ok('an UNCHECKED schedule row covers nothing (U9 is not in the keys)',
   keys.has(MJMMaintField.fieldKey('Membaja', 'U9', 1)), false);
ok('a round checked in October does not cover a November record',
   api._coveredByChecked({ id: 9012, plot_name: 'U7', jenis: 'Merumput', work_date: '2026-11-03', week_no: 1 }, keys), false);
ok('a different job on the same plot and round is not covered',
   api._coveredByChecked({ id: 9013, plot_name: 'U3', jenis: 'Merumput', work_date: '2026-11-07', week_no: 1 }, keys), false);
ok('a record with no job cannot be matched, so it is not covered',
   api._coveredByChecked({ id: 9014, plot_name: 'U1', jenis: '', work_type: '', work_date: '2026-11-13', week_no: 2 }, keys), false);
ok('no checked rows at all covers nothing',
   api._coveredByChecked({ id: 9015, plot_name: 'U1', jenis: 'Membaja', work_date: '2026-11-13', week_no: 2 }, new Set()), false);

console.log('\nThe same worker, the same morning, already verified');

/* Verified records as the page holds them (fieldRecords), with the crew
   list the Field Conductor keyed in worked_by. Taken from the real rows. */
const VERIFIED = [
  // Handan keyed U15 manuring 7 Nov for a crew that includes Haerul
  { id: 2914, work_date: '2026-11-07', plot_name: 'U15', jenis: 'Membaja', reported_by: 'Handan',
    worked_by: 'Haerul, Hamzan Wadi, Mahnum, Mahsiruddin, Muazzin, Muhamad Fauzan, Repi, Wina' },
  // Repi's own weeding on U10 on 5 Nov
  { id: 9100, work_date: '2026-11-05', plot_name: 'U10', jenis: 'Merumput', reported_by: 'Repi', worked_by: null },
];
const pend = (o) => Object.assign({ id: 1, work_date: '2026-11-05', plot_name: 'U5', jenis: 'Merumput',
  reported_by: 'Repi' }, o);

ok('Haerul 7 Nov U15 manuring: named in the crew of a verified record -> same work',
   api._coveredByVerifiedMorning(pend({ id: 3364, work_date: '2026-11-07', plot_name: 'U15',
     jenis: 'Membaja', reported_by: 'Haerul' }), VERIFIED), true);
ok('Repi 7 Nov U15 manuring (3312): named in the crew -> same work',
   api._coveredByVerifiedMorning(pend({ id: 3312, work_date: '2026-11-07', plot_name: 'U15',
     jenis: 'Membaja', reported_by: 'Repi' }), VERIFIED), true);
ok('the same worker on the same plot, job and day as a verified record -> same work',
   api._coveredByVerifiedMorning(pend({ id: 9200, work_date: '2026-11-05', plot_name: 'U10',
     jenis: 'Merumput', reported_by: 'Repi' }), VERIFIED), true);
ok('the same worker and job on a DIFFERENT plot the same day is a different job',
   api._coveredByVerifiedMorning(pend({ id: 3285, work_date: '2026-11-05', plot_name: 'U5',
     jenis: 'Merumput', reported_by: 'Repi' }), VERIFIED), false);
ok('a worker who is NOT in the crew, same plot, job and day, is not covered',
   api._coveredByVerifiedMorning(pend({ id: 9300, work_date: '2026-11-07', plot_name: 'U15',
     jenis: 'Membaja', reported_by: 'Awaludin' }), VERIFIED), false);
ok('the same worker on the same plot and day but a different job is not covered',
   api._coveredByVerifiedMorning(pend({ id: 9301, work_date: '2026-11-07', plot_name: 'U15',
     jenis: 'Penyemburan racun kulat dan serangga', reported_by: 'Haerul' }), VERIFIED), false);
ok('the same worker on the same plot and job but a different day is not covered',
   api._coveredByVerifiedMorning(pend({ id: 9302, work_date: '2026-11-18', plot_name: 'U15',
     jenis: 'Membaja', reported_by: 'Haerul' }), VERIFIED), false);
ok('a record never covers itself',
   api._coveredByVerifiedMorning(pend({ id: 2914, work_date: '2026-11-07', plot_name: 'U15',
     jenis: 'Membaja', reported_by: 'Handan' }), VERIFIED), false);
ok('with nothing verified, nothing is covered',
   api._coveredByVerifiedMorning(pend({ id: 3364, work_date: '2026-11-07', plot_name: 'U15',
     jenis: 'Membaja', reported_by: 'Haerul' }), []), false);

console.log(`\n${n} checks passed`);
