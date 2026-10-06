/* stampRecordMonths() runs on every load and SAVES, so what it refuses to
   touch matters as much as what it repairs.

   It repairs ONE fault: a nursery whose rows all carry one stamp (or none)
   while the dates say another — rows that predate months, and rows the first
   version stamped alike inside the sync.

   It must leave alone a nursery that already carries more than one month.
   That nursery has been through a sync and knows its own months, and moving
   a September row worked on the 2nd of October into October takes it out of
   the month whose schedule asked for it — and the next sync rebuilds a blank
   row in its place, so the month grows an undated duplicate. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'nursery_ops', 'plot_maintenance_script.js'), 'utf8');
const i = src.indexOf('function stampRecordMonths() {');
const body = src.slice(i, src.indexOf('\n}', i) + 2);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const lbl = (iso) => iso ? MONTHS[Number(String(iso).slice(5, 7)) - 1] + ' ' + String(iso).slice(0, 4) : null;
const run = (records, onScreen) => {
  new Function('records', 'getMonth', 'NURSERY_PLOTS', 'MJMMaintField', '_tarikhToISO',
    body + '\nreturn stampRecordMonths();')(
    records, () => onScreen, { UNN2: ['N19', 'N20'] },
    { isoMonthLabel: lbl }, (t) => t || null);
  return records;
};

let bad = 0;
const show = (title, rows, want) => {
  const after = run(rows, 'Oct 2026');
  console.log('\n  ' + title);
  after.forEach((r, k) => {
    const ok = r._month === want[k];
    if (!ok) bad++;
    console.log(`    ${(r.tarikh || 'no date').padEnd(12)}${String(r._month).padEnd(11)}` +
                (ok ? 'ok' : `✗ should be ${want[k]}`));
  });
};

// 1. The fault it exists for: every row stamped Oct, dates say Sep.
show('a nursery stamped all alike, wrongly — repaired', [
  { plot:'N19', tarikh:'2026-09-19', _month:'Oct 2026' },
  { plot:'N19', tarikh:'2026-09-20', _month:'Oct 2026' },
  { plot:'N20', tarikh:'',           _month:'Oct 2026' },
], ['Sep 2026', 'Sep 2026', 'Sep 2026']);

// 2. Rows that predate months at all.
show('a nursery with no stamps at all — repaired', [
  { plot:'N19', tarikh:'2026-09-19' },
  { plot:'N20', tarikh:'2026-09-20' },
], ['Sep 2026', 'Sep 2026']);

// 3. THE ONE THAT BROKE UNN 2: a month-aware nursery, with one job done late.
show('a month-aware nursery — LEFT ALONE, late job and all', [
  { plot:'N19', tarikh:'2026-09-19', _month:'Sep 2026' },
  { plot:'N19', tarikh:'2026-10-02', _month:'Sep 2026' },   // worked late, September's row
  { plot:'N20', tarikh:'2026-10-05', _month:'Oct 2026' },
  { plot:'N20', tarikh:'',           _month:'Oct 2026' },
], ['Sep 2026', 'Sep 2026', 'Oct 2026', 'Oct 2026']);

console.log('\n  the late September row stayed in September:',
  bad === 0 ? 'yes  ok' : 'NO ✗');
console.log('\n' + (bad ? bad + ' row(s) wrong' : 'all correct'));
process.exit(bad ? 1 : 0);
