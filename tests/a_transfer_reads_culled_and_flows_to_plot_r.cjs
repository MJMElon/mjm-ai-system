/* A 3RD-CULLING TRANSFER COMES OFF THE MONTH ROW AND STANDS ON PLOT-R.

   The office's two rules, given together:
   - "make sure if the batch report for that batch and that plot has been
     keyed in the drone amount or being verified for the line in the part
     of 3rd culling, the monthly maturity allocation line will become
     'Culled' even the batch for that plot has transfer data."
   - "If the batch in the plot has transfer data, pls flow the data to my
     monthly maturity allocation tab named 'plot-R' ... show the maturity
     date (based on what batch) ... The plot balance calculation will be
     Transfer data - DO Deducted."

   So a Cull3_Transfer DEDUCTS from its source month row (the seedlings
   are standing on the Plot-R tab now — counting them in both places
   sells the same stock twice), which is what lets a gated 3rd culling
   take the row to 0 / CULLED even though the plot also transferred a
   remainder out. The destination gets a Plot-R row WHATEVER its name —
   the old "-R"-suffix filter dropped a transfer landing on an ordinary
   plot off every tab at once — and that row's Maturity Date is the
   BATCH's, not the day the transfer arrived. The one exception: a
   transfer into a plot where the SAME batch already has a month row
   credits that month row instead (two rows on one batch+plot key would
   share one allocation record), and the cell's hover says so.

   Drives the REAL page in a real browser.
   Run: node tests/a_transfer_reads_culled_and_flows_to_plot_r.cjs
*/
const fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require(fs.existsSync('/opt/node-tools/node_modules/playwright')
  ? '/opt/node-tools/node_modules/playwright' : 'playwright');
const ROOT = path.join(__dirname, '..');

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'application/octet-stream' });
    res.end(b);
  });
});

/* Pinned today: 22 Oct 2026. January transplants mature (+9 months) onto
   the October tab the page opens on.
     260/U1 — 2,000 (est 1,800); 3rd culling 1,500 WITH MapQty, row
              signed; transferred 300 to U9-R. 1,800 − 1,500 − 300 = 0:
              CULLED, locked, even though the plot has transfer data.
     260/U2 — 1,000 (900); culling 100 with NO MapQty (not counted);
              transferred 200 to U9-R. 900 − 200 = 700 — the transfer
              deducts ungated, the culling still waits for its drone qty.
     U9-R   — 300 + 200 in, a 120-pc DO out: Plot-R row, qty 500,
              balance 500 − 120 = 380, dated the BATCH's 15 Oct 2026
              maturity (not the February the transfer arrived).
     261/B5 — 1,000 (900); transferred 150 to B7, an ORDINARY plot the
              batch never transplanted into: B5 reads 750, and B7 is a
              Plot-R row of 150 (the old "-R" filter dropped it).
     262/N1 & N2 — 100 moved N2 → N1, and 262 already stands in N1: the
              month row N1 reads 900 + 100, N2 reads 450 − 100, and N1
              gets NO Plot-R row of its own. */
const SUPA = `window.SHARED_SUPA_URL='x';window.SHARED_SUPA_KEY='y';
(function(){
 window.__inserts=[];window.__writes=[];
 const T={
  shared_profiles:[{id:'u1',email:'o@m.t',full_name:'J',permissions:{manage_users:true,modules:{operation:'admin'}}}],
  salesweb_customer_orders:[], salesweb_order_items:[],
  salesweb_order_collections:[], shared_collection_bookings:[], shared_al_orders:[],
  shared_inventory_logs:[
   {id:1,transaction_type:'Transplanted',batch_name:'260',plot_name:'U1',breed_name:'DxP',quantity_change:2000,transaction_date:'2026-01-15',created_at:'2026-01-15T02:00:00',remark:''},
   {id:2,transaction_type:'Transplanted',batch_name:'260',plot_name:'U2',breed_name:'DxP',quantity_change:1000,transaction_date:'2026-01-20',created_at:'2026-01-20T02:00:00',remark:''},
   {id:3,transaction_type:'Transplanted',batch_name:'261',plot_name:'B5',breed_name:'DxP',quantity_change:1000,transaction_date:'2026-01-10',created_at:'2026-01-10T02:00:00',remark:''},
   {id:4,transaction_type:'Transplanted',batch_name:'262',plot_name:'N1',breed_name:'DxP',quantity_change:1000,transaction_date:'2026-01-12',created_at:'2026-01-12T02:00:00',remark:''},
   {id:5,transaction_type:'Transplanted',batch_name:'262',plot_name:'N2',breed_name:'DxP',quantity_change:500,transaction_date:'2026-01-18',created_at:'2026-01-18T02:00:00',remark:''},
   {id:6,transaction_type:'3rd_Culling',batch_name:'260',plot_name:'U1',quantity_change:1500,created_at:'2026-09-01T02:00:00',remark:'3rd Culling. DestType: main MapQty: 1500 CullDate:2026-09-01'},
   {id:7,transaction_type:'3rd_Culling',batch_name:'260',plot_name:'U2',quantity_change:100,created_at:'2026-09-02T02:00:00',remark:'3rd Culling. DestType: main CullDate:2026-09-02'},
   {id:8,transaction_type:'Cull3_Transfer',batch_name:'260',plot_name:'U9-R',breed_name:'DxP',quantity_change:300,transaction_date:'2026-02-01',created_at:'2026-02-01T02:00:00',remark:'P-R Culling Transfer From: [U1|main] To: [U9-R|reserve]'},
   {id:9,transaction_type:'Cull3_Transfer',batch_name:'260',plot_name:'U9-R',breed_name:'DxP',quantity_change:200,transaction_date:'2026-02-05',created_at:'2026-02-05T02:00:00',remark:'P-R Culling Transfer From: [U2|main] To: [U9-R|reserve]'},
   {id:10,transaction_type:'Cull3_Transfer',batch_name:'261',plot_name:'B7',breed_name:'DxP',quantity_change:150,transaction_date:'2026-02-10',created_at:'2026-02-10T02:00:00',remark:'P-R Culling Transfer From: [B5|main] To: [B7|main]'},
   {id:11,transaction_type:'Cull3_Transfer',batch_name:'262',plot_name:'N1',breed_name:'DxP',quantity_change:100,transaction_date:'2026-02-12',created_at:'2026-02-12T02:00:00',remark:'P-R Culling Transfer From: [N2|main] To: [N1|main]'},
   {id:12,transaction_type:'Row_Verification',batch_name:'260',plot_name:'cull_3::U1|main',quantity_change:0,created_at:'2026-09-10T02:00:00',remark:'Row verified: U1|main'}
  ],
  operation_batch_verifications:[],
  shared_plots:[
   {plot_name:'U1',nursery_name:'UNN 1'},{plot_name:'U2',nursery_name:'UNN 1'},
   {plot_name:'U9-R',nursery_name:'UNN 1'},{plot_name:'B5',nursery_name:'BNN'},
   {plot_name:'B7',nursery_name:'BNN'},{plot_name:'N1',nursery_name:'UNN 2'},
   {plot_name:'N2',nursery_name:'UNN 2'}
  ],
  shared_plot_allocations:[],
  shared_batch_customer_allocations:[],
  shared_do_records:[
   {do_number:'D1',total_qty:120,status:'Issued',remark:'',plot_1:'U9-R',qty_1:120,batch_1:'260'}
  ],
  operation_nurseries:[], audit_height_records:[]
 };
 let seq=1;
 window.supabase={createClient:()=>({
  from(table){ const st={f:[],ins:[],rng:null,single:false,inserted:null};
   const api=new Proxy({},{get(_,k){
    if(k==='then') return (res,rej)=>{
      if(st.inserted){ const row={id:'ins-'+(seq++),...st.inserted};
        (T[table]=T[table]||[]).push(row);
        window.__inserts.push({table,row});
        return new Promise(r=>setTimeout(()=>r({data:st.single?row:[row],error:null}),5)).then(res,rej); }
      let rows=(T[table]||[]).filter(r=>st.f.every(([c,v])=>String(r[c])===String(v))&&st.ins.every(([c,vs])=>vs.includes(r[c])));
      if(st.rng) rows=rows.slice(st.rng[0],st.rng[1]+1); else rows=rows.slice(0,1000);
      return new Promise(r=>setTimeout(()=>r({data:st.single?(rows[0]??null):rows,error:null,count:rows.length}),5)).then(res,rej);};
    if(k==='insert') return (p)=>{st.inserted=p;return api;};
    if(k==='upsert') return (p)=>{window.__writes.push({table,p});return api;};
    if(k==='update') return (p)=>{window.__writes.push({table,p});return api;};
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
 })};
})();`;

let fails = 0;
const check = (ok, m) => { console.log((ok ? '  ok  ' : ' FAIL ') + m); if (!ok) fails++; };

const rowOf = plot => `[...document.querySelectorAll('#maturity-rows tr[data-batch-key]')].find(tr => tr.dataset.plotName === '${plot}')`;
const snap = plot => `(() => {
  const tr = ${rowOf(plot)}; if (!tr) return null;
  const tds = tr.querySelectorAll('td');
  // One cell fewer than the first version of this file read: the office
  // took the Location column off ("Remove the Location under Production,
  // create a button at the top there: ALL, UNN1, UNN2, BNN"), so every
  // index after the date moved down one.
  return {
    status: tr.dataset.matStatus,
    date: tds[0].textContent.trim(),
    qty: tds[4].textContent.trim(),
    doDed: tds[7].textContent.trim(),
    doTitle: tds[7].getAttribute('title') || '',
    balance: tds[8].textContent.trim(),
    balTitle: tds[8].getAttribute('title') || '',
    dropdown: !!tr.querySelector('.mat-status-wrap'),
    pill: (tr.querySelector('td.col-plot span') || {}).textContent || ''
  };
})()`;

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  await page.route('**cdn.tailwindcss.com**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: SUPA }));
  await page.route('**cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', body: 'window.Chart=class{constructor(){}destroy(){}update(){}};window.Chart.register=()=>{};window.jspdf={jsPDF:class{}};' }));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**fonts.gstatic.com/**', r => r.abort());
  page.on('pageerror', e => console.log(' page error: ' + e.message.slice(0, 150)));
  await page.addInitScript(() => {
    const Real = Date;
    const FIXED = new Real('2026-10-22T04:00:00');
    // eslint-disable-next-line no-global-assign
    Date = class extends Real {
      constructor(...a) { if (a.length) { super(...a); } else { super(FIXED.getTime()); } }
      static now() { return FIXED.getTime(); }
    };
  });
  await page.goto(`http://127.0.0.1:${port}/operation/operation_stock_sales.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('document.querySelectorAll("#maturity-rows tr[data-batch-key]").length >= 5', null, { timeout: 15000 });
  check(page.url().includes('operation_stock_sales'), 'page loaded without bouncing to the portal');

  // ── 1. A gated culling reads CULLED even with transfer data ──────────────
  const u1 = await page.evaluate(snap('U1'));
  check(!!u1, 'U1 (gated culling + a transfer out) is on the month tab');
  check(u1 && u1.status === 'culled' && u1.balance === '0',
    `U1 reads 0 / CULLED — 1,800 less 1,500 culled less 300 transferred — "even the batch for that plot has transfer data" (got ${u1 && u1.status} / "${u1 && u1.balance}")`);
  check(u1 && !u1.dropdown && /culled/i.test(u1.pill), `and the pill is LOCKED (got "${u1 && u1.pill.trim()}")`);
  check(u1 && /1,500 culled/.test(u1.balTitle) && /300 transferred to Plot-R/.test(u1.balTitle),
    `the hover names both halves — culled and transferred (got "${u1 && u1.balTitle}")`);
  check(u1 && /Transferred out 300/.test(u1.doTitle),
    `and the DO cell's hover carries the transfer beside the sold figure (got "${u1 && u1.doTitle}")`);

  // ── 2. The transfer deducts UNGATED; the culling still waits its gate ────
  const u2 = await page.evaluate(snap('U2'));
  /* THE OFFICE'S FORMULA: a month row's Plot Balance is After 10% Culling
     − DO Deducted and nothing else ("Plot balance calculation = After 10%
     culling qty - DO deducted"). The transfer no longer comes off it; it
     is still NAMED in the hover, and still lands on the Plot-R tab. */
  check(u2 && u2.balance === '900' && u2.status !== 'culled' && u2.dropdown,
    `U2 reads 900 − 0 DO = 900 — the 200 transferred is not taken off a month row, still live (got ${u2 && u2.status} / "${u2 && u2.balance}")`);
  check(u2 && /200 transferred off this plot/.test(u2.balTitle) && /keyed but NOT counted/.test(u2.balTitle),
    `the hover says the 200 left for Plot-R and the 100 culling still waits (got "${u2 && u2.balTitle}")`);

  // ── 3. The destination is a Plot-R row dated by the BATCH ────────────────
  const pr = await page.evaluate(`(async () => {
    const btn = [...document.querySelectorAll('.month-tab')].find(b => /plot-?r/i.test(b.textContent));
    if (!btn) return null;
    btn.click(); await new Promise(r => setTimeout(r, 80));
    return { u9: ${snap('U9-R')}, b7: ${snap('B7')},
             n1OnPR: !!(${rowOf('N1')}),
             rows: [...document.querySelectorAll('#maturity-rows tr[data-batch-key]')].map(tr => tr.dataset.plotName) };
  })()`);
  check(pr && pr.u9, `U9-R is on the Plot-R tab (rows: ${pr && pr.rows.join(', ')})`);
  check(pr && pr.u9 && pr.u9.qty === '500', `its Qty Transferred is both transfers in — 300 + 200 (got "${pr && pr.u9 && pr.u9.qty}")`);
  check(pr && pr.u9 && pr.u9.doDed === '120' && pr.u9.balance === '380',
    `and Plot Balance is Transfer data − DO Deducted: 500 − 120 = 380 (got ${pr && pr.u9 && pr.u9.doDed} / "${pr && pr.u9 && pr.u9.balance}")`);
  check(pr && pr.u9 && pr.u9.date === '15 Oct 2026',
    `its Maturity Date is the BATCH's — 260's earliest maturity, never the February the transfer arrived (got "${pr && pr.u9 && pr.u9.date}")`);

  // ── 4. A transfer onto an ORDINARY plot is on the tab too ────────────────
  check(pr && pr.b7, 'B7 — an ordinary plot a transfer landed on — has a Plot-R row (the old "-R" filter dropped it)');
  check(pr && pr.b7 && pr.b7.qty === '150' && pr.b7.balance === '150' && pr.b7.date === '10 Oct 2026',
    `B7 reads 150 transferred, balance 150, dated batch 261's maturity (got ${pr && pr.b7 && pr.b7.qty} / "${pr && pr.b7 && pr.b7.balance}" / "${pr && pr.b7 && pr.b7.date}")`);

  // ── 5. A transfer into a plot the batch already stands in credits the
  //       month row instead of splitting one key across two rows ───────────
  check(pr && pr.n1OnPR === false, 'N1 gets NO Plot-R row — batch 262 already has a month row there');
  const back = await page.evaluate(`(async () => {
    const btn = [...document.querySelectorAll('.month-tab')].find(b => /now/i.test(b.textContent));
    btn.click(); await new Promise(r => setTimeout(r, 80));
    return { n1: ${snap('N1')}, n2: ${snap('N2')},
             foot: [...document.querySelectorAll('.mat-table tfoot td, #maturity-table tfoot td')].map(td => td.textContent.trim()) };
  })()`);
  check(back.n1 && back.n1.balance === '900' && /100 transferred ONTO this plot/.test(back.n1.balTitle),
    `N1's month row reads After 10% Culling − DO = 900, the 100 in named in the hover (got "${back.n1 && back.n1.balance}" / "${back.n1 && back.n1.balTitle}")`);
  check(back.n2 && back.n2.balance === '450' && /100 transferred off/.test(back.n2.balTitle),
    `and N2 reads 450, the 100 it gave up named in the hover (got "${back.n2 && back.n2.balance}")`);

  // ── 6. The foot sums the SHOWN balances ──────────────────────────────────
  check(back.foot.includes('3,150'),
    `the month tab's Plot Balance total is the column's own sum — 3,150 under the office's formula (foot: ${back.foot.join(' | ')})`);

  // ── 7. Nothing is written back ───────────────────────────────────────────
  const writes = await page.evaluate(() => ({ inserts: window.__inserts.length, writes: window.__writes.length }));
  check(writes.inserts === 0 && writes.writes === 0,
    `rendering wrote NOTHING to the database (got ${writes.inserts} inserts, ${writes.writes} writes)`);

  await page.close(); await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
