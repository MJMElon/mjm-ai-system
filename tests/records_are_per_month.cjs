/* A month keeps its own work records.

   The schedule has always been stored per (nursery, month). The work RECORDS
   were not: one JSONB list for the whole system, and a generated row's slot
   -- pd|W1|P|N15 -- is the same string in every month. So stepping to October
   and syncing matched October's round 1 against SEPTEMBER's row and reused
   it. Nothing was deleted; September was RELABELLED as October, which is why
   a month that has gone by could not be printed again.

   It was invisible while the field refilled the date and quantity every
   month. Once a full cell stopped being overwritten, September's hand-keyed
   figures rode into October -- the opposite of what a new month is.

   So every row carries the month it was built for, and the sync rebuilds only
   that month, leaving the rest of the list alone.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/records_are_per_month.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript(() => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.setItem('mjm_maint_month', 'Sep 2026'); } catch (_) {}
    /* One offstage row, on a plot no nursery claims. A list that is EMPTY
       leaves the page showing its own demo seed, whose chemicals collide with
       the ones this test keys. */
    window.__DB = { nops_maint_records: [{ id: 1, records: [
      { id: 1, tarikh: '-', jenis: 'Merumput', racun: 'offstage', plot: 'ZZ',
        batch: '', qty: null, carlos: 0, gaia: 0, remark: '' }
    ] }] };
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
          window.__WRITES.push({ table, row: JSON.parse(JSON.stringify(st.row)) });
          const b = base();
          const i = b.findIndex((r) => String(r.id) === String(st.row.id));
          if (i >= 0) b[i] = st.row; else b.push(st.row);
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
  });

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
                                && typeof window._recInMonth === 'function',
                             { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForSelector('#recview-list', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(200);
  return page;
}

/* Go to a month, tick one week-1 P spray on B1, and build the list from it. */
const planMonth = (page, ym, chem) => page.evaluate(([v, c]) => {
  document.getElementById('global-month').value = v;
  const n = getNursery(), m = getMonth(), s = getState(n, m);
  if (!weekKeys(n, m, 'W').length) s.weeks = [{ from: 1, to: 7 }];
  const w = weekKeys(n, m, 'W')[0];
  s.pdConfig[w].P = c;
  s.pdConfig[w].P_dose = 50; s.pdConfig[w].P_unit = 'gm'; s.pdConfig[w].P_sticker = '—';
  s.pd[w] = s.pd[w] || {};
  s.pd[w].B1 = Object.assign({}, s.pd[w].B1, { P: 1 });
  s._touched = 1;
  renderAll();
  autoSyncRecords();
  return getMonth();
}, [ym, chem]);

const goMonth = (page, ym) => page.evaluate((v) => {
  document.getElementById('global-month').value = v;
  renderAll();
  autoSyncRecords();
  return getMonth();
}, ym);

/* The work rows drawn right now: "date / chemical / quantity". */
const drawn = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#rec-body tr')]
    .filter((tr) => tr.children.length > 3)
    .map((tr) => {
      const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
      return txt(tr.children[0]) + ' / ' + txt(tr.children[2]) + ' / ' + txt(tr.children[5]);
    }));

/* Everything saved, whichever month it belongs to. */
const saved = (page) => page.evaluate(() =>
  records.filter((r) => r.plot === 'B1' && (r.racun || '').indexOf('Round 1:') === 0)
         .map((r) => (r._month || '(none)') + ' ' + r.tarikh + ' ' + (r.qty == null ? '-' : r.qty))
         .sort());

const typeInto = (page, chem, vals) => page.evaluate(([c, v]) => {
  const m = getMonth();
  const r = records.find((x) => (x.racun || '').includes(c) && x._month === m);
  openRecModal(r);
  const set = (id, val) => { const el = document.getElementById(id);
    el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); };
  if (v.tarikh !== undefined) set('rf-tarikh', v.tarikh);
  if (v.qty !== undefined) set('rf-qty', v.qty);
  saveRec();
}, [chem, vals]);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nSeptember is keyed, then October is opened');
  {
    const page = await boot(browser);
    check('on September', await planMonth(page, '2026-09', 'Antracol'), 'Sep 2026');

    await typeInto(page, 'Antracol', { tarikh: '2026-09-27', qty: '4755' });
    check('what the office keyed', await drawn(page),
          ['27 Sep 2026 / Round 1: Antracol 50gm / 4,755']);

    check('October is a different month', await goMonth(page, '2026-10'), 'Oct 2026');
    check('AND IT IS EMPTY OF SEPTEMBER', await drawn(page), []);

    check('back on September, nothing has moved', await goMonth(page, '2026-09'), 'Sep 2026');
    check('SEPTEMBER IS EXACTLY AS IT WAS', await drawn(page),
          ['27 Sep 2026 / Round 1: Antracol 50gm / 4,755']);
    await page.close();
  }

  console.log('\nOctober has a schedule of its own');
  {
    const page = await boot(browser);
    await planMonth(page, '2026-09', 'Antracol');
    await typeInto(page, 'Antracol', { tarikh: '2026-09-27', qty: '4755' });

    await planMonth(page, '2026-10', 'Daconil');
    check('October draws October', await drawn(page),
          ['- / Round 1: Daconil 50gm / —']);

    /* THE POINT. October's row is new: no date, no quantity, nothing of
       September riding in on the same slot. */
    const oct = await page.evaluate(() =>
      records.filter((r) => r._month === 'Oct 2026')
             .map((r) => [r.tarikh, r.qty, r._tarikhByHand || 0, r._qtyByHand || 0]));
    check('and it carries nothing of September', oct, [['-', null, 0, 0]]);

    check('both months are saved side by side', await saved(page),
          ['Oct 2026 - -', 'Sep 2026 2026-09-27 4755']);

    /* And the office corrects October on its own, the way they said they
       would. */
    await typeInto(page, 'Daconil', { tarikh: '2026-10-21' });
    check('October keyed', await drawn(page),
          ['21 Oct 2026 / Round 1: Daconil 50gm / —']);
    check('…and September is untouched by it', await saved(page),
          ['Oct 2026 2026-10-21 -', 'Sep 2026 2026-09-27 4755']);
    await page.close();
  }

  console.log('\nThe Worker Record is the month on the topbar');
  {
    const page = await boot(browser);
    await planMonth(page, '2026-09', 'Antracol');
    await typeInto(page, 'Antracol', { tarikh: '2026-09-27', qty: '4755' });
    await planMonth(page, '2026-10', 'Daconil');

    check('October sheet', await page.evaluate(() =>
      payrollRowsFor('pd').map((r) => r.tarikh + ' ' + (r.qty == null ? '-' : r.qty))),
      ['- -']);
    await goMonth(page, '2026-09');
    check('September sheet', await page.evaluate(() =>
      payrollRowsFor('pd').map((r) => r.tarikh + ' ' + (r.qty == null ? '-' : r.qty))),
      ['2026-09-27 4755']);
    await page.close();
  }

  console.log('\nRows saved before months existed go to the month they belong to');
  {
    /* The state every list is in right now: rows with no month on them, and
       the office opening OCTOBER. They must not show up there, and the sync
       must not stamp them October, or September is gone for good.

       A row with no date rides with its nursery: it came out of the same
       schedule in the same pass. */
    const page = await boot(browser);
    await page.evaluate(() => {
      records = [
        { id: 1, tarikh: '2026-09-15', jenis: 'Merumput', plot: 'B1',
          racun: 'Round 1: Merumput dalam polibeg', batch: '', qty: 10,
          carlos: 0, gaia: 0, remark: '' },
        { id: 2, tarikh: '2026-09-21', jenis: 'Membaja', plot: 'B2',
          racun: 'Round 1: Yaramila 30gm', batch: '', qty: 20,
          carlos: 0, gaia: 0, remark: '' },
        // Planned, never done: no date to read a month off.
        { id: 3, tarikh: '-', jenis: 'Membaja', plot: 'B3',
          racun: 'Round 2: Yaramila 30gm', batch: '', qty: null,
          carlos: 0, gaia: 0, remark: '' }
      ];
      document.getElementById('global-month').value = '2026-10';
      stampRecordMonths();
      renderAll();
    });
    check('every one of them was put under September',
          await page.evaluate(() => records.map((r) => r._month || '(none)')),
          ['Sep 2026', 'Sep 2026', 'Sep 2026']);
    check('OCTOBER DOES NOT SHOW THEM', await drawn(page), []);

    await page.evaluate(() => autoSyncRecords());
    await page.waitForTimeout(120);
    check('…and a sync on October leaves them where they are',
          await page.evaluate(() => records.map((r) => (r._month || '(none)') + ' ' + r.tarikh)),
          ['Sep 2026 2026-09-15', 'Sep 2026 2026-09-21', 'Sep 2026 -']);

    check('September still has all three', await goMonth(page, '2026-09'), 'Sep 2026');
    check('…on the screen', (await drawn(page)).length, 3);
    await page.close();
  }

  console.log('\nA list wrongly stamped with the month somebody opened it in');
  {
    /* What the first version of this did: opening October stamped every one
       of September rows "Oct 2026". The page then read October at the top and
       September down the page. The dates say otherwise, so the dates win. */
    const page = await boot(browser);
    await page.evaluate(() => {
      records = [
        { id: 1, _month: 'Oct 2026', tarikh: '2026-09-04', jenis: 'Merumput', plot: 'B1',
          racun: 'Round 1: Merumput dalam polibeg', batch: '', qty: 10, carlos: 0, gaia: 0, remark: '' },
        { id: 2, _month: 'Oct 2026', tarikh: '2026-09-13', jenis: 'Merumput', plot: 'B1',
          racun: 'Round 2: Merumput dalam polibeg', batch: '', qty: 11, carlos: 0, gaia: 0, remark: '' },
        { id: 3, _month: 'Oct 2026', tarikh: '2026-09-18', jenis: 'Membaja', plot: 'B2',
          racun: 'Round 1: Yaramila 30gm', batch: '', qty: 12, carlos: 0, gaia: 0, remark: '' },
        // Planned, never done. It rides with its nursery.
        { id: 4, _month: 'Oct 2026', tarikh: '-', jenis: 'Membaja', plot: 'B3',
          racun: 'Round 2: Yaramila 30gm', batch: '', qty: null, carlos: 0, gaia: 0, remark: '' },
        /* One job done on the 2nd of October against SEPTEMBER schedule. One
           late day must not drag the month with it. */
        { id: 5, _month: 'Oct 2026', tarikh: '2026-10-02', jenis: 'Merumput', plot: 'B4',
          racun: 'Round 3: Merumput dalam polibeg', batch: '', qty: 13, carlos: 0, gaia: 0, remark: '' }
      ];
      document.getElementById('global-month').value = '2026-10';
      stampRecordMonths();
      renderAll();
    });
    check('THE DATES WIN', await page.evaluate(() => records.map((r) => r._month)),
          ['Sep 2026', 'Sep 2026', 'Sep 2026', 'Sep 2026', 'Sep 2026']);
    check('so October is empty', await drawn(page), []);
    check('and September has all five', await goMonth(page, '2026-09'), 'Sep 2026');
    check('…drawn', (await drawn(page)).length, 5);

    /* Run it again on a list that already agrees: nothing may move. */
    check('a second pass moves nothing',
          await page.evaluate(() => stampRecordMonths()), 0);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
