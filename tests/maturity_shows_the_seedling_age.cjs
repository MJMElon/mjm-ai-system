/* Monthly Maturity Allocation: the seedlings' AGE, small, under each
   Maturity Date. The office: "pls show up the age of the seedlings based
   on the batch. Show below their maturity date (?? Months). no need too
   big." The age is as at today, off the batch seed-in date (the KEYED
   transaction_date of Seeds_Received, created_at only where nothing was
   keyed, newest row wins), counted in whole months the Batch Record way
   (days / 30.44). A batch with no seed-in row carries no age.

   Harness copied from maturity_plotr_tab.cjs; the rows are on Plot-R.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/maturity_shows_the_seedling_age.cjs
   with `python3 -m http.server 8777` serving the repository root.        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }
function checkFalse(name, got) { check(name, !!got, false); }

const CULL3_TRANSFER_ROWS = [
  { batch_name: '242', plot_name: 'U12-R', breed_name: 'DxP', quantity_change: 300, transaction_date: '2026-09-01', created_at: '2026-09-01T02:00:00Z', remark: 'From: [U12|B/F] To: [U12-R]' },
  { batch_name: '242', plot_name: 'U12-R', breed_name: 'DxP', quantity_change: 200, transaction_date: '2026-09-02', created_at: '2026-09-02T02:00:00Z', remark: 'From: [U12|B/F] To: [U12-R]' },
  { batch_name: '256', plot_name: 'U13-R', breed_name: 'DxP', quantity_change: 100, transaction_date: '2026-08-10', created_at: '2026-08-10T02:00:00Z', remark: 'From: [U13|B/F] To: [U13-R]' },
  { batch_name: '260', plot_name: 'U14-R', breed_name: 'DxP', quantity_change: 80,  transaction_date: '2026-09-20', created_at: '2026-09-20T02:00:00Z', remark: 'From: [U14|B/F] To: [U14-R]' },
  { batch_name: '258', plot_name: 'U21-R', breed_name: 'DxP', quantity_change: 60,  transaction_date: '2026-09-18', created_at: '2026-09-18T02:00:00Z', remark: 'From: [U21|B/F] To: [U21-R]' },
  { batch_name: '270', plot_name: 'U20',   breed_name: 'DxP', quantity_change: 40,  transaction_date: '2026-09-15', created_at: '2026-09-15T02:00:00Z', remark: 'From: [U19|B/F] To: [U20]' },
];
const CULL3_ROWS = [
  { batch_name: '242', plot_name: 'U12-R', quantity_change: 50, remark: 'P-R Culling. MapQty: 50 CullDate:2026-09-25' },
  { batch_name: '260', plot_name: 'U14-R', quantity_change: 80, remark: 'P-R Culling. MapQty: 80 CullDate:2026-09-26' },
  { batch_name: '258', plot_name: 'U21-R', quantity_change: 60, remark: 'P-R Culling. CullDate:2026-09-27' },
];
const ROW_VER_ROWS = [
  { batch_name: '242', plot_name: 'cull_3::U12-R|reserve', quantity_change: 0, remark: 'Row verified' },
];
const TAB_VER_ROWS = [
  { batch_name: '260', stage: 'cull_3' },
];
const DO_ROWS = [
  { do_number: 'DO-1', total_qty: 150, status: 'Delivered', remark: '', plot_1: 'U12-R', qty_1: 150, batch_1: '242' },
  { do_number: 'DO-2', total_qty: 100, status: 'Delivered', remark: '', plot_1: 'U13-R', qty_1: 100, batch_1: '256' },
];
const PLOTS = [
  { plot_name: 'U12-R', nursery_name: 'UNN 1' },
  { plot_name: 'U13-R', nursery_name: 'UNN 1' },
  { plot_name: 'U14-R', nursery_name: 'UNN 1' },
  { plot_name: 'U21-R', nursery_name: 'UNN 1' },
  { plot_name: 'U20',   nursery_name: 'UNN 2' },
];

// Batch 242 was seeded 300 days ago (keyed), with a newer reception row
// whose created_at alone must not win over a keyed date; batch 258 has no
// seed-in row at all, so its row carries no age rather than a guess.
const DAY = 86400000;
const iso = (d) => new Date(Date.now() - d * DAY).toISOString().slice(0, 10);
const SEEDS = [
  { batch_name: '242', breed_name: 'DxP', transaction_date: iso(400), created_at: new Date(Date.now() - 400 * DAY).toISOString() },
  { batch_name: '242', breed_name: 'DxP', transaction_date: iso(300), created_at: new Date(Date.now() - 2 * DAY).toISOString() },
  { batch_name: '270', breed_name: 'DxP', transaction_date: null, created_at: new Date(Date.now() - 40 * DAY).toISOString() },
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));

  await page.addInitScript(({ cull3Transfer, cull3, rowVer, tabVer, doRows, plots, seeds }) => {
    function makeQuery(table) {
      const st = { filters: {}, type: null };
      const rows = () => {
        if (table === 'shared_inventory_logs') {
          if (st.filters.transaction_type === 'Cull3_Transfer') return cull3Transfer;
          if (st.filters.transaction_type === '3rd_Culling') return cull3;
          if (st.filters.transaction_type === 'Row_Verification') return rowVer;
          if (st.filters.transaction_type === 'Transplanted') return [];
          if (st.filters.transaction_type === 'Seeds_Received') return seeds;
          return [];
        }
        if (table === 'operation_batch_verifications') return tabVer;
        if (table === 'shared_plots') return plots;
        if (table === 'shared_plot_allocations') return [];
        if (table === 'shared_do_records') return doRows;
        return [];
      };
      const q = new Proxy({}, {
        get(_, p) {
          if (p === 'then') return (a, b) => Promise.resolve({ data: rows(), error: null }).then(a, b);
          if (p === 'select' || p === 'order' || p === 'in') return () => q;
          if (p === 'eq') return (c, v) => { st.filters[c] = v; return q; };
          return () => q;
        }
      });
      return q;
    }
    window.supabase = { createClient: () => ({
      from: (t) => makeQuery(t),
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1', email: 'coco@mjmnursery.com' } }, error: null }),
        getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'coco@mjmnursery.com' } } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      storage: { from: () => ({ upload: async () => ({ data: {}, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, { cull3Transfer: CULL3_TRANSFER_ROWS, cull3: CULL3_ROWS, rowVer: ROW_VER_ROWS, tabVer: TAB_VER_ROWS, doRows: DO_ROWS, plots: PLOTS, seeds: SEEDS });

  await page.route('**/shared_access.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user')   return () => ({ id: 'u1', email: 'coco@mjmnursery.com', full_name: 'Coco Lau' });
      if (k === 'load')   return async () => true;
      if (k === 'perms' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'canOpenOperationPage') return () => true;
      if (k === 'then')   return undefined;
      return () => true;
    } });`
  }));
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/cdn.jsdelivr.net/**',    r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**',     r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/operation/operation_stock_sales.html', { waitUntil: 'load' });
  // Waited on a function every page version has (the old boot waited on
  // toggleMatHistory, which the History split took with it when it went).
  await page.waitForFunction(() => typeof window.toggleMatStatusMenu === 'function', { timeout: 15000 });
  await page.waitForTimeout(600);

  await page.click('button.month-tab:has-text("Plot-R")');
  await page.waitForTimeout(300);
  const ageOf = async (plot) => page.evaluate((p) => {
    const tr = [...document.querySelectorAll('#maturity-rows tr[data-batch-key]')].find(t => t.getAttribute('data-plot-name') === p);
    if (!tr) return 'no such row';
    const a = tr.cells[0].querySelector('.mat-age');
    return a ? a.textContent.trim() : '';
  }, plot);

  console.log('\nThe age sits under the Maturity Date, off the batch seed-in date');
  check('U12-R (batch 242, keyed 300 days ago, newest row) reads its age',
    await ageOf('U12-R'), '(' + Math.floor(300 / 30.44) + ' Months)');
  check('U20 (batch 270, no keyed date) falls back to created_at',
    await ageOf('U20'), '(' + Math.floor(40 / 30.44) + ' Month)');
  check('U21-R (batch 258, no seed-in row) carries no age', await ageOf('U21-R'), '');
  const size = await page.evaluate(() => {
    const a = document.querySelector('#maturity-rows .mat-age');
    return a ? parseFloat(getComputedStyle(a).fontSize) : 0;
  });
  checkTrue('the age is small (no more than 10px)', size > 0 && size <= 10);
  checkTrue('the date itself is still the first thing in the cell', await page.evaluate(() => {
    const tr = document.querySelector('#maturity-rows tr[data-plot-name="U12-R"]');
    return tr && /^\d{2} \w{3} \d{4}/.test(tr.cells[0].textContent.trim());
  }));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
