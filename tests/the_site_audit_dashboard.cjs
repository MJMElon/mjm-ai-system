// Nursery Dashboard → Audit & Compliance → Site Audit
// (reporting/nursery_dashboard.html, #audit).
//
// The office sheet "Site Audit Lines by EW" in [01] Nursery Dashboard 2026,
// read off the system: per plot and month, Collection (DO lines out of the
// plot) and its % of the plot capacity rounded DOWN, Collection plan = 90%
// of the transplant 9 months earlier, Transplanting (Transplanted rows) and
// its plan = the transplant 10 months earlier; and seedling height, a plot
// being the mean of its readings on its LAST audit day of the month.
// B1's own 2026 figures from the office screenshot are the fixture.
//
// Run: node tests/the_site_audit_dashboard.cjs   (starts its own server)
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const PAGE = 'reporting/nursery_dashboard.html';

let pass = 0, fail = 0;
const ok = (c, m, got) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (got !== undefined ? '  -> got ' + JSON.stringify(got) : '')); } };

let id = 1;
const T = (plot, d, q, viaRemark) => ({ id: id++, transaction_type: 'Transplanted', plot_name: plot, quantity_change: q,
  transaction_date: viaRemark ? null : d, created_at: '2027-01-01T00:00:00Z',
  remark: `Transplanted from tray [P1] to Main Plot [${plot}]. Date: ${d}` });
const DB = {
  shared_plots: [
    { plot_name: 'B1', nursery_name: 'BNN' }, { plot_name: 'B2', nursery_name: 'BNN' },
    { plot_name: 'B4-R', nursery_name: 'BNN' }, { plot_name: 'U1', nursery_name: 'UNN 1' },
  ],
  nops_maint_plot_qty: [ { nursery: 'BNN', plot: 'B1', qty: 2352 }, { nursery: 'BNN', plot: 'B2', qty: 3152 } ],
  shared_inventory_logs: [
    T('B1', '2025-03-11', 1734), T('B1', '2025-09-20', 612), T('B1', '2025-12-02', 1740, true),
    T('B1', '2026-06-15', 599), T('B1', '2026-08-03', 1754), T('B2', '2026-03-01', 3151),
  ],
  shared_do_records: [
    { id: 1, delivery_date: '2026-04-10', status: 'Completed', remark: '', plot_1: 'B1', qty_1: 87 },
    { id: 2, delivery_date: '2026-05-10', status: 'Completed', remark: '', plot_1: 'B1', qty_1: 400, plot_2: 'B1', qty_2: 39 },
    { id: 3, delivery_date: '2026-07-01', status: 'Completed', remark: '', plot_1: 'B1', qty_1: 1480 },
    { id: 4, delivery_date: '2026-07-02', status: 'Cancelled', remark: '', plot_1: 'B1', qty_1: 9999 },
    { id: 5, delivery_date: '2026-07-03', status: 'Completed', remark: 'x [CANCELLED]', plot_1: 'B1', qty_1: 5555 },
  ],
  audit_height_records: [
    { nursery: 'BNN', plot: 'B01', avg_height: 80, date: '2026-10-05' },
    { nursery: 'BNN', plot: 'B01', avg_height: 86, date: '2026-10-05' },
    { nursery: 'BNN', plot: 'B01', avg_height: 83, date: '2026-10-20' },
    { nursery: 'BNN', plot: 'B02', avg_height: 160, date: '2026-10-20' },
    { nursery: 'BNN', plot: 'B02', avg_height: null, date: '2026-10-25' },
  ],
};

console.log('\n1. the rules, lifted out of the shipped page');
const html = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');
const firstScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => /function buildRotation/.test(s));
const mod = { exports: {} };
if (!firstScript) { ok(false, 'the page carries buildRotation'); }
else new Function('module', firstScript)(mod);
const R = mod.exports;
if (R.buildRotation) {
  ok(R.saPlotsOf(DB.shared_plots, 'BNN').join() === 'B1,B2', 'BNN plots come off Seedling Stock, and B4-R (a replant plot) is left off', R.saPlotsOf(DB.shared_plots, 'BNN'));
  ok(R.saPlotsOf([], 'UNN2').length === 20, 'a nursery Seedling Stock holds nothing for falls back to its range');
  const tr = DB.shared_inventory_logs.map(r => ({ plot: r.plot_name, day: R.saDay(r), qty: r.quantity_change }));
  const sa = []; DB.shared_do_records.forEach(d => { if (d.status === 'Cancelled' || /\[CANCELLED\]/.test(d.remark)) return; for (let i = 1; i <= 5; i++) if (d['qty_' + i]) sa.push({ plot: d['plot_' + i], day: d.delivery_date, qty: d['qty_' + i] }); });
  const rows = R.buildRotation({ plots: ['B1', 'B2'], capacity: { B1: 2352, B2: 3152 }, transplants: tr, sales: sa, year: '2026', todayYM: '2026-10' });
  const b1 = rows[0].months;
  ok(b1[3].col === 87 && b1[3].colPct === 3, 'B1 April: 87 collected, 3% of 2,352 (rounded down)', [b1[3].col, b1[3].colPct]);
  ok(b1[4].col === 439 && b1[4].colPct === 18, 'B1 May: two DO lines add to 439, 18%', [b1[4].col, b1[4].colPct]);
  ok(b1[6].col === 1480 && b1[6].colPct === 62, 'B1 July: 1,480 (62%); both cancelled DOs left out', [b1[6].col, b1[6].colPct]);
  ok(b1[5].colPlan === 551, 'B1 June collection plan = 90% of September 2025 transplant 612 = 551', b1[5].colPlan);
  ok(b1[8].colPlan === 1566, 'B1 September collection plan = 90% of December 2025 transplant 1,740', b1[8].colPlan);
  ok(b1[0].trPlan === 1734, 'B1 January transplanting plan = the March 2025 transplant, 10 months earlier', b1[0].trPlan);
  ok(b1[6].trPlan === 612 && b1[9].trPlan === 1740, 'B1 transplanting plans: July 612, October 1,740 (dated by its remark)', [b1[6].trPlan, b1[9].trPlan]);
  ok(b1[5].tr === 599 && b1[7].tr === 1754, 'B1 transplanted: June 599, August 1,754', [b1[5].tr, b1[7].tr]);
  ok(b1[10].future && !b1[9].future, 'November is in the future, October is not', [b1[9].future, b1[10].future]);
  const H = R.buildHeights(DB.audit_height_records, 'BNN', '2026');
  ok(H.B1 && H.B1['2026-10'] === 0.83, 'B1 October height = its last audit day (20 Oct, 83 cm) = 0.83 m', H.B1);
  ok(H.B2 && H.B2['2026-10'] === 1.6, 'B2 October 1.60 m; a declined reading (no height) is skipped', H.B2);
}

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript(({ DB }) => {
    function q(table) {
      const st = { from: 0, to: 1e9, eq: null };
      const rows = () => {
        if (table === 'shared_profiles') return { data: { id: 'u1', full_name: 'Esther', email: 'e@x.com', user_type: 'system', permissions: { modules: { npayroll: 'normal' } } }, error: null };
        let r = (DB[table] || []).slice();
        if (st.eq) r = r.filter(x => x[st.eq[0]] === st.eq[1]);
        return { data: r.slice(st.from, Math.min(st.to, st.from + 999) + 1), error: null };
      };
      const self = {
        select() { return self; }, order() { return self; }, limit() { return self; }, or() { return self; }, neq() { return self; },
        is() { return self; }, not() { return self; }, in() { return self; },
        eq(c, v) { if (table !== 'shared_profiles') st.eq = [c, v]; return self; },
        range(a, b) { st.from = a; st.to = b; return self; },
        maybeSingle() { return Promise.resolve(rows()); }, single() { return Promise.resolve(rows()); },
        then(a, b) { return Promise.resolve(rows()).then(a, b); },
      };
      return self;
    }
    window.supabase = { createClient: () => ({
      from: q, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'e@x.com' } } }, error: null }),
              getUser: async () => ({ data: { user: { id: 'u1', email: 'e@x.com' } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {},
    }) };
  }, { DB });
  await page.goto(`http://localhost:${port}/${PAGE}`, { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(900);
  ok(await page.$('#card-audit') !== null, 'the Dashboard has a Site Audit card');
  await page.click('#rs [data-rs-cat="audit"]').catch(() => {}); await page.waitForTimeout(200);
  const item = await page.$('#rs [data-rs-item="site-audit"]');
  ok(!!item, 'Audit & Compliance in the sidebar holds Site Audit');
  if (item) { await item.click(); await page.waitForTimeout(300); }
  ok(await page.evaluate(() => location.hash) === '#audit' && await page.textContent('#page-title') === 'Site Audit'
     && await page.textContent('#page-crumb') === 'Audit & Compliance', 'Site Audit opens under Audit & Compliance');
  await page.selectOption('#sa-year', '2026').catch(() => {});
  await page.selectOption('#sa-hmonth', '10').catch(() => {});
  await page.waitForTimeout(200);
  const G = await page.evaluate(() => {
    const g = document.getElementById('sa-grid'); if (!g) return null;
    const kids = [...g.children];
    const plots = kids.filter(k => k.classList.contains('sa-plot')).map(k => k.textContent);
    const cells = kids.filter(k => k.classList.contains('sa-cell')).map(k => ({ cls: k.className, t: k.textContent.replace(/\s+/g, ' ').trim() }));
    return { plots, cells, months: kids.filter(k => k.classList.contains('sa-mh')).map(k => k.textContent) };
  });
  ok(G && G.months.join() === 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec', 'twelve month columns, in English', G && G.months);
  ok(G && G.plots[0] === 'B12,352 seedlings' && G.plots.length === 2, 'B1 named with its capacity, 2,352 seedlings; two BNN plots', G && G.plots);
  if (G) {
    const b1c = G.cells.slice(0, 12), b1t = G.cells.slice(12, 24);
    ok(b1c[3].t === '873%' && /c1/.test(b1c[3].cls), 'B1 April collection reads 87 · 3%, the lightest shade', b1c[3]);
    ok(b1c[6].t === '1,48062%' && /c2/.test(b1c[6].cls), 'B1 July collection 1,480 · 62%, the middle shade', b1c[6]);
    ok(b1c[5].t === 'Plan551' && /pc/.test(b1c[5].cls), 'B1 June: a dashed collection plan of 551', b1c[5]);
    ok(b1t[0].t === 'Plan1,734' && /pt/.test(b1t[0].cls), 'B1 January: a dashed transplanting plan of 1,734', b1t[0]);
    ok(b1t[5].t === '599' && /t1/.test(b1t[5].cls), 'B1 June: transplanted 599, solid green', b1t[5]);
    ok(b1t[9].t === 'Plan1,740', 'B1 October: transplanting plan 1,740', b1t[9]);
  }
  const Hh = await page.evaluate(() => ({
    bars: document.querySelectorAll('#sa-hchart svg .hit').length,
    suit: !!document.querySelector('#sa-hchart svg line.suit'),
    row: [...document.querySelectorAll('#sa-htable tbody tr')].map(tr => [...tr.cells].map(td => td.textContent)),
  }));
  ok(Hh.bars === 2 && Hh.suit, 'the height chart draws a bar per plot and the 1.5 m line', Hh);
  ok(JSON.stringify(Hh.row) === JSON.stringify([['Oct', '0.83', '1.60']]), 'the height table: October, B1 0.83, B2 1.60', Hh.row);
  ok(await page.textContent('#card-audit-tr') === '5,504', 'the card counts 2026 transplants across the nurseries (599 + 1,754 + 3,151)', await page.textContent('#card-audit-tr'));
  ok(errors.length === 0, 'no page errors', errors);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
