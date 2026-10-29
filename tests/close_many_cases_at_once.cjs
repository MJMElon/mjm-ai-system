/* Nelos: several Solved cases are closed in one go.

   The office: "我要可以一次过close 多多case". On the Solved tab each row
   carries a box, Select all takes every case the list shows, and one dialog
   closes them -- ONE update, only for cases still Solved, with one remark.
   Other tabs carry no box, and a login that may not close sees none.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/close_many_cases_at_once.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const now = Date.now();
const mk = (i, status) => ({
  id: 'c' + i, case_no: 'NLS-00' + (30 + i), title: 'Request Drone Flight ' + i, status,
  assigned_module: 'audit', raised_by: 'Ruth Wong', created_at: new Date(now - i * 60000).toISOString()
});
const CASES = [mk(1, 'resolved'), mk(2, 'resolved'), mk(3, 'resolved'), mk(4, 'open'), mk(5, 'closed')];

async function open(browser, { admin, rpcRights }) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(([cases, rights]) => {
    window.__DB = {
      nelos_modules: [{ key: 'audit', label: 'Audit Portal', active: true, sort_order: 1 }],
      nelos_handlers: [], nelos_categories: [], nelos_routes: [], nelos_cases: cases
    };
    window.__WRITES = [];
    function makeQuery(table) {
      const st = { single: false, op: null, patch: null, filters: [] };
      const run = () => {
        if (st.op === 'update') {
          const hit = (window.__DB[table] || []).filter(r => st.filters.every(f => f(r)));
          hit.forEach(r => Object.assign(r, st.patch));
          window.__WRITES.push({ table, op: 'update', patch: st.patch, ids: hit.map(r => r.id), filters: st.filterDesc });
          return { data: hit.map(r => ({ id: r.id })), error: null };
        }
        if (st.op === 'delete') { window.__WRITES.push({ table, op: 'delete' }); return { data: [], error: null }; }
        return st.single ? { data: (window.__DB[table] || [])[0] || null, error: null }
                         : { data: JSON.parse(JSON.stringify(window.__DB[table] || [])), error: null };
      };
      st.filterDesc = [];
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'update') return (patch) => { st.op = 'update'; st.patch = patch; return q; };
        if (p === 'delete') return () => { st.op = 'delete'; return q; };
        if (p === 'eq') return (k, v) => { if (st.op) { st.filters.push(r => r[k] === v); st.filterDesc.push('eq ' + k + ' ' + v); } return q; };
        if (p === 'in') return (k, vs) => { if (st.op) { st.filters.push(r => vs.includes(r[k])); st.filterDesc.push('in ' + k + ' ' + vs.join(',')); } return q; };
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'e@m' };
    window.supabase = { createClient: () => ({
      from: makeQuery,
      rpc: (fn) => Promise.resolve(fn === 'nelos_my_rights' && rights ? { data: [rights], error: null } : { data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      storage: { from: () => ({ upload: async () => ({ data: {}, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
    window.prompt = () => { window.__PROMPTED = true; return null; };
    window.confirm = () => { window.__CONFIRMED = true; return true; };
  }, [JSON.parse(JSON.stringify(CASES)), rpcRights || null]);
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t,k){
      if (k==='user') return () => ({ id:'u1', email:'e@m', full_name:'Elon Ting' });
      if (k==='load') return async () => true;
      if (k==='normalize') return (x)=>x||{};
      if (k==='isAdminOf') return () => ${admin ? 'true' : 'false'};
      if (k==='then') return undefined;
      return () => true; } });`
  }));
  for (const host of ['**/cdn.tailwindcss.com/**', '**/cdn.jsdelivr.net/**',
                      '**/cdnjs.cloudflare.com/**', '**/fonts.googleapis.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.goto('http://localhost:8777/nelos/nelos_dashboard.html', { waitUntil: 'load' });
  await page.waitForSelector('.tr', { timeout: 20000 });
  return { page, errs };
}
const tabTo = (page, t) => page.click(`.stab[data-tab="${t}"]`);
const boxes = (page) => page.$$eval('[data-pick]', els => els.map(e => e.dataset.pick));
const barShown = (page) => page.$eval('#bulk', el => !el.classList.contains('hidden'));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('1  an admin, on each tab');
  const { page, errs } = await open(browser, { admin: true });
  check('Pending carries no box and no bar', [await boxes(page), await barShown(page)], [[], false]);
  await tabTo(page, 'resolved');
  check('Solved carries one box per solved case', (await boxes(page)).sort(), ['c1', 'c2', 'c3']);
  check('…and the bar, with Close not yet pressable', [await barShown(page),
    await page.$eval('#bulk-go', b => b.disabled)], [true, true]);

  console.log('\n2  ticking two and closing them');
  await page.check('[data-pick="c1"]');
  await page.check('[data-pick="c3"]');
  check('the bar counts them and the button says how many', [
    await page.textContent('#bulk-n'), await page.textContent('#bulk-go'),
    await page.$eval('#bulk-all', b => b.indeterminate)], ['2 of 3 selected', 'Close 2 cases', true]);
  await page.click('#bulk-go');
  await page.waitForSelector('#bulk-scrim:not(.hidden)');
  check('the dialog names the two cases', await page.$$eval('#bc-list .bc-no', els => els.map(e => e.textContent)),
    ['NLS-0031', 'NLS-0033']);
  check('nothing is written until Close is pressed', await page.evaluate(() => window.__WRITES.length), 0);
  await page.fill('#bc-remark', 'Flights done');
  await page.click('#bc-go');
  await page.waitForSelector('#bulk-scrim.hidden', { state: 'attached' });
  const w = await page.evaluate(() => window.__WRITES);
  check('ONE update', w.length, 1);
  check('…for exactly the two ticked', (w[0] && w[0].ids || []).sort(), ['c1', 'c3']);
  check('…only where the case is still Solved', (w[0] && w[0].filters || []).includes('eq status resolved'), true);
  check('…closed, with the remark and who', w[0] && [w[0].patch.status, w[0].patch.close_remark, w[0].patch.closed_by],
    ['closed', 'Flights done', 'Elon Ting']);
  await page.waitForFunction(() => document.querySelectorAll('[data-pick]').length === 1);
  check('the list redraws with only the one left', await boxes(page), ['c2']);
  check('and nothing is left ticked', await page.textContent('#bulk-go'), 'Close selected');

  console.log('\n3  Select all, and a case closed by somebody else meanwhile');
  await page.check('#bulk-all');
  check('Select all ticks every solved case on the list', await page.textContent('#bulk-n'), '1 of 1 selected');
  await page.evaluate(() => { window.__DB.nelos_cases.find(c => c.id === 'c2').status = 'closed'; });
  await page.click('#bulk-go');
  await page.click('#bc-go');
  await page.waitForSelector('#bulk-scrim.hidden', { state: 'attached' });
  const w2 = await page.evaluate(() => window.__WRITES[1]);
  check('a case no longer Solved is not touched', w2 && w2.ids, []);
  check('and the toast says it was left alone', await page.evaluate(() =>
    [...document.querySelectorAll('#toast')].map(t => t.textContent).pop() || ''),
    '0 cases closed. 1 was no longer Solved and left as it was.');

  console.log('\n4  the Closed tab, and the safety nets');
  await tabTo(page, 'closed');
  check('Closed carries no box', [await boxes(page), await barShown(page)], [[], false]);
  check('no prompt, no confirm, no delete', await page.evaluate(() =>
    [!!window.__PROMPTED, !!window.__CONFIRMED, window.__WRITES.some(x => x.op === 'delete')]), [false, false, false]);
  check('no page errors', errs, []);
  await page.close();

  console.log('\n5  a login that may not close');
  const r2 = await open(browser, { admin: false, rpcRights: { is_admin: false, may_solve: true, may_edit: false,
    may_delete: false, may_create: true, may_close: false } });
  await tabTo(r2.page, 'resolved');
  check('sees the Solved cases but no box and no bar', [await r2.page.$$eval('.tr', e => e.length),
    await boxes(r2.page), await barShown(r2.page)], [3, [], false]);
  check('no page errors', r2.errs, []);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
