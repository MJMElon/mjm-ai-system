/* THE QUANTITY BOX SAYS WHOSE FIGURE IS IN IT, and offers the link back.

   The office opened an OCTOBER record, read

       Linked value is 2,353 — your 2,353 overrides it

   and asked: *"10月是新的月份 手打的2353是不是上个月的record？每个月请直接
   刷新变成linked amount"*. Two things in that, and the first is a question
   the screen had made unanswerable.

   IT WAS NOT SEPTEMBER'S. October's rows are built fresh — `autoSyncRecords`
   generates every one with `qty:null` and matches only rows stamped with the
   month on screen — and `records_are_per_month.cjs` drives exactly that
   across the boundary. This file does not restate it.

   WHAT THE SCREEN GOT WRONG is "your". THREE different things can put a
   figure in that box:

     · somebody KEYED it, which really is theirs (`_qtyByHand`);
     · the FIELD reported it and `applyFieldRecords` filled the empty cell
       from a worker own verified record (`_fromFieldQty`);
     · it was saved before either mark existed, so nothing knows.

   The hint called all three "yours", so a figure the office never typed read
   as one they had — which is why they went looking for last month. It now
   says which, and carries the refresh they asked for as a BUTTON: the only
   way to put a row back on the link was to know that emptying the box does
   it, and no screen says that.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_linked_quantity_says_whose_it_is.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

/* The office own figures. One transplant into B1, so the linked quantity on
   that plot is 2,353 — the number they were looking at. */
const LEDGER = [
  { transaction_type: 'Transplanted', transaction_date: '2026-10-01',
    created_at: '2026-10-01T00:00:00Z', remark: 'from tray [P1]',
    plot_name: 'B1', batch_name: '268', quantity_change: 2353 }
];

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((ledger) => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.setItem('mjm_maint_month', 'Oct 2026'); } catch (_) {}
    window.__DB = {
      shared_inventory_logs: ledger,
      shared_do_records: [],
      /* One offstage row on a plot no nursery claims: an EMPTY list leaves
         the page showing its own demo seed, whose chemicals collide with
         what this test keys. */
      nops_maint_records: [{ id: 1, records: [
        { id: 1, tarikh: '-', jenis: 'Merumput', racun: 'offstage', plot: 'ZZ',
          batch: '', qty: null, carlos: 0, gaia: 0, remark: '' }
      ] }]
    };
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select', row: null };
      const base = () => (window.__DB[table] || (window.__DB[table] = []));
      const run = () => {
        if (st.op === 'upsert' || st.op === 'insert') {
          const b = base();
          const i = b.findIndex((r) => String(r.id) === String(st.row.id));
          if (i >= 0) b[i] = st.row; else b.push(st.row);
          return { data: null, error: null };
        }
        let out = base().slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'upsert' || p === 'insert') return (r) => { st.op = p; st.row = r; return q; };
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
  }, LEDGER);

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
  await page.waitForFunction(() => typeof window.refreshLinkedQty === 'function'
                                && typeof window.autoSyncRecords === 'function',
                             { timeout: 20000 });
  /* The REAL shared_plot_movement, over the stubbed ledger. A stub of the
     rule itself would prove the sentence and not the figure. */
  await page.waitForFunction(() => window.PlotMovement && PlotMovement.ready(),
                             { timeout: 20000 }).catch(() => {});
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForSelector('#recview-list', { state: 'visible', timeout: 10000 });

  // October, one week-1 P spray on B1 — the office own row.
  await page.evaluate(() => {
    document.getElementById('global-month').value = '2026-10';
    const n = getNursery(), m = getMonth(), s = getState(n, m);
    if (!weekKeys(n, m, 'W').length) s.weeks = [{ from: 1, to: 7 }];
    const w = weekKeys(n, m, 'W')[0];
    s.pdConfig[w].P = 'Antracol';
    s.pdConfig[w].P_dose = 50; s.pdConfig[w].P_unit = 'gm'; s.pdConfig[w].P_sticker = '—';
    s.pd[w] = s.pd[w] || {};
    s.pd[w].B1 = Object.assign({}, s.pd[w].B1, { P: 1 });
    s._touched = 1;
    renderAll();
    autoSyncRecords();
  });
  await page.waitForTimeout(200);
  return page;
}

/* Put the row in the state under test, open the modal on it, and read the
   hint back as the office sees it. `marks` is what the row carries — the
   same two flags applyFieldRecords and saveRec write. */
const hintFor = (page, row) => page.evaluate((r) => {
  const rec = records.find((x) => x._month === 'Oct 2026' && x.plot === 'B1');
  if (!rec) return { err: 'no October row on B1' };
  delete rec._qtyByHand; delete rec._fromFieldQty;
  rec.qty = r.qty;
  rec.batch = '268';
  if (r.mark) rec[r.mark] = 1;
  openRecModal(rec);
  const box = document.getElementById('rf-qty-link');
  return {
    text: (box.textContent || '').replace(/\s+/g, ' ').trim(),
    useBtn: !!box.querySelector('.lnk-use'),
    inBox: document.getElementById('rf-qty').value
  };
}, row);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await boot(browser);

  console.log('\n— the link resolves off the real ledger');
  const live = await hintFor(page, { qty: null });
  check('an empty box takes the linked figure, and says so',
        [/2,353 will be used/.test(live.text), live.inBox], [true, '']);
  /* NOTHING TO UNDO ON A LIVE ROW. A button offering to "use the linked
     amount" on a row already using it is a press that changes nothing, which
     is how a screen teaches people that its buttons do nothing. */
  check('…and offers no Use-the-link button, there being nothing to undo',
        live.useBtn, false);

  console.log('\n— whose figure is in the box');
  /* THE ONE THE OFFICE WAS LOOKING AT. The field reported 2,353 and
     applyFieldRecords filled the empty cell with it; the screen called it
     theirs, so they went looking for last month. */
  const field = await hintFor(page, { qty: 2353, mark: '_fromFieldQty' });
  check('a figure the FIELD reported is not called yours',
        [/the field reported 2,353/.test(field.text), /your/i.test(field.text)],
        [true, false]);
  check('…and it still names the linked figure beside it',
        /Linked value is 2,353/.test(field.text), true);

  const hand = await hintFor(page, { qty: 2000, mark: '_qtyByHand' });
  check('a figure somebody KEYED is still called theirs',
        [/your 2,000 overrides it/.test(hand.text), /field reported/.test(hand.text)],
        [true, false]);

  /* Saved before either mark existed. Nothing knows who put it there, so the
     sentence must not guess — the whole fault one case along. */
  const old = await hintFor(page, { qty: 1800 });
  check('a figure from before the marks says only that it is saved',
        [/the saved 1,800 is being used/.test(old.text),
         /your/i.test(old.text), /field reported/.test(old.text)],
        [true, false, false]);

  console.log('\n— the refresh is a press');
  check('every overridden row offers it',
        [field.useBtn, hand.useBtn, old.useBtn], [true, true, true]);
  /* TYPING OVER A FIELD FIGURE MAKES IT YOURS, live, before the save — and
     the test is the SAME one saveRec uses, so the sentence cannot say one
     thing while the save does another. */
  const typedOver = await page.evaluate(() => {
    const el = document.getElementById('rf-qty');
    el.value = '1234';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    refreshLinkedQty();
    return (document.getElementById('rf-qty-link').textContent || '').replace(/\s+/g, ' ').trim();
  });
  check('typing over it says so at once', /your 1,234 overrides it/.test(typedOver), true);

  const after = await page.evaluate(() => {
    if (typeof useLinkedQty !== 'function') return { err: 'no useLinkedQty' };
    useLinkedQty();
    const box = document.getElementById('rf-qty-link');
    return { inBox: document.getElementById('rf-qty').value,
             text: (box.textContent || '').replace(/\s+/g, ' ').trim(),
             useBtn: !!box.querySelector('.lnk-use') };
  });
  check('pressing it empties the box and the row reads live again',
        [after.inBox, /2,353 will be used/.test(after.text), after.useBtn],
        ['', true, false]);

  /* AND IT STICKS. Saving an emptied box leaves no quantity, so recQty falls
     to the link — and the cell is marked as the office own answer, which is
     what stops the next field sync quietly filling it in again. That mark is
     the existing contract, not a new one: `_qtyByHand` has always meant "an
     empty cell somebody emptied is their answer too". */
  const saved = await page.evaluate(() => {
    saveRec();
    const r = records.find((x) => x._month === 'Oct 2026' && x.plot === 'B1');
    return [r.qty, r._qtyByHand || 0, r._fromFieldQty || 0];
  });
  check('saving it leaves the row on the link, and the field cannot refill it',
        saved, [null, 1, 0]);

  console.log('\n— and October is not September');
  /* Asserted once here because it is the question that was asked;
     records_are_per_month.cjs is what drives it properly. */
  check('October carries no row of any other month',
        await page.evaluate(() => [...new Set(records.filter(r => r.plot === 'B1')
                                                     .map(r => r._month))]),
        ['Oct 2026']);

  if (process.env.SHOT) {
    await hintFor(page, { qty: 2353, mark: '_fromFieldQty' });
    await page.locator('#rec-modal .modal').screenshot({ path: process.env.SHOT });
  }
  await page.close();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
