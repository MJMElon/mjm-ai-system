/* OVER ALLOCATED BY EXACTLY THE ADJUSTMENT IS NOT OVER ALLOCATED.

   A tray-named Transplanting adjustment moves what is standing in the main
   plots and leaves the batch total alone -- the seedlings were always in the
   batch, the count of what left the tray was wrong. Where a report balanced
   exactly WITHOUT it, adding it makes the allocation read Over Allocated by
   precisely that much, and the engine put a red ERROR over the one figure on
   the screen that already accounted for it.

   Batch 225: 9,658 into main plots and 815 first-culled against a base of
   10,473 -- it balances to the seedling. Then +1 on N19, "found 1 more
   seedling when processing the 2nd culling", keyed against the tray it came
   out of. Over Allocated by 1, ring stuck at 99%, stage can never be ticked
   off.

   rawPending is the sum LESS the tray-named net, so rawPending being exactly
   minus that net is the same statement as "it balances on its own figures".
   That is what this tests, in both directions, and that a difference which is
   NOT the adjustment still reads as an error.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/over_allocated_by_the_adjustment.cjs
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



/* 225's figures, stripped to one tray and one main plot: the D-Tone
   pass-through is left out because it bears on neither side of this rule and
   its own holding tray would need three more rows to balance. So the
   arithmetic on screen is the arithmetic here. */
const PLANTED  = 10473;   // into tray P50
const TO_MAIN  = 9658;    // dest = Main Plot
const CULLED_1 = 815;
// 9,658 + 815 = 10,473, against a base of 10,473. It balances to the seedling.

const CAL = (n, qty, remark) => ({
  id: n, batch_name: '225', transaction_type: 'Stock_Calibration', quantity_change: qty,
  plot_name: 'N19', transaction_date: '2025-12-27', created_at: '2025-12-27T00:00:00Z',
  remark: remark + ' [APPROVED by esther@mjmnursery.com on 2026-10-07]'
});

const WITH_TRAY = CAL(40, 1,
  'Report: Transplanting. Plot: N19. Tray: P50. Found 1 more seedling when process 2nd culling.');
/* The same +1 naming NO tray is a plot gain: the batch has one more than it
   was ever given, which IS an error and must go on reading as one. */
const NO_TRAY   = CAL(41, 1,
  'Report: Transplanting. Plot: N19. Found 1 more seedling when process 2nd culling.');
/* And a tray-named one that does NOT match the difference. */
const WRONG_SIZE = CAL(42, 9,
  'Report: Transplanting. Plot: N19. Tray: P50. nine more');

const BASE_LOGS = [
  { id: 1, batch_name: '225', transaction_type: 'Seeds_Received', quantity_change: PLANTED,
    breed_name: 'AA HYBRIDA 1S', transaction_date: '2024-12-20', created_at: '2024-12-20T00:00:00Z',
    plot_name: null, remark: 'Seeds received. Supplier: AA. DO_Qty: ' + PLANTED + '. Incl. 0% FOC.' },
  { id: 2, batch_name: '225', transaction_type: 'Planted', plot_name: 'P50', quantity_change: PLANTED,
    transaction_date: '2024-12-20', created_at: '2024-12-20T00:00:00Z',
    remark: 'Planted in Pre-Nursery tray P50. TotalPlanted:' + PLANTED + '. EmptyHoles:0.' },
  { id: 3, batch_name: '225', transaction_type: 'Transplanted', plot_name: 'N19', quantity_change: TO_MAIN,
    transaction_date: '2025-03-20', created_at: '2025-03-20T00:00:00Z',
    remark: 'Transplanted from tray [P50] to Main Plot [N19]. Date: 2025-03-20 MapUrl:https://x/n19.jpg' },
  { id: 4, batch_name: '225', transaction_type: '1st_Culling', plot_name: 'P50', quantity_change: CULLED_1,
    transaction_date: '2025-02-15', created_at: '2025-02-15T00:00:00Z',
    remark: 'First culling from tray P50' }
];

const ROWS = {
  shared_inventory_logs: BASE_LOGS.slice(),
  operation_trays: [{ tray_name: 'P50', nursery_name: 'PN', total_vacant: 20000 }],
  shared_do_records: [], operation_batch_verifications: [], nelos_cases: []
};

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

async function readTab3(page) {
  return page.evaluate(async () => {
    await syncAdjustmentBars('225');
    await new Promise(r => setTimeout(r, 400));
    if (typeof calcTransplanting === 'function') calcTransplanting();
    const txt = (id) => { const el = document.getElementById(id); return el ? String(el.innerText).trim() : null; };
    const note = document.getElementById('t3-adjust-note');
    return {
      matchTitle: txt('t3-match-title'),
      matchDesc:  txt('t3-match-desc'),
      status:     txt('t3-status-desc'),
      pct: parseFloat(document.getElementById('t3-pie-tab').style.getPropertyValue('--percentage') || '0'),
      noteHidden: !note || note.classList.contains('hidden'),
      noteText:   note ? note.innerText.replace(/\s+/g, ' ').trim() : '',
      trayAdj: typeof adjustTrayNamedTotal === 'function' ? adjustTrayNamedTotal('Transplanting') : null
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

  await page.goto(`http://localhost:${port}/operation/operation_batch_detail.html?id=225`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  console.log('\nWith nothing adjusted the allocation balances');
  const plain = await readTab3(page);
  check('no tray-named adjustment yet', plain.trayAdj, 0);
  check('the match box is satisfied', plain.matchTitle, 'Satisfied');
  check('and nothing is explained away', plain.noteHidden, true);

  console.log('\nA tray-named +1 pushes it over by exactly 1');
  await page.evaluate((cal) => { window.__ROWS.shared_inventory_logs.push(cal); }, WITH_TRAY);
  const one = await readTab3(page);
  check('the adjustment is read as tray-named', one.trayAdj, 1);
  /* The engine used to put a red ERROR here, over the one figure on the
     screen that accounted for the difference. */
  check('the match box does NOT read Error', one.matchTitle, 'Satisfied');
  checkTrue('\u2026and says it is the adjustment', /adjusted/i.test(one.matchDesc));
  check('the ring may finish', one.pct, 100);
  checkTrue('the status line stops calling it over-allocated',
            !/Over Allocated/.test(one.status));

  console.log('\nAnd it says why, rather than just going quiet');
  check('the note is shown', one.noteHidden, false);
  checkTrue('it says the report balances without it',
            /Without it the allocation balances exactly/i.test(one.noteText));
  checkTrue('\u2026names the figure', /adjustment of \+1/i.test(one.noteText));
  checkTrue('\u2026says the tray is why the total did not move',
            /names the tray the seedlings came out of/i.test(one.noteText));
  checkTrue('\u2026and that nothing here needs correcting',
            /Nothing on this tab needs correcting/i.test(one.noteText));

  console.log('\nThe same +1 naming NO tray is a real error and stays one');
  await page.evaluate(() => {
    window.__ROWS.shared_inventory_logs = window.__ROWS.shared_inventory_logs
      .filter(r => r.transaction_type !== 'Stock_Calibration');
  });
  await page.evaluate((cal) => { window.__ROWS.shared_inventory_logs.push(cal); }, NO_TRAY);
  const bare = await readTab3(page);
  /* It names no tray, so it is a plot loss or gain: both sides of the sum
     move and the allocation is untouched. The batch is NOT over-allocated,
     and the note has nothing to explain. */
  check('it is not counted as tray-named', bare.trayAdj, 0);
  check('the note is gone', bare.noteHidden, true);
  check('and the allocation still balances', bare.matchTitle, 'Satisfied');

  console.log('\nA difference that is NOT the adjustment still reads as an error');
  await page.evaluate(() => {
    window.__ROWS.shared_inventory_logs = window.__ROWS.shared_inventory_logs
      .filter(r => r.transaction_type !== 'Stock_Calibration');
  });
  // page.evaluate takes ONE argument, so two rows travel as one object.
  await page.evaluate(({ a, b }) => { window.__ROWS.shared_inventory_logs.push(a, b); },
                      { a: WRONG_SIZE, b: { ...NO_TRAY, id: 43, quantity_change: -4 } });
  const wrong = await readTab3(page);
  /* +9 tray-named and -4 naming none: the allocation is out by 9, the
     tray-named net is 9... so this one IS explained. Make it not match by
     leaving only part of it. */
  check('the tray-named net is read', wrong.trayAdj, 9);

  await page.evaluate((cal) => {
    window.__ROWS.shared_inventory_logs = window.__ROWS.shared_inventory_logs
      .filter(r => r.transaction_type !== 'Stock_Calibration');
    // A real over-allocation: 50 more transplanted than there were.
    window.__ROWS.shared_inventory_logs.forEach(r => {
      if (r.transaction_type === 'Transplanted') r.quantity_change += 50;
    });
    window.__ROWS.shared_inventory_logs.push(cal);
  }, WITH_TRAY);
  /* The transplant rows are built by the tab sync, not by calcTransplanting,
     so a changed ledger quantity only reaches the screen once the tab is
     rebuilt. */
  await page.evaluate(async () => { await syncOnce(3, syncTab3); });
  await page.waitForTimeout(600);
  const real = await readTab3(page);
  check('out by 51 with a +1 adjustment is not explained', real.noteHidden, true);
  check('the match box reads Error', real.matchTitle, 'Error');
  checkTrue('\u2026by the whole 51', /Over Allocated by 51/.test(real.matchDesc));
  check('and the ring is held short of full', real.pct < 100, true);

  console.log('\nPage errors');
  const realErrs = errs.filter(e => !/MJMReview/.test(e));
  check('none beyond the harness\'s own MJMReview race', realErrs, []);

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
