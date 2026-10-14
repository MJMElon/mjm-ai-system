/* THE TO DO LIST TAKES SOMEBODY TO THE WORK, AND THE TO CHECK LIST IS THE
   CHECKER'S.

   Two halves of the same change.

   A list that names the report and then drops somebody on Tab 1 has told
   them where to go without taking them, and on a batch with one thing
   outstanding out of eight tabs that is most of the work. So the To Do List
   passes the stage in the address, and the batch page lands on that tab --
   and on the panel inside it where the answer goes, for the two tabs that
   have one: the planting gap and the drone-map mismatch.

   And To Check answers "what is waiting for ME to sign", which is a question
   only somebody who may sign has. Without that tick the chip is hidden, and
   a session left on the tab is moved off it rather than stranded on a list
   with nothing on it they can do.

   Access fails OPEN everywhere in this codebase, so an unconfigured login
   still sees the list. That is deliberate and is tested as such.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/todo_list_takes_you_there.cjs
   with a static server on 8777 serving the repository root.
*/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DETAIL = fs.readFileSync(path.join(ROOT, 'operation', 'operation_batch_detail.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

const BATCH = '241';
const rec = (batch) => ({ batch_name: batch, transaction_type: 'Seeds_Received', breed_name: 'IOI DxP HYBRID',
                          quantity_change: 10000, transaction_date: '2025-06-01',
                          created_at: '2025-06-01T00:00:00Z', plot_name: null, remark: '' });
/* Batch 241's own shape: a 3rd culling whose drone map does not tally. */
const ROWS = {
  shared_inventory_logs: [
    rec(BATCH),
    { batch_name: BATCH, transaction_type: 'Planted', plot_name: 'P7', quantity_change: 9000 },
    { batch_name: BATCH, transaction_type: 'Transplanted', plot_name: 'N3', quantity_change: 6362,
      remark: 'Transplanted from tray [P7] to Main Plot [N3]. Date: 2025-12-19' },
    { batch_name: BATCH, transaction_type: '3rd_Culling', plot_name: 'N3', quantity_change: 500,
      remark: '3rd Culling. DestType: main MapQty: 540 CullDate:2026-06-01' },
    { batch_name: BATCH, transaction_type: 'Review_Rejection', plot_name: 'cull_3', quantity_change: 0,
      remark: '3rd Culling map qty does not tally — 1 plot(s) to explain. N3: 3rd culled 500, drone map 540 (+40)' }
  ],
  operation_batch_verifications: [], shared_do_records: [], operation_trays: [], shared_profiles: []
};

const FAKE_SUPABASE = `
window.supabase = { createClient: function () {
  function builder(table) {
    var b = { _t: table, _eq: {}, _in: null, _like: null, _one: false };
    ['neq','is','or','not','gt','gte','lt','lte','ilike','order','limit','filter','match','contains','overlaps','select','range']
      .forEach(function (m) { b[m] = function () { return b; }; });
    b.eq = function (c, v) { b._eq[c] = v; return b; };
    b.in = function (c, v) { b._in = { col: c, vals: v.map(String) }; return b; };
    b.like = function (c, p) { b._like = { col: c, pat: p }; return b; };
    b.single = function () { b._one = true; return b; };
    b.maybeSingle = b.single;
    b._rows = function () {
      var rows = (window.__ROWS && window.__ROWS[table]) || [];
      var eq = b._eq, lk = b._like;
      return rows.filter(function (r) {
        for (var k in eq) { if (String(r[k]) !== String(eq[k])) return false; }
        if (b._in && b._in.vals.indexOf(String(r[b._in.col])) < 0) return false;
        if (lk) { var pre = String(lk.pat).replace(/%$/, '');
                  if (String(r[lk.col] || '').indexOf(pre) !== 0) return false; }
        return true;
      });
    };
    b._settle = function () { var r = b._rows(); return { data: b._one ? (r[0] || null) : r, error: null, count: r.length }; };
    b.then = function (a, j) { return Promise.resolve(b._settle()).then(a, j); };
    b.catch = function (f) { return Promise.resolve(b._settle()).catch(f); };
    b.finally = function (f) { return Promise.resolve(b._settle()).finally(f); };
    b.insert = function () { return Promise.resolve({ data: null, error: null }); };
    b.upsert = b.insert;
    b.update = function () { return b; };
    b.delete = function () { return b; };
    return b;
  }
  var user = { id: 'u1', email: 'esther@mjmnursery.com', user_metadata: { full_name: 'Esther' } };
  return {
    from: builder, rpc: function () { return Promise.resolve({ data: null, error: null }); },
    channel: function () { var c = { on: function(){return c;}, subscribe: function(){return c;} }; return c; },
    removeChannel: function () {},
    storage: { from: function () { return { upload: function(){return Promise.resolve({data:null,error:null});},
                                            getPublicUrl: function(){return {data:{publicUrl:''}};} }; } },
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: { access_token:'x', user: user } }, error: null }); },
      getUser: function () { return Promise.resolve({ data: { user: user }, error: null }); },
      onAuthStateChange: function (cb) { setTimeout(function(){ try { cb('SIGNED_IN', { user: user }); } catch(e){} }, 0);
                                         return { data: { subscription: { unsubscribe: function () {} } } }; },
      signOut: function () { return Promise.resolve({ error: null }); }
    }
  };
} };`;

const accessStub = (review) => `window.MJMAccess = {
  load: () => Promise.resolve(true),
  user: () => ({ id:'u1', email:'esther@mjmnursery.com', full_name:'Esther' }),
  perms: () => ({}), profile: () => ({}), normalize: (x) => x || {},
  canAccess: () => true, canOpenOperationPage: () => true,
  canScan: () => true, canScanArea: () => true, isAdminOf: () => ${review},
  canDoOperation: (p, a) => (a === 'review' ? ${review} : true),
  requireAction: () => true, guard: () => true
};`;

async function open(browser, url, review) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => { if (!/MJMReview/.test(e.message)) errs.push(e.message); });
  page.on('dialog', (d) => d.dismiss());
  await page.route('**supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**cdn.tailwindcss.com/**', (r) => r.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'document.addEventListener("DOMContentLoaded",function(){document.head.insertAdjacentHTML("beforeend",'
        + JSON.stringify('<style>.hidden{display:none}</style>') + ');});' }));
  await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await page.route('**cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: accessStub(review) }));
  await page.addInitScript((rows) => {
    window.__ROWS = rows;
    try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}
  }, ROWS);
  await page.goto('http://localhost:8777/operation/' + url, { waitUntil: 'load' });
  return { page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nThe To Check List is the checker’s');
  {
    const { page } = await open(browser, 'operation_batch_record.html', false);
    await page.waitForTimeout(4000);
    const shown = (id) => page.evaluate((i) => {
      const el = document.getElementById(i);
      return !!el && el.style.display !== 'none';
    }, id);
    check('without the tick the chip is hidden', await shown('tab-tocheck'), false);
    check('and the To Do List is not', await shown('tab-amendment'), true);
    /* However somebody gets there — a restored session, the address bar, a
       button drawn before the permissions were read. */
    const landed = await page.evaluate(() => { switchListTab('tocheck'); return currentListTab; });
    check('asking for it anyway lands on Active', landed, 'active');
    await page.close();
  }
  {
    const { page } = await open(browser, 'operation_batch_record.html', true);
    await page.waitForTimeout(4000);
    check('with the tick it is there',
          await page.evaluate(() => {
            const el = document.getElementById('tab-tocheck');
            return !!el && el.style.display !== 'none';
          }), true);
    check('and it opens', await page.evaluate(() => { switchListTab('tocheck'); return currentListTab; }), 'tocheck');
    await page.close();
  }

  console.log('\nThe batch page lands on the report it was sent to');
  checkTrue('the stage keys are the tabs’ own, read the other way round',
            /const TAB_OF_STAGE = \{ seeds_in: 1, planting: 2, transplanting: 3, cull_1: 4,\s*cull_2: 5, cull_3: 6, seed_audit: 8, adjustments: 7 \};/.test(DETAIL));
  checkTrue('and the two tabs with a panel to answer in are named',
            /const PANEL_OF_STAGE = \{ planting: 't2-gap-panel', cull_3: 't6-mismatch-panel' \};/.test(DETAIL));
  {
    const { page, errs } = await open(browser, 'operation_batch_detail.html?id=' + BATCH + '&stage=cull_3', true);
    await page.waitForTimeout(6000);
    const active = await page.evaluate(() => {
      const on = [...document.querySelectorAll('[id^="tab-btn-"]')]
        .filter(b => b.classList.contains('stage-tab-active'))
        .map(b => b.id.replace('tab-btn-', ''));
      return on;
    });
    check('a link to 3rd Culling opens Tab 6', active, ['6']);
    check('nothing was thrown on the way', errs, []);
    await page.close();
  }
  {
    // No stage in the address is an ordinary open, and must stay one.
    const { page } = await open(browser, 'operation_batch_detail.html?id=' + BATCH, true);
    await page.waitForTimeout(6000);
    const active = await page.evaluate(() =>
      [...document.querySelectorAll('[id^="tab-btn-"]')]
        .filter(b => b.classList.contains('stage-tab-active'))
        .map(b => b.id.replace('tab-btn-', '')));
    check('without one it opens where it always did', active, ['1']);
    await page.close();
  }
  {
    // A stage nobody recognises must not throw or land anywhere odd.
    const { page, errs } = await open(browser, 'operation_batch_detail.html?id=' + BATCH + '&stage=nonsense', true);
    await page.waitForTimeout(5000);
    const active = await page.evaluate(() =>
      [...document.querySelectorAll('[id^="tab-btn-"]')]
        .filter(b => b.classList.contains('stage-tab-active'))
        .map(b => b.id.replace('tab-btn-', '')));
    check('a stage nobody recognises changes nothing', active, ['1']);
    check('and says nothing', errs, []);
    await page.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
