/* THE SALES WEB'S MONTH IS THE OFFICE'S MONTHLY MATURITY ALLOCATION.

   February 2027 read 29,042 After Deduct Reserve on the office table and,
   on the Sales Web's Publish to Sales Web dialog, a raw maturity of
   35,027, a customer allocation of NOUGHT and "only 2,938 currently
   available". Three rules of its own, each answering differently:

     - dated off the remark and created_at, never transaction_date;
     - a DO line taken off every crop that ever stood in its PLOT, batch
       ignored — last year's sales off the plot came off this month;
     - the reservation read off shared_plot_allocations.reserved_qty,
       which nothing writes now: the customers are the chips in
       shared_batch_customer_allocations, capped at what each order owes.

   shared/shared_month_maturity.js is the office rule written down, and
   public/month-maturity.js in MJMNursery-Sales-Web is its copy.

   This test holds one ledger carrying all three traps and:
     1. drives the REAL office page and reads the Feb 2027 foot;
     2. builds the same ledger through the shared file, and they agree;
     3. drives the REAL Sales Web admin-products.js (beside its copy) and
        its computeProductStock / computeCustomerAllocation, and those
        agree with the office foot too;
     4. the two copies of the rule are the same file.

   SALES_WEB=/path/to/MJMNursery-Sales-Web (default ../MJMNursery-Sales-Web)
   PREV_ADMIN=/path/to/old/admin-products.js runs section 3 on an older copy.

   Run: node tests/the_sales_web_reads_the_maturity_table.cjs
*/
const fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require(fs.existsSync('/opt/node-tools/node_modules/playwright')
  ? '/opt/node-tools/node_modules/playwright' : 'playwright');
const ROOT = path.join(__dirname, '..');
const SW = process.env.SALES_WEB || path.join(ROOT, '..', 'MJMNursery-Sales-Web');

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'application/octet-stream' });
    res.end(b);
  });
});

/* ── The ledger ─────────────────────────────────────────────────────
   259/U3  3,000 in May 2026                    → Feb 2027
   259/U4  2,000, transaction_date 20 May, remark says 20 Apr → Feb 2027
           (the web dated it off the remark and put it in January)
   260/B5  1,235, no date anywhere, saved 15 May → Feb 2027
   200/U3  last year's crop on the same plot, and a DO of 2,500 off it
           (the web took that 2,500 off February's U3)
   DO-2    300 off 259/U4, against AL2
   DO-3    500 off 260/B5, against AL3 — which is then fully collected
   Chips   259/U3 1,453 (ORD-A), 259/U4 1,300 (ORD-B, owes 1,000 now),
           260/B5 500 (ORD-C, owes nothing — spent)                    */
const LEDGER = {
  shared_inventory_logs: [
    { id: 1, transaction_type: 'Transplanted', batch_name: '259', plot_name: 'U3', breed_name: 'X', quantity_change: 1500, created_at: '2026-05-10T02:00:00', transaction_date: '2026-05-10', remark: '' },
    { id: 2, transaction_type: 'Transplanted', batch_name: '259', plot_name: 'U3', breed_name: 'X', quantity_change: 1500, created_at: '2026-06-02T02:00:00', transaction_date: null, remark: 'Transplanted from tray [P3] to Main Plot [U3]. Date: 2026-05-12' },
    { id: 3, transaction_type: 'Transplanted', batch_name: '259', plot_name: 'U4', breed_name: 'X', quantity_change: 2000, created_at: '2026-04-20T02:00:00', transaction_date: '2026-05-20', remark: 'Transplanted from tray [P3] to Main Plot [U4]. Date: 2026-04-20' },
    { id: 4, transaction_type: 'Transplanted', batch_name: '260', plot_name: 'B5', breed_name: 'Y', quantity_change: 1235, created_at: '2026-05-15T02:00:00', transaction_date: null, remark: '' },
    { id: 5, transaction_type: 'Transplanted', batch_name: '200', plot_name: 'U3', breed_name: 'Z', quantity_change: 3000, created_at: '2025-05-01T02:00:00', transaction_date: '2025-05-01', remark: '' }
  ],
  shared_plots: [{ plot_name: 'U3', nursery_name: 'UNN 1' }, { plot_name: 'U4', nursery_name: 'UNN 1' }, { plot_name: 'B5', nursery_name: 'BNN' }],
  shared_plot_allocations: [{ batch_name: '259', plot_name: 'U3', plot_status: 'open', reserved_qty: 0 }],
  shared_do_records: [
    { id: 1, do_number: 'DO-OLD', al_number: null, total_qty: 2500, status: 'Issued', remark: '', plot_1: 'U3', qty_1: 2500, batch_1: '200' },
    { id: 2, do_number: 'DO-2', al_number: 'AL2', total_qty: 300, status: 'Issued', remark: '', plot_1: 'U4', qty_1: 300, batch_1: '259' },
    { id: 3, do_number: 'DO-3', al_number: 'AL3', total_qty: 500, status: 'Issued', remark: '', plot_1: 'B5', qty_1: 500, batch_1: '260' },
    { id: 4, do_number: 'DO-X', al_number: 'AL1', total_qty: 999, status: 'Cancelled', remark: '', plot_1: 'U3', qty_1: 999, batch_1: '259' }
  ],
  shared_batch_customer_allocations: [
    { id: 11, batch_name: '259', plot_name: 'U3', order_id: 'o1', order_number: 'ORD-A', customer_name: 'Borneo Sawit Maju', allocated_qty: 1453 },
    { id: 12, batch_name: '259', plot_name: 'U4', order_id: 'o2', order_number: 'ORD-B', customer_name: 'Azam Asiakom', allocated_qty: 1300 },
    { id: 13, batch_name: '260', plot_name: 'B5', order_id: 'o3', order_number: 'ORD-C', customer_name: 'Done Co', allocated_qty: 500 }
  ],
  salesweb_customer_orders: [
    { id: 'o1', order_number: 'ORD-A', customer_name: 'Borneo Sawit Maju', status: 'Paid', created_at: '2026-06-01T02:00:00' },
    { id: 'o2', order_number: 'ORD-B', customer_name: 'Azam Asiakom', status: 'Paid', created_at: '2026-06-02T02:00:00' },
    { id: 'o3', order_number: 'ORD-C', customer_name: 'Done Co', status: 'Paid', created_at: '2026-06-03T02:00:00' }
  ],
  salesweb_order_items: [{ order_id: 'o1', quantity: 1453 }, { order_id: 'o2', quantity: 1300 }, { order_id: 'o3', quantity: 500 }],
  salesweb_order_collections: [],
  shared_al_orders: [
    { al_number: 'AL1', order_number: 'ORD-A', quantity_ordered: 1453, balance_quantity: 1453, status: 'Active', remark: '' },
    { al_number: 'AL2', order_number: 'ORD-B', quantity_ordered: 1300, balance_quantity: 1000, status: 'Active', remark: '' },
    { al_number: 'AL3', order_number: 'ORD-C', quantity_ordered: 500, balance_quantity: 0, status: 'Active', remark: '' }
  ],
  operation_batch_verifications: [],
  salesweb_stock_transfers: [],
  salesweb_products: [{ id: 'p1', name: 'Oil Palm Seedling — February 2027', sell_month: 'February', sell_year: 2027 }]
};
/* What the office table must read for Feb 2027, worked by hand:
   qty 6,235 · after 10% 2,700 + 1,800 + 1,112 = 5,612 · DO 300 + 500 = 800
   · balance 5,612 − 800 = 4,812 · reserved 1,453 + 1,000 = 2,453
   · after deduct reserve 2,359. */
const WANT = { qty: 6235, afterCulling: 5612, doDeducted: 800, plotBalance: 4812, reserved: 2453, afterDeductReserve: 2359 };

const STUB = (ledger) => `window.SHARED_SUPA_URL='x';window.SHARED_SUPA_KEY='y';
(function(){
 const T=${JSON.stringify(ledger)};
 T.shared_profiles=[{id:'u1',email:'o@m.t',full_name:'J',permissions:{manage_users:true,modules:{operation:'admin'}}}];
 const client={
  from(table){ const st={f:[],ins:[],rng:null,single:false};
   const api=new Proxy({},{get(_,k){
    if(k==='then') return (res,rej)=>{ let rows=(T[table]||[]).filter(r=>st.f.every(([c,v])=>String(r[c])===String(v))&&st.ins.every(([c,vs])=>vs.includes(r[c])));
      if(st.rng) rows=rows.slice(st.rng[0],st.rng[1]+1); else rows=rows.slice(0,1000);
      return new Promise(r=>setTimeout(()=>r({data:st.single?(rows[0]??null):rows,error:null,count:rows.length}),5)).then(res,rej);};
    if(k==='eq') return (c,v)=>{st.f.push([c,v]);return api;};
    if(k==='in') return (c,vs)=>{st.ins.push([c,vs]);return api;};
    if(k==='range') return (a,b)=>{st.rng=[a,b];return api;};
    if(k==='single'||k==='maybeSingle') return ()=>{st.single=true;return api;};
    return ()=>api; }});
   return api; },
  rpc(){ return Promise.resolve({data:null,error:null}); },
  auth:{ getSession:()=>new Promise(r=>setTimeout(()=>r({data:{session:{user:{id:'u1',email:'o@m.t',user_metadata:{full_name:'J'}}}}}),25)),
         onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut:async()=>({}) },
  channel(){ return {on(){return this;},subscribe(){return this;}}; }, removeChannel(){}
 };
 window.supabase={createClient:()=>client};
 window.__client=client;
})();`;

let fails = 0;
const check = (ok, m) => { console.log((ok ? '  ok  ' : ' FAIL ') + m); if (!ok) fails++; };
const num = s => Number(String(s || '').replace(/[^0-9-]/g, '')) || 0;

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});

  /* ── 1. The REAL office page ─────────────────────────────────────── */
  console.log('1. the office table, Feb 2027');
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  await page.route('**cdn.tailwindcss.com**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: STUB(LEDGER) }));
  await page.route('**cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', body: 'window.Chart=class{constructor(){}destroy(){}update(){}};window.Chart.register=()=>{};window.jspdf={jsPDF:class{}};' }));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**fonts.gstatic.com/**', r => r.abort());
  page.on('pageerror', e => console.log(' page error: ' + e.message.slice(0, 150)));
  await page.addInitScript(() => {
    const Real = Date; const FIXED = new Real('2026-11-19T04:00:00');
    // eslint-disable-next-line no-global-assign
    Date = class extends Real { constructor(...a) { if (a.length) super(...a); else super(FIXED.getTime()); } static now() { return FIXED.getTime(); } };
  });
  await page.goto(`http://127.0.0.1:${port}/operation/operation_stock_sales.html`);
  await page.waitForTimeout(3000);
  const office = await page.evaluate(() => new Promise(res => {
    const tab = [...document.querySelectorAll('.month-tab')].find(b => /^FEB 2027/i.test(b.textContent.trim()));
    if (!tab) return res(null);
    tab.click();
    setTimeout(() => {
      const td = [...document.querySelectorAll('#maturity-foot td')].map(x => x.textContent.trim());
      res(td);
    }, 600);
  }));
  check(!!office, 'the office page has a Feb 2027 tab');
  /* Totals (n rows) | qty | after 10% | — | DO | balance | — | reserved | after deduct */
  const foot = office ? { qty: num(office[1]), afterCulling: num(office[2]), doDeducted: num(office[4]), plotBalance: num(office[5]), reserved: num(office[7]), afterDeductReserve: num(office[8]) } : {};
  Object.keys(WANT).forEach(k => check(foot[k] === WANT[k], `office ${k} reads ${WANT[k]} (got ${foot[k]})`));
  await page.close();

  /* ── 2. The shared file, same ledger ─────────────────────────────── */
  console.log('2. shared/shared_month_maturity.js, same ledger');
  delete globalThis.MJMMonthMaturity;
  require(path.join(ROOT, 'shared/shared_month_maturity.js'));
  const M = globalThis.MJMMonthMaturity;
  const L = M.build({
    transplants: LEDGER.shared_inventory_logs.filter(l => l.transaction_type === 'Transplanted'),
    transfers: [], cull3: [], rowVer: [], rowVerOk: true, tabVer: [],
    dos: LEDGER.shared_do_records, alDos: LEDGER.shared_do_records,
    allocations: LEDGER.shared_batch_customer_allocations, orders: LEDGER.salesweb_customer_orders,
    items: LEDGER.salesweb_order_items, collections: LEDGER.salesweb_order_collections, alRows: LEDGER.shared_al_orders
  });
  const feb = L.months['2027-02'] || {};
  Object.keys(WANT).forEach(k => check(feb[k] === foot[k], `the shared rule agrees with the office on ${k} (${feb[k]} / ${foot[k]})`));

  /* ── 3. The REAL Sales Web code ──────────────────────────────────── */
  console.log('3. the Sales Web Publish dialog figures');
  const adminFile = process.env.PREV_ADMIN || path.join(SW, 'public/admin-products.js');
  const copyFile = path.join(SW, 'public/month-maturity.js');
  if (!fs.existsSync(adminFile)) { check(false, 'admin-products.js not found at ' + adminFile); }
  else {
    const sp = await browser.newPage();
    sp.on('pageerror', e => console.log(' page error: ' + e.message.slice(0, 150)));
    await sp.setContent('<html><body></body></html>');
    await sp.addScriptTag({ content: STUB(LEDGER) + ';var sb=window.__client;var toast=function(){};var esc=function(s){return String(s);};' });
    if (fs.existsSync(copyFile)) await sp.addScriptTag({ content: fs.readFileSync(copyFile, 'utf8') }).catch(() => {});
    await sp.addScriptTag({ content: fs.readFileSync(adminFile, 'utf8') }).catch(e => console.log(' load: ' + e.message.slice(0, 120)));
    const web = await sp.evaluate(async () => {
      try {
        const d = await computeProductStock('p1', 'February', 2027);
        const alloc = await computeCustomerAllocation('February', 2027);
        const raw = (d.sources || []).reduce((s, x) => s + (Number(x.originalStock) || 0), 0);
        return { raw, alloc, available: d.finalStock };
      } catch (e) { return { err: String(e && e.message || e) }; }
    });
    check(!web.err, 'the Sales Web functions run' + (web.err ? ' — ' + web.err : ''));
    check(web.raw === foot.afterCulling, `Raw maturity is the office After 10% Culling, ${foot.afterCulling} (got ${web.raw})`);
    check(web.alloc === foot.reserved, `Customer allocation is the office Reserved Qty, ${foot.reserved} (got ${web.alloc})`);
    check(web.available === foot.afterDeductReserve, `Available is the office After Deduct Reserve, ${foot.afterDeductReserve} (got ${web.available})`);
    await sp.close();
  }

  /* ── 4. Two copies, one rule ─────────────────────────────────────── */
  console.log('4. the two copies');
  const a = fs.readFileSync(path.join(ROOT, 'shared/shared_month_maturity.js'), 'utf8');
  const b = fs.existsSync(copyFile) ? fs.readFileSync(copyFile, 'utf8') : '';
  check(a === b, 'public/month-maturity.js is shared/shared_month_maturity.js word for word');
  const shell = fs.existsSync(path.join(SW, 'src/lib/adminShell.js')) ? fs.readFileSync(path.join(SW, 'src/lib/adminShell.js'), 'utf8') : '';
  const iCopy = shell.indexOf("'/month-maturity.js"), iAdmin = shell.indexOf("'/admin-products.js");
  check(iCopy >= 0 && iCopy < iAdmin, 'the admin shell loads month-maturity.js before admin-products.js');

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
