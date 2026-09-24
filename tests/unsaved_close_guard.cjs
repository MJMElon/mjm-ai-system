/* Closing a batch with something keyed and not saved has to ask first.

   Each tab is kept by its own Save button at the bottom of it, and the X
   in the corner navigated away without going near any of them -- a
   morning's counting typed into 3rd Culling and not saved was gone,
   silently, with one click.

   What this drives, on the real page:
     · typing into a tab and pressing X asks, and names that tab
     · saying no stays on the page with the typing intact
     · saying yes leaves
     · pressing X with nothing typed does not ask at all
     · a value the PAGE writes into a box is not somebody typing
     · a successful save clears that tab
     · a FAILED save does not -- that is the one where losing the warning
       matters most
     · each tab is tracked on its own, and all of them are named

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/unsaved_close_guard.cjs
   with `python3 -m http.server 8777` serving the repository root.        */
const { chromium } = require('playwright');

const BATCH = '242';
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

const SEEDS_ROW = {
  id: 'sr-1', batch_name: BATCH, transaction_type: 'Seeds_Received',
  breed_name: 'DxP', quantity_change: 10000, plot_name: 'Pre-Nursery',
  transaction_date: '2026-01-05', created_at: '2026-01-05T02:00:00.000Z',
  workers: 4, remark: 'Supplier: AAR. MPOB: 123-456'
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => { if (!/MJMReview/.test(e.message)) console.log('  [page error] ' + e.message); });

  await page.addInitScript(({ seedsRow }) => {
    window.__SEEDS_ROWS = [seedsRow];
    function makeQuery() {
      const st = { filters: {} };
      const rows = () => st.filters.transaction_type === 'Seeds_Received' ? window.__SEEDS_ROWS : [];
      const res = () => Promise.resolve({ data: rows(), error: null });
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => res().then(a, b);
        if (p === 'eq') return (c, v) => { st.filters[c] = v; return q; };
        if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: rows()[0] || null, error: null });
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'tester@mjmnursery.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery,
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      storage: { from: () => ({
        upload: async () => ({ data: { path: 'x' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'http://x/y.jpg' } }),
        remove: async () => ({ error: null })
      }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, { seedsRow: SEEDS_ROW });

  await page.route('**/shared_access.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user')   return () => ({ id: 'u1', email: 'tester@mjmnursery.com', full_name: 'Tester' });
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

  const URL_HERE = 'http://localhost:8777/operation/operation_batch_detail.html?id=' + BATCH;
  await page.goto(URL_HERE, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.closeBatchRecord === 'function', { timeout: 15000 });
  await page.waitForTimeout(400);   // the load handler wraps the save functions

  // Every dialog the page raises, so the test can read and answer them.
  let dialogs = [];
  let answer = false;
  page.on('dialog', async d => { dialogs.push(d.message()); await (answer ? d.accept() : d.dismiss()); });

  console.log('\nNothing typed, nothing asked');
  await page.evaluate(() => window.closeBatchRecord());
  await page.waitForTimeout(250);
  check('pressing X with a clean page asks nothing', dialogs.length, 0);
  check('…and it does leave', new URL(page.url()).pathname.endsWith('operation_batch_record.html'), true);

  await page.goto(URL_HERE, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.closeBatchRecord === 'function', { timeout: 15000 });
  await page.waitForTimeout(400);

  console.log('\nA value the page writes is not somebody typing');
  await page.evaluate(() => {
    const el = document.querySelector('#tab-3 input, #tab-3 select');
    if (el) el.value = '999';                 // the way the page restores a row
  });
  check('setting a value in code leaves the tab clean',
        await page.evaluate(() => Object.keys(window._tabDirty || {}).length === 0), true);

  console.log('\nTyping into a tab and pressing X');
  /* Fields that are on the page from the start. The culling tabs build
     their rows from plot data this fixture does not load, so they have
     nothing to type into here. */
  const type = (sel, val) => page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = v;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [sel, val]);

  await type('#t3-dtone-nursery-qty', '1234');
  check('the tab typed into is the one that goes dirty',
        await page.evaluate(() => window._dirtyTabNames()), ['Transplanting']);

  dialogs = []; answer = false;
  await page.evaluate(() => window.closeBatchRecord());
  await page.waitForTimeout(250);
  check('pressing X asks', dialogs.length, 1);
  checkTrue('and names the tab', /Transplanting/.test(dialogs[0]));
  checkTrue('…says what is at stake', /loses what has been keyed/i.test(dialogs[0]));
  checkTrue('…and points at the Save button', /Save button/i.test(dialogs[0]));
  checkTrue('…and reads as one tab', /that tab/.test(dialogs[0]));
  check('saying no stays on the page',
        new URL(page.url()).pathname.endsWith('operation_batch_detail.html'), true);
  check('…with the typing still there',
        await page.inputValue('#t3-dtone-nursery-qty'), '1234');
  check('…and the tab still dirty',
        await page.evaluate(() => window._dirtyTabNames()), ['Transplanting']);

  console.log('\nEach tab is tracked on its own');
  await type('#t2-gap-note', 'short by a few');
  await page.evaluate(() => {
    const el = document.querySelector('#tab-6 select');
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  check('all three are named, in tab order',
        await page.evaluate(() => window._dirtyTabNames()),
        ['Seed Planting', 'Transplanting', '3rd Culling']);
  dialogs = []; answer = false;
  await page.evaluate(() => window.closeBatchRecord());
  await page.waitForTimeout(250);
  checkTrue('the prompt names every one of them',
            ['Seed Planting', 'Transplanting', '3rd Culling'].every(t => dialogs[0].includes(t)));
  checkTrue('…and reads as more than one', /those tabs/.test(dialogs[0]));

  console.log('\nThe page really did wrap its saves');
  check('every tab save is tracked',
        await page.evaluate(() => ['savePlantingTab', 'saveTransplantTab', 'saveCullingTab',
                                   'saveTab5', 'saveTab6', 'saveCalibration', 'saveSeedAudit']
          .filter(n => typeof window[n] === 'function' && /sawError/.test(window[n].toString()))),
        ['savePlantingTab', 'saveTransplantTab', 'saveCullingTab',
         'saveTab5', 'saveTab6', 'saveCalibration', 'saveSeedAudit']);

  console.log('\nA save that worked clears its tab — a failed one does not');
  await page.evaluate(() => {
    // Stand-ins that do the one thing the wrapper reads: how they report.
    window.saveTab6        = function () { window.showToast('Saved.', 'success'); };
    window.saveTransplantTab = function () { window.showToast('Database blocked save.', 'error'); };
    window._trackTabSave('saveTab6', 6);
    window._trackTabSave('saveTransplantTab', 3);
  });
  await page.evaluate(() => window.saveTab6());
  await page.waitForTimeout(200);
  check('the saved tab is clean', await page.evaluate(() => window._dirtyTabNames()),
        ['Seed Planting', 'Transplanting']);

  await page.evaluate(() => window.saveTransplantTab());
  await page.waitForTimeout(200);
  check('the tab whose save FAILED stays dirty',
        await page.evaluate(() => window._dirtyTabNames()), ['Seed Planting', 'Transplanting']);
  dialogs = []; answer = false;
  await page.evaluate(() => window.closeBatchRecord());
  await page.waitForTimeout(250);
  check('…so X still asks about it', dialogs.length, 1);
  checkTrue('…and still names it', /Transplanting/.test(dialogs[0]));

  console.log('\nAn async save is waited for, not guessed at');
  await page.evaluate(() => {
    window.savePlantingTab = async function () {
      window.__inFlight = true;
      await new Promise(r => setTimeout(r, 200));
      window.showToast('Saved.', 'success');
      window.__inFlight = false;
    };
    window._trackTabSave('savePlantingTab', 2);
    window.__p = window.savePlantingTab();
  });
  await page.waitForFunction(() => window.__inFlight === true, { timeout: 3000 });
  check('the tab is still dirty while the save is in flight',
        await page.evaluate(() => window._dirtyTabNames().indexOf('Seed Planting') >= 0), true);
  await page.evaluate(() => window.__p);
  check('…and clean once it has actually finished',
        await page.evaluate(() => window._dirtyTabNames()), ['Transplanting']);

  console.log('\nSaying yes leaves');
  dialogs = []; answer = true;
  await page.evaluate(() => window.closeBatchRecord());
  await page.waitForTimeout(600);
  check('it asked once', dialogs.length, 1);
  check('and left', new URL(page.url()).pathname.endsWith('operation_batch_record.html'), true);

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
