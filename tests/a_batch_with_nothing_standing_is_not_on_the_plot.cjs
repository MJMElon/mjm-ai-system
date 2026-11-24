/* A BATCH WITH NOTHING STANDING IS NOT ON THE PLOT.

   The office put the two screens side by side. The Work Record row for
   B6-R on 6 Nov 2026 linked

     225, 227, 228, 233, 234, 238, 240, 242, 244, 247

   and the Summary Report for the same plot on the same day lists

     228, 234, 242, 244, 247

   — *"B6-R 在6/11并没有225"*. The five extra all had movement on that plot
   at some point and NOTHING LEFT by the work date.

   A bucket was named for having an EVENT, not for having seedlings. So a
   batch that arrived and then went — sold, transplanted on, transferred,
   corrected away — was offered for ever afterwards, and on a -R plot,
   which is populated entirely by transfers in and emptied again, that is
   most of them.

   THE FIGURE DOES NOT MOVE, which is what makes it safe, and section 2 is
   that check and nothing else: a bucket closing at nought adds nought.

   TWO THINGS DELIBERATELY STAY, and both are a way this goes wrong if it
   is written as `<= 0` or as a second rule:

   - A NEGATIVE balance is still named (section 3). The Summary Report
     draws one because it is a figure to look into, and the link does not
     floor it, so a work record that stopped naming the batch would be
     quietly disagreeing with the report about the very row somebody has
     to go and fix.
   - INTERROW ANSWERS DIFFERENTLY (section 4), and it falls out rather
     than being written down: `closing` is `liveCount` with the row's own
     options, so a batch whose 2nd culling takes it to nought is empty for
     the other three jobs and still standing for interrow — which is the
     whole of what keepCull2 says.

   Section 5 drives the REAL page, because a cell is a thing somebody
   reads and the rule above cannot see one.

   EVERY READER IS GUARDED: on the previous build there is no
   `emptyBatches` and no `allEmpty`, so an unguarded read takes the
   harness down at the first line and leaves the rest unasked.

   Needs a static server on 8777 for the last section.
   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_batch_with_nothing_standing_is_not_on_the_plot.cjs */
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

const APPROVED = 'Report: 3rd Culling [APPROVED by esther on 2026-10-01]';

/* ── THE OFFICE OWN -R PLOT, and every way one empties ──────────────────
   B6-R  228 and 234 are standing; 225 was corrected away, 227 was
         transferred on, 233 is a transfer keyed at nought. Three empties,
         three different causes, because a rule that only answers one of
         them is a rule that leaves the other two on the list.
   B7    a NEGATIVE balance, which stays named.
   B8    a batch whose 2nd culling takes it to nought — empty for three
         jobs and standing for interrow.
   B9    a plot where EVERYTHING has gone, and none of it was 3rd culled. */
const LOGS = [
  log('Cull3_Transfer', '2026-09-01', 'B6-R', '228', 500, 'From: [B6|228]'),
  log('Cull3_Transfer', '2026-09-01', 'B6-R', '234', 300, 'From: [B6|234]'),

  log('Cull3_Transfer',    '2026-09-01', 'B6-R', '225', 400, 'From: [B6|225]'),
  log('Stock_Calibration', '2026-10-05', 'B6-R', '225', -400, APPROVED),

  log('Cull3_Transfer', '2026-09-01', 'B6-R',  '227', 200, 'From: [B6|227]'),
  log('Cull3_Transfer', '2026-10-10', 'B6-R2', '227', 200, 'From: [B6-R|227]'),

  log('Cull3_Transfer', '2026-09-01', 'B6-R', '233', 0, 'From: [B6|233]'),

  log('Transplanted',      '2026-09-01', 'B7', '243', 100),
  log('Stock_Calibration', '2026-10-05', 'B7', '243', -150, APPROVED),

  log('Transplanted', '2026-09-01', 'B8', '250', 100),
  log('2nd_Culling',  '2026-10-05', 'B8', '250', 100),

  log('Transplanted',      '2026-09-01', 'B9', '260', 700),
  log('Stock_Calibration', '2026-10-05', 'B9', '260', -700, APPROVED)
];

function fakeSupabase() {
  const q = (rows) => { const o = new Proxy({}, { get(_, k) {
    if (k === 'then') return (a, b) => Promise.resolve({ data: rows, error: null }).then(a, b);
    if (k === 'range') return (f) => q(f === 0 ? rows : []);
    return () => o; } }); return o; };
  return { from: (t) => q(t === 'shared_inventory_logs' ? LOGS : []) };
}

const R = (id, o) => Object.assign({ id, _month: 'Nov 2026', tarikh: '2026-11-06',
  racun: 'Round 1: Compound 55 20gm', jenis: 'Membaja', plot: 'B6-R', batch: '',
  qty: null, carlos: 0, gaia: 0, remark: '' }, o);
const RECORDS = [
  R(901),                                                      // the office own row
  R(902, { plot: 'B9' }),                                      // a plot with nothing left at all
  R(903, { plot: 'B8' }),                                      // empty for Manuring…
  R(904, { plot: 'B8', jenis: 'Meracun rumput secara selingan',
           racun: 'Round 1: Troy' })                           // …and standing for interrow
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
      shared_do_records: [],
      /* A -R PLOT IS IN NO HARDCODED RANGE, so without this Seedling Stock
         row the page cannot place B6-R under any nursery and the office own
         record is filtered off the screen before it is ever drawn — which
         reads exactly like the rule under test having eaten it. */
      shared_plots: [{ nursery_name: 'BNN', plot_name: 'B6-R' }]
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
  const link = (plot, date, opts) => PM.linkedQty(plot, '', date, opts || {}) || {};
  /* Answered by NAME on a build without the field — see the header. */
  const emptyOf = (l) => (l && l.emptyBatches) || 'no emptyBatches in this build';

  console.log('\n1  the office own row');
  const b6r = link('B6-R', '2026-11-06');
  check('B6-R names only what is standing on 6 Nov', b6r.batches, ['228', '234']);
  check('…and the three that went are named apart, never silently dropped',
        emptyOf(b6r), ['225', '227', '233']);
  check('…none of them is read as 3rd culled, because none was',
        [b6r.goneBatches, b6r.goneQty], [[], 0]);

  console.log('\n2  and the FIGURE does not move, which is what makes it safe');
  /* 500 + 300 standing; the three empties add nought between them, so the
     quantity is the same number before and after the rule. */
  check('the quantity is the standing batches and nothing else', b6r.qty, 800);
  check('…the same as adding every bucket up by hand',
        500 + 300 + (400 - 400) + (200 - 200) + 0, b6r.qty);
  /* A BATCH STILL STANDING ON THE DAY IT ARRIVED is the other direction:
     cut before the correction, 225 is on the plot and in the figure. */
  const before = link('B6-R', '2026-10-01');
  check('before it was emptied, 225 is on the plot and counted',
        [before.batches, before.qty, emptyOf(before)],
        [['225', '227', '228', '234'], 1400, ['233']]);

  console.log('\n3  a NEGATIVE balance is a figure to look into, so it is named');
  const b7 = link('B7', '2026-11-06');
  check('B7 keeps the batch its ledger has gone below nought on',
        [b7.batches, b7.qty, emptyOf(b7)], [['243'], -50, []]);

  console.log('\n4  interrow answers differently, and it falls out of keepCull2');
  const b8 = link('B8', '2026-11-06');
  const b8ir = link('B8', '2026-11-06', { keepCull2: 1 });
  check('the 2nd culling empties it for the other three jobs',
        [b8.batches, b8.qty, emptyOf(b8)], [[], 0, ['250']]);
  check('…and interrow still walks between the polybags',
        [b8ir.batches, b8ir.qty, emptyOf(b8ir)], [['250'], 100, []]);
  /* The record decides, not the caller — recQty reads the jenis itself. */
  check('recQty reads the work type off the record and answers both ways',
        [PM.recQty({ plot: 'B8', batch: '', tarikh: '2026-11-06', jenis: 'Membaja' }).value,
         PM.recQty({ plot: 'B8', batch: '', tarikh: '2026-11-06',
                     jenis: 'Meracun rumput secara selingan' }).value], [0, 100]);

  console.log('\n5  a plot with nothing left says so');
  const b9 = link('B9', '2026-11-06');
  check('B9 has no batch to name',
        [b9.batches, b9.qty, emptyOf(b9)], [[], 0, ['260']]);
  check('…and it is the EMPTY sentence, not the 3rd-culled one',
        [b9.allEmpty === true, b9.allGone === true], [true, false]);
  check('a plot the ledger has never moved at all is still null',
        PM.linkedQty('Z9', '', '2026-11-06', {}), null);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await boot(browser);
  /* FOUND BY THE PLOT **AND** THE CHEMICAL, never by the plot alone: B8
     carries two rows that differ only in their job, so a finder keyed on
     the plot answers with the Manuring one twice and the interrow check
     passes for the wrong reason. */
  const cell = async (id, which) => page.evaluate(([rid, w]) => {
    const i = records.findIndex((r) => String(r.id) === String(rid));
    if (i < 0) return { text: 'no such record', cls: '', tip: '' };
    const rows = [...document.querySelectorAll('#recview-list .rec-table tbody tr')]
      .filter((r) => r.querySelectorAll('td').length >= 6);
    if (!rows.length) return { text: 'no rows drawn', cls: '', tip: '' };
    const hit = rows.filter((r) => {
      const td = r.querySelectorAll('td');
      return String(td[3].textContent).trim() === String(records[i].plot)
          && String(td[2].textContent).indexOf(String(records[i].racun).split(':')[1].trim()) >= 0;
    });
    if (hit.length !== 1) return { text: 'row not drawn', cls: '', tip: '' };
    const row = hit[0];
    const d = row.querySelectorAll('td')[w === 'batch' ? 4 : 5];
    const sp = d.querySelector('span');
    return { text: (d.textContent || '').trim(), cls: sp ? sp.className : '',
             tip: sp ? (sp.title || '') : '' };
  }, [id, which]);

  console.log('\n6  and the real page draws it');
  const c = await cell(901, 'batch'), q = await cell(901, 'qty');
  check('the office own cell names two batches and not ten',
        [c.text, c.cls], ['🔗 228, 234', 'qty-linked']);
  check('…and the quantity beside it is the standing figure', q.text, '🔗 800');
  const e = await cell(902, 'batch');
  check('a plot with nothing standing draws a dash that says why',
        [e.text, e.cls, /nothing left standing/.test(e.tip)], ['—', 'batch-gone', true]);
  check('…and names what it used to hold', /260/.test(e.tip), true);
  const m = await cell(903, 'batch'), ir = await cell(904, 'batch');
  check('B8 reads empty on Manuring and standing on Interrow',
        [m.text, ir.text], ['—', '🔗 250']);

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
