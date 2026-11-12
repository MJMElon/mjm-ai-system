/* Nelos Case Log had no Module Assess Control at all. Automate Cases and
   User Setting (Case Handlers / seat assignment / Case Routing) were each
   gated the same way, in code: MJMAccess.isAdminOf('nelos') ||
   MJMAccess.canManageUsers(), with no way to hand either door to a
   trusted non-admin case handler without making them a full Nelos admin.

   nelos/nelos_user_access.html is the new screen, built on the shared
   engine like every other module's. It carries two pages -- Automate
   Cases and User Setting -- each with one adminOnly action ("manage").
   Nothing about the per-case rights (solve/edit/delete/close/create,
   set on User Setting -> Case Handlers) moves: those stay a seat-based
   system of their own, on purpose, and this screen's own `note` says so.

   mayOpenAutomation() / maySettings() are the runtime reads, one in each
   guarded page and a third copy on the dashboard (for the two doors),
   mirroring effectiveActions()'s own adminOnly default: a saved row wins
   outright, and with none the module level decides -- which is exactly
   the old gate, so nobody who could open either door before loses it on
   the day this ships.

   Run: node tests/nelos_has_module_assess_control.cjs
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
    window.__RPC_CALLS = [];

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
          order() { return builder(state); },
          limit() { return builder(state); },
          maybeSingle() { return resolveSingle(); },
          single() { return resolveSingle(); },
          update(vals) { return builder(Object.assign({}, state, { update: vals })); },
          then(a, b) { return exec().then(a, b); },
          finally(f) { return exec().finally(f); },
        };
      }
      return builder({});
    }
    function chain(result) {
      const self = {
        select() { return self; }, eq() { return self; }, order() { return self; }, limit() { return self; },
        in() { return self; }, or() { return self; }, neq() { return self; }, is() { return self; }, not() { return self; },
        then(a, b) { return Promise.resolve(result).then(a, b); },
        finally(f) { return Promise.resolve(result).finally(f); },
      };
      return self;
    }

    window.supabase = {
      createClient: () => ({
        from: (table) => table === 'shared_profiles' ? profilesFrom() : chain({ data: [], error: null }),
        rpc: (fn, args) => {
          window.__RPC_CALLS.push({ fn, args });
          if (fn === 'mjm_set_module_access') {
            const callerLvl = me.permissions.modules && me.permissions.modules[args.p_module || 'nelos'];
            const callerMu = !!me.permissions.manage_users;
            const isAdmin = callerLvl === 'admin';
            if (!(callerMu || isAdmin)) return Promise.resolve({ error: { message: 'not admin' } });
            const row = rows.find(r => r.id === args.target_id);
            if (row) {
              row.permissions[args.p_module + '_pages'] = args.p_pages;
              row.permissions[args.p_module + '_actions'] = args.p_actions;
            }
            return Promise.resolve({ error: null });
          }
          if (fn === 'nelos_my_rights') {
            return Promise.resolve({ error: { message: 'no such function' } });
          }
          return Promise.resolve({ error: null, data: [] });
        },
        auth: {
          getSession: async () => ({ data: { session: { user: { id: me.id, email: me.email, user_metadata: { full_name: me.full_name } } } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null }),
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, { meId, rowsSeed });
}

const ADMIN  = { id: 'u-admin',  email: 'nelos.admin@example.com', full_name: 'Nelos Admin', user_type: 'system',
  permissions: { modules: { nelos: 'admin' } } };
const NORMAL = { id: 'u-normal', email: 'normal@example.com', full_name: 'Plain Normal', user_type: 'system',
  permissions: { modules: { nelos: 'normal' } } };
const TICKED_AUTOMATION = { id: 'u-ticked', email: 'ticked@example.com', full_name: 'Ticked For Automation', user_type: 'system',
  permissions: { modules: { nelos: 'normal' },
    nelos_actions: { automation: { view: true, manage: true } } } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nnelos_user_access.html exists and opens for a Nelos admin');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-admin', rowsSeed: [ADMIN, NORMAL] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/nelos/nelos_user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);

    check('page is not stuck on Forbidden', await page.locator('#main').evaluate(el => el.classList.contains('hidden')), false);
    checkTrue('page title says Module Assess Control', (await page.title()).includes('Module Assess Control'));
    checkTrue('Automate Cases page is listed', await page.locator('body').evaluate(b => b.textContent.includes('Automate Cases')));
    checkTrue('User Setting page is listed', await page.locator('body').evaluate(b => b.textContent.includes('User Setting')));
    checkTrue('the note says Case Handlers rights stay on User Setting', await page.locator('body').evaluate(b => b.textContent.includes('Case Handlers')));

    // Tick Automate Cases open for Plain Normal, leave User Setting shut.
    await page.locator('.user-row:has-text("Plain Normal") [data-action="edit"]').click();
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const el = document.querySelector('#d-act-automation-manage');
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.evaluate(() => document.getElementById('d-save').click());
    await page.waitForTimeout(300);

    const rpcCalls = await page.evaluate(() => window.__RPC_CALLS.map(c => c.fn));
    check('save went through mjm_set_module_access', rpcCalls.includes('mjm_set_module_access'), true);
    const saved = await page.evaluate(() => window.__ROWS.find(r => r.id === 'u-normal').permissions);
    checkTrue('nelos_actions.automation.manage was written for Plain Normal', !!(saved.nelos_actions && saved.nelos_actions.automation && saved.nelos_actions.automation.manage));
    check('nelos_actions.settings was left shut for Plain Normal', !!(saved.nelos_actions && saved.nelos_actions.settings && saved.nelos_actions.settings.manage), false);

    await page.close();
  }

  console.log('\nnelos_user_access.html refuses a plain normal nelos user');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-normal', rowsSeed: [ADMIN, NORMAL] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/nelos/nelos_user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);
    check('page shows Forbidden for a plain normal user', await page.locator('#forbidden').evaluate(el => el.classList.contains('hidden')), false);
    await page.close();
  }

  console.log('\nnelos_dashboard.html: each door obeys its own tick, not one gate for both');
  {
    const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-admin', rowsSeed: [ADMIN, NORMAL, TICKED_AUTOMATION] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/nelos/nelos_dashboard.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(900);
    checkTrue('admin sees Automation door',          await page.locator('#automation-btn').isVisible());
    checkTrue('admin sees User Setting door',        await page.locator('#user-setting-btn').isVisible());
    checkTrue('admin sees Module Assess Control door', await page.locator('#user-access-btn').isVisible());
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-normal', rowsSeed: [ADMIN, NORMAL, TICKED_AUTOMATION] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/nelos/nelos_dashboard.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(900);
    check('plain normal user gets no Automation door',   await page.locator('#automation-btn').isVisible(), false);
    check('plain normal user gets no User Setting door', await page.locator('#user-setting-btn').isVisible(), false);
    check('plain normal user gets no Module Assess Control door', await page.locator('#user-access-btn').isVisible(), false);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-ticked', rowsSeed: [ADMIN, NORMAL, TICKED_AUTOMATION] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/nelos/nelos_dashboard.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(900);
    checkTrue('ticked normal user gets the Automation door', await page.locator('#automation-btn').isVisible());
    check('ticked normal user still gets no User Setting door',        await page.locator('#user-setting-btn').isVisible(), false);
    check('ticked normal user still gets no Module Assess Control door', await page.locator('#user-access-btn').isVisible(), false);
    await page.close();
  }

  console.log('\nnelos_automation.html: the tick actually opens the door, not just shows it');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-ticked', rowsSeed: [ADMIN, NORMAL, TICKED_AUTOMATION] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/nelos/nelos_automation.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);
    check('ticked normal user is NOT bounced off Automate Cases', page.url().includes('nelos_automation.html'), true);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-normal', rowsSeed: [ADMIN, NORMAL, TICKED_AUTOMATION] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/nelos/nelos_automation.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);
    check('an untouched normal user IS bounced off Automate Cases, still', page.url().includes('nelos_dashboard.html'), true);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
