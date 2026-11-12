/* EVERY MONTH TAB IS ONE SHAPE, AND THE TWO RIGHT-HAND GROUPS SWAP BY DRAG.

   The office, on Seedling Sales Control - Monthly Maturity Allocation:
   1. "Standardize the width of Production and plot status for all the
      month, so that I click any of the month, the two column will remain
      same. Just the data change ... Customer Allocation is fine."
   2. "Make the plot status and customer allocation card drag-able to
      change their sequence place."

   Run: node tests/every_month_tab_is_one_shape.cjs
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
   {id:3,transaction_type:'Transplanted',batch_name:'280',plot_name:'L1',breed_name:'UPB PREMIER SUPER LONG BREED NAME DURA x PISIFERA',quantity_change:123456,transaction_date:'2026-02-17',created_at:'2026-02-17T02:00:00',remark:''},
   {id:4,transaction_type:'Transplanted',batch_name:'281',plot_name:'L2-LONGPLOT',breed_name:'IOI',quantity_change:99999,transaction_date:'2026-02-18',created_at:'2026-02-18T02:00:00',remark:''}
  ],
  operation_batch_verifications:[],
  shared_plots:[
   {plot_name:'S1',nursery_name:'UNN 1'},{plot_name:'S2',nursery_name:'UNN 1'},{plot_name:'L1',nursery_name:'BNN'},{plot_name:'L2-LONGPLOT',nursery_name:'BNN'}
  ],
  shared_plot_allocations:[],
  shared_batch_customer_allocations:[
   {id:'AG',batch_name:'270',plot_name:'S1',order_id:'oG',order_number:'ORDG',customer_name:'GIL',allocated_qty:30,updated_at:'2026-10-10T02:00:00'}
  ],
  shared_do_records:[
   {do_number:'D1',al_number:'',total_qty:950,status:'Issued',remark:'',plot_1:'S1',qty_1:950,batch_1:'270'}
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
    const Real = Date; const FIXED = new Real('2026-10-22T04:00:00');
    // eslint-disable-next-line no-global-assign
    Date = class extends Real { constructor(...a) { if (a.length) { super(...a); } else { super(FIXED.getTime()); } } static now() { return FIXED.getTime(); } };
  });
  const boot = async () => {
    await page.goto(`http://127.0.0.1:${port}/operation/operation_stock_sales.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('document.querySelectorAll("#maturity-rows tr[data-batch-key]").length >= 1', null, { timeout: 15000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => { if (typeof switchSsmTab === 'function') switchSsmTab('stock'); });
    await page.waitForTimeout(200);
  };
  await boot();

  // The shape of the table: every column heading's width, and every row's height.
  const shape = () => page.evaluate(() => {
    const ths = [...document.querySelectorAll('.mat-table thead tr:not(.mat-group-row) th')]
      .filter(th => getComputedStyle(th).display !== 'none');
    const rows = [...document.querySelectorAll('#maturity-rows tr[data-batch-key]')];
    return { heads: ths.map(th => th.textContent.trim()),
             widths: ths.map(th => Math.round(th.getBoundingClientRect().width)),
             rowH: rows.map(r => Math.round(r.getBoundingClientRect().height)),
             n: rows.length };
  });
  const monthTabs = await page.evaluate(() => [...document.querySelectorAll('#month-tabs .month-tab')].map(b => b.innerText).filter(t => t !== 'Plot-R'));

  console.log('\n1. Production and Plot Status are the same width on every month tab');
  check(monthTabs.length >= 2, 'there are at least two month tabs to compare — ' + JSON.stringify(monthTabs));
  const shapes = [];
  for (const t of monthTabs) {
    await page.evaluate(t => [...document.querySelectorAll('#month-tabs .month-tab')].find(b => b.innerText === t).click(), t);
    await page.waitForTimeout(150);
    shapes.push(Object.assign({ tab: t }, await shape()));
  }
  const withRows = shapes.filter(s => s.n);
  check(withRows.length >= 2, 'two month tabs with rows on them — ' + JSON.stringify(shapes.map(s => [s.tab, s.n])));
  const prodPlot = s => s.widths.slice(0, 9);
  const first = withRows[0] || { widths: [] };
  check(withRows.every(s => JSON.stringify(prodPlot(s)) === JSON.stringify(prodPlot(first))),
    'the nine Production + Plot Status columns read the same widths on every month — ' + JSON.stringify(withRows.map(s => [s.tab, prodPlot(s)])));
  // Customer Allocation decides a row's height (a chip or a drop zone), and
  // the office said that one may vary. What may NOT is a Production or Plot
  // Status cell running onto a second line in one month and not the next.
  const lines = [];
  for (const t of monthTabs) {
    await page.evaluate(t => [...document.querySelectorAll('#month-tabs .month-tab')].find(b => b.innerText === t).click(), t);
    await page.waitForTimeout(120);
    lines.push(await page.evaluate(() => {
      const most = [];
      document.querySelectorAll('#maturity-rows tr[data-batch-key] td.col-prod, #maturity-rows tr[data-batch-key] td.col-plot').forEach(td => {
        if (getComputedStyle(td).display === 'none') return;
        const tops = new Set();
        const w = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
        let n; while ((n = w.nextNode())) {
          // The status menu is a closed dropdown (Tailwind's hidden, which
          // this harness cannot load), not text on the row.
          if (!n.textContent.trim() || n.parentElement.closest('.mat-status-menu')) continue;
          const r = document.createRange(); r.selectNodeContents(n);
          [...r.getClientRects()].forEach(x => { if (x.width) tops.add(Math.round(x.top)); });
        }
        most.push(tops.size);
      });
      return Math.max(0, ...most);
    }));
  }
  check(lines.length && lines.every(n => n <= 1),
    'every Production and Plot Status cell is ONE line on every month, a long breed included — most lines per cell: ' + JSON.stringify(lines));
  const breedCell = await page.evaluate(() => {
    const td = [...document.querySelectorAll('#maturity-rows td')].find(td => /SUPER LONG/.test(td.textContent));
    return td ? { title: td.title, ws: getComputedStyle(td).whiteSpace, ov: getComputedStyle(td).textOverflow } : null;
  });
  check(!!breedCell && breedCell.ws === 'nowrap' && breedCell.ov === 'ellipsis' && /SUPER LONG/.test(breedCell.title),
    'a long breed is cut with an ellipsis and its hover says the whole name — ' + JSON.stringify(breedCell));

  console.log('\n2. Plot Status and Customer Allocation swap places by dragging a heading');
  const order = () => page.evaluate(() => ({
    groups: [...document.querySelectorAll('.mat-table thead tr.mat-group-row th')].map(th => th.textContent.replace(/[⋮]/g, '').trim()),
    heads: [...document.querySelectorAll('.mat-table thead tr:not(.mat-group-row) th')].map(th => th.textContent.trim()),
    row: (() => { const tr = document.querySelector('#maturity-rows tr[data-batch-key]');
                  return tr ? [...tr.children].map(td => td.className.includes('col-plot') ? 'P' : td.className.includes('col-alloc') ? 'A' : '-').join('') : ''; })(),
    foot: (() => { const tr = document.querySelector('#maturity-foot tr');
                   return tr ? [...tr.children].map(td => td.className.includes('col-plot') ? 'P' : td.className.includes('col-alloc') ? 'A' : '-').join('') : ''; })(),
    draggable: [...document.querySelectorAll('.mat-table thead tr.mat-group-row th')].map(th => th.draggable),
  }));
  const before = await order();
  check(/Plot Status/.test(before.groups[1] || '') && /Customer Allocation/.test(before.groups[2] || ''),
    'it opens as it always did: Production, Plot Status, Customer Allocation — ' + JSON.stringify(before.groups));
  check(JSON.stringify(before.draggable) === '[false,true,true]', 'the two group headings can be dragged, Production cannot — ' + JSON.stringify(before.draggable));
  const dragged = await page.evaluate(() => {
    const from = document.querySelector('.mat-group-alloc'), to = document.querySelector('.mat-group-plot');
    if (!from || !to) return 'no group headings';
    const dt = new DataTransfer();
    from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    return 'ok';
  });
  check(dragged === 'ok', 'the drag ran — ' + dragged);
  const after = await order();
  check(/Customer Allocation/.test(after.groups[1] || '') && /Plot Status/.test(after.groups[2] || ''),
    'Customer Allocation now comes before Plot Status — ' + JSON.stringify(after.groups));
  check(after.heads.slice(6, 9).join('|') === 'Customers (drag here)|Reserved Qty|After Deduct Reserve'
        && after.heads.slice(9, 12).join('|') === 'Status|DO Deducted|Plot Balance',
    'the column headings moved with their group — ' + JSON.stringify(after.heads));
  check(after.row.endsWith('AAAPPP') && after.foot.endsWith('AAAPPP'),
    'and so did every row and the totals line — row ' + after.row + ', foot ' + after.foot);
  await boot();
  const reloaded = await order();
  check(/Customer Allocation/.test(reloaded.groups[1] || '') && reloaded.row.endsWith('AAAPPP'),
    'the order is remembered on this machine after a reload — ' + JSON.stringify(reloaded.groups));
  const s2 = await shape();
  check(JSON.stringify(s2.widths.slice(9, 12)) === JSON.stringify(first.widths.slice(6, 9)),
    'Plot Status keeps its widths in its new place — ' + JSON.stringify([s2.widths.slice(9, 12), first.widths.slice(6, 9)]));
  await page.evaluate(() => {
    const from = document.querySelector('.mat-group-plot'), to = document.querySelector('.mat-group-alloc');
    if (!from || !to) return;
    const dt = new DataTransfer();
    from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  const back = await order();
  check(/Plot Status/.test(back.groups[1] || '') && back.row.endsWith('PPPAAA'),
    'dragging again puts it back — ' + JSON.stringify(back.groups) + ' ' + back.row);

  console.log('\n3. The customer drag still works on a reordered table');
  check(await page.evaluate(() => !!document.querySelector('#maturity-rows .reserv-chip[draggable="true"]')), 'the customer chips are still draggable');

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
