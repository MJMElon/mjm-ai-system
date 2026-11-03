/* CUSTOMERS CANNOT ENTER THE STAFF SYSTEM.
 *
 * "Make the ai system, the admin portal, fc portal or whatever portal, all
 * staff system. Customer only can see sales web and customer portal."
 *
 * A Sales Web customer is an ordinary Supabase login whose shared_profiles
 * row says user_type = 'customer'. Same project, same password box, so
 * nothing stopped one signing in here -- and several doors failed OPEN on
 * top of that: a profile read that failed, or came back with no row, drew
 * every tile on the hub. shared/shared_staff_gate.js is the one rule now,
 * and this drives the REAL pages against a stubbed Supabase:
 *
 *   1. the rule itself, lifted out of the shipped file
 *   2. hub, customer profile         -> signed out, refusal only, no tiles
 *   3. hub, read returns {error}     -> no tiles, "could not check", Retry,
 *      nothing cached                   session KEPT (no sign out)
 *   4. hub, read error, cached staff -> enters (offline use)
 *      profile for the SAME user id
 *   5. hub, cached profile of a DIFFERENT user id is not used
 *   6. hub, staff profile            -> enters, tiles drawn, as before
 *   7. hub, no profile row           -> Pending, not every tile
 *   8. audit sign-in as a customer   -> refused, mjm_user never written
 *   9. audit_home, cached customer   -> refused, sent to the sign-in page
 *  10. audit sign-in as an auditor   -> in, as before
 *  11. an operation page that used to open for any session, as a customer
 *      -> refused, and nothing but the profile was ever read
 *
 * Run: node tests/customers_cannot_enter_the_staff_system.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require((process.env.NODE_PATH || '/opt/node22/lib/node_modules') + '/playwright')); }

const ROOT = path.resolve(__dirname, '..');
const MESSAGE = 'This is the MJM Nursery staff system. Customer accounts cannot sign in here. Please use the MJM Nursery shop at https://www.mjmnursery.com';
const UNREACHABLE = 'We could not check your account just now. Please check your connection and try again.';

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  const type = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html';
  res.writeHead(200, { 'Content-Type': type });
  res.end(fs.readFileSync(f));
});

/* A Supabase that answers what the test says. window.__CFG:
     session   the signed-in session, or null
     profile   what a shared_profiles read resolves to: {data, error}, or
               'throw' to reject
   Every table read is logged to sessionStorage.__reads, every sign out to
   sessionStorage.__signouts, so both survive a same-tab redirect. */
const STUB_SUPABASE = `
window.supabase = { createClient: function () {
  var cfg = window.__CFG || {};
  function log(k, v) { try { var a = JSON.parse(sessionStorage.getItem(k) || '[]'); a.push(v); sessionStorage.setItem(k, JSON.stringify(a)); } catch (e) {} }
  var listeners = [];
  var session = cfg.session || null;
  function builder(table) {
    log('__reads', table);
    var x = {};
    ['select','eq','neq','order','limit','in','is','gte','lte','gt','lt','not','or','ilike','like','range','match','contains','filter'].forEach(function (m) { x[m] = function () { return x; }; });
    function answer() {
      if (table !== 'shared_profiles') return Promise.resolve({ data: [], error: null });
      if (cfg.profile === 'throw') return Promise.reject(new Error('Failed to fetch'));
      return Promise.resolve(cfg.profile || { data: null, error: null });
    }
    x.maybeSingle = answer; x.single = answer;
    x.then = function (r, j) { return answer().then(function (v) {
      if (table === 'shared_profiles' && v && v.data && !Array.isArray(v.data)) v = { data: [v.data], error: v.error };
      return v; }).then(r, j); };
    x.insert = function () { return Promise.resolve({ data: null, error: null }); };
    x.upsert = x.insert; x.update = function () { return x; }; x.delete = function () { return x; };
    return x;
  }
  return {
    from: builder,
    rpc: function () { return Promise.resolve({ data: [], error: null }); },
    channel: function () { var c = { on: function(){return c;}, subscribe: function(){return c;} }; return c; },
    removeChannel: function () {},
    storage: { from: function () { return { getPublicUrl: function () { return { data: { publicUrl: '' } }; } }; } },
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: session }, error: null }); },
      getUser: function () { return Promise.resolve({ data: { user: session && session.user }, error: null }); },
      onAuthStateChange: function (cb) {
        listeners.push(cb);
        setTimeout(function () { cb(session ? 'INITIAL_SESSION' : 'INITIAL_SESSION', session); }, 0);
        return { data: { subscription: { unsubscribe: function () {} } } };
      },
      signInWithPassword: function (o) {
        session = cfg.signInSession;
        setTimeout(function () { listeners.forEach(function (cb) { cb('SIGNED_IN', session); }); }, 0);
        return Promise.resolve({ data: { user: session.user, session: session }, error: null });
      },
      signOut: function () {
        var n = Number(sessionStorage.getItem('__signouts') || 0) + 1;
        sessionStorage.setItem('__signouts', String(n));
        session = null;
        Object.keys(localStorage).forEach(function (k) { if (/^sb-.+-auth-token$/.test(k)) localStorage.removeItem(k); });
        return Promise.resolve({ error: null });
      },
      resetPasswordForEmail: function () { return Promise.resolve({ error: null }); },
      updateUser: function () { return Promise.resolve({ error: null }); },
      signUp: function () { return Promise.resolve({ error: null }); }
    }
  };
} };`;

let fails = 0;
function is(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'pass  ' : 'FAIL  ') + msg + (ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want)));
}

const USER = (id, email) => ({ id, email, user_metadata: { full_name: email.split('@')[0] } });
const SESSION = (id, email) => ({ access_token: 'tok-' + id, refresh_token: 'r', user: USER(id, email) });
const STAFF_PERMS = { modules: { operation: 'admin', seal: 'normal', audit: 'normal' }, manage_users: false };
const CUSTOMER_ROW = { id: 'c1', user_type: 'customer', role: null, full_name: 'Shop Customer', permissions: { modules: { salesweb: 'normal' } } };
const STAFF_ROW = { id: 'u1', user_type: 'system', role: 'staff', full_name: 'Amy', permissions: STAFF_PERMS };

async function open(browser, port, pagePath, opts) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  // Routes match in REVERSE registration order: the catch-all goes first.
  await page.route('**/*', (r) => r.request().url().startsWith('http://localhost:' + port)
    ? r.continue() : r.fulfill({ status: 200, contentType: 'text/plain', body: '' }));
  await page.route('**/cdn.jsdelivr.net/npm/@supabase/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB_SUPABASE }));
  if (opts.rest) await page.route('**/rest/v1/**', opts.rest);
  await page.addInitScript((o) => {
    window.__CFG = o.cfg;
    window.alert = function () {};
    if (!sessionStorage.getItem('__seeded')) {
      Object.keys(o.store || {}).forEach((k) => localStorage.setItem(k, o.store[k]));
      sessionStorage.setItem('__seeded', '1');
    }
  }, { cfg: opts.cfg || {}, store: opts.store || {} });
  await page.goto('http://localhost:' + port + '/' + pagePath, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(opts.wait || 700);
  return { page, ctx };
}

async function hubState(page) {
  return page.evaluate(() => {
    const vis = (el) => !!el && getComputedStyle(el).display !== 'none';
    const gate = document.getElementById('mjm-staff-gate');
    return {
      hub: vis(document.getElementById('hub-screen')),
      pending: vis(document.getElementById('pending-screen')),
      auth: vis(document.getElementById('auth-screen')),
      gateKind: gate ? gate.getAttribute('data-kind') : null,
      gateText: gate ? gate.querySelector('#mjm-staff-gate-msg').textContent : null,
      retry: !!document.getElementById('mjm-staff-gate-retry'),
      // Anything of the app a person could actually see.
      visibleBodyChildren: [...document.body.children].filter((c) => c.id !== 'mjm-staff-gate' && vis(c) && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE').length,
      // A tile a person could see: laid out at all, which nothing under a hidden screen is.
      tilesShown: [...document.querySelectorAll('.module-card')].filter((c) => c.getClientRects().length > 0).length,
      signouts: Number(sessionStorage.getItem('__signouts') || 0),
      mjmUser: localStorage.getItem('mjm_user'),
      lastKnown: Object.keys(localStorage).filter((k) => k.indexOf('mjm_perm_last__') === 0),
      sbToken: Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k)),
      reads: JSON.parse(sessionStorage.getItem('__reads') || '[]'),
      url: location.pathname + location.hash,
    };
  });
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    console.log('── 1. The rule, out of the shipped file ──');
    {
      const src = fs.readFileSync(path.join(ROOT, 'shared/shared_staff_gate.js'), 'utf8');
      const store = {};
      const win = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        document: { currentScript: null },
      };
      // eslint-disable-next-line no-new-func
      new Function('window', src)(win);
      const G = win.MJMStaffGate;
      is(G.CUSTOMER_MESSAGE, MESSAGE, 'the refusal is the owner\'s sentence, word for word');
      is(G.classify({ ok: true, profile: CUSTOMER_ROW }, 'c1').status, 'customer', 'a customer row is a customer');
      is(G.classify({ ok: true, profile: { user_type: 'Customer', permissions: { manage_users: true } } }, 'x').status, 'customer',
        'a customer is refused whatever permissions the row carries');
      is(G.classify({ ok: true, profile: STAFF_ROW }, 'u1').status, 'staff', 'a staff row is staff');
      is(G.classify({ ok: true, profile: null }, 'u1').status, 'pending', 'NO ROW is pending, never full access');
      is(G.classify({ ok: true, profile: { user_type: 'system', permissions: {} } }, 'u1').status, 'pending', 'a system account with nothing ticked is pending');
      is(G.classify({ ok: true, profile: { permissions: { nursery_ops_actions: { maintenance: { view: true } } } } }, 'u1').status, 'staff',
        'a ticked function counts, as shared_access.js always counted it');
      is(G.classify({ ok: false, error: { message: 'x' } }, 'u1').status, 'unknown', 'a failed read with nothing remembered is UNKNOWN');
      store['mjm_perm_last__u1'] = JSON.stringify({ ts: 1, data: STAFF_ROW });
      is(G.classify({ ok: false, error: {} }, 'u1').status, 'staff', 'a failed read stands on the last profile for the same id');
      is(G.classify({ ok: false, error: {} }, 'u2').status, 'unknown', 'and never on somebody else\'s');
      store['mjm_user'] = JSON.stringify({ id: 'c9', user_type: 'customer' });
      is(G.classify({ ok: false, error: {} }, 'c9').status, 'customer', 'a cached customer is still a customer offline');
      is(G.hasStaffAccess(null), false, 'hasStaffAccess(null) is false');
    }

    console.log('\n── 2. Hub, a customer ──');
    {
      const { page, ctx } = await open(browser, port, 'index.html', {
        cfg: { session: SESSION('c1', 'shop@cust'), profile: { data: CUSTOMER_ROW, error: null } },
        store: { 'sb-kib-auth-token': JSON.stringify(SESSION('c1', 'shop@cust')), mjm_user: JSON.stringify({ id: 'c1', email: 'shop@cust' }) },
      });
      const s = await hubState(page);
      is(s.gateKind, 'customer', 'the refusal panel is up');
      is(s.gateText, MESSAGE, 'and says only the refusal');
      is(s.signouts, 1, 'the session is signed out');
      is([s.hub, s.pending, s.auth, s.visibleBodyChildren], [false, false, false, 0], 'nothing of the hub is on screen');
      is(s.tilesShown, 0, 'no tile is drawn');
      is([s.mjmUser, s.lastKnown, s.sbToken], [null, [], false], 'and this device remembers nothing about them');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);
      is((await hubState(page)).gateText, MESSAGE, 'the refusal survives the redirect a sign out sets off');
      await ctx.close();
    }

    console.log('\n── 3. Hub, the read returns {error}, nothing cached ──');
    {
      const { page, ctx } = await open(browser, port, 'index.html', {
        cfg: { session: SESSION('u1', 'amy@mjm'), profile: { data: null, error: { message: 'JWT expired', code: '401' } } },
        store: { 'sb-kib-auth-token': JSON.stringify(SESSION('u1', 'amy@mjm')) },
      });
      const s = await hubState(page);
      is(s.gateKind, 'unknown', 'the could-not-check panel is up');
      is(s.gateText, UNREACHABLE, 'with the owner\'s sentence');
      is(s.retry, true, 'and a Retry');
      is([s.hub, s.tilesShown, s.visibleBodyChildren], [false, 0, 0], 'no hub, no tiles');
      is([s.signouts, s.sbToken], [0, true], 'the session is KEPT -- a dropped line is not a sign out');
      await ctx.close();
    }
    {
      const { page, ctx } = await open(browser, port, 'index.html', {
        cfg: { session: SESSION('u1', 'amy@mjm'), profile: 'throw' },
        store: { 'sb-kib-auth-token': JSON.stringify(SESSION('u1', 'amy@mjm')) },
      });
      const s = await hubState(page);
      is([s.gateKind, s.tilesShown, s.signouts], ['unknown', 0, 0], 'a THROWN read is held the same way');
      await ctx.close();
    }

    console.log('\n── 4. Hub, read error, cached staff profile for this account ──');
    {
      const { page, ctx } = await open(browser, port, 'index.html', {
        cfg: { session: SESSION('u1', 'amy@mjm'), profile: { data: null, error: { message: 'Failed to fetch' } } },
        store: { 'sb-kib-auth-token': JSON.stringify(SESSION('u1', 'amy@mjm')), mjm_perm_last__u1: JSON.stringify({ ts: 1, data: STAFF_ROW }) },
      });
      const s = await hubState(page);
      is([s.gateKind, s.hub], [null, true], 'offline with a remembered profile: the hub opens');
      is(s.tilesShown > 0, true, 'with that account\'s tiles');
      await ctx.close();
    }

    console.log('\n── 5. Hub, read error, cache belongs to somebody else ──');
    {
      const { page, ctx } = await open(browser, port, 'index.html', {
        cfg: { session: SESSION('u2', 'bob@mjm'), profile: { data: null, error: { message: 'Failed to fetch' } } },
        store: { 'sb-kib-auth-token': JSON.stringify(SESSION('u2', 'bob@mjm')), mjm_perm_last__u1: JSON.stringify({ ts: 1, data: STAFF_ROW }) },
      });
      const s = await hubState(page);
      is([s.gateKind, s.hub, s.tilesShown], ['unknown', false, 0], 'another account\'s copy opens nothing');
      await ctx.close();
    }

    console.log('\n── 6. Hub, a staff profile ──');
    {
      const { page, ctx } = await open(browser, port, 'index.html', {
        cfg: { session: SESSION('u1', 'amy@mjm'), profile: { data: STAFF_ROW, error: null } },
        store: { 'sb-kib-auth-token': JSON.stringify(SESSION('u1', 'amy@mjm')) },
      });
      const s = await hubState(page);
      is([s.gateKind, s.hub, s.pending, s.signouts], [null, true, false, 0], 'staff enter as before');
      is(s.tilesShown > 0, true, 'tiles drawn');
      is(JSON.parse(s.mjmUser).user_type, 'system', 'mjm_user carries user_type');
      await ctx.close();
    }

    console.log('\n── 7. Hub, no profile row ──');
    {
      const { page, ctx } = await open(browser, port, 'index.html', {
        cfg: { session: SESSION('u3', 'new@mjm'), profile: { data: null, error: null } },
        store: { 'sb-kib-auth-token': JSON.stringify(SESSION('u3', 'new@mjm')) },
      });
      const s = await hubState(page);
      is([s.hub, s.pending, s.signouts], [false, true, 0], 'no row is Pending Access, not every tile');
      await ctx.close();
    }

    console.log('\n── 8. Audit sign-in as a customer ──');
    {
      const { page, ctx } = await open(browser, port, 'audit/audit_index.html', {
        cfg: { session: null, signInSession: SESSION('c1', 'shop@cust'), profile: { data: CUSTOMER_ROW, error: null } },
      });
      await page.fill('#email', 'shop@cust');
      await page.fill('#password', 'secret');
      await page.evaluate(() => doLogin());
      await page.waitForTimeout(600);
      const s = await hubState(page);
      is(s.gateText, MESSAGE, 'refused with the refusal');
      is(s.mjmUser, null, 'mjm_user is never written');
      is(s.signouts, 1, 'and the session is signed out');
      is(s.url, '/audit/audit_index.html', 'nobody was sent on to the auditor view');
      await ctx.close();
    }

    console.log('\n── 9. audit_home with a cached customer ──');
    {
      const { page, ctx } = await open(browser, port, 'audit/audit_home.html', {
        cfg: { session: SESSION('c1', 'shop@cust'), profile: { data: CUSTOMER_ROW, error: null } },
        store: {
          'sb-kib-auth-token': JSON.stringify(SESSION('c1', 'shop@cust')),
          mjm_user: JSON.stringify({ id: 'c1', email: 'shop@cust', user_type: 'customer', permissions: { modules: { audit: 'normal' } } }),
        },
        wait: 1200,
      });
      const s = await hubState(page);
      is(s.url.indexOf('/audit/audit_index.html'), 0, 'sent to the sign-in page');
      is(s.gateText, MESSAGE, 'which shows the refusal');
      is([s.mjmUser, s.sbToken], [null, false], 'and the cached user and session are gone');
      await ctx.close();
    }
    {
      // The phone had no user_type cached; the fresh read says customer.
      const { page, ctx } = await open(browser, port, 'audit/audit_home.html', {
        cfg: { session: SESSION('c1', 'shop@cust'), profile: { data: CUSTOMER_ROW, error: null } },
        store: {
          'sb-kib-auth-token': JSON.stringify(SESSION('c1', 'shop@cust')),
          mjm_user: JSON.stringify({ id: 'c1', email: 'shop@cust', permissions: { modules: { audit: 'normal' } } }),
        },
        rest: (r) => r.request().url().includes('shared_profiles')
          ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CUSTOMER_ROW]) })
          : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
        wait: 1500,
      });
      const s = await hubState(page);
      is([s.url.indexOf('/audit/audit_index.html'), s.gateText], [0, MESSAGE], 'a fresh read saying customer refuses too');
      await ctx.close();
    }

    console.log('\n── 10. Audit sign-in as an auditor ──');
    {
      const AUD = { id: 'a1', user_type: 'system', role: 'Auditor', full_name: 'Ana', permissions: { modules: { audit: 'normal' } } };
      const { page, ctx } = await open(browser, port, 'audit/audit_index.html', {
        cfg: { session: null, signInSession: SESSION('a1', 'ana@mjm'), profile: { data: AUD, error: null } },
      });
      await page.fill('#email', 'ana@mjm');
      await page.fill('#password', 'secret');
      await page.evaluate(() => doLogin()).catch(() => {});
      await page.waitForURL('**/audit_home.html', { timeout: 5000 }).catch(() => {});
      const u = await page.evaluate(() => JSON.parse(localStorage.getItem('mjm_user') || 'null'));
      is([u && u.id, u && u.user_type], ['a1', 'system'], 'an auditor signs in as before, user_type stored');
      is(page.url().endsWith('/audit/audit_home.html'), true, 'and lands on the to-do list');
      await ctx.close();
    }

    console.log('\n── 11. An operation page that opened for any session ──');
    {
      const { page, ctx } = await open(browser, port, 'operation/operation_inventory_all.html', {
        cfg: { session: SESSION('c1', 'shop@cust'), profile: { data: CUSTOMER_ROW, error: null } },
        store: { 'sb-kib-auth-token': JSON.stringify(SESSION('c1', 'shop@cust')) },
        wait: 1200,
      });
      const s = await hubState(page);
      is(s.gateText, MESSAGE, 'a customer is refused');
      is(s.signouts >= 1, true, 'and signed out');
      is(s.visibleBodyChildren, 0, 'nothing of the page is on screen');
      is([...new Set(s.reads)], ['shared_profiles'], 'and nothing but their own profile was ever read');
      await ctx.close();
    }
    {
      const { page, ctx } = await open(browser, port, 'operation/operation_inventory_all.html', {
        cfg: { session: SESSION('u1', 'amy@mjm'), profile: { data: STAFF_ROW, error: null } },
        store: { 'sb-kib-auth-token': JSON.stringify(SESSION('u1', 'amy@mjm')) },
        wait: 1200,
      });
      const s = await hubState(page);
      is(s.gateKind, null, 'a staff member with stock access opens it');
      is(s.reads.filter((t) => t !== 'shared_profiles').length > 0, true, 'and the page loads its data');
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
