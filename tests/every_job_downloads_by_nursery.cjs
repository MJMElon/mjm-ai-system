/* Every job on Worker Activity downloads, for one, two or three nurseries.

   The office: "Nursery Maintenance Schedule & Work Maintenance - Work
   Activity 全部应该要有一个Download button for 不同的工作，如果少人可以是
   Portrait 的，如果人多就是 print Landscape的。我要一次可以download 1个/2个
   /3个 nursery。记得要有title 这样我才知道这是Loading Seedlings的/其他。
   Download button用Icon就可以了。"

   So this drives the REAL page in a real browser, with a strict jsPDF
   stub that records the orientation of every page, and asks:
     - the download is an ICON that opens a window naming the job;
     - the window offers the nurseries that job is done in;
     - the file is the job on screen and no other;
     - each nursery is its own section, and the file and the title say the job;
     - a small crew prints portrait and a big one landscape, in one file;
     - Loading Seedlings and Culling Monitoring download too.

   Run: node tests/every_job_downloads_by_nursery.cjs  (serves the repo itself) */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const guard = async (fn, fallback) => { try { return await fn(); } catch (e) { return fallback === undefined ? 'threw: ' + e.message : fallback; } };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => { errs.push('DIALOG: ' + d.message()); d.dismiss().catch(() => {}); });
  await page.addInitScript(() => {
    window.__PDFS = [];
    const fin = (v) => typeof v === 'number' && isFinite(v);
    const g = (m, a) => a.forEach((v, i) => {
      if (!fin(v)) throw new Error('Invalid arguments passed to jsPDF.' + m + ' (argument ' + (i + 1) + ' is ' + v + ')');
    });
    window.jspdf = { jsPDF: class {
      constructor(o) { this.o = o || {}; this.page = 1; this.orients = [this.o.orientation]; this.lines = []; this.saved = null; window.__PDFS.push(this); }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {} setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect(x, y, w, h) { g('rect', [x, y, w, h]); }
      line(a, b, c, d) { g('line', [a, b, c, d]); }
      addPage(f, o) { this.page++; this.orients.push(o || this.o.orientation); }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.18; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { g('text', [x, y]); this.lines.push({ t: String(t), p: this.page }); }
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
  await page.route('**/shared/shared_access.js*', (r) => r.fulfill({ contentType: 'text/javascript',
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
  await page.goto(`http://localhost:${PORT}/nursery_ops/nursery_ops_maintenance.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.downloadPayrollPDF === 'function', { timeout: 20000 });
  await page.waitForTimeout(400);

  /* A month of P & D on BNN (a crew of four) and UNN 1 (a crew of
     fourteen), Manuring beside it so a file carrying the wrong job is seen. */
  await page.evaluate(() => {
    const m = getMonth();
    _localWorkers.BNN = ['Ali', 'Budi', 'Citra', 'Dedi'];
    _localWorkers.UNN1 = Array.from({ length: 14 }, (_, i) => 'Worker ' + (i + 1));
    _localWorkers.UNN2 = ['Zul'];
    resolveWorkers();
    const pd = PAYROLL_TYPES.pd.jenis, man = PAYROLL_TYPES.manuring.jenis;
    const b = (NURSERY_PLOTS.BNN || [])[0], u = (NURSERY_PLOTS.UNN1 || [])[0], u2 = (NURSERY_PLOTS.UNN2 || [])[0];
    records.length = 0;
    records.push(
      { id: 901, tarikh: '05-10-2026', jenis: pd, plot: b, qty: 400, _qtyByHand: true, _month: m },
      { id: 902, tarikh: '06-10-2026', jenis: pd, plot: u, qty: 1400, _qtyByHand: true, _month: m },
      { id: 903, tarikh: '07-10-2026', jenis: pd, plot: u2, qty: 50, _qtyByHand: true, _month: m },
      { id: 904, tarikh: '07-10-2026', jenis: man, plot: b, qty: 999, _qtyByHand: true, _month: m });
    switchPayrollView('pd');
  });

  // ── 1. The button is an icon, and it opens a window naming the job ──
  const btn = await guard(() => page.evaluate(() => {
    const el = document.getElementById('wr-dl-btn');
    return el ? { text: el.textContent.trim(), svg: !!el.querySelector('svg'), title: el.title } : null;
  }), null);
  check('the download is an ICON button, no words on it',
    btn && [btn.text, btn.svg, /download/i.test(btn.title)], ['', true, true]);
  const dlg = await guard(() => page.evaluate(() => {
    openWrDownload();
    return {
      open: document.getElementById('wr-dl-modal').classList.contains('open'),
      title: document.getElementById('wr-dl-title').textContent,
      boxes: [...document.querySelectorAll('#wr-dl-list .wr-dl-n')].map(i => [i.value, i.checked])
    };
  }), null);
  check('it opens a window titled with the job on screen',
    dlg && [dlg.open, /P\s*&\s*D|Racun/i.test(dlg.title)], [true, true]);
  check('…offering the three main nurseries, the one on screen ticked',
    dlg && dlg.boxes, [['BNN', true], ['UNN1', false], ['UNN2', false]]);

  // ── 2. Three nurseries in one file, P & D only, crew decides the shape ──
  const pdf = await guard(() => page.evaluate(async () => {
    document.querySelectorAll('#wr-dl-list .wr-dl-n').forEach(i => { i.checked = true; });
    wrDownloadSync();
    window.__PDFS.length = 0;
    await wrDownloadGo();
    const d = window.__PDFS[0];
    return d ? { saved: d.saved, orients: d.orients, lines: d.lines.map(l => l.t),
                 open: document.getElementById('wr-dl-modal').classList.contains('open') } : null;
  }), null);
  const text = pdf ? pdf.lines.join(' | ') : '';
  check('ONE file is made', !!pdf, true);
  check('…its name says the job and all three nurseries',
    pdf && /^Worker_Record_P_and_D_.*BNN_UNN1_UNN2_/.test(pdf.saved || ''), true);
  check('…the title on the page names the job', pdf && /WORKER RECORD — P (and|&) D/i.test(text), true);
  check('…each nursery has its own section',
    pdf && ['Batu Niah', 'Ulu Niah Nursery 1', 'Ulu Niah Nursery 2'].map(w => text.includes(w)), [true, true, true]);
  check('…and NOTHING of Manuring is on it (the 999)', pdf && pdf.lines.includes('999'), false);
  check('a crew of four is portrait, fourteen landscape, one is portrait — in one file',
    pdf && pdf.orients, ['portrait', 'landscape', 'portrait']);
  check('all fourteen UNN 1 workers fit the wide page without splitting',
    pdf && pdf.lines.filter(l => /^Worker \d+$/.test(l)).length, 14);
  check('the window closes once the file is made', pdf && pdf.open, false);

  // ── 3. One nursery is still one section ──
  const one = await guard(() => page.evaluate(() => {
    window.__PDFS.length = 0; downloadPayrollPDF({ job: 'pd', nurseries: ['UNN2'] });
    const d = window.__PDFS[0]; return d ? { saved: d.saved, pages: d.orients.length } : null;
  }), null);
  check('one nursery picked is one section', one && [/_UNN2_/.test(one.saved), one.pages], [true, 1]);

  // ── 4. Loading Seedlings downloads, titled as Loading Seedlings ──
  const ls = await guard(() => page.evaluate(async () => {
    const m = getMonth();
    const b = (NURSERY_PLOTS.BNN || [])[0], u = (NURSERY_PLOTS.UNN1 || [])[0];
    const k1 = _doPayrollKey('BNN', m), k2 = _doPayrollKey('UNN1', m);
    _doRecordsLoading[k1] = _doRecordsLoading[k2] = false;
    _doRecordsCache[k1] = [{ id: 1, do_number: 'DO-AAA101', delivery_date: '2026-10-03', remark: 'Ladang Sejahtera',
      status: 'Issued', plot_1: b, qty_1: 300, total_qty: 300, worked_by_by_nursery: { BNN: ['Ali', 'Budi'] } }];
    _doRecordsCache[k2] = [{ id: 2, do_number: 'DO-BBB201', delivery_date: '2026-10-04', remark: 'Kebun Maju',
      status: 'Issued', plot_1: u, qty_1: 700, total_qty: 700, worked_by_by_nursery: { UNN1: ['Worker 1'] } }];
    switchPayrollView('loading_seedlings');
    openWrDownload();
    const title = document.getElementById('wr-dl-title').textContent;
    document.querySelectorAll('#wr-dl-list .wr-dl-n').forEach(i => { i.checked = ['BNN', 'UNN1'].includes(i.value); });
    window.__PDFS.length = 0;
    await wrDownloadGo();
    const d = window.__PDFS[0];
    return d ? { title, saved: d.saved, orients: d.orients, lines: d.lines.map(l => l.t) } : { title };
  }), null);
  const lsText = ls && ls.lines ? ls.lines.join(' | ') : '';
  check('Loading Seedlings: the window says Loading Seedlings', ls && /Loading Seedlings/.test(ls.title), true);
  check('…the file is named for it and both nurseries',
    ls && /^Worker_Record_Loading_Seedlings_BNN_UNN1_/.test(ls.saved || ''), true);
  check('…the title on the page says LOADING SEEDLINGS', /WORKER RECORD — LOADING SEEDLINGS/.test(lsText), true);
  check('…both DOs, their customers and quantities are on it',
    ['DO-AAA101', 'DO-BBB201', 'Ladang Sejahtera', 'Kebun Maju', '300', '700'].map(v => lsText.includes(v)),
    [true, true, true, true, true, true]);
  check('…a share is divided among the ticked (300 / 2)', ls && ls.lines.includes('150'), true);
  check('…BNN (4 workers) portrait, UNN 1 (14) landscape', ls && ls.orients, ['portrait', 'landscape']);

  // ── 5. Culling Monitoring downloads ──
  const ci = await guard(() => page.evaluate(async () => {
    const ym = monthLabelToInput(getMonth());
    _cullLoading[ym] = false;
    _cullCache[ym] = { transplanted: {}, palms: null, overrides: [], checks: [], overridesReady: true, checksReady: true };
    window.cullIncentiveRows = (n) => n === 'BNN'
      ? [{ plot: 'B7', start: '2026-10-01', end: '2026-10-12', days: 11, counts: true, check: { checked_at: 'x' } },
         { plot: 'B9', start: '2026-10-01', end: '2026-10-30', days: 29, counts: false, state: 'slow' }]
      : [{ plot: 'U3', start: '2026-10-02', end: '2026-10-10', days: 8, counts: true, check: null }];
    switchPayrollView('cull_incentive');
    openWrDownload();
    const offered = [...document.querySelectorAll('#wr-dl-list .wr-dl-n')].map(i => i.value);
    document.querySelectorAll('#wr-dl-list .wr-dl-n').forEach(i => { i.checked = ['BNN', 'UNN1'].includes(i.value); });
    window.__PDFS.length = 0;
    await wrDownloadGo();
    const d = window.__PDFS[0];
    return d ? { offered, saved: d.saved, orients: d.orients, lines: d.lines.map(l => l.t) } : { offered };
  }), null);
  const ciText = ci && ci.lines ? ci.lines.join(' | ') : '';
  check('Culling Monitoring: the window offers BNN, UNN 1 and UNN 2', ci && ci.offered, ['BNN', 'UNN1', 'UNN2']);
  check('…the file is named for it', ci && /^Worker_Record_Culling_Monitoring_BNN_UNN1_/.test(ci.saved || ''), true);
  check('…its plots, the reason one is not earning, and the unchecked one',
    ['B7', 'B9', 'U3', 'Over', 'Not checked'].map(v => ciText.includes(v)), [true, true, true, true, true]);
  check('…tall pages', ci && ci.orients, ['portrait', 'portrait']);

  check('no page errors or alerts', errs, []);
  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
