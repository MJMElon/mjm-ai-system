/* A CULLED PLOT READS ZERO, AND THE SYSTEM SAYS CULLED.

   The office's rule, in their own words: "If the plot has been culled,
   just make the plot balance become 0, and the status become culled
   (this is system auto detect and set)."

   So a month-tab row whose batch+plot carries ANY 3rd_Culling record in
   the ledger (125 of the 194 month plots, the day this was written):
   - shows Plot Balance 0, forced — not the 10% estimate less DO Deducted;
   - shows a locked CULLED pill, never the dropdown, and Culled is never
     a menu choice on any other row;
   - refuses a drop (balance 0 is what the drop gate already reads);
   - keeps any customer chips already on it visible — those are customers
     the office has to move, and After Deduct Reserve goes red negative;
   - writes NOTHING back to shared_plot_allocations — the person's last
     real pick survives if the culling rows are ever corrected (the Sold
     Out rule, one status along).
   A PARTIAL culling still counts — the 3rd culling is the plot's final
   stage, so once one is recorded the remainder has moved on.
   A Plot-R row is UNTOUCHED: it nets its culling off through
   otherDeducted and folds into History at nought, its own arithmetic.
   And the foot's Plot Balance total sums the SHOWN balances, so the
   total agrees with the column above it.

   Drives the REAL page in a real browser.
   Run: node tests/a_culled_plot_reads_zero.cjs
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

/* Pinned today: 22 Oct 2026. Transplants in January mature (+9 months)
   into October, the current month, so all three land on the tab the page
   opens on.
     250/U1 — 2,000 transplanted, 3rd culled TWICE (400 + 300), a 600-pc
              customer chip and a saved plot_status of 'open'
              -> Culled, balance 0, chip stays, After Deduct -600.
     251/U3 — 500 transplanted, PARTIAL 3rd culling of 100
              -> Culled, balance 0 all the same.
     250/U2 — 1,000 transplanted, never culled
              -> ordinary row: dropdown, balance 900, no Culled option.
     250/B6-R — 800 transferred in, 200 culled OFF it
              -> Plot-R keeps its own arithmetic: balance 600, no forced
                 zero, no Culled status. */
const SUPA = `window.SHARED_SUPA_URL='x';window.SHARED_SUPA_KEY='y';
(function(){
 window.__inserts=[];window.__writes=[];
 const T={
  shared_profiles:[{id:'u1',email:'o@m.t',full_name:'J',permissions:{manage_users:true,modules:{operation:'admin'}}}],
  salesweb_customer_orders:[], salesweb_order_items:[],
  salesweb_order_collections:[], shared_collection_bookings:[], shared_al_orders:[],
  shared_inventory_logs:[
   {id:1,transaction_type:'Transplanted',batch_name:'250',plot_name:'U1',breed_name:'DxP',quantity_change:2000,transaction_date:'2026-01-15',created_at:'2026-01-15T02:00:00',remark:''},
   {id:2,transaction_type:'Transplanted',batch_name:'250',plot_name:'U2',breed_name:'DxP',quantity_change:1000,transaction_date:'2026-01-20',created_at:'2026-01-20T02:00:00',remark:''},
   {id:3,transaction_type:'Transplanted',batch_name:'251',plot_name:'U3',breed_name:'DxP',quantity_change:500,transaction_date:'2026-01-10',created_at:'2026-01-10T02:00:00',remark:''},
   {id:4,transaction_type:'3rd_Culling',batch_name:'250',plot_name:'U1',quantity_change:400,created_at:'2026-09-01T02:00:00'},
   {id:5,transaction_type:'3rd_Culling',batch_name:'250',plot_name:'U1',quantity_change:300,created_at:'2026-09-02T02:00:00'},
   {id:6,transaction_type:'3rd_Culling',batch_name:'251',plot_name:'U3',quantity_change:100,created_at:'2026-09-03T02:00:00'},
   {id:7,transaction_type:'Cull3_Transfer',batch_name:'250',plot_name:'B6-R',breed_name:'DxP',quantity_change:800,transaction_date:'2026-02-01',created_at:'2026-02-01T02:00:00',remark:''},
   {id:8,transaction_type:'3rd_Culling',batch_name:'250',plot_name:'B6-R',quantity_change:200,created_at:'2026-09-04T02:00:00'}
  ],
  shared_plots:[
   {plot_name:'U1',nursery_name:'UNN 1'},{plot_name:'U2',nursery_name:'UNN 1'},
   {plot_name:'U3',nursery_name:'UNN 1'},{plot_name:'B6-R',nursery_name:'BNN'}
  ],
  shared_plot_allocations:[
   {batch_name:'250',plot_name:'U1',plot_status:'open',reserved_for:'',reserved_qty:0,premium:false}
  ],
  shared_batch_customer_allocations:[
   {id:'k1',batch_name:'250',plot_name:'U1',order_id:'nobody',order_number:'',customer_name:'KEPT CUSTOMER SDN BHD',allocated_qty:600}
  ],
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
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  await page.route('**cdn.tailwindcss.com**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: SUPA }));
  await page.route('**cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', body: 'window.Chart=class{constructor(){}destroy(){}update(){}};window.Chart.register=()=>{};window.jspdf={jsPDF:class{}};' }));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**fonts.gstatic.com/**', r => r.abort());
  page.on('pageerror', e => console.log(' page error: ' + e.message.slice(0, 150)));

  // Maturity months are worked out against "now" — pin it so a January
  // transplant matures into the CURRENT month tab whatever day this runs.
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
  await page.waitForFunction('document.querySelectorAll("#maturity-rows tr[data-batch-key]").length >= 3', null, { timeout: 15000 });
  check(page.url().includes('operation_stock_sales'), 'page loaded without bouncing to the portal');

  const rowOf = plot => `[...document.querySelectorAll('#maturity-rows tr[data-batch-key]')].find(tr => tr.dataset.plotName === '${plot}')`;

  // ── 1. A culled plot reads 0 and CULLED, locked ──────────────────────────
  const u1 = await page.evaluate(`(() => {
    const tr = ${rowOf('U1')}; if (!tr) return null;
    const tds = tr.querySelectorAll('td');
    return {
      status: tr.dataset.matStatus,
      balance: tds[9].textContent.trim(),
      balTitle: tds[9].getAttribute('title') || '',
      dropdown: !!tr.querySelector('.mat-status-wrap'),
      pill: (tr.querySelector('td.col-plot span') || {}).textContent || '',
      pillTitle: ((tds[7].querySelector('span[title]') || {}).getAttribute || (()=>''))  ? (tds[7].querySelector('span[title]') ? tds[7].querySelector('span[title]').getAttribute('title') : '') : '',
      chip: !!tr.querySelector('.reserv-chip'),
      chipQty: (tr.querySelector('.reserv-chip-qty') || {}).textContent || '',
      after: tds[12].textContent.trim(),
      dropBalance: tr.dataset.batchBalance,
    };
  })()`);
  check(!!u1, 'the culled plot U1 is on the month tab');
  check(u1 && u1.status === 'culled', `its status is CULLED, system-set (got "${u1 && u1.status}")`);
  check(u1 && u1.balance === '0', `its Plot Balance is forced to 0 — not the 1,800 estimate (got "${u1 && u1.balance}")`);
  check(u1 && /3rd culling recorded/i.test(u1.balTitle) && u1.balTitle.includes('700'), `and the cell says why, naming the 700 culled (got "${u1 && u1.balTitle}")`);
  check(u1 && !u1.dropdown, 'the status is LOCKED — no dropdown, nothing left to decide');
  check(u1 && /culled/i.test(u1.pill), `the pill reads Culled (got "${u1 && u1.pill}")`);
  check(u1 && /system/i.test(u1.pillTitle || ''), `and its hover says the system set it (got "${u1 && u1.pillTitle}")`);
  check(u1 && u1.chip && u1.chipQty === '600', 'the customer chip already on the row STAYS — a customer the office has to move');
  check(u1 && u1.after === '-600', `After Deduct Reserve reads red minus the chip: 0 − 600 (got "${u1 && u1.after}")`);
  check(u1 && u1.dropBalance === '-600', `data-batch-balance carries the forced zero less the chip, so the drop gate refuses it (got "${u1 && u1.dropBalance}")`);

  // ── 2. A PARTIAL culling still counts ────────────────────────────────────
  const u3 = await page.evaluate(`(() => {
    const tr = ${rowOf('U3')}; if (!tr) return null;
    return { status: tr.dataset.matStatus, balance: tr.querySelectorAll('td')[9].textContent.trim(), dropdown: !!tr.querySelector('.mat-status-wrap') };
  })()`);
  check(u3 && u3.status === 'culled' && u3.balance === '0' && !u3.dropdown,
    `a plot culled 100 of 500 is still Culled at 0 — the 3rd culling is the final stage, partial included (got ${u3 && u3.status} / ${u3 && u3.balance})`);

  // ── 3. An unculled plot is untouched, and Culled is never a menu choice ──
  const u2 = await page.evaluate(`(() => {
    const tr = ${rowOf('U2')}; if (!tr) return null;
    const menu = tr.querySelector('.mat-status-menu');
    return {
      status: tr.dataset.matStatus,
      balance: tr.querySelectorAll('td')[9].textContent.trim(),
      dropdown: !!tr.querySelector('.mat-status-wrap'),
      menuHasCulled: menu ? /culled/i.test(menu.textContent) : null,
      menuHasOpen: menu ? /open/i.test(menu.textContent) : null,
    };
  })()`);
  check(u2 && u2.dropdown && u2.status !== 'culled', `the never-culled plot keeps its dropdown and its own status (got ${u2 && u2.status})`);
  check(u2 && u2.balance === '900', `and its balance is the ordinary arithmetic: 900 (got "${u2 && u2.balance}")`);
  check(u2 && u2.menuHasCulled === false && u2.menuHasOpen === true, 'Culled is not in the menu — automatic only, never a person\'s pick');

  // ── 4. The drop gate refuses the culled row and takes the live one ───────
  const gate = await page.evaluate(`(() => {
    _draggingOrder = { orderId: 'Z', remaining: 100 };
    const ask = tr => { let took = false; onRowDragOver({ currentTarget: tr, preventDefault(){ took = true; }, dataTransfer: {} }); return took; };
    const culledTakes = ask(${rowOf('U1')});
    const liveTakes = ask(${rowOf('U2')});
    _draggingOrder = null;
    return { culledTakes, liveTakes };
  })()`);
  check(gate.culledTakes === false, 'a drag over the culled row is REFUSED — nothing standing to allocate');
  check(gate.liveTakes === true, 'and the same drag over the live row is accepted, so the gate is the balance and not a broken handler');

  // ── 5. The foot sums the SHOWN balances ──────────────────────────────────
  const foot = await page.evaluate(() => {
    const tds = document.querySelectorAll('#maturity-table tfoot td, .mat-table tfoot td');
    return [...tds].map(td => td.textContent.trim());
  });
  check(foot.includes('900'), `the Plot Balance total is the column's own sum — 0 + 900 + 0 (foot: ${foot.join(' | ')})`);
  check(foot.includes('300'), 'and After Deduct Reserve totals 900 − 600 off the same shown figures');

  // ── 6. Plot-R keeps its own arithmetic — no forced zero there ────────────
  const pr = await page.evaluate(`(async () => {
    const btn = [...document.querySelectorAll('.month-tab')].find(b => /plot-?r/i.test(b.textContent));
    if (!btn) return null;
    btn.click();
    await new Promise(r => setTimeout(r, 50));
    const tr = ${rowOf('B6-R')}; if (!tr) return { noRow: true };
    return { status: tr.dataset.matStatus, balance: tr.querySelectorAll('td')[9].textContent.trim(), dropdown: !!tr.querySelector('.mat-status-wrap') };
  })()`);
  check(pr && !pr.noRow && pr.status !== 'culled' && pr.dropdown,
    `a Plot-R row is untouched by the rule — its culling nets off, it is never stamped Culled (got ${pr && pr.status})`);
  check(pr && pr.balance === '600', `and its balance is 800 in less 200 culled: 600 (got "${pr && pr.balance}")`);

  // ── 7. Nothing is written back — the status is shown, never stored ───────
  const writes = await page.evaluate(() => ({ inserts: window.__inserts.length, writes: window.__writes.length }));
  check(writes.inserts === 0 && writes.writes === 0,
    `rendering Culled wrote NOTHING to the database — the person's saved 'open' on U1 survives a correction (got ${writes.inserts} inserts, ${writes.writes} writes)`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
