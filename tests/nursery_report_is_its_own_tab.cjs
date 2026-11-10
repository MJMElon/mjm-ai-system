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

/* 281 — a batch with two double-tone records, one in September (500) and
   one in October (200), so the month window has something to cut.
   282 — an ordinary batch that never touched the tray: NOT on the
   Double-Tone report, and under its own licence on the Seed In one. */
const LOGS = [
  log({ batch_name: '281', breed_name: 'UPB PREMIER', transaction_type: 'Seeds_Received',
        transaction_date: '2026-08-01', created_at: '2026-08-01T00:00:00Z', quantity_change: 10000,
        remark: 'Seeds received. Supplier: UPB. MPOB: 123-456. DO_Qty: 10000.' }),
  log({ batch_name: '281', transaction_type: 'Planted', transaction_date: '2026-08-02',
        plot_name: 'P1', quantity_change: 9000 }),
  log({ batch_name: '281', transaction_type: 'Damaged_Seeds', transaction_date: '2026-08-02',
        plot_name: 'Pre-Nursery', quantity_change: 300 }),
  log({ batch_name: '281', transaction_type: 'Transplanted_DoubleTone', transaction_date: '2026-09-01',
        plot_name: 'DOUBLE-TONE', quantity_change: 500, remark: 'Transplanted from tray [P1] to [DOUBLE-TONE]' }),
  log({ batch_name: '281', transaction_type: '1st_Culling', transaction_date: '2026-09-05',
        plot_name: 'DOUBLE-TONE', quantity_change: 50 }),
  log({ batch_name: '281', transaction_type: '1st_Culling', transaction_date: '2026-09-05',
        plot_name: 'P1', quantity_change: 200 }),
  log({ batch_name: '281', transaction_type: 'Transplanted', transaction_date: '2026-10-01',
        plot_name: 'U3', quantity_change: 300, remark: 'Transplanted from tray [DOUBLE-TONE] to Main Plot [U3]' }),
  log({ batch_name: '281', transaction_type: 'Transplanted_DoubleTone', transaction_date: '2026-10-05',
        plot_name: 'DOUBLE-TONE', quantity_change: 200, remark: 'Transplanted from tray [P1] to [DOUBLE-TONE]' }),
  log({ batch_name: '281', transaction_type: 'DTone_Nursery_Qty', transaction_date: '2026-10-02',
        created_at: '2026-10-02T00:00:00Z', quantity_change: 140, remark: 'Double tone qty in nursery' }),
  log({ batch_name: '281', transaction_type: 'DTone_Nursery_Qty', transaction_date: '2026-10-03',
        created_at: '2026-10-03T00:00:00Z', quantity_change: 160, remark: 'Double tone qty in nursery' }),
  log({ batch_name: '282', breed_name: 'IOI DxP', transaction_type: 'Seeds_Received',
        transaction_date: '2026-08-01', created_at: '2026-08-01T00:00:00Z', quantity_change: 2000,
        remark: 'Seeds received. Supplier: IOI. MPOB: 789-012. DO_Qty: 2000.' }),
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

console.log('\n── 4. The Double-Tone Report: the quantity put in, BY DATE ──');
/* The office replaced the first per-batch tray-arithmetic version with
   this in their own words: "double tone report is double tone quantity in
   nursery, generate the report by date. I want to see in the month we
   have how many double tone. Get the data from batch report -
   Transplanting reports". One line per Transplanting-tab record into the
   DOUBLE-TONE tray, cut by the month window, totalled. */
const runDT = (from, to) => page.evaluate(async ([f, t]) => {
  if (typeof runDoubleToneReport !== 'function') return { missing: 'no runDoubleToneReport on the page' };
  document.getElementById('f-nursery-sub').value = 'dtone';
  document.getElementById('f-from').value = f;
  document.getElementById('f-to').value = t;
  document.getElementById('f-breed').value = '';
  await runDoubleToneReport();
  const out = document.getElementById('report-output');
  return {
    heading: /Double-Tone Report/.test(out.textContent),
    rows: [...out.querySelectorAll('tbody tr')]
      .map(tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()))
      .filter(c => c.length > 1),
    foot: (out.querySelector('tfoot') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim(),
  };
}, [from, to]);

const dtAll = await runDT('', '');
if (dtAll.missing) { console.log('  FAIL', dtAll.missing); bad += 7; }
else {
  yes(dtAll.heading, 'the report draws under its own heading');
  is(dtAll.rows.length, 2, 'two records — one line per Transplanting-tab record, never a per-batch fold');
  is(dtAll.rows.map(r => r[4]), ['200', '500'], 'each line is its own quantity, newest day first');
  is((dtAll.rows[1] || []).slice(0, 4), ['01 Sep 2026', '281', 'UPB PREMIER', 'P1'],
    'a line carries the date, the batch, the breed and the tray it came out of');
  yes(/Grand Total/.test(dtAll.foot) && /700/.test(dtAll.foot),
    'the Grand Total answers "how many double tone" — 700 over all dates, got "' + dtAll.foot + '"');
  const dtSep = await runDT('2026-09-01', '2026-09-30');
  is(dtSep.rows.map(r => r[4]), ['500'], 'September holds the 500 alone');
  const dtOct = await runDT('2026-10-01', '2026-10-31');
  yes(dtOct.rows.length === 1 && /200/.test(dtOct.foot),
    'and October holds the 200 — the month window is the report');
}

console.log('\n── 5. The Seed In Report: licence subtotals and Seed Accounted ──');
const si = await page.evaluate(async () => {
  ['f-from', 'f-to', 'f-breed'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  window.selectedNurseries = () => [];
  await runSeedInReport();
  const out = document.getElementById('report-output');
  const heads = [...out.querySelectorAll('thead th')].map(th => th.textContent.trim());
  const bands = [...out.querySelectorAll('tbody tr')]
    .filter(tr => tr.children.length === 1).map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
  const subs = [...out.querySelectorAll('tbody tr')]
    .filter(tr => /Subtotal/.test(tr.textContent))
    .map(tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()));
  const row281 = [...out.querySelectorAll('tbody tr')].find(tr => tr.children.length > 1 && /281/.test(tr.children[1]?.textContent || ''));
  const cells281 = row281 ? [...row281.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()) : [];
  const foot = (out.querySelector('tfoot') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
  return { heads, bands, subs, cells281, foot };
});
is(si.heads.slice(4), ['Seed Received (D/O) + FOC Qty', 'Seed Accounted', 'Seed Damage', 'Variance'],
  'the office\'s column order: Received, Seed Accounted, Seed Damage, Variance');
yes(si.bands.some(b => /123-456/.test(b) && /UPB/.test(b)),
  'the group band is the LICENCE, with its supplier beside it — got ' + JSON.stringify(si.bands));
is(si.subs.length, 2, 'a subtotal per licence');
yes(si.subs.every(s => /Subtotal/.test(s[0])), 'each one says which licence it closes');
yes(/9,300/.test(si.cells281[4] || '') && /9,000 planted \+ 300 damaged/.test(si.cells281[4] || ''),
  '281\'s Seed Accounted reads 9,300 and says its halves (9,000 planted + 300 damaged) — got "' + si.cells281[4] + '"');
yes(/−700/.test((si.cells281[6] || '').replace(/\s/g, '')),
  'and its Variance is Accounted − Received: 9,300 − 10,000 = −700 — got "' + si.cells281[6] + '"');
yes(/Grand Total/.test(si.foot) && /11,100/.test(si.foot),
  'the Grand Total accounts 11,100 across both licences — got "' + si.foot + '"');
// 282 has no damage, so its Accounted carries NO sub-line — a split with
// an empty half is not drawn, the Life of Seedlings rule.
const si282 = await page.evaluate(() => {
  const tr = [...document.querySelectorAll('#report-output tbody tr')]
    .find(t => t.children.length > 1 && /282/.test(t.children[1]?.textContent || ''));
  return tr ? [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()) : [];
});
is(si282[4], '1,800', '282 (nothing damaged) reads a plain 1,800 with no planted/damaged sub-line');

console.log('\n── 6. The menu moves the report aside, and the pin holds it ──');
const pinBtn = await page.evaluate(() => !!document.getElementById('mv-pin'));
if (!pinBtn) { console.log('  FAIL no #mv-pin on the page'); bad += 7; }
else {
  const padAt = () => page.evaluate(() => getComputedStyle(document.body).paddingLeft);
  await page.mouse.move(900, 400);
  await page.waitForTimeout(350);
  is(await padAt(), '0px', 'mouse away: the report has the whole screen');
  await page.mouse.move(5, 400);   // the trigger strip at the left edge
  await page.waitForTimeout(400);
  is(await padAt(), '240px', 'the menu slides in and the report moves aside for it');
  await page.mouse.move(900, 400);
  await page.waitForTimeout(400);
  is(await padAt(), '0px', 'the menu hides and the report expands back');
  // Pin it: open the panel, press the pin, walk away — it must stand.
  await page.mouse.move(5, 400);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('mv-pin').click());
  await page.mouse.move(900, 400);
  await page.waitForTimeout(400);
  const pinned = await page.evaluate(() => ({
    cls: document.body.classList.contains('mv-pinned'),
    pad: getComputedStyle(document.body).paddingLeft,
    x: Math.round(document.getElementById('mv-report-sidebar').getBoundingClientRect().left),
  }));
  yes(pinned.cls && pinned.pad === '240px' && pinned.x === 0,
    'pinned: the menu stands with the mouse gone and the report stays aside — ' + JSON.stringify(pinned));
  // Run Report must NOT close a pinned menu.
  await page.evaluate(() => document.getElementById('f-run').click());
  await page.waitForTimeout(600);
  const afterRun = await page.evaluate(() =>
    Math.round(document.getElementById('mv-report-sidebar').getBoundingClientRect().left));
  is(afterRun, 0, 'Run Report does not hide a pinned menu');
  // The pin survives closing the page.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const back = await page.evaluate(() => ({
    cls: document.body.classList.contains('mv-pinned'),
    x: Math.round(document.getElementById('mv-report-sidebar').getBoundingClientRect().left),
  }));
  yes(back.cls && back.x === 0, 'come back to the page: still pinned — ' + JSON.stringify(back));
  // Unpin: back to the auto-hide exactly as before.
  await page.evaluate(() => document.getElementById('mv-pin').click());
  await page.mouse.move(900, 400);
  await page.waitForTimeout(400);
  const unpinned = await page.evaluate(() => ({
    pad: getComputedStyle(document.body).paddingLeft,
    x: Math.round(document.getElementById('mv-report-sidebar').getBoundingClientRect().left),
  }));
  yes(unpinned.pad === '0px' && unpinned.x < 0, 'unpinned: it hides itself again — ' + JSON.stringify(unpinned));
}

console.log('\n── 7. No page errors through all of it ──');
is(errs.length, 0, 'no page errors');

console.log('\n' + (bad ? bad + ' FAILED' : 'all checks passed'));
await browser.close();
process.exit(bad ? 1 : 0);
})();
