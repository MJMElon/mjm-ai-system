/* SEAL MANAGEMENT, the office side.
 *
 * Drives the real seal/seal_dashboard.html with a stubbed database and holds
 * it to what the office asked for:
 *
 *   - the module is HIDDEN until granted: a login with no seal level is sent
 *     back to the portal, as the Stock Inventory System is
 *   - the Seal List shows every range with its customer and status, and the
 *     four status cards add up the SEALS, not the rows
 *   - a card is a filter, and pressing it again lets go
 *   - typing in search asks the database, carrying what was typed -- a seal
 *     number search is the database's to answer, because a range holds
 *     numbers nobody typed
 *   - Problems names both customers and links the NELOS case
 *   - Settings is an admin's only
 *   - the hub tile and the User Access switch exist, so the module can be
 *     reached and granted at all
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/seal_dashboard.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

const FAKE_SUPABASE = `
window.__RPC = [];
window.supabase = { createClient: function () {
  function builder(table) {
    var b = { _eq: {} };
    ['neq','is','or','not','gt','gte','lt','lte','ilike','order','limit','select','in','range']
      .forEach(function (m) { b[m] = function () { return b; }; });
    b.eq = function (c, v) { b._eq[c] = v; return b; };
    b.single = b.maybeSingle = function () { b._one = true; return b; };
    b._settle = function () {
      var rows = table === 'shared_profiles' ? [window.__FAKE_PROFILE] : ((window.__ROWS || {})[table] || []);
      rows = rows.filter(function (r) { for (var k in b._eq) if (String(r[k]) !== String(b._eq[k])) return false; return true; });
      return { data: b._one ? (rows[0] || null) : rows, error: null };
    };
    b.then = function (r, j) { return Promise.resolve(b._settle()).then(r, j); };
    b.insert = function () { return Promise.resolve({ data: null, error: null }); };
    b.update = function () { return b; };
    return b;
  }
  return {
    from: builder,
    rpc: function (fn, args) {
      window.__RPC.push({ fn: fn, args: args });
      if (fn === 'seal_list') return Promise.resolve({ data: window.__SEGMENTS, error: null });
      return Promise.resolve({ data: [], error: null });
    },
    channel: function () { var c = { on: function(){return c;}, subscribe: function(){return c;} }; return c; },
    removeChannel: function () {},
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: window.__FAKE_SESSION }, error: null }); },
      getUser: function () { return Promise.resolve({ data: { user: window.__FAKE_SESSION.user }, error: null }); },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
      signOut: function () { return Promise.resolve({ error: null }); }
    }
  };
} };`;

const SEGMENTS = [
  { seg_status: 'collected', start_code: '0009001', end_code: '0009600', start_no: 9001, end_no: 9600, qty: 600, al_number: 'AL-1234', customer_name: 'Ah Seng Farm', consent_at: '2026-10-03T02:00:00Z', do_number: 'DO-1234-01', open_problems: 0 },
  { seg_status: 'pending',   start_code: '0009601', end_code: '0010000', start_no: 9601, end_no: 10000, qty: 400, al_number: 'AL-1234', customer_name: 'Ah Seng Farm', consent_at: '2026-10-03T02:00:00Z', do_number: null, open_problems: 0 },
  { seg_status: 'pending',   start_code: '0010001', end_code: '0012000', start_no: 10001, end_no: 12000, qty: 2000, al_number: 'AL-1240', customer_name: 'Kebun Maju', consent_at: '2026-10-05T02:00:00Z', do_number: null, open_problems: 1 },
  { seg_status: 'in_stock',  start_code: '0012001', end_code: '0020000', start_no: 12001, end_no: 20000, qty: 7999 + 1, al_number: null, customer_name: null, consent_at: '2026-10-01T00:00:00Z', do_number: null, open_problems: 0 },
];
const PROBLEMS = [
  { id: 7, kind: 'consent_overlap', status: 'open', seal_from: '0010001', seal_to: '0010050', qty: 50,
    al_number: 'AL-1240', customer_name: 'Kebun Maju', other_al: 'AL-1234', other_customer: 'Ah Seng Farm',
    detail: 'Seals 0010001 - 0010050 were given twice.', nelos_case_id: 88, created_at: '2026-10-06T00:00:00Z' },
];

let fails = 0;
function is(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'pass  ' : 'FAIL  ') + msg + (ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want)));
}

async function open(browser, port, level) {
  const page = await browser.newPage();
  // Catch-all FIRST: routes match in reverse registration order.
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('http://localhost:' + port)) return r.continue();
    return r.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  await page.route('**cdn.tailwindcss.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'document.addEventListener("DOMContentLoaded",function(){document.head.insertAdjacentHTML("beforeend","<style>.hidden{display:none}</style>")});' }));
  await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await page.addInitScript(({ level, segs, probs }) => {
    const user = { id: 'u1', email: 'office@mjmnursery.com', user_metadata: { full_name: 'Office' } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    const modules = { operation: 'admin' };
    if (level) modules.seal = level;
    window.__FAKE_PROFILE = { id: 'u1', email: user.email, user_type: 'system', permissions: { modules } };
    window.__SEGMENTS = segs;
    window.__ROWS = { seal_problems: probs, seal_settings: [{ id: 1, enforce_stock: false }], nelos_modules: [] };
    window.alert = () => {};
  }, { level, segs: SEGMENTS, probs: PROBLEMS });
  await page.goto('http://localhost:' + port + '/seal/seal_dashboard.html', { waitUntil: 'domcontentloaded' });
  return page;
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  try {
    // ── no level: sent back to the portal ──
    let page = await open(browser, port, null);
    await page.waitForURL(/index\.html/, { timeout: 5000 }).catch(() => {});
    is(/index\.html/.test(page.url()), true, 'a login with no seal level is sent back to the portal');
    await page.close();

    // ── normal level ──
    page = await open(browser, port, 'normal');
    await page.waitForSelector('#list-table table', { timeout: 5000 });
    const statQty = await page.$$eval('#stats .stat .text-2xl', (els) => els.map((e) => e.textContent));
    is(statQty, ['8,000', '2,400', '0', '600'], 'status cards add up seals, not rows (in stock, pending, scanned, collected)');
    const firstRow = await page.$eval('#list-table tbody tr', (tr) => [...tr.children].map((td) => td.textContent.trim()));
    is(firstRow.slice(0, 5), ['0009001 – 0009600', '600', 'Collected', 'Ah Seng Farm', 'AL-1234'], 'a row reads range, qty, status, customer, AL');
    is(await page.$$eval('#list-table tbody tr', (r) => r.length), 4, 'every range is listed');

    await page.click('#stats .stat[data-st="pending"]');
    is(await page.$$eval('#list-table tbody tr', (r) => r.length), 2, 'pressing Pending collection filters to its two ranges');
    await page.click('#stats .stat[data-st="pending"]');
    is(await page.$$eval('#list-table tbody tr', (r) => r.length), 4, 'pressing it again lets go');

    await page.fill('#q', '9655');
    await page.waitForFunction(() => window.__RPC.some((c) => c.fn === 'seal_list' && c.args.p_search === '9655'), null, { timeout: 3000 }).catch(() => {});
    is(await page.evaluate(() => window.__RPC.some((c) => c.fn === 'seal_list' && c.args.p_search === '9655')), true,
      'a typed seal number is asked of the database');

    is(await page.isVisible('#tab-settings-btn'), false, 'Settings is not offered to a normal user');

    await page.click('[data-tab="problems"]');
    await page.waitForSelector('#problems-table table', { timeout: 3000 });
    const prob = await page.$eval('#problems-table tbody tr', (tr) => tr.textContent);
    is(prob.includes('Kebun Maju') && prob.includes('Ah Seng Farm'), true, 'a problem names both customers');
    is(await page.$eval('#problems-table a[href*="nelos_case.html"]', (a) => a.getAttribute('href')), '../nelos/nelos_case.html?id=88', 'and links its NELOS case');
    is(await page.$eval('#prob-count', (e) => e.textContent), '(1)', 'the tab carries the open count');
    await page.close();

    // ── admin ──
    page = await open(browser, port, 'admin');
    await page.waitForSelector('#list-table table', { timeout: 5000 });
    is(await page.isVisible('#tab-settings-btn'), true, 'an admin is offered Settings');
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }

  // ── reachable and grantable ──
  const hub = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const tile = (hub.match(/<a class="module-card"[^>]*data-module="seal"[^>]*>/) || [''])[0];
  is(!!tile, true, 'the portal has a Seal Management tile');
  is(tile.includes('data-module-open'), false, 'and it is hidden until granted');
  const ua = fs.readFileSync(path.join(ROOT, 'user_access.html'), 'utf8');
  is(/const MODULES = \[[^\]]*'seal'/.test(ua) && ua.includes('id="d-mod-seal"'), true, 'User Access can grant it');

  console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
