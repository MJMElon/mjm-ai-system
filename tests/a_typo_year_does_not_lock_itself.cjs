/* A YEAR THAT CANNOT BE RIGHT MUST NOT LOCK THE ROW THAT WOULD FIX IT.

   A date box takes four digits for the year and somebody keyed two, so a 3rd
   Culling came out dated 21/02/**0026**. Every month of year 26 is two
   thousand years past its auto-lock date, so `isDateLocked` said yes, the row
   got `.mjm-locked`, and that disables every input on it -- including the
   date box the wrong year is sitting in.

   There was no way out from the screen either. The Month Lock Calendar can
   force a month open, but it lists real years; nobody is going to scroll to
   year 26. The only remaining route was a hand-written UPDATE against the
   ledger, for a slip of the keyboard.

   The calendar exists to stop somebody changing a month that has been
   settled and paid. Year 26 was never settled and never paid. So a date
   outside the range this nursery can possibly mean is not treated as a date
   at all, and the row stays open to be corrected.

   The band is deliberately WIDE: this is not a validity check and must not
   start refusing dates somebody meant.

   Run: node tests/a_typo_year_does_not_lock_itself.cjs
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'shared', 'shared_month_lock.js'), 'utf8');
const DETAIL = fs.readFileSync(path.join(ROOT, 'operation', 'operation_batch_detail.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

/* The real file, loaded the way a page loads it. */
function load() {
  const win = {};
  new Function('window', SRC)(win);
  return win.MJMMonthLock;
}
const L = load();

/* No rows loaded, so every month falls back to its computed auto-lock --
   which is the state the office is actually in for a month nobody has
   touched on the calendar. */
const THIS_YEAR = new Date().getFullYear();

console.log('\nThe typo');
check('year 26 is not a month the calendar can lock', L.isDateLocked('0026-02-21'), false);
checkTrue('…and it says why, in its own test', L.isKeyedWrong('0026-02-21'));
/* Which is the whole point: the row stays editable, so the person who keyed
   it can put it right without anybody unlocking anything. */
check('a year keyed as two digits is the same slip', L.isDateLocked('0026-12-31'), false);

console.log('\nAnd a real month still locks, which is what the calendar is for');
/* A month comfortably past its auto-lock date. Nothing is loaded, so this is
   the computed default -- the state of a month nobody has touched. */
check('last year is locked', L.isDateLocked((THIS_YEAR - 1) + '-01-15'), true);
check('and so is the year before that', L.isDateLocked((THIS_YEAR - 2) + '-06-30'), true);
/* Far enough ahead that no lock day can have passed. */
check('a month years ahead is open', L.isDateLocked((THIS_YEAR + 3) + '-01-15'), false);
check('no date at all is never locked', L.isDateLocked(''), false);
check('and nor is something that is not a date', L.isDateLocked('not a date'), false);

console.log('\nThe band is wide on purpose');
check('2000 is a date somebody could mean', L.isKeyedWrong('2000-01-01'), false);
check('2100 is too', L.isKeyedWrong('2100-12-31'), false);
check('1999 is not', L.isKeyedWrong('1999-12-31'), true);
check('2101 is not', L.isKeyedWrong('2101-01-01'), true);
check('and the band is named rather than typed into the test',
      [L.YEAR_MIN, L.YEAR_MAX], [2000, 2100]);
/* A year inside the band is judged by the calendar and nothing else -- the
   escape must not quietly unlock a month that IS settled. */
check('a year inside the band is the calendar’s business alone',
      L.isDateLocked((THIS_YEAR - 1) + '-03-03'), L.isMonthLocked(THIS_YEAR - 1, 3));

console.log('\nAnd the box itself resists it now');
checkTrue('the 3rd Culling date box names the range it accepts',
          /<input type="date" min="2000-01-01" max="2100-12-31" class="input-style t6-cull-date/.test(DETAIL));
checkTrue('so does the 1st Culling one',
          /<input type="date" min="2000-01-01" max="2100-12-31" class="input-style cull-date"/.test(DETAIL));
checkTrue('and a row already carrying one says so on its face',
          /⚠ Check the year/.test(DETAIL)
       && /MJMMonthLock\.isKeyedWrong\(p\.savedCullDate\)/.test(DETAIL));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
