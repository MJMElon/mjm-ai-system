/* Worker Activity is two parts, and Seed Planting is the Pre Nursery one.

   The office: "worker activity分成两part， main nursery & pre nursery,
   existing 的全部进去 main nursery, seed planting 进去 pre nursery", then
   "每人填自己种的数量" and "这一部分的seed planting数量 要link batch report
   seed planting 的date，如果within那个月就pull 进来".

   So the rows are the batch report's `Planted` ledger rows dated inside the
   month on screen, one per tray per day; each Pre Nursery worker keys their
   own figure; and nothing here reaches the payroll claim. Drives the real
   page with a stubbed database.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/seed_planting_is_pre_nursery.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const LOGS = [
  // Two batches sown into P1 on one day: ONE row, summed.
  { id: 1, transaction_type: 'Planted', batch_name: '277', plot_name: 'P1', quantity_change: 2560, transaction_date: '2026-10-05', created_at: '2026-10-06T01:00:00Z' },
  { id: 2, transaction_type: 'Planted', batch_name: '278', plot_name: 'P1', quantity_change: 440,  transaction_date: '2026-10-05', created_at: '2026-10-06T01:00:00Z' },
  { id: 3, transaction_type: 'Planted', batch_name: '277', plot_name: 'P2', quantity_change: 1200, transaction_date: '2026-10-05', created_at: '2026-10-06T01:00:00Z' },
  // Dated by the batch report in SEPTEMBER, keyed in October: not October's.
  { id: 4, transaction_type: 'Planted', batch_name: '270', plot_name: 'P9', quantity_change: 999,  transaction_date: '2026-09-30', created_at: '2026-10-02T01:00:00Z' },
  // No keyed date: the day it went in decides.
  { id: 5, transaction_type: 'Planted', batch_name: '279', plot_name: 'P3', quantity_change: 800,  transaction_date: null, created_at: '2026-10-20T03:00:00Z' },
  // November's: not October's.
  { id: 6, transaction_type: 'Planted', batch_name: '280', plot_name: 'P4', quantity_change: 500,  transaction_date: '2026-11-01', created_at: '2026-11-01T03:00:00Z' }
];

async function boot(browser, opts) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => { errs.push('DIALOG: ' + d.message()); d.dismiss().catch(() => {}); });
  await page.addInitScript((o) => {
    window.__PDFS = []; window.__WRITES = []; window.__READS = [];
    const fin = (v) => typeof v === 'number' && isFinite(v);
    const guard = (m, a) => a.forEach((v, i) => {
      if (!fin(v)) throw new Error('Invalid arguments passed to jsPDF.' + m + ' (argument ' + (i + 1) + ' is ' + v + ')');
    });
    window.jspdf = { jsPDF: class {
      constructor(op) { this.o = op || {}; this.lines = []; this.saved = null; window.__PDFS.push(this); }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {} setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect(x, y, w, h) { guard('rect', [x, y, w, h]); }
      line(a, b, c, d) { guard('line', [a, b, c, d]); }
      addPage() {}
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.18; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { guard('text', [x, y]); this.lines.push(String(t)); }
      save(n) { this.saved = n; }
    } };
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    const answer = (table, st) => {
      if (table === 'shared_inventory_logs' && st.eq.transaction_type === 'Planted') {
        window.__READS.push(table);
        const [a, b] = st.range || [0, 999];
        return { data: o.logs.slice(a, b + 1), error: null };
      }
      if (table === 'nops_seed_planting_workers' && st.op === 'select') {
        if (o.noTable) return { data: null, error: { message: 'relation "public.nops_seed_planting_workers" does not exist' } };
        return { data: o.saved.filter(r => r.month === st.eq.month), error: null };
      }
      if (table === 'nops_seed_planting_workers' && st.op === 'upsert') {
        window.__WRITES.push({ row: st.row, opt: st.opt });
        return { data: null, error: null };
      }
      return { data: [], error: null };
    };
    const from = (table) => {
      const st = { op: 'select', eq: {} };
      const p = new Proxy({}, { get(_, k) {
        if (k === 'then') return (a, b) => Promise.resolve(answer(table, st)).then(a, b);
        if (k === 'maybeSingle' || k === 'single') return () => Promise.resolve({ data: null, error: null });
        if (k === 'eq') return (c, v) => { st.eq[c] = v; return p; };
        if (k === 'range') return (a, b) => { st.range = [a, b]; return p; };
        if (k === 'upsert') return (row, opt) => { st.op = 'upsert'; st.row = row; st.opt = opt; return p; };
        if (k === 'insert' || k === 'update' || k === 'delete') return () => { st.op = k; return p; };
        return () => p; } });
      return p;
    };
    const user = { id: 'u1', email: 'e@x' };
    window.supabase = { createClient: () => ({
      from, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {}
    }) };
  }, opts);
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
  await page.waitForFunction(() => typeof window.renderSeedPlantingPayroll === 'function', { timeout: 20000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.getElementById('global-month').value = '2026-10';
    _linkedRows.PN = [];
    _localWorkers.PN = ['Siti', 'Rina'];
    const btn = [...document.querySelectorAll('#sm-nav .pn-tab')].find(b => /switchTab\('payroll'/.test(b.getAttribute('onclick')));
    btn.click();
    switchPayrollView('seed_planting');
  });
  await page.waitForTimeout(400);
  return { page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ── 1. The sidebar: two parts, every existing job under Main Nursery ──
  const saved = [{ work_date: '2026-10-05', tray: 'P1', month: 'Oct 2026', qty_planted: 3000,
                   workers: { Siti: 2000, Rina: 1000 } },
                 { work_date: '2026-10-05', tray: 'P2', month: 'Oct 2026', qty_planted: 1200,
                   workers: { Siti: 700, 'Old Name': 300 } }];
  const { page, errs } = await boot(browser, { logs: LOGS, saved, noTable: false });
  const nav = await page.evaluate(() => {
    const sub = document.getElementById('pn-subtab-pd').parentElement;
    return [...sub.children].map(el => el.classList.contains('pn-subgroup')
      ? '#' + el.textContent.trim() : el.id.replace('pn-subtab-', ''));
  });
  check('Worker Activity reads Main Nursery, its seven jobs, then Pre Nursery and Seed Planting', nav,
    ['#Main Nursery', 'pd', 'manuring', 'weeding', 'interrow', 'loading_seedlings', 'transplanting', 'cull_incentive',
     '#Pre Nursery', 'seed_planting']);
  check('Seed Planting is the button lit', await page.evaluate(() =>
    document.getElementById('pn-subtab-seed_planting').classList.contains('active')
    && !document.getElementById('pn-subtab-pd').classList.contains('active')), true);

  // ── 2. The rows: the batch report's Seed Planting, by its date ──
  const rows = await page.evaluate((logs) => seedPlantingRows(logs, 'Oct 2026')
    .map(r => [r.date, r.tray, r.qty, r.batches.join('+')]), LOGS);
  check('one row per tray per day inside October, two batches in one tray summed', rows,
    [['2026-10-05', 'P1', 3000, '277+278'], ['2026-10-05', 'P2', 1200, '277'], ['2026-10-20', 'P3', 800, '279']]);
  check('September and November are not October', await page.evaluate((logs) => [
    seedPlantingRows(logs, 'Sep 2026').map(r => r.tray), seedPlantingRows(logs, 'Nov 2026').map(r => r.tray)], LOGS),
    [['P9'], ['P4']]);

  // ── 3. The sheet ──
  const sheet = await page.evaluate(() => {
    const tbl = document.getElementById('payroll-table');
    const head = [...tbl.querySelectorAll('thead tr:nth-child(2) th')].map(th => th.textContent.trim());
    const body = [...tbl.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => {
      const i = td.querySelector('input'); return i ? (i.value || '_') : td.textContent.trim(); }));
    return { head, body, line: document.getElementById('payroll-form-line').textContent,
             foot: [...tbl.querySelectorAll('tfoot td')].map(td => td.textContent.trim()) };
  });
  check('it reads the Pre Nursery', /Seed Planting \(/.test(sheet.line) && /Oct 2026/.test(sheet.line), true);
  check('a column per Pre Nursery worker, and a saved name off the register flagged',
    sheet.head, ['Date', 'Tray', 'Batch', 'Qty planted', 'Siti', 'Rina', 'Old Name ⚠', 'Keyed by workers']);
  check('rows carry the day, the tray, the batches and the figure keyed',
    sheet.body.map(r => r.slice(0, 7)),
    [['05/10/2026', 'P1', '277, 278', '3,000', '2000', '1000', '_'],
     ['05/10/2026', 'P2', '277', '1,200', '700', '_', '300'],
     ['20/10/2026', 'P3', '279', '800', '_', '_', '_']]);
  check('a row that adds up says so, one that does not is not keyed yet',
    sheet.body.map(r => r[7]), ['✓ 3,000', '1,000 · short by 200', '—']);
  check('the foot totals the trays and each worker', sheet.foot.slice(1),
    ['5,000', '2,700', '1,000', '300', '4,000']);

  // ── 4. Keying a figure saves one record per tray per day ──
  await page.fill('#sp-2-0', '500');
  await page.dispatchEvent('#sp-2-0', 'change');
  await page.waitForTimeout(900);
  const w = await page.evaluate(() => window.__WRITES.slice());
  check('one upsert, keyed on the day and the tray',
    w.map(x => [x.row.work_date, x.row.tray, x.row.month, x.row.qty_planted, x.row.workers, x.opt && x.opt.onConflict]),
    [['2026-10-20', 'P3', 'Oct 2026', 800, { Siti: 500 }, 'work_date,tray']]);
  check('…and the row redraws as short', await page.evaluate(() =>
    document.querySelector('#payroll-table tbody tr:nth-child(3) td:last-child').textContent.trim()), '500 · short by 300');
  check('the ledger was only read, never written', await page.evaluate(() =>
    window.__WRITES.every(x => x.row && x.row.tray)), true);

  // ── 5. The paper ──
  const pdf = await page.evaluate(() => {
    window.__PDFS.length = 0; downloadPayrollPDF();
    const d = window.__PDFS[0] || { lines: [], o: {} };
    return { saved: d.saved, orient: d.o.orientation, lines: d.lines };
  });
  check('Seed Planting downloads its own sheet, wide',
    [/^Worker_Record_Seed_Planting_Oct_2026/.test(pdf.saved || ''), pdf.orient], [true, 'landscape']);
  check('…carrying the trays, the figures and every worker',
    ['P1', 'P2', 'P3', '3,000', '1,200', '800', 'Siti', 'Rina', 'Old Name', '2,000', '500'].every(v => pdf.lines.includes(v)), true);
  check('…and none of the maintenance sheets', pdf.lines.some(l => /Manuring|Weeding|Interrow/i.test(l)), false);
  const maint = await page.evaluate(() => {
    switchPayrollView('pd'); window.__PDFS.length = 0;
    _localWorkers[getNursery()] = ['A']; resolveWorkers();
    downloadPayrollPDF(); const d = window.__PDFS[0] || { o: {} };
    return { saved: d.saved, orient: d.o.orientation };
  });
  check('a Main Nursery tab still downloads the four-sheet record, tall',
    [/^Worker_Record_(?!Seed|Transplanting)/.test(maint.saved || ''), maint.orient], [true, 'portrait']);
  check('no page errors or alerts', errs, []);
  await page.close();

  // ── 6. Before the SQL is run: the rows show, the boxes take nothing ──
  const b = await boot(browser, { logs: LOGS, saved: [], noTable: true });
  const nt = await b.page.evaluate(() => ({
    rows: document.querySelectorAll('#payroll-table tbody tr').length,
    disabled: [...document.querySelectorAll('#payroll-table input.sp-in')].every(i => i.disabled),
    hint: document.getElementById('payroll-hint').textContent,
    warn: document.getElementById('payroll-hint').classList.contains('pay-hint-warn')
  }));
  check('with no table the rows still show, every box shut, and the file to run named',
    [nt.rows, nt.disabled, /RUN_ME_seed_planting_workers\.sql/.test(nt.hint), nt.warn], [3, true, true, true]);
  check('no page errors there either', b.errs, []);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
