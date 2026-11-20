/* REVIEW AL DETAILS NAMES THE DAY, THE PLOT AND THE BREED OF EVERY DO, AND
   HANDS THE CUSTOMER A STATEMENT.

   The office, over AL BG8WA1: "The AL does not link the date, Plot &
   Breed." Every DO row in Complete Documentation History read "-" for both.
   The page drew them from the DO row, and its read of shared_do_records
   asked for seven columns -- id, number, AL, qty, status, remark, created
   -- so there was never a date or a plot on the row to draw. The Delivery
   and BA pages carry the same modal and always asked for them.

   And a Download button on the section, for the customer: the order
   number, the customer name, the order quantity, every collection with
   its plot and breed, and the balance. Cancelled DOs are no collection
   and are left off; nothing internal (BA form, remark) is printed.

   The stub PROJECTS a read to the columns it asks for, the way PostgREST
   does -- a stub that hands back the whole row passes over the very fault.

   Run: node tests/an_al_shows_its_collections.cjs   (starts its own server)
*/
const fs = require('fs'), http = require('http'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require(fs.existsSync('/opt/node-tools/node_modules/playwright')
  ? '/opt/node-tools/node_modules/playwright' : 'playwright');
const ROOT = path.join(__dirname, '..');
const JSPDF = ['/home/user/FC-Portal/node_modules/jspdf/dist/jspdf.umd.min.js',
  path.join(ROOT, 'node_modules/jspdf/dist/jspdf.umd.min.js')].find(p => fs.existsSync(p));

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'application/octet-stream' });
    res.end(b);
  });
});

const ADMIN = { id: 'u1', email: 'u1@m.t', full_name: 'Office', user_type: 'system',
  permissions: { manage_users: true, modules: { operation: 'admin' } } };
const AL = { id: 'al1', al_number: 'BG8WA1', order_number: 'BG8WA1', order_date: '2026-06-26',
  customer_name: 'LEE YOK JIN CONTRACTOR SDN BHD', quantity_ordered: 1000, balance_quantity: 400,
  status: 'Verified', remark: 'Auto-generated from Sales Web Order #BG8WA1', created_at: '2026-06-26T01:00:00Z' };
const DOS = [
  { id: 1, do_number: '03578', al_number: 'BG8WA1', delivery_date: '2026-07-02', total_qty: 19, status: 'Delivered', remark: 'LEE YOK JIN', created_at: '2026-07-02T02:00:00Z', plot_1: 'U9', breed_1: 'IOI DxP HYBRID', qty_1: 19 },
  { id: 2, do_number: '03707', al_number: 'BG8WA1', delivery_date: '2026-08-14', total_qty: 181, status: 'Delivered', remark: 'LEE YOK JIN', created_at: '2026-08-14T02:00:00Z', plot_1: 'B4', breed_1: 'UPB PREMIER HYBRID', qty_1: 100, plot_2: 'B5', breed_2: 'UPB PREMIER HYBRID', qty_2: 81 },
  { id: 3, do_number: 'DO-BG8WA1XX', al_number: 'BG8WA1', delivery_date: '2026-09-01', total_qty: 50, status: 'Cancelled', remark: '[CANCELLED]', created_at: '2026-09-01T02:00:00Z', plot_1: 'N2', breed_1: 'IOI DxP HYBRID', qty_1: 50 },
  { id: 4, do_number: 'DO-BG8WA101', al_number: 'BG8WA1', delivery_date: null, total_qty: 80, status: 'Delivered', remark: 'LEE YOK JIN', created_at: '2026-10-05T03:00:00Z', plot_1: 'N12', breed_1: 'UPB PREMIER HYBRID', qty_1: 80 },
];

const SUPA = `(function(){
 const T = () => ({ shared_profiles: [${JSON.stringify(ADMIN)}], shared_al_orders: [${JSON.stringify(AL)}], shared_do_records: ${JSON.stringify(DOS)} });
 window.supabase={createClient:()=>({
  from(table){ const st={f:[],cols:'*',single:false,maybe:false};
   const api=new Proxy({},{get(_,k){
    if(k==='then') return (res,rej)=>{ let rows=(T()[table]||[]).filter(r=>st.f.every(([c,v])=>String(r[c])===String(v)));
      if(st.cols!=='*'){ const cs=st.cols.split(',').map(s=>s.trim()); rows=rows.map(r=>{const o={}; cs.forEach(c=>{ if(c in r) o[c]=r[c]; else o[c]=null; }); return o;}); }
      const data=(st.single||st.maybe)?(rows[0]??null):rows;
      return new Promise(r=>setTimeout(()=>r({data,error:null}),5)).then(res,rej);};
    if(k==='select') return (c)=>{ if(c) st.cols=c; return api; };
    if(k==='eq') return (c,v)=>{st.f.push([c,v]);return api;};
    if(k==='single') return ()=>{st.single=true;return api;};
    if(k==='maybeSingle') return ()=>{st.maybe=true;return api;};
    return ()=>api; }});
   return api; },
  rpc(){ return Promise.resolve({data:null,error:null}); },
  functions:{ invoke:async()=>({data:null,error:null}) },
  storage:{ from(){ return { upload:async()=>({data:null,error:null}), getPublicUrl:()=>({data:{publicUrl:''}}) }; } },
  auth:{ getSession:()=>Promise.resolve({data:{session:{user:{id:'u1',email:'u1@m.t',user_metadata:{full_name:'Office'}}}}}),
         getUser:()=>Promise.resolve({data:{user:{id:'u1',email:'u1@m.t'}}}),
         onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut:async()=>({}) },
  channel(){ return {on(){return this;},subscribe(){return this;}}; }, removeChannel(){}
 })};
})();`;

let fails = 0;
const check = (name, got, want) => {
  const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '  ok  ' : ' FAIL ') + name + (ok ? '' : '  -> got ' + JSON.stringify(got)));
  if (!ok) fails++;
};

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  [page error] ' + e.message));
  // Routes match in REVERSE order: the catch-all first.
  await page.route('**cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: SUPA }));
  await page.route('**cdn.jsdelivr.net/npm/jspdf**', r => r.fulfill({ contentType: 'text/javascript',
    body: JSPDF ? fs.readFileSync(JSPDF, 'utf8') : '' }));
  await page.route('**cdn.tailwindcss.com**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**fonts.gstatic.com/**', r => r.abort());
  await page.goto(`http://127.0.0.1:${port}/operation/operation_booking.html`);
  await page.waitForTimeout(2000);
  await page.evaluate(() => openManageModal('al1'));
  await page.waitForTimeout(300);

  console.log('\n1. Every DO row names its day, its plots and their breeds');
  const rows = await page.$$eval('#al-do-history-tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.textContent.trim())));
  const byNo = Object.fromEntries(rows.map(r => [r[0], r]));
  check('03578 is dated 2026-07-02', (byNo['03578'] || [])[1], '2026-07-02');
  check('03578 names U9 and its breed', (byNo['03578'] || [])[2], s => /U9/.test(s || '') && /IOI DxP HYBRID/.test(s || ''));
  check('03707 names both its plots', (byNo['03707'] || [])[2], s => /B4/.test(s || '') && /B5/.test(s || '') && /UPB PREMIER/.test(s || ''));
  check('a DO with no delivery date falls back to the day it was saved', (byNo['DO-BG8WA101'] || [])[1], '2026-10-05');
  check('03578 reads plot and breed, no quantity', (byNo['03578'] || [])[2], 'U9 - IOI DxP HYBRID');
  check('03707 reads both plots and breeds, no quantities', (byNo['03707'] || [])[2], 'B4 - UPB PREMIER HYBRID, B5 - UPB PREMIER HYBRID');
  check('no row reads a dash for its day', rows.filter(r => r[1] === '-').map(r => r[0]), []);
  check('no row reads a dash for its plot', rows.filter(r => r[2] === '-').map(r => r[0]), []);
  check('the balance still runs: 1000 - 19 - 181 - 80 = 720 after the last', (byNo['DO-BG8WA101'] || [])[4], '720');

  console.log('\n2. The section carries a Download for the customer');
  const has = await page.$('#al-statement-btn');
  check('a Download button sits on the section', !!has, true);
  if (has && JSPDF) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
      page.click('#al-statement-btn')]);
    check('pressing it downloads a file', !!dl, true);
    if (dl) {
      check('the file is named after the order', dl.suggestedFilename(), 'Order_Statement_BG8WA1.pdf');
      const f = path.join(os.tmpdir(), 'al_statement_' + process.pid + '.pdf');
      await dl.saveAs(f);
      const txt = execFileSync('pdftotext', ['-layout', f, '-']).toString();
      check('it names the customer', /LEE YOK JIN CONTRACTOR SDN BHD/.test(txt), true);
      check('it names the order number', /BG8WA1/.test(txt), true);
      check('the plot lines carry no quantity', /HYBRID \(\d/.test(txt), false);
      check('it gives the order quantity', /1,000/.test(txt), true);
      check('it lists each collection with its plot and breed', /03578/.test(txt) && /U9 - IOI DxP HYBRID/.test(txt) && /B4 - UPB PREMIER HYBRID/.test(txt), true);
      check('it leaves the cancelled DO off', /DO-BG8WA1XX/.test(txt), false);
      check('it totals 280 collected and 720 left', /TOTAL COLLECTED\s+280\s+720/.test(txt), true);
      check('it says the balance in words', /Balance quantity still to be collected: 720/.test(txt), true);
      check('it prints no BA form and no remark', /Not Linked|Associated BA|\[CANCELLED\]/.test(txt), false);
      if (process.env.KEEP) fs.copyFileSync(f, process.env.KEEP); fs.unlinkSync(f);
    }
  } else if (!JSPDF) console.log('  (no local jspdf found, the download half was not asked)');

  console.log(`\n${fails ? fails + ' FAILED' : 'all checks passed'}`);
  await browser.close(); server.close();
  process.exit(fails ? 1 : 0);
})();
