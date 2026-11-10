/* THE NURSERY REPORT IS ITS OWN TAB, AND THE SUBMISSION REPORT HOLDS THE REST.
 *
 * The office asked for the Summary Report (the 2nd-culling movement view,
 * 'summary_cull2') OUT of the Nursery Report's sub-selector and onto a tab
 * of its own — "Nursery report = direct summary report" — and for the tab
 * that keeps the sub-selector to be called Submission Report, holding
 * Summary Report (the view as submitted to MPOB, value 'summary' — the key
 * never moved), Transplanting, Seed In, Culling, and a NEW Double-Tone
 * Report.
 *
 * Driven through the REAL page in a real browser. Every read is guarded so
 * the run against the PREVIOUS code fails by name instead of dying — a
 * test that dies on the previous code proves nothing about it.
 *
 * Needs a server on the repo root:
 *   (cd .. && npx --yes http-server -p 8812 -s &)
 *   NODE_PATH=/opt/node22/lib/node_modules node tests/nursery_report_is_its_own_tab.cjs
 */
const { chromium } = require('playwright');

(async () => {

const B = 'http://127.0.0.1:8812';
let bad = 0;
const is = (g, w, what) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a !== b) { console.log('  FAIL', what, '\n        got ', a, '\n        want', b); bad++; }
  else console.log('  ok  ', what, '→', a);
};
const yes = (v, what) => (v ? console.log('  ok  ', what) : (console.log('  FAIL', what), bad++));

let id = 0;
const log = (o) => Object.assign({ id: ++id, plot_name: 'Pre-Nursery', quantity_change: 0, remark: '' }, o);

/* 281 — a batch that has lived through the whole D-Tone story: 500 pushed
   into the tray, 50 first-culled IN it, 300 out to a main plot, so 150
   standing — and the office keyed the nursery count twice, 140 then 160,
   so the newest wins and the row says there were two keyings.
   282 — an ordinary batch that never touched the tray: NOT on the report. */
const LOGS = [
  log({ batch_name: '281', breed_name: 'UPB PREMIER', transaction_type: 'Seeds_Received',
        transaction_date: '2026-08-01', created_at: '2026-08-01T00:00:00Z', quantity_change: 10000,
        remark: 'Seeds received. Supplier: UPB. DO_Qty: 10000.' }),
  log({ batch_name: '281', transaction_type: 'Planted', transaction_date: '2026-08-02',
        plot_name: 'P1', quantity_change: 9000 }),
  log({ batch_name: '281', transaction_type: 'Transplanted_DoubleTone', transaction_date: '2026-09-01',
        plot_name: 'DOUBLE-TONE', quantity_change: 500, remark: 'Transplanted from tray [P1] to [DOUBLE-TONE]' }),
  log({ batch_name: '281', transaction_type: '1st_Culling', transaction_date: '2026-09-05',
        plot_name: 'DOUBLE-TONE', quantity_change: 50 }),
  log({ batch_name: '281', transaction_type: '1st_Culling', transaction_date: '2026-09-05',
        plot_name: 'P1', quantity_change: 200 }),
  log({ batch_name: '281', transaction_type: 'Transplanted', transaction_date: '2026-10-01',
        plot_name: 'U3', quantity_change: 300, remark: 'Transplanted from tray [DOUBLE-TONE] to Main Plot [U3]' }),
  log({ batch_name: '281', transaction_type: 'DTone_Nursery_Qty', transaction_date: '2026-10-02',
        created_at: '2026-10-02T00:00:00Z', quantity_change: 140, remark: 'Double tone qty in nursery' }),
  log({ batch_name: '281', transaction_type: 'DTone_Nursery_Qty', transaction_date: '2026-10-03',
        created_at: '2026-10-03T00:00:00Z', quantity_change: 160, remark: 'Double tone qty in nursery' }),
  log({ batch_name: '282', breed_name: 'IOI DxP', transaction_type: 'Seeds_Received',
        transaction_date: '2026-08-01', created_at: '2026-08-01T00:00:00Z', quantity_change: 2000,
        remark: 'Seeds received. Supplier: IOI. DO_Qty: 2000.' }),
  log({ batch_name: '282', transaction_type: 'Planted', transaction_date: '2026-08-02',
        plot_name: 'P2', quantity_change: 1800 }),
];

const DATA = {
  shared_inventory_logs: LOGS,
  shared_plots: [{ plot_name: 'U3', nursery_name: 'UNN 1' }],
  operation_trays: [{ tray_name: 'P1', nursery_name: 'PN' }],
  shared_breeds: [{ name: 'UPB PREMIER' }, { name: 'IOI DxP' }],
  shared_do_records: [],
  shared_al_orders: [],
  operation_batch_verifications: [],
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
page.on('pageerror', e => { errs.push(e.message); console.log('  [err]', e.message.slice(0, 220)); });
await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ body: '', contentType: 'text/javascript' }));
await page.route('**/@supabase/supabase-js**', r => r.fulfill({ contentType: 'text/javascript',
  body: 'window.supabase={createClient:()=>window.__stub};' }));
await page.route('**/shared/shared_access.js', r => r.fulfill({ contentType: 'text/javascript',
  body: `window.MJMAccess={load:async()=>{},user:()=>({email:'t@t'}),canAccess:()=>true,
    canOpenOperationPage:()=>true,canDoOperation:()=>true,canOpenPage:()=>true,canDo:()=>true};` }));
await page.addInitScript((data) => {
  const q = (table) => {
    let rows = (data[table] || []).slice();
    const w = {
      select: () => w, order: () => w, like: () => w, not: () => w, limit: () => w,
      in: (col, vals) => { rows = rows.filter(r => vals.indexOf(r[col]) >= 0); return w; },
      eq: (col, val) => { rows = rows.filter(r => String(r[col] == null ? '' : r[col]) === String(val)); return w; },
      range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (ok, no) => Promise.resolve({ data: rows, error: null }).then(ok, no)
    };
    return w;
  };
  window.__stub = { from: q, rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: { user: { email: 't@t' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}, DATA);

await page.goto(B + '/operation/operation_reports.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

console.log('\n── 1. The tab bar: five tabs, in order ──');
const tabs = await page.evaluate(() =>
  [...document.querySelectorAll('#f-report-tabs .report-tab')].map(b => b.textContent.trim()));
is(tabs, ['Life of Seedling', 'Life of Plot', 'Nursery Report', 'Submission Report', 'Sales Listing'],
  'the five tabs');

console.log('\n── 2. Nursery Report is the Summary Report DIRECTLY ──');
await page.evaluate(() => { try { selectReport('nursery_report'); } catch (e) { window.__selErr = e.message; } });
await page.waitForTimeout(1200);
const nr = await page.evaluate(() => ({
  err: window.__selErr || '',
  subShown: !document.querySelector('.f-nursery-sub-wrap')?.classList.contains('hidden'),
  hasCull2Col: /2nd Culled/.test(document.getElementById('report-output')?.textContent || ''),
  hasNote: /2nd Culled is deducted from the Balance only while/.test(document.getElementById('report-output')?.textContent || ''),
  rangeShown: ![...document.querySelectorAll('.f-range')].every(el => el.classList.contains('hidden')),
  sortShown: ![...document.querySelectorAll('.f-sort')].every(el => el.classList.contains('hidden')),
}));
is(nr.err, '', 'selectReport(nursery_report) runs');
is(nr.subShown, false, 'NO Report sub-selector on this tab — the tab IS the report');
yes(nr.hasCull2Col, 'the output carries the 2nd Culled column (the main2 scope)');
yes(nr.hasNote, 'and the note explaining when the 2nd Culled deducts');
yes(nr.rangeShown && nr.sortShown, 'the movement filter set (As At + Sort By) is offered');

console.log('\n── 3. Submission Report holds the five sub-reports ──');
await page.evaluate(() => { try { selectReport('movement_report'); } catch (e) { window.__selErr2 = e.message; } });
await page.waitForTimeout(1200);
const sr = await page.evaluate(() => ({
  err: window.__selErr2 || '',
  subShown: !document.querySelector('.f-nursery-sub-wrap')?.classList.contains('hidden'),
  options: [...(document.getElementById('f-nursery-sub')?.options || [])].map(o => o.value + '=' + o.text),
  opensOn: document.getElementById('f-nursery-sub')?.value,
  hasNote: /2nd Culled is deducted from the Balance only while/.test(document.getElementById('report-output')?.textContent || ''),
}));
is(sr.err, '', 'selectReport(movement_report) runs');
is(sr.subShown, true, 'the Report sub-selector is back on this tab');
is(sr.options, ['summary=Summary Report', 'transplanting=Transplanting Report', 'seed_in=Seed In Report',
                'culling=Culling Report', 'dtone=Double-Tone Report'],
  'five sub-reports, Summary wearing the name the office gave it, Double-Tone new');
is(sr.opensOn, 'summary', 'it opens on Summary');
is(sr.hasNote, false, 'the as-submitted Summary carries NO 2nd-culling deduction note');

console.log('\n── 4. The Double-Tone Report ──');
const dt = await page.evaluate(async () => {
  if (typeof runDoubleToneReport !== 'function') return { missing: 'no runDoubleToneReport on the page' };
  const subEl = document.getElementById('f-nursery-sub');
  subEl.value = 'dtone';
  document.getElementById('f-to').value = '';
  document.getElementById('f-breed').value = '';
  await runDoubleToneReport();
  const out = document.getElementById('report-output');
  const row = [...out.querySelectorAll('tbody tr')].find(tr => /281/.test(tr.textContent)) || null;
  const cells = row ? [...row.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()) : [];
  return {
    heading: /Double-Tone Report/.test(out.textContent),
    batches: [...out.querySelectorAll('tbody tr')].length,
    has282: /282/.test(out.textContent),
    cells,
    foot: (out.querySelector('tfoot') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim(),
  };
});
if (dt.missing) { console.log('  FAIL', dt.missing); bad += 6; }
else {
  yes(dt.heading, 'the report draws under its own heading');
  is(dt.batches, 1, 'one row — the batch that touched the D-Tone tray');
  is(dt.has282, false, '282 never touched the tray and is not on it');
  is(dt.cells[1], '500', 'Into D-Tone Tray reads the 500 pushed in');
  is(dt.cells[2], '50', '1st Culled (D-Tone) reads the 50 culled IN the tray — not the 200 in P1');
  is(dt.cells[3], '300', 'Out to Main Plots reads the 300 that left for U3');
  is(dt.cells[4], '150', 'Standing in Tray is the arithmetic: 500 − 50 − 300');
  yes(/160/.test(dt.cells[5] || '') && /2 keyings/.test(dt.cells[5] || ''),
    'the keyed quantity shows the NEWEST (160) and says there were 2 keyings — got "' + dt.cells[5] + '"');
}

console.log('\n── 5. No page errors through all of it ──');
is(errs.length, 0, 'no page errors');

console.log('\n' + (bad ? bad + ' FAILED' : 'all checks passed'));
await browser.close();
process.exit(bad ? 1 : 0);
})();
