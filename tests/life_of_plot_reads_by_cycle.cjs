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
  // 228 and 229 sold out of B11, so their 3rd culling is open; nothing else has sold.
  shared_do_records: [{ id: 91, delivery_date: '2026-02-10', status: 'Completed', remark: '', plot_1: 'B11', qty_1: 2000, batch_1: '229', plot_2: 'B11', qty_2: 900, batch_2: '228' }],
  shared_inventory_logs: [
    T('B11', '228', '2025-05-22', 3074), T('B11', '229', '2025-05-22', 9047),
    C('2nd_Culling', 'B11', '228', '2025-09-14', 95), C('2nd_Culling', 'B11', '229', '2025-09-14', 69),
    C('3rd_Culling', 'B11', '228', '2026-06-12', 178), C('3rd_Culling', 'B11', '229', '2026-06-12', 2884),
    T('B11', '263', '2026-07-22', 1646), T('B11', '265', '2026-07-24', 7453),
    { plot_name: 'B11', transaction_type: 'Stock_Calibration', transaction_date: '2026-08-26', quantity_change: -127, batch_name: '265', remark: 'Report: Transplanting. Plot: B11. [APPROVED by x]' },
    C('2nd_Culling', 'B11', '263', '2026-11-12', 60), C('2nd_Culling', 'B11', '265', '2026-11-12', 41),
    T('B11', '269', '2026-09-10', 3168), T('B11', '271', '2026-10-24', 135),
    // the checker drone count on the 24 Oct card (keyed after the drone count existed)
    { plot_name: 'B11', transaction_type: 'Transplant_Card', transaction_date: '2026-10-24', quantity_change: 0, batch_name: '271', remark: 'Transplant card. Date: 2026-10-24 DroneQty:130 DroneBy:x', created_at: '2026-10-26T00:00:00Z' },
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
      body: `window.MJMAccess={load:async()=>{},user:()=>({email:'t@t'}),canOpenOperationPage:()=>true,isAdminOf:()=>!window.__notAdmin};` }));
    await page.addInitScript((data) => {
      const q = (table) => {
        let rows = (data[table] || []).slice();
        const w = {
          select: () => w, order: () => w,
          in: (col, vals) => { rows = rows.filter(r => vals.indexOf(r[col]) >= 0); return w; },
          eq: (col, v) => { rows = rows.filter(r => r[col] === v); return w; },
          maybeSingle: () => Promise.resolve({ data: rows[0] || null, error: null }),
          upsert: (row) => { (window.__writes = window.__writes || []).push({ table, row }); return Promise.resolve({ error: null }); },
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
  await page.waitForTimeout(600);

  console.log('1. a plot opens as its cycles, newest first');
  const cyc = await page.evaluate(() => [...document.querySelectorAll('#lp-timeline-box .lp-cyc')].map(c => ({
    n: c.dataset.cycle, head: c.querySelector('.lp-cyc-h').textContent.replace(/\s+/g, ' ').trim(),
    secs: [...c.querySelectorAll('table.lp-x thead tr.grp-h th')].map(x => x.textContent.trim()),
    heads: [...c.querySelectorAll('table.lp-x thead tr:not(.grp-h) th')].map(x => x.textContent.trim()).join(),
    batches: [...c.querySelectorAll('table.lp-x tbody td.batch')].map(td => td.textContent.trim()),
    rows: [...c.querySelectorAll('table.lp-x tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim()).join('|')),
    foot: [...c.querySelectorAll('table.lp-x tfoot td')].map(td => td.textContent.trim()).join('|'),
  })));
  ok(cyc.length === 2, 'B11 shows two cycle cards', cyc.length);
  ok(cyc[0] && cyc[0].n === '2' && /Current/.test(cyc[0].head) && /12,275/.test(cyc[0].head) && /2026-07-22 → now/.test(cyc[0].head),
     'the current cycle is on top: 22 Jul 2026 to now, 12,275 transplanted this cycle', cyc[0] && cyc[0].head);
  ok(cyc[0] && cyc[0].batches.join() === '263,265,269,271', '…holding only its own batches', cyc[0] && cyc[0].batches);
  ok(cyc[1] && /Finished/.test(cyc[1].head) && /12,121/.test(cyc[1].head) && /2025-05-22 → 2026-06-12/.test(cyc[1].head) && cyc[1].batches.join() === '228,229',
     'cycle 1 under it: 228 + 229, 22 May 2025 to its 3rd cull 12 Jun 2026, 12,121', cyc[1] && cyc[1].head);
  ok(cyc[0] && cyc[0].secs.join() === 'Batch,Transplanting,2nd Culling,3rd Culling' && cyc[0].heads === 'Date,Transplanted,Date,Alive,Dead,Culling rate (%),Date,Pending culling,Drone Count,Variance,Culling rate (%)', 'one table read across: Batch, then Transplanting, 7th Month 2nd Culling, 3rd Culling side by side', cyc[0] && cyc[0].secs);
  ok(cyc[1] && cyc[1].rows[0] === '228|2025-05-22|3,074|2025-09-14|2,979|95|3.09%|2026-06-12|178|178|0|5.79%',
     'batch 228 on one line: date and 3,074 transplanted; 2nd alive 2,979, dead 95, 3.09%; 3rd pending 178, drone 178, variance 0, 5.79%', cyc[1] && cyc[1].rows[0]);
  ok(cyc[1] && cyc[1].rows[1] === '229|2025-05-22|9,047|2025-09-14|8,978|69|0.76%|2026-06-12|2,884|2,884|0|31.88%', 'batch 229 below it', cyc[1] && cyc[1].rows[1]);
  ok(cyc[1] && cyc[1].foot === 'Total · plot||12,121||11,957|164|1.35%||3,062|3,062|0|25.26%', 'the cycle 1 total is the office B11 sheet: 11,957 / 164 / 1.35%, 3,062 / 25.26%', cyc[1] && cyc[1].foot);
  ok(cyc[0] && cyc[0].rows[1] === '265|2026-07-24|7,326|2026-11-12|7,285|41|0.56%|Est. Apr 2027', 'batch 265: census 7,326 after its -127 calibration', cyc[0] && cyc[0].rows[1]);
  ok(cyc[0] && cyc[0].rows[3] === '271|2026-10-24|135|Est. Feb 2027|Est. Jul 2027', 'a culling not keyed yet is one blank cell with when it is due: 2nd the 4th month, 3rd the 9th month after transplant', cyc[0] && cyc[0].rows[3]);
  ok(cyc[0] && cyc[0].foot.startsWith('Total · plot||12,275||12,174|101|0.82%|') && cyc[0].foot.endsWith('0.82%|'), 'cycle 2 total: transplanted 12,275, alive 12,174, dead 101, 0.82%', cyc[0] && cyc[0].foot);
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'lop_cycles.png'), fullPage: true });

  console.log('2. the side bar opens the transplant record by year');
  const side = await page.evaluate(() => [...document.querySelectorAll('#lp-side .lp-side-b')].map(b => b.lastChild.textContent.trim()));
  ok(side.join('|') === 'Plots & cycles|Transplant record by year|Pusingan Jualan & Transplant|PALMS|Settings', 'the side bar: the two Life of Plot views, PALMS, and Settings at the foot', side);
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
  { const ny = new Date().getFullYear(); ok(rec.years[0] === String(ny + 1) && rec.years[1] === ny + '*' && rec.years.includes('2025'), 'the year chips: next year too, this year picked', rec.years); }
  if (process.env.SHOT) await page.screenshot({ path: path.join(process.env.SHOT, 'lop_record.png'), fullPage: true });

  await page.click('#lp-year-row button[data-year="2025"]');
  const b11_25 = await page.evaluate(() => { const tr = [...document.querySelectorAll('#lp-rec-table tbody tr')].find(r => r.firstElementChild.textContent.trim() === 'B11'); return [...tr.children].slice(1).map(td => td.textContent.trim()); });
  ok(b11_25[4] === '12,121', 'picking 2025 shows May 2025: 12,121', b11_25);

  const before = await page.evaluate(() => { document.querySelector('#lp-rec-table tr.plotrow[data-plot="B11"] td:nth-child(5)').click(); return location.hash; });
  ok(!/plot=/.test(before), 'clicking a figure in the row does not open the plot', before);
  await page.hover('#lp-rec-table tr.plotrow[data-plot="B11"] td.has-tip[data-tip^="B11 · May 2025"]');
  const tip = await page.evaluate(() => { const e = document.getElementById('lp-tip'); return e && getComputedStyle(e).display !== 'none' ? e.textContent : ''; });
  ok(/^B11 · May 2025\nBatch 228: 3,074\nBatch 229: 9,047$/.test(tip), 'hovering a figure floats the batches it is made of', tip);
  await page.click('#lp-rec-table tr.plotrow[data-plot="B11"] td.batch');
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => !document.getElementById('lp-detail').classList.contains('hidden') && document.querySelectorAll('#lp-timeline-box .lp-cyc').length);
  ok(back === 2, 'a plot in the record opens its cycles', back);

  console.log('3. PALMS opens inside this page, under the same side bar');
  const pageErrs = errs.length;
  await page.click('#lp-side button[data-view="palms-board"]');
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
  ok(pb.on.join() === 'palms-board' && pb.side, 'the side bar stays, with Plot Status Map lit', pb.on);
  ok(pb.hash === '#view=palms-board', 'the address says which, so a reload comes back to it', pb.hash);
  await page.click('#lp-side button[data-view="palms-stages"]');
  const ps = await page.evaluate(() => document.getElementById('lp-palms-frame').getAttribute('src'));
  ok(ps === '../nursery_ops/nursery_ops_palms_stages.html?embed=1', 'PALMS Settings opens the stage list', ps);
  await page.click('#lp-side button[data-view="plots"]');
  const backToPlots = await page.evaluate(() => document.getElementById('lp-palms').classList.contains('hidden') && !document.getElementById('lp-plots-view').classList.contains('hidden'));
  ok(backToPlots, 'and Plots & cycles comes back');

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
    opened: (document.querySelector('#lp-timeline-box .lp-cyc') ? document.getElementById('lp-sub').textContent : ''),
    list: document.getElementById('lp-plots') ? 'a list' : 'none' }));
  ok(nr.row === 'none' && nr.label === 'none', 'the Nursery row below is not drawn; the tabs top right choose it', nr);
  ok(nr.plotRow !== 'none' && nr.plots.join() === 'B11,B13', 'the Plot row stays, following the nursery, with no All plots chip', nr.plots);
  ok(nr.list === 'none' && /^B11 ·/.test(nr.opened), 'no list of every plot: it opens straight on the first plot of the nursery (B11)', nr);
  const tabsOf = () => pm.evaluate(() => ({ head: [...document.querySelectorAll('#lp-head-nur button')].map(b => b.textContent.trim() + (b.classList.contains('on') ? '*' : '')),
    inMap: [...document.querySelectorAll('#lp-map button[data-map]')].length }));
  const t1 = await tabsOf();
  ok(t1.head.join() === 'BNN*' && t1.inMap === 0, 'the nursery tabs are top right, once, and not on the map panel', t1);
  await pm.click('#lp-side button[data-view="palms-board"]');
  const t2 = await tabsOf();
  ok(t2.head.join() === 'BNN*', 'PALMS keeps the same tabs top right', t2);
  await pm.click('#lp-side button[data-view="record"]');
  const t3 = await tabsOf();
  ok(t3.head.length === 0, 'the year record (every nursery) shows none', t3);
  const navSrc = fs.readFileSync(path.join(ROOT, 'shared', 'shared_palms_nav.js'), 'utf8');
  ok(/EMBED_CSS[\s\S]{0,400}\.pm-tabs\{display:none/.test(navSrc), 'embedded, PALMS does not draw its own nursery tabs');
  await pm.close();

  console.log('5. Pusingan Jualan & Transplant, off this page transplant record');
  const re = [];
  const pr = await openPage(Object.assign({}, DATA, {
    shared_do_records: [
      { id: 1, delivery_date: '2026-04-10', status: 'Completed', remark: '', plot_1: 'B11', qty_1: 1200, batch_1: '229' },
      { id: 3, delivery_date: '2026-05-10', status: 'Completed', remark: '', plot_1: 'B11', qty_1: 600, batch_1: '228 (B11)' },
      { id: 2, delivery_date: '2026-04-12', status: 'Cancelled', remark: '', plot_1: 'B11', qty_1: 9999 } ],
    nops_maint_plot_qty: [{ nursery: 'BNN', plot: 'B11', qty: 12000 }] }), re);
  await pr.goto(B + '/operation/operation_life_of_plot.html#view=rotation');
  await pr.waitForSelector('#lp-rot-tr .lp-rot-plot', { timeout: 8000 }).catch(() => {});
  await pr.click('#lp-rot-year button[data-ryear="2026"]').catch(() => {});
  const rot = await pr.evaluate(() => {
    const row = (id, plot) => { const g = [...document.getElementById(id).children]; const i = g.findIndex(x => x.classList.contains('lp-rot-plot') && x.querySelector('b').textContent === plot); return i < 0 ? null : g.slice(i + 1, i + 13).map(c => c.textContent.trim()); };
    return { shown: !document.getElementById('lp-rot').classList.contains('hidden'), on: [...document.querySelectorAll('#lp-side .lp-side-b.on')].map(b => b.dataset.view),
      tr: row('lp-rot-tr', 'B11'), sales: row('lp-rot-sales', 'B11'), title: document.getElementById('lp-title').textContent, sub: document.getElementById('lp-sub').textContent };
  });
  ok(rot.shown && rot.on.join() === 'rotation' && rot.title === 'Life of Plot' && /^Pusingan Jualan & Transplant/.test(rot.sub), 'the side bar opens Pusingan Jualan & Transplant; the heading stays Life of Plot', rot);
  ok(rot.tr && rot.tr[6] === '8,972' && rot.tr[8] === '3,168' && rot.tr[9] === '135', 'Pusingan Transplant B11 2026: Jul 8,972, Sep 3,168, Oct 135 — the transplant record', rot.tr);
  const capWords = await pr.evaluate(() => [...document.querySelectorAll('.lp-rot-plot')].some(e => /capacity/i.test(e.textContent)));
  ok(!capWords, 'the plot cell carries no capacity line', capWords);
  ok(rot.tr && rot.tr[2] === 'Plan12,121', 'Pusingan Transplant March plan: what went in 10 months earlier (May 2025, 12,121)', rot.tr && rot.tr[2]);
  ok(rot.sales && rot.sales[4] === '1,80015%', 'May reads CUMULATIVE: 1,200 + 600 = 1,800 collected, 15% of 12,000', rot.sales && rot.sales[4]);
  ok(rot.sales && rot.sales[3] === '1,20010%' && rot.sales[1] === 'Plan10,909', 'Pusingan Jualan B11: April 1,200 collected (10% of 12,000; the cancelled DO left out), February plan 90% of 12,121', rot.sales);
  ok(re.length === 0, 'no page errors', re);
  if (process.env.SHOT) await pr.screenshot({ path: path.join(process.env.SHOT, 'lop_rotation.png'), fullPage: true });
  await pr.close();

  console.log('6. the map shows four stages, with the key beside it');
  const SQ = (x, y) => JSON.stringify([{ x, y }, { x: x + 20, y }, { x: x + 20, y: y + 20 }, { x, y: y + 20 }]);
  const ago = m => { const d = new Date(); d.setDate(d.getDate() - Math.round(m * 30.44)); return d.toISOString().slice(0, 10); };
  const me = [];
  const pm6 = await openPage(Object.assign({}, DATA, {
    shared_plots: [{ plot_name: 'B11', nursery_name: 'BNN', map_top: SQ(5, 5) }, { plot_name: 'B13', nursery_name: 'BNN', map_top: SQ(30, 5) },
                   { plot_name: 'B12', nursery_name: 'BNN', map_top: SQ(55, 5) }, { plot_name: 'B14', nursery_name: 'BNN', map_top: SQ(5, 40) }],
    operation_nurseries: [{ name: 'BNN', map_image_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }],
    shared_inventory_logs: DATA.shared_inventory_logs.concat([
      { plot_name: 'B12', transaction_type: 'Transplanted', transaction_date: ago(8), quantity_change: 2000, batch_name: '250', remark: '', created_at: ago(8) + 'T00:00:00Z' },
      { plot_name: 'B14', transaction_type: 'Transplanted', transaction_date: ago(10), quantity_change: 3000, batch_name: '248', remark: '', created_at: ago(10) + 'T00:00:00Z' } ]),
    shared_do_records: [{ id: 1, delivery_date: ago(1), status: 'Completed', remark: '', plot_1: 'B14', qty_1: 500, batch_1: '248' }] }), me);
  await pm6.goto(B + '/operation/operation_life_of_plot.html');
  await pm6.waitForSelector('#lp-svg polygon', { timeout: 8000 }).catch(() => {});
  await pm6.waitForTimeout(400);
  const st6 = await pm6.evaluate(() => ({
    n: document.querySelectorAll('#lp-svg polygon').length, html: document.getElementById('lp-status').textContent,
    stage: Object.fromEntries([...document.querySelectorAll('#lp-svg polygon')].map(p => [p.dataset.plot, p.dataset.stage])),
    key: [...document.querySelectorAll('.lp-key .lp-key-r b')].map(b => b.textContent.trim()),
    beside: (() => { const v = document.getElementById('lp-viewport').getBoundingClientRect(), k = document.querySelector('.lp-key').getBoundingClientRect(); return k.left >= v.right - 1; })() }));
  ok(st6.key.join() === 'Empty,Growing,Collecting in 1 month,Collecting', 'the key names the four stages', st6.key);
  ok(st6.beside, 'the key stands beside the map', st6.beside);
  ok(await pm6.evaluate(() => !document.querySelector('.lp-key .lp-key-r span')), 'the key carries no explanation lines under the names', '');
  ok(st6.stage.B13 === 'empty' && st6.stage.B11 === 'growing' && st6.stage.B12 === 'soon' && st6.stage.B14 === 'selling',
     'B13 nothing standing: Empty · B11 4 months: Growing · B12 8 months, nothing collected: Collecting in 1 month · B14 on a DO: Collecting', st6);
  const sc = await pm6.evaluate(() => [...document.querySelectorAll('#lp-cats .lp-cat')].map(c => c.dataset.scene));
  const cnt = k => sc.filter(x => x === k).length;
  ok(cnt('growing') === 3 && cnt('empty') >= 2 && cnt('empty') <= 3 && cnt('soon') === 1 && cnt('selling') === 1, 'Membesar three cats (one per job), Empty two or three, one sitting, one lorry', sc);
  ok(await pm6.evaluate(() => !document.querySelector('#lp-labels .lp-cat, #lp-labels img')), 'the cats are on the map, not inside the labels', '');
  const lab6 = await pm6.evaluate(() => [...document.querySelectorAll('#lp-labels .lp-label')].map(l => l.textContent.trim()));
  ok(lab6.length > 0 && lab6.every(x => !/Cycle|No batch/.test(x)), 'a map label is the plot name only', lab6);
  const anim = await pm6.evaluate(() => [...document.querySelectorAll('#lp-cats img')].every(i => /\.webp$/.test(i.getAttribute('src'))));
  ok(anim, 'every cat on the map is the office animation (an animated picture)', anim);
  const cats = await pm6.evaluate(() => Promise.all([...document.querySelectorAll('#lp-cats img')].map(i => i.decode().then(() => i.naturalWidth > 0, () => false))));
  ok(cats.length >= 6 && cats.every(Boolean), 'every cat picture loads', cats);
  // They zoom WITH the map: a cat is a bigger thing on screen at 300% than at 100%.
  if (process.env.SHOT) await pm6.screenshot({ path: path.join(process.env.SHOT, 'lop_stages.png'), fullPage: true });
  const h1 = await pm6.evaluate(() => document.querySelector('.lp-cat[data-scene="soon"]').getBoundingClientRect().height);
  await pm6.click('.lp-zbtn[data-z="0.25"]'); await pm6.click('.lp-zbtn[data-z="0.25"]'); await pm6.click('.lp-zbtn[data-z="0.25"]'); await pm6.click('.lp-zbtn[data-z="0.25"]');
  const h2 = await pm6.evaluate(() => document.querySelector('.lp-cat[data-scene="soon"]').getBoundingClientRect().height);
  ok(h2 > h1 * 1.8, 'the cats grow when the map is zoomed in and shrink back out', { h1, h2 });
  ok(me.length === 0, 'no page errors on the map', me);
  if (process.env.SHOT) await pm6.screenshot({ path: path.join(process.env.SHOT, 'lop_stages_zoomed.png'), fullPage: true });
  await pm6.close();

  console.log('7. the stage is PALMS: the lining stages Empty, Membesar Growing, the 8th month Collecting in 1 month, Pengambilan Collecting');
  const L = (plot, n, start, end) => ({ client_uid: plot + n + start, plot_name: plot, act_n: n, start_date: start, end_date: end || null, ideal_days: 1, recorded_by: 'x', seq_no: 0 });
  const me7 = [];
  const pm7 = await openPage(Object.assign({}, DATA, {
    shared_plots: ['B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17'].map((p, i) => ({ plot_name: p, nursery_name: 'BNN', map_top: SQ(5 + (i % 4) * 24, 5 + Math.floor(i / 4) * 30) })),
    operation_nurseries: [{ name: 'BNN', map_image_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }],
    shared_inventory_logs: DATA.shared_inventory_logs.concat([
      { plot_name: 'B12', transaction_type: 'Transplanted', transaction_date: ago(7.5), quantity_change: 2000, batch_name: '250', remark: '', created_at: ago(7.5) + 'T00:00:00Z' },
      { plot_name: 'B16', transaction_type: 'Transplanted', transaction_date: ago(6.5), quantity_change: 2000, batch_name: '251', remark: '', created_at: ago(6.5) + 'T00:00:00Z' },
      { plot_name: 'B14', transaction_type: 'Transplanted', transaction_date: ago(10), quantity_change: 3000, batch_name: '248', remark: '', created_at: ago(10) + 'T00:00:00Z' },
      { plot_name: 'B17', transaction_type: 'Transplanted', transaction_date: ago(7.5), quantity_change: 3000, batch_name: '252', remark: '', created_at: ago(7.5) + 'T00:00:00Z' } ]),
    shared_do_records: [{ id: 1, delivery_date: ago(1), status: 'Completed', remark: '', plot_1: 'B14', qty_1: 500, batch_1: '248' }],
    fcportal_palms_plot_logs: [
      L('B11', 10, ago(4), ago(1)), L('B11', 11, ago(1)),          // ledger young, PALMS Pengambilan
      L('B12', 10, ago(7.5)),                                       // Membesar, 8th month
      L('B13', 10, ago(3)),                                         // Membesar, no ledger
      L('B14', 11, ago(3), ago(0.5)), L('B14', 4, ago(0.5)),        // sold out, Membersih now
      L('B15', 8, ago(0.2)),                                        // Lining
      L('B16', 10, ago(6.5)),                                       // Membesar, 7th month
    ] }), me7);
  await pm7.goto(B + '/operation/operation_life_of_plot.html');
  await pm7.waitForSelector('#lp-svg polygon', { timeout: 8000 }).catch(() => {});
  await pm7.waitForTimeout(600);
  const st7 = await pm7.evaluate(() => Object.fromEntries([...document.querySelectorAll('#lp-svg polygon')].map(p => [p.dataset.plot, p.dataset.stage])));
  ok(st7.B11 === 'selling', 'PALMS on Pengambilan is Collecting, whatever the ledger says', st7);
  ok(st7.B12 === 'soon', 'Membesar in the 8th month after transplant is Collecting in 1 month', st7);
  ok(st7.B16 === 'growing', 'Membesar in the 7th month is still Growing', st7);
  ok(st7.B13 === 'growing', 'Membesar with no ledger cycle is Growing', st7);
  ok(st7.B14 === 'empty', 'back on Membersih is Empty, though the ledger still has a sale', st7);
  ok(st7.B15 === 'empty', 'Lining is Empty', st7);
  ok(st7.B17 === 'soon', 'a plot PALMS has nothing open for reads the ledger: 8th month, Collecting in 1 month', st7);
  ok(me7.length === 0, 'no page errors with PALMS on the map', me7);
  await pm7.close();

  console.log('8. the 3rd culling opens once the batch has started selling, and only then');
  const e8 = [];
  const nomap = (plot, b, at, qty) => ({ plot_name: plot, transaction_type: '3rd_Culling', transaction_date: null, quantity_change: qty, batch_name: b, remark: 'Culled. 2ndCulled: 0, Sales: 0', created_at: at + 'T00:00:00Z' });
  const p8 = await openPage(Object.assign({}, DATA, {
    shared_inventory_logs: DATA.shared_inventory_logs.concat([nomap('U17', '270', '2026-11-05', 4877), nomap('U17', '275', '2026-11-05', 0)]),
    shared_do_records: [{ id: 1, delivery_date: '2026-11-01', status: 'Completed', remark: '', plot_1: 'U17', qty_1: 100, batch_1: '275' }] }), e8);
  await p8.goto(B + '/operation/operation_life_of_plot.html#plot=U17');
  await p8.waitForSelector('.lp-cyc tbody tr', { timeout: 8000 }).catch(() => {});
  await p8.waitForTimeout(600);
  const r8 = await p8.evaluate(() => {
    const o = {};
    document.querySelectorAll('.lp-cyc tbody tr').forEach(tr => { const c = [...tr.children].map(x => x.textContent.trim()); o[c[0]] = c; });
    return o;
  });
  ok(r8['270'] && /^Est\. /.test(r8['270'][r8['270'].length - 1] || '') && !r8['270'].includes('4,877', 3), '270 saved a 3rd culling of 4,877 and nothing is sold: the cell is the estimate, not 4,877', r8['270']);
  ok(r8['275'] && !/Est\./.test((r8['275'] || []).slice(4).join('|')) && r8['275'][5] === '0', '275 has started selling, so its 3rd culling shows', r8['275']);
  ok(e8.length === 0, 'no page errors', e8);
  await p8.close();

  console.log('9. Settings: the estimates, the map stages and the plans are the office own');
  const e9 = [];
  const SETV = { est2: 5, est3: 10, soonMonth: 8, colMonths: 8, colPct: 80, trMonths: 11, stages: { soon: { label: 'Ready soon', color: '#ff0000' } } };
  const d9 = Object.assign({}, DATA, {
    nops_maint_config: [{ key: 'life_of_plot_settings', txt_value: JSON.stringify(SETV) }],
    shared_do_records: [{ id: 1, delivery_date: '2026-04-10', status: 'Completed', remark: '', plot_1: 'B11', qty_1: 1200, batch_1: '229' }],
    nops_maint_plot_qty: [{ nursery: 'BNN', plot: 'B11', qty: 12000 }]
    });
  const p9 = await openPage(d9, e9);
  await p9.goto(B + '/operation/operation_life_of_plot.html#plot=U17');
  await p9.waitForSelector('.lp-cyc tbody tr', { timeout: 8000 }).catch(() => {});
  await p9.waitForTimeout(500);
  const est9 = await p9.evaluate(() => { const tr = [...document.querySelectorAll('.lp-cyc tbody tr')].find(r => r.children[0].textContent.trim() === '275'); return tr ? [...tr.children].map(c => c.textContent.trim()) : null; });
  ok(est9 && est9[3] === 'Est. Mar 2027' && est9[4] === 'Est. Aug 2027', '275 (Oct 2026): 2nd culling +5 months = Mar 2027, 3rd +10 = Aug 2027', est9);
  await p9.goto(B + '/operation/operation_life_of_plot.html#view=rotation');
  await p9.reload();
  await p9.waitForSelector('#lp-rot-tr .lp-rot-plot', { timeout: 8000 }).catch(() => {});
  await p9.click('#lp-rot-year button[data-ryear="2026"]').catch(() => {});
  const rot9 = await p9.evaluate(() => { const g = [...document.getElementById('lp-rot-tr').children]; const i = g.findIndex(x => x.classList.contains('lp-rot-plot') && x.querySelector('b').textContent === 'B11'); return i < 0 ? null : g.slice(i + 1, i + 13).map(c => c.textContent.trim()); });
  ok(rot9 && rot9[3] === 'Plan12,121', 'Transplanting plan 11 months earlier: April 2026 plans the May 2025 12,121', rot9 && rot9[3]);
  await p9.goto(B + '/operation/operation_life_of_plot.html#view=palms-stages');
  await p9.reload();
  await p9.waitForSelector('#lp-set .lp-set-sec', { timeout: 8000 }).catch(() => {});
  const s9 = await p9.evaluate(() => ({
    shown: !document.getElementById('lp-set').classList.contains('hidden'),
    est2: (document.getElementById('ls-est2') || {}).value, soon: (document.getElementById('ls-name-soon') || {}).value,
    col: (document.getElementById('ls-col-soon') || {}).value,
    selects: document.querySelectorAll('#lp-set select').length,
    save: document.querySelectorAll('[data-ls-save]').length, edit: document.querySelectorAll('[data-ls-edit]').length, locked: !!(document.getElementById('ls-est2') || {}).disabled }));
  ok(s9.shown && s9.est2 === '5' && s9.soon === 'Ready soon' && s9.col === '#ff0000' && s9.save === 0 && s9.edit === 3 && s9.locked, 'Settings shows what is saved, LOCKED, with an Edit per section for an admin', s9);
  const sw9 = await p9.evaluate(() => ({ swatch: document.querySelectorAll('#lp-set .lp-set-sw input[type=color]').length, loose: document.querySelectorAll('#lp-set input[type=color]').length }));
  ok(sw9.swatch === 4 && sw9.loose === 4, 'the colour is picked by pressing the swatch on the left; no second box on the right', sw9);
  ok(s9.selects === 0, 'no PALMS stage dropdowns on Settings', s9.selects);
  await p9.click('[data-ls-edit="cycles"]');
  await p9.click('[data-ls-edit="plans"]');
  const ed9 = await p9.evaluate(() => ({ est: document.getElementById('ls-est2').disabled, col: document.getElementById('ls-col-soon').disabled, saves: document.querySelectorAll('[data-ls-save]').length }));
  ok(!ed9.est && ed9.col && ed9.saves === 2, 'Edit opens that section only; the others stay locked', ed9);
  await p9.fill('#ls-est3', '12');
  await p9.fill('#ls-trm', '7');   // edited and NOT saved: another section
  await p9.click('[data-ls-save="cycles"]');
  await p9.waitForTimeout(300);
  const after9 = await p9.evaluate(() => ({ est: document.getElementById('ls-est3').disabled, trm: document.getElementById('ls-trm').value, trmOn: !document.getElementById('ls-trm').disabled }));
  ok(after9.est && after9.trm === '7' && after9.trmOn, 'after Save the section locks again; the other open section keeps what was typed', after9);
  const w9 = await p9.evaluate(() => (window.__writes || []).filter(w => w.table === 'nops_maint_config').map(w => w.row));
  const saved = w9.length ? JSON.parse(w9[w9.length - 1].txt_value) : null;
  ok(w9.length === 1 && w9[0].key === 'life_of_plot_settings' && saved && saved.est3 === 12 && saved.trMonths === 11 && saved.stages.soon.label === 'Ready soon', 'a section Save writes ONE row carrying its own change; another section unsaved edit is not written', saved);
  await p9.fill('#ls-colpct', '150');
  await p9.click('[data-ls-save="plans"]');
  await p9.waitForTimeout(200);
  const w9b = await p9.evaluate(() => (window.__writes || []).length);
  ok(w9b === 1, 'a figure out of range is refused, nothing written', w9b);
  ok(e9.length === 0, 'no page errors', e9);
  await p9.close();
  const p9n = await openPage(d9, []);
  await p9n.addInitScript(() => { window.__notAdmin = true; });
  await p9n.goto(B + '/operation/operation_life_of_plot.html#view=palms-stages');
  await p9n.waitForSelector('#lp-set .lp-set-sec', { timeout: 8000 }).catch(() => {});
  const n9 = await p9n.evaluate(() => ({ save: !!document.querySelector('[data-ls-save], [data-ls-edit]'), dis: (document.getElementById('ls-est2') || {}).disabled }));
  ok(!n9.save && n9.dis === true, 'not an Operation admin: Settings is read only', n9);
  await p9n.close();

  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); server.close(); process.exit(1); });
