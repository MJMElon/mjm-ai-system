/* A Transplanting adjustment is keyed against the TRAY it came from.

   A plot is filled from several trays. "B14 is short by 53" does not say
   which tray's count was wrong, so picking the plot on a Transplanting
   adjustment now reads back every Transplanted row that fed it, lists the
   trays with what each sent, and takes the difference per tray -- saved as
   one row each so every share can be approved and read on its own.

   What this drives, on the real tab 7 form:
     · picking a plot on Transplanting lists the trays that fed it, with
       what each sent, biggest first
     · the Qty box becomes the running sum of the tray lines
     · saving writes one row per keyed tray, each naming its tray, and the
       quantities add up to the total
     · a tray left blank is "its count was right" -- no row for it
     · keying nothing is refused, and nothing is written
     · the tray does NOT leak into the Reason column
     · another report, or a plot nothing was transplanted into, keeps the
       plain single-quantity form
     · editing a saved row stays ONE row: the panel goes read-only

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/adjust_tray_split.cjs
   with `python3 -m http.server 8777` serving the repository root.        */
const { chromium } = require('playwright');

const BATCH = '242';
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

const SEEDS_ROW = {
  id: 'sr-1', batch_name: BATCH, transaction_type: 'Seeds_Received',
  breed_name: 'DxP', quantity_change: 10000, plot_name: 'Pre-Nursery',
  transaction_date: '2026-01-05', created_at: '2026-01-05T02:00:00.000Z',
  workers: 4, remark: 'Supplier: AAR. MPOB: 123-456'
};

/* B14 was filled from three trays on two days; N19 from one. U17 is a plot
   nothing was ever transplanted into. */
const TX_ROWS = [
  { plot_name: 'B14', quantity_change: 1200, transaction_date: '2026-03-04',
    created_at: '2026-03-04T02:00:00Z',
    remark: 'Transplanted from tray [T3] to Main Plot [B14]. Date: 2026-03-04' },
  { plot_name: 'B14', quantity_change: 4800, transaction_date: '2026-03-04',
    created_at: '2026-03-04T02:00:00Z',
    remark: 'Transplanted from tray [T1] to Main Plot [B14]. Date: 2026-03-04' },
  { plot_name: 'B14', quantity_change: 900,  transaction_date: '2026-03-06',
    created_at: '2026-03-06T02:00:00Z',
    remark: 'Transplanted from tray [T7] to Main Plot [B14]. Date: 2026-03-06' },
  { plot_name: 'N19', quantity_change: 3000, transaction_date: '2026-03-05',
    created_at: '2026-03-05T02:00:00Z',
    remark: 'Transplanted from tray [T2] to Main Plot [N19]. Date: 2026-03-05' }
];

async function setPlot(page, plot) {
  await page.evaluate(p => {
    const s = document.getElementById('t7-cal-plot');
    if (!Array.from(s.options).some(o => o.value === p)) s.add(new Option(p, p));
    s.value = p;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, plot);
  await page.waitForTimeout(250);   // the panel reads the transplants
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', e => { if (!/MJMReview/.test(e.message)) console.log('  [page error] ' + e.message); });

  await page.addInitScript(({ seedsRow, txRows }) => {
    window.__INSERTS = []; window.__UPDATES = []; window.__TOASTS = [];
    window.__CAL_ROWS = [];
    window.__SEEDS_ROWS = [seedsRow];
    window.__TX_ROWS = txRows;

    function makeQuery() {
      const st = { filters: {}, types: null, upd: null };
      const rows = () => {
        if (st.filters.transaction_type === 'Stock_Calibration') return window.__CAL_ROWS;
        if (st.filters.transaction_type === 'Seeds_Received')    return window.__SEEDS_ROWS;
        if (st.types && st.types.indexOf('Transplanted') >= 0)   return window.__TX_ROWS;
        return [];
      };
      const res = () => Promise.resolve({ data: rows(), error: null });
      const q = new Proxy({}, {
        get(_, prop) {
          if (prop === 'then') return (a, b) => res().then(a, b);
          if (prop === 'in') return (col, vals) => { if (col === 'transaction_type') st.types = vals; return q; };
          if (prop === 'insert') return r => {
            const list = [].concat(r);
            window.__INSERTS.push(...list);
            const out = Promise.resolve({ data: list, error: null });
            return { select: () => out, then: (a, b) => out.then(a, b) };
          };
          if (prop === 'update') return r => { st.upd = r; return q; };
          if (prop === 'eq') return (col, val) => {
            if (st.upd) { window.__UPDATES.push({ id: val, row: st.upd }); st.upd = null; return Promise.resolve({ data: [], error: null }); }
            st.filters[col] = val; return q;
          };
          if (prop === 'maybeSingle' || prop === 'single')
            return () => Promise.resolve({ data: rows()[0] || null, error: null });
          return () => q;
        }
      });
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
  }, { seedsRow: SEEDS_ROW, txRows: TX_ROWS });

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
  await page.waitForFunction(() => typeof window.saveCalibration === 'function'
                                && typeof window.t7SyncTrayPanel === 'function', { timeout: 15000 });
  await page.evaluate(() => {
    window._t7IsAdmin = () => true;
    window.mjmLoadNames = async () => {};
    window.mjmWho = () => 'Ah Seng';
    window.showToast = (m, t) => { window.__TOASTS.push({ m, t }); };
    window._t7PopulatePlotDropdown = () => {};
    window.syncAdjustmentBars = async () => {};
  });
  await page.evaluate(b => window.renderCalibrationHistory(b), BATCH);
  await page.evaluate(() => window.switchTab(7));
  await page.waitForSelector('#t7-cal-date', { timeout: 5000 });

  // ── Picking the plot lists the trays ───────────────────────────────────
  console.log('\nPicking the plot reads back the trays that fed it');
  await setSelect(page,'#t7-cal-report', 'Transplanting');
  await setPlot(page, 'B14');
  await page.waitForSelector('#t7-cal-trays .t7-tray-line', { timeout: 5000 });

  const trays = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#t7-cal-trays .t7-tray-line')).map(l => ({
      tray: l.getAttribute('data-tray'),
      sent: Number(l.getAttribute('data-sent')),
      text: l.textContent.replace(/\s+/g, ' ').trim()
    })));
  check('all three trays that fed B14 are listed', trays.map(t => t.tray), ['T1', 'T3', 'T7']);
  check('biggest contributor first', trays.map(t => t.sent), [4800, 1200, 900]);
  checkTrue('each shows its initial amount, with no "sent"', /4,800/.test(trays[0].text) && !/sent/i.test(trays[0].text));
  checkTrue('and when it was sent, under the tray name', /06 Mar 2026/.test(trays[2].text));
  checkTrue('the header names the plot and the count',
            /B14 was filled from 3 trays/.test(await page.textContent('#t7-cal-trays')));
  check('each tray has its own adjustment box',
        await page.locator('#t7-cal-trays .t7-tray-adj').count(), 3);

  console.log('\nThe Qty box becomes the running sum');
  check('it is read-only while the trays are being keyed',
        await page.getAttribute('#t7-cal-qty', 'readonly') !== null, true);
  await page.locator('#t7-cal-trays .t7-tray-line[data-tray="T1"] .t7-tray-adj').fill('-40');
  await page.locator('#t7-cal-trays .t7-tray-line[data-tray="T7"] .t7-tray-adj').fill('-13');
  check('the total follows the lines', await page.inputValue('#t7-cal-qty'), '-53');
  const totals = await page.evaluate(() => ({
    init:  document.getElementById('t7-tray-tot-init').innerText.trim(),
    cal:   document.getElementById('t7-tray-tot-cal').innerText.trim(),
    final: document.getElementById('t7-tray-tot-final').innerText.trim()
  }));
  check('Total initial is what the trays sent', totals.init, '6,900');
  check('Total calibration equals the Adjustment Qty', totals.cal, '-53');
  check('Total final is initial + calibration', totals.final, '6,847');
  const perRow = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#t7-cal-trays .t7-tray-line')).map(l => ({
      tray:  l.getAttribute('data-tray'),
      final: l.querySelector('.t7-tray-final').innerText.trim()
    })));
  check('each tray final is its own initial + calibration',
        perRow, [{ tray: 'T1', final: '4,760' }, { tray: 'T3', final: '1,200' }, { tray: 'T7', final: '887' }]);

  console.log('\nSaving writes one row per keyed tray');
  await page.fill('#t7-cal-reason', 'Recount on the ground');
  await page.fill('#t7-cal-date', '2026-03-10');
  await page.evaluate(() => window.saveCalibration());
  await page.waitForFunction(() => window.__INSERTS.length > 0, { timeout: 8000 });

  const ins = await page.evaluate(() => window.__INSERTS);
  check('one row per tray that was keyed', ins.length, 2);
  check('a tray left blank gets no row -- its count was right',
        ins.some(r => /Tray: T3/.test(r.remark)), false);
  check('each row carries its own share', ins.map(r => r.quantity_change), [-40, -13]);
  check('and they add up to the plot total',
        ins.reduce((s, r) => s + r.quantity_change, 0), -53);
  check('each row names its tray',
        ins.map(r => (r.remark.match(/Tray:\s*([^.]+)\./) || [])[1]), ['T1', 'T7']);
  check('every row is still against the plot', ins.map(r => r.plot_name), ['B14', 'B14']);
  check('…on the same report', ins.map(r => (r.remark.match(/Report:\s*([^.]+)\./) || [])[1]),
        ['Transplanting', 'Transplanting']);
  check('…with the same date', ins.map(r => r.transaction_date), ['2026-03-10', '2026-03-10']);
  check('…and the same reason', ins.map(r => r.remark.split('. ').slice(-1)[0]),
        ['Recount on the ground', 'Recount on the ground']);

  console.log('\nThe tray does not leak into the Reason column');
  const parsed = await page.evaluate(rows => rows.map(r =>
    window._parseCalibration({ id: 'x', quantity_change: r.quantity_change, remark: r.remark })), ins);
  check('reason reads as it was typed', parsed.map(p => p.reason),
        ['Recount on the ground', 'Recount on the ground']);
  check('the tray is read back as its own field', parsed.map(p => p.tray), ['T1', 'T7']);
  check('the plot survives too', parsed.map(p => p.plot), ['B14', 'B14']);

  console.log('\nThe plain form is left alone everywhere else');
  await page.evaluate(() => { window.__INSERTS = []; window.__TOASTS = []; });
  await setSelect(page,'#t7-cal-report', '1st Culling');
  await setPlot(page, 'B14');
  check('another report shows no tray panel',
        await page.locator('#t7-cal-trays .t7-tray-line').count(), 0);
  check('and the Qty box is typable again',
        await page.getAttribute('#t7-cal-qty', 'readonly'), null);

  await setSelect(page,'#t7-cal-report', 'Transplanting');
  await setPlot(page, 'U17');
  check('a plot nothing was transplanted into has no tray lines',
        await page.locator('#t7-cal-trays .t7-tray-line').count(), 0);
  checkTrue('it says so rather than showing an empty list',
            /Nothing has been transplanted into U17/.test(await page.textContent('#t7-cal-trays')));
  check('and the Qty box is typable', await page.getAttribute('#t7-cal-qty', 'readonly'), null);

  console.log('\nKeying no tray at all is refused');
  await setSelect(page,'#t7-cal-report', 'Transplanting');
  await setPlot(page, 'N19');
  await page.waitForSelector('#t7-cal-trays .t7-tray-line', { timeout: 5000 });
  await page.fill('#t7-cal-reason', 'Something');
  await page.fill('#t7-cal-date', '2026-03-10');
  await page.evaluate(() => { window.__INSERTS = []; window.__TOASTS = []; });
  await page.evaluate(() => window.saveCalibration());
  const refused = await page.evaluate(() => ({
    inserts: window.__INSERTS.length,
    toast: (window.__TOASTS.slice(-1)[0] || {}).m || '',
    type:  (window.__TOASTS.slice(-1)[0] || {}).t || ''
  }));
  check('nothing was written', refused.inserts, 0);
  check('and it was an error', refused.type, 'error');
  checkTrue('the message points at the trays', /against the tray it came from/i.test(refused.toast));

  console.log('\nEditing a row that already names a tray');
  await page.evaluate(() => {
    window.__CAL_ROWS = [{
      id: 'cal-1', batch_name: '242', transaction_type: 'Stock_Calibration',
      plot_name: 'B14', quantity_change: -40, transaction_date: '2026-03-10',
      created_at: '2026-03-10T02:00:00Z', last_edited_by: null,
      remark: 'Report: Transplanting. Plot: B14. Tray: T1. Recount on the ground'
    }];
  });
  await page.evaluate(b => window.renderCalibrationHistory(b), BATCH);
  await page.waitForSelector('#t7-cal-history tr[data-cal-id="cal-1"]', { state: 'attached', timeout: 5000 });

  const trayCell = await page.textContent('#t7-cal-history tr[data-cal-id="cal-1"] td:nth-child(4)');
  checkTrue('the history shows the plot and the tray it came from',
            /B14/.test(trayCell) && /T1/.test(trayCell));
  const reasonCell = await page.textContent('#t7-cal-history tr[data-cal-id="cal-1"] td:nth-child(6)');
  check('the Reason column holds only the reason', reasonCell.trim(), 'Recount on the ground');

  await page.evaluate(() => document.querySelector('#t7-cal-history tr[data-cal-id="cal-1"] button').click());
  await page.waitForSelector('#t7-cal-trays .t7-tray-adj', { timeout: 5000 });
  check('the Calibration column is typable while editing',
        await page.locator('#t7-cal-trays .t7-tray-adj').count(), 3);
  check('the row comes back with its own figure in its own tray',
        await page.evaluate(() =>
          Array.from(document.querySelectorAll('#t7-cal-trays .t7-tray-line'))
               .map(l => [l.getAttribute('data-tray'), l.querySelector('.t7-tray-adj').value])),
        [['T1', '-40'], ['T3', ''], ['T7', '']]);
  checkTrue('and the verdict says it adds up',
            /✓ the trays add up to -40/i.test(await page.textContent('#t7-tray-verdict')));
  check('the Qty box stays typable — it is the figure being corrected',
        await page.getAttribute('#t7-cal-qty', 'readonly'), null);

  console.log('\nThe total is checked against the adjustment quantity');
  await page.locator('#t7-cal-trays .t7-tray-line[data-tray="T3"] .t7-tray-adj').fill('-20');
  await page.waitForTimeout(150);
  const off = await page.textContent('#t7-tray-verdict');
  checkTrue('a mismatch is called out with the gap', /off by -20/i.test(off));
  checkTrue('…naming both figures', /add up to -60/i.test(off) && /adjustment is -40/i.test(off));
  check('the Qty box was NOT dragged along to hide the mismatch',
        await page.inputValue('#t7-cal-qty'), '-40');

  await page.evaluate(() => { window.__INSERTS = []; window.__UPDATES = []; window.__TOASTS = []; });
  await page.evaluate(() => window.saveCalibration());
  const blocked = await page.evaluate(() => ({
    ins: window.__INSERTS.length, upd: window.__UPDATES.length,
    toast: (window.__TOASTS.slice(-1)[0] || {}).m || '',
    type:  (window.__TOASTS.slice(-1)[0] || {}).t || ''
  }));
  check('a mismatched split cannot be saved', { ins: blocked.ins, upd: blocked.upd }, { ins: 0, upd: 0 });
  check('and it is an error', blocked.type, 'error');
  checkTrue('the message names both figures', /add up to -60/.test(blocked.toast) && /is -40/.test(blocked.toast));

  console.log('\nSplitting an existing row across trays');
  await page.locator('#t7-cal-trays .t7-tray-line[data-tray="T1"] .t7-tray-adj').fill('-25');
  await page.locator('#t7-cal-trays .t7-tray-line[data-tray="T3"] .t7-tray-adj').fill('-15');
  await page.waitForTimeout(150);
  checkTrue('the verdict turns green once they add up',
            /✓ the trays add up to -40/i.test(await page.textContent('#t7-tray-verdict')));
  checkTrue('and says how many rows it will become',
            /splits this into 2 rows/i.test(await page.textContent('#t7-tray-verdict')));

  await page.evaluate(() => { window.__INSERTS = []; window.__UPDATES = []; });
  await page.evaluate(() => window.saveCalibration());
  await page.waitForFunction(() => window.__UPDATES.length > 0, { timeout: 8000 });
  const split = await page.evaluate(() => ({ ins: window.__INSERTS, upd: window.__UPDATES }));
  check('the row being edited is updated, not deleted', split.upd.length, 1);
  check('…and keeps its id', split.upd[0].id, 'cal-1');
  check('…carrying the first tray\'s share', split.upd[0].row.quantity_change, -25);
  check('…and naming that tray', (split.upd[0].row.remark.match(/Tray:\s*([^.]+)\./) || [])[1], 'T1');
  check('the remaining tray is inserted beside it', split.ins.length, 1);
  check('…with its own share', split.ins[0].quantity_change, -15);
  check('…and its own tray', (split.ins[0].remark.match(/Tray:\s*([^.]+)\./) || [])[1], 'T3');
  check('the split still adds up to the adjustment',
        split.upd[0].row.quantity_change + split.ins[0].quantity_change, -40);
  check('no row carries an approval across the split',
        [split.upd[0].row.remark, split.ins[0].remark].some(r => /APPROVED by/.test(r)), false);

  console.log('\nAn edit that touches no tray stays one row');
  await page.evaluate(() => {
    window.__CAL_ROWS = [{
      id: 'cal-old', batch_name: '242', transaction_type: 'Stock_Calibration',
      plot_name: 'B14', quantity_change: -127, transaction_date: null,
      created_at: '2026-08-26T02:00:00Z', last_edited_by: null,
      remark: 'Report: Transplanting. Plot: B14. Stock calibration'
    }];
  });
  await page.evaluate(b => window.renderCalibrationHistory(b), BATCH);
  await page.waitForSelector('#t7-cal-history tr[data-cal-id="cal-old"]', { state: 'attached', timeout: 5000 });
  await page.evaluate(() => document.querySelector('#t7-cal-history tr[data-cal-id="cal-old"] button').click());
  await page.waitForSelector('#t7-cal-trays .t7-tray-adj', { timeout: 5000 });
  check('a row that names no tray starts with every box empty',
        await page.evaluate(() =>
          Array.from(document.querySelectorAll('#t7-cal-trays .t7-tray-adj')).map(i => i.value)),
        ['', '', '']);
  checkTrue('and the verdict says it is not split, rather than calling it wrong',
            /not split by tray/i.test(await page.textContent('#t7-tray-verdict')));
  checkTrue('…naming the figure that stays on the one record',
            /-127/.test(await page.textContent('#t7-tray-verdict')));

  await page.fill('#t7-cal-date', '2026-08-26');
  await page.evaluate(() => { window.__INSERTS = []; window.__UPDATES = []; });
  await page.evaluate(() => window.saveCalibration());
  await page.waitForFunction(() => window.__UPDATES.length > 0, { timeout: 8000 });
  const untouched = await page.evaluate(() => ({ ins: window.__INSERTS.length, upd: window.__UPDATES }));
  check('it saves as one row, with nothing inserted', untouched.ins, 0);
  check('…still the whole figure', untouched.upd[0].row.quantity_change, -127);
  check('…and still naming no tray', /Tray:/.test(untouched.upd[0].row.remark), false);

  if (process.env.SHOT) {
    // the edit view: an old -127 row being split across its trays
    await page.evaluate(() => document.querySelector('#t7-cal-history tr[data-cal-id="cal-old"] button')?.click());
    await page.waitForSelector('#t7-cal-trays .t7-tray-adj');
    await page.locator('#t7-cal-trays .t7-tray-line[data-tray="T1"] .t7-tray-adj').fill('-90');
    await page.waitForTimeout(150);
    await page.locator('#t7-cal-trays').screenshot({ path: '/tmp/tray_edit_off.png' });
    await page.locator('#t7-cal-trays .t7-tray-line[data-tray="T3"] .t7-tray-adj').fill('-37');
    await page.waitForTimeout(150);
    await page.locator('#t7-cal-trays').screenshot({ path: '/tmp/tray_edit_ok.png' });
    await page.evaluate(() => window.cancelEditCalibration());
    await setSelect(page,'#t7-cal-report', 'Transplanting');
    await setPlot(page, 'B14');
    await page.waitForSelector('#t7-cal-trays .t7-tray-line');
    await page.locator('#t7-cal-trays .t7-tray-line[data-tray="T1"] .t7-tray-adj').fill('-40');
    await page.locator('#t7-cal-trays .t7-tray-line[data-tray="T7"] .t7-tray-adj').fill('-13');
    await page.locator('#t7-cal-trays').screenshot({ path: '/tmp/tray_panel.png' });
  }
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
