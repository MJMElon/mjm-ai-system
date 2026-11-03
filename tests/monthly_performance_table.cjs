/* MONTHLY PERFORMANCE IS TWO SELECTABLE VIEWS, AND THE TABLE IS THE SHEET.
 *
 * The office: rename the Work Record "Performance" tab to "Monthly
 * Performance", and give the page two selectable views — Table and Chart —
 * where the Table is their own monthly summary sheet ("Summary of work done
 * ... (Scheduled Maintenance Programme)"): a row per plot with Full
 * Capacity and Alive off the batch ledger, then the four jobs each carrying
 * Program, the rounds done, the recorded figure (their heading: "Plot
 * Capacity x No.of Rounds") and the Variance in red, and the records'
 * remarks on the right.
 *
 * The arithmetic under test, each the sheet's own rule:
 *   - Alive is the plot's linked quantity with the 2nd culling off; Full
 *     keeps it in (interrow counts the ground, not the seedlings — the B5
 *     rule). Interrow's Program uses Full, every other job uses Alive.
 *   - A ROUND is a record carrying work of its own — a keyed quantity
 *     (nought included), a frozen figure, or the Checked tick. A row the
 *     schedule generated and nobody filled is NOT a round, and the gaia
 *     flag is NOT the test (October has 539 records and no gaia tick at
 *     all, so a gaia-gated table would read as a month nobody worked).
 *   - Program = base × rounds done; recorded = Σ recQty (keyed, else
 *     frozen, else the link); Variance = recorded − program, red when it
 *     is not nought.
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

/* Ledger: B1 planted 2,000 and 2nd-culled 100 → Full 2,000 / Alive 1,900.
   B2 planted 500, untouched → 500 / 500. */
const DB = {
  shared_inventory_logs: [
    { id: 1, transaction_type: 'Transplanted', plot_name: 'B1', batch_name: '250', quantity_change: 2000, transaction_date: '2026-01-10', created_at: '2026-01-10T02:00:00Z', remark: '' },
    { id: 2, transaction_type: '2nd_Culling',  plot_name: 'B1', batch_name: '250', quantity_change: 100,  transaction_date: '2026-05-01', created_at: '2026-05-01T02:00:00Z', remark: '' },
    { id: 3, transaction_type: 'Transplanted', plot_name: 'B2', batch_name: '251', quantity_change: 500,  transaction_date: '2026-01-12', created_at: '2026-01-12T02:00:00Z', remark: '' }
  ],
  shared_do_records: [],
  /* August records, hand-shaped (no slot), so the month sync leaves them:
     - B1 manuring: keyed 599 → a round; remark rides to the Remarks column.
     - B1 P&D: keyed 0 — a nought somebody typed is an answer and a round.
     - B1 interrow: no keyed qty, Checked with the figure frozen at 1,800.
     - B2 manuring: generated-and-untouched — no qty, no tick: NOT a round. */
  nops_maint_records: [{ id: 1, records: [
    { id: 'r1', plot: 'B1', jenis: 'Membaja', tarikh: '2026-08-05', qty: 599, remark: 'Partial work', _month: 'Aug 2026' },
    { id: 'r2', plot: 'B1', jenis: 'Meracun rumput secara selingan', tarikh: '2026-08-07', qty: null, checked: 1, qtyFrozen: 1800, _month: 'Aug 2026' },
    { id: 'r3', plot: 'B1', jenis: 'Penyemburan racun kulat dan serangga', tarikh: '2026-08-09', qty: 0, remark: '', _month: 'Aug 2026' },
    { id: 'r4', plot: 'B2', jenis: 'Membaja', tarikh: '2026-08-11', qty: null, remark: '', _month: 'Aug 2026' }
  ] }],
  shared_plots: [
    { plot_name: 'B1', nursery_name: 'BNN' }, { plot_name: 'B2', nursery_name: 'BNN' }
  ]
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.dismiss());
  await page.addInitScript((seed) => {
    window.__DB = seed;
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
        if (p === 'upsert' || p === 'insert' || p === 'update') return () => Promise.resolve({ data: [], error: null });
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
  }, DB);
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
  const hasPerf = await page.waitForFunction(() => typeof window.switchPerfView === 'function', { timeout: 15000 })
    .then(() => true).catch(() => false);
  check('the page carries the two-view Monthly Performance (switchPerfView exists)', hasPerf, true);
  if (!hasPerf) { console.log(`\n${pass} passed, ${fail + 12} failed (cannot drive the rest)`); await browser.close(); process.exit(1); }

  console.log('\nThe tab is called Monthly Performance — the key did not move');
  check('the side bar sub-tab reads Monthly Performance',
    (await page.locator('#pn-subtab-chart').textContent()).trim(), 'Monthly Performance');

  console.log('\nOpening it lands on the TABLE view');
  await page.evaluate(() => switchRecordView('chart'));
  await page.waitForFunction(() => (document.getElementById('perf-table-wrap') || {}).innerHTML !== '', { timeout: 15000 });
  checkTrue('the Table button is the active one', await page.locator('#perf-view-table.active').count() > 0);
  checkTrue('the charts are hidden behind it',
    await page.evaluate(() => document.getElementById('perf-charts').style.display === 'none'));
  const head = await page.locator('.perf-head').innerText();
  checkTrue('the title is the sheet\'s own — "Summary of work done in BNN ..."',
    /Summary of work done in BNN/.test(head) && /Scheduled Maintenance Programme/.test(head));
  checkTrue('and the month is written out — August 2026', /August 2026/.test(head));

  console.log('\nB1 — the sheet\'s arithmetic, figure by figure');
  const b1 = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('.perf-table tbody tr')].find(r => r.cells[0].textContent.trim() === 'B1');
    return tr ? [...tr.cells].map(c => c.textContent.trim()) : null;
  });
  checkTrue('B1 has a row', !!b1);
  check('Full Capacity 2,000 and Alive 1,900 — the 2nd culling off Alive only', b1 && b1.slice(1, 3), ['2,000', '1,900']);
  check('Manuring: program 1,900 (alive × 1 round), 1 round, recorded 599, variance −1,301',
    b1 && b1.slice(3, 7), ['1,900', '1', '599', '-1,301']);
  check('P&D: a keyed NOUGHT is a round — program 1,900, recorded 0, variance −1,900',
    b1 && b1.slice(7, 11), ['1,900', '1', '0', '-1,900']);
  check('Weeding: nothing done reads 0 across', b1 && b1.slice(11, 15), ['0', '0', '0', '0']);
  check('Interrow: program is FULL capacity × 1, the frozen 1,800 is the recorded figure',
    b1 && b1.slice(15, 19), ['2,000', '1', '1,800', '-200']);
  check('and the record\'s remark rides to the Remarks column', b1 && b1[19], 'Partial work');

  console.log('\nB2 — a generated row nobody filled is NOT a round');
  const b2 = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('.perf-table tbody tr')].find(r => r.cells[0].textContent.trim() === 'B2');
    return tr ? [...tr.cells].map(c => c.textContent.trim()) : null;
  });
  check('B2 manuring reads 0 rounds and program 0 over a live plot of 500',
    b2 && [b2[1], b2[2], b2[3], b2[4], b2[5]], ['500', '500', '0', '0', '0']);

  console.log('\nThe foot adds the columns up');
  const foot = await page.evaluate(() => [...document.querySelectorAll('.perf-table tfoot td')].map(c => c.textContent.trim()));
  check('Total Full 2,000+500 and Alive 1,900+500', foot.slice(1, 3), ['2,500', '2,400']);
  check('Total manuring: program 1,900, recorded 599, variance −1,301',
    [foot[3], foot[5], foot[6]], ['1,900', '599', '-1,301']);

  console.log('\nA variance that is not nought is RED, a nought is not');
  const varCls = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('.perf-table tbody tr')].find(r => r.cells[0].textContent.trim() === 'B1');
    return { manuring: tr.cells[6].className, weeding: tr.cells[14].className };
  });
  checkTrue('B1 manuring variance carries pf-var', /pf-var/.test(varCls.manuring));
  checkTrue('B1 weeding variance (0) does not', !/pf-var/.test(varCls.weeding));

  console.log('\nChart view is one press away, and the choice is remembered');
  await page.evaluate(() => switchPerfView('chart'));
  await page.waitForTimeout(200);
  checkTrue('the charts show', await page.evaluate(() => document.getElementById('perf-charts').style.display !== 'none'));
  checkTrue('the table hides', await page.evaluate(() => document.getElementById('perf-table-wrap').style.display === 'none'));
  checkTrue('the charts actually drew', await page.evaluate(() => (window.__CHARTS || 0) > 0));
  check('the choice is remembered per machine',
    await page.evaluate(() => localStorage.getItem('mjm_maint_perfview')), 'chart');
  await page.evaluate(() => switchPerfView('table'));
  await page.waitForTimeout(100);
  checkTrue('and back to the table on a press', await page.evaluate(() => document.getElementById('perf-charts').style.display === 'none'));

  check('no page errors', errs, []);

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
