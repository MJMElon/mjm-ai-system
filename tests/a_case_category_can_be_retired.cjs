/* A CASE CATEGORY CAN BE TAKEN OFF THE LIST, AND IT IS NEVER DELETED.

   The office asked for a cross on each row of Case Routing: "i want to
   delete request transplanting signboard category, i click x then this case
   category gone." It is gone from every list that offers it — both raise
   forms ask `active=true` — and it is marked INACTIVE rather than removed,
   for the reason every other cross in this system gives:

   A CASE KEEPS ITS CATEGORY AS TEXT. nelos_cases.category is the NAME, not
   a key, so retiring a title cannot orphan or rewrite one case ever raised
   under it. A DELETE would say the same thing to those cases and a
   different thing to the register, which is the one place recording that
   the title existed at all.

   Four more things this holds, each of which is a way it goes wrong:

   IT SAYS WHAT IT MOVES BEFORE ANYBODY PRESSES YES. The confirm counts the
   cases already raised under the title. A count that cannot be read says so
   rather than reading as nought -- "no case has ever been raised under it"
   over a category with forty is the one sentence that would make this the
   wrong decision.

   A CATEGORY THE SYSTEM RAISES BY ITSELF CANNOT GO FROM HERE. The words on
   Automate Cases are the module code's and are read, never set, so taking
   the row off this screen would not stop the case arriving -- it would hide
   the category it arrives under. The cross is disabled and its tooltip says
   why, rather than doing nothing.

   THE PERMISSION IS ASKED AGAIN AT THE WRITE. A cross drawn before
   somebody's access changed is still sitting on the screen.

   AND ADDING THE SAME TITLE BRINGS IT BACK. The unique index is on
   (module_key, lower(name)) and takes no notice of `active`, so an insert
   over a retired row comes back 23505 -- and this page cannot see the clash
   coming, because it only ever loads the active ones.

   Run: node tests/a_case_category_can_be_retired.cjs
   with `python3 -m http.server 8779` serving the repository root.        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name + '  → ' + JSON.stringify(got)); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) +
                             '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

/* FC Portal's own six, as the office's screenshot shows them, plus the two
   Culling Calculator ones the system opens by itself. */
const CATEGORIES = [
  { id: 1, module_key: 'scan', name: 'From Culling Calculator - Request Drone Flight',
    sort_order: 10, active: true,
    auto_condition: 'a culling report asks HQ for a drone flight' },
  { id: 2, module_key: 'scan', name: 'From Culling Calculator - Request Final Check For Pokok Inang',
    sort_order: 20, active: true,
    auto_condition: 'a culling report asks for a final check' },
  { id: 3, module_key: 'scan', name: 'Request Transplanting Signboard', sort_order: 30, active: true },
  { id: 4, module_key: 'scan', name: 'Repair Maintenance Work', sort_order: 40, active: true },
];

function mock(page) {
  return page.addInitScript((cats) => {
    window.__writes = [];                  // every write this page sends
    window.__confirms = [];                // every sentence it asked

    const MODULES = [
      { key: 'scan', label: 'FC Portal', icon: '📱', active: true, sort_order: 10 },
      { key: 'mobile', label: 'Admin Portal', icon: '📋', active: true, sort_order: 20 },
      { key: 'audit', label: 'Audit Portal', icon: '🔍', active: true, sort_order: 30 },
    ];
    const ROUTES = [
      { id: 9, source_module: 'scan', category: 'Request Transplanting Signboard',
        to_module: 'mobile', to_seat_no: null },
    ];

    /* How many cases were ever raised under the title. The page asks with
       head + exact, so the stub has to answer `count` and not rows. */
    const CASE_COUNT = { 'Request Transplanting Signboard': 3 };

    window.confirm = (msg) => { window.__confirms.push(msg); return window.__answer !== false; };
    window.alert = () => {};

    function table(name) {
      const self = {
        _eq: {}, _count: null,
        select(_cols, opts) { if (opts && opts.count) self._count = 0; return self; },
        eq(k, v) { self._eq[k] = v; return self; },
        ilike(k, v) { self._eq[k] = String(v).toLowerCase(); return self; },
        order() { return self; }, limit() { return self; }, not() { return self; },
        update(patch) {
          self._write = { table: name, op: 'update', patch, where: self._eq };
          window.__writes.push(self._write);
          return self;
        },
        insert(rows) {
          window.__writes.push({ table: name, op: 'insert', rows }); return self;
        },
        delete() { window.__writes.push({ table: name, op: 'delete' }); return self; },
        single() { return self; },
        then(a, b) { return Promise.resolve(self._result()).then(a, b); },
        _result() {
          if (self._write) {
            /* APPLIED HERE AND NOT IN update(), because the page writes
               `.update({…}).eq('name', …)` -- the eqs arrive AFTER the patch,
               so a stub that applies at update() time has no idea which row
               it is for. And it has to apply at all: a stub that records a
               write and then answers the next read as though it never
               happened cannot tell a revive from a second insert. */
            if (name === 'nelos_categories') {
              cats.forEach((c) => {
                const byId   = self._eq.id !== undefined && c.id === self._eq.id;
                const byName = self._eq.name !== undefined &&
                               c.module_key === self._eq.module_key && c.name === self._eq.name;
                if (byId || byName) Object.assign(c, self._write.patch);
              });
            }
            return { data: null, error: null };
          }
          if (name === 'nelos_modules')    return { data: MODULES, error: null };
          if (name === 'nelos_routes')     return { data: ROUTES, error: null };
          if (name === 'nelos_categories') {
            /* The retired lookup the Add box makes. Nothing is retired in
               this fixture until the test retires it, and the page reloads
               from here, so flip the row rather than keeping two lists. */
            if (self._eq.active === false) {
              const hit = cats.filter(c => !c.active &&
                c.module_key === self._eq.module_key &&
                c.name.toLowerCase() === self._eq.name);
              return { data: hit, error: null };
            }
            return { data: cats.filter(c => c.active !== false), error: null };
          }
          if (name === 'nelos_cases') {
            return { data: null, count: CASE_COUNT[self._eq.category] || 0, error: null };
          }
          return { data: [], error: null };
        },
      };
      return self;
    }

    window.supabase = {
      createClient: () => ({
        from: table,
        rpc: (fn) => Promise.resolve(fn === 'nelos_people'
          ? { data: [{ user_id: 'u1', full_name: 'Ruth Wong', email: 'ruth@x.com',
                       primary_module: 'mobile', seat_no: 1, access_modules: [],
                       sees_all_cases: false, may_solve: true }], error: null }
          : { data: [], error: null }),
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
        storage: { from: () => ({}) },
      }),
    };

    window.__admin = true;
  }, cats());
}

function cats() { return JSON.parse(JSON.stringify(CATEGORIES)); }

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));
  await mock(page);
  await page.route('**/cdn.tailwindcss.com/**', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**',
    (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  /* THE PAGE'S OWN SCRIPTS LOAD AFTER addInitScript AND WOULD OVERWRITE THE
     STUBS -- shared_access.js defines window.MJMAccess, and the CDN defines
     window.supabase. Served from here instead, so the gate answers what this
     test is driving. `__admin` is read on every call rather than captured,
     which is what lets section 5 take the permission away mid-page. */
  const js = (body) => (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body });
  await page.route('**/@supabase/supabase-js**', js(''));
  await page.route('**/shared/shared_access.js', js(`
    window.MJMAccess = {
      load: async () => ({}),
      user: () => ({ id: 'u1', full_name: 'Ruth Wong', email: 'ruth@x.com' }),
      isAdminOf: () => window.__admin,
      canManageUsers: () => window.__admin,
      permissions: () => ({}),
    };`));
  /* `esc` on this page IS MJMNelos.esc (line 399), so a stub without it
     takes the whole render down with "esc is not a function" -- caught by
     the boot's own try, which then bounces to the portal. A thinner stub
     than the thing it stands in for is the same fault this codebase has a
     heading about. */
  await page.route('**/shared/shared_nelos.js', js(`
    window.MJMNelos = {
      init: () => ({}), mountTodo: () => {}, countPending: async () => 0,
      esc: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                   .replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    };`));
  await page.goto('http://localhost:8779/nelos/nelos_user_setting.html', { waitUntil: 'load' })
            .catch(() => {});
  await page.waitForTimeout(900);
  // Case Routing, then open the FC Portal block.
  await page.click('.tab:has-text("Case Routing")').catch(() => {});
  await page.waitForTimeout(200);
  await page.click('[data-open="scan"]');
  await page.waitForTimeout(250);
  return page;
}

const writes = (page) => page.evaluate(() => window.__writes);

(async () => {
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

console.log('\n── 1. Every row carries a cross ──');
{
  const page = await open(browser);
  check('one per case category, in the office’s order',
        await page.locator('.rt-row .rt-x').evaluateAll((els) => els.map((e) => e.dataset.cat)),
        CATEGORIES.map((c) => c.name));
  /* The header gained a cell with them, or the five columns under it line
     up against four above. */
  check('the header has a column for it',
        await page.locator('.rt-sub span').count(), 5);
  await page.close();
}

console.log('\n── 2. A category the system opens by itself cannot go from here ──');
{
  const page = await open(browser);
  const state = await page.locator('.rt-row .rt-x').evaluateAll(
    (els) => els.map((e) => e.disabled));
  check('the two automatic ones are refused, the two hand-raised ones are not',
        state, [true, true, false, false]);
  checkTrue('and the refused one says why, in the condition’s own words',
            (await page.locator('.rt-x[data-cat*="Drone Flight"]').getAttribute('title'))
              .indexOf('asks HQ for a drone flight') >= 0);
  await page.close();
}

console.log('\n── 3. It says what it moves, then marks it inactive ──');
{
  const page = await open(browser);
  await page.click('.rt-x[data-cat="Request Transplanting Signboard"]');
  await page.waitForTimeout(400);

  const asked = (await page.evaluate(() => window.__confirms))[0] || '';
  checkTrue('the confirm names the category and the system',
            asked.indexOf('Request Transplanting Signboard') >= 0 && asked.indexOf('FC Portal') >= 0);
  checkTrue('and counts the cases already raised under it',
            asked.indexOf('3 cases already raised under it') >= 0);
  checkTrue('and says they are not touched',
            asked.indexOf('are not touched') >= 0);

  const w = await writes(page);
  check('ONE write, and it is an update that marks it inactive',
        w.map((x) => x.table + ':' + x.op + ':' + JSON.stringify(x.patch || x.rows || null)),
        ['nelos_categories:update:{"active":false}']);
  check('on the row it names, in the system it belongs to',
        w[0].where, { module_key: 'scan', name: 'Request Transplanting Signboard' });
  check('and NOTHING is ever deleted', w.filter((x) => x.op === 'delete'), []);
  await page.close();
}

console.log('\n── 4. Cancelling writes nothing ──');
{
  const page = await open(browser);
  await page.evaluate(() => { window.__answer = false; });
  await page.click('.rt-x[data-cat="Repair Maintenance Work"]');
  await page.waitForTimeout(400);
  checkTrue('it still asked', (await page.evaluate(() => window.__confirms)).length === 1);
  check('and sent nothing', await writes(page), []);
  await page.close();
}

console.log('\n── 5. The permission is asked again at the write ──');
{
  /* The page gate ran at boot. A cross drawn before somebody's access
     changed is still on the screen, so the write asks for itself. */
  const page = await open(browser);
  await page.evaluate(() => { window.__admin = false; });
  await page.click('.rt-x[data-cat="Repair Maintenance Work"]');
  await page.waitForTimeout(400);
  check('nothing is written', await writes(page), []);
  check('and it was not even asked', await page.evaluate(() => window.__confirms), []);
  await page.close();
}

console.log('\n── 6. It leaves the list, and the same title brings it back ──');
{
  const page = await open(browser);
  await page.click('.rt-x[data-cat="Request Transplanting Signboard"]');
  await page.waitForTimeout(500);

  check('the row is off the list after the reload',
        await page.locator('.rt-row .rt-x').evaluateAll((els) => els.map((e) => e.dataset.cat)),
        CATEGORIES.filter((c) => c.name !== 'Request Transplanting Signboard').map((c) => c.name));

  /* Type the same title into the Add box. The unique index is on
     (module_key, lower(name)) and takes no notice of `active`, so an INSERT
     here comes back 23505 -- and this page cannot see the clash coming,
     because it only ever loads the active ones. */
  await page.evaluate(() => { window.__writes = []; });
  await page.fill('.cat-new[data-mod="scan"]', 'request transplanting SIGNBOARD');
  await page.click('.cat-add[data-mod="scan"]');
  await page.waitForTimeout(500);

  const w = await writes(page);
  check('nothing is inserted over the retired row', w.filter((x) => x.op === 'insert'), []);
  check('it is switched back on instead',
        w.map((x) => x.table + ':' + x.op + ':' + JSON.stringify(x.patch || null)),
        ['nelos_categories:update:{"active":true}']);
  /* And it comes back under the spelling the office FIRST used, not the one
     they happened to type the second time. */
  check('and it is back on the list, spelled as it was',
        await page.locator('.rt-row .rt-x').evaluateAll((els) => els.map((e) => e.dataset.cat)),
        CATEGORIES.map((c) => c.name));
  await page.close();
}

await browser.close();
console.log('\n' + (fail ? 'FAILURES: ' + fail + ' (passed ' + pass + ')'
                         : 'all good — ' + pass + ' checks'));
process.exit(fail ? 1 : 0);
})();
