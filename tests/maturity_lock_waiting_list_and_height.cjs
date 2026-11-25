/* Seedling Sales Control: the office asked, in one message, for
     1. a LOCK on a Monthly Maturity Allocation row, so its customer
        reservation cannot be changed until it is unlocked;
     2. sold out / culled rows at the FOOT, open / pending on top;
     3. a WAITING LIST & PO card to key pending demand into;
     4. the Allocate Orders button movable;
     5. the Capacity Heatmap and the maturity table swapped round;
     6. on the Inventory Map, each batch's LATEST seedling height and its
        audit date, and a filter (150 cm and above) naming the plot and batch.

   Drives the REAL page with a stubbed database that RECORDS every write.
   Run: node tests/maturity_lock_waiting_list_and_height.cjs
   with `python3 -m http.server 8777` serving the repository root.        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const yes = (n, v) => check(n, !!v, true);
const no  = (n, v) => check(n, !!v, false);

const nineAgo = (() => { const d = new Date(); d.setMonth(d.getMonth() - 9); d.setDate(1); return d.toISOString().slice(0, 10); })();
const T = (b, p, q) => ({ batch_name: b, plot_name: p, breed_name: 'DxP', quantity_change: q, transaction_date: nineAgo, created_at: nineAgo + 'T02:00:00Z', remark: '' });
// Sorted by plot inside the month, so the status split is what moves the rows.
const TRANS = [T('701', 'U1', 1000), T('702', 'U2', 1000), T('703', 'U3', 1000), T('704', 'U4', 100), T('705', 'U5', 1000)];
const PLOT_ALLOC = [
  { batch_name: '702', plot_name: 'U2', plot_status: 'finished' },
  { batch_name: '703', plot_name: 'U3', plot_status: 'open', locked: true, locked_by: 'coco@mjmnursery.com', locked_at: '2026-11-20T03:00:00Z' },
];
const BCA = [
  { id: 'a1', batch_name: '703', plot_name: 'U3', order_number: 'ORD-1', customer_name: 'LOCKED CO', allocated_qty: 200 },
  { id: 'a2', batch_name: '705', plot_name: 'U5', order_number: 'ORD-2', customer_name: 'FREE CO', allocated_qty: 100 },
];
const DOS = [{ do_number: 'D1', total_qty: 100, status: 'Issued', remark: '', plot_1: 'U4', batch_1: '704', qty_1: 100 }];
const ym = (() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 7); })();
const WAIT = [
  { id: 1, entry_date: '2026-11-01', customer_name: 'EARLY SDN BHD', po_number: 'PO-1', breed: 'DxP', qty: 500, wanted_month: ym, status: 'waiting' },
  { id: 2, entry_date: '2026-11-02', customer_name: 'GONE SDN BHD', qty: 50, wanted_month: ym, status: 'cancelled' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  await page.addInitScript(({ TRANS, PLOT_ALLOC, BCA, DOS, WAIT }) => {
    window.__writes = [];
    const data = {
      shared_inventory_logs: TRANS, shared_plot_allocations: PLOT_ALLOC, shared_batch_customer_allocations: BCA,
      shared_do_records: DOS, shared_stock_waiting_list: WAIT,
    };
    function q(table) {
      let write = null;
      const res = () => {
        if (write) {
          window.__writes.push({ table, ...write });
          if (write.op === 'insert') return { data: { id: 99, ...write.row }, error: null };
          return { data: null, error: null };
        }
        return { data: data[table] || [], error: null };
      };
      const p = new Proxy({}, { get(_, k) {
        if (k === 'then') return (a, b) => Promise.resolve(res()).then(a, b);
        if (k === 'range') return () => Promise.resolve(res());
        if (k === 'single' || k === 'maybeSingle') return () => Promise.resolve(res());
        if (k === 'upsert') return (row) => { write = { op: 'upsert', row }; return p; };
        if (k === 'insert') return (row) => { write = { op: 'insert', row }; return p; };
        if (k === 'update') return (row) => { write = { op: 'update', row }; return p; };
        if (k === 'delete') return () => { write = { op: 'delete' }; return p; };
        if (k === 'eq') return (c, v) => { if (write) write.eq = [c, v]; return p; };
        return () => p;
      } });
      return p;
    }
    window.supabase = { createClient: () => ({
      from: q, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1', email: 'coco@mjmnursery.com' } }, error: null }),
        getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'coco@mjmnursery.com' } } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      storage: { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {},
    }) };
  }, { TRANS, PLOT_ALLOC, BCA, DOS, WAIT });

  await page.route('**/shared_access.js', r => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id: 'u1', email: 'coco@mjmnursery.com' });
      if (k === 'load') return async () => true;
      if (k === 'then') return undefined;
      return () => true; } });` }));
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/operation/operation_stock_sales.html', { waitUntil: 'load' });
  await page.evaluate(() => switchSsmTab('stock'));
  await page.waitForSelector('#maturity-rows tr[data-batch-key]', { timeout: 15000 });
  await page.waitForTimeout(400);

  console.log('\n1. The maturity table comes before the waiting list, which comes before the heatmap');
  const order = await page.evaluate(() => {
    const pos = el => el ? el.getBoundingClientRect().top + scrollY : null;
    return [pos(document.querySelector('.mat-table')), pos(document.getElementById('wait-card')), pos(document.getElementById('heatmap-area'))];
  });
  yes('maturity table is above the waiting list', order[0] != null && order[1] != null && order[0] < order[1]);
  yes('waiting list is above the heatmap', order[1] != null && order[2] != null && order[1] < order[2]);

  console.log('\n2. Open and pending on top, sold out / culled / closed at the foot');
  const seq = await page.$$eval('#maturity-rows tr', trs => trs.map(t =>
    t.classList.contains('mat-done-divider') ? '|' : (t.dataset.batchKey || '').split('||')[1] || '?'));
  check('row order (live, divider, done)', seq, ['U1', 'U3', 'U5', '|', 'U2', 'U4']);
  check('U4 reads Sold Out', await page.getAttribute('tr[data-batch-key="704||U4"]', 'data-mat-status'), 'sold_out');

  console.log('\n3. A locked row keeps its customers');
  const locked = 'tr[data-batch-key="703||U3"]';
  check('locked row is marked', await page.getAttribute(locked, 'data-mat-locked'), '1');
  check('its chip is not draggable', await page.getAttribute(locked + ' .reserv-chip', 'draggable'), 'false');
  check('its chip has no remove cross', await page.locator(locked + ' .reserv-chip-x').count(), 0);
  yes('it says who locked it', /Coco|coco/.test(await page.textContent(locked + ' .mat-lock-who')));
  check('an unlocked row keeps its cross', await page.locator('tr[data-batch-key="705||U5"] .reserv-chip-x').count(), 1);
  const gate = await page.evaluate(async () => {
    const before = batchAllocations.length;
    await removeAllocation('a1');
    await moveAllocationToBatch('a1', '701', 'U1', 100);
    const a1 = batchAllocations.find(a => a.id === 'a1');
    return { kept: batchAllocations.length === before, stillU3: a1 && a1.plot_name === 'U3' };
  });
  yes('removeAllocation refuses a locked row (called from the console)', gate.kept);
  yes('moveAllocationToBatch refuses a locked row', gate.stillU3);
  const dropRefused = await page.evaluate(() => {
    const chip = document.querySelector('.reserv-chip[data-alloc-id="a2"]');
    const row = document.querySelector('tr[data-batch-key="703||U3"]');
    const dt = new DataTransfer();
    chip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const ev = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    row.dispatchEvent(ev);
    chip.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    return !ev.defaultPrevented;
  });
  yes('a chip cannot be dropped onto a locked row', dropRefused);

  console.log('\n4. Lock and unlock write the row');
  await page.click('tr[data-batch-key="701||U1"] .mat-lock-btn');
  await page.waitForTimeout(200);
  let w = await page.evaluate(() => window.__writes.filter(x => x.table === 'shared_plot_allocations'));
  check('locking U1 upserts locked=true', w.length && { b: w[0].row.batch_name, p: w[0].row.plot_name, l: w[0].row.locked, by: w[0].row.locked_by }, { b: '701', p: 'U1', l: true, by: 'coco@mjmnursery.com' });
  check('U1 now reads locked', await page.getAttribute('tr[data-batch-key="701||U1"]', 'data-mat-locked'), '1');
  await page.click(locked + ' .mat-lock-btn');
  await page.waitForTimeout(200);
  w = await page.evaluate(() => window.__writes.filter(x => x.table === 'shared_plot_allocations'));
  check('unlocking U3 upserts locked=false and clears who', w[1] && { l: w[1].row.locked, by: w[1].row.locked_by }, { l: false, by: null });
  check('U3 offers its cross again', await page.locator(locked + ' .reserv-chip-x').count(), 1);
  check('the culled/sold out row offers no lock', await page.locator('tr[data-batch-key="704||U4"] .mat-lock-btn').count(), 0);

  console.log('\n5. Waiting List & PO');
  check('opens on Waiting: one record', await page.locator('#wait-rows tr[data-wait-id]').count(), 1);
  check('the count tabs', await page.$$eval('.wait-tab-n', e => e.map(x => x.textContent)), ['1', '0', '1']);
  yes('the month strip totals what is waiting', /1 waiting · 500/.test(await page.textContent('#wait-month-strip')));
  await page.click('#wait-add-btn');
  await page.fill('#wf-customer', 'NEW PLANTATION');
  await page.fill('#wf-po', 'PO-77');
  await page.fill('#wf-qty', '2500');
  await page.fill('#wf-month', ym);
  await page.click('#wf-save');
  await page.waitForTimeout(200);
  w = await page.evaluate(() => window.__writes.filter(x => x.table === 'shared_stock_waiting_list'));
  check('Save inserts the record as Waiting', w[0] && { op: w[0].op, c: w[0].row.customer_name, q: w[0].row.qty, s: w[0].row.status, po: w[0].row.po_number },
    { op: 'insert', c: 'NEW PLANTATION', q: 2500, s: 'waiting', po: 'PO-77' });
  check('two waiting now', await page.locator('#wait-rows tr[data-wait-id]').count(), 2);
  yes('the foot totals them', /3,000/.test(await page.textContent('#wait-foot')));
  await page.click('#wait-add-btn');
  await page.click('#wf-save');
  yes('no customer is refused, saying why', /customer/i.test(await page.textContent('#wf-msg')));
  await page.click('.wait-form .wait-btn:not(.wait-btn-primary)');
  // The page's select skin hides the native one, so set it the way the skin does.
  await page.$eval('tr[data-wait-id="1"] select.wait-status', el => { el.value = 'allocated'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(200);
  w = await page.evaluate(() => window.__writes.filter(x => x.table === 'shared_stock_waiting_list'));
  check('changing the status updates that record', w[w.length - 1] && { op: w[w.length - 1].op, s: w[w.length - 1].row.status, eq: w[w.length - 1].eq }, { op: 'update', s: 'allocated', eq: ['id', '1'] });
  check('it leaves the Waiting tab', await page.locator('#wait-rows tr[data-wait-id="1"]').count(), 0);

  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });

  console.log('\n6. The Allocate Orders button moves, and a move is not a click');
  const fab = await page.locator('#alloc-fab').boundingBox();
  await page.mouse.move(fab.x + 20, fab.y + 10);
  await page.mouse.down();
  await page.mouse.move(fab.x - 300, fab.y - 200, { steps: 8 });
  await page.mouse.up();
  const after = await page.locator('#alloc-fab').boundingBox();
  yes('it moved', Math.abs(after.x - fab.x) > 200 && Math.abs(after.y - fab.y) > 100);
  no('the drag did not open the drawer', await page.evaluate(() => document.getElementById('alloc-drawer').classList.contains('open')));
  yes('the place is kept', await page.evaluate(() => !!localStorage.getItem('mjm_alloc_fab_pos')));
  await page.click('#alloc-fab');
  yes('a plain click still opens the drawer', await page.evaluate(() => document.getElementById('alloc-drawer').classList.contains('open')));

  console.log('\n7. Inventory Map: latest height, its date, and the filter');
  await page.evaluate(() => { document.getElementById('ssm-pane-map').classList.remove('hidden'); });
  const hv = await page.evaluate(() => {
    _invmap.nurseries = [{ name: 'UNN1' }];
    _invmap.plots = [{ plot_name: 'U1', nursery_name: 'UNN1' }, { plot_name: 'B5', nursery_name: 'UNN1' }];
    _invmap.plotBatches = {
      U1: [{ batch: '254', breed: 'A', full: 100, collected: 0, balance: 100 }, { batch: '260', breed: 'A', full: 50, collected: 0, balance: 50 }],
      B5: [{ batch: '270', breed: 'A', full: 80, collected: 0, balance: 80 }],
    };
    _invmap.heights = _buildInvmapHeights([
      { plot: 'U01', batch: '254', date: '2026-10-01', sample_1: '100' },
      { plot: 'U01', batch: '254', date: '2026-11-20', sample_1: '150', sample_2: '160', sample_3: '155' },
      { plot: 'B05', batch: '270', date: '2026-11-20', sample_1: '120' },
    ]);
    _invmap.active = 'all';
    renderInvmapSidebar();
    const before = document.getElementById('invmap-side-body').textContent;
    setInvmapMinHeight(150);
    const pairs = visiblePlotBatchPairs().map(p => p.plot + '|' + p.batch);
    const after = document.getElementById('invmap-side-body').textContent;
    const note = document.getElementById('invmap-height-note').textContent;
    const chip = document.querySelector('.invmap-hchip[data-hmin="150"]').classList.contains('active');
    setInvmapMinHeight(null);
    return { before, pairs, after, note, chip, back: visiblePlotBatchPairs().length };
  });
  yes('the sidebar shows the LATEST height (155 cm, not the October 100)', /155 cm/.test(hv.before) && !/100 cm/.test(hv.before));
  yes('and the audit date', /20 Nov 2026/.test(hv.before));
  yes('a batch never measured reads as a dash', /—/.test(hv.before));
  check('150 cm and above names the plot and batch', hv.pairs, ['U1|254']);
  yes('the 150 chip is lit', hv.chip);
  yes('the note says how many and where', /1 batch in 1 plot at 150 cm/.test(hv.note));
  no('the 120 cm batch is not in it', /#270/.test(hv.after));
  check('clearing the filter brings every batch back', hv.back, 3);

  check('no page errors', errors, []);
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
