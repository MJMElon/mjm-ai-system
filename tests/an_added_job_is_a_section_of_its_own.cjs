/* A job the office adds is decided in the Add job window, and it is a
   SECTION OF ITS OWN under the sheet it was put under.

   The office: "全部东西要在pop out里面决定", and for Seedlings Incentive:
   under Transplanting, a separate section, one row per nursery whose
   quantity is every plot of that month on the Transplanting sheet added up,
   seen by the office only.

   Run with a static server on 8777 serving the repository root. */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

async function boot(browser, db, where) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => {
    if (d.type() === 'confirm') { d.accept(); return; }
    if (d.type() === 'prompt') errs.push('PROMPT: ' + d.message());
    else errs.push('ALERT: ' + d.message());
    d.dismiss();
  });
  await page.addInitScript((seed) => {
    window.__DB = seed;
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    try { localStorage.setItem('mjm_maint_nursery', 'BNN'); localStorage.setItem('mjm_lang', 'en'); } catch (_) {}
    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select' };
      const tbl = () => (window.__DB[table] || (window.__DB[table] = []));
      const match = (r) => st.eqs.every(([c, v]) => String(r[c]) === String(v));
      const run = () => {
        if ((window.__DB.__MISSING || []).includes(table))
          return { data: null, error: { message: 'relation "' + table + '" does not exist' } };
        /* A COLUMN THE DATABASE HAS NOT GOT refuses the whole select, the
           way PostgREST does — which is the fail-open this card leans on. */
        const gone = (window.__DB.__NOCOL || {})[table] || [];
        if (gone.some(c => (st.cols || '').indexOf(c) >= 0))
          return { data: null, error: { message: 'column ' + table + '.' + gone[0]
                     + ' does not exist' } };
        if (st.op === 'delete') {
          window.__DB[table] = tbl().filter(r => !match(r));
          return { data: [], error: null };
        }
        const o = tbl().filter(match);
        return st.single ? { data: o[0] || null, error: null } : { data: o, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'select') return (cols) => { st.cols = String(cols || ''); return q; };
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'delete') return () => { st.op = 'delete'; return q; };
        /* The write LANDS, keyed on what onConflict names, so a read-back
           sees what the screen sent. A stub that recorded an upsert and
           kept nothing would pass a Save that saves nothing. */
        if (p === 'upsert') return (rows, opts) => {
          const list = Array.isArray(rows) ? rows : [rows];
          const on = (opts && opts.onConflict) || 'id';
          (window.__WRITES = window.__WRITES || []).push([table, on, list]);
          const gone = (window.__DB.__NOCOL || {})[table] || [];
          const bad = gone.find(c => list.some(r => Object.hasOwn(r, c)));
          if (bad) return Promise.resolve({ data: null,
            error: { message: 'column "' + bad + '" of relation "' + table + '" does not exist' } });
          const t = tbl();
          list.forEach(row => {
            const i = t.findIndex(r => String(r[on]) === String(row[on]));
            if (i >= 0) t[i] = Object.assign({}, t[i], row); else t.push(Object.assign({}, row));
          });
          return Promise.resolve({ data: list, error: null });
        };
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
  }, db);
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
  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html', { waitUntil: 'load' });
  /* The scopes arrive with loadSettingLists, inside the boot's own
     Promise.all — so waiting on the page's own ready flag is waiting for
     them. Without it every circle check would read the markup. */
  await page.waitForFunction(() => window._dbReady === true
    || (typeof _dbReady !== 'undefined' && _dbReady), { timeout: 25000 }).catch(() => {});
  await page.evaluate(() => { try { isNopsAdmin = true; } catch (_) {} });
  if (where === 'setting') {
    await page.evaluate(() => { try { switchTab('setting', null); } catch (_) {} });
  } else {
    await page.evaluate(() => { try { switchTab('payroll', null); } catch (_) {} });
  }
  return { page, errs };
}

const ev = async (page, fn, arg) => page.evaluate(fn, arg).catch(e => 'THREW: ' + e.message.split('\n')[0]);
const JOB = { key: 'cj_si1', label: 'Seedlings Incentive', desc: 'Transfer seedling to big polybag',
  sidebar: false, under: 'transplanting', attach: 'separate', rows: 'tp_nursery', cols: {}, split: 'equal' };
const TP = [
  { id: 1, schedule_month: 'Nov 2026', nursery_name: 'BNN', plot_name: 'B1', work_type: 'lining', source_qty: 2000, workers: [], work_date: '2026-11-03' },
  { id: 2, schedule_month: 'Nov 2026', nursery_name: 'BNN', plot_name: 'B1', work_type: 'spray', source_qty: 2000, workers: [], work_date: '2026-11-04' },
  { id: 3, schedule_month: 'Nov 2026', nursery_name: 'BNN', plot_name: 'B2', work_type: 'lining', source_qty: 450, workers: [], work_date: '2026-11-05' },
];
async function open(browser, db) {
  const b = await boot(browser, db, 'payroll');
  await b.page.evaluate(() => {
    document.getElementById('global-month').value = '2026-11';
    _localWorkers.BNN = ['Andi', 'Ayub']; workers.BNN = ['Andi', 'Ayub'];
    if (!NURSERY_PLOTS.BNN.includes('B1')) NURSERY_PLOTS.BNN.push('B1');
    if (!NURSERY_PLOTS.BNN.includes('B2')) NURSERY_PLOTS.BNN.push('B2');
    switchPayrollView('transplanting');
  }).catch(() => {});
  await b.page.waitForTimeout(800);
  return b;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('— 1. the Add job window decides everything');
  {
    const { page, errs } = await boot(browser, {}, 'setting');
    await ev(page, () => { jsEdit(); jsOpenAddJob(); });
    check('it asks name, description, where, side bar, attach, rows, columns and the split',
      await ev(page, () => ['jb-name', 'jb-desc', 'jb-scope', 'jb-under', 'jb-col-date', 'jb-col-plot', 'jb-col-batch', 'jb-col-remark']
        .map(id => !!document.getElementById(id)).concat(['jb-sb', 'jb-att', 'jb-rows', 'jb-split']
        .map(n => document.querySelectorAll(`input[name="${n}"]`).length))),
      [true, true, true, true, true, true, true, true, 2, 2, 3, 2]);
    check('together in the same table is shown and cannot be picked yet',
      await ev(page, () => document.querySelector('input[name="jb-att"][value="together"]').disabled), true);
    check('one row per nursery takes the date, plot and batch columns away',
      await ev(page, () => ['date', 'plot', 'batch'].map(k => document.getElementById('jb-col-' + k).disabled)), [true, true, true]);
    await ev(page, () => {
      document.getElementById('jb-name').value = 'Seedlings Incentive';
      document.getElementById('jb-desc').value = 'Transfer seedling to big polybag';
      document.querySelector('input[name="jb-sb"][value="under"]').checked = true; jsAddJobSide();
      document.getElementById('jb-under').value = 'transplanting';
      document.querySelector('input[name="jb-split"][value="each"]').checked = true;
      jsAddJob();
    });
    check('the job carries every answer',
      await ev(page, () => { const j = jobCustomDraft[0]; return j && [j.label, j.desc, j.sidebar, j.under, j.attach, j.rows, j.split]; }),
      ['Seedlings Incentive', 'Transfer seedling to big polybag', false, 'transplanting', 'separate', 'tp_nursery', 'each']);
    check('no page errors', errs, []);
    await page.close();
  }

  console.log('— 2. under Transplanting, a section of its own');
  const db = () => ({ nops_maint_config: [{ key: 'custom_jobs', txt_value: JSON.stringify([JOB]) }],
                      nops_transplant_field_records: TP.map(r => Object.assign({}, r)), nops_custom_job_rows: [] });
  {
    const { page, errs } = await open(browser, db());
    const sec = await ev(page, () => {
      const b = document.querySelector('#cj-sections .cj-block');
      if (!b) return 'no section';
      const th = b.querySelector('th.cj-th');
      return { head: [th.firstChild.textContent.trim(), (th.querySelector('.cj-desc') || {}).textContent],
               inSheet: !!document.querySelector('#payroll-table .cj-th'),
               row: [...b.querySelectorAll('tbody tr')].map(tr => [...tr.children].slice(0, 2).map(td => td.firstChild.textContent.trim())) };
    });
    check('the section is under the sheet, not in its table, named with its description', sec && sec.head,
      ['Seedlings Incentive', 'Transfer seedling to big polybag']);
    check('…and is not part of the Transplanting table', sec && sec.inSheet, false);
    check('one row for the nursery: every plot on the Transplanting sheet added up, each plot once', sec && sec.row,
      [['Batu Niah Nursery', '2,450']]);
    check('no page errors', errs, []);
    await page.close();
  }

  console.log('— 3. a tick shares equally, and Check writes down the figure');
  {
    const d = db(); d.nops_maint_config[0].txt_value = JSON.stringify([Object.assign({}, JOB, { split: 'equal' })]);
    const { page, errs } = await open(browser, d);
    await ev(page, () => { setCustomJobWorker('cj_si1', 'nursery', 'Andi', 1); });
    await page.waitForTimeout(300);
    await ev(page, () => { setCustomJobWorker('cj_si1', 'nursery', 'Ayub', 1); });
    await page.waitForTimeout(300);
    check('two ticked share it equally',
      await ev(page, () => [...document.querySelectorAll('#cj-sections tbody tr td.cj-cell .cj-sub')].map(x => x.textContent.trim())),
      ['1,225', '1,225']);
    await ev(page, () => toggleCustomJobCheck('cj_si1', 'nursery'));
    await page.waitForTimeout(300);
    const w = await ev(page, () => (window.__WRITES || []).filter(x => x[0] === 'nops_custom_job_rows').pop());
    check('Check writes the row: keyed on job, month, nursery and row, with the figure read and the ticks',
      w && [w[1], w[2][0].job_key, w[2][0].month, w[2][0].nursery, w[2][0].row_key, w[2][0].qty, w[2][0].workers, !!w[2][0].checked_at],
      ['job_key,month,nursery,row_key', 'cj_si1', 'Nov 2026', 'BNN', 'nursery', 2450, { Andi: 1, Ayub: 1 }, true]);
    if (process.env.SHOT) { await ev(page, () => document.getElementById('cj-sections').scrollIntoView()); await page.screenshot({ path: process.env.SHOT }); }
    check('a checked row shuts its ticks',
      await ev(page, () => [...document.querySelectorAll('#cj-sections td.cj-cell input')].every(i => i.disabled)), true);
    check('no page errors', errs, []);
    await page.close();
  }

  console.log('— 4. its own side bar entry is a page of its own');
  {
    const d = db(); d.nops_maint_config[0].txt_value = JSON.stringify([Object.assign({}, JOB, { sidebar: true, under: null, rows: 'manual', cols: { plot: true }, split: 'each' })]);
    const { page, errs } = await open(browser, d);
    check('the side bar carries an entry for it',
      await ev(page, () => !!document.getElementById('pn-subtab-cj_si1')), true);
    check('and none under Transplanting',
      await ev(page, () => document.querySelectorAll('#cj-sections .cj-block').length), 0);
    await ev(page, () => switchPayrollView('cj_si1'));
    await page.waitForTimeout(300);
    check('pressing it draws the job in the sheet, with + Add row for a hand-keyed job',
      await ev(page, () => [!!document.querySelector('#payroll-table .cj-th'), !!document.querySelector('#payroll-extra .cj-add')]), [true, true]);
    await ev(page, () => addCustomJobRow('cj_si1'));
    await page.waitForTimeout(300);
    check('+ Add row adds a row with a plot box and a figure box per worker',
      await ev(page, () => { const tr = document.querySelector('#payroll-table tbody tr[data-cj-row]'); return tr ? tr.querySelectorAll('input.cj-in').length : 0; }), 4);
    check('no page errors', errs, []);
    await page.close();
  }

  console.log('— 5. before the SQL is run');
  {
    const d = db(); d.__MISSING = ['nops_custom_job_rows'];
    const { page, errs } = await open(browser, d);
    check('the section still draws, says which file to run, and every box is shut',
      await ev(page, () => [!!document.querySelector('#cj-sections .cj-block'),
        /RUN_ME_custom_jobs\.sql/.test(document.getElementById('cj-sections').textContent),
        [...document.querySelectorAll('#cj-sections input')].every(i => i.disabled)]), [true, true, true]);
    check('no page errors', errs, []);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
