/* "就算plot status一样， updater的名字也要update， last update的日期也要"

   Even where the plot status is the SAME, the updater's name has to move and
   so does the last-update date. The office said it over the PALMS board.

   A plot whose stage has not moved had no way to say so, and the reason is
   worth knowing before reading the fix: the Current Status cell is a <select>
   with the running stage drawn as `selected`, and a NATIVE SELECT FIRES NO
   CHANGE EVENT when the same option is picked again. So the single commonest
   outcome of an office round -- "I have looked at B11 and it really is still
   on Membesar" -- reached no screen and no table, and the plot went on
   reading as last touched weeks ago under somebody else's name. The board
   then reads as neglect where there was none, which is the exact fault
   plotLine's own lastDate note was written to stop, one door along.

   WHAT IT WRITES IS A DAILY REPORT AND NEVER A SECOND LOG ENTRY, which is
   the whole of the decision and is what most of this file is about:

     * a second OPEN entry on one act_n is the duplicate this system has a
       heading about, and a RUN_ME to clear;
     * closing the old one and opening a new one RESTARTS the clock -- a plot
       57 days into a 270-day Membesar would read as starting today.

   The field app has had the right shape for this since it was written: a
   Save records every plot in the nursery, changed or not, one row per unit
   per day. An unchanged plot IS a plot somebody looked at.

   Run: NODE_PATH=/opt/node22/lib/node_modules \
        node tests/a_plot_still_on_the_same_stage_is_an_answer.cjs
   It serves the repository itself; nothing has to be started first.      */
const fs   = require('fs');
const path = require('path');
const http = require('http');

const ROOT  = path.join(__dirname, '..');
const SRC   = fs.readFileSync(path.join(ROOT, 'shared', 'shared_palms.js'), 'utf8');
const BOARD = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'nursery_ops_palms_board.html'), 'utf8');
const LIFE  = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'nursery_ops_plot_life.html'), 'utf8');
const PORT  = 8796;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

/* ── 1. The writer itself, out of the shipped file ────────────────────────
   Driven rather than read: what matters is the ROW it builds and the table
   it builds it on, and a source check would only prove the words are there. */
console.log('\n1. stampSave writes a daily report, and nothing else');

const win = {};
new Function('window', SRC + '\n')(win);
const P = win.MJMPalms;

/* NAMED rather than thrown, and the sections after it are asked EITHER WAY.
   Calling a function the previous build does not export takes the harness
   down and leaves every check under it unasked — the house trap, met here on
   purpose, because the previous build is exactly what this file has to be
   able to report on. */
const HAS = typeof P.stampSave === 'function';
check('MJMPalms exports stampSave', HAS ? 'a function' : 'missing', 'a function');

(async () => {
  if (HAS) {
    const writes = [];
    const supa = { from: (t) => ({
      upsert: (rows, opts) => { writes.push({ table: t, verb: 'upsert', rows: rows, opts: opts }); return Promise.resolve({ error: null }); },
      insert: (rows) => { writes.push({ table: t, verb: 'insert', rows: rows }); return Promise.resolve({ error: null }); },
      update: () => ({ eq: () => { writes.push({ table: t, verb: 'update' }); return Promise.resolve({ error: null }); } }),
    }) };

    await P.stampSave(supa, 'B11', [10], 'Esther Wong');
    const w = writes[0] || {};
    check('it writes ONE row', writes.length, 1);
    check('…to the daily report, never the plot log', w.table, 'fcportal_palms_history');
    /* UNIQUE (unit_key, at_date) is the table's own key and its own comment
       says why: saving a nursery twice is a correction, not a second report.
       An insert would come back 23505 the second time somebody looks. */
    check('…as an upsert on the day', w.verb + ' ' + ((w.opts || {}).onConflict || ''),
          'upsert unit_key,at_date');
    const row = (w.rows || [])[0] || {};
    check('…naming the unit', row.unit_key, 'B11');
    check('…dated today', row.at_date, P.todayStr());
    check('…under whoever looked', row.recorded_by, 'Esther Wong');
    check('…carrying the stage that is running', row.acts, [10]);
    check('and it touches the plot log not at all',
          writes.filter(x => x.table === 'fcportal_palms_plot_logs').length, 0);

    /* EVERY open stage, never the one a dropdown happened to show.
       palms_history_latest_wins closes every open entry a report does NOT
       name, and PALMS allows two at once -- so a row naming one of them would
       silently close the other. */
    writes.length = 0;
    await P.stampSave(supa, 'B2', [11, 4], 'Esther Wong');
    check('two stages running are both named', (writes[0].rows[0] || {}).acts, [4, 11]);

    /* A plot with NOTHING running is still a plot somebody looked at, and an
       empty acts closes nothing because there is nothing open to close. */
    writes.length = 0;
    await P.stampSave(supa, 'B3', [], 'Esther Wong');
    check('a plot with nothing running still stamps', (writes[0].rows[0] || {}).acts, []);

    /* The module's own answer moves with the write, so a caller that does not
       re-read still draws the line it has just made -- and today's write wins
       a tie with today's earlier row, which is the entire point. */
    P.applySaves([{ unit_key: 'B9', at_date: P.todayStr(), recorded_by: 'Akbar' }]);
    writes.length = 0;
    await P.stampSave(supa, 'B9', [10], 'Esther Wong');
    const logs = P.logsFromRows([{ client_uid: 'x', plot_name: 'B9', act_n: 10,
      start_date: '2026-09-01', end_date: null, ideal_days: 270, recorded_by: 'Akbar', seq_no: 1 }]);
    const line = P.plotLine(logs, 'B9');
    check('the line now names who looked last, on a day the field had saved too',
          [line.lastDate, line.lastBy], [P.todayStr(), 'Esther Wong']);
  }

  await browserHalf();
})().catch((e) => { console.error(e); process.exit(1); });

/* ── 2 and 3. The two office screens, driven for real ─────────────────────── */
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

/* The fixture, shared by both pages. B1 is on Membesar, B2 runs two stages,
   B3 has no log at all. */
const LOG_ROWS = [
  { client_uid: 'u-b1', plot_name: 'B1', act_n: 10, start_date: '2026-09-01', end_date: null, ideal_days: 270, recorded_by: 'Akbar', seq_no: 1 },
  { client_uid: 'u-b2a', plot_name: 'B2', act_n: 4,  start_date: '2026-11-02', end_date: null, ideal_days: 1,   recorded_by: 'Akbar', seq_no: 1 },
  { client_uid: 'u-b2b', plot_name: 'B2', act_n: 11, start_date: '2026-11-03', end_date: null, ideal_days: 30,  recorded_by: 'Akbar', seq_no: 2 },
];
const PLOT_ROWS = [
  { plot_name: 'B1', nursery_name: 'BNN', map_top: null, is_active: true },
  { plot_name: 'B2', nursery_name: 'BNN', map_top: null, is_active: true },
  { plot_name: 'B3', nursery_name: 'BNN', map_top: null, is_active: true },
];
const HIST_ROWS = [{ unit_key: 'B1', at_date: '2026-10-20', recorded_by: 'Akbar' }];

/* A Supabase stand-in that RECORDS every write and answers the reads these
   two pages make. It is deliberately strict about nothing it is not asked
   about: what is under test is which table each gesture writes to. */
const STUB = `
window.__writes = [];
(function () {
  const DATA = {
    fcportal_palms_plot_logs: ${JSON.stringify(LOG_ROWS)},
    fcportal_palms_history: ${JSON.stringify(HIST_ROWS)},
    shared_plots: ${JSON.stringify(PLOT_ROWS)},
    operation_nurseries: [{ name: 'BNN', map_image_url: '' }],
    nops_plot_areas: [],
    fcportal_palms_settings: [],
    nops_maint_config: [],
  };
  function q(table) {
    const rows = DATA[table] || [];
    const api = {
      select: () => api, order: () => api, eq: () => api, in: () => api, is: () => api,
      not: () => api, gte: () => api, lte: () => api, limit: () => api, maybeSingle: () => api,
      single: () => api,
      range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      insert: (r) => { window.__writes.push({ table: table, verb: 'insert', rows: r }); return Promise.resolve({ data: null, error: null }); },
      upsert: (r, o) => { window.__writes.push({ table: table, verb: 'upsert', rows: r, opts: o }); return Promise.resolve({ data: null, error: null }); },
      update: (patch) => ({ eq: () => { window.__writes.push({ table: table, verb: 'update', patch: patch }); return Promise.resolve({ data: null, error: null }); } }),
      delete: () => ({ eq: () => { window.__writes.push({ table: table, verb: 'delete' }); return Promise.resolve({ data: null, error: null }); } }),
      then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return api;
  }
  window.supabase = { createClient: () => ({ from: q, auth: { getSession: () => Promise.resolve({ data: { session: {} } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } }) };
})();
`;

const ACCESS = `
window.MJMAccess = {
  load: () => Promise.resolve(),
  user: () => ({ full_name: 'Esther Wong', email: 'esther@mjm' }),
  permissions: () => ({ modules: { nursery_ops: 'admin' } }),
  canAccess: () => true, canOpenPage: () => true, isAdminOf: () => true,
  canManageUsers: () => false,
};
window.MJMStaffGate = { check: () => Promise.resolve({ ok: true }) };
`;

async function browserHalf() {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch (e) { console.log('\n  (playwright not available — sections 2 and 3 skipped)'); return done(); }

  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(PORT, r));

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => { if (!/supabase|Tailwind/i.test(String(e))) console.log('  [page error] ' + e); });
  /* TAILWIND COMES FROM A CDN THE HARNESS CANNOT REACH, and `.hidden` is the
     one declaration of its these two pages lean on: without it Life of Plot's
     own backdrop covers the table, hit-tests every press and reads as a dead
     button. Served in its place rather than clicking through the page's
     JavaScript, because what is under test is a real press. */
  await page.route('**/cdn.tailwindcss.com/**', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: "document.addEventListener('DOMContentLoaded',function(){var s=document.createElement('style');"
        + "s.textContent='.hidden{display:none !important}';document.head.appendChild(s);});",
  }));
  /* The page does `supabase.createClient(...)` at the top of its own script,
     so the stand-in has to BE the library rather than be injected after it. */
  await page.route('**/cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB }));
  await page.route('**/shared_access.js*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: ACCESS }));
  await page.route('**/shared_staff_gate.js*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route('**/shared_nelos_dock.js*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

  await drive(page, 'board', '/nursery_ops/nursery_ops_palms_board.html');
  await drive(page, 'life',  '/nursery_ops/nursery_ops_plot_life.html');

  await browser.close();
  server.close();
  done();
}

async function drive(page, which, url) {
  const name = which === 'board' ? 'The PALMS board' : 'Life of Plot';
  console.log('\n' + (which === 'board' ? '2' : '3') + '. ' + name + ': an unchanged stage still moves the last update');

  await page.goto('http://localhost:' + PORT + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);

  /* THE OFFICE'S OWN SENTENCE, ASKED FIRST AND ASKED OF ANY BUILD. B1 is on
     Membesar; this says so again and nothing else. Driven through the
     dropdown rather than the ✓ because the dropdown is on BOTH builds, so
     this one check reports the fault on the previous code instead of going
     unasked with everything else. A build that returns early writes nothing
     and fails here by name.

     THE SELECT IS HIDDEN BY shared_cf_select.js, which draws a button over
     it, so the value is set the way the skin's own button sets it — the house
     rule, met before in the sent-back records test. */
  await page.evaluate(() => { window.__writes.length = 0; });
  await page.evaluate(() => {
    const s = document.querySelector('[data-st="B1"]');
    s.value = '10';                                   // 10 = Membesar, already running
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  await page.evaluate((i) => { const b = document.getElementById(i); if (b) b.click(); },
                      which === 'board' ? 'cf-ok' : 'sf-ok');
  await page.waitForTimeout(400);
  const same = await page.evaluate(() => window.__writes.map((x) => ({ t: x.table, v: x.verb, rows: x.rows })));
  check(name + ': saying the stage is unchanged moves the last update',
        same.filter((x) => x.t === 'fcportal_palms_history').length, 1);
  check(name + ': …and writes nothing to the plot log',
        same.filter((x) => x.t === 'fcportal_palms_plot_logs').map((x) => x.v), []);

  /* AND THERE IS NO TICK ANYWHERE. It shipped as a ✓ on every row -- the
     one gesture that meant "I looked and nothing moved" -- and the office
     took it off the next day in three words: 不要打勾. A column of fifty-two
     small targets over a cell nobody came to press, and they read this board.

     WHAT IS ASKED HERE IS THE ABSENCE, because a half-removal that leaves
     the handler or the stylesheet behind is the kind that comes back: no
     button, no listener wired to one, and no rule left styling it. The WRITE
     above is asked first and separately, so this check cannot be mistaken
     for the feature having gone with the button. */
  const left = await page.evaluate(() => ({
    btns: document.querySelectorAll('[data-seen]').length,
    ticks: document.querySelectorAll('.seen-tick').length,
  }));
  check(name + ': no ✓ is drawn on any row', [left.btns, left.ticks], [0, 0]);

  /* AND A REAL CHANGE STAMPS IT TOO. pickBy gives a tie on the day to the
     daily report, so an office correction made on an afternoon the Field
     Conductor had already saved read as the conductor's own round. One
     write, and the two agree by construction. */
  await page.evaluate(() => { window.__writes.length = 0; });
  /* THE SELECT IS HIDDEN BY shared_cf_select.js, which draws a button over it
     — so Playwright cannot act on it and the value is set the way the skin's
     own button sets it. The house rule, met before in the sent-back records
     test. */
  await page.evaluate(() => {
    const s = document.querySelector('[data-st="B1"]');
    s.value = '11';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  await page.evaluate((i) => document.getElementById(i).click(), which === 'board' ? 'cf-ok' : 'sf-ok');
  await page.waitForTimeout(400);
  const w2 = await page.evaluate(() => window.__writes.map((x) => ({ t: x.table, v: x.verb, rows: x.rows })));
  check(name + ': a real change still closes and opens the log',
        w2.filter((x) => x.t === 'fcportal_palms_plot_logs').map((x) => x.v), ['update', 'insert']);
  const h2 = w2.filter((x) => x.t === 'fcportal_palms_history');
  check(name + ': …and stamps the day under whoever changed it', h2.length, 1);
  check(name + ': …with the stage that is running AFTER it',
        ((h2[0] || {}).rows || [{}])[0].acts, [11]);
}

/* ── 4. Both pages ask the one writer ─────────────────────────────────────
   Two copies of this rule is one plot reading as looked-at on one screen and
   neglected on the other, which is the shape this codebase keeps finding. */
function done() {
  console.log('\n4. Neither page keeps a writer of its own');
  const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, ' ')
                        .replace(/\/\*[\s\S]*?\*\//g, ' ')
                        .replace(/(^|[\s;{}()])\/\/[^\n]*/g, '$1 ');
  for (const [n, src] of [['the board', BOARD], ['Life of Plot', LIFE]]) {
    checkTrue(n + ' calls MJMPalms.stampSave', /MJMPalms\.stampSave\(/.test(strip(src)));
    check(n + ' writes fcportal_palms_history nowhere else',
          (strip(src).match(/from\('fcportal_palms_history'\)/g) || []).length, 0);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
