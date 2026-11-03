/* Plot-R: Qty Transferred (not Qty Transplanted), no 10%-culling estimate,
   DO Deducted reads as Sold, and the rows behave EXACTLY like a month
   tab's — the office: "Check why Plot-R no data. Plot-R history data must
   be same with the normal tab. If the batch report for that transfer data
   has been keyed in the drone amount or being verified for the line in
   the part of 3rd culling, the monthly maturity allocation line will
   become Culled."

   The finished rows live under a HISTORY line — the office: "Make a line
   for History data. All sold out or culled status will be flow to the
   history part. The history part make it expandable and collapse, data
   from the latest to oldest." The split is on the STATUS, never the raw
   balance: an earlier shape split on the balance, which also hid a
   culling still waiting on its gate, and once every transfer plot netted
   out the tab opened on "no data". So a plot whose own 3rd culling is
   drone-keyed AND verified reads 0 with the locked CULLED pill and sits
   in History; a plot sold out reads SOLD OUT and sits in History; a
   culling missing the drone qty or the signature leaves the balance
   standing in the LIVE list with the hover saying what it waits for —
   the month tab's own gate, asked of this tab too. And EVERY
   Cull3_Transfer destination is on it, "-R"-named or not (the one
   exception — a destination where the same batch already has a month row
   — is held by tests/a_transfer_reads_culled_and_flows_to_plot_r.cjs).

   Fixture:
     U12-R / 242 — 300+200 in (500), DO 150, culled 50 WITH MapQty and the
       row signed → the gated 50 deducts: balance 300, still live.
     U13-R / 256 — 100 in, DO 100 → 0, locked SOLD OUT, shown inline.
     U14-R / 260 — 80 in, culled 80 WITH MapQty, whole tab signed → 0,
       locked CULLED, shown inline.
     U21-R / 258 — 60 in, culled 60 with NO MapQty → not counted: balance
       60, hover says what the 60 waits for.
     U20 (no "-R") / 270 — 40 in from U19, nothing out → 40, live: the
       transfer is the rule, not the name.

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

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));

  await page.addInitScript(({ cull3Transfer, cull3, rowVer, tabVer, doRows, plots }) => {
    function makeQuery(table) {
      const st = { filters: {}, type: null };
      const rows = () => {
        if (table === 'shared_inventory_logs') {
          if (st.filters.transaction_type === 'Cull3_Transfer') return cull3Transfer;
          if (st.filters.transaction_type === '3rd_Culling') return cull3;
          if (st.filters.transaction_type === 'Row_Verification') return rowVer;
          if (st.filters.transaction_type === 'Transplanted') return [];
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
  }, { cull3Transfer: CULL3_TRANSFER_ROWS, cull3: CULL3_ROWS, rowVer: ROW_VER_ROWS, tabVer: TAB_VER_ROWS, doRows: DO_ROWS, plots: PLOTS });

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

  console.log('\nThe live list holds what still needs acting on; Sold Out and Culled flow to History');
  const plotsShown = await page.locator('#maturity-rows tr[data-batch-key]').evaluateAll(
    rows => rows.filter(r => r.offsetParent !== null).map(r => r.getAttribute('data-plot-name')).sort());
  check('the three live rows are on screen', plotsShown, ['U12-R', 'U20', 'U21-R']);
  checkTrue('a History line is shown', await page.locator('.mat-history-toggle').count() > 0);
  checkTrue('it names what it holds — Sold Out or Culled',
    /Sold Out or Culled/i.test(await page.locator('.mat-history-toggle').innerText()));
  check('history rows start collapsed', await page.locator('.mat-history-row.mat-history-open').count(), 0);

  await page.click('.mat-history-toggle');
  await page.waitForTimeout(200);
  const historyOrder = await page.locator('.mat-history-row').evaluateAll(
    rows => rows.map(r => r.getAttribute('data-plot-name')));
  check('expanded, the finished plots appear latest first — U14-R (20 Sep) above U13-R (10 Aug)',
    historyOrder, ['U14-R', 'U13-R']);

  console.log('\nU12-R — a GATED culling deducts and the rest stays live');
  const liveRow = page.locator('tr[data-plot-name="U12-R"]');
  check('Qty Transferred (col-prod num, 1st) reads 500 (300+200)',
    (await liveRow.locator('td.col-prod.num').first().innerText()).trim(), '500');
  check('DO Deducted reads 150 — Sold only',
    (await liveRow.locator('td.col-plot.num').first().innerText()).trim(), '150');
  check('Plot Balance reads 300 — 500 minus sold 150 minus the gated 50 culled',
    (await liveRow.locator('td.col-plot.num.font-black').first().innerText()).trim(), '300');
  checkTrue('its status dropdown is still live (not locked)',
    await liveRow.locator('.mat-status-wrap').count() > 0);
  checkTrue('the balance hover says the 50 came off',
    /3rd culling of 50/.test(await liveRow.locator('td.col-plot.num.font-black').first().getAttribute('title') || ''));

  console.log('\nU14-R — drone qty keyed AND the tab signed: the line becomes CULLED, in History');
  const culledRow = page.locator('tr[data-plot-name="U14-R"]');
  checkTrue('it is a History row', await culledRow.evaluate(tr => tr.classList.contains('mat-history-row')));
  check('data-mat-status is culled', await culledRow.getAttribute('data-mat-status'), 'culled');
  check('Plot Balance reads 0', (await culledRow.locator('td.col-plot.num.font-black').first().innerText()).trim(), '0');
  checkFalse('and the pill is locked — no dropdown', await culledRow.locator('.mat-status-wrap').count() > 0);
  checkTrue('the hover says fully culled',
    /fully culled/.test(await culledRow.locator('td.col-plot.num.font-black').first().getAttribute('title') || ''));

  console.log('\nU21-R — a culling with NO drone qty moves nothing, and says why');
  const pendRow = page.locator('tr[data-plot-name="U21-R"]');
  check('its balance still reads 60', (await pendRow.locator('td.col-plot.num.font-black').first().innerText()).trim(), '60');
  checkTrue('status is not culled', (await pendRow.getAttribute('data-mat-status')) !== 'culled');
  checkTrue('the hover names what the 60 is waiting for',
    /keyed but NOT counted/.test(await pendRow.locator('td.col-plot.num.font-black').first().getAttribute('title') || ''));

  console.log('\nU13-R — fully sold reads SOLD OUT, in History');
  const soldRow = page.locator('tr[data-plot-name="U13-R"]');
  check('data-mat-status is sold_out', await soldRow.getAttribute('data-mat-status'), 'sold_out');
  check('Plot Balance reads 0', (await soldRow.locator('td.col-plot.num.font-black').first().innerText()).trim(), '0');
  checkFalse('locked — no dropdown', await soldRow.locator('.mat-status-wrap').count() > 0);
  checkTrue('it is a History row too', await soldRow.evaluate(tr => tr.classList.contains('mat-history-row')));

  console.log('\nU20 — a Cull3_Transfer onto an ORDINARY plot flows to this tab too');
  const u20Row = page.locator('tr[data-plot-name="U20"]');
  check('its Qty Transferred reads 40', (await u20Row.locator('td.col-prod.num').first().innerText()).trim(), '40');
  check('and Plot Balance is Transfer data − DO Deducted: 40 − 0',
    (await u20Row.locator('td.col-plot.num.font-black').first().innerText()).trim(), '40');

  console.log('\nThe foot sums the LIVE rows — History is reference, not stock to place');
  const foot = await page.locator('#maturity-foot td').allInnerTexts();
  checkTrue('Qty Transferred totals 600 (500+60+40)', foot.some(t => t.trim() === '600'));
  checkTrue('Plot Balance totals 400 (300+60+40)', foot.some(t => t.trim() === '400'));

  console.log('\nThe four menu choices read Pending / Open / Leftover / Closed');
  const menuText = await liveRow.locator('.mat-status-menu').innerText();
  checkTrue('Pending is offered (stored no_status)', /Pending/.test(menuText));
  checkTrue('Leftover is offered (stored sisa)', /Leftover/.test(menuText));
  checkTrue('Closed is offered (stored finished)', /Closed/.test(menuText));
  checkFalse('the old words No Status / Sisa / Finished are gone', /No Status|Sisa|Finished/.test(menuText));

  console.log('\nHistory collapses again');
  await page.click('.mat-history-toggle');
  await page.waitForTimeout(200);
  check('a second click hides the finished rows', await page.locator('.mat-history-row.mat-history-open').count(), 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
