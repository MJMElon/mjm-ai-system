/* A PERSON WITH MORE THAN ONE PORTAL IS SHOWN THE DOORS.

   YM Chai was ticked for the FC, Worker, Admin and Auditor Portals on User
   Access, with Worker Portal Manage left off. The hub's Nursery 555 Team
   tile asked one question -- is she a scan ADMIN -- and, not being one, sent
   her straight to the FC Portal app, where the other three portals are
   nowhere. One portal goes straight there; more than one opens the page of
   doors (scan/scan_admin.html), and that page lets them in.

   Run: node tests/a_person_with_many_portals_sees_the_doors.cjs
   with `python3 -m http.server 8779` serving the repository root.        */
const { chromium } = require('playwright');

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
    const SESSION = { user: { id: 'u1', email: 'ymchai@example.com',
                              user_metadata: { full_name: 'YM Chai' } } };
    function chain(result) {
      const self = {
        select() { return self; }, eq() { return self; }, single() { return self; },
        or() { return self; }, neq() { return self; }, gt() { return self; },
        order() { return self; }, limit() { return self; }, in() { return self; }, gte() { return self; },
        /* index.html reads the profile with maybeSingle(). Without it the
           read comes back undefined, the hub falls open, and EVERY tile is
           shown — which is a gate test that cannot fail. */
        maybeSingle() { return Promise.resolve(result); },
        then(a, b) { return Promise.resolve(result).then(a, b); },
        finally(f) { return Promise.resolve(result).finally(f); },
      };
      return self;
    }
    window.supabase = {
      createClient: () => ({
        from: (table) => {
          if (table === 'shared_profiles') {
            return chain({ data: { full_name: 'YM Chai', email: 'ymchai@example.com',
                                   permissions: perms }, error: null });
          }
          return chain({ data: [], error: null });
        },
        auth: {
          getSession: async () => ({ data: { session: SESSION }, error: null }),
          getUser: async () => ({ data: { user: SESSION.user }, error: null }),
          /* The hub does its gating inside this callback, so a subscription
             that never fires is a page that never gates. */
          onAuthStateChange: (cb) => {
            setTimeout(() => { try { cb('INITIAL_SESSION', SESSION); } catch (e) {} }, 0);
            return { data: { subscription: { unsubscribe() {} } } };
          },
          signOut: async () => ({ error: null }),
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, permissions);
}

/* Tailwind comes from a CDN this harness refuses, so every card on the hub
   measures 0x0 and isVisible() answers false for all of them. The thing to
   ask is what the GATE wrote: applyModuleVisibility sets an inline
   display:none on a card it closes and clears it on one it opens, and that
   is the rule under test rather than a layout the harness cannot produce. */
const shown = (page, card) => page.evaluate((c) => {
  const el = document.querySelector('.module-card[data-card="' + c + '"]');
  return el ? el.style.display !== 'none' : null;
}, card);

async function openHub(browser, perms) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));
  await mockSupabase(page, perms);
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('http://localhost:8779/index.html', { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(800);
  return page;
}


/* What does the Nursery 555 Team tile on the hub open, and what is on the
   page behind it? Read off the real hub and the real scan_admin.html. */
async function hubTile(browser, perms) {
  const page = await openHub(browser, perms);
  const r = await page.evaluate(() => {
    const el = document.querySelector('.module-card[data-module="scan"]');
    return el ? { href: el.getAttribute('href'), shown: el.style.display !== 'none' } : null;
  });
  await page.close();
  return r;
}
async function doorsPage(browser, perms) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));
  await mockSupabase(page, perms);
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('https://scan.mjmnursery.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>app</p>' }));
  await page.goto('http://localhost:8779/scan/scan_admin.html', { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(900);
  const r = { url: page.url() };
  if (/scan_admin\.html/.test(r.url)) {
    r.doors = await page.evaluate(() => ['fc-portal-link', 'worker-portal-link', 'admin-portal-link', 'audit-portal-link']
      .filter((id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); }));
  }
  await page.close();
  return r;
}
const ticks = (o) => { const a = {}; Object.keys(o).forEach((k) => { a[k] = { view: o[k] }; }); return a; };

(async () => {
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/* YM Chai, as the office set her up: Worker Portal Manage unticked, and the
   FC, Worker, Admin and Auditor Portals ticked. */
const YM = { modules: { scan: 'normal', mobile: 'normal', audit: 'normal' },
             scan_areas: ticks({ manage: false, fc: true, worker: true, admin_portal: true, audit_portal: true }) };

console.log('\n── 1. Four portals and no Manage tick: the tile opens the doors ──');
{
  const t = await hubTile(browser, YM);
  check('the Nursery 555 Team tile is shown', t && t.shown, true);
  check('and it opens the page of portal doors, not the FC Portal app', t && t.href, 'scan/scan_admin.html');
  const d = await doorsPage(browser, YM);
  check('the doors page lets her in', /scan_admin\.html/.test(d.url), true);
  check('and offers all four portals she holds', d.doors, ['fc-portal-link', 'worker-portal-link', 'admin-portal-link', 'audit-portal-link']);
}

console.log('\n── 2. Two phone portals and nothing else: still the doors ──');
{
  const P = { modules: { scan: 'normal' }, scan_areas: ticks({ manage: false, fc: true, worker: true, admin_portal: false, audit_portal: false }) };
  const t = await hubTile(browser, P);
  check('the tile opens the doors page', t && t.href, 'scan/scan_admin.html');
  const d = await doorsPage(browser, P);
  check('the doors page lets them in, with both doors', d.doors, ['fc-portal-link', 'worker-portal-link']);
}

console.log('\n── 3. One portal: straight to it, as before ──');
{
  const FC = { modules: { scan: 'normal' }, scan_areas: ticks({ manage: false, fc: true, worker: false, admin_portal: false, audit_portal: false }) };
  const t = await hubTile(browser, FC);
  check('FC Portal only: the tile goes straight to the app', t && t.href, 'https://scan.mjmnursery.com');
  const d = await doorsPage(browser, FC);
  check('and the doors page sends them on to the app', /scan\.mjmnursery\.com/.test(d.url), true);
  const W = { modules: { scan: 'normal' }, scan_areas: ticks({ manage: false, fc: false, worker: true, admin_portal: false, audit_portal: false }) };
  const w = await hubTile(browser, W);
  check('Worker Portal only: straight to the Worker Portal', w && w.href, 'https://scan.mjmnursery.com/#/worker');
  const old = await hubTile(browser, { modules: { scan: 'normal' } });
  check('nobody configured, scan normal: the app, as it always was', old && old.href, 'https://scan.mjmnursery.com');
  const adm = await hubTile(browser, { modules: { scan: 'admin' } });
  check('a scan admin: the doors page, as it always was', adm && adm.href, 'scan/scan_admin.html');
}

console.log('\n── 4. The hub copy of the door rule matches the shared one ──');
{
  const fs = require('fs'), path = require('path');
  const hub = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const shared = fs.readFileSync(path.join(__dirname, '..', 'shared', 'shared_access.js'), 'utf8');
  const fallbacks = (s) => ['manage', 'fc', 'worker', 'admin_portal', 'audit_portal'].map((a) => {
    const m = s.match(new RegExp("case '" + a + "':\\s*return ([^;]+);"));
    return m ? m[1].replace(/\s+/g, '') : null;
  });
  const norm = (arr) => arr.map((x) => x && x
    .replace("isAdminOf('scan')", "lvl('scan')==='admin'")
    .replace("canAccess('scan')", "lvl('scan')!=='none'")
    .replace("canAccess('mobile')", "lvl('mobile')!=='none'")
    .replace("canAccess('audit')", "lvl('audit')!=='none'"));
  check('each portal falls back to the same rule on the hub as in shared_access.js', norm(fallbacks(shared)), fallbacks(hub));
}

await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
})();
