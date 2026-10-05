/* The 2nd Culling tab must not double every figure on it.

   WHAT HAPPENED. A tab's sync clears its plot array, awaits two database
   reads, and only then pushes its rows in. switchTab fires that sync WITHOUT
   awaiting it, and prewarmAllTabs runs the very same syncs at page load. So
   clicking 2nd Culling while the page was still warming up ran syncTab5
   twice at once, and the two runs interleaved:

     run A  t5_plotData = []     · awaits its reads
     run B  t5_plotData = []     · awaits its reads
     run A  pushes its rows      · merges them · assigns the array
     run B  pushes its rows INTO THE ARRAY A JUST MERGED
     run B  merges again — and _t5MergeByPlot SUMS the saved Dead of the rows
            it merges, so 243 read as 486 and 3 read as 6

   Nothing on the screen said so: the arithmetic still agreed with itself,
   5,949 − 486 = 5,463. And Save writes WHAT IS ON SCREEN, so one
   open-and-save wrote the doubled figure into the ledger and the next open
   doubled that: 10 → 20 → 40.

   The figures below are batch 254's, read out of the ledger before the save
   that doubled them: B5 243, N18 17, U3 3.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/cull2_not_doubled.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

const BATCH = '254';
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

/* One transplant row and one 2nd culling row per plot — the shape the ledger
   is actually in (no row anywhere carries DestType). */
const TX = [
  ['B5', 5949], ['N18', 2296], ['U3', 945]
].map(([plot, qty], i) => ({
  id: 'tx' + i, transaction_type: 'Transplanted', plot_name: plot,
  batch_name: BATCH, quantity_change: qty, transaction_date: '2026-04-14',
  created_at: '2026-04-14T02:00:00Z',
  remark: 'Transplanted from tray [P1] to Main Plot [' + plot + ']. Date: 2026-04-14'
}));
/* The batch has to exist, or the page bounces back to the batch list. */
const SEEDS = [{
  id: 'sr1', transaction_type: 'Seeds_Received', batch_name: BATCH,
  breed_name: 'UPB PREMIER HYBRID', quantity_change: 10000, plot_name: 'Pre-Nursery',
  transaction_date: '2026-01-05', created_at: '2026-01-05T02:00:00Z',
  workers: 4, remark: 'Supplier: AAR. MPOB: 123-456'
}];

const CULL = [
  ['B5', 243, 5706, 5949], ['N18', 17, 2279, 2296], ['U3', 3, 942, 945]
].map(([plot, dead, alive, planted], i) => ({
  id: 'c' + i, transaction_type: '2nd_Culling', plot_name: plot,
  batch_name: BATCH, quantity_change: dead, created_at: '2026-09-19T01:28:00Z',
  remark: '2nd Culling. Alive: ' + alive + ', Dead: ' + dead + ', Cull: 0.00%. '
        + 'Transplanted: ' + planted + '. CullDate: 2026-08-14'
}));

/* Every read is delayed, which is what makes two runs overlap at all. On a
   nursery office's connection they do; here it has to be made to happen. */
const DELAY = 120;

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', e => { if (!/MJMReview/.test(e.message)) console.log('  [page error] ' + e.message); });

  await page.addInitScript(({ tx, cull, seeds, delay, batch }) => {
    window.__TX = tx; window.__CULL = cull; window.__SEEDS = seeds; window.__INSERTS = [];
    window.__READS = 0;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    function makeQuery() {
      const st = { filters: {}, types: null };
      const rows = () => {
        if (st.filters.transaction_type === 'Seeds_Received') return window.__SEEDS;
        if (st.types && st.types.indexOf('Seeds_Received') >= 0) return window.__SEEDS;
        if (st.filters.transaction_type === '2nd_Culling')
          return window.__CULL.filter(r => r.batch_name === (st.filters.batch_name ?? r.batch_name));
        if (st.types && st.types.indexOf('Transplanted') >= 0)
          return window.__TX.filter(r => r.batch_name === (st.filters.batch_name ?? r.batch_name));
        return [];
      };
      const run = async () => { window.__READS++; await sleep(delay); return { data: rows(), error: null }; };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => run().then(a, b);
        if (p === 'in') return (c, v) => { if (c === 'transaction_type') st.types = v; return q; };
        if (p === 'eq') return (c, v) => { st.filters[c] = v; return q; };
        if (p === 'maybeSingle' || p === 'single')
          return async () => { const r = await run(); return { data: r.data[0] || null, error: null }; };
        if (p === 'insert') return (r) => {
          const list = [].concat(r); window.__INSERTS.push(...list);
          const out = Promise.resolve({ data: list, error: null });
          return { select: () => out, then: (a, b) => out.then(a, b) };
        };
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'coco@mjmnursery.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      storage: { from: () => ({ upload: async (p2) => ({ data: { path: p2 }, error: null }),
                                getPublicUrl: (p2) => ({ data: { publicUrl: 'https://files.test/' + p2 } }),
                                remove: async () => ({ error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, { tx: TX, cull: CULL, seeds: SEEDS, delay: DELAY, batch: BATCH });

  await page.route('**/shared_access.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user')   return () => ({ id: 'u1', email: 'coco@mjmnursery.com', full_name: 'Coco Lau' });
      if (k === 'load')   return async () => true;
      if (k === 'perms' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then')   return undefined;
      return () => true;
    } });`
  }));
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/cdn.jsdelivr.net/**',    r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**',     r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/operation/operation_batch_detail.html?id=' + BATCH,
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.syncTab5 === 'function'
                                && typeof window.syncOnce === 'function', { timeout: 20000 });
  await page.evaluate((b) => {
    window.showToast = () => {};
    const f = document.getElementById('f-batchno'); if (f) f.value = b;
  }, BATCH);
  return page;
}

/* What the DEAD boxes read, in row order. */
const dead = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#t5-plot-rows .t5-plot-row')].map((r) => {
    const plot = (r.querySelector('.t5-dead')?.dataset.transplanted) || '?';
    return plot + ':' + (r.querySelector('.t5-dead')?.value ?? '');
  }).sort());

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nOne run of the sync');
  {
    const page = await boot(browser);
    await page.evaluate(() => syncOnce(5, syncTab5));
    await page.waitForTimeout(DELAY * 4);
    check('the saved figures, as saved', await dead(page),
          ['2296:17', '5949:243', '945:3']);
    await page.close();
  }

  console.log('\nTWO RUNS AT ONCE — the pre-warm and a click on the tab');
  {
    const page = await boot(browser);
    /* Exactly what the page does: prewarmAllTabs awaits its turn while
       switchTab fires the same sync without awaiting it. Both go through
       syncOnce, so the second waits for the first instead of interleaving. */
    await page.evaluate(() => {
      syncOnce(5, syncTab5);
      syncOnce(5, syncTab5);
    });
    await page.waitForTimeout(DELAY * 10);
    check('NOTHING IS DOUBLED', await dead(page),
          ['2296:17', '5949:243', '945:3']);
    await page.close();
  }

  console.log('\nFive runs at once, which is what a slow connection looks like');
  {
    const page = await boot(browser);
    await page.evaluate(() => { for (let i = 0; i < 5; i++) syncOnce(5, syncTab5); });
    await page.waitForTimeout(DELAY * 20);
    check('still the saved figures', await dead(page),
          ['2296:17', '5949:243', '945:3']);
    check('and one row per plot, not five', await page.evaluate(() =>
      document.querySelectorAll('#t5-plot-rows .t5-plot-row').length), 3);
    await page.close();
  }

  console.log('\nThe raw function, called twice without the queue');
  {
    /* Belt and braces: syncOnce is what stops the overlap, but the rows are
       also built in a list of this run's own, so even an unqueued overlap
       cannot push onto an array another run has already merged. */
    const page = await boot(browser);
    await page.evaluate(() => { syncTab5(); syncTab5(); });
    await page.waitForTimeout(DELAY * 12);
    check('still not doubled', await dead(page),
          ['2296:17', '5949:243', '945:3']);
    await page.close();
  }

  console.log('\nAnd what Save would write');
  {
    const page = await boot(browser);
    await page.evaluate(() => { syncOnce(5, syncTab5); syncOnce(5, syncTab5); });
    await page.waitForTimeout(DELAY * 10);
    const written = await page.evaluate(async () => {
      window.__INSERTS = [];
      await saveTab5();
      return window.__INSERTS.map((r) => r.plot_name + ':' + r.quantity_change).sort();
    });
    check('the ledger gets what was saved, not twice it',
          written, ['B5:243', 'N18:17', 'U3:3']);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
