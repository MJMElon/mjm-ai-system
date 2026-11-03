/* Worker Activity is two parts, and Seed Planting is the Pre Nursery one.

   The office: "worker activity分成两part， main nursery & pre nursery,
   existing 的全部进去 main nursery, seed planting 进去 pre nursery", then
   "每人填自己种的数量" and "这一部分的seed planting数量 要link batch report
   seed planting 的date，如果within那个月就pull 进来", then "这个月的工人名字
   需要manual key， 种植的数量autolink" -- the names are a list per month,
   keyed by hand, not the worker register. Then "tray完全不用管 跟着batch 就
   可以了 直接show total planted qty" -- one row per BATCH -- and a batch
   sown too late for its own month can be added to the next by hand: 277
   was sown on 28 Sep and belongs on October.

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
  // Batch 277: sown 28 Sep, too late for September. Two trays.
  { id: 1, transaction_type: 'Planted', batch_name: '277', plot_name: 'P1', quantity_change: 2560, transaction_date: '2026-09-28', created_at: '2026-09-29T01:00:00Z' },
  { id: 2, transaction_type: 'Planted', batch_name: '277', plot_name: 'P2', quantity_change: 1200, transaction_date: '2026-09-28', created_at: '2026-09-29T01:00:00Z' },
  // Batch 278: two trays, one row, one total -- the trays are not the sheet's business.
  { id: 3, transaction_type: 'Planted', batch_name: '278', plot_name: 'P1', quantity_change: 2440, transaction_date: '2026-10-05', created_at: '2026-10-06T01:00:00Z' },
  { id: 4, transaction_type: 'Planted', batch_name: '278', plot_name: 'P3', quantity_change: 560,  transaction_date: '2026-10-05', created_at: '2026-10-06T01:00:00Z' },
  // Batch 279: no keyed date, so the day it went in decides.
  { id: 5, transaction_type: 'Planted', batch_name: '279', plot_name: 'P4', quantity_change: 800,  transaction_date: null, created_at: '2026-10-20T03:00:00Z' },
  // November's.
  { id: 6, transaction_type: 'Planted', batch_name: '280', plot_name: 'P5', quantity_change: 500,  transaction_date: '2026-11-01', created_at: '2026-11-01T03:00:00Z' }
];

async function boot(browser, opts) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [], dialogs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => {
    dialogs.push(d.type() + ': ' + d.message());
    if (d.type() === 'confirm') d.accept().catch(() => {}); else d.dismiss().catch(() => {});
  });
  await page.addInitScript((o) => {
    window.__PDFS = []; window.__WRITES = []; window.__NAMES = []; window.__MOVES = [];
    const db = { saved: o.saved.slice(), names: o.names.slice(), moves: (o.moves || []).slice() };
    window.__DB = db;
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
    const missing = (t) => ({ data: null, error: { message: 'relation "public.' + t + '" does not exist' } });
    const answer = (table, st) => {
      if (table === 'shared_inventory_logs' && st.eq.transaction_type === 'Planted') {
        const [a, b] = st.range || [0, 999];
        return { data: o.logs.slice(a, b + 1), error: null };
      }
      if (o.noTable && table.indexOf('nops_seed_planting') === 0) return missing(table);
      if (table === 'nops_seed_planting_batch_workers') {
        if (st.op === 'upsert') { window.__WRITES.push({ row: st.row, opt: st.opt }); return { data: null, error: null }; }
        const want = st.in.batch_name || [];
        return { data: db.saved.filter(r => want.includes(r.batch_name)), error: null };
      }
      if (table === 'nops_seed_planting_names') {
        if (st.op === 'upsert') { window.__NAMES.push({ row: st.row, opt: st.opt }); return { data: null, error: null }; }
        return { data: db.names.filter(r => (st.in.month || []).includes(r.month)), error: null };
      }
      if (table === 'nops_seed_planting_batch_month') {
        if (st.op === 'upsert') {
          window.__MOVES.push({ op: 'upsert', row: st.row, opt: st.opt });
          db.moves = db.moves.filter(r => r.batch_name !== st.row.batch_name).concat([st.row]);
          return { data: null, error: null };
        }
        if (st.op === 'delete') {
          window.__MOVES.push({ op: 'delete', batch: st.eq.batch_name });
          db.moves = db.moves.filter(r => r.batch_name !== st.eq.batch_name);
          return { data: null, error: null };
        }
        return { data: db.moves.slice(), error: null };
      }
      return { data: [], error: null };
    };
    const from = (table) => {
      const st = { op: 'select', eq: {}, in: {} };
      const p = new Proxy({}, { get(_, k) {
        if (k === 'then') return (a, b) => Promise.resolve(answer(table, st)).then(a, b);
        if (k === 'maybeSingle' || k === 'single') return () => Promise.resolve({ data: null, error: null });
        if (k === 'eq') return (c, v) => { st.eq[c] = v; return p; };
        if (k === 'in') return (c, v) => { st.in[c] = v; return p; };
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
  await page.evaluate((month) => {
    document.getElementById('global-month').value = month;
    // The register says nothing about the Pre Nursery: the sheet must not care.
    _linkedRows.PN = [];
    _localWorkers.PN = ['Register Person'];
    _registerRows = [{ full_name: 'Siti', section: 'PN', active: true }, { full_name: 'Ani', section: 'PN', active: true },
                     { full_name: 'Nur Aina', section: 'UNN1', active: true }, { full_name: 'Gone', section: 'PN', active: false },
                     { full_name: 'Turned down', section: 'BNN', active: true, rejected_at: '2026-10-01' }];
    const btn = [...document.querySelectorAll('#sm-nav .pn-tab')].find(b => /switchTab\('payroll'/.test(b.getAttribute('onclick')));
    btn.click();
    switchPayrollView('seed_planting');
  }, opts.month || '2026-10');
  await page.waitForTimeout(400);
  return { page, errs, dialogs };
}

const sheetOf = (page) => page.evaluate(() => {
  const tbl = document.getElementById('payroll-table');
  return {
    head: [...tbl.querySelectorAll('thead tr:nth-child(2) th')].map(th => th.textContent.trim()),
    body: [...tbl.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => {
      const i = td.querySelector('input'); return i ? (i.value || '_') : td.textContent.trim().replace(/\s+/g, ' '); })),
    foot: [...tbl.querySelectorAll('tfoot td')].map(td => td.textContent.trim()),
    line: document.getElementById('payroll-form-line').textContent,
    bars: document.getElementById('payroll-names').textContent.replace(/\s+/g, ' ')
  };
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ── 1. The sidebar: two parts, every existing job under Main Nursery ──
  const saved = [{ batch_name: '278', month: 'Oct 2026', qty_planted: 3000, workers: { Siti: 2000, Rina: 1000 } },
                 { batch_name: '279', month: 'Oct 2026', qty_planted: 800, workers: { Siti: 500, 'Old Name': 200 } }];
  const names = [{ month: 'Oct 2026', names: ['Siti', 'Rina'] }, { month: 'Sep 2026', names: ['Ana', 'Budi'] }];
  const { page, errs, dialogs } = await boot(browser, { logs: LOGS, saved, names, noTable: false });
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

  // ── 2. The rule: one row per batch, by the batch report's date ──
  const rule = await page.evaluate((logs) => ({
    oct: seedPlantingRows(logs, 'Oct 2026').map(r => [r.date, r.batch, r.qty]),
    sep: seedPlantingRows(logs, 'Sep 2026').map(r => r.batch),
    nov: seedPlantingRows(logs, 'Nov 2026').map(r => r.batch),
    octMoved: seedPlantingRows(logs, 'Oct 2026', { 277: 'Oct 2026' }).map(r => r.batch),
    sepMoved: seedPlantingRows(logs, 'Sep 2026', { 277: 'Oct 2026' }).map(r => r.batch)
  }), LOGS);
  check('one row per batch, its trays summed, dated by the batch report', rule.oct,
    [['2026-10-05', '278', 3000], ['2026-10-20', '279', 800]]);
  check('September holds 277, November 280', [rule.sep, rule.nov], [['277'], ['280']]);
  check('a batch moved to October is on October and off September, never both', [rule.octMoved, rule.sepMoved],
    [['277', '278', '279'], []]);

  // ── 3. The sheet ──
  let sh = await sheetOf(page);
  check('it reads the Pre Nursery', /Seed Planting \(/.test(sh.line) && /Oct 2026/.test(sh.line), true);
  check('no tray column: planted date, batch, total, a column per name keyed for the month, a saved name off it flagged, and Checked',
    sh.head, ['Planted date', 'Batch', 'Qty planted', 'Siti', 'Rina', 'Old Name ⚠', 'Keyed by workers', 'Checked']);
  check('rows carry the planted date, the batch, its total and the figures keyed -- and no money', sh.body,
    [['05/10/2026', '278', '3,000', '2000', '1000', '_', '✓ 3,000', 'Check'],
     ['20/10/2026', '279', '800', '500', '_', '200', '700 · short by 100', 'Check']]);
  check('nothing on the sheet is priced', /RM/.test(await page.evaluate(() => document.getElementById('payroll-table').textContent)), false);
  check('the foot totals the batches and each worker', sh.foot.slice(1, 6), ['3,800', '2,500', '1,000', '200', '3,700']);

  // ── 4. Keying a figure saves one record per batch ──
  await page.fill('#sp-1-1', '100');
  await page.dispatchEvent('#sp-1-1', 'change');
  await page.waitForTimeout(900);
  check('one upsert, keyed on the batch',
    await page.evaluate(() => window.__WRITES.map(x => [x.row.batch_name, x.row.month, x.row.planted_date, x.row.qty_planted, x.row.workers, x.opt && x.opt.onConflict])),
    [['279', 'Oct 2026', '2026-10-20', 800, { Siti: 500, 'Old Name': 200, Rina: 100 }, 'batch_name']]);
  check('…and the row redraws as adding up', await page.evaluate(() =>
    document.querySelector('#payroll-table tbody tr:nth-child(2) td:nth-last-child(2)').textContent.trim()), '✓ 800');

  // ── 4b. Checked is what sends a batch to the payroll ──
  await page.evaluate(() => toggleSeedPlantingCheck(0));
  await page.waitForTimeout(300);
  const chk = await page.evaluate(() => {
    const w = window.__WRITES.slice(-1)[0];
    return { batch: w.row.batch_name, at: !!w.row.checked_at, by: w.row.checked_by, workers: w.row.workers,
             boxes: [...document.querySelectorAll('#payroll-table tbody tr:nth-child(1) input.sp-in')].every(i => i.disabled),
             cell: document.querySelector('#payroll-table tbody tr:nth-child(1) td:last-child').textContent.trim() };
  });
  check('Check writes the tick on the batch with its figures', [chk.batch, chk.at, chk.by, chk.workers],
    ['278', true, 'Elon Ting', { Siti: 2000, Rina: 1000 }]);
  check('…and the checked row is shut and says who', [chk.boxes, /^✓ Elon Ting/.test(chk.cell)], [true, true]);
  await page.evaluate(() => setSeedPlantingQty(0, 0, '5'));
  await page.waitForTimeout(800);
  check('a figure on a checked batch is refused, not saved', [/Batch 278 is Checked/.test(dialogs.pop() || ''),
    await page.evaluate(() => window.__WRITES.filter(x => x.row.batch_name === '278').length)], [true, 1]);
  await page.evaluate(() => toggleSeedPlantingCheck(0));
  await page.waitForTimeout(300);
  check('Uncheck asks first, and clears the tick', [/^confirm: Uncheck batch 278/.test(dialogs.pop() || ''),
    await page.evaluate(() => window.__WRITES.slice(-1)[0].row.checked_at)], [true, null]);

  // ── 5. The names, from a dropdown ──
  const bar = await page.evaluate(() => [...document.querySelectorAll('#payroll-names .sp-chip')].map(c => c.firstChild.textContent));
  check('the month list is drawn above the table', bar.slice(0, 2), ['Siti', 'Rina']);
  const opts = await page.evaluate(() => [...document.querySelectorAll('#sp-new-name optgroup')].map(g =>
    g.label + ': ' + [...g.querySelectorAll('option')].map(o => o.value).join(',')));
  check('Add worker is a dropdown of the active register by section, without names already on the list',
    opts, ['PN: Ani', 'UNN1: Nur Aina', 'Last month: Ana,Budi']);
  await page.evaluate(() => { const s = document.getElementById('sp-new-name'); s.value = 'Nur Aina'; addSeedPlantingWorker(); });
  await page.waitForTimeout(200);
  check('picking one adds it and saves the month',
    await page.evaluate(() => window.__NAMES.map(x => [x.row.month, x.row.names, x.opt && x.opt.onConflict])),
    [['Oct 2026', ['Siti', 'Rina', 'Nur Aina'], 'month']]);
  await page.evaluate(() => {
    const s = document.getElementById('sp-new-name'); s.value = '__other'; _spPickWorker('__other');
    document.getElementById('sp-new-name-other').value = '  Pak   Long ';
    addSeedPlantingWorker();
  });
  await page.waitForTimeout(200);
  check('Other opens a box for a name on no list, tidied', await page.evaluate(() => _spCache['Oct 2026'].names),
    ['Siti', 'Rina', 'Nur Aina', 'Pak Long']);
  await page.evaluate(() => removeSeedPlantingWorker(0));
  check('a name with figures is not removed', /Siti has figures on 2 row/.test(dialogs.pop() || ''), true);

  // ── 6. 277, sown on 28 Sep, added to October from a dropdown ──
  check('Add batch offers the last two months, newest first, with the day and the total',
    await page.evaluate(() => [...document.querySelectorAll('#sp-new-batch option')].map(o => o.textContent.trim())),
    ['Pick a batch…', '277 · 28/09/2026 · 3,760']);
  await page.evaluate(() => { document.getElementById('sp-new-batch').value = '277'; addSeedPlantingBatch(); });
  await page.waitForTimeout(700);
  check('the office is asked, naming both months', /^confirm: Move batch 277 from Sep 2026 to Oct 2026\?/.test(dialogs.pop() || ''), true);
  check('…and one record says 277 belongs to October',
    await page.evaluate(() => window.__MOVES.map(x => [x.op, x.row && x.row.batch_name, x.row && x.row.month, x.opt && x.opt.onConflict])),
    [['upsert', '277', 'Oct 2026', 'batch_name']]);
  sh = await sheetOf(page);
  check('277 is on October, first, with its whole total, and NO "added by hand" tag',
    sh.body.map(r => r.slice(0, 3)), [['28/09/2026', '277', '3,760'], ['05/10/2026', '278', '3,000'], ['20/10/2026', '279', '800']]);
  check('…and the bar names it with the day it was planted', sh.bars.includes('277planted 28/09/2026') || sh.bars.includes('277 planted 28/09/2026'), true);
  check('…and the dropdown no longer offers it', await page.evaluate(() =>
    [...document.querySelectorAll('#sp-new-batch option')].map(o => o.value)), ['']);

  // September now says where 277 went, rather than losing it quietly.
  await page.evaluate(() => { document.getElementById('global-month').value = '2026-09'; renderPayroll(); });
  await page.waitForTimeout(500);
  sh = await sheetOf(page);
  check('September no longer counts 277, and says where it went',
    [sh.body.length, /No seed planting/.test(sh.body[0] && sh.body[0][0] || ''), /Moved out of this month: 277 → Oct 2026/.test(sh.bars)],
    [1, true, true]);

  // Taken off again: back to September.
  await page.evaluate(() => { document.getElementById('global-month').value = '2026-10'; renderPayroll(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => removeSeedPlantingBatch('277'));
  await page.waitForTimeout(700);
  check('taking it off asks, and deletes only the move', [/^confirm: Take batch 277 off Oct 2026\?/.test(dialogs.pop() || ''),
    await page.evaluate(() => window.__MOVES.slice(-1)[0])], [true, { op: 'delete', batch: '277' }]);
  check('…and October is back to its own two', (await sheetOf(page)).body.map(r => r[1]), ['278', '279']);

  // ── 7. The paper ──
  const pdf = await page.evaluate(() => {
    window.__PDFS.length = 0; downloadPayrollPDF();
    const d = window.__PDFS[0] || { lines: [], o: {} };
    return { saved: d.saved, orient: d.o.orientation, lines: d.lines };
  });
  check('Seed Planting downloads its own sheet, wide',
    [/^Worker_Record_Seed_Planting_Oct_2026/.test(pdf.saved || ''), pdf.orient], [true, 'landscape']);
  check('…carrying the batches, their totals and every worker',
    ['278', '279', '3,000', '800', 'Siti', 'Rina', 'Old Name', '2,000', '100'].every(v => pdf.lines.includes(v)), true);
  check('…with no tray on it', pdf.lines.some(l => /^Tray$|^P[0-9]$/.test(l)), false);
  const maint = await page.evaluate(() => {
    switchPayrollView('pd'); window.__PDFS.length = 0;
    _localWorkers[getNursery()] = ['A']; resolveWorkers();
    downloadPayrollPDF(); const d = window.__PDFS[0] || { o: {} };
    return { saved: d.saved, orient: d.o.orientation };
  });
  check('a Main Nursery tab still downloads the four-sheet record, tall',
    [/^Worker_Record_(?!Seed|Transplanting)/.test(maint.saved || ''), maint.orient], [true, 'portrait']);
  check('no page errors', errs, []);
  await page.close();

  // ── 8. Before the SQL is run: the rows show, the boxes take nothing ──
  const b = await boot(browser, { logs: LOGS, saved: [], names: [], noTable: true });
  const nt = await b.page.evaluate(() => ({
    rows: document.querySelectorAll('#payroll-table tbody tr').length,
    disabled: [...document.querySelectorAll('#payroll-table input.sp-in')].every(i => i.disabled),
    hint: document.getElementById('payroll-hint').textContent,
    warn: document.getElementById('payroll-hint').classList.contains('pay-hint-warn')
  }));
  check('with no tables the batches still show, every box shut, and the file to run named',
    [nt.rows, nt.disabled, /RUN_ME_seed_planting_workers\.sql/.test(nt.hint), nt.warn], [2, true, true, true]);
  check('no page errors there either', b.errs, []);

  // ── 9. A new month starts empty and offers last month in one press ──
  const c = await boot(browser, { logs: LOGS, saved: [], names: [{ month: 'Sep 2026', names: ['Ana', 'Budi'] }], noTable: false });
  const empty = await c.page.evaluate(() => ({
    cols: [...document.querySelectorAll('#payroll-table thead tr:nth-child(2) th')].map(th => th.textContent.trim()),
    rows: document.querySelectorAll('#payroll-table tbody tr').length,
    offer: [...document.querySelectorAll('#payroll-names button')].map(b => b.textContent.trim()).find(x => /last month/i.test(x)) || ''
  }));
  check('no names yet: the batches still show, with no worker columns', [empty.rows, empty.cols],
    [2, ['Planted date', 'Batch', 'Qty planted', 'Keyed by workers', 'Checked']]);
  check('…and last month is offered, counted', empty.offer, 'Use last month’s names (2)');
  await c.page.evaluate(() => useLastMonthSeedPlantingNames());
  await c.page.waitForTimeout(200);
  check('one press makes them this month’s', await c.page.evaluate(() => window.__NAMES.map(x => [x.row.month, x.row.names])),
    [['Oct 2026', ['Ana', 'Budi']]]);
  check('no page errors there', c.errs, []);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
