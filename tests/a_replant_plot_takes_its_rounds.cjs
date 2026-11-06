/* A -R plot that appears mid-month, and the balance left behind it.

   The office, on why capacity goes wrong near culling:
     1. a -R plot that was not on the schedule at the start of the month had
        nowhere for its work to be recorded — "u6-R在round 4 和round 3之间出
        现，那u6-R就默认要做round 4 pnd using antracol，其他工作也一样";
     2. the plot a batch was transferred OUT of still linked the balance left
        behind, which is the balance about to be culled — "include balance or
        exclude balance，如果我按exclude balance就代表那个balance是culled
        balance".

   Drives the SHIPPED shared_plot_movement.js over a fake ledger, and the
   shipped seedReplantRounds lifted out of the page with the page functions
   it calls stubbed.
   Run: node tests/a_replant_plot_takes_its_rounds.cjs                       */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
};

const log = (type, date, plot, batch, qty, remark) => ({
  transaction_type: type, transaction_date: date, created_at: date + 'T00:00:00Z',
  remark: remark || '', plot_name: plot, batch_name: batch, quantity_change: qty });
const LOGS = [
  log('Transplanted', '2026-07-01', 'U6', '250', 5000),
  log('Transplanted', '2026-07-01', 'U6', '251', 2000),
  // 18 Nov: 250's good seedlings go to U6-R, 600 are left behind to be culled.
  log('Cull3_Transfer', '2026-11-18', 'U6-R', '250', 4400, 'From: [U6|250]'),
  // U7-R appeared in OCTOBER, a month the office had already checked.
  log('Transplanted', '2026-07-01', 'U7', '260', 3000),
  log('Cull3_Transfer', '2026-10-10', 'U7-R', '260', 500, 'From: [U7|260]'),
];

function fakeSupabase() {
  const q = (rows) => { const o = new Proxy({}, { get(_, k) {
    if (k === 'then') return (a, b) => Promise.resolve({ data: rows, error: null }).then(a, b);
    if (k === 'range') return (f) => { const page = f === 0 ? rows : []; return q(page); };
    return () => o; } }); return o; };
  return { from: (t) => q(t === 'shared_inventory_logs' ? LOGS : []) };
}

const RECORDS = [
  { id: 901, _month: 'Nov 2026', tarikh: '2026-11-25', jenis: 'Membaja', racun: 'Round 4: Compound 20gm',
    plot: 'U6', batch: '', qty: null, carlos: 0, gaia: 0, remark: '' },
  { id: 902, _month: 'Nov 2026', tarikh: '2026-11-05', jenis: 'Membaja', racun: 'Round 1: Compound 20gm',
    plot: 'U6', batch: '', qty: null, carlos: 0, gaia: 0, remark: '' },
];
async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((seed) => {
    try { localStorage.setItem('mjm_maint_nursery', 'UNN1');
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
  await page.waitForFunction(() => typeof window.renderRecords === 'function',
                             { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForFunction(() => window.PlotMovement && PlotMovement.ready(),
                             { timeout: 20000 });
  await page.evaluate(() => renderRecords());
  await page.waitForTimeout(150);
  return page;
}


(async () => {
  const ctx = { console, Date, Math, Promise, Set, Map, Object, Array, String, Number, JSON, isNaN };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'shared_plot_movement.js'), 'utf8'), ctx);
  const PM = ctx.PlotMovement;
  await PM.load(fakeSupabase());
  check('the fake ledger loaded', PM.ready(), true);

  console.log('\n1  the balance left behind a transfer');
  const before = PM.recQty({ plot: 'U6', batch: '', tarikh: '2026-11-10', jenis: 'Membaja' });
  check('before the transfer the plot is all of it', before.value, 7000);
  check('and there is no culled balance to offer', before.info.culledBal, 0);
  const inc = PM.recQty({ plot: 'U6', batch: '', tarikh: '2026-11-25', jenis: 'Membaja' });
  check('after it, Include balance reads what it always read', inc.value, 2600);
  check('and names the balance left behind batch 250', [inc.info.culledBal, inc.info.culledBatches], [600, ['250']]);
  const exc = PM.recQty({ plot: 'U6', batch: '', tarikh: '2026-11-25', jenis: 'Membaja', exclBal: 1 });
  check('Exclude balance takes it off, and only that batch', exc.value, 2000);
  check('the batches it covers drop 250', PM.recBatches({ plot: 'U6', batch: '', tarikh: '2026-11-25', jenis: 'Membaja', exclBal: 1 }).value, '251');
  check('a keyed figure still wins', PM.recQty({ plot: 'U6', tarikh: '2026-11-25', qty: 1234, exclBal: 1 }).value, 1234);
  check('Checked freezes the excluded figure', PM.freezeFor({ plot: 'U6', batch: '', tarikh: '2026-11-25', jenis: 'Membaja', exclBal: 1 }).qtyFrozen, 2000);
  check('the -R plot links what arrived', PM.recQty({ plot: 'U6-R', tarikh: '2026-11-25', jenis: 'Membaja' }).value, 4400);

  console.log('\n2  a -R plot that appeared mid-month takes its parent rounds from then on');
  const src = fs.readFileSync(path.join(__dirname, '..', 'nursery_ops', 'plot_maintenance_script.js'), 'utf8');
  const a = src.indexOf('let _replantJoined = {};');
  const b = src.indexOf('/* Says which -R plots took');
  if (a < 0 || b < 0) { console.log('  FAIL seedReplantRounds is not in the shipped page'); process.exit(1); }
  let saved = 0;
  const weeks = {   // block slot and the day it starts on
    pd: [{ slot: 0, from: 1 }, { slot: 1, from: 8 }, { slot: 2, from: 15 }, { slot: 3, from: 22 }],
    manuring: [{ slot: 0, from: 1 }, { slot: 3, from: 22 }],
    weeding: [{ slot: 1, from: 8 }, { slot: 3, from: 22 }],
    interrow: [{ slot: 2, from: 15 }],
  };
  const state = {
    pd: { W1: { U6: { P: true, D: false }, U7: { P: true, D: false } }, W2: { U6: { P: true, D: true } },
          W3: { U6: { P: false, D: false } }, W4: { U6: { P: true, D: false }, U7: { P: false, D: true } } },
    manuring: { U6: [[true], [], [], [true]] },
    weeding: { U6: { R2: true, R4: true } },
    interrow: { U6: [[], [], [true], []] },
  };
  const page = Object.assign(ctx, {
    NURSERY_PLOTS: { UNN1: ['U6', 'U7'] }, stockPlots: { 'UNN 1': ['U6', 'U6-R', 'U7', 'U7-R'] },
    schedKey: (x) => String(x).replace(/[^A-Z0-9]/gi, '').toUpperCase(),
    MONTH_ABBR: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    _sortNurseryPlots: () => {}, getState: () => state,
    weeksOf: (n, m, k) => weeks[k], persistState: () => { saved++; },
  });
  vm.runInContext(src.slice(a, b) + '\nthis.seed = seedReplantRounds; this.joined = () => _replantJoined;', page);
  check('October: U6-R did not exist yet, nothing happens', page.seed('UNN1', 'Oct 2026'), false);
  check('and U7-R, which DID appear in October, is not seeded into October either', [state.pd.W1['U7-R'], page.NURSERY_PLOTS.UNN1.includes('U7-R')], [undefined, false]);
  check('November: it is seeded', page.seed('UNN1', 'Nov 2026'), true);
  check('U6-R joins the schedule off Seedling Stock', page.NURSERY_PLOTS.UNN1.includes('U6-R'), true);
  check('P&D: only the round starting after the 18th', [state.pd.W1['U6-R'], state.pd.W2['U6-R'], state.pd.W4['U6-R']],
        [undefined, undefined, { P: true, D: false }]);
  check('manuring: round 4 only, round 1 left off', state.manuring['U6-R'], [[false], [], [], [true]]);
  check('weeding: R4 only', state.weeding['U6-R'], { R4: true });
  check('interrow: its round started on the 15th, before U6-R existed', state.interrow['U6-R'], [[], [], [false], []]);
  check('it was saved as a draft', saved, 1);
  check('U7-R, there since October, takes U7 rounds for the WHOLE of November', [state.pd.W1['U7-R'], state.pd.W4['U7-R']],
        [{ P: true, D: false }, { P: false, D: true }]);
  check('the notice names both', page.joined()['UNN1|Nov 2026'],
        [{ plot: 'U6-R', parent: 'U6', day: 18, done: false }, { plot: 'U7-R', parent: 'U7', day: 1, done: false }]);
  state.pd.W4['U6-R'] = { P: false, D: false };   // the office takes it off
  check('a second run does not put back what the office unticked', [page.seed('UNN1', 'Nov 2026'), state.pd.W4['U6-R']],
        [false, { P: false, D: false }]);

  console.log('\n3  the record dialog offers the choice, and the row keeps it');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  try {
    const page = await boot(browser);
    const open = (q) => page.evaluate((q) => { openRecModal(records.find(r => r.id === q)); }, q);
    await open(901);
    const shown = await page.evaluate(() => {
      const b = document.getElementById('rf-bal');
      return [b.style.display !== 'none', b.querySelectorAll('input[type=radio]').length,
              (b.textContent || '').includes('600')];
    });
    check('U6 after the transfer: the choice is drawn, with the 600 named', shown, [true, 2, true]);
    check('Include is the default', await page.evaluate(() =>
      document.querySelectorAll('#rf-bal input')[0].checked), true);
    await page.click('#rf-bal label:nth-of-type(2) input');
    check('Exclude says what it left out', await page.evaluate(() =>
      document.getElementById('rf-qty-link').textContent.includes('600')), true);
    await page.evaluate(() => saveRec());
    check('the row keeps the choice', await page.evaluate(() => records.find(r => r.id === 901).exclBal), 1);
    check('and its capacity is 2,000', await page.evaluate(() => recQty(records.find(r => r.id === 901)).value), 2000);
    await open(902);
    check('a row dated before the transfer offers no choice', await page.evaluate(() =>
      document.getElementById('rf-bal').style.display), 'none');
    // The -R plot is doing the PARENT's round, so its row carries the parent's number.
    const rows = await page.evaluate(() => {
      if (!NURSERY_PLOTS.UNN1.includes('U6')) NURSERY_PLOTS.UNN1.push('U6');
      stockPlots = { 'UNN 1': ['U6', 'U6-R'] };
      const s = getState('UNN1', 'Nov 2026');
      s.weeksByWork = s.weeksByWork || {};
      s.weeksByWork.pd = [{ from: 1, to: 7 }, { from: 8, to: 14 }, { from: 15, to: 21 }, { from: 22, to: 31 }];
      s.pd = {};
      ['W1', 'W2', 'W3', 'W4'].forEach(w => {
        s.pdConfig[w] = Object.assign({}, s.pdConfig[w] || s.pdConfig.W1,
          w === 'W4' ? { D: 'Antracol', D_dose: 50, D_unit: 'gm' } : {});
        s.pd[w] = { U6: { P: false, D: true } };
      });
      delete s.replantSeeded;
      autoSyncRecords();
      return records.filter(r => r.plot === 'U6-R' && /^Penyemburan/.test(r.jenis)).map(r => r.racun.split(':')[0] + ':' + r.racun.split(':')[1].trim().split(' ')[0]);
    });
    check('U6-R joining in week 4 is doing U6 Round 4 with Antracol, not its own Round 1', rows, ['Round 4:Antracol']);
    // The page syncs more than once per load; the second run must not hide the
    // notice before anybody has pressed Save Schedule. Publishing does.
    const notice = () => page.evaluate(() => {
      const b = document.getElementById('replant-notice');
      return !!b && b.style.display !== 'none' && b.textContent.includes('U6-R');
    });
    check('the notice is up after the seed', await notice(), true);
    await page.evaluate(() => autoSyncRecords());
    check('and is still up after a second sync in the same load', await notice(), true);
    await page.evaluate(() => publishSchedule('UNN1', 'Nov 2026', [], {}));
    check('Save Schedule takes it down', await notice(), false);
    // October was checked before this rule: its dialog offers no choice and a
    // save adds no new field to the row.
    const oct = await page.evaluate(() => {
      document.getElementById('global-month').value = '2026-10';   // the month on screen
      records.push({ id: 903, _month: 'Oct 2026', tarikh: '2026-10-25', jenis: 'Membaja', racun: 'Round 4: Compound 20gm',
                     plot: 'U7', batch: '', qty: null, carlos: 0, gaia: 0, remark: '' });
      openRecModal(records.find(r => r.id === 903));
      const shown = document.getElementById('rf-bal').style.display;
      saveRec();
      return [shown, 'exclBal' in records.find(r => r.id === 903)];
    });
    check('the page now reads October', await page.evaluate(() => getMonth()), 'Oct 2026');
    check('an October row offers no Include / Exclude, and a save adds nothing', oct, ['none', false]);
    check('and October seeds nothing', await page.evaluate(() => seedReplantRounds('UNN1', 'Oct 2026')), false);
    await page.close();
  } finally { await browser.close(); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL ' + e.stack); process.exit(1); });
