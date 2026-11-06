/* THE WORK LIST BELONGS TO THE SYSTEM RAISING THE CASE, AND THE TITLE SAYS
   WHERE IT GOES.

   The office set "Request Transplanting Signboard" up with a rule reading
   "solved by Admin Portal · Admin 2" — then opened the Nelos dock ON the FC
   Portal, chose to give the case to Admin, and could not find that title
   anywhere in the Work list.

   Both forms filled Work from the DESTINATION: pick Admin and you were
   offered ADMIN's own titles. So a title set up for one system to raise
   could not be raised from that system at all, and the one list that did
   contain it was the one for the system it was being sent to.

   That was fixed by scoping the list on nelos_categories.module_key, the
   system a title belonged to. CASE ROUTING HAS SINCE TURNED OVER
   (shared/RUN_ME_nelos_routing_is_the_category.sql): module_key is the
   system that SOLVES a title, and who may raise one is raise_modules — the
   From System tick list on that screen. So this file holds the same rule
   asked of the column that now answers it.

   WHY THAT IS MORE THAN A RENAME. A rule used to be keyed on
   (source_module, category) and the source is the PAGE the dock was opened
   on. The dock is on 49 pages, so the same title raised from a page that
   was not its own system matched no rule at all and the case stayed where
   it was raised. The solver rides on the title now, so the page decides
   nothing and the case lands in the right queue wherever it was raised.

   WHAT IS LEFT OF nelos_routes is the SECTION DEFAULT — the catch-all for a
   title neither screen has heard of, which is a line somebody typed. Both
   forms read it in the same order the database trigger does: the title,
   then the default, then the system it was raised in.

   TWO COPIES, ONE DECISION: the office dock (shared/shared_nelos_dock.js)
   and the Admin Portal's own form (Mobile/src/components/NelosNewCase.jsx).
   The dock says so in its own comment — "one form on every surface, so keep
   the two in step" — so this holds both to it.

   The three states of raise_modules are driven as a unit, over the real
   functions out of both files, in section 7 of
   tests/the_destination_follows_the_work.cjs.

   Run: node tests/the_work_list_is_the_raising_system.cjs
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name + '  → ' + JSON.stringify(got)); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) +
                             '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

const ROOT = path.join(__dirname, '..');
const dock = fs.readFileSync(path.join(ROOT, 'shared', 'shared_nelos_dock.js'), 'utf8');
const MOBILE = path.join(ROOT, '..', 'Mobile', 'src', 'components', 'NelosNewCase.jsx');
const phone = fs.existsSync(MOBILE) ? fs.readFileSync(MOBILE, 'utf8') : null;
const SQL = path.join(ROOT, 'shared', 'RUN_ME_nelos_routing_is_the_category.sql');
const sql = fs.existsSync(SQL) ? fs.readFileSync(SQL, 'utf8') : '';

/* The real functions, lifted out of the shipped files rather than copied —
   a copy would go on passing after the original changed, which is the one
   thing a test of a rule must not do. */
function lift(src, from, to, call, ctx) {
  const at = src.indexOf(from);
  if (at < 0) return null;
  const end = src.indexOf(to, at);
  if (end < 0) return null;
  const box = Object.assign({ ANY_SYSTEM: '*' }, ctx || {});
  vm.createContext(box);
  vm.runInContext(src.slice(at, end + to.length) + ';\n_f = ' + call + ';', box);
  return box._f;
}

console.log('\n── 1. The order is the one the database routes in ──');
{
  /* nelos_route_case() takes the TITLE first and the section default
     second. A form that answered differently would show a destination the
     insert then changed — which is the whole reason both read the same
     order rather than each deciding for itself. */
  const titleFirst = sql.indexOf('FROM nelos_categories nc');
  const defaultNext = sql.indexOf('FROM nelos_routes nr');
  checkTrue('the trigger asks the title before the section default',
            titleFirst > 0 && defaultNext > titleFirst);
  checkTrue('and only the catch-all rows of nelos_routes are left in it',
            /nr\.category IS NULL/.test(sql));
  /* A case that names its own queue has always won over all of it:
     "routing is the default, not a rule". */
  checkTrue('an explicit destination still wins over both',
            /NEW\.assigned_module IS NOT NULL[\s\S]{0,120}RETURN NEW/.test(sql));
}

console.log('\n── 2. The dock fills Work from the system raising the case ──');
{
  checkTrue('it reads the case titles at all',
            /rest\/v1\/nelos_categories/.test(dock));
  checkTrue('and asks for every column, so a missing one cannot empty the list',
            /nelos_categories' \+\s*'\?select=\*/.test(dock));
  checkTrue('the work list is scoped on sourceModule()',
            /function workList\(\)\s*\{\s*return worksFor\(sourceModule\(\)\);/.test(dock));

  /* THE FALLBACK IS GONE, and its absence is the measure of the change. A
     system with no titles of its own used to borrow the DESTINATION's — a
     crutch for the hub, where the source is Nelos and Nelos owns nothing.
     A title the office leaves open to any system is in every Work list
     including that one, so the exception is answered by the rule. */
  check('and no longer borrows the destination’s list',
        /worksFor\(formEl\.querySelector\('#nd-f-to'\)\.value\)/.test(dock), false);

  /* The two figures that hang off the chosen work have to read the same
     list the dropdown was filled from, or a title that is on screen is one
     they cannot find. workRow() is the third reader, and it is the one
     onWork() takes the destination out of. */
  const reads = (dock.match(/workList\(\)\.filter/g) || []).length;
  check('the priority, the due date and the row all read that same list', reads, 3);
}

console.log('\n── 3. The list is the raising system’s, row by row ──');
{
  const mayRaise = lift(dock, 'function mayRaiseFrom(c, moduleKey) {', '\n  }', 'mayRaiseFrom');
  const worksFor = lift(dock, 'function worksFor(moduleKey) {', '\n  }', 'worksFor', {
    _cats: [
      { name: 'Request Transplanting Signboard', module_key: 'mobile', raise_modules: ['scan'] },
      { name: 'Planting Discrepancy', module_key: 'nursery_ops', raise_modules: ['operation'] },
      { name: 'Repair Maintenance Work', module_key: 'mobile', raise_modules: ['scan', 'operation'] },
      { name: 'Anybody Can Raise This', module_key: 'mobile', raise_modules: ['*'] },
      { name: 'Only The System Raises This', module_key: 'nursery_ops', raise_modules: [] },
    ],
    mayRaiseFrom: mayRaise,
  });

  if (!worksFor) check('worksFor is in the shipped dock', false, true);
  else {
    const names = (key) => worksFor(key).map((c) => c.name);
    /* Akbar on the FC Portal: the three he may raise, and not one he may
       not. The title solved by the FC Portal itself is not special. */
    check('the FC Portal is offered what it may raise',
          names('scan'),
          ['Request Transplanting Signboard', 'Repair Maintenance Work', 'Anybody Can Raise This']);
    check('Seedling Stock is offered its own, and the shared one',
          names('operation'),
          ['Planting Discrepancy', 'Repair Maintenance Work', 'Anybody Can Raise This']);
    /* THE HUB, which is why the destination fallback could go. */
    check('and the hub, which owns nothing, still has the open one',
          names('nelos'), ['Anybody Can Raise This']);
    /* An automatic title is on NO list. It arrives by itself; offering it
       by hand is offering work the code is already doing. */
    check('nothing offers the title nobody raises by hand',
          ['scan', 'operation', 'mobile', 'nelos']
            .some((k) => names(k).indexOf('Only The System Raises This') >= 0), false);
  }
}

console.log('\n── 4. Choosing the work says where it goes ──');
{
  checkTrue('the dock has the handler', /function onWork\(\)/.test(dock));
  checkTrue('it is wired to the work select',
            /#nd-f-work'\)\.addEventListener\('change'[\s\S]{0,200}onWork\(\)/.test(dock));
  checkTrue('the destination comes off the TITLE',
            /function onWork\(\)[\s\S]{0,1200}var dest = row && row\.module_key/.test(dock));
  checkTrue('then the section default',
            /function onWork\(\)[\s\S]{0,1500}defaultRouteFor\(sourceModule\(\)\)/.test(dock));
  checkTrue('and the PIC the office named, seat or person',
            /function onWork\(\)[\s\S]{0,2200}seatHolder\(dest/.test(dock));

  /* THE SEAT HAS TO REACH THE CASE. The trigger cannot supply it — it
     returns early on a case that already names its queue, and this form
     always names one — so a PIC set as "Admin 2" had never once landed on
     a case raised from a form. */
  checkTrue('the saved case carries the seat', /row\.assigned_seat_no = seatNo/.test(dock));
  checkTrue('and the seat does not travel to an overridden destination',
            /function seatOfWork\(\)[\s\S]{0,400}!== row\.module_key\) return null/.test(dock));

  /* WORK IS ASKED FIRST, because the destination follows from it. Asked
     after, the form would move an answer the person had just given. */
  const workAt = dock.indexOf('for="nd-f-work"');
  const toAt   = dock.indexOf('for="nd-f-to"');
  checkTrue('and Work is above Assign to on the form', workAt > 0 && workAt < toAt);
}

console.log('\n── 5. The Admin Portal’s own form is in step ──');
{
  if (!phone) {
    fail++;
    console.log('  FAIL Mobile/src/components/NelosNewCase.jsx is not checked out here');
  } else {
    checkTrue('it reads every column of the titles too',
              /from\('nelos_categories'\)\s*\.select\('\*'\)/.test(phone));
    checkTrue('its work list is the titles this system may raise',
              /cats\.filter\(\(c\) => mayRaiseFrom\(c, sourceModule\)\)/.test(phone));
    check('and it no longer borrows the destination’s list',
          /module_key === assignTo/.test(phone), false);
    checkTrue('it still reads the section default',
              /const defaultRouteFor = \(\)/.test(phone));
    checkTrue('choosing the work moves the destination off the title',
              /function pickWork\(name\)[\s\S]{0,700}row\?\.module_key/.test(phone));
    checkTrue('and resolves the seat to whoever holds it',
              /function pickWork\(name\)[\s\S]{0,1800}seatHolder\(dest/.test(phone));
    checkTrue('the saved case carries the seat here too',
              /row\.assigned_seat_no = seatNo/.test(phone));
    checkTrue('and the select calls it rather than setting the work raw',
              /onChange=\{\(e\) => pickWork\(e\.target\.value\)\}/.test(phone));
    /* Both copies say the other exists. A shared decision with no comment
       on one side is the half that goes stale. */
    checkTrue('and each copy names the other',
              /shared_nelos_dock\.js/.test(phone) && /NelosNewCase\.jsx/.test(dock));
  }
}

console.log('\n── 6. The screen that sets it, and the screens that read it ──');
{
  const SET = path.join(ROOT, 'nelos', 'nelos_user_setting.html');
  const raw = fs.existsSync(SET) ? fs.readFileSync(SET, 'utf8') : '';
  /* COMMENTS OUT FIRST. The page EXPLAINS at length what the Solve by
     column was and why it went — in prose, in both the stylesheet and the
     script, which share the same comment delimiters — and a plain search
     reads the explanation as the column still being there. This codebase
     has a heading about exactly that trap. */
  const set = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  checkTrue('Case Routing heads the column From System',
            /<span>From System<\/span>/.test(set));
  check('and no longer heads one Solve by', /Solve by/.test(set), false);
  checkTrue('it writes the title, not a route',
            /from\('nelos_categories'\)\s*\n?\s*\.update\(row\)/.test(set));
  checkTrue('and refuses to save at all until the SQL has been run',
            /if \(!hasRaiseCol\)[\s\S]{0,200}RUN_ME_nelos_routing_is_the_category/.test(set));

  /* THE HUB DRAWER IS THE THIRD RAISE FORM and was left out of the last
     change on purpose — its source is Nelos, which has no queue to fall
     back to. It still has to read the title, or one case opened from the
     hub and the identical case opened from a module go to two queues. */
  const DASH = path.join(ROOT, 'nelos', 'nelos_dashboard.html');
  const dash = fs.existsSync(DASH) ? fs.readFileSync(DASH, 'utf8') : '';
  checkTrue('the hub drawer routes off the title first',
            /function routedTo\(systemKey, problem\)[\s\S]{0,400}c\.module_key/.test(dash));
  checkTrue('and offers only what that system may raise',
            /categories\.filter\(c => mayRaiseFrom\(c, systemKey\)\)/.test(dash));

  /* Automate Cases writes the same two fields, so the two screens stay two
     views of one row rather than two rows that can disagree. */
  const AUTO = path.join(ROOT, 'nelos', 'nelos_automation.html');
  const auto = fs.existsSync(AUTO) ? fs.readFileSync(AUTO, 'utf8') : '';
  checkTrue('Automate Cases re-points the title itself',
            /from\('nelos_categories'\)\s*\n?\s*\.update\(patch\)/.test(auto));
  check('and no longer writes a route row', /from\('nelos_routes'\)/.test(auto), false);
}

console.log('\n' + (fail ? 'FAILURES: ' + fail + ' (passed ' + pass + ')'
                         : 'all good — ' + pass + ' checks'));
process.exit(fail ? 1 : 0);
