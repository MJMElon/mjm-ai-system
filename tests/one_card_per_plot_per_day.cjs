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

   AND A SIGNATURE MADE BEFORE THE CARDS STILL COUNTS, BUT ONLY IN FULL.
   Life of Seedlings keys a transplanting sign-off on the plot alone, so one
   of N15 two tray rows already marked the whole of N15 signed on THAT
   REPORT. Reading it the same way here would have moved a TICK, which is a
   different thing: Tab 3 was one row per tray and the tab tick only went
   green when every one of them was signed. The ledger was swept rather than
   argued about -- one card in 213 was part signed, batch 263 N4, four trays
   of five -- so a card made of tray keys asks for ALL of them. B04 below is
   that card shape, and it has to read UNSIGNED.

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
    /* EVERY WRITE IS RECORDED. A stub that takes an insert and says nothing
       signs off whatever the page sent it -- and the check below that nothing
       was written would have passed over a page writing on every load. */
    b._settle = function () {
      var rows = b._rows();
      if (b._deleted) (window.__DELETED = window.__DELETED || []).push({ table: table, eq: b._eq, n: rows.length });
      if (b._patch)   (window.__UPDATED = window.__UPDATED || []).push({ table: table, eq: b._eq, patch: b._patch });
      return { data: b._one ? (rows[0] || null) : rows, error: null, count: rows.length };
    };
    b.then = function (r, j) { return Promise.resolve(b._settle()).then(r, j); };
    b.catch = function (f) { return Promise.resolve(b._settle()).catch(f); };
    b.finally = function (f) { return Promise.resolve(b._settle()).finally(f); };
    b.insert = function (rows) {
      (window.__INSERTED = window.__INSERTED || []).push.apply(window.__INSERTED, [].concat(rows));
      return Promise.resolve({ data: null, error: null });
    };
    b.update = function (p) { b._patch = p; return b; };
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
    /* BATCH 263 N4 SHAPE: two trays, one of them signed. The check that
       swept the ledger found exactly one card like this in 213, and it is
       the whole reason the alias asks for every tray -- read ANY of them as
       the card own signature and this tick goes green over work nobody
       finished signing. */
    { id: 7, batch_name: '271', transaction_type: 'Transplanted', plot_name: 'B04',
      quantity_change: 900, transaction_date: '2026-10-19', created_at: '2026-10-19T01:00:00Z',
      remark: 'Transplanted from tray [P8] to Main Plot [B04]. Date: 2026-10-19' },
    { id: 8, batch_name: '271', transaction_type: 'Transplanted', plot_name: 'B04',
      quantity_change: 600, transaction_date: '2026-10-19', created_at: '2026-10-19T01:00:05Z',
      remark: 'Transplanted from tray [P11] to Main Plot [B04]. Date: 2026-10-19' },
    /* SIGNATURES FROM BEFORE THE CARD. Tab 3 was one row per tray, so a
       sign-off was keyed on the tray that filled the plot, and a plot filled
       from two trays carried two of them. N15 has both, so its card is
       signed; B04 has one of its two, so its card is not -- which is what
       the tab tick said before the cards existed, and the office set the bar
       there: a tick that was green must still be green, and nothing else
       may move. */
    { id: 6, batch_name: '271', transaction_type: 'Row_Verification',
      plot_name: 'transplanting::N15|main|P24|2026-10-17', quantity_change: 0,
      created_at: '2026-10-18T02:00:00Z', last_edited_at: '2026-10-18T02:00:00Z',
      last_edited_by: 'checker@mjmnursery.com', remark: 'verified' },
    { id: 9, batch_name: '271', transaction_type: 'Row_Verification',
      plot_name: 'transplanting::N15|doubletone|DOUBLE-TONE|2026-10-17', quantity_change: 0,
      created_at: '2026-10-19T02:00:00Z', last_edited_at: '2026-10-19T02:00:00Z',
      last_edited_by: 'esther@mjmnursery.com', remark: 'verified' },
    { id: 10, batch_name: '271', transaction_type: 'Row_Verification',
      plot_name: 'transplanting::B04|main|P8|2026-10-19', quantity_change: 0,
      created_at: '2026-10-20T02:00:00Z', last_edited_at: '2026-10-20T02:00:00Z',
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

  /* By KEY and not by position: the fixture gained a plot, and a check that
     counts along the list would have moved with it instead of saying so. */
  const byKey = {};
  cards.forEach(c => { byKey[c.key] = c; });
  const N15 = byKey['N15|2026-10-17'], B01 = byKey['B01|2026-10-18'],
        B04 = byKey['B04|2026-10-19'], U03 = byKey['U03|2026-11-02'];

  console.log('\nTwo trays into one plot on one day are ONE card');
  check('four cards, not six rows', cards.length, 4);
  check('the N15 card is keyed on the plot and the day', !!N15, true);
  check('…and it holds both trays', N15 && N15.trays, 2);
  check('…and says the total nothing on the old screen said', N15 && N15.total, '1,057');
  check('the second plot is a card of its own', [!!B01, B01 && B01.trays], [true, 1]);
  check('…and so is the last', [!!U03, U03 && U03.trays], [true, 1]);
  check('…and the two-tray B04 is one card too', [!!B04, B04 && B04.trays], [true, 2]);

  console.log('\nEvery tray row is inside its card, never loose in the list');
  check('no tray row is a direct child of the list',
        await page.evaluate(() => document.querySelectorAll('#t3-saved-rows-list > .t3-tray-row').length), 0);
  check('all six are accounted for',
        await page.evaluate(() => document.querySelectorAll('#t3-saved-rows-list .t3-tray-row').length), 6);

  console.log('\nA card from before the rule reads as tallying');
  check('the drone count shows the total', N15 && N15.drone, '1057');
  checkTrue('…and the verdict says so', N15 && /Tallies/i.test(N15.pane));
  check('…the one-tray card as well', B01 && B01.drone, '1500');

  console.log('\nA card made AFTER it still has to be counted by a person');
  check('the drone count is empty', U03 && U03.drone, '');
  checkTrue('…and it says nobody has counted it', U03 && /Not counted yet/i.test(U03.pane));
  check('…and it claims no tally', !!(U03 && /Tallies/i.test(U03.pane)), false);

  /* `MJMReview.rowVerified(tabIdx, key)` is the function the page own maths
     reads -- calcT6 and the tab ticks ask it -- so it is the honest place to
     ask whether a card counts as signed. */
  console.log('\nA signature keyed on the TRAY still signs its card — if EVERY tray is signed');
  /* The review layer boots in the page own bootstrap chain; the harness
     gives it the same push a slow network would need. */
  await page.evaluate(async () => { try { await window.MJMReview.boot(); } catch (e) { window.__BOOTERR = String(e); } });
  await page.waitForTimeout(1500);
  const signed = await page.evaluate(() => ({
    booterr: window.__BOOTERR || '',
    n15: window.MJMReview.rowVerified(3, 'N15|2026-10-17'),
    b01: window.MJMReview.rowVerified(3, 'B01|2026-10-18'),
    b04: window.MJMReview.rowVerified(3, 'B04|2026-10-19'),
    u03: window.MJMReview.rowVerified(3, 'U03|2026-11-02'),
    raw: window.MJMReview.rowVerified(3, 'N15|main|P24|2026-10-17')
  }));
  checkTrue('a card whose BOTH trays were signed reads verified', signed.n15);
  /* The one that decides it. One of B04 two trays is signed, which is what
     batch 263 N4 looks like in the ledger: four of five. The tab tick was
     not green on it before the cards, so it must not be green now. */
  check('a card with ONE of its two trays signed does NOT', signed.b04, false);
  check('…and the cards nobody signed do not either', [signed.b01, signed.u03], [false, false]);
  checkTrue('…the tray key still answers for itself, so nothing that kept it breaks', signed.raw);

  console.log('\nShown, never stored');
  check('drawing the old cards wrote nothing',
        await page.evaluate(() => (window.__INSERTED || []).filter(r => r && r.transaction_type === 'Transplant_Card')), []);

  /* THE MONTH LOCK IS READ OFF THE TRAY ROW, NEVER OFF THE LIST INDEX.
     Both handlers used to ask `document.querySelectorAll('.t3-saved-row')[idx]`
     whether this record is in a locked month. That class is the CARD now, and
     a card never wears `.mjm-locked` -- so the lock answered no every time and
     a settled month could be edited and deleted without a word. Nothing
     covered either handler, which is why both had to be found by reading. */
  console.log('\nA tray row in a locked month still refuses to be edited or deleted');
  const lockedIdx = await page.evaluate(() => {
    const wrap = document.querySelector('#t3-saved-rows-list .t3-tray-cell').closest('.t3-tray-row');
    wrap.classList.add('mjm-locked');          // what the renderer writes on a locked month
    window.__SAID = [];
    window.alert   = (m) => window.__SAID.push(String(m));
    window.confirm = () => { window.__SAID.push('CONFIRM WAS ASKED'); return true; };
    window.__DELETED = []; window.__UPDATED = []; window.__INSERTED = [];
    return Number(wrap.querySelector('[id^="t3-row-view-"]').id.replace('t3-row-view-', ''));
  });
  await page.evaluate(async i => { try { await window.deleteT3Row(i); } catch (e) {} }, lockedIdx);
  await page.evaluate(async i => { try { await window.saveT3EditRow(i, 'Transplanted'); } catch (e) {} }, lockedIdx);
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    said: window.__SAID || [],
    deleted: (window.__DELETED || []).filter(d => d.table === 'shared_inventory_logs').length,
    wrote: (window.__INSERTED || []).filter(r => r && /^Transplanted/.test(String(r.transaction_type || ''))).length
  }));
  check('the delete sent nothing to the ledger', after.deleted, 0);
  check('…and nor did the edit', after.wrote, 0);
  check('both said WHY, rather than doing nothing',
        after.said.filter(m => /locked month/i.test(m)).length, 2);
  check('and the delete never got as far as asking to confirm',
        after.said.some(m => /CONFIRM WAS ASKED/.test(m)), false);

  console.log('\nThe signature is the CARD, one per plot per day');
  const keys = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#t3-saved-rows-list .t3-saved-row')).map(el => el.dataset.reviewKey));
  check('one review key per card', keys.filter(Boolean).length, 4);
  checkTrue('…and it is the plot and the day', keys.includes('N15|2026-10-17'));
  check('no tray row carries the review strip any more',
        await page.evaluate(() => document.querySelectorAll('#t3-saved-rows-list .t3-tray-row > .mjm-row-review').length), 0);

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
