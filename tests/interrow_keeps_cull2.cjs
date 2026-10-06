/* Interrow spraying counts what was there BEFORE the 2nd culling.

   Every other job is done TO the seedlings — P & D, manuring, weeding — so a
   batch 2nd culled last week is that many fewer to treat, and the linked
   quantity takes the culling off.

   Interrow spraying is the ground BETWEEN the rows. A 2nd culling takes the
   dead seedling out of a polybag that is still sitting exactly where it was:
   same rows, same gaps, same walk, same spray. So an interrow row is worth the
   figure before the culling comes off, and the office has been keying it over
   by hand on every interrow row of every plot.

   It is the quantity, so it is the piece-rate money too — the maintenance
   list, the Worker Record capacity totals and the payroll salary claim all
   read it from the same place, which is why the rule lives in
   shared_plot_movement.js rather than in any one of them.

   The figures below are B5's from the screenshot: 6,788 transplanted, 273
   2nd culled, so the other three jobs read 6,515 and interrow reads 6,788.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/interrow_keeps_cull2.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }
function checkFalse(name, got) { check(name, !!got, false); }

const PD = 'Penyemburan racun kulat dan serangga';
const MN = 'Membaja';
const WD = 'Merumput';
const IR = 'Meracun rumput secara selingan';

let nextId = 700;
const row = (jenis, tarikh, racun, extra) => Object.assign({
  id: nextId++, tarikh, jenis, racun, plot: 'B5',
  batch: '', qty: null, carlos: 0, gaia: 0, remark: ''
}, extra || {});

const RECORDS = [
  row(PD, '2026-09-13', 'Round 2: Manzate 50gm + Bond 15mL'),
  row(MN, '2026-09-07', 'Round 1: Compound 55 20gm'),
  row(WD, '2026-09-06', 'Round 1: Merumput dalam polibeg'),
  row(IR, '2026-09-09', 'Round 1: Monex 200mL + Activator 15mL'),
  row(IR, '2026-09-17', 'Round 3: Monex 200mL + Activator 15mL'),
  // The office keyed its own figure here. A keyed number always wins.
  row(IR, '2026-09-24', 'Round 4: Monex 200mL + Activator 15mL', { qty: 1234 }),
  // Interrow BEFORE the culling happened — there is nothing to add back.
  row(IR, '2026-09-02', 'Round 0: Monex 200mL + Activator 15mL')
];

/* B5 is the screenshot's plot, one batch. B6 holds two — 300 and 301 — so a
   row naming one of them can be told apart from a row covering the plot. */
const log = (id, type, date, plot, batch, qty) => ({
  id, transaction_type: type, transaction_date: date,
  created_at: date + 'T00:00:00Z', remark: '',
  plot_name: plot, batch_name: batch, quantity_change: qty
});
const LOGS = [
  log(1, 'Transplanted', '2026-09-01', 'B5', '253', 6788),
  log(2, '2nd_Culling',  '2026-09-05', 'B5', '253', 273),
  log(3, 'Transplanted', '2026-09-01', 'B6', '300', 4000),
  log(4, 'Transplanted', '2026-09-01', 'B6', '301', 1500),
  log(5, '2nd_Culling',  '2026-09-04', 'B6', '300', 100),
  log(6, '2nd_Culling',  '2026-09-04', 'B6', '301', 50)
];

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((seed) => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.setItem('mjm_maint_month', 'Sep 2026'); } catch (_) {}
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

/* Each work row as "<job> <date> <quantity cell>". The 🔗 is left on, because
   whether the number is derived or keyed is part of what is being checked. */
const table = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#rec-body tr')]
    .filter((tr) => tr.children.length > 3)
    .map((tr) => {
      const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
      return txt(tr.children[1]) + ' ' + txt(tr.children[0]) + ' = ' + txt(tr.children[5]);
    }));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nB5 — 6,788 transplanted, 273 2nd culled on 05 Sep');
  {
    const page = await boot(browser);

    check('the quantity column', await table(page), [
      'P & D Spraying 13 Sep 2026 = 🔗 6,515',
      'Manuring 07 Sep 2026 = 🔗 6,515',
      'Weeding 06 Sep 2026 = 🔗 6,515',
      'Interrow Spraying 02 Sep 2026 = 🔗 6,788',
      'Interrow Spraying 09 Sep 2026 = 🔗 6,788',
      'Interrow Spraying 17 Sep 2026 = 🔗 6,788',
      'Interrow Spraying 24 Sep 2026 = 1,234'
    ]);

    /* 02 Sep is BEFORE the culling, so its 6,788 is the plain balance and
       there is nothing added back — the explanation must not claim there was. */
    const kept = await page.evaluate(() => records
      .filter((r) => r.plot === 'B5')
      .map((r) => {
        const q = PlotMovement.recQty(r);
        return r.jenis + ' ' + r.tarikh + ' '
             + (q.info ? (q.info.keptCull2 ? 'kept ' + q.info.cull2 : 'none') : 'keyed');
      }));
    check('what each row kept', kept, [
      'Penyemburan racun kulat dan serangga 2026-09-13 none',
      'Membaja 2026-09-07 none',
      'Merumput 2026-09-06 none',
      'Meracun rumput secara selingan 2026-09-09 kept 273',
      'Meracun rumput secara selingan 2026-09-17 kept 273',
      'Meracun rumput secara selingan 2026-09-24 keyed',
      'Meracun rumput secara selingan 2026-09-02 none'
    ]);

    /* The number differs from the P & D row above it on the same plot, so the
       cell has to say why or it reads as a fault. */
    const tips = await page.evaluate(() =>
      [...document.querySelectorAll('#rec-body tr')]
        .filter((tr) => tr.children.length > 3)
        .map((tr) => {
          const s = tr.children[5].querySelector('.qty-linked');
          return (tr.children[1].textContent || '').trim()
               + '::' + (s ? /2nd culling/i.test(s.getAttribute('title') || '') : 'none');
        }));
    check('only the interrow cells explain the 2nd culling', tips, [
      'P & D Spraying::false',
      'Manuring::false',
      'Weeding::false',
      'Interrow Spraying::false',   // 02 Sep — the culling had not happened
      'Interrow Spraying::true',
      'Interrow Spraying::true',
      'Interrow Spraying::none'     // keyed by hand, so not a linked cell
    ]);
    await page.close();
  }

  console.log('\nThe money follows the quantity');
  {
    const page = await boot(browser);
    /* capAll is Total Workdone — what the salary claim prices. Interrow must
       carry 6,788 into it, not 6,515, or every interrow morning is underpaid. */
    const caps = await page.evaluate(() => {
      const by = {};
      records.filter((r) => r.plot === 'B5').forEach((r) => {
        by[r.jenis] = (by[r.jenis] || 0) + (PlotMovement.recQty(r).value || 0);
      });
      return by;
    });
    check('P & D', caps['Penyemburan racun kulat dan serangga'], 6515);
    check('Manuring', caps['Membaja'], 6515);
    check('Weeding', caps['Merumput'], 6515);
    // 6788 (02 Sep) + 6788 (09 Sep) + 6788 (17 Sep) + 1234 keyed
    check('Interrow', caps['Meracun rumput secara selingan'], 6788 * 3 + 1234);
    await page.close();
  }

  console.log('\nThe rule itself');
  {
    const page = await boot(browser);
    const named = await page.evaluate(() => [
      PlotMovement.isInterrow('Meracun rumput secara selingan'),
      PlotMovement.isInterrow('Interrow Spraying'),
      PlotMovement.isInterrow('interrow'),
      PlotMovement.isInterrow('Merumput'),
      PlotMovement.isInterrow('Membaja'),
      PlotMovement.isInterrow('Penyemburan racun kulat dan serangga'),
      PlotMovement.isInterrow(''),
      PlotMovement.isInterrow(null)
    ]);
    check('which jobs keep the 2nd culling', named,
          [true, true, true, false, false, false, false, false]);

    /* liveCount still answers the old question when nobody asks for the new
       one — the movement report and the phone's batch list read it. */
    const plain = await page.evaluate(() => {
      const evs = PlotMovement.events().filter((e) => e.plotKey === 'B5');
      return [PlotMovement.liveCount(evs),
              PlotMovement.liveCount(evs, {}),
              PlotMovement.liveCount(evs, { keepCull2: true })];
    });
    check('liveCount unchanged unless asked', plain, [6515, 6515, 6788]);
    await page.close();
  }

  console.log('\nB6 — two batches, and a batch written on the row');
  {
    /* A BATCH TYPED ON THE ROW DECIDES, interrow included. Interrow is
       usually the whole plot, and the way that is said is leaving the batch
       cell empty — empty has always meant every batch standing there. The
       2nd-culling rule is about the culling and nothing else; it does not
       overrule somebody who answered the batch question. */
    const page = await boot(browser);
    const got = await page.evaluate(() => {
      const mk = (jenis, batch) => ({ id: 1, plot: 'B6', jenis, batch,
                                      tarikh: '2026-09-10', racun: 'Round 1: X', qty: null });
      const read = (r) => {
        const q = PlotMovement.recQty(r), b = PlotMovement.recBatches(r);
        return [q.value, b.value];
      };
      return {
        pdOneBatch:  read(mk('Membaja', '300')),
        pdNoBatch:   read(mk('Membaja', '')),
        irOneBatch:  read(mk('Meracun rumput secara selingan', '300')),
        irNoBatch:   read(mk('Meracun rumput secara selingan', ''))
      };
    });

    // 4000 less its 100 culled.
    check('manuring on batch 300 is batch 300', got.pdOneBatch, [3900, '300']);
    // 3900 + 1450, both batches, both culled.
    check('manuring with no batch is every batch', got.pdNoBatch, [5350, '300, 301']);
    // 4000 — batch 300 only, with its culling kept.
    check('INTERROW ON BATCH 300 IS BATCH 300', got.irOneBatch, [4000, '300']);
    // 4000 + 1500 — the whole plot, both cullings kept.
    check('…and interrow with no batch is the whole plot',
          got.irNoBatch, [5500, '300, 301']);
    await page.close();
  }

  console.log('\nThe batch column fills itself in');
  {
    const page = await boot(browser);
    /* Every record in the fixture has an empty batch cell, which means every
       batch on the plot — the quantity beside it has always counted them, and
       the cell drew a dash. */
    const cells = await page.evaluate(() =>
      [...document.querySelectorAll('#rec-body tr')]
        .filter((tr) => tr.children.length > 3)
        .map((tr) => (tr.children[4].textContent || '').replace(/\s+/g, ' ').trim()));
    check('no dashes left where the ledger knows the answer',
          cells, ['🔗 253', '🔗 253', '🔗 253', '🔗 253', '🔗 253', '🔗 253', '🔗 253']);

    const keyed = await page.evaluate(() => {
      const r = { id: 1, plot: 'B5', jenis: 'Membaja', batch: 'KEYED BY HAND',
                  tarikh: '2026-09-10', racun: 'Round 1: X', qty: null };
      const b = PlotMovement.recBatches(r);
      return [b.value, b.linked];
    });
    check('a keyed batch still wins', keyed, ['KEYED BY HAND', false]);

    const none = await page.evaluate(() => {
      const r = { id: 1, plot: 'ZZ', jenis: 'Membaja', batch: '',
                  tarikh: '2026-09-10', racun: 'Round 1: X', qty: null };
      return PlotMovement.recBatches(r).value;
    });
    check('a plot the ledger has nothing for is left empty', none, '');
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
