/* The adjustment lands on the transplant row it was split out of.

   A Transplanting adjustment is raised against a plot and split across the
   trays that filled it, and the saved list below is one row per tray into
   one plot — so each share belongs on exactly one of those rows. Before
   this, the strip at the top of the tab said -127 while the list under it
   went on showing the pre-adjustment figures, on the same screen.

   What this drives, on the real tab 3 list:
     · each row shows the approved adjustment matching its plot AND its
       tray, and a Final Qty of its own
     · rows nothing was raised against read "—" and are left alone
     · a PENDING adjustment moves nothing — it has not been ruled on
     · an adjustment on another report does not leak in
     · Premium Care and D-Tone rows are outside the Total, as they already
       were, but still show their own figures
     · the Total row carries Total Adjustment and Final, and the Final is
       the Total plus the adjustments
     · an approved adjustment matching no row is still in the Total and is
       named underneath, so the Total is never short by an unexplained
       amount

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/t3_row_adjustments.cjs
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

/* B11 was filled from P45, P49 and P50. B4 from P51 — nothing is raised
   against it. There is also a Premium Care holding row, which the Total
   has never counted. */
const TX_ROWS = [
  { id: 'tx1', transaction_type: 'Transplanted', plot_name: 'B11', quantity_change: 2478,
    transaction_date: '2026-07-24', created_at: '2026-07-24T02:00:00Z',
    remark: 'Transplanted from tray [P45] to Main Plot [B11]. Date: 2026-07-24' },
  { id: 'tx2', transaction_type: 'Transplanted', plot_name: 'B11', quantity_change: 2352,
    transaction_date: '2026-07-24', created_at: '2026-07-24T02:00:00Z',
    remark: 'Transplanted from tray [P49] to Main Plot [B11]. Date: 2026-07-24' },
  { id: 'tx3', transaction_type: 'Transplanted', plot_name: 'B11', quantity_change: 2286,
    transaction_date: '2026-07-20', created_at: '2026-07-20T02:00:00Z',
    remark: 'Transplanted from tray [P50] to Main Plot [B11]. Date: 2026-07-20' },
  { id: 'tx4', transaction_type: 'Transplanted', plot_name: 'B4', quantity_change: 1000,
    transaction_date: '2026-07-24', created_at: '2026-07-24T02:00:00Z',
    remark: 'Transplanted from tray [P51] to Main Plot [B4]. Date: 2026-07-24' },
  { id: 'tx5', transaction_type: 'Transplanted_Premium', plot_name: 'PREMIUM CARE', quantity_change: 171,
    transaction_date: '2026-07-24', created_at: '2026-07-24T02:00:00Z',
    remark: 'Moved from tray [P45] to PREMIUM CARE tray. Date: 2026-07-24' }
];

const APPROVED = ' [APPROVED by coco@mjm on 2026-08-26T00:00:00Z]';
const CAL_ROWS = [
  // the -127 on B11, split across its three trays
  { id: 'c1', batch_name: BATCH, transaction_type: 'Stock_Calibration', plot_name: 'B11',
    quantity_change: -42, transaction_date: '2026-07-24', created_at: '2026-08-26T02:00:00Z',
    remark: 'Report: Transplanting. Plot: B11. Tray: P45. Stock calibration' + APPROVED },
  { id: 'c2', batch_name: BATCH, transaction_type: 'Stock_Calibration', plot_name: 'B11',
    quantity_change: -45, transaction_date: '2026-07-24', created_at: '2026-08-26T02:00:00Z',
    remark: 'Report: Transplanting. Plot: B11. Tray: P49. Stock calibration' + APPROVED },
  { id: 'c3', batch_name: BATCH, transaction_type: 'Stock_Calibration', plot_name: 'B11',
    quantity_change: -40, transaction_date: '2026-07-20', created_at: '2026-08-26T02:00:00Z',
    remark: 'Report: Transplanting. Plot: B11. Tray: P50. Stock calibration' + APPROVED },
  // nobody has ruled on this one — it must move nothing
  { id: 'c4', batch_name: BATCH, transaction_type: 'Stock_Calibration', plot_name: 'B4',
    quantity_change: -500, transaction_date: '2026-07-24', created_at: '2026-08-26T02:00:00Z',
    remark: 'Report: Transplanting. Plot: B4. Tray: P51. Not approved yet' },
  // another report — it belongs to 1st Culling, not here
  { id: 'c5', batch_name: BATCH, transaction_type: 'Stock_Calibration', plot_name: 'B4',
    quantity_change: -7, transaction_date: '2026-08-01', created_at: '2026-08-26T02:00:00Z',
    remark: 'Report: 1st Culling. Plot: B4. Tray: P51. Culled short' + APPROVED },
  // approved, on a plot, naming no tray — matches no row
  { id: 'c6', batch_name: BATCH, transaction_type: 'Stock_Calibration', plot_name: 'B4',
    quantity_change: -13, transaction_date: '2026-07-24', created_at: '2026-08-26T02:00:00Z',
    remark: 'Report: Transplanting. Plot: B4. Old style, no tray' + APPROVED }
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', e => { if (!/MJMReview/.test(e.message)) console.log('  [page error] ' + e.message); });

  await page.addInitScript(({ seedsRow, txRows, calRows }) => {
    window.__SEEDS_ROWS = [seedsRow];
    window.__TX_ROWS = txRows;
    window.__CAL_ROWS = calRows;

    function makeQuery() {
      const st = { filters: {}, types: null };
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
          if (prop === 'eq') return (col, val) => { st.filters[col] = val; return q; };
          if (prop === 'insert' || prop === 'update') return () => q;
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
  }, { seedsRow: SEEDS_ROW, txRows: TX_ROWS, calRows: CAL_ROWS });

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
  await page.waitForFunction(() => typeof window.paintT3Adjustments === 'function'
                                && typeof window.syncAdjustmentBars === 'function', { timeout: 15000 });
  // The saved list is drawn by the tab's own loader; wait for its rows.
  await page.waitForSelector('#t3-saved-rows-list .t3-adj-cell', { state: 'attached', timeout: 15000 });
  await page.evaluate(b => window.syncAdjustmentBars(b), BATCH);
  await page.waitForTimeout(400);

  const read = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#t3-saved-rows-list .t3-adj-cell')).map(c => ({
      plot:  c.getAttribute('data-plot'),
      tray:  c.getAttribute('data-tray'),
      qty:   c.getAttribute('data-qty'),
      adj:   c.innerText.trim(),
      final: c.parentElement.querySelector('.t3-final-cell').innerText.trim()
    })));

  console.log('\nEach row carries its own share');
  const rows = await read();
  check('every saved row has an Adjustment and a Final Qty', rows.length, 5);
  check('B11 ← P45', rows[0], { plot: 'B11', tray: 'P45', qty: '2478', adj: '-42', final: '2,436' });
  check('B11 ← P49', rows[1], { plot: 'B11', tray: 'P49', qty: '2352', adj: '-45', final: '2,307' });
  check('B11 ← P50', rows[2], { plot: 'B11', tray: 'P50', qty: '2286', adj: '-40', final: '2,246' });
  check('the three shares add up to the -127 on the strip',
        [-42, -45, -40].reduce((a, b) => a + b, 0), -127);

  console.log('\nWhat must NOT land on a row');
  check('a row nothing was raised against reads "—" and keeps its figure',
        rows[3], { plot: 'B4', tray: 'P51', qty: '1000', adj: '—', final: '1,000' });
  checkTrue('…so the unapproved -500 on that very row moved nothing',
            rows[3].adj === '—' && rows[3].final === '1,000');
  checkTrue('…and neither did the 1st Culling one on the same plot and tray',
            !/-7/.test(rows[3].adj));
  check('the Premium Care holding row shows its own figures',
        rows[4], { plot: 'PREMIUM CARE', tray: 'P45', qty: '171', adj: '—', final: '171' });

  console.log('\nThe Total carries it too');
  const totals = await page.evaluate(() => ({
    qty:   document.getElementById('t3-saved-total-qty').innerText.trim(),
    adj:   document.getElementById('t3-saved-total-adj').innerText.trim(),
    final: document.getElementById('t3-saved-total-final').innerText.trim(),
    note:  document.getElementById('t3-saved-adj-note').innerText.trim(),
    noteHidden: document.getElementById('t3-saved-adj-note').classList.contains('hidden')
  }));
  // 2478 + 2352 + 2286 + 1000 = 8116; Premium Care is not counted, as before
  check('Total Transplanted is unchanged', totals.qty, '8,116');
  // -127 on B11's three rows, plus the -13 that matches no row
  check('Total Adjustment is every approved one on this report', totals.adj, '-140');
  check('Final is the total plus the adjustments', totals.final, '7,976');

  console.log('\nAn adjustment that matches no row is still accounted for');
  check('the note is shown', totals.noteHidden, false);
  checkTrue('it names the amount', /-13/.test(totals.note));
  checkTrue('and where it was raised', /B4/.test(totals.note));
  checkTrue('and says it IS in the total', /included in the total/i.test(totals.note));

  console.log('\nApproving changes what the rows show');
  await page.evaluate(() => {
    // rule on the -500 that was pending
    window.__CAL_ROWS = window.__CAL_ROWS.map(r => r.id === 'c4'
      ? Object.assign({}, r, { remark: r.remark + ' [APPROVED by coco@mjm on 2026-09-01T00:00:00Z]' })
      : r);
  });
  await page.evaluate(b => window.syncAdjustmentBars(b), BATCH);
  await page.waitForTimeout(400);
  const after = await read();
  check('the row it names now shows it',
        after[3], { plot: 'B4', tray: 'P51', qty: '1000', adj: '-500', final: '500' });
  check('and the Total follows',
        await page.evaluate(() => ({
          adj:   document.getElementById('t3-saved-total-adj').innerText.trim(),
          final: document.getElementById('t3-saved-total-final').innerText.trim()
        })),
        { adj: '-640', final: '7,476' });
  check('the untouched rows did not move', after.slice(0, 3).map(r => r.final),
        ['2,436', '2,307', '2,246']);

  console.log('\nA row written by an adjustment: Qty 0, Adjustment +140, Final 140');
  /* B8 had no transplanting record at all. Approving the adjustment wrote one
     with a quantity of NOUGHT — nobody keyed a transplant there — so the 140
     stays where it actually came from, in the Adjustment column. */
  // First the orphan state: the adjustment exists, the plot has no row.
  await page.evaluate(() => {
    window.__CAL_ROWS = window.__CAL_ROWS.concat([{
      id: 'cal-b8', batch_name: '242', transaction_type: 'Stock_Calibration',
      plot_name: 'B8', quantity_change: 140, transaction_date: '2026-06-20',
      created_at: '2026-06-20T02:00:00Z', last_edited_by: null,
      remark: 'Report: Transplanting. Plot: B8. Move to B8. TxTray:P4. '
            + 'TxMap:https://x/map.jpg TxRow:tx-b8'
            + ' [APPROVED by esther@mjm on 2026-06-21T00:00:00Z]'
    }]);
  });
  const num = t => Number(String(t).replace(/[^0-9-]/g, '')) || 0;
  await page.evaluate(b => window.syncAdjustmentBars(b), BATCH);
  await page.waitForTimeout(400);
  const beforeTotals = await page.evaluate(() => ({
    qty: document.getElementById('t3-saved-total-qty').innerText.trim(),
    adj: document.getElementById('t3-saved-total-adj').innerText.trim(),
    note: document.getElementById('t3-saved-adj-note').innerText
  }));
  // …then approval writes the row, with a quantity of nought.
  await page.evaluate(() => {
    window.__TX_ROWS = window.__TX_ROWS.concat([{
      id: 'tx-b8', transaction_type: 'Transplanted', plot_name: 'B8', quantity_change: 0,
      transaction_date: '2026-06-20', created_at: '2026-06-20T02:00:00Z',
      remark: 'Transplanted from tray [P4] to Main Plot [B8]. Date: 2026-06-20 '
            + 'MapUrl:https://x/map.jpg FromAdjustment:cal-b8 CalApprovedBy:esther@mjm'
    }]);
  });
  await page.evaluate(b => window.syncTab3 && window.syncTab3(), BATCH);
  await page.waitForSelector('#t3-saved-rows-list .t3-adj-cell[data-plot="B8"]',
                             { state: 'attached', timeout: 8000 });
  await page.evaluate(b => window.syncAdjustmentBars(b), BATCH);
  await page.waitForTimeout(400);

  const b8 = await page.evaluate(() => {
    const c = document.querySelector('#t3-saved-rows-list .t3-adj-cell[data-plot="B8"]');
    return {
      tray:  c.getAttribute('data-tray'),
      qty:   c.getAttribute('data-qty'),
      adj:   c.innerText.trim(),
      final: c.parentElement.querySelector('.t3-final-cell').innerText.trim()
    };
  });
  check('B8 now has a row, and it is not claiming a transplant nobody keyed',
        b8, { tray: 'P4', qty: '0', adj: '+140', final: '140' });

  const afterTotals = await page.evaluate(() => ({
    qty:  document.getElementById('t3-saved-total-qty').innerText.trim(),
    adj:  document.getElementById('t3-saved-total-adj').innerText.trim(),
    note: document.getElementById('t3-saved-adj-note').innerText
  }));
  check('Total Transplanted is unchanged — the new row adds nothing to it',
        afterTotals.qty, beforeTotals.qty);
  /* The total does NOT jump when the row appears. The +140 was already in it,
     as the orphan line said; writing the row only moves it from that line onto
     a row of its own. A total that moved would mean it was being counted
     twice, or had stopped being counted at all. */
  check('Total Adjustment does not move — the +140 was already in it',
        num(afterTotals.adj) - num(beforeTotals.adj), 0);
  checkTrue('and it is still in it', num(afterTotals.adj) !== 0);
  // The fixture keeps another orphan (-13 on B4, no tray), so the note stays —
  // but B8 must have left it, because B8 now has a row.
  checkTrue('B8 was in the "not on any row above" note before',
            /B8/.test(beforeTotals.note));
  check('…and is not any more', /B8/.test(afterTotals.note), false);

  console.log('\nThe columns line up');
  /* Tailwind's CDN is blocked here, so `md:grid grid-cols-[...]` applies
     nothing and a computed grid-template-columns would be "none" for all
     three — a comparison that passes by being vacuous. Read the track lists
     out of the markup instead, which is what has to agree. */
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'operation',
                                                   'operation_batch_detail.html'), 'utf8');
  // The saved list's own grid: the one whose last track is the 80px
  // actions column AND whose first is a fraction (the others with an 80px
  // in them are different tables).
  const tracks = (src.match(/grid-cols-\[[^\]]+\]/g) || [])
    .filter(t => /^grid-cols-\[[\d.]+fr_.*_80px\]$/.test(t));
  check('header, rows and total all carry a track list', tracks.length >= 3, true);
  check('and it is the same one everywhere', Array.from(new Set(tracks)).length, 1);
  check('with eight columns', tracks[0].replace(/grid-cols-\[|\]/g, '').split('_').length, 8);
  check('the two new ones are Adjustment and Final Qty',
        /<span class="text-\[#a83020\]">Adjustment<\/span>/.test(src)
          && /<span class="text-\[#4a7a2e\]">Final Qty<\/span>/.test(src), true);

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
