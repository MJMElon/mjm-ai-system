/* THE STOCK ANALYSIS DASHBOARD READS THE PAGE'S OWN FIGURES.

   Section 1 of the Inventory Map pane. Every figure is checked here against
   a ledger small enough to add up by hand, on a clock frozen at
   17 Nov 2026 (30 days in the month, 14 of them still to come):

   STOCK (Plot Balance = transplanted x 90% less DOs). Available = seedlings
   10 MONTHS OLD OR MORE (off the batch seed-in date) or measured at 1.5 m.
   U7 / 274: transplanted Jan, so "matured" by the old +9 months rule, but
   its seeds went in 25 Jan: it turns 10 months on 26 Nov, so it is NOT
   available today and is counted in November's forecast stock (450).
     U1 / 250  1,000 in Jan → matured Oct, 200 out on a DO   →   700  matured
     U2 / 260  2,000 in Feb → matures Nov                     → 1,800  matured
     U3 / 270  3,000 in Apr → Jan 2027, measured 155 cm      → 2,700  reached 1.5 m
     U4 / 271  1,000 in Mar → Dec 2026, 120 cm               →   900  maturing next month
     U5 / 272  matured but CULLED (drone qty + tab signed)   →     0  left out
     U6 / 273  Jan 2027, 149.9 cm — just under 1.5 m         →        left out
     Available = 700 + 1,800 + 2,700 = 5,200

   ORDERS (still owed)
     ORD1 Alpha  3,000  credit
     ORD2 Beta   4,000  credit
     ORD3 Gamma    999  cash, unpaid — not counted (Pending Collection rule)
     Actual Order = 7,000 · Available − Actual = −1,800

   FORECAST
     Alpha: 1,800 collected over the last 90 days → 600 a month; 500 booked
            for 25 Nov. Rest of Nov = max(500, 600 x 14/30 = 280) = 500.
            Dec = min(3,000 − 500, max(0, 600)) = 600.
     Beta : no history, 1,000 booked for 3 Dec. Rest of Nov 0, Dec 1,000.
     Already out in Nov: the 200 DO.  Nov = 200 + 500 = 700.  Dec = 1,600.
     Nov: 5,200 available − 500 = 4,700 left, Enough.
     Dec: 4,700 + 900 maturing = 5,600 − 1,600 = 4,000, Enough.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/stock_analysis_dashboard.cjs
   SHOT=/path.png draws the section and the Available Stock window.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

const UID = '00000000-0000-0000-0000-000000000001';
const FAKE_SUPABASE = `
window.supabase = { createClient: function () {
  function builder(table) {
    var b = { _t: table, _eq: {}, _in: null, _one: false };
    ['neq','is','or','not','gt','gte','lt','lte','ilike','like','order','limit','filter','match','contains','overlaps','select','range']
      .forEach(function (m) { b[m] = function () { return b; }; });
    b.eq = function (col, val) { b._eq[col] = val; return b; };
    b.in = function (col, vals) { b._in = { col: col, vals: vals.map(String) }; return b; };
    b.single = function () { b._one = true; return b; };
    b.maybeSingle = b.single;
    b._rows = function () {
      if (table === 'shared_profiles' && window.__FAKE_PROFILE) return [window.__FAKE_PROFILE];
      var rows = (window.__ROWS && window.__ROWS[table]) || [];
      var eq = b._eq;
      return rows.filter(function (r) {
        for (var k in eq) { if (String(r[k]) !== String(eq[k])) return false; }
        if (b._in && b._in.vals.indexOf(String(r[b._in.col])) < 0) return false;
        return true;
      });
    };
    b._settle = function () {
      var rows = b._rows();
      return { data: b._one ? (rows[0] || null) : rows, error: null, count: rows.length };
    };
    b.then = function (r, j) { return Promise.resolve(b._settle()).then(r, j); };
    b.catch = function (f) { return Promise.resolve(b._settle()).catch(f); };
    b.finally = function (f) { return Promise.resolve(b._settle()).finally(f); };
    b.insert = function () { return Promise.resolve({ data: null, error: null }); };
    b.update = function () { return b; };
    b.delete = function () { return b; };
    b.upsert = function () { return Promise.resolve({ data: null, error: null }); };
    return b;
  }
  return {
    from: builder,
    rpc: function () { return Promise.resolve({ data: null, error: null }); },
    channel: function () { var c = { on: function(){return c;}, subscribe: function(){return c;} }; return c; },
    removeChannel: function () {},
    storage: { from: function () { return { upload: function(){return Promise.resolve({data:null,error:null});},
                                            getPublicUrl: function(){return {data:{publicUrl:''}};} }; } },
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: window.__FAKE_SESSION }, error: null }); },
      getUser: function () { return Promise.resolve({ data: { user: window.__FAKE_SESSION.user }, error: null }); },
      onAuthStateChange: function (cb) {
        setTimeout(function () { try { cb('SIGNED_IN', window.__FAKE_SESSION); } catch (e) {} }, 0);
        return { data: { subscription: { unsubscribe: function () {} } } };
      },
      signOut: function () { return Promise.resolve({ error: null }); }
    }
  };
} };`;


const tl = (plot, batch, qty, date) => ({ transaction_type: 'Transplanted', plot_name: plot, batch_name: batch,
  breed_name: 'AA Hybrida 1S', quantity_change: qty, remark: 'Transplant. Date: ' + date, created_at: date + 'T00:00:00Z' });
const ROWS = {
  operation_nurseries: [{ id: 1, name: 'UNN 1' }],
  shared_plots: ['U1','U2','U3','U4','U5','U6','U7'].map(p => ({ plot_name: p, nursery_name: 'UNN 1' })),
  shared_inventory_logs: [
    tl('U1', '250', 1000, '2026-01-10'),
    tl('U2', '260', 2000, '2026-02-20'),
    tl('U3', '270', 3000, '2026-04-05'),
    tl('U4', '271', 1000, '2026-03-15'),
    tl('U5', '272', 1000, '2026-01-05'),
    tl('U6', '273', 1000, '2026-04-20'),
    tl('U7', '274', 500, '2026-01-08'),
    ...[['250', '2025-12-01'], ['260', '2026-01-10'], ['270', '2026-04-01'], ['271', '2026-02-10'],
        ['272', '2025-12-15'], ['273', '2026-03-20'], ['274', '2026-01-25']].map(([b, d]) => ({
      transaction_type: 'Seeds_Received', batch_name: b, breed_name: 'AA Hybrida 1S', quantity_change: 1,
      transaction_date: d, created_at: d + 'T00:00:00Z', remark: '' })),
    { transaction_type: '3rd_Culling', plot_name: 'U5', batch_name: '272', quantity_change: 1000,
      remark: '3rd Culling. DestType: main MapQty: 1000 CullDate:2026-10-20' }
  ],
  operation_batch_verifications: [{ batch_name: '272', stage: 'cull_3' }],
  shared_do_records: [
    { id: 1, do_number: 'DO-ORD1001', al_number: null, delivery_date: '2026-11-03', total_qty: 200, status: 'Issued',
      remark: '', plot_1: 'U1', batch_1: '250', qty_1: 200 }
  ],
  salesweb_customer_orders: [
    { id: 1, order_number: 'ORD1', customer_name: 'Alpha', billing_name: 'Alpha', total: 1, status: 'Paid', created_at: '2026-08-01T00:00:00Z', payment_terms: 'credit' },
    { id: 2, order_number: 'ORD2', customer_name: 'Beta',  billing_name: 'Beta',  total: 1, status: 'Paid', created_at: '2026-10-01T00:00:00Z', payment_terms: 'credit' },
    { id: 3, order_number: 'ORD3', customer_name: 'Gamma', billing_name: 'Gamma', total: 1, status: 'Pending Payment', created_at: '2026-11-01T00:00:00Z', payment_terms: 'cash' }
  ],
  salesweb_order_items: [
    { order_id: 1, quantity: 3000, unit_price: 1, subtotal: 3000 },
    { order_id: 2, quantity: 4000, unit_price: 1, subtotal: 4000 },
    { order_id: 3, quantity: 999,  unit_price: 1, subtotal: 999 }
  ],
  salesweb_order_collections: [],
  shared_al_orders: [],
  shared_collection_bookings: [
    { id: 1, order_number: 'ORD1', customer_name: 'Alpha', booking_date: '2026-09-01', collection_qty: 600, status: 'completed' },
    { id: 2, order_number: 'ORD1', customer_name: 'Alpha', booking_date: '2026-10-01', collection_qty: 600, status: 'completed' },
    { id: 3, order_number: 'ORD1', customer_name: 'Alpha', booking_date: '2026-11-05', collection_qty: 600, status: 'completed' },
    { id: 4, order_number: 'ORD1', customer_name: 'Alpha', booking_date: '2026-11-25', collection_qty: 500, status: 'pending' },
    { id: 5, order_number: 'ORD2', customer_name: 'Beta',  booking_date: '2026-12-03', collection_qty: 1000, status: 'pending' }
  ],
  audit_height_records: [
    { plot: 'U03', batch: '270', sample_1: 150, sample_2: 160, sample_3: 155, date: '2026-11-01' },
    { plot: 'U04', batch: '271', sample_1: 120, sample_2: 120, sample_3: 120, date: '2026-11-01' },
    { plot: 'U06', batch: '273', sample_1: 149.9, sample_2: 149.9, sample_3: 149.9, date: '2026-11-01' }
  ]
};

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : ' → got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)));
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.clock.setFixedTime(new Date('2026-11-17T10:00:00'));
  await page.route('**supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**cdn.tailwindcss.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await page.route('**cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript(({ uid, rows }) => {
    const user = { id: uid, email: 'esther@mjmnursery.com', user_metadata: { full_name: 'Esther Wong' } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    window.__FAKE_PROFILE = { id: uid, email: user.email, full_name: 'Esther Wong', user_type: 'staff',
      permissions: { modules: { operation: 'admin' }, manage_users: true } };
    window.__ROWS = rows;
    try { localStorage.clear(); } catch (e) {}
  }, { uid: UID, rows: ROWS });

  await page.goto(`http://localhost:${port}/operation/operation_stock_sales.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => switchSsmTab('map'));
  await page.waitForFunction(() => document.querySelector('#invmap-analysis .sa-card'), null, { timeout: 15000 }).catch(() => {});

  const txt = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map(e => e.textContent.replace(/\s+/g, ' ').trim()), sel);

  console.log('1. the heading');
  check('the section is called Stock Analysis Dashboard',
    (await txt('#invmap-analysis .lst-top, #invmap-analysis span.uppercase'))[0], 'Stock Analysis Dashboard');
  const order = await page.evaluate(() => [...document.querySelectorAll('#ssm-pane-map > .metric-card')].map(e => e.id));
  check('it sits above the map', order, ['invmap-analysis', 'invmap-map-card']);

  console.log('2. the three cards');
  const vals = await txt('#invmap-analysis .sa-card .sa-value');
  check('Actual Order is what is still owed, cash-unpaid left out', vals[0], '7,000');
  check('Available Stock is 10 months & above + 1.5 m & above', vals[1], '5,200');
  check('Available − Actual Order', vals[2], '−1,800');
  check('the gap reads short', await page.evaluate(() => document.querySelectorAll('#invmap-analysis .sa-gap-neg').length), 1);
  const subs = await txt('#invmap-analysis .sa-card .sa-sub');
  check('the stock card names its two parts', subs[1].startsWith('10 months & above 2,500 + 1.5 m & above 2,700'), true);

  console.log('3. the forecast');
  const frows = await page.evaluate(() => [...document.querySelectorAll('#invmap-analysis .sa-fcol .sa-frow')]
    .map(r => [...r.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' ')));
  check('Nov: estimated collection', frows[0], 'Estimated collection 700');
  check('Nov: stock available is what is on hand + what turns 10 months later in Nov', frows[1], 'Stock available 5,650');
  check('Nov: balance after', frows[2], 'Balance after +5,150 Enough');
  check('Dec: estimated collection', frows[3], 'Estimated collection 1,600');
  check('Dec: stock available is what is left + what turns 10 months in Dec', frows[4], 'Stock available 6,050');
  check('Dec: balance after', frows[5], 'Balance after +4,450 Enough');
  check('Jan: estimated collection', frows[6], 'Estimated collection 600');
  check('Jan: stock available is what is left + what turns 10 months in Jan', frows[7], 'Stock available 5,350');
  check('Jan: balance after', frows[8], 'Balance after +4,750 Enough');
  check('three month columns: this month and the next two', await txt('#invmap-analysis .sa-ftitle'), ['November 2026', 'December 2026', 'January 2027']);

  console.log('4. the Available Stock window');
  await page.evaluate(() => document.querySelector('#invmap-analysis .sa-card.sa-stock').click());
  const heads = await txt('#sa-modal .sa-mhead');
  check('the window shows the two parts', heads, ['10 months & above 2,500', '1.5 m & above, under 10 months 2,700']);
  const plots = await page.evaluate(() => [...document.querySelectorAll('#sa-modal .sa-table')].map(t =>
    [...t.querySelectorAll('tbody tr')].map(r => r.children[0].textContent + '/' + r.children[6].textContent)));
  check('10 months and above, culled one left out, U7 (matured by date, 9 months old) NOT in it', plots[0], ['U1/700', 'U2/1,800']);
  const ages = await page.evaluate(() => [...document.querySelectorAll('#sa-modal .sa-table')][0] ? [...[...document.querySelectorAll('#sa-modal .sa-table')][0].querySelectorAll('tbody tr')].map(r => r.children[4].textContent) : []);
  check('the age of each, off the seed-in date', ages, ['11 months', '10 months']);
  check('the tall plot, 149.9 cm left out', plots[1], ['U3/2,700']);
  check('the window is open', await page.evaluate(() => !document.getElementById('sa-modal').classList.contains('hidden')), true);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace(/\.png$/, '') + '-window.png' });
  await page.evaluate(() => closeStockAnalysisWindow());
  check('and it closes', await page.evaluate(() => document.getElementById('sa-modal').classList.contains('hidden')), true);

  console.log('5. the forecast window');
  await page.evaluate(() => openStockAnalysisWindow('forecast'));
  const fr = await page.evaluate(() => [...document.querySelectorAll('#sa-modal tbody tr')].map(r => [...r.children].map(c => c.textContent)));
  check('Alpha: balance, pace, then booked and est. for Nov, Dec, Jan', fr[0], ['Alpha', 'ORD1', '3,000', '600', '500', '500', '0', '600', '0', '600']);
  check('Beta: no history, its Dec booking', fr[1], ['Beta', 'ORD2', '4,000', '0', '0', '0', '1,000', '1,000', '0', '0']);
  check('Gamma is not in it', fr.length, 2);
  await page.evaluate(() => closeStockAnalysisWindow());

  console.log('6. the Actual Order window: tick, untick, search');
  const hasOrderWin = await page.evaluate(() => typeof window.renderStockAnalysisOrders === 'function');
  check('Actual Order opens a window of its own', hasOrderWin, true);
  if (hasOrderWin) {
    await page.evaluate(() => document.querySelector('#invmap-analysis .sa-card.sa-order').click());
    const rows = () => page.evaluate(() => [...document.querySelectorAll('#sa-order-rows tr')].map(r =>
      [...r.children].map((c, i) => i === 0 ? (c.querySelector('input') ? (c.querySelector('input').checked ? 'on' : 'off') : '') : c.textContent.trim())));
    check('customer, order number and quantity, every order counted', await rows(),
      [['on', 'Alpha', 'ORD1', '3,000'], ['on', 'Beta', 'ORD2', '4,000']]);
    check('the foot counts them', (await txt('#sa-order-foot td')).join(' | '), 'Counted · 2 of 2 orders | 7,000');
    await page.fill('#sa-order-search', 'alp');
    check('the search narrows to the customer', (await rows()).map(r => r[1]), ['Alpha']);
    await page.fill('#sa-order-search', '');
    await page.evaluate(() => { const b = [...document.querySelectorAll('#sa-order-rows input')][1]; b.checked = false; b.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(300);
    check('Beta is unticked', (await rows())[1][0], 'off');
    check('the foot follows the tick', (await txt('#sa-order-foot td')).join(' | '), 'Counted · 1 of 2 orders | 3,000');
      const v2 = await txt('#invmap-analysis .sa-card .sa-value');
    check('Actual Order drops to Alpha alone', v2[0], '3,000');
    check('and the gap follows', v2[2], '+2,200');
    const f2 = await page.evaluate(() => [...document.querySelectorAll('#invmap-analysis .sa-fcol .sa-frow')]
      .map(r => [...r.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' ')));
    check('Dec forecast leaves Beta out', f2[3], 'Estimated collection 600');
    check('the card says one is unticked', (await txt('#invmap-analysis .sa-order .sa-sub'))[0].includes('1 unticked'), true);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#sa-order-rows input')][1]; b.checked = true; b.dispatchEvent(new Event('change')); });
    await page.waitForTimeout(300);
    check('ticking it again counts it again', (await txt('#invmap-analysis .sa-card .sa-value'))[0], '7,000');
    if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace(/\.png$/, '') + '-orders.png' });
    await page.evaluate(() => closeStockAnalysisWindow());
  }

  if (process.env.SHOT) await page.locator('#invmap-analysis').screenshot({ path: process.env.SHOT });
  check('no page errors', errors, []);

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
