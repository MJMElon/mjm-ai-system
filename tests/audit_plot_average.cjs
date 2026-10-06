/* The Monthly Audit Report carries the plot's average for the day.

   An auditor walks a plot and measures several batches standing in it, one
   row each. The report had every batch and no plot figure at all, so the one
   number that describes the plot was worked out by hand off the paper.

   The office gave the sum it wanted: B01 on 5 Oct is
   (86.7 + 90 + 86.7 + 46.7 + 70 + 90 + 40) / 7, the mean of the Avg column,
   which comes to 72.9.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/audit_plot_average.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

/* The screenshot's own rows, plus a second day on the same plot and a plot
   with one reading, so the grouping has something to get wrong. */
const h = (plot, batch, s1, s2, s3, avg, date) =>
  ({ record_id: plot + batch + date, nursery: 'BNN', plot, batch,
     sample_1: s1, sample_2: s2, sample_3: s3, avg_height: avg,
     auditor_name: 'Suhaedi', date });

const HEIGHT = [
  h('B01', '252', 80, 90, 90, 86.7, '2026-10-05'),
  h('B01', '253', 80, 90, 100, 90, '2026-10-05'),
  h('B01', '254', 80, 100, 80, 86.7, '2026-10-05'),
  h('B01', '256', 40, 50, 50, 46.7, '2026-10-05'),
  h('B01', '257', 60, 60, 90, 70, '2026-10-05'),
  h('B01', '261', 80, 90, 100, 90, '2026-10-05'),
  h('B01', '268', 40, 40, 40, 40, '2026-10-05'),
  h('B02', '242', 160, 170, 170, 166.7, '2026-10-05'),
  h('B02', '247', 160, 160, 160, 160, '2026-10-05'),
  h('B03', '268', 40, 40, 40, 40, '2026-10-05'),
  // The SAME plot a fortnight later. A different reading, not more of this one.
  h('B01', '252', 100, 110, 120, 110, '2026-10-19'),
  h('B01', '253', 100, 100, 100, 100, '2026-10-19')
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((rows) => {
    window.__HEIGHT = rows;
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: () => { const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve({ data: [], error: null }).then(a, b);
        return () => q; } }); return q; },
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, HEIGHT);

  /* The page sends you to the login screen before it draws anything. */
  await page.route('**/audit_login_guard.js*', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAuditLogin = { requireAdmin: () => true, user: () => ({ email: 'elon.mjm@gmail.com' }) };`
  }));
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
                      '**/cdn.tailwindcss.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, body: '[]' }));

  await page.goto('http://localhost:8777/audit/audit_report.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.buildModTable === 'function'
                                && typeof window._heightPlotAvg === 'function',
                             { timeout: 20000 });

  /* The real table builder, on the real column definitions. */
  const table = await page.evaluate(() => {
    const html = buildModTable('height', window.__HEIGHT);
    const d = document.createElement('div');
    d.innerHTML = html;
    const head = [...d.querySelectorAll('thead th')].map((t) => t.textContent.trim());
    const body = [...d.querySelectorAll('tbody tr')]
      .filter((tr) => !tr.classList.contains('total-row'))
      .map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    /* The merged column, as cells rather than as rows: what it says and how
       many rows each cell covers. */
    const plotAvg = [...d.querySelectorAll('tbody td[data-label="Plot average that day"]')]
      .map((td) => ({ txt: td.textContent.trim(), span: +(td.getAttribute('rowspan') || 1) }));
    return { head, body, plotAvg };
  });

  console.log('\nThe column is there');
  check('and it is the last one', table.head[table.head.length - 1], 'Plot Avg (cm)');
  check('…after Avg', table.head.slice(-2), ['Avg (cm)', 'Plot Avg (cm)']);

  console.log('\nThe figure the office asked for');
  const col = (rows, name) => {
    const i = table.head.indexOf(name);
    return rows.map((r) => r[i]);
  };
  const b01oct5 = table.body.filter((r) => r[2] === 'B01' && r[1].includes('05 Oct'));
  check('B01 on 5 Oct has seven rows', b01oct5.length, 7);

  /* ONE CELL, not seven copies of a figure: seven copies read as seven
     measurements. The cell covers the seven rows it is about. */
  check('ONE CELL READING 72.9, COVERING ALL SEVEN', table.plotAvg[0],
        { txt: '72.9', span: 7 });

  console.log('\nIt is the plot AND the day');
  check('every group has exactly one cell, and it covers that group',
        table.plotAvg, [
          { txt: '72.9',  span: 7 },   // B01, 5 Oct
          { txt: '105',   span: 2 },   // B01, 19 Oct -- its own reading
          { txt: '163.4', span: 2 },   // B02
          { txt: '40',    span: 1 }    // B03, one reading
        ]);
  check('one cell per group, not one per row',
        [table.plotAvg.length, table.body.length], [4, 12]);

  console.log('\nA plot audited twice in a month is two blocks, not interleaved');
  {
    const b01 = table.body.filter((r) => r[2] === 'B01');
    check('its rows sit day by day', b01.map((r) => r[1]), [
      '05 Oct 2026', '05 Oct 2026', '05 Oct 2026', '05 Oct 2026',
      '05 Oct 2026', '05 Oct 2026', '05 Oct 2026',
      '19 Oct 2026', '19 Oct 2026'
    ]);
    check('…and batch still orders within the day',
          b01.slice(0, 7).map((r) => r[3]),
          ['252', '253', '254', '256', '257', '261', '268']);
  }

  console.log('\nAnd the row average is untouched');
  check('the Avg column still reads per batch', col(b01oct5, 'Avg (cm)'),
        ['86.7', '90', '86.7', '46.7', '70', '90', '40']);

  console.log('\nNothing to divide by');
  check('a row with no average at all', await page.evaluate(() =>
    _heightPlotAvg({ date: '2026-10-05', plot: 'B09' },
                   [{ date: '2026-10-05', plot: 'B09', avg_height: null }])), '—');
  /* A blank reading is not a zero. Number(null) is 0, so a blank row used to
     be averaged in as a seedling of no height. */
  check('a blank alongside real readings is left out, not counted as nought',
    await page.evaluate(() => _heightPlotAvg({ date: 'd', plot: 'B09' }, [
      { date: 'd', plot: 'B09', avg_height: 80 },
      { date: 'd', plot: 'B09', avg_height: null },
      { date: 'd', plot: 'B09', avg_height: '' },
      { date: 'd', plot: 'B09', avg_height: 100 }])), '90');
  check('…but a real nought still counts', await page.evaluate(() =>
    _heightPlotAvg({ date: 'd', plot: 'B09' }, [
      { date: 'd', plot: 'B09', avg_height: 0 },
      { date: 'd', plot: 'B09', avg_height: 100 }])), '50');
  check('…and one the group does not contain', await page.evaluate(() =>
    _heightPlotAvg({ date: '2026-10-05', plot: 'ZZ' }, [])), '—');

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
