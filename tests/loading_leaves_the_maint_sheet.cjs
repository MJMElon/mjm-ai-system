/* LOADING SEEDLINGS LEFT THE WORK MAINTENANCE SHEET. THE MONEY DID NOT MOVE.

   The office, over a screenshot of the five-column claim: "Remove the
   loading seedlings column in work maintenance but make it to the tab named
   Loading Seedlings." The tab already existed as a second screen onto the
   same 'maint' sheet (renderLoading / downloadLoadingPDF), so this change
   is about what the Work Maintenance SCREEN and its PDF draw —
   MAINT_SHEET_TYPES, the four jobs — and about nothing that pays:
   maintTotals still prices loading, the Monthly Payroll still pays it, and
   one 'maint' verification still freezes all five.

   The trap this test exists for is the Subtotal: the view's earned() is the
   five-job figure (and so is every snapshot verified before this change),
   so a sheet that dropped the column and kept earned() would print a
   Subtotal its own row cannot add up to — RM 60.00 at the end of a row
   whose four cells read RM 1+2+3+4. Both renderers compute the row sum
   from the columns they draw, which also makes an OLD five-job snapshot
   render correctly.

   It boots the real page, hands it a frozen snapshot carrying all five
   jobs (the shape every already-verified month has), and reads the DOM and
   the strict-jsPDF output of both claim forms.

   Run: node tests/loading_leaves_the_maint_sheet.cjs
   with a static server on 8777 serving the repository root.
*/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const PAY  = fs.readFileSync(path.join(__dirname, '..', 'npayroll', 'npayroll_script.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'npayroll', 'npayroll_dashboard.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

/* ── 1. The lists: what the sheet draws vs what the sheet pays ──────────── */
console.log('\nThe sheet list excludes loading; every money list keeps it');
checkTrue('MAINT_SHEET_TYPES is MAINT_TYPES less loading_seedlings',
          /const MAINT_SHEET_TYPES = MAINT_TYPES\.filter\(t => t\.code !== 'loading_seedlings'\);/.test(PAY));
checkTrue('MAINT_TYPES itself still carries loading_seedlings',
          /code:'loading_seedlings'/.test(PAY));
checkTrue('the Monthly Payroll still pays all five',
          PAY.includes("earnedAfterAdj('maint', n, w, MAINT_TYPES.map(t => t.code)"));
checkTrue('the verification snapshot still freezes all five',
          /buildMaintSnapshot[\s\S]{0,400}MAINT_TYPES\.forEach\(t => \{ cap\[w\]\[t\.code\]/.test(PAY));
checkTrue('the Loading Seedlings tab is still on the strip',
          /data-sub="seedling"[^>]*>Loading Seedlings</.test(HTML));
checkTrue('and still has its own claim form',
          /function _downloadLoadingPDF\(\)/.test(PAY));

/* ── 2. The real page, over a five-job snapshot ─────────────────────────── */
const WORKER = 'Ali Bin Hassan';
const SNAP = {
  workers: [WORKER],
  cap:    { [WORKER]: { pd: 100, manuring: 200, weeding: 300, interrow: 400, loading_seedlings: 500 } },
  rm:     { [WORKER]: { pd: 1, manuring: 2, weeding: 3, interrow: 4, loading_seedlings: 50 } },
  earned: { [WORKER]: 60 },                 // the five-job figure an old snapshot holds
  capAll: { pd: 100, manuring: 200, weeding: 300, interrow: 400, loading_seedlings: 500 },
  rate:   { pd: 0.01, manuring: 0.01, weeding: 0.01, interrow: 0.01, loading_seedlings: 0.1 },
  capSum: { pd: 100, manuring: 200, weeding: 300, interrow: 400, loading_seedlings: 500 },
  rmSum:  { pd: 1, manuring: 2, weeding: 3, interrow: 4, loading_seedlings: 50 },
  grand: 60
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => { errs.push('ALERT: ' + d.message()); d.dismiss(); });

  await page.addInitScript(() => {
    window.__PDFS = [];
    const fin = (v) => typeof v === 'number' && isFinite(v);
    function guard(method, args) {
      args.forEach((a, i) => {
        if (!fin(a)) throw new Error('Invalid arguments passed to jsPDF.' + method
                                   + ' (argument ' + (i + 1) + ' is ' + String(a) + ')');
      });
    }
    window.jspdf = { jsPDF: class {
      constructor() { this.page = 1; this.lines = []; this.rects = []; this.saved = null; window.__PDFS.push(this); }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {}
      setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect(x, y, w, h) { guard('rect', [x, y, w, h]); this.rects.push({ x, y, w, h, page: this.page }); }
      roundedRect(x, y, w, h, rx, ry) { guard('roundedRect', [x, y, w, h, rx, ry]); }
      line(a, b, c, d) { guard('line', [a, b, c, d]); }
      addPage() { this.page++; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.5; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { guard('text', [x, y]); this.lines.push({ t: String(t), x, y, page: this.page }); }
      addImage(im, fmt, x, y, w, h) { guard('addImage', [x, y, w, h]); }
      save(name) { this.saved = name; }
    } };
    function makeQuery() {
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve({ data: [], error: null }).then(a, b);
        if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null });
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      storage: { from: () => ({ upload: async () => ({ data: {}, error: null }),
                                getPublicUrl: () => ({ data: { publicUrl: '' } }),
                                remove: async () => ({ error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  });
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderMaint === 'function'
                                && typeof window.renderLoading === 'function', { timeout: 20000 });
  await page.waitForTimeout(1200);

  /* Hand the page a VERIFIED month: the snapshot carries all five jobs,
     which is exactly what every month verified before this change holds. */
  await page.evaluate((snap) => {
    const v = { snapshot: snap, verified_by: 'u1', verified_at: '2026-11-01T08:00:00Z' };
    window.MJMPayrollLock = {
      ready: () => true,
      verificationOf: () => v,
      isSheetLocked: () => true,
      isMonthLocked: () => false,
      lockOf: () => null,
      load: async () => true
    };
    const sel = document.getElementById('maint-nursery');
    if (sel) sel.value = 'UNN2';
    renderMaint();
    renderLoading();
  }, SNAP);

  console.log('\nThe Work Maintenance sheet: four jobs, and a Subtotal its row adds up to');
  const maintHead = await page.evaluate(() => document.querySelector('#maint-table thead').textContent);
  checkTrue('no Loading Seedlings column in the table head', !/Loading Seedlings/.test(maintHead));
  for (const label of ['P & D Spraying', 'Manuring', 'Weeding', 'Interrow Spray']) {
    checkTrue('the head still carries ' + label, maintHead.includes(label));
  }
  const glance = await page.evaluate(() =>
    [...document.querySelectorAll('#maint-glance .pt-label')].map(e => e.textContent));
  check('the glance ribbon is the four cards',
        glance, ['P & D Spraying', 'Manuring', 'Weeding', 'Interrow Spray']);
  const maintRow = await page.evaluate(() =>
    [...document.querySelectorAll('#maint-table tbody tr td')].map(td => td.textContent.trim()));
  checkTrue('the row Subtotal is RM 10.00 — the four columns, not the snapshot earned of 60',
            maintRow.includes('RM 10.00') && !maintRow.includes('RM 60.00'));
  const maintFoot = await page.evaluate(() =>
    [...document.querySelectorAll('#maint-table tfoot td')].map(td => td.textContent.trim()));
  check('the Grand Total row is the four pairs and their own sum',
        maintFoot, ['Grand Total', '100', 'RM 1.00', '200', 'RM 2.00',
                    '300', 'RM 3.00', '400', 'RM 4.00', 'RM 10.00']);

  console.log('\nThe Loading Seedlings tab still shows the whole column');
  const loadHead = await page.evaluate(() => document.querySelector('#loading-table thead').textContent);
  checkTrue('its head names the job', loadHead.includes('Loading Seedlings'));
  const loadFoot = await page.evaluate(() =>
    [...document.querySelectorAll('#loading-table tfoot td')].map(td => td.textContent.trim()));
  check('and its Grand Total is the loading money', loadFoot, ['Grand Total', '500', 'RM 50.00']);
  const loadGlance = await page.evaluate(() =>
    [...document.querySelectorAll('#loading-glance .pt-label')].map(e => e.textContent));
  check('its own glance card stands', loadGlance, ['Loading Seedlings']);

  console.log('\nBoth claim forms print the same split');
  const run = (fn) => page.evaluate(async (name) => {
    try {
      await window[name]();
      const d = (window.__PDFS || [])[window.__PDFS.length - 1];
      return { ok: true, saved: d && d.saved, texts: d ? d.lines.map(l => l.t) : [] };
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  }, fn);
  const mp = await run('downloadMaintPDF');
  checkTrue('the Work Maintenance form is produced', mp.ok);
  if (!mp.ok) console.log('         ' + mp.err);
  checkTrue('it prints no Loading Seedlings column',
            !(mp.texts || []).some(t => /Loading Seedlings/i.test(t)));
  checkTrue('its Subtotal and Grand Total are the four-job RM 10.00',
            (mp.texts || []).filter(t => t === 'RM 10.00').length >= 2
            && !(mp.texts || []).includes('RM 60.00'));
  const lp = await run('downloadLoadingPDF');
  checkTrue('the Loading Seedlings form is produced', lp.ok);
  if (!lp.ok) console.log('         ' + lp.err);
  checkTrue('and carries the loading RM 50.00', (lp.texts || []).includes('RM 50.00'));

  check('nothing was thrown past a button', errs, []);
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
