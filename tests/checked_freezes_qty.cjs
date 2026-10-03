/* Checked stops the quantity being a formula.

   A linked quantity is a live sum of the batch ledger: a sale, a 3rd
   culling, a stock adjustment on that plot all move it — and they move it on
   rows that were settled months ago. Checked means the office has been
   through the row and agreed it, so from that moment the figure has to be a
   NUMBER. What it was reading when it was checked is written down, and
   unchecking throws that away and the link comes back.

   It is the piece-rate money as well as the screen: recQty is what the
   Worker Record capacity totals and the payroll salary claim read, which is
   why the freeze lives in shared_plot_movement.js and not in a page.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/checked_freezes_qty.cjs
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

const WD = 'Merumput';
const RECORDS = [
  // N1 — the screenshot's row. Nothing keyed, so it reads the ledger.
  { id: 801, tarikh: '2026-09-03', jenis: WD, racun: 'Round 1: Antracol 50gm',
    plot: 'N1', batch: '', qty: null, carlos: 0, gaia: 0, remark: '' },
  // N2 — the control. Never checked, so it must keep moving.
  { id: 802, tarikh: '2026-09-03', jenis: WD, racun: 'Round 2: Antracol 50gm',
    plot: 'N2', batch: '', qty: null, carlos: 0, gaia: 0, remark: '' },
  // N3 — the office keyed its own figure. Checking must not overwrite it.
  { id: 803, tarikh: '2026-09-03', jenis: WD, racun: 'Round 3: Antracol 50gm',
    plot: 'N3', batch: '', qty: 777, carlos: 0, gaia: 0, remark: '' },
  // N4 — checked BEFORE any of this existed, so it carries no frozen figure.
  { id: 804, tarikh: '2026-09-03', jenis: WD, racun: 'Round 4: Antracol 50gm',
    plot: 'N4', batch: '', qty: null, carlos: 0, gaia: 0, remark: '', checked: 1 }
];

const log = (id, type, date, plot, batch, qty) => ({
  id, transaction_type: type, transaction_date: date,
  created_at: date + 'T00:00:00Z', remark: '',
  plot_name: plot, batch_name: batch, quantity_change: qty
});
const LOGS = [
  log(1, 'Transplanted', '2026-04-01', 'N1', '240', 5690),
  log(2, 'Transplanted', '2026-04-01', 'N2', '241', 3000),
  log(3, 'Transplanted', '2026-04-01', 'N3', '242', 4000),
  log(4, 'Transplanted', '2026-04-01', 'N4', '243', 2500)
];

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((seed) => {
    try { localStorage.setItem('mjm_maint_nursery', 'UNN2');
          localStorage.removeItem('mjm_maint_month'); } catch (_) {}
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
  await page.waitForFunction(() => typeof window.toggleChecked === 'function', { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForFunction(() => window.PlotMovement && PlotMovement.ready(), { timeout: 20000 });
  await page.waitForTimeout(250);
  await page.evaluate(() => renderRecords());
  return page;
}

/* What each row's quantity cell reads, and whether it is marked held. */
const cells = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#rec-body tr')]
    .filter((tr) => tr.children.length > 3)
    .map((tr) => {
      const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
      return txt(tr.children[3]) + ' ' + txt(tr.children[5]);
    }).sort());

const row = (page, id) => page.evaluate((i) => {
  const r = records.find((x) => x.id === i);
  return r ? { qty: r.qty, frozen: r.qtyFrozen ?? null, batchFrozen: r.batchFrozen ?? null,
               checked: r.checked || 0, shown: PlotMovement.recQty(r).value } : null;
}, id);

/* A 2nd culling lands on N1 and N2 and the ledger is re-read.
   DATED BEFORE THE WORK, recorded after it — which is the ordinary way
   round: the office keys the culling days later, and the figure the work
   record was reading moves under it. That is the whole reason a settled row
   has to stop being a formula. */
const sellFrom = (page) => page.evaluate(async () => {
  window.__DB.shared_inventory_logs.push(
    { id: 90, transaction_type: '2nd_Culling', transaction_date: '2026-09-01',
      created_at: '2026-09-25T00:00:00Z', remark: '', plot_name: 'N1',
      batch_name: '240', quantity_change: 1000 },
    { id: 91, transaction_type: '2nd_Culling', transaction_date: '2026-09-01',
      created_at: '2026-09-25T00:00:00Z', remark: '', plot_name: 'N2',
      batch_name: '241', quantity_change: 500 });
  await PlotMovement.load(_supabase);
  renderRecords();
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nBefore anything is checked');
  {
    const page = await boot(browser);
    check('every unsettled row reads the ledger', await cells(page), [
      'N1 🔗 5,690',
      'N2 🔗 3,000',
      'N3 777',            // keyed by the office
      'N4 🔒 2,500'        // checked before this existed — frozen on load
    ]);

    /* The row that was already checked had nothing written down, so it was
       still reading a live sum — the very thing Checked is meant to stop. */
    const n4 = await row(page, 804);
    check('the old checked row was frozen at what it read', n4.frozen, 2500);
    checkTrue('…and that was saved, not just held in the page',
      await page.evaluate(() => (window.__DB.nops_maint_records[0].records
        .find((r) => r.id === 804) || {}).qtyFrozen === 2500));
    await page.close();
  }

  console.log('\nChecking a row writes the figure down');
  {
    const page = await boot(browser);
    await page.evaluate(() => toggleChecked(801));
    await page.waitForTimeout(150);

    const n1 = await row(page, 801);
    check('frozen at what it was reading', n1.frozen, 5690);
    check('the batch names too', n1.batchFrozen, '240');
    check('it is checked', n1.checked, 1);
    check('…and the cell says held', await cells(page), [
      'N1 🔒 5,690', 'N2 🔗 3,000', 'N3 777', 'N4 🔒 2,500'
    ]);

    /* THE POINT. A 2nd culling lands on both plots afterwards. */
    await sellFrom(page);
    check('THE CHECKED ROW DOES NOT MOVE', (await row(page, 801)).shown, 5690);
    check('…and the one nobody settled does', (await row(page, 802)).shown, 2500);
    check('on the screen as well', await cells(page), [
      'N1 🔒 5,690', 'N2 🔗 2,500', 'N3 777', 'N4 🔒 2,500'
    ]);
    await page.close();
  }

  console.log('\nUnchecking gives it back to the ledger');
  {
    const page = await boot(browser);
    await page.evaluate(() => toggleChecked(801));
    await page.waitForTimeout(120);
    await sellFrom(page);
    check('held while checked', (await row(page, 801)).shown, 5690);

    await page.evaluate(() => toggleChecked(801));
    await page.waitForTimeout(150);
    const n1 = await row(page, 801);
    check('the held figure is gone', n1.frozen, null);
    check('…and the batch one with it', n1.batchFrozen, null);
    check('it is unchecked', n1.checked, 0);
    check('IT READS THE LEDGER AGAIN', n1.shown, 4690);
    check('and the cell is live again', await cells(page), [
      'N1 🔗 4,690', 'N2 🔗 2,500', 'N3 777', 'N4 🔒 2,500'
    ]);
    await page.close();
  }

  console.log('\nA figure the office keyed is still its own');
  {
    const page = await boot(browser);
    await page.evaluate(() => toggleChecked(803));
    await page.waitForTimeout(150);
    const n3 = await row(page, 803);
    check('nothing was frozen over it', n3.frozen, null);
    check('and it still reads what was keyed', n3.shown, 777);
    checkFalse('the cell is not marked held, because it never was linked',
      (await cells(page)).some((c) => c.startsWith('N3 🔒')));
    await page.close();
  }

  console.log('\nThe money follows the same figure');
  {
    const page = await boot(browser);
    await page.evaluate(() => toggleChecked(801));
    await page.waitForTimeout(120);
    await sellFrom(page);
    /* capAll on the Worker Record, and the salary claim, both read recQty —
       so a settled row prices at what it was settled on. */
    check('the capacity a checked row carries', await page.evaluate(() => {
      const r = records.find((x) => x.id === 801);
      return PlotMovement.recQty(r).value;
    }), 5690);
    check('…and it is not reported as linked', await page.evaluate(() => {
      const r = records.find((x) => x.id === 801);
      const q = PlotMovement.recQty(r);
      return [q.linked, !!q.frozen];
    }), [false, true]);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
