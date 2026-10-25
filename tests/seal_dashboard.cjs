/* SEAL MANAGE, the office side.
 *
 * Drives the real seal/seal_dashboard.html with a stubbed database and holds
 * it to what the office asked for:
 *
 *   - the module is HIDDEN until granted: a login with no seal level is sent
 *     back to the portal, as the Stock Inventory System is
 *   - it is called Seal Manage, and the ribbon [<- Portal] is the only way
 *     back: no Back button, and no User Access button either -- Settings is
 *     the one way into what the module is set to
 *   - Seal at MJM Nursery comes FIRST: in stock at the nursery, then every
 *     customer order, a running range read as one start and end
 *   - Seal at HQ opens on three blocks. Last seal number has a + that orders
 *     a RANGE, its start filled in after the last seal. Pending receive opens
 *     the orders, each in rows of 1,000, each row with its own Receive.
 *     Delivering to site opens the deliveries, which move like a parcel, and
 *     its + packs a new one
 *   - site keys the start and end AGAIN, compared with what HQ sent
 *   - Problems names both customers and links the NELOS case
 *   - Settings is an admin only
 *   - the two SQL files carry ONE seal_raise_case, word for word
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/seal_dashboard.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require((process.env.NODE_PATH || '/opt/node22/lib/node_modules') + '/playwright');

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
window.__INSERTS = [];
window.__UPDATES = [];
window.supabase = { createClient: function () {
  function builder(table) {
    var b = { _eq: {}, _neq: {}, _isnull: {} };
    ['or','not','gt','gte','lt','lte','ilike','order','limit','select','in','range']
      .forEach(function (m) { b[m] = function () { return b; }; });
    b.eq = function (c, v) { b._eq[c] = v; return b; };
    b.neq = function (c, v) { b._neq[c] = v; return b; };
    b.is = function (c, v) { b._isnull[c] = v; return b; };
    b.single = b.maybeSingle = function () { b._one = true; return b; };
    b._settle = function () {
      var rows = table === 'shared_profiles' ? [window.__FAKE_PROFILE] : ((window.__ROWS || {})[table] || []);
      rows = rows.filter(function (r) {
        for (var k in b._eq) if (String(r[k]) !== String(b._eq[k])) return false;
        for (var n in b._neq) if (String(r[n]) === String(b._neq[n])) return false;
        for (var z in b._isnull) if (b._isnull[z] === null && r[z] != null) return false;
        return true;
      });
      return { data: b._one ? (rows[0] || null) : rows, error: null };
    };
    b.then = function (r, j) {
      if (b._upd) { window.__UPDATES.push({ table: table, row: b._upd, eq: b._eq }); return Promise.resolve({ data: null, error: null }).then(r, j); }
      return Promise.resolve(b._settle()).then(r, j);
    };
    b.insert = function (rows) { window.__INSERTS.push({ table: table, rows: rows }); return Promise.resolve({ data: null, error: null }); };
    b.update = function (row) { b._upd = row; return b; };
    return b;
  }
  return {
    from: builder,
    storage: { from: function () { return { upload: function () { return Promise.resolve({ error: null }); }, getPublicUrl: function () { return { data: { publicUrl: 'x' } }; } }; } },
    rpc: function (fn, args) {
      window.__RPC.push({ fn: fn, args: args });
      var d = (window.__RPCDATA || {})[fn];
      if (typeof d === 'function') d = d(args);
      return Promise.resolve({ data: d || [], error: null });
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

// What seal_list hands back: one in-stock range the Customer page must not
// show, and AL-1240 split in two at 10500 -- the same status on both sides,
// so it is one run and must read as one start and end.
const SEGMENTS = [
  { seg_status: 'collected', start_code: '0009001', end_code: '0009600', start_no: 9001, end_no: 9600, qty: 600, al_number: 'AL-1234', customer_name: 'Ah Seng Farm', consent_at: '2026-10-03T02:00:00Z', do_number: 'DO-1234-01', open_problems: 0 },
  { seg_status: 'pending',   start_code: '0009601', end_code: '0010000', start_no: 9601, end_no: 10000, qty: 400, al_number: 'AL-1234', customer_name: 'Ah Seng Farm', consent_at: '2026-10-03T02:00:00Z', do_number: null, open_problems: 0 },
  { seg_status: 'pending',   start_code: '0010001', end_code: '0010500', start_no: 10001, end_no: 10500, qty: 500, al_number: 'AL-1240', customer_name: 'Kebun Maju', consent_at: '2026-10-05T02:00:00Z', do_number: null, open_problems: 1 },
  { seg_status: 'pending',   start_code: '0010501', end_code: '0012000', start_no: 10501, end_no: 12000, qty: 1500, al_number: 'AL-1240', customer_name: 'Kebun Maju', consent_at: '2026-10-05T02:00:00Z', do_number: null, open_problems: 1 },
  { seg_status: 'in_stock',  start_code: '0012001', end_code: '0020000', start_no: 12001, end_no: 20000, qty: 8000, al_number: null, customer_name: null, consent_at: '2026-10-01T00:00:00Z', do_number: null, open_problems: 0 },
];
const PROBLEMS = [
  { id: 7, kind: 'consent_overlap', status: 'open', seal_from: '0010001', seal_to: '0010050', qty: 50,
    al_number: 'AL-1240', customer_name: 'Kebun Maju', other_al: 'AL-1234', other_customer: 'Ah Seng Farm',
    detail: 'Seals 0010001 - 0010050 were given twice.', nelos_case_id: 88, created_at: '2026-10-06T00:00:00Z' },
];
const DELIVERIES = [
  { id: 5, site: 'UNN 1', status: 'packed', ranges: [{ start: '0030001', end: '0031000' }], packed_by: 'Amy', packed_at: '2026-10-20T01:00:00Z' },
  { id: 4, site: 'UNN 1', status: 'delivered', ranges: [{ start: '0029001', end: '0030000' }], packed_by: 'Amy', packed_at: '2026-10-18T01:00:00Z', delivered_by: 'Amy', delivered_at: '2026-10-19T01:00:00Z' },
];
// One order of 2,500 from 0040001: the first 1,000 received, the rest to come.
const ORDERS = [
  { id: 3, start_code: '0040001', end_code: '0042500', start_no: 40001, end_no: 42500, qty: 2500, status: 'Ordered', order_date: '2026-10-20', created_by: 'Amy' },
];
const HQ_RECEIPTS = [
  { id: 9, order_id: 3, ranges: [{ start: '0040001', end: '0041000' }], received_by: 'Amy', received_date: '2026-10-22' },
];
const RPCDATA = {
  seal_hq_summary: [{ last_code: '0042500', next_code: '0042501', hq_received: 6000, hq_stock: 4000, on_the_way: 2000, site_stock: 8000,
                      last_ordered_code: '0042500', next_order_code: '0042501', pending_receive: 1500 }],
  seal_hq_stock: [{ start_code: '0031001', end_code: '0033000', start_no: 31001, end_no: 33000, qty: 2000, received_date: '2026-10-15' },
                  { start_code: '0033001', end_code: '0035000', start_no: 33001, end_no: 35000, qty: 2000, received_date: '2026-10-16' }],
};

let fails = 0;
function is(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'pass  ' : 'FAIL  ') + msg + (ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want)));
}

async function open(browser, port, level, tab) {
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
  await page.addInitScript(({ level, segs, probs, dels, rpc, ords, hqr }) => {
    const user = { id: 'u1', email: 'office@mjmnursery.com', user_metadata: { full_name: 'Office' } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    const modules = { operation: 'admin' };
    if (level) modules.seal = level;
    window.__FAKE_PROFILE = { id: 'u1', email: user.email, user_type: 'system', permissions: { modules } };
    window.__RPCDATA = Object.assign({ seal_list: segs }, rpc);
    window.__ROWS = { seal_problems: probs, seal_settings: [{ id: 1, enforce_stock: false }], nelos_modules: [],
                      seal_deliveries: dels, seal_orders: ords, seal_hq_receipts: hqr, seal_receipts: [] };
    window.alert = () => {};
    window.confirm = () => true;
  }, { level, segs: SEGMENTS, probs: PROBLEMS, dels: DELIVERIES, rpc: RPCDATA, ords: ORDERS, hqr: HQ_RECEIPTS });
  await page.goto('http://localhost:' + port + '/seal/seal_dashboard.html' + (tab ? '?tab=' + tab : ''), { waitUntil: 'domcontentloaded' });
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

    // ── normal level: Seal at MJM Nursery first ──
    page = await open(browser, port, 'normal');
    await page.waitForSelector('#list-table table', { timeout: 5000 });
    is(await page.title(), 'Seal Manage', 'the module is called Seal Manage');
    is(await page.$eval('#mjm-ribbon', (e) => e.dataset.center), 'Seal Manage', 'and the ribbon says so');
    is(await page.$$eval('#main a', (as) => as.filter((a) => /back to main portal|user access/i.test(a.textContent)).length), 0,
      'no Back to Main Portal and no User Access button, only the ribbon [<- Portal]');
    is(await page.$$eval('#tabs .tab:not(.hidden)', (b) => b.map((x) => x.textContent.trim().replace(/\s+/g, ' '))),
      ['Seal at MJM Nursery', 'Seal at HQ', 'Problems (1)'], 'Seal at MJM Nursery first, then Seal at HQ, then Problems');
    is(await page.$eval('#tabs .tab.on', (b) => b.dataset.tab), 'nursery', 'and the page opens on Seal at MJM Nursery');

    const statQty = await page.$$eval('#cs-stats .stat .text-2xl', (els) => els.map((e) => e.textContent));
    is(statQty, ['8,000', '2,400', '0', '600'], 'four states at the nursery, adding up seals (in stock, pending, scanned, collected)');
    const heads = await page.$$eval('#list-table tr.cust-head', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
    is(heads.length === 3 && heads[0].startsWith('In stock at MJM Nursery') && heads[1].startsWith('Kebun Maju · AL-1240') && heads[2].startsWith('Ah Seng Farm · AL-1234'), true,
      'the stock at the nursery comes first, then one block per customer order, newest consent first');
    const lines = await page.$$eval('#list-table tbody tr:not(.cust-head)', (t) => t.map((r) => [...r.children].map((c) => c.textContent.trim())));
    is(lines[1].slice(0, 3), ['0010001 – 0012000', '2,000', 'Pending collection'], 'a running range with nothing else in the middle reads as one start and end');

    await page.click('#cs-stats .stat[data-st="pending"]');
    is(await page.$$eval('#list-table tbody tr:not(.cust-head)', (r) => r.length), 2, 'pressing Pending collection filters to its ranges');
    await page.click('#cs-stats .stat[data-st="pending"]');

    await page.fill('#q', '9655');
    await page.waitForFunction(() => window.__RPC.some((c) => c.fn === 'seal_list' && c.args.p_search === '9655'), null, { timeout: 3000 }).catch(() => {});
    is(await page.evaluate(() => window.__RPC.some((c) => c.fn === 'seal_list' && c.args.p_search === '9655')), true,
      'a typed seal number is asked of the database');

    // ── Seal at HQ: three blocks ──
    await page.click('[data-tab="hq"]');
    await page.waitForFunction(() => document.getElementById('blk-last-code').textContent !== '—', null, { timeout: 3000 }).catch(() => {});
    is(await page.$eval('#blk-last-code', (e) => e.textContent), '0042500', 'block 1 is the last seal number');
    is(await page.$eval('#blk-pending-qty', (e) => e.textContent), '1,500', 'block 2 is the seals still to be received');
    is(await page.$eval('#blk-deliver-qty', (e) => e.textContent), '2,000', 'block 3 is the seals delivering to site');
    await page.waitForSelector('#hq-list table', { timeout: 3000 });
    const hqRows = await page.$$eval('#hq-list tbody tr', (t) => t.map((r) => [...r.children].slice(0, 3).map((c) => c.textContent.trim())));
    is(hqRows.map((r) => r[2]), ['Delivering to site', 'Delivering to site', 'In HQ'], 'the list is every seal at HQ, In HQ or Delivering to site');
    is(hqRows[2].slice(0, 2), ['0031001 – 0035000', '4,000'], 'two receipts that meet are one run In HQ');

    // + on Last seal number: order a range
    await page.click('#btn-order');
    is(await page.$eval('#modal-title', (e) => e.textContent), 'Order new seal?', 'the + opens Order new seal?');
    is(await page.$eval('#ord-start', (e) => e.value), '0042501', 'the start is filled in after the last ordered seal');
    await page.fill('#ord-end', '0052500');
    await page.waitForFunction(() => /10,000/.test(document.getElementById('ord-msg').textContent), null, { timeout: 2000 }).catch(() => {});
    is((await page.$eval('#ord-msg', (e) => e.textContent)).includes('10,000 seals, 10 rows of 1,000'), true, 'it says how many seals and how many rows of 1,000');
    await page.click('#ord-save');
    await page.waitForFunction(() => window.__INSERTS.some((x) => x.table === 'seal_orders'), null, { timeout: 2000 }).catch(() => {});
    const ord = await page.evaluate(() => (window.__INSERTS.find((x) => x.table === 'seal_orders') || {}).rows);
    is(ord && [ord[0].start_code, ord[0].end_code, ord[0].qty, ord[0].created_by], ['0042501', '0052500', 10000, 'Office'], 'Save writes the order with its range');
    is(await page.isVisible('#modal'), false, 'and the window closes');

    // Pending receive: rows of 1,000, each with its own Receive
    await page.click('#blk-pending');
    await page.waitForSelector('#modal-body .border-slate-200', { timeout: 3000 });
    is((await page.$eval('#modal-body', (e) => e.textContent)).includes('1,000 / 2,500'), true, 'the order says how much of it has been received');
    await page.click('#modal-body .cursor-pointer');
    await page.waitForSelector('#modal-body .chunk', { timeout: 3000 });
    const chunks = await page.$$eval('#modal-body .chunk', (cs) => cs.map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
    is(chunks.length, 3, '2,500 seals open as three rows');
    is(chunks[0].includes('0040001 – 0041000') && chunks[0].includes('Received by Amy'), true, 'the first thousand reads as received, and by whom');
    is(chunks[2].includes('0042001 – 0042500') && chunks[2].includes('500') && chunks[2].includes('Receive'), true, 'the last row is the 500 left over, with its own Receive');
    await page.click('#modal-body .chunk:nth-child(3) button');
    await page.waitForFunction(() => window.__INSERTS.some((x) => x.table === 'seal_hq_receipts'), null, { timeout: 2000 }).catch(() => {});
    const rcv = await page.evaluate(() => (window.__INSERTS.find((x) => x.table === 'seal_hq_receipts') || {}).rows);
    is(rcv && [rcv[0].order_id, rcv[0].ranges, rcv[0].received_by], [3, [{ start: '0041001', end: '0042000' }], 'Office'],
      'Receive writes just that thousand to HQ, against its order');
    await page.click('#modal button:has-text("×")');

    // Delivering to site: the deliveries, like a parcel
    await page.click('#blk-deliver');
    await page.waitForSelector('#modal-body .track', { timeout: 3000 });
    const cards = await page.$$eval('#modal-body .track', (ts) => ts.map((t) => [...t.querySelectorAll('.stop')].map((s) => s.classList.contains('done') ? 'done' : s.classList.contains('now') ? 'now' : '-')));
    is(cards, [['done', 'now', '-'], ['done', 'done', 'now']], 'a packed delivery waits to reach the site office, a delivered one waits for site');
    await page.click('#modal-body button:has-text("Mark delivered")');
    await page.waitForFunction(() => window.__UPDATES.length > 0, null, { timeout: 2000 }).catch(() => {});
    const upd = await page.evaluate(() => window.__UPDATES[0]);
    is([upd && upd.table, upd && upd.row.status, upd && upd.row.delivered_by], ['seal_deliveries', 'delivered', 'Office'], 'Mark delivered writes who and when');

    // Site keys it again -- delivery #4 sent 0029001 - 0030000.
    await page.waitForSelector('#modal-body .track', { timeout: 3000 });
    await page.click('#modal-body > div > div:nth-child(2) button:has-text("confirm receive")');
    await page.fill('#cbox-4 [data-k="start"]', '0029001');
    await page.fill('#cbox-4 [data-k="end"]', '0029950');
    await page.waitForFunction(() => /Does not match/.test(document.getElementById('cmsg-4').textContent), null, { timeout: 2000 }).catch(() => {});
    is((await page.$eval('#cmsg-4', (e) => e.textContent)).includes('50 sent but not keyed: 0029951 – 0030000'), true,
      'a short count says which seals were not keyed');
    await page.fill('#cbox-4 [data-k="end"]', '0030000');
    await page.waitForFunction(() => /Matches/.test(document.getElementById('cmsg-4').textContent), null, { timeout: 2000 }).catch(() => {});
    await page.click('#csave-4');
    await page.waitForFunction(() => window.__INSERTS.some((x) => x.table === 'seal_receipts'), null, { timeout: 2000 }).catch(() => {});
    const rc = await page.evaluate(() => (window.__INSERTS.find((x) => x.table === 'seal_receipts') || {}).rows);
    is(rc && [rc[0].delivery_id, rc[0].received_by, rc[0].site], [4, 'Office', 'UNN 1'], 'confirming saves a site receipt naming the delivery');
    await page.click('#modal button:has-text("×")');

    // + on Delivering to site: pack a new delivery
    await page.click('#btn-deliver');
    is(await page.$eval('#modal-title', (e) => e.textContent), 'Deliver seals to site (UNN 1)', 'the + opens a new delivery, not the list');
    await page.fill('#dv-fill-qty', '2500');
    await page.click('#dv-fill');
    is(await page.$$eval('#dv-ranges input', (i) => i.map((x) => x.value)), ['0031001', '0033500'], 'Fill takes the lowest seals at HQ, as one run');
    await page.click('#dv-save');
    await page.waitForFunction(() => window.__INSERTS.some((x) => x.table === 'seal_deliveries'), null, { timeout: 2000 }).catch(() => {});
    const dv = await page.evaluate(() => (window.__INSERTS.find((x) => x.table === 'seal_deliveries') || {}).rows);
    is(dv && [dv[0].status, dv[0].packed_by, dv[0].ranges], ['packed', 'Office', [{ start: '0031001', end: '0033500' }]], 'a new delivery is saved Packed, by whoever packed it');

    is(await page.isVisible('#tab-settings-btn'), false, 'Settings is not offered to a normal user');

    // ── Problems ──
    await page.click('#modal button:has-text("×")').catch(() => {});
    await page.click('[data-tab="problems"]');
    await page.waitForSelector('#problems-table table', { timeout: 3000 });
    const prob = await page.$eval('#problems-table tbody tr', (tr) => tr.textContent);
    is(prob.includes('Kebun Maju') && prob.includes('Ah Seng Farm'), true, 'a problem names both customers');
    is(await page.$eval('#problems-table a[href*="nelos_case.html"]', (a) => a.getAttribute('href')), '../nelos/nelos_case.html?id=88', 'and links its NELOS case');
    await page.close();

    // ── old links land on the new pages ──
    page = await open(browser, port, 'normal', 'list');
    await page.waitForSelector('#list-table table', { timeout: 5000 });
    is(await page.$eval('#tabs .tab.on', (b) => b.dataset.tab), 'nursery', 'an old ?tab=list link opens Seal at MJM Nursery');
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
  const tile = (hub.match(/<a class="module-card"[^>]*data-module="seal"[^>]*>[\s\S]*?<\/a>/) || [''])[0];
  is(!!tile, true, 'the portal has a Seal tile');
  is(tile.includes('Seal<br>Manage'), true, 'and it says Seal Manage');
  is(/<a[^>]*data-module-open/.test(tile), false, 'and it is hidden until granted');
  const ua = fs.readFileSync(path.join(ROOT, 'user_access.html'), 'utf8');
  is(/const MODULES = \[[^\]]*'seal'/.test(ua) && ua.includes('id="d-mod-seal"') && ua.includes('>Seal Manage<'), true, 'User Access can grant it, under its new name');

  // ── one seal_raise_case ──
  const fn = (f) => { const s = fs.readFileSync(path.join(ROOT, 'shared', f), 'utf8'); const i = s.indexOf('CREATE OR REPLACE FUNCTION public.seal_raise_case'); return s.slice(i, s.indexOf('END $$;', i)); };
  is(fn('RUN_ME_seal_hq_delivery.sql') === fn('RUN_ME_seal_management.sql') && fn('RUN_ME_seal_management.sql').length > 500, true,
    'the two SQL files carry the same seal_raise_case, so running either one leaves the same titles');

  console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
