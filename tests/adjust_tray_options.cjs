/* The Source Tray list must be there whatever tab was last open.

   getTab3TrayOptionsHTML() offers preNurseryTrayData, and syncTab3()
   rebuilds that array by reading tab 2's tray rows OUT OF THE DOM --
   emptying it first. syncTab3() runs on every switch to Transplanting and
   after every transplant save, so asking for the tray list while tab 2's
   rows are not rendered got nothing but the two special trays: open a
   batch, touch Transplanting, go to Adjustments, and the dropdown for
   "B8 has no transplanting record" was empty.

   This drives that exact sequence on the real page.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/adjust_tray_options.cjs
   with `python3 -m http.server 8777` serving the repository root.        */
const { chromium } = require('playwright');

const BATCH = '227';
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

async function setSelect(page, sel, value) {
  await page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    if (!Array.from(el.options).some(o => o.value === v)) el.add(new Option(v, v));
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [sel, value]);
  await page.waitForTimeout(250);
}

const SEEDS_ROW = {
  id: 'sr-1', batch_name: BATCH, transaction_type: 'Seeds_Received',
  breed_name: 'AA HYBRIDA 1S', quantity_change: 10000, plot_name: 'Pre-Nursery',
  transaction_date: '2025-01-05', created_at: '2025-01-05T02:00:00.000Z',
  workers: 4, remark: 'Supplier: AAR. MPOB: 123-456'
};
// The batch really does have four pre-nursery trays…
const PLANTED_ROWS = [
  { plot_name: 'P4', quantity_change: 2500 },
  { plot_name: 'P5', quantity_change: 2800 },
  { plot_name: 'P6', quantity_change: 0 },      // fully transplanted out
  { plot_name: 'P7', quantity_change: 2727 }
];
// …and B7 was transplanted into, B8 never was.
const TX_ROWS = [
  { id: 'tx1', transaction_type: 'Transplanted', plot_name: 'B7', quantity_change: 206,
    transaction_date: '2025-05-05', created_at: '2025-05-05T02:00:00Z',
    remark: 'Transplanted from tray [P4] to Main Plot [B7]. Date: 2025-05-05' },
  // a tray the planting report never named, the way 227's P4..P7 are
  { id: 'tx2', transaction_type: 'Transplanted', plot_name: 'B9', quantity_change: 300,
    transaction_date: '2025-05-06', created_at: '2025-05-06T02:00:00Z',
    remark: 'Transplanted from tray [T9] to Main Plot [B9]. Date: 2025-05-06' }
];

function stub(withPlanted) {
  return ({ seedsRow, txRows, plantedRows, usePlanted }) => {
    window.__SEEDS_ROWS = [seedsRow];
    window.__TX_ROWS = txRows;
    window.__PLANTED_ROWS = usePlanted ? plantedRows : [];
    window.__CAL_ROWS = [];

    function makeQuery() {
      const st = { filters: {}, types: null };
      const rows = () => {
        if (st.filters.transaction_type === 'Stock_Calibration') return window.__CAL_ROWS;
        if (st.filters.transaction_type === 'Seeds_Received')    return window.__SEEDS_ROWS;
        if (st.filters.transaction_type === 'Planted')           return window.__PLANTED_ROWS;
        if (st.types && st.types.indexOf('Transplanted') >= 0)   return window.__TX_ROWS;
        return [];
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve({ data: rows(), error: null }).then(a, b);
        if (p === 'in') return (c, v) => { if (c === 'transaction_type') st.types = v; return q; };
        if (p === 'eq') return (c, v) => { st.filters[c] = v; return q; };
        if (p === 'insert' || p === 'update') return () => q;
        if (p === 'maybeSingle' || p === 'single')
          return () => Promise.resolve({ data: rows()[0] || null, error: null });
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
  };
}

async function openPage(browser, usePlanted) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', e => { if (!/MJMReview/.test(e.message)) console.log('  [page error] ' + e.message); });
  await page.addInitScript(stub(usePlanted),
    { seedsRow: SEEDS_ROW, txRows: TX_ROWS, plantedRows: PLANTED_ROWS, usePlanted });
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
  await page.goto('http://localhost:8777/operation/operation_batch_detail.html?id=' + BATCH,
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.t7SyncTrayPanel === 'function'
                                && typeof window.syncTab3 === 'function', { timeout: 15000 });
  await page.evaluate(() => {
    window._t7IsAdmin = () => true;
    window.mjmLoadNames = async () => {};
    window.mjmWho = () => 'Tester';
    window.showToast = () => {};
    window._t7PopulatePlotDropdown = () => {};
    window.syncAdjustmentBars = async () => {};
  });
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ── The exact sequence that broke ─────────────────────────────────────
  const page = await openPage(browser, true);

  console.log('\nThe sequence that emptied the list');
  await page.evaluate(() => window.switchTab(3));
  await page.waitForTimeout(400);
  check('the trays are known to start with',
        await page.evaluate(() => window.getTab3TrayOptionsHTML({}).includes('P4')), true);

  /* THE PRECONDITION THE BUG NEEDS. syncTab3() empties preNurseryTrayData and
     rebuilds it from tab 2's tray rows in the DOM, so with those rows gone it
     is left with nothing — and it runs on every switch to Transplanting and
     after every transplant save. Removing them is the honest way to put the
     page in that state; the defect under test is the dependency itself. */
  await page.evaluate(() => {
    document.querySelectorAll('.tray-row').forEach(r => r.remove());
  });
  await page.evaluate(() => window.syncTab3());
  await page.waitForTimeout(300);
  check('syncTab3 refills them from the database on its own',
        await page.evaluate(() => window.getTab3TrayOptionsHTML({}).includes('P4')), true);

  console.log('\nAsking for a tray on Adjustments loads them anyway');
  await page.evaluate(() => window.switchTab(7));
  await page.waitForSelector('#t7-cal-date', { timeout: 5000 });
  await setSelect(page, '#t7-cal-report', 'Transplanting');
  await page.fill('#t7-cal-qty', '140');
  await setSelect(page, '#t7-cal-plot', 'B8');
  await page.waitForSelector('#t7-newplot-tray', { state: 'attached', timeout: 5000 });

  const opts = await page.evaluate(() =>
    Array.from(document.getElementById('t7-newplot-tray').options).map(o => o.value));
  check('every planted tray is offered', opts.filter(v => /^P\d/.test(v)), ['P4', 'P5', 'P6', 'P7']);
  /* The spent-tray filter must NOT apply here. This picker asks where
     seedlings CAME FROM, and a tray emptied months ago is exactly the
     answer — hiding it is what made P4 unpickable on batch 227. P6 is
     fully transplanted out in the fixture. */
  checkTrue('a tray with nothing left is still offered', opts.indexOf('P6') >= 0);
  /* And the names the batch's TRANSPLANT rows use, which are not always the
     planting report's: 227 plants into 4/5/6/7 and transplants from P4..P7. */
  checkTrue('a tray known only from a transplant record is offered too',
            opts.indexOf('T9') >= 0);
  check('nothing is offered twice', opts.length, Array.from(new Set(opts)).length);
  checkTrue('the special trays are still there too',
            opts.indexOf('PREMIUM CARE') >= 0 && opts.indexOf('DOUBLE-TONE') >= 0);
  checkTrue('and a blank to start on', opts.indexOf('') >= 0);
  check('no "no planted trays" warning, because there are some',
        /No planted trays on this batch/i.test(await page.textContent('#t7-cal-trays')), false);

  console.log('\nThe dropdown is not clipped away');
  /* THE ACTUAL BUG. The trays were built and were in the select all along --
     they could not be SEEN. The panel sits at the bottom of the Stock
     Calibration card, that card has overflow-hidden holding its gradient
     header inside the rounded corner, and the skinned dropdown's menu is an
     absolutely positioned element, so it was clipped at the card's edge.

     Tailwind's CDN is blocked here, so overflow-hidden does nothing unless
     supplied; inject that one utility and the real markup reproduces the real
     page. */
  await page.addStyleTag({ content: '.overflow-hidden{overflow:hidden;}' });
  await page.waitForTimeout(100);

  const geo = await page.evaluate(() => {
    const sel = document.getElementById('t7-newplot-tray');
    let n = sel.parentElement, clipper = null;
    while (n && n !== document.body) {
      if (/hidden|clip/.test(getComputedStyle(n).overflow)) { clipper = n; break; }
      n = n.parentElement;
    }
    return {
      skinned: !!sel.closest('.cf-wrap'),
      skipped: sel.classList.contains('cf-skip'),
      hidden:  sel.classList.contains('cf-native-hidden'),
      options: sel.options.length,
      clippingAncestor: clipper ? (clipper.className || clipper.id).slice(0, 60) : null
    };
  });
  checkTrue('there IS a clipping ancestor — the card, as on the real page',
            geo.clippingAncestor !== null);
  check('so the tray picker is left native, which nothing can clip', geo.skipped, true);
  check('…not skinned into a clipped menu', geo.skinned, false);
  check('…and not hidden by the widget', geo.hidden, false);
  checkTrue('with every tray still in it', geo.options >= 6);

  // …and the source, so it cannot be skinned again by accident.
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'operation',
                                                              'operation_batch_detail.html'), 'utf8');
  const panel = src.slice(src.indexOf('function _t7NewPlotPanelHtml'),
                          src.indexOf('function _t7RestoreNewPlotMap'));
  const trayTag = (panel.match(/<select id="t7-newplot-tray"[^>]*>/) || [''])[0];
  checkTrue('the tray select is marked cf-skip in the source', /cf-skip/.test(trayTag));

  console.log('\nPicking one still works');
  await setSelect(page, '#t7-newplot-tray', 'P4');
  check('the select holds the tray', await page.inputValue('#t7-newplot-tray'), 'P4');
  await page.close();

  // ── A batch that genuinely has no trays ───────────────────────────────
  console.log('\nA batch with nothing planted says so');
  const bare = await openPage(browser, false);
  await bare.evaluate(() => window.switchTab(7));
  await bare.waitForSelector('#t7-cal-date', { timeout: 5000 });
  await setSelect(bare, '#t7-cal-report', 'Transplanting');
  await bare.fill('#t7-cal-qty', '140');
  await setSelect(bare, '#t7-cal-plot', 'B8');
  await bare.waitForSelector('#t7-newplot-tray', { state: 'attached', timeout: 5000 });
  const bareOpts = await bare.evaluate(() =>
    Array.from(document.getElementById('t7-newplot-tray').options).map(o => o.value));
  /* Nothing is invented: with no planting report the only trays offered are
     the ones its own transplant rows name. */
  check('the offered trays are exactly the ones it transplanted from',
        bareOpts.filter(v => v && ['PREMIUM CARE', 'DOUBLE-TONE'].indexOf(v) < 0).sort(),
        ['P4', 'T9']);
  checkTrue('and it still says the planting report is missing',
            /No planted trays on this batch/i.test(await bare.textContent('#t7-cal-trays')));
  await bare.close();

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
