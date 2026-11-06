/* ADMIN NOW MEANS "MAY OPEN AND SAVE THIS MODULE'S OWN MODULE ASSESS CONTROL" --
   NOT "HOLDS MANAGE USERS."

   The main User Access screen lets the office set a person's level on each of
   the 8 nursery-sector modules to admin / normal / none. Before this change,
   "admin" on a module was read by nothing: the only thing that could ever
   open a module's own access screen, tick a page or an action for somebody
   else, or save that tick, was `manage_users` -- the database's own RLS
   policy on `shared_profiles` ("Manage users can update permissions") knows
   nothing about a module level, so a plain `.update()` by anybody else was
   refused regardless of what the page's JS gate allowed. A module Admin with
   no Manage Users could see the screen existed and could not use it.

   Two narrow SECURITY DEFINER functions close that gap --
   `mjm_set_module_access` (shared/RUN_ME_super_admin_and_module_access.sql)
   writes only `<module>_pages` / `<module>_actions` on the one row named,
   after checking the CALLER is an admin of that exact module or holds
   Manage Users; `mjm_set_operation_verify` does the same for
   `can_verify_operation`, which the database's own RLS on
   `operation_batch_verifications` reads directly and so cannot be left
   stale the way the legacy `modules.reports`/`.audit_trail` mirror can.

   `shared/shared_module_access.js` (the engine behind
   nursery_ops_user_access.html, npayroll_user_access.html and
   audit_user_access.html) and operation_user_access.html's own hand-written
   save both branch on it: Manage Users keeps the old full-object
   `.update()`, including the manage_users toggle and (on operation) the
   verify flag and its legacy `modules.*` mirror; a module-admin-only caller
   goes through the RPC instead, and the drawer disables the manage_users
   toggle and the audit module's own userField for them, and removes the
   System Setting tab outright (it is mounted during init, before
   `canFullSave` is known, so hiding it after the fact would leave its
   listeners reachable).

   Run: node tests/a_module_admin_saves_without_manage_users.cjs
   with `python3 -m http.server 8779` serving the repository root.        */
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
          const callerLvl = me.permissions.modules && me.permissions.modules[args.p_module || 'operation'];
          const callerMu = !!me.permissions.manage_users;
          const isAdmin = callerLvl === 'admin';
          if (fn === 'mjm_set_module_access') {
            if (!(callerMu || isAdmin)) return Promise.resolve({ error: { message: 'not admin' } });
            const row = rows.find(r => r.id === args.target_id);
            if (row) {
              row.permissions[args.p_module + '_pages'] = args.p_pages;
              row.permissions[args.p_module + '_actions'] = args.p_actions;
            }
            return Promise.resolve({ error: null });
          }
          if (fn === 'mjm_set_operation_verify') {
            const opLvl = me.permissions.modules && me.permissions.modules.operation;
            if (!(callerMu || opLvl === 'admin')) return Promise.resolve({ error: { message: 'not admin' } });
            const row = rows.find(r => r.id === args.target_id);
            if (row) row.permissions.can_verify_operation = args.can_verify;
            return Promise.resolve({ error: null });
          }
          return Promise.resolve({ error: null });
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

const NOPS_ADMIN = { id: 'u-nops-admin', email: 'nops.admin@example.com', full_name: 'Nops Admin', user_type: 'system',
  permissions: { modules: { nursery_ops: 'admin' } } };
const TARGET1 = { id: 'u-target1', email: 'target1@example.com', full_name: 'Target One', user_type: 'system',
  permissions: { modules: { nursery_ops: 'normal' } } };

const AUDIT_ADMIN = { id: 'u-audit-admin', email: 'audit.admin@example.com', full_name: 'Audit Admin', user_type: 'system',
  permissions: { modules: { audit: 'admin' } } };
const AUDIT_MU = { id: 'u-audit-mu', email: 'audit.mu@example.com', full_name: 'Audit MU', user_type: 'system',
  permissions: { modules: { audit: 'admin' }, manage_users: true } };
const TARGET2 = { id: 'u-target2', email: 'target2@example.com', full_name: 'Target Two', user_type: 'system',
  permissions: { modules: { audit: 'normal' } } };

const OP_ADMIN = { id: 'u-op-admin', email: 'op.admin@example.com', full_name: 'Op Admin', user_type: 'system',
  permissions: { modules: { operation: 'admin' } } };
const TARGET3 = { id: 'u-target3', email: 'target3@example.com', full_name: 'Target Three', user_type: 'system',
  permissions: { modules: { operation: 'normal' } } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nnursery_ops_user_access.html as a module Admin (not Manage Users)');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-nops-admin', rowsSeed: [NOPS_ADMIN, TARGET1] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/nursery_ops/nursery_ops_user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);

    check('page body is not stuck on Forbidden', await page.locator('#main').evaluate(el => el.classList.contains('hidden')), false);
    checkTrue('Target One appears in the list', await page.locator('.user-row:has-text("Target One")').count());

    await page.locator('.user-row:has-text("Target One") [data-action="edit"]').click();
    await page.waitForTimeout(150);
    check('manage-users toggle is disabled for a module-admin-only viewer', await page.locator('#d-manage-users').isDisabled(), true);

    // Flip the first page's Open Page tick off, then save. These ".tog"
    // inputs are 0x0 (the visible slider is a sibling span), so Playwright's
    // own actionability checks refuse them -- set the DOM state directly
    // and dispatch 'change', the same event the real toggle fires.
    await page.evaluate(() => {
      const el = document.querySelector('#d-pages input[data-view-page]');
      el.checked = false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.evaluate(() => document.getElementById('d-save').click());
    await page.waitForTimeout(300);

    const rpcCalls = await page.evaluate(() => window.__RPC_CALLS.map(c => c.fn));
    check('save went through mjm_set_module_access (the narrow RPC)', rpcCalls.includes('mjm_set_module_access'), true);
    const saved = await page.evaluate(() => window.__ROWS.find(r => r.id === 'u-target1').permissions);
    checkTrue('nursery_ops_actions was written on the target row', !!saved.nursery_ops_actions);
    check('manage_users on the target was NOT touched (stayed undefined/false)', !!saved.manage_users, false);

    await page.close();
  }

  console.log('\naudit_user_access.html: module Admin cannot reach System Setting or the userField, Manage Users can');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-audit-admin', rowsSeed: [AUDIT_ADMIN, AUDIT_MU, TARGET2] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/audit/audit_user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);

    check('page body is not stuck on Forbidden (audit admin)', await page.locator('#main').evaluate(el => el.classList.contains('hidden')), false);
    check('the System Setting tab is gone for a module-admin-only viewer', await page.locator('#ma-tab-system').count(), 0);

    await page.locator('.user-row:has-text("Target Two") [data-action="edit"]').click();
    await page.waitForTimeout(150);
    checkTrue('the audit_landing field is disabled for a module-admin-only viewer', await page.locator('#d-field-audit_landing').isDisabled());
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-audit-mu', rowsSeed: [AUDIT_ADMIN, AUDIT_MU, TARGET2] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/audit/audit_user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);
    checkTrue('a Manage-Users audit viewer DOES see the System Setting tab', await page.locator('#ma-tab-system').count());
    await page.close();
  }

  console.log('\noperation_user_access.html as a module Admin: pages/actions AND can_verify_operation both save');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-op-admin', rowsSeed: [OP_ADMIN, TARGET3] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/operation/operation_user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);

    check('page body is not stuck on Forbidden (operation admin)', await page.locator('#main').evaluate(el => el.classList.contains('hidden')), false);
    await page.locator('.user-row:has-text("Target Three") [data-action="edit"]').click();
    await page.waitForTimeout(150);
    // Tick the Verify-reports action on the Batch Records card.
    await page.evaluate(() => {
      const el = document.getElementById('d-act-batch-verify');
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.evaluate(() => document.getElementById('d-save').click());
    await page.waitForTimeout(300);

    const rpcCalls = await page.evaluate(() => window.__RPC_CALLS.map(c => c.fn));
    check('save called both mjm_set_module_access and mjm_set_operation_verify',
      rpcCalls.filter(f => f === 'mjm_set_module_access' || f === 'mjm_set_operation_verify').sort(),
      ['mjm_set_module_access', 'mjm_set_operation_verify']);
    const saved = await page.evaluate(() => window.__ROWS.find(r => r.id === 'u-target3').permissions);
    check('can_verify_operation was set to true on the target row', saved.can_verify_operation, true);
    checkTrue('operation_actions.batch.verify was set too', saved.operation_actions && saved.operation_actions.batch && saved.operation_actions.batch.verify);

    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
