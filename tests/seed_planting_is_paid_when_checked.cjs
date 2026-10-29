/* The Seed Planting tab on the Nursery Payroll prices what Work Maintenance
   CHECKED, and nothing else.

   The office: "种一粒种子是RM0.02, 图一只show qty, after checked, 这份表格会
   flow 去图二, 新加一个tab - seed planting", then "tab里面才会有价钱". So the
   quantities are keyed on Work Maintenance with no money on them, a batch is
   Checked there, and this tab is where the money first appears. A batch keyed
   and not checked is NAMED, because a claim short of work reads exactly like
   a quiet month.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/seed_planting_is_paid_when_checked.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _now = new Date();
const MONTH_KEY = `${MONTHS_SHORT[_now.getMonth()]} ${_now.getFullYear()}`;

const RECS = [
  { batch_name: '277', month: MONTH_KEY, planted_date: '2026-09-28', qty_planted: 3760,
    workers: { Siti: 2000, Rina: 1760 }, checked_at: '2026-10-29T02:00:00Z', checked_by: 'office' },
  { batch_name: '278', month: MONTH_KEY, planted_date: '2026-10-05', qty_planted: 3000,
    workers: { Siti: 1000, Ani: 2000 }, checked_at: '2026-10-29T02:00:00Z', checked_by: 'office' },
  // Keyed and NOT checked: on no claim, and named.
  { batch_name: '279', month: MONTH_KEY, planted_date: '2026-10-20', qty_planted: 800,
    workers: { Siti: 800 }, checked_at: null, checked_by: null },
  // Another month: nothing to do with this one.
  { batch_name: '270', month: 'Jan 2020', planted_date: '2020-01-05', qty_planted: 500,
    workers: { Siti: 500 }, checked_at: '2020-01-20T00:00:00Z', checked_by: 'office' }
];

async function boot(browser, db) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript((seed) => {
    window.__DB = seed;
    window.jspdf = { jsPDF: class { constructor() {} } };
    function makeQuery(table) {
      const st = { eqs: [], single: false };
      const run = () => {
        if (seed.__missing && seed.__missing.includes(table))
          return { data: null, error: { message: 'relation "public.' + table + '" does not exist' } };
        let out = (window.__DB[table] || []).slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'insert' || p === 'upsert' || p === 'update' || p === 'delete') {
          (window.__WRITES = window.__WRITES || []).push(table + ':' + p);
          return () => ({ select: () => Promise.resolve({ data: [], error: null }),
                          eq: () => q, then: (a, b) => Promise.resolve({ data: [], error: null }).then(a, b) });
        }
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery,
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser:    async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, db);
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderSeedPlanting === 'function', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.click('[data-sub="seedplant"]');
  await page.waitForFunction(() => !/Loading/.test(document.getElementById('seedplant-table').textContent || 'Loading'),
                             { timeout: 15000 });
  return { page, errs };
}

const read = (page) => page.evaluate(() => {
  const t = document.getElementById('seedplant-table');
  return {
    head: [...t.querySelectorAll('thead th')].map(th => th.textContent.trim()),
    body: [...t.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim())),
    foot: [...t.querySelectorAll('tfoot td')].map(td => td.textContent.trim()),
    note: document.getElementById('seedplant-note').textContent.replace(/\s+/g, ' ').trim()
  };
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ── 1. The tab is there, between Loading Seedlings and Monthly Payroll ──
  const a = await boot(browser, { nops_seed_planting_batch_workers: RECS, mjmnpayroll_piece_rates: [] });
  check('a Seed Planting tab sits after Loading Seedlings', await a.page.evaluate(() =>
    [...document.querySelectorAll('.subtab')].map(b => b.dataset.sub)),
    ['maint', 'transpl', 'seedling', 'seedplant', 'monthly', 'other']);

  // ── 2. Only the checked batches, priced at RM 0.02 a seed ──
  let v = await read(a.page);
  check('a column per CHECKED batch, then seeds, rate and amount', v.head,
    ['Worker', 'Batch 277', 'Batch 278', 'Seeds planted', 'Rate', 'Amount']);
  check('each worker their own seeds, times RM 0.02', v.body, [
    ['Ani',  '—',     '2,000', '2,000', 'RM 0.02', 'RM 40.00'],
    ['Rina', '1,760', '—',     '1,760', 'RM 0.02', 'RM 35.20'],
    ['Siti', '2,000', '1,000', '3,000', 'RM 0.02', 'RM 60.00']]);
  check('the total adds up', v.foot, ['Total', '3,760', '3,000', '6,760', '', 'RM 135.20']);
  check('the unchecked batch is named, not paid', /Not on this claim: batch 279 is keyed and not yet Checked/.test(v.note), true);
  check('with no rate set the default is said to be the default', /RM 0.02 a seed, the default/.test(v.note), true);
  check('this page writes nothing', await a.page.evaluate(() => (window.__WRITES || []).filter(w => w.startsWith('nops_seed'))), []);
  check('no page errors', a.errs, []);
  await a.page.close();

  // ── 3. A rate set on Piece Rate is the one used ──
  const b = await boot(browser, { nops_seed_planting_batch_workers: RECS,
    mjmnpayroll_piece_rates: [{ id: 9, job_desc: 'Seed Planting', unit: 'seed', rate: 0.025, category: 'seed_planting', group_code: 'PN', active: true, sort_order: 0 }] });
  v = await read(b.page);
  check('the Piece Rate row prices it', [v.body[2][4], v.body[2][5], v.foot[5]], ['RM 0.025', 'RM 75.00', 'RM 169.00']);
  check('…and the note names where the rate came from', /from Piece Rate \(Seed Planting\)/.test(v.note), true);
  await b.page.close();

  // ── 4. Nothing checked yet is not "nothing keyed" ──
  const c = await boot(browser, { nops_seed_planting_batch_workers: RECS.map(r => Object.assign({}, r, { checked_at: null })),
                                  mjmnpayroll_piece_rates: [] });
  v = await read(c.page);
  check('a month keyed and unchecked says Nothing is Checked yet', /Nothing is Checked yet/.test(v.body[0][0]), true);
  await c.page.close();

  // ── 5. Before the SQL is run, the tab says which file ──
  const d = await boot(browser, { __missing: ['nops_seed_planting_batch_workers'], mjmnpayroll_piece_rates: [] });
  v = await read(d.page);
  check('a missing table says so and names the file', [/Could not read/.test(v.body[0][0]), /RUN_ME_seed_planting_workers\.sql/.test(v.note)], [true, true]);
  await d.page.close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
