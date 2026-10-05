/* A figure somebody typed in is not a figure the page may change back.

   TWO WAYS a number changed with nobody having changed it.

   1. THE WORK MAINTENANCE LIST — date, batch, quantity.
      The field fills those three cells from its verified records, and marks
      each one it filled (_fromFieldDate / _fromFieldBatch / _fromFieldQty).
      The mark is also the licence to fill it again. So typing over a filled
      cell and leaving the mark on had the next sync put the field's figure
      straight back — and blank it outright once the field record went. A
      quantity keyed as 4755 read something else by the time anybody looked.

   2. SETTING -> PLOT CAPACITY.
      Save wrote EVERY plot of EVERY nursery, and the boxes are seeded from
      getPlotQty, which answers with a hardcoded default for a plot nobody
      has keyed. So one Save burned the built-in table into the database as
      though somebody had chosen it — and on a page whose read had not landed,
      over the top of the real figures.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/maint_hand_keyed_cells.cjs
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

async function boot(browser, extraDb) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => { (page.__asked = page.__asked || []).push(d.message()); d.accept().catch(() => {}); });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((extra) => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.removeItem('mjm_maint_month'); } catch (_) {}
    window.__DB = Object.assign({
      nops_maint_records: [{ id: 1, records: [
        { id: 1, tarikh: '-', jenis: 'Merumput', racun: 'offstage', plot: 'ZZ',
          batch: '', qty: null, carlos: 0, gaia: 0, remark: '' }
      ] }]
    }, extra || {});
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
      const run = () => {
        if (st.op === 'upsert' || st.op === 'insert') {
          const list = Array.isArray(st.row) ? st.row : [st.row];
          list.forEach((one) => {
            window.__WRITES.push({ table, row: JSON.parse(JSON.stringify(one)) });
            const b = base();
            const i = b.findIndex((r) => (one.id !== undefined && String(r.id) === String(one.id))
              || (one.plot !== undefined && r.nursery === one.nursery && r.plot === one.plot));
            if (i >= 0) b[i] = one; else b.push(one);
          });
          return { data: null, error: null };
        }
        const out = rows();
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
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
  }, extraDb);

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
  await page.waitForFunction(() => typeof window.autoSyncRecords === 'function'
                                && typeof window.applyFieldRecords === 'function'
                                && typeof window.saveCapEdit === 'function',
                             { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForSelector('#recview-list', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(200);
  return page;
}

/* Tick two plots' week-1 spray and build the list from the schedule, which is
   how a row gets onto this screen. Returns the month on the topbar. */
async function planTwoRows(page) {
  return page.evaluate(() => {
    const n = getNursery(), m = getMonth(), s = getState(n, m);
    if (!weekKeys(n, m, 'W').length) s.weeks = [{ from: 1, to: 7 }];
    const w = weekKeys(n, m, 'W')[0];
    s.pdConfig[w].P = 'Antracol';
    s.pdConfig[w].P_dose = 50;
    s.pdConfig[w].P_unit = 'gm';
    s.pdConfig[w].P_sticker = '—';
    s.pd[w] = s.pd[w] || {};
    ['B1', 'B2'].forEach((p) => { s.pd[w][p] = Object.assign({}, s.pd[w][p], { P: 1 }); });
    s._touched = 1;
    autoSyncRecords();
    return m;
  });
}

/* The field's side: one verified record per plot, each carrying a date, a
   batch and a quantity. */
const JENIS = 'Penyemburan racun kulat dan serangga';
function fieldRow(id, plot, month, qty) {
  const ym = new Date(Date.parse(month + ' 1')).toISOString().slice(0, 7);
  return { id, work_date: ym + '-03', plot_name: plot, work_type: 'spray_pd',
           jenis: JENIS, chemical: 'Antracol', batch_name: 'BATCH-' + plot,
           week_no: 1, schedule_month: month, qty, worked_by: 'Awalludin',
           reported_by: 'Awalludin', verified_at: ym + '-04T01:00:00Z',
           gps_points: 0, gps_distance_m: null };
}

const pull = (page) => page.evaluate(async () => {
  await loadFieldRecords();
  applyFieldRecords(getNursery(), getMonth());
});

/* What the row for one plot holds now. */
const cell = (page, plot) => page.evaluate((p) => {
  const r = records.find((x) => x.plot === p && /Antracol/.test(x.racun || ''));
  return r ? { tarikh: r.tarikh, batch: r.batch, qty: r.qty } : null;
}, plot);

/* Type into that row's modal and save it, exactly as the office does. */
const editRow = (page, plot, vals) => page.evaluate(([p, v]) => {
  const r = records.find((x) => x.plot === p && /Antracol/.test(x.racun || ''));
  openRecModal(r);
  const set = (id, val) => { const el = document.getElementById(id);
    el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); };
  if (v.tarikh !== undefined) set('rf-tarikh', v.tarikh);
  if (v.batch  !== undefined) set('rf-batch',  v.batch);
  if (v.qty    !== undefined) set('rf-qty',    v.qty);
  saveRec();
}, [plot, vals]);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nThe list — a cell typed over by the office');
  {
    const page = await boot(browser);
    const month = await planTwoRows(page);
    await page.evaluate((rows) => { window.__DB.nops_maint_field_records = rows; },
      [fieldRow(901, 'B1', month, 100), fieldRow(902, 'B2', month, 200)]);
    await pull(page);

    const ym = new Date(Date.parse(month + ' 1')).toISOString().slice(0, 7);
    check('the field filled B1', await cell(page, 'B1'),
          { tarikh: ym + '-03', batch: 'BATCH-B1', qty: 100 });
    check('…and B2', (await cell(page, 'B2')).qty, 200);

    // The office disagrees about B1's quantity, and types it.
    await editRow(page, 'B1', { qty: '4755' });
    check('the office figure is in', (await cell(page, 'B1')).qty, 4755);

    await pull(page);
    check('IT SURVIVES THE NEXT SYNC', (await cell(page, 'B1')).qty, 4755);
    check('…and B2, which nobody touched, still follows the field',
          (await cell(page, 'B2')).qty, 200);

    // Now the field record goes — unverified again, or deleted.
    await page.evaluate(() => { window.__DB.nops_maint_field_records = []; });
    await pull(page);
    check('IT IS NOT BLANKED WHEN THE FIELD RECORD GOES',
          (await cell(page, 'B1')).qty, 4755);
    /* And B2's is NOT cleared either. A figure that is in the cell is an
       answer somebody is reading; the field record going does not make it
       untrue, and blanking it is how a corrected date went empty and then
       filled itself back in with the field's. The LINK goes, the value
       stays. */
    check('…and neither is B2’s, which the field had filled',
          (await cell(page, 'B2')).qty, 200);
    await page.close();
  }

  console.log('\nThe list — the date and the batch behave the same way');
  {
    const page = await boot(browser);
    const month = await planTwoRows(page);
    await page.evaluate((rows) => { window.__DB.nops_maint_field_records = rows; },
      [fieldRow(901, 'B1', month, 100), fieldRow(902, 'B2', month, 200)]);
    await pull(page);

    await editRow(page, 'B1', { tarikh: '2026-10-21', batch: 'BY HAND' });
    await pull(page);
    const b1 = await cell(page, 'B1');
    check('the hand-keyed date stands', b1.tarikh, '2026-10-21');
    check('…and the hand-keyed batch', b1.batch, 'BY HAND');

    /* A cell somebody deliberately CLEARED is an answer too — it used to read
       as "empty, so ask the field", and the field filled it straight back. */
    await editRow(page, 'B2', { qty: '', batch: '' });
    await pull(page);
    const b2 = await cell(page, 'B2');
    check('a quantity cleared on purpose stays clear', b2.qty, null);
    check('…and a batch cleared on purpose stays clear', b2.batch, '');
    await page.close();
  }

  console.log('\nWhen a field record stops pairing with its row');
  {
    /* The round numbering changed under the office this week, and pairing
       asks the round. A record that paired with a row yesterday can pair with
       a different one today -- and the row it left used to be BLANKED and
       then filled again from whatever else matched. Nobody touched anything
       and the date moved. */
    const page = await boot(browser);
    const month = await planTwoRows(page);
    await page.evaluate((rows) => { window.__DB.nops_maint_field_records = rows; },
      [fieldRow(901, 'B1', month, 100), fieldRow(902, 'B2', month, 200)]);
    await pull(page);
    const ym = new Date(Date.parse(month + ' 1')).toISOString().slice(0, 7);
    check('B1 has the field\u2019s answer', await cell(page, 'B1'),
          { tarikh: ym + '-03', batch: 'BATCH-B1', qty: 100 });

    // The record is re-filed under another round, so it no longer pairs here.
    await page.evaluate(() => {
      const f = window.__DB.nops_maint_field_records.find((x) => x.plot_name === 'B1');
      f.week_no = 4;
    });
    await pull(page);
    check('THE ROW KEEPS WHAT IT HAD', await cell(page, 'B1'),
          { tarikh: ym + '-03', batch: 'BATCH-B1', qty: 100 });
    await page.close();
  }

  console.log('\nTHE COMPLAINT: the worker\u2019s date is wrong, the office fixes it');
  {
    /* The field says the 19th, the office knows it was the 27th and types it.
       The field record is NOT corrected -- it still says the 19th, which is
       the whole point: the office\u2019s answer has to outlive it. */
    const page = await boot(browser);
    const month = await planTwoRows(page);
    await page.evaluate((rows) => { window.__DB.nops_maint_field_records = rows; },
      [fieldRow(901, 'B1', month, 100), fieldRow(902, 'B2', month, 200)]);
    await pull(page);

    const ym = new Date(Date.parse(month + ' 1')).toISOString().slice(0, 7);
    check('the field put its own day on the row', (await cell(page, 'B1')).tarikh,
          ym + '-03');

    await editRow(page, 'B1', { tarikh: ym + '-27', qty: '4755' });
    check('the office corrects both', await cell(page, 'B1'),
          { tarikh: ym + '-27', batch: 'BATCH-B1', qty: 4755 });

    /* Every page load runs this. It used to put the field\u2019s day back on
       every single one of them. */
    for (let i = 0; i < 5; i++) await pull(page);
    check('FIVE SYNCS LATER IT IS STILL THE OFFICE\u2019S', await cell(page, 'B1'),
          { tarikh: ym + '-27', batch: 'BATCH-B1', qty: 4755 });

    check('and the field record still says what it always said',
          await page.evaluate(() => window.__DB.nops_maint_field_records
            .filter((f) => f.plot_name === 'B1').map((f) => f.work_date + '/' + f.qty)),
          [ym + '-03/100']);

    /* A row the office has never touched is still filled from the field --
       that is what makes the portal worth having. */
    check('a row nobody corrected still takes the field\u2019s answer',
          (await cell(page, 'B2')).tarikh, ym + '-03');
    await page.close();
  }

  console.log('\nPlot Capacity — Save writes only what changed');
  {
    /* B3 is on record as 4755. The hardcoded default for B3 is 5655, so if
       anything writes the default this is where it shows. */
    const page = await boot(browser, {
      shared_plots: [
        { nursery_name: 'BNN', plot_name: 'B1' },
        { nursery_name: 'BNN', plot_name: 'B2' },
        { nursery_name: 'BNN', plot_name: 'B3' }
      ],
      operation_nurseries: [{ name: 'BNN' }],
      nops_maint_plot_qty: [{ nursery: 'BNN', plot: 'B3', qty: 4755 }]
    });

    check('B3 reads what was keyed, not the built-in figure',
          await page.evaluate(() => getPlotQty('BNN', 'B3')), 4755);
    check('B1 has nothing on record, so it reads the built-in figure',
          await page.evaluate(() => [getPlotQty('BNN', 'B1'), savedPlotQty('BNN', 'B1')]),
          [2352, null]);

    // Open the editor, change ONE box, save.
    await page.evaluate(() => { window.__WRITES.length = 0; startCapEdit();
                                onDraftInput('BNN', 'B2', '1234'); });
    await page.evaluate(() => saveCapEdit());
    await page.waitForTimeout(250);

    const wrote = await page.evaluate(() => window.__WRITES
      .filter((w) => w.table === 'nops_maint_plot_qty')
      .map((w) => w.row.plot + '=' + w.row.qty).sort());
    check('ONLY THE BOX THAT CHANGED IS WRITTEN', wrote, ['B2=1234']);

    check('B3’s keyed figure is untouched in the database',
          await page.evaluate(() => (window.__DB.nops_maint_plot_qty
            .find((r) => r.plot === 'B3') || {}).qty), 4755);
    checkFalse('and B1 was not given the built-in figure as a saved decision',
      await page.evaluate(() => window.__DB.nops_maint_plot_qty.some((r) => r.plot === 'B1')));
    check('what was typed is on screen', await page.evaluate(() => getPlotQty('BNN', 'B2')), 1234);

    /* Clearing a box to nothing IS a change, and must be saved as 0 rather
       than read as "left alone". */
    await page.evaluate(() => { window.__WRITES.length = 0; startCapEdit();
                                onDraftInput('BNN', 'B3', ''); });
    await page.evaluate(() => saveCapEdit());
    await page.waitForTimeout(250);
    check('clearing a keyed box is saved', await page.evaluate(() => window.__WRITES
      .filter((w) => w.table === 'nops_maint_plot_qty')
      .map((w) => w.row.plot + '=' + w.row.qty).sort()), ['B3=0']);
    await page.close();
  }

  console.log('\nPlot Capacity — the editor will not open on figures it has not read');
  {
    const page = await boot(browser, {
      shared_plots: [{ nursery_name: 'BNN', plot_name: 'B3' }],
      operation_nurseries: [{ name: 'BNN' }],
      nops_maint_plot_qty: [{ nursery: 'BNN', plot: 'B3', qty: 4755 }]
    });
    page.__asked = [];
    const opened = await page.evaluate(() => {
      // The state the page is in before the read lands.
      const was = _dbReady; _dbReady = false;
      startCapEdit();
      const open = capEditing;
      _dbReady = was;
      return open;
    });
    checkFalse('Edit does not open', opened);
    checkTrue('…and says why', /not been read yet/i.test((page.__asked || []).join(' ')));
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
