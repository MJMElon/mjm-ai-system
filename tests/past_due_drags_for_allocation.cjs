/* THE CUSTOMER ORDERS DRAWER TOTALS ITS SEEDLINGS, AND PAST DUE DRAGS TOO.

   The office asked for two things on the allocation drawer, in their own
   words: "Active / Pass due, I want to see how many seedlings in total.
   past due also able to drag for reservation." then "I mean for allocation."

   So:
     - each tab chip carries the SUM of the figure its own cards show —
       Active sums what is still to allocate, Past Due sums what is
       uncollected (they are different questions, and each tab's total has
       to agree with the cards under it);
     - a past-due card still owed allocation is draggable onto a
       matured-stock row exactly like an Active one, and the drop writes the
       same shared_batch_customer_allocations row through the same
       allocateOrderToBatch;
     - a past-due card FULLY allocated is not draggable — there is nothing
       left to allocate — and says it is waiting on collection instead;
     - the big figure on a past card is what is UNCOLLECTED, which does not
       move when an allocation is made; what the drag moves is the
       UNALLOCATED remainder, and the remark names that figure.

   On the previous code the past tab's cards read "follow up reminder only",
   carried no draggable attribute, and the tabs showed counts with no
   quantities at all.

   Drives the REAL page in a real browser.
   Run: node tests/past_due_drags_for_allocation.cjs
   (starts its own server; needs the Playwright chromium at /opt/pw-browsers)
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

/* Three orders against a pinned today of 22 Oct 2026:
     A — this month, 300 ordered, nothing collected, nothing allocated
         -> Active, 300 to allocate.
     B — August, 500 ordered, nothing collected, 100 already allocated
         -> Past Due, 500 uncollected on the card, 400 left to drag.
     C — September, 200 ordered, nothing collected, 200 allocated
         -> Past Due, 200 uncollected, nothing left to drag.
   Every insert the page sends is recorded on window.__inserts, because a
   stub that swallows a write signs off whatever the page sent it. */
const SUPA = `window.SHARED_SUPA_URL='x';window.SHARED_SUPA_KEY='y';
(function(){
 window.__inserts=[];
 const T={
  shared_profiles:[{id:'u1',email:'o@m.t',full_name:'J',permissions:{manage_users:true,modules:{operation:'admin'}}}],
  salesweb_customer_orders:[
   {id:'A',order_number:'ORD-A',customer_name:'ALPHA SDN BHD',billing_name:null,total:3000,status:'Processing',created_at:'2026-10-05T02:00:00',payment_terms:'cash',collected_qty:null,collected_at:null},
   {id:'B',order_number:'ORD-B',customer_name:'BUKIT IMPAS AGRO SDN BHD',billing_name:null,total:5000,status:'Processing',created_at:'2026-08-15T02:00:00',payment_terms:'cash',collected_qty:null,collected_at:null},
   {id:'C',order_number:'ORD-C',customer_name:'GAMMA PLANTATION',billing_name:null,total:2000,status:'Processing',created_at:'2026-09-10T02:00:00',payment_terms:'cash',collected_qty:null,collected_at:null}
  ],
  salesweb_order_items:[
   {order_id:'A',quantity:300,unit_price:10,subtotal:3000},
   {order_id:'B',quantity:500,unit_price:10,subtotal:5000},
   {order_id:'C',quantity:200,unit_price:10,subtotal:2000}
  ],
  shared_batch_customer_allocations:[
   {id:'b1',batch_name:'250',plot_name:'U1',order_id:'B',order_number:'ORD-B',customer_name:'BUKIT IMPAS AGRO SDN BHD',allocated_qty:100},
   {id:'c1',batch_name:'250',plot_name:'U1',order_id:'C',order_number:'ORD-C',customer_name:'GAMMA PLANTATION',allocated_qty:200}
  ],
  salesweb_order_collections:[], shared_collection_bookings:[], shared_al_orders:[],
  shared_inventory_logs:[], shared_plots:[], shared_plot_allocations:[],
  shared_do_records:[], operation_nurseries:[], audit_height_records:[]
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

  // isPastMonthOrder compares against "now" — pin it so August and
  // September stay past months and October stays current, whatever day
  // this test runs on.
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
  await page.waitForFunction('typeof allCustomerOrders !== "undefined" && allCustomerOrders.length === 3 && batchAllocations.length === 2', null, { timeout: 15000 });
  check(page.url().includes('operation_stock_sales'), 'page loaded without bouncing to the portal');

  // ── 1. The tabs carry the seedling totals ────────────────────────────────
  await page.evaluate(() => toggleAllocDrawer());
  // Null-safe on purpose: on the previous page the qty spans do not exist
  // at all, and that must read as FAIL lines rather than a thrown evaluate.
  const tabs = await page.evaluate(() => ({
    activeCount: (document.getElementById('alloc-count-active') || {}).textContent || '(missing)',
    pastCount:   (document.getElementById('alloc-count-past')   || {}).textContent || '(missing)',
    activeQty:   (document.getElementById('alloc-qty-active')   || {}).textContent || '(missing)',
    pastQty:     (document.getElementById('alloc-qty-past')     || {}).textContent || '(missing)',
  }));
  check(tabs.activeCount === '1', `Active counts 1 order (got ${tabs.activeCount})`);
  check(tabs.pastCount === '2',   `Past Due counts 2 orders (got ${tabs.pastCount})`);
  check(tabs.activeQty === '300 pcs', `Active totals what its cards show — 300 pcs to allocate (got "${tabs.activeQty}")`);
  check(tabs.pastQty === '700 pcs',   `Past Due totals what its cards show — 700 pcs uncollected (got "${tabs.pastQty}")`);

  // ── 2. A past-due card still owed allocation drags; a settled one does not ─
  await page.evaluate(() => switchAllocTab('past'));
  const past = await page.evaluate(() => {
    const cardOf = id => document.querySelector(`.order-card[data-order-id="${id}"], .order-card.past-due`);
    const b = [...document.querySelectorAll('.order-card.past-due')].find(c => c.textContent.includes('ORD-B'));
    const c = [...document.querySelectorAll('.order-card.past-due')].find(c2 => c2.textContent.includes('ORD-C'));
    return {
      count: document.querySelectorAll('.order-card.past-due').length,
      bDraggable: b ? b.getAttribute('draggable') : null,
      bGrip:      b ? !!b.querySelector('.order-card-grip') : null,
      bBig:       b ? b.querySelector('.order-card-qty-big').textContent : null,
      bRemark:    b ? (b.querySelector('.order-card-remark') || {}).textContent || '' : '',
      cDraggable: c ? c.getAttribute('draggable') : null,
      cRemark:    c ? (c.querySelector('.order-card-remark') || {}).textContent || '' : '',
    };
  });
  check(past.count === 2, `both past-due orders are on the tab (got ${past.count})`);
  check(past.bDraggable === 'true', 'a past-due order with 400 left to allocate is draggable');
  check(past.bGrip === true, 'and it carries the drag grip like an Active card');
  check(past.bBig === '500', `its big figure is the UNCOLLECTED 500, not the unallocated 400 (got ${past.bBig})`);
  check(/allocate/i.test(past.bRemark) && past.bRemark.includes('400'), `its remark names the 400 the drag will move (got "${past.bRemark}")`);
  check(!/follow up reminder only/i.test(past.bRemark), 'the "follow up reminder only" sentence is gone');
  check(past.cDraggable !== 'true', 'a past-due order with nothing left to allocate is NOT draggable');
  check(/fully allocated/i.test(past.cRemark) && /collect/i.test(past.cRemark), `the settled card says it waits on collection (got "${past.cRemark}")`);

  // ── 3. The drag carries the UNALLOCATED remainder and the drop writes it ──
  const drop = await page.evaluate(async () => {
    const b = [...document.querySelectorAll('.order-card.past-due')].find(c => c.textContent.includes('ORD-B'));
    b.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
    const dragging = _draggingOrder ? { ..._draggingOrder } : null;
    // A matured-stock row with 1,000 standing — the same dataset shape
    // renderMaturityTable writes, driven through the real onRowDrop.
    const tr = document.createElement('tr');
    tr.dataset.batchBalance = '1000';
    tr.dataset.batchName = '250';
    tr.dataset.plotName = 'U2';
    tr.dataset.matStatus = 'growing';
    await onRowDrop({ currentTarget: tr, preventDefault() {}, dataTransfer: new DataTransfer() });
    return { dragging, inserts: window.__inserts, pastQty: document.getElementById('alloc-qty-past').textContent };
  });
  check(drop.dragging && drop.dragging.orderId === 'B', 'dragstart on the past-due card arms the same _draggingOrder the Active cards use');
  check(drop.dragging && drop.dragging.remaining === 400, `and it carries the unallocated 400, not the uncollected 500 (got ${drop.dragging && drop.dragging.remaining})`);
  check(drop.inserts.length === 1, `the drop wrote exactly one allocation (got ${drop.inserts.length})`);
  const ins = drop.inserts[0] || { row: {} };
  check(ins.table === 'shared_batch_customer_allocations' && ins.row.order_id === 'B' && ins.row.allocated_qty === 400 && ins.row.batch_name === '250' && ins.row.plot_name === 'U2',
    `and it is order B's 400 onto 250/U2 (got ${JSON.stringify(ins.row)})`);
  check(drop.pastQty === '700 pcs', 'allocating moves nothing on the Past Due total — the seedlings are still uncollected');

  // ── 4. After the drop the card reads settled, and Active is untouched ─────
  const after = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.order-card.past-due')].find(c => c.textContent.includes('ORD-B'));
    switchAllocTab('active');
    const a = [...document.querySelectorAll('.order-card')].find(c => c.textContent.includes('ORD-A'));
    return {
      bDraggable: b ? b.getAttribute('draggable') : null,
      bRemark:    b ? (b.querySelector('.order-card-remark') || {}).textContent || '' : '',
      aDraggable: a ? a.getAttribute('draggable') : null,
    };
  });
  check(after.bDraggable !== 'true', 'once fully allocated the past-due card stops dragging');
  check(/fully allocated/i.test(after.bRemark), `and its remark flips to waiting on collection (got "${after.bRemark}")`);
  check(after.aDraggable === 'true', 'an Active card still drags exactly as before');

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
