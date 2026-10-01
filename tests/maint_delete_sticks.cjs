/* A row deleted off the Work Maintenance list stays deleted.

   The list is not a list somebody keyed. autoSyncRecords REBUILDS it from the
   schedule — on every page load and on every "Sync from Schedule" — replacing
   the nursery's rows with exactly the rows the schedule's ticks call for. So
   deleting a row the schedule still plans took it off the screen and the next
   rebuild put it straight back, with nothing on either screen saying why.

   Del now clears the tick that produces the row, which is the only way the
   row can stay gone and is what deleting a planned job means. The confirm
   says so, because the schedule is also what the Field Conductors' week board
   is built from.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/maint_delete_sticks.cjs
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

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const asked = [];
  page.on('dialog', (d) => { asked.push(d.message()); d.accept().catch(() => {}); });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript(() => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.removeItem('mjm_maint_month'); } catch (_) {}
    /* A saved blob, so the page's own demo seed is replaced. One row, on a
       plot no nursery claims, so it is never drawn and never in the way. */
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
          const i = b.findIndex((r) => String(r.id) === String(st.row.id)
            || (r.nursery === st.row.nursery && r.month === st.row.month));
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
                                && typeof window._scheduleTicksFor === 'function',
                             { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForSelector('#recview-list', { state: 'visible', timeout: 10000 });
  return { page, asked };
}

/* Tick one plot's week-1 P spray with a named chemical, then build the list
   from it — which is exactly how a row gets onto this screen. */
async function planAndSync(page, plot, chem) {
  await page.evaluate(([p, c]) => {
    const n = getNursery(), m = getMonth();
    const s = getState(n, m);
    /* A month with no weeks set has no rounds, so nothing syncs and there is
       nothing to delete. One week, the way the Schedule tab sets them. */
    if (!weekKeys(n, m, 'W').length) s.weeks = [{ from: 1, to: 7 }];
    const w = weekKeys(n, m, 'W')[0];
    s.pdConfig[w].P = c;
    s.pdConfig[w].P_dose = 50;
    s.pdConfig[w].P_unit = 'gm';
    s.pdConfig[w].P_sticker = '—';
    s.pd[w] = s.pd[w] || {};
    s.pd[w][p] = Object.assign({}, s.pd[w][p], { P: 1 });
    s._touched = 1;
    autoSyncRecords();
  }, [plot, chem]);
  await page.waitForTimeout(120);
}

/* The chemical of each work row. The group headers and the "no records"
   line have one cell, so they are not rows of work. */
const rows = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#rec-body tr')]
    .filter((tr) => !tr.classList.contains('plot-group-row') && tr.children.length > 3)
    .map((tr) => (tr.children[2].textContent || '').replace(/\s+/g, ' ').trim()));

const ticked = (page, plot) => page.evaluate((p) => {
  const n = getNursery(), m = getMonth();
  const s = getState(n, m);
  const w = weekKeys(n, m, 'W')[0];
  return !!(w && s.pd[w] && s.pd[w][p] && s.pd[w][p].P);
}, plot);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nA row the schedule still asks for');
  {
    const { page, asked } = await boot(browser);
    await planAndSync(page, 'B1', 'Antracol');
    const before = await rows(page);
    check('the schedule put the row on the list', before, ['Round 1: Antracol 50gm']);
    checkTrue('…and the tick is on the plot', await ticked(page, 'B1'));

    asked.length = 0;
    await page.evaluate(() => {
      const r = [...document.querySelectorAll('#rec-body tr')]
        .find((tr) => tr.children.length > 3 && /Antracol/.test(tr.textContent));
      r.querySelector('.btn-danger').click();
    });
    await page.waitForTimeout(150);

    checkTrue('the confirm says the job is on the schedule',
              /on .* SCHEDULE/i.test(asked[0] || ''));
    checkTrue('…and that the row would otherwise come straight back',
              /bring it straight back/i.test(asked[0] || ''));
    checkTrue('…and that the tick goes with it',
              /tick on plot B1 will be cleared/i.test(asked[0] || ''));
    checkTrue('…and what else that means — the FC’s board is built from it',
              /week board/i.test(asked[0] || ''));

    check('the row is gone', await rows(page), []);
    checkFalse('…AND THE TICK THAT MADE IT IS GONE', await ticked(page, 'B1'));

    /* The whole point: a rebuild is what used to bring it back. */
    await page.evaluate(() => autoSyncRecords());
    await page.waitForTimeout(120);
    check('IT DOES NOT COME BACK ON THE NEXT SYNC', await rows(page), []);
    await page.close();
  }

  console.log('\nA row the schedule does not ask for');
  {
    const { page, asked } = await boot(browser);
    await page.evaluate(() => {
      openRecModal();
      const set = (id, v) => { const el = document.getElementById(id);
                               el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
      set('rf-tarikh', '');
      set('rf-jenis', 'Penyemburan racun kulat dan serangga');
      set('rf-racun', 'Keyed by hand');
      set('rf-plot', 'B2');
      set('rf-batch', '');
      set('rf-qty', '');
      saveRec();
    });
    await page.waitForTimeout(120);
    check('it is on the list', await rows(page), ['Keyed by hand']);

    asked.length = 0;
    await page.evaluate(() => {
      const r = [...document.querySelectorAll('#rec-body tr')]
        .find((tr) => tr.children.length > 3 && /Keyed by hand/.test(tr.textContent));
      r.querySelector('.btn-danger').click();
    });
    await page.waitForTimeout(150);
    checkFalse('the confirm says nothing about the schedule, because it is not on it',
               /SCHEDULE/i.test(asked[0] || ''));
    check('…and it is deleted', await rows(page), []);
    await page.close();
  }

  console.log('\nOne plot’s tick, not the whole week’s');
  {
    const { page } = await boot(browser);
    await planAndSync(page, 'B1', 'Antracol');
    await page.evaluate(() => {
      const n = getNursery(), m = getMonth(), s = getState(n, m);
      const w = weekKeys(n, m, 'W')[0];
      s.pd[w].B2 = Object.assign({}, s.pd[w].B2, { P: 1 });
      autoSyncRecords();
    });
    await page.waitForTimeout(120);
    check('both plots are planned', (await rows(page)).length, 2);

    await page.evaluate(() => {
      const r = [...document.querySelectorAll('#rec-body tr')]
        .find((tr) => tr.children.length > 3 && /B1/.test(tr.children[3].textContent));
      r.querySelector('.btn-danger').click();
    });
    await page.waitForTimeout(150);
    checkFalse('B1’s tick is cleared', await ticked(page, 'B1'));
    checkTrue('…and B2’s is NOT — the same week, a different plot',
              await ticked(page, 'B2'));
    await page.evaluate(() => autoSyncRecords());
    await page.waitForTimeout(120);
    check('…so B2’s row survives the next sync', (await rows(page)).length, 1);
    await page.close();
  }

  console.log('\nA record somebody added by hand');
  {
    /* It used to be thrown away: the sync replaced the nursery's rows with
       the schedule's, and a row nobody scheduled was not among them. B3-R and
       B4-R vanished between one page load and the next. */
    const { page } = await boot(browser);
    await planAndSync(page, 'B1', 'Antracol');
    await page.evaluate(() => {
      openRecModal();
      const set = (id, v) => { const el = document.getElementById(id);
                               el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
      set('rf-tarikh', ''); set('rf-jenis', 'Merumput');
      set('rf-racun', 'Keyed by hand'); set('rf-plot', 'B3');
      set('rf-batch', '268'); set('rf-qty', '4755');
      saveRec();
    });
    await page.waitForTimeout(120);
    checkTrue('it is on the list', (await rows(page)).includes('Keyed by hand'));

    await page.evaluate(() => autoSyncRecords());
    await page.waitForTimeout(120);
    checkTrue('IT IS STILL THERE AFTER A SYNC', (await rows(page)).includes('Keyed by hand'));
    const kept = await page.evaluate(() => {
      const r = [...document.querySelectorAll('#rec-body tr')]
        .find((tr) => tr.children.length > 3 && /Keyed by hand/.test(tr.textContent));
      return r ? [...r.children].slice(3, 6).map((td) => td.textContent.replace(/\s+/g, ' ').trim()) : null;
    });
    check('…with what was keyed into it', kept, ['B3', '268', '4,755']);
    await page.close();
  }

  console.log('\nA chemical changed by hand');
  {
    const { page } = await boot(browser);
    await planAndSync(page, 'B1', 'Antracol');
    await page.evaluate(() => {
      const r = [...document.querySelectorAll('#rec-body tr')]
        .find((tr) => tr.children.length > 3 && /Antracol/.test(tr.textContent));
      r.querySelector('.btn:not(.btn-danger):not(.btn-check)').click();
      document.getElementById('rf-racun').value = 'Round 3: Monex 200mL + Activator 15mL';
      saveRec();
    });
    await page.waitForTimeout(120);
    check('the change is on the list', await rows(page),
          ['Round 3: Monex 200mL + Activator 15mL']);

    await page.evaluate(() => autoSyncRecords());
    await page.waitForTimeout(120);
    check('IT IS STILL THE CHANGE AFTER A SYNC — and the schedule\u2019s wording '
        + 'is not put back beside it', await rows(page),
          ['Round 3: Monex 200mL + Activator 15mL']);
    await page.close();
  }

  console.log('\nA chemical changed on the SCHEDULE');
  {
    const { page } = await boot(browser);
    await planAndSync(page, 'B1', 'Antracol');
    await planAndSync(page, 'B1', 'Becker');
    const r = await rows(page);
    check('the row follows the schedule…', r, ['Round 1: Becker 50gm']);
    checkFalse('…and the old chemical is not left beside it',
               r.some((x) => /Antracol/.test(x)));
    await page.close();
  }

  console.log('\nWhat was filled in survives the schedule changing');
  {
    const { page } = await boot(browser);
    await planAndSync(page, 'B1', 'Antracol');
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('#rec-body tr')]
        .find((tr) => tr.children.length > 3 && /Antracol/.test(tr.textContent));
      row.querySelector('.btn:not(.btn-danger):not(.btn-check)').click();
      document.getElementById('rf-batch').value = '268';
      document.getElementById('rf-qty').value = '4755';
      saveRec();
    });
    await page.waitForTimeout(120);
    await planAndSync(page, 'B1', 'Becker');
    const cells = await page.evaluate(() => {
      const r = [...document.querySelectorAll('#rec-body tr')]
        .find((tr) => tr.children.length > 3 && /Becker/.test(tr.textContent));
      return r ? [...r.children].slice(3, 6).map((td) => td.textContent.replace(/\s+/g, ' ').trim()) : null;
    });
    check('the batch and the quantity are still on the row', cells, ['B1', '268', '4,755']);
    await page.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
