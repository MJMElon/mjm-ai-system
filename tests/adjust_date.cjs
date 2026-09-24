/* Stock Adjustment now records WHEN IT HAPPENED, not just when it was keyed.

   What this drives, on the real tab 7 form:
     · the Date field exists, and a fresh form opens on today
     · saving writes transaction_date -- the same column every other
       movement uses, so the Movement Report's _logDate() picks it up
     · an empty date is refused, and the save does not go through
     · the history's Date column shows the day it happened, with the keyed
       day in the tooltip
     · a row saved before this existed still shows its keyed date, marked
       "keyed", so nobody reads it as a found-on date
     · pressing Edit on such a row leaves the date EMPTY rather than
       guessing today, and the save then asks for it
     · Edit on a dated row brings the date back

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/adjust_date.cjs
   with `python3 -m http.server 8777` serving the repository root.        */
const { chromium } = require('playwright');

const BATCH = '242';
const TODAY = new Date().toISOString().split('T')[0];

/* The Plot / Tray list is built from plots this harness does not load, so
   put the one being adjusted into it and pick it. */
async function setPlot(page, plot) {
  await page.evaluate(p => {
    const s = document.getElementById('t7-cal-plot');
    if (!Array.from(s.options).some(o => o.value === p)) {
      s.add(new Option(p, p));
    }
    s.value = p;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, plot);
}

/* shared_cf_select.js replaces every <select> on the page with a custom
   dropdown and hides the native one, so Playwright's selectOption cannot
   reach it. Set the value and fire the same bubbling `change` the custom
   widget fires — which is what the page's own onchange listens for. */
async function setSelect(page, sel, value) {
  await page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    if (!Array.from(el.options).some(o => o.value === v)) el.add(new Option(v, v));
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [sel, value]);
  await page.waitForTimeout(120);
}

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

/* Two adjustments already on the batch: one written before the Date field
   existed (no transaction_date), one written after. */
const OLD_ROW = {
  id: 'cal-old', batch_name: BATCH, transaction_type: 'Stock_Calibration',
  plot_name: 'B14', quantity_change: -53, transaction_date: null,
  created_at: '2026-02-11T03:00:00.000Z', last_edited_by: null,
  remark: 'Report: Transplanting. Plot: B14. Stolen from B14'
};
const NEW_ROW = {
  id: 'cal-new', batch_name: BATCH, transaction_type: 'Stock_Calibration',
  plot_name: 'N19', quantity_change: 1, transaction_date: '2026-03-04',
  created_at: '2026-09-20T03:00:00.000Z', last_edited_by: null,
  remark: 'Report: 1st Culling. Plot: N19. Found one more on recount'
};

/* Enough of a batch for the page to accept that 242 exists. */
const SEEDS_ROW = {
  id: 'sr-1', batch_name: BATCH, transaction_type: 'Seeds_Received',
  breed_name: 'DxP', quantity_change: 10000, plot_name: 'Pre-Nursery',
  transaction_date: '2026-01-05', created_at: '2026-01-05T02:00:00.000Z',
  workers: 4, remark: 'Supplier: AAR. MPOB: 123-456'
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));

  /* Stub Supabase BEFORE the page boots. `const _supabase =
     supabase.createClient(...)` is a lexical binding, so it cannot be
     replaced from outside afterwards -- and when the CDN is blocked that
     line throws, which kills the rest of the script block and leaves
     everything declared below it uninitialised. Supplying the global the
     page expects lets it boot the way it really does. */
  await page.addInitScript(({ oldRow, newRow, seedsRow }) => {
    window.__INSERTS = [];
    window.__UPDATES = [];
    window.__TOASTS  = [];
    window.__CAL_ROWS = [oldRow, newRow];
    /* Without a Seeds_Received row the page decides the batch does not
       exist and sends the browser back to the batch list mid-test. */
    window.__SEEDS_ROWS = [seedsRow];

    function makeQuery(tableName) {
      const st = { table: tableName, filters: {}, upd: null };
      const rows = () => {
        if (st.filters.transaction_type === 'Stock_Calibration') return window.__CAL_ROWS;
        if (st.filters.transaction_type === 'Seeds_Received')    return window.__SEEDS_ROWS;
        return [];
      };
      const res = () => Promise.resolve({ data: rows(), error: null });
      const q = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') return (a, b) => res().then(a, b);
          if (prop === 'insert') return r => {
            const list = [].concat(r);
            window.__INSERTS.push(...list);
            const out = Promise.resolve({ data: list, error: null });
            return { select: () => out, then: (a, b) => out.then(a, b) };
          };
          if (prop === 'update') return r => { st.upd = r; return q; };
          if (prop === 'eq') return (col, val) => {
            if (st.upd) {
              window.__UPDATES.push({ id: val, row: st.upd });
              st.upd = null;
              return Promise.resolve({ data: [], error: null });
            }
            st.filters[col] = val;
            return q;
          };
          if (prop === 'maybeSingle' || prop === 'single')
            return () => Promise.resolve({ data: rows()[0] || null, error: null });
          return () => q;      // select, order, in, limit, delete, filter…
        }
      });
      return q;
    }

    const user = { id: 'u1', email: 'tester@mjmnursery.com' };
    window.supabase = {
      createClient: () => ({
        from: makeQuery,
        rpc: () => Promise.resolve({ data: [], error: null }),
        auth: {
          getUser:    async () => ({ data: { user }, error: null }),
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
      })
    };
  }, { oldRow: OLD_ROW, newRow: NEW_ROW, seedsRow: SEEDS_ROW });

  /* The page guards itself and REDIRECTS to the hub when the signed-in
     user holds no operations access -- which a stubbed client always looks
     like, so the whole document goes away mid-boot. Serve a permissive
     MJMAccess in place of the real gate; what is under test is the Date
     field, not who may see it. */
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
  await page.route('**/*supabase*.js',          r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route('**://*.supabase.co/**',     r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/operation/operation_batch_detail.html?id=' + BATCH,
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderCalibrationHistory === 'function'
                                && typeof window.saveCalibration === 'function', { timeout: 15000 });

  /* Admin actions and the name lookups are somebody else's business here;
     the plot dropdown is fed by data this harness does not load. */
  await page.evaluate(() => {
    window._t7IsAdmin = () => true;
    window.mjmLoadNames = async () => {};
    window.mjmWho = () => 'Ah Seng';
    window.showToast = (m, t) => { window.__TOASTS.push({ m, t }); };
    window._t7PopulatePlotDropdown = () => {
      const s = document.getElementById('t7-cal-plot');
      if (s && s.options.length < 2) s.innerHTML =
        '<option value=""></option><option value="B14">B14</option><option value="N19">N19</option>';
    };
    window.syncAdjustmentBars = async () => {};
  });
  await page.evaluate(b => window.renderCalibrationHistory(b), BATCH);
  await page.waitForSelector('#t7-cal-history tr[data-cal-id="cal-new"]',
                             { state: 'attached', timeout: 10000 });
  // Tab 7 is where all of this lives; the fields are not fillable until it
  // is the open tab.
  await page.evaluate(() => window.switchTab(7));
  await page.waitForSelector('#t7-cal-date', { timeout: 5000 });

  console.log('\nThe field is there, and opens on today');
  checkTrue('a Date input exists on the adjustment row', await page.locator('#t7-cal-date').count() === 1);
  check('it is a real date picker', await page.getAttribute('#t7-cal-date', 'type'), 'date');
  check('a fresh form opens on today', await page.inputValue('#t7-cal-date'), TODAY);
  check('it sits in the same row as Qty and Reason',
        await page.evaluate(() => document.getElementById('t7-cal-date').closest('.grid')
                                === document.getElementById('t7-cal-reason').closest('.grid')), true);

  console.log('\nThe history shows the day it HAPPENED');
  const newCell = await page.evaluate(() => {
    const td = document.querySelector('#t7-cal-history tr[data-cal-id="cal-new"] td');
    return { text: td.textContent.trim(), title: td.getAttribute('title') || '' };
  });
  check('a dated row shows its own date, not the keyed one', newCell.text, '04 Mar 2026');
  checkTrue('and carries the keyed day in the tooltip', /keyed in on 20 Sept? 2026/i.test(newCell.title));

  const oldCell = await page.evaluate(() => {
    const td = document.querySelector('#t7-cal-history tr[data-cal-id="cal-old"] td');
    return { text: td.textContent.replace(/\s+/g, ' ').trim(), title: td.getAttribute('title') || '' };
  });
  checkTrue('an undated row still shows the day it was keyed', oldCell.text.includes('11 Feb 2026'));
  checkTrue('…and says so, so it is not read as a found-on date', /keyed/i.test(oldCell.text));
  checkTrue('…with the reason spelled out in the tooltip', /no date was recorded/i.test(oldCell.title));

  console.log('\nSaving writes the date into transaction_date');
  await page.fill('#t7-cal-qty', '-20');
  await setSelect(page,'#t7-cal-report', 'Transplanting');
  await setPlot(page, 'B14');
  await page.fill('#t7-cal-reason', 'Manual count');
  await page.fill('#t7-cal-date', '2026-03-04');
  await page.evaluate(() => window.saveCalibration());
  await page.waitForFunction(() => window.__INSERTS.length > 0, { timeout: 8000 });

  const ins = await page.evaluate(() => window.__INSERTS[0]);
  check('the saved row carries transaction_date', ins.transaction_date, '2026-03-04');
  check('…as the real column, not buried in the remark',
        /Date:/i.test(String(ins.remark || '')), false);
  check('the rest of the row is unchanged', {
    type: ins.transaction_type, qty: ins.quantity_change, plot: ins.plot_name
  }, { type: 'Stock_Calibration', qty: -20, plot: 'B14' });
  check('the remark still reads as it did', ins.remark, 'Report: Transplanting. Plot: B14. Manual count');
  check('the form resets to today after saving', await page.inputValue('#t7-cal-date'), TODAY);

  console.log('\nAn empty date is refused');
  await page.evaluate(() => { window.__INSERTS = []; window.__TOASTS = []; });
  await page.fill('#t7-cal-qty', '5');
  await setSelect(page,'#t7-cal-report', '1st Culling');
  await setPlot(page, 'B14');
  await page.fill('#t7-cal-reason', 'Recount');
  await page.fill('#t7-cal-date', '');
  await page.evaluate(() => window.saveCalibration());
  const refused = await page.evaluate(() => ({
    inserts: window.__INSERTS.length,
    toast: (window.__TOASTS.slice(-1)[0] || {}).m || '',
    type: (window.__TOASTS.slice(-1)[0] || {}).t || ''
  }));
  check('nothing was written', refused.inserts, 0);
  check('and it was an error, not a quiet pass', refused.type, 'error');
  checkTrue('the message says which date is wanted',
            /not the day you are keying it in/i.test(refused.toast));

  console.log('\nEditing an old row does not invent a date for it');
  await page.evaluate(() => window.cancelEditCalibration());
  await page.evaluate(() => {
    document.querySelector('#t7-cal-history tr[data-cal-id="cal-old"] button').click();
  });
  check('the date box is left EMPTY, not stamped with today',
        await page.inputValue('#t7-cal-date'), '');
  check('the rest of the old row is loaded as before', {
    qty: await page.inputValue('#t7-cal-qty'),
    report: await page.inputValue('#t7-cal-report'),
    reason: await page.inputValue('#t7-cal-reason')
  }, { qty: '-53', report: 'Transplanting', reason: 'Stolen from B14' });

  await page.evaluate(() => { window.__UPDATES = []; window.__TOASTS = []; });
  await page.evaluate(() => window.saveCalibration());
  const editRefused = await page.evaluate(() => ({
    updates: window.__UPDATES.length,
    toast: (window.__TOASTS.slice(-1)[0] || {}).m || ''
  }));
  check('saving it without a date is refused too', editRefused.updates, 0);
  checkTrue('with the same message', /date this adjustment happened/i.test(editRefused.toast));

  console.log('\nEditing a dated row brings its date back');
  await page.evaluate(() => window.cancelEditCalibration());
  await setPlot(page, 'N19');   // so Edit can restore the row's own plot
  await page.evaluate(() => {
    document.querySelector('#t7-cal-history tr[data-cal-id="cal-new"] button').click();
  });
  check('the date comes back into the box', await page.inputValue('#t7-cal-date'), '2026-03-04');
  await page.evaluate(() => { window.__UPDATES = []; });
  await page.evaluate(() => window.saveCalibration());
  await page.waitForFunction(() => window.__UPDATES.length > 0, { timeout: 8000 });
  const upd = await page.evaluate(() => window.__UPDATES[0]);
  check('and is written back on update', upd.row.transaction_date, '2026-03-04');
  check('against the right row', upd.id, 'cal-new');

  if (process.env.SHOT) {
    await page.evaluate(() => window.cancelEditCalibration());
    await page.locator('#t7-cal-date').locator('xpath=ancestor::div[contains(@class,"grid")][1]')
              .screenshot({ path: '/tmp/adjust_row.png' });
    await page.locator('#t7-cal-history').screenshot({ path: '/tmp/adjust_history.png' });
  }
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
