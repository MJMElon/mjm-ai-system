/* THE PERIOD CHOOSES WHICH BATCHES, NEVER WHICH PLANTING.

   Batch 268 arrived on 22 Jun 2026 and was planted after June ended. The
   Seed In Report for June listed it -- by its arrival day -- and then cut
   the ledger at 30 Jun before counting, so its planting and its damage
   were in no figure: Seed Accounted 0, Variance minus 10,700, while the
   batch page, which cuts nothing, read 10,709 accounted.

   So the report lists by arrival and counts the batch whole. Driven
   through the REAL page with 268 shape and a batch that arrived in July,
   which must still be left out of a June report.

   Needs a server on the repository root:
     (python3 -m http.server 8812 &)
     node tests/seed_in_counts_planting_after_the_period.cjs */
const { chromium } = require('playwright');

(async () => {
const B = 'http://127.0.0.1:8812';
let bad = 0;
const is = (g, w, what) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a !== b) { console.log('  FAIL', what, '\n        got ', a, '\n        want', b); bad++; }
  else console.log('  ok  ', what, '→', a);
};

let id = 0;
const log = (o) => Object.assign({ id: ++id, plot_name: 'Pre-Nursery', quantity_change: 0, remark: '',
  created_at: (o.transaction_date || '2026-06-01') + 'T00:00:00Z' }, o);

const LOGS = [
  // 268: arrived in June, planted and damaged in JULY -- the office case.
  log({ batch_name: '268', breed_name: 'UPB PREMIER HYBRID', transaction_type: 'Seeds_Received',
        transaction_date: '2026-06-22', quantity_change: 10700,
        remark: 'Seeds received. Supplier: TUNAS SERVICES ENTERPRISE. MPOB: 508134-619000. DO_Qty: 10000. FOC_Pct: 7.' }),
  log({ batch_name: '268', transaction_type: 'Planted', transaction_date: '2026-07-03', plot_name: 'P5', quantity_change: 10591 }),
  log({ batch_name: '268', transaction_type: 'Damaged_Seeds', transaction_date: '2026-07-03', quantity_change: 118 }),
  // 269: arrived and planted in June -- was right before, must stay right.
  log({ batch_name: '269', breed_name: 'AA Hybrida 1S', transaction_type: 'Seeds_Received',
        transaction_date: '2026-06-22', quantity_change: 10500,
        remark: 'Seeds received. Supplier: APPLIED AGRICULTURAL RESOURCES SDN. BHD.. MPOB: 549080-021000. DO_Qty: 10000. FOC_Pct: 5.' }),
  log({ batch_name: '269', transaction_type: 'Planted', transaction_date: '2026-06-25', plot_name: 'P6', quantity_change: 10347 }),
  log({ batch_name: '269', transaction_type: 'Damaged_Seeds', transaction_date: '2026-06-25', quantity_change: 153 }),
  // 290: arrived in JULY -- no business on a June report at all.
  log({ batch_name: '290', breed_name: 'AA Hybrida 1S', transaction_type: 'Seeds_Received',
        transaction_date: '2026-07-10', quantity_change: 5000,
        remark: 'Seeds received. Supplier: APPLIED AGRICULTURAL RESOURCES SDN. BHD.. MPOB: 549080-021000. DO_Qty: 5000.' }),
];

const DATA = {
  shared_inventory_logs: LOGS,
  shared_plots: [], operation_trays: [{ tray_name: 'P5', nursery_name: 'PN' }, { tray_name: 'P6', nursery_name: 'PN' }],
  shared_breeds: [{ name: 'UPB PREMIER HYBRID' }, { name: 'AA Hybrida 1S' }],
  shared_do_records: [], operation_batch_verifications: [],
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
page.on('pageerror', e => { errs.push(e.message); console.log('  [err]', e.message.slice(0, 220)); });
await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ body: '', contentType: 'text/javascript' }));
await page.route('**/@supabase/supabase-js**', r => r.fulfill({ contentType: 'text/javascript',
  body: 'window.supabase={createClient:()=>window.__stub};' }));
await page.route('**/shared/shared_access.js', r => r.fulfill({ contentType: 'text/javascript',
  body: `window.MJMAccess={load:async()=>{},user:()=>({email:'t@t'}),canAccess:()=>true,
    canOpenOperationPage:()=>true,canDoOperation:()=>true,canOpenPage:()=>true,canDo:()=>true};` }));
await page.addInitScript((data) => {
  const q = (table) => {
    let rows = (data[table] || []).slice();
    const w = {
      select: () => w, order: () => w, like: () => w, not: () => w, limit: () => w,
      in: (col, vals) => { rows = rows.filter(r => vals.indexOf(r[col]) >= 0); return w; },
      eq: (col, val) => { rows = rows.filter(r => String(r[col] == null ? '' : r[col]) === String(val)); return w; },
      range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (ok, no) => Promise.resolve({ data: rows, error: null }).then(ok, no)
    };
    return w;
  };
  window.__stub = { from: q, rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: { user: { email: 't@t' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}, DATA);

await page.goto(B + '/operation/operation_reports.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  document.getElementById('f-from').value = '2026-06-01';
  document.getElementById('f-to').value = '2026-06-30';
  const br = document.getElementById('f-breed'); if (br) br.value = '';
  window.selectedNurseries = () => [];
  return runSeedInReport();
});
await page.waitForTimeout(1500);

const rows = await page.evaluate(() => (window._losData && window._losData.rows || [])
  .map(r => ({ batch: r.batch, planted: r.planted, damaged: r.damaged, variance: r.variance })));
const of = (b) => rows.find(r => String(r.batch) === b) || null;

console.log('\n── A June report ──');
is(errs.length, 0, 'no page errors');
is(rows.map(r => String(r.batch)).sort(), ['268', '269'], 'lists the two batches that ARRIVED in June, not the July one');
is(of('268') && of('268').planted + of('268').damaged, 10709,
   '268 Seed Accounted is its whole planting and damage, planted in July or not');
is(of('268') && of('268').variance, 9, '268 Variance is +9, not minus its whole delivery');
is(of('269') && of('269').planted + of('269').damaged, 10500, '269, planted inside June, is unchanged');
const txt = await page.evaluate(() => document.getElementById('report-output').textContent);
is(/10,709/.test(txt), true, 'the table on screen prints 10,709 for 268');
is(/−10,700/.test(txt), false, 'and no longer prints −10,700 anywhere');

await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
})();
