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
    window.__PDFS = []; window.__WRITES = []; window.__NAMES = []; window.__MOVES = []; window.__CONFIG = [];
    const db = { config: (o.config || []).slice(), saved: o.saved.slice(), names: o.names.slice(), moves: (o.moves || []).slice() };
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
      if (table === 'nops_maint_config') {
        if (st.op === 'upsert') {
          window.__CONFIG.push({ row: st.row, opt: st.opt });
          db.config = db.config.filter(r => r.key !== st.row.key).concat([st.row]);
          return { data: null, error: null };
        }
        return { data: db.config.filter(r => !st.eq.key || r.key === st.eq.key), error: null };
      }
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

/* THE SHEET IS TWO JOBS STACKED NOW, which is what the office asked for --
   *"不要分开 放一起 分上下两部分就好"*. So the head belongs to the SECTION
   and cannot be a <thead>, there being two of them, and this reader walks
   the tbody splitting on the job band.

   `sheetOf` hands back the FIRST section flat, so every check below says
   exactly what it said when the sheet had one job on it; `sections` is
   there for the ones that are about both. */
const sheetOf = (page) => page.evaluate(() => {
  const tbl = document.getElementById('payroll-table');
  const cells = (tr) => [...tr.children].map(td => {
    const i = td.querySelector('input'); return i ? (i.value || '_') : td.textContent.trim().replace(/\s+/g, ' '); });
  const sections = [];
  let cur = null;
  [...tbl.querySelectorAll('tbody tr')].forEach(tr => {
    if (tr.classList.contains('sp-job-row')) {
      const nm = tr.querySelector('.sp-job-name');
      cur = { band: (nm || tr).textContent.trim(), off: tr.classList.contains('sp-job-off'), head: [], body: [], foot: [] }; sections.push(cur); return;
    }
    if (!cur) { cur = { band: '', head: [], body: [], foot: [] }; sections.push(cur); }
    if (tr.classList.contains('sp-head')) { cur.head = [...tr.children].map(th => th.textContent.trim()); return; }
    if (tr.classList.contains('sp-sub-row')) { cur.foot = cells(tr); return; }
    cur.body.push(cells(tr));
  });
  const first = sections[0] || { band: '', head: [], body: [], foot: [] };
  return {
    sections,
    band: first.band, head: first.head, body: first.body, foot: first.foot,
    line: document.getElementById('payroll-form-line').textContent,
    bars: document.getElementById('payroll-names').textContent.replace(/\s+/g, ' ')
  };
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* ── 1. The sidebar: ONE alphabetical list, no Pre / Main headings ──
     It was two groups, Main Nursery over seven jobs and Pre Nursery over
     this one. The office took both headings off -- "main page 不会跟着pre
     和 main 分了" -- because the nursery CIRCLES say it now, about the job
     somebody actually has open. Where each job is done is kept on Settings
     and held by tests/where_each_job_is_done.cjs; what this one still has
     to say is that the Pre Nursery sheet is IN the list and lit. */
  const saved = [{ batch_name: '278', month: 'Oct 2026', qty_planted: 3000, workers: { Siti: 2000, Rina: 1000 } },
                 { batch_name: '279', month: 'Oct 2026', qty_planted: 800, workers: { Siti: 500, 'Old Name': 200 } }];
  const names = [{ month: 'Oct 2026', names: ['Siti', 'Rina'] }, { month: 'Sep 2026', names: ['Ana', 'Budi'] }];
  const { page, errs, dialogs } = await boot(browser, { logs: LOGS, saved, names, noTable: false });
  const nav = await page.evaluate(() => {
    const sub = document.getElementById('pn-subtab-pd').parentElement;
    return [...sub.children].map(el => el.classList.contains('pn-subgroup')
      ? '#' + el.textContent.trim() : el.id.replace('pn-subtab-', ''));
  });
  check('Worker Activity is one list of eight jobs with no group heading', nav,
    ['cull_incentive', 'interrow', 'loading_seedlings', 'manuring', 'pd',
     'seed_planting', 'transplanting', 'weeding']);
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
  check('it reads the Pre Nursery', /Pre Nursery \(/.test(sh.line) && /Oct 2026/.test(sh.line), true);
  check('no tray column: planted date, batch, total, a column per name keyed for the month, a saved name off it flagged, and Checked',
    sh.head, ['Planted date', 'Batch', 'Qty planted', 'Siti', 'Rina', 'Old Name ⚠', 'Keyed by workers', 'Checked']);
  check('rows carry the planted date, the batch, its total and the figures keyed -- and no money', sh.body,
    [['05/10/2026', '278', '3,000', '2000', '1000', '_', '✓ 3,000', 'Check'],
     ['20/10/2026', '279', '800', '500', '_', '200', '700 · short by 100', 'Check']]);
  check('nothing on the sheet is priced', /RM/.test(await page.evaluate(() => document.getElementById('payroll-table').textContent)), false);
  check('each job closes with its OWN total, naming the job',
    [sh.foot[0], sh.foot.slice(1, 6)],
    ['Seed Planting — Total (Capacity)', ['3,800', '2,500', '1,000', '200', '3,700']]);
  /* AND THE SECOND JOB IS ON THE SAME SHEET, under the first, over the same
     batches and the same columns. Two entries in the side bar is what the
     office asked to be rid of. */
  /* A page with one section -- which is what the previous one draws, the
     soil filling being a sheet of its own there -- must FAIL this by name
     rather than taking the harness down on `sections[1]` being undefined. */
  const sec2 = () => sh.sections[1] || { band: '', head: [], body: [], foot: [] };
  check('…and the soil filling is the section under it, same batches, same columns',
    [sh.sections.length, sec2().band, sec2().body.map(r => r[1]),
     sec2().head.length === sh.head.length && sh.head.length > 0],
    [2, 'Mengisi Tanah ke Hyplug', ['278', '279'], true]);
  check('…and its own quantity heading, since it is holes and not seeds',
    [sh.head[2], sec2().head[2]], ['Qty planted', 'Qty to fill']);

  // ── 4. Keying a figure saves one record per batch ──
  /* Wrapped, every one of them: the previous page has no `sp-seed-` boxes
     and no job argument on its handlers, and a throw here would kill the
     harness where the checks underneath say what is missing, by name. */
  try {
    await page.fill('#sp-seed-1-1', '100', { timeout: 4000 });
    await page.dispatchEvent('#sp-seed-1-1', 'change');
  } catch (e) { /* the check below says so */ }
  await page.waitForTimeout(900);
  /* ONE UPSERT, KEYED ON THE BATCH AND THE JOB. The Pre Nursery has two
     jobs now -- sowing the seed and filling the hyplug trays before it --
     and the key moved with them, or the second job would write over the
     first's figures on the same batch. */
  check('one upsert, keyed on the batch AND the job',
    await page.evaluate(() => window.__WRITES.map(x => [x.row.batch_name, x.row.job, x.row.month, x.row.planted_date, x.row.qty_planted, x.row.workers, x.opt && x.opt.onConflict])),
    [['279', 'seed', 'Oct 2026', '2026-10-20', 800, { Siti: 500, 'Old Name': 200, Rina: 100 }, 'batch_name,job']]);
  /* THE BAND AND THE HEAD ARE ROWS IN THE TBODY NOW, so a body row is no
     longer an nth-child away. Asked by the classes the renderer sets, which
     is what makes this read the same whichever section it is about. */
  const bodyRows = () => page.evaluate(() => [...document.querySelectorAll('#payroll-table tbody tr')]
    .filter(tr => !tr.classList.contains('sp-job-row') && !tr.classList.contains('sp-head')
               && !tr.classList.contains('sp-sub-row'))
    .map(tr => [...tr.children].map(td => {
      const i = td.querySelector('input'); return i ? (i.value || '_') : td.textContent.trim().replace(/\s+/g, ' '); })));
  check('…and the row redraws as adding up',
    ((await bodyRows())[1] || []).slice(-2)[0], '✓ 800');

  // ── 4b. Checked is what sends a batch to the payroll ──
  try { await page.evaluate(() => toggleSeedPlantingCheck('seed', 0)); } catch (e) {}
  await page.waitForTimeout(300);
  const chk = await page.evaluate(() => {
    /* A write that never happened is read as an empty row, so the checks
       below fail by name instead of throwing inside the page. */
    const w = window.__WRITES.slice(-1)[0] || { row: {} };
    return { batch: w.row.batch_name, at: !!w.row.checked_at, by: w.row.checked_by, workers: w.row.workers,
             boxes: [...document.querySelectorAll('#payroll-table tbody tr.sp-job-row ~ tr input.sp-in')]
                      .slice(0, 3).every(i => i.disabled),
             cell: (([...document.querySelectorAll('#payroll-table tbody tr')]
                     .filter(tr => !tr.classList.contains('sp-job-row') && !tr.classList.contains('sp-head')
                                && !tr.classList.contains('sp-sub-row'))[0] || {}).lastElementChild
                     || { textContent: '' }).textContent.trim() };
  });
  check('Check writes the tick on the batch with its figures', [chk.batch, chk.at, chk.by, chk.workers],
    ['278', true, 'Elon Ting', { Siti: 2000, Rina: 1000 }]);
  check('…and the checked row is shut and says who', [chk.boxes, /^✓ Elon Ting/.test(chk.cell)], [true, true]);
  try { await page.evaluate(() => setSeedPlantingQty('seed', 0, 0, '5')); } catch (e) {}
  await page.waitForTimeout(800);
  check('a figure on a checked batch is refused, not saved', [/Batch 278 is Checked/.test(dialogs.pop() || ''),
    await page.evaluate(() => window.__WRITES.filter(x => x.row.batch_name === '278').length)], [true, 1]);
  try { await page.evaluate(() => toggleSeedPlantingCheck('seed', 0)); } catch (e) {}
  await page.waitForTimeout(300);
  check('Uncheck asks first, and clears the tick', [/^confirm: Uncheck batch 278/.test(dialogs.pop() || ''),
    await page.evaluate(() => (window.__WRITES.slice(-1)[0] || { row: {} }).row.checked_at)], [true, null]);

  // ── 5. The names, from a dropdown ──
  const bar = await page.evaluate(() => [...document.querySelectorAll('#payroll-names .sp-chip')].map(c => c.firstChild.textContent));
  check('the month list is drawn above the table', bar.slice(0, 2), ['Siti', 'Rina']);
  /* The dropdown is the POSITIONS; picking one draws its people as ticks
     -- *"选了后 就出现namelist去tick它"*. */
  const opts = await page.evaluate(() => typeof _spBands === 'undefined' ? ['no _spBands'] :
    _spBands.map(b => b.label + ': ' + b.names.join(',')));
  check('Add worker is a dropdown of the active register by section, without names already on the list',
    opts, ['PN: Ani', 'UNN1: Nur Aina', 'Last month: Ana,Budi']);
  check('the dropdown offers the groups, never the people',
    await page.evaluate(() => [...document.querySelectorAll('#sp-new-name option')].map(o => o.value)),
    ['', 'g0', 'g1', 'g2', '__other']);
  /* NO STANDING ADD BUTTON -- *"add worker add batch 不用 直到选的时候 按
     confirm就直接下去"*. Confirm shows only once something is picked. */
  const shown = (id) => page.evaluate((id) => { const b = document.getElementById(id);
    return b ? getComputedStyle(b).display !== 'none' : 'no #' + id; }, id);
  check('no Add worker / Add batch buttons left',
    await page.evaluate(() => [...document.querySelectorAll('#payroll-names button')].map(b => b.textContent.trim())
      .filter(x => /^\+?\s*Add (worker|batch)/i.test(x))), []);
  check('Confirm is hidden before a position is picked', await shown('sp-name-confirm'), false);
  await page.evaluate(() => { const s = document.getElementById('sp-new-name'); s.value = 'g1'; _spPickWorker('g1'); });
  check('…and shows once one is', await shown('sp-name-confirm'), true);
  check('picking a group draws its people as ticks',
    await page.evaluate(() => [...document.querySelectorAll('#sp-pick-list .sp-pick-tick')].map(x => x.value)), ['Nur Aina']);
  /* FLEXI -- *"选了BNN worker然后就不能选UNN1 worker了 我要flexi的"*: a
     second group opens beside the first, and the dropdown stops offering
     the ones already open. */
  await page.evaluate(() => { _spPickWorker('g0'); });
  check('a second group opens beside the first',
    await page.evaluate(() => [...document.querySelectorAll('#sp-pick-list .sp-pick-head')].map(h => h.firstChild.textContent.trim())),
    ['UNN1', 'PN']);
  check('…and the dropdown offers only what is not open yet',
    await page.evaluate(() => [...document.querySelectorAll('#sp-new-name option')].map(o => o.value)),
    ['', 'g2', '__other']);
  if (process.env.SHOT) await page.locator('#payroll-names').screenshot({ path: process.env.SHOT });
  await page.evaluate(() => { _spCloseGroup('PN'); });
  check('× closes a group again',
    await page.evaluate(() => [...document.querySelectorAll('#sp-pick-list .sp-pick-tick')].map(x => x.value)), ['Nur Aina']);
  await page.evaluate(() => { addSeedPlantingWorker(); });
  check('Add with nothing ticked adds nobody and says so', /Tick at least one/.test(dialogs.pop() || ''), true);
  await page.evaluate(() => { const x = document.querySelector('#sp-pick-list .sp-pick-tick'); x.checked = true; _spTick(x.value, true); addSeedPlantingWorker(); });
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
  try { await page.evaluate(() => removeSeedPlantingWorker(0)); } catch (e) {}
  check('a name with figures is not removed', /Siti has figures on 2 row/.test(dialogs.pop() || ''), true);

  // ── 6. 277, sown on 28 Sep, added to October from a dropdown ──
  check('Add batch offers the last two months, newest first, with the day and the total',
    await page.evaluate(() => [...document.querySelectorAll('#sp-new-batch option')].map(o => o.textContent.trim())),
    ['Pick a batch…', '277 · 28/09/2026 · 3,760']);
  check('batch Confirm is hidden until a batch is picked', await page.evaluate(() => {
    const c = document.getElementById('sp-batch-confirm'); if (!c) return 'no #sp-batch-confirm';
    const before = getComputedStyle(c).display === 'none';
    const sel = document.getElementById('sp-new-batch'); sel.value = '277'; sel.dispatchEvent(new Event('change'));
    return [before, getComputedStyle(document.getElementById('sp-batch-confirm')).display !== 'none'];
  }), [true, true]);
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
  /* It used to add a line saying where 277 went; the office took that and
     every other standing sentence off the sheet (那种废话全部移除). */
  check('September no longer counts 277, and adds no sentence about it',
    [sh.body.length, /No seed planting/.test(sh.body[0] && sh.body[0][0] || ''), /Moved out|planted too late|No names keyed|Rows come from/.test(sh.bars + sh.body.join(' '))],
    [1, true, false]);

  // Taken off again: back to September.
  await page.evaluate(() => { document.getElementById('global-month').value = '2026-10'; renderPayroll(); });
  await page.waitForTimeout(500);
  try { await page.evaluate(() => removeSeedPlantingBatch('277')); } catch (e) {}
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
  /* A CREW THIS SMALL FITS THE TALL PAGE, so it prints portrait -- the
     office's rule for every Worker Activity download: few workers portrait,
     many landscape (tests/every_job_downloads_by_nursery.cjs). */
  check('the Pre Nursery sheet downloads, tall for a small crew',
    [/^Worker_Record_Pre_Nursery_Oct_2026/.test(pdf.saved || ''), pdf.orient], [true, 'portrait']);
  /* BOTH JOBS ARE ON THE PAPER, each with its own total naming it. A sheet
     printing only the half that happened to be on screen is the fault the
     Transplanting download already had once. */
  check('…and BOTH jobs are on it, each total naming its own job',
    [pdf.lines.includes('Seed Planting'), pdf.lines.includes('Mengisi Tanah ke Hyplug'),
     pdf.lines.includes('Seed Planting — Total (Capacity)'),
     pdf.lines.includes('Mengisi Tanah ke Hyplug — Total (Capacity)')],
    [true, true, true, true]);
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
    rows: [...document.querySelectorAll('#payroll-table tbody tr')].filter(tr =>
            !tr.classList.contains('sp-job-row') && !tr.classList.contains('sp-head')
         && !tr.classList.contains('sp-sub-row')).length,
    disabled: [...document.querySelectorAll('#payroll-table input.sp-in')].every(i => i.disabled),
    hint: document.getElementById('payroll-hint').textContent,
    warn: document.getElementById('payroll-hint').classList.contains('pay-hint-warn')
  }));
  check('with no tables the batches still show, every box shut, and the file to run named',
    [nt.rows, nt.disabled, /RUN_ME_seed_planting_workers\.sql/.test(nt.hint), nt.warn], [4, true, true, true]);
  check('no page errors there either', b.errs, []);

  // ── 9. A new month starts empty and offers last month in one press ──
  const c = await boot(browser, { logs: LOGS, saved: [], names: [{ month: 'Sep 2026', names: ['Ana', 'Budi'] }], noTable: false });
  const empty = await c.page.evaluate(() => ({
    cols: [...document.querySelectorAll('#payroll-table tbody tr.sp-head')][0]
            ? [...document.querySelectorAll('#payroll-table tbody tr.sp-head')[0].children].map(th => th.textContent.trim()) : [],
    rows: [...document.querySelectorAll('#payroll-table tbody tr')].filter(tr =>
            !tr.classList.contains('sp-job-row') && !tr.classList.contains('sp-head')
         && !tr.classList.contains('sp-sub-row')).length,
    offer: [...document.querySelectorAll('#payroll-names button[onclick*="useLastMonth"]')].map(b => b.textContent.trim()).find(x => /last month/i.test(x)) || ''
  }));
  /* Four rows, not two: the same two batches under each of the two jobs. */
  check('no names yet: the batches still show, with no worker columns', [empty.rows, empty.cols],
    [4, ['Planted date', 'Batch', 'Qty planted', 'Keyed by workers', 'Checked']]);
  /* The one-press button came off at the office request (删掉); last
     month is a group in the dropdown now, picked and ticked. */
  check('no Use last month button any more', empty.offer, '');
  await c.page.evaluate(() => {
    const i = _spBands.findIndex(b => /last month/i.test(b.label));
    _spPickWorker('g' + i);
  });
  await c.page.evaluate(() => {
    document.querySelectorAll('#sp-pick-list .sp-pick-tick').forEach(x => { x.checked = true; _spTick(x.value, true); });
    addSeedPlantingWorker();
  });
  await c.page.waitForTimeout(200);
  check('last month is a group, picked and ticked in one Add', await c.page.evaluate(() => window.__NAMES.map(x => [x.row.month, x.row.names])),
    [['Oct 2026', ['Ana', 'Budi']]]);
  check('no page errors there', c.errs, []);

  // ── 9. A month with no soil filling takes that band off ──
  /* *"这个mengisi tanah某些月份是没有的 所以要有一个按钮是可以删掉这部分的"*.
     A mark on the month, never a deletion; refused while figures are keyed
     against that job; and the band comes back with one press. */
  {
    const d = await boot(browser, { logs: LOGS, saved: [], names, noTable: false });
    let s9 = await sheetOf(d.page);
    check('the standing explanation over the sheet is gone (删掉)',
    await d.page.evaluate(() => document.getElementById('payroll-hint').textContent.trim()), '');
    /* "design很丑 而且planted date batch这些字眼都不在中间". */
    const look = await d.page.evaluate(() => ({
      off: [...document.querySelectorAll('tr.sp-head th')].map(th => {
        const r = th.getBoundingClientRect(), w = (th.firstElementChild || th).getBoundingClientRect();
        return Math.abs((r.left + r.width / 2) - (w.left + w.width / 2)); }).filter(x => x > 2).length,
      bands: [...new Set([...document.querySelectorAll('tr.sp-job-row td')].map(td => getComputedStyle(td).backgroundColor))].length,
      batchTint: [...document.querySelectorAll('#payroll-table td.plot-td')].length
    }));
    check('every heading sits in the middle of its column, both job bands are one colour, no plot tint on the batch',
      [look.off, look.bands, look.batchTint], [0, 1, 0]);
    check('the soil filling band carries a Remove button; Seed Planting does not',
      await d.page.evaluate(() => [...document.querySelectorAll('[data-sp-remove]')].map(b => b.dataset.spRemove)), ['hyplug']);
    try { await d.page.click('[data-sp-remove="hyplug"]', { timeout: 3000 }); } catch (_) {}
    await d.page.waitForTimeout(400);
    s9 = await sheetOf(d.page);
    check('Remove marks the month in nops_maint_config, and writes nothing else',
      [await d.page.evaluate(() => window.__CONFIG.map(x => [x.row.key, x.row.txt_value, x.opt && x.opt.onConflict])),
       await d.page.evaluate(() => window.__WRITES.length)],
      [[['sp_job_off:Oct 2026', 'hyplug', 'key']], 0]);
    check('…the band is down to one line saying so, with no rows and no boxes under it',
      [s9.sections.length, s9.sections[1] && s9.sections[1].off, s9.sections[1] && s9.sections[1].body.length,
       await d.page.evaluate(() => document.querySelectorAll('[id^="sp-hyplug-"]').length)],
      [2, true, 0, 0]);
    check('…Seed Planting is untouched', s9.sections[0] && s9.sections[0].body.length, 2);
    try { await d.page.click('[data-sp-add="hyplug"]', { timeout: 3000 }); } catch (_) {}
    await d.page.waitForTimeout(400);
    s9 = await sheetOf(d.page);
    check('Add back brings the band back, rows and all',
      [s9.sections[1] && s9.sections[1].off, s9.sections[1] && s9.sections[1].body.length,
       await d.page.evaluate(() => window.__CONFIG.slice(-1)[0].row.txt_value)], [false, 2, '']);
    check('no page errors there', d.errs, []);
    await d.page.close();

    /* Already marked: the sheet opens with the band off, and the PDF leaves it out. */
    const e = await boot(browser, { logs: LOGS, saved: [], names, noTable: false,
      config: [{ key: 'sp_job_off:Oct 2026', txt_value: 'hyplug' }] });
    const s10 = await sheetOf(e.page);
    check('a month already marked opens with the band off', s10.sections[1] && s10.sections[1].off, true);
    check('another month is not touched by it', await e.page.evaluate(() => (_spCache['Nov 2026'] || {}).off || null), null);
    await e.page.close();

    /* Figures keyed: refused, naming the job, and nothing written. */
    const f = await boot(browser, { logs: LOGS, names, noTable: false,
      saved: [{ batch_name: '278', job: 'hyplug', month: 'Oct 2026', qty_planted: 3000, workers: { Siti: 50 } }] });
    try { await f.page.click('[data-sp-remove="hyplug"]', { timeout: 3000 }); } catch (_) {}
    await f.page.waitForTimeout(400);
    check('refused while figures are keyed against it, and nothing is written',
      [f.dialogs.some(x => /still has figures/.test(x)), await f.page.evaluate(() => window.__CONFIG.length),
       ((await sheetOf(f.page)).sections[1] || {}).off],
      [true, 0, false]);
    await f.page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
