/* A BATCH WHOSE 3RD CULLING IS DONE IS OFF THE PLOT, the mark says so when
   somebody keyed the right answer, and a -R plot with nothing in it is not
   drawn at all.

   Three asks in one message, over two screenshots of the Work Record list.

   1. An Interrow Spraying row on B14 still linking batches 234 and 262 and
      3,541 of capacity: *"已经结束了3rd culling了的batch就不要再link了 除了
      plot-R 3rd culling后 main plot不会有那个batch了 最多只会去p-R"*.

      A 3rd culling is the batch LEAVING the main plot — the good seedlings
      go to the -R plot and the rest are culled — so there is nothing of it
      standing there to spray, and the balance the ledger still shows for it
      was being quoted as capacity, which is the piece-rate money.

   2. *"如果FC填的batch/人为填的batch=本来用link的话的batch 那就show link的
      icon 这样的话我就只需要查没有link的icon的部分"* — the reason is the
      second half: they read down that column for what to check, and a keyed
      batch that matches the batch report is not a row anybody has to open.

   3. PLOT N3-R, ten tasks, batch 241 linked against it and every quantity
      reading 0: *"没有东西的R plot不要出现"*.

   The rule half drives the SHIPPED shared_plot_movement.js over a fake
   ledger; the seeding half lifts the SHIPPED seedReplantRounds out of the
   page the way a_replant_plot_takes_its_rounds.cjs does; and the last
   section drives the REAL page in a REAL browser, because a cell is a thing
   somebody reads and neither of the first two can see one.

   EVERY READER IS GUARDED. On the previous build there is no `goneBatches`,
   no `agrees` and no `_replantEmpty`, and an unguarded read takes the
   harness down at the first line and leaves every check under it unasked —
   which proves nothing about the code it was written to measure.

   Needs a static server on 8777 for the last section.
   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_batch_3rd_culled_is_off_the_plot.cjs */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
};
const ROOT = path.join(__dirname, '..');

const log = (type, date, plot, batch, qty, remark) => ({
  transaction_type: type, transaction_date: date, created_at: date + 'T00:00:00Z',
  remark: remark || '', plot_name: plot, batch_name: batch, quantity_change: qty });

/* ── ONE LEDGER, and every plot in it is a different answer ──────────────
   B14  the office's own plot: BOTH its batches 3rd culled and flown.
   B5   one batch culled and one not — the rule is per plot AND batch.
   B6   transferred out with NO 3rd culling keyed: still "near culling",
        which is the office's own per-row Include / Exclude choice and is
        NOT what this rule is about.
   B6-R where those seedlings went. The "except plot-R" the office named,
        and it falls out of the rule rather than being written down.
   B7   a 3rd culling nobody has flown. A claim, and it changes nothing.
   B9-R a -R plot that took a transfer and has since been emptied: the
        N3-R of the third screenshot.                                     */
const LOGS = [
  log('Transplanted', '2026-09-01', 'B14', '234', 2000),
  log('Transplanted', '2026-09-01', 'B14', '262', 2000),
  log('2nd_Culling',  '2026-10-05', 'B14', '234', 100),
  log('3rd_Culling',  '2026-11-05', 'B14', '234', 1500, 'MapQty: 1500'),
  log('3rd_Culling',  '2026-11-05', 'B14', '262', 1800, 'MapQty: 1800'),

  log('Transplanted', '2026-09-01', 'B5', '240', 1000),
  log('Transplanted', '2026-09-01', 'B5', '241', 800),
  log('3rd_Culling',  '2026-11-10', 'B5', '240', 900, 'MapQty: 900'),

  log('Transplanted',   '2026-09-01', 'B6',   '250', 3000),
  log('Cull3_Transfer', '2026-11-08', 'B6-R', '250', 2400, 'From: [B6|250]'),

  log('Transplanted', '2026-09-01', 'B7', '243', 500),
  // No MapQty:, so this never becomes an event at all.
  log('3rd_Culling',  '2026-11-03', 'B7', '243', 400, 'CullDate: 2026-11-03'),

  log('Cull3_Transfer', '2026-10-15', 'B9-R', '241', 1200, 'From: [B9|241]'),
  log('3rd_Culling',    '2026-11-02', 'B9-R', '241', 1200, 'MapQty: 1200')
];

function fakeSupabase() {
  const q = (rows) => { const o = new Proxy({}, { get(_, k) {
    if (k === 'then') return (a, b) => Promise.resolve({ data: rows, error: null }).then(a, b);
    if (k === 'range') return (f) => q(f === 0 ? rows : []);
    return () => o; } }); return o; };
  return { from: (t) => q(t === 'shared_inventory_logs' ? LOGS : []) };
}

/* Answered by NAME on a build that has not got the field, rather than
   throwing — see the header. */
const gone    = (l) => (l && l.goneBatches) || 'no goneBatches in this build';
const goneQty = (l) => (l && l.goneQty === undefined) ? 'no goneQty in this build' : l.goneQty;

const RECORDS = [
  // B14 — the office's own row. Nothing keyed, so it reads the ledger.
  { id: 901, _month: 'Nov 2026', tarikh: '2026-11-20', racun: 'Round 2: Troy 120mL',
    jenis: 'Meracun rumput secara selingan', plot: 'B14', batch: '', qty: null, carlos: 0, gaia: 0, remark: '' },
  // B5 — a batch keyed BY HAND and it is exactly what the ledger says.
  { id: 902, _month: 'Nov 2026', tarikh: '2026-11-20', racun: 'Round 1: Compound 20gm',
    jenis: 'Membaja', plot: 'B5', batch: '241', qty: null, carlos: 0, gaia: 0, remark: '' },
  // B5 again — keyed, and NOT what the ledger says. This is the row the
  // office is looking for when they read down the column.
  { id: 903, _month: 'Nov 2026', tarikh: '2026-11-20', racun: 'Round 2: Compound 20gm',
    jenis: 'Membaja', plot: 'B5', batch: '240, 241', qty: null, carlos: 0, gaia: 0, remark: '' },
  // B7 — the unflown claim. Still standing, still linked.
  { id: 904, _month: 'Nov 2026', tarikh: '2026-11-20', racun: 'Round 1: Compound 20gm',
    jenis: 'Membaja', plot: 'B7', batch: '', qty: null, carlos: 0, gaia: 0, remark: '' }
];

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));
  await page.addInitScript((seed) => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.setItem('mjm_maint_month', 'Nov 2026'); } catch (_) {}
    window.__DB = {
      nops_maint_records: [{ id: 1, records: seed.records }],
      shared_inventory_logs: seed.logs,
      shared_do_records: []
    };
    window.__WRITES = [];
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select', row: null };
      const base = () => (window.__DB[table] || (window.__DB[table] = []));
      const rows = () => {
        let out = base().slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return out;
      };
      const run = (from, to) => {
        if (st.op === 'upsert' || st.op === 'insert') {
          window.__WRITES.push({ table, row: JSON.parse(JSON.stringify(st.row)) });
          const b = base();
          const i = b.findIndex((r) => String(r.id) === String(st.row.id));
          if (i >= 0) b[i] = st.row; else b.push(st.row);
          return { data: null, error: null };
        }
        let out = rows();
        if (from !== undefined) out = out.slice(from, to + 1);
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return (f, t2) => Promise.resolve(run(f, t2));
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
  }, { records: RECORDS, logs: LOGS });

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
  await page.waitForFunction(() => typeof window.renderRecords === 'function', { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForFunction(() => window.PlotMovement && PlotMovement.ready(), { timeout: 20000 });
  await page.evaluate(() => renderRecords());
  await page.waitForTimeout(200);
  return page;
}

(async () => {
  const ctx = { console, Date, Math, Promise, Set, Map, Object, Array, String, Number, JSON, isNaN };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared', 'shared_plot_movement.js'), 'utf8'), ctx);
  const PM = ctx.PlotMovement;
  await PM.load(fakeSupabase());
  check('the fake ledger loaded', PM.ready(), true);
  const link = (plot, batch, date, opts) => PM.linkedQty(plot, batch || '', date, opts || {}) || {};

  console.log('\n1  a batch whose 3rd culling is done is off the main plot');
  /* THE OFFICE'S OWN ROW. Both batches flown on 5 Nov, so on the 20th
     nothing of either is standing on B14 and the capacity is nought — not
     the 500 + 200 the ledger still carries for them. */
  const b14 = link('B14', '', '2026-11-20');
  check('B14 after both its batches were flown', b14.qty, 0);
  check('…and the batches it no longer holds are NAMED, with their balance',
        [gone(b14), goneQty(b14), b14.allGone], [['234', '262'], 700, true]);
  check('…and it offers no batch names at all',
        PM.recBatches({ plot: 'B14', batch: '', tarikh: '2026-11-20' }).value, '');
  /* A ROUND WALKED BEFORE THE CULLING COUNTS IT IN FULL. The cut-off is the
     work date, as it is for every other rule here, or this would reach back
     over work already done and already paid. */
  const b14Before = link('B14', '', '2026-11-01');
  check('before the culling day the plot is all of it', b14Before.qty, 3900);
  check('…and nothing has gone yet', gone(b14Before), []);

  console.log('\n2  it is per plot AND batch, which is what makes the -R exception');
  const b5 = link('B5', '', '2026-11-20');
  check('B5 is worth the batch it still holds, and not the one it culled',
        [b5.qty, gone(b5), goneQty(b5), b5.allGone], [800, ['240'], 100, false]);
  /* THE OFFICE SAID "除了plot-R" AND THERE IS NO -R TEST IN THE FILE. The
     question is asked of one plot and batch: on B6-R that batch arrived by
     Cull3_Transfer_In and carries no 3rd culling of its own, so it is not
     gone. A written-out exemption would have gone on counting B9-R below,
     which really has been culled. */
  const b6r = link('B6-R', '', '2026-11-20');
  check('the -R plot keeps everything that was transferred to it',
        [b6r.qty, gone(b6r)], [2400, []]);
  /* NEAR CULLING IS NOT FINISHED CULLING, and the office drew that line
     themselves. B6 has had a transfer out and no 3rd culling keyed, so the
     600 left behind is still the per-row Include / Exclude choice and this
     rule leaves it exactly where it was. */
  const b6 = link('B6', '', '2026-11-20');
  check('a transfer with no 3rd culling keyed is untouched, and still a choice',
        [b6.qty, gone(b6), b6.culledBal, b6.culledBatches], [600, [], 600, ['250']]);
  check('…and Exclude still answers it', link('B6', '', '2026-11-20', { exclBal: 1 }).qty, 0);
  /* AN UNFLOWN 3RD CULLING IS A CLAIM. It never became an event at all, so
     it can no more take a batch off a plot than it can deduct from one —
     which is the safe direction: the batch keeps showing until the map is
     keyed. */
  const b7 = link('B7', '', '2026-11-20');
  check('a 3rd culling nobody has flown takes nothing off',
        [b7.qty, gone(b7)], [500, []]);

  console.log('\n3  interrow does not keep a batch the 3rd culling took away');
  /* Interrow keeps the 2nd culling in because the polybag is still sitting
     exactly where it was. A 3rd culling takes the polybags AWAY, so the two
     rules point opposite ways and both are right. B14's own row is an
     interrow one, which is why the office saw it first. */
  const ir = PM.recQty({ plot: 'B14', batch: '', tarikh: '2026-11-20',
                         jenis: 'Meracun rumput secara selingan' });
  check('the office own interrow row on B14 reads nought', ir.value, 0);
  check('…and the 2nd culling of a gone batch is not kept in either',
        gone(ir.info || {}), ['234', '262']);

  console.log('\n4  a keyed batch that agrees with the ledger says so');
  const keyed = (batch) => PM.recBatches({ plot: 'B5', batch, tarikh: '2026-11-20' });
  check('keyed, and exactly what the batch report has standing',
        [keyed('241').value, keyed('241').linked, !!keyed('241').agrees], ['241', true, true]);
  /* MATCHED AS A SET, letters and digits, like every other key here — or
     the office would be sent to a row that is perfectly correct over a
     space. B6-R holds one batch; B14 before the culling holds two. */
  const two = (batch) => PM.recBatches({ plot: 'B14', batch, tarikh: '2026-11-01' });
  check('order and separators do not make it a different answer',
        [!!two('234, 262').agrees, !!two('262,234').agrees, !!two(' 262 / 234 ').agrees],
        [true, true, true]);
  check('a batch that is NOT what the ledger says carries no mark',
        [keyed('240').value, keyed('240').linked], ['240', false]);
  check('…and neither does half of the answer',
        [two('234').value, two('234').linked], ['234', false]);
  /* THE KEYED VALUE IS STILL WHAT IS SHOWN AND WHAT DECIDES. Nothing is
     rewritten by the mark, and the quantity goes on being counted over the
     batch somebody typed. */
  check('the keyed batch still decides the figure',
        PM.recQty({ plot: 'B14', batch: '234', tarikh: '2026-11-01' }).value, 1900);
  /* A CHECKED ROW IS SETTLED AND DOES NOT ASK THE LEDGER AGAIN, not even
     for a mark — a row that went green today and grew a 🔗 next week is
     what Checked exists to stop. */
  check('a checked row is never re-read for the mark',
        PM.recBatches({ plot: 'B5', batch: '241', tarikh: '2026-11-20', checked: 1 }).linked, false);
  /* And an empty cell is still filled in from the ledger and still marked,
     which is what the mark has always meant. */
  check('no batch keyed still reads the ledger and is marked',
        [keyed('').value, keyed('').linked, !!keyed('').agrees], ['241', true, false]);

  console.log('\n5  a -R plot with nothing in it is not on the schedule');
  const src = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'plot_maintenance_script.js'), 'utf8');
  const a = src.indexOf('let _replantJoined = {};');
  const b = src.indexOf('/* Says which -R plots took');
  if (a < 0 || b < 0) { check('seedReplantRounds is in the shipped page', false, true); }
  else {
    /* B6-R arrived on 8 Nov, so the round it can be given is the one whose
       week STARTS on or after that — W2 here, exactly as the office's own
       U6-R example works. */
    const state = { pd: { W1: { B6: { P: true, D: false }, B9: { P: true, D: false } },
                          W2: { B6: { P: true, D: false }, B9: { P: true, D: false } } },
                    manuring: {}, weeding: {}, interrow: {} };
    const seedCtx = Object.assign(ctx, {
      NURSERY_PLOTS: { BNN: ['B6', 'B9'] },
      stockPlots: { BNN: ['B6', 'B6-R', 'B9', 'B9-R'] },
      schedKey: (x) => String(x).replace(/[^A-Z0-9]/gi, '').toUpperCase(),
      MONTH_ABBR: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      _sortNurseryPlots: () => {}, getState: () => state,
      weeksOf: () => [{ slot: 0, from: 1 }, { slot: 1, from: 8 }], persistState: () => {}
    });
    vm.runInContext(src.slice(a, b)
      + '\nthis.seed = seedReplantRounds;'
      + '\nthis.empty = (typeof _replantEmpty === "function") ? _replantEmpty : null;', seedCtx);
    const empty = seedCtx.empty;
    if (!empty) { check('_replantEmpty is in the shipped page', false, true); }
    else {
      /* THE TEST IS WHAT THE PLOT HOLDS, not what once arrived. B9-R took a
         transfer in October — which is the only thing the schedule used to
         ask — and has been culled out since. */
      check('B9-R took a transfer and has nothing left',
            [empty('B9-R', 'Nov 2026'), link('B9-R', '', '2026-11-30').qty], [true, 0]);
      check('B6-R has 2,400 standing and stays', empty('B6-R', 'Nov 2026'), false);
      check('a main plot is never dropped by this, whatever it holds',
            [empty('B14', 'Nov 2026'), empty('B6', 'Nov 2026')], [false, false]);
      seedCtx.seed('BNN', 'Nov 2026');
      check('only the -R plot with something in it joins the schedule',
            [seedCtx.NURSERY_PLOTS.BNN.includes('B6-R'),
             seedCtx.NURSERY_PLOTS.BNN.includes('B9-R')], [true, false]);
      check('…and only it was given its parent rounds',
            [!!state.pd.W2['B6-R'], !!state.pd.W2['B9-R']], [true, false]);
    }
  }

  console.log('\n6  and the cells say it, on the real page');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  try {
    const page = await boot(browser);
    /* `records` is a script-scope `let` and so is NOT on window — reading it
       as window.records answers undefined and every check under it passes
       or fails for the wrong reason. */
    const cell = (id, which) => page.evaluate(([id, which]) => {
      const r = records.find((x) => x.id === id);
      if (!r) return { text: 'no such row', cls: '', tip: '' };
      const html = which === 'batch' ? _batchCell(r) : _qtyCell(r);
      const d = document.createElement('div'); d.innerHTML = html;
      const sp = d.querySelector('span');
      return { text: (d.textContent || '').trim(),
               cls: sp ? sp.className : '', tip: sp ? (sp.title || '') : '' };
    }, [id, which]);

    const b14b = await cell(901, 'batch'), b14q = await cell(901, 'qty');
    check('B14 names no batch, and the dash says why rather than reading as no answer',
          [b14b.text, b14b.cls, /3rd culled/.test(b14b.tip)], ['—', 'batch-gone', true]);
    check('…and its quantity is a linked nought that names what it left out',
          [b14q.text, /234, 262/.test(b14q.tip), /not counted/i.test(b14q.tip)],
          ['🔗 0', true, true]);

    const agree = await cell(902, 'batch'), differ = await cell(903, 'batch');
    check('a keyed batch that matches the report carries the mark',
          [agree.text, agree.cls], ['🔗 241', 'qty-linked']);
    check('…and the one that does not is the row left to check',
          [differ.text, differ.cls], ['240, 241', '']);
    check('the mark says it is keyed AND agreed, not that it was filled in',
          /nothing to check/i.test(agree.tip), true);
    const claim = await cell(904, 'batch');
    check('an unflown 3rd culling leaves the batch linked as it always was',
          [claim.text, claim.cls], ['🔗 243', 'qty-linked']);

    /* AND THE ROWS STOP BEING GENERATED. The schedule keeps its ticks — a
       -R plot that takes a second transfer draws its rows again by itself —
       but a generated row that is not rebuilt is dropped by `kept`, while a
       row somebody keyed by hand is never the schedule's to take away. */
    const rows = await page.evaluate(() => {
      if (!NURSERY_PLOTS.BNN) NURSERY_PLOTS.BNN = [];
      ['B6', 'B6-R', 'B9', 'B9-R'].forEach((p) => {
        if (!NURSERY_PLOTS.BNN.includes(p)) NURSERY_PLOTS.BNN.push(p);
      });
      const s = getState('BNN', 'Nov 2026');
      s.weeksByWork = s.weeksByWork || {};
      s.weeksByWork.pd = [{ from: 1, to: 31 }];
      s.pd = { W1: { 'B6-R': { P: true, D: false }, 'B9-R': { P: true, D: false } } };
      autoSyncRecords();
      renderRecords();
      return { gen6: records.filter((r) => r.plot === 'B6-R' && r._src).length,
               gen9: records.filter((r) => r.plot === 'B9-R' && r._src).length,
               drawn: [...document.querySelectorAll('.rec-group-plot')].map((e) => e.textContent.trim()) };
    });
    check('the -R plot that holds something still gets its rows', rows.gen6 > 0, true);
    check('the one with nothing in it generates none', rows.gen9, 0);
    check('so B9-R is not a section of the Work Record list',
          rows.drawn.some((x) => /B9-R/.test(x)), false);
    check('…and B6-R, which holds 2,400, still is',
          rows.drawn.some((x) => /B6-R/.test(x)), true);
    /* A ROW SOMEBODY KEYED BY HAND IS NEVER THE SCHEDULE'S TO TAKE AWAY,
       whatever this rule thinks of the plot — it carries no `_src`, so
       `kept` keeps it, and the plot is drawn because that row is on it.
       Asked LAST because it puts a row back on the screen. */
    const hand = await page.evaluate(() => {
      records.push({ id: 950, _month: 'Nov 2026', tarikh: '2026-11-14', jenis: 'Membaja',
                     racun: 'keyed by hand', plot: 'B9-R', batch: '', qty: 12,
                     carlos: 0, gaia: 0, remark: '' });
      autoSyncRecords();
      renderRecords();
      return { kept: records.filter((r) => r.id === 950).length,
               drawn: [...document.querySelectorAll('.rec-group-plot')].map((e) => e.textContent.trim()) };
    });
    check('a row keyed by hand on an empty -R plot survives the sync', hand.kept, 1);
    check('…and the plot is drawn for it, because the row is real work',
          hand.drawn.some((x) => /B9-R/.test(x)), true);
    await page.close();
  } finally { await browser.close(); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL ' + e.stack); process.exit(1); });
