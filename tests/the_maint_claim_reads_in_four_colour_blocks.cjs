/* THE WORK MAINTENANCE CLAIM READS IN FOUR COLOUR BLOCKS -- now four groups
   of one neutral table (the module redesign took the tinted blocks out)

   The office asked for the claim to stop being eleven columns of look-alike
   figures in a bright indigo: a calm forest green for the page, one soft
   colour per job carried from its card down into its columns, a heavy line
   between jobs and a faint one inside a job, faint dashes, a small grey RM,
   bigger job headings, numbers that line up, a mint row on hover, and No. /
   Worker / Subtotal pinned while the jobs scroll.

   NONE OF IT MAY MOVE A FIGURE OR A WORD, so the first thing asked of the
   restyled table is that every cell reads exactly what it read before.

   Run: node tests/the_maint_claim_reads_in_four_colour_blocks.cjs
   with a static server on 8777 serving the repository root.
   SHOT=/path.png draws the sheet as the office sees it. */
const { chromium } = require('playwright');
const SHOT = process.env.SHOT || '';

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

const W = ['Ali Bin Hassan', 'Siti Aminah', 'Rousell Wayne', 'Muhamad Fauzan'];
const cap = {}, rm = {}, earned = {};
const CAP = [[1200, 840, 0, 560], [980, 0, 1500, 600], [0, 760, 1499, 0], [1100, 900, 1200, 480]];
W.forEach((w, i) => {
  const [a, b, c, d] = CAP[i];
  cap[w] = { pd: a, manuring: b, weeding: c, interrow: d, loading_seedlings: 0 };
  rm[w]  = { pd: a * 0.007, manuring: b * 0.01, weeding: c * 0.01, interrow: d * 0.008, loading_seedlings: 0 };
  earned[w] = rm[w].pd + rm[w].manuring + rm[w].weeding + rm[w].interrow;
});
const sum = (k, o) => W.reduce((s, w) => s + o[w][k], 0);
const SNAP = {
  workers: W, cap, rm, earned,
  capAll: { pd: sum('pd', cap), manuring: sum('manuring', cap),
            weeding: sum('weeding', cap) + 1,            // one bag nobody was ticked on: RM 0.01 not claimed
            interrow: sum('interrow', cap), loading_seedlings: 0 },
  rate:   { pd: 0.007, manuring: 0.01, weeding: 0.01, interrow: 0.008, loading_seedlings: 0.1 },
  capSum: { pd: sum('pd', cap), manuring: sum('manuring', cap), weeding: sum('weeding', cap), interrow: sum('interrow', cap), loading_seedlings: 0 },
  rmSum:  { pd: sum('pd', rm), manuring: sum('manuring', rm), weeding: sum('weeding', rm), interrow: sum('interrow', rm), loading_seedlings: 0 },
  grand:  W.reduce((s, w) => s + earned[w], 0)
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: SHOT ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => { errs.push('ALERT: ' + d.message()); d.dismiss(); });

  await page.addInitScript(() => {
    window.__PDFS = [];
    const fin = (v) => typeof v === 'number' && isFinite(v);
    function guard(method, args) {
      args.forEach((a, i) => {
        if (!fin(a)) throw new Error('Invalid arguments passed to jsPDF.' + method
                                   + ' (argument ' + (i + 1) + ' is ' + String(a) + ')');
      });
    }
    window.jspdf = { jsPDF: class {
      constructor() { this.page = 1; this.lines = []; this.rects = []; this.saved = null; window.__PDFS.push(this); }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {}
      setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect(x, y, w, h) { guard('rect', [x, y, w, h]); this.rects.push({ x, y, w, h, page: this.page }); }
      roundedRect(x, y, w, h, rx, ry) { guard('roundedRect', [x, y, w, h, rx, ry]); }
      line(a, b, c, d) { guard('line', [a, b, c, d]); }
      addPage() { this.page++; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.5; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { guard('text', [x, y]); this.lines.push({ t: String(t), x, y, page: this.page }); }
      addImage(im, fmt, x, y, w, h) { guard('addImage', [x, y, w, h]); }
      save(name) { this.saved = name; }
    } };
    function makeQuery() {
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve({ data: [], error: null }).then(a, b);
        if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null });
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      storage: { from: () => ({ upload: async () => ({ data: {}, error: null }),
                                getPublicUrl: () => ({ data: { publicUrl: '' } }),
                                remove: async () => ({ error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  });
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**']
                     .concat(SHOT ? [] : ['**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**'])) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderMaint === 'function'
                                && typeof window.renderLoading === 'function', { timeout: 20000 });
  await page.waitForTimeout(1200);

  /* Hand the page a VERIFIED month: the snapshot carries all five jobs,
     which is exactly what every month verified before this change holds. */
  await page.evaluate((snap) => {
    const v = { snapshot: snap, verified_by: 'u1', verified_at: '2026-11-01T08:00:00Z' };
    window.MJMPayrollLock = {
      ready: () => true,
      verificationOf: () => v,
      isSheetLocked: () => true,
      isMonthLocked: () => false,
      lockOf: () => null,
      load: async () => true
    };
    const sel = document.getElementById('maint-nursery');
    if (sel) sel.value = 'BNN';
    renderMaint();
    renderLoading();
  }, SNAP);

  await page.evaluate(() => {
    try { switchTab('payroll'); } catch (_) {}
    try { switchSub('maint'); } catch (_) {}
    renderMaint();
  });
  await page.waitForTimeout(150);
  const css = (sel, prop) => page.evaluate(([s, p]) => {
    const el = document.querySelector(s);
    return el ? getComputedStyle(el)[p] : 'no ' + s;
  }, [sel, prop]);

  console.log('\nNo figure has moved, and a money cell carries the number alone');
  const cells = await page.evaluate(() =>
    [...document.querySelectorAll('#maint-table tfoot td')].map(td => td.textContent.trim()));
  check('the Grand Total row carries the same figures, with no RM in a cell', cells,
        ['Grand Total', '3,280', '22.96', '2,500', '25.00', '4,199', '41.99',
         '1,640', '13.12', '103.07']);
  const row1 = await page.evaluate(() =>
    [...document.querySelectorAll('#maint-table tbody tr')[0].cells].map(td => td.textContent.trim()));
  check('the first worker row carries the same figures, with no RM in a cell', row1,
        ['1', 'Ali Bin Hassan', '1,200', '8.40', '840', '8.40', '—', '—', '560', '4.48', '21.28']);
  check('no data cell anywhere in the table says RM', await page.evaluate(() =>
    [...document.querySelectorAll('#maint-table tbody td, #maint-table tfoot td')]
      .filter(td => /RM\s?\d/.test(td.textContent)).length), 0);
  check('the headings still say RM', await page.evaluate(() =>
    [...document.querySelectorAll('#maint-table thead th')].filter(th => /\(RM\)/.test(th.textContent)).length), 5);

  console.log('\nThe page is forest green, in Plus Jakarta Sans, with numbers that line up');
  checkTrue('the body font is Plus Jakarta Sans', /^"?Plus Jakarta Sans/.test(await css('body', 'fontFamily')));
  check('the page background is the warm grey', await css('body', 'backgroundColor'), 'rgb(246, 248, 247)');
  check('the open sheet on the side bar is forest green',
        await css('.side-nav .side-btn[data-sub="maint"]', 'backgroundColor'), 'rgb(27, 67, 50)');
  check('the picked nursery circle is forest green', await css('#maint-nursery-pills .npill.on', 'backgroundColor'), 'rgb(27, 67, 50)');
  check('figures in the table are tabular', await css('#maint-table', 'fontVariantNumeric'), 'tabular-nums');
  const purple = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('body *').forEach(el => {
      const s = getComputedStyle(el);
      [s.backgroundColor, s.color, s.borderTopColor].forEach(c => {
        if (/rgb\(79, 70, 229\)|rgb\(67, 56, 202\)|rgb\(99, 102, 241\)|rgb\(124, 58, 237\)/.test(c)) bad.push(el.tagName + '.' + el.className);
      });
    });
    return bad.slice(0, 5);
  });
  check('nothing on the page is indigo any more', purple, []);

  /* THE REDESIGN TOOK THE COLOUR BLOCKS OUT, at the office's own ask: one
     neutral data table across the whole module, no tinted columns and no
     grid. A job keeps its colour as the DOT before its name, on its group
     heading and on its card -- so the two still match, by a mark rather
     than by a painted column. */
  console.log('\nEach job is a group in the ONE neutral table, its dot matching its card');
  const DOT = { pd: 'rgb(47, 158, 95)', manuring: 'rgb(217, 119, 6)', weeding: 'rgb(2, 132, 199)', interrow: 'rgb(13, 148, 136)' };
  const pseudo = (s, p) => page.evaluate(([s, p]) => { const el = document.querySelector(s);
    return el ? getComputedStyle(el, '::before')[p] : 'no ' + s; }, [s, p]);
  for (const [c, dot] of Object.entries(DOT)) {
    check(c + ': its heading is the neutral table heading', await css(`#maint-table thead th.job-title.job-${c}`, 'backgroundColor'), 'rgb(248, 250, 251)');
    check(c + ': its body cells are white, not tinted', await css(`#maint-table tbody tr:nth-child(2) td.job-${c}`, 'backgroundColor'), 'rgb(255, 255, 255)');
    check(c + ': its heading and its card carry the same dot', [await pseudo(`#maint-table thead th.job-title.job-${c}`, 'backgroundColor'),
          await pseudo(`#maint-glance .job-card.job-${c} .pt-label`, 'backgroundColor')], [dot, dot]);
    check(c + ': its card has no coloured bar along the top', await css(`#maint-glance .job-card.job-${c}`, 'borderTopWidth'), '1px');
  }
  check('a job heading is 12.5px bold', [await css('#maint-table th.job-title', 'fontSize'), await css('#maint-table th.job-title', 'fontWeight')], ['12.5px', '700']);
  check('the rate line is 12px medium', [await css('#maint-table th.job-rate', 'fontSize'), await css('#maint-table th.job-rate', 'fontWeight')], ['12px', '500']);
  check('Capacity / Total headings are 11px 600 capitals',
        [await css('#maint-table th.sub-h', 'fontSize'), await css('#maint-table th.sub-h', 'fontWeight'), await css('#maint-table th.sub-h', 'textTransform')],
        ['11px', '600', 'uppercase']);

  console.log('\nFour groups, no grid');
  check('ONE faint line opens each job', [await css('#maint-table tbody td.job-manuring.jg-start', 'borderLeftWidth'),
        await css('#maint-table tbody td.job-manuring.jg-start', 'borderLeftStyle')], ['1px', 'solid']);
  check('and no line at all between Capacity and Total',
        await css('#maint-table tbody td.job-manuring.jg-tot', 'borderLeftStyle'), 'none');
  check('every body row has 4 job openers and 4 job totals', await page.evaluate(() =>
    [...document.querySelectorAll('#maint-table tbody tr')].map(tr => [tr.querySelectorAll('.jg-start').length, tr.querySelectorAll('.jg-tot').length])),
    [[4, 4], [4, 4], [4, 4], [4, 4]]);
  check('no body cell carries a box of its own', await page.evaluate(() =>
    [...document.querySelectorAll('#maint-table tbody td')].filter(td => {
      const s = getComputedStyle(td); return s.borderTopStyle !== 'none' || s.borderRightStyle !== 'none'; }).length), 0);

  console.log('\nThe quiet parts are quiet');
  check('a dash is drawn faint', await css('#maint-table tbody td.nil', 'color'), 'rgb(203, 213, 225)');
  const align = await page.evaluate(() => {
    const sel = ['#maint-table tbody td.jg-start', '#maint-table tbody td.jg-tot', '#maint-table tbody td.stk-sub',
                 '#maint-table tfoot td.jg-start', '#maint-table tfoot td.jg-tot', '#maint-table thead th.sub-h'];
    return sel.map(q => [...document.querySelectorAll(q)].every(e => getComputedStyle(e).textAlign === 'right'));
  });
  check('every Capacity, Total and Subtotal figure and its heading is right-aligned', align, [true, true, true, true, true, true]);
  check('the decimal points of a Total column stand in one line', await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#maint-table tbody td.job-pd.jg-tot:not(.nil)')];
    const r = cells.map(td => { const g = document.createRange(); g.selectNodeContents(td);
      const t = [...td.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim());
      if (!t) return null; const i = t.nodeValue.indexOf('.'); g.setStart(t, i); g.setEnd(t, i + 1);
      return Math.round(g.getBoundingClientRect().left); });
    return r.length > 1 && r.every(x => x === r[0]);
  }), true);
  check('a Total figure is 13.5px 600', [await css('#maint-table tbody td.jg-tot:not(.nil)', 'fontSize'), await css('#maint-table tbody td.jg-tot:not(.nil)', 'fontWeight')], ['13.5px', '600']);
  check('a capacity is 13.5px regular', [await css('#maint-table tbody td.jg-start', 'fontSize'), await css('#maint-table tbody td.jg-start', 'fontWeight')], ['13.5px', '400']);
  check('a worker name is 13.5px 600', [await css('#maint-table tbody td.stk-w', 'fontSize'), await css('#maint-table tbody td.stk-w', 'fontWeight')], ['13.5px', '600']);
  const gap = await page.evaluate(() => {
    const g = document.querySelector('#maint-table .job-weeding .wd-gap');
    return g ? [g.textContent.trim(), getComputedStyle(g).backgroundColor, getComputedStyle(g).color] : null;
  });
  check('Weeding says RM 0.01 not claimed in a quiet error pill', gap, ['RM 0.01 not claimed', 'rgb(254, 242, 242)', 'rgb(185, 28, 28)']);

  console.log('\nThe Grand Total row is one band of forest green');
  check('every Grand Total cell is the same forest green, job blocks included', await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('#maint-table tfoot td')].map(td => getComputedStyle(td).backgroundColor))]),
    ['rgb(27, 67, 50)']);
  check('in white', await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('#maint-table tfoot td:not(.nil)')].map(td => getComputedStyle(td).color))]),
    ['rgb(255, 255, 255)']);

  console.log('\nOne worker can be followed across, and the ends stay put');
  try { await page.hover('#maint-table tbody tr:nth-child(2) td:nth-child(8)', { timeout: 3000 }); } catch (_) {}
  check('the hovered row turns faintly green, job cells included',
        await css('#maint-table tbody tr:nth-child(2) td.job-pd', 'backgroundColor'), 'rgb(244, 248, 246)');
  await page.mouse.move(5, 5);
  check('No., Worker and Subtotal are pinned', [await css('#maint-table tbody td.stk-no', 'position'),
        await css('#maint-table tbody td.stk-w', 'position'), await css('#maint-table tbody td.stk-sub', 'position')],
        ['sticky', 'sticky', 'sticky']);
  check('Worker is pinned exactly at the width of No.', await page.evaluate(() => {
    const ne = document.querySelector('#maint-table thead th.stk-no'), we = document.querySelector('#maint-table tbody td.stk-w');
    if (!ne || !we) return 'no pinned cells';
    const no = ne.getBoundingClientRect().width;
    return Math.abs(parseFloat(document.querySelector('#maint-table tbody td.stk-w').style.left) - no) < 0.01;
  }), true);
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.evaluate(() => renderMaint());
  const pinned = await page.evaluate(() => {
    const wrap = document.querySelector('#sub-maint .tbl-wrap');
    wrap.scrollLeft = 300;
    const box = wrap.getBoundingClientRect();
    const we = document.querySelector('#maint-table tbody td.stk-w'), se = document.querySelector('#maint-table tbody td.stk-sub');
    if (!we || !se) return 'no pinned cells';
    const w = we.getBoundingClientRect(), s = se.getBoundingClientRect();
    return { overflows: wrap.scrollWidth > wrap.clientWidth, workerInside: w.left >= box.left - 1,
             subAtRight: Math.abs(s.right - box.right) < 3 };
  });
  check('on a narrow screen the jobs scroll and Worker / Subtotal stay in view', pinned,
        { overflows: true, workerInside: true, subAtRight: true });
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.evaluate(() => { document.querySelector('#sub-maint .tbl-wrap').scrollLeft = 0; renderMaint(); });

  if (SHOT) {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({ path: SHOT, fullPage: false });
    console.log('  shot ' + SHOT);
  }
  check('nothing was thrown', errs, []);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
