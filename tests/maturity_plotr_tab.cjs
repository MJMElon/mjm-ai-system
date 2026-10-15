/* Plot-R: Qty Transferred (not Qty Transplanted), no 10%-culling estimate,
   DO Deducted reads as Sold (the Movement report's own figure) while Plot
   Balance still nets off what was culled or moved on separately, a plot
   already at/under zero balance is History (collapsed, latest first), and
   a transfer that did NOT land on a "-R"-named plot is not on this tab at
   all.

   Fixture:
     U12-R / batch 242 — Cull3_Transfer 300 + 200 (qty transferred 500),
       a DO for 150 (sold), a 3rd_Culling of 50 (culled).
       Balance = 500 - 150 - 50 = 300 → Live.
     U13-R / batch 256 — Cull3_Transfer 100 on 10 Aug, a DO for the full 100.
       Balance = 0 → History.
     U14-R / batch 260 — Cull3_Transfer 80 on 20 Sep (LATER than U13-R), a
       DO for the full 80. Balance = 0 → History, and dated after U13-R —
       History must read U14-R above U13-R (latest first).
     U20 (no "-R") / batch 270 — Cull3_Transfer 40, no DO. Balance = 40,
       would be Live by the numbers alone, but it is not a reserve plot by
       name and must not appear on this tab anywhere.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/maturity_plotr_tab.cjs
   with `python3 -m http.server 8777` serving the repository root.        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

const CULL3_TRANSFER_ROWS = [
  { batch_name: '242', plot_name: 'U12-R', breed_name: 'DxP', quantity_change: 300, transaction_date: '2026-09-01', created_at: '2026-09-01T02:00:00Z', remark: 'From: [U12|B/F] To: [U12-R]' },
  { batch_name: '242', plot_name: 'U12-R', breed_name: 'DxP', quantity_change: 200, transaction_date: '2026-09-02', created_at: '2026-09-02T02:00:00Z', remark: 'From: [U12|B/F] To: [U12-R]' },
  { batch_name: '256', plot_name: 'U13-R', breed_name: 'DxP', quantity_change: 100, transaction_date: '2026-08-10', created_at: '2026-08-10T02:00:00Z', remark: 'From: [U13|B/F] To: [U13-R]' },
  { batch_name: '260', plot_name: 'U14-R', breed_name: 'DxP', quantity_change: 80,  transaction_date: '2026-09-20', created_at: '2026-09-20T02:00:00Z', remark: 'From: [U14|B/F] To: [U14-R]' },
  { batch_name: '270', plot_name: 'U20',   breed_name: 'DxP', quantity_change: 40,  transaction_date: '2026-09-15', created_at: '2026-09-15T02:00:00Z', remark: 'From: [U20|B/F] To: [U20]' },
];
const CULL3_ROWS = [
  { batch_name: '242', plot_name: 'U12-R', quantity_change: 50 },
];
const DO_ROWS = [
  { do_number: 'DO-1', total_qty: 150, status: 'Delivered', remark: '', plot_1: 'U12-R', qty_1: 150, batch_1: '242' },
  { do_number: 'DO-2', total_qty: 100, status: 'Delivered', remark: '', plot_1: 'U13-R', qty_1: 100, batch_1: '256' },
  { do_number: 'DO-3', total_qty: 80,  status: 'Delivered', remark: '', plot_1: 'U14-R', qty_1: 80,  batch_1: '260' },
];
const PLOTS = [
  { plot_name: 'U12-R', nursery_name: 'UNN 1' },
  { plot_name: 'U13-R', nursery_name: 'UNN 1' },
  { plot_name: 'U14-R', nursery_name: 'UNN 1' },
  { plot_name: 'U20',   nursery_name: 'UNN 2' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));

  await page.addInitScript(({ cull3Transfer, cull3, doRows, plots }) => {
    function makeQuery(table) {
      const st = { filters: {}, type: null };
      const rows = () => {
        if (table === 'shared_inventory_logs') {
          if (st.filters.transaction_type === 'Cull3_Transfer') return cull3Transfer;
          if (st.filters.transaction_type === '3rd_Culling') return cull3;
          if (st.filters.transaction_type === 'Transplanted') return [];
          return [];
        }
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
  }, { cull3Transfer: CULL3_TRANSFER_ROWS, cull3: CULL3_ROWS, doRows: DO_ROWS, plots: PLOTS });

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
  await page.waitForFunction(() => typeof window.toggleMatHistory === 'function', { timeout: 15000 });
  await page.waitForTimeout(500);

  console.log('\nOn a normal month tab, nothing changes');
  checkTrue('Qty Transplanted header shows (not yet on Plot-R)',
    /Qty Transplanted/.test(await page.textContent('#mat-th-qty')));
  checkTrue('After 10% Culling column is visible',
    await page.locator('.col-afterc').first().isVisible());

  console.log('\nSwitching to Plot-R');
  await page.click('button.month-tab:has-text("Plot-R")');
  await page.waitForTimeout(300);
  checkTrue('header becomes Qty Transferred',
    /Qty Transferred/.test(await page.textContent('#mat-th-qty')));
  checkTrue('After 10% Culling column is hidden',
    !(await page.locator('.col-afterc').first().isVisible()));

  const bodyText = await page.locator('#maturity-rows').innerText();

  console.log('\nU12-R (still has balance) is in the Live section');
  checkTrue('U12-R row is visible without expanding anything', bodyText.includes('U12-R'));
  const liveRow = page.locator('tr[data-plot-name="U12-R"]');
  check('Qty Transferred (col-prod num, 1st) reads 500 (300+200)',
    (await liveRow.locator('td.col-prod.num').first().innerText()).trim(), '500');
  check('DO Deducted reads 150 — Sold only, not +50 culled',
    (await liveRow.locator('td.col-plot.num').first().innerText()).trim(), '150');
  check('Plot Balance reads 300 — 500 minus sold 150 minus culled 50',
    (await liveRow.locator('td.col-plot.num.font-black').first().innerText()).trim(), '300');
  checkTrue('DO Deducted cell explains the culled/moved-out split on hover',
    /Sold 150.*Culled\/moved out 50/.test(await liveRow.locator('td.col-plot.num').first().getAttribute('title') || ''));

  console.log('\nU13-R (fully sold, balance 0) is in History, collapsed');
  checkTrue('U13-R is not visible before expanding', !bodyText.includes('U13-R'));
  checkTrue('a History toggle row is shown', await page.locator('.mat-history-toggle').count());
  const historyRowsBefore = await page.locator('.mat-history-row.mat-history-open').count();
  check('history rows start collapsed', historyRowsBefore, 0);

  await page.click('.mat-history-toggle');
  await page.waitForTimeout(200);
  const afterExpand = await page.locator('#maturity-rows').innerText();
  checkTrue('U13-R appears once History is expanded', afterExpand.includes('U13-R'));
  checkTrue('U14-R appears too (also fully sold)', afterExpand.includes('U14-R'));
  const historyRow = page.locator('tr[data-plot-name="U13-R"]');
  check('U13-R Plot Balance reads 0', (await historyRow.locator('td.col-plot.num.font-black').first().innerText()).trim(), '0');

  console.log('\nHistory reads latest first');
  const historyPlotOrder = await page.locator('.mat-history-row').evaluateAll(
    rows => rows.map(r => r.getAttribute('data-plot-name'))
  );
  check('U14-R (20 Sep) comes before U13-R (10 Aug)', historyPlotOrder, ['U14-R', 'U13-R']);

  console.log('\nU20 — a Cull3_Transfer that did not land on a "-R" plot — is not on this tab at all');
  checkTrue('not in the visible (Live) rows', !afterExpand.includes('U20'));
  check('no row for it anywhere, Live or History', await page.locator('#maturity-rows tr[data-plot-name="U20"]').count(), 0);

  await page.click('.mat-history-toggle');
  await page.waitForTimeout(200);
  check('collapses again on a second click', await page.locator('.mat-history-row.mat-history-open').count(), 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  await page.screenshot({ path: '/tmp/claude-0/-home-user/b45e245b-bb91-52f3-b756-1ec7cbcd3ede/scratchpad/maturity_plotr_test.png', fullPage: true });
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
