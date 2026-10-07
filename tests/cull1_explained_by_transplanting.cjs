/* 1ST CULLING IS NOT WRONG WHEN TRANSPLANTING WAS ADJUSTED AFTER IT.

   A plot can be over-allocated: the transplant record counts 1,053 into U3
   and only 1,000 ever went in. The office raises a Transplanting adjustment
   of -53 and Transplanting settles. 1st Culling does not, and must not: a
   1st culling happens in the TRAY, before any of these seedlings go out, so
   taking the plot's loss off it as well would subtract one loss twice.

   What that leaves is a report whose arithmetic is right and whose status
   line reads "Over by 53" for ever -- so its ring never fills, no tick can
   be given, and a stage that can never be finished is one people stop
   looking at.

   So where the difference is EXACTLY the batch's Transplanting adjustments,
   the tab says so in a note of its own and the ring is allowed to finish.
   Exactly: a near-match is a coincidence, and a note that guessed at one
   would teach people to wave real mistakes through.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/cull1_explained_by_transplanting.cjs
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



/* 1,000 seeds planted in P60, and a transplant record of 1,053 into U3 --
   53 more than there were. Nothing culled yet, so the only thing out of
   place is the over-allocation.

       total     = 1,000 planted
       accounted = 1,053 transplanted + 0 culled
       unaccounted = -53                 "Over by 53"

   The adjustment that accounts for it is -53 on U3, filed against
   Transplanting. */
const TX_QTY = 1053;
const CAL_TRANSPLANTING = {
  id: 20, batch_name: '400', transaction_type: 'Stock_Calibration', quantity_change: -53,
  plot_name: 'U3', transaction_date: '2026-03-10', created_at: '2026-03-10T00:00:00Z',
  remark: 'Report: Transplanting. Plot: U3. 53 never reached the plot'
};

const BASE_LOGS = [
  { id: 1, batch_name: '400', transaction_type: 'Seeds_Received', quantity_change: 1000,
    breed_name: 'IOI DxP HYBRID', transaction_date: '2025-06-01', created_at: '2025-06-01T00:00:00Z',
    plot_name: null, remark: 'Seeds received. Supplier: IOI. DO_Qty: 1000. Incl. 0% FOC.' },
  { id: 2, batch_name: '400', transaction_type: 'Planted', plot_name: 'P60', quantity_change: 1000,
    transaction_date: '2025-06-05', created_at: '2025-06-05T00:00:00Z',
    remark: 'Planted in Pre-Nursery tray P60. TotalPlanted:1000. EmptyHoles:0.' },
  { id: 3, batch_name: '400', transaction_type: 'Transplanted', plot_name: 'U3', quantity_change: TX_QTY,
    transaction_date: '2025-09-01', created_at: '2025-09-01T00:00:00Z',
    remark: 'Transplanted from tray [P60] to Main Plot [U3]. Date: 2025-09-01' }
];

const ROWS = {
  shared_inventory_logs: BASE_LOGS.slice(),
  operation_trays: [{ tray_name: 'P60', nursery_name: 'PN', total_vacant: 2000 }],
  shared_do_records: [], operation_batch_verifications: [], nelos_cases: []
};

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

/* What tab 4 says, after letting the adjustments load and the report
   recompute off them. */
async function readTab4(page) {
  return page.evaluate(async () => {
    await syncAdjustmentBars('400');
    await new Promise(r => setTimeout(r, 400));
    if (typeof calcCulling === 'function') calcCulling();
    const note = document.getElementById('t4-adjust-note');
    const pie  = document.getElementById('t4-pie-tab');
    return {
      pct:     parseFloat(pie.style.getPropertyValue('--percentage') || '0'),
      title:   (document.getElementById('t4-balance-title') || {}).innerText || '',
      status:  (document.getElementById('t4-status-desc')   || {}).innerText || '',
      noteHidden: !note || note.classList.contains('hidden'),
      noteText:   note ? note.innerText.replace(/\s+/g, ' ').trim() : '',
      transplantingAdj: typeof adjustPlotLossTotal === 'function'
                      ? adjustPlotLossTotal('Transplanting') : 0
    };
  });
}

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

  await page.goto(`http://localhost:${port}/operation/operation_batch_detail.html?id=400`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  console.log('\nWITHOUT the adjustment, the report is over-allocated and says so');
  const before = await readTab4(page);
  check('no Transplanting adjustment yet', before.transplantingAdj, 0);
  checkTrue('the status line names the over-allocation', /Over Allocated by 53/.test(before.status));
  check('the ring is not full', before.pct < 100, true);
  check('and nothing is explained away', before.noteHidden, true);

  console.log('\nThe adjustment that accounts for it goes on Transplanting');
  await page.evaluate((cal) => { window.__ROWS.shared_inventory_logs.push(cal); }, CAL_TRANSPLANTING);
  const after = await readTab4(page);
  check('it reaches the Transplanting base', after.transplantingAdj, -53);
  /* AND NOT THE 1ST CULLING ITSELF. The tray count is untouched -- that is
     the rule this note exists to explain, not to work around. */
  check('the 1st Culling tray figures do not carry it',
        await page.evaluate(() => adjustPlotLoss('P60', '1st Culling')), 0);

  console.log('\nSo the tab says why, instead of reading wrong for ever');
  check('the note is shown', after.noteHidden, false);
  checkTrue('it names the plot and the figure', /U3 was adjusted by -53/.test(after.noteText));
  checkTrue('…and says it happened after this culling',
            /AFTER this culling was done/i.test(after.noteText));
  checkTrue('…and that nothing here needs correcting',
            /Nothing on this tab needs correcting/i.test(after.noteText));
  checkTrue('…and why it is not taken off here as well',
            /subtract the same loss twice/i.test(after.noteText));

  console.log('\nAnd the ring may finish, so the tab can be ticked off');
  check('the ring is full', after.pct, 100);
  checkTrue('the status line stops calling it over-allocated',
            !/Over Allocated/.test(after.status));
  checkTrue('…and says where the difference went instead',
            /adjusted on Transplanting/i.test(after.status));
  checkTrue('the balance box agrees', /Balanced/.test(after.title));

  console.log('\nA difference that is NOT the adjustment is still a mistake');
  await page.evaluate(() => {
    const logs = window.__ROWS.shared_inventory_logs;
    const cal = logs.find(r => r.transaction_type === 'Stock_Calibration');
    cal.quantity_change = -40;          // no longer the whole 53
  });
  const partial = await readTab4(page);
  check('the note is gone', partial.noteHidden, true);
  checkTrue('and the report goes back to saying it is over-allocated',
            /Over Allocated by 53/.test(partial.status));
  check('…with the ring held short of full', partial.pct < 100, true);

  console.log('\nPage errors');
  const real = errs.filter(e => !/MJMReview/.test(e));
  check('none beyond the harness\'s own MJMReview race', real, []);

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
