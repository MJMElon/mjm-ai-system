/* A MOVEMENT KEYED TWICE.

   Batch 242's U17 showed the same movement twice — 21 Aug, U17-R, 71 — and
   Total Transferred read 142 for the 71 that moved. It was deleted once and
   came back weeks later.

   Nothing on the way in ever questioned it, and nothing on screen said the
   two lines were the same line. Now:

     · the pair is flagged ON the lines, in red, saying what is identical;
     · the save asks before writing a repeat, so it is questioned while
       somebody can still answer;
     · a save whose delete removes nothing is no longer reported as a
       success — that is the failure that makes a deleted duplicate COME
       BACK, because every later save adds a copy and clears none.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/duplicate_transfer.cjs
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
      /* A delete answers with the rows it REMOVED. __DELETE_RETURNS set to
         an empty array is a delete that matched and was refused — no error,
         nothing gone — which is the state under test. */
      if (b._deleted) {
        return { data: window.__DELETE_RETURNS || b._rows(), error: null, count: 0 };
      }
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
      b._deleted = true;
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


/* Batch 242, as the screenshot had it: U17 sends 71 to U17-R on 21 Aug,
   recorded twice. B3 sends two DIFFERENT quantities to B9-R on one day,
   which is two lorries and not a double. */
const ROWS = {
  shared_inventory_logs: [
    { id: 1, batch_name: '242', transaction_type: 'Seeds_Received', quantity_change: 1000,
      breed_name: 'IOI DxP HYBRID', transaction_date: '2025-06-01', created_at: '2025-06-01T00:00:00Z',
      plot_name: null, remark: 'Seeds received. Supplier: IOI. DO_Qty: 1000. Incl. 0% FOC.' },
    { id: 2, batch_name: '242', transaction_type: 'Transplanted', plot_name: 'U17', quantity_change: 658,
      remark: 'Transplanted from tray [P1] to Main Plot [U17]. Date: 2025-09-01' },
    { id: 3, batch_name: '242', transaction_type: 'Transplanted', plot_name: 'B3', quantity_change: 400,
      remark: 'Transplanted from tray [P1] to Main Plot [B3]. Date: 2025-09-01' },
    // The double.
    { id: 10, batch_name: '242', transaction_type: 'Cull3_Transfer', plot_name: 'U17-R', quantity_change: 71,
      transaction_date: '2026-08-21', created_at: '2026-09-19T08:00:00Z',
      remark: '3rd Culling transfer. From: [U17|main] To: [U17-R] Qty: 71. Date: 2026-08-21.' },
    { id: 11, batch_name: '242', transaction_type: 'Cull3_Transfer', plot_name: 'U17-R', quantity_change: 71,
      transaction_date: '2026-08-21', created_at: '2026-09-19T08:00:00Z',
      remark: '3rd Culling transfer. From: [U17|main] To: [U17-R] Qty: 71. Date: 2026-08-21.' },
    // NOT a double: same day, same destination, different quantities.
    { id: 12, batch_name: '242', transaction_type: 'Cull3_Transfer', plot_name: 'B9-R', quantity_change: 40,
      transaction_date: '2026-05-02', created_at: '2026-05-02T01:00:00Z',
      remark: '3rd Culling transfer. From: [B3|main] To: [B9-R] Qty: 40. Date: 2026-05-02.' },
    { id: 13, batch_name: '242', transaction_type: 'Cull3_Transfer', plot_name: 'B9-R', quantity_change: 55,
      transaction_date: '2026-05-02', created_at: '2026-05-02T01:00:00Z',
      remark: '3rd Culling transfer. From: [B3|main] To: [B9-R] Qty: 55. Date: 2026-05-02.' }
  ],
  operation_trays: [], shared_do_records: [], operation_batch_verifications: [], nelos_cases: []
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

  await page.goto(`http://localhost:${port}/operation/operation_batch_detail.html?id=242`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  const seen = await page.evaluate(async () => {
    switchTab(6);
    await new Promise(r => setTimeout(r, 1400));
    switchT6SubTab('transferdata');
    await new Promise(r => setTimeout(r, 400));
    const idxOf = (p) => t6_plotData.findIndex(x => String(x.plot).trim().toUpperCase() === p);
    const total = (p) => (document.getElementById(`t6-row-${idxOf(p)}-tdata-total`)?.textContent || '').trim();
    const flagged = [...document.querySelectorAll('#t6-transferdata-rows .t6-transfer-rec')]
      .filter(r => r.classList.contains('bg-[#fff5f5]'));
    return {
      dupes: t6DuplicateTransfers().map(d => ({ from: d.from, to: d.to, qty: d.qty, n: d.n })),
      flaggedLines: flagged.length,
      flagText: flagged.length ? (flagged[0].querySelector('.t6-tr-todo')?.textContent || '').replace(/\s+/g,' ').trim() : '',
      u17Lines: document.querySelectorAll(`#t6-row-${idxOf('U17')}-transfers .t6-transfer-rec`).length,
      b3Lines:  document.querySelectorAll(`#t6-row-${idxOf('B3')}-transfers .t6-transfer-rec`).length,
      b3Flagged: [...document.querySelectorAll(`#t6-row-${idxOf('B3')}-transfers .t6-transfer-rec`)]
                   .filter(r => r.classList.contains('bg-[#fff5f5]')).length,
      u17Total: total('U17'), b3Total: total('B3')
    };
  });

  // The save asks first, and CANCEL means nothing is written.
  const asked = await page.evaluate(async () => {
    let question = null;
    const realConfirm = window.confirm;
    window.confirm = (m) => { question = m; return false; };          // Cancel
    const wrote = [];
    const realReplace = window.safeReplaceLogs;
    window.safeReplaceLogs = (b, t, logs) => { wrote.push(...logs); return Promise.resolve({ error: null }); };
    window.showToast = () => {};
    await saveTab6();
    window.confirm = realConfirm; window.safeReplaceLogs = realReplace;
    return { question, wrote: wrote.length };
  });

  // …and OK means it is stored, because two lorries is a real answer.
  const kept = await page.evaluate(async () => {
    const realConfirm = window.confirm;
    window.confirm = () => true;
    const wrote = [];
    const realReplace = window.safeReplaceLogs;
    window.safeReplaceLogs = (b, t, logs) => { wrote.push(...logs.filter(l => l.transaction_type === 'Cull3_Transfer')); return Promise.resolve({ error: null }); };
    window.showToast = () => {};
    await saveTab6();
    window.confirm = realConfirm; window.safeReplaceLogs = realReplace;
    return { transfers: wrote.length };
  });

  /* THE ONE THAT MAKES A DELETED DUPLICATE COME BACK: the delete removes
     nothing and says nothing. safeReplaceLogs must not call that a save. */
  const silentDelete = await page.evaluate(async () => {
    const out = {};
    window.__DELETE_RETURNS = [];               // the stub's delete().select() → no rows
    const { error } = await safeReplaceLogs('242', ['Cull3_Transfer'],
      [{ transaction_type: 'Cull3_Transfer', batch_name: '242', plot_name: 'U17-R', quantity_change: 71 }]);
    out.message = error ? error.message : null;
    return out;
  });

  console.log('on screen   :', JSON.stringify(seen, null, 1));
  console.log('save asked  :', JSON.stringify(asked));
  console.log('OK keeps it :', JSON.stringify(kept));
  console.log('silent del  :', JSON.stringify(silentDelete));
  console.log('page errors :', errs.length ? errs.join(' | ') : 'none');

  const checks = [
    ['the repeated movement is spotted', seen.dupes.length === 1],
    ['naming it', seen.dupes[0] && seen.dupes[0].from === 'U17'
                 && seen.dupes[0].to === 'U17-R' && seen.dupes[0].qty === 71 && seen.dupes[0].n === 2],
    ['both its lines are flagged', seen.flaggedLines === 2],
    ['saying what is identical about them',
      /keyed twice/i.test(seen.flagText) && /same day/i.test(seen.flagText)
      && /same plot/i.test(seen.flagText) && /same quantity/i.test(seen.flagText)],
    ['the figure it inflates is still shown as it is — 142 for 71 that moved',
      seen.u17Total === '142'],
    // ── two lorries is not a double
    ['two different quantities on one day are two movements', seen.b3Lines === 2],
    ['and neither is flagged', seen.b3Flagged === 0],
    ['nor counted as one', seen.b3Total === '95'],
    // ── the save
    ['the save asks before writing a repeat', !!asked.question],
    ['saying which movement and how many times',
      /U17 → U17-R/.test(asked.question || '') && /keyed 2 times/i.test(asked.question || '')],
    ['Cancel writes nothing at all', asked.wrote === 0],
    ['OK stores it, because two lorries is a real answer', kept.transfers === 4],
    // ── the delete that does not take
    ['a delete that removes nothing is not called a save', !!silentDelete.message],
    ['and says what it means for the batch',
      /were NOT removed/i.test(silentDelete.message || '') && /twice/i.test(silentDelete.message || '')],
    ['no page errors beyond the harness\'s own MJMReview race',
      errs.every(e => /MJMReview is not defined/.test(e))],
  ];
  let bad = 0;
  console.log('');
  for (const [l, p] of checks) { console.log((p ? 'ok   ' : 'FAIL ') + l); if (!p) bad++; }
  await browser.close(); server.close();
  process.exit(bad ? 1 : 0);
})();
