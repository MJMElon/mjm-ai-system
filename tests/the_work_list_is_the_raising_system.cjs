/* THE WORK LIST BELONGS TO THE SYSTEM RAISING THE CASE, AND THE RULE SAYS
   WHERE IT GOES.

   The office set "Request Transplanting Signboard" up under FC Portal on
   Case Routing, with a rule reading "solved by Admin Portal · Admin 2" —
   then opened the Nelos dock ON the FC Portal, chose to give the case to
   Admin, and could not find that title anywhere in the Work list.

   Both forms filled Work from the DESTINATION: pick Admin and you were
   offered ADMIN's own titles. So a title set up under the system that
   raises it could not be raised from that system at all, and the one list
   that did contain it was the one for the system it was being sent to.
   The screen that files titles under the system that raises them, and a
   form that asked it the other way round, were two answers to one
   question.

   Two halves to the fix, and the second is the one that makes the Setting
   screen mean anything:

   THE LIST IS THE RAISING SYSTEM'S, falling back to the destination's only
   where the raising system has no titles of its own — so raising from the
   hub, where the source is Nelos itself, goes on working as it did.

   AND THE DESTINATION FALLS OUT OF THE WORK. Both forms write
   assigned_module themselves, and nelos_route_case() returns early on a
   case that already names its queue — so until now EVERY rule on Case
   Routing was dead for anything raised from a form. Choosing the work now
   reads the rule and fills in the system and the PIC, and changing either
   afterwards still overrides it for that one case.

   TWO COPIES, ONE DECISION: the office dock (shared/shared_nelos_dock.js)
   and the Admin Portal's own form (Mobile/src/components/NelosNewCase.jsx).
   The dock says so in its own comment — "one form on every surface, so keep
   the two in step" — so this holds both to it.

   Run: node tests/the_work_list_is_the_raising_system.cjs
*/
'use strict';
const fs = require('fs');
const path = require('path');

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

/* The real routeFor, lifted out of the shipped dock rather than copied —
   a copy would go on passing after the original changed, which is the one
   thing a test of a rule must not do. */
function liftRouteFor(rows) {
  const at = dock.indexOf('function routeFor(source, work)');
  if (at === -1) throw new Error('routeFor is not in shared_nelos_dock.js any more');
  const end = dock.indexOf('\n  }', at);
  const src = dock.slice(at, end + 4);
  // eslint-disable-next-line no-new-func
  return new Function('_routes', src + '; return routeFor;')(rows);
}

console.log('\n── 1. The rule is read the way the database reads it ──');
{
  /* nelos_route_case() takes the category's OWN rule first and the
     section default second. A form that answered differently would show a
     destination the insert then changed. */
  const routeFor = liftRouteFor([
    { source_module: 'scan', category: null, to_module: 'nursery_ops' },
    { source_module: 'scan', category: 'Request Transplanting Signboard',
      to_module: 'mobile', to_user_id: 'u-florence' },
    { source_module: 'audit', category: 'Request Transplanting Signboard',
      to_module: 'operation' },
  ]);

  check('the category’s own rule wins',
        routeFor('scan', 'Request Transplanting Signboard').to_module, 'mobile');
  check('and it carries the PIC the office named',
        routeFor('scan', 'Request Transplanting Signboard').to_user_id, 'u-florence');
  check('a work with no rule of its own falls to the section default',
        routeFor('scan', 'Repair Maintenance Work').to_module, 'nursery_ops');
  /* A rule belongs to the source it was set under. The same title under
     two systems is two rules, and reading the wrong one would send the
     case to the wrong queue. */
  check('a rule set under another system is not this one’s',
        routeFor('mobile', 'Request Transplanting Signboard'), null);
}

console.log('\n── 2. The dock fills Work from the system raising the case ──');
{
  checkTrue('it reads the routing rules at all',
            /from\(.nelos_routes.\)|rest\/v1\/nelos_routes/.test(dock));
  checkTrue('the work list is scoped on sourceModule()',
            /function workList\(\)[\s\S]{0,400}worksFor\(sourceModule\(\)\)/.test(dock));
  /* The fallback is what keeps the hub working: raised from index.html the
     source is Nelos itself, which has no titles of its own. */
  checkTrue('and falls back to the destination where that system has none',
            /function workList\(\)[\s\S]{0,500}worksFor\(formEl\.querySelector\('#nd-f-to'\)\.value\)/.test(dock));

  /* The two figures that hang off the chosen work have to read the same
     list the dropdown was filled from, or a title that is on screen is one
     they cannot find. */
  const reads = (dock.match(/workList\(\)\.filter/g) || []).length;
  check('the priority and the due date read that same list', reads, 2);
}

console.log('\n── 3. Choosing the work says where it goes ──');
{
  checkTrue('the dock has the handler', /function onWork\(\)/.test(dock));
  checkTrue('it is wired to the work select',
            /#nd-f-work'\)\.addEventListener\('change'[\s\S]{0,200}onWork\(\)/.test(dock));
  checkTrue('it sets the destination from the rule',
            /function onWork\(\)[\s\S]{0,900}routeFor\(sourceModule\(\)[\s\S]{0,400}to\.value = rule\.to_module/.test(dock));
  checkTrue('and the PIC where the rule names one',
            /function onWork\(\)[\s\S]{0,1400}rule\.to_user_id/.test(dock));

  /* WORK IS ASKED FIRST, because the destination follows from it. Asked
     after, the form would move an answer the person had just given. */
  const workAt = dock.indexOf("for=\"nd-f-work\"");
  const toAt   = dock.indexOf("for=\"nd-f-to\"");
  checkTrue('and Work is above Assign to on the form', workAt > 0 && workAt < toAt);
}

console.log('\n── 4. The Admin Portal’s own form is in step ──');
{
  if (!phone) {
    fail++;
    console.log('  FAIL Mobile/src/components/NelosNewCase.jsx is not checked out here');
  } else {
    checkTrue('it reads the routing rules too', /from\('nelos_routes'\)/.test(phone));
    checkTrue('its work list is scoped on the raising system',
              /cats\.filter\(\(c\) => c\.module_key === sourceModule\)/.test(phone));
    checkTrue('with the same fallback to the destination',
              /mine\.length \? mine[\s\S]{0,160}module_key === assignTo/.test(phone));
    checkTrue('it has the rule lookup', /const routeFor = \(workName\)/.test(phone));
    checkTrue('choosing the work moves the destination',
              /function pickWork\(name\)[\s\S]{0,500}setAssignTo\(rule\.to_module\)/.test(phone));
    checkTrue('and the select calls it rather than setting the work raw',
              /onChange=\{\(e\) => pickWork\(e\.target\.value\)\}/.test(phone));
    /* Both copies say the other exists. A shared decision with no comment
       on one side is the half that goes stale. */
    checkTrue('and each copy names the other',
              /shared_nelos_dock\.js/.test(phone) && /NelosNewCase\.jsx/.test(dock));
  }
}

console.log('\n' + (fail ? 'FAILURES: ' + fail + ' (passed ' + pass + ')'
                         : 'all good — ' + pass + ' checks'));
process.exit(fail ? 1 : 0);
