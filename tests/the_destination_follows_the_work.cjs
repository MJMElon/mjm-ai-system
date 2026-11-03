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

/* ── The office's own six titles, and the rules off their screenshot ──
   "Repair Maintenance Work" is the one the FC Portal both raises AND
   solves; the three culling ones go out to Audit and HQ. "Nobody Set A
   Rule For This" is this test's own, because the no-rule fallback cannot
   be driven on a system whose every title carries one. */
const CATEGORIES = [
  { name: 'From Culling Calculator - Request Drone Flight',          module_key: 'scan' },
  { name: 'From Culling Calculator - Request HQ Verification',       module_key: 'scan' },
  { name: 'Request Transplanting Signboard',                         module_key: 'scan' },
  { name: 'Repair Maintenance Work',                                 module_key: 'scan' },
  { name: 'Nobody Set A Rule For This',                              module_key: 'scan' },
];
const ROUTES = [
  { source_module: 'scan', category: 'From Culling Calculator - Request Drone Flight',
    to_module: 'audit', to_seat_no: 2, to_user_id: 'u-auditor' },
  { source_module: 'scan', category: 'From Culling Calculator - Request HQ Verification',
    to_module: 'nursery_ops', to_seat_no: null, to_user_id: null },
  { source_module: 'scan', category: 'Request Transplanting Signboard',
    to_module: 'mobile', to_seat_no: 2, to_user_id: 'u-admin2' },
  { source_module: 'scan', category: 'Repair Maintenance Work',
    to_module: 'scan', to_seat_no: null, to_user_id: null },
];
const MODULES = [
  { key: 'operation',   label: 'Seedling Stock', handler_label: 'Seedling Stock', active: true },
  { key: 'nursery_ops', label: 'HQ Operation',   handler_label: 'HQ Operation',   active: true },
  { key: 'scan',        label: 'FC Portal',      handler_label: 'FC',             active: true },
  { key: 'mobile',      label: 'Admin Portal',   handler_label: 'Admin',          active: true },
  { key: 'audit',       label: 'Audit Portal',   handler_label: 'Auditor',        active: true },
];
const HANDLERS = [
  { user_id: 'u-admin2',  full_name: 'Florence Indun', email: 'f@x.com', primary_module: 'mobile' },
  { user_id: 'u-auditor', full_name: 'Rousell Wayne',  email: 'r@x.com', primary_module: 'audit' },
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

const pickWork = async (page, name) => {
  await page.selectOption('#nd-f-work', name);
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

await browser.close();
srv.close();
console.log('\n' + (fail ? `FAILURES: ${fail}` : `all good — ${pass} checks`));
process.exit(fail ? 1 : 0);
})();
