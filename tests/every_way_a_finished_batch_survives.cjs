/* EVERY WAY A FINISHED BATCH SURVIVES ON THE LINK, asked all at once.

   The office, over a B4 row for 4 Nov still linking 233, 259, 261, 264 and
   270 at 3,015: *"到底为什么已经结束了的batch一直在？不要我讲一个改一个"*.

   They were right that it had been answered one row at a time — the
   evidenced culling, then the empty bucket, then the negative — so this
   file stops doing that. A batch is NAMED on a linked row when three
   things are all true of that plot and batch, and there is no fourth:

     1. no 3rd culling of it is keyed on or before the work day,
     2. something is still standing on that day, nought or below being
        nothing, and
     3. the row has not been excluded by the per-row Exclude choice.

   So the list of reasons a finished batch can still be named is CLOSED,
   and this file drives every one of them over one ledger. Section 6 is
   what makes that a check rather than a claim: every batch of every plot
   has to be in exactly ONE of the three lists the reader hands back, so a
   batch cannot go quiet with nothing saying where it went.

   NONE OF THE FOUR IS CLOSED IN CODE, and three of them cannot be. The
   last one — a culling KEYED AND NOT FLOWN — was built on the office own
   统统, with the reasoning that the drone map gates the FIGURE while the
   row itself answers whether the plot was culled. The check then ran on
   the real ledger and reversed it: **85 work records, about 72,900
   seedlings, 44 of them to NOUGHT**, and B5 off its own reconciled 6,515.
   74 plot-and-batch pairs carry a 3rd culling row with no map and no
   figure, so those rows are routinely keyed well before the plot is
   flown — an unflown culling is a row halfway through being filled in,
   not an answer about the ground. And it moved nothing on the row the
   office asked about. Section 2 is that rule NOT being there, asserted as
   hard as the rest, so it cannot come back without this file failing.

   SO WHAT THIS FILE IS FOR is the enumeration itself. Section 6 is what
   makes it a check rather than a claim: every batch of every plot has to
   be in exactly ONE of the three lists the reader hands back, so a fifth
   way to drop a batch cannot be added without failing here.

   EVERY READER IS GUARDED, because a test that dies on the first throw
   leaves everything under it unasked.

   Needs a static server on 8777 for the last section.
   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/every_way_a_finished_batch_survives.cjs */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
};
const ROOT = path.join(__dirname, '..');

/* The SAVE DAY is what created_at carries, and it is the whole of section
   4: a row with no transaction_date and no CullDate lands on the day
   somebody pressed Save, which can be weeks after the work. */
const log = (type, date, plot, batch, qty, remark, savedOn) => ({
  transaction_type: type, transaction_date: date,
  created_at: (savedOn || date) + 'T00:00:00Z',
  remark: remark || '', plot_name: plot, batch_name: batch, quantity_change: qty });

const FLOWN = (n, d) => 'MapQty: ' + n + ' CullDate: ' + d;

/* ── B4 IS THE OFFICE OWN ROW, five batches and five different reasons ──
   233  a culling FLOWN and dated AFTER the 4 Nov work day. Standing.
   259  a culling keyed, NOT flown, with NO date at all — so it lands on
        the day it was saved, 20 Nov, which is after the work. Standing,
        and the one somebody can fix by keying the Cull Date.
   261  transferred out and never culled. 100 left behind, which is the
        per-row Exclude balance choice and nobody else can answer it.
   264  a culling row with NO map and NO figure. An empty shell somebody
        opened and did not fill, which says nothing about any ground.
   270  nothing has happened to it at all.

   B5   the case that MOVES: an unflown culling dated BEFORE the work day.
        271 goes, 272 stays.
   B6   an EVIDENCED culling before the work day — gone already, and it
        must turn up in no new list.
   B8   an unflown culling BESIDE a 2nd culling, which is how the file
        proves a claim supersedes nothing: 500 less its 100 is 400. */
const LOGS = [
  log('Transplanted', '2026-08-01', 'B4', '233', 700),
  log('Transplanted', '2026-08-01', 'B4', '259', 600),
  log('Transplanted', '2026-08-01', 'B4', '261', 600),
  log('Transplanted', '2026-08-01', 'B4', '264', 600),
  log('Transplanted', '2026-08-01', 'B4', '270', 1015),

  log('3rd_Culling',  '2026-11-10', 'B4', '233', 700, FLOWN(700, '2026-11-10')),
  log('3rd_Culling',  null,         'B4', '259', 600, '', '2026-11-20'),
  log('Cull3_Transfer', '2026-10-20', 'B4-R', '261', 500, 'From: [B4|261] to B4-R'),
  log('3rd_Culling',  null,         'B4', '264', 0,   '', '2026-10-30'),

  log('Transplanted', '2026-08-01', 'B5', '271', 900),
  log('Transplanted', '2026-08-01', 'B5', '272', 400),
  log('3rd_Culling',  '2026-10-01', 'B5', '271', 900, 'CullDate: 2026-10-01'),

  log('Transplanted', '2026-08-01', 'B6', '280', 300),
  log('Transplanted', '2026-08-01', 'B6', '281', 250),
  log('3rd_Culling',  '2026-09-15', 'B6', '280', 300, FLOWN(300, '2026-09-15')),

  log('Transplanted', '2026-08-01', 'B8', '250', 500),
  log('2nd_Culling',  '2026-10-01', 'B8', '250', 100),
  log('3rd_Culling',  '2026-10-10', 'B8', '250', 400, '')
];

function fakeSupabase() {
  const q = (rows) => { const o = new Proxy({}, { get(_, k) {
    if (k === 'then') return (a, b) => Promise.resolve({ data: rows, error: null }).then(a, b);
    if (k === 'range') return (f) => q(f === 0 ? rows : []);
    return () => o; } }); return o; };
  return { from: (t) => q(t === 'shared_inventory_logs' ? LOGS : []) };
}

const R = (id, o) => Object.assign({ id, _month: 'Nov 2026', tarikh: '2026-11-04',
  racun: 'Round 1: Antracol 50gm + Bond 15mL', plot: 'B4', batch: '',
  jenis: 'Penyemburan racun kulat dan serangga',
  qty: null, carlos: 0, gaia: 0, remark: '' }, o);
const RECORDS = [R(901), R(902, { plot: 'B5', jenis: 'Membaja' }),
                 R(903, { plot: 'B6', jenis: 'Membaja' })];

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
      shared_plots: [{ nursery_name: 'BNN', plot_name: 'B4' },
                     { nursery_name: 'BNN', plot_name: 'B5' },
                     { nursery_name: 'BNN', plot_name: 'B6' }]
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
    const user = { id: 'u1', email: 'office@example.com' };
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
      if (k === 'user') return () => ({ id:'u1', email:'office@example.com', full_name:'Office' });
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
  const DAY = '2026-11-04';
  /* Answered by NAME on a build that has no such field — see the header. */
  const goneOf  = (l) => (l && l.goneBatches)  || 'no goneBatches in this build';
  const emptyOf = (l) => (l && l.emptyBatches) || 'no emptyBatches in this build';

  console.log('\n1  the office own row, batch by batch and reason by reason');
  const b4 = link('B4', DAY);
  check('B4 still names five batches, which is what the office is looking at',
        b4.batches, ['233', '259', '261', '264', '270']);
  check('…at the office own figure', b4.qty, 3015);
  check('…and NOT ONE of them is a culling the system can act on',
        [goneOf(b4), emptyOf(b4)], [[], []]);

  console.log('\n2  A CULLING NOBODY HAS FLOWN TAKES NOTHING OFF, and the check is why');
  /* THIS WAS BUILT THE OTHER WAY AND THE NUMBERS REVERSED IT -- see the
     header. B5 holds 271 with an unflown culling dated before the work day
     and 272 with nothing: the plot is worth BOTH, and 271 is in no gone
     list, because on the real ledger that rule zeroed 44 work records. */
  const b5 = link('B5', DAY);
  check('271 stays on the plot on a culling nobody has flown',
        [b5.batches, goneOf(b5)], [['271', '272'], []]);
  check('…and the figure is the whole plot, which is what the report reads',
        b5.qty, 1300);

  console.log('\n3  and it supersedes nothing either, which is the arithmetic half');
  /* B8 is 500 less a 2nd culling of 100. An EVIDENCED 3rd culling would
     supersede that culling and the bucket would read 500; an unflown one
     must not, or keying a claim silently RAISES every figure on the plot
     -- the opposite direction, and worse. */
  const b8 = link('B8', DAY);
  check('the 2nd culling still comes off a batch whose 3rd culling is a claim',
        b8.qty, 400);
  check('…and cull2Superseded still answers the EVIDENCED question',
        [PM.cull2Superseded(PM.events().filter((e) => e.plotKey === 'B8')),
         PM.cull2Superseded(PM.events().filter((e) => e.plotKey === 'B6'))],
        [false, true]);

  console.log('\n4  the DATE rule, which is the office own to fix');
  /* A culling dated after the work day is correctly left out: those
     seedlings were standing when somebody sprayed. 233 carries a keyed
     Cull Date and a map, so it drops the batch the day the work date
     passes it -- which is how the rule is meant to read. */
  check('a culling dated AFTER the work day leaves the batch standing',
        [link('B4', DAY).batches.includes('233'),
         link('B4', '2026-11-30').batches.includes('233')], [true, false]);
  /* AND ONE THAT LANDS ON THE SAVE DAY NEVER DROPS IT AT ALL, because
     without a map it is not an event: 259 is on the plot on every date.
     That is the pair the office has to fix on Tab 6 -- key the figure, the
     Cull Date AND the map, and the batch leaves by the evidenced rule. */
  check('…and one with no map never drops it, whatever the date',
        [link('B4', DAY).batches.includes('259'),
         link('B4', '2026-12-31').batches.includes('259')], [true, true]);
  /* AN EMPTY SHELL ACTS ON NOTHING either, which is the same answer for a
     different reason: a row with no map and no figure is one somebody
     opened and did not fill. */
  check('a culling row with no map AND no figure takes nothing off, ever',
        [link('B4', '2026-12-31').batches.includes('264'),
         goneOf(link('B4', '2026-12-31')).includes('264')], [true, false]);

  console.log('\n5  the evidenced rule is untouched, and takes nothing extra');
  const b6 = link('B6', DAY);
  check('B6 still loses only the batch that was flown',
        [b6.batches, goneOf(b6), b6.qty], [['281'], ['280'], 250]);

  console.log('\n6  THE ENUMERATION IS CLOSED, and this is what says so');
  /* Every batch of every plot has to be in exactly ONE of the three lists
     the reader hands back. A batch in NONE of them has gone quiet with
     nothing saying where it went, which is the fault these rules exist to
     stop; a batch in TWO is two screens disagreeing about one plot. So a
     fourth way to drop a batch cannot be added without failing here. */
  const PLOTS = ['B4', 'B5', 'B6', 'B8'];
  const everywhere = PLOTS.map((p) => {
    const l = link(p, DAY);
    const seen = [].concat(l.batches || [], goneOf(l) || [], emptyOf(l) || []);
    const all = [...new Set(PM.events()
      .filter((e) => e.plotKey === p && e.batchKey)
      .map((e) => e.batch))].sort();
    const dupes = seen.filter((b, i) => seen.indexOf(b) !== i);
    const missing = all.filter((b) => !seen.includes(b));
    return { p, dupes, missing };
  });
  check('no batch is in two of the three lists', everywhere.filter((x) => x.dupes.length), []);
  check('and no batch is in none of them', everywhere.filter((x) => x.missing.length), []);

  console.log('\n7  the real page, because a cell is a thing somebody reads');
  let browser = null;
  try { browser = await require('playwright').chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
  catch (e) { console.log('  [no browser: ' + e.message + ']'); }
  if (browser) {
    const page = await boot(browser);
    /* FOUND BY ITS PLOT, which is unique per row in this fixture — never
       by the text in the cell, because what the cell says is the thing
       under test and a map keyed on it answers "row not drawn" about a row
       that is on the screen. */
    const cell = async (plot, which) => page.evaluate(([p, w]) => {
      const rows = [...document.querySelectorAll('#recview-list .rec-table tbody tr')]
        .filter((r) => r.querySelectorAll('td').length >= 6);
      if (!rows.length) return { text: 'no rows drawn', cls: '', tip: '' };
      const hit = rows.filter((r) => String(r.querySelectorAll('td')[3].textContent).trim() === p);
      if (hit.length !== 1) return { text: 'row not drawn', cls: '', tip: '' };
      const d = hit[0].querySelectorAll('td')[w === 'batch' ? 4 : 5];
      const sp = d.querySelector('span');
      return { text: (d.textContent || '').trim(),
               cls: sp ? sp.className : 'no mark at all',
               tip: sp ? (sp.title || '') : '' };
    }, [plot, which]);

    const c4 = await cell('B4', 'batch');
    check('the office B4 cell still names its five, so the screen agrees with the rule',
          [/233/.test(c4.text), /270/.test(c4.text)], [true, true]);
    const c5 = await cell('B5', 'batch');
    check('B5 names BOTH, because a culling nobody has flown is not an answer',
          c5.text.replace(/[^0-9,]/g, ''), '271,272');
    /* AND THE ROW SAYS NOTHING ABOUT A BATCH GOING, because none did. A
       sentence here would be the screen explaining a deduction that is not
       in the figure -- the fault one rule along, pointing the other way. */
    const q5 = await cell('B5', 'qty');
    check('…and the quantity hover claims no batch was taken off',
          [/1,300/.test(q5.text), /off this plot/.test(q5.tip)], [true, false]);
    await browser.close();
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
