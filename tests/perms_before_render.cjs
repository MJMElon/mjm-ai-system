/* What a person may do has to be known before the page is drawn.

   On a fresh open of a batch, the Adjustment History came up with its
   last column headed "Lock" and no Edit button on any row -- for an admin.
   Not because the permission was missing, but because it had not been read
   yet: MJMAccess.load() ran inside MJMReview.boot(), which is only reached
   after initDetail() has finished prewarming every tab, and every tab had
   already rendered as if nobody may do anything. It corrected itself the
   next time something was saved and the table was rebuilt, which is why it
   looked intermittent.

   The access stub here answers nothing until its load() resolves on a
   timer -- the shape of the real race. A page that renders first sees a
   locked screen; a page that waits sees the real one.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/perms_before_render.cjs
   with `python3 -m http.server 8777` serving the repository root.        */
const { chromium } = require('playwright');

const BATCH = '225';
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
const PLANTED_ROWS = [{ plot_name: 'P4', quantity_change: 2500 }];
const APPROVED = ' [APPROVED by esther@mjm on 2026-09-11T00:00:00Z]';
const TX_ROWS = [
  { id: 'tx-b7', transaction_type: 'Transplanted', plot_name: 'B7', quantity_change: 206,
    transaction_date: '2025-05-05', created_at: '2025-05-05T02:00:00Z',
    remark: 'Transplanted from tray [P4] to Main Plot [B7]. Date: 2025-05-05' },
  // a row an adjustment wrote — this is the one that offers Fix Tray
  { id: 'tx-n19', transaction_type: 'Transplanted', plot_name: 'N19', quantity_change: 0,
    transaction_date: '2026-09-11', created_at: '2026-09-11T02:00:00Z',
    remark: 'Transplanted from tray [P4] to Main Plot [N19]. Date: 2026-09-11 '
          + 'FromAdjustment:cal-n19 CalApprovedBy:esther@mjm' }
];
const CAL_ROWS = [
  { id: 'cal-n19', batch_name: BATCH, transaction_type: 'Stock_Calibration', plot_name: 'N19',
    quantity_change: 1, transaction_date: '2026-09-11', created_at: '2026-09-11T02:00:00Z',
    last_edited_by: null,
    remark: 'Report: Transplanting. Plot: N19. Found 1 more seedling when process 2nd culling. '
          + 'TxTray:P4. TxRow:tx-n19' + APPROVED },
  // a pending one, for the Edit / Del / Approve trio
  { id: 'cal-pending', batch_name: BATCH, transaction_type: 'Stock_Calibration', plot_name: 'B7',
    quantity_change: -5, transaction_date: '2026-09-12', created_at: '2026-09-12T02:00:00Z',
    last_edited_by: null,
    remark: 'Report: 1st Culling. Plot: B7. Recount' },
  // approved, on a plot with no row and no TxTray — the orphan line
  { id: 'cal-orphan', batch_name: BATCH, transaction_type: 'Stock_Calibration', plot_name: 'U7',
    quantity_change: 60, transaction_date: '2026-09-12', created_at: '2026-09-12T02:00:00Z',
    last_edited_by: null,
    remark: 'Report: Transplanting. Plot: U7. Move to U7. TxTray:P4.' + APPROVED }
];

function accessStub(allowed) {
  return `
    (function () {
      let ready = false;
      // Resolves on a timer: nothing is known until it does. That is the race.
      const loaded = new Promise(r => setTimeout(() => { ready = true; r(true); }, 300));
      window.__ACCESS_READY = () => ready;
      window.MJMAccess = {
        load: () => loaded,
        user: () => ({ id: 'u1', email: 'elon@mjm', full_name: 'Elon' }),
        perms: () => ({}), profile: () => ({}), normalize: (x) => x || {},
        canAccess: () => true,
        canOpenOperationPage: () => true,
        canScan: () => true, canScanArea: () => true,
        isAdminOf: () => ready && ${allowed},
        canDoOperation: (page, action) => {
          if (!ready) return false;          // not read yet — nothing is allowed
          if (action === 'view' || action === 'fill_report') return true;
          return ${allowed};
        },
        guard: () => true
      };
    })();`;
}

async function open(browser, { allowed = true, failLoad = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', e => { if (!/MJMReview/.test(e.message)) console.log('  [page error] ' + e.message); });

  await page.addInitScript(({ seedsRow, txRows, calRows, plantedRows }) => {
    window.__SEEDS_ROWS = [seedsRow];
    window.__TX_ROWS = txRows;
    window.__CAL_ROWS = calRows;
    window.__PLANTED_ROWS = plantedRows;
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
        if (p === 'maybeSingle' || p === 'single')
          return () => Promise.resolve({ data: rows()[0] || null, error: null });
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'elon@mjm' };
    window.supabase = { createClient: () => ({
      from: makeQuery, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      storage: { from: () => ({ upload: async () => ({ data: {}, error: null }),
                                getPublicUrl: () => ({ data: { publicUrl: '' } }),
                                remove: async () => ({ error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, { seedsRow: SEEDS_ROW, txRows: TX_ROWS, calRows: CAL_ROWS, plantedRows: PLANTED_ROWS });

  const body = failLoad
    ? `window.MJMAccess = { load: () => Promise.reject(new Error('offline')),
         user: () => ({ email: 'elon@mjm' }), perms: () => ({}), profile: () => ({}),
         normalize: (x) => x || {}, canAccess: () => true, canOpenOperationPage: () => true,
         canScan: () => true, canScanArea: () => true, isAdminOf: () => false,
         canDoOperation: (p, a) => a === 'view' || a === 'fill_report', guard: () => true };`
    : accessStub(allowed);
  await page.route('**/shared_access.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript', body }));
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/cdn.jsdelivr.net/**',    r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**',     r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/operation/operation_batch_detail.html?id=' + BATCH,
                  { waitUntil: 'load' });
  // A FRESH open: nothing saved, nothing approved, no second render.
  await page.waitForSelector('#t7-cal-history table', { state: 'attached', timeout: 15000 });
  return page;
}

const read = page => page.evaluate(() => {
  const ths = Array.from(document.querySelectorAll('#t7-cal-history th'));
  const rowHtml = id => {
    const tr = document.querySelector(`#t7-cal-history tr[data-cal-id="${id}"]`);
    return tr ? tr.lastElementChild.innerHTML : '';
  };
  const t3 = document.querySelector('#t3-saved-rows-list .t3-saved-row:last-child');
  return {
    lastHeader: ths.length ? ths[ths.length - 1].textContent.trim() : '(none)',
    approvedRow: rowHtml('cal-n19'),
    pendingRow:  rowHtml('cal-pending'),
    t3Cell: t3 ? t3.querySelector('[id^="t3-row-view-"]').lastElementChild.innerHTML : '',
    note: (document.getElementById('t3-saved-adj-note') || {}).innerHTML || ''
  };
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nA fresh open, for somebody who may review');
  const page = await open(browser, { allowed: true });
  checkTrue('the permissions really were read before the render',
            await page.evaluate(() => window.__ACCESS_READY()));
  const admin = await read(page);
  check('the last column is headed Actions, not Lock', admin.lastHeader, 'Actions');
  checkTrue('an approved adjustment carries its Edit button', /editCalibration\(/.test(admin.approvedRow));
  checkTrue('a pending one carries Edit', /editCalibration\(/.test(admin.pendingRow));
  checkTrue('…and Del', /deleteCalibration\(/.test(admin.pendingRow));
  checkTrue('…and Approve', /approveCalibration\(/.test(admin.pendingRow));
  checkTrue('Fix Tray shows on the row an adjustment wrote',
            /toggleT3AdjTray\(/.test(admin.t3Cell));
  checkTrue('the orphan line offers to write its row',
            /rebuildTxRow\(/.test(admin.note));
  await page.close();

  console.log('\nThe gate still gates');
  const locked = await open(browser, { allowed: false });
  const plain = await read(locked);
  check('somebody who may not review sees Lock', plain.lastHeader, 'Lock');
  check('…no Edit on an approved row', /editCalibration\(/.test(plain.approvedRow), false);
  check('…no Del on a pending one', /deleteCalibration\(/.test(plain.pendingRow), false);
  check('…no Fix Tray', /toggleT3AdjTray\(/.test(plain.t3Cell), false);
  check('…and no offer to write a row', /rebuildTxRow\(/.test(plain.note), false);
  await locked.close();

  console.log('\nAnd a failure to read them does not take the page down');
  const broken = await open(browser, { failLoad: true });
  const after = await read(broken);
  checkTrue('the page still rendered', await broken.evaluate(() =>
    !!document.querySelector('#t7-cal-history table')));
  check('…locked rather than blank', after.lastHeader, 'Lock');
  checkTrue('…and the batch is still on screen', await broken.evaluate(() =>
    (document.getElementById('window-title') || {}).textContent || '').then(t => /225/.test(t)));
  await broken.close();

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
