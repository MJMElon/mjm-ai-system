/* A BATCH FINISHED WITH A PLOT IS OFF THE INVENTORY MAP.

   Plot B8 listed four batches and totalled 8,514 over a plot with 5,302
   standing in it. Three of the four were done — HQ had signed their 3rd
   Culling off — and the map went on counting them as stock to collect.

   DONE means what the batch report's 3rd Culling tab means by Done, read off
   the record it writes:

     · HQ keyed the DRONE MAP QUANTITY  → `MapQty: N` in the remark
     · or there was NOTHING TO CULL     → quantity_change is 0

   and EVERY record for that (plot, batch) has to say so: a plot can carry a
   MAIN row and a D-TONE row for one batch, and half a plot signed off is not
   a plot to take off the map.

   It has to hold everywhere the same figures are shown — the modal, its
   tiles, the sidebar and the map's own totals all read one plotBatches, so
   this filters there rather than in the modal, or the modal's 5,302 would sit
   under a map still coloured for 8,514.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/invmap_complete.cjs
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

/* B8, as the screenshot had it:
     244  5,302  no 3rd Culling record at all        → still standing
     224  2,812  MapQty keyed                        → finished
     225    260  culled 0, nothing to cull           → finished
     227    140  a 3rd Culling record with no MapQty
                 and 130 culled — started, not done  → still standing

   B9 tests the half-signed-off plot: batch 300 has a MAIN row with MapQty
   and a D-TONE row without. Half done is not done.

   B7 has one batch and it is finished, so the plot has nothing left. */
const ROWS = {
  operation_nurseries: [{ id: 1, name: 'BNN' }],
  shared_plots: [
    { plot_name: 'B8', nursery_name: 'BNN' },
    { plot_name: 'B9', nursery_name: 'BNN' },
    { plot_name: 'B7', nursery_name: 'BNN' }
  ],
  shared_inventory_logs: [
    { transaction_type: 'Transplanted', plot_name: 'B8', batch_name: '244', breed_name: 'IOI DxP HYBRID', quantity_change: 5302 },
    { transaction_type: 'Transplanted', plot_name: 'B8', batch_name: '224', breed_name: 'IOI DxP HYBRID', quantity_change: 2812 },
    { transaction_type: 'Transplanted', plot_name: 'B8', batch_name: '225', breed_name: 'AA Hybrida 1S', quantity_change: 260 },
    { transaction_type: 'Transplanted', plot_name: 'B8', batch_name: '227', breed_name: 'AA Hybrida 1S', quantity_change: 140 },
    { transaction_type: 'Transplanted',            plot_name: 'B9', batch_name: '300', breed_name: 'AA Hybrida 1S', quantity_change: 400 },
    { transaction_type: 'Transplanted_DoubleTone', plot_name: 'B9', batch_name: '300', breed_name: 'AA Hybrida 1S', quantity_change: 100 },
    { transaction_type: 'Transplanted', plot_name: 'B7', batch_name: '310', breed_name: 'AA Hybrida 1S', quantity_change: 700 },

    // ── the 3rd Culling records that decide it ──
    { transaction_type: '3rd_Culling', plot_name: 'B8', batch_name: '224', quantity_change: 2800,
      remark: '3rd Culling. DestType: main MapQty: 2800 CullDate:2026-06-01' },
    { transaction_type: '3rd_Culling', plot_name: 'B8', batch_name: '225', quantity_change: 0,
      remark: '3rd Culling. DestType: main' },
    /* Started and not finished: a record exists, a quantity was culled, but
       HQ has not keyed the drone map. This one must STAY on the map. */
    { transaction_type: '3rd_Culling', plot_name: 'B8', batch_name: '227', quantity_change: 130,
      remark: '3rd Culling. DestType: main CullDate:2026-06-03' },
    // Half of B9's batch signed off, half not.
    { transaction_type: '3rd_Culling', plot_name: 'B9', batch_name: '300', quantity_change: 390,
      remark: '3rd Culling. DestType: main MapQty: 390 CullDate:2026-06-01' },
    { transaction_type: '3rd_Culling', plot_name: 'B9', batch_name: '300', quantity_change: 95,
      remark: '3rd Culling. DestType: doubletone CullDate:2026-06-01' },
    // B7's only batch, done — and keyed with stray case and spacing, which
    // is one plot in the field however it was typed.
    { transaction_type: '3rd_Culling', plot_name: ' b7 ', batch_name: '310', quantity_change: 690,
      remark: '3rd Culling. DestType: main MapQty: 690 CullDate:2026-06-01' }
  ],
  shared_collection_bookings: [],
  audit_height_records: []
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

  const see = (plot) => page.evaluate(async (plot) => {
    openInvmapModal(plot);
    await new Promise(r => setTimeout(r, 150));
    const body = document.getElementById('invmap-modal-body');
    const txt = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
    const tiles = [...document.querySelectorAll('#invmap-modal-body .grid > div, #invmap-modal-body .grid > button')].map(txt);
    return {
      rows: [...document.querySelectorAll('#invmap-modal-stock tbody tr')]
        .map(r => [...r.children].map(c => txt(c))),
      tiles,
      note: txt(body).match(/\d+ batch(?:es)? finished with this plot[^]*?not listed/i)?.[0] || '',
      whole: txt(body).slice(0, 400)
    };
  }, plot);

  const state = await page.evaluate(async () => {
    if (typeof loadInventoryMap === 'function') { try { await loadInventoryMap(); } catch (e) {} }
    await new Promise(r => setTimeout(r, 200));
    return {
      b8: (_invmap.plotBatches['B8'] || []).map(b => b.batch).sort(),
      b9: (_invmap.plotBatches['B9'] || []).map(b => b.batch).sort(),
      b7: (_invmap.plotBatches['B7'] || []).map(b => b.batch).sort(),
      hidden: _invmap.hiddenComplete
    };
  });

  const b8 = await see('B8');
  const b9 = await see('B9');
  const b7 = await see('B7');

  console.log('plotBatches :', JSON.stringify(state));
  console.log('B8 rows     :', JSON.stringify(b8.rows));
  console.log('B8 tiles    :', JSON.stringify(b8.tiles));
  console.log('B8 note     :', JSON.stringify(b8.note));
  console.log('B9 rows     :', JSON.stringify(b9.rows));
  console.log('B7          :', JSON.stringify(b7.whole));
  console.log('page errors :', errs.length ? errs.join(' | ') : 'none');

  const full = (b8.tiles[0] || '');
  const bal  = (b8.tiles[2] || '');

  const checks = [
    // ── what counts as finished
    ['a batch with the drone map keyed is off the plot', !state.b8.includes('224')],
    ['and one with nothing to cull', !state.b8.includes('225')],
    ['a batch with no 3rd Culling at all stays', state.b8.includes('244')],
    ['and one culled but not signed off stays too', state.b8.includes('227')],
    ['so B8 lists the two that are still standing',
      JSON.stringify(state.b8) === JSON.stringify(['227', '244'])],
    // ── the tiles agree with the list
    ['the rows shown are only those two', b8.rows.length === 2],
    ['Full counts what is listed, not what was', /5,442/.test(full)],
    ['and so does Balance', /5,442/.test(bal)],
    // ── said out loud
    ['the modal says how many were left out', /2 batches finished with this plot/i.test(b8.note)],
    ['and why', /3rd culling signed off/i.test(b8.note)],
    // ── half signed off is not signed off
    ['a plot with one of its two rows signed off keeps the batch',
      JSON.stringify(state.b9) === JSON.stringify(['300'])],
    ['and still lists it', b9.rows.length === 1],
    // ── a plot with nothing left
    ['a plot whose every batch is finished has none', JSON.stringify(state.b7) === JSON.stringify([])],
    ['and says so rather than going blank',
      /1 batch finished with this plot/i.test(b7.whole) && /no batches in scope/i.test(b7.whole)],
    ['however the plot name was keyed on the culling record',
      (state.hidden || {})['B7'] === 1],
    ['no page errors', errs.length === 0],
  ];
  let bad = 0;
  console.log('');
  for (const [l, p] of checks) { console.log((p ? 'ok   ' : 'FAIL ') + l); if (!p) bad++; }
  await browser.close(); server.close();
  process.exit(bad ? 1 : 0);
})();
