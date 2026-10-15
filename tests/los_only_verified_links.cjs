/* ONLY VERIFIED DATA IS COUNTED, AND IT IS COUNTED LINE BY LINE.

   The office asked for this three times, each one narrower than the last:

     1. "make it only verified data will float to life of seedling" — an
        unverified figure came off the report. Batch 246 is why: its 3rd
        Culling tab read 0 of 4 Done with every Culled Qty box empty, and
        the report was showing 10,142 third culled and a Balance of minus
        7,659 off the back of it.
     2. "no need to show which item not yet verify" — the row stopped
        carrying a label saying which stage it was waiting on.
     3. "it is only calculate what data is verified first ... just show the
        number which verified until new data verified then update the
        report there" — which is this file.

   The third is the same rule as the first, asked ONE LEVEL DOWN. It used to
   be asked of a whole STAGE, so one unsigned row took the whole column away
   and every figure derived from it with it: a Balance could not be read at
   all until the 3rd Culling tab was signed. Asked of the LINE, a tab signed
   four rows out of five shows those four, and the fifth joins the figure
   the day somebody signs it.

   So:

     · A LINE nobody has signed takes no part in any figure. _losLineSigned
       is the one test, and the tally that explains a figure is built with
       the same call, so the two cannot disagree.
     · Every derived figure is right by construction. Variance, Total
       Culled, the Balance and both splits are arithmetic over figures that
       are already verified-only, so none of them knows this rule exists.
     · NOTHING IS A DASH. A stage nobody has signed is nought, and the cell
       says in its hover what is still to be signed and what it would add.
     · The TOTAL is the plain sum of the rows. Nothing is left out of it any
       more, so it agrees with the column above it line for line.
     · The record lists are untouched: every line is still in the drilldown,
       signed or not, because that is what somebody needs in order to go and
       sign the rest off.
     · If the sign-off tables cannot be READ, every line counts and the
       report says it could not tell. The same reason access fails open.

   WHAT IT COSTS, and it is in here as batch 097: a VARIANCE whose seed in
   is signed and whose planting is not reads as minus the whole delivery,
   because the planted figure is genuinely nought so far as anybody has
   signed. That was the argument for the dash, and the office has chosen the
   other way with it in front of them. The hover on the cell says what it is
   waiting on.

   Only Life of Seedlings asks for this. The Seed In Report shares the same
   builder and reads the ledger as keyed — a different report asking a
   different question.

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

/* 097 — WHAT THIS RULE COSTS, pinned so nobody is surprised by it. Seed in
   is signed as a whole tab and the planting is not, so the planted figure is
   nought so far as anybody has signed — and the Variance, which is planted
   less what arrived, reads as minus the whole delivery. That was the whole
   argument for the dash, and the office chose this with it in front of them.
   The cell says in its hover that the planting is still to be signed. */
log({ batch_name: '097', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
      transaction_date: '2026-06-01', plot_name: 'Pre-Nursery', quantity_change: 8000, remark: 'DO_Qty: 8000.' });
log({ batch_name: '097', transaction_type: 'Planted', transaction_date: '2026-06-02', plot_name: 'P7', quantity_change: 7900 });

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
  { id: 7, batch_name: '097', stage: 'seeds_in' },
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
  operation_trays: ['P1','P2','P3','P5','P7'].map(t => ({ tray_name: t, nursery_name: 'BNN' })),
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
    /* THE BATCH CELL CARRIES NO VERDICT ANY MORE. It is still read, so
       the test can assert that — a label saying which stage is waiting
       was the office's one "no need", and the dash in the column it
       belongs to is the answer instead. */
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
is(Object.keys(R).sort(), ['097', '099', '121', '122', '123'], 'all five batches listed');

console.log('\n── 1b. A batch with two reception rows says so, and shows the newest ──');
is(R['122'].cells.received.text.replace(/\s+/g, ' '),
  '10,700 10,000 + FOC 700 ⚠ 2 reception rows',
  'the newest row\u2019s figure, with the stale one called out');
is(R['123'].cells.received.text.includes('reception rows'), false,
  'and a batch with one row says nothing');

console.log('\n── 2. A fully verified batch reads exactly as the ledger does ──');
is(R['122'].verdict, '', 'and says nothing about being verified — the figures are the answer');
is([R['122'].cells.transTotal.text, R['122'].cells.cull1Total.text,
    R['122'].cells.cull3.text, R['122'].cells.transfer.text, R['122'].cells.balance.text],
   ['9,878', '749', '280', '120', '9,598'],
   'every line of it is signed, so every figure is the whole of it');
is(Object.values(R['122'].cells).some(c => c.text === '—'), false, 'and nothing on the row is a dash');
is(R['122'].cells.balance.title, '', 'with no note about waiting for anything');

console.log('\n── 3. A batch nobody has checked counts nothing ──');
is(R['099'].verdict, '', 'the row still carries no label about it');
is([R['099'].cells.received.text, R['099'].cells.planted.text,
    R['099'].cells.transTotal.text, R['099'].cells.balance.text],
   ['0', '0', '0', '0'],
   'nothing is signed, so nothing is counted — and it is nought, not a dash');
is(R['099'].cells.variance.text, '0',
  'the Variance of two unsigned figures is nought, not minus the delivery');
is(R['099'].cells.planted.title.indexOf('Still to be signed off: planting') >= 0, true,
  'and the cell says what it is waiting for: ' + JSON.stringify(R['099'].cells.planted.title));
is(/would add 1,000/.test(R['099'].cells.planted.title), true, 'and what signing it would add');

console.log('\n── 4. PART verified is the part that is verified ──');
/* 123 transplanted 9,772 into B1 (signed) and 300 into B7 (not). The old
   rule took the whole column away over that 300; this one shows the 9,772
   and waits for the rest. */
is(R['123'].cells.transTotal.text, '9,772', 'one of two transplant rows signed → that one row is the figure');
is(/Still to be signed off: transplanting \(1 of 2 rows left\), which would add 300/.test(R['123'].cells.transTotal.title),
  true, 'and the cell names the row still outstanding and what it would add');
is(R['123'].cells.cull1Total.text, '0', '123\u2019s 1st culling is unsigned, so it counts nought');
is(R['123'].cells.cull2.text, '50', 'its 2nd culling is signed row by row, so it counts');
is(R['123'].cells.cull3.text, '0', 'its 3rd culling is unsigned');
is(R['123'].cells.cullTotal.text, '0', 'and the total made of the 1st and the 3rd follows them');

console.log('\n── 5. AND THE BALANCE IS CALCULATED, which is what was asked for ──');
/* transplant qty − 3rd culling − total sales + approved stock calibration,
   every term of it the verified one: 9,772 − 0 − 100 + 0. */
is(R['123'].cells.balance.text, '9,672', '123 balances on its verified figures');
is(R['123'].cells.balance.title.indexOf('This is the VERIFIED figure') === 0, true,
  'and says it is the verified one');
is(/transplanting \(1 of 2 rows left\)/.test(R['123'].cells.balance.title), true,
  'naming the transplanting row it is waiting on');
is(/3rd culling/.test(R['123'].cells.balance.title), true, 'and the 3rd culling too');
is(R['099'].cells.balance.title.indexOf('This is the VERIFIED figure') === 0, true,
  'a batch with nothing signed says the same');

console.log('\n── 5b. One tab, two cards — and only the signed one counts ──');
/* 121's 3rd culling IS signed and its transfer card is NOT. Both live on
   Tab 6, so a tally kept per TAB would take the culling away as well. */
is(R['121'].cells.cull3.text, '40', "121's 3rd Culling card is signed → it counts");
is(R['121'].cells.transfer.text, '0', 'its transfer card is not → that one does not');
is(/3rd-culling transfer/.test(R['121'].cells.transfer.title), true,
  'and the Transfer cell is the one that says so');
is(R['121'].cells.balance.text, '460', 'a transfer is not in the Balance, so the Balance is whole');

console.log('\n── 5c. WHAT THIS RULE COSTS ──');
/* Pinned rather than hidden. 097's seed in is signed and its planting is
   not, so Actual Planted is nought so far as anybody has signed — and the
   Variance reads as minus the whole delivery. That was the argument for the
   dash; the office chose this with it in front of them. */
is(R['097'].cells.received.text, '8,000', "097's seed in is signed, so it counts");
is(R['097'].cells.planted.text, '0', 'its planting is not, so Actual Planted is nought');
is(R['097'].cells.variance.text, '−8,000',
  'and the Variance reads minus the whole delivery — the known cost of the rule');
is(/Still to be signed off: planting/.test(R['097'].cells.variance.title), true,
  'the cell says what it is waiting on, which is the only thing that explains it');

console.log('\n── 6. Nothing is withheld, so nothing is a dash ──');
is(Object.keys(R).filter(b => Object.values(R[b].cells).some(c => c.text === '—')), [],
  'not one cell on the whole report is a dash');
is(await page.evaluate(() => document.querySelectorAll('.los-table tbody .los-held').length), 0,
  'and the style a withheld figure used to wear is on nothing');
is(await page.evaluate(() => !!document.querySelector('.los-table tbody .los-fig')), true,
  'every figure is still a button — the records behind it are what gets it signed');

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
is(/^⧗ 2 of 5 batches behind this total are not verified/.test(await drill('planted', '*')), true,
  'the TOTAL row says how many batches behind THAT figure are still waiting');
is(/^⧗ 1 of 5 batches behind this total are not verified/.test(await drill('cull3', '*')), true,
  'and it is a different count for a different column');
is(await drill('sales', '123'), '', 'sales open with no verification note — not a batch-report tab');

console.log('\n── 7. The report says once, above the table, that its figures will move ──');
const note = await page.evaluate(() => {
  const d = [...document.querySelectorAll('#report-output div')]
    .find(e => /Every figure below is the VERIFIED figure/.test(e.textContent));
  return d ? d.textContent.replace(/\s+/g, ' ').trim() : '';
});
is(/4 of 5 batches still carry records waiting for a signature/.test(note), true,
  'the count: ' + JSON.stringify(note));
is(/will rise as they are signed/.test(note), true,
  'and which way they are going to move, which is the thing a reader has to know');

/* The foot says it COLUMN BY COLUMN, because "4 batches are waiting" does
   not tell a reader WHICH total is going to rise — a batch can be signed
   off on its seed in and waiting on its 3rd culling. */
const foot = await page.evaluate(() => {
  const t = document.querySelector('.los-table tfoot tr:last-child');
  return t ? t.textContent.replace(/\s+/g, ' ').trim() : '';
});
is(/These totals are the VERIFIED figures and will rise as the rest is signed off/.test(foot), true,
  'the foot says so: ' + JSON.stringify(foot));
is(/Transplant Qty is waiting on 2 of 5/.test(foot), true, 'and names the column and the count');
is(/Seed Received is waiting on 1 of 5/.test(foot), true, 'for every column still waiting');

/* THE TOTAL IS THE PLAIN SUM OF THE ROWS NOW. It used to leave out any row
   whose stage was unsigned, because such a row showed a dash — and a column
   of dashes adding up to a number is the one shape of wrong that cannot be
   spotted. There are no dashes, so there is no hole. */
const colTotal = await page.evaluate(() => {
  const foot = document.querySelector('.los-table tfoot tr');
  const body = [...document.querySelectorAll('.los-table tbody tr')].filter(t => t.children.length === 17);
  const num = (el) => Number(String(el.textContent).replace(/[^0-9-]/g, '')) || 0;
  /* Balance is the last column. The foot row carries colspans (the variance
     pair), so it is read off the END rather than by index. */
  return { foot: num(foot.children[foot.children.length - 1]),
           rows: body.reduce((s, t) => s + num(t.children[16]), 0) };
});
is(colTotal.foot, colTotal.rows, 'the Balance total is exactly the sum of the Balances above it');

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
is(Object.keys(await readRows(page)).sort(), ['097', '099', '121', '123'], 'Awaiting verification → the other four');
is((await page.evaluate(() => document.querySelector('#report-output .glass-panel div[class*="tracking-widest"]').textContent))
   .includes('awaiting verification'), true, 'and the scope line says which slice this is');
await pick('f-los-verified', '');
is(Object.keys(await readRows(page)).length, 5, 'blank is no filter again');

console.log('\n── 9. The As At cut-off applies to the LINES, not the signatures ──');
// 123's 1st culling is dated Nov 2026 and is unsigned. As at Oct 2026 it has
// not happened, so there is nothing there to be unverified.
await pick('f-los-date', '2026-10-31');
R = await readRows(page);
is(R['123'].cells.cull1Total.held, false, 'as at 31 Oct 2026 the November culling has not happened, so nothing is held');
is(R['123'].cells.transTotal.held, false, 'nor the November transplanting');
is(R['123'].verdict, '', 'and the row says nothing either way, as at that date or any other');
await pick('f-los-date', '');

console.log('\n── 10. If the sign-off tables cannot be read, nothing is held back ──');
await page.close();
const broken = await open(true);
const BR = await readRows(broken.page);
is(Object.keys(BR).length, 5, 'every batch still listed');
/* FAILS OPEN, and that is the whole of it: a check that cannot run must not
   empty a report. Same reason access fails open. */
is(held(BR['099']), [], 'and not one figure is held back');
is(BR['099'].cells.transTotal.text, '1,000', 'every figure is the live ledger, checked or not');
is(BR['099'].verdict, '', 'and no batch claims a verdict either way');
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
