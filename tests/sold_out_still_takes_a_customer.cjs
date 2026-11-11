/* SOLD OUT IS NOT CLOSED, AND THE TITLE ROW CARRIES THE LOCATIONS.

   The office, in four lines on the Monthly Maturity Allocation:

   1. "Customer order monitoring - to do list, remove it."
   2. "Monthly Maturity allocation too many notes, remove it."
   3. "The selection of ALL, UNN1, UNN2 and BNN, make it [same] row with
      the title Monthly Maturity Allocation. And in round button form."
   4. "Sold out still drag-able, just should in grey form Sold out. But if
      Qty transplanted - DO deducted = 0. The customers (drag here) is
      becoming grey and show sold out - closed like now which unable to
      reserved for customer anymore."

   Sold Out is the 10%-culling ESTIMATE used up — After 10% Culling is a
   guess, and seedlings really can still be standing in that 10%. So:

     S1/270 — 1,000 transplanted, est 900, DO 950. Plot Balance −50, so
              SOLD OUT (grey) — but 50 seedlings are really left, so it
              still takes customers. GIL's 30 stays (the flow-back budget
              is the 50 really left, not the −50), and HAN's card dropped
              on it reserves the 20 that remain.
     S2/271 — 500 transplanted, DO 500: nothing left. Sold out — CLOSED,
              the grey zone, and a drag refuses it.
     L1/272 — an ordinary live row, untouched.

   Run: node tests/sold_out_still_takes_a_customer.cjs
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
   {id:'oG',order_number:'ORDG',customer_name:'GIL',billing_name:'',total:60,status:'Processing',payment_terms:'credit',created_at:'2026-10-05T02:00:00',collected_qty:null,collected_at:null},
   {id:'oH',order_number:'ORDH',customer_name:'HAN',billing_name:'',total:200,status:'Processing',payment_terms:'credit',created_at:'2026-10-06T02:00:00',collected_qty:null,collected_at:null}
  ],
  salesweb_order_items:[
   {order_id:'oG',quantity:30,unit_price:2,subtotal:60},
   {order_id:'oH',quantity:100,unit_price:2,subtotal:200}
  ],
  salesweb_order_collections:[],
  shared_collection_bookings:[], shared_al_orders:[],
  shared_inventory_logs:[
   {id:1,transaction_type:'Transplanted',batch_name:'270',plot_name:'S1',breed_name:'DxP',quantity_change:1000,transaction_date:'2026-01-15',created_at:'2026-01-15T02:00:00',remark:''},
   {id:2,transaction_type:'Transplanted',batch_name:'271',plot_name:'S2',breed_name:'DxP',quantity_change:500,transaction_date:'2026-01-16',created_at:'2026-01-16T02:00:00',remark:''},
   {id:3,transaction_type:'Transplanted',batch_name:'272',plot_name:'L1',breed_name:'DxP',quantity_change:1000,transaction_date:'2026-01-17',created_at:'2026-01-17T02:00:00',remark:''},
   {id:4,transaction_type:'Transplanted',batch_name:'273',plot_name:'T1',breed_name:'DxP',quantity_change:1000,transaction_date:'2026-01-18',created_at:'2026-01-18T02:00:00',remark:''},
   {id:5,transaction_type:'Cull3_Transfer',batch_name:'273',plot_name:'T1-R',quantity_change:150,transaction_date:'2026-10-06',created_at:'2026-10-06T02:00:00',remark:'3rd Culling transfer. From: [T1|main] To: [T1-R] Qty: 150. Date: 2026-10-06.'}
  ],
  operation_batch_verifications:[],
  shared_plots:[
   {plot_name:'S1',nursery_name:'UNN 1'},{plot_name:'S2',nursery_name:'UNN 1'},{plot_name:'L1',nursery_name:'BNN'},{plot_name:'T1',nursery_name:'UNN 2'}
  ],
  shared_plot_allocations:[],
  shared_batch_customer_allocations:[
   {id:'AG',batch_name:'270',plot_name:'S1',order_id:'oG',order_number:'ORDG',customer_name:'GIL',allocated_qty:30,updated_at:'2026-10-10T02:00:00'}
  ],
  shared_do_records:[
   {do_number:'D1',al_number:'',total_qty:950,status:'Issued',remark:'',plot_1:'S1',qty_1:950,batch_1:'270'},
   {do_number:'D2',al_number:'',total_qty:500,status:'Issued',remark:'',plot_1:'S2',qty_1:500,batch_1:'271'},
   {do_number:'D3',al_number:'',total_qty:800,status:'Issued',remark:'',plot_1:'T1',qty_1:800,batch_1:'273'}
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
  await page.waitForFunction('document.querySelectorAll("#maturity-rows tr[data-batch-key]").length >= 4', null, { timeout: 15000 });
  // Let the raced loads (orders, allocations) land and the re-render run
  // its flow-back pass.
  await page.waitForTimeout(900);
  check(page.url().includes('operation_stock_sales'), 'page loaded without bouncing to the portal');
  const txt = sel => page.evaluate(`(document.querySelector(${JSON.stringify(sel)})||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()`);
  const cellOf = (plot, i) => page.evaluate(`((${rowOf(plot)})?.children[${i}]?.textContent||'').replace(/\\s+/g,' ').trim()`);
  const chipNames = p => page.evaluate(`(${rowOf(p)})?[...( ${rowOf(p)} ).querySelectorAll('.reserv-chip-name')].map(e=>e.textContent.trim()):null`);

  // ── 1. The To-Do List is gone ───────────────────────────────────────────
  console.log('\n1. The To-Do List is gone, and nothing it called is left behind');
  check(await page.evaluate("!document.getElementById('todo-body') && !document.getElementById('todo-tab-unpaid')"), 'no To-Do list card');
  check(await page.evaluate("!document.getElementById('ci-upload-modal') && !document.getElementById('ci-paid-modal')"), 'its two credit-invoice dialogs went with it');
  check(await page.evaluate("typeof window.loadTodoList === 'undefined' && typeof window.openMarkPaidModal === 'undefined'"), 'and so did the JS behind it (no half-removal)');

  // ── 2. The notes are gone ───────────────────────────────────────────────
  console.log('\n2. The Maturity notes are gone');
  const bodyText = await page.evaluate('document.body.innerText');
  check(!/Notes\s*—\s*Maturity Date/.test(bodyText) && !/= transplant date keyed in the Batch Record/.test(bodyText), 'the Notes paragraph under the table is gone');
  check(!/Drag customer cards onto a row/.test(bodyText), 'and the subtitle under the title');

  // ── 3. The location pills sit on the title row, round ──────────────────
  console.log('\n3. ALL / UNN1 / UNN2 / BNN on the title row, as round buttons');
  const geo = await page.evaluate(`(() => {
    const t = [...document.querySelectorAll('.mat-card-title-text')].find(e => /Monthly Maturity Allocation/.test(e.textContent));
    const b = document.querySelector('#mat-loc-tabs .mat-loc-btn');
    if (!t || !b) return { missing: true };
    const tr = t.getBoundingClientRect(), br = b.getBoundingClientRect();
    return { sameRow: Math.abs((tr.top + tr.bottom) / 2 - (br.top + br.bottom) / 2) < 12,
             inTitle: !!b.closest('.mat-card-title'),
             radius: parseFloat(getComputedStyle(b).borderTopLeftRadius), h: br.height,
             labels: [...document.querySelectorAll('#mat-loc-tabs .mat-loc-btn')].map(x => x.textContent.trim()) };
  })()`);
  check(!geo.missing && geo.inTitle && geo.sameRow, `the pills sit in the title row beside "Monthly Maturity Allocation" — ${JSON.stringify(geo)}`);
  check(!geo.missing && geo.radius >= geo.h / 2 - 1, `and they are ROUND (radius ${geo.radius}px on a ${geo.h}px button)`);
  check(JSON.stringify(geo.labels) === '["ALL","UNN1","UNN2","BNN"]', 'ALL / UNN1 / UNN2 / BNN, in that order');
  check(await page.evaluate(`document.querySelector('#mat-loc-tabs .mat-loc-btn.active')?.dataset.loc`) === 'ALL', 'ALL is the default');

  // ── 4. Sold out on the estimate: grey, and still takes customers ────────
  console.log('\n4. S1 — sold out on the 10% estimate, 50 really left: grey Sold Out, still draggable');
  check((await cellOf('S1', 6)).includes('Sold Out'), 'S1 reads Sold Out');
  const pill = await page.evaluate(`(${rowOf('S1')})?.children[6]?.querySelector('span')?.className || ''`);
  check(/bg-slate-400/.test(pill) && !/bg-red-600/.test(pill), `and the Sold Out pill is GREY — got "${pill}"`);
  check(JSON.stringify(await chipNames('S1')) === '["GIL"]', `GIL's 30 stays on S1 — the budget is the 50 really left, not the −50 balance (got ${JSON.stringify(await chipNames('S1'))})`);
  check(await cellOf('S1', 11) === '20', `After Deduct Reserve reads 20 (50 left − 30 reserved) — got "${await cellOf('S1', 11)}"`);
  check(await page.evaluate(`(${rowOf('S1')})?.dataset.matClosed`) === '0', 'S1 is not closed');

  // Drag HAN's card from the Allocate Orders drawer.
  const hasCard = await page.evaluate(`!!document.querySelector('.order-card[data-order-id="oH"]')`);
  check(hasCard, "HAN's card is on the Allocate Orders drawer");
  await page.evaluate(`document.querySelector('.order-card[data-order-id="oH"]')?.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:new DataTransfer()}))`);
  await page.waitForTimeout(80);
  const marks = await page.evaluate(`['S1','S2','L1'].map(p => { const tr = (${rowOf('__P__')}); return tr ? (tr.classList.contains('drop-target') ? 'target' : tr.classList.contains('drop-disabled') ? 'disabled' : 'none') : 'missing'; })`.replace("'__P__'", 'p'));
  check(marks[0] === 'target', `dragging a card, the sold-out S1 lights as a drop target — got ${marks[0]}`);
  check(marks[1] === 'disabled', `the closed S2 is disabled — got ${marks[1]}`);
  check(marks[2] === 'target', `and the live L1 is a target — got ${marks[2]}`);
  await page.evaluate(`(${rowOf('S1')})?.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}))`);
  await page.waitForTimeout(400);
  const ins = await page.evaluate("window.__inserts.filter(i => i.table === 'shared_batch_customer_allocations').map(i => i.row.plot_name + ':' + i.row.customer_name + ':' + i.row.allocated_qty)");
  check(ins.includes('S1:HAN:20'), `dropping HAN on S1 reserves the 20 really left — got ${JSON.stringify(ins)}`);

  // ── 5. Nothing really left: Sold out — closed ───────────────────────────
  console.log('\n5. S2 — Qty Transplanted − DO Deducted = 0: Sold out — closed');
  check(await page.evaluate(`!!(${rowOf('S2')})?.querySelector('.reserv-empty-locked')`), 'S2 carries the grey locked zone');
  check(/Sold out — closed/.test(await cellOf('S2', 9)), `reading "Sold out — closed" — got "${await cellOf('S2', 9)}"`);
  check(await page.evaluate(`(${rowOf('S2')})?.dataset.matClosed`) === '1', 'and the row says it is closed');
  check(await page.evaluate("typeof matRowLocked === 'function'") , 'the drop gate asks the row whether it is closed');

  // ── 6. The office's own N12: a transfer does not come off the balance ───
  console.log('\n6. T1 — the office\'s N12 shape: Plot Balance = After 10% Culling − DO Deducted, and nothing else');
  /* "Plot balance calculation = After 10% culling qty - DO deducted = Plot
     balance." N12 read -1 because the 440 moved to N12-R came off it too:
     3,337 - 2,898 - 440. T1 is the same shape: 900 - 800 = 100, with 150
     moved to T1-R. It must read 100 and must NOT be Sold Out. */
  check(await cellOf('T1', 8) === '100', `T1's Plot Balance is 900 − 800 = 100, the 150 transferred not taken off — got "${await cellOf('T1', 8)}"`);
  check(!(await cellOf('T1', 6)).includes('Sold Out'), `and T1 is not Sold Out — got "${await cellOf('T1', 6)}"`);
  check(/150 transferred off this plot/.test(await page.evaluate(`(${rowOf('T1')})?.children[8]?.getAttribute('title')||''`)),
    'the transfer is still named in the balance hover');

  console.log('\n' + (fails ? fails + ' FAILED' : 'all checks passed'));
  await browser.close(); server.close();
  process.exit(fails ? 1 : 0);
})();
