/* ONLY A VERIFIED FIGURE FLOATS TO LIFE OF SEEDLINGS.

   A figure whose stage nobody has signed off is not on this report. It
   reads as a DASH, it is left out of its column total, and the foot says
   which columns are short and by how many rows.

   It used to be SHOWN with a ⧗ beside it and counted in the totals, on the
   argument that hiding it leaves the report answering a question nobody
   asked. The office overruled that, and batch 246 is why: its 3rd Culling
   tab read 0 of 4 Done with every Culled Qty box empty, and the report was
   showing 10,142 third culled and a Balance of minus 7,659 off the back of
   it.

   What was right about the old rule is still right, and it is why a
   withheld figure is a dash and never a nought: zeroing an unverified
   stage is a wrong number wearing a right number's clothes.

   Five things here are easy to get wrong and are each worth a case:

     · The unit is the COLUMN, not the tab. 3rd Culling and Transfer are
       both signed on Tab 6, and Transplant Qty and premium care are
       figures on Tab 3. Rolling them up per tab withholds figures somebody
       HAS signed — see batch 121.

     · A sign-off comes two ways. One signature over a whole tab lives in
       operation_batch_verifications; a tab signed row by row has none, and
       each row's own sign-off is a Row_Verification log. Either counts.

     · PART verified is not verified. One of two transplant rows signed
       means the figure contains an unsigned row — see batch 123.

     · A DERIVED figure goes whenever any part of it does, rather than
       being computed from the parts that survived.

     · If the sign-off tables cannot be read, NOTHING is withheld. Emptying
       a report because a check could not run is a systematically wrong
       answer, not a cautious one — the same reason access fails open.

   Needs a browser and a server on the page:
     (cd .. && python3 -m http.server 8812 &)
     NODE_PATH=/opt/node22/lib/node_modules node tests/los_only_verified_links.cjs */
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

const { page, errs } = await open(false);
let R = await readRows(page);
await page.screenshot({ path: 'losver.png' });

console.log('\n── 1. The page still works ──');
is(errs.length, 0, 'no page errors');
is(Object.keys(R).sort(), ['099', '121', '122', '123'], 'all four batches listed');

console.log('\n── 1b. A batch with two reception rows says so, and shows the newest ──');
is(R['122'].cells.received.text.replace(/\s+/g, ' '),
  '10,700 10,000 + FOC 700 ⚠ 2 reception rows',
  'the newest row\u2019s figure, with the stale one called out');
is(R['123'].cells.received.text.includes('reception rows'), false,
  'and a batch with one row says nothing');

console.log('\n── 2. A fully verified batch says so and floats in full ──');
is(R['122'].verdict, '✓ verified', '122 reads verified');
is(held(R['122']), [], 'and not one of its figures is held back');

console.log('\n── 3. A batch nobody has checked floats nothing it has ──');
is(R['099'].verdict, '⧗ 3 stages unverified', '099 counts them rather than filling the column');
is(held(R['099']), ['received', 'damaged', 'planted', 'variance', 'transTotal', 'balance'],
  'every figure of its own is held — damaged too, which is a nought on an unsigned tab');
/* A nought on an unsigned tab is held for the same reason it used to be
   marked: "0 damaged" and "0 so far as anybody has keyed" are different
   claims, and only one of them is a figure. */
is(R['099'].cells.damaged.text, '—', 'the nought is a dash, never a nought');
is(R['099'].cells.cull1Total.held, false, 'but NOT 1st Culled: it has no line there to verify');
is(R['099'].cells.cull1Total.text, '0',  'so that one is a real nought');
is(R['099'].cells.sales.held, false, 'and never sales — the D/O module signs those off');
is(R['099'].cells.calibration.held, false, 'nor the calibration, which has its own approval');

console.log('\n── 4. Part verified is part verified ──');
is(R['123'].verdict, '⧗ 4 stages unverified', '123 counts its four');
is(await page.evaluate(() => [...document.querySelectorAll('.los-table tbody tr')]
     .find(t => t.children.length === 17 && t.children[1].textContent.includes('123'))
     .children[1].querySelector('div[title]').getAttribute('title')),
  'These figures are what the field has keyed and nobody has signed off yet, so they may be '
  + 'incomplete or uncorrected: transplanting, double-tone tray, 1st culling, 3rd culling.',
  'with the four named in full where somebody can read them');
is(R['123'].cells.received.held, false, 'seed in signed as a whole tab → Seed Received clean');
is(R['123'].cells.planted.held,  false, 'planting likewise');
is(R['123'].cells.variance.held, false, 'so the Variance made of the two is clean as well');
is(R['123'].cells.transTotal.held,  true, 'one of two transplant plots signed → PART verified is not verified, so it is held');
/* The Double Tone COLUMN is the keyed Quantity in Nursery now, and this
   fixture keys none — so there is nothing there to verify and nothing to
   mark. The transplant into the d-tone tray is a different group with no
   column of its own, exactly like premium care: it is named in the row
   verdict and marks no cell. */

is(R['123'].cells.cull2.held,  false, '2nd culling signed row by row → it floats');
is(R['123'].cells.cull1Total.held,  true, '1st culling unsigned → held');
/* All three 1st Culled columns are 1st_Culling rows split by the tray, so
   one unsigned culling marks all three — the d-tone one included, though it
   reads nought, because "0 in the d-tone tray" and "0 so far as anybody has
   keyed" are different claims. */
/* All of 123 was culled in plain trays, so there is nothing to split and no
   sub-line is drawn — "all of it" and "none of it" is two lines of type for
   no information. */
is(R['123'].cells.cull1Total.text, '—', 'so the figure itself is nowhere on the row');
is(R['123'].cells.cull1Total.title.includes('The field has keyed 749'), true,
  'though the dash still says what the field keyed, for whoever has to sign it');
is(R['123'].cells.cull3.held,  true, '3rd culling unsigned → held');
is(R['123'].cells.cullTotal.held, true, 'and the total made of 1st + 3rd');
is(R['123'].cells.balance.held,   true, 'and the Balance made out of them');
/* A DERIVED figure is held whenever any part of it is, rather than being
   computed from the parts that survived. Half a Balance is the wrong number
   wearing a right number's clothes, which is the whole reason this is a
   dash and not a nought. */
is(R['123'].cells.cullTotal.text, '—', 'Total Culled too, both its parts being unsigned');

console.log('\n── 5. A verified culling is not marked by an unverified transfer ──');
is(R['121'].cells.cull3.held,    false, "121's 3rd Culling is signed → it floats");
is(R['121'].cells.transfer.held, true,  'its transfer card is not → only Transfer is held');
is(R['121'].cells.balance.held,  false, 'a transfer is not in the Balance, so it does not hold it back');
is(R['121'].verdict, '⧗ 3rd-culling transfer unverified', 'and the row names the card, not the tab');

console.log('\n── 6. The dash carries an explanation, and the figure ──');
const tip = R['123'].cells.transTotal.title;
is(/1 of 2 rows left/.test(tip), true, 'it says how many rows are outstanding: ' + JSON.stringify(tip));
is(/The field has keyed 10,072/.test(tip), true,
  'and what the field keyed, so the office can see what it is being asked to sign');
is(/left out of this row and out of the column total/.test(tip), true,
  'and that it is out of the total as well as out of the row');
is(await page.evaluate(() => {
  const tr = [...document.querySelectorAll('.los-table tbody tr')]
    .find(t => t.children.length === 17 && t.children[1].textContent.includes('123'));
  return !!tr.children[8].querySelector('button.los-fig');
}), true, 'and the dash is still a button — the records behind it are what gets it signed');

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

console.log('\n── 7. The report says once, above the table, what it is holding back ──');
const note = await page.evaluate(() => {
  const d = [...document.querySelectorAll('#report-output div')]
    .find(e => /Only verified figures are on this report/.test(e.textContent));
  return d ? d.textContent.replace(/\s+/g, ' ').trim() : '';
});
is(/3 of 4 batches carry a stage nobody has signed off/.test(note), true,
  'the count: ' + JSON.stringify(note));
is(/left out of the totals/.test(note), true, 'and that they are out of the totals');
/* The foot says it COLUMN BY COLUMN, because "3 batches are unverified"
   does not tell a reader which total is short — a batch can be signed off
   on its seed in and waiting on its 3rd culling, and only one of those
   columns is light. */
const foot = await page.evaluate(() => {
  const t = document.querySelector('.los-table tfoot tr:last-child');
  return t ? t.textContent.replace(/\s+/g, ' ').trim() : '';
});
is(/These totals LEAVE OUT the figures nobody has signed off/.test(foot), true,
  'the foot says so: ' + JSON.stringify(foot));
is(/Transplant Qty is short 2 of 4/.test(foot), true, 'and names the column and the count');
is(/Seed Received is short 1 of 4/.test(foot), true, "for every column that is light");

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
is(R['123'].cells.cull1Total.held, false, 'as at 31 Oct 2026 the November culling has not happened, so nothing is held');
is(R['123'].cells.transTotal.held, false, 'nor the November transplanting');
is(R['123'].verdict, '✓ verified', 'and as at that date 123 reads fully verified');
await pick('f-los-date', '');

console.log('\n── 10. If the sign-off tables cannot be read, nothing is held back ──');
await page.close();
const broken = await open(true);
const BR = await readRows(broken.page);
is(Object.keys(BR).length, 4, 'every batch still listed');
/* FAILS OPEN, and that is the whole of it: a check that cannot run must not
   empty a report. Same reason access fails open. */
is(held(BR['099']), [], 'and not one figure is held back');
is(BR['099'].cells.transTotal.text, '1,000', 'every figure is the live ledger, checked or not');
is(BR['099'].verdict, '', 'no batch claims a verdict either way');
const bnote = await broken.page.evaluate(() => {
  const d = [...document.querySelectorAll('#report-output div')]
    .find(e => e.textContent.includes('Verification state could not be read'));
  return d ? d.textContent.replace(/\s+/g, ' ').trim() : '';
});
is(bnote !== '', true, 'the report says it could not tell: ' + JSON.stringify(bnote));
is(/nothing below is held back/.test(bnote), true, 'in those words');
await broken.page.close();

await browser.close();
console.log('\n' + (bad ? 'FAILURES: ' + bad : 'all good'));
process.exit(bad ? 1 : 0);

})();
