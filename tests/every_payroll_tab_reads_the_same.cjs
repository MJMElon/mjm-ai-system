/* EVERY PAYROLL TAB READS THE SAME WAY

   The office asked for one visual system across the whole Nursery Payroll:
   forest green for anything active, figures right-aligned on tabular digits,
   no RM repeated down a column (the heading says it once), a faint dash for
   nothing, a mint row under the pointer, and ONE forest-green Grand Total.

   This drives the real page through every tab of the side bar and asks the
   same questions of every table it finds; then it hands the page a table it
   has never seen, to show that a table added next month is tidied too.

   Run: node tests/every_payroll_tab_reads_the_same.cjs
   with a static server on 8777 serving the repository root.
   SHOT=/dir draws each tab. */
const { chromium } = require('playwright');
const fs = require('fs');
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
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
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
    window.MJMPayrollLock = new Proxy({
      ready: () => true,
      verificationOf: () => v,
      isSheetLocked: () => true,
      isMonthLocked: () => false,
      lockOf: () => null,
      load: async () => true
    }, { get: (o, k) => (k in o ? o[k] : (k === 'then' ? undefined : (/^is|^has|^can/.test(k) ? () => false : /Date/.test(k) ? () => new Date(2026, 11, 2) : () => []))) });
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
  /* The rules every table on a tab is held to, read off whatever is drawn. */
  const audit = () => page.evaluate(() => {
    const vis = el => el.offsetParent !== null;
    const tables = [...document.querySelectorAll('#main table')].filter(vis);
    const rmCells = [], footBg = new Set(), numLeft = [], headSize = new Set(), purple = [];
    tables.forEach(t => {
      t.querySelectorAll('tbody td, tfoot td').forEach(td => {
        const txt = [...td.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('').trim();
        if (/^RM\s?[-\d]/.test(txt)) rmCells.push((t.id || 'table') + ': ' + txt);
      });
      t.querySelectorAll('tfoot td').forEach(td => footBg.add(getComputedStyle(td).backgroundColor));
      t.querySelectorAll('td.num, th.num').forEach(td => {
        if (getComputedStyle(td).textAlign !== 'right') numLeft.push((t.id || 'table') + ': ' + td.textContent.trim());
      });
      t.querySelectorAll('thead th').forEach(th => {
        if (!/job-title|job-rate|job-wd/.test(th.className)) headSize.add(getComputedStyle(th).fontSize);
      });
    });
    document.querySelectorAll('#main *, .side-nav *').forEach(el => {
      const s = getComputedStyle(el);
      [s.backgroundColor, s.color, s.borderTopColor].forEach(c => {
        if (/rgb\((79, 70, 229|67, 56, 202|99, 102, 241|124, 58, 237|238, 242, 255)\)/.test(c)) purple.push(el.tagName + '.' + el.className);
      });
    });
    return { n: tables.length, rmCells: rmCells.slice(0, 4), footBg: [...footBg], numLeft: numLeft.slice(0, 4),
             headSize: [...headSize], purple: purple.slice(0, 4),
             font: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/"/g, ''),
             bg: getComputedStyle(document.body).backgroundColor,
             active: [...document.querySelectorAll('.side-nav .side-btn.active')].map(a => getComputedStyle(a).backgroundColor).find(c => c !== 'rgba(0, 0, 0, 0)') || 'none' };
  });

  const TABS = [
    ['Work Maintenance', () => { switchTab('payroll'); switchSub('maint'); }],
    ['Seed Planting',    () => { switchTab('payroll'); switchSub('seedplant'); }],
    ['Transplanting',    () => { switchTab('payroll'); switchSub('transpl'); }],
    ['Loading Seedlings',() => { switchTab('payroll'); switchSub('seedling'); }],
    ['Monthly Payroll',  () => { switchTab('payroll'); switchSub('monthly'); }],
    ['Approval',         () => { switchTab('approval'); }],
    ['Report',           () => { switchTab('report'); }],
    ['Lock Controls',    () => { openSettings('lock'); }],
    ['Piece Rate',       () => { openSettings('rate'); }],
    ['Dashboard',        () => { switchTab('dash'); }]
  ];
  if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
  for (const [name, go] of TABS) {
    console.log('\n' + name);
    const err = await page.evaluate(`(() => { try { (${go.toString()})(); return ''; } catch (e) { return String(e && e.message || e); } })()`);
    check('the tab opens', err, '');
    await page.evaluate(() => { try { renderMaint(); } catch (_) {} try { renderLoading(); } catch (_) {} });
    await page.waitForTimeout(250);
    const a = await audit();
    check('the page is Plus Jakarta Sans on the warm grey', [a.font, a.bg], ['Plus Jakarta Sans', 'rgb(246, 248, 247)']);
    check('the open entry on the side bar is forest green', a.active, 'rgb(27, 67, 50)');
    check('no table cell repeats RM in front of its figure', a.rmCells, []);
    check('every figure marked as one is right-aligned', a.numLeft, []);
    check('every Grand Total row is the one forest green', a.footBg.filter(c => c !== 'rgb(27, 67, 50)'), []);
    check('every table heading is the one size', a.headSize.filter(s => s !== '11px'), []);
    check('nothing is indigo', a.purple, []);
    if (SHOT) await page.screenshot({ path: `${SHOT}/${name.replace(/\W+/g, '_')}.png` });
  }

  console.log('\nLoading Seedlings is a claim form in the Loading colour');
  await page.evaluate(() => { switchTab('payroll'); switchSub('seedling'); renderLoading(); });
  await page.waitForTimeout(150);
  const load = await page.evaluate(() => {
    const t = document.getElementById('loading-table');
    const css = s => { const el = t.querySelector(s); return el ? getComputedStyle(el).backgroundColor : 'none'; };
    return { cls: t.classList.contains('job-table'), head: css('thead th.job-title'), cell: css('tbody td.jg-tot'),
             card: (() => { const c = document.querySelector('#loading-glance .pt-card'); return c ? getComputedStyle(c).borderTopColor : 'none'; })(),
             foot: [...t.querySelectorAll('tfoot td')].map(td => td.textContent.trim()) };
  });
  check('it is laid out as a job table', load.cls, true);
  check('its heading, its cells and its card are the teal of Loading',
        [load.head, load.cell, load.card], ['rgb(204, 251, 241)', 'rgb(247, 254, 252)', 'rgb(79, 191, 176)']);
  check('its Grand Total carries the figure alone', load.foot, ['Grand Total', '—', '0.00']);

  console.log('\nA table nobody has written yet is tidied the moment it is drawn');
  const fresh = await page.evaluate(async () => {
    switchTab('payroll'); switchSub('monthly');
    const box = document.getElementById('monthly-table').parentNode;
    const t = document.createElement('table');
    t.id = 'never-seen';
    box.appendChild(t);
    t.innerHTML = `<thead><tr><th class="l">Worker</th><th>Bags</th><th>Pay</th><th>Remark</th></tr></thead>
      <tbody><tr><td class="l">Ali</td><td>1,200</td><td>RM 8.40</td><td>RM 5 bonus agreed</td></tr>
             <tr><td class="l">Siti</td><td>—</td><td>RM 12.00</td><td>—</td></tr></tbody>
      <tfoot><tr><td class="l">Grand Total</td><td>1,200</td><td>RM 20.40</td><td></td></tr></tfoot>`;
    await new Promise(r => setTimeout(r, 30));
    const st = el => getComputedStyle(el);
    return {
      heads: [...t.tHead.rows[0].cells].map(th => th.textContent),
      rows: [...t.tBodies[0].rows].map(tr => [...tr.cells].map(td => td.textContent)),
      foot: [...t.tFoot.rows[0].cells].map(td => td.textContent),
      align: [...t.tBodies[0].rows[0].cells].map(td => st(td).textAlign),
      headAlign: [...t.tHead.rows[0].cells].map(th => st(th).textAlign),
      dash: st(t.tBodies[0].rows[1].cells[1]).color,
      foot_bg: st(t.tFoot.rows[0].cells[2]).backgroundColor
    };
  });
  check('the money column loses its RM and its heading gains one', [fresh.heads, fresh.rows, fresh.foot],
        [['Worker', 'Bags', 'Pay (RM)', 'Remark'],
         [['Ali', '1,200', '8.40', 'RM 5 bonus agreed'], ['Siti', '—', '12.00', '—']],
         ['Grand Total', '1,200', '20.40', '']]);
  check('a sentence that happens to start with RM is a sentence, and is left alone', fresh.rows[0][3], 'RM 5 bonus agreed');
  check('the two columns of figures are right-aligned, heading and all',
        [fresh.align, fresh.headAlign], [['left', 'right', 'right', 'center'], ['left', 'right', 'right', 'center']]);
  check('a dash is drawn faint', fresh.dash, 'rgb(203, 213, 225)');
  check('and its Grand Total is the forest green', fresh.foot_bg, 'rgb(27, 67, 50)');

  check('nothing was thrown', errs, []);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
