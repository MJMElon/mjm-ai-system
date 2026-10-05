/* A row that was saved is a row that can be seen.

   The Work Maintenance List only draws plots that are on its nursery's list,
   and a transfer plot (-R) is not in the built-in list. Until now the only
   thing that put one there was a CAPACITY GREATER THAN NOUGHT, keyed under
   Setting -> Plot Capacity. That is the right test for the schedules — a
   dosage cannot be worked out without a quantity — and the wrong one here:
   B4-R had two rows keyed, saved, and invisible, with nothing on the screen
   saying a capacity was what was being asked for. They read as lost.

   So a plot the saved list already has rows for joins its nursery's list too,
   whatever its capacity, with Seedling Stock saying whose plot it is.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/maint_plot_with_rows.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }
function checkFalse(name, got) { check(name, !!got, false); }

/* The state the database is actually in, from CHECK_maint_plot_not_listed.sql:
   every -R plot IS in Seedling Stock, under the names "BNN" / "UNN 1" /
   "UNN 2" — with the space — and only three of them carry a capacity. */
const SEED = {
  plots: [
    { nursery_name: 'BNN',   plot_name: 'B1' },
    { nursery_name: 'BNN',   plot_name: 'B3-R' },
    { nursery_name: 'BNN',   plot_name: 'B4-R' },
    { nursery_name: 'UNN 2', plot_name: 'N1' },
    { nursery_name: 'UNN 2', plot_name: 'N5-R' }
  ],
  nurseries: [{ name: 'BNN' }, { name: 'UNN 1' }, { name: 'UNN 2' }],
  // B3-R has one, B4-R has none at all, N5-R's is keyed under "UNN 2".
  qty: [
    { nursery: 'BNN',   plot: 'B3-R', qty: 60 },
    { nursery: 'UNN 2', plot: 'N5-R', qty: 9 }
  ],
  records: [
    { id: 101, tarikh: '-', jenis: 'Merumput', racun: 'B3-R round', plot: 'B3-R',
      batch: '', qty: null, carlos: 0, gaia: 0, remark: '' },
    { id: 102, tarikh: '-', jenis: 'Merumput', racun: 'B4-R first', plot: 'B4-R',
      batch: '', qty: null, carlos: 0, gaia: 0, remark: '' },
    { id: 103, tarikh: '-', jenis: 'Merumput', racun: 'B4-R second', plot: 'B4-R',
      batch: '', qty: null, carlos: 0, gaia: 0, remark: '' },
    { id: 104, tarikh: '-', jenis: 'Merumput', racun: 'N5-R round', plot: 'N5-R',
      batch: '', qty: null, carlos: 0, gaia: 0, remark: '' },
    /* A plot no nursery claims. Seedling Stock is the only thing that says
       whose plot a plot is, so this one stays off every list — the page does
       not guess from the letter. */
    { id: 105, tarikh: '-', jenis: 'Merumput', racun: 'nobody owns ZZ', plot: 'ZZ',
      batch: '', qty: null, carlos: 0, gaia: 0, remark: '' }
  ]
};

async function boot(browser, seed) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((s) => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.removeItem('mjm_maint_month'); } catch (_) {}
    window.__DB = {
      nops_maint_records: [{ id: 1, records: s.records }],
      nops_maint_plot_qty: s.qty,
      shared_plots: s.plots,
      operation_nurseries: s.nurseries
    };
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
  }, seed);

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
  await page.waitForFunction(() => typeof window.autoSyncRecords === 'function'
                                && typeof window._mergeCapacityPlots === 'function',
                             { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForSelector('#recview-list', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(250);
  return page;
}

/* Every work row drawn, as "plot / chemical". The group headers and the
   "no records" line have one cell, so they are not rows of work. */
const drawn = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#rec-body tr')]
    .filter((tr) => !tr.classList.contains('plot-group-row') && tr.children.length > 3)
    .map((tr) => (tr.textContent || '').replace(/\s+/g, ' ').trim())
    .map((s) => s));

const hasRow = async (page, chem) => (await drawn(page)).some((s) => s.includes(chem));

const toNursery = async (page, n) => {
  await page.evaluate((v) => {
    const sel = document.getElementById('global-nursery');
    sel.value = v;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, n);
  await page.waitForTimeout(200);
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nBNN — a plot with rows and no capacity');
  {
    const page = await boot(browser, SEED);

    /* capNurseries() is Seedling Stock's own list, and the only nurseries on
       it are the ones that have plots — so this is the read landing. */
    check('Seedling Stock was read', await page.evaluate(() => capNurseries().slice().sort()),
          ['BNN', 'UNN 2']);

    /* The property that was missing: on the list although nobody has keyed
       what it holds. */
    check('B4-R has no capacity at all',
          await page.evaluate(() => capacityOf('BNN', 'B4-R')), 0);
    checkTrue('…and B4-R is on BNN’s list anyway',
              await page.evaluate(() => NURSERY_PLOTS.BNN.includes('B4-R')));

    checkTrue('BOTH of B4-R’s rows are drawn', await hasRow(page, 'B4-R first'));
    checkTrue('…the second one too', await hasRow(page, 'B4-R second'));
    checkTrue('B3-R’s row is drawn as well', await hasRow(page, 'B3-R round'));

    checkFalse('a row on a plot no nursery claims is still not drawn',
               await hasRow(page, 'nobody owns ZZ'));

    /* A rebuild from the schedule is what used to eat rows nobody generated. */
    await page.evaluate(() => autoSyncRecords());
    await page.waitForTimeout(200);
    checkTrue('they survive a sync — first', await hasRow(page, 'B4-R first'));
    checkTrue('…and second', await hasRow(page, 'B4-R second'));
    checkTrue('…and B3-R’s', await hasRow(page, 'B3-R round'));

    check('the plot filter offers both transfer plots', await page.evaluate(() =>
      [...document.querySelectorAll('#rf-filter-plot option')]
        .map((o) => o.value).filter((v) => v.endsWith('-R')).sort()),
      ['B3-R', 'B4-R']);

    await page.close();
  }

  console.log('\nUNN 2 — the capacity is keyed under the name with the space');
  {
    const page = await boot(browser, SEED);
    await toNursery(page, 'UNN2');

    check('the nursery really did change',
          await page.evaluate(() => getNursery()), 'UNN2');
    checkTrue('a capacity saved as "UNN 2" counts for UNN2',
              await page.evaluate(() => capacityOf('UNN2', 'N5-R') === 9));
    checkTrue('N5-R is on UNN2’s list',
              await page.evaluate(() => NURSERY_PLOTS.UNN2.includes('N5-R')));
    checkTrue('…and its row is drawn', await hasRow(page, 'N5-R round'));

    checkFalse('BNN’s rows are not on UNN2’s list', await hasRow(page, 'B4-R first'));
    await page.close();
  }

  console.log('\nWith Seedling Stock unreadable, nothing is invented');
  {
    const page = await boot(browser, Object.assign({}, SEED, { plots: [], nurseries: [] }));

    /* No stock list means no answer to "whose plot is this", so the old rule
       is all there is — B3-R by its capacity, B4-R not at all. The page stays
       up and draws what it can rather than guessing. */
    checkTrue('B3-R still joins by its capacity',
              await page.evaluate(() => NURSERY_PLOTS.BNN.includes('B3-R')));
    checkFalse('B4-R does not, and nothing throws',
               await page.evaluate(() => NURSERY_PLOTS.BNN.includes('B4-R')));
    checkTrue('the list is still drawn', await hasRow(page, 'B3-R round'));
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
