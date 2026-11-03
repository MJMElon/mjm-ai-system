/* THE KEYED 3RD CULLING DEDUCTS, AND ONLY IT CAN SAY CULLED.

   The office's rule for the Monthly Maturity Allocation table, over four
   messages:
   - "If the plot has been culled, just make the plot balance become 0,
     and the status become culled (this is system auto detect and set)."
   - "partially culled plot keep the reduced balance instead"
   - "you have to based on the plot and batch and see whether it's
     culled. If not, you have to keep the balance."
   - "until batch report 3rd culling being keyed in, only show 0 at my
     table."

   So: the 3rd_Culling quantity keyed on the batch report — matched per
   BATCH+PLOT, the same key the whole table groups on — DEDUCTS from that
   row's Plot Balance like a DO does. A batch+plot with no culling keyed
   keeps its balance untouched; a partially culled one keeps the reduced
   balance with its dropdown live; and only when the keyed culling (plus
   whatever sold) covers the balance does the row read 0 with a locked
   CULLED pill — zero never appears from a guess. Culled is system-set,
   shown, and NEVER written back to shared_plot_allocations (the Sold Out
   rule, one status along), it is never a menu choice, drops on it are
   refused through the balance the drop gate already reads, and customer
   chips already on it stay visible. A Plot-R row is untouched — it nets
   its culling off through otherDeducted, its own arithmetic. The foot's
   Plot Balance total sums the SHOWN balances, so it agrees with the
   column above it.

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
   into October, the current month, so all four land on the tab the page
   opens on.
     250/U1 — 2,000 transplanted (estimate 1,800), 3rd culled TWICE
              (400 + 300 = 700), a 600-pc customer chip and a saved
              plot_status of 'open'
              -> PARTIAL: balance reduced to 1,100, dropdown still live,
                 drop still accepted, After Deduct 500.
     251/U3 — 500 transplanted (450), partial 3rd culling of 100
              -> balance 350.
     250/U2 — 1,000 transplanted, never culled
              -> balance 900 untouched: same batch 250 culled on U1 must
                 not touch U2 — the match is the plot AND the batch.
     252/U4 — 300 transplanted (270), 3rd culled 300 (the keyed culling
              covers it; the estimate is 90% so the raw figure dips under)
              -> FULLY culled: balance clamps to 0, locked CULLED pill,
                 drop refused.
     250/B6-R — 800 transferred in, 200 culled off it
              -> Plot-R keeps its own arithmetic: balance 600, no Culled. */
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
   {id:4,transaction_type:'Transplanted',batch_name:'252',plot_name:'U4',breed_name:'DxP',quantity_change:300,transaction_date:'2026-01-05',created_at:'2026-01-05T02:00:00',remark:''},
   {id:5,transaction_type:'3rd_Culling',batch_name:'250',plot_name:'U1',quantity_change:400,created_at:'2026-09-01T02:00:00'},
   {id:6,transaction_type:'3rd_Culling',batch_name:'250',plot_name:'U1',quantity_change:300,created_at:'2026-09-02T02:00:00'},
   {id:7,transaction_type:'3rd_Culling',batch_name:'251',plot_name:'U3',quantity_change:100,created_at:'2026-09-03T02:00:00'},
   {id:8,transaction_type:'3rd_Culling',batch_name:'252',plot_name:'U4',quantity_change:300,created_at:'2026-09-05T02:00:00'},
   {id:9,transaction_type:'Cull3_Transfer',batch_name:'250',plot_name:'B6-R',breed_name:'DxP',quantity_change:800,transaction_date:'2026-02-01',created_at:'2026-02-01T02:00:00',remark:''},
   {id:10,transaction_type:'3rd_Culling',batch_name:'250',plot_name:'B6-R',quantity_change:200,created_at:'2026-09-04T02:00:00'}
  ],
  shared_plots:[
   {plot_name:'U1',nursery_name:'UNN 1'},{plot_name:'U2',nursery_name:'UNN 1'},
   {plot_name:'U3',nursery_name:'UNN 1'},{plot_name:'U4',nursery_name:'UNN 1'},
   {plot_name:'B6-R',nursery_name:'BNN'}
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
  await page.waitForFunction('document.querySelectorAll("#maturity-rows tr[data-batch-key]").length >= 4', null, { timeout: 15000 });
  check(page.url().includes('operation_stock_sales'), 'page loaded without bouncing to the portal');

  const rowOf = plot => `[...document.querySelectorAll('#maturity-rows tr[data-batch-key]')].find(tr => tr.dataset.plotName === '${plot}')`;
  const snap = plot => `(() => {
    const tr = ${rowOf(plot)}; if (!tr) return null;
    const tds = tr.querySelectorAll('td');
    return {
      status: tr.dataset.matStatus,
      balance: tds[9].textContent.trim(),
      balTitle: tds[9].getAttribute('title') || '',
      dropdown: !!tr.querySelector('.mat-status-wrap'),
      pill: (tr.querySelector('td.col-plot span') || {}).textContent || '',
      pillTitle: tds[7].querySelector('span[title]') ? tds[7].querySelector('span[title]').getAttribute('title') : '',
      chip: !!tr.querySelector('.reserv-chip'),
      chipQty: (tr.querySelector('.reserv-chip-qty') || {}).textContent || '',
      after: tds[12].textContent.trim(),
      dropBalance: tr.dataset.batchBalance,
    };
  })()`;

  // ── 1. A PARTIAL culling keeps the reduced balance, and the row stays live ─
  const u1 = await page.evaluate(snap('U1'));
  check(!!u1, 'the partially culled plot U1 is on the month tab');
  check(u1 && u1.balance === '1,100', `its balance is REDUCED by the keyed culling — 1,800 less 700, not forced to 0 (got "${u1 && u1.balance}")`);
  check(u1 && /3rd culling of 700/i.test(u1.balTitle) && /deducted/i.test(u1.balTitle), `and the cell says the 700 came off (got "${u1 && u1.balTitle}")`);
  check(u1 && u1.dropdown && u1.status === 'open', `the dropdown stays LIVE with the person's own pick — partially culled is not done (got ${u1 && u1.status}, dropdown ${u1 && u1.dropdown})`);
  check(u1 && u1.chip && u1.chipQty === '600', 'the customer chip stays');
  check(u1 && u1.after === '500' && u1.dropBalance === '500', `After Deduct Reserve works off the reduced figure: 1,100 − 600 (got "${u1 && u1.after}" / ${u1 && u1.dropBalance})`);

  const u3 = await page.evaluate(snap('U3'));
  check(u3 && u3.balance === '350' && u3.dropdown && u3.status !== 'culled',
    `a 100-of-500 culling reads 450 − 100 = 350, still editable (got ${u3 && u3.status} / ${u3 && u3.balance})`);

  // ── 2. The match is the plot AND the batch ───────────────────────────────
  const u2 = await page.evaluate(`(() => {
    const tr = ${rowOf('U2')}; if (!tr) return null;
    const menu = tr.querySelector('.mat-status-menu');
    return {
      status: tr.dataset.matStatus,
      balance: tr.querySelectorAll('td')[9].textContent.trim(),
      balTitle: tr.querySelectorAll('td')[9].getAttribute('title') || '',
      dropdown: !!tr.querySelector('.mat-status-wrap'),
      menuHasCulled: menu ? /culled/i.test(menu.textContent) : null,
      menuHasOpen: menu ? /open/i.test(menu.textContent) : null,
    };
  })()`);
  check(u2 && u2.balance === '900' && u2.balTitle === '', `batch 250 culled on U1 leaves 250 on U2 ALONE — "If not, you have to keep the balance" (got "${u2 && u2.balance}")`);
  check(u2 && u2.dropdown && u2.status !== 'culled', `and its status is its own (got ${u2 && u2.status})`);
  check(u2 && u2.menuHasCulled === false && u2.menuHasOpen === true, 'Culled is not in the menu — automatic only, never a person\'s pick');

  // ── 3. A culling that covers the balance reads 0, CULLED, locked ─────────
  const u4 = await page.evaluate(snap('U4'));
  check(!!u4, 'the fully culled plot U4 is on the month tab');
  check(u4 && u4.status === 'culled', `its status is CULLED, system-set (got "${u4 && u4.status}")`);
  check(u4 && u4.balance === '0', `its balance reads 0 — clamped, never a few estimate-seedlings negative (got "${u4 && u4.balance}")`);
  check(u4 && /3rd culling recorded/i.test(u4.balTitle) && u4.balTitle.includes('300'), `and the cell says why, naming the 300 culled (got "${u4 && u4.balTitle}")`);
  check(u4 && !u4.dropdown && /culled/i.test(u4.pill), `the status is LOCKED — a pill, no dropdown (got pill "${u4 && u4.pill.trim()}")`);
  check(u4 && /system/i.test(u4.pillTitle || ''), `and its hover says the system set it (got "${u4 && u4.pillTitle}")`);

  // ── 4. The drop gate refuses the culled row and takes the partial one ────
  const gate = await page.evaluate(`(() => {
    _draggingOrder = { orderId: 'Z', remaining: 100 };
    const ask = tr => { let took = false; onRowDragOver({ currentTarget: tr, preventDefault(){ took = true; }, dataTransfer: {} }); return took; };
    const culledTakes = ask(${rowOf('U4')});
    const partialTakes = ask(${rowOf('U1')});
    _draggingOrder = null;
    return { culledTakes, partialTakes };
  })()`);
  check(gate.culledTakes === false, 'a drag over the fully culled row is REFUSED — nothing standing to allocate');
  check(gate.partialTakes === true, 'and the partially culled row still takes a drop — its reduced balance is real stock');

  // ── 5. The foot sums the SHOWN balances ──────────────────────────────────
  const foot = await page.evaluate(() => {
    const tds = document.querySelectorAll('#maturity-table tfoot td, .mat-table tfoot td');
    return [...tds].map(td => td.textContent.trim());
  });
  check(foot.includes('2,350'), `the Plot Balance total is the column's own sum — 1,100 + 900 + 350 + 0 (foot: ${foot.join(' | ')})`);
  check(foot.includes('1,750'), 'and After Deduct Reserve totals 2,350 − 600 off the same shown figures');

  // ── 6. Plot-R keeps its own arithmetic — never stamped Culled ────────────
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
    `rendering wrote NOTHING to the database — the person's saved 'open' on U1 survives a correction (got ${writes.inserts} inserts, ${writes.writes} writes)`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
