/* THE CUSTOMER FLOWS BACK TO THE POOL, AND THE TABLE LOST A COLUMN AND
   GREW ITS BUTTONS AND ITS FROZEN HEAD.

   Five asks from the office, one screen (Monthly Maturity Allocation):

   1. "If plot balance has not enough for customer (drag here) reservation
      qty. Pls let the customer flow back to allocate orders button." — an
      allocation the plot balance can no longer cover is RELEASED: the
      chip leaves the row, the record is deleted, and the order reappears
      in the Allocate Orders drawer (which lists an order while anything
      is unallocated). The OLDEST chip keeps its promise; a chip with a
      collection against it never bounces; a strip under the table names
      who flowed back.
   2. "Culled plot the 'Drop card here' will become gray zone and we
      unable to drag the customer to the column." — the empty allocation
      cell on a Culled (or Sold Out) row is a gray locked zone, and the
      row is refused as a drop target by STATUS, not only by arithmetic.
   3. "Remove the Location under Production, create a button at the top
      there : ALL, UNN1, UNN2, BNN. Always showed ALL as default." — the
      column is gone, the buttons filter the list, ALL is the default.
   4. "Remove Nursery status dashboard & available for sales" — both
      cards and their JS (loadNsd, the gearing slider) are gone.
   5. "Freeze the ... production / plot status / customer allocation that
      line" — the table wrapper scrolls vertically and BOTH header lines
      are sticky, the column line offset below the group line.

   Fixture (today pinned 22 Oct 2026; January transplants mature +9
   months onto the October tab the page opens on):
     U1/260 — 1,800 est, DO 1,600 → balance 200; ACME reserved 500,
              nothing collected → FLOWS BACK.
     U2/260 — 900; BOB 400 (older) fits and stays, CARA 600 (newer) no
              longer fits → flows back.
     B5/261 — 900, DO 850 → balance 50; DAN stored 300 with 200 collected
              (live 100 > 50) → STAYS, After Deduct Reserve reads red.
     N1/262 — fully culled (drone qty keyed + row signed) → CULLED; EVE's
              uncollected 100 flows back and the cell is the gray zone.
     N2/262 — plain live row, still offers the 🎯 target.

   Drives the REAL page in a real browser.
   Run: node tests/the_customer_flows_back_to_the_pool.cjs
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

const SUPA = `window.SHARED_SUPA_URL='x';window.SHARED_SUPA_KEY='y';
(function(){
 window.__inserts=[];window.__writes=[];window.__deletes=[];
 const T={
  shared_profiles:[{id:'u1',email:'o@m.t',full_name:'J',permissions:{manage_users:true,modules:{operation:'admin'}}}],
  salesweb_customer_orders:[
   {id:'o1',order_number:'ORD1',customer_name:'ACME',billing_name:'',total:1000,status:'Processing',payment_terms:'credit',created_at:'2026-10-05T02:00:00',collected_qty:null,collected_at:null},
   {id:'o2',order_number:'ORD2',customer_name:'BOB',billing_name:'',total:800,status:'Processing',payment_terms:'credit',created_at:'2026-10-06T02:00:00',collected_qty:null,collected_at:null},
   {id:'o3',order_number:'ORD3',customer_name:'CARA',billing_name:'',total:1200,status:'Processing',payment_terms:'credit',created_at:'2026-10-07T02:00:00',collected_qty:null,collected_at:null},
   {id:'o4',order_number:'ORD4',customer_name:'DAN',billing_name:'',total:600,status:'Processing',payment_terms:'credit',created_at:'2026-10-08T02:00:00',collected_qty:null,collected_at:null},
   {id:'o5',order_number:'ORD5',customer_name:'EVE',billing_name:'',total:200,status:'Processing',payment_terms:'credit',created_at:'2026-10-09T02:00:00',collected_qty:null,collected_at:null}
  ],
  salesweb_order_items:[
   {order_id:'o1',quantity:500,unit_price:2,subtotal:1000},
   {order_id:'o2',quantity:400,unit_price:2,subtotal:800},
   {order_id:'o3',quantity:600,unit_price:2,subtotal:1200},
   {order_id:'o4',quantity:300,unit_price:2,subtotal:600},
   {order_id:'o5',quantity:100,unit_price:2,subtotal:200}
  ],
  salesweb_order_collections:[
   {order_id:'o4',collected_qty:200,collected_at:'2026-10-15T02:00:00'}
  ],
  shared_collection_bookings:[], shared_al_orders:[],
  shared_inventory_logs:[
   {id:1,transaction_type:'Transplanted',batch_name:'260',plot_name:'U1',breed_name:'DxP',quantity_change:2000,transaction_date:'2026-01-15',created_at:'2026-01-15T02:00:00',remark:''},
   {id:2,transaction_type:'Transplanted',batch_name:'260',plot_name:'U2',breed_name:'DxP',quantity_change:1000,transaction_date:'2026-01-20',created_at:'2026-01-20T02:00:00',remark:''},
   {id:3,transaction_type:'Transplanted',batch_name:'261',plot_name:'B5',breed_name:'DxP',quantity_change:1000,transaction_date:'2026-01-10',created_at:'2026-01-10T02:00:00',remark:''},
   {id:4,transaction_type:'Transplanted',batch_name:'262',plot_name:'N1',breed_name:'DxP',quantity_change:1000,transaction_date:'2026-01-12',created_at:'2026-01-12T02:00:00',remark:''},
   {id:5,transaction_type:'Transplanted',batch_name:'262',plot_name:'N2',breed_name:'DxP',quantity_change:500,transaction_date:'2026-01-18',created_at:'2026-01-18T02:00:00',remark:''},
   {id:6,transaction_type:'3rd_Culling',batch_name:'262',plot_name:'N1',quantity_change:900,created_at:'2026-09-01T02:00:00',remark:'3rd Culling. DestType: main MapQty: 900 CullDate:2026-09-01'},
   {id:7,transaction_type:'Row_Verification',batch_name:'262',plot_name:'cull_3::N1|main',quantity_change:0,created_at:'2026-09-10T02:00:00',remark:'Row verified: N1|main'}
  ],
  operation_batch_verifications:[],
  shared_plots:[
   {plot_name:'U1',nursery_name:'UNN 1'},{plot_name:'U2',nursery_name:'UNN 1'},
   {plot_name:'B5',nursery_name:'BNN'},
   {plot_name:'N1',nursery_name:'UNN 2'},{plot_name:'N2',nursery_name:'UNN 2'}
  ],
  shared_plot_allocations:[],
  shared_batch_customer_allocations:[
   {id:'A1',batch_name:'260',plot_name:'U1',order_id:'o1',order_number:'ORD1',customer_name:'ACME',allocated_qty:500,updated_at:'2026-10-10T02:00:00'},
   {id:'A2',batch_name:'260',plot_name:'U2',order_id:'o2',order_number:'ORD2',customer_name:'BOB',allocated_qty:400,updated_at:'2026-10-11T02:00:00'},
   {id:'A3',batch_name:'260',plot_name:'U2',order_id:'o3',order_number:'ORD3',customer_name:'CARA',allocated_qty:600,updated_at:'2026-10-12T02:00:00'},
   {id:'A4',batch_name:'261',plot_name:'B5',order_id:'o4',order_number:'ORD4',customer_name:'DAN',allocated_qty:300,updated_at:'2026-10-13T02:00:00'},
   {id:'A5',batch_name:'262',plot_name:'N1',order_id:'o5',order_number:'ORD5',customer_name:'EVE',allocated_qty:100,updated_at:'2026-10-14T02:00:00'}
  ],
  shared_do_records:[
   {do_number:'D1',al_number:'',total_qty:1600,status:'Issued',remark:'',plot_1:'U1',qty_1:1600,batch_1:'260'},
   {do_number:'D2',al_number:'',total_qty:850,status:'Issued',remark:'',plot_1:'B5',qty_1:850,batch_1:'261'}
  ],
  operation_nurseries:[], audit_height_records:[]
 };
 let seq=1;
 window.supabase={createClient:()=>({
  from(table){ const st={f:[],ins:[],rng:null,single:false,inserted:null,del:false};
   const api=new Proxy({},{get(_,k){
    if(k==='then') return (res,rej)=>{
      if(st.del){
        const before=(T[table]||[]).length;
        T[table]=(T[table]||[]).filter(r=>!st.f.every(([c,v])=>String(r[c])===String(v)));
        window.__deletes.push({table,filters:st.f,removed:before-(T[table]||[]).length});
        return new Promise(r=>setTimeout(()=>r({data:null,error:null}),5)).then(res,rej); }
      if(st.inserted){ const row={id:'ins-'+(seq++),...st.inserted};
        (T[table]=T[table]||[]).push(row);
        window.__inserts.push({table,row});
        return new Promise(r=>setTimeout(()=>r({data:st.single?row:[row],error:null}),5)).then(res,rej); }
      let rows=(T[table]||[]).filter(r=>st.f.every(([c,v])=>String(r[c])===String(v))&&st.ins.every(([c,vs])=>vs.includes(r[c])));
      if(st.rng) rows=rows.slice(st.rng[0],st.rng[1]+1); else rows=rows.slice(0,1000);
      return new Promise(r=>setTimeout(()=>r({data:st.single?(rows[0]??null):rows,error:null,count:rows.length}),5)).then(res,rej);};
    if(k==='insert') return (p)=>{st.inserted=p;return api;};
    if(k==='delete') return ()=>{st.del=true;return api;};
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

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 1700, height: 900 } });
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
  // Let the raced loads (orders, allocations) land and the re-render run
  // its flow-back pass.
  await page.waitForTimeout(900);
  check(page.url().includes('operation_stock_sales'), 'page loaded without bouncing to the portal');

  // ── 1. The customer the balance cannot cover FLOWS BACK ─────────────────
  console.log('\n1. Plot balance short of the reservation — the customer flows back to Allocate Orders');
  const chipNames = p => page.evaluate(`(${rowOf(p)})?[...( ${rowOf(p)} ).querySelectorAll('.reserv-chip-name')].map(e=>e.textContent.trim()):null`);
  check(JSON.stringify(await chipNames('U1')) === '[]',
    `ACME's 500 left U1 (balance 200 cannot cover it) — got ${JSON.stringify(await chipNames('U1'))}`);
  const deletes = await page.evaluate('window.__deletes.filter(d=>d.table==="shared_batch_customer_allocations").map(d=>d.filters.map(f=>f[1]).join())');
  check(deletes.includes('A1'), `the A1 allocation record was DELETED — got ${JSON.stringify(deletes)}`);
  const strip = await page.evaluate('(document.getElementById("maturity-released")||{}).textContent || ""');
  const stripHidden = await page.evaluate('document.getElementById("maturity-released")?.classList.contains("hidden")');
  check(stripHidden === false && /Flowed back to Allocate Orders/.test(strip) && /ACME/.test(strip),
    `the strip under the table says ACME flowed back — got "${strip.slice(0, 120)}"`);
  // The pool is derived from what is unallocated, so the card reappears
  // in the drawer by itself.
  await page.evaluate('toggleAllocDrawer()');
  await page.waitForTimeout(200);
  const drawer = await page.evaluate('document.getElementById("alloc-drawer-body").textContent');
  check(/ACME/.test(drawer), 'ACME is back on the Allocate Orders drawer (the floating icon), ready to redo');
  check(/CARA/.test(drawer), 'and so is CARA, bounced off U2 below');
  await page.evaluate('toggleAllocDrawer()');

  console.log('\n   The OLDEST chip keeps its promise; the newer one bounces');
  check(JSON.stringify(await chipNames('U2')) === '["BOB"]',
    `U2 (900) keeps BOB's 400 and released CARA's 600 — got ${JSON.stringify(await chipNames('U2'))}`);
  check(deletes.includes('A3') && !deletes.includes('A2'), 'A3 (CARA) deleted, A2 (BOB) untouched');

  console.log('\n   A chip with a COLLECTION against it never bounces');
  check(JSON.stringify(await chipNames('B5')) === '["DAN"]',
    `DAN is still on B5 — a customer already collecting is the office's to move — got ${JSON.stringify(await chipNames('B5'))}`);
  check(!deletes.includes('A4'), 'A4 (DAN) was not deleted');
  const b5adr = await page.evaluate(`(${rowOf('B5')}).querySelectorAll('td')[11].textContent.trim()`);
  check(b5adr === '-50', `B5's After Deduct Reserve reads the red -50 — got "${b5adr}"`);

  console.log('\n   A second render releases nothing more');
  const delCount = await page.evaluate('window.__deletes.length');
  await page.evaluate('renderMaturityTable()');
  await page.waitForTimeout(300);
  check(await page.evaluate('window.__deletes.length') === delCount, 'no further deletes on a re-render — the pass is settled');

  // ── 2. A culled plot is a gray zone, not a drop target ──────────────────
  console.log('\n2. The culled plot: gray zone, and refused as a drop target');
  const n1status = await page.evaluate(`(${rowOf('N1')}).dataset.matStatus`);
  check(n1status === 'culled', `N1 reads CULLED — got "${n1status}"`);
  check(deletes.includes('A5'), "EVE's uncollected 100 flowed back off the culled plot");
  const n1zone = await page.evaluate(`(${rowOf('N1')}).querySelector('.reserv-empty-locked')?.textContent.trim() || null`);
  check(/Culled/i.test(n1zone || ''), `its allocation cell is the gray locked zone — got ${JSON.stringify(n1zone)}`);
  check(await page.evaluate(`!(${rowOf('N1')}).querySelector('.reserv-empty-emoji')`), 'and carries no 🎯 Drop card here target');
  check(await page.evaluate(`!!(${rowOf('N2')}).querySelector('.reserv-empty-emoji')`), 'while the live N2 beside it still offers the target');

  // Drag BOB's chip: N2 lights as a target, the culled N1 is disabled by
  // STATUS — the explicit MAT_DROP_LOCKED gate, not an arithmetic accident.
  await page.evaluate(`(${rowOf('U2')}).querySelector('.reserv-chip').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:new DataTransfer()}))`);
  check(await page.evaluate(`(${rowOf('N1')}).classList.contains('drop-disabled')`), 'dragging a chip, the culled row is drop-disabled');
  check(await page.evaluate(`(${rowOf('N2')}).classList.contains('drop-target')`), 'and the live row is a drop target');
  await page.evaluate(`(${rowOf('U2')}).querySelector('.reserv-chip').dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:new DataTransfer()}))`);
  // typeof-guarded: the previous build has no MAT_DROP_LOCKED, and a bare
  // read would take the harness down with every check underneath never
  // asked — the trap the house notes name.
  const srcHasLock = await page.evaluate("typeof MAT_DROP_LOCKED !== 'undefined' ? MAT_DROP_LOCKED.join() : 'no gate'");
  // Sold Out left this list: a sold-out row still takes customers against
  // the seedlings really left, and only a row with NOTHING left closes —
  // that is data-mat-closed, held by sold_out_still_takes_a_customer.cjs.
  check(srcHasLock === 'finished,culled', `the status gate names the two status locks — got "${srcHasLock}"`);

  // ── 3. The Location column became the ALL / UNN1 / UNN2 / BNN buttons ──
  console.log('\n3. Location is buttons at the top, ALL by default — the column is gone');
  const heads = await page.evaluate(`[...document.querySelectorAll('.mat-table thead tr:not(.mat-group-row) th')].map(t=>t.textContent.trim())`);
  check(!heads.includes('Location'), `no Location column in the head — got ${JSON.stringify(heads.slice(0, 4))}…`);
  check(await page.evaluate(`document.getElementById('mat-th-prod-group').colSpan`) === 6, 'the Production group spans 6');
  const locBtns = await page.evaluate(`[...document.querySelectorAll('#mat-loc-tabs .mat-loc-btn')].map(b=>b.textContent.trim())`);
  check(JSON.stringify(locBtns) === '["ALL","UNN1","UNN2","BNN"]', `the four buttons read ALL / UNN1 / UNN2 / BNN — got ${JSON.stringify(locBtns)}`);
  check(await page.evaluate(`document.querySelector('#mat-loc-tabs .mat-loc-btn.active')?.dataset.loc`) === 'ALL', 'ALL is the default');

  const shownPlots = () => page.evaluate(`[...document.querySelectorAll('#maturity-rows tr[data-batch-key]')].map(t=>t.dataset.plotName).sort()`);
  check(JSON.stringify(await shownPlots()) === '["B5","N1","N2","U1","U2"]', 'ALL shows every row');
  await page.evaluate(`document.querySelector('#mat-loc-tabs [data-loc="UNN1"]')?.click()`);
  await page.waitForTimeout(200);
  check(JSON.stringify(await shownPlots()) === '["U1","U2"]', `UNN1 cuts the list to U1 and U2 (Seedling Stock spells it "UNN 1") — got ${JSON.stringify(await shownPlots())}`);
  const unn1Foot = await page.evaluate(`document.getElementById('maturity-foot').textContent`);
  check(/2 rows/.test(unn1Foot), 'and the foot totals the 2 filtered rows');
  await page.evaluate(`document.querySelector('#mat-loc-tabs [data-loc="BNN"]')?.click()`);
  await page.waitForTimeout(200);
  check(JSON.stringify(await shownPlots()) === '["B5"]', 'BNN shows B5 alone');
  await page.evaluate(`document.querySelector('#mat-loc-tabs [data-loc="ALL"]')?.click()`);
  await page.waitForTimeout(200);
  check(JSON.stringify(await shownPlots()) === '["B5","N1","N2","U1","U2"]', 'back on ALL, every row returns');

  // ── 4. The two cards are gone ────────────────────────────────────────────
  console.log('\n4. Nursery Status Dashboard & Available for Sales are gone');
  check(await page.evaluate(`!document.getElementById('gearing-slider')`), 'no gearing slider');
  check(await page.evaluate(`!document.getElementById('nsd-card')`), 'no Nursery Status Dashboard card');
  // body.innerText reads the rendered DOM, so the explanatory HTML comment
  // where the cards stood does not answer — the comment-trap this codebase
  // keeps meeting, dodged by not reading the source at all.
  const bodyText = await page.evaluate('document.body.innerText');
  check(!/Available for Sales/i.test(bodyText), 'no Available for Sales text anywhere on screen');
  check(await page.evaluate('typeof window.loadNsd') === 'undefined', 'loadNsd went with the markup (no half-removal)');

  // ── 5. The header lines are frozen ──────────────────────────────────────
  console.log('\n5. The group line and the title line freeze while the rows scroll');
  // Every evaluate here is null-guarded: on the previous page .mat-scroll
  // does not exist, and a throw would kill the harness with the checks
  // underneath never asked — a test that dies on the previous code proves
  // nothing about it.
  const wrap = await page.evaluate(`(() => { const w = document.querySelector('.mat-scroll');
    if (!w) return { oy: 'no .mat-scroll wrapper', mh: 'none' };
    const cs = getComputedStyle(w);
    return { oy: cs.overflowY, mh: cs.maxHeight }; })()`);
  check(wrap.oy === 'auto' && wrap.mh !== 'none', `the table wrapper scrolls vertically (overflow-y ${wrap.oy}, max-height ${wrap.mh})`);
  const sticky = await page.evaluate(`(() => {
    const g = document.querySelector('.mat-table thead tr.mat-group-row th');
    const c = document.querySelector('.mat-table thead tr:not(.mat-group-row) th');
    if (!g || !c) return { gPos: 'no header row', gTop: '-', cPos: 'no header row', cTop: 0 };
    return { gPos: getComputedStyle(g).position, gTop: getComputedStyle(g).top,
             cPos: getComputedStyle(c).position, cTop: parseFloat(getComputedStyle(c).top) }; })()`);
  check(sticky.gPos === 'sticky' && sticky.gTop === '0px', `the group line sticks at the top — got ${sticky.gPos}/${sticky.gTop}`);
  check(sticky.cPos === 'sticky' && sticky.cTop > 0, `the title line sticks BELOW it, at the group line's measured height — got top ${sticky.cTop}px`);
  // Shrink the window so the five-row fixture genuinely overflows the
  // 72vh wrapper, then scroll it and ask whether the two lines held — a
  // computed 'sticky' over a wrapper that never scrolls proves nothing.
  await page.setViewportSize({ width: 1700, height: 420 });
  await page.waitForTimeout(200);
  const held = await page.evaluate(`(() => {
    const w = document.querySelector('.mat-scroll');
    if (!w) return 'no .mat-scroll wrapper';
    const g0 = document.querySelector('.mat-table thead tr.mat-group-row th');
    const c0 = document.querySelector('.mat-table thead tr:not(.mat-group-row) th');
    if (!g0 || !c0) return 'no header rows';
    w.scrollTop = 99999;
    if (!w.scrollTop) return 'did-not-scroll';
    const wTop = w.getBoundingClientRect().top;
    const g = document.querySelector('.mat-table thead tr.mat-group-row th').getBoundingClientRect();
    const c = document.querySelector('.mat-table thead tr:not(.mat-group-row) th').getBoundingClientRect();
    return (g.top >= wTop - 1 && c.top >= g.bottom - 2) ? 'held' : 'scrolled-away (' + g.top + '/' + c.top + ' vs ' + wTop + ')';
  })()`);
  check(held === 'held', `scrolled down, the titles hold — got "${held}"`);

  console.log('\n' + (fails ? fails + ' FAILED' : 'all checks passed'));
  await browser.close(); server.close();
  process.exit(fails ? 1 : 0);
})();
