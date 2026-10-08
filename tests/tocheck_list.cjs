/* THE TO CHECK LIST.

   A report that has been filled in and not yet checked is invisible: nothing
   says so until somebody opens the batch and looks at the ticks. This chip is
   that list — every batch with at least one of five reports keyed and not
   signed off:

     Seeds In · Seed Audit · Planting & Damage · Transplanting · 1st Culling

   2nd and 3rd Culling are deliberately not among them.

   Three rules it has to get right:

     · FILLED means somebody put something in that stage — a quantity above
       nought, or a date. A saved row carrying neither exists and says
       nothing. Planting counts either a Planted or a Damaged_Seeds record
       — one tab, two kinds of record. Seeds In is every batch (the
       reception IS the report, nought included) and one Seed Audit row is
       one bag counted.
     · WAITING means nobody has signed it, EITHER WAY: the whole tab in one
       signature in operation_batch_verifications, or every row on it with a
       Row_Verification of its own. Transplanting and 1st Culling are the two
       tabs signed row by row; the rowKey is matched on its first segment,
       the plot or the tray.
     · A stage HQ has REJECTED is not waiting to be checked — it has been, and
       sent back. It belongs to Amendment Needed, and the two lists must not
       both ask for the same thing.

   Driven through the page's own loader with a stubbed Supabase that answers
   per table and per transaction_type.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/tocheck_list.cjs
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
/* The list page pages its queries through .range(), so the stub has to honour
   it — left as a passthrough, fetchAllRows loops for ever asking for page two
   and getting page one back. */
const FAKE_SUPABASE = `
window.supabase = { createClient: function () {
  function builder(table) {
    var b = { _t: table, _eq: {}, _in: null, _like: null, _one: false, _from: 0, _to: 1e9 };
    ['neq','is','or','not','gt','gte','lt','lte','ilike','order','limit','filter','match','contains','overlaps','select']
      .forEach(function (m) { b[m] = function () { return b; }; });
    b.eq = function (col, val) { b._eq[col] = val; return b; };
    b.in = function (col, vals) { b._in = { col: col, vals: vals.map(String) }; return b; };
    b.like = function (col, pat) { b._like = { col: col, pat: pat }; return b; };
    b.range = function (f, t) { b._from = f; b._to = t; return b; };
    b.single = function () { b._one = true; return b; };
    b.maybeSingle = b.single;
    b._rows = function () {
      if (table === 'shared_profiles' && window.__FAKE_PROFILE) return [window.__FAKE_PROFILE];
      var rows = (window.__ROWS && window.__ROWS[table]) || [];
      var eq = b._eq, lk = b._like;
      rows = rows.filter(function (r) {
        for (var k in eq) { if (String(r[k]) !== String(eq[k])) return false; }
        if (b._in && b._in.vals.indexOf(String(r[b._in.col])) < 0) return false;
        if (lk) {
          var pre = String(lk.pat).replace(/%$/, '');
          if (String(r[lk.col] || '').indexOf(pre) !== 0) return false;
        }
        return true;
      });
      return rows.slice(b._from, b._to + 1);
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

const rec = (batch) => ({ batch_name: batch, transaction_type: 'Seeds_Received', breed_name: 'IOI DxP HYBRID',
                          quantity_change: 1000, transaction_date: '2025-06-01', created_at: '2025-06-01T00:00:00Z',
                          plot_name: null, remark: '' });

/* Five batches, one per thing that can go wrong:

   401  everything keyed, nothing signed    → all five stages waiting
   402  everything keyed, everything signed → not on the list at all
   403  only Seeds In keyed                 → Seeds In alone, and NOT the four
                                               reports nobody has filled in
   404  Planting keyed as DAMAGE only, and
        its Seeds In signed                 → Planting alone
   405  Transplanting keyed and REJECTED,
        1st Culling keyed and not signed    → 1st Culling only; the rejected
                                               tab stays in Amendment Needed
   406  2nd and 3rd Culling keyed, nothing
        signed, Seeds In signed             → not on the list: those two are
                                               out of scope
   407  Transplanting over two plots, BOTH
        rows signed one at a time; 1st
        Culling over two trays, only ONE
        signed                              → 1st Culling alone. Row by row is
                                               a sign-off like any other, and
                                               half of them is not
   408  1st Culling saved with no quantity
        and no date                         → a row that says nothing is not a
                                               report somebody filled in       */
const ROWS = {
  shared_inventory_logs: [
    rec('401'), rec('402'), rec('403'), rec('404'), rec('405'), rec('406'), rec('407'), rec('408'),

    { batch_name: '401', transaction_type: 'Seed_Audit', plot_name: 'bag-1', quantity_change: 500, remark: 'Seed audit.' },
    { batch_name: '401', transaction_type: 'Planted', plot_name: 'P1', quantity_change: 980 },
    { batch_name: '401', transaction_type: 'Transplanted', plot_name: 'U1', quantity_change: 900, remark: 'from tray [P1]' },
    { batch_name: '401', transaction_type: '1st_Culling', plot_name: 'P1', quantity_change: 20 },

    { batch_name: '402', transaction_type: 'Seed_Audit', plot_name: 'bag-1', quantity_change: 500, remark: 'Seed audit.' },
    { batch_name: '402', transaction_type: 'Planted', plot_name: 'P2', quantity_change: 980 },
    { batch_name: '402', transaction_type: 'Transplanted', plot_name: 'U2', quantity_change: 900, remark: 'from tray [P2]' },
    { batch_name: '402', transaction_type: '1st_Culling', plot_name: 'P2', quantity_change: 20 },

    // 403 — nothing beyond its Seeds Received row.

    // 404 — the Planting tab filled in as damage, with no planting at all.
    { batch_name: '404', transaction_type: 'Damaged_Seeds', plot_name: null, quantity_change: 15 },

    { batch_name: '405', transaction_type: 'Transplanted', plot_name: 'U5', quantity_change: 800, remark: 'from tray [P5]' },
    { batch_name: '405', transaction_type: '1st_Culling', plot_name: 'P5', quantity_change: 30 },
    { batch_name: '405', transaction_type: 'Review_Rejection', plot_name: 'transplanting', quantity_change: 0,
      remark: 'Plot U5 qty does not match the field sheet.' },

    { batch_name: '406', transaction_type: '2nd_Culling', plot_name: 'U6', quantity_change: 40 },
    { batch_name: '406', transaction_type: '3rd_Culling', plot_name: 'U6', quantity_change: 60,
      remark: '3rd Culling. DestType: main MapQty: 60 CullDate:2026-06-01' },

    // 407 — signed row by row rather than tab by tab.
    { batch_name: '407', transaction_type: 'Planted', plot_name: 'P7', quantity_change: 500 },
    { batch_name: '407', transaction_type: 'Planted', plot_name: 'P8', quantity_change: 500 },
    { batch_name: '407', transaction_type: 'Transplanted', plot_name: 'U7', quantity_change: 480, remark: 'from tray [P7]' },
    { batch_name: '407', transaction_type: 'Transplanted', plot_name: 'U8', quantity_change: 470, remark: 'from tray [P8]' },
    { batch_name: '407', transaction_type: '1st_Culling', plot_name: 'P7', quantity_change: 20 },
    { batch_name: '407', transaction_type: '1st_Culling', plot_name: 'P8', quantity_change: 30 },
    // every transplant plot signed — the rowKey carries the dest, tray and
    // date after the plot, and only the plot is matched
    { batch_name: '407', transaction_type: 'Row_Verification', plot_name: 'transplanting::U7|main|P7|2026-01-05', quantity_change: 0 },
    { batch_name: '407', transaction_type: 'Row_Verification', plot_name: 'transplanting::U8|main|P8|2026-01-06', quantity_change: 0 },
    // one of the two culling trays signed, so that tab is NOT done
    { batch_name: '407', transaction_type: 'Row_Verification', plot_name: 'cull_1::P7', quantity_change: 0 },

    // 408 — a 1st Culling row that exists and says nothing.
    { batch_name: '408', transaction_type: 'Planted', plot_name: 'P9', quantity_change: 400 },
    { batch_name: '408', transaction_type: '1st_Culling', plot_name: 'P9', quantity_change: 0, remark: '1st culling.' }
  ],
  operation_batch_verifications: [
    { id: 1, batch_name: '402', stage: 'seeds_in' },
    { id: 2, batch_name: '402', stage: 'seed_audit' },
    { id: 3, batch_name: '402', stage: 'planting' },
    { id: 4, batch_name: '402', stage: 'transplanting' },
    { id: 5, batch_name: '402', stage: 'cull_1' },
    { id: 6, batch_name: '404', stage: 'seeds_in' },
    { id: 7, batch_name: '405', stage: 'seeds_in' },
    { id: 8, batch_name: '406', stage: 'seeds_in' },
    { id: 9,  batch_name: '407', stage: 'seeds_in' },
    { id: 10, batch_name: '408', stage: 'seeds_in' },
    { id: 11, batch_name: '408', stage: 'planting' }
  ],
  shared_do_records: [],
  operation_trays: [],
  shared_profiles: []
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
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
    try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}
  }, { uid: UID, rows: ROWS });

  await page.goto(`http://localhost:${port}/operation/operation_batch_record.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const chip = await page.evaluate(() => {
    const el = document.getElementById('tab-tocheck');
    const bar = el && el.parentElement;
    const order = bar ? [...bar.children].map(b => b.id) : [];
    return { there: !!el, label: el ? el.innerText.replace(/\s+/g, ' ').trim() : '',
             afterAmendment: order.indexOf('tab-tocheck') === order.indexOf('tab-amendment') + 1 };
  });

  const computed = await page.evaluate(() =>
    Object.fromEntries(masterBatches.map(b => [b.batch_name, b.toCheck || []])));

  const listed = await page.evaluate(async () => {
    switchListTab('tocheck');
    await new Promise(r => setTimeout(r, 300));
    const head = [...document.querySelectorAll('#ledger-head-row th')].map(t => t.innerText.trim());
    const rows = [...document.querySelectorAll('#ledger-body tr')].map(r =>
      [...r.children].map(c => (c.textContent || '').replace(/\s+/g, ' ').trim()));
    return { head, rows, lit: document.getElementById('tab-tocheck').className.includes('list-tab-active') };
  });

  // Switching away and back must leave the other tabs as they were.
  const others = await page.evaluate(async () => {
    switchListTab('amendment');
    await new Promise(r => setTimeout(r, 250));
    const amend = [...document.querySelectorAll('#ledger-body tr')].map(r => (r.children[0]?.textContent || '').trim());
    switchListTab('active');
    await new Promise(r => setTimeout(r, 250));
    const active = [...document.querySelectorAll('#ledger-body tr')].map(r => (r.children[0]?.textContent || '').trim());
    const headBack = [...document.querySelectorAll('#ledger-head-row th')].map(t => t.innerText.trim());
    return { amend, active, headBack };
  });

  console.log('chip        :', JSON.stringify(chip));
  console.log('computed    :', JSON.stringify(computed));
  console.log('head        :', JSON.stringify(listed.head));
  console.log('rows        :', JSON.stringify(listed.rows.map(r => r.slice(0, 3))));
  console.log('other tabs  :', JSON.stringify(others));
  console.log('page errors :', errs.length ? errs.join(' | ') : 'none');

  const batchesListed = listed.rows.map(r => r[0]);
  const cellOf = (n) => (listed.rows.find(r => r[0] === n) || [])[2] || '';

  const checks = [
    // ── the chip
    ['the chip is there', chip.there === true],
    ['called To Check List', /to check list/i.test(chip.label)],
    ['sitting beside Amendment Needed', chip.afterAmendment === true],
    ['and lights up when chosen', listed.lit === true],
    ['with a column saying which report is waiting',
      listed.head.some(h => /waiting to be checked/i.test(h))],

    // ── who is on it
    ['a batch with everything keyed and nothing signed is on it', batchesListed.includes('401')],
    ['with all five reports named',
      ['Seeds In', 'Seed Audit', 'Planting & Damage', 'Transplanting', '1st Culling']
        .every(l => cellOf('401').includes(l))],
    ['in the order they are filled in',
      JSON.stringify(computed['401']) ===
      JSON.stringify(['seeds_in', 'seed_audit', 'planting', 'transplanting', 'cull_1'])],

    ['a batch signed off all the way is not on it', !batchesListed.includes('402')],

    ['a report nobody has filled in is not waiting to be checked',
      JSON.stringify(computed['403']) === JSON.stringify(['seeds_in'])],
    ['so that batch is on the list for Seeds In alone',
      batchesListed.includes('403') && cellOf('403').includes('Seeds In')
      && !/transplanting|1st culling|seed audit/i.test(cellOf('403'))],

    ['damage keyed with no planting still fills the Planting tab',
      JSON.stringify(computed['404']) === JSON.stringify(['planting'])],

    ['a REJECTED report is not also asked to be checked',
      JSON.stringify(computed['405']) === JSON.stringify(['cull_1'])],
    ['its batch is on both lists, for different reports',
      batchesListed.includes('405') && others.amend.includes('405')
      && cellOf('405').includes('1st Culling') && !cellOf('405').includes('Transplanting')],

    ['2nd and 3rd Culling are out of scope',
      JSON.stringify(computed['406']) === JSON.stringify([]) && !batchesListed.includes('406')],

    // ── a sign-off comes two ways
    ['a tab signed row by row is a tab somebody checked',
      !computed['407'].includes('transplanting')],
    ['\u2026and half its rows signed is not',
      computed['407'].includes('cull_1')],
    ['so that batch asks for 1st Culling alone',
      JSON.stringify(computed['407']) === JSON.stringify(['planting', 'cull_1'])
      && batchesListed.includes('407')
      && cellOf('407').includes('1st Culling') && !cellOf('407').includes('Transplanting')],

    // ── a row that says nothing is not a report
    ['a culling row with no quantity and no date is not filled in',
      JSON.stringify(computed['408']) === JSON.stringify([])],
    ['so that batch is not on the list at all', !batchesListed.includes('408')],

    // ── the other tabs are untouched
    ['Amendment Needed still lists only the rejected batch',
      JSON.stringify(others.amend) === JSON.stringify(['405'])],
    ['Active still lists every unfinished batch', others.active.length === 8],
    ['and gets its own columns back', others.headBack.some(h => /planted/i.test(h))],
    ['no page errors', errs.length === 0],
  ];
  let bad = 0;
  console.log('');
  for (const [l, p] of checks) { console.log((p ? 'ok   ' : 'FAIL ') + l); if (!p) bad++; }
  await browser.close(); server.close();
  process.exit(bad ? 1 : 0);
})();
