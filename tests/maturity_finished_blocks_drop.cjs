/* A row marked Finished on the Monthly Maturity Allocation table must stop
   accepting a dragged customer card or allocation chip — even while its
   balance is still above zero, which is the ordinary case: Finished is a
   person's manual judgment, not the automatic Sold Out the balance already
   gates on its own.

   Fixture: three plots all maturing this month —
     U_OPEN   / batch 701 — qty 1000, no status picked (defaults to Open),
       nothing allocated yet.
     U_FIN    / batch 702 — qty 1000, plot_status 'finished' in
       shared_plot_allocations, nothing allocated yet.
     U_SRC    / batch 703 — qty 1000, an existing allocation chip (order
       ORD-1, 200 pcs) sitting on it already, to be dragged elsewhere.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/maturity_finished_blocks_drop.cjs
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

// Nine months before "now", so the +9-month maturity offset lands the
// row on the current-month tab, which is what the page opens on by
// default — no tab click needed to see it.
const nineAgo = (() => { const d = new Date(); d.setMonth(d.getMonth() - 9); d.setDate(1); return d.toISOString().slice(0, 10); })();

const TRANS_ROWS = [
  { batch_name: '701', plot_name: 'U_OPEN', breed_name: 'DxP', quantity_change: 1000, transaction_date: nineAgo, created_at: nineAgo + 'T02:00:00Z', remark: '' },
  { batch_name: '702', plot_name: 'U_FIN',  breed_name: 'DxP', quantity_change: 1000, transaction_date: nineAgo, created_at: nineAgo + 'T02:00:00Z', remark: '' },
  { batch_name: '703', plot_name: 'U_SRC',  breed_name: 'DxP', quantity_change: 1000, transaction_date: nineAgo, created_at: nineAgo + 'T02:00:00Z', remark: '' },
];
const PLOT_ALLOCATIONS = [
  { batch_name: '702', plot_name: 'U_FIN', plot_status: 'finished', reserved_for: '', reserved_qty: 0, premium: false },
];
const BATCH_ALLOCATIONS = [
  { id: 'a1', batch_name: '703', plot_name: 'U_SRC', order_id: 'o1', order_number: 'ORD-1', customer_name: 'ACME SDN BHD', allocated_qty: 200 },
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));

  await page.addInitScript(({ trans, plotAllocs, batchAllocs }) => {
    function makeQuery(table) {
      const st = { filters: {} };
      const rows = () => {
        if (table === 'shared_inventory_logs') return trans;
        if (table === 'shared_plots') return [];
        if (table === 'shared_plot_allocations') return plotAllocs;
        if (table === 'shared_do_records') return [];
        if (table === 'shared_batch_customer_allocations') return batchAllocs;
        if (table === 'salesweb_customer_orders') return [];
        if (table === 'salesweb_order_items') return [];
        if (table === 'salesweb_order_collections') return [];
        if (table === 'shared_collection_bookings') return [];
        if (table === 'shared_al_orders') return [];
        return [];
      };
      const q = new Proxy({}, {
        get(_, p) {
          if (p === 'then') return (a, b) => Promise.resolve({ data: rows(), error: null }).then(a, b);
          if (p === 'range') return () => Promise.resolve({ data: rows(), error: null });
          if (p === 'select' || p === 'order' || p === 'in' || p === 'gte') return () => q;
          if (p === 'eq') return (c, v) => { st.filters[c] = v; return q; };
          if (p === 'update') return () => q;
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
  }, { trans: TRANS_ROWS, plotAllocs: PLOT_ALLOCATIONS, batchAllocs: BATCH_ALLOCATIONS });

  await page.route('**/shared_access.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user')   return () => ({ id: 'u1', email: 'coco@mjmnursery.com', full_name: 'Coco Lau' });
      if (k === 'load')   return async () => true;
      if (k === 'perms' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'canOpenOperationPage') return () => true;
      if (k === 'requireOperationAction') return () => true;
      if (k === 'then')   return undefined;
      return () => true;
    } });`
  }));
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/cdn.jsdelivr.net/**',    r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**',     r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/operation/operation_stock_sales.html', { waitUntil: 'load' });
  await page.waitForSelector('#maturity-rows tr[data-batch-key]', { timeout: 15000 });

  console.log('\nThe finished row renders locked');
  const finRow = page.locator('tr[data-batch-key="702||U_FIN"]');
  await finRow.waitFor();
  check('data-mat-status is "finished"', await finRow.getAttribute('data-mat-status'), 'finished');
  checkTrue('balance is still positive (not Sold Out)', (parseInt(await finRow.getAttribute('data-batch-balance'), 10)) > 0);
  checkTrue('placeholder reads the locked message', (await finRow.textContent()).includes('Finished — no new allocations'));

  console.log('\nDragging the existing chip off U_SRC');
  const chip = page.locator('.reserv-chip[data-alloc-id="a1"]');
  await chip.waitFor();

  const dragResult = await page.evaluate(() => {
    function fire(el, type, dt) {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      el.dispatchEvent(ev);
      return ev;
    }
    const chipEl   = document.querySelector('.reserv-chip[data-alloc-id="a1"]');
    const finRowEl = document.querySelector('tr[data-batch-key="702||U_FIN"]');
    const openRowEl = document.querySelector('tr[data-batch-key="701||U_OPEN"]');
    const dt1 = new DataTransfer();
    fire(chipEl, 'dragstart', dt1);
    const overEv = fire(finRowEl, 'dragover', dt1);
    const finClassesAfterStart = finRowEl.className;
    const openClassesAfterStart = openRowEl.className;
    fire(finRowEl, 'drop', dt1);
    fire(chipEl, 'dragend', dt1);
    return {
      overDefaultPrevented: overEv.defaultPrevented,
      finClassesAfterStart,
      openClassesAfterStart,
    };
  });

  checkTrue('drop-disabled was applied to the finished row on dragstart', dragResult.finClassesAfterStart.includes('drop-disabled'));
  checkFalse('drop-target was NOT applied to the finished row', dragResult.finClassesAfterStart.includes('drop-target'));
  checkTrue('the open row got drop-target instead', dragResult.openClassesAfterStart.includes('drop-target'));
  checkFalse('dragover over the finished row was not accepted (no preventDefault)', dragResult.overDefaultPrevented);

  await page.waitForTimeout(150);
  checkTrue('the chip is still on U_SRC — the drop onto Finished did nothing',
    await page.locator('tr[data-batch-key="703||U_SRC"] .reserv-chip[data-alloc-id="a1"]').count() > 0);
  check('U_FIN still shows the locked placeholder, not the chip', await finRow.textContent().then(t => t.includes('Finished — no new allocations')), true);

  console.log('\nDragging the same chip onto the OPEN row still works (no regression)');
  await page.evaluate(() => {
    function fire(el, type, dt) {
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
    const chipEl    = document.querySelector('.reserv-chip[data-alloc-id="a1"]');
    const openRowEl = document.querySelector('tr[data-batch-key="701||U_OPEN"]');
    const dt2 = new DataTransfer();
    fire(chipEl, 'dragstart', dt2);
    fire(openRowEl, 'dragover', dt2);
    fire(openRowEl, 'drop', dt2);
    fire(chipEl, 'dragend', dt2);
  });
  await page.waitForTimeout(250);
  checkTrue('the chip moved onto U_OPEN',
    await page.locator('tr[data-batch-key="701||U_OPEN"] .reserv-chip[data-alloc-id="a1"]').count() > 0);
  checkFalse('the chip left U_SRC',
    await page.locator('tr[data-batch-key="703||U_SRC"] .reserv-chip[data-alloc-id="a1"]').count() > 0);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
