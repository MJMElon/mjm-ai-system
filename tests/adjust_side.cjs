/* WHICH COUNT WAS WRONG IS NO LONGER A QUESTION.

   The Adjustments form used to ask it, beside the report. It does not any
   more, because the report already answers it — and a question with a
   knowable answer is a question somebody can get wrong. Batch 234 is what
   getting it wrong looked like: 53 stolen out of B14 after transplanting,
   filed against the SEED count, so they came off the batch total while the
   transplant record still counted them into the plot. Over-allocated by
   exactly 53.

       Seeds Received · Planting · Seed Audit  → INITIAL, the batch total
       Transplanting · 1st · 2nd · 3rd Culling → AFTER THE FACT, the plot

   And where an after-the-fact loss lands is the second half, which is not
   the same question — a loss comes off the reports still measuring against
   a figure that includes it, and off no others:

       Transplanting → itself + 2nd + 3rd     1st Culling → 1st only
       2nd Culling   → 2nd only                3rd Culling → 3rd only

   Every CULLING keeps its own and passes nothing on: a culling is a fresh
   count of the plot, by hand and by drone, so whatever was adjusted before
   it is already absent from the number it produced. Batch 235's N11 is why
   — one seedling adjusted away at the 2nd culling, counted again at the
   3rd, and the row read 76 against a drone map of 77. There were 77.

   Only Transplanting travels, because it is not a count of what is there;
   it is a record of what was sent, and both cullings measure against it.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/adjust_side.cjs
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
/* The stub records every INSERT by table, so "no Nelos case was raised" is
   something this can actually check rather than assume. */
const FAKE_SUPABASE = `
window.__INSERTS = [];
window.__UPDATES = [];
window.supabase = { createClient: function () {
  function builder(table) {
    var b = { _t: table, _eq: {}, _in: null, _like: null, _one: false, _from: 0, _to: 1e9 };
    ['neq','is','or','not','gt','gte','lt','lte','ilike','order','limit','filter','match','contains','overlaps','select','range']
      .forEach(function (m) { b[m] = function () { return b; }; });
    b.eq = function (col, val) { b._eq[col] = val; return b; };
    b.in = function (col, vals) { b._in = { col: col, vals: vals.map(String) }; return b; };
    b.like = function (col, pat) { b._like = { col: col, pat: pat }; return b; };
    b.single = function () { b._one = true; return b; };
    b.maybeSingle = b.single;
    b._rows = function () {
      if (table === 'shared_profiles' && window.__FAKE_PROFILE) return [window.__FAKE_PROFILE];
      var rows = (window.__ROWS && window.__ROWS[table]) || [];
      var eq = b._eq, lk = b._like;
      return rows.filter(function (r) {
        for (var k in eq) { if (String(r[k]) !== String(eq[k])) return false; }
        if (b._in && b._in.vals.indexOf(String(r[b._in.col])) < 0) return false;
        if (lk) { var pre = String(lk.pat).replace(/%$/, '');
                  if (String(r[lk.col] || '').indexOf(pre) !== 0) return false; }
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
    b.insert = function (rows) {
      window.__INSERTS.push({ table: table, rows: [].concat(rows || []) });
      return Promise.resolve({ data: null, error: null });
    };
    b.update = function (payload) {
      window.__UPDATES.push({ table: table, payload: payload });
      return b;
    };
    b.delete = function () {
      window.__DELETES = window.__DELETES || [];
      window.__DELETES.push({ table: table });
      return b;
    };
    b.upsert = function (rows) {
      window.__INSERTS.push({ table: table, rows: [].concat(rows || []) });
      return Promise.resolve({ data: null, error: null });
    };
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


/* One batch, one adjustment per report, so each rule is read on its own.
   Every one is APPROVED — an unapproved adjustment moves no figure and
   that is tested last. */
const cal = (n, report, plot, qty) => ({
  id: n, batch_name: '300', transaction_type: 'Stock_Calibration', quantity_change: qty,
  plot_name: plot, created_at: '2026-06-01T00:00:00Z',
  remark: `Report: ${report}. Plot: ${plot}. reason ${n} [APPROVED by esther@mjmnursery.com on 2026-06-02]`
});

const ROWS = {
  shared_inventory_logs: [
    { id: 1, batch_name: '300', transaction_type: 'Seeds_Received', quantity_change: 1000,
      breed_name: 'IOI DxP HYBRID', transaction_date: '2025-06-01', created_at: '2025-06-01T00:00:00Z',
      plot_name: null, remark: 'Seeds received. Supplier: IOI. DO_Qty: 1000. Incl. 0% FOC.' },
    { id: 2, batch_name: '300', transaction_type: 'Planted', plot_name: 'P60', quantity_change: 1000,
      remark: 'Planted in Pre-Nursery tray P60. TotalPlanted:1000. EmptyHoles:0.' },
    { id: 3, batch_name: '300', transaction_type: 'Transplanted', plot_name: 'U3', quantity_change: 500,
      remark: 'Transplanted from tray [P60] to Main Plot [U3]. Date: 2025-09-01' },
    { id: 4, batch_name: '300', transaction_type: 'Transplanted', plot_name: 'U4', quantity_change: 400,
      remark: 'Transplanted from tray [P60] to Main Plot [U4]. Date: 2025-09-01' },

    // one per report, each on its own plot so they never mix
    cal(20, 'Seeds Received', 'P60', -30),
    cal(21, 'Transplanting',  'U3',  -53),
    cal(22, '1st Culling',    'P60', -20),
    cal(23, '2nd Culling',    'U4',  -7),
    cal(24, '3rd Culling',    'U3',  -4),
    // and one nobody has ruled on
    { id: 25, batch_name: '300', transaction_type: 'Stock_Calibration', quantity_change: -99,
      plot_name: 'U4', created_at: '2026-06-01T00:00:00Z',
      remark: 'Report: 3rd Culling. Plot: U4. not approved yet' },
    /* A row written while the form still ASKED, filed on the wrong side:
       a 3rd Culling loss recorded against the seed count. The stored Side:
       is ignored now, so it corrects itself. */
    { id: 26, batch_name: '300', transaction_type: 'Stock_Calibration', quantity_change: -6,
      plot_name: 'U4', created_at: '2026-06-01T00:00:00Z',
      remark: 'Report: 3rd Culling. Plot: U4. Side: seed. old mis-file [APPROVED by coco@mjmnursery.com on 2026-06-02]' }
  ],
  operation_trays: [{ tray_name: 'P60', nursery_name: 'PN', total_vacant: 2000 }],
  shared_do_records: [], operation_batch_verifications: [], nelos_cases: []
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
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
      permissions: { modules: { operation: 'admin', nelos: 'admin' }, manage_users: true } };
    window.__ROWS = rows;
    try { localStorage.clear(); } catch (e) {}
  }, { uid: UID, rows: ROWS });

  await page.goto(`http://localhost:${port}/operation/operation_batch_detail.html?id=300`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  const read = await page.evaluate(async () => {
    await syncAdjustmentBars('300');
    await new Promise(r => setTimeout(r, 400));
    return {
      // the form no longer asks
      askStillThere: !!document.getElementById('t7-cal-side'),
      // which side each report derives to
      side: ['Seeds Received','Planting','Seed Audit','Transplanting','1st Culling','2nd Culling','3rd Culling']
              .map(r => [r, ADJUST_SIDE_OF(r)]),
      // what the batch total carries: ONLY the initial ones
      total: adjustNetTotal(),
      // …and where each after-the-fact loss lands
      // what the Transplanting tab's own base carries
      transplantingTotal: adjustPlotLossTotal('Transplanting'),
      lands: {
        'U3 @transplanting': adjustPlotLoss('U3', 'Transplanting'),
        'U4 @transplanting': adjustPlotLoss('U4', 'Transplanting'),
        'U3 @1st': adjustPlotLoss('U3', '1st Culling'),
        'U3 @2nd': adjustPlotLoss('U3', '2nd Culling'),
        'U3 @3rd': adjustPlotLoss('U3', '3rd Culling'),
        'U4 @2nd': adjustPlotLoss('U4', '2nd Culling'),
        'U4 @3rd': adjustPlotLoss('U4', '3rd Culling'),
        'P60 @1st': adjustPlotLoss('P60', '1st Culling'),
        'P60 @2nd': adjustPlotLoss('P60', '2nd Culling'),
        'P60 @3rd': adjustPlotLoss('P60', '3rd Culling')
      }
    };
  });

  console.log('side per report :', JSON.stringify(read.side));
  console.log('batch total     :', read.total);
  console.log('where it lands  :', JSON.stringify(read.lands, null, 1));
  console.log('page errors     :', errs.length ? errs.join(' | ') : 'none');

  const sideOf = Object.fromEntries(read.side);
  /* A 1st Culling loss must not reach the Transplanting base either — that
     base is what went out, and the tray recount happened before it. */
  const adjustPlotLossTotalIsTrayFree = read.transplantingTotal === -53;
  const L = read.lands;

  const checks = [
    ['the form no longer asks which count was wrong', read.askStillThere === false],

    // ── which side the report derives to
    ['Seeds Received is initial', sideOf['Seeds Received'] === 'seed'],
    ['Planting is initial',       sideOf['Planting'] === 'seed'],
    ['Seed Audit is initial',     sideOf['Seed Audit'] === 'seed'],
    ['Transplanting is after the fact', sideOf['Transplanting'] === 'plot'],
    ['1st Culling is after the fact',   sideOf['1st Culling'] === 'plot'],
    ['2nd Culling is after the fact',   sideOf['2nd Culling'] === 'plot'],
    ['3rd Culling is after the fact',   sideOf['3rd Culling'] === 'plot'],

    // ── only the initial ones move the batch total
    ['the batch total carries the Seeds Received one alone', read.total === -30],

    // ── Transplanting: itself, 2nd and 3rd, never 1st
    ['a Transplanting loss comes off Transplanting itself', L['U3 @transplanting'] === -53],
    ['and off the tab\'s own allocation base', read.transplantingTotal === -53],
    ['a Transplanting loss reaches the 2nd culling', L['U3 @2nd'] === -53],
    ['and the 3rd', L['U3 @3rd'] === -53 + -4],
    ['and NOT the 1st — those never went out yet', L['U3 @1st'] === 0],

    // ── 1st Culling: itself only
    ['a 1st Culling loss stays on the 1st Culling', L['P60 @1st'] === -20],
    ['and reaches neither culling after it, nor the transplanting',
      L['P60 @2nd'] === 0 && L['P60 @3rd'] === 0 && adjustPlotLossTotalIsTrayFree],

    // ── 2nd Culling: itself and the 3rd, never the transplanting before it
    ['a 2nd Culling loss does not reach back to Transplanting', L['U4 @transplanting'] === 0],
    ['a 2nd Culling loss reaches the 2nd', L['U4 @2nd'] === -7],
    ['and NOT the 3rd — the drone counted the plot again after it',
      L['U4 @3rd'] === -6],

    // ── 3rd Culling: itself only
    ['a 3rd Culling loss reaches the 3rd and no earlier count',
      L['U3 @3rd'] === -57 && L['U3 @2nd'] === -53],

    // ── the old mis-file corrects itself
    ['a row filed against the seed count on a culling report is read the new way',
      L['U4 @3rd'] === -6 && read.total === -30],

    // ── and nothing unapproved moves anything
    ['an adjustment nobody has ruled on moves no figure', L['U4 @3rd'] !== -105],

    ['no page errors beyond the harness\'s own MJMReview race',
      errs.every(e => /MJMReview is not defined/.test(e))],
  ];
  let bad = 0;
  console.log('');
  for (const [l, p] of checks) { console.log((p ? 'ok   ' : 'FAIL ') + l); if (!p) bad++; }
  await browser.close(); server.close();
  process.exit(bad ? 1 : 0);
})();
