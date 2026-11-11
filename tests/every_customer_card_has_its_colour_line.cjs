/* EVERY CARD ON THE CUSTOMER PANE HAS ITS COLOUR LINE.

   The office: "Make my Customer order management outer box same with
   Order Monitoring Dashboard or This Week's Scheduled Collection. It has a
   colour outer line. Make my customer order management same as well.
   Future new card added, standardise the UI as current."

   So this holds the STANDARD rather than one card: every top-level card on
   the Customer pane is a .metric-card with border-l-4 and a border-*-500
   colour, opening on the icon-tile header (an icon in a w-7 h-7 tile and
   an uppercase title). A card added later that skips any of it fails here
   by name. The colours must differ, or two cards read as one.

   Customer Order Management is NOT overflow-hidden like its neighbours: its
   All Orders filter hangs below its button, and the check opens the real
   menu and asks that its last option is the thing on screen there.

   Run: node tests/every_customer_card_has_its_colour_line.cjs
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

  console.log('\n1. Every card on the Customer pane is the standard card');
  const cards = await page.evaluate(() => [...document.querySelectorAll('#ssm-pane-customer > div')].map(c => {
    const cls = c.className || '';
    const accent = (cls.match(/\bborder-([a-z]+)-500\b/) || [])[1] || '';
    const tile = c.querySelector(':scope > div:first-child .w-7.h-7');
    const title = (c.querySelector(':scope > div:first-child span.uppercase') || {}).textContent || '';
    return { title: title.trim(), metric: /\bmetric-card\b/.test(cls), line: /\bborder-l-4\b/.test(cls), accent, tile: !!tile };
  }));
  check(cards.length >= 3, `the pane holds its cards — got ${cards.map(c => c.title || '(untitled)').join(', ')}`);
  cards.forEach(c => {
    check(c.metric && c.line && c.accent, `"${c.title || '(untitled card)'}" is a metric-card with border-l-4 and a colour line — got ${JSON.stringify(c)}`);
    check(c.tile && c.title, `"${c.title || '(untitled card)'}" opens on the icon-tile header`);
  });
  const cust = cards.find(c => /Customer Order Management/i.test(c.title));
  check(!!cust, 'Customer Order Management is one of them');
  const accents = cards.map(c => c.accent).filter(Boolean);
  check(new Set(accents).size === accents.length, `each card has its own colour — got ${accents.join(', ')}`);

  console.log('\n2. The All Orders filter opens un-clipped inside the card');
  await page.evaluate(() => document.getElementById('cust-filter-btn')?.click());
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => {
    const el = document.getElementById('cust-filter-menu');
    if (!el) return { missing: true };
    const opts = el.querySelectorAll('.cf-opt'); const last = opts[opts.length - 1];
    // Into view first: elementFromPoint sees nothing below the viewport,
    // which would read as clipped when it is only off-screen.
    last.scrollIntoView({ block: 'center' });
    const r = last.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 8, r.top + r.height / 2);
    return { open: !el.classList.contains('hidden'), lastOnTop: !!(hit && last.contains(hit)),
             card: el.closest('.metric-card') ? getComputedStyle(el.closest('.metric-card')).overflow : 'not inside a card' };
  });
  check(m.open, 'the menu opens');
  check(m.lastOnTop, `its last option is on screen, not clipped by the card — ${JSON.stringify(m)}`);
  check(m.card === 'visible', `and the card is not overflow-hidden — got ${m.card}`);

  console.log('\n' + (fails ? fails + ' FAILED' : 'all checks passed'));
  await browser.close(); server.close();
  process.exit(fails ? 1 : 0);
})();
