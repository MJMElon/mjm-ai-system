/* THE DRAWER HOLDS EVERY ORDER THE COLLECTION TAB SHOWS WITH A BALANCE —
   ONCE EACH — AND PAST DUE DRAGS FOR ALLOCATION.

   Three office reports, one screen:

   - "Active / Pass due, I want to see how many seedlings in total. past
     due also able to drag" — "for allocation." So each tab chip totals
     the UNCOLLECTED balance of its orders (the Collection tab's own
     Balance column, so the two screens reconcile), and a past-due card
     still owed allocation drags onto a matured-stock row exactly like an
     Active one, through the same allocateOrderToBatch.

   - "This double" — six orders sit in salesweb_customer_orders twice,
     once keyed with a leading "#" (6DS520 / #6DS520 is the live one), and
     every reader counted the order twice. One order per normalised
     number now, the newest row wins, the card says "keyed N times", and
     an allocation written against EITHER duplicate's row id still counts
     (allIds), so the remainder cannot be offered twice.

   - "Any order from picture 2 have balance seedlings should be flow to
     the customer order allocation part" — the drawer's eligibility now
     mirrors the Collection tab's row filter. That brings in the
     credit-terms Pending Payment orders (66,589 pcs were off the drawer
     while the Collection tab showed them), keeps cash+unpaid hidden the
     same as there, and a current-month order already FULLY allocated
     shows as a ✓ card instead of vanishing (15 of them, 8,845 pcs, read
     as lost orders).

   Drives the REAL page in a real browser; the stub records every insert,
   because a stub that swallows a write signs off whatever the page sent.
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

/* Seven salesweb rows, six real orders, against a pinned today of 22 Oct 2026:
     A  — this month, 300 ordered, nothing allocated          -> Active, drags.
     D  — this month, 150 ordered, 150 allocated              -> Active ✓ card, no drag.
     B  — August, 500 ordered, keyed TWICE (B and #ORD-B as B2, older);
          100 allocated against the DUPLICATE row's id        -> ONE Past Due card,
          marked keyed twice, 400 left to drag.
     C  — September, 200 ordered, 200 allocated               -> Past Due, no drag.
     E  — July, 1,000 ordered, CREDIT terms, Pending Payment  -> Past Due, drags.
     F  — this month, 999 ordered, CASH, Pending Payment      -> on no tab at all. */
const SUPA = `window.SHARED_SUPA_URL='x';window.SHARED_SUPA_KEY='y';
(function(){
 window.__inserts=[];
 const T={
  shared_profiles:[{id:'u1',email:'o@m.t',full_name:'J',permissions:{manage_users:true,modules:{operation:'admin'}}}],
  salesweb_customer_orders:[
   {id:'A',order_number:'ORD-A',customer_name:'ALPHA SDN BHD',billing_name:null,total:3000,status:'Processing',created_at:'2026-10-05T02:00:00',payment_terms:'cash',collected_qty:null,collected_at:null},
   {id:'D',order_number:'ORD-D',customer_name:'DELTA ESTATES',billing_name:null,total:1500,status:'Paid',created_at:'2026-10-12T02:00:00',payment_terms:'cash',collected_qty:null,collected_at:null},
   {id:'B',order_number:'ORD-B',customer_name:'BUKIT IMPAS AGRO SDN BHD',billing_name:null,total:5000,status:'Processing',created_at:'2026-08-15T02:00:00',payment_terms:'cash',collected_qty:null,collected_at:null},
   {id:'B2',order_number:'#ORD-B',customer_name:'BUKIT IMPAS AGRO SDN BHD',billing_name:null,total:5000,status:'Processing',created_at:'2026-08-15T01:00:00',payment_terms:'cash',collected_qty:null,collected_at:null},
   {id:'C',order_number:'ORD-C',customer_name:'GAMMA PLANTATION',billing_name:null,total:2000,status:'Processing',created_at:'2026-09-10T02:00:00',payment_terms:'cash',collected_qty:null,collected_at:null},
   {id:'E',order_number:'ORD-E',customer_name:'BINTULU LUMBER DEVELOPMENT',billing_name:null,total:10000,status:'Pending Payment',created_at:'2026-07-01T02:00:00',payment_terms:'credit',collected_qty:null,collected_at:null},
   {id:'F',order_number:'ORD-F',customer_name:'CASH UNPAID TRADING',billing_name:null,total:9990,status:'Pending Payment',created_at:'2026-10-20T02:00:00',payment_terms:'cash',collected_qty:null,collected_at:null}
  ],
  salesweb_order_items:[
   {order_id:'A',quantity:300,unit_price:10,subtotal:3000},
   {order_id:'D',quantity:150,unit_price:10,subtotal:1500},
   {order_id:'B',quantity:500,unit_price:10,subtotal:5000},
   {order_id:'B2',quantity:500,unit_price:10,subtotal:5000},
   {order_id:'C',quantity:200,unit_price:10,subtotal:2000},
   {order_id:'E',quantity:1000,unit_price:10,subtotal:10000},
   {order_id:'F',quantity:999,unit_price:10,subtotal:9990}
  ],
  shared_batch_customer_allocations:[
   {id:'d1',batch_name:'250',plot_name:'U1',order_id:'D',order_number:'ORD-D',customer_name:'DELTA ESTATES',allocated_qty:150},
   {id:'b1',batch_name:'250',plot_name:'U1',order_id:'B2',order_number:'#ORD-B',customer_name:'BUKIT IMPAS AGRO SDN BHD',allocated_qty:100},
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

  // isPastMonthOrder compares against "now" — pin it so July–September stay
  // past months and October stays current, whatever day this test runs on.
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
  // Seven salesweb rows load; the dedupe folds B/B2 into one order.
  await page.waitForFunction('typeof allCustomerOrders !== "undefined" && allCustomerOrders.length >= 6 && batchAllocations.length === 3', null, { timeout: 15000 });
  check(page.url().includes('operation_stock_sales'), 'page loaded without bouncing to the portal');
  const dedup = await page.evaluate(() => ({
    n: allCustomerOrders.length,
    b: (allCustomerOrders.find(o => o.id === 'B' || o.id === 'B2') || {}),
  }));
  check(dedup.n === 6, `seven salesweb rows fold to six real orders (got ${dedup.n})`);
  check(dedup.b.id === 'B' && dedup.b.dupRows === 2, `the newer ORD-B row wins and knows it was keyed twice (got id ${dedup.b.id}, dupRows ${dedup.b.dupRows})`);

  // ── 1. The tabs total the UNCOLLECTED balance, once per real order ───────
  await page.evaluate(() => toggleAllocDrawer());
  // Null-safe on purpose: on the previous page the qty spans do not exist
  // at all, and that must read as FAIL lines rather than a thrown evaluate.
  const tabs = await page.evaluate(() => ({
    activeCount: (document.getElementById('alloc-count-active') || {}).textContent || '(missing)',
    pastCount:   (document.getElementById('alloc-count-past')   || {}).textContent || '(missing)',
    activeQty:   (document.getElementById('alloc-qty-active')   || {}).textContent || '(missing)',
    pastQty:     (document.getElementById('alloc-qty-past')     || {}).textContent || '(missing)',
  }));
  check(tabs.activeCount === '2', `Active counts both current orders with a balance, the fully allocated one included (got ${tabs.activeCount})`);
  check(tabs.pastCount === '3',   `Past Due counts its three — the duplicate once, the credit Pending Payment in (got ${tabs.pastCount})`);
  check(tabs.activeQty === '450 pcs', `Active totals the uncollected 300+150 (got "${tabs.activeQty}")`);
  check(tabs.pastQty === '1,700 pcs', `Past Due totals the uncollected 500+200+1,000 — 500 once, not twice (got "${tabs.pastQty}")`);

  // ── 2. Past Due: who drags, who is settled, who is said twice ────────────
  await page.evaluate(() => switchAllocTab('past'));
  const past = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.order-card.past-due')];
    const of = s => cards.filter(c => c.textContent.includes(s));
    const b = of('BUKIT IMPAS')[0], c = of('GAMMA')[0], e = of('BINTULU')[0];
    const t = el => el ? {
      drag: el.getAttribute('draggable'), grip: !!el.querySelector('.order-card-grip'),
      big: (el.querySelector('.order-card-qty-big') || {}).textContent,
      remark: (el.querySelector('.order-card-remark') || {}).textContent || '',
      dup: (el.querySelector('.order-card-dup') || {}).textContent || '',
    } : null;
    return { count: cards.length, bCards: of('BUKIT IMPAS').length, b: t(b), c: t(c), e: t(e),
             fAnywhere: !!document.querySelector('.alloc-drawer-body') && document.getElementById('alloc-drawer-body').textContent.includes('ORD-F') };
  });
  check(past.count === 3, `three past-due cards, not four (got ${past.count})`);
  check(past.bCards === 1, `ORD-B / #ORD-B is ONE card, not two (got ${past.bCards})`);
  check(past.b && past.b.dup.includes('2 times') && /counted once/i.test(past.b.dup), `and the card says it was keyed twice (got "${past.b && past.b.dup}")`);
  check(past.b && past.b.drag === 'true' && past.b.grip, 'the past-due order with 400 left to allocate is draggable with the grip');
  check(past.b && past.b.big === '500', `its big figure is the UNCOLLECTED 500 (got ${past.b && past.b.big})`);
  check(past.b && /allocate/i.test(past.b.remark) && past.b.remark.includes('400'), `its remark names the 400 the drag will move — the duplicate row's allocation counted (got "${past.b && past.b.remark}")`);
  check(past.c && past.c.drag !== 'true' && /fully allocated/i.test(past.c.remark) && /collect/i.test(past.c.remark), 'a past-due order with nothing left to allocate does not drag and says it waits on collection');
  check(past.e && past.e.drag === 'true', 'a CREDIT-terms Pending Payment order is on the tab and draggable — the invoice flow allocates before payment lands');
  check(past.e && /payment pending/i.test(past.e.dup), `and it says the payment is pending (got "${past.e && past.e.dup}")`);
  check(!past.fAnywhere, 'a CASH unpaid order is on no tab, same as the Collection list hides it');

  // ── 3. Active: the fully allocated order shows as a ✓ card, no drag ──────
  const act = await page.evaluate(() => {
    switchAllocTab('active');
    const cards = [...document.querySelectorAll('#alloc-drawer-body .order-card')];
    const a = cards.filter(c => c.textContent.includes('ALPHA'))[0];
    const d = cards.filter(c => c.textContent.includes('DELTA'))[0];
    return {
      count: cards.length,
      aDrag: a ? a.getAttribute('draggable') : null,
      dDrag: d ? d.getAttribute('draggable') : null,
      dBig:  d ? (d.querySelector('.order-card-qty-big') || {}).textContent : null,
      fAnywhere: document.getElementById('alloc-drawer-body').textContent.includes('ORD-F'),
    };
  });
  check(act.count === 2, `Active shows both current orders with a balance (got ${act.count})`);
  check(act.aDrag === 'true', 'the unallocated Active order still drags exactly as before');
  check(act.dDrag !== 'true' && act.dBig === '✓', `the fully allocated one is a ✓ card and does not drag (got drag ${act.dDrag}, big ${act.dBig})`);
  check(!act.fAnywhere, 'the cash unpaid order is not on Active either');

  // ── 4. The drag carries the UNALLOCATED remainder and the drop writes it ──
  const drop = await page.evaluate(async () => {
    switchAllocTab('past');
    const b = [...document.querySelectorAll('.order-card.past-due')].find(c => c.textContent.includes('BUKIT IMPAS'));
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
  check(drop.dragging && drop.dragging.remaining === 400, `and it carries the unallocated 400 — 500 less the 100 sitting against the DUPLICATE row's id (got ${drop.dragging && drop.dragging.remaining})`);
  check(drop.inserts.length === 1, `the drop wrote exactly one allocation (got ${drop.inserts.length})`);
  const ins = drop.inserts[0] || { row: {} };
  check(ins.table === 'shared_batch_customer_allocations' && ins.row.order_id === 'B' && ins.row.allocated_qty === 400 && ins.row.batch_name === '250' && ins.row.plot_name === 'U2',
    `and it is order B's 400 onto 250/U2 (got ${JSON.stringify(ins.row)})`);
  check(drop.pastQty === '1,700 pcs', 'allocating moves nothing on the Past Due total — the seedlings are still uncollected');

  // ── 5. After the drop the card reads settled ─────────────────────────────
  const after = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.order-card.past-due')].find(c => c.textContent.includes('BUKIT IMPAS'));
    return {
      bDrag: b ? b.getAttribute('draggable') : null,
      bRemark: b ? (b.querySelector('.order-card-remark') || {}).textContent || '' : '',
    };
  });
  check(after.bDrag !== 'true', 'once fully allocated the past-due card stops dragging');
  check(/fully allocated/i.test(after.bRemark), `and its remark flips to waiting on collection (got "${after.bRemark}")`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
