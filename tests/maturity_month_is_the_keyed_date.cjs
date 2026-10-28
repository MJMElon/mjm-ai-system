/* A MATURITY ROW IS DATED BY THE WORK, NEVER BY THE SAVE.

   The batch report saves most movement rows with NO transaction_date — the
   date the user keyed sits inside the remark ("... Date: 2026-07-22") — and
   the Monthly Maturity Allocation page used to read transaction_date ||
   created_at. A row keyed promptly dates the same either way, so the fault
   hid until batch 264: transplanted into U12 and U13 on 22 Jul 2026, KEYED
   in mid-September. The Transplanting Report (which reads the remark, see
   _logDate in operation_reports.html) said 22 Jul and maturity 22 Apr 2027;
   this page dated both plots by their save day and matured them onto the
   JUN 2027 tab — so the office opened Apr 2027, where every other page
   pointed, and batch 264 was not there.

   Drives the REAL page in a real browser with 264's own rows beside a
   promptly-keyed batch, and holds:
     - the late-keyed groups land on the KEYED month's tab (Apr 2027),
       qty summed per batch+plot (5,435 and 4,093);
     - they are NOT on the save-day tab (Jun 2027);
     - a row with a real transaction_date is untouched;
     - a row with no date anywhere still falls back to created_at.

   On the previous code the two 264 groups sit on Jun 2027 and Apr 2027
   shows only the promptly-keyed batch.

   Run: node tests/maturity_month_is_the_keyed_date.cjs
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

/* Batch 264 exactly as the ledger holds it: five Transplanted rows with no
   transaction_date, created_at in September, the keyed 22 Jul inside the
   remark. Batch 262 beside it is the ordinary case — keyed promptly — and
   batch 199 has no date anywhere but its save day. */
const SUPA = `window.SHARED_SUPA_URL='x';window.SHARED_SUPA_KEY='y';
(function(){
 const tx=(id,b,p,q,created,remarkDate,txDate,breed)=>({id,transaction_type:'Transplanted',batch_name:b,plot_name:p,
   breed_name:breed===undefined?'UPB PREMIER HYBRID':breed,quantity_change:q,created_at:created,
   transaction_date:txDate||null,
   remark:remarkDate?('Transplanted from tray [P46] to Main Plot ['+p+']. Date: '+remarkDate):''});
 const logs=[
  tx(1,'264','U13',2400,'2026-09-19T03:10:00','2026-07-22'),
  tx(2,'264','U13',2460,'2026-09-19T03:11:00','2026-07-22'),
  tx(3,'264','U13',575, '2026-09-19T03:12:00','2026-07-22'),
  tx(4,'264','U12',1800,'2026-09-19T03:13:00','2026-07-22'),
  tx(5,'264','U12',2293,'2026-09-19T03:14:00','2026-07-22'),
  tx(6,'262','U5', 2378,'2026-07-13T02:00:00',null,'2026-07-13'),
  tx(7,'199','B9', 500, '2026-07-02T02:00:00',null,null,null),
  /* Batch 260: the transplant row was saved BEFORE the breed was keyed, so
     it carries none — and keying the breed later on the batch report (Tab
     1, which is the Seeds_Received row) rewrites no old transplant rows.
     The page has to fall back to the batch's own breed; 199/B9 above has
     no breed anywhere and must honestly stay a dash. */
  tx(8,'260','U14',2518,'2026-07-10T02:00:00',null,'2026-07-10',null),
  {id:100,transaction_type:'Seeds_Received',batch_name:'260',plot_name:'Pre-Nursery',
   breed_name:'AA Hybrida 1S',quantity_change:12000,created_at:'2026-03-01T02:00:00',
   transaction_date:'2026-03-01',remark:''}
 ];
 const T={
  shared_profiles:[{id:'u1',email:'o@m.t',full_name:'J',permissions:{manage_users:true,modules:{operation:'admin'}}}],
  shared_inventory_logs:logs,
  shared_plots:[{plot_name:'U5',nursery_name:'UNN 1'},{plot_name:'U12',nursery_name:'UNN 1'},{plot_name:'U13',nursery_name:'UNN 1'},{plot_name:'B9',nursery_name:'BNN'}],
  shared_plot_allocations:[], shared_do_records:[], shared_collection_bookings:[],
  operation_nurseries:[], audit_height_records:[]
 };
 window.supabase={createClient:()=>({
  from(table){ const st={f:[],ins:[],rng:null,single:false};
   const api=new Proxy({},{get(_,k){
    if(k==='then') return (res,rej)=>{ let rows=(T[table]||[]).filter(r=>st.f.every(([c,v])=>String(r[c])===String(v))&&st.ins.every(([c,vs])=>vs.includes(r[c])));
      if(st.rng) rows=rows.slice(st.rng[0],st.rng[1]+1); else rows=rows.slice(0,1000);
      return new Promise(r=>setTimeout(()=>r({data:st.single?(rows[0]??null):rows,error:null,count:rows.length}),5)).then(res,rej);};
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

  // The page buckets months against "now" — pin it to Oct 2026 so Apr and
  // Jun 2027 are both future tabs whatever day this test runs on.
  await page.addInitScript(() => {
    const Real = Date;
    const FIXED = new Real('2026-10-22T04:00:00');
    // eslint-disable-next-line no-global-assign
    Date = class extends Real {
      constructor(...a) { if (a.length) { super(...a); } else { super(FIXED.getTime()); } }
      static now() { return FIXED.getTime(); }
    };
  });

  await page.goto(`http://127.0.0.1:${port}/operation/operation_stock_sales.html`);
  await page.waitForTimeout(2500);

  const readTab = (label) => page.evaluate((want) => {
    const tab = [...document.querySelectorAll('.month-tab')].find(b => b.textContent.trim().toUpperCase() === want.toUpperCase());
    if (!tab) return { missing: true, rows: [] };
    tab.click();
    return new Promise(res => setTimeout(() => {
      const rows = [...document.querySelectorAll('#maturity-rows tr')]
        .map(tr => ({ plot: tr.dataset.plotName, batch: tr.dataset.batchName, qty: tr.dataset.batchQty || (tr.querySelectorAll('td')[5] || {}).textContent }))
        .filter(r => r.plot);
      res({ missing: false, rows });
    }, 400));
  }, label);

  const apr = await readTab('Apr 2027');
  check(!apr.missing, 'an Apr 2027 tab exists');
  const flatApr = JSON.stringify(apr.rows);
  const u13 = apr.rows.find(r => r.plot === 'U13' && r.batch === '264');
  const u12 = apr.rows.find(r => r.plot === 'U12' && r.batch === '264');
  check(!!u13, '264 / U13 is on Apr 2027 — the KEYED month (' + flatApr.slice(0, 160) + ')');
  check(!!u12, '264 / U12 is on Apr 2027 too');
  check(!!apr.rows.find(r => r.plot === 'U5' && r.batch === '262'), '262 / U5 (a real transaction_date) is untouched beside them');
  const qtys = await page.evaluate(() => {
    const out = {};
    [...document.querySelectorAll('#maturity-rows tr')].forEach(tr => {
      if (!tr.dataset.plotName) return;
      const tds = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
      out[tr.dataset.batchName + '/' + tr.dataset.plotName] = tds.join('|');
    });
    return out;
  });
  check(/5,435/.test(qtys['264/U13'] || ''), '264 / U13 qty is the summed 5,435 (' + (qtys['264/U13'] || '').slice(0, 90) + ')');
  check(/4,093/.test(qtys['264/U12'] || ''), '264 / U12 qty is the summed 4,093');

  const jun = await readTab('Jun 2027');
  if (!jun.missing) {
    check(!jun.rows.find(r => r.batch === '264'), 'nothing of 264 is left on Jun 2027, the save-day month');
  } else {
    check(true, 'no Jun 2027 tab at all — nothing matures there any more');
  }

  // The no-date-anywhere fallback: created_at 2 Jul 2026 + 9 months = Apr 2027.
  check(!!apr.rows.find(r => r.plot === 'B9' && r.batch === '199'), '199 / B9 (no date anywhere) still falls back to its save day');

  /* Breed: the row's own first, else the batch's (Seeds_Received), else an
     honest dash — batch 260 keyed its breed after the transplant was saved
     and read "—" here for ever. Back on the Apr tab after the Jun click. */
  const apr2 = await readTab('Apr 2027');
  check(!apr2.missing, 'back on Apr 2027 for the breed checks');
  const breeds = await page.evaluate(() => {
    const out = {};
    [...document.querySelectorAll('#maturity-rows tr')].forEach(tr => {
      if (!tr.dataset.plotName) return;
      const tds = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
      out[tr.dataset.batchName + '/' + tr.dataset.plotName] = tds[4] || '';
    });
    return out;
  });
  check(breeds['260/U14'] === 'AA Hybrida 1S',
        '260 / U14 reads the breed off the batch, not a dash (' + (breeds['260/U14'] || '') + ')');
  check(breeds['199/B9'] === '—',
        '199 / B9, with no breed anywhere, honestly stays a dash (' + (breeds['199/B9'] || '') + ')');
  check(breeds['264/U13'] === 'UPB PREMIER HYBRID',
        'a row carrying its own breed is untouched');

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
