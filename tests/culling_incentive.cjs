/* The culling incentive: gone through and Checked on Work Maintenance,
   paid on the payroll Transplanting sheet.

   A plot that went from Saringan Anak Bibit to the end of Transplanting in
   15 days or fewer pays: RM 20 a plot to Rousell Wayne and to Florence,
   whatever the nursery, and RM 50 a plot to that nursery's own Field
   Conductor — Lalu Aenal BNN, Akbar UNN 1, Azhar UNN 2. The plots asked
   about are the ones the LEDGER transplanted in the month; the time comes
   from PALMS, the plot's LATEST run.

   The office moved it: Worker Activity -> Culling Incentive shows the plot,
   the days, the dates and who earns it, and carries the Check; the payroll
   pays the CHECKED plots and nothing else. This drives BOTH real pages with
   a ledger and a PALMS log built to hit every way a plot can come out:
   Work Maintenance first (what it shows, the Check, by hand), then the
   payroll fed with exactly what those writes left in the database.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/culling_incentive.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const YM = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const PREV = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`;
const D = (d) => `${YM}-${pad(d)}`;
const LAST_YEAR = `${now.getFullYear() - 1}`;

const tp = (plot, date, o) => Object.assign({ plot_name: plot, batch_name: '270', remark: '',
  transaction_type: 'Transplanted', transaction_date: date, created_at: date + 'T08:00:00Z' }, o || {});
let uid = 0;
const log = (plot, act, s, e) => ({ client_uid: 'c' + (++uid), plot_name: plot, act_n: act,
  start_date: s, end_date: e, ideal_days: null, recorded_by: 'fc', seq_no: uid });

const LEDGER = [
  tp('B1', D(14)),                                   // 13 days — qualifies
  tp('B2', D(20)),                                   // 19 days — too slow
  tp('B3', D(16)),                                   // split, 2..16 = 14 — qualifies
  tp('B4', D(5)),                                    // Transplanting still open
  tp('B5', D(6)),                                    // nothing in PALMS
  tp('B6', D(21)),                                   // fast LAST year, slow now — slow
  tp('B7', null, { remark: `CullDate: x Date: ${D(11)}`, created_at: `${PREV}-02T00:00:00Z` }), // dated by remark
  tp('B8', D(9), { transaction_type: 'Transplanted_Premium' }),  // a tray, not a plot
  tp('U9', `${PREV}-20`),                            // last month — not this one
  tp('N7', D(8)),                                    // UNN 2, 7 days — qualifies
  tp('B3-R', D(16))                                  // a -R plot — never on the incentive
];
const PALMS = [
  log('B1', 1, D(1), D(3)), log('B1', 9, D(12), D(14)),
  log('B2', 1, D(1), D(2)), log('B2', 9, D(18), D(20)),
  log('B3#A', 1, D(2), D(3)), log('B3#A', 9, D(8), D(10)),
  log('B3#B', 1, D(4), D(5)), log('B3#B', 9, D(14), D(16)),
  log('B4', 1, D(1), D(2)), log('B4', 9, D(4), null),
  log('B6', 1, `${LAST_YEAR}-01-01`, `${LAST_YEAR}-01-02`), log('B6', 9, `${LAST_YEAR}-01-08`, `${LAST_YEAR}-01-10`),
  log('B6', 11, `${LAST_YEAR}-06-01`, `${LAST_YEAR}-07-01`),
  log('B6', 1, D(1), D(2)), log('B6', 9, D(19), D(21)),
  log('B7', 1, D(1), D(2)), log('B7', 9, D(9), D(11)),
  log('N7', 1, D(1), D(2)), log('N7', 9, D(6), D(8)),
  log('B3-R', 1, D(5), D(6)), log('B3-R', 9, D(14), D(16)),
  log('U9', 1, `${PREV}-10`, `${PREV}-11`), log('U9', 9, `${PREV}-18`, `${PREV}-20`)
];
const REGISTER = [
  { id: 1, full_name: 'Rousell Wayne',       section: 'BNN',  active: true },
  { id: 2, full_name: 'Florence Anak Jugah', section: '',     active: true },
  { id: 3, full_name: 'Lalu Aenal Mashuri',  section: 'BNN',  active: true },
  { id: 4, full_name: 'Akbar Cahaya',        section: 'UNN1', active: true },
  { id: 5, full_name: 'Muhamad Azhar',       section: 'UNN2', active: true }
];

async function boot(browser, db, where) {
  where = where || 'payroll';
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
    try { localStorage.setItem('mjm_maint_nursery', 'BNN'); localStorage.removeItem('mjm_maint_month'); } catch (_) {}
    window.__PDFS = [];
    const fin = (v) => typeof v === 'number' && isFinite(v);
    function guard(method, args) {
      args.forEach((a, i) => {
        if (!fin(a)) throw new Error('Invalid arguments passed to jsPDF.' + method
                                   + ' (argument ' + (i + 1) + ' is ' + String(a) + ')');
      });
    }
    window.jspdf = { jsPDF: class {
      constructor() { this.page = 1; this.lines = []; this.saved = null; window.__PDFS.push(this); }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {}
      setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect(x, y, w, h) { guard('rect', [x, y, w, h]); }
      roundedRect(x, y, w, h, rx, ry) { guard('roundedRect', [x, y, w, h, rx, ry]); }
      line(a, b, c, d) { guard('line', [a, b, c, d]); }
      addPage() { this.page++; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.5; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { guard('text', [x, y]); this.lines.push(String(t)); }
      addImage(im, fmt, x, y, w, h) { guard('addImage', [x, y, w, h]); }
      save(name) { this.saved = name; }
    } };
    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select' };
      const tbl = () => (window.__DB[table] || (window.__DB[table] = []));
      const match = (r) => st.eqs.every(([c, v]) => String(r[c]) === String(v));
      const rows = () => tbl().filter(match);
      /* Writes land, the way the database would take them: an upsert on
         (month, plot) replaces, a delete removes what its eq names. A stub
         that took a write and kept nothing would pass a button that saves
         nothing. */
      const run = () => {
        // A table the database has not got yet answers as PostgREST does.
        if ((window.__DB.__MISSING || []).includes(table))
          return { data: null, error: { message: 'relation "' + table + '" does not exist' } };
        if (st.op === 'delete') {
          window.__DB[table] = tbl().filter(r => !match(r));
          (window.__WRITES = window.__WRITES || []).push(['delete', table, st.eqs.slice()]);
          return { data: [], error: null };
        }
        const o = rows(); return st.single ? { data: o[0] || null, error: null } : { data: o, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'delete') return () => { st.op = 'delete'; return q; };
        if (p === 'upsert') return (row) => {
          (window.__WRITES = window.__WRITES || []).push(['upsert', table, row]);
          const t = tbl();
          const i = t.findIndex(r => r.month === row.month && r.plot === row.plot);
          const id = i >= 0 ? t[i].id : (window.__ID = (window.__ID || 100) + 1);
          const rec = Object.assign({}, row, { id });
          if (i >= 0) t[i] = rec; else t.push(rec);
          return Promise.resolve({ data: [rec], error: null });
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
  if (where === 'maint') {
    await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html?view=cull_incentive', { waitUntil: 'load' });
    await page.waitForFunction(() => /Culling Incentive/.test((document.getElementById('payroll-table') || {}).textContent || '')
      && document.getElementById('tab-payroll').classList.contains('active'), { timeout: 20000 });
    return { page, errs };
  }
  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderCullIncentive === 'function', { timeout: 20000 });
  await page.click('[data-sub="transpl"]');
  await page.waitForFunction(() => {
    const t = document.getElementById('cull-inc-pay');
    return t && (t.textContent || '').trim().length > 0;
  }, { timeout: 15000 });
  return { page, errs };
}

const tableText = (page) => page.evaluate(() =>
  (document.getElementById('payroll-table').textContent || '').replace(/\s+/g, ' ').trim());
const rowsOf = (page) => page.evaluate(() =>
  cullIncentiveRows(getNursery(), document.getElementById('global-month').value)
    .map(r => [r.plot, r.counts, r.days == null ? null : r.days, !!r.check]));
const payOf = (page, sec) => page.evaluate((s) =>
  cullIncentivePay(cullIncentivePlots(s), s).map(p => [p.known ? p.known.full_name : p.name, p.amount]), sec);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const db = { mjmnpayroll_workers: REGISTER, shared_inventory_logs: LEDGER,
               fcportal_palms_plot_logs: PALMS };

  console.log('— Work Maintenance: Worker Activity -> Culling Incentive');
  const m = await boot(browser, db, 'maint');
  const mp = m.page;
  check('the payroll link lands on the tab, BNN picked',
    await mp.evaluate(() => [document.getElementById('pn-subtab-cull_incentive').classList.contains('active'), getNursery()]),
    [true, 'BNN']);
  check('BNN: every plot transplanted this month, timed off its latest run, nothing checked yet',
    await rowsOf(mp),
    [['B1', true, 13, false], ['B2', false, 19, false], ['B3', true, 14, false], ['B4', false, null, false],
     ['B5', false, null, false], ['B6', false, 20, false], ['B7', true, 10, false]]);
  let txt = await tableText(mp);
  check('it shows plot, dates, duration and who gets it — and no money',
    [/Saringan started/.test(txt), /Transplanting ended/.test(txt), /Duration/.test(txt),
     /B1.*Rousell Wayne, Florence, Lalu Aenal/.test(txt), /RM/.test(txt)], [true, true, true, true, false]);
  check('the plots that do not earn it are listed under, saying why',
    [/NOT earning it/.test(txt), /B2.*Over 15 days/.test(txt), /B4.*Transplanting not closed/.test(txt),
     /B5.*No Saringan in PALMS/.test(txt)], [true, true, true, true]);
  check('no -R plot, and no tray', [/B3-R/.test(txt), /B8/.test(txt)], [false, false]);
  check('0 of 3 checked, and it says so', /0 of 3 plots checked/.test(txt) && /3 not checked yet — not paid/.test(txt), true);

  await mp.evaluate(() => pickNursery('UNN2'));
  await mp.waitForFunction(() => /N7/.test(document.getElementById('payroll-table').textContent));
  txt = await tableText(mp);
  check('UNN 2 is its own list, and its own Field Conductor', /N7.*Rousell Wayne, Florence, Azhar/.test(txt), true);
  await mp.evaluate(() => pickNursery('PN'));
  check('PN says the incentive is not paid there', /paid on BNN, UNN 1 and UNN 2/.test(await tableText(mp)), true);
  await mp.evaluate(() => pickNursery('BNN'));

  console.log('— the Check');
  await mp.evaluate(() => toggleCullChecked('B1'));
  await mp.evaluate(() => toggleCullChecked('B3'));
  await mp.waitForFunction(() => (window.__DB.nops_cull_incentive_checks || []).filter(r => r.checked_at).length === 2);
  check('a Check writes what the row read: dates, days, nursery, who',
    await mp.evaluate(() => window.__DB.nops_cull_incentive_checks.map(r =>
      [r.plot, r.section, r.saringan_date, r.transplant_date, r.days, !!r.checked_at, r.checked_by])),
    [['B1', 'BNN', D(1), D(14), 13, true, 'Elon Ting'],
     ['B3', 'BNN', D(2), D(16), 14, true, 'Elon Ting']]);
  txt = await tableText(mp);
  check('2 of 3 checked, B7 still held', /2 of 3 plots checked/.test(txt) && /1 not checked yet/.test(txt), true);

  console.log('— by hand: Remove, and nothing else');
  check('no Count it and no Add plot anywhere — only Check and Remove',
    await mp.evaluate(() => {
      const txt = document.getElementById('tab-payroll').textContent;
      return [/Count it/.test(txt), /Add plot/.test(txt), typeof window.openCullHand];
    }), [false, false, 'undefined']);
  check('a plot that does not earn it offers no button at all',
    await mp.evaluate(() => [...document.querySelectorAll('#payroll-table tr')]
      .filter(tr => /Over 15 days|not closed|No Saringan/.test(tr.textContent))
      .map(tr => tr.querySelectorAll('button').length)), [0, 0, 0, 0]);
  await mp.evaluate(() => openCullRemove('B1'));
  await mp.fill('#ch-remark', 'should not go');
  await mp.click('#ch-save');
  check('a Checked plot cannot be removed until it is unchecked', m.errs.some(e => /B1 is Checked\. Uncheck it first/.test(e)), true);
  await mp.evaluate(() => { document.getElementById('cull-hand').style.display = 'none'; });
  await mp.evaluate(() => openCullRemove('B7'));
  await mp.click('#ch-save');
  check('a Remove with no reason is refused', m.errs.some(e => /Say why/.test(e)), true);
  await mp.fill('#ch-remark', 'Re-culled, does not count');
  await mp.click('#ch-save');
  await mp.waitForFunction(() => document.getElementById('cull-hand').style.display === 'none');
  await mp.waitForFunction(() => /Taken out by hand/.test(document.getElementById('payroll-table').textContent));
  txt = await tableText(mp);
  check('B7 is listed under NOT earning it, saying who took it out and why, with Put back',
    [(await rowsOf(mp)).find(r => r[0] === 'B7'), /NOT earning it.*B7Taken out by hand: Re-culled, does not count.*Put back/.test(txt)],
    [['B7', false, 10, false], true]);
  await mp.evaluate(() => toggleCullChecked('B3'));   // and uncheck one
  await mp.waitForFunction(() => window.__DB.nops_cull_incentive_checks.some(r => r.plot === 'B3' && !r.checked_at));
  check('Uncheck clears the tick and what it had written down',
    await mp.evaluate(() => window.__DB.nops_cull_incentive_checks.find(r => r.plot === 'B3')),
    await mp.evaluate(() => Object.assign({}, window.__DB.nops_cull_incentive_checks.find(r => r.plot === 'B3'),
      { saringan_date: null, transplant_date: null, days: null, checked_at: null, checked_by: null })));
  check('nothing written to the incentive but the Checks and the by-hand record',
    await mp.evaluate(() => [...new Set(window.__WRITES.map(w => w[1]).filter(t => /cull/.test(t)))].sort()),
    ['mjmnpayroll_cull_incentive_overrides', 'nops_cull_incentive_checks']);
  check('no prompt, no page error', m.errs.filter(e => /^PROMPT|^(?!ALERT)/.test(e)), []);
  if (process.env.SHOT) await mp.locator('#tab-payroll').screenshot({ path: process.env.SHOT });

  // What Work Maintenance left in the database is what the payroll reads.
  const left = await mp.evaluate(() => ({
    checks: JSON.parse(JSON.stringify(window.__DB.nops_cull_incentive_checks)),
    overrides: JSON.parse(JSON.stringify(window.__DB.mjmnpayroll_cull_incentive_overrides)) }));
  await mp.close();

  console.log('— the payroll pays the Checked plots and nothing else');
  // N7 checked too, so a second nursery is paid; B7 left unchecked on purpose.
  left.checks.push({ id: 900, month: YM, plot: 'N7', section: 'UNN2', saringan_date: D(1),
    transplant_date: D(8), days: 7, checked_at: `${YM}-20T01:00:00Z`, checked_by: 'elon.mjm@gmail.com' });
  const { page, errs } = await boot(browser, Object.assign({}, db,
    { nops_cull_incentive_checks: left.checks, mjmnpayroll_cull_incentive_overrides: left.overrides }));
  check('paid: B1 alone in BNN (B3 unchecked, B7 removed)',
    await page.evaluate(() => cullIncentivePlots('BNN').map(r => [r.plot, r.days == null ? null : r.days])),
    [['B1', 13]]);
  check('BNN: RM 20 a plot each to Rousell and Florence, RM 50 a plot to Lalu Aenal only',
    await payOf(page, 'BNN'),
    [['Rousell Wayne', 20], ['Florence Anak Jugah', 20], ['Lalu Aenal Mashuri', 50]]);
  check('All nurseries: Akbar gets nothing, Azhar his one checked plot', await payOf(page, ''),
    [['Rousell Wayne', 40], ['Florence Anak Jugah', 40], ['Lalu Aenal Mashuri', 50],
     ['Akbar Cahaya', 0], ['Muhamad Azhar', 50]]);
  const screen = await page.evaluate(() => {
    const t = (id) => (document.getElementById(id).textContent || '').replace(/\s+/g, ' ').trim();
    return { plots: t('cull-inc-plots'), pay: t('cull-inc-pay'),
             note: document.getElementById('cull-inc-note').innerHTML,
             link: (document.getElementById('cull-inc-link') || {}).getAttribute ? document.getElementById('cull-inc-link').getAttribute('href') : null,
             add: !!document.getElementById('cull-inc-add'), modal: !!document.getElementById('cull-add-modal') };
  });
  check('the screen lists the checked plots with who checked them',
    [/B1.*Elon Ting/.test(screen.plots), /B3|B7/.test(screen.plots)], [true, false]);
  check('the screen total is the BNN incentive, RM 90.00', /TOTAL INCENTIVE.*90\.00/.test(screen.pay), true);
  check('the plots waiting to be checked are named, with the way there',
    [/B3 qualifies and has not been Checked yet/.test(screen.note),
     /nursery_ops_maintenance\.html\?view=cull_incentive/.test(screen.note)], [true, true]);
  check('the sheet links to Worker Activity, and adds nothing by hand itself',
    [screen.link, screen.add, screen.modal],
    ['../nursery_ops/nursery_ops_maintenance.html?view=cull_incentive', false, false]);

  console.log('— the Monthly Payroll');
  const monthly = await page.evaluate(() => {
    document.getElementById('monthly-section').value = '';
    return monthlyRows().filter(r => r.transpl).map(r => [r.name, r.transpl]);
  });
  check('each person is paid across every nursery, under Transplanting', monthly.sort(),
    [['Florence Anak Jugah', 40], ['Lalu Aenal Mashuri', 50], ['Muhamad Azhar', 50], ['Rousell Wayne', 40]]);

  console.log('— the claim PDF');
  await page.evaluate(() => { document.getElementById('transpl-section').value = 'BNN'; return downloadTransplantPDF(); });
  await page.waitForFunction(() => window.__PDFS.length && window.__PDFS[0].saved, { timeout: 10000 }).catch(() => {});
  const pdf = await page.evaluate(() => (window.__PDFS[0] || { lines: [] }).lines.join(' | '));
  check('the form carries both tables, checked plots only',
    [/CULLING INCENTIVE — SARINGAN/.test(pdf), /WHO IT PAYS/.test(pdf), /CHECKED Elon Ting/.test(pdf), / B7 /.test(pdf)],
    [true, true, true, false]);
  check('no page errors', errs.filter(e => !/^ALERT: Nothing recorded/.test(e)), []);
  check('the payroll writes nothing', await page.evaluate(() => (window.__WRITES || []).length), 0);
  await page.close();

  console.log('— the faults that must be said');
  const r2 = await boot(browser, { mjmnpayroll_workers: REGISTER.concat([{ id: 6, full_name: 'Florence Lee', section: 'BNN', active: true }]).filter(w => w.id !== 1),
                                   shared_inventory_logs: LEDGER, fcportal_palms_plot_logs: PALMS,
                                   __MISSING: ['nops_cull_incentive_checks'] });
  const note2 = await r2.page.evaluate(() => document.getElementById('cull-inc-note').textContent);
  check('without the Checked table, nobody is paid and the page says which file to run',
    [/RUN_ME_cull_incentive_checked\.sql/.test(note2), (await payOf(r2.page, 'BNN')).every(p => p[1] === 0)], [true, true]);
  check('a missing name and a name on two people are both named',
    [/Rousell Wayne is not on the worker register/.test(note2), /Florence matches more than one worker/.test(note2)], [true, true]);
  await r2.page.close();
  const m2 = await boot(browser, Object.assign({}, db, { __MISSING: ['nops_cull_incentive_checks'] }), 'maint');
  check('Work Maintenance says the same, and offers no Check',
    [/RUN_ME_cull_incentive_checked\.sql/.test(await m2.page.evaluate(() => document.getElementById('payroll-offreg').textContent)),
     await m2.page.evaluate(() => document.querySelectorAll('#payroll-table .btn-check').length)], [true, 0]);
  await m2.page.close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
