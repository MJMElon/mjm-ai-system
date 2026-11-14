// Nursery Dashboard → Seed Received Summary (reporting/nursery_dashboard.html).
//
// The figures are the batch report's own (calcPlanting in
// operation_batch_detail.html): Expected = the Seeds_Received row,
// Actual = Planted + Damaged, Variance = (Actual − Expected) / Expected,
// Damage % = Damaged / Expected against a 5% maximum. One reception per
// batch, the newest row wins, and the ledger is paged past 1,000 rows.
//
// Run: node tests/the_seed_received_summary.cjs   (starts its own server)
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const PAGE = 'reporting/nursery_dashboard.html';

let pass = 0, fail = 0;
const ok = (c, m, got) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (got !== undefined ? '  -> got ' + JSON.stringify(got) : '')); } };

// ── the ledger the office would have ──────────────────────────────────
const L = [];
let id = 1;
const add = (o) => L.push(Object.assign({ id: id++, created_at: (o.transaction_date || '2026-01-01') + 'T08:00:00Z', remark: '' }, o));
add({ transaction_type: 'Seeds_Received', batch_name: '270', breed_name: 'Calix 600', quantity_change: 10500, transaction_date: '2026-09-02', remark: 'Seeds received. Supplier: Sime Darby. MPOB: 1. D/O: SSO/2026/09/02. DO_Qty: 10000. Incl. 5% FOC.' });
add({ transaction_type: 'Planted', batch_name: '270', quantity_change: 6000, transaction_date: '2026-09-05' });
add({ transaction_type: 'Planted', batch_name: '270', quantity_change: 4100, transaction_date: '2026-09-05' });
add({ transaction_type: 'Damaged_Seeds', batch_name: '270', quantity_change: 327, transaction_date: '2026-09-05' });
add({ transaction_type: 'Seeds_Received', batch_name: '271', breed_name: 'Calix 600', quantity_change: 10000, transaction_date: '2026-10-03', remark: 'Seeds received. Supplier: FGV. DO_Qty: 10000.' });
add({ transaction_type: 'Planted', batch_name: '271', quantity_change: 9300, transaction_date: '2026-10-06' });
add({ transaction_type: 'Damaged_Seeds', batch_name: '271', quantity_change: 600, transaction_date: '2026-10-06' });
// 272: two reception rows, the newer one wins; nothing planted yet
add({ transaction_type: 'Seeds_Received', batch_name: '272', breed_name: 'DxP Yangambi', quantity_change: 5000, transaction_date: '2026-10-20', created_at: '2026-10-20T08:00:00Z', remark: 'Seeds received. Supplier: FGV.' });
add({ transaction_type: 'Seeds_Received', batch_name: '272', breed_name: 'DxP Yangambi', quantity_change: 8000, transaction_date: '2026-10-20', created_at: '2026-10-21T08:00:00Z', remark: 'Seeds received. Supplier: FGV.' });
// 273: 1,200 tray rows of one seed, so the read MUST page past 1,000
add({ transaction_type: 'Seeds_Received', batch_name: '273', breed_name: 'Calix 600', quantity_change: 1250, transaction_date: '2025-12-01', remark: 'Seeds received. Supplier: Sime Darby.' });
for (let i = 0; i < 1200; i++) add({ transaction_type: 'Planted', batch_name: '273', quantity_change: 1, transaction_date: '2025-12-03' });
add({ transaction_type: 'Damaged_Seeds', batch_name: '273', quantity_change: 0, transaction_date: '2025-12-03' });

// ── 1. the pure rules, lifted out of the shipped page ────────────────
console.log('\n1. the rules');
const html = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');
const firstScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => /function buildBatches/.test(s));
const mod = { exports: {} };
new Function('module', firstScript)(mod);
const { buildBatches, groupRows, reportBlocks } = mod.exports;
const B = buildBatches(L);
const by = Object.fromEntries(B.map(b => [b.batch, b]));
ok(by['270'].expected === 10500 && by['270'].actual === 10427, '270: expected 10,500, actual = 10,100 planted + 327 damaged', by['270']);
ok(by['270'].supplier === 'Sime Darby' && by['270'].breed === 'Calix 600', '270: supplier read off the remark, breed off the row', [by['270'].supplier, by['270'].breed]);
ok(by['270'].doNo === 'SSO/2026/09/02' && by['270'].purchased === 10000 && by['270'].focPct === 5, '270: D/O number, seed purchased and FOC % read off the remark', [by['270'].doNo, by['270'].purchased, by['270'].focPct]);
ok(by['272'].expected === 8000, '272: the NEWEST reception row wins, not the sum', by['272'].expected);
ok(by['272'].recorded === false, '272: no Seed Planting saved, so it is marked unrecorded');
const g = Object.fromEntries(groupRows(B, 'batch').map(x => [x.key, x]));
ok(Math.abs(g['270'].variancePct - (10427 - 10500) / 10500 * 100) < 1e-9, '270: variance = (actual − expected) ÷ expected', g['270'].variancePct);
ok(Math.abs(g['270'].damagePct - 327 / 10500 * 100) < 1e-9, '270: damage % = damaged ÷ expected (3.11%)', g['270'].damagePct.toFixed(2));
ok(g['271'].damagePct === 6, '271: 600 of 10,000 is 6%, over the 5% maximum', g['271'].damagePct);
const byBreed = Object.fromEntries(groupRows(B.filter(b => b.recorded), 'breed').map(x => [x.key, x]));
ok(byBreed['Calix 600'].n === 3 && byBreed['Calix 600'].expected === 21750, 'by breed: Calix 600 sums its three batches', byBreed['Calix 600']);
ok(Math.abs(byBreed['Calix 600'].damagePct - 927 / 21750 * 100) < 1e-9, 'by breed: % is worked on the sums, never an average of %', byBreed['Calix 600'].damagePct);
ok(groupRows(B, 'month').map(x => x.key).join() === '2025-12,2026-09,2026-10', 'by month: in calendar order', groupRows(B, 'month').map(x => x.key));
ok(groupRows(B, 'batch').map(x => x.key).join() === '270,271,272,273', 'by batch: in batch-number order');
const blocks = reportBlocks(B.filter(b => b.recorded), 'batch');
ok(blocks.map(b => b.supplier + '/' + b.breed).join() === 'FGV/Calix 600,Sime Darby/Calix 600', 'by batch: one report per supplier + breed, as the office sheet is', blocks.map(b => b.supplier + '/' + b.breed));
ok(reportBlocks(B, 'month').length === 1, 'by month: one report spanning every supplier');
ok(reportBlocks(B.filter(b => b.recorded && b.breed === 'Calix 600'), 'batch', true).length === 1, 'a breed picked with no supplier: ONE report, every supplier together');

// ── 2. the real page, in a real browser ──────────────────────────────
console.log('\n2. the page');
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  const ext = path.extname(p);
  res.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('  playwright missing'); process.exit(1); }
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  async function open(perms) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.addInitScript(({ ledger, perms }) => {
      window.__ranges = 0;
      window.print = () => { window.__printed = (window.__printed || 0) + 1; };
      function q(table) {
        const st = { from: 0, to: 1e9, types: null };
        const rows = () => {
          if (table === 'shared_profiles') return { data: { id: 'u1', full_name: 'Esther', email: 'e@x.com', user_type: 'system', permissions: perms }, error: null };
          if (table !== 'shared_inventory_logs') return { data: [], error: null };
          let r = ledger.filter(x => !st.types || st.types.includes(x.transaction_type)).sort((a, b) => a.id - b.id);
          const cap = Math.min(st.to, st.from + 999);   // PostgREST: 1,000 a page, at most
          return { data: r.slice(st.from, cap + 1), error: null };
        };
        const self = {
          select() { return self; }, eq() { return self; }, order() { return self; }, limit() { return self; },
          or() { return self; }, neq() { return self; }, is() { return self; }, not() { return self; },
          in(col, v) { st.types = v; return self; },
          range(a, b) { window.__ranges++; st.from = a; st.to = b; return self; },
          maybeSingle() { return Promise.resolve(rows()); }, single() { return Promise.resolve(rows()); },
          then(a, b) { return Promise.resolve(rows()).then(a, b); },
        };
        return self;
      }
      window.supabase = { createClient: () => ({
        from: q, rpc: () => Promise.resolve({ data: [], error: null }),
        auth: {
          getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'e@x.com' } } }, error: null }),
          getUser: async () => ({ data: { user: { id: 'u1', email: 'e@x.com' } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null }),
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {},
      }) };
    }, { ledger: L, perms });
    await page.goto(`http://localhost:${port}/${PAGE}`, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(900);
    return { page, errors };
  }

  const { page, errors } = await open({ modules: { npayroll: 'normal' } });
  const vis = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden'); }, sel);
  ok(await vis('#dash-home') && !(await vis('#dash-seed')), 'the dashboard opens on All reports, with the cards');
  ok(await page.$$eval('#dash-tabs .dash-tab', b => b.map(x => x.textContent.trim()).join('|')) === 'All reports|Seed Received Summary', 'a tab per report');
  ok(await page.textContent('#card-seed-n') === '2', 'the Seed Received card counts the latest year (2026): 270 and 271', await page.textContent('#card-seed-n'));
  ok(await page.textContent('#card-seed-dmg') === (927 / 20500 * 100).toFixed(2) + '%', 'the card shows the year\'s damage %', await page.textContent('#card-seed-dmg'));
  ok(errors.length === 0, 'no page errors', errors);
  ok(await page.evaluate(() => window.__ranges) >= 2, 'the ledger is read in pages', await page.evaluate(() => window.__ranges));

  await page.click('#card-seed');
  await page.waitForTimeout(150);
  ok(await vis('#dash-seed') && !(await vis('#dash-home')), 'the card opens the Seed Received Summary tab');
  ok(await page.inputValue('#f-year') === '2026', 'the report opens on the latest year');

  // ── the screen: four equal cards, two charts, one batch details table ──
  const S = await page.evaluate(() => {
    const kp = id => [...document.querySelectorAll(id + ' .kpi')].map(k => ({ l: k.querySelector('.kpi-l').textContent, v: k.querySelector('.kpi-v').textContent, w: Math.round(k.getBoundingClientRect().width) }));
    const t = document.querySelector('#seed-body table.bd');
    const heads = t ? [...t.querySelectorAll('thead th')].map(th => th.textContent.trim()) : [];
    const rows = t ? [...t.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => td.textContent.trim())) : [];
    const al = t ? [...t.querySelectorAll('thead th')].map(th => getComputedStyle(th).textAlign) : [];
    const c1 = document.querySelector('#seed-body .c1 svg');
    return { k1: kp('#k1'), k2: kp('#k2'), heads, rows, al, sticky: t && getComputedStyle(t.querySelector('thead th')).position,
             company: /MEGA JUTAMAS/.test(document.querySelector('#seed-body').textContent),
             yticks: c1 ? [...c1.querySelectorAll('.ytick')].map(x => x.textContent) : [],
             xticks: c1 ? [...c1.querySelectorAll('.xtick')].map(x => x.textContent) : [],
             ytitle: c1 && (c1.querySelector('.ytitle') || {}).textContent, xtitle: c1 && (c1.querySelector('.xtitle') || {}).textContent,
             vlabels: c1 ? [...c1.querySelectorAll('.vlabel')].map(x => x.textContent) : [],
             step: !!(c1 && c1.querySelector('path.step')), bars: c1 ? c1.querySelectorAll('.hit').length : 0,
             ref2: document.querySelectorAll('#seed-body .c2 svg line.ref').length,
             y2title: (document.querySelector('#seed-body .c2 svg .ytitle') || {}).textContent };
  });
  ok(S.k1.map(k => k.l).join('|') === 'Total Batches|Total Seed Expected|Actual Seed Received|Variance', 'four summary cards, named as asked', S.k1.map(k => k.l));
  ok(new Set(S.k1.map(k => k.w)).size === 1, 'the four cards are the same width', S.k1.map(k => k.w));
  ok(S.k1[1].v === '20,500' && S.k1[2].v === '20,327', 'cards read 20,500 and 20,327 in full, never 20.5k', S.k1.map(k => k.v));
  ok(S.ytitle === 'Seed Quantity (Seeds)' && S.xtitle === 'Batch Number', 'the chart titles both axes', [S.ytitle, S.xtitle]);
  ok(S.yticks.join('|') === '0|5,000|10,000|15,000|20,000', 'the Y axis reads 0 · 5,000 · … · 20,000, with commas and no K', S.yticks);
  ok(S.xticks.join('|') === '270|271', 'the X axis reads 270, 271 — no B.', S.xticks);
  ok(S.step && S.bars === 2, 'green bars and the dashed expected line', [S.step, S.bars]);
  ok(S.vlabels.join('|') === '-0.70%|-1.00%', 'the variance sits above each batch', S.vlabels);
  ok(S.ref2 === 1 && S.y2title === 'Seed Damage (%)', 'the damage chart carries the 5% line and its own Y title', [S.ref2, S.y2title]);
  ok(!S.company, 'on screen: no company header — that is the print\'s');
  ok(S.sticky === 'sticky', 'the table header is sticky', S.sticky);
  const want = ['Batch', 'Received', 'Breed', 'Supplier', 'D/O No.', 'Seed Purchased', 'Total Seed Expected', 'Planted', 'Seed Damage', 'Actual Seed Received', 'Variance (%)', 'Seed Damage (%)', 'Maximum (%)', 'Status'];
  ok(S.heads.join('|') === want.join('|'), 'one batch details table keeps every column', S.heads);
  ok(S.al[0] === 'left' && S.al[2] === 'left' && S.al[6] === 'right' && S.al[10] === 'right', 'text left, figures right', S.al);
  const r270 = S.rows.find(r => r[0] === '270');
  ok(r270 && r270[1] === '02 Sep 2026' && r270[4] === 'SSO/2026/09/02' && r270[6] === '10,500' && r270[9] === '10,427' && r270[10] === '-0.70%', '270: 02 Sep 2026 · D/O · 10,500 · 10,427 · −0.70%', r270);
  const r271 = S.rows.find(r => r[0] === '271');
  ok(r271 && r271[8] === '600' && r271[11] === '6.00%' && r271[12] === '5%' && /Over/.test(r271[13]), '271: 600 · 6.00% · 5% · over', r271);
  ok(/left out/.test(await page.textContent('#foot-note')) && /272/.test(await page.textContent('#foot-note')), 'the page names the batch it left out');

  await page.check('#f-unplanted'); await page.waitForTimeout(100);
  let rowsNow = await page.$$eval('#seed-body table.bd tbody tr', trs => trs.map(tr => [...tr.cells].map(td => td.textContent.trim())));
  ok(rowsNow.some(r => r[0] === '272' && r[6] === '8,000'), 'ticking Include shows 272 at its newest 8,000', rowsNow.map(r => r[0]));
  await page.uncheck('#f-unplanted');

  // ── pages: a table longer than a page is cut into pages; totals cover all ──
  await page.selectOption('#f-year', ''); await page.waitForTimeout(100);
  await page.selectOption('#pg-size', '10').catch(() => {}); await page.waitForTimeout(80);
  ok((await page.$$eval('#seed-body table.bd tbody tr', t => t.length)) === 3 && /Showing 1–3 of 3/.test(await page.textContent('#pg-info')), 'the pager says what it shows', await page.textContent('#pg-info'));
  const foot = await page.$$eval('#seed-body table.bd tfoot td', t => t.map(x => x.textContent.trim()));
  ok(foot[0] === 'Total' && foot[7] === '20,600', 'the foot totals every row (planted 20,600 incl. 273\'s 1,200)', foot);

  await page.selectOption('#f-group', 'breed'); await page.waitForTimeout(100);
  rowsNow = await page.$$eval('#seed-body table.bd tbody tr', trs => trs.map(tr => [...tr.cells].map(td => td.textContent.trim())));
  ok(rowsNow.length === 1 && rowsNow[0][0] === 'Calix 600' && rowsNow[0][1] === '3', 'Show by Breed: one row, three batches', rowsNow);
  ok(await page.$eval('#seed-body .c1 .xtitle', x => x.textContent) === 'Breed', 'the X title follows Show by');

  await page.selectOption('#f-group', 'month'); await page.waitForTimeout(100);
  rowsNow = await page.$$eval('#seed-body table.bd tbody tr', trs => trs.map(tr => tr.cells[0].textContent.trim()));
  ok(rowsNow.join() === 'Dec 2025,Sep 2026,Oct 2026', 'Show by Month: written out, in order', rowsNow);

  await page.hover('#seed-body .c1 svg .hit');
  const tipTxt = await page.evaluate(() => { const t = document.getElementById('tip'); return t.classList.contains('hidden') ? '' : t.textContent; });
  ok(/1,250/.test(tipTxt) && !/k\b/i.test(tipTxt.replace(/Dec|batch/gi, '')), 'the tooltip gives exact figures', tipTxt);

  // ── print: three options, each built at the press ──
  await page.selectOption('#f-group', 'batch'); await page.selectOption('#f-year', '2026'); await page.waitForTimeout(100);
  await page.click('#btn-print'); await page.waitForTimeout(60);
  ok(await vis('#print-dlg'), 'Print asks which report first');
  ok(await page.$$eval('#print-dlg [data-print]', b => b.map(x => x.querySelector('b').textContent).join('|')) === 'Print chart + table|Print without table|Print table only', 'three print options', await page.$$eval('#print-dlg [data-print] b', b => b.map(x => x.textContent)));
  const readPrint = () => page.$$eval('#print-area .p-block[data-block]', bs => bs.map(r => ({
    meta: r.querySelector('.p-meta').textContent.replace(/\s+/g, ' '), filters: r.querySelector('.p-filters').textContent,
    company: /MEGA JUTAMAS SDN BHD/.test(r.textContent) && /SEED RECEIVED SUMMARY REPORT/.test(r.textContent),
    charts: r.querySelectorAll('.p-charts svg').length, table: !!r.querySelector('table.pt'),
    rows: [...r.querySelectorAll('table.pt tbody tr')].map(tr => [...tr.cells].map(td => td.textContent.trim())),
    yticks: [...r.querySelectorAll('.c1 .ytick')].map(x => x.textContent),
    signName: (r.querySelector('.sign-name') || {}).textContent, signDate: (r.querySelector('.sign-date') || {}).textContent, sigBox: !!r.querySelector('.sign-sig') })));
  await page.click('#print-dlg [data-print="both"]'); await page.waitForTimeout(80);
  ok(await page.evaluate(() => window.__printed) === 1 && !(await vis('#print-dlg')), 'an option closes the dialog and prints');
  let P = await readPrint();
  ok(P.length === 2 && /FGV/.test(P[0].meta) && /Sime Darby/.test(P[1].meta), 'printed: one block per supplier + breed', P.map(b => b.meta));
  ok(P.every(b => b.company && /Year: 2026/.test(b.filters) && /Show by: Batch/.test(b.filters)), 'printed: company title and the filters on every block', P.map(b => b.filters));
  ok(P.every(b => b.charts === 2 && b.table), 'chart + table: both charts and the table', P.map(b => [b.charts, b.table]));
  ok(P[1].rows.length === 1 && P[1].rows[0][6] === '10,500' && P[1].yticks.join('|') === '0|5,000|10,000|15,000|20,000', 'printed figures are in full', [P[1].rows[0], P[1].yticks]);
  const today = (() => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear(); })();
  ok(P.every(b => b.signName === 'Esther' && b.signDate === today && b.sigBox), 'printed: Prepared and Verified by whoever pressed Print, today, with a signature box', P.map(b => [b.signName, b.signDate]));
  await page.selectOption('#f-breed', 'Calix 600'); await page.waitForTimeout(80);
  await page.click('#btn-print'); await page.click('#print-dlg [data-print="both"]'); await page.waitForTimeout(80);
  const PB = await readPrint();
  ok(PB.length === 1 && /Supplier: All/.test(PB[0].meta) && /Breed: Calix 600/.test(PB[0].meta) && PB[0].rows.length === 2, 'breed picked, no supplier: one printed report with FGV and Sime Darby together', PB.map(b => [b.meta, b.rows.length]));
  await page.emulateMedia({ media: 'print' }); await page.setViewportSize({ width: 1032, height: 703 });
  const fit = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(fit <= 1032, 'printed: nothing is wider than the A4 page, so the browser does not shrink the sheet and leave paper under the signature', fit);
  await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1280, height: 1000 });
  await page.selectOption('#f-breed', ''); await page.waitForTimeout(80);
  ok(/\.sign\s*\{[^}]*margin-top:auto/.test(html) && /\.p-block\s*\{[^}]*display:flex[^}]*min-height:184mm/.test(html), 'the signature is pushed to the foot of the printed page');
  ok(/@page\s*\{\s*size:A4 landscape/.test(html) && /table\.pt thead\s*\{\s*display:table-header-group/.test(html) && /table\.pt tr\s*\{[^}]*break-inside:avoid/.test(html), 'A4 landscape, the header repeats, no row is cut');

  await page.click('#btn-print'); await page.click('#print-dlg [data-print="chart"]'); await page.waitForTimeout(80);
  P = await readPrint();
  ok(P.every(b => b.charts === 2 && !b.table), 'without table: charts only', P.map(b => [b.charts, b.table]));
  await page.click('#btn-print'); await page.click('#print-dlg [data-print="table"]'); await page.waitForTimeout(80);
  P = await readPrint();
  ok(P.every(b => b.charts === 0 && b.table), 'table only: no chart', P.map(b => [b.charts, b.table]));
  ok(await page.evaluate(() => window.__printed) === 4, 'each option printed once');
  await page.click('#btn-print'); await page.click('#print-cancel'); await page.waitForTimeout(40);
  ok(!(await vis('#print-dlg')) && await page.evaluate(() => window.__printed) === 4, 'Cancel prints nothing');
  ok((await page.evaluate(() => getComputedStyle(document.getElementById('print-area')).display)) === 'none', 'the printed report is not on the screen');

  await page.click('#dash-tabs .dash-tab[data-dash="home"]'); await page.waitForTimeout(100);
  ok(await vis('#dash-home'), 'All reports takes you back to the cards');
  ok(errors.length === 0, 'still no page errors', errors);
  await page.close();

  const closed = await open({ modules: { npayroll: 'normal' }, npayroll_actions: { dashboard: { view: false } } });
  ok(await closed.page.evaluate(() => !document.getElementById('forbidden').classList.contains('hidden')), 'a login with the Dashboard page closed is refused');
  await closed.page.close();

  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
