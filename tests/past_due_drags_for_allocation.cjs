/* THE DRAWER IS A TO-DO LIST, AND A SPENT ALLOCATION LEAVES THE TABLE.

   The office's rules for the Customer Orders drawer, in their own words,
   over three messages:

   - "Active / Pass due, I want to see how many seedlings in total. past
     due also able to drag" — "for allocation." Each tab chip totals the
     figure its own cards show (Active: pcs still to allocate; Past Due:
     pcs uncollected), and a past-due card drags onto a matured-stock row
     exactly like an Active one, through the same allocateOrderToBatch.

   - "This double" — orders sit in salesweb_customer_orders twice, once
     keyed with a leading "#" (6DS520 / #6DS520 is the live one). One
     order per normalised number, the newest row wins, the card says
     "keyed N times", and an allocation written against EITHER
     duplicate's row id still counts (allIds).

   - "It should be disappear when I allocated. If I delete my allocation
     / my order balance has become 0, it disappear both from this list
     or Monthly Maturity Allocation table." So: a fully allocated order
     LEAVES the drawer the moment the drop lands (no ✓ card), comes back
     if its allocation is removed; and an allocation whose order has
     nothing left to collect (balance at nought — collected, cancelled
     or closed) is SPENT: allocsForBatch hides it, so the chip, the
     Reserved Qty and After Deduct Reserve all drop it at once. Hidden,
     never deleted — cancel the DO and the balance comes back, and the
     reservation stands again by itself.

   Eligibility mirrors the Collection tab's row filter: credit-terms
   Pending Payment orders are in (66,589 pcs were off the drawer while
   that tab showed them), cash + unpaid stays hidden.

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

/* Eight salesweb rows, seven real orders, against a pinned today of 22 Oct 2026:
     A  — this month, 300 ordered, nothing allocated          -> Active, drags.
     D  — this month, 150 ordered, 150 allocated              -> OFF the drawer
          (fully allocated disappears); its chip STAYS on the table (still owed).
     B  — August, 500 ordered, keyed TWICE (B and #ORD-B as B2, older);
          100 allocated against the DUPLICATE row's id        -> ONE Past Due
          card, marked keyed twice, 400 left to drag.
     C  — September, 200 ordered, 200 allocated               -> OFF the drawer;
          chip stays (uncollected).
     E  — July, 1,000 ordered, CREDIT terms, Pending Payment  -> Past Due, drags.
     F  — this month, 999 ordered, CASH, Pending Payment      -> on no tab.
     G  — September, 400 ordered, 400 COLLECTED (balance 0), 300 allocated
          -> off the drawer AND its allocation is SPENT: hidden from the
          maturity table and its Reserved total. */
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
   {id:'F',order_number:'ORD-F',customer_name:'CASH UNPAID TRADING',billing_name:null,total:9990,status:'Pending Payment',created_at:'2026-10-20T02:00:00',payment_terms:'cash',collected_qty:null,collected_at:null},
   {id:'G',order_number:'ORD-G',customer_name:'GOLDEN HARVEST COLLECTED',billing_name:null,total:4000,status:'Paid',created_at:'2026-09-05T02:00:00',payment_terms:'cash',collected_qty:400,collected_at:'2026-10-10T02:00:00'}
  ],
  salesweb_order_items:[
   {order_id:'A',quantity:300,unit_price:10,subtotal:3000},
   {order_id:'D',quantity:150,unit_price:10,subtotal:1500},
   {order_id:'B',quantity:500,unit_price:10,subtotal:5000},
   {order_id:'B2',quantity:500,unit_price:10,subtotal:5000},
   {order_id:'C',quantity:200,unit_price:10,subtotal:2000},
   {order_id:'E',quantity:1000,unit_price:10,subtotal:10000},
   {order_id:'F',quantity:999,unit_price:10,subtotal:9990},
   {order_id:'G',quantity:400,unit_price:10,subtotal:4000}
  ],
  shared_batch_customer_allocations:[
   {id:'d1',batch_name:'250',plot_name:'U1',order_id:'D',order_number:'ORD-D',customer_name:'DELTA ESTATES',allocated_qty:150},
   {id:'b1',batch_name:'250',plot_name:'U1',order_id:'B2',order_number:'#ORD-B',customer_name:'BUKIT IMPAS AGRO SDN BHD',allocated_qty:100},
   {id:'c1',batch_name:'250',plot_name:'U1',order_id:'C',order_number:'ORD-C',customer_name:'GAMMA PLANTATION',allocated_qty:200},
   {id:'g1',batch_name:'250',plot_name:'U1',order_id:'G',order_number:'ORD-G',customer_name:'GOLDEN HARVEST COLLECTED',allocated_qty:300}
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
  // Eight salesweb rows load; the dedupe folds B/B2 into one order.
  await page.waitForFunction('typeof allCustomerOrders !== "undefined" && allCustomerOrders.length >= 7 && batchAllocations.length === 4', null, { timeout: 15000 });
  check(page.url().includes('operation_stock_sales'), 'page loaded without bouncing to the portal');
  const dedup = await page.evaluate(() => ({
    n: allCustomerOrders.length,
    b: (allCustomerOrders.find(o => o.id === 'B' || o.id === 'B2') || {}),
  }));
  check(dedup.n === 7, `eight salesweb rows fold to seven real orders (got ${dedup.n})`);
  check(dedup.b.id === 'B' && dedup.b.dupRows === 2, `the newer ORD-B row wins and knows it was keyed twice (got id ${dedup.b.id}, dupRows ${dedup.b.dupRows})`);

  // ── 1. The tabs hold only orders still owed allocation, and total them ───
  await page.evaluate(() => toggleAllocDrawer());
  // Null-safe on purpose: on the previous page the qty spans do not exist
  // at all, and that must read as FAIL lines rather than a thrown evaluate.
  const tabs = await page.evaluate(() => ({
    activeCount: (document.getElementById('alloc-count-active') || {}).textContent || '(missing)',
    pastCount:   (document.getElementById('alloc-count-past')   || {}).textContent || '(missing)',
    activeQty:   (document.getElementById('alloc-qty-active')   || {}).textContent || '(missing)',
    pastQty:     (document.getElementById('alloc-qty-past')     || {}).textContent || '(missing)',
  }));
  check(tabs.activeCount === '1', `Active counts only the order still owed allocation — the fully allocated one is OFF the list (got ${tabs.activeCount})`);
  check(tabs.pastCount === '2',   `Past Due counts its two — the allocated one and the collected one gone, the duplicate once, the credit Pending Payment in (got ${tabs.pastCount})`);
  check(tabs.activeQty === '300 pcs', `Active totals what its cards show: 300 pcs to allocate (got "${tabs.activeQty}")`);
  check(tabs.pastQty === '1,500 pcs', `Past Due totals what its cards show: 500 + 1,000 pcs uncollected (got "${tabs.pastQty}")`);

  // ── 2. Past Due: who is on it, who drags, who is said twice ──────────────
  await page.evaluate(() => switchAllocTab('past'));
  const past = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.order-card.past-due')];
    const of = s => cards.filter(c => c.textContent.includes(s));
    const b = of('BUKIT IMPAS')[0], e = of('BINTULU')[0];
    const t = el => el ? {
      drag: el.getAttribute('draggable'), grip: !!el.querySelector('.order-card-grip'),
      big: (el.querySelector('.order-card-qty-big') || {}).textContent,
      remark: (el.querySelector('.order-card-remark') || {}).textContent || '',
      dup: (el.querySelector('.order-card-dup') || {}).textContent || '',
    } : null;
    const body = document.getElementById('alloc-drawer-body').textContent;
    return { count: cards.length, bCards: of('BUKIT IMPAS').length, b: t(b), e: t(e),
             gammaThere: body.includes('GAMMA'), goldenThere: body.includes('GOLDEN'), fThere: body.includes('ORD-F') };
  });
  check(past.count === 2, `two past-due cards (got ${past.count})`);
  check(!past.gammaThere, 'a past order fully allocated has DISAPPEARED from the list');
  check(!past.goldenThere, 'a past order already collected (balance 0) has disappeared too');
  check(!past.fThere, 'a CASH unpaid order is on no tab, same as the Collection list hides it');
  check(past.bCards === 1, `ORD-B / #ORD-B is ONE card, not two (got ${past.bCards})`);
  check(past.b && past.b.dup.includes('2 times') && /counted once/i.test(past.b.dup), `and the card says it was keyed twice (got "${past.b && past.b.dup}")`);
  check(past.b && past.b.drag === 'true' && past.b.grip, 'the past-due order with 400 left to allocate is draggable with the grip');
  check(past.b && past.b.big === '500', `its big figure is the UNCOLLECTED 500 (got ${past.b && past.b.big})`);
  check(past.b && /allocate/i.test(past.b.remark) && past.b.remark.includes('400'), `its remark names the 400 the drag will move — the duplicate row's allocation counted (got "${past.b && past.b.remark}")`);
  check(past.e && past.e.drag === 'true', 'a CREDIT-terms Pending Payment order is on the tab and draggable — the invoice flow allocates before payment lands');
  check(past.e && /payment pending/i.test(past.e.dup), `and it says the payment is pending (got "${past.e && past.e.dup}")`);

  // ── 3. Active holds only the unallocated order ───────────────────────────
  const act = await page.evaluate(() => {
    switchAllocTab('active');
    const cards = [...document.querySelectorAll('#alloc-drawer-body .order-card')];
    return {
      count: cards.length,
      aDrag: cards[0] ? cards[0].getAttribute('draggable') : null,
      aIsAlpha: cards[0] ? cards[0].textContent.includes('ALPHA') : false,
      deltaThere: document.getElementById('alloc-drawer-body').textContent.includes('DELTA'),
    };
  });
  check(act.count === 1 && act.aIsAlpha && act.aDrag === 'true', `Active is the one unallocated order, draggable (got ${act.count} cards)`);
  check(!act.deltaThere, 'the fully allocated current order has disappeared from Active');

  // ── 4. A SPENT allocation leaves the maturity table, and only that one ───
  const spent = await page.evaluate(() => {
    const live1 = allocsForBatch('250||U1').map(a => a.id).sort();
    const g = allocIsSpent(batchAllocations.find(a => a.id === 'g1'));
    const d = allocIsSpent(batchAllocations.find(a => a.id === 'd1'));
    const b = orderForAlloc(batchAllocations.find(a => a.id === 'b1'));
    // The balance coming back (a cancelled DO) brings the reservation
    // back by itself — hidden, never deleted.
    const ordG = allCustomerOrders.find(o => o.id === 'G');
    ordG.balance = 200;
    const live2 = allocsForBatch('250||U1').map(a => a.id).sort();
    ordG.balance = 0;
    return { live1, live2, g, d, bId: b && b.id };
  });
  check(spent.g === true, 'an allocation whose order balance is 0 is SPENT');
  check(spent.d === false, 'one whose order is merely fully allocated (still owed) is not');
  check(spent.live1.join(',') === 'b1,c1,d1', `allocsForBatch hides the spent chip and keeps the owed ones — Reserved Qty and the drop balance read the same door (got ${spent.live1.join(',')})`);
  check(spent.live2.join(',') === 'b1,c1,d1,g1', 'and the reservation comes BACK by itself when the balance returns — hidden, never deleted');
  check(spent.bId === 'B', 'an allocation saved against the duplicate keying still finds its order');

  // ── 5. The drop writes the remainder and the card disappears ─────────────
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
    return {
      dragging, inserts: window.__inserts,
      bStill: document.getElementById('alloc-drawer-body').textContent.includes('BUKIT IMPAS'),
      pastCount: document.getElementById('alloc-count-past').textContent,
      pastQty:   document.getElementById('alloc-qty-past').textContent,
    };
  });
  check(drop.dragging && drop.dragging.orderId === 'B', 'dragstart on the past-due card arms the same _draggingOrder the Active cards use');
  check(drop.dragging && drop.dragging.remaining === 400, `and it carries the unallocated 400 — 500 less the 100 against the DUPLICATE row's id (got ${drop.dragging && drop.dragging.remaining})`);
  check(drop.inserts.length === 1, `the drop wrote exactly one allocation (got ${drop.inserts.length})`);
  const ins = drop.inserts[0] || { row: {} };
  check(ins.table === 'shared_batch_customer_allocations' && ins.row.order_id === 'B' && ins.row.allocated_qty === 400 && ins.row.batch_name === '250' && ins.row.plot_name === 'U2',
    `and it is order B's 400 onto 250/U2 (got ${JSON.stringify(ins.row)})`);
  check(!drop.bStill, 'the moment the drop fully allocates the order, its card DISAPPEARS — "It should be disappear when I allocated"');
  check(drop.pastCount === '1' && drop.pastQty === '1,000 pcs', `and the tab moves with it (got ${drop.pastCount} · "${drop.pastQty}")`);

  // ── 6. Removing the allocation brings the order back to the list ─────────
  const back = await page.evaluate(async () => {
    const added = window.__inserts[0].row.id;
    await removeAllocation(added);
    switchAllocTab('past');
    return {
      bBack: document.getElementById('alloc-drawer-body').textContent.includes('BUKIT IMPAS'),
      pastCount: document.getElementById('alloc-count-past').textContent,
    };
  });
  check(back.bBack && back.pastCount === '2', `deleting the allocation puts the order back on the list — the work is owed again (got back ${back.bBack}, count ${back.pastCount})`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
