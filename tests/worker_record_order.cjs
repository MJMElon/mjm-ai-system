/* The Worker Record reads plot by plot, and inside a plot day by day.

   It sorted on the PLOT ALONE. A sort with nothing to say about two rows of
   the same plot leaves them where it found them — and where it found them is
   the order the schedule generated them in: every P & D round, then every
   manuring round, then weeding, then interrow, with anything added later on
   the end. So one plot's dates came out shuffled.

   The printed sheet and the screen are the same function, so both did it.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/worker_record_order.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const PD = 'Penyemburan racun kulat dan serangga';
const WD = 'Merumput';

let nextId = 900;
const row = (plot, tarikh, racun, jenis) => ({
  id: nextId++, tarikh, jenis: jenis || PD, racun, plot,
  batch: '', qty: 1000, carlos: 0, gaia: 0, remark: ''
});

/* Deliberately jumbled, and jumbled the way the real list is: the rounds of
   one plot arrive together but the plots interleave, and the row somebody
   added later is at the end. */
const RECORDS = [
  row('B2', '2026-09-26', 'Round 4: Daconil 50gm'),
  row('B1', '2026-09-13', 'Round 2: Manzate 50gm'),
  row('B2', '2026-09-04', 'Round 1: Antracol 50gm'),
  row('B1', '2026-09-26', 'Round 4: Daconil 50gm'),
  row('B1', '2026-09-04', 'Round 1: Antracol 50gm'),
  row('B2', '2026-09-18', 'Round 3: Thiram 50gm'),
  row('B1', '2026-09-18', 'Round 3: Thiram 50gm'),
  // Not dated yet — planned, not done. Belongs at the end of its plot.
  row('B1', '-', 'Round 5: Not done yet'),
  // Added by hand after the fact, on a day in the middle.
  row('B1', '2026-09-09', 'Keyed by hand'),
  // Another work type, so the sheet filter is doing something.
  row('B1', '2026-09-06', 'Round 1: Merumput dalam polibeg', WD),
  row('B1', '2026-09-02', 'Round 0: Merumput dalam polibeg', WD)
];

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((seed) => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.setItem('mjm_maint_month', 'Sep 2026'); } catch (_) {}
    window.__DB = { nops_maint_records: [{ id: 1, records: seed }] };
    window.__WRITES = [];
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    /* A recording jsPDF, so what the sheet actually prints can be read back
       rather than guessed at from the screen. */
    window.__PDF = { lines: [], page: 1, saved: null };
    function Doc() {}
    Doc.prototype.setFont = function () { return this; };
    Doc.prototype.setFontSize = function () { return this; };
    Doc.prototype.setTextColor = function () { return this; };
    Doc.prototype.setDrawColor = function () { return this; };
    Doc.prototype.setFillColor = function () { return this; };
    Doc.prototype.setLineWidth = function () { return this; };
    Doc.prototype.rect = function () { return this; };
    Doc.prototype.line = function () { return this; };
    Doc.prototype.addImage = function () { return this; };
    Doc.prototype.splitTextToSize = function (s) { return [String(s)]; };
    Doc.prototype.getTextWidth = function (s) { return String(s).length * 2; };
    Doc.prototype.addPage = function () { window.__PDF.page++; return this; };
    Doc.prototype.text = function (txt, x, y) {
      window.__PDF.lines.push({ txt: String(txt), x, y, page: window.__PDF.page });
      return this;
    };
    Doc.prototype.save = function (name) { window.__PDF.saved = name; return this; };
    Doc.prototype.internal = { pageSize: { getWidth: () => 297, getHeight: () => 210 } };
    window.jspdf = { jsPDF: Doc };

    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select', row: null };
      const base = () => (window.__DB[table] || (window.__DB[table] = []));
      const rows = () => {
        let out = base().slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return out;
      };
      const run = () => {
        if (st.op === 'upsert' || st.op === 'insert') {
          window.__WRITES.push({ table, row: JSON.parse(JSON.stringify(st.row)) });
          const b = base();
          const i = b.findIndex((r) => String(r.id) === String(st.row.id));
          if (i >= 0) b[i] = st.row; else b.push(st.row);
          return { data: null, error: null };
        }
        const out = rows();
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'upsert' || p === 'insert') return (r) => { st.op = p; st.row = r; return q; };
        if (p === 'update' || p === 'delete') return () => q;
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
  }, RECORDS);

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
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, body: '[]' }));

  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html',
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.payrollRowsFor === 'function'
                                && typeof window.downloadPayrollPDF === 'function',
                             { timeout: 20000 });
  await page.waitForTimeout(250);
  /* The sheet draws nothing without workers. renderPayroll rebuilds the list
     from the register on every draw, so the names go in where it rebuilds
     them FROM — the fallback this module keeps for a nursery the register
     does not cover. */
  await page.evaluate(() => {
    _localWorkers.BNN = ['Awalludin', 'Budi'];
    resolveWorkers();
  });
  return page;
}

/* "plot date" for one sheet, straight out of the function the screen and the
   PDF both build their rows from. */
const sheet = (page, type) => page.evaluate((t2) =>
  payrollRowsFor(t2).map((r) => r.plot + ' ' + r.tarikh), type);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nThe P & D sheet');
  {
    const page = await boot(browser);
    check('plot by plot, and inside a plot day by day', await sheet(page, 'pd'), [
      'B1 2026-09-04',
      'B1 2026-09-09',   // keyed by hand, on a day in the middle
      'B1 2026-09-13',
      'B1 2026-09-18',
      'B1 2026-09-26',
      'B1 -',            // planned, not done — the end of its plot
      'B2 2026-09-04',
      'B2 2026-09-18',
      'B2 2026-09-26'
    ]);
    check('the weeding sheet is its own, and in order too',
          await sheet(page, 'weeding'), ['B1 2026-09-02', 'B1 2026-09-06']);
    await page.close();
  }

  console.log('\nThe table on the screen');
  {
    const page = await boot(browser);
    await page.click('.pn-tab[onclick*="\'payroll\'"]');
    await page.waitForTimeout(400);
    /* Drawn and read in ONE go, so a background refresh of the register
       cannot land between the two and redraw an empty sheet. */
    const seen = await page.evaluate(() => {
      renderPayroll();
      return [...document.querySelectorAll('#payroll-table tbody tr')]
        .filter((tr) => tr.children.length > 3)
        .map((tr) => {
          const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
          return txt(tr.children[1]) + ' ' + txt(tr.children[0]);
        });
    });
    check('the dates climb within each plot', seen, [
      'B1 04 Sep 2026', 'B1 09 Sep 2026', 'B1 13 Sep 2026',
      'B1 18 Sep 2026', 'B1 26 Sep 2026', 'B1 -',
      'B2 04 Sep 2026', 'B2 18 Sep 2026', 'B2 26 Sep 2026'
    ]);
    await page.close();
  }

  console.log('\nThe printed sheet');
  {
    const page = await boot(browser);
    await page.evaluate(() => { window.__PDF.lines = []; downloadPayrollPDF(); });
    await page.waitForTimeout(600);

    /* Read the dates off the first page's rows in the order they were drawn,
       which is the order they appear on the paper. */
    const printed = await page.evaluate(() => {
      const byPage = window.__PDF.lines.filter((l) => l.page === 1);
      const dates = byPage.filter((l) => /^\d{2} [A-Z][a-z]{2} \d{4}$/.test(l.txt));
      return dates.map((l) => l.txt);
    });
    check('a PDF was produced', await page.evaluate(() => !!window.__PDF.saved), true);
    check('ITS DATES CLIMB TOO', printed, [
      '04 Sep 2026', '09 Sep 2026', '13 Sep 2026', '18 Sep 2026', '26 Sep 2026',
      '04 Sep 2026', '18 Sep 2026', '26 Sep 2026'
    ]);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
