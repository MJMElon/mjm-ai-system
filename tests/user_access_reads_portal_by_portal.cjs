/* USER ACCESS IS ONE BLOCK PER PORTAL, AND TWO OF THEM WERE NOT ON IT AT ALL.

   The screen was five flat doors in no particular order — the back office,
   the two phone apps, the worker register and this screen itself — with the
   FC Portal the only one carrying anything inside it. The office asked for it
   to read the way the company is arranged: a block per portal, and under each
   the things that portal offers.

   Two things fall out of that, and the second is the one that was actually
   broken:

   WORKER SYSTEM AND USER ACCESS SETTING ARE NOT SIBLINGS OF THE BACK OFFICE.
   They live inside it. Nothing about the ticks changed — they are the same
   two `scan_areas` keys with the same fallback — only where they are drawn.
   Which is exactly why the seeding had to learn about them: it walked the top
   level, and a nested door it no longer walked would stop being recorded and
   quietly leave everybody who had it.

   THE ADMIN PORTAL AND THE AUDITOR PORTAL WERE ON NO ACCESS SCREEN.
   `scan_areas.admin_portal` and `scan_areas.audit_portal` have gated their
   two doors on the 555 MJM Team page since they moved there, and were set by
   nothing — so the only way anybody held either was the fallback. They are
   blocks now, with what is inside them.

   What is inside them is stored where each module ALREADY reads it:

     Admin Portal   mobile_actions.<page>.view, mirrored to mobile_pages —
                    the shape shared/shared_module_access.js has written for
                    every module with its own User Access screen, and the one
                    MJMAccess.canDo('mobile', page, 'view') reads back. The
                    Mobile repo obeys it in AuthGate and on the dashboard.

     Auditor Portal audit_actions / audit_pages — THE SAME KEYS
                    audit/audit_user_access.html already writes. Two doors
                    onto one answer, not two answers, and this test lifts the
                    page keys out of that file so they cannot drift apart.

   And Seal Management is a MODULE, not a page of the Admin Portal, so its
   tick moves modules.seal — which the hub card and the seal dashboard
   already read — rather than inventing a key nothing obeys.

   Run: node tests/user_access_reads_portal_by_portal.cjs
   with `python3 -m http.server 8779` serving the repository root.        */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name + '  → ' + JSON.stringify(got)); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) +
                             '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

/* The people on the fixture. RUTH is the admin doing the setting; the other
   three are what the list has to be able to show.

   AZLAN holds the AUDIT module and no scan at all, which is the whole point
   of him: the list used to be filtered on `modules.scan` alone, so the one
   person this screen now grants the Auditor Portal to was not in it. */
const PEOPLE = [
  { id: 'u-ruth',  full_name: 'Ruth Wong',  email: 'ruth@mjmnursery.com',
    permissions: { modules: { scan: 'admin' }, manage_users: true } },
  { id: 'u-faiz',  full_name: 'Faiz Rahman', email: 'faiz@mjmnursery.com',
    permissions: { modules: { scan: 'normal' } } },
  { id: 'u-azlan', full_name: 'Azlan Omar', email: 'azlan@mjmnursery.com',
    permissions: { modules: { audit: 'normal' } } },
  { id: 'u-siti',  full_name: 'Siti Nurul', email: 'siti@mjmnursery.com',
    permissions: { modules: { mobile: 'normal', seal: 'admin' } } },
];

function mockSupabase(page) {
  return page.addInitScript((people) => {
    window.__saved = [];                       // every update this page sends
    const SESSION = { user: { id: 'u-ruth', email: 'ruth@mjmnursery.com',
                              user_metadata: { full_name: 'Ruth Wong' } } };

    function result(table) {
      if (table === 'shared_profiles') return { data: people, error: null };
      if (table === 'operation_nurseries') {
        return { data: [{ name: 'BNN', license: '1' }, { name: 'UNN 1', license: '2' },
                        { name: 'UNN 2', license: '3' }], error: null };
      }
      return { data: [], error: null };
    }

    function chain(table) {
      const res = result(table);
      const one = { data: people.find((p) => p.id === 'u-ruth'), error: null };
      const self = {
        select() { return self; }, eq() { return self; }, neq() { return self; },
        or() { return self; }, gt() { return self; }, gte() { return self; },
        lte() { return self; }, order() { return self; }, limit() { return self; },
        in() { return self; },
        /* shared_access.js reads the signed-in person's own row with
           maybeSingle/single; everything else on this page reads a list. */
        single() { return Promise.resolve(one); },
        maybeSingle() { return Promise.resolve(one); },
        update(payload) { window.__saved.push(payload); return self; },
        then(a, b) { return Promise.resolve(res).then(a, b); },
      };
      return self;
    }

    window.supabase = {
      createClient: () => ({
        from: (table) => chain(table),
        rpc: () => Promise.resolve({ data: [], error: null }),
        auth: {
          getSession: async () => ({ data: { session: SESSION }, error: null }),
          getUser: async () => ({ data: { user: SESSION.user }, error: null }),
          onAuthStateChange: (cb) => {
            setTimeout(() => { try { cb('INITIAL_SESSION', SESSION); } catch (e) {} }, 0);
            return { data: { subscription: { unsubscribe() {} } } };
          },
          signOut: async () => ({ error: null }),
        },
        storage: { from: () => ({ upload: async () => ({ data: {}, error: null }),
                                  getPublicUrl: () => ({ data: { publicUrl: '' } }),
                                  remove: async () => ({ error: null }) }) },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, people());
}

function people() { return JSON.parse(JSON.stringify(PEOPLE)); }

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));
  await mockSupabase(page);
  await page.route('**/cdn.tailwindcss.com/**', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**',
    (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('http://localhost:8779/scan/scan_user_access.html', { waitUntil: 'load' })
            .catch(() => {});
  await page.waitForTimeout(900);
  return page;
}

/* Open one person's panel. Faiz by default — an ordinary FC, nobody this
   screen has ever been through, which is the state every fallback is for. */
async function openRow(page, uid) {
  await page.click(`[data-edit="${uid}"]`);
  await page.waitForTimeout(250);
}

(async () => {
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

console.log('\n── 1. Five portals, in the order the office listed them ──');
{
  const page = await open(browser);
  checkTrue('the screen is called User Access, not User Setting',
            (await page.locator('.page-title').textContent()).trim() === 'User Access');

  /* Azlan holds audit and nothing else. He was invisible here until this
     change, which made the Auditor Portal block ungrantable to the one kind
     of person it exists for. */
  const names = await page.locator('.u-row .font-black.text-slate-800')
    .evaluateAll((els) => els.map((e) => e.textContent.trim()));
  checkTrue('somebody holding only the audit module is in the list',
            names.indexOf('Azlan Omar') >= 0);
  checkTrue('and somebody holding only the admin portal is too',
            names.indexOf('Siti Nurul') >= 0);

  await openRow(page, 'u-faiz');
  check('one block per portal, top level, in the office’s order',
        await page.locator('.panel > .area-block > label > span > .text-\\[14px\\]')
          .evaluateAll((els) => els.map((e) => e.textContent.trim())),
        ['Worker Portal Manage', '555 FC Portal', 'Admin Portal',
         '555 Worker Portal', 'Auditor Portal']);
  await page.close();
}

console.log('\n── 2. Worker System and Setting are INSIDE the back office ──');
{
  const page = await open(browser);
  await openRow(page, 'u-faiz');

  const manage = page.locator('.area-block').nth(0);
  check('the two tools are nested under Worker Portal Manage',
        await manage.locator('.page-block [data-area]')
          .evaluateAll((els) => els.map((e) => e.dataset.area)),
        ['workers', 'setting']);
  check('and they are drawn with the office’s own words',
        await manage.locator('.page-block .text-\\[13px\\]')
          .evaluateAll((els) => els.map((e) => e.textContent.trim())),
        ['Worker System', 'User Access Setting']);
  checkTrue('the register’s description is the one the office wrote',
            (await manage.locator('.page-block .text-\\[11px\\]').first().textContent())
              .indexOf('who is on the books, their section and their PIN') >= 0);

  /* THE SEEDING HAD TO FOLLOW THEM DOWN. areaOn() falls back for anybody
     nobody has been through this screen for, and openRow records what is
     drawn — so a nested door the seeding stopped walking would be saved as
     nothing and read as a no the next time. Faiz has no scan_areas at all,
     so every one of the seven must be written by merely opening his row. */
  const seeded = await page.evaluate(() => Object.keys(draft.scan_areas).sort());
  check('opening a row still records every door, nested ones included', seeded,
        ['admin_portal', 'audit_portal', 'fc', 'manage', 'setting', 'worker', 'workers'].sort());
  await page.close();
}

console.log('\n── 3. The FC Portal keeps its pages, and keeps the nurseries ──');
{
  const page = await open(browser);
  await openRow(page, 'u-faiz');
  const fc = page.locator('.area-block').nth(1);
  check('the five pages are unchanged',
        await fc.locator('[data-page]').evaluateAll((els) => els.map((e) => e.dataset.page)),
        ['barcode', 'do', 'maintenance', 'palms', 'culling']);
  check('and Maintenance still carries the three the office named',
        await fc.locator('[data-act="maintenance"]')
          .evaluateAll((els) => els.map((e) => e.dataset.actkey)).then((l) => l.slice(0, 3)),
        ['verify', 'edit', 'delete']);

  /* ONE NURSERY LIST, ON THE ONE BLOCK ANYTHING READS. The phone reads
     scan_area_nurseries.fc and nothing else (Barcode_Counter src/lib/access
     .js), so chips on the other four blocks were four lists that governed
     nothing — a question asked five times with one answer that counted. */
  check('nursery chips are on the FC Portal and nowhere else',
        await page.locator('[data-anall]').evaluateAll((els) => els.map((e) => e.dataset.anall)),
        ['fc']);
  await page.close();
}

console.log('\n── 4. The Admin Portal, Seal Management included ──');
{
  const page = await open(browser);
  await openRow(page, 'u-siti');
  const admin = page.locator('.area-block').nth(2);
  check('the four rows the office listed, in their order',
        await admin.locator('.page-block .text-\\[13px\\]')
          .evaluateAll((els) => els.map((e) => e.textContent.trim())),
        ['Issue Collection DO', 'Customer Consent',
         'Customer Collection Time Slot Booking', 'Seal Management']);
  check('all four are pages of the portal, stored under `mobile`',
        await admin.locator('[data-mpage]')
          .evaluateAll((els) => els.map((e) => e.dataset.mstore + ':' + e.dataset.mpage)),
        ['mobile:do_signing', 'mobile:consent', 'mobile:booking', 'mobile:seal']);

  /* Seal Management is the Admin Portal's OWN screen — the phone grew a
     seal.html of its own — and not the hub module of the same name. Ticking
     it here must not reach `modules.seal`, which is a different screen at a
     desk, granted on the main User Access as it always was. */
  await admin.locator('[data-mpage="seal"]').click();
  await page.waitForTimeout(150);
  check('unticking the portal\u2019s seal screen closes that page',
        await page.evaluate(() => draft.mobile_actions.seal.view), false);
  check('and leaves the hub module it shares a name with alone',
        await page.evaluate(() => draft.modules.seal), 'admin');
  await page.close();
}

console.log('\n── 5. The Auditor Portal writes the keys the audit module reads ──');
{
  /* Lifted out of audit/audit_user_access.html rather than typed again. That
     file is the module's own User Access screen; if its page keys move and
     these do not, one screen grants what the other cannot see. */
  const src = fs.readFileSync(path.join(__dirname, '..', 'audit', 'audit_user_access.html'), 'utf8');
  const moduleKeys = [...src.matchAll(/\{\s*key:\s*'([a-z_]+)',\s*label:'([^']+)'/g)]
    .map((m) => m[1]);

  const page = await open(browser);
  await openRow(page, 'u-azlan');
  const audit = page.locator('.area-block').nth(4);
  const drawn = await audit.locator('[data-mpage]')
    .evaluateAll((els) => els.map((e) => e.dataset.mpage));
  check('the four audits the office listed', drawn,
        ['plot_audit', 'height', 'papan', 'maintenance']);
  check('every one of them is a page the audit module knows',
        drawn.filter((k) => moduleKeys.indexOf(k) === -1), []);
  check('each carries the two actions and no more',
        await audit.locator('[data-mact]')
          .evaluateAll((els) => els.map((e) => e.dataset.mactpage + ':' + e.dataset.mact)),
        ['plot_audit:record', 'plot_audit:edit', 'height:record', 'height:edit',
         'papan:record', 'papan:edit', 'maintenance:record', 'maintenance:edit']);
  check('stored under `audit`, which is where that module reads them',
        [...new Set(await audit.locator('[data-mpage]')
          .evaluateAll((els) => els.map((e) => e.dataset.mstore)))],
        ['audit']);

  /* Untick one action and save: the whole audit block becomes explicit, the
     way that module's own screen writes it, and the `_pages` mirror follows
     the `view` beside it. */
  await audit.locator('[data-mact="edit"]').first().click();
  await page.waitForTimeout(120);
  await page.click('#save-btn');
  await page.waitForTimeout(400);
  const sent = await page.evaluate(() => window.__saved[window.__saved.length - 1].permissions);
  check('the touched page is written in full',
        sent.audit_actions.plot_audit, { view: true, record: true, edit: false });
  check('and its mirror agrees with it', sent.audit_pages.plot_audit, 'normal');
  await page.close();
}

console.log('\n── 6. The Worker Portal says where Maintenance is decided ──');
{
  const page = await open(browser);
  await openRow(page, 'u-faiz');
  const worker = page.locator('.area-block').nth(3);
  checkTrue('Maintenance is listed under it',
            (await worker.textContent()).indexOf('Maintenance') >= 0);
  /* AND IT IS NOT A TICK. A worker signs in with a PIN, so the modules on
     their phone hang off their row of the payroll register — nothing here
     could ever read a tick on an e-mail account, and a permission that is
     saved and not obeyed is worse than no permission at all. */
  check('and it is not a checkbox, because nothing here could read one',
        await worker.locator('.page-block input[type=checkbox]').count(), 0);
  checkTrue('the row names the two places that do decide it',
            (await worker.textContent()).indexOf('Portal View & Function') >= 0 &&
            (await worker.textContent()).indexOf('Worker Portal → Settings') >= 0);
  await page.close();
}

console.log('\n── 7. Looking is not deciding ──');
{
  /* The oldest rule on this screen: opening somebody's row and pressing Save
     without touching anything must not change what they hold. It is also the
     rule the two new blocks could most easily have broken — writing today's
     effective answer into every row that was merely LOOKED at turns "nobody
     has been asked" into a decision, and the module level stops answering
     for people it used to answer for. */
  const page = await open(browser);
  await openRow(page, 'u-faiz');
  await page.click('#save-btn');
  await page.waitForTimeout(400);
  const sent = await page.evaluate(() => window.__saved[window.__saved.length - 1].permissions);
  check('no Admin Portal answer is invented for somebody nobody asked about',
        [sent.mobile_actions, sent.mobile_pages], [undefined, undefined]);
  check('and no Auditor Portal one either',
        [sent.audit_actions, sent.audit_pages], [undefined, undefined]);
  /* The doors ARE recorded, which is the other half of the same rule and the
     reason the nested two had to be followed down. Recorded as what he
     EFFECTIVELY holds, which is not the same as yes to everything: Faiz is a
     scan normal with no npayroll, so the FC Portal is his and Worker System
     is not, and saving has to write both of those down rather than one. */
  check('while every door is written down, as what he actually holds',
        Object.keys(sent.scan_areas).sort(),
        ['admin_portal', 'audit_portal', 'fc', 'manage', 'setting', 'worker', 'workers'].sort());
  check('the FC Portal, which a scan normal holds', sent.scan_areas.fc.view, true);
  check('and Worker System, which needs npayroll he has not got',
        sent.scan_areas.workers.view, false);
  await page.close();
}

await browser.close();
console.log('\n' + (fail ? 'FAILURES: ' + fail + ' (passed ' + pass + ')'
                         : 'all good — ' + pass + ' checks'));
process.exit(fail ? 1 : 0);
})();
