/* A CULLING COUNTS HERE ONLY WITH THE DRONE QTY ON IT AND THE LINE SIGNED.

   The office's rule for the Monthly Maturity Allocation table, over five
   messages, the last one the gate:
   - "If the plot has been culled, just make the plot balance become 0,
     and the status become culled (this is system auto detect and set)."
   - "partially culled plot keep the reduced balance instead"
   - "you have to based on the plot and batch and see whether it's
     culled. If not, you have to keep the balance."
   - "until batch report 3rd culling being keyed in, only show 0 at my
     table."
   - "Only got the drone qty in the report and the line being verify, my
     table only show culled with qty 0"

   So: a 3rd_Culling line — matched per BATCH+PLOT, the key the whole
   table groups on — DEDUCTS from that row's Plot Balance only when BOTH
   hold: its remark carries the drone qty the batch report keys (MapQty:),
   AND the line is signed off, by a Row_Verification under
   `cull_3::<rowKey>` or one signature over the whole tab in
   operation_batch_verifications — the same two routes Life of Seedlings
   reads. A culling missing either leaves the balance UNTOUCHED, and the
   cell's hover says what it is waiting for. Only when the counted culling
   (plus what sold) covers the balance does the row read 0 with the locked
   system-set CULLED pill — never a menu choice, never written back to
   shared_plot_allocations, drops refused. A Plot-R row goes through the
   SAME gate — the office later asked the same question of the transfer
   tab ("Plot-R history data must be same with the normal tab"), so an
   ungated P-R culling leaves ITS balance standing too, with the same
   pending hover. The foot sums the SHOWN balances. And the
   gate FAILS OPEN the Life of Seedlings way: a Row_Verification read that
   errors waives the verification half rather than springing every culled
   plot back to a stale positive balance; the MapQty half has no separate
   read to fail and still holds.

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
   into October, the current month, so all five land on the tab the page
   opens on.
     250/U1 — 2,000 (estimate 1,800); culled 400+300, BOTH with MapQty,
              row signed `cull_3::U1|main`; a 600-pc chip and a saved
              'open' -> counted: balance 1,100, dropdown live, After 500.
     250/U2 — 1,000, never culled -> 900 untouched: batch 250 culled on
              U1 must not touch U2, the match is the plot AND the batch.
     251/U3 — 500 (450); culled 100, line SIGNED but NO MapQty
              -> NOT counted: 450, hover says what it waits for.
     252/U4 — 300 (270); culled 300 WITH MapQty, whole tab signed in
              operation_batch_verifications -> counted and covered:
              0, locked CULLED pill, drop refused.
     253/U5 — 400 (360); culled 360 WITH MapQty, nobody signed
              -> NOT counted: 360, hover pending.
     250/B6-R — 800 in, 200 culled, no MapQty, no signature
              -> Plot-R is GATED like the month rows: the 200 is NOT
                 counted, the balance stands at 800 with the pending
                 hover, never Culled. */
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
   {id:5,transaction_type:'Transplanted',batch_name:'253',plot_name:'U5',breed_name:'DxP',quantity_change:400,transaction_date:'2026-01-08',created_at:'2026-01-08T02:00:00',remark:''},
   {id:6,transaction_type:'3rd_Culling',batch_name:'250',plot_name:'U1',quantity_change:400,created_at:'2026-09-01T02:00:00',remark:'3rd Culling. DestType: main MapQty: 400 CullDate:2026-09-01'},
   {id:7,transaction_type:'3rd_Culling',batch_name:'250',plot_name:'U1',quantity_change:300,created_at:'2026-09-02T02:00:00',remark:'3rd Culling. DestType: main MapQty: 300 CullDate:2026-09-02'},
   {id:8,transaction_type:'3rd_Culling',batch_name:'251',plot_name:'U3',quantity_change:100,created_at:'2026-09-03T02:00:00',remark:'3rd Culling. DestType: main CullDate:2026-09-03'},
   {id:9,transaction_type:'3rd_Culling',batch_name:'252',plot_name:'U4',quantity_change:300,created_at:'2026-09-05T02:00:00',remark:'3rd Culling. DestType: main MapQty: 298 CullDate:2026-09-05'},
   {id:10,transaction_type:'3rd_Culling',batch_name:'253',plot_name:'U5',quantity_change:360,created_at:'2026-09-06T02:00:00',remark:'3rd Culling. DestType: main MapQty: 360 CullDate:2026-09-06'},
   {id:11,transaction_type:'Cull3_Transfer',batch_name:'250',plot_name:'B6-R',breed_name:'DxP',quantity_change:800,transaction_date:'2026-02-01',created_at:'2026-02-01T02:00:00',remark:''},
   {id:12,transaction_type:'3rd_Culling',batch_name:'250',plot_name:'B6-R',quantity_change:200,created_at:'2026-09-04T02:00:00',remark:''},
   {id:13,transaction_type:'Row_Verification',batch_name:'250',plot_name:'cull_3::U1|main',quantity_change:0,created_at:'2026-09-10T02:00:00',remark:'Row verified: U1|main'},
   {id:14,transaction_type:'Row_Verification',batch_name:'251',plot_name:'cull_3::U3',quantity_change:0,created_at:'2026-09-10T02:00:00',remark:'Row verified: U3'}
  ],
  operation_batch_verifications:[
   {batch_name:'252',stage:'cull_3'}
  ],
  shared_plots:[
   {plot_name:'U1',nursery_name:'UNN 1'},{plot_name:'U2',nursery_name:'UNN 1'},
   {plot_name:'U3',nursery_name:'UNN 1'},{plot_name:'U4',nursery_name:'UNN 1'},
   {plot_name:'U5',nursery_name:'UNN 1'},{plot_name:'B6-R',nursery_name:'BNN'}
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
      if(window.__failRowVer && table==='shared_inventory_logs'
         && st.f.some(([c,v])=>c==='transaction_type'&&v==='Row_Verification'))
        return new Promise(r=>setTimeout(()=>r({data:null,error:{message:'boom'}}),5)).then(res,rej);
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

async function openPage(browser, port, failRowVer) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });
  await page.route('**cdn.tailwindcss.com**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: SUPA }));
  await page.route('**cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', body: 'window.Chart=class{constructor(){}destroy(){}update(){}};window.Chart.register=()=>{};window.jspdf={jsPDF:class{}};' }));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**fonts.gstatic.com/**', r => r.abort());
  page.on('pageerror', e => console.log(' page error: ' + e.message.slice(0, 150)));
  // Maturity months are worked out against "now" — pin it so a January
  // transplant matures into the CURRENT month tab whatever day this runs.
  await page.addInitScript((fail) => {
    if (fail) window.__failRowVer = true;
    const Real = Date;
    const FIXED = new Real('2026-10-22T04:00:00');
    // eslint-disable-next-line no-global-assign
    Date = class extends Real {
      constructor(...a) { if (a.length) { super(...a); } else { super(FIXED.getTime()); } }
      static now() { return FIXED.getTime(); }
    };
  }, !!failRowVer);
  await page.goto(`http://127.0.0.1:${port}/operation/operation_stock_sales.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('document.querySelectorAll("#maturity-rows tr[data-batch-key]").length >= 5', null, { timeout: 15000 });
  return page;
}

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const page = await openPage(browser, port, false);
  check(page.url().includes('operation_stock_sales'), 'page loaded without bouncing to the portal');

  // ── 1. Drone qty + signed line counts: a partial culling reduces ────────
  const u1 = await page.evaluate(snap('U1'));
  check(!!u1, 'U1 (culling with MapQty, row signed) is on the month tab');
  check(u1 && u1.balance === '1,100', `its balance is REDUCED by the counted culling — 1,800 less 700 (got "${u1 && u1.balance}")`);
  check(u1 && /3rd culling of 700/i.test(u1.balTitle) && /deducted/i.test(u1.balTitle), `and the cell says the 700 came off (got "${u1 && u1.balTitle}")`);
  check(u1 && u1.dropdown && u1.status === 'open', `partially culled stays LIVE with the person's own pick (got ${u1 && u1.status})`);
  check(u1 && u1.chip && u1.chipQty === '600' && u1.after === '500' && u1.dropBalance === '500',
    `the chip stays and After Deduct Reserve works off the reduced figure: 1,100 − 600 (got "${u1 && u1.after}")`);

  // ── 2. No drone qty → NOT counted, even signed ───────────────────────────
  const u3 = await page.evaluate(snap('U3'));
  check(u3 && u3.balance === '450' && u3.status !== 'culled' && u3.dropdown,
    `a SIGNED culling with no MapQty moves nothing — "Only got the drone qty in the report..." (got ${u3 && u3.status} / ${u3 && u3.balance})`);
  check(u3 && /keyed but NOT counted/i.test(u3.balTitle) && u3.balTitle.includes('100') && /drone qty/i.test(u3.balTitle),
    `and the hover says the 100 is waiting for the drone qty (got "${u3 && u3.balTitle}")`);

  // ── 3. Drone qty but nobody signed → NOT counted ─────────────────────────
  const u5 = await page.evaluate(snap('U5'));
  check(u5 && u5.balance === '360' && u5.status !== 'culled' && u5.dropdown,
    `a culling with MapQty that nobody signed moves nothing — "...and the line being verify" (got ${u5 && u5.status} / ${u5 && u5.balance})`);
  check(u5 && /keyed but NOT counted/i.test(u5.balTitle) && u5.balTitle.includes('360') && /verified/i.test(u5.balTitle),
    `and the hover says the 360 is waiting to be verified (got "${u5 && u5.balTitle}")`);

  // ── 4. The match is the plot AND the batch ───────────────────────────────
  const u2 = await page.evaluate(`(() => {
    const tr = ${rowOf('U2')}; if (!tr) return null;
    const menu = tr.querySelector('.mat-status-menu');
    return { status: tr.dataset.matStatus, balance: tr.querySelectorAll('td')[9].textContent.trim(),
             balTitle: tr.querySelectorAll('td')[9].getAttribute('title') || '',
             menuHasCulled: menu ? /culled/i.test(menu.textContent) : null,
             menuHasOpen: menu ? /open/i.test(menu.textContent) : null };
  })()`);
  check(u2 && u2.balance === '900' && u2.balTitle === '', `batch 250 culled on U1 leaves 250 on U2 ALONE (got "${u2 && u2.balance}")`);
  check(u2 && u2.menuHasCulled === false && u2.menuHasOpen === true, 'Culled is not in the menu — automatic only, never a person\'s pick');

  // ── 5. Counted culling that covers the balance: 0, CULLED, locked ────────
  const u4 = await page.evaluate(snap('U4'));
  check(u4 && u4.status === 'culled' && u4.balance === '0',
    `a whole-tab signature counts too: U4 reads 0 / CULLED off operation_batch_verifications (got ${u4 && u4.status} / ${u4 && u4.balance})`);
  check(u4 && !u4.dropdown && /culled/i.test(u4.pill) && /system/i.test(u4.pillTitle || ''),
    `and the pill is LOCKED, hover naming the system (got pill "${u4 && u4.pill.trim()}")`);
  check(u4 && /fully culled/i.test(u4.balTitle) && u4.balTitle.includes('300'),
    `the balance cell says why — clamped at 0, never estimate-seedlings negative (got "${u4 && u4.balTitle}")`);

  // ── 6. The drop gate refuses the culled row and takes the live ones ──────
  const gate = await page.evaluate(`(() => {
    _draggingOrder = { orderId: 'Z', remaining: 100 };
    const ask = tr => { let took = false; onRowDragOver({ currentTarget: tr, preventDefault(){ took = true; }, dataTransfer: {} }); return took; };
    const out = { culled: ask(${rowOf('U4')}), partial: ask(${rowOf('U1')}), waiting: ask(${rowOf('U5')}) };
    _draggingOrder = null; return out;
  })()`);
  check(gate.culled === false, 'a drag over the culled row is REFUSED');
  check(gate.partial === true && gate.waiting === true, 'and the partial row and the still-waiting row both take a drop — their balances are real stock');

  // ── 7. The foot sums the SHOWN balances ──────────────────────────────────
  const foot = await page.evaluate(() => [...document.querySelectorAll('.mat-table tfoot td, #maturity-table tfoot td')].map(td => td.textContent.trim()));
  check(foot.includes('2,810'), `the Plot Balance total is the column's own sum — 1,100 + 900 + 450 + 0 + 360 (foot: ${foot.join(' | ')})`);
  check(foot.includes('2,210'), 'and After Deduct Reserve totals 2,810 − 600 off the same shown figures');

  // ── 8. Plot-R goes through the SAME gate as the month rows ───────────────
  const pr = await page.evaluate(`(async () => {
    const btn = [...document.querySelectorAll('.month-tab')].find(b => /plot-?r/i.test(b.textContent));
    if (!btn) return null;
    btn.click(); await new Promise(r => setTimeout(r, 50));
    const tr = ${rowOf('B6-R')}; if (!tr) return { noRow: true };
    return { status: tr.dataset.matStatus, balance: tr.querySelectorAll('td')[9].textContent.trim(),
             balTitle: tr.querySelectorAll('td')[9].getAttribute('title') || '',
             dropdown: !!tr.querySelector('.mat-status-wrap') };
  })()`);
  check(pr && !pr.noRow && pr.status !== 'culled' && pr.dropdown && pr.balance === '800',
    `a Plot-R culling with no MapQty and no signature is NOT counted — 800 stands, never Culled (got ${pr && pr.status} / "${pr && pr.balance}")`);
  check(pr && /keyed but NOT counted/i.test(pr.balTitle) && pr.balTitle.includes('200'),
    `and its hover says the 200 is waiting for the gate (got "${pr && pr.balTitle}")`);

  // ── 9. Nothing is written back ───────────────────────────────────────────
  const writes = await page.evaluate(() => ({ inserts: window.__inserts.length, writes: window.__writes.length }));
  check(writes.inserts === 0 && writes.writes === 0,
    `rendering wrote NOTHING to the database (got ${writes.inserts} inserts, ${writes.writes} writes)`);
  await page.close();

  // ── 10. The gate FAILS OPEN when the sign-off read errors ────────────────
  const page2 = await openPage(browser, port, true);
  const open1 = await page2.evaluate(snap('U5'));
  const open2 = await page2.evaluate(snap('U3'));
  const open3 = await page2.evaluate(snap('U1'));
  check(open1 && open1.status === 'culled' && open1.balance === '0',
    `with Row_Verification unreadable the verification half is WAIVED — U5's MapQty culling counts, a check that cannot run must not move the report (got ${open1 && open1.status} / ${open1 && open1.balance})`);
  check(open2 && open2.balance === '450' && open2.status !== 'culled',
    `but the MapQty half still holds — it has no read to fail (got ${open2 && open2.status} / ${open2 && open2.balance})`);
  check(open3 && open3.balance === '1,100', 'and the counted rows read exactly as they did');
  await page2.close();

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
