/* A PLOT THE OFFICE DELETED LEAVES THE SCHEDULE — AND A KEYED ROW KEEPS ITS OWN

   The office: *"i deleted a plot, make it remove from all modules too. i added
   a plot, make it add for all modules too."*

   The adding half has always worked on this page, because the four built-in
   ranges were the FLOOR and `shared_plots` was merged on top. That floor is
   exactly what stopped a deletion biting: `loadSharedPlots` said so in its own
   words — *"MERGED into NURSERY_PLOTS rather than replacing it … dropping it
   would take those rows off the screen."*

   So the ranges are the FALLBACK now and not the floor, and the sentence that
   comment was protecting is kept as a rule of its own rather than as a side
   effect of never narrowing at all. `_narrowToStock` is the whole of it and
   this file is its four guards:

     1. only where the read ANSWERED (a failed read changes nothing);
     2. asked PER NURSERY (a nursery nobody keyed keeps its range);
     3. a plot carrying SAVED ROWS is put back;
     4. a stale CAPACITY cannot resurrect a deleted plot.

   The one that is easy to get wrong is 3, and it is why the spelling comes off
   the RANGES rather than off the list as it stands: this runs at three call
   sites, so a map built from the list stops being able to place B13 the moment
   it has narrowed it away once — and a month of records landing on the second
   pass would never bring it back. Section 4 drives exactly that order.

   Run: NODE_PATH=/opt/node-tools/node_modules node tests/a_deleted_plot_leaves_the_schedule.cjs
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

const row = (id, jenis, racun, plot) => ({
  id, tarikh: '-', jenis, racun, plot, batch: '', qty: null,
  carlos: 0, gaia: 0, remark: ''
});

/* B13 AND B14 ARE BOTH DELETED — neither is in Seedling Stock. The difference
   between them is the whole of rule 3: B13 carries a keyed row and B14 does
   not. B15 is the office's new plot and B3-R the transfer plot, both keyed.

   UNN 2 is deliberately NOT keyed at all: that is rule 2, and the live case
   for it is the Pre Nursery, which is counted in trays and may have no row in
   `shared_plots` at all. A global test would empty it. */
const BNN_KEYED = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10',
                   'B11', 'B12', 'B15', 'B3-R'];

const SEED = {
  plots: [
    ...BNN_KEYED.map((p) => ({ nursery_name: 'BNN', plot_name: p })),
    /* The office's own spelling, with the space, for UNN 1. */
    ...Array.from({ length: 18 }, (_, i) => ({ nursery_name: 'UNN 1', plot_name: 'U' + (i + 1) }))
  ],
  nurseries: [{ name: 'BNN' }, { name: 'UNN 1' }, { name: 'UNN 2' }],
  /* A STALE CAPACITY ON THE DELETED PLOT. Keyed before it was deleted and
     never cleared — rule 4. A capacity has put a plot on this list since the
     Setting grid was written, so without the guard it hands B14 straight back
     and the deletion does nothing. */
  qty: [
    { nursery: 'BNN', plot: 'B14', qty: 6000 },
    { nursery: 'BNN', plot: 'B3-R', qty: 60 }
  ],
  records: [
    row(101, 'Merumput', 'B13 keyed round', 'B13'),
    row(102, 'Merumput', 'B3-R round', 'B3-R'),
    row(103, 'Merumput', 'B1 round', 'B1')
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

const listOf = (page, n) => page.evaluate((k) => (NURSERY_PLOTS[k] || []).slice(), n);
const has = async (page, n, p) => (await listOf(page, n)).includes(p);

const drawn = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#rec-body tr')]
    .filter((tr) => !tr.classList.contains('plot-group-row') && tr.children.length > 3)
    .map((tr) => (tr.textContent || '').replace(/\s+/g, ' ').trim()));

const hasRow = async (page, chem) => (await drawn(page)).some((s) => s.includes(chem));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\n1. THE DELETED PLOT LEAVES, AND THE KEYED ONE STAYS');
  {
    const page = await boot(browser, SEED);

    /* capNurseries() is Seedling Stock's own list, so this is the read
       landing — every check under it means nothing until it has. */
    check('Seedling Stock was read', await page.evaluate(() => capNurseries().slice().sort()),
          ['BNN', 'UNN 1']);

    checkFalse('B14 is GONE — the office deleted it',  await has(page, 'BNN', 'B14'));
    checkTrue('B15 is there — the office added it',    await has(page, 'BNN', 'B15'));
    checkTrue('…and every plot either side of B14 stayed',
              (await listOf(page, 'BNN')).includes('B12'));
    checkTrue('the transfer plot is there, Seedling Stock claiming it',
              await has(page, 'BNN', 'B3-R'));

    /* RULE 3. B13 was deleted exactly as B14 was; the only difference is the
       keyed row, and it is stronger than the deletion. */
    checkTrue('B13 is PUT BACK, because a row names it', await has(page, 'BNN', 'B13'));
    checkTrue('…and its row is drawn',  await hasRow(page, 'B13 keyed round'));
    checkTrue('…B3-R’s is too',         await hasRow(page, 'B3-R round'));

    /* RULE 4. The capacity row is asked of the DATABASE and not of
       `capacityOf`, which answers the LIVE ledger figure rather than what was
       keyed — `maint_plot_with_rows.cjs` says so in its own words. What has to
       be true here is that the stale row is sitting there and the plot is
       still gone; a check through capacityOf would read 0 on a fixture with no
       ledger and pass over a missing guard. */
    check('the stale capacity row really is in the table',
          await page.evaluate(() =>
            (window.__DB.nops_maint_plot_qty || [])
              .filter((r) => r.plot === 'B14').map((r) => r.qty)), [6000]);
    checkFalse('…and it does not hand the plot back', await has(page, 'BNN', 'B14'));

    /* The whole list, so a plot appearing from nowhere is caught by NAME
       rather than by a count. B13 is in it and B14 is not. */
    check('BNN’s list is exactly what the office keyed, plus the keyed row',
          await listOf(page, 'BNN'),
          ['B1', 'B2', 'B3', 'B3-R', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9',
           'B10', 'B11', 'B12', 'B13', 'B15']);

    await page.close();
  }

  console.log('\n2. A NURSERY NOBODY KEYED KEEPS ITS RANGE');
  {
    const page = await boot(browser, SEED);

    /* RULE 2, and the live case is the Pre Nursery. An absent answer is
       nobody having been asked, never an empty nursery. */
    check('UNN 2 was never keyed, so its twenty stand',
          (await listOf(page, 'UNN2')).length, 20);
    check('the Pre Nursery keeps its fifty-two',
          (await listOf(page, 'PN')).length, 52);
    check('UNN 1 was keyed in full, so nothing moves there',
          (await listOf(page, 'UNN1')).length, 18);

    await page.close();
  }

  console.log('\n3. A FAILED READ CHANGES NOTHING');
  {
    const page = await boot(browser, Object.assign({}, SEED, { plots: [], nurseries: [] }));

    /* RULE 1. A schedule with no plots on it is a page nobody can key, so
       with no answer every list is exactly what it always was — the deleted
       plot included. That is the fail-open direction every gate here takes. */
    checkTrue('B14 is BACK, because nothing said otherwise', await has(page, 'BNN', 'B14'));
    /* The whole range, and B3-R on top of it by its CAPACITY — which is the
       rule that predates all of this and is untouched by it. With no stock
       list there is no answer to "whose plot is this", so a capacity is the
       only thing that can place a transfer plot, exactly as
       `maint_plot_with_rows.cjs` holds. */
    check('BNN has its whole range, and B3-R by its capacity',
          (await listOf(page, 'BNN')).length, 15);
    checkTrue('…B14 among them',  await has(page, 'BNN', 'B14'));
    checkTrue('the list is still drawn', await hasRow(page, 'B1 round'));

    await page.close();
  }

  console.log('\n4. THE SECOND PASS — WHERE THE SPELLING HAS TO COME FROM');
  {
    const page = await boot(browser, SEED);

    /* THE ORDER THAT BREAKS A LIST-BUILT SPELLING MAP. _narrowToStock runs at
       three call sites, and `records` is not necessarily loaded when the first
       one fires. So: narrow with NO records, which takes B13 away, and then
       narrow again with the records back. A map built from the list as it
       stands cannot place B13 on that second pass — the list no longer holds
       it — and the month would be stranded. Off the ranges it comes back. */
    const again = await page.evaluate(() => {
      const kept = records.slice();
      records.splice(0, records.length);          // the records have not landed yet
      _mergeCapacityPlots();
      const without = (NURSERY_PLOTS.BNN || []).slice();
      records.push.apply(records, kept);          // …and now they have
      _mergeCapacityPlots();
      return { without, with_: (NURSERY_PLOTS.BNN || []).slice() };
    });

    checkFalse('with no records yet, B13 is narrowed away', again.without.includes('B13'));
    checkTrue('…and the moment they land it is back',       again.with_.includes('B13'));
    checkFalse('B14 is still gone after both passes',       again.with_.includes('B14'));
    checkTrue('B15 survived both passes',                   again.with_.includes('B15'));

    /* A rebuild from the schedule is what used to eat rows nobody generated. */
    await page.evaluate(() => autoSyncRecords());
    await page.waitForTimeout(200);
    checkTrue('B13’s row survives a sync', await hasRow(page, 'B13 keyed round'));
    check('the plot filter does not offer B14', await page.evaluate(() =>
      [...document.querySelectorAll('#rf-filter-plot option')]
        .map((o) => o.value).filter((v) => v === 'B14')), []);

    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
