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
 *     a RANGE, its start filled in after the last seal. Seal pending receive
 *     lists the orders; > opens one as its receiving check list in rows of
 *     1,000, ticked start-and-end and received in one go. Seals delivery to
 *     MJM Nursery opens the deliveries, which move like a parcel, with + New
 *     delivery on the right. Both carry a History in place of a show-received
 *     tick
 *   - site keys the start and end AGAIN, compared with what HQ sent
 *   - NELOS lists every seal case, whoever has it, asked of seal_nelos_cases
 *   - Settings is an admin only, as a small gear at the end of the tabs
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
  seal_nelos_cases: [
    { id: 88, title: 'Seals 0010001 - 0010050 given twice, already with Ah Seng Farm (AL-1234), for Kebun Maju (AL-1240)', status: 'open', assigned_module: 'nursery_ops', assigned_module_label: 'Nursery Operation', assignee_name: 'Admin 2', created_at: '2026-10-06T00:00:00Z' },
    { id: 80, title: 'Seal 0009001 collected but on no consent', status: 'closed', assigned_module: 'nursery_ops', assigned_module_label: 'Nursery Operation', assignee_name: null, created_at: '2026-10-01T00:00:00Z' },
  ],
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
    // SEAL_TW_CSS names a Tailwind build of the page, for screenshots that
    // look like the real thing; the checks themselves do not need it.
    body: 'document.addEventListener("DOMContentLoaded",function(){var s=document.createElement("style");s.textContent='
      + JSON.stringify((process.env.SEAL_TW_CSS ? fs.readFileSync(process.env.SEAL_TW_CSS, 'utf8') : '') + '.hidden{display:none}')
      + ';document.head.appendChild(s)});' }));
  await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await page.addInitScript(({ level, segs, probs, dels, rpc, ords, hqr }) => {
    const user = { id: 'u1', email: 'office@mjmnursery.com', user_metadata: { full_name: 'Office' } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    const modules = { operation: 'admin' };
    if (level) modules.seal = level;
    window.__FAKE_PROFILE = { id: 'u1', email: user.email, user_type: 'system', permissions: { modules } };
    window.__RPCDATA = Object.assign({ seal_list: segs }, rpc);
    window.__ROWS = { seal_problems: probs, seal_settings: [{ id: 1, enforce_stock: false }], nelos_modules: [],
                      seal_deliveries: dels, seal_orders: ords, seal_hq_receipts: hqr, seal_receipts: [],
                      shared_do_records: [{ do_number: 'DO-1234-01', delivery_date: '2026-10-12' }] };
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
      ['Seal at MJM Nursery', 'Seal at HQ', 'Report', 'NELOS 1'], 'four tabs: Seal at MJM Nursery, Seal at HQ, Report, NELOS with its open count');
    is(await page.$eval('#tabs .tab.on', (b) => b.dataset.tab), 'nursery', 'and the page opens on Seal at MJM Nursery');
    if (process.env.SEAL_SHOTS) await page.screenshot({ path: process.env.SEAL_SHOTS + '/seal_nursery.png', fullPage: true });

    const blocks = await page.$$eval('[data-nv]', (els) => els.map((e) => [e.querySelector('.uppercase').textContent, e.querySelector('.text-2xl').textContent]));
    is(blocks, [['Seal with Customer', '2,400'], ['Seal in MJM Nursery Cabinet', '8,000'], ['Seal used', '600']],
      'three blocks: with customer (consent signed, not collected), the nursery cabinet, and used');
    is(await page.$eval('#nb-cust', (e) => e.classList.contains('on')), true, 'and the list under them opens on Seal with Customer');
    const heads = await page.$$eval('#list-table tr.cust-head', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
    is(heads.length === 2 && heads[0].startsWith('Kebun Maju · AL-1240') && heads[1].startsWith('Ah Seng Farm · AL-1234'), true,
      'one block per customer order, newest consent first');
    const lines = await page.$$eval('#list-table tbody tr:not(.cust-head)', (t) => t.map((r) => [...r.children].map((c) => c.textContent.trim())));
    is(lines[0], ['0010001 – 0012000', '2,000', 'Pending collection'], 'a running range with nothing else in the middle reads as one start and end');
    is((await page.$eval('#list-table', (e) => e.textContent)).includes('0009001'), false, 'a used seal is not listed as with the customer');

    await page.click('#nb-cab');
    is(await page.$$eval('#list-table tbody tr', (t) => t.map((r) => [...r.children].slice(0, 2).map((c) => c.textContent.trim()))),
      [['0012001 – 0020000', '8,000']], 'pressing the cabinet lists what is in it');
    await page.click('#nb-used');
    is(await page.$$eval('#list-table tbody tr', (t) => t.map((r) => [...r.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()))),
      [['0009001 – 0009600', '600', 'Ah Seng FarmAL-1234', 'DO-1234-01', '12 Oct 2026']], 'Seal used names the seals, the customer, the DO number and the DO date');
    if (process.env.SEAL_SHOTS) await page.screenshot({ path: process.env.SEAL_SHOTS + '/seal_used.png', fullPage: true });
    await page.click('#nb-cust');

    await page.fill('#q', '9655');
    await page.waitForFunction(() => window.__RPC.some((c) => c.fn === 'seal_list' && c.args.p_search === '9655'), null, { timeout: 3000 }).catch(() => {});
    is(await page.evaluate(() => window.__RPC.some((c) => c.fn === 'seal_list' && c.args.p_search === '9655')), true,
      'a typed seal number is asked of the database');

    // ── Seal at HQ: three blocks, ONE view under them ──
    await page.click('[data-tab="hq"]');
    await page.waitForSelector('#hq-view-body table', { timeout: 3000 });
    is(await page.$eval('#blk-last', (e) => e.textContent.includes('Seal in HQ Cabinet')), true, 'block 1 is called Seal in HQ Cabinet');
    is(await page.$eval('#blk-last-qty', (e) => e.textContent), '4,000', 'and counts what is in the cabinet');
    is(await page.$eval('#blk-last-sub', (e) => e.textContent), 'Last seal 0042500 · next order starts 0042501', 'the last seal and the next order start are a small line under it');
    is(await page.$eval('#blk-pending-qty', (e) => e.textContent), '1,500', 'block 2 is the seals still to be received');
    is(await page.$eval('#blk-deliver-qty', (e) => e.textContent), '2,000', 'block 3 is the seals delivering to the nursery');
    is(await page.$eval('#hq-view-title', (e) => e.textContent), 'Seal in HQ Cabinet', 'the view under the blocks opens on the cabinet');
    is(await page.$eval('#blk-last', (e) => e.classList.contains('on')), true, 'and its block is marked as the one showing');
    const cab = await page.$$eval('#hq-view-body tbody tr', (t) => t.map((r) => [...r.children].map((c) => c.textContent.trim())));
    is(cab, [['0031001 – 0035000', '4,000']], 'the cabinet is the seals In HQ only, two receipts that meet as one run');
    const align = await page.$eval('#hq-view-body table', (t) => [...t.querySelectorAll('th')].map((h, i) =>
      [getComputedStyle(h).textAlign, getComputedStyle(t.querySelector('tbody tr').children[i]).textAlign]));
    is(align.map(([h, d]) => (h === 'start' ? 'left' : h) === (d === 'start' ? 'left' : d)), [true, true], 'every heading sits on the same side as its figures (Qty right over the numbers)');
    is(await page.$$eval('#btn-order2, #blk-pending .plus', (x) => x.length), 0, 'Seal pending receive carries no + any more');
    is(await page.$$eval('.chip, #hq-filter, #hq-list', (x) => x.length), 0, 'no All / In HQ / Delivering chips any more');
    is(await page.isVisible('#modal'), false, 'pressing a block opens no window');
    // SEAL_SHOTS=dir saves what the page looks like, for a person to check.
    if (process.env.SEAL_SHOTS) await page.screenshot({ path: process.env.SEAL_SHOTS + '/seal_hq.png', fullPage: true });

    // + on block 1: order a range, in a window
    await page.click('#btn-order');
    is(await page.$eval('#modal-title', (e) => e.textContent), 'New Seal Order', 'the + opens New Seal Order in a window');
    is(await page.$eval('#ord-start', (e) => e.value), '0042501', 'the start is filled in after the last seal');
    is(await page.$eval('#ord-start', (e) => parseFloat(getComputedStyle(e).fontSize)) >= 16, true, 'the order window is set a size up');
    await page.fill('#ord-start', '0042601');
    await page.waitForFunction(() => /would start at/.test(document.getElementById('ord-warn').textContent), null, { timeout: 2000 }).catch(() => {});
    is((await page.$eval('#ord-warn', (e) => e.textContent)).includes('the next order would start at 0042501'), true, 'a start other than last order + 1 is warned about');
    if (process.env.SEAL_SHOTS) await page.screenshot({ path: process.env.SEAL_SHOTS + '/seal_order.png', fullPage: true });
    await page.fill('#ord-start', '0042501');
    await page.waitForFunction(() => !document.getElementById('ord-warn').textContent, null, { timeout: 2000 }).catch(() => {});
    is(await page.$eval('#ord-warn', (e) => e.textContent), '', 'and the warning goes when it is put back');
    await page.fill('#ord-end', '0052500');
    await page.waitForFunction(() => /10,000/.test(document.getElementById('ord-msg').textContent), null, { timeout: 2000 }).catch(() => {});
    is((await page.$eval('#ord-msg', (e) => e.textContent)).includes('10,000 seals, 10 rows of 1,000'), true, 'it says how many seals and how many rows of 1,000');
    await page.click('#ord-save');
    await page.waitForFunction(() => window.__INSERTS.some((x) => x.table === 'seal_orders'), null, { timeout: 2000 }).catch(() => {});
    const ord = await page.evaluate(() => (window.__INSERTS.find((x) => x.table === 'seal_orders') || {}).rows);
    is(ord && [ord[0].start_code, ord[0].end_code, ord[0].qty, ord[0].created_by], ['0042501', '0052500', 10000, 'Office'], 'Save writes the order with its range');
    is(await page.isVisible('#modal'), false, 'and the window closes');
    await page.waitForFunction(() => document.getElementById('hq-view-title').textContent === 'Seal pending receive', null, { timeout: 3000 }).catch(() => {});
    is(await page.$eval('#hq-view-title', (e) => e.textContent), 'Seal pending receive', 'and the view below moves to the orders waiting');

    // block 2: the list below
    await page.click('#blk-last');
    await page.click('#blk-pending');
    await page.waitForSelector('#hq-view-body tbody tr', { timeout: 3000 });
    is(await page.$eval('#blk-pending', (e) => e.classList.contains('on')), true, 'pressing block 2 marks it');
    const prow = await page.$eval('#hq-view-body tbody tr', (r) => [...r.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
    is([prow[0], prow[1].startsWith('0040001 – 0042500'), prow[2], prow[3]], ['20 Oct 2026', true, 'Amy', '>'], 'the view below lists each order: date, range, by whom, >');
    await page.click('#hq-view-body tbody tr button');
    await page.waitForSelector('#hq-view-body .chunk', { timeout: 3000 });
    is(await page.$eval('#hq-view-title', (e) => e.textContent), 'Order : 20 Oct 2026, 0040001 – 0042500 receiving check list', 'the order opens below as its receiving check list');
    is(await page.isVisible('#hq-view-back'), true, 'with a Back to the list');
    const chunks = await page.$$eval('#hq-view-body .chunk', (cs) => cs.map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
    is(chunks.length === 3 && chunks[0].includes('Received by Amy'), true, '2,500 seals as three rows, the first already received');
    is(await page.$$eval('#hq-view-body .chunk-head > div', (d) => d.map((x) => x.textContent)), ['Range', 'Quantity', 'Status'], 'the check list has its column headings');
    is((await page.$eval('#hq-view-body', (e) => e.textContent)).includes('Tick the first row'), false, 'and no subtitle above it');
    is(await page.$$eval('#rcv-clear', (x) => x.length), 0, 'Clear is not offered while nothing is ticked');
    await page.check('#hq-view-body input[data-s="41001"]');
    await page.check('#hq-view-body input[data-s="42001"]');
    is((await page.$eval('#hq-view-body', (e) => e.textContent)).includes('2 rows ticked · 1,500 seals'), true, 'tick a start and an end, and it counts them');
    is(await page.$$eval('#rcv-clear', (x) => x.length), 1, 'and Clear appears once something is ticked');
    if (process.env.SEAL_SHOTS) await page.screenshot({ path: process.env.SEAL_SHOTS + '/seal_receive.png', fullPage: true });
    await page.click('#rcv-save');
    await page.waitForFunction(() => window.__INSERTS.some((x) => x.table === 'seal_hq_receipts'), null, { timeout: 2000 }).catch(() => {});
    const rcv = await page.evaluate(() => (window.__INSERTS.find((x) => x.table === 'seal_hq_receipts') || {}).rows);
    is(rcv && [rcv[0].order_id, rcv[0].ranges], [3, [{ start: '0041001', end: '0042500' }]], 'Receive ticked writes one receipt for the ticked rows');
    await page.click('#hq-view-back');
    await page.waitForSelector('#hq-view-body tbody tr', { timeout: 3000 });
    await page.click('#hq-view-actions button:has-text("History")');
    await page.waitForFunction(() => /history/.test(document.getElementById('hq-view-title').textContent), null, { timeout: 3000 }).catch(() => {});
    is(await page.$eval('#hq-view-title', (e) => e.textContent), 'Received at HQ — history', 'History switches the view to what HQ received');
    is(await page.isVisible('#modal'), false, 'still no window');

    // block 3: the deliveries below
    await page.click('#blk-deliver');
    await page.waitForSelector('#hq-view-body .track', { timeout: 3000 });
    is(await page.$eval('#hq-view-title', (e) => e.textContent), 'Seals delivery to MJM Nursery', 'pressing block 3 shows the deliveries below');
    const cards = await page.$$eval('#hq-view-body .track', (ts) => ts.map((t) => [...t.querySelectorAll('.stop')].map((s) => s.classList.contains('done') ? 'done' : s.classList.contains('now') ? 'now' : '-')));
    is(cards, [['done', 'now', '-'], ['done', 'done', 'now']], 'a packed delivery waits to reach the site office, a delivered one waits for the nursery');
    await page.click('#hq-view-body button:has-text("Mark delivered")');
    await page.waitForFunction(() => window.__UPDATES.length > 0, null, { timeout: 2000 }).catch(() => {});
    const upd = await page.evaluate(() => window.__UPDATES[0]);
    is([upd && upd.table, upd && upd.row.status, upd && upd.row.delivered_by], ['seal_deliveries', 'delivered', 'Office'], 'Mark delivered writes who and when');

    // Site keys it again -- delivery #4 sent 0029001 - 0030000.
    await page.waitForSelector('#hq-view-body .track', { timeout: 3000 });
    await page.click('#hq-view-body .space-y-3 > div:nth-child(2) button:has-text("confirm receive")');
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

    // + on block 3: a new delivery, in a window
    await page.click('#btn-deliver');
    is(await page.$eval('#modal-title', (e) => e.textContent), 'New delivery to MJM Nursery', 'the + opens New delivery in a window');
    is(await page.$$eval('#dv-fill, #dv-fill-qty', (x) => x.length), 0, 'no Fill from HQ stock');
    is(await page.$eval('#modal-body', (e) => !!e.querySelector('p')), false, 'and no subtitle');
    is(await page.$eval('#dv-remark', (e) => [e.tagName, !!(e.compareDocumentPosition(document.getElementById('dv-ranges')) & Node.DOCUMENT_POSITION_PRECEDING)]),
      ['TEXTAREA', true], 'Remark is a larger box, under the seal ranges');
    // Not in the cabinet: 0035001 onward never reached HQ.
    await page.fill('#dv-ranges [data-k="start"]', '0034501');
    await page.fill('#dv-ranges [data-k="end"]', '0035500');
    await page.waitForFunction(() => /not in the HQ cabinet/.test(document.getElementById('dv-ranges').textContent), null, { timeout: 2000 }).catch(() => {});
    is((await page.$eval('#dv-ranges', (e) => e.textContent)).includes('0035001 – 0035500: not in the HQ cabinet'), true, 'a seal not in the HQ cabinet is named');
    if (process.env.SEAL_SHOTS) await page.screenshot({ path: process.env.SEAL_SHOTS + '/seal_delivery.png', fullPage: true });
    await page.click('#dv-save');
    is(await page.evaluate(() => window.__INSERTS.some((x) => x.table === 'seal_deliveries')), false, 'and cannot be saved');
    // Backwards.
    await page.fill('#dv-ranges [data-k="start"]', '0033500');
    await page.fill('#dv-ranges [data-k="end"]', '0031001');
    await page.click('#dv-save');
    is(await page.evaluate(() => window.__INSERTS.some((x) => x.table === 'seal_deliveries')), false, 'a range keyed backwards cannot be saved, even before the check has run');
    await page.waitForFunction(() => /before the first/.test(document.getElementById('dv-ranges').textContent), null, { timeout: 2000 }).catch(() => {});
    is((await page.$eval('#dv-ranges', (e) => e.textContent)).includes('The last seal is before the first'), true, 'and says why');
    await page.fill('#dv-ranges [data-k="start"]', '0031001');
    await page.fill('#dv-ranges [data-k="end"]', '0033500');
    await page.waitForFunction(() => !/cabinet|before the first/.test(document.getElementById('dv-ranges').textContent), null, { timeout: 2000 }).catch(() => {});
    await page.click('#dv-save');
    await page.waitForFunction(() => window.__INSERTS.some((x) => x.table === 'seal_deliveries'), null, { timeout: 2000 }).catch(() => {});
    const dv = await page.evaluate(() => (window.__INSERTS.find((x) => x.table === 'seal_deliveries') || {}).rows);
    is(dv && [dv[0].status, dv[0].packed_by, dv[0].ranges], ['packed', 'Office', [{ start: '0031001', end: '0033500' }]], 'a new delivery is saved Packed, by whoever packed it');
    is(await page.isVisible('#modal'), false, 'and the window closes');
    await page.waitForSelector('#hq-view-actions button', { timeout: 3000 });
    await page.click('#hq-view-actions button:has-text("History")');
    await page.waitForFunction(() => /history/.test(document.getElementById('hq-view-title').textContent), null, { timeout: 3000 }).catch(() => {});
    is(await page.$eval('#hq-view-title', (e) => e.textContent), 'Received at MJM Nursery — history', 'its History switches the view to what the nursery received');

    is(await page.isVisible('#tab-settings-btn'), false, 'Settings is not offered to a normal user');

    // ── Report: every number, first to latest ──
    await page.click('[data-tab="report"]');
    await page.waitForSelector('#rp-table table', { timeout: 3000 });
    const rp = await page.$$eval('#rp-table tbody tr', (t) => t.map((r) => [r.children[0].textContent.trim(), r.children[2].textContent.trim()]));
    is(rp[0], ['0009001 – 0009600', 'Used · on a DO'], 'the report starts at the first seal');
    is(rp[rp.length - 1][0].endsWith('0042500'), true, 'and runs to the latest ordered');
    const seen = new Set(rp.map((r) => r[1]));
    is(['Used · on a DO', 'With customer · pending', 'MJM Nursery cabinet', 'Delivering to MJM Nursery', 'HQ cabinet', 'Pending receive at HQ', 'No record'].every((x) => seen.has(x)), true,
      'every place a seal can be is on it, and a gap with no record is said');
    is(rp.some((r) => r[0] === '0041001 – 0042500' && r[1] === 'Pending receive at HQ'), true, 'an order part not yet received is pending receive');
    is(rp.some((r) => r[0] === '0029001 – 0030000' && r[1] === 'Delivering to MJM Nursery'), true, 'a delivery not yet received at site is delivering');
    const nums = await page.$$eval('#rp-table tbody tr', (t) => t.map((r) => r.children[0].textContent.split('–').map((x) => Number(x.trim()))));
    is(nums.every((r, i) => i === 0 || r[0] === nums[i - 1][nums[i - 1].length - 1] + 1), true, 'every number between the first and the latest is on exactly one row');
    await page.fill('#rp-q', '30500');
    await page.waitForTimeout(400);
    is(await page.$$eval('#rp-table tbody tr', (t) => t.map((r) => r.children[0].textContent.trim())), ['0030001 – 0031000'], 'a seal number typed finds the range holding it');
    await page.fill('#rp-q', '');
    if (process.env.SEAL_SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: process.env.SEAL_SHOTS + '/seal_report.png', fullPage: true }); }

    // ── NELOS ──
    await page.click('[data-tab="nelos"]');
    await page.waitForSelector('#nelos-table table', { timeout: 3000 });
    const nrows = await page.$$eval('#nelos-table tbody tr', (t) => t.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
    is(nrows.length === 1 && nrows[0].includes('Seals 0010001 - 0010050 given twice') && nrows[0].includes('Admin 2'), true,
      'the NELOS tab lists the open seal cases, whoever has them');
    is(await page.$eval('#nelos-table a[href*="nelos_case.html"]', (a) => a.getAttribute('href')), '../nelos/nelos_case.html?id=88', 'each opens its case');
    is(await page.evaluate(() => window.__RPC.some((c) => c.fn === 'seal_nelos_cases')), true, 'asked of seal_nelos_cases, not of what this login can see in NELOS');
    await page.check('#n-show-closed');
    is(await page.$$eval('#nelos-table tbody tr', (t) => t.length), 2, 'show closed adds the closed ones');
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
    is(await page.$eval('#tab-settings-btn', (b) => [b.textContent.trim(), b.getAttribute('title')]), ['⚙', 'Settings'], 'as a small gear');
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
