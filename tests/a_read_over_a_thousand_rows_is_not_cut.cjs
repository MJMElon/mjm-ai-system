/* A READ OVER 1,000 ROWS CAME BACK CUT, AND SAID NOTHING.
 *
 * PostgREST answers at most `db-max-rows` rows and Supabase sets that to
 * 1,000. There is no error and no flag on the body: the read simply ends,
 * and the caller is handed a short list that looks exactly like a short
 * month.
 *
 * The Monthly Audit Report is where it showed. October held 1,783
 * maintenance audits and the report drew 1,000 of them -- a round figure
 * the office read as the month's work. 783 records on no report, with
 * nothing anywhere saying so, and every figure derived from them (the
 * summary card, the section total, the records badge) short by the same
 * amount.
 *
 * Four things this holds, and the last two are the ones a simpler fix
 * gets wrong:
 *
 *  - the read is PAGED, through the Range header, and comes back whole;
 *  - a SHORT page is the end, and a FULL one is not -- a table holding
 *    exactly 2,000 rows answers page two full, so the loop has to ask a
 *    third time and get nothing back;
 *  - rows repeated across pages are DROPPED. created_at.desc leaves rows
 *    written in the same millisecond in no defined order, and a phone
 *    pushes a plot batch by batch in ONE insert, so the same row really
 *    can answer twice;
 *  - it stops at a ceiling rather than looping for ever.
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_read_over_a_thousand_rows_is_not_cut.cjs
 * Serves the repository itself; no build and no outside server needed.
 */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT  = path.resolve(__dirname, '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

let pass = 0, fail = 0;
const check = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name
    + '\n         got  ' + JSON.stringify(got)
    + '\n         want ' + JSON.stringify(want)); }
};

/* October's own size. Not a round number on purpose: a fixture of exactly
   2,000 would pass against a loop that stops on a full page. */
const OCTOBER = 1783;

(async () => {
  await new Promise((r) => server.listen(8777, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  /* THE WORKER HAS TO BE BLOCKED, or this test reports a fault that is not
     there. audit_sw.js answers its own synthetic 503 for a network it
     cannot reach, and page.route does not reach a fetch the WORKER makes --
     so the reads here come back "Supabase error 503: offline" partway
     through, which reads exactly like a broken pager. The board test
     already had to learn this. */
  const ctx  = await browser.newContext({ viewport: { width: 1200, height: 900 },
                                          serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { fail++; console.log('  [page error] ' + e.message); });

  await page.addInitScript(() => {
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
  });
  await page.route('**/audit_login_guard.js*', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAuditLogin = { requireAdmin: () => true, user: () => ({ email: 'elon.mjm@gmail.com' }) };`
  }));
  await page.route('**/shared_access.js*', (r) => r.fulfill({
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

  /* THE FAKE POSTGREST. It does exactly what Supabase does: honours a
     Range when one is sent, and caps the answer at MAX whether or not one
     is -- which is the behaviour the whole fix is about. The asks are
     recorded so the test can say what was requested, not only what came
     back. */
  await page.route('**://*.supabase.co/rest/v1/**', async (route) => {
    const req  = route.request();
    const url  = new URL(req.url());
    const tbl  = url.pathname.split('/').pop();
    const cfg  = await page.evaluate(() => window.__FIX || null).catch(() => null);
    const want = (cfg && cfg.tables && cfg.tables[tbl]) || null;
    const range = req.headers()['range'] || '';
    await page.evaluate((a) => { (window.__ASKS = window.__ASKS || []).push(a); },
                        { table: tbl, range });
    if (!want) { await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); return; }
    const MAX = 1000;
    let from = 0, to = MAX - 1;
    const m = /^(\d+)-(\d+)$/.exec(range);
    if (m) { from = +m[1]; to = Math.min(+m[2], from + MAX - 1); }
    const rows = [];
    for (let i = from; i <= to && i < want.n; i++) {
      rows.push({ id: want.repeat && i === want.repeat.at ? want.repeat.id : i + 1,
                  plot: 'B' + (i % 14 + 1) });
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
                          body: JSON.stringify(rows) });
  });

  await page.goto('http://localhost:8777/audit/audit_report.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof sb !== 'undefined' && typeof sb.select === 'function',
                             { timeout: 20000 });

  const read = async (n, extra) => page.evaluate(async (cfg) => {
    window.__FIX  = { tables: { probe: cfg } };
    window.__ASKS = [];
    const rows = await sb.select('probe', 'select=*');
    return { got: rows.length,
             asks: window.__ASKS.filter((a) => a.table === 'probe').map((a) => a.range),
             ids: rows.length <= 12 ? rows.map((r) => r.id) : null };
  }, Object.assign({ n }, extra || {}));

  /* ── 1. October, whole ────────────────────────────────────────────── */
  console.log('\nThe month that was cut');
  const oct = await read(OCTOBER);
  check('all 1,783 October rows come back, not 1,000', oct.got, OCTOBER);
  check('asked for them a page at a time', oct.asks,
        ['0-999', '1000-1999']);

  /* ── 2. the boundary a simpler loop gets wrong ────────────────────── */
  console.log('\nA full last page is not the end');
  const two = await read(2000);
  check('a table of exactly 2,000 comes back whole', two.got, 2000);
  check('…because a third ask is what says so', two.asks,
        ['0-999', '1000-1999', '2000-2999']);
  const one = await read(1000);
  check('and exactly 1,000 is asked twice, not once', one.asks,
        ['0-999', '1000-1999']);
  check('still 1,000 rows', one.got, 1000);

  /* ── 3. under a page is one ask ───────────────────────────────────── */
  console.log('\nA small read costs nothing extra');
  const few = await read(7);
  check('seven rows, one ask', [few.got, few.asks], [7, ['0-999']]);

  /* ── 4. a row repeated across pages is dropped ────────────────────── */
  console.log('\nA row answered twice is counted once');
  /* created_at.desc leaves rows written in the same millisecond unordered,
     so the row at the head of page two can be one page one already gave.
     Counted twice it would inflate the very figure this fix exists to
     correct. */
  const dup = await read(1500, { repeat: { at: 1000, id: 1 } });
  check('1,500 rows with one repeated reads 1,499', dup.got, 1499);

  /* ── 5. nothing at all is still nothing ───────────────────────────── */
  console.log('\nAnd an empty table is empty');
  const none = await read(0);
  check('no rows, one ask, no error', [none.got, none.asks], [0, ['0-999']]);

  await browser.close();
  server.close();
  console.log('');
  console.log(fail ? fail + ' FAILED  (' + pass + ' ok)' : 'all good  (' + pass + ' ok)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
