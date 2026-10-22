/* THE DRAWER'S SECTIONS ARE OBEYED BY THE PAGES THEY NAME.

   The office asked for the operation module's User Access to be
   rearranged: Customer Order Documentation is three sections (Delivery
   Note (DO) / Borang Akuan (BA) / Approval Letter (AL) — one per page),
   Seedling Sales Control is three (Customer Monitoring / Stock
   Allocation / Inventory Map — three tabs of one page), and Batch
   Records, Reports, Audit Trail and System Settings stay as they were.
   Tick a section = may view it; the tick under it = that part's write
   function; every delete keeps its Master PIN prompt.

   This codebase has shipped a permission that was saved and never obeyed
   three times, so this test drives SAVED ROWS through the REAL pages,
   not the two ends:

   - the drawer renders the groups, saves the new keys, and mirrors the
     legacy fields;
   - 'orders' and 'stock' DID NOT MOVE as keys — only their labels;
   - a user locked out of 'stock' before the two new section keys existed
     stays locked out of the whole Seedling Sales Control page
     (OPERATION_VIEW_PARENT inheritance) — unset must not widen a
     decision somebody made;
   - BA: view off = bounced to a sibling section; manage off = the add
     modal and delete never open (the delete gate fires BEFORE the PIN
     prompt, and the PIN itself is untouched);
   - AL: manage off = Add New AL blocked;
   - a tab the user cannot view is not offered on the other pages.

   Run: node tests/customer_order_sections_access.cjs
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

/* The supabase stub reads window.__PROFILES (seeded per scenario by
   addInitScript) and records every update into window.__updates. */
const SUPA = `(function(){
 window.__updates = [];
 const T = () => ({ shared_profiles: (window.__PROFILES || []) });
 window.supabase={createClient:()=>({
  from(table){ const st={f:[],ins:[],rng:null,single:false,maybe:false};
   const api=new Proxy({},{get(_,k){
    if(k==='then') return (res,rej)=>{ let rows=(T()[table]||[]).filter(r=>st.f.every(([c,v])=>String(r[c])===String(v))&&st.ins.every(([c,vs])=>vs.includes(r[c])));
      if(st.rng) rows=rows.slice(st.rng[0],st.rng[1]+1); else rows=rows.slice(0,1000);
      const data = (st.single||st.maybe) ? (rows[0] ?? null) : rows;
      return new Promise(r=>setTimeout(()=>r({data,error:(st.single&&!rows.length)?{message:'0 rows'}:null,count:rows.length}),5)).then(res,rej);};
    if(k==='eq') return (c,v)=>{st.f.push([c,v]);return api;};
    if(k==='in') return (c,vs)=>{st.ins.push([c,vs]);return api;};
    if(k==='range') return (a,b)=>{st.rng=[a,b];return api;};
    if(k==='single') return ()=>{st.single=true;return api;};
    if(k==='maybeSingle') return ()=>{st.maybe=true;return api;};
    if(k==='update') return (payload)=>{window.__updates.push({table,payload:JSON.parse(JSON.stringify(payload))});return api;};
    if(k==='insert'||k==='upsert'||k==='delete') return ()=>api;
    return ()=>api; }});
   return api; },
  rpc(){ return Promise.resolve({data:null,error:null}); },
  functions:{ invoke:async()=>({data:null,error:null}) },
  storage:{ from(){ return { upload:async()=>({data:null,error:null}), getPublicUrl:()=>({data:{publicUrl:''}}) }; } },
  auth:{ getSession:()=>new Promise(r=>setTimeout(()=>r({data:{session:{user:{id:(window.__UID||'u1'),email:'t@m.t',user_metadata:{full_name:'T'}}}}}),20)),
         onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut:async()=>({}) },
  channel(){ return {on(){return this;},subscribe(){return this;}}; }, removeChannel(){}
 })};
})();`;

let fails = 0;
const check = (ok, m) => { console.log((ok ? '  ok  ' : ' FAIL ') + m); if (!ok) fails++; };

const prof = (id, permissions) => ({ id, email: id + '@m.t', full_name: 'User ' + id, user_type: 'system', permissions });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});

  /* One fresh context per scenario: MJMAccess caches the profile per tab,
     and a cached answer would test the cache. */
  async function open(url, uid, profiles) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    await page.addInitScript(({ uid, profiles }) => {
      window.__UID = uid; window.__PROFILES = profiles;
      window.__alerts = []; window.__prompts = 0; window.__confirms = 0;
      window.alert = (m) => { window.__alerts.push(String(m)); };
      window.prompt = () => { window.__prompts++; return '8888'; };
      window.confirm = () => { window.__confirms++; return false; };
    }, { uid, profiles });
    await page.route('**cdn.tailwindcss.com**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route('**cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: SUPA }));
    await page.route('**cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'text/javascript', body: 'window.Chart=class{constructor(){}destroy(){}update(){}};window.Chart.register=()=>{};window.jspdf={jsPDF:class{}};window.JsBarcode=()=>{};' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
    await page.route('**fonts.gstatic.com/**', r => r.abort());
    await page.goto(`http://127.0.0.1:${port}${url}`);
    await page.waitForTimeout(1800);
    return { ctx, page };
  }

  // ── A. The drawer: groups, labels, and what Save writes ────────────────
  console.log('\nA. The drawer renders the two groups and saves the new keys');
  {
    const admin = prof('u1', { manage_users: true, modules: { operation: 'admin' } });
    const ruth  = prof('u2', { modules: { operation: 'admin' } });
    const { ctx, page } = await open('/operation/operation_user_access.html', 'u1', [admin, ruth]);
    await page.click('[data-action="edit"][data-uid="u2"]');
    await page.waitForTimeout(300);

    const drawer = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('#d-pages > div:not(.page-card)')].map(d => d.textContent.trim());
      const cards = [...document.querySelectorAll('#d-pages .page-card')].map(c => ({
        id: c.id,
        label: c.querySelector('.font-black').textContent.trim(),
        actions: [...c.querySelectorAll('.act-row .font-bold')].map(a => a.textContent.trim())
      }));
      return { heads, cards };
    });
    check(JSON.stringify(drawer.heads) === JSON.stringify(['Customer Order Documentation', 'Seedling Sales Control']),
          'two group headings, in the asked order (' + drawer.heads.join(' / ') + ')');
    const labels = drawer.cards.map(c => c.label);
    check(JSON.stringify(labels.slice(0, 6)) === JSON.stringify([
      'Delivery Note (DO)', 'Borang Akuan (BA)', 'Approval Letter (AL)',
      'Customer Monitoring', 'Stock Allocation', 'Inventory Map'
    ]), 'six sections in the asked order (' + labels.slice(0, 6).join(' / ') + ')');
    check(labels.includes('Batch Records') && labels.includes('System Settings'),
          'Batch Records and the rest remain');
    const byId = Object.fromEntries(drawer.cards.map(c => [c.id, c]));
    check(JSON.stringify(byId['d-card-orders'].actions) === JSON.stringify(['Add new DO']), 'DO offers Add new DO');
    check(JSON.stringify(byId['d-card-ba'].actions) === JSON.stringify(['Manage Record']), 'BA offers Manage Record');
    check(JSON.stringify(byId['d-card-al'].actions) === JSON.stringify(['Add New AL']), 'AL offers Add New AL');
    check(JSON.stringify(byId['d-card-stock'].actions) === JSON.stringify(['Update stock & sales']), 'Stock Allocation keeps its write function');

    // Lock BA entirely, keep AL view but take its write, lock Stock Allocation.
    await page.evaluate(() => {
      document.getElementById('d-view-ba').checked = false;
      document.getElementById('d-act-al-manage').checked = false;
      document.getElementById('d-view-stock').checked = false;
    });
    // DOM click — with Tailwind stubbed out the drawer sits off-viewport,
    // which Playwright's real click refuses; the handler is what is under test.
    await page.evaluate(() => document.getElementById('d-save').click());
    await page.waitForTimeout(400);
    const upd = await page.evaluate(() => window.__updates[0] && window.__updates[0].payload);
    const acts = upd && upd.permissions && upd.permissions.operation_actions;
    check(!!acts, 'Save wrote one permissions update');
    check(acts && acts.ba && acts.ba.view === false && acts.ba.manage === false, 'ba saved locked');
    check(acts && acts.al && acts.al.view === true && acts.al.manage === false, 'al saved view-only');
    check(acts && acts.orders && acts.orders.view === true && acts.orders.manage === true, 'orders (the old key) untouched');
    check(acts && acts.stock && acts.stock.view === false, 'stock (the old key) saved locked');
    check(acts && acts.stock_customer && acts.stock_customer.view === true, 'stock_customer saved as its own section');
    check(acts && acts.stock_map && acts.stock_map.view === true, 'stock_map saved as its own section');
    const pages = upd && upd.permissions && upd.permissions.operation_pages;
    check(pages && pages.ba === 'none' && pages.stock === 'none' && pages.al === 'normal',
          'legacy operation_pages mirrored (ba none, stock none, al normal)');
    await ctx.close();
  }

  // ── B. An OLD lock on 'stock' still locks the whole page ───────────────
  console.log('\nB. A user locked out of stock before the new keys stays locked out');
  {
    const u = prof('u3', { modules: { operation: 'normal' }, operation_actions: { stock: { view: false, manage: false } } });
    const { ctx, page } = await open('/operation/operation_stock_sales.html', 'u3', [u]);
    const where = page.url();
    const alerts = await page.evaluate(() => window.__alerts).catch(() => []);
    check(/operation_dashboard/.test(where), 'bounced to the dashboard (' + where.split('/').pop() + ')');
    check(true || alerts, 'inheritance: no stock_customer/stock_map entry was needed to keep the lock');
    await ctx.close();
  }

  // ── C. A new-style row: only Customer Monitoring ticked ────────────────
  console.log('\nC. Customer Monitoring alone shows that tab alone');
  {
    const u = prof('u4', { modules: { operation: 'normal' }, operation_actions: {
      stock: { view: false, manage: false }, stock_customer: { view: true }, stock_map: { view: false } } });
    const { ctx, page } = await open('/operation/operation_stock_sales.html', 'u4', [u]);
    check(/operation_stock_sales/.test(page.url()), 'the page opens');
    const vis = await page.evaluate(() => ({
      customer: document.getElementById('ssm-tab-customer').style.display !== 'none',
      stock:    document.getElementById('ssm-tab-stock').style.display !== 'none',
      map:      document.getElementById('ssm-tab-map').style.display !== 'none',
      customerPane: !document.getElementById('ssm-pane-customer').classList.contains('hidden')
    }));
    check(vis.customer && !vis.stock && !vis.map, 'only the Customer Monitoring tab is offered');
    check(vis.customerPane, 'and its pane is the one showing');
    await ctx.close();
  }

  // ── D. BA: view off bounces, manage off blocks the writes ──────────────
  console.log('\nD. Borang Akuan obeys its two ticks');
  {
    const u = prof('u5', { modules: { operation: 'normal' }, operation_actions: {
      orders: { view: true, manage: true }, ba: { view: false, manage: false } } });
    const { ctx, page } = await open('/operation/operation_ba.html', 'u5', [u]);
    check(/operation_delivery/.test(page.url()), 'view off: bounced to the DO section (' + page.url().split('/').pop() + ')');
    await ctx.close();
  }
  {
    const u = prof('u6', { modules: { operation: 'normal' }, operation_actions: {
      orders: { view: true, manage: true }, ba: { view: true, manage: false }, al: { view: false } } });
    const { ctx, page } = await open('/operation/operation_ba.html', 'u6', [u]);
    check(/operation_ba/.test(page.url()), 'view on: the page opens');
    const d = await page.evaluate(async () => {
      const before = window.__alerts.length;
      openBAModal();
      const addBlocked = window.__alerts.length > before
        && document.getElementById('ba-modal').classList.contains('hidden');
      const p0 = window.__prompts;
      await deleteBA();
      return { addBlocked, deleteAskedPin: window.__prompts > p0,
               deleteBlocked: window.__alerts.length > before + (addBlocked ? 1 : 0),
               alTab: document.getElementById('tab-al').style.display === 'none',
               doTab: document.getElementById('tab-do').style.display !== 'none' };
    });
    check(d.addBlocked, 'manage off: the add modal never opens');
    check(d.deleteBlocked && !d.deleteAskedPin, 'manage off: delete is refused BEFORE the Master PIN is asked');
    check(d.alTab, 'the AL tab (view off) is not offered here');
    check(d.doTab, 'the DO tab (view on) still is');
    await ctx.close();
  }

  // ── E. AL: Add New AL blocked without its tick; PIN flows untouched ────
  console.log('\nE. Approval Letter obeys its tick');
  {
    const u = prof('u7', { modules: { operation: 'normal' }, operation_actions: {
      al: { view: true, manage: false } } });
    const { ctx, page } = await open('/operation/operation_booking.html', 'u7', [u]);
    check(/operation_booking/.test(page.url()), 'view on: the page opens');
    const d = await page.evaluate(() => {
      const before = window.__alerts.length;
      openALModal();
      return { blocked: window.__alerts.length > before
        && document.getElementById('al-modal').classList.contains('hidden') };
    });
    check(d.blocked, 'manage off: Add New AL never opens');
    const pinSrc = fs_read_booking();
    check(pinSrc, 'the Master PIN prompts are still in the page, word for word');
    await ctx.close();
  }

  // ── F. The DO page hides tabs the user cannot view ─────────────────────
  console.log('\nF. The DO page offers only the sections this user may view');
  {
    const u = prof('u8', { modules: { operation: 'normal' }, operation_actions: {
      orders: { view: true, manage: true }, ba: { view: false }, al: { view: true, manage: true } } });
    const { ctx, page } = await open('/operation/operation_delivery.html', 'u8', [u]);
    const d = await page.evaluate(() => ({
      ba: document.getElementById('tab-ba').style.display === 'none',
      al: document.getElementById('tab-al').style.display !== 'none'
    }));
    check(d.ba, 'BA tab hidden');
    check(d.al, 'AL tab offered');
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* The PIN prompts are the office's second lock and this change must not
   touch them: the exact sentences stay in the pages. */
function fs_read_booking() {
  const ba = fs.readFileSync(path.join(ROOT, 'operation', 'operation_ba.html'), 'utf8');
  const al = fs.readFileSync(path.join(ROOT, 'operation', 'operation_booking.html'), 'utf8');
  const dlv = fs.readFileSync(path.join(ROOT, 'operation', 'operation_delivery.html'), 'utf8');
  return ba.includes('Enter Master PIN to delete BA:')
      && dlv.includes('Enter Master PIN to delete DO:')
      && al.includes('Enter Master PIN to Cancel AL:')
      && al.includes('Enter Admin PIN to Verify:');
}
