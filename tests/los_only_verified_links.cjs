/* Life of Seedlings may only present a figure as settled once somebody has
   verified the stage behind it. Unverified figures are still SHOWN — they
   are the best answer there is, and zeroing one would turn a Variance into
   a wrong number wearing a right number's clothes — but they are MARKED, so
   a reader can tell the two apart.

   Three things here are easy to get wrong and are each worth a case:

     · The unit is the COLUMN, not the tab. 3rd Culling and Transfer are
       both signed on Tab 6, and Transplanting Qty / Double Tone / premium
       care are three figures on Tab 3. Rolling them up per tab puts a
       warning on figures somebody HAS signed — see batch 121.

     · A sign-off comes two ways. One signature over a whole tab lives in
       operation_batch_verifications; a tab signed row by row has none, and
       each row's own sign-off is a Row_Verification log. Either counts.

     · If the sign-off tables cannot be read, NOTHING is marked. Marking
       everything would be a systematically wrong answer, not a cautious
       one, and a marker that cries over hundreds of fine figures is a
       marker nobody reads.

   Needs a browser and a server on the page:
     (cd .. && python3 -m http.server 8812 &)
     NODE_PATH=/opt/node22/lib/node_modules node tests/los_only_verified_links.cjs */
const { chromium } = require('playwright');

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
log({ batch_name: '122', transaction_type: 'Planted', transaction_date: '2026-08-20', plot_name: 'P2', quantity_change: 10627 });
log({ batch_name: '122', transaction_type: '1st_Culling', transaction_date: '2026-10-02', plot_name: 'P2', quantity_change: -749 });
log({ batch_name: '122', transaction_type: 'Transplanted', transaction_date: '2026-10-05', plot_name: 'B2', quantity_change: 9878, remark: 'from tray [P2] Date: 2026-10-05' });
log({ batch_name: '122', transaction_type: '2nd_Culling', transaction_date: '2027-01-01', plot_name: 'B2', quantity_change: -50 });
log({ batch_name: '122', transaction_type: '3rd_Culling', transaction_date: '2027-04-01', plot_name: 'B2', quantity_change: -280 });
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
        select: () => w, order: () => w, in: () => w, like: () => w, not: () => w, limit: () => w,
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
      auth: { getSession: async () => ({ data: { session: null } }),
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

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  async function open(breakVer) {
    const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
    const errs = [];
    page.on('pageerror', e => { errs.push(e.message); console.log('  [err]', e.message.slice(0, 220)); });
    await route(page);
    await stub(page, breakVer);
    await page.goto(B + '/operation/operation_reports.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    return { page, errs };
  }

  // The eighteen columns, in order, as the headings name them.
  const COLS = ['seedIn', 'batch', 'supplier', 'age', 'received', 'damaged', 'planted',
    'variance', 'trans', 'dtone', 'cull1', 'cull2', 'cull3', 'cullTotal', 'transfer',
    'sales', 'calibration', 'balance'];

  const readRows = (page) => page.evaluate((cols) => {
    const out = {};
    [...document.querySelectorAll('.los-table tbody tr')].forEach(tr => {
      if (tr.children.length !== cols.length) return;
      const name = tr.children[1].textContent.trim().split('\n')[0].trim();
      const cells = {};
      cols.forEach((c, i) => {
        const td = tr.children[i];
        cells[c] = { marked: td.classList.contains('los-unver'),
                     text: td.textContent.replace(/\s+/g, ' ').trim() };
      });
      out[name] = { cells, verdict: (tr.children[1].textContent.match(/[✓⧗][^\n]*/) || [''])[0].trim() };
    });
    return out;
  }, COLS);

  const marked = (r) => COLS.filter(c => r.cells[c].marked);

  const { page, errs } = await open(false);
  let R = await readRows(page);

  console.log('\n── 1. The page still works ──');
  is(errs.length, 0, 'no page errors');
  is(Object.keys(R).sort(), ['099', '121', '122', '123'], 'all four batches listed');

  console.log('\n── 2. A fully verified batch says so and is marked nowhere ──');
  is(R['122'].verdict, '✓ verified', '122 reads verified');
  is(marked(R['122']), [], 'and not one of its figures is marked');

  console.log('\n── 3. A batch nobody has checked is marked on every figure it has ──');
  is(R['099'].verdict, '⧗ 3 stages unverified', '099 counts them rather than filling the column');
  is(marked(R['099']), ['received', 'damaged', 'planted', 'variance', 'trans', 'balance'],
    'received/planted/variance/transplanting/balance marked — damaged too (nought on an unsigned tab)');
  is(R['099'].cells.dtone.marked, false, 'but NOT Double Tone: 099 has no double-tone row to verify');
  is(R['099'].cells.cull1.marked, false, 'nor 1st culling: it has no line there either');
  is(R['099'].cells.sales.marked, false, 'and never sales — the D/O module signs those off');
  is(R['099'].cells.calibration.marked, false, 'nor the calibration, which has its own approval');

  console.log('\n── 4. Part verified is part verified ──');
  is(R['123'].verdict, '⧗ 4 stages unverified', '123 counts its four');
  is(await page.evaluate(() => [...document.querySelectorAll('.los-table tbody tr')]
       .find(t => t.children.length === 18 && t.children[1].textContent.includes('123'))
       .children[1].querySelector('div[title]').getAttribute('title')),
    'These figures are what the field has keyed and nobody has signed off yet, so they may be '
    + 'incomplete or uncorrected: transplanting, double tone, 1st culling, 3rd culling.',
    'with the four named in full where somebody can read them');
  is(R['123'].cells.received.marked, false, 'seed in signed as a whole tab → Seed Received clean');
  is(R['123'].cells.planted.marked,  false, 'planting likewise');
  is(R['123'].cells.variance.marked, false, 'so the Variance made of the two is clean as well');
  is(R['123'].cells.trans.marked,  true, 'one of two transplant plots signed → Transplanting part verified');
  is(R['123'].cells.dtone.marked,  true, 'and Double Tone, whose one row nobody has signed');
  is(R['123'].cells.cull2.marked,  false, '2nd culling signed row by row → clean');
  is(R['123'].cells.cull1.marked,  true, '1st culling unsigned → marked');
  is(R['123'].cells.cull3.marked,  true, '3rd culling unsigned → marked');
  is(R['123'].cells.cullTotal.marked, true, 'and the total made of 1st + 3rd');
  is(R['123'].cells.balance.marked,   true, 'and the Balance under them');

  console.log('\n── 5. A verified culling is not marked by an unverified transfer ──');
  is(R['121'].cells.cull3.marked,    false, "121's 3rd Culling is signed → clean");
  is(R['121'].cells.transfer.marked, true,  'its transfer card is not → only Transfer is marked');
  is(R['121'].cells.balance.marked,  false, 'a transfer is not in the Balance, so it does not mark it');
  is(R['121'].verdict, '⧗ 3rd-culling transfer unverified', 'and the row names the card, not the tab');

  console.log('\n── 6. The marker carries an explanation ──');
  const tip = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('.los-table tbody tr')]
      .find(t => t.children.length === 18 && t.children[1].textContent.includes('123'));
    return tr.children[8].querySelector('.los-unver-mark').getAttribute('title');
  });
  is(/1 of 2 rows left/.test(tip), true, 'it says how many rows are outstanding: ' + JSON.stringify(tip));

  console.log('\n── 6b. The records window a figure opens into says the same thing ──');
  const drill = async (kind, batch) => {
    await page.evaluate(([k, b]) => losDrill(k, b), [kind, batch]);
    await page.waitForTimeout(400);
    const t = await page.evaluate(() => {
      const d = document.getElementById('los-drill-body').firstElementChild;
      const s = d ? d.textContent.replace(/\s+/g, ' ').trim() : '';
      return /^[⧗✓]/.test(s) ? s : '';   // anything else is the filter bar
    });
    await page.evaluate(() => { const o = document.getElementById('los-drill-overlay'); if (o) o.style.display = 'none'; });
    return t;
  };
  is(/^⧗ Not verified yet: 3rd culling\./.test(await drill('cull3', '123')), true,
    "123's 3rd Culling records open under a warning");
  is(/^✓ Verified/.test(await drill('cull3', '122')), true,
    "122's open under a tick");
  is(/^✓ Verified/.test(await drill('cull3', '121')), true,
    "121's culling is signed, so its records window says so though its transfer is not");
  is(/^⧗ Not verified yet: 3rd-culling transfer\./.test(await drill('transfer', '121')), true,
    'and the transfer records carry the warning instead');
  // Only 099's planting is unsigned, so the Actual Planted total is one
  // batch short of checked — not three. The count is of the batches behind
  // THAT figure, not of the batches with anything outstanding anywhere.
  is(/^⧗ 1 of 4 batches behind this total are not verified/.test(await drill('planted', '*')), true,
    'the TOTAL row says how many batches behind THAT figure are unverified');
  is(/^⧗ 2 of 4 batches behind this total are not verified/.test(await drill('trans', '*')), true,
    'and it is a different count for a different column');
  is(await drill('sales', '123'), '', 'sales open with no verification note — not a batch-report tab');

  console.log('\n── 7. The report says once, above the table, that it contains unchecked work ──');
  const note = await page.evaluate(() => {
    const d = [...document.querySelectorAll('#report-output div')]
      .find(e => e.textContent.trim().startsWith('⧗') && e.children.length === 0);
    return d ? d.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  is(/3 of 4 batches carry figures nobody has verified yet/.test(note), true, 'the count: ' + JSON.stringify(note));
  const foot = await page.evaluate(() => {
    const t = document.querySelector('.los-table tfoot');
    return t ? t.textContent.replace(/\s+/g, ' ').trim().slice(-120) : '';
  });
  is(/totals include 3 batches whose figures are not verified/.test(foot), true,
    'and the totals say they include it');

  console.log('\n── 8. The Verification filter ──');
  const pick = async (id, v) => {
    await page.evaluate(([i, val]) => {
      const el = document.getElementById(i); el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [id, v]);
    await page.waitForTimeout(600);
  };
  is(await page.evaluate(() => !document.querySelector('#f-los-verified').closest('div.f-los').classList.contains('hidden')),
    true, 'the picker is on screen for this report');
  await pick('f-los-verified', 'verified');
  is(Object.keys(await readRows(page)).sort(), ['122'], 'Verified only → the one fully verified batch');
  await pick('f-los-verified', 'pending');
  is(Object.keys(await readRows(page)).sort(), ['099', '121', '123'], 'Awaiting verification → the other three');
  is((await page.evaluate(() => document.querySelector('#report-output .glass-panel div[class*="tracking-widest"]').textContent))
     .includes('awaiting verification'), true, 'and the scope line says which slice this is');
  await pick('f-los-verified', '');
  is(Object.keys(await readRows(page)).length, 4, 'blank is no filter again');

  console.log('\n── 9. The As At cut-off applies to the LINES, not the signatures ──');
  // 123's 1st culling is dated Nov 2026 and is unsigned. As at Oct 2026 it has
  // not happened, so there is nothing there to be unverified.
  await pick('f-los-date', '2026-10-31');
  R = await readRows(page);
  is(R['123'].cells.cull1.marked, false, 'as at 31 Oct 2026, the November culling marks nothing');
  is(R['123'].cells.trans.marked, false, 'nor the November transplanting');
  is(R['123'].verdict, '✓ verified', 'and as at that date 123 reads fully verified');
  await pick('f-los-date', '');

  console.log('\n── 10. If the sign-off tables cannot be read, nothing is marked ──');
  await page.close();
  const broken = await open(true);
  const BR = await readRows(broken.page);
  is(Object.keys(BR).length, 4, 'every batch still listed');
  is(marked(BR['099']), [], 'and not one figure is marked unverified');
  is(BR['099'].verdict, '', 'no batch claims a verdict either way');
  const bnote = await broken.page.evaluate(() => {
    const d = [...document.querySelectorAll('#report-output div')]
      .find(e => e.textContent.includes('Verification state could not be read'));
    return d ? d.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  is(bnote !== '', true, 'the report says it could not tell: ' + JSON.stringify(bnote));
  await broken.page.close();

  await browser.close();
  console.log('\n' + (bad ? 'FAILURES: ' + bad : 'all good'));
  process.exit(bad ? 1 : 0);

})();
