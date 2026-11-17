/* A PLOT IS ADDED IN ONE PLACE, AND EVERY MODULE HAS TO SEE IT

   The office: *"help to link the plot from system settings of nursery
   seedling stock management. I saw nelos, audit system all's plot data
   doesnt link from there. I want to link from system settings as if there
   are new plot added, all our modules will adding the new plots also."*

   They were right about both modules. Add Plot on
   operation/operation_settings.html inserts into `shared_plots`, and until
   this change EIGHT places carried the four ranges written out instead:

     shared/shared_nelos_dock.js          the raise form on 52 office pages
     audit/audit_script.js                Plot Condition
     audit/audit_height_script.js         Seedling Height
     audit/audit_papan_script.js          Papan Tanda
     audit/audit_pending.js               the home board's plot order
     audit/audit_home.html                which nursery a plot is in
     Barcode_Counter  NelosNewCase.jsx    the FC Portal's raise form
     Mobile           NelosNewCase.jsx    the Admin Portal's raise form

   So a plot the office added was on every other screen in the company and
   on none of those, and nothing on any of them said one was missing — a
   grid that draws the plots it has always drawn is indistinguishable from
   a grid that is right.

   WHAT IS ASSERTED, and the last section is the one that stops this coming
   back:

     1. the shared office list (shared/shared_maint_plots.js) — the one
        read, unchanged by this work, driven to say what it answers;
     2. audit/audit_plots.js over it — the module's one list, padded, with
        the ranges as the floor, live objects, and every failure mode;
     3. the REAL Plot Condition page in a real browser — the grid and the
        plot dropdown offer the office's new plots;
     4. the REAL Nelos dock in a real browser — so does its plot picker;
     5. the source: nobody declares their own four ranges any more, the
        four files that legitimately own a copy all state the same rules,
        and the two phone copies are the same file.

   Run: node tests/a_plot_added_in_the_office_reaches_every_module.cjs
   Needs Playwright and the Chromium at /opt/pw-browsers/chromium, with
   NODE_PATH pointing at the playwright install. It serves the repository
   itself, so nothing has to be started first.
*/
'use strict';
const fs   = require('fs');
const path = require('path');
const http = require('http');
const vm   = require('vm');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT  = path.resolve(__dirname, '..');
const PHONE = path.resolve(ROOT, '..', 'Barcode_Counter');
const ADMIN = path.resolve(ROOT, '..', 'Mobile');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name + '  → ' + JSON.stringify(got)); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) +
                             '\n         want ' + JSON.stringify(want)); }
}
/* A TEST THAT DIES ON THE PREVIOUS CODE PROVES NOTHING ABOUT IT — the
   harness stops at the first throw and every check underneath is never
   asked. On the code before this change audit_plots.js does not exist at
   all, so every reader here is guarded and an absent thing is a NAMED
   failure. */
function safe(name, fn, want) {
  let got;
  try { got = fn(); } catch (e) { got = 'threw: ' + String(e && e.message || e); }
  check(name, got, want);
}
/* Nor may a file that does not exist take it down, and on the previous
   code audit_plots.js does not: the first run of this test against it
   died on an ENOENT in section 2 and reported nothing at all about the
   sections under it. */
async function settle(p) {
  try { return await p; } catch (e) { return null; }
}

/* ══ THE OFFICE'S OWN FIXTURE ══════════════════════════════════════════
   What somebody keyed on Seedling Stock Management → System Settings. It is
   the office's WHOLE list for the nurseries it covers, because that is what
   the list now IS — see MJMMaintPlots.offered. Every part is here for a
   reason:

     BNN      keyed in full EXCEPT B14, which the office DELETED, so B14 has
              to leave every grid, dropdown and schedule row in the company
              while B01 to B13 stay exactly where they were.
     B15      past the end of the range — the plainest version of the add.
     B4-R     a TRANSFER PLOT, which a 3rd-culling transfer makes and which
              is in no hardcoded range anywhere. The live case.
     B1       spelt unpadded the way the office types it, against a range
              that spells it B01. Must not be offered twice.
     UNN 1    keyed in full plus U19, and its nursery is spelt "UNN 1" WITH
              THE SPACE, which is how shared_plots spells it everywhere.
     UNN2     keyed in full, so N21 can only arrive by the hand-added route.
     PN       DELIBERATELY NOT KEYED. The pre nursery is counted in TRAYS, so
              shared_plots may hold no PN row at all — and its 52 plots have
              to survive that. This is the guard that stops the whole change
              being a cliff.
     X7 / UNE the ESTATE, which is not one of the four nurseries. There is
              no column or tab to put it under, so it is left out — and
              shared/CHECK_which_plots_each_module_offers.sql is what names
              those, because a plot on no picker with nothing saying so is
              the fault this whole change is about. */
const DELETED = 'B14';
const range = (letter, n) => Array.from({ length: n }, (_, i) => letter + (i + 1));
const SHARED_PLOTS = [
  ...range('B', 14).filter((p) => p !== 'B14').map((p) => ({ nursery_name: 'BNN',   plot_name: p })),
  { nursery_name: 'BNN',   plot_name: 'B15'  },
  { nursery_name: 'BNN',   plot_name: 'B4-R' },
  ...range('U', 18).map((p) => ({ nursery_name: 'UNN 1', plot_name: p })),
  { nursery_name: 'UNN 1', plot_name: 'U19'  },
  ...range('N', 20).map((p) => ({ nursery_name: 'UNN2',  plot_name: p })),
  { nursery_name: 'UNE',   plot_name: 'X7'   },
];
const CUSTOM_PLOTS = [
  { nursery: 'UNN2', plot: 'N21' },
];

/* ── A supabase-js-shaped client over the two fixtures, and a broken one.
   `mode` is what each section is actually testing. */
function fakeSupa(mode) {
  return {
    from(table) {
      return {
        select() {
          if (mode === 'down') return Promise.resolve({ error: { message: 'no' } });
          if (mode === 'throw') return Promise.reject(new Error('boom'));
          const data = table === 'shared_plots' ? SHARED_PLOTS
                     : table === 'nops_maint_custom_plots' ? CUSTOM_PLOTS
                     : [];
          return Promise.resolve({ data });
        }
      };
    }
  };
}

/* The audit module's own thin client, which is what audit_plots.js shims
   over. `sb.select(table, 'select=a,b')` → rows. */
function fakeSb(mode) {
  return {
    select(table) {
      if (mode === 'down' || mode === 'throw') return Promise.reject(new Error('no'));
      return Promise.resolve(table === 'shared_plots' ? SHARED_PLOTS
                           : table === 'nops_maint_custom_plots' ? CUSTOM_PLOTS
                           : []);
    }
  };
}

/* Load one of the shipped files into a sandbox of its own. The point is
   that these are the files that ship — a copy of the rules written out
   here would be a test agreeing with itself. */
function loadShipped(files, extras) {
  const sandbox = Object.assign({ console, Promise, JSON, Math, Date, String, Number,
                                  Object, Array, Set, Map, RegExp, Error }, extras || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.__missing = [];
  const ctx = vm.createContext(sandbox);
  files.forEach((rel) => {
    const p = path.join(ROOT, rel);
    /* A FILE THAT IS NOT THERE IS A NAMED FAILURE, never a thrown
       ENOENT: on the code before this change audit/audit_plots.js does
       not exist, and a harness that stops there says nothing about the
       fifty checks underneath it. */
    if (!fs.existsSync(p)) { sandbox.__missing.push(rel); return; }
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel });
  });
  if (!sandbox.MJMAuditPlots) sandbox.MJMAuditPlots = null;
  return sandbox;
}

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('no'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

/* Strip comments before searching a source file. Every one of these files
   EXPLAINS at length what it no longer does, in prose that names the thing
   — so a plain text search reads the explanation as the code. This file
   has a heading about that trap and it has now bitten five times. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}

(async () => {

/* ══ 1. THE SHARED OFFICE LIST ═════════════════════════════════════════
   shared/shared_maint_plots.js is the one place in the office repository
   that reads shared_plots. It is unchanged by this work; it is driven here
   because everything below stands on it. */
console.log('\n1. shared/shared_maint_plots.js — the one read');
{
  const { MJMMaintPlots: MP } = loadShipped(['shared/shared_maint_plots.js']);
  const got = await MP.loadLists(fakeSupa('ok'));
  const by  = got.offer;

  check('the office B15 is in BNN', by.BNN.indexOf('B15') !== -1, true);
  check('the transfer plot B4-R is in BNN', by.BNN.indexOf('B4-R') !== -1, true);
  check('"UNN 1" with the space resolves to UNN1', by.UNN1.indexOf('U19') !== -1, true);
  check('a custom-plot row is in it too', by.UNN2.indexOf('N21') !== -1, true);
  check('THE DELETED PLOT IS GONE — the whole of what the office asked for',
        by.BNN.indexOf(DELETED), -1);
  check('…and every plot either side of it stayed',
        ['B1', 'B13', 'B15'].filter((p) => by.BNN.indexOf(p) === -1), []);
  check('the pre nursery was never keyed, so its 52 plots stand', by.PN.length, 52);
  /* The ranges spell it B1 and so does the office. One plot, once. */
  check('B1 is not in the list twice', by.BNN.filter((p) => p === 'B1').length, 1);
  /* A fifth nursery has no column anywhere, so it is left out rather than
     invented — and the handover SQL is what names it. */
  check('the estate plot is on no nursery', Object.keys(by).some((n) => by[n].indexOf('X7') !== -1), false);
  check('four nurseries and no more', Object.keys(by).sort(), ['BNN', 'PN', 'UNN1', 'UNN2']);

  const down = (await MP.loadLists(fakeSupa('down'))).offer;
  check('a read that fails leaves the ranges whole', down.BNN.length, 14);
  check('…and adds nothing', down.BNN.indexOf('B15'), -1);
  check('…and a failed read puts the DELETED plot BACK, which is the point of '
      + 'failing open: an empty picker is a module nobody can use',
        down.BNN.indexOf(DELETED) !== -1, true);

  /* PLACING IS NOT OFFERING, and this is the check that says so. A
     maintenance record keyed on a plot the office has since deleted has to go
     on resolving to its nursery, or taking a plot off the pickers takes last
     month's work off the salary claim. */
  check('a record on the DELETED plot still resolves to its nursery',
        MP.nurseryOfPlot(DELETED, got.place), 'BNN');
  check('…and so does one on a plot that was never keyed at all',
        MP.nurseryOfPlot('P07', got.place), 'PN');
}

/* ══ 2. THE AUDIT MODULE'S ONE LIST ════════════════════════════════════ */
console.log('\n2. audit/audit_plots.js — the auditor portal\'s one list');
{
  const env = loadShipped(['shared/shared_maint_plots.js', 'audit/audit_plots.js'],
                          { sb: fakeSb('ok'), navigator: { onLine: true } });
  const AP = env.MJMAuditPlots || {};
  check('audit/audit_plots.js is on disk — the module’s one plot list', env.__missing, []);

  safe('before the read, the four ranges are what it has',
       () => [AP.list('BNN').length, AP.list('UNN1').length], [14, 18]);

  const before = AP.all ? AP.all() : null;
  await settle(AP.load && AP.load());
  safe('all() is the SAME object after the read — the list is LIVE, which is '
     + 'what lets a grid pick a plot up without knowing where it came from',
       () => AP.all() === before, true);

  safe('the office B15 is on the list, PADDED as this module spells a plot',
       () => AP.list('BNN').indexOf('B15') !== -1, true);
  safe('the transfer plot arrives as B04-R, not B4-R — every saved audit, '
     + 'grid key and deep link in this module is in the padded form',
       () => [AP.list('BNN').indexOf('B04-R') !== -1, AP.list('BNN').indexOf('B4-R') !== -1],
       [true, false]);
  safe('"UNN 1" with the space put U19 in UNN1',
       () => AP.list('UNN1').indexOf('U19') !== -1, true);
  safe('a custom plot is on it too', () => AP.list('UNN2').indexOf('N21') !== -1, true);
  safe('B1 did not arrive beside B01', () => AP.list('BNN').filter((p) => p === 'B1').length, 0);
  safe('the office list IS the list — thirteen kept, two added',
       () => AP.list('BNN').length, 15);
  safe('B15 sorts last, not between B1 and B2',
       () => AP.list('BNN').slice(-2), ['B13', 'B15']);
  safe('THE DELETED PLOT IS OFF THE GRID AND THE DROPDOWN',
       () => AP.list('BNN').indexOf('B14'), -1);
  safe('…and the module can still PLACE it, so a saved audit and the board '
     + 'that owes one are both untouched', () => AP.nurseryOf('B14'), 'BNN');
  safe('the pre nursery was never keyed, so its 52 plots stand',
       () => AP.list('PN').length, 52);
  safe('the estate plot is on no list',
       () => (AP.NURSERIES || []).some((n) => AP.list(n).indexOf('X7') !== -1), false);

  safe('byPlot places the new plot — this is what decides which nursery a '
     + 'record is in', () => [AP.byPlot()['B15'], AP.byPlot()['B04-R'], AP.byPlot()['U19']],
       ['BNN', 'BNN', 'UNN1']);
  safe('byPlot still answers for the unpadded spelling of a range plot, '
     + 'which is how the operation ledger writes one',
       () => [AP.byPlot()['B1'], AP.byPlot()['B01']], ['BNN', 'BNN']);
  safe('nurseryOf takes either spelling', () => [AP.nurseryOf('B4-R'), AP.nurseryOf('b 15')],
       ['BNN', 'BNN']);
  safe('it says what the office added', () => AP.added().sort(),
       ['BNN|B04-R', 'BNN|B15', 'UNN1|U19', 'UNN2|N21']);
  safe('…and what the office took away', () => AP.gone(), ['BNN|B14']);
  safe('asking twice is one read', () => AP.load() === AP.load(), true);

  /* THE FAILURE MODES. Every one of them has to leave the module exactly
     where it was, because an empty plot list is a module nobody can use. */
  const down = loadShipped(['shared/shared_maint_plots.js', 'audit/audit_plots.js'],
                           { sb: fakeSb('down'), navigator: { onLine: true } });
  await settle(down.MJMAuditPlots && down.MJMAuditPlots.load());
  safe('a read that fails leaves the four ranges standing',
       () => down.MJMAuditPlots.list('BNN'), Array.from({ length: 14 },
            (_, i) => 'B' + String(i + 1).padStart(2, '0')));
  safe('…and says so rather than throwing', () => down.MJMAuditPlots.ready(), true);

  /* THE SHARED FILE NOT LOADED AT ALL — a page that has audit_plots.js and
     not shared_maint_plots.js. It must still draw. */
  const alone = loadShipped(['audit/audit_plots.js'],
                            { sb: fakeSb('ok'), navigator: { onLine: true } });
  await settle(alone.MJMAuditPlots && alone.MJMAuditPlots.load());
  safe('with no shared file on the page it is the ranges, not a crash',
       () => alone.MJMAuditPlots.list('UNN2').length, 20);

  /* OFFLINE SENDS NOTHING. Two requests to the service worker's own
     synthetic 503 answer nothing and cost a round trip each. */
  let asked = 0;
  const off = loadShipped(['shared/shared_maint_plots.js', 'audit/audit_plots.js'],
                          { sb: { select(t) { asked++; return Promise.resolve([]); } },
                            navigator: { onLine: false } });
  await settle(off.MJMAuditPlots && off.MJMAuditPlots.load());
  /* [did it run at all, how many reads it made]. Asked as a PAIR: on a
     build with no audit_plots.js at all `asked` is 0 as well, and a lone
     count would pass for exactly the wrong reason. */
  safe('with no line it sends nothing',
       () => [off.MJMAuditPlots.ready(), asked], [true, 0]);
  safe('…and the ranges are the answer', () => off.MJMAuditPlots.list('PN').length, 52);
}

/* ══ 3. THE REAL PLOT CONDITION PAGE ═══════════════════════════════════ */
console.log('\n3. the REAL Plot Condition page — the grid and the dropdown');
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

{
  const ctx  = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  const tableOf = (url) => { const m = /\/rest\/v1\/([a-z0-9_]+)/i.exec(url); return m ? m[1] : ''; };
  await page.route('**/rest/v1/**', (route) => {
    const t = tableOf(route.request().url());
    const body = t === 'shared_plots'             ? SHARED_PLOTS
               : t === 'nops_maint_custom_plots'  ? CUSTOM_PLOTS
               : [];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/auth/v1/**', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ access_token: 'x', user: { id: 'u1' } }) }));
  ['**cdn.tailwindcss.com/**', '**cdn.jsdelivr.net/**'].forEach((p) =>
    page.route(p, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' })));
  await page.route('**fonts.googleapis.com/**', (r) => r.fulfill({ status: 200,
    contentType: 'text/css', body: '' }));

  await page.addInitScript(() => {
    const u = { id: 'u1', email: 'auditor@mjmnursery.com', full_name: 'Auditor',
                role: 'admin', audit_role: 'admin', permissions: { audit_landing: 'MN' } };
    try {
      localStorage.clear();
      localStorage.setItem('mjm_user', JSON.stringify(u));
      localStorage.setItem('mjm_nursery_scope:u1', 'MN');
      localStorage.setItem('sb-kibqjztozokohqmhqqqf-auth-token', JSON.stringify({
        access_token: 'x', refresh_token: 'y',
        expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: 'u1', email: u.email } }));
    } catch (e) {}
  });

  await page.goto(`http://localhost:${port}/audit/audit_plot_audit.html?admin=1`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5500);

  /* `const NURSERY_PLOTS` and `let formState` are top-level LEXICAL
     bindings of a classic script, so they are NOT on `window` — only `var`
     and an explicit assignment are. `window.NURSERY_PLOTS` reads undefined
     on a page that is working perfectly, which is how the first run of
     this section reported an empty grid over a correct one. A bare
     identifier inside page.evaluate resolves up the scope chain and finds
     them; and formState is MUTATED rather than reassigned, because
     assigning through window would make a second, unrelated binding. */
  const got = await page.evaluate(async () => {
    const out = { err: null };
    try {
      /* The list the page is actually working from, and the one the grid
         and the dropdown are both drawn off. */
      out.bnn   = NURSERY_PLOTS.BNN.slice();
      out.unn1  = NURSERY_PLOTS.UNN1.slice();
      out.place = [PLOT_TO_NURSERY['B15'], PLOT_TO_NURSERY['B04-R']];
      /* THE DROPDOWN, which is what an auditor keying a record actually
         sees. populateForm fills it off the nursery in formState. */
      formState.nursery = 'BNN';
      populateForm(null);
      out.opts = [...document.querySelectorAll('#f-plot option')].map((o) => o.value);
    } catch (e) { out.err = String(e && e.message || e); }
    return out;
  });

  check('the page took no error while loading', errs.filter((e) => !/favicon/i.test(e)), []);
  check('the page is working from the office\'s list', got.err, null);
  check('BNN carries the office\'s two new plots',
        (got.bnn || []).filter((p) => p === 'B15' || p === 'B04-R').sort(), ['B04-R', 'B15']);
  check('UNN1 carries U19 — the nursery spelt with a space still matched',
        (got.unn1 || []).indexOf('U19') !== -1, true);
  check('and the page can place them under a nursery', got.place, ['BNN', 'BNN']);
  check('the PLOT DROPDOWN offers them, which is what the auditor sees',
        (got.opts || []).filter((p) => p === 'B15' || p === 'B04-R').sort(), ['B04-R', 'B15']);
  /* NOT /^B\d\d$/ — that matches B15 as well, so it counts 15 on a correct
     page and the first run of this check reported a fault that was its
     own. The plots are named instead.

     THIRTEEN, not fourteen: B14 was deleted in the office and this is the
     check that says the auditor's own grid followed. Asked as a PAIR, so a
     page that simply drew nothing could not pass it. */
  const KEPT = Array.from({ length: 13 }, (_, i) => 'B' + String(i + 1).padStart(2, '0'));
  check('the thirteen the office kept are still offered',
        KEPT.filter((p) => (got.opts || []).indexOf(p) === -1), []);
  check('…and the one they DELETED is not',
        (got.opts || []).indexOf('B' + DELETED.slice(1).padStart(2, '0')), -1);
  await ctx.close();
}

/* ══ 4. THE REAL NELOS DOCK ════════════════════════════════════════════
   The raise form on 52 office pages. Driven the way its sibling test
   drives it — the fixture is a bare page with nothing but the dock on it. */
console.log('\n4. the REAL Nelos dock — the raise form on 52 pages');
{
  const FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>dock</title></head>
<body><div id="page">a module page</div>
<script>window.SHARED_SUPA_URL='https://test.supabase.co';window.SHARED_SUPA_KEY='anon-key';</script>
<script src="/shared/shared_nelos_dock.js" data-source="scan"></script></body></html>`;

  const ctx  = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('sb-test-auth-token', JSON.stringify({
        access_token: 'tok', expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: { id: 'u1', email: 'office@x.com', user_metadata: { full_name: 'The Office' } } }));
    } catch (_) {}
  });
  /* ONE handler reading the url rather than a route each: routes match in
     REVERSE registration order, so a catch-all added later would swallow
     every specific one above it. */
  await page.route('**://*.supabase.co/**', (r) => {
    const url = r.request().url();
    const body = url.includes('shared_profiles')
                   ? [{ permissions: { modules: { nelos: 'admin' } } }]
               : url.includes('nelos_my_rights') ? [{ may_solve: true, may_close: true }]
               : url.includes('nelos_my_scope')  ? [{ primary_module: null, seat_no: null,
                                                      categories: null, is_admin: true }]
               : url.includes('nelos_modules')   ? [{ key: 'scan', label: 'FC Portal',
                                                      handler_label: 'FC', active: true }]
               : url.includes('nelos_categories')
                   ? [{ name: 'Repair Maintenance Work', module_key: 'scan',
                        raise_modules: ['scan'], pic_seat_no: null, pic_user_id: null }]
               : url.includes('nops_maint_custom_plots') ? CUSTOM_PLOTS
               : url.includes('shared_plots')            ? SHARED_PLOTS
               : [];
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/__dock_fixture.html', (r) => r.fulfill({
    status: 200, contentType: 'text/html', body: FIXTURE }));
  await page.goto(`http://localhost:${port}/__dock_fixture.html`, { waitUntil: 'load' })
            .catch(() => {});
  await page.waitForSelector('#nelos-dock', { state: 'attached', timeout: 10000 }).catch(() => {});
  await page.evaluate(() => { try { window.NelosDock.newCase(); } catch (_) {} });
  /* The system list is the signal that populateForm has run, and it is
     filled by nothing else. Never a flat delay. */
  await page.waitForFunction(
    () => (document.getElementById('nd-f-to') || { options: [] }).options.length > 1,
    null, { timeout: 8000 }).catch(() => {});

  const plotsFor = (n) => page.evaluate((nursery) => {
    const nurs = document.getElementById('nd-f-nursery');
    const plot = document.getElementById('nd-f-plot');
    if (!nurs || !plot) return 'no plot picker on the form';
    nurs.value = nursery;
    nurs.dispatchEvent(new Event('change', { bubbles: true }));
    return [...plot.options].map((o) => o.value).filter(Boolean);
  }, n);

  const bnn = await plotsFor('BNN');
  check('the dock offers the office\'s new BNN plots',
        Array.isArray(bnn) ? bnn.filter((p) => p === 'B15' || p === 'B4-R').sort() : bnn,
        ['B15', 'B4-R']);
  /* THE DOCK SHOWS THE OFFICE'S OWN SPELLING, which is what it offered for
     a plot outside the ranges all along and is now what it offers for every
     plot of a keyed nursery: 'B1', not the range's 'B01'. That is the case
     log's spelling too — `nelos_dashboard.html` reads shared_plots straight
     — so the two pickers now agree where they used to differ. */
  const KEPT = Array.from({ length: 13 }, (_, i) => 'B' + (i + 1));
  check('…and still every plot the office kept',
        Array.isArray(bnn) ? KEPT.filter((p) => bnn.indexOf(p) === -1) : bnn, []);
  check('…and NOT the one they deleted',
        Array.isArray(bnn) ? bnn.filter((p) => p === DELETED || p === 'B14') : bnn, []);
  check('B1 is not offered twice under two spellings',
        Array.isArray(bnn) ? bnn.filter((p) => p === 'B1' || p === 'B01').length : bnn, 1);
  const unn1 = await plotsFor('UNN1');
  check('UNN1 offers U19 — the nursery spelt with a space matched',
        Array.isArray(unn1) ? unn1.indexOf('U19') !== -1 : unn1, true);
  const un2 = await plotsFor('UNN2');
  check('a plot added by hand on the schedule is offered too',
        Array.isArray(un2) ? un2.indexOf('N21') !== -1 : un2, true);
  const all = await plotsFor('All Nursery');
  check('All Nursery offers every one of them',
        Array.isArray(all) ? ['B15', 'U19', 'N21'].filter((p) => all.indexOf(p) === -1) : all,
        []);
  check('…and the pre nursery, which the office never keyed, still has 52',
        Array.isArray(all) ? all.filter((p) => /^P\d+$/.test(p)).length : all, 52);
  check('and never the estate plot, which has no nursery to sit under',
        Array.isArray(all) ? all.indexOf('X7') : all, -1);
  await ctx.close();
}

await browser.close();
server.close();

/* ══ 5. THE SOURCE — WHAT STOPS IT COMING BACK ═════════════════════════
   Eight places carried their own four ranges. Four files may hold a copy,
   and each of them states the same rules; nobody else may. A ninth copy
   added next year is how this fault returns, and it returns silently. */
console.log('\n5. the source — nobody keeps their own four ranges');
{
  /* The shape of a four-range list, however it is written: a padded or
     unpadded run of 52 / 14 / 18 / 20 against P / B / U / N, built with
     Array.from, built with a pad() helper, or simply typed out — which is
     what shared_maint_plots.js does, and the first version of this check
     missed it for that reason. Matching the COUNTS and the END of each
     range rather than a spelling, because each of the eight wrote it
     differently and the next one will too. */
  const RANGE = /length\s*:\s*(52|14|18|20)|pad\(\s*'[PBUN]'\s*,\s*(52|14|18|20)\s*\)|'(P52|B14|U18|N20)'/;

  const OWNERS = [
    ['shared/shared_maint_plots.js', ROOT],   // the office's one read
    ['audit/audit_plots.js',         ROOT],   // the audit module's one list
    ['shared/shared_nelos_dock.js',  ROOT],   // standalone on 52 pages
    ['src/lib/nurseryPlots.js',      PHONE],  // the FC Portal
    ['src/lib/nurseryPlots.js',      ADMIN],  // the Admin Portal
  ];
  OWNERS.forEach(([rel, base]) => {
    const p = path.join(base, rel);
    safe('OWNS a copy of the ranges: ' + path.basename(base) + '/' + rel,
         () => RANGE.test(code(fs.readFileSync(p, 'utf8'))), true);
  });

  /* …and every one of them reads shared_plots, or reads something that
     does. A file holding the ranges and NOT linked to the office is the
     whole fault. */
  OWNERS.forEach(([rel, base]) => {
    safe('…and is linked to Seedling Stock: ' + path.basename(base) + '/' + rel,
         () => {
           const src = code(fs.readFileSync(path.join(base, rel), 'utf8'));
           return /shared_plots/.test(src) || /MJMMaintPlots/.test(src);
         }, true);
  });

  const FREED = [
    ['audit/audit_script.js',            ROOT],
    ['audit/audit_height_script.js',     ROOT],
    ['audit/audit_papan_script.js',      ROOT],
    ['audit/audit_pending.js',           ROOT],
    ['audit/audit_home.html',            ROOT],
    ['audit/audit_maintenance_script.js', ROOT],
    ['src/components/NelosNewCase.jsx',  PHONE],
    ['src/components/NelosNewCase.jsx',  ADMIN],
  ];
  FREED.forEach(([rel, base]) => {
    const p = path.join(base, rel);
    safe('keeps NO ranges of its own: ' + path.basename(base) + '/' + rel,
         () => RANGE.test(code(fs.readFileSync(p, 'utf8'))), false);
  });

  /* No file in the audit module may build its own plot→nursery map with an
     IIFE any more. A map built at script load is a SNAPSHOT, and the whole
     point of the live object is that the office's plots land after it. */
  FREED.filter(([, b]) => b === ROOT).forEach(([rel]) => {
    safe('builds no snapshot of the plot map: ' + rel,
         () => /\[A-Z\]\+\)0\+/.test(code(fs.readFileSync(path.join(ROOT, rel), 'utf8'))),
         false);
  });

  /* THE TWO PHONE COPIES ARE ONE FILE. Different repositories cannot
     import from each other, so the only thing that can keep them in step
     is a check. Compared with the comments stripped, because each names
     the screens of its own portal in its header. */
  safe('the FC Portal and the Admin Portal copies are the same code',
       () => code(fs.readFileSync(path.join(PHONE, 'src/lib/nurseryPlots.js'), 'utf8'))
                 .replace(/'\.\/supabase(\.js)?'/, "'./supabase'").replace(/\s+/g, ' ').trim()
          === code(fs.readFileSync(path.join(ADMIN, 'src/lib/nurseryPlots.js'), 'utf8'))
                 .replace(/'\.\/supabase(\.js)?'/, "'./supabase'").replace(/\s+/g, ' ').trim(),
       true);

  /* THE AUDIT MODULE'S ONE LIST IS A HARD DEPENDENCY of all five scripts
     that read it — each reads MJMAuditPlots at its top level — so a page
     that could not fetch it would not draw at all. It has to be precached
     or an offline visit is a blank screen. */
  safe('audit_plots.js is precached by the service worker',
       () => /\.\/audit_plots\.js/.test(fs.readFileSync(path.join(ROOT, 'audit/audit_sw.js'), 'utf8')),
       true);

  /* …and every page that loads one of those five scripts has to load it
     FIRST, or the script throws on MJMAuditPlots at its top level. */
  const PAGES = ['audit/audit_plot_audit.html', 'audit/audit_height_index.html',
                 'audit/audit_papan_index.html', 'audit/audit_maintenance_index.html',
                 'audit/audit_home.html', 'audit/audit_admin.html'];
  PAGES.forEach((rel) => {
    safe('loads the plot list before the script that reads it: ' + rel, () => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const tags = (src.match(/<script src="[^"]*"/g) || []).map((x) => x.slice(13, -1));
      const i = tags.findIndex((t) => t.indexOf('audit_plots.js') !== -1);
      const readers = tags.map((t, k) => (/audit_(script|height_script|papan_script|pending|maintenance_script)\.js/
                                          .test(t) ? k : -1)).filter((k) => k >= 0);
      return i >= 0 && readers.every((k) => k > i);
    }, true);
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

})().catch((e) => { console.error(e); process.exit(1); });
