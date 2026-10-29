/* The plot panel on the PALMS Monitoring Board shows every stage's START
   and END date, each in a column of its own, NEWEST AT THE TOP, numbered by
   position with the oldest at the foot as 1 — never the stage's own code.

   It used to be one sentence per stage, newest first, carrying the END date
   only — so "when did Culling start" had to be worked out backwards from a
   day count. The office looked at U17 and said they want to see each job's
   start date and end date. This drives the real page with U17's own round.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/palms_round_shows_start_and_end.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

// U17's opening stages as the office's screenshot has them, then one still running.
const LOG = [
  [1, '2026-08-17', '2026-08-18', 2, 'Contoh'],
  [2, '2026-08-18', '2026-08-23', 3, 'Contoh'],
  [3, '2026-08-23', '2026-08-27', 2, 'Contoh'],
  [8, '2026-09-01', '2026-09-03', 2, 'Handan'],
  [9, '2026-09-03', null, 2, 'Handan']
].map(([n, s, e, i, by], k) => ({ client_uid: 'u' + k, plot_name: 'U17', act_n: n, start_date: s,
  end_date: e, ideal_days: i, recorded_by: by, seq_no: k }));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.dismiss());
  await page.addInitScript((log) => {
    const q = (rows) => {
      const p = new Proxy({}, { get(_, k) {
        if (k === 'then') return (a, b) => Promise.resolve({ data: rows, error: null }).then(a, b);
        if (k === 'range' || k === 'maybeSingle' || k === 'single')
          return () => Promise.resolve({ data: k === 'range' ? rows : null, error: null });
        return () => p;
      } });
      return p;
    };
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: (t) => q(t === 'fcportal_palms_plot_logs' ? log : []),
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, LOG);
  await page.route('**/shared_access.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com' });
      if (k === 'load') return async () => true;
      if (k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'then') return undefined;
      return () => true; } });` }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**', '**/cdn.tailwindcss.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**', '**/unpkg.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_palms_board.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof drawPvRound === 'function' && Object.keys(LOGS).length > 0,
                             { timeout: 20000 });

  const rows = await page.evaluate(() => {
    // The map is not what is under test: hand the panel U17 as one unit.
    pvUnits = () => [{ key: 'U17', label: 'U17', plot: 'U17' }];
    PV_PLOT = 'U17';
    document.getElementById('pv-modal').classList.remove('hidden');
    drawPvRound();
    const t = document.querySelector('#pv-round table.pv-st');
    if (!t) return null;
    return {
      head: [...t.querySelectorAll('thead th')].map(th => th.textContent.trim()),
      body: [...t.querySelectorAll('tbody tr')].map(tr =>
        [...tr.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g, ' ').trim()))
    };
  });
  check('the round is a table with Start and End columns',
    rows && rows.head, ['', 'Stage', 'Start', 'End', 'Days', 'Ideal', 'Result']);
  check('newest at the top',
    rows && rows.body.map(r => r[1].split(' ')[0]), ['Transplanting', 'Lining', 'Culling', 'Tunggu', 'Saringan']);
  check('numbered by position, the oldest at the foot being 1 — not 9, 8, 3, 2, 1',
    rows && rows.body.map(r => r[0]), ['5', '4', '3', '2', '1']);
  check('Culling: started 23 Aug, ended 27 Aug, 4 days against 2',
    rows && rows.body[2], ['3', 'Culling Contoh', '23 Aug 2026', '27 Aug 2026', '4d', '2d', '2d over']);
  check('Lining carries its own start as well as its end',
    rows && rows.body[1].slice(2, 6), ['01 Sep 2026', '03 Sep 2026', '2d', '2d']);
  check('a stage still running says so in the End column, and counts its days so far',
    rows && [rows.body[0][2], rows.body[0][3], /d so far$/.test(rows.body[0][4])], ['03 Sep 2026', 'running', true]);
  if (process.env.SHOT) await page.locator('#pv-round').screenshot({ path: process.env.SHOT });
  check('no page errors', errs, []);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
