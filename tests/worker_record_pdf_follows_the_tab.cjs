/* The Worker Record PDF prints the tab that is on screen.

   Pressed on the Transplanting tab it printed the four maintenance sheets —
   P & D, Manuring, Weeding, Interrow — and nothing of the transplanting the
   office was looking at: "当我在transplanting的tab，我要下载的是transplanting
   的资料". This drives the real page's real download with a strict jsPDF
   (a co-ordinate that is not a finite number is refused, the way the real
   library refuses it) and reads what was written.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/worker_record_pdf_follows_the_tab.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => { errs.push('DIALOG: ' + d.message()); d.dismiss().catch(() => {}); });
  await page.addInitScript(() => {
    window.__PDFS = [];
    const fin = (v) => typeof v === 'number' && isFinite(v);
    const guard = (m, a) => a.forEach((v, i) => {
      if (!fin(v)) throw new Error('Invalid arguments passed to jsPDF.' + m + ' (argument ' + (i + 1) + ' is ' + v + ')');
    });
    window.jspdf = { jsPDF: class {
      constructor(o) { this.o = o || {}; this.page = 1; this.lines = []; this.saved = null; window.__PDFS.push(this); }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {} setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect(x, y, w, h) { guard('rect', [x, y, w, h]); }
      line(a, b, c, d) { guard('line', [a, b, c, d]); }
      addPage() { this.page++; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.18; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { guard('text', [x, y]); this.lines.push(String(t)); }
      save(n) { this.saved = n; }
    } };
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    const q = () => { const p = new Proxy({}, { get(_, k) {
      if (k === 'then') return (a, b) => Promise.resolve({ data: [], error: null }).then(a, b);
      if (k === 'maybeSingle' || k === 'single') return () => Promise.resolve({ data: null, error: null });
      return () => p; } }); return p; };
    const user = { id: 'u1', email: 'e@x' };
    window.supabase = { createClient: () => ({
      from: q, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {}
    }) };
  });
  await page.route('**/shared_access.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'e@x', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true; } });` }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**', '**/cdn.tailwindcss.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.downloadPayrollPDF === 'function', { timeout: 20000 });
  await page.waitForTimeout(300);

  // A month of UNN 2 transplanting, as the FC Portal records it: one row
  // agreed, one split by the bag, one not yet Checked.
  const got = await page.evaluate(() => {
    const n = getNursery(), m = getMonth();
    const plots = NURSERY_PLOTS[n] || [];
    const P1 = plots[0], P2 = plots[1] || plots[0];
    workers[n] = ['Marwan Hakim', 'Muhamad Azhar', 'Mustafa', 'Suhaedi'];
    const crew = workers[n].map(name => ({ name }));
    const key = _tpPayrollKey(n, m);
    _tpNoGate[key] = false;
    _tpRecordsLoading[key] = false;
    _tpRecordsCache[key] = [
      { id: 1, work_date: '2026-10-05', plot_name: P1, work_type: 'lining', source_qty: 2300, workers: crew,
        checked_at: '2026-10-20T00:00:00Z' },
      { id: 2, work_date: '2026-10-06', plot_name: P1, work_type: 'polybag_fill', source_qty: 2873,
        workers: [{ name: 'Marwan Hakim', qty: 808 }, { name: 'Muhamad Azhar', qty: 759 },
                  { name: 'Mustafa', qty: 855 }, { name: 'Suhaedi', qty: 451 }], checked_at: '2026-10-20T00:00:00Z' },
      { id: 3, work_date: '2026-10-07', plot_name: P2, work_type: 'transplanting', source_qty: 1000, workers: crew,
        checked_at: null },
      /* A JOB NOBODY DID. The conductor answered it -- a blanket spray on a
         plot where the grass never came -- so it is on the paper, in no
         total, and must NOT be printed as work waiting to be Checked. */
      { id: 4, work_date: '2026-10-08', plot_name: P2, work_type: 'blanket_spray', source_qty: 4400,
        workers: [], not_done: true, checked_at: null }
    ];
    _payrollView = 'transplanting';
    window.__PDFS.length = 0;
    downloadPayrollPDF();
    const d = window.__PDFS[0] || { lines: [], o: {} };
    return { saved: d.saved, orient: d.o.orientation, lines: d.lines, plot: P1 };
  });
  const text = got.lines.join(' | ');
  check('the Transplanting tab downloads a Transplanting file', /^Worker_Record_Transplanting_/.test(got.saved || ''), true);
  check('…on the wide page', got.orient, 'landscape');
  check('…with none of the four maintenance sheets on it',
    ['P & D', 'Manuring', 'Weeding', 'Interrow'].filter(w => text.toLowerCase().includes(w.toLowerCase())), []);
  check('the four jobs are named as on screen',
    [/Lining & Arranging Polybag/.test(text), /Polybag Filling/.test(text), /Transplanting \(Hy Plug/.test(text)], [true, true, true]);
  check('every worker gets a column', ['Marwan Hakim', 'Muhamad Azhar', 'Mustafa', 'Suhaedi'].every(w => got.lines.includes(w)), true);
  check('a split job prints each person\'s own bags', ['808', '759', '855', '451'].every(v => got.lines.includes(v)), true);
  check('an equal share prints as on screen (2,300 / 4)', got.lines.includes('575'), true);
  check('the total is the claim\'s — the agreed rows only (2,300 + 2,873)', got.lines.includes('5,173'), true);
  check('the unchecked row is printed and NAMED as held back',
    [got.lines.includes('Not checked'), got.lines.includes('1,000'), /Held back/.test(text)], [true, true, true]);
  /* A JOB NOBODY DID is on the paper as on the screen: in neither total,
     marked on its own row, and said under the sheet. Held back is a
     question waiting for the office; this is an answer already given, so
     printing it as held would send somebody to tick a row that can never
     pay anybody. */
  check('a job recorded as not done is marked and in NO total',
    [/NOT DONE/.test(text), got.lines.includes('Nobody did it'),
     got.lines.includes('4,400')],
    [true, true, false]);
  /* The held-back line counts the ONE genuinely unchecked row and not the
     not-done one beside it. Two would be the paper sending somebody to
     tick a row that can never pay anybody. */
  check('…and the held count does not take it in',
    [/1 row\(s\) are not Checked/.test(text), /2 row\(s\) are not Checked/.test(text)],
    [true, false]);
  check('…and it is said under the sheet, in its own words',
    [/Not done/.test(text), /recorded as NOT DONE/.test(text)], [true, true]);

  // The other tabs are untouched: the maintenance file, the tall page.
  const maint = await page.evaluate(() => {
    _payrollView = 'pd';
    window.__PDFS.length = 0;
    downloadPayrollPDF();
    const d = window.__PDFS[0] || { o: {} };
    return { saved: d.saved, orient: d.o.orientation };
  });
  check('a maintenance tab still downloads the four-sheet Worker Record, tall',
    [/^Worker_Record_(?!Transplanting)/.test(maint.saved || ''), maint.orient], [true, 'portrait']);
  check('no page errors or alerts', errs, []);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
