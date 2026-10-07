/* A TRANSPLANTING ADJUSTMENT THAT NAMES ITS TRAY CLOSES PENDING.

   Two corrections wear the same name and are not the same thing. Both say
   the plot does not hold what the transplant record claims; they differ in
   where the seedlings are now, and only the person who raised it knows:

     NAMES A TRAY -- the count of what LEFT the tray was wrong. The batch
       still has them. The allocation BASE does not move; what is standing in
       the main plots does, and Pending closes by that much.

     NAMES NO TRAY -- they reached the plot and then went: stolen, dead,
       miscounted on the ground. The base moves too, both sides drop by the
       same amount, and Pending is unchanged. That is the batch 234 rule from
       before and it stays.

   Batch 234 is why. Planted 15,734 and 190 keyed into the D-Tone nursery,
   14,785 into main plots, 1,133 first-culled, and a +6 adjustment on a plot,
   raised against the tray it came out of: six more had gone out than the row
   said. Pending read 6 -- the old sum put the +6 on BOTH sides and cancelled
   it -- so the tab went on looking for six seedlings that were already
   standing in the plot, and its ring could never leave 99%.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/tray_named_adjustment_closes_pending.cjs
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



/* 234's figures, rounded to the ones that matter. One tray, one main plot. */
const PLANTED   = 15734;
const DTONE_QTY = 190;
const TO_MAIN   = 14785;
const CULLED_1  = 1133;

const CAL = (n, qty, remark) => ({
  id: n, batch_name: '234', transaction_type: 'Stock_Calibration', quantity_change: qty,
  plot_name: 'B14', transaction_date: '2026-09-20', created_at: '2026-09-20T00:00:00Z',
  remark: remark + ' [APPROVED by esther@mjmnursery.com on 2026-09-21]'
});

/* The two shapes, on the same plot and the same quantity, so the ONLY thing
   that differs between the runs below is whether a tray is named. */
const WITH_TRAY = CAL(30,  6, 'Report: Transplanting. Plot: B14. Tray: P60. six more went out than the row said');
const NO_TRAY   = CAL(31, -6, 'Report: Transplanting. Plot: B14. six were taken off the plot');

const BASE_LOGS = [
  { id: 1, batch_name: '234', transaction_type: 'Seeds_Received', quantity_change: PLANTED,
    breed_name: 'UPB PREMIER HYBRID', transaction_date: '2026-06-26', created_at: '2026-06-26T00:00:00Z',
    plot_name: null, remark: 'Seeds received. Supplier: UPB. DO_Qty: ' + PLANTED + '. Incl. 0% FOC.' },
  { id: 2, batch_name: '234', transaction_type: 'Planted', plot_name: 'P60', quantity_change: PLANTED,
    transaction_date: '2026-06-30', created_at: '2026-06-30T00:00:00Z',
    remark: 'Planted in Pre-Nursery tray P60. TotalPlanted:' + PLANTED + '. EmptyHoles:0.' },
  { id: 3, batch_name: '234', transaction_type: 'Transplanted', plot_name: 'B14', quantity_change: TO_MAIN,
    transaction_date: '2026-09-01', created_at: '2026-09-01T00:00:00Z',
    remark: 'Transplanted from tray [P60] to Main Plot [B14]. Date: 2026-09-01 MapUrl:https://x/b14.jpg' },
  { id: 4, batch_name: '234', transaction_type: '1st_Culling', plot_name: 'P60', quantity_change: CULLED_1,
    transaction_date: '2026-08-15', created_at: '2026-08-15T00:00:00Z',
    remark: 'First culling from tray P60' },
  { id: 5, batch_name: '234', transaction_type: 'DTone_Nursery_Qty', plot_name: 'D-Tone',
    quantity_change: DTONE_QTY, transaction_date: '2026-09-01', created_at: '2026-09-01T00:00:00Z',
    remark: 'Double Tone quantity in nursery (admin keyed): ' + DTONE_QTY }
];

const ROWS = {
  shared_inventory_logs: BASE_LOGS.slice(),
  operation_trays: [{ tray_name: 'P60', nursery_name: 'PN', total_vacant: 20000 }],
  shared_do_records: [], operation_batch_verifications: [], nelos_cases: []
};

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

/* What the Transplanting tab says, after the adjustments have loaded and the
   tab has recomputed off them. */
async function readTab3(page) {
  return page.evaluate(async () => {
    await syncAdjustmentBars('234');
    await new Promise(r => setTimeout(r, 400));
    if (typeof calcTransplanting === 'function') calcTransplanting();
    const num = (id) => {
      const el = document.getElementById(id);
      return el ? (parseInt(String(el.innerText).replace(/,/g, ''), 10) || 0) : null;
    };
    return {
      pending:   num('t3-val-untransplanted'),
      base:      num('t3-chart-total'),
      pct:       parseFloat(document.getElementById('t3-pie-tab')
                    .style.getPropertyValue('--percentage') || '0'),
      allAdj:    typeof adjustPlotLossTotal   === 'function' ? adjustPlotLossTotal('Transplanting')   : null,
      trayAdj:   typeof adjustTrayNamedTotal  === 'function' ? adjustTrayNamedTotal('Transplanting')  : null
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

  await page.goto(`http://localhost:${port}/operation/operation_batch_detail.html?id=234`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  console.log('\nWithout any adjustment, six seedlings are unaccounted for');
  const plain = await readTab3(page);
  check('the base is what was planted plus the D-Tone nursery figure',
        plain.base, PLANTED + DTONE_QTY);
  check('and six have reached neither a main plot nor the first culling',
        plain.pending, PLANTED + DTONE_QTY - TO_MAIN - CULLED_1);
  check('\u2026which is six', plain.pending, 6);
  check('so the ring cannot leave 99%', plain.pct < 100, true);

  console.log('\nA +6 that NAMES ITS TRAY closes it');
  await page.evaluate((cal) => { window.__ROWS.shared_inventory_logs.push(cal); }, WITH_TRAY);
  const tray = await readTab3(page);
  check('it is read as a tray-named one', [tray.allAdj, tray.trayAdj], [6, 6]);
  /* THE BASE DOES NOT MOVE. The same seeds were planted; what was wrong is
     how many of them left the tray. */
  check('the base is untouched', tray.base, PLANTED + DTONE_QTY);
  check('PENDING IS NOUGHT \u2014 the six are standing in the plot', tray.pending, 0);
  check('and the ring may finish', tray.pct, 100);

  console.log('\nThe same figure with NO tray does not, and must not');
  await page.evaluate(() => {
    window.__ROWS.shared_inventory_logs = window.__ROWS.shared_inventory_logs
      .filter(r => r.transaction_type !== 'Stock_Calibration');
  });
  await page.evaluate((cal) => { window.__ROWS.shared_inventory_logs.push(cal); }, NO_TRAY);
  const gone = await readTab3(page);
  check('it is read as a plot loss, not a tray one', [gone.allAdj, gone.trayAdj], [-6, 0]);
  /* BOTH SIDES MOVE. Six left the plot, so the batch has six fewer to
     allocate AND six fewer standing. Taking it off one side only is what made
     234 read over-allocated in the first place. */
  check('the base drops by six', gone.base, PLANTED + DTONE_QTY - 6);
  check('and Pending is unchanged \u2014 it explains nothing about what is pending',
        gone.pending, 6);

  console.log('\nBoth at once: each does its own half');
  await page.evaluate((cal) => { window.__ROWS.shared_inventory_logs.push(cal); }, WITH_TRAY);
  const both = await readTab3(page);
  check('the nets are told apart', [both.allAdj, both.trayAdj], [0, 6]);
  check('the base carries only the one that named no tray',
        both.base, PLANTED + DTONE_QTY - 6);
  check('and Pending carries only the one that named a tray', both.pending, 0);

  console.log('\nThe form says what naming a tray means');
  const said = await page.evaluate(() => {
    const h = window._t7TrayTableHtml
      ? window._t7TrayTableHtml('B14', [{ tray: 'P60', qty: 100, dates: [] }], true, '', (x) => String(x))
      : '';
    return h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  });
  checkTrue('it tells you when to key one', /Key a tray when the count of what LEFT that tray was wrong/i.test(said));
  checkTrue('\u2026and when to leave it empty', /Leave the column empty when they reached the plot and then went/i.test(said));

  console.log('\nPage errors');
  const real = errs.filter(e => !/MJMReview/.test(e));
  check('none beyond the harness\'s own MJMReview race', real, []);

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
