/* MONTHLY PERFORMANCE LINKS THE SCHEDULE AGAINST THE RECORD, AND PRINTS.
 *
 * The office refined the table in four sentences: do not copy their
 * spreadsheet — link the WORK SCHEDULE (how many rounds a plot was
 * programmed, capacity × rounds) against the WORK RECORD (rounds actually
 * done and the recorded quantities) and come out with the variance; take
 * the capacity STRAIGHT FROM SETTINGS and drop the Alive column; make
 * Remarks an editable box of their own; and give it a print icon.
 *
 * So, per plot per job:
 *   Program rounds = the month rows autoSyncRecords generated off the
 *                    schedule (they carry _src); Program qty = Settings
 *                    capacity × those rounds.
 *   Actual rounds  = rows carrying work of their own (a keyed qty, a
 *                    frozen figure, or the Checked tick); Actual qty =
 *                    Σ recQty over them. A hand-added row counts in
 *                    Actual and never in Program.
 *   Variance       = actual − program, red short, green over.
 * Remarks live in nops_maint_perf_remarks (one per plot per month per
 * nursery, saved as typed); before the SQL is run the boxes are
 * read-only and the hint names the file. The printer draws the SAME
 * builder into an iframe, remarks as text — one builder, two outputs.
 *
 * Drives the REAL page in a real browser.
 * Run: node tests/monthly_performance_table.cjs
 * with a static server on port 8777 serving the repository root.
 */
const { chromium } = require(require('fs').existsSync('/opt/node-tools/node_modules/playwright')
  ? '/opt/node-tools/node_modules/playwright' : 'playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (n, g) => check(n, !!g, true);
const checkFalse = (n, g) => check(n, !!g, false);

const DB = {
  /* Capacity comes from SETTINGS — the ledger is deliberately EMPTY, so a
     figure in the Capacity column can only have come from here. */
  nops_maint_plot_qty: [
    { nursery: 'BNN', plot: 'B1', qty: 2300 },
    { nursery: 'BNN', plot: 'B2', qty: 500 }
  ],
  nops_maint_perf_remarks: [
    { id: 1, nursery: 'BNN', month: 'Aug 2026', plot: 'B1', remark: 'Collecting plot' }
  ],
  shared_inventory_logs: [],
  shared_do_records: [],
  nops_maint_records: [{ id: 1, records: [] }]
};

/* Injected AFTER boot — autoSyncRecords rebuilds the on-screen month from
   the schedule state, and a fixture row seeded in the database would be
   swept by it (a _src row whose tick the schedule has not got goes).
     B1 manuring : programmed twice, done once (keyed 599)
     B1 interrow : programmed once, Checked with 1,800 frozen
     B1 P&D      : a HAND-ADDED done row (keyed 0) — Actual, never Program
     B1 weeding  : programmed once, done with keyed 2,500 — OVER program
     B2 manuring : programmed once, untouched — a round owed, none done */
const RECORDS = [
  { id: 'p1', plot: 'B1', jenis: 'Membaja', _src: 'mn|0|0|B1', tarikh: '2026-08-05', qty: 599, remark: '', _month: 'Aug 2026' },
  { id: 'p2', plot: 'B1', jenis: 'Membaja', _src: 'mn|1|0|B1', tarikh: '-', qty: null, remark: '', _month: 'Aug 2026' },
  { id: 'p3', plot: 'B1', jenis: 'Meracun rumput secara selingan', _src: 'ir|0|0|B1', tarikh: '2026-08-07', qty: null, checked: 1, qtyFrozen: 1800, _month: 'Aug 2026' },
  { id: 'p4', plot: 'B1', jenis: 'Penyemburan racun kulat dan serangga', tarikh: '2026-08-09', qty: 0, remark: '', _month: 'Aug 2026' },
  { id: 'p5', plot: 'B1', jenis: 'Merumput', _src: 'wd|R1|B1', tarikh: '2026-08-12', qty: 2500, remark: '', _month: 'Aug 2026' },
  { id: 'p6', plot: 'B2', jenis: 'Membaja', _src: 'mn|0|0|B2', tarikh: '-', qty: null, remark: '', _month: 'Aug 2026' }
];

async function boot(browser, missing) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.dismiss());
  await page.addInitScript(({ seed, miss }) => {
    window.__DB = JSON.parse(JSON.stringify(seed));
    window.__DB.__MISSING = miss || [];
    window.__WRITES = [];
    window.Chart = class { constructor() { window.__CHARTS = (window.__CHARTS || 0) + 1; } update() {} destroy() {} resize() {} };
    try {
      localStorage.setItem('mjm_maint_nursery', 'BNN');
      localStorage.setItem('mjm_maint_month', 'Aug 2026');
      localStorage.removeItem('mjm_maint_perfview');
    } catch (_) {}
    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select' };
      const tbl = () => (window.__DB[table] || (window.__DB[table] = []));
      const match = (r) => st.eqs.every(([c, v]) => String(r[c]) === String(v));
      const run = () => {
        if ((window.__DB.__MISSING || []).includes(table))
          return { data: null, error: { message: 'relation "' + table + '" does not exist' } };
        if (st.op === 'delete') { window.__DB[table] = tbl().filter(r => !match(r)); return { data: [], error: null }; }
        const o = tbl().filter(match);
        return st.single ? { data: o[0] || null, error: null } : { data: o, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'delete') return () => { st.op = 'delete'; return q; };
        if (p === 'upsert') return (row, opts) => {
          if ((window.__DB.__MISSING || []).includes(table))
            return Promise.resolve({ data: null, error: { message: 'relation "' + table + '" does not exist' } });
          window.__WRITES.push(['upsert', table, row, opts || null]);
          return Promise.resolve({ data: [row], error: null });
        };
        if (p === 'insert' || p === 'update') return (row) => {
          window.__WRITES.push([p, table, row]); return Promise.resolve({ data: [], error: null });
        };
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'o@m.t' };
    window.supabase = { createClient: () => ({
      from: makeQuery, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      storage: { from: () => ({ upload: async () => ({ data: {}, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
    const Real = Date;
    const FIXED = new Real('2026-10-22T04:00:00');
    // eslint-disable-next-line no-global-assign
    Date = class extends Real {
      constructor(...a) { if (a.length) { super(...a); } else { super(FIXED.getTime()); } }
      static now() { return FIXED.getTime(); }
    };
  }, { seed: DB, miss: missing });
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'o@m.t', full_name:'J' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**', '**/cdn.tailwindcss.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html', { waitUntil: 'load' });
  return { page, errs };
}

const rowCells = (plot) => `(() => {
  const tr = [...document.querySelectorAll('.perf-table tbody tr')]
    .find(r => r.cells[0].textContent.trim() === '${plot}');
  return tr ? [...tr.cells].map(c => c.classList.contains('pf-remark')
    ? (c.querySelector('textarea') ? c.querySelector('textarea').value : c.textContent.trim())
    : c.textContent.trim()) : null;
})()`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, errs } = await boot(browser, []);
  const hasPerf = await page.waitForFunction(() => typeof window.printPerfTable === 'function', { timeout: 15000 })
    .then(() => true).catch(() => false);
  check('the page carries the linked table and its print (printPerfTable exists)', hasPerf, true);
  if (!hasPerf) { console.log(`\n${pass} passed, ${fail + 20} failed (cannot drive the rest)`); await browser.close(); process.exit(1); }

  // Wait for the database boot (the Settings capacities land with it),
  // then hand the page the month's records and open the table.
  await page.waitForFunction(() => typeof capacityOf === 'function' && capacityOf('BNN', 'B1') === 2300, { timeout: 15000 });
  await page.evaluate((recs) => {
    records.length = 0;
    recs.forEach(r => records.push(r));
    switchRecordView('chart');
  }, RECORDS);
  await page.waitForFunction(() => /Summary of Work Done/.test((document.getElementById('perf-table-wrap') || {}).innerHTML || ''), { timeout: 15000 });
  await page.waitForTimeout(300); // the remarks read lands and redraws

  console.log('\nCapacity is the SETTINGS figure — the ledger here is empty, so it can come from nowhere else');
  const b1 = await page.evaluate(rowCells('B1'));
  checkTrue('B1 has a row', !!b1);
  check('B1 Capacity reads 2,300 off the Plot Capacity grid', b1 && b1[1], '2,300');
  checkFalse('and there is no Alive column anywhere',
    await page.evaluate(() => /Alive/i.test(document.querySelector('.perf-table thead').textContent)));

  console.log('\nProgram is the WORK SCHEDULE, Actual is the WORK RECORD, variance between them');
  // Columns: 0 plot, 1 cap, then per job [progR, progQ, actR, actQ, var]:
  // manuring 2..6, pd 7..11, weeding 12..16, interrow 17..21, remarks 22.
  check('B1 manuring: programmed 2 rounds (4,600), 1 done for 599 — variance −4,001',
    b1 && b1.slice(2, 7), ['2', '4,600', '1', '599', '-4,001']);
  check('B1 P&D: a HAND-ADDED done row is Actual and never Program (0 programmed, 1 done)',
    b1 && b1.slice(7, 12), ['0', '0', '1', '0', '0']);
  check('B1 weeding: done 2,500 against a 2,300 program — variance +200',
    b1 && b1.slice(12, 17), ['1', '2,300', '1', '2,500', '200']);
  check('B1 interrow: the Checked frozen 1,800 is the recorded figure',
    b1 && b1.slice(17, 22), ['1', '2,300', '1', '1,800', '-500']);
  const b2 = await page.evaluate(rowCells('B2'));
  check('B2: programmed once and untouched — a round owed, none done, variance −500',
    b2 && b2.slice(0, 7), ['B2', '500', '1', '500', '0', '0', '-500']);

  console.log('\nShort is red, over is green, a nought is neither');
  const cls = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('.perf-table tbody tr')].find(r => r.cells[0].textContent.trim() === 'B1');
    return { manuring: tr.cells[6].className, weeding: tr.cells[16].className, pd: tr.cells[11].className };
  });
  checkTrue('manuring −4,001 carries pf-neg', /pf-neg/.test(cls.manuring));
  checkTrue('weeding +200 carries pf-pos', /pf-pos/.test(cls.weeding));
  checkTrue('P&D 0 carries neither', /pf-zero/.test(cls.pd));

  console.log('\nThe foot adds the columns up');
  // The capacity total also carries the other BNN plots' built-in default
  // capacities (the Settings grid's fallback, same as the live page), so
  // the exact figure asserted is the job columns' own arithmetic.
  const foot = await page.evaluate(() => [...document.querySelectorAll('.perf-table tfoot td')].map(c => c.textContent.trim()));
  check('manuring totals: programmed 3 rounds / 5,100, done 1 / 599, variance −4,501',
    [foot[2], foot[3], foot[4], foot[5], foot[6]], ['3', '5,100', '1', '599', '-4,501']);
  checkTrue('and the capacity total is a figure, not a blank', /^\d/.test(foot[1]));

  console.log('\nRemarks are the office\'s own box, loaded and saved per plot');
  check('B1 opens holding the saved remark', b1 && b1[22], 'Collecting plot');
  checkTrue('and the box is editable',
    await page.evaluate(() => !document.querySelector('.pf-remark-box[data-plot="B1"]').disabled));
  await page.evaluate(() => {
    const box = document.querySelector('.pf-remark-box[data-plot="B2"]');
    box.value = 'New transplant plot';
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(1000); // past the save debounce
  const write = await page.evaluate(() => (window.__WRITES || []).find(w => w[0] === 'upsert' && w[1] === 'nops_maint_perf_remarks'));
  checkTrue('typing saves an upsert to nops_maint_perf_remarks', !!write);
  check('keyed one remark per plot per month per nursery',
    write && [write[2].nursery, write[2].month, write[2].plot, write[2].remark, (write[3] || {}).onConflict],
    ['BNN', 'Aug 2026', 'B2', 'New transplant plot', 'nursery,month,plot']);

  console.log('\nThe printer draws the SAME builder into a sheet of its own');
  await page.click('#perf-print');
  await page.waitForTimeout(400);
  const printed = await page.evaluate(() => {
    const f = [...document.querySelectorAll('iframe')].pop();
    return f ? (f.getAttribute('srcdoc') || '') : '';
  });
  checkTrue('a print frame carries the table', /Summary of Work Done/.test(printed) && /perf-table/.test(printed));
  checkTrue('the remark prints as TEXT, not a box', /Collecting plot/.test(printed) && !/<textarea/i.test(printed));
  checkTrue('and the figures are the screen\'s own', /4,600/.test(printed) && /-4,001/.test(printed));

  check('no page errors', errs, []);
  await page.close();

  console.log('\nBefore the SQL is run, the boxes refuse rather than losing what is typed');
  const m2 = await boot(browser, ['nops_maint_perf_remarks']);
  await m2.page.waitForFunction(() => typeof window.printPerfTable === 'function', { timeout: 15000 });
  await m2.page.evaluate(() => switchRecordView('chart'));
  await m2.page.waitForFunction(() => /Summary of Work Done/.test((document.getElementById('perf-table-wrap') || {}).innerHTML || ''), { timeout: 15000 });
  await m2.page.waitForTimeout(400);
  checkTrue('the hint names the file to run',
    await m2.page.evaluate(() => /RUN_ME_monthly_performance_remarks\.sql/.test((document.querySelector('.perf-hint') || {}).textContent || '')));
  checkTrue('and every remark box is read-only',
    await m2.page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.pf-remark-box')];
      return boxes.length > 0 && boxes.every(b => b.disabled);
    }));
  await m2.page.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
