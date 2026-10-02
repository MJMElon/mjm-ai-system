/* An empty hole case arrives at Nelos already filled in, with the sheet on it.

   The nursery audits empty holes on paper: one sheet per batch, a table per
   tray, a tick box per hole. The button on the Planting report used to raise
   a case outright — no sheet, nothing to look at before it went, and the
   auditor still had to copy the holes out of the screen by hand, which is
   how a row goes missing.

   Now the sheet is DRAWN from the batch's own records and the Nelos form
   opens with it attached and the rest of the answers in place, so the person
   presses Save on a case they can read.

   Three parts. The sheet itself, drawn and checked field by field — a canvas
   cannot be read back as text, so each field is proved by the picture
   CHANGING when it changes, which is the one thing a blank or hard-coded
   field could not do. Then the Planting report's button: what it draws it
   from, what it hands over, where it goes. Then the Nelos form on the other
   side of that hand-off.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/empty_hole_case.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

const BATCH = '277';
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }
function checkFalse(name, got) { check(name, !!got, false); }

const SEEDS_ROW = {
  id: 'sr-1', batch_name: BATCH, transaction_type: 'Seeds_Received',
  breed_name: 'AA HYBRIDA 1S', quantity_change: 10500, plot_name: 'Pre-Nursery',
  transaction_date: '2026-09-01', created_at: '2026-09-01T02:00:00.000Z',
  workers: 4, remark: 'Supplier: AAR. MPOB: 123-456'
};
/* The holes, as the database holds them: one row per hole, the tray in
   plot_name and the position in the remark. */
const eh = (id, tray, row, hole) => ({
  id, batch_name: BATCH, transaction_type: 'Empty_Hole', plot_name: tray,
  quantity_change: 0, transaction_date: '2026-09-20',
  created_at: `2026-09-20T0${id}:00:00Z`,
  remark: `Empty hole. Row: ${row}. Hole: ${hole}.`
});
const HOLES = [
  eh(1, 'P1', 5, 2),
  eh(2, 'P51', 19, 14), eh(3, 'P51', 66, 16), eh(4, 'P51', 141, 10),
  eh(5, 'P52', 139, 1)
];

/* The planting report, as it is restored on the tab: a row per tray, with
   what went in and what came up empty written on the log's remark. */
const planted = (id, tray, total, empty) => ({
  id, batch_name: BATCH, transaction_type: 'Planted', plot_name: tray,
  quantity_change: total - empty, transaction_date: '2026-09-02',
  created_at: `2026-09-02T0${id}:00:00Z`, breed_name: 'AA HYBRIDA 1S',
  remark: `TotalPlanted:${total}. EmptyHoles:${empty}.`
});
const PLANTED = [planted(1, 'P1', 3500, 1), planted(2, 'P51', 3500, 3), planted(3, 'P52', 3500, 1)];

const SHEET = {
  batch: BATCH, breed: 'AA HYBRIDA 1S', actualPlanted: 10457,
  date: '2026-10-01', auditor: 'Pre Nursery Auditor + Drone Operator',
  trays: [
    { tray: 'P1',  holes: [{ row: 5, hole: 2 }] },
    { tray: 'P51', holes: [{ row: 19, hole: 14 }, { row: 66, hole: 16 }, { row: 141, hole: 10 }] },
    { tray: 'P52', holes: [{ row: 139, hole: 1 }] }
  ]
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* ══ 1. THE SHEET ═══════════════════════════════════════════════ */
  console.log('\nThe audit sheet');
  {
    const page = await browser.newPage();
    await page.goto('http://localhost:8777/', { waitUntil: 'load' });
    await page.addScriptTag({ url: '/shared/shared_empty_hole_report.js' });

    const base = await page.evaluate((s) => MJMEmptyHoleReport.draw(s), SHEET);
    checkTrue('it draws a PNG', /^data:image\/png;base64,/.test(base.dataUrl));
    checkTrue('…named after the batch', base.name.includes(BATCH));
    checkTrue('…and big enough to print from', base.width >= 2000);

    check('the date is written the way the form writes it',
          await page.evaluate(() => MJMEmptyHoleReport.longDate('2026-10-01')), '1 October 2026');

    /* Each field, proved by the picture changing. A field that is not drawn
       — or is drawn from a constant — cannot pass this. */
    const differs = (patch) => page.evaluate(([s, p, was]) =>
      MJMEmptyHoleReport.draw(Object.assign({}, s, p)).dataUrl !== was,
      [SHEET, patch, base.dataUrl]);
    checkTrue('the same sheet twice is the same picture — nothing random on it',
              !(await differs({})));
    checkTrue('the batch number is on it',       await differs({ batch: '999' }));
    checkTrue('the breed is on it',              await differs({ breed: 'DxP' }));
    checkTrue('the seeds actually planted are on it',
              await differs({ actualPlanted: 1 }));
    checkTrue('the date is on it',               await differs({ date: '2026-12-25' }));
    checkTrue('who audits it is on it',          await differs({ auditor: 'Somebody Else' }));
    checkTrue('the tray name is on it',
              await differs({ trays: [{ tray: 'ZZ9', holes: [{ row: 5, hole: 2 }] }] }));
    checkTrue('the ROW of each hole is on it', await differs({
      trays: [{ tray: 'P1', holes: [{ row: 6, hole: 2 }] },
              SHEET.trays[1], SHEET.trays[2]] }));
    checkTrue('…and the HOLE', await differs({
      trays: [{ tray: 'P1', holes: [{ row: 5, hole: 3 }] },
              SHEET.trays[1], SHEET.trays[2]] }));

    const sizes = await page.evaluate((s) => ({
      three: MJMEmptyHoleReport.draw(s).height,
      one:   MJMEmptyHoleReport.draw(Object.assign({}, s, { trays: [s.trays[0]] })).height,
      empty: MJMEmptyHoleReport.draw(Object.assign({}, s,
               { trays: [s.trays[0], { tray: 'P9', holes: [] }] })).height
    }), SHEET);
    checkTrue('a sheet with three trays is taller than one with one',
              sizes.three > sizes.one);
    check('a tray with no empty holes is not given a table of its own',
          sizes.empty, sizes.one);

    const file = await page.evaluate((s) => {
      const r = MJMEmptyHoleReport.draw(s);
      const f = MJMEmptyHoleReport.toFile(r.dataUrl, r.name);
      return { name: f.name, type: f.type, size: f.size };
    }, SHEET);
    check('it becomes a PNG file, so it can go straight into a file box',
          file.type, 'image/png');
    checkTrue('…with the batch in its name', file.name.includes(BATCH));
    checkTrue('…and some bytes in it', file.size > 10000);
    await page.close();
  }

  /* ══ 2. THE BUTTON ON THE PLANTING REPORT ═══════════════════════ */
  console.log('\nThe button on the Planting report');
  let handed = null, wentTo = null, drew = null, screenActual = null;
  {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
    page.on('pageerror', (e) => { if (!/MJMReview/.test(e.message)) console.log('  [page error] ' + e.message); });

    await page.addInitScript(({ db }) => {
      window.__DB = db;
      /* Table-aware, because this page reads a dozen of them at boot and a
         stub that answers them all the same way leaves the breed dropdown
         empty — which looked exactly like the breed not being put on the
         sheet. */
      function makeQuery(table) {
        const st = { f: {}, types: null, single: false };
        const rows = () => {
          let out = (window.__DB[table] || []).slice();
          if (st.f.transaction_type) out = out.filter((r) => r.transaction_type === st.f.transaction_type);
          if (st.types) out = out.filter((r) => st.types.indexOf(r.transaction_type) >= 0);
          if (st.f.batch_name) out = out.filter((r) => String(r.batch_name) === String(st.f.batch_name));
          return out;
        };
        const q = new Proxy({}, { get(_, p) {
          if (p === 'then') return (a, b) => Promise.resolve(
            st.single ? { data: rows()[0] || null, error: null } : { data: rows(), error: null }).then(a, b);
          if (p === 'eq') return (c, v) => { st.f[c] = v; return q; };
          if (p === 'in') return (c, v) => { if (c === 'transaction_type') st.types = v; return q; };
          if (p === 'maybeSingle' || p === 'single')
            return () => { st.single = true; return Promise.resolve({ data: rows()[0] || null, error: null }); };
          if (p === 'insert' || p === 'upsert' || p === 'update' || p === 'delete')
            return () => ({ select: () => Promise.resolve({ data: [], error: null }),
                            eq: () => q, then: (a, b) => Promise.resolve({ data: [], error: null }).then(a, b) });
          return () => q;
        } });
        return q;
      }
      const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
      window.supabase = { createClient: () => ({
        from: makeQuery, rpc: () => Promise.resolve({ data: [], error: null }),
        auth: {
          getUser: async () => ({ data: { user }, error: null }),
          getSession: async () => ({ data: { session: { user } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null })
        },
        storage: { from: () => ({ upload: async () => ({ data: {}, error: null }),
                                  getPublicUrl: () => ({ data: { publicUrl: '' } }),
                                  list: async () => ({ data: [], error: null }),
                                  remove: async () => ({ error: null }) }) },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {}
      }) };
    }, { db: {
      shared_breeds:    [{ name: 'AA HYBRIDA 1S' }, { name: 'DxP' }],
      operation_batches: [{ name: BATCH }],
      operation_trays:  [{ id: 1, tray_name: 'P1', name: 'P1', capacity: 4000 },
                         { id: 2, tray_name: 'P51', name: 'P51', capacity: 4000 },
                         { id: 3, tray_name: 'P52', name: 'P52', capacity: 4000 }],
      shared_plots:     [{ plot_name: 'P01', nursery_name: 'PN' }],
      shared_inventory_logs: [SEEDS_ROW, ...PLANTED, ...HOLES]
    } });

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
    for (const host of ['**/cdn.tailwindcss.com/**', '**/cdn.jsdelivr.net/**',
                        '**/cdnjs.cloudflare.com/**', '**/fonts.googleapis.com/**']) {
      await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
    }
    await page.route('**://*.supabase.co/**', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: '[]' }));
    /* The button navigates to Nelos. Answered with a bare page of the same
       origin, so the URL and the hand-off can both be read without loading
       the whole hub — which part 3 does properly, from the other side. */
    await page.route('**/nelos/nelos_dashboard.html*', (r) => r.fulfill({
      status: 200, contentType: 'text/html', body: '<html><body>nelos</body></html>' }));

    await page.goto(`http://localhost:8777/operation/operation_batch_detail.html?id=${BATCH}`,
                    { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.raiseEmptyHoleCase === 'function',
                               { timeout: 20000 });
    await page.waitForFunction(() => {
      const el = document.getElementById('t2-eh-total');
      return el && /[1-9]/.test(el.textContent || '');
    }, { timeout: 20000 });

    const seen = await page.evaluate(() => ({
      total:  (document.getElementById('t2-eh-total') || {}).textContent,
      breed:  (document.getElementById('f-brand') || {}).value,
      batch:  (document.getElementById('f-batchno') || {}).value,
      actual: parseInt(String((document.getElementById('t2-tot-actual') || {}).innerText || '')
                .replace(/[^0-9-]/g, ''), 10)
    }));
    check('the five holes are on the Empty Hole tab', String(seen.total || '').trim(), '5');
    check('…on this batch', seen.batch, BATCH);
    check('…of this breed', seen.breed, 'AA HYBRIDA 1S');
    checkTrue('…and the report has an actual-planted figure to put on the sheet',
              Number.isFinite(seen.actual) && seen.actual > 0);
    screenActual = seen.actual;

    /* What the button draws the sheet FROM. A picture cannot be read back as
       text, so the call into the template is recorded — and into
       sessionStorage, because the page is about to navigate away from
       anything held on window. */
    await page.evaluate(() => {
      const real = window.MJMEmptyHoleReport.draw;
      window.MJMEmptyHoleReport.draw = function (o) {
        try { sessionStorage.setItem('__drew', JSON.stringify(o)); } catch (_) {}
        return real(o);
      };
    });

    await Promise.all([
      page.waitForURL('**/nelos/nelos_dashboard.html*', { timeout: 20000 }),
      page.evaluate(() => raiseEmptyHoleCase())
    ]);
    wentTo = new URL(page.url());
    drew = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__drew') || 'null'));
    handed = await page.evaluate(() => {
      const raw = sessionStorage.getItem('mjm_nelos_prefill');
      return raw ? JSON.parse(raw) : null;
    });

    console.log('\n…what the sheet is drawn from');
    checkTrue('the sheet is drawn at all', !!drew);
    check('the batch is the batch', drew && drew.batch, BATCH);
    check('the breed is the batch’s breed', drew && drew.breed, 'AA HYBRIDA 1S');
    check('the date is today, the day the case is opened',
          drew && drew.date, new Date().toISOString().slice(0, 10));
    check('who audits it is who the case goes to',
          drew && drew.auditor, 'Pre Nursery Auditor + Drone Operator');
    check('"Sebenar Biji Tanam" is what the report says was ACTUALLY planted',
          drew && drew.actualPlanted, screenActual);
    check('the trays are in tray order, each with its own holes',
          drew && drew.trays,
          [{ tray: 'P1',  holes: [{ row: '5', hole: '2' }] },
           { tray: 'P51', holes: [{ row: '19', hole: '14' }, { row: '66', hole: '16' },
                                  { row: '141', hole: '10' }] },
           { tray: 'P52', holes: [{ row: '139', hole: '1' }] }]);

    console.log('\n…what it hands over');
    checkTrue('a case is handed over at all', !!handed);
    check('the system it goes to', handed && handed.dest, 'audit');
    check('the person in charge, by name not by id',
          handed && handed.pic, 'Pre Nursery Auditor + Drone Operator');
    check('the nursery', handed && handed.nursery, 'PN');
    check('the case is named after the batch', handed && handed.title, 'Batch ' + BATCH);
    check('the remark', handed && handed.desc, 'Check empty hole');
    check('the batch rides along', handed && handed.batch, BATCH);
    checkTrue('THE SHEET IS ON IT',
              handed && handed.photo && /^data:image\/png;base64,/.test(handed.photo.dataUrl));
    checkTrue('…named after the batch', handed && handed.photo.name.includes(BATCH));
    check('…as a PNG', handed && handed.photo.type, 'image/png');

    console.log('\n…and where it sends you');
    check('to the Nelos case list', wentTo.pathname, '/nelos/nelos_dashboard.html');
    check('opening a new case', wentTo.searchParams.get('new'), '1');
    check('…the same answers in the link, for a form that cannot read the '
        + 'hand-off', [wentTo.searchParams.get('dest'), wentTo.searchParams.get('pic'),
                       wentTo.searchParams.get('nursery'), wentTo.searchParams.get('title'),
                       wentTo.searchParams.get('desc'), wentTo.searchParams.get('batch')],
          ['audit', 'Pre Nursery Auditor + Drone Operator', 'PN', 'Batch ' + BATCH,
           'Check empty hole', BATCH]);

    await page.close();
  }

  /* ══ 3. THE NELOS FORM, ON THE OTHER SIDE ══════════════════════ */
  console.log('\nThe Nelos form, on the other side of the hand-off');
  {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
    page.on('pageerror', (e) => console.log('  [page error] ' + e.message));
    await page.addInitScript((prefill) => {
      window.__DB = {
        nelos_modules: [
          { key: 'audit', label: 'Audit Portal', active: true, sort_order: 1 },
          { key: 'operation', label: 'Seedling Stock System', active: true, sort_order: 2 }
        ],
        nelos_handlers: [
          { user_id: 'h1', full_name: 'Audit Lead', email: 'a@m', primary_module: 'audit', seat_no: 1 },
          { user_id: 'h2', full_name: 'Pre Nursery Auditor + Drone Operator', email: 'b@m',
            primary_module: 'audit', seat_no: 2 }
        ],
        nelos_categories: [{ module_key: 'operation', name: 'Empty Hole', sort_order: 1 }],
        nelos_routes: [], nelos_cases: [],
        shared_plots: [{ plot_name: 'P01', nursery_name: 'PN' },
                       { plot_name: 'B1',  nursery_name: 'BNN' }],
        operation_nurseries: [{ name: 'PN' }, { name: 'BNN' }]
      };
      function makeQuery(table) {
        const st = { single: false };
        const q = new Proxy({}, { get(_, p) {
          if (p === 'then') return (a, b) => Promise.resolve(
            st.single ? { data: (window.__DB[table] || [])[0] || null, error: null }
                      : { data: window.__DB[table] || [], error: null }).then(a, b);
          if (p === 'maybeSingle' || p === 'single')
            return () => { st.single = true; return Promise.resolve(
              { data: (window.__DB[table] || [])[0] || null, error: null }); };
          if (p === 'insert' || p === 'upsert' || p === 'update' || p === 'delete')
            return () => ({ select: () => Promise.resolve({ data: [], error: null }),
                            eq: () => q, then: (a, b) => Promise.resolve({ data: [], error: null }).then(a, b) });
          return () => q;
        } });
        return q;
      }
      const user = { id: 'u1', email: 'e@m' };
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
      try { sessionStorage.setItem('mjm_nelos_prefill', JSON.stringify(prefill)); } catch (_) {}
    }, Object.assign({}, handed, { at: Date.now() }));

    await page.route('**/shared_access.js', (r) => r.fulfill({
      status: 200, contentType: 'application/javascript',
      body: `window.MJMAccess = new Proxy({}, { get(t,k){
        if (k==='user') return () => ({ id:'u1', email:'e@m', full_name:'Elon Ting' });
        if (k==='load') return async () => true;
        if (k==='normalize') return (x)=>x||{};
        if (k==='then') return undefined;
        return () => true; } });`
    }));
    for (const host of ['**/cdn.tailwindcss.com/**', '**/cdn.jsdelivr.net/**',
                        '**/cdnjs.cloudflare.com/**', '**/fonts.googleapis.com/**']) {
      await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
    }
    await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, body: '[]' }));

    await page.goto('http://localhost:8777' + wentTo.pathname + wentTo.search,
                    { waitUntil: 'load' });
    await page.waitForSelector('#new-scrim:not(.hidden)', { timeout: 20000 });

    const form = await page.evaluate(() => ({
      dest:     document.getElementById('c-dest').value,
      destText: (document.getElementById('c-dest').selectedOptions[0] || {}).textContent,
      pic:      document.getElementById('c-pic').value,
      picText:  (document.getElementById('c-pic').selectedOptions[0] || {}).textContent,
      problem:  document.getElementById('c-problem').value,
      other:    document.getElementById('c-problem-other').value,
      otherShown: !document.getElementById('c-problem-other').classList.contains('hidden'),
      nursery:  document.getElementById('c-nursery').value,
      plot:     document.getElementById('c-plot').value,
      desc:     document.getElementById('c-desc').value,
      photoCount: (document.getElementById('c-photo').files || []).length,
      photoName:  ((document.getElementById('c-photo').files || [])[0] || {}).name,
      photoType:  ((document.getElementById('c-photo').files || [])[0] || {}).type,
      photoShown: !document.getElementById('c-photo-now').classList.contains('hidden'),
      shotText:   document.getElementById('c-shot-t').textContent,
      heading:    document.getElementById('c-heading').textContent
    }));

    check('the form opens on a NEW case, not an edit', form.heading, 'Add New Case');
    check('assigned to the Audit Portal', [form.dest, form.destText], ['audit', 'Audit Portal']);
    check('the person in charge is the one named, not the seat #1',
          [form.pic, form.picText], ['h2', '#2 Pre Nursery Auditor + Drone Operator']);
    check('the category is Other, because the case is named after the batch',
          form.problem, '__other');
    check('…and the name is the batch', form.other, 'Batch ' + BATCH);
    checkTrue('…with that box showing', form.otherShown);
    check('the nursery is PN', form.nursery, 'PN');
    check('…and no particular plot', form.plot, '');
    check('the remark', form.desc, 'Check empty hole');
    check('THE SHEET IS ATTACHED, as a file the Save will upload',
          [form.photoCount, form.photoType], [1, 'image/png']);
    checkTrue('…named after the batch', String(form.photoName).includes(BATCH));
    checkTrue('…and showing on the form', form.photoShown);
    checkTrue('…which says so', /attached/i.test(form.shotText));

    /* The hand-off is taken, not left lying about: a reload must not
       re-open a form somebody closed. */
    const left = await page.evaluate(() => sessionStorage.getItem('mjm_nelos_prefill'));
    check('the hand-off is taken once', left, null);

    await page.close();
  }

  /* ══ 4. A STALE HAND-OFF ═══════════════════════════════════════ */
  console.log('\nA hand-off nobody followed');
  {
    const page = await browser.newPage();
    await page.goto('http://localhost:8777/', { waitUntil: 'load' });
    await page.addScriptTag({ url: '/shared/shared_nelos.js' });
    const r = await page.evaluate(() => {
      const out = {};
      MJMNelos.handOff({ title: 'fresh' });
      out.fresh = (MJMNelos.takeHandOff() || {}).title;
      out.twice = MJMNelos.takeHandOff();
      sessionStorage.setItem('mjm_nelos_prefill',
        JSON.stringify({ at: Date.now() - 10 * 60 * 1000, title: 'old' }));
      out.stale = MJMNelos.takeHandOff();
      out.cleared = sessionStorage.getItem('mjm_nelos_prefill');
      return out;
    });
    check('a fresh one is read', r.fresh, 'fresh');
    check('…and only once', r.twice, null);
    check('one from ten minutes ago is not an instruction now', r.stale, null);
    check('…and is cleared away either way', r.cleared, null);
    await page.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
