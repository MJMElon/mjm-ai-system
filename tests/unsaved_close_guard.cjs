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

  // Record toasts so the test can read what the page said.
  const catchToasts = () => page.evaluate(() => {
    window.__TOASTS = [];
    const real = window.showToast;
    window.showToast = function (m, t) { window.__TOASTS.push({ m, t }); return real.apply(this, arguments); };
  });

  // Every dialog the page raises, so the test can read and answer them.
  let dialogs = [];
  let answer = false;
  page.on('dialog', async d => { dialogs.push(d.message()); await (answer ? d.accept() : d.dismiss()); });
  await catchToasts();

  /* The saves are recorded on THIS side: closing navigates away, so anything
     kept on window goes with it. */
  const ran = [];
  await page.exposeFunction('__note', n => { ran.push(n); });

  console.log('\nNothing typed, nothing asked');
  await page.evaluate(() => window.closeBatchRecord());
  await page.waitForTimeout(250);
  check('pressing X with a clean page asks nothing', dialogs.length, 0);
  check('…and it does leave', new URL(page.url()).pathname.endsWith('operation_batch_record.html'), true);

  await page.goto(URL_HERE, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.closeBatchRecord === 'function', { timeout: 15000 });
  await page.waitForTimeout(400);
  await catchToasts();

  console.log('\nA value the page writes is not somebody typing');
  await page.evaluate(() => {
    const el = document.querySelector('#tab-3 input, #tab-3 select');
    if (el) el.value = '999';                 // the way the page restores a row
  });
  check('setting a value in code leaves the tab clean',
        await page.evaluate(() => Object.keys(window._tabDirty || {}).length === 0), true);

  console.log('\nTyping into a tab and pressing X');
  const type = (sel, val) => page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = v;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [sel, val]);
  const modalOpen = () => page.evaluate(() =>
    !document.getElementById('unsaved-modal').classList.contains('hidden'));
  const listed = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#unsaved-modal-list .unsaved-row'))
         .map(r => r.querySelector('span').textContent.trim()));

  await type('#t3-dtone-nursery-qty', '1234');
  check('the tab typed into is the one that goes dirty',
        await page.evaluate(() => window._dirtyTabNames()), ['Transplanting']);

  await page.evaluate(() => window.closeBatchRecord());
  await page.waitForTimeout(250);
  check('no browser confirm box is used at all', dialogs.length, 0);
  check('a dialog of our own opens instead', await modalOpen(), true);
  check('…naming the tab', await listed(), ['Transplanting']);
  check('…offering Save and Don\'t save for it',
        await page.evaluate(() => ({
          save: !!document.querySelector('#unsaved-modal-list .unsaved-save'),
          drop: !!document.querySelector('#unsaved-modal-list .unsaved-drop')
        })), { save: true, drop: true });
  check('still on the page', new URL(page.url()).pathname.endsWith('operation_batch_detail.html'), true);

  console.log('\nStay puts it back');
  await page.evaluate(() => window.closeUnsavedModal());
  await page.waitForTimeout(150);
  check('the dialog closes', await modalOpen(), false);
  check('…and the typing is still there', await page.inputValue('#t3-dtone-nursery-qty'), '1234');
  check('…and the tab still dirty', await page.evaluate(() => window._dirtyTabNames()), ['Transplanting']);

  console.log('\nEvery dirty tab is listed, in tab order');
  await type('#t2-gap-note', 'short by a few');
  await page.evaluate(() => {
    document.querySelector('#tab-6 select').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.evaluate(() => window.closeBatchRecord());
  await page.waitForTimeout(200);
  check('three tabs, named', await listed(), ['Seed Planting', 'Transplanting', '3rd Culling']);

  console.log('\nSave is the default, and Don\'t save can be picked per tab');
  check('nothing is marked dropped to begin with',
        await page.evaluate(() => Array.from(document.querySelectorAll('#unsaved-modal-list .unsaved-row'))
                                       .map(r => r.getAttribute('data-choice'))), [null, null, null]);
  await page.evaluate(() => window._pickUnsaved(6, 0));
  await page.waitForTimeout(100);
  check('only the one picked is marked dropped',
        await page.evaluate(() => Array.from(document.querySelectorAll('#unsaved-modal-list .unsaved-row'))
                                       .map(r => r.getAttribute('data-tab') + ':' + (r.getAttribute('data-choice') || 'save'))),
        ['2:save', '3:save', '6:drop']);

  console.log('\nClosing runs the saves that were chosen, and only those');
  await page.evaluate(() => {
    ['savePlantingTab', 'saveTransplantTab', 'saveTab6'].forEach(n => {
      window[n] = function () { window.__note(n); window.showToast('Saved.', 'success'); };
    });
    window._trackTabSave('savePlantingTab', 2);
    window._trackTabSave('saveTransplantTab', 3);
    window._trackTabSave('saveTab6', 6);
  });
  ran.length = 0;
  await page.evaluate(() => window.confirmCloseBatchRecord());
  await page.waitForTimeout(800);
  check('the two marked Save ran', ran.slice().sort(),
        ['savePlantingTab', 'saveTransplantTab']);
  check('…and the one marked Don\'t save did not', ran.indexOf('saveTab6'), -1);
  check('and it left', new URL(page.url()).pathname.endsWith('operation_batch_record.html'), true);

  console.log('\nA save that fails does not close over it');
  await page.goto(URL_HERE, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.closeBatchRecord === 'function', { timeout: 15000 });
  await page.waitForTimeout(400);
  await catchToasts();
  await type('#t3-dtone-nursery-qty', '99');
  await page.evaluate(() => {
    window.saveTransplantTab = function () { window.showToast('Database blocked save.', 'error'); };
    window._trackTabSave('saveTransplantTab', 3);
  });
  await page.evaluate(() => window.closeBatchRecord());
  await page.waitForTimeout(200);
  await page.evaluate(() => window.confirmCloseBatchRecord());
  await page.waitForTimeout(600);
  check('it stayed on the page', new URL(page.url()).pathname.endsWith('operation_batch_detail.html'), true);
  check('…the tab is still dirty', await page.evaluate(() => window._dirtyTabNames()), ['Transplanting']);
  check('…the dialog is showing again', await modalOpen(), true);
  checkTrue('…and it says nothing was lost',
            await page.evaluate(() => (window.__TOASTS.slice(-1)[0] || {}).m || '')
              .then(m => /did not save/i.test(m) && /nothing has been lost/i.test(m)));

  console.log('\nNo browser confirm box was used anywhere');
  check('not once', dialogs.length, 0);

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
