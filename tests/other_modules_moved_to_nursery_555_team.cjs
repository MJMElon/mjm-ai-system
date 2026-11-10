/* Stock Inventory System, 555 Admin Portal, Training Center and 555 Portal
   Demo are not one of the 8 Nursery Sector modules, so their admin/normal/
   none controller moved off the main user_access.html onto Nursery 555
   Team's own Module Assess Control screen (scan_user_access.html), under
   "Other Modules". Same keys (`permissions.modules.<key>`), only the
   screen moved -- nothing here writes a new field or a new table.

   PORTAL_MODULES, the filter deciding who even appears on this screen,
   had to widen to the four OTHER_MODULES keys: before this, somebody
   holding ONLY Stock (say) and none of scan/mobile/audit was invisible
   on the one screen that could grant them anything.

   Run: node tests/other_modules_moved_to_nursery_555_team.cjs
   with `python3 -m http.server 8779` serving the repository root.      */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

const ME = { id: 'u-admin', email: 'admin@example.com', full_name: 'The Admin', permissions: { manage_users: true, modules: {} } };
// Holds ONLY stock -- no scan/mobile/audit -- to prove PORTAL_MODULES widened.
const STOCK_ONLY = { id: 'u-stockonly', email: 'stock.only@example.com', full_name: 'Stock Only',
  permissions: { modules: { stock: 'admin', operation: 'normal' }, scan_areas: {} } };

function mockSupabase(page) {
  return page.addInitScript(({ ME, STOCK_ONLY }) => {
    const rows = [ME, STOCK_ONLY].map(r => ({ ...r, permissions: JSON.parse(JSON.stringify(r.permissions)) }));
    window.__ROWS = rows;
    function chain(result) {
      const self = {
        select() { return self; }, eq() { return self; }, order() { return self; },
        then(a, b) { return Promise.resolve(result).then(a, b); },
        finally(f) { return Promise.resolve(result).finally(f); },
      };
      return self;
    }
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
    window.supabase = {
      createClient: () => ({
        from: (table) => {
          if (table === 'shared_profiles') return profilesFrom();
          if (table === 'operation_nurseries') return chain({ data: [], error: null });
          return chain({ data: [], error: null });
        },
        auth: {
          getSession: async () => ({ data: { session: { user: { id: ME.id, email: ME.email, user_metadata: { full_name: ME.full_name } } } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null }),
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, { ME, STOCK_ONLY });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));
  mockSupabase(page);
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('http://localhost:8779/scan/scan_user_access.html', { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(600);

  checkTrue('a person holding ONLY stock appears in the list (PORTAL_MODULES widened)',
    await page.locator('.u-row:has-text("Stock Only")').count());

  await page.locator('.u-row:has-text("Stock Only") [data-edit]').click();
  await page.waitForTimeout(150);
  checkTrue('Other Modules block is drawn', await page.locator('text=Other Modules').count());
  check('Stock select shows Admin (seeded from modules.stock)',
    await page.locator('select[data-othermod="stock"]').inputValue(), 'admin');
  check('Training select shows None (default)',
    await page.locator('select[data-othermod="training"]').inputValue(), 'none');

  await page.locator('select[data-othermod="training"]').selectOption('normal');
  await page.waitForTimeout(100);
  await page.locator('#save-btn').click();
  await page.waitForTimeout(300);

  const saved = await page.evaluate(() => window.__ROWS.find(r => r.id === 'u-stockonly').permissions);
  check('training was saved as normal', saved.modules.training, 'normal');
  check('stock (untouched) stayed admin', saved.modules.stock, 'admin');
  check('operation module level (unrelated field) untouched', saved.modules.operation, 'normal');

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
