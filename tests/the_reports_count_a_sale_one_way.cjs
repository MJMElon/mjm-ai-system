/* FOUR MIS-LINKS IN THE OPERATION REPORTS, each a figure that disagreed with
   another screen reading the same thing:

   1. The Sales CHART read shared_do_records in ONE request. The database
      answers at most 1,000 rows and says nothing, so the DOs it lost were
      the NEWEST -- the latest year read low. It pages now.
   2. The Chart added up total_qty, the Table the line quantities, so one
      report showed one month two ways. Both read _doSaleLines() now.
   3. A sale straight out of a TRAY read Unassigned on the Sales Listing and
      fell off the moment a nursery chip was ticked, PN included. It is PN.
   4. The Culling Report placed a 2nd/3rd culling plot letter for letter,
      so "N 11" read Unassigned. It matches on the plot key now.

   The stub's plain read CAPS AT 1,000 the way Supabase does, and only a
   ranged read can get past it -- a stub that hands everything back to a
   single request would pass an unpaged report.

   Needs a server on the repository root:
     (python3 -m http.server 8812 &)
     node tests/the_reports_count_a_sale_one_way.cjs */
const { chromium } = require('playwright');

(async () => {
const B = 'http://127.0.0.1:8812';
let bad = 0;
const is = (g, w, what) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a !== b) { console.log('  FAIL', what, '\n        got ', a, '\n        want', b); bad++; }
  else console.log('  ok  ', what, '→', a);
};

const DOS = [];
// 1,200 one-seedling DOs in Nov 2026 -- past the 1,000 cap.
for (let i = 1; i <= 1200; i++) DOS.push({ id: i, do_number: 'D' + i, delivery_date: '2026-11-05',
  total_qty: 1, status: 'Delivered', remark: '', plot_1: 'B4', qty_1: 1, batch_1: '270' });
// A three-line DO whose lines come to 2,800 under a total_qty of 3,000, in Oct.
DOS.push({ id: 5001, do_number: 'M1', delivery_date: '2026-10-05', total_qty: 3000, status: 'Delivered', remark: 'Cust A',
  plot_1: 'B4', qty_1: 1000, batch_1: '270', plot_2: 'B5', qty_2: 1000, batch_2: '270', plot_3: 'B6', qty_3: 800, batch_3: '270' });
// A sale out of TRAY P30, in Oct.
DOS.push({ id: 5002, do_number: 'T1', delivery_date: '2026-10-06', total_qty: 400, status: 'Delivered', remark: 'Cust B',
  plot_1: 'P30', qty_1: 400, batch_1: '230' });

const LOGS = [
  { id: 1, batch_name: '250', transaction_type: '2nd_Culling', transaction_date: '2026-10-10',
    created_at: '2026-10-10T00:00:00Z', plot_name: 'N 11', quantity_change: 37, remark: 'CullDate: 2026-10-10' },
];

const DATA = {
  shared_do_records: DOS, shared_inventory_logs: LOGS, shared_al_orders: [],
  shared_plots: [{ plot_name: 'B4', nursery_name: 'BNN' }, { plot_name: 'B5', nursery_name: 'BNN' },
                 { plot_name: 'B6', nursery_name: 'BNN' }, { plot_name: 'N11', nursery_name: 'UNN 2' }],
  operation_trays: [{ tray_name: 'P30', nursery_name: 'PN' }],
  shared_breeds: [], operation_batch_verifications: [],
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
      select: () => w, order: () => w, like: () => w, not: () => w, limit: () => w, gte: () => w, lte: () => w,
      in: (col, vals) => { rows = rows.filter(r => vals.indexOf(r[col]) >= 0); return w; },
      eq: (col, val) => { rows = rows.filter(r => String(r[col] == null ? '' : r[col]) === String(val)); return w; },
      range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      // The database's own cap: an unranged read answers 1,000 rows and stops.
      then: (ok, no) => Promise.resolve({ data: rows.slice(0, 1000), error: null }).then(ok, no)
    };
    return w;
  };
  window.__stub = { from: q, rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: { user: { email: 't@t' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}, DATA);

await page.goto(B + '/operation/operation_reports.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

console.log('\n── 1 & 2. The Chart pages, and counts a DO the way the Table does ──');
const chart = await page.evaluate(async () => {
  window._selectedYears = () => [2026];
  await runSeedlingSales();
  return document.getElementById('report-output').textContent;
});
is(/1,200/.test(chart), true, 'November reads all 1,200 DOs, not the first 1,000');
is(/3,200/.test(chart) && !/3,400/.test(chart), true,
   'October reads 3,200: the three-line DO as its lines (2,800, not its 3,000 total_qty) plus the 400 tray sale');

console.log('\n── 3. A sale out of a tray is the Pre-Nursery ──');
const pn = await page.evaluate(async () => {
  document.getElementById('f-from').value = '2026-10-01';
  document.getElementById('f-to').value = '2026-10-31';
  window.nurseryFilter = () => ['PN'];
  window._salesViewMode = 'table';
  await runSalesListing();
  return document.getElementById('report-output').textContent;
});
is(/T1/.test(pn) && /400/.test(pn), true, 'the P30 sale is on the report with only PN ticked');
is(/M1/.test(pn), false, 'and the BNN sale is not');

console.log('\n── 4. The Culling Report places "N 11" under its nursery ──');
const cull = await page.evaluate(async () => {
  document.getElementById('f-from').value = '2026-10-01';
  document.getElementById('f-to').value = '2026-10-31';
  const st = document.getElementById('f-culling-stage'); if (st) st.value = '';
  window.nurseryFilter = () => (window.__nf || ['UNN 2']);
  await runCullingReport();
  return document.getElementById('report-output').textContent;
});
if (process.env.DBG) console.log(cull.slice(0,800));
is(/250/.test(cull) && /37/.test(cull), true, 'the 2nd culling keyed against "N 11" is on the UNN 2 report');

is(errs.length, 0, 'no page errors');
await browser.close();
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
})();
