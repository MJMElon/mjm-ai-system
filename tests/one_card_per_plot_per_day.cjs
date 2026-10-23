/* ONE CARD PER PLOT PER DAY, AND THE DRONE COUNT BESIDE THE TOTAL.

   Batch 271 put two rows on the screen:

       N15  2026-10-17  DOUBLE-TONE  377
       N15  2026-10-17  P24          680

   Two records, so far as the list was concerned, with the plot and the date
   repeated down the side of both. The office asked for them merged, and the
   reason was a figure that was nowhere on the page: a plot has ONE drone
   map, its count is the whole plot, and nothing here added the trays up to
   compare against it -- "N15 的 drone map 是 1057 但是我看不到 N15 总数".

   So a card is one plot on one day, the total is on it, and the drone count
   sits beside that total, where the person who counts the map keys it.

   THE CARD IS A VIEW. Every tray keeps its own ledger row, because the tray
   is what the D-Tone split, the tray stock and every adjustment read.

   AND THE SIGNATURE WAS ALREADY PER PLOT. Life of Seedlings keys a
   transplanting sign-off on the plot alone, so signing one of N15 two tray
   rows already marked the whole of N15 signed on that report -- two buttons,
   one signature. The card carries the review key now, which makes that true
   on the screen as well as underneath it.

   A CARD FROM BEFORE THE RULE READS AS TALLYING, shown and never stored.
   The office settled that those totals were agreed against the map on the
   day -- 旧卡的 DRONE CHECK 就 = total transplant 就好 -- and writing the
   figure in would make something the page invented indistinguishable, for
   ever, from something a person read off a picture.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/one_card_per_plot_per_day.cjs
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'operation', 'operation_batch_detail.html'), 'utf8');
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
    var b = { _t: table, _eq: {}, _in: null, _like: null, _one: false };
    ['neq','is','or','not','gt','gte','lt','lte','ilike','order','limit','filter','match','contains','overlaps','select','range']
      .forEach(function (m) { b[m] = function () { return b; }; });
    b.eq = function (c, v) { b._eq[c] = v; return b; };
    b.in = function (c, v) { b._in = { col: c, vals: v.map(String) }; return b; };
    b.like = function (c, p) { b._like = { col: c, pat: p }; return b; };
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
      var rows = b._deleted ? b._rows() : b._rows();
      return { data: b._one ? (rows[0] || null) : rows, error: null, count: rows.length };
    };
    b.then = function (r, j) { return Promise.resolve(b._settle()).then(r, j); };
    b.catch = function (f) { return Promise.resolve(b._settle()).catch(f); };
    b.finally = function (f) { return Promise.resolve(b._settle()).finally(f); };
    b.insert = function (rows) { return Promise.resolve({ data: null, error: null }); };
    b.update = function () { return b; };
    b.delete = function () { b._deleted = true; return b; };
    b.upsert = function () { return Promise.resolve({ data: null, error: null }); };
    return b;
  }
  return {
    from: builder,
    rpc: function () { return Promise.resolve({ data: null, error: null }); },
    channel: function () { var c = { on: function(){return c;}, subscribe: function(){return c;} }; return c; },
    removeChannel: function () {},
    storage: { from: function () { return {
      upload: function () { return Promise.resolve({ data: null, error: null }); },
      getPublicUrl: function () { return { data: { publicUrl: '' } }; } }; } },
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

/* Batch 271 as the office had it, plus a card made AFTER the rule, so both
   sides of T3_DRONE_FROM are on the screen at once. */
const ROWS = {
  shared_inventory_logs: [
    { id: 1, batch_name: '271', transaction_type: 'Seeds_Received', quantity_change: 12000,
      breed_name: 'AA HYBRIDA 1S', transaction_date: '2026-06-01', created_at: '2026-06-01T00:00:00Z',
      plot_name: null, remark: 'Seeds received. Supplier: AAR. DO_Qty: 12000. Incl. 0% FOC.' },
    { id: 2, batch_name: '271', transaction_type: 'Transplanted_DoubleTone', plot_name: 'N15',
      quantity_change: 377, transaction_date: '2026-10-17', created_at: '2026-10-17T01:00:00Z',
      remark: 'Moved from tray [DOUBLE-TONE] to Main Plot [N15]. Date: 2026-10-17' },
    { id: 3, batch_name: '271', transaction_type: 'Transplanted', plot_name: 'N15',
      quantity_change: 680, transaction_date: '2026-10-17', created_at: '2026-10-17T01:00:05Z',
      remark: 'Transplanted from tray [P24] to Main Plot [N15]. Date: 2026-10-17' },
    { id: 4, batch_name: '271', transaction_type: 'Transplanted', plot_name: 'B01',
      quantity_change: 1500, transaction_date: '2026-10-18', created_at: '2026-10-18T01:00:00Z',
      remark: 'Transplanted from tray [P7] to Main Plot [B01]. Date: 2026-10-18' },
    { id: 5, batch_name: '271', transaction_type: 'Transplanted', plot_name: 'U03',
      quantity_change: 500, transaction_date: '2026-11-02', created_at: '2026-11-02T01:00:00Z',
      remark: 'Transplanted from tray [P9] to Main Plot [U03]. Date: 2026-11-02' },
    /* A SIGNATURE FROM BEFORE THE CARD. Tab 3 was one row per tray, so a
       sign-off was keyed on the tray that filled the plot. Life of
       Seedlings cuts that key at its first bar and has always read it as
       the whole of N15 being signed; this page must agree, or a signature
       reads one way on the report and the other on the record. */
    { id: 6, batch_name: '271', transaction_type: 'Row_Verification',
      plot_name: 'transplanting::N15|main|P24|2026-10-17', quantity_change: 0,
      created_at: '2026-10-18T02:00:00Z', last_edited_at: '2026-10-18T02:00:00Z',
      last_edited_by: 'checker@mjmnursery.com', remark: 'verified' }
  ],
  operation_trays: [], shared_do_records: [], operation_batch_verifications: [], nelos_cases: []
};

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  await page.route('**supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**cdn.tailwindcss.com/**', r => r.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'document.addEventListener("DOMContentLoaded", function () {' +
          '  document.head.insertAdjacentHTML("beforeend", ' +
          JSON.stringify('<style>.hidden{display:none}</style>') + '); });' }));
  await page.route('**cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await page.route('**cdnjs.cloudflare.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

  await page.addInitScript(({ uid, rows }) => {
    const user = { id: uid, email: 'esther@mjmnursery.com', user_metadata: { full_name: 'Esther Wong' } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    window.__FAKE_PROFILE = { id: uid, email: user.email, full_name: 'Esther Wong', user_type: 'staff',
      permissions: { modules: { operation: 'admin' }, manage_users: true } };
    window.__ROWS = rows;
    window.__INSERTED = [];
    try { localStorage.clear(); } catch (e) {}
  }, { uid: UID, rows: ROWS });

  await page.goto(`http://localhost:${port}/operation/operation_batch_detail.html?id=271`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.saveTransplantTab === 'function', { timeout: 20000 });
  await page.waitForTimeout(5000);

  console.log('\nThe page came up');
  check('no page error', errs.filter(e => !/MJMReview/.test(e)), []);

  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('#t3-saved-rows-list .t3-saved-row')).map(el => {
    const box = el.querySelector('[id^="t3-droneqty-"]');
    return {
      key: el.dataset.reviewKey,
      trays: el.querySelectorAll('.t3-tray-row').length,
      total: (el.querySelector('[id^="t3-cardtotal-"]') || {}).textContent,
      drone: box ? box.value : null,
      pane: box ? String(box.closest('div').parentElement.textContent || '').replace(/\s+/g, ' ').trim() : ''
    };
  }));

  console.log('\nTwo trays into one plot on one day are ONE card');
  check('three cards, not four rows', cards.length, 3);
  check('the N15 card is keyed on the plot and the day', cards[0] && cards[0].key, 'N15|2026-10-17');
  check('…and it holds both trays', cards[0] && cards[0].trays, 2);
  check('…and says the total nothing on the old screen said', cards[0] && cards[0].total, '1,057');
  check('the second plot is a card of its own', [cards[1] && cards[1].key, cards[1] && cards[1].trays], ['B01|2026-10-18', 1]);
  check('…and so is the third', [cards[2] && cards[2].key, cards[2] && cards[2].trays], ['U03|2026-11-02', 1]);

  console.log('\nEvery tray row is inside its card, never loose in the list');
  check('no tray row is a direct child of the list',
        await page.evaluate(() => document.querySelectorAll('#t3-saved-rows-list > .t3-tray-row').length), 0);
  check('all four are accounted for',
        await page.evaluate(() => document.querySelectorAll('#t3-saved-rows-list .t3-tray-row').length), 4);

  console.log('\nA card from before the rule reads as tallying');
  check('the drone count shows the total', cards[0] && cards[0].drone, '1057');
  checkTrue('…and the verdict says so', cards[0] && /Tallies/i.test(cards[0].pane));
  check('…the one-tray card as well', cards[1] && cards[1].drone, '1500');

  console.log('\nA card made AFTER it still has to be counted by a person');
  check('the drone count is empty', cards[2] && cards[2].drone, '');
  checkTrue('…and it says nobody has counted it', cards[2] && /Not counted yet/i.test(cards[2].pane));
  check('…and it claims no tally', !!(cards[2] && /Tallies/i.test(cards[2].pane)), false);

  /* `MJMReview.rowVerified(tabIdx, key)` is the function the page own maths
     reads -- calcT6 and the tab ticks ask it -- so it is the honest place to
     ask whether a card counts as signed. */
  console.log('\nA signature keyed on the TRAY still signs its card');
  /* The review layer boots in the page own bootstrap chain; the harness
     gives it the same push a slow network would need. */
  await page.evaluate(async () => { try { await window.MJMReview.boot(); } catch (e) { window.__BOOTERR = String(e); } });
  await page.waitForTimeout(1500);
  const signed = await page.evaluate(() => ({
    booterr: window.__BOOTERR || '',
    n15: window.MJMReview.rowVerified(3, 'N15|2026-10-17'),
    b01: window.MJMReview.rowVerified(3, 'B01|2026-10-18'),
    u03: window.MJMReview.rowVerified(3, 'U03|2026-11-02'),
    raw: window.MJMReview.rowVerified(3, 'N15|main|P24|2026-10-17')
  }));
  checkTrue('the N15 card reads verified, off the old tray key', signed.n15);
  check('…and the cards nobody signed do not', [signed.b01, signed.u03], [false, false]);
  checkTrue('…the tray key still answers for itself, so nothing that kept it breaks', signed.raw);

  console.log('\nShown, never stored');
  check('drawing the old cards wrote nothing',
        await page.evaluate(() => (window.__INSERTED || []).filter(r => r && r.transaction_type === 'Transplant_Card')), []);

  console.log('\nThe signature is the CARD, one per plot per day');
  const keys = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#t3-saved-rows-list .t3-saved-row')).map(el => el.dataset.reviewKey));
  check('one review key per card', keys.filter(Boolean).length, 3);
  check('…and it is the plot and the day', keys[0], 'N15|2026-10-17');
  check('no tray row carries the review strip any more',
        await page.evaluate(() => document.querySelectorAll('#t3-saved-rows-list .t3-tray-row > .mjm-row-review').length), 0);

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
