// Life of Plot, the real page in a real browser: a plot opens as its CYCLES (newest
// first, each with its own total), and the side bar's Transplant record by year
// is the office sheet — a row per plot, a column per month.
// Run: node tests/life_of_plot_reads_by_cycle.cjs   (SHOT=/dir draws both views)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const type = f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream';
  res.writeHead(200, { 'content-type': type }); fs.createReadStream(f).pipe(res);
});

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (d !== undefined ? ' -> ' + JSON.stringify(d) : '')); } };

const T = (plot, b, date, qty) => ({ plot_name: plot, transaction_type: 'Transplanted', transaction_date: date, quantity_change: qty, batch_name: b, remark: 'Date: ' + date, created_at: date + 'T00:00:00Z' });
const C = (type, plot, b, date, qty) => ({ plot_name: plot, transaction_type: type, transaction_date: null, quantity_change: qty, batch_name: b, remark: `Culled. MapQty: ${qty} CullDate: ${date}`, created_at: date + 'T00:00:00Z' });
const DATA = {
  shared_plots: [{ plot_name: 'B11', nursery_name: 'BNN' }, { plot_name: 'B13', nursery_name: 'BNN' }, { plot_name: 'U17', nursery_name: 'UNN 1' }],
  operation_nurseries: [],
  shared_inventory_logs: [
    T('B11', '228', '2025-05-22', 3074), T('B11', '229', '2025-05-22', 9047),
    C('2nd_Culling', 'B11', '228', '2025-09-14', 95), C('2nd_Culling', 'B11', '229', '2025-09-14', 69),
    C('3rd_Culling', 'B11', '228', '2026-06-12', 178), C('3rd_Culling', 'B11', '229', '2026-06-12', 2884),
    T('B11', '263', '2026-07-22', 1646), T('B11', '265', '2026-07-24', 7453),
    { plot_name: 'B11', transaction_type: 'Stock_Calibration', transaction_date: '2026-08-26', quantity_change: -127, batch_name: '265', remark: 'Report: Transplanting. Plot: B11. [APPROVED by x]' },
    C('2nd_Culling', 'B11', '263', '2026-11-12', 60), C('2nd_Culling', 'B11', '265', '2026-11-12', 41),
    T('B11', '269', '2026-09-10', 3168), T('B11', '271', '2026-10-24', 135),
    T('U17', '240', '2026-01-09', 6872), T('U17', '270', '2026-09-20', 4877), T('U17', '275', '2026-10-31', 2002),
  ],
};

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const B = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  async function openPage(data, errs) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    page.on('pageerror', e => errs.push(e.message));
    // Tailwind is refused here; .hidden is the one class the page shows and hides with.
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ contentType: 'text/javascript',
      body: "document.head.insertAdjacentHTML('beforeend','<style>.hidden{display:none!important}</style>');" }));
    await page.route('**/@supabase/supabase-js**', r => r.fulfill({ contentType: 'text/javascript', body: 'window.supabase={createClient:()=>window.__stub};' }));
    await page.route('**/shared/shared_staff_gate.js', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route('**/shared/shared_access.js', r => r.fulfill({ contentType: 'text/javascript',
      body: `window.MJMAccess={load:async()=>{},user:()=>({email:'t@t'}),canOpenOperationPage:()=>true};` }));
    await page.addInitScript((data) => {
      const q = (table) => {
        let rows = (data[table] || []).slice();
        const w = {
          select: () => w, order: () => w,
          in: (col, vals) => { rows = rows.filter(r => vals.indexOf(r[col]) >= 0); return w; },
          range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
          then: (okf, no) => Promise.resolve({ data: rows, error: null }).then(okf, no),
        };
        return w;
      };
      window.__stub = { from: q };
    }, data);
    return page;
  }
  const errs = [];
  const page = await openPage(DATA, errs);

  await page.goto(B + '/operation/operation_life_of_plot.html#plot=B11');
  await page.waitForSelector('#lp-timeline-box .lp-cyc', { timeout: 8000 }).catch(() => {});

  console.log('1. a plot opens as its cycles, newest first');
  const cyc = await page.evaluate(() => [...document.querySelectorAll('#lp-timeline-box .lp-cyc')].map(c => ({
    n: c.dataset.cycle, head: c.querySelector('.lp-cyc-h').textContent.replace(/\s+/g, ' ').trim(),
    batches: [...c.querySelectorAll('tbody td.batch')].map(td => td.textContent.trim()),
    total: [...c.querySelectorAll('tfoot td')].map(td => td.textContent.trim()),
  })));
  ok(cyc.length === 2, 'B11 shows two cycle cards', cyc.length);
  ok(cyc[0] && cyc[0].n === '2' && /Current/.test(cyc[0].head) && /12,275/.test(cyc[0].head) && /2026-07-22 → now/.test(cyc[0].head),
     'the current cycle is on top: 22 Jul 2026 to now, 12,275 transplanted this cycle', cyc[0] && cyc[0].head);
  ok(cyc[0] && cyc[0].batches.join() === '263,265,269,271', '…holding only its own batches', cyc[0] && cyc[0].batches);
  ok(cyc[1] && /Finished/.test(cyc[1].head) && /12,121/.test(cyc[1].head) && /2025-05-22 → 2026-06-12/.test(cyc[1].head) && cyc[1].batches.join() === '228,229',
     'cycle 1 under it: 228 + 229, 22 May 2025 to its 3rd cull 12 Jun 2026, 12,121', cyc[1] && cyc[1].head);
  ok(cyc[1] && cyc[1].total[0] === 'Cycle 1 total' && cyc[1].total.includes('3,062'), 'each cycle has its own total row (cycle 1 3rd cull 3,062)', cyc[1] && cyc[1].total);
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'lop_cycles.png'), fullPage: true });

  console.log('2. the side bar opens the transplant record by year');
  const side = await page.evaluate(() => [...document.querySelectorAll('#lp-side .lp-side-b')].map(b => b.lastChild.textContent.trim()));
  ok(side.join('|') === 'Plot Map|Transplant record by year|Settings', 'the side bar: Plot Map (PALMS and cycles together), the year record, Settings at the foot', side);
  await page.click('#lp-side button[data-view="record"]');
  await page.waitForTimeout(200);
  const rec = await page.evaluate(() => {
    const t = document.getElementById('lp-rec-table');
    const rowOf = n => { const tr = [...t.querySelectorAll('tbody tr')].find(r => r.firstElementChild && r.firstElementChild.textContent.trim() === n); return tr ? [...tr.children].slice(1).map(td => td.textContent.trim()) : null; };
    return { shown: !document.getElementById('lp-record').classList.contains('hidden') && document.getElementById('lp-plots-view').classList.contains('hidden'),
      head: [...t.querySelectorAll('thead th')].map(th => th.textContent.trim()),
      b11: rowOf('B11'), b13: rowOf('B13'), totBNN: rowOf('Total BNN'), sum26: rowOf('Total transplanted 2026'), sum25: rowOf('Total transplanted 2025'),
      years: [...document.querySelectorAll('#lp-year-row button')].map(b => b.textContent.trim() + (b.classList.contains('on') ? '*' : '')) };
  });
  ok(rec.shown, 'the record replaces the plot list');
  ok(rec.head.join() === 'Month,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,Total', 'a column per month, then the year total', rec.head);
  ok(rec.b11 && rec.b11.join('|') === '||||||8,972||3,168|135|||12,275', 'B11: Jul 8,972, Sep 3,168, Oct 135 — the office sheet, calibration included', rec.b11);
  ok(rec.b13 && rec.b13.every(v => v === ''), 'B13, never transplanted, keeps its empty row', rec.b13);
  ok(rec.totBNN && rec.totBNN[6] === '8,972' && rec.totBNN[12] === '12,275', 'BNN has a total row', rec.totBNN);
  ok(rec.sum26 && rec.sum26[0] === '6,872' && rec.sum25 && rec.sum25[4] === '12,121', 'summary on top: 2026 by month, and 2025 beside it', [rec.sum26, rec.sum25]);
  ok(rec.years[0] === '2026*' && rec.years.includes('2025'), 'the year chips, this year picked', rec.years);
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'lop_record.png'), fullPage: true });

  await page.click('#lp-year-row button[data-year="2025"]');
  const b11_25 = await page.evaluate(() => { const tr = [...document.querySelectorAll('#lp-rec-table tbody tr')].find(r => r.firstElementChild.textContent.trim() === 'B11'); return [...tr.children].slice(1).map(td => td.textContent.trim()); });
  ok(b11_25[4] === '12,121', 'picking 2025 shows May 2025: 12,121', b11_25);

  await page.click('#lp-rec-table tr.plotrow[data-plot="B11"]');
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => !document.getElementById('lp-detail').classList.contains('hidden') && document.querySelectorAll('#lp-timeline-box .lp-cyc').length);
  ok(back === 2, 'a plot in the record opens its cycles', back);

  console.log('3. changing a stage: the plot opens the PALMS board inside this page');
  const pageErrs = errs.length;
  await page.click('#lp-now-go');
  await page.waitForTimeout(300);
  const pb = await page.evaluate(() => ({
    shown: !document.getElementById('lp-palms').classList.contains('hidden'),
    others: ['lp-record', 'lp-plots-view'].every(id => document.getElementById(id).classList.contains('hidden')),
    src: document.getElementById('lp-palms-frame').getAttribute('src'),
    on: [...document.querySelectorAll('#lp-side .lp-side-b.on')].map(b => b.dataset.view),
    side: !!document.getElementById('lp-side').offsetParent,
    hash: location.hash }));
  const heads = await page.evaluate(() => [...document.querySelectorAll('#lp-side .lp-side-h')].map(h => h.textContent.trim()));
  ok(heads.join() === 'Life of Plot', 'PALMS has no section of its own: one heading, Life of Plot', heads);
  ok(pb.shown && pb.others, 'the Plot Status Map replaces the plot list and the record', pb);
  ok(pb.src === '../nursery_ops/nursery_ops_palms_board.html?embed=1', 'the frame opens the real PALMS board, embedded', pb.src);
  ok(pb.on.join() === 'plots' && pb.side, 'the side bar stays, with Plot Map lit', pb.on);
  ok(pb.hash === '#view=palms-board', 'the address says which, so a reload comes back to it', pb.hash);
  await page.click('#lp-side button[data-view="palms-stages"]');
  const ps = await page.evaluate(() => document.getElementById('lp-palms-frame').getAttribute('src'));
  ok(ps === '../nursery_ops/nursery_ops_palms_stages.html?embed=1', 'PALMS Settings opens the stage list', ps);
  await page.click('#lp-side button[data-view="plots"]');
  const backToPlots = await page.evaluate(() => document.getElementById('lp-palms').classList.contains('hidden') && !document.getElementById('lp-plots-view').classList.contains('hidden'));
  ok(backToPlots, 'and Plot Map comes back');

  // The embedded PALMS page drops its own navigation, so there is ONE side bar.
  const p2 = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await p2.route('**/*', r => { const u = r.request().url(); return u.startsWith(B) ? r.continue() : r.fulfill({ body: '', contentType: 'text/javascript' }); });
  const look = async (q) => { await p2.goto(B + '/nursery_ops/nursery_ops_palms_board.html' + q); await p2.waitForTimeout(500);
    return p2.evaluate(() => { const v = id => { const e = document.getElementById(id); return e ? getComputedStyle(e).display : 'absent'; }; return { nav: v('palms-nav'), ribbon: v('mjm-ribbon') }; }); };
  const emb = await look('?embed=1'), alone = await look('');
  ok(emb.nav === 'none' && emb.ribbon === 'none', 'embedded, the PALMS page hides its own side bar and ribbon', emb);
  ok(alone.nav !== 'none' && alone.ribbon !== 'none', 'opened on its own it is exactly as before', alone);
  await p2.close();
  ok(pageErrs === 0, 'no page errors on Life of Plot', errs.slice(0, pageErrs));

  console.log('4. with a nursery map on screen, the tabs top right choose the nursery; the Plot row stays');
  const pm = await openPage(Object.assign({}, DATA, { operation_nurseries: [{ name: 'BNN', map_image_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }] }), []);
  await pm.goto(B + '/operation/operation_life_of_plot.html');
  await pm.waitForSelector('#lp-map-tabs button', { timeout: 8000 }).catch(() => {});
  const nr = await pm.evaluate(() => ({ row: getComputedStyle(document.getElementById('lp-nursery-row')).display,
    label: getComputedStyle(document.getElementById('lp-nursery-label')).display,
    plots: [...document.querySelectorAll('#lp-plot-row button')].map(b => b.textContent.trim()),
    plotRow: getComputedStyle(document.getElementById('lp-plot-row')).display,
    list: [...document.querySelectorAll('#lp-plots tr.plotrow')].map(r => r.dataset.plot) }));
  ok(nr.row === 'none' && nr.label === 'none', 'the Nursery row below is not drawn; the tabs top right choose it', nr);
  ok(nr.plotRow !== 'none' && nr.plots.join() === 'All plots,B11,B13', 'the Plot row stays, following the nursery', nr.plots);
  ok(nr.list.join() === 'B11,B13', 'the list follows the map nursery (BNN)', nr.list);
  const tabsOf = () => pm.evaluate(() => ({ head: [...document.querySelectorAll('#lp-head-nur button')].map(b => b.textContent.trim() + (b.classList.contains('on') ? '*' : '')),
    inMap: [...document.querySelectorAll('#lp-map button[data-map]')].length }));
  const t1 = await tabsOf();
  ok(t1.head.join() === 'BNN*' && t1.inMap === 0, 'the nursery tabs are top right, once, and not on the map panel', t1);
  await pm.evaluate(() => setView('palms-board'));
  const t2 = await tabsOf();
  ok(t2.head.join() === 'BNN*', 'PALMS keeps the same tabs top right', t2);
  await pm.click('#lp-side button[data-view="record"]');
  const t3 = await tabsOf();
  ok(t3.head.length === 0, 'the year record (every nursery) shows none', t3);
  const navSrc = fs.readFileSync(path.join(ROOT, 'shared', 'shared_palms_nav.js'), 'utf8');
  ok(/EMBED_CSS[\s\S]{0,400}\.pm-tabs\{display:none/.test(navSrc), 'embedded, PALMS does not draw its own nursery tabs');
  await pm.close();

  console.log('5. PALMS and cycles on one map: the stage colours it, and each cycle carries its stages');
  const SQ = '[{"x":10,"y":10},{"x":40,"y":10},{"x":40,"y":40},{"x":10,"y":40}]';
  const L = (plot, n, start, end) => ({ client_uid: plot + n + start, plot_name: plot, act_n: n, start_date: start, end_date: end, ideal_days: null, recorded_by: 'Akbar', seq_no: 0 });
  const PD = Object.assign({}, DATA, {
    shared_plots: [{ plot_name: 'B11', nursery_name: 'BNN', map_top: SQ }, { plot_name: 'B13', nursery_name: 'BNN', map_top: SQ.replace(/10/g, '50').replace(/40/g, '80') }, { plot_name: 'U17', nursery_name: 'UNN 1' }],
    operation_nurseries: [{ name: 'BNN', map_image_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }],
    nops_plot_status_stages: [
      { id: 1, name: 'Saringan Anak Bibit', sort_order: 1, ideal_days: 14, color: '#2563eb' },
      { id: 2, name: 'Membesar', sort_order: 2, ideal_days: 270, color: '#16a34a' },
      { id: 3, name: 'Pengambilan', sort_order: 3, ideal_days: 30, color: '#d97706' } ],
    fcportal_palms_plot_logs: [
      L('B11', 1, '2025-05-20', '2025-06-03'), L('B11', 2, '2025-06-03', '2026-05-20'), L('B11', 3, '2026-05-20', '2026-06-12'),
      L('B11', 1, '2026-07-20', '2026-08-03'), L('B11', 2, '2026-08-03', null) ],
    fcportal_palms_history: [{ unit_key: 'B11', at_date: '2026-11-20', recorded_by: 'Akbar' }],
  });
  const pe = [];
  const pq = await openPage(PD, pe);
  await pq.goto(B + '/operation/operation_life_of_plot.html');
  await pq.waitForSelector('#lp-svg polygon', { timeout: 8000 }).catch(() => {});
  const m = await pq.evaluate(() => ({
    mode: [...document.querySelectorAll('#lp-mode button.on')].map(b => b.dataset.mode),
    fill: (document.querySelector('#lp-svg polygon[data-plot="B11"]') || {}).getAttribute && document.querySelector('#lp-svg polygon[data-plot="B11"]').getAttribute('fill'),
    label: [...document.querySelectorAll('#lp-labels .lp-label')].map(l => l.textContent.replace(/\s+/g, ' ').trim()),
    legend: document.getElementById('lp-legend').textContent,
    head: [...document.querySelectorAll('#lp-plots thead th')].map(t => t.textContent.trim()),
    row: [...(document.querySelector('#lp-plots tr.plotrow[data-plot="B11"]') || { children: [] }).children].map(t => t.textContent.trim()) }));
  ok(m.mode.join() === 'palms', 'with a plot log, the map opens coloured by PALMS stage', m.mode);
  ok(m.fill === 'rgba(22,163,74,0.55)', 'B11 is painted Membesar green', m.fill);
  ok(m.label.some(t => /^B11 ?Membesar · \d+d left ?Cycle 2 · 12,275$/.test(t)), 'B11 label: its stage and days left, then its cycle and capacity', m.label);
  ok(/Membesar/.test(m.legend) && /Overdue/.test(m.legend), 'the key is the stage colours', m.legend);
  ok(m.head.includes('PALMS stage') && m.head.includes('Last update'), 'the list carries the PALMS columns', m.head);
  ok(m.row[2] === 'Membesar' && /2026-11-20 · Akbar/.test(m.row[4]), 'B11 row: Membesar, last updated 20 Nov by Akbar', m.row);
  await pq.click('#lp-mode button[data-mode="cycle"]');
  const cf = await pq.evaluate(() => document.querySelector('#lp-svg polygon[data-plot="B11"]').getAttribute('fill'));
  ok(cf === 'rgba(251,191,36,.40)', 'Cycle status paints it in the field (amber)', cf);
  await pq.click('#lp-svg polygon[data-plot="B11"]');
  await pq.waitForSelector('#lp-timeline-box .lp-cyc', { timeout: 4000 }).catch(() => {});
  const d = await pq.evaluate(() => ({
    now: (document.querySelector('#lp-now-box .lp-now') || { textContent: '' }).textContent.replace(/\s+/g, ' '),
    strips: [...document.querySelectorAll('#lp-timeline-box .lp-cyc')].map(c => [...c.querySelectorAll('.lp-stg-c')].map(x => x.textContent.replace(/\s+/g, ' ').trim())) }));
  ok(/PALMS stage Membesar/.test(d.now) && /Update stage in PALMS/.test(d.now), 'the plot opens on where it is now, with the way to change it', d.now);
  ok(d.strips[0] && d.strips[0].length === 2 && /^Saringan Anak Bibit 2026-07-20 → 2026-08-03/.test(d.strips[0][0]) && /^Membesar 2026-08-03 → now/.test(d.strips[0][1]),
     'cycle 2 carries only its own stages, Membesar still running', d.strips[0]);
  ok(d.strips[1] && d.strips[1].length === 3 && /^Pengambilan 2026-05-20 → 2026-06-12/.test(d.strips[1][2]), 'cycle 1 carries the three stages of the round before', d.strips[1]);
  ok(pe.length === 0, 'no page errors with PALMS on the map', pe);
  if (process.env.SHOT) { await pq.screenshot({ path: path.join(process.env.SHOT, 'lop_combined_detail.png'), fullPage: true }); }
  await pq.close();

  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); server.close(); process.exit(1); });
