/* Seal Manage had NO Module Assess Control at all -- not even the coarse
   admin/normal split every other module's own screen gives its pages.
   Ordering seals from the supplier, receiving them at HQ, packing a
   delivery, confirming one arrived, and settling a missed-scan gap had
   NO permission check whatsoever: anybody opened for Seal Manage at any
   level could do every one of them. Only the Settings tab was gated, and
   on isAdminOf('seal') alone -- a Manage Users holder with no seal admin
   level could not open it, unlike every other module's Settings-shaped
   screen.

   seal/seal_user_access.html is the new screen. hq.manage and
   nursery.settle both carry fallbackTo:'view', so the day this ships
   nothing anybody could already do is taken from them -- a saved tick is
   what narrows it from here. settings.manage stays adminOnly, now with
   the Manage Users bypass every other module's own Settings has.

   Run: node tests/seal_has_module_assess_control.cjs
   with `python3 -m http.server 8779` serving the repository root.      */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

function mockSupabase(page, { meId, rowsSeed }) {
  return page.addInitScript(({ meId, rowsSeed }) => {
    const rows = rowsSeed.map(r => ({ ...r, permissions: JSON.parse(JSON.stringify(r.permissions)) }));
    const me = rows.find(r => r.id === meId);
    window.__ROWS = rows;
    function profilesFrom() {
      function builder(state) {
        function resolveSingle() {
          const row = rows.find(r => String(r[state.eqCol]) === String(state.eqVal));
          return Promise.resolve({ data: row || null, error: null });
        }
        function exec() {
          if (state.update) {
            const row = rows.find(r => String(r[state.eqCol]) === String(state.eqVal));
            if (row) Object.assign(row, state.update);
            return Promise.resolve({ error: null });
          }
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
        rpc: (fn, args) => {
          if (fn === 'mjm_set_module_access') {
            const callerLvl = me.permissions.modules && me.permissions.modules[args.p_module || 'seal'];
            const callerMu = !!me.permissions.manage_users;
            if (!(callerMu || callerLvl === 'admin')) return Promise.resolve({ error: { message: 'not admin' } });
            const row = rows.find(r => r.id === args.target_id);
            if (row) { row.permissions[args.p_module + '_pages'] = args.p_pages; row.permissions[args.p_module + '_actions'] = args.p_actions; }
            return Promise.resolve({ error: null });
          }
          return Promise.resolve({ error: null, data: [] });
        },
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

const ADMIN  = { id: 'u-admin',  email: 'seal.admin@example.com', full_name: 'Seal Admin', user_type: 'system',
  permissions: { modules: { seal: 'admin' } } };
const NORMAL = { id: 'u-normal', email: 'normal@example.com', full_name: 'Plain Normal', user_type: 'system',
  permissions: { modules: { seal: 'normal' } } };
const MU_ONLY = { id: 'u-mu', email: 'mu@example.com', full_name: 'MU Only', user_type: 'system',
  permissions: { modules: { seal: 'normal' }, manage_users: true } };
const BLOCKED_HQ = { id: 'u-blocked', email: 'blocked@example.com', full_name: 'Blocked HQ', user_type: 'system',
  permissions: { modules: { seal: 'normal' }, seal_actions: { hq: { view: true, manage: false } } } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nseal_user_access.html opens for a seal admin and lists all five pages');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-admin', rowsSeed: [ADMIN, NORMAL] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/seal/seal_user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);

    check('page is not stuck on Forbidden', await page.locator('#main').evaluate(el => el.classList.contains('hidden')), false);
    await page.locator('.user-row:has-text("Plain Normal") [data-action="edit"]').click();
    await page.waitForTimeout(150);
    for (const label of ['Seal at MJM Nursery', 'Seal at HQ', 'Report', 'NELOS', 'Settings']) {
      checkTrue(`"${label}" page is listed`, await page.locator('#drawer').evaluate((b, l) => b.textContent.includes(l), label));
    }
    await page.close();
  }

  console.log('\nseal_dashboard.html: the write doors are open by default (nothing lost on day one)');
  {
    const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-normal', rowsSeed: [ADMIN, NORMAL, MU_ONLY, BLOCKED_HQ] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/seal/seal_dashboard.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(900);
    const result = await page.evaluate(() => { try { return typeof mayManageHQ === 'function' ? mayManageHQ() : 'no-fn'; } catch (e) { return 'threw: ' + e.message; } });
    check('an untouched plain normal user still may manage HQ (fallbackTo view)', result, true);
    check('the Module Assess Control link is hidden for a plain normal user', await page.locator('#st-user-access-link').isVisible(), false);
    await page.close();
  }

  console.log('\nseal_dashboard.html: a tick EXPLICITLY turned off is obeyed');
  {
    const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-blocked', rowsSeed: [ADMIN, NORMAL, BLOCKED_HQ] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/seal/seal_dashboard.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(900);
    const result = await page.evaluate(() => mayManageHQ());
    check('a user explicitly ticked off for HQ is refused', result, false);
    await page.close();
  }

  console.log('\nseal_dashboard.html: Settings is still admin-only by default, and Manage Users now bypasses it too');
  {
    const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-normal', rowsSeed: [ADMIN, NORMAL, MU_ONLY] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/seal/seal_dashboard.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(900);
    check('a plain normal (non-admin, non-MU) user cannot open Settings', await page.locator('#tab-settings-btn').isVisible(), false);
    check('a plain normal user gets no Module Assess Control link either', await page.locator('#st-user-access-link').isVisible(), false);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-mu', rowsSeed: [ADMIN, NORMAL, MU_ONLY] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/seal/seal_dashboard.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(900);
    checkTrue('a Manage Users holder with no seal admin level CAN open Settings (new)', await page.locator('#tab-settings-btn').isVisible());
    await page.locator('#tab-settings-btn').click();
    await page.waitForTimeout(150);
    checkTrue('…and gets the Module Assess Control link too', await page.locator('#st-user-access-link').isVisible());
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
