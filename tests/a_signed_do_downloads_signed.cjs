/* A SIGNED DO NEVER DOWNLOADS WITH AN EMPTY SIGNATURE BOX.

   The office: "I downloaded this DO but it's empty but actually it has
   already sign." DO-QUM79601 — issued and signed on a phone, photo on the
   row, signature nowhere on it, because the phone apps only started
   writing signature_url onto shared_do_records on 20 Oct 2026. For every
   DO before that (519 rows, 328 with the signed PDF still in storage) the
   signature exists ONLY inside the PDF attachDOToOrder built at issue
   time, at the deterministic path
   order-attachments/do-pdfs/<AL>/<DO>.pdf.

   So printCurrentDO on operation_delivery.html now works down a ladder:
   1. manual_signed_url / signature_url on the row -> build the PDF with
      it, exactly as before;
   2. no signature on the row -> fetch the signed ORIGINAL from the bucket
      and download THAT file, with a toast naming which copy it is (and
      pointing at the manually-signed upload for an amended DO);
   3. nothing in the bucket either (a storage miss answers a small JSON
      error, which must never be handed over as a PDF), or a MANUAL- AL
      that never had an attachment -> build the unsigned PDF as before.

   Drives the REAL page in a real browser; the jsPDF stub refuses
   non-finite coordinates, because a stub that accepts anything signs off
   a form that cannot be drawn.
   Run: node tests/a_signed_do_downloads_signed.cjs
*/
const fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require(fs.existsSync('/opt/node-tools/node_modules/playwright')
  ? '/opt/node-tools/node_modules/playwright' : 'playwright');
const ROOT = path.join(__dirname, '..');

const FAKE_PDF = Buffer.concat([Buffer.from('%PDF-1.4\n% signed DO as issued\n'), Buffer.alloc(4000, 0x20), Buffer.from('\n%%EOF')]);
const FAKE_PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/__storage/order-attachments/do-pdfs/QUM796/DO-QUM79601.pdf') {
    res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end(FAKE_PDF); return;
  }
  if (url.startsWith('/__storage/')) {
    // A storage miss the way Supabase answers one: a small JSON error.
    res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not_found"}'); return;
  }
  if (url === '/__sig.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(FAKE_PNG); return; }
  const p = path.join(ROOT, url);
  fs.readFile(p, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(p)] || 'application/octet-stream' });
    res.end(b);
  });
});

const SUPA = `window.SHARED_SUPA_URL='x';window.SHARED_SUPA_KEY='y';
(function(){
 const chk=(...ns)=>ns.forEach(n=>{if(!Number.isFinite(n))throw new Error('Invalid arguments passed to jsPDF: '+n);});
 window.__pdfCalls=[];
 window.jspdf={jsPDF:class{
  constructor(){this.rec={addImage:[],text:[],saved:null};window.__pdfCalls.push(this.rec);}
  setFont(){}setFontSize(){}setTextColor(){}setDrawColor(){}setLineWidth(){}setFillColor(){}
  rect(x,y,w,h){chk(x,y,w,h);}
  line(a,b,c,d){chk(a,b,c,d);}
  text(t,x,y){chk(x,y);this.rec.text.push(Array.isArray(t)?t.join(' '):String(t));}
  splitTextToSize(t){return [String(t)];}
  getImageProperties(d){if(!/^data:image/.test(String(d)))throw new Error('not an image data url');return{width:200,height:100,fileType:'PNG'};}
  addImage(d,f,x,y,w,h){chk(x,y,w,h);this.rec.addImage.push({w,h});}
  output(){return new Blob(['pdf'],{type:'application/pdf'});}
  save(name){this.rec.saved=name;}
 }};
 // shared_profiles is preloaded so the staff gate lets the page boot;
 // the test swaps in its DO rows after load.
 window.__T={shared_profiles:[{id:'u1',email:'office@m.t',full_name:'J',user_type:'staff',permissions:{manage_users:true,modules:{operation:'admin'}}}]};
 window.supabase={createClient:()=>({
  from(table){ const st={f:[],single:false};
   const api=new Proxy({},{get(_,k){
    if(k==='then') return (res,rej)=>{
      let rows=((window.__T&&window.__T[table])||[]).filter(r=>st.f.every(([c,v])=>String(r[c])===String(v)));
      return Promise.resolve({data:st.single?(rows[0]??null):rows,error:null}).then(res,rej);};
    if(k==='eq') return (c,v)=>{st.f.push([c,v]);return api;};
    if(k==='single'||k==='maybeSingle') return ()=>{st.single=true;return api;};
    return ()=>api; }});
   return api; },
  storage:{ from:(bucket)=>({
    getPublicUrl:(p)=>({data:{publicUrl: location.origin + '/__storage/' + bucket + '/' + p}}),
    upload:async()=>({error:null})
  })},
  rpc(){ return Promise.resolve({data:null,error:null}); },
  auth:{ getSession:async()=>({data:{session:{user:{id:'u1',email:'office@m.t'}}}}),
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
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1500, height: 1000 } });
  await page.route('**cdn.tailwindcss.com**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: SUPA }));
  await page.route('**cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**fonts.gstatic.com/**', r => r.abort());
  const storageHits = [];
  page.on('request', rq => { const u = rq.url(); if (u.includes('/__storage/')) storageHits.push(u); });
  page.on('pageerror', e => console.log(' page error: ' + e.message.slice(0, 160)));

  await page.goto(`http://127.0.0.1:${port}/operation/operation_delivery.html`, { waitUntil: 'domcontentloaded' });
  // Only the function every version of the page has — on the PREVIOUS page
  // the fallback does not exist, and that must read as FAIL lines on the
  // checks below, not as a boot timeout.
  await page.waitForFunction('typeof printCurrentDO === "function"', null, { timeout: 15000 });

  // Seed the page's own globals with four DOs: the extras rows are what
  // loadDOExtras re-reads at print time, same table the real page asks.
  await page.evaluate(() => {
    Object.assign(window.__T, {
      shared_do_records: [
        { id: 1, do_number: 'DO-QUM79601', al_number: 'QUM796', total_qty: 700, delivery_date: '2026-10-20', plot_1: 'N16', breed_1: 'UPB', qty_1: 700, image_url: null, signature_url: null, manual_signed_url: null },
        { id: 2, do_number: 'DO-SIG0101',  al_number: 'SIG010', total_qty: 100, delivery_date: '2026-10-25', plot_1: 'U1', breed_1: 'DxP', qty_1: 100, image_url: null, signature_url: location.origin + '/__sig.png', manual_signed_url: null },
        { id: 3, do_number: 'DO-MISS0101', al_number: 'MISS01', total_qty: 50,  delivery_date: '2026-09-01', plot_1: 'B1', breed_1: 'DxP', qty_1: 50, image_url: null, signature_url: null, manual_signed_url: null },
        { id: 4, do_number: 'DO-M0101',    al_number: 'MANUAL-7', total_qty: 10, delivery_date: '2026-09-02', plot_1: 'B2', breed_1: 'DxP', qty_1: 10, image_url: null, signature_url: null, manual_signed_url: null },
      ],
    });
    globalDOs = window.__T.shared_do_records.slice();
    globalALs = [{ al_number: 'QUM796', customer_name: 'AZAM ASIAKOM SDN BHD' }, { al_number: 'SIG010', customer_name: 'SIGNED CUSTOMER' }];
  });

  // ── 1. A pre-fix DO downloads the SIGNED ORIGINAL from the bucket ────────
  await page.evaluate(() => { document.getElementById('manage-do-id').value = '1'; });
  const dl1 = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.evaluate(() => printCurrentDO());
  const d1 = await dl1;
  check(!!d1, 'a DO with no signature on the row still produces a download');
  if (d1) {
    const body = fs.readFileSync(await d1.path());
    check(body.slice(0, 5).toString() === '%PDF-', 'and it is a PDF');
    check(body.equals(FAKE_PDF), 'and it is the SIGNED ORIGINAL from order-attachments, byte for byte — not a rebuilt unsigned one');
    check(/^DO-QUM79601_/.test(d1.suggestedFilename()), `named like every other DO download (got ${d1.suggestedFilename()})`);
  }
  const built1 = await page.evaluate(() => window.__pdfCalls.filter(c => c.saved).length);
  check(built1 === 0, 'jsPDF built and saved NOTHING for it — the empty-box rebuild is exactly what the office reported');
  const toast = await page.evaluate(() => { const el = document.querySelector('div.fixed.bottom-6.right-6'); return el ? el.textContent : ''; });
  check(/signed copy made when this do was issued/i.test(toast) && /manually signed/i.test(toast),
    `a toast names which copy it is and the amended-DO route (got "${toast.slice(0, 90)}")`);

  // ── 2. A DO WITH its signature on the row builds as before ───────────────
  await page.evaluate(() => { document.getElementById('manage-do-id').value = '2'; window.__pdfCalls = []; storageBefore = 0; });
  const hitsBefore2 = storageHits.length;
  await page.evaluate(() => printCurrentDO());
  await page.waitForFunction('window.__pdfCalls.some(c => c.saved)', null, { timeout: 8000 });
  const sigBuild = await page.evaluate(() => window.__pdfCalls.find(c => c.saved));
  check(!!sigBuild && sigBuild.addImage.length >= 1, `the signature image is DRAWN into the built PDF (got ${sigBuild && sigBuild.addImage.length} images)`);
  check(storageHits.length === hitsBefore2, 'and the bucket was never asked — the row answers for itself');

  // ── 3. No signature anywhere: the storage JSON error is never a "PDF" ────
  await page.evaluate(() => { document.getElementById('manage-do-id').value = '3'; window.__pdfCalls = []; });
  const dl3 = page.waitForEvent('download', { timeout: 2500 }).catch(() => null);
  await page.evaluate(() => printCurrentDO());
  await page.waitForFunction('window.__pdfCalls.some(c => c.saved)', null, { timeout: 8000 });
  const miss = await page.evaluate(() => window.__pdfCalls.find(c => c.saved));
  check(!!miss && miss.saved && miss.text.some(t => /No photo captured/.test(t)),
    'a bucket MISS falls back to building the PDF exactly as before');
  check(storageHits.some(u => u.includes('DO-MISS0101')), 'after actually asking the bucket');
  const d3 = await dl3;
  check(!d3, 'and the 404 JSON error body was never handed over as a download');

  // ── 4. A MANUAL- AL never had an attachment, so the bucket is not asked ──
  const hitsBefore4 = storageHits.length;
  await page.evaluate(() => { document.getElementById('manage-do-id').value = '4'; window.__pdfCalls = []; });
  await page.evaluate(() => printCurrentDO());
  await page.waitForFunction('window.__pdfCalls.some(c => c.saved)', null, { timeout: 8000 });
  check(storageHits.length === hitsBefore4, 'a MANUAL- AL goes straight to the build — nothing to fetch');

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
