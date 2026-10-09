/* THE TWO LISTS AGREE ABOUT WHICH BATCHES ARE COMPLETED.

   The Batch Record list and Life of Seedlings used to answer that question
   differently — the first asked whether every plot had been 3rd culled,
   proofed against its drone map and signed off, the second whether its own
   arithmetic came to nought. A batch could sit in Completed on one screen
   and Active on the other.

   The rule is shared/shared_batch_completed.js now, and
   tests/batch_completed_one_rule.cjs holds the RULE to its cases. This
   file is the other half: it drives BOTH REAL PAGES against ONE ledger in
   a real browser and compares what they show. A shared rule called with
   the wrong rows is two answers again, and only this catches that — it is
   how we found Life of Seedlings taking its row sign-offs out of a query
   that does not ask for them, which left the row-by-row route dead.

   122 is finished: its plot and the plot its transfer landed in are both
   culled to their drone maps and both signed. 123 is not — its 3rd culling
   is keyed and nobody has signed it. 121's culling is signed but the plot
   its transfer landed in has no record. 099 never left the tray.

   Needs a browser and a server on the page:
     (cd .. && python3 -m http.server 8812 &)
     NODE_PATH=/opt/node22/lib/node_modules node tests/both_lists_agree_on_completed.cjs */
const { chromium } = require('playwright');

(async () => {
const B = 'http://127.0.0.1:8812';
let bad = 0;
const is = (g, w, what) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a !== b) { console.log('  FAIL', what, '\n        got ', a, '\n        want', b); bad++; }
  else console.log('  ok  ', what, '→', a);
};

// ── The ledger ────────────────────────────────────────────────────────────
const L = []; let id = 0;
const log = (o) => { L.push({ id: ++id, ...o }); };
const RV  = (batch, key) => ({ id: ++id, batch_name: batch,
  transaction_type: 'Row_Verification', plot_name: key, quantity_change: 0 });

/* 123 — the mixed case. Seed in and planting signed as whole tabs.
   Transplanting has TWO rows (B1 and the double-tone tray) and only B1 is
   signed → part verified. 1st culling unsigned. 2nd culling signed per row.
   3rd culling unsigned. */
log({ batch_name: '123', breed_name: 'AA Hybrida 1S', transaction_type: 'Seeds_Received',
      transaction_date: '2026-09-20', plot_name: 'Pre-Nursery', quantity_change: 10700,
      remark: 'Seeds received. Supplier: AAR. MPOB: 549080-021000. D/O: DO-7781. DO_Qty: 10000. Incl. 7% FOC.' });
log({ batch_name: '123', transaction_type: 'Damaged_Seeds', transaction_date: '2026-09-22', plot_name: 'P1', quantity_change: -71 });
log({ batch_name: '123', transaction_type: 'Planted', transaction_date: '2026-09-23', plot_name: 'P1', quantity_change: 10617 });
log({ batch_name: '123', transaction_type: '1st_Culling', transaction_date: '2026-11-02', plot_name: 'P1', quantity_change: -749 });
log({ batch_name: '123', transaction_type: 'Transplanted', transaction_date: '2026-11-05', plot_name: 'B1', quantity_change: 9772, remark: 'from tray [P1] Date: 2026-11-05' });
// A second plot, UNSIGNED — so Transplanting Qty is PART verified.
log({ batch_name: '123', transaction_type: 'Transplanted', transaction_date: '2026-11-06', plot_name: 'B7', quantity_change: 300, remark: 'from tray [P1] Date: 2026-11-06' });
log({ batch_name: '123', transaction_type: 'Transplanted_DoubleTone', transaction_date: '2026-11-05', plot_name: 'DOUBLE-TONE', quantity_change: 96, remark: 'from tray [P1] Date: 2026-11-05' });
log({ batch_name: '123', transaction_type: '2nd_Culling', transaction_date: '2027-02-01', plot_name: 'B1', quantity_change: -50 });
log({ batch_name: '123', transaction_type: '3rd_Culling', transaction_date: '2027-05-01', plot_name: 'B1', quantity_change: -280 });

/* 122 — fully verified, and by the ROW route on Tab 6: the plot's culling
   card and its transfer card are two separate signatures. */
log({ batch_name: '122', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
      transaction_date: '2026-08-18', plot_name: 'Pre-Nursery', quantity_change: 10700,
      remark: 'Seeds received. Supplier: IOI Plantation Sdn Bhd. MPOB: 622810-021000. D/O: DO-7712. DO_Qty: 10000. Incl. 7% FOC.' });
log({ batch_name: '122', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
      transaction_date: '2026-08-18', created_at: '2025-01-01T00:00:00Z', quantity_change: 987000,
      remark: 'Seeds received. Supplier: Wrong Bhd. DO_Qty: 940000. Incl. 5% FOC.' });
log({ batch_name: '122', transaction_type: 'Planted', transaction_date: '2026-08-20', plot_name: 'P2', quantity_change: 10627 });
log({ batch_name: '122', transaction_type: '1st_Culling', transaction_date: '2026-10-02', plot_name: 'P2', quantity_change: -749 });
log({ batch_name: '122', transaction_type: 'Transplanted', transaction_date: '2026-10-05', plot_name: 'B2', quantity_change: 9878, remark: 'from tray [P2] Date: 2026-10-05' });
log({ batch_name: '122', transaction_type: '2nd_Culling', transaction_date: '2027-01-01', plot_name: 'B2', quantity_change: -50 });
log({ batch_name: '122', transaction_type: '3rd_Culling', transaction_date: '2027-04-01', plot_name: 'B2', quantity_change: 280,
      remark: '3rd Culling. Remaining Balance: 0, Culled: 280, DestType: main MapQty: 280 CullDate:2027-04-01' });
log({ batch_name: '122', transaction_type: '3rd_Culling', transaction_date: '2027-04-03', plot_name: 'B4-R', quantity_change: 120,
      remark: '3rd Culling. Remaining Balance: 0, Culled: 120, DestType: main MapQty: 120 CullDate:2027-04-03' });
log({ batch_name: '122', transaction_type: 'Cull3_Transfer', transaction_date: '2027-04-02', plot_name: 'B4-R', quantity_change: 120, remark: 'From: [B2|main]' });

/* 121 — the over-marking trap. Its 3rd culling IS signed; its transfer card
   is NOT. Both live on Tab 6, so a tally kept per TAB would wrongly mark the
   3rd Culling figure as well. */
log({ batch_name: '121', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
      transaction_date: '2026-07-01', plot_name: 'Pre-Nursery', quantity_change: 500, remark: 'DO_Qty: 500.' });
log({ batch_name: '121', transaction_type: 'Planted', transaction_date: '2026-07-02', plot_name: 'P5', quantity_change: 500 });
log({ batch_name: '121', transaction_type: 'Transplanted', transaction_date: '2026-09-01', plot_name: 'B5', quantity_change: 500, remark: 'from tray [P5] Date: 2026-09-01' });
log({ batch_name: '121', transaction_type: '3rd_Culling', transaction_date: '2027-03-01', plot_name: 'B5', quantity_change: -40 });
log({ batch_name: '121', transaction_type: 'Cull3_Transfer', transaction_date: '2027-03-02', plot_name: 'B6-R', quantity_change: 60, remark: 'From: [B5|main]' });

/* 099 — nothing signed at all. */
log({ batch_name: '099', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
      transaction_date: '2024-03-01', plot_name: 'Pre-Nursery', quantity_change: 1000, remark: 'DO_Qty: 1000.' });
log({ batch_name: '099', transaction_type: 'Planted', transaction_date: '2024-03-02', plot_name: 'P3', quantity_change: 1000 });
log({ batch_name: '099', transaction_type: 'Transplanted', transaction_date: '2024-05-01', plot_name: 'B3', quantity_change: 1000, remark: 'from tray [P3] Date: 2024-05-01' });

const ROW_VERIFS = [
  // 123: one of the two transplant rows, and the 2nd culling row.
  RV('123', 'transplanting::B1|main|P1|2026-11-05'),
  RV('123', 'cull_2::B1'),
  // 122: transplanting, both Tab 6 cards.
  RV('122', 'transplanting::B2|main|P2|2026-10-05'),
  RV('122', 'cull_3::B2|main'),
  RV('122', 'cull_3::B2|transfer'),
  // the P-R Culling row for the plot the transfer landed in
  RV('122', 'cull_3::B4-R|main'),
  RV('122', 'cull_2::B2'),
  RV('122', 'cull_1::P2'),
  // 121: the culling card ONLY — the transfer card is unsigned.
  RV('121', 'cull_3::B5|main'),
  RV('121', 'transplanting::B5|main|P5|2026-09-01'),
];

const STAGE_VERIFS = [
  { id: 1, batch_name: '123', stage: 'seeds_in' },
  { id: 2, batch_name: '123', stage: 'planting' },
  { id: 3, batch_name: '122', stage: 'seeds_in' },
  { id: 4, batch_name: '122', stage: 'planting' },
  { id: 5, batch_name: '121', stage: 'seeds_in' },
  { id: 6, batch_name: '121', stage: 'planting' },
];

const DOS = [
  { do_number: 'DO-1', delivery_date: '2027-06-01', status: 'Delivered', plot_1: 'B1', qty_1: 100, batch_1: '123' },
];

const DATA = {
  shared_inventory_logs: L.concat(ROW_VERIFS),
  operation_batch_verifications: STAGE_VERIFS,
  shared_do_records: DOS,
  shared_plots: [{ plot_name: 'B1', nursery_name: 'BNN' }, { plot_name: 'B7', nursery_name: 'BNN' },
                 { plot_name: 'B2', nursery_name: 'BNN' },
                 { plot_name: 'B3', nursery_name: 'UNN 1' }, { plot_name: 'B4-R', nursery_name: 'BNN' },
                 { plot_name: 'B5', nursery_name: 'BNN' }, { plot_name: 'B6-R', nursery_name: 'BNN' }],
  operation_trays: ['P1','P2','P3','P5'].map(t => ({ tray_name: t, nursery_name: 'BNN' })),
  shared_breeds: [{ name: 'AA Hybrida 1S' }, { name: 'IOI DxP HYBRID' }],
};

// The stub HONOURS .eq('transaction_type', …): the page asks for
// Row_Verification rows out of the same table as the ledger, and a stub that
// handed back everything would prove nothing about the filter.
async function stub(page, breakVer) {
  await page.addInitScript(([data, broken]) => {
    const q = (table) => {
      let rows = (data[table] || []).slice();
      // In "broken" mode the two sign-off reads are REFUSED, the way they
      // would be by a policy nobody has granted. Everything else answers.
      let denied = broken && table === 'operation_batch_verifications';
      const w = {
        select: () => w, order: () => w, like: () => w, not: () => w, limit: () => w,
        /* HONOURED, unlike the losver harness where nothing depended on it.
           The Batch Record page picks its transplant rows with .in(), and a
           stub that hands back the whole ledger makes every log row look
           like a plot the batch must cull. */
        in: (col, vals) => { rows = rows.filter(r => vals.indexOf(r[col]) >= 0); return w; },
        eq: (col, val) => {
          if (broken && col === 'transaction_type' && val === 'Row_Verification') denied = true;
          rows = rows.filter(r => String(r[col] == null ? '' : r[col]) === String(val));
          return w;
        },
        range: (a, b) => ({ then: (ok, no) => (denied ? Promise.reject(new Error('denied'))
          : Promise.resolve({ data: rows.slice(a, b + 1), error: null })).then(ok, no) }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        then: (ok, no) => (denied ? Promise.reject(new Error('denied'))
                                  : Promise.resolve({ data: rows, error: null })).then(ok, no)
      };
      return w;
    };
    window.__stub = { from: q, rpc: () => Promise.resolve({ data: null, error: null }),
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 't@t' } } } }),
        getUser: async () => ({ data: { user: { id: 'u1', email: 't@t' } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  }, [DATA, !!breakVer]);
}

async function route(page) {
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ body: '', contentType: 'text/javascript' }));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('**/@supabase/supabase-js**', r => r.fulfill({ contentType: 'text/javascript',
    body: 'window.supabase={createClient:()=>window.__stub};' }));
  await page.route('**/shared/shared_access.js', r => r.fulfill({ contentType: 'text/javascript',
    body: `window.MJMAccess={load:async()=>{},user:()=>({email:'t@t'}),canAccess:()=>true,
      canOpenOperationPage:()=>true,canDoOperation:()=>true,canOpenPage:()=>true,canDo:()=>true};` }));
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function open(breakVer) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => { errs.push(e.message); console.log('  [err]', e.message.slice(0, 220)); });
  await route(page);
  await stub(page, breakVer);
  await page.goto(B + (globalThis.__PAGE || '/operation/operation_reports.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  return { page, errs };
}

// The seventeen columns, in order, as the headings name them.
const COLS = ['seedIn', 'batch', 'supplier', 'age', 'received', 'damaged', 'planted',
  'variance', 'transTotal', 'cull1Total',
  'cull2', 'cull3', 'cullTotal', 'transfer',
  'sales', 'calibration', 'balance'];

const readRows = (page) => page.evaluate((cols) => {
  const out = {};
  [...document.querySelectorAll('.los-table tbody tr')].forEach(tr => {
    if (tr.children.length !== cols.length) return;
    const name = tr.children[1].textContent.trim().split('\n')[0].trim();
    const cells = {};
    cols.forEach((c, i) => {
      const td = tr.children[i];
      const text = td.textContent.replace(/\s+/g, ' ').trim();
      // A figure held back for want of a signature reads as a dash and is
      // out of the totals — it is not marked-and-shown any more.
      cells[c] = { held: text === '—', text, title: td.getAttribute('title') || '' };
    });
    out[name] = { cells, verdict: (tr.children[1].textContent.match(/[✓⧗][^\n]*/) || [''])[0].trim() };
  });
  return out;
}, COLS);

const held = (r) => COLS.filter(c => r.cells[c].held);


/* THE TWO LISTS MUST AGREE. One ledger, both pages, same answer for which
   batches are Completed — the whole point of shared_batch_completed.js.

   122 is finished: one plot, culled to its drone map, every row signed.
   123 is not: its 3rd culling is keyed on B1 and nobody has signed it.
   121's culling IS signed but its transfer plot B4-R has no record. */
globalThis.__PAGE = '/operation/operation_reports.html';
const los = await open(false);
const losCompleted = await los.page.evaluate(() =>
  (window._losData ? window._losData.rows : [])
    .filter(r => r.completed).map(r => r.batch).sort());
is(los.errs.length, 0, 'Life of Seedlings loads with no page error');
await los.page.close();

globalThis.__PAGE = '/operation/operation_batch_record.html';
const rec = await open(false);
await rec.page.waitForTimeout(2000);
is(rec.errs.length, 0, 'the Batch Record list loads with no page error');
await rec.page.evaluate(() => {
  const btn = document.getElementById('tab-completed');
  if (btn) btn.click();
});
await rec.page.waitForTimeout(800);
/* Ask the page's own model rather than scraping cards: `isCompleted` is
   what the Completed tab filters on. */
/* The Completed tab draws one card per batch. Scraping it is the point:
   it is what somebody actually looks at. */
const recRows = await rec.page.evaluate(() => {
  const txt = document.body.innerText;
  return ['099', '121', '122', '123'].filter(b =>
    new RegExp('(^|[^0-9])' + b + '([^0-9]|$)').test(txt));
});

console.log('\n── Which batches each list calls Completed ──');
is(losCompleted, ['122'], 'Life of Seedlings');
is(recRows, ['122'], 'the Batch Record Completed tab');
is(losCompleted.join(), recRows.join(), 'and they agree');

console.log(bad ? '\nFAILURES: ' + bad : '\nall good');
await browser.close();
process.exit(bad ? 1 : 0);

})();
