/* SYSTEM SETTING GOVERNS BOTH PORTALS, AND IT WAS FILED UNDER ONE OF THEM.

   Location, Portal View & Function and Boundary decide what the 555 FC
   Portal AND the 555 Worker Portal each offer — the switch table has a
   column for each, side by side, and that is the whole point of it.

   It sat THREE doors down all the same:

       555 MJM Team -> Settings -> FC Portal Setting -> System Setting

   so the page that decides what a WORKER sees was filed under the
   conductor's own Setting. The office handed over the outline of it and
   asked for it on the MJM Team settings, and then for the presses in
   between to go: "remove all this and remain the system setting only.
   make it straight view the system setting webpage when i clicked
   setting". So the Settings tile opens this page itself, and the two
   pages that stood between them are gone.

   NEITHER OF THEM HELD ANYTHING OF ITS OWN. scan_settings_hub.html was
   five sections of doors to doors: FC Portal Setting led to
   scan_setting.html, whose only tile was User Access — which is a tile on
   the Team page already; Admin Portal Setting led to a door that is also
   on the Team page; Worker Portal Setting led into the phone app; and
   Auditor Portal Setting led to the Audit back office, which has been its
   own hub module since the move before this one.

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

console.log('\n── 1. Settings opens the page itself, not a list of one ──');
{
  const page = await open(browser, 'scan_admin.html', ADMIN);
  const tile = page.locator('#tool-access');
  check('the Settings tile opens System Setting directly',
        await tile.getAttribute('href'), 'scan_system_setting.html');
  checkTrue('and a scan admin sees it', await tile.isVisible());
  /* textContent, not innerText: these labels are uppercased in CSS and
     innerText hands back what is DRAWN, so a comparison against the real
     spelling fails on a page that is perfectly correct. CLAUDE.md names
     this trap by itself. */
  check('it says what the page actually holds',
        (await tile.locator('.door-sub').evaluate(e => e.textContent)).trim(),
        'Location, what each portal offers & the boundary');
  /* User Access was the only thing under the pages that went, and it is
     here, which is what made removing them safe. */
  checkTrue('User Access is still a door of its own on this page',
            await page.locator('#tool-user-access').isVisible());
  await page.close();
}

console.log('\n── 2. The pages in between are gone, and nothing points at them ──');
{
  const dir = path.join(__dirname, '..', 'scan');
  for (const gone of ['scan_settings_hub.html', 'scan_setting.html']) {
    checkTrue(gone + ' is removed', !fs.existsSync(path.join(dir, gone)));
  }
  /* A link to a page that is not there is a 404 somebody finds by pressing
     it. Asked of the markup the browser gets, so the comments that explain
     the removal are free to name what went. */
  const dangling = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.html')) continue;
    const code = fs.readFileSync(path.join(dir, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    if (/href="scan_settings_hub\.html"|href="scan_setting\.html"/.test(code)) dangling.push(f);
  }
  check('and no page still links to either', dangling, []);
}

console.log('\n── 3. Nobody is walked into a wall ──');
{
  /* scan_system_setting.html asks for scan ADMIN and bounces anybody else
     to the phone app. A door that throws you somewhere else is worse than
     no door, so the tile hides on the same test the page applies. That
     check used to live on the hub; the hub is gone, the check is not. */
  /* It has to REACH the page for the check to mean anything: a login
     bounced off scan_admin.html shows no tile either, and a hidden-tile
     assertion that passes because the page never drew is a check that
     cannot fail. `manage` is what lets it in; `scan: normal` is what makes
     it not an admin. */
  const page = await open(browser, 'scan_admin.html',
                          { modules: { scan: 'normal' },
                            scan_areas: { manage: { view: true }, setting: { view: true } } });
  checkTrue('it reaches the Team page at all', page.url().indexOf('scan_admin.html') >= 0);
  checkTrue('and the other tools are drawn, so the page really rendered',
            await page.locator('#tool-user-access').isVisible());
  checkTrue('but the Settings tile, which would bounce it, is not shown',
            !(await page.locator('#tool-access').isVisible()));
  await page.close();
}

console.log('\n── 4. The way out follows the way in ──');
{
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'scan', f), 'utf8')
                        .replace(/<!--[\s\S]*?-->/g, '');
  const sys = read('scan_system_setting.html');
  checkTrue('System Setting goes back to the page it is now opened from',
            sys.indexOf('href="scan_admin.html"') >= 0);
  /* User Access was reached through one of the pages that went, and its
     two Back links pointed at it — a back link to a deleted page is a 404
     on the way OUT, which is the worst place for one. */
  const ua = read('scan_user_access.html');
  checkTrue('and so does User Access, whose Back pointed at a page that is gone',
            ua.indexOf('href="scan_admin.html"') >= 0);
  check('with no Back left pointing anywhere else',
        (ua.match(/back-btn" href="([^"]+)"/g) || []), ['back-btn" href="scan_admin.html"']);
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
