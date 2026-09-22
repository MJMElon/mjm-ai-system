/* THE HEIGHT TILE ON A PLOT.

   The Inventory Map's plot modal shows Full / Collected / Balance. Beside
   them now sits Height, in yellow, and pressing it swaps the stock list for
   every batch's latest seedling height and the day it was measured.

   Two things this has to get right, and both are easy to get wrong:

     · THE JOIN. The height audit writes its plots zero-padded — B01…B14 —
       and the transplant ledger does not: the map calls the same plot B1.
       Joined on the string, every plot numbered under ten matches nothing.

     · WHOSE AVERAGE. A height audit measures up to three seedlings a row, so
       one batch measured on one day is usually several rows. Each batch is
       averaged over ITS OWN seedlings — four on one, five on the next — and
       an earlier audit of the same batch is not averaged in with today's.

   Driven through the page's own loader with a stubbed Supabase that answers
   per table, so the real query shapes are exercised.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/invmap_height.cjs
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

/* Plot B1 — written B1 in the ledger and B01 in the audit — with three
   batches:

     211  measured 4 seedlings on 19 Sep     → avg 40.0
     212  measured 5 seedlings on 19 Sep     → avg 52.0, and measured again
          in JUNE, which must not be averaged in
     213  never audited                      → listed, saying so

   Plot avg is the mean of the batches that have one: (40 + 52) / 2 = 46.0,
   over "2 / 3 measured". */
const ROWS = {
  operation_nurseries: [{ id: 1, name: 'BNN' }],
  shared_plots: [
    { plot_name: 'B1', nursery_name: 'BNN' },
    { plot_name: 'B2', nursery_name: 'BNN' }
  ],
  shared_inventory_logs: [
    { transaction_type: 'Transplanted', plot_name: 'B1', batch_name: '211', breed_name: 'AA Hybrida 1S', quantity_change: 1033 },
    { transaction_type: 'Transplanted', plot_name: 'B1', batch_name: '212', breed_name: 'IOI DxP HYBRID', quantity_change: 1182 },
    { transaction_type: 'Transplanted', plot_name: 'B1', batch_name: '213', breed_name: 'UPB PREMIER HYBRID', quantity_change: 137 },
    { transaction_type: 'Transplanted', plot_name: 'B2', batch_name: '214', breed_name: 'AA Hybrida 1S', quantity_change: 500 }
  ],
  shared_collection_bookings: [],
  audit_height_records: [
    // Batch 211 — four seedlings across two rows, one day.
    { plot: 'B01', batch: '211', sample_1: 38, sample_2: 40, sample_3: 42, date: '2026-09-19' },
    { plot: 'B01', batch: '211', sample_1: 40, sample_2: null, sample_3: null, date: '2026-09-19' },
    // Batch 212 — five seedlings, same day…
    { plot: 'B01', batch: '212', sample_1: 50, sample_2: 51, sample_3: 52, date: '2026-09-19' },
    { plot: 'B01', batch: '212', sample_1: 53, sample_2: 54, sample_3: null, date: '2026-09-19' },
    // …and an older audit of the same batch, which is history, not height.
    { plot: 'B01', batch: '212', sample_1: 20, sample_2: 21, sample_3: 22, date: '2026-06-02' },
    /* A declined audit writes no samples at all — it must not count as a
       batch that was measured, and must not drag an average down to zero. */
    { plot: 'B01', batch: '213', sample_1: null, sample_2: null, sample_3: null, date: '2026-09-19' },
    // A per-plot audit names no batch. Nothing here can hang it on one.
    { plot: 'B01', batch: null, sample_1: 44, sample_2: 45, sample_3: 46, date: '2026-09-19' }
  ]
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.route('**supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**cdn.tailwindcss.com/**', (r) => r.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'document.addEventListener("DOMContentLoaded", function () {' +
          '  document.head.insertAdjacentHTML("beforeend", ' +
          JSON.stringify('<style>.hidden{display:none}</style>') + '); });' }));
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
  await page.waitForTimeout(4500);

  const opened = await page.evaluate(async () => {
    if (typeof loadInventoryMap === 'function') { try { await loadInventoryMap(); } catch (e) {} }
    openInvmapModal('B1');
    await new Promise(r => setTimeout(r, 200));
    const tile = document.getElementById('invmap-height-tile');
    const txt = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null);
    return {
      tile: txt(tile),
      /* textContent, not innerText: the height list is hidden to begin with
         and innerText is '' for a subtree that is not rendered. */
      stockShown:  !document.getElementById('invmap-modal-stock').classList.contains('hidden'),
      heightShown: !document.getElementById('invmap-modal-height').classList.contains('hidden'),
      heightRows: [...document.querySelectorAll('#invmap-modal-height .invmap-h-row')]
        .map(r => [...r.children].map(c => (c.textContent || '').replace(/\s+/g, ' ').trim()))
    };
  });

  const toggled = await page.evaluate(async () => {
    toggleInvmapHeight();
    await new Promise(r => setTimeout(r, 100));
    const tile = document.getElementById('invmap-height-tile');
    return {
      stockShown:  !document.getElementById('invmap-modal-stock').classList.contains('hidden'),
      heightShown: !document.getElementById('invmap-modal-height').classList.contains('hidden'),
      tileLit: !!tile && tile.classList.contains('bg-amber-100')
    };
  });

  // Pressing an average opens the seedlings it was worked out from.
  const samples = await page.evaluate(async () => {
    /* The list is in the stock list's order — balance first — so row 0 is
       batch 212, the bigger one. Its five seedlings are what must open. */
    const btn = document.querySelector('#invmap-modal-height .invmap-h-row button');
    // No pressable average at all means nothing was measured — which is
    // itself a failed check below, not a reason to throw and hide the rest.
    if (!btn) return { shown: false, text: '' };
    btn.click();
    await new Promise(r => setTimeout(r, 100));
    const row = document.getElementById('invmap-h-samples-0');
    return { shown: !!row && !row.classList.contains('hidden'),
             text: row ? (row.textContent || '').replace(/\s+/g, ' ').trim() : '' };
  });

  // A plot with no audit at all still opens, and says so rather than lying.
  const bare = await page.evaluate(async () => {
    openInvmapModal('B2');
    await new Promise(r => setTimeout(r, 150));
    const tile = document.getElementById('invmap-height-tile');
    return { tile: tile ? (tile.textContent || '').replace(/\s+/g, ' ').trim() : null,
             rows: [...document.querySelectorAll('#invmap-modal-height .invmap-h-row')]
               .map(r => (r.textContent || '').replace(/\s+/g, ' ').trim()) };
  });

  console.log('tile        :', JSON.stringify(opened.tile));
  console.log('height rows :', JSON.stringify(opened.heightRows, null, 1));
  console.log('toggled     :', JSON.stringify(toggled));
  console.log('samples     :', JSON.stringify(samples));
  console.log('no audit    :', JSON.stringify(bare));
  console.log('page errors :', errs.length ? errs.join(' | ') : 'none');

  const row = (n) => opened.heightRows.find(r => r[0] === '#' + n) || [];

  const checks = [
    // ── the tile
    ['the plot has a Height tile', opened.tile !== null],
    ['reading the average of the batches that have one', /46\.0 cm/.test(opened.tile)],
    ['and how many of them there are', /2 \/ 3 measured/.test(opened.tile)],
    ['the stock list is what shows first',
      opened.stockShown === true && opened.heightShown === false],
    // ── the join
    ['B01 in the audit is B1 on the map — the heights are found',
      row('211').length > 0 && /40\.0 cm/.test(row('211')[4] || '')],
    // ── whose average
    ['a batch is averaged over its OWN seedlings', row('211')[3] === '4'],
    ['…and so is the one beside it', row('212')[3] === '5' && /52\.0 cm/.test(row('212')[4] || '')],
    /* "Sept", not "Sep" — en-GB's short month in this browser. Matched
       loosely so the check is about the DATE, not the browser's spelling. */
    ['an older audit of the same batch is history, not height',
      !/2[012]\.0/.test(row('212')[4] || '') && /19 Sept? 2026/.test(row('212')[2] || '')],
    ['the day it was measured is on the row', /19 Sept? 2026/.test(row('211')[2] || '')],
    // ── a batch nobody has measured
    ['a batch never audited is still listed', row('213').length > 0],
    ['saying so rather than being left out', /not measured/i.test(row('213')[4] || '')],
    ['and a declined audit does not count as one', !/2 \/ 3/.test('') && /2 \/ 3 measured/.test(opened.tile)],
    // ── pressing things
    ['the tile swaps the list for the heights',
      toggled.heightShown === true && toggled.stockShown === false],
    ['and lights up while it is showing', toggled.tileLit === true],
    ['pressing an average opens the seedlings behind it', samples.shown === true],
    ['each one of them, in order',
      /Seedling 1 · 50\.0 cm/.test(samples.text) && /Seedling 3 · 52\.0 cm/.test(samples.text)
      && /Seedling 5 · 54\.0 cm/.test(samples.text)],
    // ── a plot with nothing measured
    ['a plot with no audit still opens', bare.tile !== null],
    ['with a dash and none measured', /—/.test(bare.tile) && /0 \/ 1 measured/.test(bare.tile)],
    ['its batch listed as not measured', bare.rows.length === 1 && /not measured/i.test(bare.rows[0])],
    ['no page errors', errs.length === 0],
  ];
  let bad = 0;
  console.log('');
  for (const [l, p] of checks) { console.log((p ? 'ok   ' : 'FAIL ') + l); if (!p) bad++; }
  await browser.close(); server.close();
  process.exit(bad ? 1 : 0);
})();
