/* The Nursery Payroll dashboard is charts AND a table, and the side bar is
   flush to the window's left edge, top to bottom.

   The office: the side bar "必须完美贴死屏幕最左侧 (left: 0, margin: 0) ...
   高度必须撑满整个视口 (height: 100vh)", and the Dashboard becomes KPI cards,
   a by-nursery comparison of what each kind of work pays, a trend that
   switches between Monthly and Yearly, and the summary table under them.

   The trend is the part that can go quietly wrong: it prices months that
   are NOT open by swapping their reads into the globals for one synchronous
   pass. So the checks ask that every past month comes out at its own
   figure, AND that the open month is exactly what it was afterwards.

   Run with a static server on 8777 serving the repository root.
   SHOT=/dir draws the dashboard.                                        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const now = new Date();
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M3 = ym(new Date(now.getFullYear(), now.getMonth() - 3, 1));

const DB = {
  mjmnpayroll_workers: [
    { id: 1, full_name: 'Ani',  section: 'BNN',  active: true },
    { id: 2, full_name: 'Budi', section: 'UNN1', active: true },
    { id: 3, full_name: 'Cici', section: 'UNN2', active: true },
    { id: 4, full_name: 'Dedi', section: 'UNN2', active: true }
  ],
  mjmnpayroll_work_entries: [
    // the open month: BNN 300 + 100, UNN1 200, UNN2 50 + 150
    { id: 11, worker_id: 1, month: CUR, category: 'transplanting', amount: 300, work_date: CUR + '-03' },
    { id: 12, worker_id: 1, month: CUR, category: 'seedlings',     amount: 100, work_date: CUR + '-04' },
    { id: 13, worker_id: 2, month: CUR, category: 'transplanting', amount: 200, work_date: CUR + '-05' },
    { id: 14, worker_id: 3, month: CUR, category: 'seedlings',     amount: 50,  work_date: CUR + '-06' },
    { id: 15, worker_id: 4, month: CUR, category: 'transplanting', amount: 150, work_date: CUR + '-06' },
    // last month: 1,000 by one worker
    { id: 21, worker_id: 2, month: M1, category: 'transplanting', amount: 1000, work_date: M1 + '-10' },
    // three months back: 400 by two workers
    { id: 31, worker_id: 1, month: M3, category: 'seedlings',     amount: 250, work_date: M3 + '-10' },
    { id: 32, worker_id: 3, month: M3, category: 'transplanting', amount: 150, work_date: M3 + '-11' }
  ]
};

async function boot(browser, db) {
  const page = await browser.newPage({ viewport: { width: +(process.env.VW||1600), height: 1100 } });
  const errs = [];
  page.on('dialog', (d) => { console.log('    dialog:', d.message().slice(0, 160)); d.accept().catch(() => {}); });
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript((seed) => {
    window.__DB = seed;
    window.__PDFS = [];
    /* A STRICT jsPDF, lifted from claim_form_fits_its_jobs.cjs. The stub here
       used to be `class { constructor() {} }`, which takes anything — and a
       stub that takes anything signs off a form that cannot be drawn, which
       is the fault that left the Work Maintenance claim unprintable for
       however long it took the office to need a printout. Every co-ordinate
       is a finite number or the call is refused, the way the real library
       refuses it. */
    const fin = (v) => typeof v === 'number' && isFinite(v);
    function guard(method, args) {
      args.forEach((a, i) => {
        if (!fin(a)) throw new Error('Invalid arguments passed to jsPDF.' + method
                                   + ' (argument ' + (i + 1) + ' is ' + String(a) + ')');
      });
    }
    window.jspdf = { jsPDF: class {
      constructor(o) { this.opt = o; this.page = 1; this.lines = []; this.rects = [];
                       this.saved = null; this.printed = false; window.__PDFS.push(this); }
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
      autoPrint() { this.printed = true; }
      output() { return 'blob:stub'; }
      save(name) { this.saved = name; }
    } };
    function makeQuery(table) {
      const st = { eqs: [], single: false };
      const run = () => {
        if (seed.__missing && seed.__missing.includes(table))
          return { data: null, error: { message: 'relation "public.' + table + '" does not exist' } };
        let out = (window.__DB[table] || []).slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'insert' || p === 'upsert' || p === 'update' || p === 'delete') {
          (window.__WRITES = window.__WRITES || []).push(table + ':' + p);
          return () => ({ select: () => Promise.resolve({ data: [], error: null }),
                          eq: () => q, then: (a, b) => Promise.resolve({ data: [], error: null }).then(a, b) });
        }
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery,
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser:    async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, db);
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
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderDashboard === 'function', { timeout: 20000 });
  await page.waitForTimeout(800);
  return { page, errs };
}

(async () => {
  const browser = await chromium.launch();
  const { page, errs } = await boot(browser, DB);
  /* Every read is guarded: on the previous page half of these elements do
     not exist, and a test that dies on the first throw asks nothing below it. */
  const ev = (fn, arg) => page.evaluate(fn, arg).catch(e => 'ERR: ' + String(e.message).split('\n')[0]);
  await ev(() => switchTab('dash'));
  await page.waitForTimeout(600);

  console.log('\n1. The side bar is flush left and full height');
  const side = await ev(() => {
    const n = document.getElementById('side-nav'), cs = getComputedStyle(n), r = n.getBoundingClientRect();
    const main = document.querySelector('.pay-content').getBoundingClientRect();
    const rib = document.getElementById('mjm-ribbon').getBoundingClientRect();
    return { pos: cs.position, left: r.left, top: r.top, h: Math.round(r.height), vh: innerHeight,
             radius: cs.borderTopRightRadius, margin: cs.marginLeft,
             mainRight: main.left >= r.right, ribbonRight: rib.left >= r.right - 1 };
  });
  check('fixed to the window', side.pos, 'fixed');
  check('at the very left and the very top', [side.left, side.top], [0, 0]);
  check('as tall as the window', side.h, side.vh);
  check('square, with no margin', [side.radius, side.margin], ['0px', '0px']);
  check('the page sits to its right', side.mainRight, true);
  check('the ribbon sits to its right too', side.ribbonRight, true);

  console.log('\n2. KPI cards are still on top');
  const cards = await ev(() => [...document.querySelectorAll('#dash-body .dash-card .dc-label')].map(e => e.textContent.trim()));
  check('This month, Approval and Total payroll lead', cards.slice(0, 3), ['This month', 'Approval', 'Total payroll']);
  const total = await ev(() => document.querySelector('.dash-card.dc-total .dc-val').textContent.trim());
  check('Total payroll is the month', total, 'RM 800.00');

  console.log('\n3. The by-nursery chart');
  const bars = await ev(() => [...document.querySelectorAll('#dash-nursery-chart .dg-bar')]
    .map(b => b.dataset.sec + ':' + b.dataset.cat + ':' + Math.round(b.getBBox().height)));
  check('a bar per nursery per kind of work', bars.map(b => b.split(':').slice(0, 2).join(':')),
    ['BNN:maint','BNN:transpl','BNN:seedling','UNN1:maint','UNN1:transpl','UNN1:seedling','UNN2:maint','UNN2:transpl','UNN2:seedling']);
  const h = Object.fromEntries(bars.map(b => { const [s, c, v] = b.split(':'); return [s + ':' + c, +v]; }));
  check('BNN transplanting (300) stands three times BNN collection (100)', Math.round(h['BNN:transpl'] / h['BNN:seedling']), 3);
  check('an empty kind of work is no bar', h['BNN:maint'], 0);
  const tip = await ev(() => {
    const el = document.querySelector('#dash-nursery-chart .dg-hit');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + 2, clientY: r.top + 20, bubbles: true }));
    return document.getElementById('dash-tip').textContent;
  });
  check('hovering a bar names the nursery and its figures', /BNN.*Transplanting.*RM 300\.00.*Total.*RM 400\.00/.test(tip), true);
  check('it carries legend', await ev(() => document.querySelectorAll('#dash-nursery-chart .dash-legend span').length), 3);

  console.log('\n4. The trend, monthly');
  await page.waitForFunction(() => document.querySelectorAll('#dash-trend-chart .dg-hit').length > 0, { timeout: 15000 }).catch(() => {});
  const tips = () => ev(() => [...document.querySelectorAll('#dash-trend-chart .dg-hit')]
    .map(el => decodeURIComponent(el.dataset.tip).replace(/<[^>]+>/g, '|')));
  let t = await tips(); if (!Array.isArray(t)) t = [];
  check('twelve months', t.length, 12);
  const totalOf = s => { const m = s.match(/Total payroll\|*<?\/?[a-z]*>?\|*([^|]+)/); return m ? m[1] : s; };
  const tot = t.map(s => (s.match(/Total payroll\|+([^|]+)/) || [])[1]);
  check('the open month is its own 800', tot[11], 'RM 800.00');
  check('last month is its own 1,000', tot[10], 'RM 1,000.00');
  check('three months back is its own 400', tot[8], 'RM 400.00');
  check('a month with nothing is nought', tot[9], 'RM 0.00');
  check('the categories ride beside the total', /Transplanting\|+RM 1,000\.00/.test(t[10]), true);

  console.log('\n5. The open month is untouched by the trend');
  const after = await ev(() => ({ m: monthValue(), n: entries.length,
    sum: monthlyRows('').reduce((s, r) => s + r.total, 0) }));
  check('still the open month, its own entries, its own total', after, { m: (new Date().getFullYear()) + '-' + String(new Date().getMonth() + 1).padStart(2, '0'), n: 5, sum: 800 });

  console.log('\n6. Yearly, and workers');
  await ev(() => setDashTrend('mode', 'year'));
  await page.waitForFunction(() => document.querySelectorAll('#dash-trend-chart .dg-hit').length === 2, { timeout: 15000 }).catch(() => {});
  t = await tips(); if (!Array.isArray(t)) t = [];
  check('one point per year', t.length, 2);
  const yTot = t.map(s => (s.match(/Total payroll\|+([^|]+)/) || [])[1]);
  const sameYear = [CUR, M1, M3].map(m => m.slice(0, 4));
  const want = { [sameYear[0]]: 0, [String(+sameYear[0] - 1)]: 0 };
  [[CUR, 800], [M1, 1000], [M3, 400]].forEach(([m, v]) => { want[m.slice(0, 4)] += v; });
  check('each year adds its months', yTot, [String(+sameYear[0] - 1), sameYear[0]].map(y => 'RM ' + want[y].toLocaleString('en-MY', { minimumFractionDigits: 2 })));
  const seg = await ev(() => document.querySelector('.dash-seg .on').textContent);
  check('the Yearly button is lit', seg, 'Yearly');
  await ev(() => { setDashTrend('mode', 'month'); setDashTrend('metric', 'workers'); });
  await page.waitForTimeout(400);
  t = await tips(); if (!Array.isArray(t)) t = [];
  check('workers paid, distinct people a month', /Workers paid\|+4\b/.test(String(t.slice(-1)[0])), true);
  check('three months back had two', /Workers paid\|+2\b/.test(String(t[8])), true);

  console.log('\n7. The table is still there');
  check('the by-section table', await ev(() => !!document.getElementById('dash-table')), true);
  check('no page errors', errs, []);

  if (process.env.SHOT) {
    await ev(() => setDashTrend('metric', 'pay'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: process.env.SHOT + '/dash_charts.png' });
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
