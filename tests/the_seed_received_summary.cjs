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
add({ transaction_type: 'Seeds_Received', batch_name: '270', breed_name: 'Calix 600', quantity_change: 10500, transaction_date: '2026-09-02', remark: 'Seeds received. Supplier: Sime Darby. MPOB: 1. DO_Qty: 10000. Incl. 5% FOC.' });
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
const { buildBatches, groupRows } = mod.exports;
const B = buildBatches(L);
const by = Object.fromEntries(B.map(b => [b.batch, b]));
ok(by['270'].expected === 10500 && by['270'].actual === 10427, '270: expected 10,500, actual = 10,100 planted + 327 damaged', by['270']);
ok(by['270'].supplier === 'Sime Darby' && by['270'].breed === 'Calix 600', '270: supplier read off the remark, breed off the row', [by['270'].supplier, by['270'].breed]);
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
  const shown = await page.evaluate(() => !document.getElementById('seed-body').classList.contains('hidden'));
  ok(shown, 'a Nursery Reporting user sees the Seed Received Summary');
  ok(errors.length === 0, 'no page errors', errors);
  ok(await page.evaluate(() => window.__ranges) >= 2, 'the ledger is read in pages', await page.evaluate(() => window.__ranges));

  const rowsOf = id => page.$$eval(`#${id} tbody tr`, trs => trs.map(tr => [...tr.cells].map(td => td.textContent.trim())));
  let t1 = await rowsOf('t1');
  ok(t1.map(r => r[0]).join() === '270,271,273', 'table 1 lists the planted batches; 272 (not planted) is left out', t1.map(r => r[0]));
  const r273 = t1.find(r => r[0] === '273');
  ok(r273 && r273.includes('1,200'), '273: all 1,200 tray rows counted — the read went past 1,000', r273);
  const r270 = t1.find(r => r[0] === '270');
  ok(r270 && r270.includes('10,500') && r270.includes('10,427') && r270.includes('-0.70%'), '270 reads 10,500 · 10,427 · −0.70%', r270);
  ok(/left out/.test(await page.textContent('#foot-note')) && /272/.test(await page.textContent('#foot-note')), 'the page names the batch it left out');

  const t2 = await rowsOf('t2');
  const d271 = t2.find(r => r[0] === '271');
  ok(d271 && d271.includes('600') && d271.includes('5%') && d271.includes('6.00%') && /Over/.test(d271.join(' ')), '271: 600 · 5% · 6.00% · over the maximum', d271);
  ok(/Within/.test(t2.find(r => r[0] === '270').join(' ')), '270 at 3.11% is within');
  ok(await page.$$eval('#c1 svg .hit', h => h.length) === 3 && await page.$$eval('#c2 svg .hit', h => h.length) === 3, 'both charts draw one column per batch');
  ok(await page.$$eval('#c2 svg line[stroke-dasharray]', l => l.length) === 1, 'the damage chart carries the 5% line');

  await page.check('#f-unplanted');
  await page.waitForTimeout(100);
  t1 = await rowsOf('t1');
  ok(t1.map(r => r[0]).includes('272') && t1.find(r => r[0] === '272').includes('8,000'), 'ticking Include shows 272 at its newest 8,000', t1.find(r => r[0] === '272'));
  await page.uncheck('#f-unplanted');

  await page.selectOption('#f-group', 'breed');
  await page.waitForTimeout(100);
  t1 = await rowsOf('t1');
  ok(t1.length === 1 && t1[0][0] === 'Calix 600' && t1[0][1] === '3', 'Show by Breed: one row, three batches', t1);

  await page.selectOption('#f-group', 'supplier');
  await page.selectOption('#f-year', '2026');
  await page.waitForTimeout(100);
  t1 = await rowsOf('t1');
  ok(t1.map(r => r[0]).join() === 'FGV,Sime Darby', 'Show by Supplier, Year 2026: FGV and Sime Darby, 273 (2025) gone', t1.map(r => r[0]));

  await page.selectOption('#f-group', 'month');
  await page.selectOption('#f-year', '');
  await page.waitForTimeout(100);
  t1 = await rowsOf('t1');
  ok(t1.map(r => r[0]).join() === 'Dec 2025,Sep 2026,Oct 2026', 'Show by Month: written out, in order', t1.map(r => r[0]));

  await page.hover('#c1 svg .hit');
  ok(await page.evaluate(() => !document.getElementById('tip').classList.contains('hidden')), 'hovering a column shows its figures');
  await page.close();

  const closed = await open({ modules: { npayroll: 'normal' }, npayroll_actions: { dashboard: { view: false } } });
  ok(await closed.page.evaluate(() => !document.getElementById('forbidden').classList.contains('hidden')), 'a login with the Dashboard page closed is refused');
  await closed.page.close();

  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
