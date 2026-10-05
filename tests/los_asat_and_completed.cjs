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

// completed
const start = src.indexOf('  // ── Derived figures ──');
const end   = src.indexOf('  // Years/suppliers offered by their pickers', start);
const derive = new Function('rowsByBatch','asAt','_losAgeMonths','_losAgeLabel',
  src.slice(start,end) + '\nreturn rowsByBatch;');
const run = (f) => { const r = Object.assign({ planted:0,cull1:0,cull2:0,cull3:0,trans:0,
  sales:0,salesPre:0,calibration:0,calibrationPre:0 }, f);
  derive({x:r}, null, ()=>null, ()=>''); return r; };

console.log('\nSTATUS — is the batch finished?');
console.log('─'.repeat(58));
const cases = [
  ['received, not planted yet',            { planted:0 },                                   'active'],
  ['planted, nothing has left',            { planted:1000 },                                'active'],
  ['transplanted out, all sold',           { planted:1000, trans:1000, sales:1000 },        'completed'],
  ['sold ENTIRELY out of the tray',        { planted:1000, sales:1000, salesPre:1000 },     'completed'],
  ['culled ENTIRELY in the tray',          { planted:1000, cull1:1000 },                    'completed'],
];
let bad = 0;
for (const [name, f, want] of cases) {
  const r = run(f);
  const got = r.completed ? 'completed' : 'active';
  if (got !== want) bad++;
  console.log('  ' + name.padEnd(36) + got.padEnd(11) + '(should be ' + want + ')' +
              (got === want ? '' : '   ✗'));
}
console.log('\n' + bad + ' wrong');
