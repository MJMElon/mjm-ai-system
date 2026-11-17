/* THE AUDIT'S PLOT AND BATCH LIST IS THE MAIN NURSERY MOVEMENT REPORT

   The office: *"for the nursery audit's plot condition audit and seedling
   height audit's plot and batch link to the summary report (main nursery
   movement report). So if the plot shown in the report, it will shown for
   audit too."*

   Both modules built their roster from the LIFE-STAGE LOGS — `Planted` and
   `Transplanted*` — and used `shared_plot_batch_balance` only as a GATE.
   That view IS the Movement Report, so the gate was the report and the
   roster was not: **a batch that arrived by TRANSFER has no `Transplanted`
   log at all**, so it sat in the report, had a balance row, and was on no
   grid for the gate to be asked about. That is every "-R" plot.

   B4-R is the fixture and it is the live case: made by a 3rd-culling
   transfer, standing at 6,000 on the report, and invisible to both audits.

   Run: NODE_PATH=/opt/node-tools/node_modules node tests/the_audit_roster_is_the_movement_report.cjs
   with a static server on 8777 serving the repository root.               */
const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue  = (n, g) => check(n, !!g, true);
const checkFalse = (n, g) => check(n, !!g, false);

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── THE SHIPPED FILE, not a restatement ─────────────────────────────────
   IT ANSWERS NULL RATHER THAN THROWING when the file is not there, which is
   the previous code exactly. A harness that dies on an ENOENT reports
   nothing about the forty checks underneath it -- the house trap, met here
   for the second time. The absence is ONE NAMED FAILURE and everything else
   is still asked. */
function loadRoster() {
  let src;
  try { src = read('audit/audit_roster.js'); }
  catch (e) { return null; }
  const g = {};
  try { new Function('window', src)(g); } catch (e) { return null; }
  return g.MJMAuditRoster || null;
}

/* The audit module's own padded spelling, lifted from audit_plots.js so the
   fixture canonicalises exactly as the grid does ('B4-R' → 'B04-R'). */
function loadCanon() {
  const g = {};
  new Function('window', read('audit/audit_plots.js'))(g);
  return g.MJMAuditPlots;
}

/* ── THE FIXTURE ──────────────────────────────────────────────────────────
   B01 arrived the ordinary way and is in both.
   B04-R arrived by TRANSFER: no log, a report row of 6,000.
   B02 went out: it has a log and the report has closed it at nought.
   P01 is the Pre Nursery, which the report never carries.               */
const LOGS = [
  { plot_name: 'B1',  batch_name: '250', transaction_type: 'Transplanted',
    breed_name: 'DxP', transaction_date: '2026-09-01' },
  { plot_name: 'B2',  batch_name: '251', transaction_type: 'Transplanted',
    breed_name: 'DxP', transaction_date: '2026-08-01' },
  { plot_name: 'P1',  batch_name: '277', transaction_type: 'Planted',
    breed_name: 'DxP', transaction_date: '2026-09-28' }
];
const BALANCE = [
  { plot_name: 'B1',   batch_name: '250', qty: 4201 },
  { plot_name: 'B2',   batch_name: '251', qty: 0    },   // sold out
  { plot_name: 'B4-R', batch_name: '260', qty: 6000 },   // ONLY the report
  { plot_name: 'ZZ9',  batch_name: '261', qty: 500  }    // places nowhere
];

(async () => {
  const R     = loadRoster();
  checkTrue('audit_roster.js is there — the ONE place the roster rule lives', R);

  /* Stand-ins so every check below is ASKED and fails by its own name on a
     build that has no roster file, rather than the run stopping here. */
  const RB = R ? R.build.bind(R)
              : () => ({ plotBatches: [], balanceByPB: {}, fromBalance: 0, unplaced: 0 });
  const RN = R ? R.notRequired.bind(R) : () => false;

  const Plots = loadCanon();
  const canon = Plots.canon;

  /* A "-R" PLOT PLACES ONLY ONCE SEEDLING STOCK HAS BEEN READ, which is a
     real coupling and is asserted on its own below rather than hidden here.
     `audit_plots.js` holds the four fixed RANGES until MJMAuditPlots.load()
     brings the office list in, and B4-R is in no range — so this stands in
     for that read, exactly as the live module has it after load(). */
  const STOCK = { 'B04-R': 'BNN' };
  const nurseryOf = (p) => Plots.byPlot()[p] || STOCK[p] || null;

  console.log('\n1. THE REPORT IS A SOURCE, NOT ONLY A GATE');
  {
    const out = RB({ logs: LOGS, auditBatches: [], balance: BALANCE,
                          canon, nurseryOf, dateOf: (l) => l.transaction_date });
    const pairs = out.plotBatches.map(b => b.nursery + '|' + b.plot + '|' + b.batch).sort();

    checkTrue('B04-R is on the grid — it is in the report and in no log',
              pairs.includes('BNN|B04-R|260'));
    check('…and it was the report alone that knew', out.fromBalance, 1);
    checkTrue('the ordinary transplant is still there', pairs.includes('BNN|B01|250'));
    checkTrue('the pre nursery tray is still there',    pairs.includes('PN|P01|277'));

    /* A batch the report has closed at nought is NOT added as a task — see
       the header of audit_roster.js. It keeps the row it already had from
       its own log, and the gate greys it. */
    checkTrue('a batch standing at nought keeps its log row', pairs.includes('BNN|B02|251'));
    checkTrue('…and the gate still calls it Not Required',
              RN(out.balanceByPB, canon, 'B02', '251'));
    checkFalse('while a standing batch is required',
               RN(out.balanceByPB, canon, 'B01', '250'));
    checkFalse('…and so is the transferred one, which is the point',
               RN(out.balanceByPB, canon, 'B04-R', '260'));

    /* A report row whose plot is under no nursery cannot be drawn on a grid
       with four tabs — left out, and COUNTED rather than quietly short. */
    checkFalse('a plot under no nursery is on no grid',
               pairs.some(p => p.includes('ZZ9')));
    check('…and it is counted', out.unplaced, 1);

    check('the whole roster, by name', pairs,
          ['BNN|B01|250', 'BNN|B02|251', 'BNN|B04-R|260', 'PN|P01|277']);

    /* THE COUPLING, SAID OUT LOUD. With only the four ranges -- a page whose
       Seedling Stock read failed, or one loaded before it landed -- B4-R is
       under no nursery and cannot be drawn. It is left out and COUNTED, so
       the console line says how many rather than the grid being quietly
       short. That is the fail-open direction: a plot picker that went blank
       over a refused read is worse than one that is a plot behind. */
    const ranges = RB({ logs: LOGS, auditBatches: [], balance: BALANCE,
                             canon, nurseryOf: p => Plots.byPlot()[p] || null });
    checkFalse('with the ranges alone the transfer plot cannot place',
               ranges.plotBatches.some(b => b.plot === 'B04-R'));
    check('…and it is counted rather than dropped in silence',
          ranges.unplaced, 2);
  }

  console.log('\n2. IT IS PURELY ADDITIVE — the logs keep their breed and date');
  {
    const out = RB({ logs: LOGS, auditBatches: [], balance: BALANCE,
                          canon, nurseryOf, dateOf: (l) => l.transaction_date });
    const b01 = out.plotBatches.find(b => b.plot === 'B01') || {};
    check('the log row keeps its breed',  b01.breed,   'DxP');
    check('…and its planted date',        b01.planted, '2026-09-01');

    /* The report carries neither, so a pair only it knows about has neither
       — and must not be able to blank one the logs supplied. */
    const r = out.plotBatches.find(b => b.plot === 'B04-R') || {};
    check('a report-only pair has no breed',        r.breed,   '');
    check('…and no date, the report carrying none', r.planted, '');

    const reversed = RB({ logs: LOGS, auditBatches: [],
                               balance: BALANCE.slice().reverse(),
                               canon, nurseryOf, dateOf: (l) => l.transaction_date });
    check('…and the report cannot overwrite the log row whatever the order',
          (reversed.plotBatches.find(b => b.plot === 'B01') || {}).breed, 'DxP');
  }

  console.log('\n3. THE OLD BEHAVIOUR IS WHAT MOVED, and nothing else');
  {
    /* No balance at all is a refused read: it fails OPEN, every batch
       required, and the report adds nothing. */
    const none = RB({ logs: LOGS, auditBatches: [], balance: [],
                           canon, nurseryOf });
    check('a refused balance read adds nothing', none.fromBalance, 0);
    checkFalse('…and nothing is Not Required',
               RN(none.balanceByPB, canon, 'B02', '251'));
    check('…and the log roster is exactly what it always was',
          none.plotBatches.map(b => b.plot).sort(), ['B01', 'B02', 'P01']);

    /* audit_batches is re-placed through nurseryOf, never trusted on its own
       `nursery` column — a stale label must not push a plot onto the wrong
       grid. */
    const ab = RB({ logs: [], auditBatches: [
      { nursery: 'UNN2', plot: 'B1', batch_no: '250', breed: 'DxP' }
    ], balance: [], canon, nurseryOf });
    check('audit_batches is placed by the PLOT, not by its own label',
          ab.plotBatches.map(b => b.nursery), ['BNN']);
  }

  console.log('\n4. ONE RULE, NOT TWO COPIES');
  {
    const src = { plot:   read('audit/audit_script.js'),
                  height: read('audit/audit_height_script.js') };
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    Object.entries(src).forEach(([name, raw]) => {
      const s = strip(raw);
      checkTrue(name + ' builds its roster through audit_roster.js',
                /MJMAuditRoster\.build\(/.test(s));
      checkTrue(name + ' asks the shared not-required rule',
                /MJMAuditRoster\.notRequired\(/.test(s));
      checkTrue(name + ' sends the shared log filter',
                /MJMAuditRoster\.LOG_FILTER/.test(s));
      /* The whole fault was two copies drifting, so neither may keep one:
         a module spelling the transaction list into its own query again is
         a module that can quietly ask a different question. */
      checkFalse(name + ' no longer spells the transaction list itself',
                 /transaction_type=in\.\(/.test(s));
      /* Asked of the WRITE and never of the declaration: `let balanceByPB
         = {}` at the top of the file is the state both modules still keep,
         and matching that read a correct module as a hand-build. What must
         not come back is a loop filling it key by key. */
      checkFalse(name + ' no longer fills balanceByPB key by key',
                 /balanceByPB\[[^\]]+\]\s*=/.test(s));
      checkTrue(name + ' takes it from the shared builder',
                /balanceByPB\s*=\s*roster\.balanceByPB/.test(s));
    });

    /* A hard dependency has to be loaded BEFORE the script that reads it,
       and precached, or the page half-evaluates. */
    [['audit/audit_plot_audit.html',   'audit_script.js'],
     ['audit/audit_height_index.html', 'audit_height_script.js']].forEach(([page, mod]) => {
      const h = read(page);
      const iR = h.indexOf('audit_roster.js');
      const iM = h.indexOf(mod + '?v=');
      checkTrue(page + ' loads audit_roster.js', iR > -1);
      checkTrue(page + ' loads it BEFORE ' + mod, iR > -1 && iM > -1 && iR < iM);
    });
    checkTrue('audit_sw.js precaches it',
              /'\.\/audit_roster\.js'/.test(read('audit/audit_sw.js')));
  }

  /* ── 5. THE REAL PAGES ────────────────────────────────────────────────── */
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  async function boot(url, tag) {
    const page = await browser.newContext({ serviceWorkers: 'block' })
                              .then(c => c.newPage());
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    await page.addInitScript(({ logs, balance }) => {
      const TABLES = {
        shared_inventory_logs: logs,
        shared_plot_batch_balance: balance,
        audit_plot_audits: [], audit_height_records: [],
        audit_batches: [], operation_batches: [],
        shared_plots: [{ nursery_name: 'BNN', plot_name: 'B4-R' }],
        audit_settings: []
      };
      window.__TABLES = TABLES;
      window.sb = {
        select: async (table) => (TABLES[table] || []).slice(),
        insert: async () => ({}), update: async () => ({}),
        uploadPhoto: async () => '', user: () => ({ email: 'a@b.c' })
      };
      window.MJMAuditSettings = undefined;
    }, { logs: LOGS, balance: BALANCE });

    for (const h of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**',
                     '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**'])
      await page.route(h, r => r.fulfill({ status: 200, body: '' }));
    /* Stand in for the two files that reach the network. The login guard
       has to DEFINE MJMAuditLogin rather than be blanked: several module
       scripts reference it bare, so an absent one throws past whatever runs
       next. audit_supabase.js is stubbed because its page-access gate
       redirects to the To Do list when no session answers. */
    await page.route('**/audit_login_guard.js*', r => r.fulfill({
      status: 200, contentType: 'application/javascript',
      body: 'window.MJMAuditLogin={requireSignIn(){},scopeNurseries(){return null;},'
          + 'fromManage(){return true;},user(){return{email:"a@b.c"};}};' }));
    await page.route('**/audit_supabase.js*', r => r.fulfill({
      status: 200, contentType: 'application/javascript', body: '' }));

    /* ?admin=1 OR THE PAGE LEAVES. Both module pages bounce to the To Do
       list unless the address names a plot, says admin, or came from manage
       -- so without it this section measures audit_home.html, which loads no
       roster at all and reads exactly like the file failing to evaluate. */
    await page.goto('http://localhost:8777/' + url + '?admin=1', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.MJMAuditRoster === 'object',
                               { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);
    return page;
  }

  console.log('\n5. THE REAL PAGES BUILD THE SAME ROSTER');
  for (const [url, tag] of [['audit/audit_plot_audit.html',   'Plot Condition'],
                            ['audit/audit_height_index.html', 'Seedling Height']]) {
    const page = await boot(url, tag);

    check(tag + ' stayed on its own page', /audit_(plot_audit|height_index)\.html/
            .test(page.url()), true);

    const got = await page.evaluate(() => {
      if (typeof MJMAuditRoster !== 'object') return 'no MJMAuditRoster on the page';
      const canon = MJMAuditPlots.canon;
      const STOCK = { 'B04-R': 'BNN' };   // see section 1
      const out = MJMAuditRoster.build({
        logs: window.__TABLES.shared_inventory_logs,
        auditBatches: [],
        balance: window.__TABLES.shared_plot_batch_balance,
        canon, nurseryOf: p => MJMAuditPlots.byPlot()[p] || STOCK[p] || null
      });
      return out.plotBatches.map(b => b.nursery + '|' + b.plot + '|' + b.batch).sort();
    }).catch(e => 'threw: ' + e.message);

    check(tag + ' puts the transferred plot on its roster', got,
          ['BNN|B01|250', 'BNN|B02|251', 'BNN|B04-R|260', 'PN|P01|277']);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
