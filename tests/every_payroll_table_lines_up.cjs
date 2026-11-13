/* EVERY PAYROLL TABLE LINES UP

   The office: table alignment was inconsistent across the tabs of Nursery
   Payroll, and asked for one standard -- a serial number, a status and an
   action CENTRED, a name or a description LEFT, every figure RIGHT on
   tabular digits, a grouped heading centred over exactly the columns it
   spans, and a header, a body and a total that are one grid.

   This loads every tab with real-shaped data (the fixtures of the tests
   beside it, put into one database) and asks those questions of every
   table it finds, cell by cell, with the spans expanded. It reads the
   COMPUTED alignment, so a class the stylesheet does not honour fails.

   Run: node tests/every_payroll_table_lines_up.cjs
   with a static server on 8777 serving the repository root.
   AUDIT=1 prints every table's grid; SHOT=/dir draws each tab. */
const { chromium } = require('playwright');
const fs = require('fs');
const SHOT = process.env.SHOT || '', AUDIT = !!process.env.AUDIT;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _now = new Date();
const YM = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
const MONTH = `${MONTHS[_now.getMonth()]} ${_now.getFullYear()}`;

const tp = (o) => Object.assign({
  work_date: `${YM}-09`, nursery_name: 'UNN 2', plot_name: 'N3', batch_name: '252',
  work_type: 'transplanting', schedule_month: MONTH, source_qty: 6685,
  workers: [{ name: 'Ali Bin Hassan', qty: null }, { name: 'Siti Aminah', qty: null }], total_qty: null,
  checked_at: `${YM}-20T02:00:00Z`, checked_by: 'office@mjmnursery.com'
}, o);

const DB = {
  mjmnpayroll_workers: [
    { id: 1, full_name: 'Ali Bin Hassan', section: 'UNN2', status: 'active', active: true, role: 'General Worker' },
    { id: 2, full_name: 'Siti Aminah',    section: 'UNN2', status: 'active', active: true, role: 'General Worker' },
    { id: 3, full_name: 'Rousell Wayne',  section: 'BNN',  status: 'active', active: true, role: 'General Worker' },
    { id: 4, full_name: 'Muhamad Fauzan', section: 'UNN1', status: 'active', active: true, role: 'General Worker' }
  ],
  mjmnpayroll_piece_rates: [
    { id: 1, job_desc: 'Loading Seedlings', rate: 0.05, unit: 'Bag', category: 'maintenance', group_code: 'MN', active: true },
    { id: 2, job_desc: 'Seedlings Collection (by hand)', rate: 1, unit: 'Bag', category: 'seedlings', group_code: 'MN', active: true },
    { id: 3, job_desc: 'Transplanting', rate: 0.07, unit: 'Seedling', category: 'transplanting', group_code: 'MN', active: true },
    { id: 4, job_desc: 'Seed Planting', rate: 0.02, unit: 'Seed', category: 'seed_planting', group_code: 'PN', active: true }
  ],
  mjmnpayroll_work_entries: [
    { id: 11, worker_id: 1, month: YM, category: 'transplanting', amount: 300, qty: 3000, rate: 0.1, unit: 'Bag', work_date: `${YM}-03`, section: 'UNN2', job_desc: 'Transplanting' },
    { id: 12, worker_id: 3, month: YM, category: 'seedlings', amount: 100, qty: 100, rate: 1, unit: 'Bag', work_date: `${YM}-04`, section: 'BNN', job_desc: 'Seedlings Collection (by hand)' },
    { id: 13, worker_id: 4, month: YM, category: 'transplanting', amount: 200, qty: 2000, rate: 0.1, unit: 'Bag', work_date: `${YM}-05`, section: 'UNN1', job_desc: 'Transplanting' }
  ],
  nops_transplant_field_records: [
    tp({ work_type: 'blanket_spray', work_date: `${YM}-03` }),
    tp({ work_type: 'lining', work_date: `${YM}-04` }),
    tp({ work_type: 'polybag_fill', work_date: `${YM}-05`, workers: [{ name: 'Ali Bin Hassan', qty: 4000 }, { name: 'Siti Aminah', qty: 2685 }] }),
    tp({ work_type: 'transplanting', work_date: `${YM}-06` }),
    tp({ plot_name: 'N9', work_type: 'lining', source_qty: 1200, checked_at: null, checked_by: null })
  ],
  shared_do_records: [{
    do_number: 'DO-9001', delivery_date: `${YM}-12`, status: 'Delivered', remark: 'Ladang Sri',
    plot_1: 'N3', qty_1: 500, batch_1: '252', worked_by_by_nursery: { UNN2: ['Ali Bin Hassan', 'Siti Aminah'] }
  }],
  nops_seed_planting_batch_workers: [
    { batch_name: '277', month: MONTH, planted_date: `${YM}-02`, qty_planted: 3760, job: 'seed',
      workers: { 'Ali Bin Hassan': 2000, 'Siti Aminah': 1760 }, checked_at: `${YM}-20T02:00:00Z`, checked_by: 'office' },
    { batch_name: '278', month: MONTH, planted_date: `${YM}-05`, qty_planted: 3000, job: 'seed',
      workers: { 'Ali Bin Hassan': 1000, 'Siti Aminah': 2000 }, checked_at: `${YM}-20T02:00:00Z`, checked_by: 'office' }
  ],
  shared_inventory_logs: [
    { plot_name: 'N3', batch_name: '252', transaction_type: 'Transplanted', transaction_date: `${YM}-02`,
      created_at: `${YM}-02T02:00:00Z`, quantity_change: 6685, remark: `Transplanted from tray [P4] to Main Plot [N3]. Date: ${YM}-02` }
  ]
};

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
  capAll: { pd: sum('pd', cap), manuring: sum('manuring', cap), weeding: sum('weeding', cap) + 1, interrow: sum('interrow', cap), loading_seedlings: 0 },
  rate:   { pd: 0.007, manuring: 0.01, weeding: 0.01, interrow: 0.008, loading_seedlings: 0.1 },
  capSum: { pd: sum('pd', cap), manuring: sum('manuring', cap), weeding: sum('weeding', cap), interrow: sum('interrow', cap), loading_seedlings: 0 },
  rmSum:  { pd: sum('pd', rm), manuring: sum('manuring', rm), weeding: sum('weeding', rm), interrow: sum('interrow', rm), loading_seedlings: 0 },
  grand:  W.reduce((s, w) => s + earned[w], 0)
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: +(process.env.VW || 1500), height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.addInitScript((seed) => {
    window.__DB = seed;
    const fin = (v) => typeof v === 'number' && isFinite(v);
    function guard(m, a) { a.forEach((v, i) => { if (!fin(v)) throw new Error('Invalid arguments passed to jsPDF.' + m + ' (argument ' + (i + 1) + ')'); }); }
    window.jspdf = { jsPDF: class {
      constructor() { this.page = 1; }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {} setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect(x, y, w, h) { guard('rect', [x, y, w, h]); } roundedRect(x, y, w, h) { guard('roundedRect', [x, y, w, h]); }
      line(a, b, c, d) { guard('line', [a, b, c, d]); } addPage() { this.page++; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.5; } splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { guard('text', [x, y]); } addImage() {} autoPrint() {} output() { return 'blob:stub'; } save() {}
    } };
    function makeQuery(table) {
      const st = { eqs: [], single: false };
      const run = () => {
        let out = (window.__DB[table] || []).slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => !(c in r) || String(r[c]) === String(v)); });
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (['insert', 'upsert', 'update', 'delete'].includes(p))
          return () => ({ select: () => Promise.resolve({ data: [], error: null }), eq: () => q,
                          then: (a, b) => Promise.resolve({ data: [], error: null }).then(a, b) });
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }), getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {}
    }) };
  }, DB);
  await page.route('**/shared_access.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true; } });` }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**']
                     .concat(SHOT ? [] : ['**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']))
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderMaint === 'function', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.evaluate((snap) => {
    const v = { snapshot: snap, verified_by: 'u1', verified_at: '2026-11-01T08:00:00Z' };
    window.MJMPayrollLock = new Proxy({ ready: () => true, verificationOf: (ym, sheet) => (sheet === 'maint' ? v : null),
      isSheetLocked: () => false, isMonthLocked: () => false, lockOf: () => null, load: async () => true },
      { get: (o, k) => (k in o ? o[k] : (k === 'then' ? undefined : (/^is|^has|^can/.test(k) ? () => false : /Date/.test(k) ? () => new Date(2026, 11, 2) : () => []))) });
  }, SNAP);

  /* The questions, asked of every visible table. */
  const audit = (tab) => page.evaluate(([tab, AUDIT]) => {
    const vis = el => el.offsetParent !== null && el.getBoundingClientRect().width > 0;
    const grid = (rows) => {
      const g = [];
      Array.from(rows).forEach((tr, r) => {
        g[r] = g[r] || []; let c = 0;
        Array.from(tr.cells).forEach(cell => {
          while (g[r][c]) c++;
          const rs = cell.rowSpan || 1, cs = cell.colSpan || 1;
          for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) { g[r + i] = g[r + i] || []; g[r + i][c + j] = cell; }
          c += cs;
        });
      });
      return g;
    };
    const val = td => {
      let s = '';
      const w = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.parentNode.closest('button, .cal-line, .wd-gap, .calstep, .sp-sub, .pen')) continue; s += n.nodeValue; }
      return s.replace(/\u270e/g, '').trim();
    };
    const al = el => getComputedStyle(el).textAlign.replace('start', 'left').replace('-webkit-', '');
    const NUM = /^-?(RM\s?)?-?[\d,]+(\.\d+)?(%|\s+(?!jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[A-Za-z]{1,10})?$/i;
    const out = [];
    [...document.querySelectorAll('#main table')].filter(vis).forEach(t => {
      const name = t.id || (t.closest('[id]') ? t.closest('[id]').id + ' table' : 'table');
      const issues = []; let maxW = 0, hgAll = [];
      const allBody = []; Array.from(t.tBodies).forEach(b => allBody.push(...b.rows));
      const isHead = tr => tr.cells.length && [...tr.cells].every(c => c.tagName === 'TH');
      const bands = [];
      if (allBody.some(isHead)) {
        let cur = null;
        allBody.forEach(tr => { if (isHead(tr)) { cur = { h: [tr], b: [] }; bands.push(cur); } else if (cur) cur.b.push(tr); });
      } else bands.push({ h: t.tHead ? [...t.tHead.rows] : [], b: allBody, f: t.tFoot ? [...t.tFoot.rows] : [] });
      bands.forEach((band, bi) => {
      const hg = grid(band.h), bodyRows = band.b.filter(tr => !(tr.cells.length === 1 && (tr.cells[0].colSpan || 1) > 1));
      const bg = grid(bodyRows), fg = band.f ? grid(band.f) : [];
      const widthOf = g => g.map(r => (r || []).length);
      const hw = widthOf(hg), bw = widthOf(bg), fw = widthOf(fg);
      const W = Math.max(0, ...hw); maxW = Math.max(maxW, W); hgAll = hgAll.concat(hg);
      // 1. one grid: every row as wide as the heading
      [...bw.map((w, i) => ['body', i, w]), ...fw.map((w, i) => ['foot', i, w])].forEach(([s, i, w]) => {
        const tr = (s === 'body' ? bodyRows : band.f)[i];
        if (W && w !== W && !(tr && tr.cells.length === 1)) issues.push(`${s} row ${i} spans ${w} of ${W} columns`);
      });
      hw.forEach((w, i) => { if (w !== W) issues.push(`heading row ${i} spans ${w} of ${W}`); });
      // the leaf heading over each column
      const leaf = c => { for (let r = hg.length - 1; r >= 0; r--) { const x = hg[r] && hg[r][c]; if (x && (x.colSpan || 1) === 1) return x; } return null; };
      for (let c = 0; c < W; c++) {
        const th = leaf(c); if (!th) continue;
        const head = th.textContent.trim();
        const cells = []; const seen = new Set();
        bg.forEach(r => { const td = r && r[c]; if (td && !seen.has(td) && (td.colSpan || 1) === 1) { seen.add(td); cells.push(td); } });
        let figs = 0, other = 0, btn = 0, pic = 0;
        cells.forEach(td => {
          if (td.querySelector('img, .tp-maps')) { pic++; return; }
          const v = val(td);
          if (td.querySelector('button, a.btn, input[type=checkbox]') && !v) { btn++; return; }
          if (!v) return;
          if (NUM.test(v)) figs++; else if (v !== '—' && v !== '-') other++;
        });
        let want = null;
        if (/^(no\.?|#)$/i.test(head)) want = 'center';
        else if (/status|state|^verified$|^check(ed)?$/i.test(head)) want = 'center';
        else if (btn && !figs && !other) want = 'center';
        else if (pic && !figs && !other) want = 'center';
        else if (figs && !other) want = 'right';
        else if (other) want = 'left';
        if (!want) continue;
        const ha = al(th);
        if (ha !== want) issues.push(`heading "${head || '(blank)'}" is ${ha}, should be ${want}`);
        const bad = cells.filter(td => (val(td) || td.querySelector('button, img, .tp-maps')) && al(td) !== want);
        if (bad.length) issues.push(`"${head || '(blank)'}" has ${bad.length} cell(s) ${al(bad[0])}, should be ${want}`);
        // the foot under a column of figures
        const fc = fg[0] && fg[0][c];
        if (want === 'right' && fc && (fc.colSpan || 1) === 1 && val(fc) && al(fc) !== 'right') issues.push(`total under "${head}" is ${al(fc)}`);
      }
      // 2. a grouped heading is centred over its columns
      t.querySelectorAll('thead th').forEach(th => {
        if ((th.colSpan || 1) > 1 && al(th) !== 'center') issues.push(`group heading "${th.textContent.trim().slice(0, 24)}" is ${al(th)}`);
      });
      // 3. a header cell lines up with the column under it
      for (let c = 0; c < W; c++) {
        const th = leaf(c), td = bg[0] && bg[0][c];
        if (!th || !td || (td.colSpan || 1) > 1) continue;
        const a = th.getBoundingClientRect(), b = td.getBoundingClientRect();
        if (Math.abs(a.left - b.left) > 1 || Math.abs(a.right - b.right) > 1) issues.push(`column ${c} heading and body edges differ by ${Math.round(a.left - b.left)}px`);
      }
      });
      const bodyRows = allBody;
      // 4. one padding, one heading size
      const pads = new Set(), hs = new Set();
      t.querySelectorAll('tbody td').forEach(td => { const s = getComputedStyle(td); pads.add(s.paddingLeft + '/' + s.paddingRight); });
      t.querySelectorAll('thead th').forEach(th => hs.add(getComputedStyle(th).fontSize));
      if (pads.size > 2) issues.push('body padding varies: ' + [...pads].join(' '));
      // 5. tabular figures
      const tn = getComputedStyle(t).fontVariantNumeric;
      if (!/tabular-nums/.test(tn)) issues.push('figures are not tabular (' + tn + ')');
      out.push({ tab, name, cols: maxW, rows: bodyRows.length, issues,
                 heads: AUDIT ? hgAll.map(r => (r || []).map(x => x ? x.textContent.trim().slice(0, 14) + '|' + al(x)[0] : '?')) : undefined });
    });
    // 6. no split table: a table that is only a heading, or a body with no heading beside one
    const split = [...document.querySelectorAll('#main table')].filter(vis).filter(t => t.tHead && !t.tBodies.length);
    if (split.length) out.push({ tab, name: 'split', issues: ['a heading-only table: ' + split.map(t => t.id).join(',')] });
    return out;
  }, [tab, AUDIT]);

  const TABS = [
    ['Dashboard',        () => { switchTab('dash'); }],
    ['Work Maintenance', () => { switchTab('payroll'); switchSub('maint'); }],
    ['Seed Planting',    () => { switchTab('payroll'); switchSub('seedplant'); }],
    ['Transplanting',    () => { switchTab('payroll'); switchSub('transpl'); }],
    ['Loading Seedlings',() => { switchTab('payroll'); switchSub('seedling'); }],
    ['Monthly Payroll',  () => { switchTab('payroll'); switchSub('monthly'); }],
    ['Approval',         () => { switchTab('approval'); }],
    ['Report',           () => { switchTab('report'); }],
    ['Lock Controls',    () => { openSettings('lock'); }],
    ['Piece Rate',       () => { openSettings('rate'); }]
  ];
  if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
  const seen = {};
  for (const [name, go] of TABS) {
    console.log('\n' + name);
    const err = await page.evaluate(`(() => { try { (${go.toString()})(); return ''; } catch (e) { return String(e && e.message || e); } })()`);
    check('the tab opens', err, '');
    await page.evaluate((n) => { if (/Work Maint/.test(n)) { const s = document.getElementById('maint-nursery'); if (s) s.value = 'BNN'; try { renderMaint(); } catch (_) {} }
      if (/Transpl/.test(n)) { const s = document.getElementById('transpl-section'); if (s) { s.value = 'UNN2'; s.dispatchEvent(new Event('change')); } try { renderTransplantClaim(); } catch (_) {}
        /* Culling Monitoring needs PALMS to qualify a plot, which is a module of its own;
           its own test drives that. Here only the SHAPE is asked, so two plots and the
           people they paid are handed straight to the renderer. */
        window.cullIncentivePlots = () => [
          { plot: 'N3', section: 'UNN2', start: '2026-10-20', end: '2026-11-02', days: 13 },
          { plot: 'N9', section: 'UNN2', start: '2026-10-25', end: '2026-11-05', days: 11 }];
        window.cullIncentivePay = () => [
          { name: 'Rousell Wayne', known: { full_name: 'Rousell Wayne' }, amount: 40, rm: 20, plots: [{ plot: 'N3' }, { plot: 'N9' }], clash: [] },
          { name: 'Azhar', known: { full_name: 'Azhar' }, amount: 50, rm: 50, plots: [{ plot: 'N3' }], clash: [] }];
        window.cullIncentiveHeld = () => [];
        try { renderCullIncentive('UNN2'); } catch (e) { console.log(e); } }
      if (/Loading/.test(n)) { const s = document.getElementById('maint-nursery'); if (s) s.value = 'UNN2'; try { renderLoading(); } catch (_) {} } }, name);
    await page.waitForTimeout(700);
    if (process.env.DUMP) console.log(await page.evaluate(() => [...document.querySelectorAll('#main table')].filter(t => t.offsetParent).map(t => t.id + ': ' + t.outerHTML.replace(/\s+/g,' ').slice(0, 900)).join('\n')));
    const res = await audit(name);
    if (name !== 'Lock Controls') check('it draws at least one table', res.filter(r => r.name !== 'split').length > 0, true);
    res.forEach(r => {
      seen[r.name] = (seen[r.name] || 0) + 1;
      if (AUDIT) console.log('    ' + r.name + ' ' + r.cols + 'c×' + r.rows + 'r ' + JSON.stringify(r.heads));
      check(`${r.name}: lines up`, r.issues, []);
    });
    if (SHOT) await page.screenshot({ path: `${SHOT}/${name.replace(/\W+/g, '_')}.png`, fullPage: true });
  }
  console.log('\nTables audited: ' + Object.keys(seen).join(', '));
  check('nothing was thrown', errs, []);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
