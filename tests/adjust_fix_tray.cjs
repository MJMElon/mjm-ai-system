/* The tray on a row an adjustment wrote can be corrected.

   A row written by an approved adjustment is otherwise locked -- its
   plot, date and quantity belong to the adjustment, and editing them
   here would put the two out of step. But the TRAY is not the
   adjustment's figure, it is an answer somebody typed, and B8's was
   keyed as "4" when the tray is P4. With the row locked outright there
   was no way to correct that from anywhere.

   Fix Tray changes it on BOTH records, because paintT3Adjustments pairs
   them on plot + tray: a row saying P4 beside an adjustment saying 4
   pairs with nothing, and the plot goes back to reading as an orphan.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/adjust_fix_tray.cjs
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

const SEEDS_ROW = {
  id: 'sr-1', batch_name: BATCH, transaction_type: 'Seeds_Received',
  breed_name: 'AA HYBRIDA 1S', quantity_change: 10000, plot_name: 'Pre-Nursery',
  transaction_date: '2025-01-05', created_at: '2025-01-05T02:00:00.000Z',
  workers: 4, remark: 'Supplier: AAR. MPOB: 123-456'
};
/* THE REAL SHAPE OF BATCH 227. Its planting report names the trays 4 and 5;
   every one of its transplant rows names them P4 and P5. The picker was built
   from the planting names only, so "4" was the only thing on offer -- which is
   how B8's tray came to be recorded as 4 in the first place. P4 is also fully
   transplanted out, so the spent-tray filter would hide it even by its own
   name. */
const PLANTED_ROWS = [
  { plot_name: '4', quantity_change: 0 },      // spent: everything went out
  { plot_name: '5', quantity_change: 2800 }
];
const APPROVED = ' [APPROVED by esther@mjm on 2026-06-21T00:00:00Z]';
// The row B8 got, with the tray mistyped as "4".
const TX_ROWS = [
  { id: 'tx-b7a', transaction_type: 'Transplanted', plot_name: 'B7', quantity_change: 206,
    transaction_date: '2025-05-05', created_at: '2025-05-05T02:00:00Z',
    remark: 'Transplanted from tray [P4] to Main Plot [B7]. Date: 2025-05-05' },
  { id: 'tx-b7b', transaction_type: 'Transplanted', plot_name: 'B7', quantity_change: 2288,
    transaction_date: '2025-05-05', created_at: '2025-05-05T02:00:00Z',
    remark: 'Transplanted from tray [P5] to Main Plot [B7]. Date: 2025-05-05' },
  { id: 'tx-b8', transaction_type: 'Transplanted', plot_name: 'B8', quantity_change: 0,
    transaction_date: '2026-06-20', created_at: '2026-06-20T02:00:00Z',
    remark: 'Transplanted from tray [4] to Main Plot [B8]. Date: 2026-06-20 '
          + 'MapUrl:https://files.test/map.jpg FromAdjustment:cal-b8 CalApprovedBy:esther@mjm' }
];
const CAL_ROWS = [
  { id: 'cal-b8', batch_name: BATCH, transaction_type: 'Stock_Calibration', plot_name: 'B8',
    quantity_change: 140, transaction_date: '2026-06-20', created_at: '2026-06-20T02:00:00Z',
    last_edited_by: null,
    remark: 'Report: Transplanting. Plot: B8. Move to B8. TxTray:4. '
          + 'TxMap:https://files.test/map.jpg TxRow:tx-b8' + APPROVED }
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', e => { if (!/MJMReview/.test(e.message)) console.log('  [page error] ' + e.message); });

  await page.addInitScript(({ seedsRow, txRows, calRows, plantedRows }) => {
    window.__UPDATES = []; window.__TOASTS = [];
    window.__SEEDS_ROWS = [seedsRow];
    window.__TX_ROWS = txRows.map(r => Object.assign({}, r));
    window.__CAL_ROWS = calRows.map(r => Object.assign({}, r));
    window.__PLANTED_ROWS = plantedRows;

    function makeQuery() {
      const st = { filters: {}, types: null, upd: null };
      const all = () => window.__TX_ROWS.concat(window.__CAL_ROWS);
      const rows = () => {
        if (st.filters.id) return all().filter(r => r.id === st.filters.id);
        if (st.filters.transaction_type === 'Stock_Calibration') return window.__CAL_ROWS;
        if (st.filters.transaction_type === 'Seeds_Received')    return window.__SEEDS_ROWS;
        if (st.filters.transaction_type === 'Planted')           return window.__PLANTED_ROWS;
        if (st.types && st.types.indexOf('Transplanted') >= 0)   return window.__TX_ROWS;
        return [];
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve({ data: rows(), error: null }).then(a, b);
        if (p === 'in') return (c, v) => { if (c === 'transaction_type') st.types = v; return q; };
        if (p === 'update') return r => { st.upd = r; return q; };
        if (p === 'eq') return (c, v) => {
          if (st.upd) {
            window.__UPDATES.push({ id: v, row: st.upd });
            // keep the stub's own data in step, so a re-render shows the change
            all().forEach(r => { if (r.id === v) Object.assign(r, st.upd); });
            st.upd = null;
            return Promise.resolve({ data: [], error: null });
          }
          st.filters[c] = v; return q;
        };
        if (p === 'maybeSingle' || p === 'single')
          return () => Promise.resolve({ data: rows()[0] || null, error: null });
        if (p === 'insert') return () => q;
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
  }, { seedsRow: SEEDS_ROW, txRows: TX_ROWS, calRows: CAL_ROWS, plantedRows: PLANTED_ROWS });

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
  await page.waitForFunction(() => typeof window.saveT3AdjTray === 'function', { timeout: 15000 });
  await page.evaluate(() => {
    window._t7IsAdmin = () => true;
    window.mjmLoadNames = async () => {};
    window.mjmWho = (e) => String(e || '').split('@')[0] || '—';
    window.showToast = (m, t) => { window.__TOASTS.push({ m, t }); };
    window.syncAdjustmentBars = async () => {};
  });
  await page.waitForSelector('#t3-saved-rows-list .t3-adj-cell[data-plot="B8"]',
                             { state: 'attached', timeout: 10000 });

  const b8Index = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#t3-saved-rows-list .t3-adj-cell'))
         .findIndex(c => c.getAttribute('data-plot') === 'B8'));

  console.log('\nThe row is locked, except for the tray');
  const cell = await page.evaluate(i => {
    const row = document.querySelectorAll('#t3-saved-rows-list .t3-saved-row')[i];
    /* innerHTML with the <br>s turned into spaces, not innerText: tab 3 is
       not the open tab here so innerText returns '' for it, and textContent
       runs the lines together across the <br>s. */
    return row.querySelector('[id^="t3-row-view-"]').lastElementChild.innerHTML
              .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ').trim();
  }, b8Index);
  checkTrue('it still says whose approval put it there', /calibration approved by/i.test(cell));
  checkTrue('and offers Fix Tray', /fix tray/i.test(cell));
  check('but no Edit or Del', /\bedit\b|\bdel\b/i.test(cell.replace(/fix tray/i, '')), false);
  check('the tray currently reads as it was mistyped',
        await page.evaluate(i => document.querySelectorAll('#t3-saved-rows-list .t3-adj-cell')[i]
                                        .getAttribute('data-tray'), b8Index), '4');

  console.log('\nOpening it starts on what the row says now');
  await page.evaluate(i => window.toggleT3AdjTray(i), b8Index);
  await page.waitForTimeout(250);
  const form = `#t3-adjtray-form-${b8Index}`;
  check('the form is open', await page.evaluate(s => !document.querySelector(s).classList.contains('hidden'), form), true);
  check('…starting on the tray the row names, even though it is not a real one',
        await page.evaluate(s => document.querySelector(s + ' .t3-adjtray-select').value, form), '4');
  const offered = await page.evaluate(s =>
    Array.from(document.querySelectorAll(s + ' .t3-adjtray-select option')).map(o => o.value), form);
  checkTrue('the tray the transplanting records actually use is on offer',
            offered.indexOf('P4') >= 0);
  checkTrue('…and so is P5', offered.indexOf('P5') >= 0);
  checkTrue('the planting report\'s own names are still there too',
            offered.indexOf('4') >= 0 && offered.indexOf('5') >= 0);
  check('a spent tray is not hidden — it is exactly the answer being asked for',
        offered.indexOf('4') >= 0, true);
  check('nothing is offered twice',
        offered.length, Array.from(new Set(offered)).length);
  check('the picker is left native so the card cannot clip it',
        await page.evaluate(s => document.querySelector(s + ' .t3-adjtray-select').classList.contains('cf-skip'), form), true);

  console.log('\nSaving corrects both records');
  await page.evaluate(s => {
    const sel = document.querySelector(s + ' .t3-adjtray-select');
    sel.value = 'P4';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, form);
  await page.evaluate(() => { window.__UPDATES = []; window.__TOASTS = []; });
  await page.evaluate(i => window.saveT3AdjTray(i), b8Index);
  await page.waitForFunction(() => window.__UPDATES.length >= 2, { timeout: 8000 });
  const ups = await page.evaluate(() => window.__UPDATES);

  const rowUp = ups.find(u => u.id === 'tx-b8');
  const calUp = ups.find(u => u.id === 'cal-b8');
  checkTrue('the transplanting row was updated', !!rowUp);
  checkTrue('…and so was the adjustment that wrote it', !!calUp);
  checkTrue('the row now names P4', /from tray \[P4\] to Main Plot \[B8\]/.test(rowUp.row.remark));
  check('…and nothing else on it moved', {
    date: /Date: 2026-06-20/.test(rowUp.row.remark),
    map:  /MapUrl:https:\/\/files\.test\/map\.jpg/.test(rowUp.row.remark),
    from: /FromAdjustment:cal-b8/.test(rowUp.row.remark),
    who:  /CalApprovedBy:esther@mjm/.test(rowUp.row.remark)
  }, { date: true, map: true, from: true, who: true });
  check('the row keeps its quantity of nought', rowUp.row.quantity_change, undefined);

  checkTrue('the adjustment now names P4', /TxTray:P4\./.test(calUp.row.remark));
  check('…and keeps its approval', /\[APPROVED by esther@mjm/.test(calUp.row.remark), true);
  check('…and its link to the row', /TxRow:tx-b8/.test(calUp.row.remark), true);
  check('…and its reason', /Move to B8/.test(calUp.row.remark), true);

  console.log('\nThe two still pair up, which is the point');
  const paired = await page.evaluate(() => {
    const row = window._parseCalibration({ id: 'cal-b8', quantity_change: 140,
      remark: window.__CAL_ROWS.find(r => r.id === 'cal-b8').remark });
    const b8Row = window.__TX_ROWS.find(r => r.id === 'tx-b8');
    const txTray = (b8Row.remark.match(/tray \[([^\]]+)\]/) || [])[1];
    return { calTray: row.tray || row.txTray, rowTray: txTray };
  });
  check('the adjustment and its row name the same tray',
        paired.calTray, paired.rowTray);
  check('…and it is the right one', paired.rowTray, 'P4');

  console.log('\nRefusals');
  await page.evaluate(i => window.toggleT3AdjTray(i), b8Index);
  await page.evaluate(s => { document.querySelector(s + ' .t3-adjtray-select').value = ''; }, form);
  await page.evaluate(() => { window.__UPDATES = []; window.__TOASTS = []; });
  await page.evaluate(i => window.saveT3AdjTray(i), b8Index);
  await page.waitForTimeout(250);
  const refused = await page.evaluate(() => ({
    ups: window.__UPDATES.length, t: window.__TOASTS.slice(-1)[0] || {} }));
  check('no tray means nothing is written', refused.ups, 0);
  check('and it is an error', refused.t.t, 'error');

  await page.evaluate(() => { window._t7IsAdmin = () => false; window.__UPDATES = []; window.__TOASTS = []; });
  await page.evaluate(s => { document.querySelector(s + ' .t3-adjtray-select').value = 'P5'; }, form);
  await page.evaluate(i => window.saveT3AdjTray(i), b8Index);
  await page.waitForTimeout(250);
  check('a non-admin cannot change it',
        await page.evaluate(() => window.__UPDATES.length), 0);

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
