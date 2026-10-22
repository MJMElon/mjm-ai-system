/* "555 Worker Portal" renamed to "555 MJM Team"; Admin Portal and Audit
   Portal moved off the hub's own tile grid and onto scan_admin.html's own
   grid instead, alongside FC Portal, Worker Portal, Worker System and the
   new combined Settings hub.

   The real risk in moving two tiles off the hub is losing them for anyone
   who does not ALSO hold scan-module admin access -- scan_admin.html used
   to gate its whole page on exactly that, so an Admin Portal or Audit
   Portal user with no scan access at all would have been locked out
   entirely. That gate is loosened here (see the page's own comment); this
   test drives a user who holds ONLY audit access to prove it still works.

   Run: node tests/mjm_team_portal.cjs
   with `python3 -m http.server 8779` serving the repository root.        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

function mockSupabase(page, permissions) {
  return page.addInitScript((perms) => {
    function chain(result) {
      const self = {
        select() { return self; }, eq() { return self; }, single() { return self; },
        or() { return self; }, neq() { return self; }, gt() { return self; },
        order() { return self; }, limit() { return self; }, in() { return self; }, gte() { return self; },
        then(a, b) { return Promise.resolve(result).then(a, b); },
        finally(f) { return Promise.resolve(result).finally(f); },
      };
      return self;
    }
    window.supabase = {
      createClient: () => ({
        from: (table) => {
          if (table === 'shared_profiles') {
            return chain({ data: { full_name: 'Coco Lau', email: 'coco@mjmnursery.com', permissions: perms }, error: null });
          }
          return chain({ data: [], error: null });
        },
        auth: {
          getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'coco@mjmnursery.com', user_metadata: { full_name: 'Coco Lau' } } } }, error: null }),
          getUser: async () => ({ data: { user: { id: 'u1', email: 'coco@mjmnursery.com' } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null }),
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, permissions);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ─────────────────────────────────────────────────────────────────
  console.log('\nindex.html: the tile is renamed, the two moved tiles are gone');
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { modules: { scan: 'admin', mobile: 'admin', audit: 'admin' }, manage_users: true });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('http://localhost:8779/index.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(800);

    checkTrue('a "555 MJM Team" card exists', await page.locator('.module-card[data-module="scan"]').locator('text=555 MJM').count());
    check('no standalone "555 Admin Portal" card remains', await page.locator('.module-card[data-module="mobile"]').count(), 0);
    check('no standalone "555 Audit Portal" card remains', await page.locator('.module-card[data-card="audit"]').count(), 0);
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────
  console.log('\nscan_admin.html as a full scan admin who also holds Admin + Audit Portal');
  {
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    // 'worker' and 'workers' are not implied by scan admin alone -- the
    // worker-portal door is nobody's by default (see canScanArea's own
    // comment) and Worker System asks npayroll, not scan. A real full-access
    // admin holds both explicitly, so the mock does too.
    mockSupabase(page, {
      modules: { scan: 'admin', mobile: 'admin', audit: 'admin', npayroll: 'admin' },
      manage_users: true,
      scan_areas: { worker: { view: true } },
    });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('http://localhost:8779/scan/scan_admin.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(800);

    checkTrue('the welcome heading greets the signed-in name', (await page.locator('#welcome-heading').innerText()).includes('Coco Lau'));
    checkTrue('an "MJM Team" section label exists', await page.locator('.section-label', { hasText: 'MJM Team' }).count());
    checkTrue('a "System Setting" section label exists', await page.locator('.section-label', { hasText: 'System Setting' }).count());
    checkTrue('FC Portal door is visible', await page.locator('#fc-portal-link').isVisible());
    checkTrue('Worker Portal door is visible', await page.locator('#worker-portal-link').isVisible());
    checkTrue('Admin Portal door is visible', await page.locator('#admin-portal-link').isVisible());
    checkTrue('Audit Portal door is visible', await page.locator('#audit-portal-link').isVisible());
    checkTrue('Worker Namelist tool is visible', await page.locator('#tool-workers').isVisible());
    checkTrue('Worker Namelist is labelled as such, not the old "Worker System"', (await page.locator('#tool-workers').innerText()).includes('WORKER NAMELIST'));
    checkTrue('Settings tool is visible', await page.locator('#tool-access').isVisible());
    checkTrue('User Access tool is visible', await page.locator('#tool-user-access').isVisible());
    check('User Access tool points at the FC/Worker access page', await page.locator('#tool-user-access').getAttribute('href'), 'scan_user_access.html');
    /* Straight to the page. It pointed at a hub, and the hub is gone. */
    check('Settings tool opens the System Setting page itself', await page.locator('#tool-access').getAttribute('href'), 'scan_system_setting.html');
    check('Admin Portal door is a flat link to the Admin Portal', await page.locator('#admin-portal-link').getAttribute('href'), 'https://mobile.mjmnursery.com');
    /* It used to go to the back end for an admin and the to-do list for
       everybody else. The back end is its own hub module now ("Nursery
       Audit System"), so this door means one thing for everybody — see
       tests/the_audit_system_is_its_own_module.cjs. */
    check('Audit Portal door goes to the AUDITOR portal, admin or not', await page.locator('#audit-portal-link').getAttribute('href'), '../audit/audit_home.html');

    console.log('\n  -- drag-reordering the MJM Team cards persists across a reload --');
    const cardsBefore = await page.locator('#mjm-team-grid .door').evaluateAll(els => els.map(e => e.id));
    check('starts in document order', cardsBefore, ['fc-portal-link', 'admin-portal-link', 'worker-portal-link', 'audit-portal-link']);
    // Simulate the drag's end state directly (dragstart/dragover/drop are
    // unreliable to script through a real browser) and fire the same
    // dragend handler the real drag calls to persist the new order.
    await page.evaluate(() => {
      const grid = document.getElementById('mjm-team-grid');
      const audit = document.getElementById('audit-portal-link');
      grid.insertBefore(audit, grid.firstChild);
      audit.dispatchEvent(new Event('dragend'));
    });
    await page.reload();
    await page.waitForTimeout(800);
    const cardsAfter = await page.locator('#mjm-team-grid .door').evaluateAll(els => els.map(e => e.id));
    check('Audit Portal, dragged first, is still first after a reload', cardsAfter[0], 'audit-portal-link');
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────
  console.log('\nscan_admin.html as a NORMAL (non-admin) auditor with NO scan or mobile access at all');
  {
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { modules: { scan: 'none', mobile: 'none', audit: 'normal' }, manage_users: false });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('http://localhost:8779/scan/scan_admin.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(800);

    checkTrue('this login is NOT bounced back to index.html -- it reaches the grid', page.url().includes('scan_admin.html'));
    checkTrue('Audit Portal door is visible (this is the one door they hold)', await page.locator('#audit-portal-link').isVisible());
    check('Audit Portal door goes to the to-do list for a NON-admin auditor', await page.locator('#audit-portal-link').getAttribute('href'), '../audit/audit_home.html');
    checkTrue('FC Portal door is hidden (no scan access)', !(await page.locator('#fc-portal-link').isVisible()));
    checkTrue('Worker Portal door is hidden (no scan access)', !(await page.locator('#worker-portal-link').isVisible()));
    checkTrue('Admin Portal door is hidden (no mobile access)', !(await page.locator('#admin-portal-link').isVisible()));
    checkTrue('Settings tool is hidden (not a user manager)', !(await page.locator('#tool-access').isVisible()));
    checkTrue('User Access tool is hidden (not a user manager)', !(await page.locator('#tool-user-access').isVisible()));
    await page.close();
  }

  // ─────────────────────────────────────────────────────────────────
  console.log('\nscan_admin.html: somebody with NONE of scan / mobile / audit is sent back to the hub');
  {
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { modules: { scan: 'none', mobile: 'none', audit: 'none' }, manage_users: false });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('http://localhost:8779/scan/scan_admin.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(800);
    checkTrue('bounced off this page entirely', !page.url().includes('scan_admin.html') || page.url().includes('index.html'));
    await page.close();
  }

  /* The settings-hub section that stood here is gone with the page.
     scan_settings_hub.html was five sections of doors to doors — FC Portal
     Setting led to a page whose only tile was User Access, which is a tile
     on the Team page itself; Admin Portal Setting led to a door that is
     also on the Team page; Auditor Portal Setting led to the Audit back
     office, which is its own hub module now. The office asked for the four
     to go and for Settings to open the one real page directly, so the hub
     and scan_setting.html were both removed. What the Settings tile points
     at is asserted above and in
     tests/system_setting_is_not_the_fc_portals.cjs. */

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
