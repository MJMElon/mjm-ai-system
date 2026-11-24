/* The hub drawer (nelos_dashboard.html) raises a case with Nelos itself as
   its source. The office picked FC Portal under Assigned To and found no
   case category but Other, with two titles filed under FC Portal on Case
   Routing. This lifts the REAL functions out of the shipped page. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'nelos', 'nelos_dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++; console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : '  -> got ' + JSON.stringify(got))); };
function lift(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let j = src.indexOf(')', i), d = 0; j = src.indexOf('{', j);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  return null;
}
const parts = ['mayRaiseFrom', 'hubSolverOf', 'mayOffer'].map(lift);
const cats = [
  { name: 'Repair Maintenance Work', module_key: 'scan', raise_modules: ['audit'] },
  { name: 'Others', module_key: 'scan', raise_modules: ['*'] },
  { name: 'Seal', module_key: 'scan', raise_modules: [] },
  { name: 'Request Signboard', module_key: 'mobile', raise_modules: ['scan'] },
  { name: 'Old title', module_key: 'mobile', raise_modules: null },
  { name: 'No solver', module_key: null, raise_modules: ['*'] }
];
function names(source, touched, dest) {
  if (parts.some(p => !p)) return 'a function is missing from the page';
  const f = new Function('newSource', 'destTouched', '$', 'cats',
    "const NELOS_ANY_SYSTEM='*';" + parts.join('\n') +
    "\nreturn cats.filter(c => mayOffer(c, newSource)).map(c => c.name);");
  return f(source, touched, () => ({ value: dest }), cats);
}
console.log('1. the hub, FC Portal picked');
check('both titles FC Portal solves are offered, and the automatic one is not',
      names('nelos', true, 'scan'), ['Repair Maintenance Work', 'Others', 'No solver']);
check('another system shows its own', names('nelos', true, 'mobile'),
      ['Request Signboard', 'Old title', 'No solver']);
console.log('2. nothing picked yet, the From System rule stands');
check('only what is open to any system', names('nelos', false, ''), ['Others', 'Old title', 'No solver']);
console.log('3. a deep link from a real system keeps the From System rule');
check('the auditor sees what the auditor may raise', names('audit', true, 'scan'),
      ['Repair Maintenance Work', 'Others', 'Old title', 'No solver']);
console.log('4. wiring');
check('changing the system refills the list',
      /\$\('c-dest'\)\.addEventListener\('change'[\s\S]{0,500}fillProblems\(newSource\)/.test(src), true);
check('the drawer reads the titles again when it opens',
      /if \(!prefill\) loadCategories\(\)/.test(src), true);
console.log('\n' + (fail ? 'FAILURES: ' + fail : 'all good — ' + pass + ' checks'));
process.exit(fail ? 1 : 0);
