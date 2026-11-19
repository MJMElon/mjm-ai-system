/* PALMS IS BNN, UNN 1 AND UNN 2 -- AND THREE PAGES BECAME TWO.

   Two sentences from the office, in one message:

       PN UNE不需要出现在这里
       Plot Motion Study也不需要存在

   THE FIRST IS A LIST THAT WAS ONLY EVER PASSED TO A NARROWED LOGIN.
   MJMPlotMap draws one tab per row of `operation_nurseries`, which holds
   every place the company has -- the Pre Nursery and the estate among them
   -- and it narrows that list only when the caller hands one over. The board
   handed one over for a login somebody had restricted by hand and NOT for an
   ordinary one, so the office opened the Plot Status Map and found PN and
   UNE tabs on it, over maps with nothing on them: the plot log is only ever
   keyed against the three main nurseries, which is what KEYS has always
   said and what the table beside the map is scoped by.

   So the list is always passed. `visible` and not KEYS, because the
   permission NARROWS the three and must not widen them.

   THE SECOND IS A PAGE DELETED RATHER THAN HIDDEN, which is what 不需要存在
   says. It wrote nothing -- it read the plot log and drew cycle times -- so
   deleting it loses no record. What has to go with it is everything that
   pointed AT it: its entry in the PALMS side bar, and its row on the
   module's own access screen, because a tick for a page nobody can open is
   a permission that cannot be obeyed.

   Run: NODE_PATH=/opt/node22/lib/node_modules \
        node tests/palms_is_the_three_nurseries.cjs
   It serves the repository itself; nothing has to be started first.      */
const fs   = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = 8797;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

/* A page that explains in prose what it removed will contain the words, so
   every source check here reads the markup the browser gets. Same trap this
   codebase has met six times. */
const strip = (src) => src.replace(/<!--[\s\S]*?-->/g, ' ')
                          .replace(/\/\*[\s\S]*?\*\//g, ' ')
                          .replace(/(^|[\s;{}()])\/\/[^\n]*/g, '$1 ');

/* THE FIXTURE HOLDS ALL FIVE, which is the whole point of it: a fixture of
   three nurseries passes just as green on a board that narrows nothing. */
const NURSERIES = [
  { name: 'BNN',  map_image_url: '' },
  { name: 'PN',   map_image_url: '' },
  { name: 'UNE',  map_image_url: '' },
  { name: 'UNN1', map_image_url: '' },
  { name: 'UNN2', map_image_url: '' },
];
const PLOTS = [
  { plot_name: 'B1', nursery_name: 'BNN',  map_top: null, is_active: true },
  { plot_name: 'P1', nursery_name: 'PN',   map_top: null, is_active: true },
  { plot_name: 'E1', nursery_name: 'UNE',  map_top: null, is_active: true },
  { plot_name: 'U1', nursery_name: 'UNN1', map_top: null, is_active: true },
  { plot_name: 'N1', nursery_name: 'UNN2', map_top: null, is_active: true },
];
const LOGS = [{ client_uid: 'u-b1', plot_name: 'B1', act_n: 10, start_date: '2026-09-01',
                end_date: null, ideal_days: 270, recorded_by: 'Akbar', seq_no: 1 }];

const STUB = `
(function () {
  const DATA = {
    fcportal_palms_plot_logs: ${JSON.stringify(LOGS)},
    fcportal_palms_history: [],
    shared_plots: ${JSON.stringify(PLOTS)},
    operation_nurseries: ${JSON.stringify(NURSERIES)},
    nops_plot_areas: [],
    fcportal_palms_settings: [],
  };
  function q(table) {
    const rows = DATA[table] || [];
    const api = {
      select: () => api, order: () => api, eq: () => api, in: () => api, is: () => api,
      not: () => api, gte: () => api, lte: () => api, limit: () => api,
      maybeSingle: () => api, single: () => api,
      range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return api;
  }
  window.supabase = { createClient: () => ({ from: q,
    auth: { getSession: () => Promise.resolve({ data: { session: {} } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) } }) };
})();
`;

/* No plot_status_nurseries on this login — the ORDINARY case, and the one
   the board used to hand no list over for. */
const ACCESS = `
window.MJMAccess = {
  load: () => Promise.resolve(),
  user: () => ({ full_name: 'Esther Wong', email: 'esther@mjm' }),
  permissions: () => ({ modules: { nursery_ops: 'admin' } }),
  canAccess: () => true, canOpenPage: () => true, isAdminOf: () => true,
  canManageUsers: () => false,
};
`;

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

(async () => {
  console.log('\n1. The Plot Status Map offers the three main nurseries and no others');

  let chromium;
  try { chromium = require('playwright').chromium; }
  catch (e) { console.log('  (playwright not available — section 1 skipped)'); chromium = null; }

  if (chromium) {
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
    await page.route('**/cdn.tailwindcss.com/**', (r) => r.fulfill({
      status: 200, contentType: 'application/javascript',
      body: "document.addEventListener('DOMContentLoaded',function(){var s=document.createElement('style');"
          + "s.textContent='.hidden{display:none !important}';document.head.appendChild(s);});" }));
    await page.route('**/cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB }));
    await page.route('**/shared_access.js*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: ACCESS }));
    await page.route('**/shared_staff_gate.js*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await page.route('**/shared_nelos_dock.js*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

    await page.goto('http://localhost:' + PORT + '/nursery_ops/nursery_ops_palms_board.html',
                    { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll('.pm-tabs button')].map((b) => b.textContent.trim()));
    check('the map draws a tab for each of the three', tabs.sort(), ['BNN', 'UNN1', 'UNN2']);
    /* Asked by NAME as well as by count: a board that drew nothing at all
       would pass a bare "PN is not among them". */
    check('…and none for the Pre Nursery or the estate',
          tabs.filter((t) => /^(PN|UNE)$/.test(t)), []);

    await browser.close();
    server.close();
  }

  console.log('\n2. The list is handed over for every login, not only a narrowed one');
  const BOARD = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'nursery_ops_palms_board.html'), 'utf8');
  const code = strip(BOARD);
  /* The fault was a ternary: a narrowed login got the list and an ordinary
     one got `{ skipReplant: true }` and every nursery in the table. */
  checkTrue('MAP_SCOPE always carries the nursery list',
            /MAP_SCOPE = \{ nurseries: visible, skipReplant: true \}/.test(code));
  checkTrue('…and no longer asks whether the login was narrowed first',
            !/MAP_SCOPE = allowed \?/.test(code));
  /* `visible` is KEYS narrowed by the permission — handing KEYS itself would
     widen a login somebody had deliberately cut down to one nursery. */
  checkTrue('the three are still the board’s own KEYS',
            /KEYS = \['BNN', 'UNN1', 'UNN2'\]/.test(code));

  console.log('\n3. The Plot Motion Study does not exist');
  check('its page is gone',
        fs.existsSync(path.join(ROOT, 'nursery_ops', 'nursery_ops_palms_motion.html')), false);

  /* EVERYTHING THAT POINTED AT IT GOES WITH IT. A half-removal that leaves
     the link or the tick behind is the kind that comes back — one as a 404,
     the other as a permission nothing can obey. */
  const NAV = fs.readFileSync(path.join(ROOT, 'shared', 'shared_palms_nav.js'), 'utf8');
  check('the PALMS side bar does not link to it', /palms_motion/.test(strip(NAV)), false);
  const ACC = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'nursery_ops_user_access.html'), 'utf8');
  check('the access screen offers no tick for it', /palms_motion/.test(strip(ACC)), false);

  /* And nothing anywhere else still points at it. A link left on another
     page is a 404 somebody meets rather than a list somebody reads. */
  const offenders = [];
  for (const dir of ['nursery_ops', 'shared', 'scan']) {
    const d = path.join(ROOT, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!/\.(html|js)$/.test(f)) continue;
      if (/palms_motion/.test(strip(fs.readFileSync(path.join(d, f), 'utf8')))) offenders.push(dir + '/' + f);
    }
  }
  check('no page still reaches for it', offenders, []);

  /* The side bar still has to BE a side bar — two pages, not nothing. */
  checkTrue('the bar still lists the board and the settings',
            /nursery_ops_palms_board\.html/.test(NAV) && /nursery_ops_palms_stages\.html/.test(NAV));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
