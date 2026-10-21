/* SYSTEM SETTING GOVERNS BOTH PORTALS, AND IT WAS FILED UNDER ONE OF THEM.

   Location, Portal View & Function and Boundary decide what the 555 FC
   Portal AND the 555 Worker Portal each offer — the switch table has a
   column for each, side by side, and that is the whole point of it.

   It sat two doors down all the same:

       555 MJM Team -> Settings -> FC Portal Setting -> System Setting

   so the page that decides what a WORKER sees was filed under the
   conductor's own Setting. The office handed over the outline of it and
   asked for it on the MJM Team settings, so it moved out of
   scan_setting.html and up to the top of scan_settings_hub.html.

   The outline also carried the office's own words for two of the rows —
   "scan barcode counter" and "issue collection DO" — and a row headed one
   thing in the office and another on the screen that governs it is a row
   somebody has to ask about.

   What this test is really guarding is that the move cost nobody a route
   and moved nobody's saved switch: the KEYS behind those labels are what is
   stored, and renaming a label must never change which switch a tick is.

   Run: node tests/system_setting_is_not_the_fc_portals.cjs
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

function mockSupabase(page, permissions) {
  return page.addInitScript((perms) => {
    const SESSION = { user: { id: 'u1', email: 'ruth@mjmnursery.com',
                              user_metadata: { full_name: 'Ruth Wong' } } };
    function chain(result) {
      const self = {
        select() { return self; }, eq() { return self; }, single() { return self; },
        or() { return self; }, neq() { return self; }, gt() { return self; },
        order() { return self; }, limit() { return self; }, in() { return self; },
        gte() { return self; }, lte() { return self; },
        maybeSingle() { return Promise.resolve(result); },
        then(a, b) { return Promise.resolve(result).then(a, b); },
      };
      return self;
    }
    window.supabase = {
      createClient: () => ({
        from: (table) => chain(table === 'shared_profiles'
          ? { data: { full_name: 'Ruth Wong', email: 'ruth@mjmnursery.com', permissions: perms }, error: null }
          : { data: [], error: null }),
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
                                  remove: async () => ({ error: null }),
                                  download: async () => ({ data: null, error: null }) }) },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, permissions);
}

async function open(browser, url, perms) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));
  await mockSupabase(page, perms);
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('http://localhost:8779/scan/' + url, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(900);
  return page;
}

const ADMIN = { modules: { scan: 'admin' }, manage_users: true };

(async () => {
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

console.log('\n── 1. System Setting is its own section on the MJM Team settings ──');
{
  const page = await open(browser, 'scan_settings_hub.html', ADMIN);
  const sec = page.locator('#section-system');
  check('the section exists', await sec.count(), 1);
  checkTrue('and a scan admin sees it', await sec.isVisible());
  check('it opens the System Setting page',
        await sec.locator('a.tool').getAttribute('href'), 'scan_system_setting.html');
  /* textContent, not innerText: these labels are uppercased in CSS and
     innerText hands back what is DRAWN, so a comparison against the real
     spelling fails on a page that is perfectly correct. CLAUDE.md names
     this trap by itself. */
  check('it is labelled for what it governs, not for a portal',
        (await sec.locator('.portal-label').evaluate(e => e.textContent)).trim(), 'System Setting');
  /* FIRST, because it governs both portals and the per-portal sections
     under it govern one each. */
  const order = await page.locator('.portal-section').evaluateAll(els => els.map(e => e.id));
  check('and it comes before the per-portal sections', order[0], 'section-system');

  /* The FC section must stop claiming what it no longer leads to. */
  const fcSub = (await page.locator('#section-fc .tool-sub').evaluate(e => e.textContent)).toLowerCase();
  checkTrue('the FC Portal tile no longer offers "what each portal offers"',
            fcSub.indexOf('what each portal offers') < 0);
  await page.close();
}

console.log('\n── 2. Nobody is walked into a wall ──');
{
  /* Both pages ask for scan ADMIN and bounce anybody else to the phone app.
     A door that throws you somewhere else is worse than no door. */
  const page = await open(browser, 'scan_settings_hub.html',
                          { modules: { scan: 'normal' }, scan_areas: { setting: { view: true } } });
  checkTrue('a non-admin is not shown the System Setting section',
            !(await page.locator('#section-system').isVisible()));
  checkTrue('nor the FC Portal Setting one, which bounces the same way',
            !(await page.locator('#section-fc').isVisible()));
  checkTrue('and is not thrown off the Settings page itself',
            page.url().indexOf('scan_settings_hub.html') >= 0);
  await page.close();
}

console.log('\n── 3. It has left the FC Portal Setting page ──');
{
  const page = await open(browser, 'scan_setting.html', ADMIN);
  check('no System Setting tile remains there',
        await page.locator('#tool-system').count(), 0);
  checkTrue('and User Access, which really is that page, stays',
            await page.locator('#tool-users').count() > 0);
  await page.close();
}

console.log('\n── 4. The way out follows the way in ──');
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'scan', 'scan_system_setting.html'), 'utf8');
  const code = src.replace(/<!--[\s\S]*?-->/g, '');
  checkTrue('the back link goes to the Settings hub it is now reached from',
            code.indexOf('href="scan_settings_hub.html"') >= 0);
  checkTrue('and no longer to the FC Portal Setting page',
            code.indexOf('href="scan_setting.html"') < 0);
}

console.log('\n── 5. The rows carry the office\'s own words ──');
{
  const page = await open(browser, 'scan_system_setting.html', ADMIN);
  /* .pt-name, not the whole cell: the cell carries the STORED KEY beside
     the label, which is exactly what the last checks in this section are
     about and has no business in the list of what the office asked for. */
  const names = await page.locator('#m-body .pt-name').evaluateAll(
    els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));

  /* The outline, top to bottom. The dashed five are the sub-functions of
     Record work and keep their dash, which is how the table shows a level
     it has no column for. */
  check('every row the office listed is there, in their order', names, [
    'Scan Barcode Counter',
    'Issue Collection DO',
    'Maintenance',
    'Schedule maintenance work',
    'Record work',
    '— Batch selection',
    '— Worker selection',
    '— GPS track record',
    '— Upload photo',
    '— Remark',
    'PALMS',
    'Culling Calculator',
    /* Not on the outline, because that outline is the FC PORTAL column and
       this one is the Worker Portal's alone. Absent from one column is not
       the same as gone. */
    'Settings',
  ]);

  check('both portals still have a column of their own',
        await page.locator('thead .pt-p').evaluateAll(els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim())),
        ['📱 555 FC Portal', '👷 555 Worker Portal']);

  /* RENAMING A LABEL MUST NEVER MOVE A SAVED SWITCH. The key is what is
     stored; if it travelled with the label, every tick the office has ever
     set on Scan or Delivery Order would read as unset. */
  const keys = await page.locator('#m-body .pt-cell').evaluateAll(
    els => [...new Set(els.map(e => e.dataset.key + (e.dataset.fn ? ':' + e.dataset.fn : '')))]);
  checkTrue('the Scan switch is still stored under `scan`', keys.indexOf('scan') >= 0);
  checkTrue('and the DO one under `do`', keys.indexOf('do') >= 0);
  check('and no key was invented or lost',
        keys.sort(),
        ['culling', 'do', 'maintenance', 'maintenance:batches', 'maintenance:gps',
         'maintenance:photos', 'maintenance:record', 'maintenance:remark',
         'maintenance:schedule', 'maintenance:workers', 'palms', 'scan', 'settings'].sort());

  check('and the three cards of the outline are all still on the page',
        await page.locator('.card-name').evaluateAll(els => els.map(e => e.textContent.trim())),
        ['Location', 'Portal View & Function', 'Boundary']);
  checkTrue('with the Save button the outline names',
            await page.locator('#m-save').count() > 0);
  await page.close();
}

await browser.close();
console.log('\n' + (fail ? 'FAILURES: ' + fail + ' (passed ' + pass + ')'
                         : 'all good — ' + pass + ' checks'));
process.exit(fail ? 1 : 0);
})();
