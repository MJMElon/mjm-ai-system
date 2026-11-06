/* THE DESTINATION IS ANSWERED, NOT ASKED — SO IT IS NOT ON SCREEN UNTIL
   THERE IS AN ANSWER.

   The office opened Add New Case on the FC Portal and said what it reads
   like: an "Assign to" box standing open, already saying FC, above a Work
   list full of jobs the FC Portal does not solve.

   Both halves of that were right: the Work list IS the raising system's titles
   (that is the screen one along, Case Routing, and the sibling test holds
   it), and the destination IS the rule's answer rather than a question.
   What the form did was put the answer on screen BEFORE the question it
   follows from — two instructions where there is one, and the top one
   contradicting the list under it.

   So the row is hidden until there is something to show, and three things
   count as something:

     1. a WORK has been chosen, so the rule has had its say — and the two
        selects stay editable, because overriding the rule for one case is
        the whole reason they are not a line of text;
     2. an existing case is being EDITED;
     3. there is NO work list to derive from, where the person has to say
        where it goes or the form cannot be filled in at all.

   AND A WORK WITH NO RULE FALLS BACK TO THE SYSTEM THAT RAISED IT, which
   is what Case Routing promises at the foot of every block — "a case with
   no rule set stays with FC Portal" — and what nelos_route_case() does
   with a case that names no queue. Left alone instead, the row would come
   back carrying whatever the LAST work put there: nobody's answer, reading
   as if it were one.

   TWO COPIES, ONE DECISION: the office dock (shared/shared_nelos_dock.js)
   and the Admin Portal's own form (Mobile/src/components/NelosNewCase.jsx).
   Section 3 holds the two together — the dock is driven in a real browser,
   and the phone's copy is read, because this environment cannot build it.

   Run: node tests/the_destination_follows_the_work.cjs
   Needs Playwright and the Chromium at /opt/pw-browsers/chromium. It
   serves the repository itself, so nothing has to be started first.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8781;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name + '  → ' + JSON.stringify(got)); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) +
                             '\n         want ' + JSON.stringify(want)); }
}

/* ── The office's own titles, as Case Routing now holds them ──
   THE TITLE NAMES THE SYSTEM THAT SOLVES IT (module_key) and the systems
   that may raise it (raise_modules) — RUN_ME_nelos_routing_is_the_category
   .sql turned that column over, and the whole point of it is that the PAGE
   somebody is standing on no longer decides anything.

   "Repair Maintenance Work" is the one the FC Portal both raises AND
   solves; the three culling ones go out to Audit and HQ. "Nobody Set A
   Rule For This" carries NO solver, which is the only remaining way to
   have no answer, and it is this test's own — the fallback cannot be
   driven on a system whose every title is set up.

   Every one of them is raisable from the FC PORTAL AND NOWHERE ELSE, which
   is what keeps section 5 honest: Seedling Stock has to have no titles at
   all for the typed line to be reached. The three states of raise_modules
   are driven as a unit in section 7 instead, because a title open to any
   system would be in Seedling Stock's list too. */
const CATEGORIES = [
  { name: 'From Culling Calculator - Request Drone Flight',    module_key: 'audit',
    raise_modules: ['scan'], pic_seat_no: 2,    pic_user_id: null },
  { name: 'From Culling Calculator - Request HQ Verification', module_key: 'nursery_ops',
    raise_modules: ['scan'], pic_seat_no: null, pic_user_id: null },
  { name: 'Request Transplanting Signboard',                   module_key: 'mobile',
    raise_modules: ['scan'], pic_seat_no: 2,    pic_user_id: 'u-admin2' },
  { name: 'Repair Maintenance Work',                           module_key: 'scan',
    raise_modules: ['scan'], pic_seat_no: null, pic_user_id: null },
  { name: 'Nobody Set A Rule For This',                        module_key: null,
    raise_modules: ['scan'], pic_seat_no: null, pic_user_id: null },
];
/* Only a SECTION DEFAULT is still live in nelos_routes, and the FC Portal
   has none — so "Nobody Set A Rule For This" has to fall all the way back
   to the system it was raised in, which is what section 3 asks. */
const ROUTES = [];
const MODULES = [
  { key: 'operation',   label: 'Seedling Stock', handler_label: 'Seedling Stock', active: true },
  { key: 'nursery_ops', label: 'HQ Operation',   handler_label: 'HQ Operation',   active: true },
  { key: 'scan',        label: 'FC Portal',      handler_label: 'FC',             active: true },
  { key: 'mobile',      label: 'Admin Portal',   handler_label: 'Admin',          active: true },
  { key: 'audit',       label: 'Audit Portal',   handler_label: 'Auditor',        active: true },
];
/* seat_no as well as the pin, because the PIC the office sets is a SEAT
   and the box on the form is a PERSON — the dock resolves one to the
   other, so a handler with no number could never be pre-selected. */
const HANDLERS = [
  { user_id: 'u-admin2',  full_name: 'Florence Indun', email: 'f@x.com',
    primary_module: 'mobile', seat_no: 2 },
  { user_id: 'u-auditor', full_name: 'Rousell Wayne',  email: 'r@x.com',
    primary_module: 'audit',  seat_no: 2 },
];

const FIXTURE = (source) => `<!doctype html>
<html><head><meta charset="utf-8"><title>dock fixture</title></head>
<body><div id="page">a module page</div>
<script>
  window.SHARED_SUPA_URL = 'https://test.supabase.co';
  window.SHARED_SUPA_KEY = 'anon-key';
</script>
<script src="/shared/shared_nelos_dock.js" data-source="${source}"></script>
</body></html>`;

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('no');
      }
      const type = file.endsWith('.js') ? 'application/javascript'
                 : file.endsWith('.html') ? 'text/html' : 'text/plain';
      res.writeHead(200, { 'Content-Type': type });
      res.end(fs.readFileSync(file));
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

/* A reply per endpoint. ONE handler reading the url rather than a route
   each: routes match in REVERSE registration order, and a catch-all added
   later would silently swallow every specific one above it. */
function reply(url) {
  if (url.includes('shared_profiles'))   return [{ permissions: { modules: { nelos: 'admin' } } }];
  if (url.includes('nelos_my_rights'))   return [{ may_solve: true, may_close: true }];
  if (url.includes('nelos_my_scope'))    return [{ primary_module: null, seat_no: null,
                                                   categories: null, is_admin: true }];
  if (url.includes('nelos_categories'))  return CATEGORIES;
  if (url.includes('nelos_modules'))     return MODULES;
  if (url.includes('nelos_handlers'))    return HANDLERS;
  if (url.includes('nelos_routes'))      return ROUTES;
  return [];
}

async function openForm(browser, source) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('sb-test-auth-token', JSON.stringify({
        access_token: 'tok',
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: { id: 'u1', email: 'office@x.com', user_metadata: { full_name: 'The Office' } },
      }));
    } catch (_) {}
  });
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(reply(r.request().url())),
  }));
  await page.route('**/__dock_fixture.html', (r) => r.fulfill({
    status: 200, contentType: 'text/html', body: FIXTURE(source),
  }));
  await page.goto(`http://localhost:${PORT}/__dock_fixture.html`, { waitUntil: 'load' })
            .catch(() => {});
  /* THE HANDLE EXISTS BEFORE THE DOCK DOES. window.NelosDock is assigned
     as the file evaluates; `dock` is built at the end of boot(), after
     four awaited reads — and newCase() answers FALSE until then and draws
     nothing. Waiting on the handle is waiting for nothing, and what fails
     afterwards is whatever check comes next. */
  await page.waitForSelector('#nelos-dock', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => window.NelosDock.newCase());
  /* WAIT FOR THE FORM TO BE POPULATED, never a flat delay: showForm() is
     not awaited by newCase() and populateForm() has four reads in front of
     it, so a fixed pause passes on a quick machine and times out on a slow
     one — a correct page failing a check about something else.

     THE SYSTEM LIST IS THE SIGNAL, and the obvious candidate is not: the
     typed Work line ships with NO hidden attribute, so "the typed line is
     showing" is true of the blank markup and this waited for nothing at
     all. It passed over sections 1 to 4, where the dropdown comes up
     anyway, and failed section 5 — the one case the condition was for.
     `#nd-f-to` is filled by populateForm and by nothing else, and what
     follows it there is synchronous, so a poll cannot catch a half-drawn
     form. */
  await page.waitForFunction(
    () => (document.getElementById('nd-f-to') || { options: [] }).options.length > 1,
    null, { timeout: 8000 });
  return page;
}

const state = (page) => page.evaluate(() => {
  const q = (id) => document.getElementById(id);
  const row = q('nd-f-dest');
  return {
    /* NOT `!!row && !row.hidden`. The previous markup had no id on that
       row at all, so a missing element read as "not shown" and section 1
       passed over the very page it was written about. A check that cannot
       tell "hidden" from "not there" is a check that passes for the wrong
       reason. */
    destShown: !row ? 'no such row' : !row.hidden,
    work: q('nd-f-work') ? { hidden: q('nd-f-work').hidden, value: q('nd-f-work').value } : null,
    to: q('nd-f-to') ? q('nd-f-to').value : null,
    pic: q('nd-f-pic') ? q('nd-f-pic').value : null,
    err: (document.querySelector('.nd-err') || {}).textContent || '',
  };
});

/* A TEST THAT DIES ON THE PREVIOUS CODE PROVES NOTHING ABOUT IT: the harness
   stops at the first throw and every check underneath is never asked, which
   this codebase has a heading about. The previous dock read module_key as
   the system that RAISES a title, so against this fixture the FC Portal has
   no titles at all, the Work dropdown is hidden and selectOption simply
   times out. Caught, that is ONE NAMED failure and the five sections below
   still report what they found. */
const pickWork = async (page, name) => {
  try {
    await page.selectOption('#nd-f-work', name, { timeout: 4000 });
  } catch (e) {
    check('the Work list offers “' + name + '”',
          'the dropdown would not take it', 'chosen');
    return;
  }
  await page.waitForTimeout(150);
};

(async () => {
const srv = await serve();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

console.log('\n── 1. The form opens on ONE question ──');
{
  const page = await openForm(browser, 'scan');
  const s = await state(page);
  check('the Work list is on screen',                 s.work && !s.work.hidden, true);
  check('and nothing is chosen in it',                s.work && s.work.value, '');
  /* The whole report: "Assign to" was standing open saying FC over a list
     of jobs the FC Portal does not solve. */
  check('Assign to and PIC are NOT on screen yet',    s.destShown, false);
  await page.close();
}

console.log('\n── 2. Choosing the work answers it, and shows the answer ──');
{
  const page = await openForm(browser, 'scan');

  await pickWork(page, 'Request Transplanting Signboard');
  let s = await state(page);
  check('the row arrives once the work is chosen',    s.destShown, true);
  check('filled in from the office’s rule',           s.to, 'mobile');
  check('the PIC the rule names, too',                s.pic, 'u-admin2');

  /* Picking the work is the later act, so it wins — and it has to move the
     answer every time, not only the first. */
  await pickWork(page, 'From Culling Calculator - Request Drone Flight');
  s = await state(page);
  check('a different work moves it again',            s.to, 'audit');
  check('and its PIC with it',                        s.pic, 'u-auditor');

  /* The one title the FC Portal both raises and solves. */
  await pickWork(page, 'Repair Maintenance Work');
  s = await state(page);
  check('a job the raising system solves says so',    s.to, 'scan');
  await page.close();
}

console.log('\n── 3. No rule falls back to the system that raised it ──');
{
  const page = await openForm(browser, 'scan');
  /* Arrive carrying somebody else's answer first, so "left alone" and
     "fell back" cannot be told apart by luck. */
  await pickWork(page, 'Request Transplanting Signboard');
  check('standing at the rule’s answer',              (await state(page)).to, 'mobile');

  await pickWork(page, 'Nobody Set A Rule For This');
  const s = await state(page);
  check('a work with no rule stays with FC Portal',   s.to, 'scan');
  check('and does not keep the last work’s PIC',      s.pic, '');
  check('the row is still on screen to be overridden', s.destShown, true);
  await page.close();
}

console.log('\n── 4. Clearing the work takes the answer away again ──');
{
  const page = await openForm(browser, 'scan');
  await pickWork(page, 'Request Transplanting Signboard');
  check('shown',                                      (await state(page)).destShown, true);
  await pickWork(page, '');
  check('and hidden again on an unchosen work',       (await state(page)).destShown, false);

  /* THE REFUSAL HAS TO NAME SOMETHING ON SCREEN. Asked in the old order it
     said "Choose who this is for" over a box that is not on the form. */
  await page.click('.nd-save');
  await page.waitForTimeout(250);
  check('and Create asks for the WORK, not the destination',
        (await state(page)).err, 'Choose the work.');
  await page.close();
}

console.log('\n── 5. A system with no titles of its own still gets the row ──');
{
  /* Nothing derives a destination from a sentence somebody typed, so the
     person has to say where it goes. Hidden here the form could not be
     filled in at all. */
  const page = await openForm(browser, 'operation');
  const s = await state(page);
  check('the Work box is the typed line',             s.work && s.work.hidden, true);
  check('so Assign to is on screen from the start',   s.destShown, true);
  await page.close();
}

console.log('\n── 6. Two copies, one decision ──');
{
  const dock = fs.readFileSync(path.join(ROOT, 'shared', 'shared_nelos_dock.js'), 'utf8');
  const MOBILE = path.join(ROOT, '..', 'Mobile', 'src', 'components', 'NelosNewCase.jsx');
  const phone = fs.existsSync(MOBILE) ? fs.readFileSync(MOBILE, 'utf8') : null;

  check('the dock ships the row hidden',
        /id="nd-f-dest" hidden/.test(dock), true);
  /* Comments first: both files EXPLAIN this rule in prose, and a plain
     search reads the explanation as the code. */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const d = strip(dock);
  check('the dock asks for the work before the destination',
        d.indexOf("'Choose the work.'") < d.indexOf("'Choose who this is for.'"), true);
  check('and Nelos itself is the exception to the fallback',
        /sourceModule\(\) === 'nelos' \? '' : sourceModule\(\)/.test(d), true);

  if (!phone) { console.log('  --   Mobile not checked out; the phone half is unread'); }
  else {
    const m = strip(phone);
    check('the phone asks the work first too',
          m.indexOf("'Choose the work.'") < m.indexOf("'Choose who this is for.'"), true);
    check('the phone has the same Nelos exception',
          /sourceModule === 'nelos' \? '' : sourceModule/.test(m), true);
    /* The dock put WORK above the destination when the list stopped being
       the destination's; the phone kept the old order for a while, which
       is this codebase's commonest fault wearing a layout. */
    check('and draws Work ABOVE Assign to',
          m.indexOf('htmlFor="nnc-work"') < m.indexOf('htmlFor="nnc-to"'), true);
    check('with the pair behind one condition',
          /\{showDest && \(/.test(m), true);
  }
}

console.log('\n── 7. Which systems may raise a title — all THREE states ──');
{
  /* THE REAL FUNCTIONS, lifted out of the two shipped files and driven over
     the same rows. Two copies of one decision is this codebase's commonest
     fault, and the only way to say they agree is to run both.

     The middle state is the one that is easy to lose: an EMPTY array is a
     deliberate nobody-by-hand, which is what an automatic title wants,
     while an ABSENT column is nobody having been asked — every title on a
     database that has not run the SQL. Folded together, either every
     automatic title appears in every Work list or every Work list empties
     itself over a column. */
  const vm = require('vm');
  const dock = fs.readFileSync(path.join(ROOT, 'shared', 'shared_nelos_dock.js'), 'utf8');
  const MOBILE = path.join(ROOT, '..', 'Mobile', 'src', 'components', 'NelosNewCase.jsx');

  const lift = (src, from, to, call) => {
    const at = src.indexOf(from);
    if (at < 0) return null;
    const end = src.indexOf(to, at);
    if (end < 0) return null;
    /* The sentinel is declared beside each copy of the function rather than
       inside it, so it has to be handed in — and it is handed in as the
       literal both files declare, so a file that changed the spelling fails
       here rather than quietly reading undefined. */
    const ctx = { ANY_SYSTEM: '*' };
    vm.createContext(ctx);
    vm.runInContext(src.slice(at, end + to.length) + ';\n_f = ' + call + ';', ctx);
    return ctx._f;
  };

  const ROWS = [
    ['nobody has been asked (no column at all)', {},                            true,  true ],
    ['null, which is the same question unasked', { raise_modules: null },        true,  true ],
    ['any system',                               { raise_modules: ['*'] },       true,  true ],
    ['this system, named',                       { raise_modules: ['scan'] },    true,  false],
    ['another system, named',                    { raise_modules: ['mobile'] },  false, true ],
    ['two systems, this one among them',         { raise_modules: ['audit', 'scan'] }, true, false],
    ['NOBODY by hand — an automatic title',      { raise_modules: [] },          false, false],
  ];

  const deskFn = lift(dock, 'function mayRaiseFrom(c, moduleKey) {', '\n  }', 'mayRaiseFrom');
  if (!deskFn) check('mayRaiseFrom is in the shipped dock', false, true);
  else ROWS.forEach(([what, row, forScan, forMobile]) => {
    check('dock · ' + what,
          [deskFn(row, 'scan'), deskFn(row, 'mobile')], [forScan, forMobile]);
  });

  if (!fs.existsSync(MOBILE)) {
    console.log('  --   Mobile not checked out; the phone copy is unread');
  } else {
    const phoneFn = lift(fs.readFileSync(MOBILE, 'utf8'),
                         'const mayRaiseFrom = (c, key) => {', '\n  };', 'mayRaiseFrom');
    if (!phoneFn) check('mayRaiseFrom is in the shipped phone form', false, true);
    else ROWS.forEach(([what, row, forScan, forMobile]) => {
      check('phone · ' + what,
            [phoneFn(row, 'scan'), phoneFn(row, 'mobile')], [forScan, forMobile]);
    });
  }
}

await browser.close();
srv.close();
console.log('\n' + (fail ? `FAILURES: ${fail}` : `all good — ${pass} checks`));
process.exit(fail ? 1 : 0);
})();
