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
  ok(await page.$$eval('#dash-tabs .dash-tab', b => b.map(x => x.textContent.trim()).join('|')) === 'All reports|Seed Received Summary', 'a tab per report', await page.$$eval('#dash-tabs .dash-tab', b => b.map(x => x.textContent.trim())));
  ok(await page.textContent('#card-seed-n') === '2', 'the Seed Received card counts the latest year (2026): 270 and 271', await page.textContent('#card-seed-n'));
  ok((await page.textContent('#card-seed-dmg')) === (927 / 20500 * 100).toFixed(2) + '%' || (await page.textContent('#card-seed-dmg')) === (927 / 20500 * 100 - 0).toFixed(2) + '%', 'the card shows the year\'s damage %', await page.textContent('#card-seed-dmg'));
  ok(errors.length === 0, 'no page errors', errors);
  ok(await page.evaluate(() => window.__ranges) >= 2, 'the ledger is read in pages', await page.evaluate(() => window.__ranges));

  await page.click('#card-seed');
  await page.waitForTimeout(150);
  ok(await vis('#dash-seed') && !(await vis('#dash-home')), 'the card opens the Seed Received Summary tab');
  ok(await page.inputValue('#f-year') === '2026', 'the report opens on the latest year, as the sheet is one year at a time');

  // ON SCREEN: a dashboard, not the sheet.
  const readScreen = () => page.evaluate(() => {
    const tbl = cls => { const t = document.querySelector('#seed-body table.' + cls); if (!t) return null;
      return [...t.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => td.textContent.trim())); };
    return { g1: tbl('g1'), g2: tbl('g2'), company: /MEGA JUTAMAS/.test(document.querySelector('#seed-body').textContent),
             sign: !!document.querySelector('#seed-body .sign'), bars: document.querySelectorAll('#seed-body .c1 svg .hit').length };
  });
  const S = await readScreen();
  ok(S.g1 && S.g2, 'on screen: a dashboard with its two tables', S);
  ok(!S.company && !S.sign, 'on screen: no company header and no signature — those are the print\'s', S);
  ok(S.g1 && S.g1.map(r => r[0]).join() === '270,271' && S.bars === 2, 'on screen: one row and one column per batch', S.g1);
  const s270 = S.g1 && S.g1.find(r => r[0] === '270');
  ok(s270 && s270.includes('10,500') && s270.includes('10,427') && s270.includes('-0.70%') && s270.includes('SSO/2026/09/02'), 'on screen: 270 reads 10,500 · 10,427 · −0.70% with its D/O', s270);
  const s271 = S.g2 && S.g2.find(r => r[0] === '271');
  ok(s271 && s271.includes('6.00%') && /Over/.test(s271.join(' ')), 'on screen: 271 at 6.00% is over the maximum', s271);
  ok((await page.evaluate(() => getComputedStyle(document.getElementById('print-area')).display)) === 'none', 'the printed report is not on the screen');

  // ON PAPER: press Print (window.print is stubbed) and read what it built.
  const readBlocks = async () => { await page.click('#btn-print'); await page.waitForTimeout(80);
    return page.$$eval('#print-area .rep[data-block]', reps => reps.map(r => {
    const tbl = cls => { const t = r.querySelector('table.' + cls); if (!t) return null;
      const heads = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim());
      const rows = {}; t.querySelectorAll('tbody tr').forEach(tr => { const c = [...tr.cells].map(td => td.textContent.trim()); rows[c[0]] = c.slice(1); });
      return { heads, rows }; };
    return { meta: r.querySelector('.rep-meta').textContent.replace(/\s+/g, ' '), t1: tbl('t1'), t2: tbl('t2'),
             bars1: r.querySelectorAll('.c1 svg .hit').length, ref2: r.querySelectorAll('.c2 svg line[stroke-dasharray="6 4"]').length,
             company: /MEGA JUTAMAS SDN BHD/.test(r.textContent) && /SEED RECEIVED SUMMARY REPORT/.test(r.textContent),
             signName: (r.querySelector('.sign-name') || {}).textContent, signDate: (r.querySelector('.sign-date') || {}).textContent,
             sigBox: !!r.querySelector('.sign-sig') };
  })); };
  let R = await readBlocks();
  ok(await page.evaluate(() => window.__printed) === 1, 'Print builds the report and opens the print dialog');
  ok(R.length && R.every(b => b.company), 'printed: every page carries MEGA JUTAMAS SDN BHD / SEED RECEIVED SUMMARY REPORT', R.map(b => b.company));
  const today = (() => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear(); })();
  ok(R.every(b => b.signName === 'Esther' && b.signDate === today && b.sigBox), 'printed: Prepared and Verified by the person who pressed Print, today, with a signature box', R.map(b => [b.signName, b.signDate, b.sigBox]));
  ok(R.length === 2 && /FGV/.test(R[0].meta) && /Sime Darby/.test(R[1].meta) && /Calix 600/.test(R[1].meta), 'one report block per supplier + breed, named in its header', R.map(x => x.meta));
  const sd = R[1];
  ok(/B\.270/.test(sd.t1.heads[1]) && /SSO\/2026\/09\/02/.test(sd.t1.heads[1]), 'the batches go ACROSS, headed Batch / D/O number', sd.t1.heads);
  ok(sd.t1.rows['Seed Purchased'][0] === '10,000', 'Seed Purchased is the D/O quantity', sd.t1.rows['Seed Purchased']);
  const expKey = Object.keys(sd.t1.rows).find(k => /Seed Purchased with 5% FOC/.test(k));
  ok(!!expKey && sd.t1.rows[expKey][0] === '10,500', 'Seed Purchased with 5% FOC is the expected 10,500', Object.keys(sd.t1.rows));
  ok(sd.t1.rows['Actual Seed Received'][0] === '10,427' && sd.t1.rows['Variance (%)'][0] === '-0.70%', '270 reads 10,427 · −0.70%', [sd.t1.rows['Actual Seed Received'], sd.t1.rows['Variance (%)']]);
  const fg = R[0];
  ok(fg.t2.rows['Seed Damage'][0] === '600' && fg.t2.rows['Maximum (%)'][0] === '5%' && fg.t2.rows['Seed Damage (%)'][0] === '6.00%' && /Over/.test(fg.t2.rows['Status'][0]), '271: 600 · 5% · 6.00% · over', fg.t2.rows);
  ok(/Within/.test(sd.t2.rows['Status'][0]), '270 at 3.11% is within');
  ok(sd.bars1 === 1 && fg.bars1 === 1 && sd.ref2 === 1, 'each block draws its own two charts, the damage one with its 5% line', [sd.bars1, fg.bars1, sd.ref2]);
  ok(/left out/.test(await page.textContent('#foot-note')) && /272/.test(await page.textContent('#foot-note')), 'the page names the batch it left out');

  await page.check('#f-unplanted'); await page.waitForTimeout(100);
  R = await readBlocks();
  const fg2 = R.find(b => /FGV/.test(b.meta) && /Yangambi/.test(b.meta));
  ok(!!fg2 && fg2.t1.rows[Object.keys(fg2.t1.rows).find(k => /Seed Purchased with/.test(k))][0] === '8,000', 'ticking Include shows 272 at its newest 8,000, under its own breed', R.map(b => b.meta));
  await page.uncheck('#f-unplanted');

  await page.selectOption('#f-year', ''); await page.waitForTimeout(100);
  R = await readBlocks();
  const sd3 = R.find(b => /Sime Darby/.test(b.meta));
  ok(sd3 && sd3.t1.rows['Planted'].includes('1,200'), '273: all 1,200 tray rows counted — the read went past 1,000', sd3 && sd3.t1.rows['Planted']);

  await page.selectOption('#f-group', 'breed'); await page.waitForTimeout(100);
  R = await readBlocks();
  ok(R.length === 1 && /Calix 600/.test(R[0].t1.heads[1]) && /3 batches/.test(R[0].t1.heads[1]), 'Show by Breed: one block, Calix 600 over 3 batches', R.map(b => b.t1.heads));

  await page.selectOption('#f-group', 'month'); await page.waitForTimeout(100);
  R = await readBlocks();
  ok(R[0].t1.heads.slice(1, 4).map(h => h.slice(0, 8)).join('|') === 'Dec 2025|Sep 2026|Oct 2026', 'Show by Month: written out, in order', R[0].t1.heads);

  await page.hover('#seed-body .c1 svg .hit');
  ok(await page.evaluate(() => !document.getElementById('tip').classList.contains('hidden')), 'hovering a column shows its figures');
  ok(await page.$('#btn-print') !== null, 'the report has a Print button');
  await page.click('#dash-tabs .dash-tab[data-dash="home"]'); await page.waitForTimeout(100);
  ok(await vis('#dash-home'), 'All reports takes you back to the cards');
  await page.close();

  const closed = await open({ modules: { npayroll: 'normal' }, npayroll_actions: { dashboard: { view: false } } });
  ok(await closed.page.evaluate(() => !document.getElementById('forbidden').classList.contains('hidden')), 'a login with the Dashboard page closed is refused');
  await closed.page.close();

  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
