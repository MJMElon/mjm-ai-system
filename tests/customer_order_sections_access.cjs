/* CUSTOMER ORDER DOCUMENTATION AND SEEDLING SALES CONTROL ARE ONE CARD EACH.

   They were three sections apiece for a day — one page/tab per section,
   each with its own "Open Page" switch. The office looked at that next to
   Batch Records and asked for the same shape here instead: ONE "Open
   Page" switch per card, the write functions as ticks underneath —
   Add new DO / Manage Borang Akuan (BA) Record / Add New AL under
   Customer Order Documentation, Customer Monitoring / Update stock &
   sales / Inventory Map under Seedling Sales Control.

   'orders' and 'stock' are the long-standing stored keys and carry the
   section's view now for every page/tab in their card — DO, BA and AL
   open and lock together; Customer Monitoring, Stock Allocation and
   Inventory Map do too. 'ba_manage', 'al_manage', 'customer' and 'map'
   are new action keys on those same old keys, and a row saved before
   they existed has no opinion on them — they must default to ALLOWED on
   such a row rather than reading "nobody ticked this" as "no", the same
   unset-must-not-widen-or-narrow-a-decision rule this codebase applies
   everywhere a key is added to an existing gate.

   This codebase has shipped a permission that was saved and never obeyed
   three times, so this test drives SAVED ROWS through the REAL pages,
   not the two ends:

   - the drawer renders ONE card per group, with the three ticks, and
     Save writes all three action keys onto the one stored key;
   - a legacy row saved before today — 'orders': {view,manage} or
     'stock': {view,manage}, nothing else — still manages BA and AL, and
     still shows Customer Monitoring and Inventory Map;
   - locking 'orders' locks DO, BA and AL together, with no sibling left
     to bounce to;
   - locking 'stock' locks the whole Seedling Sales Control page;
   - ba_manage off blocks BA's add/delete (the delete gate fires BEFORE
     the PIN prompt, and the PIN itself is untouched);
   - al_manage off blocks Add New AL, same PIN flows untouched;
   - the DO/BA/AL tabs are never hidden from each other any more — there
     is no view a user can have of one without the others.

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

  // ── A. The drawer: one card per group, and what Save writes ────────────
  console.log('\nA. The drawer renders one card per group and saves the ticks onto it');
  {
    const admin = prof('u1', { manage_users: true, modules: { operation: 'admin' } });
    const ruth  = prof('u2', { modules: { operation: 'admin' } });
    const { ctx, page } = await open('/operation/operation_user_access.html', 'u1', [admin, ruth]);
    await page.click('[data-action="edit"][data-uid="u2"]');
    await page.waitForTimeout(300);

    const drawer = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#d-pages .page-card')].map(c => ({
        id: c.id,
        label: c.querySelector('.font-black').textContent.trim(),
        actions: [...c.querySelectorAll('.act-row .font-bold')].map(a => a.textContent.trim())
      }));
      return { cards };
    });
    const labels = drawer.cards.map(c => c.label);
    check(labels[0] === 'Customer Order Documentation' && labels[1] === 'Seedling Sales Control',
          'the two cards lead, in the asked order (' + labels.slice(0, 2).join(' / ') + ')');
    check(labels.includes('Batch Records') && labels.includes('System Settings'),
          'Batch Records and the rest remain');
    check(!labels.includes('Delivery Note (DO)') && !labels.includes('Borang Akuan (BA)')
          && !labels.includes('Approval Letter (AL)') && !labels.includes('Customer Monitoring')
          && !labels.includes('Stock Allocation') && !labels.includes('Inventory Map'),
          'the six separate sections are gone — only the two merged cards remain');
    const byId = Object.fromEntries(drawer.cards.map(c => [c.id, c]));
    check(JSON.stringify(byId['d-card-orders'].actions) === JSON.stringify(
      ['Add new DO', 'Manage Borang Akuan (BA) Record', 'Add New AL', 'Verify AL', 'Cancel & restore AL', 'Delete DO / BA']),
      'Customer Order Documentation offers its six ticks, in order (' + byId['d-card-orders'].actions.join(' / ') + ')');
    check(JSON.stringify(byId['d-card-stock'].actions) === JSON.stringify(
      ['Customer Monitoring', 'Update stock & sales', 'Inventory Map']),
      'Seedling Sales Control offers all three ticks, in order (' + byId['d-card-stock'].actions.join(' / ') + ')');

    // Open the card, keep the page open, lock BA's write and Customer
    // Monitoring, leave DO/AL and Stock Allocation/Inventory Map ticked.
    await page.evaluate(() => {
      document.getElementById('d-view-orders').checked = true;
      document.getElementById('d-act-orders-manage').checked = true;
      document.getElementById('d-act-orders-ba_manage').checked = false;
      document.getElementById('d-act-orders-al_manage').checked = true;
      document.getElementById('d-view-stock').checked = true;
      document.getElementById('d-act-stock-customer').checked = false;
      document.getElementById('d-act-stock-manage').checked = true;
      document.getElementById('d-act-stock-map').checked = true;
    });
    await page.evaluate(() => document.getElementById('d-save').click());
    await page.waitForTimeout(400);
    const upd = await page.evaluate(() => window.__updates[0] && window.__updates[0].payload);
    const acts = upd && upd.permissions && upd.permissions.operation_actions;
    check(!!acts, 'Save wrote one permissions update');
    check(acts && acts.orders && acts.orders.view === true && acts.orders.manage === true
          && acts.orders.ba_manage === false && acts.orders.al_manage === true,
          'orders carries all three ticks (' + JSON.stringify(acts && acts.orders) + ')');
    check(acts && acts.stock && acts.stock.view === true && acts.stock.customer === false
          && acts.stock.manage === true && acts.stock.map === true,
          'stock carries all three ticks (' + JSON.stringify(acts && acts.stock) + ')');
    const pages = upd && upd.permissions && upd.permissions.operation_pages;
    check(pages && pages.orders === 'normal' && pages.stock === 'normal',
          'legacy operation_pages mirrored (orders normal, stock normal)');
    check(!('ba' in (acts || {})) && !('al' in (acts || {}))
          && !('stock_customer' in (acts || {})) && !('stock_map' in (acts || {})),
          'no separate ba / al / stock_customer / stock_map keys are written any more');
    await ctx.close();
  }

  // ── B. Locking 'orders' locks DO, BA and AL together ────────────────────
  console.log("\nB. Locking Customer Order Documentation locks all three pages, with no sibling to fall back to");
  {
    const u = prof('u3', { modules: { operation: 'normal' }, operation_actions: { orders: { view: false, manage: false, ba_manage: false, al_manage: false } } });
    for (const url of ['/operation/operation_delivery.html', '/operation/operation_ba.html', '/operation/operation_booking.html']) {
      const { ctx, page } = await open(url, 'u3', [u]);
      check(/operation_dashboard/.test(page.url()), url + ' bounced to the dashboard (' + page.url().split('/').pop() + ')');
      await ctx.close();
    }
  }

  // ── C. Locking 'stock' locks the whole Seedling Sales Control page ──────
  console.log('\nC. Locking Seedling Sales Control locks the whole page');
  {
    const u = prof('u4', { modules: { operation: 'normal' }, operation_actions: { stock: { view: false, manage: false, customer: false, map: false } } });
    const { ctx, page } = await open('/operation/operation_stock_sales.html', 'u4', [u]);
    check(/operation_dashboard/.test(page.url()), 'bounced to the dashboard (' + page.url().split('/').pop() + ')');
    await ctx.close();
  }

  // ── D. A LEGACY row with no opinion on the new ticks keeps working ──────
  console.log('\nD. A row saved before today still manages BA/AL and still shows every stock tab');
  {
    // Exactly what 'orders' / 'stock' looked like before this feature —
    // view and manage only, nothing named ba_manage/al_manage/customer/map.
    const u = prof('u5', { modules: { operation: 'normal' },
      operation_actions: { orders: { view: true, manage: true }, stock: { view: true, manage: true } } });
    const { ctx: ctx1, page: ba } = await open('/operation/operation_ba.html', 'u5', [u]);
    check(/operation_ba/.test(ba.url()), 'the BA page opens on a legacy orders row');
    const baOk = await ba.evaluate(() => {
      const before = window.__alerts.length;
      openBAModal();
      return window.__alerts.length === before && !document.getElementById('ba-modal').classList.contains('hidden');
    });
    check(baOk, "ba_manage unset on a legacy row still allows Manage Borang Akuan (BA) Record");
    await ctx1.close();

    const { ctx: ctx2, page: al } = await open('/operation/operation_booking.html', 'u5', [u]);
    check(/operation_booking/.test(al.url()), 'the AL page opens on a legacy orders row');
    const alOk = await al.evaluate(() => {
      const before = window.__alerts.length;
      openALModal();
      return window.__alerts.length === before && !document.getElementById('al-modal').classList.contains('hidden');
    });
    check(alOk, 'al_manage unset on a legacy row still allows Add New AL');
    await ctx2.close();

    const { ctx: ctx3, page: stk } = await open('/operation/operation_stock_sales.html', 'u5', [u]);
    check(/operation_stock_sales/.test(stk.url()), 'the Stock page opens on a legacy stock row');
    const vis = await stk.evaluate(() => ({
      customer: document.getElementById('ssm-tab-customer').style.display !== 'none',
      map:      document.getElementById('ssm-tab-map').style.display !== 'none'
    }));
    check(vis.customer && vis.map, 'customer/map unset on a legacy row still shows both tabs');
    await ctx3.close();
  }

  // ── E. BA obeys its own tick without touching DO or AL ──────────────────
  console.log('\nE. Borang Akuan obeys ba_manage; the delete gate fires before the PIN');
  {
    const u = prof('u6', { modules: { operation: 'normal' }, operation_actions: {
      orders: { view: true, manage: true, ba_manage: false, al_manage: true } } });
    const { ctx, page } = await open('/operation/operation_ba.html', 'u6', [u]);
    check(/operation_ba/.test(page.url()), 'the page opens: orders.view is true');
    const d = await page.evaluate(async () => {
      const before = window.__alerts.length;
      openBAModal();
      const addBlocked = window.__alerts.length > before
        && document.getElementById('ba-modal').classList.contains('hidden');
      const p0 = window.__prompts;
      await deleteBA();
      return { addBlocked, deleteAskedPin: window.__prompts > p0,
               deleteBlocked: window.__alerts.length > before + (addBlocked ? 1 : 0),
               doTabThere: !!document.getElementById('tab-do'),
               alTabThere: !!document.getElementById('tab-al') };
    });
    check(d.addBlocked, 'ba_manage off: the add modal never opens');
    check(d.deleteBlocked && !d.deleteAskedPin, 'ba_manage off: delete is refused BEFORE the Master PIN is asked');
    check(d.doTabThere && d.alTabThere, 'the DO and AL tabs are still offered — they open and lock with this one together');
    await ctx.close();
  }

  // ── F. AL obeys its own tick; PIN flows untouched ───────────────────────
  console.log('\nF. Approval Letter obeys al_manage; no Master PIN is left');
  {
    const u = prof('u7', { modules: { operation: 'normal' }, operation_actions: {
      orders: { view: true, manage: true, ba_manage: true, al_manage: false } } });
    const { ctx, page } = await open('/operation/operation_booking.html', 'u7', [u]);
    check(/operation_booking/.test(page.url()), 'the page opens: orders.view is true');
    const d = await page.evaluate(() => {
      const before = window.__alerts.length;
      openALModal();
      return { blocked: window.__alerts.length > before
        && document.getElementById('al-modal').classList.contains('hidden') };
    });
    check(d.blocked, 'al_manage off: Add New AL never opens');
    const pinSrc = fs_read_pins();
    check(pinSrc, 'no Master PIN is left in the pages (the office asked for the ticks to be the only lock)');
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* The PIN prompts were the office's second lock until the office asked
   for them to go: the PIN was written into the pages, readable by anybody
   with Inspect. The Verify AL / Cancel AL / Delete DO-BA ticks replace it
   (tests/a_tick_before_every_pin.cjs). None of it may come back. */
function fs_read_pins() {
  const ba = fs.readFileSync(path.join(ROOT, 'operation', 'operation_ba.html'), 'utf8');
  const al = fs.readFileSync(path.join(ROOT, 'operation', 'operation_booking.html'), 'utf8');
  const dlv = fs.readFileSync(path.join(ROOT, 'operation', 'operation_delivery.html'), 'utf8');
  return ![ba, dlv, al].some(src => src.includes('8888') || /prompt\([^)]*PIN/.test(src));
}
