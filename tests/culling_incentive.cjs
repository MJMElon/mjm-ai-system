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
      constructor() { this.page = 1; this.lines = []; this.rects = []; this.texts = [];
                      this.saved = null; window.__PDFS.push(this); }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {}
      setFillColor() {} setDrawColor() {} setLineWidth() {}
      /* The GEOMETRY is recorded, not only the words: a merged cell is a
         cell of its own HEIGHT, and nothing in a list of strings can say
         whether the plot was drawn once over its three people or three
         times beside them. */
      rect(x, y, w, h) { guard('rect', [x, y, w, h]); this.rects.push({ x, y, w, h, p: this.page }); }
      roundedRect(x, y, w, h, rx, ry) { guard('roundedRect', [x, y, w, h, rx, ry]); }
      line(a, b, c, d) { guard('line', [a, b, c, d]); }
      addPage() { this.page++; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.5; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { guard('text', [x, y]); this.lines.push(String(t));
                      this.texts.push({ t: String(t), x, y, p: this.page }); }
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

  console.log('— by hand: Check, Remove, and Add');
  /* THERE IS STILL NO BUTTON THAT PAYS A SLOW PLOT. The office took Count it
     off — "count it 不用" — and it stays off: the only way a plot PALMS says
     is slow can be paid is for somebody to key a run that is not slow, which
     is Add by hand, and that is timed like every other. */
  check('no Count it anywhere',
    await mp.evaluate(() => {
      const txt = document.getElementById('tab-payroll').textContent;
      return [/Count it/.test(txt), typeof window.openCullHand];
    }), [false, 'undefined']);
  /* AND REMOVE IS ON EVERY ROW, which is the office's own next sentence:
     *"底下 B3 B11 我可以remove"*. A plot earning nothing is not paid either
     way, so the record moves no money — it moves the plot off the list
     somebody is working down. */
  check('a plot that does not earn it offers Remove, like every other row',
    await mp.evaluate(() => [...document.querySelectorAll('#payroll-table tr')]
      .filter(tr => /Over 15 days|not closed|No Saringan/.test(tr.textContent))
      .map(tr => [...tr.querySelectorAll('button')].map(b => b.textContent.trim()))),
    [['Remove'], ['Remove'], ['Remove'], ['Remove']]);
  /* ONE PRESS, no dialog and no reason: *"我一按remove 就remove了 不要存在
     也不用写remark"*. What makes that safe is the rule beside it — nothing
     is paid until it is Checked, and a Checked plot refuses Remove — so no
     press here can move anybody's money. */
  await mp.evaluate(() => cullRemovePlot('B1'));
  check('a Checked plot cannot be removed until it is unchecked',
    [m.errs.some(e => /B1 is Checked\. Uncheck it first/.test(e)),
     await mp.evaluate(() => !!document.getElementById('cull-hand'))], [true, false]);
  await mp.evaluate(() => cullRemovePlot('B7'));
  await mp.waitForFunction(() => !/B7/.test(document.getElementById('payroll-table').textContent));
  txt = await tableText(mp);
  check('one press and B7 is OFF both lists, with no reason asked for',
    [/B7/.test(txt), (await rowsOf(mp)).find(r => r[0] === 'B7'),
     await mp.evaluate(() => window.__DB.mjmnpayroll_cull_incentive_overrides
       .find(o => o.plot === 'B7').remark)],
    [false, ['B7', false, 10, false], null]);
  check('and the line under the table says how many went, with the way back',
    [/1 taken off this month/.test(await mp.evaluate(() => document.getElementById('payroll-extra').textContent)),
     /B7 · Put back/.test(await mp.evaluate(() => document.getElementById('payroll-extra').textContent))],
    [true, true]);

  console.log('— Remove on a plot that earns nothing anyway');
  /* The office asked for this half the day before: *"底下 B3 B11 我可以
     remove"*. B2 is over 15 days and was never going to be paid, so the
     press moves no money at all — what it moves is the list. */
  await mp.evaluate(() => cullRemovePlot('B2'));
  await mp.waitForFunction(() => !/B2/.test(document.getElementById('payroll-table').textContent));
  txt = await tableText(mp);
  check('B2 goes the same way, and the NOT-earning list is the plots still to look at',
    [/B2/.test(txt), /B4/.test(txt) && /B5/.test(txt) && /B6/.test(txt)], [false, true]);
  check('and it is still not paid, and never was', (await rowsOf(mp)).find(r => r[0] === 'B2'),
    ['B2', false, 19, false]);
  check('both are on the one line, and Put back is the only way they come back',
    /2 taken off this month/.test(await mp.evaluate(() => document.getElementById('payroll-extra').textContent)), true);

  console.log('— Add record');
  /* The office named the button: *"add a plot by hand 改成 add record"*. */
  check('the button is under the table for somebody who may change pay, and reads Add record',
    await mp.evaluate(() => {
      const b = document.getElementById('cull-add-btn');
      return [!!b, b ? b.textContent.trim() : ''];
    }), [true, '+ Add record']);
  await mp.evaluate(() => openCullAdd());
  await mp.click('#ca-save');
  check('it refuses with no plot', m.errs.some(e => /Which plot/.test(e)), true);
  /* NAMING THE PLOT FILLS THE TWO DAYS IN. The office could not key a date
     into a dd/mm/yyyy box without a fight, and PALMS has the days already —
     so it is `runOf`, asked of the one plot, the same reader the list is
     timed with. */
  await mp.fill('#ca-plot', 'B1');
  await mp.evaluate(() => document.getElementById('ca-plot').blur());
  check('naming a plot fills the run off PALMS, and says where it came from',
    await mp.evaluate(() => [document.getElementById('ca-start').value,
                             document.getElementById('ca-end').value,
                             document.getElementById('ca-days').textContent,
                             document.getElementById('ca-from').textContent]),
    [D(1), D(14), '13 days — it qualifies', `From PALMS: B1 ${D(1)} to ${D(14)}`]);
  /* AND THEY BELONG TO THE PLOT THEY WERE FILLED FOR. Changing your mind
     about the plot used to leave the first one's days under the second
     one's name — a record that reads perfectly and is about the wrong
     ground. */
  await mp.fill('#ca-plot', 'B9');
  await mp.evaluate(() => document.getElementById('ca-plot').blur());
  check('changing the plot drops the days it filled in',
    await mp.evaluate(() => [document.getElementById('ca-start').value,
                             document.getElementById('ca-end').value]), ['', '']);
  /* A day somebody KEYED is theirs and stays — correcting PALMS is half the
     reason this dialog exists. */
  await mp.fill('#ca-start', D(2));
  await mp.fill('#ca-plot', 'B6');
  await mp.evaluate(() => document.getElementById('ca-plot').blur());
  check('but a day keyed by hand is not thrown away',
    await mp.evaluate(() => document.getElementById('ca-start').value), D(2));
  await mp.fill('#ca-start', '');
  await mp.fill('#ca-plot', '');
  await mp.fill('#ca-plot', 'B3-R');
  await mp.click('#ca-save');
  check('a -R plot is refused — it is on no PALMS screen and no incentive',
    m.errs.some(e => /B3-R is a replant plot/.test(e)), true);
  await mp.fill('#ca-plot', 'B9');
  await mp.click('#ca-save');
  check('both days are required — that is the run, and the run is the rule',
    m.errs.some(e => /Key both days/.test(e)), true);
  /* THE 15-DAY RULE STILL DECIDES. Adding by hand supplies a run PALMS has
     not got; it does not waive the test — which is what keeps this from
     being the Count it button the office took off. */
  await mp.fill('#ca-start', D(1));
  await mp.fill('#ca-end', D(26));
  check('the dialog times it as it is keyed, and says it cannot go in',
    await mp.evaluate(() => document.getElementById('ca-days').textContent),
    '25 days — over 15, this cannot be added');
  await mp.click('#ca-save');
  check('and the save refuses it, naming the figure',
    m.errs.some(e => /B9 took 25 days, which is over 15/.test(e)
                  && /does not waive the rule/.test(e)), true);
  await mp.fill('#ca-end', D(10));
  await mp.fill('#ca-remark', 'PALMS was never closed for this plot');
  await mp.click('#ca-save');
  await mp.waitForFunction(() => document.getElementById('cull-add').style.display === 'none');
  await mp.waitForFunction(() => /B9/.test(document.getElementById('payroll-table').textContent));
  check('the by-hand record carries the run, the nursery, the reason and who',
    await mp.evaluate(() => {
      const o = window.__DB.mjmnpayroll_cull_incentive_overrides.find(x => x.plot === 'B9');
      return [o.action, o.section, o.saringan_date, o.transplant_date, o.remark, !!o.created_at];
    }), ['add', 'BNN', D(1), D(10), 'PALMS was never closed for this plot', true]);
  check('it is on the list, timed, counted — and NOT paid until somebody Checks it',
    (await rowsOf(mp)).find(r => r[0] === 'B9'), ['B9', true, 9, false]);
  txt = await tableText(mp);
  check('the row says it was added by hand, and the plot count moved with it',
    [/B9Added by hand: PALMS was never closed for this plot/.test(txt),
     /2 of 3 plots checked/.test(txt)], [true, true]);
  /* Delete puts it back to what PALMS says — which here is nothing at all,
     the ledger never having mentioned B9. */
  await mp.evaluate(() => {
    const id = window.__DB.mjmnpayroll_cull_incentive_overrides.find(x => x.plot === 'B9').id;
    cullDeleteOverride(id);
  });
  await mp.waitForFunction(() => !/B9/.test(document.getElementById('payroll-table').textContent));
  check('Delete takes a by-hand plot off again', (await rowsOf(mp)).some(r => r[0] === 'B9'), false);
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
  const drawn = await page.evaluate(() =>
    ({ texts: (window.__PDFS[0] || { texts: [] }).texts, rects: (window.__PDFS[0] || { rects: [] }).rects }));
  /* ONE TABLE, AND NOTHING THAT IS NOT A NAME, A PLOT OR AN AMOUNT. The
     office read the printout and said it: *"我只要看到 CULLING INCENTIVE
     其他废话都不用. 表格里面我只要看到人名 plot 和价钱"*. The dates, the
     days and who checked it are how the office DECIDED, and they are all
     on Worker Activity → Culling Incentive, which is where the deciding
     happens. A claim form is read by somebody adding up and signing. */
  check('one heading, and no sentence after it',
    [/CULLING INCENTIVE/.test(pdf), /SARINGAN/.test(pdf), /WHO IT PAYS/.test(pdf)],
    [true, false, false]);
  check('the plot, the name and the money — and nothing else',
    [/B1/.test(pdf), /Rousell Wayne/.test(pdf), /RM 20\.00/.test(pdf),
     /TOTAL INCENTIVE/.test(pdf), /RM 90\.00/.test(pdf)],
    [true, true, true, true, true]);
  check('no dates, no days, no checker, and no Rule column',
    [/CHECKED Elon Ting/.test(pdf), /Every nursery,/.test(pdf),
     /Saringan/.test(pdf), /Transplanting ended/.test(pdf)],
    [false, false, false, false]);
  check('and a plot nobody checked is still off it', / B7 /.test(pdf), false);

  /* THE PLOT IS FIRST, AND IT IS MERGED OVER ITS OWN PEOPLE — *"我要plot
     在前面 merge起来 中间人名 后面价钱"*. BNN has one Checked plot, B1,
     and it pays three people, so the plot is ONE cell three rows tall and
     the name is written once. Asked of the GEOMETRY: a list of strings
     cannot tell a merged cell from three cells carrying the same word. */
  /* Everything from the heading down, and on ITS page — the claim form
     above it has tables of its own and a column of money at its own x. */
  const at = drawn.texts.find(t => t.t === 'CULLING INCENTIVE') || { y: 1e9, p: -1 };
  const mine = (a) => a.filter(o => o.p === at.p && o.y >= at.y);
  const texts = mine(drawn.texts), rects = mine(drawn.rects);
  const head = ['Plot', 'Person', 'Incentive (RM)'].map(w =>
    (texts.find(t => t.t === w) || { x: -1 }).x);
  check('the headings run Plot, Person, Incentive — left to right',
    [head[0] > 0, head[0] < head[1], head[1] < head[2]], [true, true, true]);
  check('the plot is named ONCE for the three people it paid',
    texts.filter(t => t.t === 'B1').length, 1);
  const RH = 8, PLOTX = 25, PLOTW = 50;
  /* COUNTED BY WHERE THEY ARE, not by how many rect calls there were:
     `pdfCell` draws a fill and then a border, so a striped block records
     the same cell twice and a plain count would read two plots. */
  const merged = (a) => [...new Set(a
    .filter(r => Math.abs(r.x - PLOTX) < 0.01 && Math.abs(r.w - PLOTW) < 0.01
              && Math.abs(r.h - RH * 3) < 0.01)
    .map(r => r.y))].length;
  check('and its cell is three rows tall — one merged cell, not three',
    merged(rects), 1);
  /* AND THE COLUMN NOW ADDS UP TO THE TOTAL, which the per-person one did
     not: each figure is what that plot paid that person. 20 + 20 + 50. */
  const col = texts.filter(t => Math.abs(t.x - (PLOTX + PLOTW + 147 + 50 / 2)) < 0.01
                             && /^RM /.test(t.t)).map(t => t.t);
  check('every line is what the plot paid that person, and they sum to the total',
    [col.slice(0, 3), col[3],
     col.slice(0, 3).reduce((s, t) => s + Number(t.replace(/[^0-9.]/g, '')), 0)],
    [['RM 20.00', 'RM 20.00', 'RM 50.00'], 'RM 90.00', 90]);
  /* ON ONE PLOT A PER-PERSON TOTAL AND A PER-PLOT FIGURE ARE THE SAME
     NUMBER, so BNN alone cannot tell the two apart. All Sections can:
     Rousell earns RM 40 over two nurseries and must read RM 20 on each
     line, because a line is a plot. Two blocks of three, and the column
     comes to RM 180. */
  await page.evaluate(() => { window.__PDFS.length = 0;
    document.getElementById('transpl-section').value = ''; return downloadTransplantPDF(); });
  await page.waitForFunction(() => window.__PDFS.length && window.__PDFS[0].saved, { timeout: 10000 }).catch(() => {});
  const all = await page.evaluate(() => {
    const d = window.__PDFS[0] || { texts: [], rects: [] };
    const at = d.texts.find(t => t.t === 'CULLING INCENTIVE') || { y: 1e9, p: -1 };
    const keep = (a) => a.filter(o => o.p === at.p && o.y >= at.y);
    return { texts: keep(d.texts), rects: keep(d.rects) };
  });
  const money2 = all.texts.filter(t => Math.abs(t.x - 247) < 0.01 && /^RM /.test(t.t)).map(t => t.t);
  check('a plot is a LINE, so a person on two nurseries reads his plot rate twice',
    [money2, money2.slice(0, 6).reduce((s, t) => s + Number(t.replace(/[^0-9.]/g, '')), 0)],
    [['RM 20.00', 'RM 20.00', 'RM 50.00', 'RM 20.00', 'RM 20.00', 'RM 50.00', 'RM 180.00'], 180]);
  check('two plots, two merged cells, each three rows tall', merged(all.rects), 2);
  check('and the Field Conductor with nothing Checked is on neither block',
    all.texts.filter(t => /Akbar/.test(t.t)).length, 0);
  /* A Field Conductor whose nursery had nothing Checked has no plot, so he
     has no LINE — the table is a list of plots. His nought is in the total
     all the same, where it changes nothing. */
  check('nobody is on it who earned nothing', /Akbar Cahaya|none/.test(pdf), false);
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
  /* And the other table. Adding or removing by hand writes to the overrides
     table, so without it both buttons go rather than refusing one at a time
     with nothing saying why — and the page names the file to run. */
  const m3 = await boot(browser, Object.assign({}, db,
    { __MISSING: ['mjmnpayroll_cull_incentive_overrides'] }), 'maint');
  check('without the by-hand table there is no Add and no Remove, and it says which file to run',
    [await m3.page.evaluate(() => !!document.getElementById('cull-add-btn')),
     await m3.page.evaluate(() => /Remove/.test(document.getElementById('payroll-table').textContent)),
     /RUN_ME_cull_incentive_checked\.sql/.test(await m3.page.evaluate(() =>
       document.getElementById('payroll-offreg').textContent))],
    [false, false, true]);
  await m3.page.close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
