/* THE MONTHLY AUDIT REPORT ANSWERS "HOW TALL IS THIS BATCH".

   Seedling Height is audited plot by plot in the Pre-Nursery -- the form has
   no batch box on it -- so the height records alone cannot say how tall a
   batch is. The ledger says which plots a batch was sown into; the plot's
   reading says how tall that plot is; the batch is the mean of its plots and
   the age group is the mean of its batches.

   The office asked for four figures: the average height of the batches that
   are 1, 2, 3 and 4 months old and have not been transplanted yet.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/batch_height_by_age.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

/* A month that has GONE BY, so the fixture reads the same tomorrow: the
   report is for September 2026 and everything is as at 30 Sep 2026. Ages
   off that date, at the Batch Record's own 30.44 days to the month:
      5 Sep 2026 ->  25 days -> 0.82 months   TOO YOUNG
     20 Aug 2026 ->  41 days -> 1.35           1 month
      1 Aug 2026 ->  60 days -> 1.97           1 month
      1 Jul 2026 ->  91 days -> 2.99           2 months
     20 May 2026 -> 133 days -> 4.37           4 months
      1 May 2026 -> 152 days -> 4.99           4 months
      1 Apr 2026 -> 182 days -> 5.98           TOO OLD
   Nothing is 3 months old on purpose — an age group with no batch in it
   has to read as a dash, not as a nought.                                */
const SEEDS = [
  { batch: '301', date: '2026-09-05' },   // too young
  { batch: '302', date: '2026-08-20' },   // 1 month
  { batch: '303', date: '2026-08-01' },   // 1 month
  { batch: '304', date: '2026-07-01' },   // 2 months
  { batch: '305', date: '2026-05-20' },   // 4 months
  { batch: '306', date: '2026-05-01' },   // 4 months
  { batch: '307', date: '2026-04-01' },   // too old
  { batch: '308', date: '2026-08-01' },   // 1 month, but transplanted
  { batch: '309', date: '2026-07-01' },   // 2 months, transplanted NEXT month
  { batch: '310', date: '2026-07-01' }    // 2 months, no Planted log at all
];

/* 303 stands in two plots, which is the case the office named: "如果一个
   batch有很多个plot也要list出来". */
const PLANTED = [
  { batch: '301', plot: 'P01' },
  { batch: '302', plot: 'P02' },
  { batch: '303', plot: 'P03' }, { batch: '303', plot: 'P4' },  // unpadded on purpose
  { batch: '304', plot: 'P05' },
  { batch: '305', plot: 'P06' },
  { batch: '306', plot: 'P07' },
  { batch: '307', plot: 'P08' },
  { batch: '308', plot: 'P09' },
  { batch: '309', plot: 'P10' }
];

const GONE = [
  { batch: '308', type: 'Transplanted',          date: '2026-09-15' },
  // AFTER the month being reported: in September this one was still standing.
  { batch: '309', type: 'Transplanted_Premium',  date: '2026-10-20' }
];

/* Heights, September 2026. P03 is audited twice -- the 19th is how tall it
   is, the 5th is not averaged in with it. P07 has no reading at all. */
const h = (plot, avg, date, batch) =>
  ({ record_id: plot + date + (batch || ''), nursery: 'PN', plot, batch: batch || null,
     sample_1: avg, sample_2: avg, sample_3: avg, avg_height: avg,
     auditor_name: 'Suhaedi', date });

const HEIGHT = [
  h('P01', 5,  '2026-09-05'),
  h('P02', 10, '2026-09-05'),
  h('P03', 10, '2026-09-05'),                  // the old visit, not counted
  h('P03', 20, '2026-09-19'), h('P03', 30, '2026-09-19'),   // mean 25
  h('P04', 15, '2026-09-19'),                  // 303's second plot -> batch 20
  h('P05', 40, '2026-09-05'),
  h('P06', 60, '2026-09-05'),
  // P07 -- nothing. 306 has no figure.
  h('P08', 99, '2026-09-05'),                  // too old, must not appear
  h('P09', 99, '2026-09-05'),                  // transplanted, must not appear
  h('P10', 50, '2026-09-05')
];

const LOG = (r, type) => ({
  id: 0, batch_name: r.batch, plot_name: r.plot || null,
  transaction_type: type, transaction_date: r.date || null,
  created_at: (r.date || '2026-01-01') + 'T08:00:00+00:00'
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  const LEDGER = [
    ...SEEDS.map((r) => LOG(r, 'Seeds_Received')),
    ...PLANTED.map((r) => LOG(r, 'Planted')),
    ...GONE.map((r) => LOG(r, r.type))
  ].map((r, i) => ({ ...r, id: i + 1 }));

  await page.addInitScript((seed) => {
    window.__HEIGHT = seed.height;
    window.__LEDGER = seed.ledger;
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: () => { const qq = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve({ data: [], error: null }).then(a, b);
        return () => qq; } }); return qq; },
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, { height: HEIGHT, ledger: LEDGER });

  await page.route('**/audit_login_guard.js*', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAuditLogin = { requireAdmin: () => true, user: () => ({ email: 'elon.mjm@gmail.com' }) };`
  }));
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com' });
      if (k === 'load') return async () => true;
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**',
                      '**/cdn.tailwindcss.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, body: '[]' }));

  await page.goto('http://localhost:8777/audit/audit_report.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.buildBatchHeight === 'function'
                                && typeof window.fetchBatchLedger === 'function',
                             { timeout: 20000 });

  /* The database, stubbed at the one place the page reaches it through:
     a path in, rows out, paging and all. Set after load, because
     audit_supabase.js declares the real sbFetch and would overwrite it. */
  const bh = await page.evaluate(async () => {
    window.__calls = [];
    window.sbFetch = async (path) => {
      window.__calls.push(path);
      const [table, qs] = path.split('?');
      const q = new URLSearchParams(qs || '');
      if (table === 'audit_height_records') {
        // date=gte.X & date=lte.Y, the way fetchData asks for a month.
        const bounds = q.getAll('date').map((v) => v.slice(4));
        const [from, to] = [bounds[0] || '', bounds[1] || '9999'];
        return window.__HEIGHT.filter((r) => r.date >= from && r.date <= to);
      }
      if (table !== 'shared_inventory_logs') return [];
      const want = q.get('transaction_type') || '';
      const types = want.startsWith('in.')
        ? want.slice(4, -1).split(',')
        : [want.replace('eq.', '')];
      const limit = +(q.get('limit') || 1000), offset = +(q.get('offset') || 0);
      return window.__LEDGER.filter((r) => types.includes(r.transaction_type))
                            .slice(offset, offset + limit);
    };
    const led = await fetchBatchLedger(9, 2026);
    return buildBatchHeight(led, window.__HEIGHT);
  });

  console.log('\nThe window it reads');
  check('as at the END of the month being reported, not today', bh.asOf, '2026-09-30');
  /* A month still running cannot be read as at its last day — that would
     age every batch by however much of it is left to come. */
  check('…and a month that has not finished is as at today',
        await page.evaluate(async () => (await fetchBatchLedger(12, 2026)).asOf),
        new Date().toISOString().slice(0, 10));
  check('only the batches that are 1 to 4 months old and still in the PN',
        [...new Set(bh.rows.map((r) => r.batch))].sort(),
        ['302', '303', '304', '305', '306', '309', '310']);
  check('a batch transplanted during the month is gone from it',
        bh.rows.some((r) => r.batch === '308'), false);
  check('…one transplanted the month AFTER was still standing in it',
        bh.rows.some((r) => r.batch === '309'), true);

  console.log('\nThe age group each one lands in');
  const grpOf = (b) => (bh.rows.find((r) => r.batch === b) || {}).grp;
  check('seeds in 20 Aug -> 1 month',  grpOf('302'), 1);
  check('seeds in 1 Aug  -> 1 month',  grpOf('303'), 1);
  check('seeds in 1 Jul  -> 2 months', grpOf('304'), 2);
  check('seeds in 20 May -> 4 months', grpOf('305'), 4);
  check('seeds in 1 May  -> 4 months', grpOf('306'), 4);

  console.log('\nEvery plot a batch stands in is listed');
  check('303 is in two of them, both drawn',
        bh.rows.filter((r) => r.batch === '303').map((r) => r.plot), ['P03', 'P04']);
  check("…and an unpadded 'P4' off the ledger is the same plot as P04",
        bh.rows.find((r) => r.batch === '303' && r.plot === 'P04').h.value, 15);

  console.log('\nThe plot figure is its LAST audit day, not the month averaged');
  {
    const r = bh.rows.find((x) => x.plot === 'P03');
    check('P03 was walked twice; the 19th is what it reads', [r.h.value, r.h.date],
          [25, '2026-09-19']);
  }
  check('a plot nobody measured says so rather than counting as nought',
        bh.rows.find((r) => r.batch === '306').h, null);
  check('a batch with no Planted log is still listed, with no plot',
        bh.rows.filter((r) => r.batch === '310').map((r) => [r.plot, r.h]),
        [['—', null]]);

  console.log('\nThe batch is the mean of its plots');
  const avgOf = (b) => (bh.rows.find((r) => r.batch === b) || {}).batchAvg;
  check('303 is (25 + 15) / 2', avgOf('303'), 20);
  check('302 is its one plot',  avgOf('302'), 10);
  check('306 has nothing to average', avgOf('306'), null);

  console.log('\nThe four figures the office asked for');
  /* 1 month: 302 -> 10, 303 -> 20            => 15
     2 months: 304 -> 40, 309 -> 50, 310 -> none => 45
     3 months: nothing at all                 => null
     4 months: 305 -> 60, 306 -> none         => 60 */
  check('1 month old',  [bh.groups[1].avg, bh.groups[1].batches, bh.groups[1].unmeasured], [15, 2, 0]);
  check('2 months old', [bh.groups[2].avg, bh.groups[2].batches, bh.groups[2].unmeasured], [45, 3, 1]);
  check('3 months old — no batch is, and that is a dash not a nought',
        [bh.groups[3].avg, bh.groups[3].batches], [null, 0]);
  check('4 months old', [bh.groups[4].avg, bh.groups[4].batches, bh.groups[4].unmeasured], [60, 2, 1]);
  /* A batch in two plots is ONE batch in the group's average. If the group
     were the mean of every plot reading, 1 month would be (10+25+15)/3 = 16.7. */
  check('a batch in two plots counts once, not twice', bh.groups[1].avg, 15);
  check('the batch count is batches, not rows', bh.batches, 7);

  console.log('\nThe table it draws');
  const table = await page.evaluate((b) => {
    const d = document.createElement('div');
    d.innerHTML = buildBatchHeightSection(b);
    document.body.appendChild(d);
    const head = [...d.querySelectorAll('thead th')].map((t) => t.textContent.trim());
    const body = [...d.querySelectorAll('tbody tr')]
      .filter((tr) => !tr.classList.contains('total-row'))
      .map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    const batchCell = [...d.querySelectorAll('tbody td[data-label="Batch average"]')]
      .map((td) => ({ txt: td.textContent.trim(), span: +(td.getAttribute('rowspan') || 1) }));
    const cards = [...d.querySelectorAll('.age-row .sum-card')]
      .map((c) => [c.querySelector('.sum-val').textContent.trim(),
                   c.querySelector('.sum-label').textContent.trim()]);
    d.remove();
    return { head, body, batchCell, cards };
  }, bh);

  check('the four cards, in order', table.cards, [
    ['15', '1 Month Old'], ['45', '2 Months Old'],
    ['—', '3 Months Old'], ['60', '4 Months Old']
  ]);
  check('one Batch Avg cell per batch, 303\'s covering both its plots',
        table.batchCell.map((c) => c.span), [1, 2, 1, 1, 1, 1, 1]);
  check('…and the one over two plots reads 20',
        table.batchCell[1], { txt: '20', span: 2 });
  check('the columns', table.head, ['#', 'Batch', 'Seeds In', 'Age', 'Age Group',
        'Plot', 'Audited', 'Plot Avg (cm)', 'Batch Avg (cm)']);
  check('one line per plot — eight of them, not seven', table.body.length, 8);
  /* Youngest group first, then the batch, then the plot: a batch's plots have
     to sit together or the merged cell above cannot cover them. */
  check('youngest group first, then the batch',
        bh.rows.map((r) => r.batch + '/' + r.plot),
        ['302/P02', '303/P03', '303/P04', '304/P05', '309/P10', '310/—',
         '305/P06', '306/P07']);

  console.log('\nThe ledger is read in pages, not in one gulp');
  check('every read asks for a page and a stable order',
    await page.evaluate(() => window.__calls.every((p) => p.includes('limit=1000')
                                                      && p.includes('order=id.asc'))), true);

  console.log('\nIf the ledger cannot be read, the section says so');
  const broke = await page.evaluate(() => {
    const html = buildBatchHeightSection({ error: 'Supabase error 401: no' });
    const d = document.createElement('div'); d.innerHTML = html;
    return d.querySelector('.no-data').textContent.replace(/\s+/g, ' ').trim();
  });
  check('rather than drawing an empty table that reads as "no batches"',
        /could not be read/i.test(broke) && /401/.test(broke), true);

  console.log('\nThe tick on the filter card draws it');
  {
    /* End to end through generateReport, because the wiring is where this
       could still be broken: the tick, the month, the fetch, the section
       order. Height by Batch on its own needs no nursery tick -- the
       batches it lists have not left the Pre-Nursery. */
    await page.evaluate(() => {
      document.getElementById('f-month').value = '9';
      document.getElementById('f-year').value = '2026';
      [...document.querySelectorAll('.mod-cb')].forEach((cb) => { cb.checked = false; });
      const cb = [...document.querySelectorAll('.mod-cb')]
        .find((x) => /Height by Batch/.test(x.parentElement.textContent));
      cb.checked = true; cb.dispatchEvent(new Event('change'));
      [...document.querySelectorAll('.f-nurs-cb')].forEach((x) => { x.checked = false; });
    });
    await page.evaluate(() => generateReport());
    await page.waitForSelector('#report-output .mod-head-batch', { timeout: 10000 });
    const out = await page.evaluate(() => ({
      sections: document.querySelectorAll('#report-output .mod-section').length,
      cards: [...document.querySelectorAll('#report-output .age-row .sum-val')]
               .map((v) => v.textContent.trim()),
      period: document.querySelector('.report-period').textContent.trim()
    }));
    check('the section is on the page, and it is the only one', out.sections, 1);
    check('the four figures came through the whole path', out.cards,
          ['15', '45', '—', '60']);
    check('…for the month that was picked', /September 2026/.test(out.period), true);
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
