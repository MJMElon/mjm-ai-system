/* A plot's jobs read in the order the office works through them.

   The Work Maintenance List is BUILT in the order the schedule generates it —
   every P & D round, then every manuring round, then weeding, then interrow —
   so it came out grouped by work type by accident. Anything added after that
   first build landed at the bottom: a row keyed by hand, a round ticked later,
   a plot whose rows were adopted on a later pass. The screenshot shows it —
   five P & D, manuring, weeding, interrow, and then ANOTHER manuring and
   interrow stranded at the end.

   Each plot's rows are now sorted for the screen: work type in PAYROLL_TYPES'
   order (P & D, Manuring, Weeding, Interrow), and inside each work type the
   days in the order they happened.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/maint_list_order.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const PD = 'Penyemburan racun kulat dan serangga';
const MN = 'Membaja';
const WD = 'Merumput';
const IR = 'Meracun rumput secara selingan';

let nextId = 500;
const row = (jenis, tarikh, racun, plot) => ({
  id: nextId++, tarikh, jenis, racun, plot: plot || 'B1',
  batch: '', qty: null, carlos: 0, gaia: 0, remark: ''
});

/* Deliberately jumbled, and shaped like the screenshot: the two strays at the
   end are a manuring and an interrow that arrived after the first build. */
const SEED = [
  row(PD, '2026-09-13', 'Round 2: Manzate 50gm + Bond 15mL'),
  row(IR, '2026-09-05', 'Round 1: Monex 200mL + Activator 15mL'),
  row(PD, '2026-09-04', 'Round 1: Antracol 50gm + Bond 15mL'),
  row(WD, '2026-09-19', 'Round 3: Merumput dalam polibeg'),
  row(MN, '2026-09-06', 'Round 1: Organic Matter 180gm'),
  row(PD, '2026-09-26', 'Round 4: Daconil 50gm + Bond 15mL'),
  row(WD, '2026-09-06', 'Round 1: Merumput dalam polibeg'),
  row(PD, '2026-09-04', 'Round 1: Becker 20mL + Bond 15mL'),
  row(IR, '2026-09-17', 'Round 3: Monex 200mL + Activator 15mL'),
  row(PD, '2026-09-18', 'Round 3: Thiram 50gm + Bond 15mL'),
  // The two that used to be stranded at the bottom.
  row(MN, '2026-09-02', 'Round 1: Compound 55 20gm'),
  row(IR, '2026-09-24', 'Round 3: Monex 200mL + Activator 15mL'),
  // Planned, no date keyed yet — it has not happened, so it goes last in P & D.
  row(PD, '-', 'Round 5: Not done yet'),
  // Another plot, to prove the sort is per plot and not across the table.
  row(IR, '2026-09-01', 'Round 1: Monex 200mL + Activator 15mL', 'B2'),
  row(PD, '2026-09-30', 'Round 4: Daconil 50gm + Bond 15mL', 'B2')
];

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((seed) => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.removeItem('mjm_maint_month'); } catch (_) {}
    window.__DB = { nops_maint_records: [{ id: 1, records: seed }] };
    window.__WRITES = [];
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select', row: null };
      const base = () => (window.__DB[table] || (window.__DB[table] = []));
      const rows = () => {
        let out = base().slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return out;
      };
      const run = () => {
        if (st.op === 'upsert' || st.op === 'insert') {
          window.__WRITES.push({ table, row: JSON.parse(JSON.stringify(st.row)) });
          const b = base();
          const i = b.findIndex((r) => String(r.id) === String(st.row.id));
          if (i >= 0) b[i] = st.row; else b.push(st.row);
          return { data: null, error: null };
        }
        const out = rows();
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'upsert' || p === 'insert') return (r) => { st.op = p; st.row = r; return q; };
        if (p === 'update' || p === 'delete') return () => q;
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      storage: { from: () => ({ upload: async () => ({ data: {}, error: null }),
                                getPublicUrl: () => ({ data: { publicUrl: '' } }),
                                remove: async () => ({ error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, SEED);

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
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, body: '[]' }));

  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html',
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderRecords === 'function',
                             { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForSelector('#recview-list', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(250);
  return page;
}

/* The table as it reads on the screen: the plot headers, and every work row as
   "<job> <date>" straight out of its own cells. Read off the page and not off
   `records`, because two rows of one job can carry the very same chemical on
   different days — which is exactly the pair the screenshot ends with. */
const table = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#rec-body tr')].map((tr) => {
    const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (tr.children.length <= 3) return txt(tr).toUpperCase();
    return txt(tr.children[1]) + ' ' + txt(tr.children[0]);
  }));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nOne plot, four jobs, jumbled on the way in');
  {
    const page = await boot(browser);
    check('the whole table reads in order', await table(page), [
      '📍 PLOT B1 13 TASKS · 0 DONE',
      'P & D Spraying 04 Sep 2026',
      'P & D Spraying 04 Sep 2026',
      'P & D Spraying 13 Sep 2026',
      'P & D Spraying 18 Sep 2026',
      'P & D Spraying 26 Sep 2026',
      'P & D Spraying -',
      'Manuring 02 Sep 2026',
      'Manuring 06 Sep 2026',
      'Weeding 06 Sep 2026',
      'Weeding 19 Sep 2026',
      'Interrow Spraying 05 Sep 2026',
      'Interrow Spraying 17 Sep 2026',
      'Interrow Spraying 24 Sep 2026',
      '📍 PLOT B2 2 TASKS · 0 DONE',
      'P & D Spraying 30 Sep 2026',
      'Interrow Spraying 01 Sep 2026'
    ]);

    /* Two rows on 04 Sep: Round 1 Becker and Round 1 Antracol. Same job, same
       day, same round — they keep a settled order rather than swapping about
       between renders. */
    const twice = async () => {
      await page.evaluate(() => renderRecords());
      return (await table(page)).join('|');
    };
    const once = await twice();
    check('the order is stable across a redraw', await twice(), once);

    /* The sort is for the SCREEN. The saved list is not reordered — it is
       written back on every change, and rewriting it to match a view would be
       this page editing the data to suit itself. */
    check('the saved list is left in its own order', await page.evaluate(() =>
      records.filter((r) => r.plot === 'B1').map((r) => r.tarikh).slice(0, 4)),
      ['2026-09-13', '2026-09-05', '2026-09-04', '2026-09-19']);
    await page.close();
  }

  console.log('\nFiltering does not disturb it');
  {
    const page = await boot(browser);
    await page.evaluate(() => {
      const el = document.getElementById('rf-filter-jenis');
      el.value = 'Meracun rumput secara selingan';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      renderRecords();
    });
    await page.waitForTimeout(150);
    check('one job, its days in order', await table(page), [
      '📍 PLOT B1 3 TASKS · 0 DONE',
      'Interrow Spraying 05 Sep 2026',
      'Interrow Spraying 17 Sep 2026',
      'Interrow Spraying 24 Sep 2026',
      '📍 PLOT B2 1 TASK · 0 DONE',
      'Interrow Spraying 01 Sep 2026'
    ]);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
