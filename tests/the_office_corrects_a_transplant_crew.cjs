/* Worker Record -> Transplanting: every worker is a TICK with the figure
   under it, and EDIT beside Check corrects the crew and the figures. The
   office: "每一个员工是用打勾的形式 打勾的下面才是数量 所以如果FC tick错人/
   填错号码 我们都可以改 所以后面的check还要加一个edit选项".

   Run with a static server on 8777 serving the repository root:
     node tests/the_office_corrects_a_transplant_crew.cjs                   */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/* A guarded evaluate: on the previous code these functions do not exist, and
   an unguarded page.evaluate throws out of the whole file — every check
   under it never asked, which proves nothing about what it used to do. */
const ev = async (page, fn, arg) => {
  try { return await page.evaluate(fn, arg); }
  catch (e) { return 'threw: ' + String(e.message || e).split('\n')[0]; }
};

const MONTH = (() => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
})();
const MLABEL = (() => {
  const n = new Date();
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][n.getMonth()]
       + ' ' + n.getFullYear();
})();

const REGISTER = [
  { id: 1, full_name: 'Muhamad Azhar', section: 'UNN2', role: 'General Worker', active: true },
  { id: 2, full_name: 'Awaludin',      section: 'UNN2', role: 'General Worker', active: true },
  { id: 3, full_name: 'Sapri',         section: 'UNN2', role: 'General Worker', active: true },
];

async function boot(browser, db, opts) {
  opts = opts || {};
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [], dialogs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => {
    dialogs.push(d.type() + ': ' + d.message());
    if (d.type() === 'prompt') { d.dismiss(); return; }
    /* Confirm is ACCEPTED, because the whole point is to get through to the
       write; an alert is dismissed and recorded, which is how a refusal is
       told from a save. */
    if (d.type() === 'confirm') d.accept(); else d.dismiss();
  });
  await page.addInitScript((seed) => {
    window.__DB = seed.db;
    window.__PERMS = seed.perms;
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    try { localStorage.setItem('mjm_maint_nursery', 'UNN2'); localStorage.setItem('mjm_lang', 'en'); } catch (_) {}
    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select' };
      const tbl = () => (window.__DB[table] || (window.__DB[table] = []));
      const match = (r) => st.eqs.every(([c, v]) => String(r[c]) === String(v));
      const run = () => {
        if ((window.__DB.__MISSING || []).includes(table))
          return { data: null, error: { message: 'relation "' + table + '" does not exist' } };
        if (st.op === 'delete') {
          const before = tbl().length;
          window.__DB[table] = tbl().filter(r => !match(r));
          (window.__WRITES = window.__WRITES || []).push(['delete', table, st.eqs.slice()]);
          return { data: [], error: null, count: before - window.__DB[table].length };
        }
        const o = tbl().filter(match);
        return st.single ? { data: o[0] || null, error: null } : { data: o, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'select') return () => q;
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'delete') return () => { st.op = 'delete'; return q; };
        /* An UPDATE that LANDS once its eq() has named the row: a stub that
           recorded it and left the row as it was would redraw the old crew and
           every check about the saved crew would pass over nothing. */
        if (p === 'update') return (patch) => {
          st.op = 'update';
          const uq = new Proxy({}, { get(_, k) {
            if (k === 'eq') return (c, v) => { st.eqs.push([c, v]); return uq; };
            if (k === 'then') return (a, b) => {
              (window.__WRITES = window.__WRITES || []).push(['update', table, patch, st.eqs.slice()]);
              tbl().filter(match).forEach(r => Object.assign(r, patch));
              return Promise.resolve({ data: null, error: null }).then(a, b);
            };
            return () => uq;
          } });
          return uq;
        };
        /* The write LANDS, keyed on what onConflict names — a stub that
           recorded an upsert and kept nothing would pass a Verify that
           verifies nothing, and every check about the sheet then shutting
           would be asking about a row that was never there. */
        if (p === 'upsert') return (rows, o) => {
          const list = Array.isArray(rows) ? rows : [rows];
          const on = ((o && o.onConflict) || 'id').split(',').map(s => s.trim());
          (window.__WRITES = window.__WRITES || []).push(['upsert', table, list]);
          const t = tbl();
          list.forEach(row => {
            const i = t.findIndex(r => on.every(c => String(r[c]) === String(row[c])));
            /* The database stamps verified_at, not the browser — see the
               comment above setManualOverride. The stub does what the
               trigger does. */
            const withStamp = Object.assign({}, row);
            if (table === 'mjmnpayroll_verifications' && !withStamp.verified_at)
              withStamp.verified_at = new Date().toISOString();
            if (i >= 0) t[i] = Object.assign({}, t[i], withStamp); else t.push(withStamp);
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
    /* NO saved row for this page is nobody having been asked, so the module
       level decides — which is what governed every one of these before the
       tick existed. Section 5 is the two saved-row cases. */
  }, { db, perms: opts.perms || { modules: { nursery_ops: 'admin' } } });
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => (window.__PERMS || {});
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
  await page.waitForFunction(() => typeof _dbReady !== 'undefined' && _dbReady, { timeout: 25000 })
    .catch(() => {});
  await ev(page, () => { try { isNopsAdmin = true; } catch (_) {} });
  await ev(page, () => { try { switchTab('payroll', null); } catch (_) {} });
  return { page, errs, dialogs };
}

const openJob = (page, key) => ev(page, (k) => { switchPayrollView(k); }, key);

/* ALWAYS THE SAME SHAPE. On the previous code there is no strip at all, and
   a reader that hands back a string makes the next check throw — which
   takes the harness down and leaves every check under it unasked, proving
   nothing about what the page used to do. */
const strip = (page) => ev(page, () => {
  const el = document.getElementById('vb-workrec');
  if (!el) return { cls: 'no #vb-workrec on the page', text: '', buttons: [] };
  return { cls: el.className,
           text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
           buttons: [...el.querySelectorAll('button')].map(b => b.textContent.trim()) };
});

const vers = (page) => ev(page, () =>
  (window.__DB.mjmnpayroll_verifications || [])
    .map(v => [v.month, v.sheet, v.scope, !!v.verified_at]));

/* Same rule for the strip reader's own callers: `ev` turns a throw into a
   named string, so a check that then indexes it has to cope. */
const classOf = (s) => (s && typeof s === 'object') ? s.cls : String(s);


const RECS = () => [
  /* Blanket Spray: the plot figure divided among the crew. */
  { id: 11, work_date: '2026-11-03', nursery_name: 'UNN2', plot_name: 'N12', batch_name: '271',
    work_type: 'blanket_spray', schedule_month: MLABEL, source_qty: 1200,
    workers: [{ name: 'Muhamad Azhar', qty: null }, { name: 'Awaludin', qty: null }],
    total_qty: null, checked_at: null, checked_by: null, not_done: false },
  /* Polybag filling: a figure keyed against each name. */
  { id: 12, work_date: '2026-11-03', nursery_name: 'UNN2', plot_name: 'N12', batch_name: '271',
    work_type: 'polybag_fill', schedule_month: MLABEL, source_qty: 1200,
    workers: [{ name: 'Muhamad Azhar', qty: 700 }, { name: 'Awaludin', qty: 500 }],
    total_qty: 1200, checked_at: null, checked_by: null, not_done: false },
  /* Checked: no Edit until somebody unchecks it. */
  { id: 13, work_date: '2026-11-04', nursery_name: 'UNN2', plot_name: 'N12', batch_name: '271',
    work_type: 'lining', schedule_month: MLABEL, source_qty: 1200,
    workers: [{ name: 'Sapri', qty: null }],
    total_qty: null, checked_at: '2026-11-05T02:00:00Z', checked_by: 'office@mjm', not_done: false },
];

const rowOf = (page, id) => ev(page, (id) => {
  const tr = [...document.querySelectorAll('#payroll-table tbody tr')]
    .find(t => (t.innerHTML || '').includes('(' + id + ')') ||
               (t.querySelector('.tp-save-btn') && _tpEdit && _tpEdit.id === id));
  if (!tr) return { none: true };
  return {
    ticks: [...tr.querySelectorAll('input.tp-tick')].map(b => ({ on: b.checked, dis: b.disabled })),
    shares: [...tr.querySelectorAll('.tp-share')].map(d => d.textContent.trim()),
    qtys: [...tr.querySelectorAll('input.tp-qty')].map(i => i.value),
    edit: !!tr.querySelector('.tp-edit-btn'),
    save: !!tr.querySelector('.tp-save-btn'),
  };
}, id);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const db = { mjmnpayroll_workers: REGISTER, nops_transplant_field_records: RECS(),
               shared_plots: [{ plot_name: 'N12', nursery: 'UNN 2' }] };
  const { page, errs, dialogs } = await boot(browser, db);
  await openJob(page, 'transplanting');
  await page.waitForTimeout(600);

  console.log('— 1. every worker is a tick, with the figure under it');
  let a = await rowOf(page, 11);
  check('the spray row has a tick per worker column', (a.ticks || []).length, 3);
  check('ticked as the FC recorded, and locked until Edit',
    (a.ticks || []).map(t => [t.on, t.dis]), [[true, true], [true, true], [false, true]]);
  check('the share sits under each tick', a.shares, ['600', '600']);
  check('an unchecked row offers Edit beside Check', a.edit, true);
  const c = await rowOf(page, 13);
  check('a CHECKED row offers no Edit', c.edit, false);

  console.log('— 2. Edit, tick the right person off and another on, Save');
  await ev(page, () => tpEditStart(11));
  a = await rowOf(page, 11);
  check('the ticks open up', (a.ticks || []).map(t => t.dis), [false, false, false]);
  check('Save takes the place of Check', a.save, true);
  await page.locator('#payroll-table td.tp-editing input[aria-label="Awaludin"]').uncheck();
  await page.locator('#payroll-table td.tp-editing input[aria-label="Sapri"]').check();
  a = await rowOf(page, 11);
  check('the share re-divides as the crew changes', a.shares, ['600', '600']);
  await ev(page, () => tpEditSave());
  await page.waitForTimeout(200);
  check('the saved crew is the one ticked',
    await ev(page, () => window.__DB.nops_transplant_field_records.find(r => r.id === 11).workers.map(w => w.name)),
    ['Muhamad Azhar', 'Sapri'].sort((a, b) => a.localeCompare(b)));
  const w1 = await ev(page, () => (window.__WRITES || []).filter(w => w[0] === 'update'));
  check('ONE write, and it carries only the crew', w1.map(w => Object.keys(w[2])), [['workers']]);
  a = await rowOf(page, 11);
  check('the row closes again', [a.save, (a.ticks || []).every(t => t.dis)], [false, true]);

  console.log('— 3. the split job: correct the figure under a tick');
  await ev(page, () => tpEditStart(12));
  a = await rowOf(page, 12);
  check('each ticked name carries a box with its figure', (a.qtys || []).slice().sort(), ['500', '700']);
  const awq = page.locator('#payroll-table td.tp-editing:has(input[aria-label="Awaludin"]) input.tp-qty');
  await awq.fill('450');
  await awq.dispatchEvent('change');
  await ev(page, () => tpEditSave());
  await page.waitForTimeout(200);
  check('the keyed figure and the total are saved',
    await ev(page, () => { const r = window.__DB.nops_transplant_field_records.find(r => r.id === 12);
      return [r.workers.map(w => w.name + ' ' + w.qty).sort(), r.total_qty]; }),
    [['Awaludin 450', 'Muhamad Azhar 700'], 1150]);

  console.log('— 4. refusals');
  await ev(page, () => tpEditStart(12));
  await ev(page, () => { Object.keys(_tpEdit.crew).forEach(k => delete _tpEdit.crew[k]); });
  const before = (await ev(page, () => (window.__WRITES || []).length));
  await ev(page, () => tpEditSave());
  check('a crew of nobody is refused, and nothing is written',
    [dialogs.some(d => /at least one worker/.test(d)), await ev(page, () => (window.__WRITES || []).length)],
    [true, before]);
  await ev(page, () => tpEditCancel());
  await ev(page, () => tpEditStart(13));
  check('a checked row cannot be opened', await ev(page, () => _tpEdit), null);

  /* SHOT=/path.png draws the sheet with one row open, a check being unable
     to read a layout. */
  if (process.env.SHOT) {
    await ev(page, () => tpEditStart(11));
    await page.locator('#payroll-table').screenshot({ path: process.env.SHOT });
  }
  check('no page errors', errs, []);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
