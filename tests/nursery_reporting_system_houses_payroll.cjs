/* Nursery Payroll System's own hub tile is now Nursery Reporting System, a
   module of its own that Payroll lives inside -- the same module key,
   npayroll, so nobody's access moved the day the tile's name and door
   changed under it. reporting/reporting_admin.html is the new landing
   page (the Payroll door plus one Module Assess Control for the whole
   system); reporting/reporting_user_access.html is npayroll_user_access.html
   moved there, unchanged in every tick it reads and writes. Payroll's own
   topbar lost its Module Assess Control icon -- that door is reached from
   Reporting's landing page now, not from inside Payroll.

   Run: node tests/nursery_reporting_system_houses_payroll.cjs
   with `python3 -m http.server 8779` serving the repository root.      */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

function mockHubSupabase(page, permissions) {
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

// shared_module_access.js (reporting_user_access.html) and npayroll's own
// dashboard both read the FULL profile LIST, not one row -- the simpler
// single-row mock above is enough for index.html/reporting_admin.html,
// which only ever ask about "me".
function mockRowsSupabase(page, { meId, rowsSeed }) {
  return page.addInitScript(({ meId, rowsSeed }) => {
    const rows = rowsSeed.map(r => ({ ...r, permissions: JSON.parse(JSON.stringify(r.permissions)) }));
    const me = rows.find(r => r.id === meId);
    function profilesFrom() {
      function builder(state) {
        function resolveSingle() {
          const row = rows.find(r => String(r[state.eqCol]) === String(state.eqVal));
          return Promise.resolve({ data: row || null, error: null });
        }
        function exec() {
          if (state.eqCol) {
            const row = rows.find(r => String(r[state.eqCol]) === String(state.eqVal));
            return Promise.resolve({ data: row ? [row] : [], error: null });
          }
          return Promise.resolve({ data: rows, error: null });
        }
        return {
          select() { return builder(state); },
          eq(col, val) { return builder(Object.assign({}, state, { eqCol: col, eqVal: val })); },
          order() { return builder(state); }, limit() { return builder(state); },
          maybeSingle() { return resolveSingle(); }, single() { return resolveSingle(); },
          then(a, b) { return exec().then(a, b); }, finally(f) { return exec().finally(f); },
        };
      }
      return builder({});
    }
    function chain(result) {
      const self = {
        select() { return self; }, eq() { return self; }, order() { return self; }, limit() { return self; },
        in() { return self; }, or() { return self; }, neq() { return self; }, is() { return self; }, not() { return self; },
        gt() { return self; }, gte() { return self; }, lt() { return self; }, lte() { return self; },
        range() { return Promise.resolve(result); }, maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(a, b) { return Promise.resolve(result).then(a, b); },
        finally(f) { return Promise.resolve(result).finally(f); },
      };
      return self;
    }
    window.supabase = {
      createClient: () => ({
        from: (table) => table === 'shared_profiles' ? profilesFrom() : chain({ data: [], error: null }),
        rpc: () => Promise.resolve({ error: null, data: [] }),
        auth: {
          getSession: async () => ({ data: { session: { user: { id: me.id, email: me.email, user_metadata: { full_name: me.full_name } } } }, error: null }),
          getUser: async () => ({ data: { user: { id: me.id, email: me.email } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null }),
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, { meId, rowsSeed });
}

const PAYROLL_ADMIN = { id: 'u-pay-admin', email: 'pay.admin@example.com', full_name: 'Pay Admin', user_type: 'system',
  permissions: { modules: { npayroll: 'admin' } } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nindex.html: the tile reads Nursery Reporting System and opens reporting_admin.html');
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockHubSupabase(page, { modules: { npayroll: 'admin' }, manage_users: true });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('http://localhost:8779/index.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(800);

    const card = page.locator('.module-card[data-module="npayroll"]');
    checkTrue('the card reads Nursery Reporting System', await card.locator('text=Nursery Reporting').count());
    check('the card still carries data-card="npayroll"', await card.evaluate(el => el.dataset.card), 'npayroll');
    check('the card opens reporting/reporting_admin.html', await card.evaluate(el => el.getAttribute('href')), 'reporting/reporting_admin.html');
    await page.close();
  }

  console.log('\nreporting_admin.html as a plain npayroll normal user');
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockHubSupabase(page, { modules: { npayroll: 'normal' } });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/reporting/reporting_admin.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);

    check('page is not stuck on Forbidden', await page.locator('#forbidden').evaluate(el => el.classList.contains('hidden')), true);
    checkTrue('the Payroll door is visible', await page.locator('#door-payroll').isVisible());
    check('the Payroll door opens npayroll_dashboard.html', await page.locator('#door-payroll').getAttribute('href'), '../npayroll/npayroll_dashboard.html');
    check('a plain normal user gets no Module Assess Control door', await page.locator('#door-user-access').isVisible(), false);
    await page.close();
  }

  console.log('\nreporting_admin.html as an npayroll admin');
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockHubSupabase(page, { modules: { npayroll: 'admin' } });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/reporting/reporting_admin.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);
    checkTrue('an npayroll admin DOES see the Module Assess Control door', await page.locator('#door-user-access').isVisible());
    check('it opens reporting_user_access.html', await page.locator('#door-user-access').getAttribute('href'), 'reporting_user_access.html');
    await page.close();
  }

  console.log('\nreporting_admin.html refuses somebody with no npayroll access at all');
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    // Holding SOME other module keeps this a real staff login rather than
    // a brand-new signup with nothing at all -- MJMStaffGate would redirect
    // that one to the hub before this page's own gate is ever asked.
    mockHubSupabase(page, { modules: { npayroll: 'none', operation: 'normal' } });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/reporting/reporting_admin.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);
    check('the forbidden card is shown', await page.locator('#forbidden').evaluate(el => el.classList.contains('hidden')), false);
    await page.close();
  }

  console.log('\nreporting_user_access.html carries every one of Payroll\'s old pages, unchanged');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockRowsSupabase(page, { meId: 'u-pay-admin', rowsSeed: [PAYROLL_ADMIN] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/reporting/reporting_user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);
    check('page is not stuck on Forbidden', await page.locator('#main').evaluate(el => el.classList.contains('hidden')), false);
    // The page labels only render inside the edit drawer (pageCardHtml),
    // not on the plain user listing -- open it for the one user seeded.
    await page.locator('.user-row:has-text("Pay Admin") [data-action="edit"]').click();
    await page.waitForTimeout(150);
    for (const label of ['Payroll · Work Maintenance', 'Payroll · Transplanting', 'Worker System', 'Piece Rate', 'System Setting · Lock Controls']) {
      checkTrue(`"${label}" page is still listed`, await page.locator('#drawer').evaluate((b, l) => b.textContent.includes(l), label));
    }
    checkTrue('the Back link goes to reporting_admin.html', await page.locator('a:has-text("Back to Nursery Reporting System")').count());
    await page.close();
  }

  console.log('\nnpayroll_dashboard.html no longer carries its own Module Assess Control door');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockRowsSupabase(page, { meId: 'u-pay-admin', rowsSeed: [PAYROLL_ADMIN] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/npayroll/npayroll_dashboard.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);
    check('#user-access-tab is gone from the page', await page.locator('#user-access-tab').count(), 0);
    checkTrue('the module still opens for an npayroll admin', await page.locator('#main').evaluate(el => !el.classList.contains('hidden')));
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
