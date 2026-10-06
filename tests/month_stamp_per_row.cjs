/* stampRecordMonths() runs on every load and SAVES. It must put each row
   under the month its own date says, not under one month for the whole
   nursery. The real function is lifted out of the page. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'nursery_ops', 'plot_maintenance_script.js'), 'utf8');
const i = src.indexOf('function stampRecordMonths() {');
const body = src.slice(i, src.indexOf('\n}', i) + 2);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const run = (records, onScreen) => {
  const fn = new Function('records', 'getMonth', 'NURSERY_PLOTS', 'MJMMaintField', '_tarikhToISO',
    body + '\nreturn stampRecordMonths();');
  fn(records, () => onScreen,
     { BNN: ['B1', 'B2'] },
     { isoMonthLabel: (iso) => iso ? MONTHS[Number(String(iso).slice(5, 7)) - 1] + ' ' + String(iso).slice(0, 4) : null },
     (t) => t || null);
  return records;
};

// A nursery mid-handover: September is the majority, October has started.
const rows = () => [
  { id: 1, plot: 'B1', tarikh: '2026-09-06', jenis: 'Weeding',    _month: 'Sep 2026' },
  { id: 2, plot: 'B1', tarikh: '2026-09-19', jenis: 'Weeding',    _month: 'Sep 2026' },
  { id: 3, plot: 'B1', tarikh: '2026-09-05', jenis: 'Interrow',   _month: 'Sep 2026' },
  { id: 4, plot: 'B1', tarikh: '2026-09-17', jenis: 'Interrow',   _month: 'Sep 2026' },
  { id: 5, plot: 'B1', tarikh: '2026-09-24', jenis: 'Interrow',   _month: 'Sep 2026' },
  // October's work, correctly stamped October.
  { id: 6, plot: 'B2', tarikh: '2026-10-02', jenis: 'Weeding',    _month: 'Oct 2026' },
  { id: 7, plot: 'B2', tarikh: '2026-10-05', jenis: 'P & D',      _month: 'Oct 2026' },
  // Planned, never done — no date. This one SHOULD ride with the nursery.
  { id: 8, plot: 'B2', tarikh: '',           jenis: 'Manuring',   _month: 'Oct 2026' },
];

const after = run(rows(), 'Oct 2026');
console.log('  id  date         own month   stamped as   verdict');
console.log('  ' + '-'.repeat(58));
let bad = 0;
after.forEach(r => {
  const own = r.tarikh ? MONTHS[Number(r.tarikh.slice(5, 7)) - 1] + ' ' + r.tarikh.slice(0, 4) : '(none)';
  const ok = r.tarikh ? r._month === own : true;
  if (!ok) bad++;
  console.log(`  ${String(r.id).padEnd(4)}${(r.tarikh || '—').padEnd(13)}${own.padEnd(12)}${
    String(r._month).padEnd(13)}${ok ? 'ok' : 'LOST — it is not in its own month'}`);
});
console.log('');
const octLeft = after.filter(r => r._month === 'Oct 2026').length;
console.log(`  rows still visible in October: ${octLeft} of 3`);
console.log('  ' + (bad ? `${bad} dated row(s) stamped into a month they do not belong to` : 'every dated row is under its own month'));
process.exit(bad ? 1 : 0);
