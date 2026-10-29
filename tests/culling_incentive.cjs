/* Culling Monitoring: gone through and Checked on Work Maintenance,
   paid on the payroll Transplanting sheet.

   A plot that went from Saringan Anak Bibit to the end of Transplanting in
   15 days or fewer pays: RM 20 a plot to Rousell Wayne and to Florence,
   whatever the nursery, and RM 50 a plot to that nursery's own Field
   Conductor — Lalu Aenal BNN, Akbar UNN 1, Azhar UNN 2. The plots asked
   about are the ones the LEDGER transplanted in the month; the time comes
   from PALMS, the plot's LATEST run.

   The office moved it: Worker Activity -> Culling Monitoring shows the plot,
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
        /* READS are recorded as well as writes: a card that goes back to
           the database on every tab switch answers correctly and costs a
           round trip each time somebody looks at Settings, which nothing
           on screen would ever say. */
        (window.__READS = window.__READS || []).push(table);
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
  /* STRAIGHT TO SETTINGS, and never through ?view=cull_incentive. That is
     the whole point of this landing: opening the Culling Monitoring tab
     calls `_loadCullIncentive`, which reads the rule -- so every check
     written against the 'maint' landing has the rule in hand before the
     Settings card is ever drawn, and could not have caught the card not
     reading it. Somebody going to Settings first is who found it. */
  if (where === 'setting') {
    await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.renderCullMonitoringSetting === 'function'
      && document.getElementById('cm-set-body'), { timeout: 20000 });
    await page.evaluate(() => { isNopsAdmin = true; switchTab('setting'); });
    return { page, errs };
  }
  if (where === 'maint') {
    await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html?view=cull_incentive', { waitUntil: 'load' });
    await page.waitForFunction(() => /Culling Monitoring/.test((document.getElementById('payroll-table') || {}).textContent || '')
      && document.getElementById('tab-payroll').classList.contains('active'), { timeout: 20000 });
    return { page, errs };
  }
  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderCullIncentive === 'function', { timeout: 20000 });
  await page.click('[data-sub="transpl"]');
  await page.waitForFunction(() => {
    /* ONE table now — `cull-inc-pay` was the second card and is gone. */
    const t = document.getElementById('cull-inc-plots');
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

  console.log('— Work Maintenance: Worker Activity -> Culling Monitoring');
  const m = await boot(browser, db, 'maint');
  const mp = m.page;
  check('the payroll link lands on the tab, BNN picked',
    await mp.evaluate(() => [document.getElementById('pn-subtab-cull_incentive').classList.contains('active'), getNursery()]),
    [true, 'BNN']);

  /* THE NAME IS CULLING MONITORING, AND THE KEYS DID NOT MOVE WITH IT.
     The office: *"culling incentive 的名字换成culling monitoring"*. A label
     that took its key with it would read every tick the office has ever set
     as unset -- the same rule System Setting followed when Scan and Delivery
     Order were renamed. So the tab's own id, the ?view= it is reached by and
     both tables keep the spelling they are stored under. */
  check('the tab reads Culling Monitoring, in both languages, and no Incentive left',
    await mp.evaluate(() => {
      const el = document.querySelector('[data-i18n="tab.cullIncentive"]');
      const en = el.textContent.trim();
      /* The toggle is 'bm', not 'ms' -- the page's own spelling. */
      const was = currentLang;
      setLang('bm'); const ms = el.textContent.trim(); setLang(was);
      return [en, ms, /Culling Incentive/i.test(document.body.textContent)];
    }),
    ['Culling Monitoring', 'Pemantauan Culling', false]);
  /* The corner link that used to be asked here is gone -- the office asked
     for it off the Settings card -- so the KEY is asked of the sub-tab and
     of the ?view= the page answers, which is what it was ever proving. */
  check('…and the KEY it is stored and reached under did not move',
    await mp.evaluate(() => [!!document.getElementById('pn-subtab-cull_incentive'),
      !document.getElementById('cm-set-link'),
      /cull_incentive/.test(document.getElementById('pn-subtab-cull_incentive').id)]),
    [true, true, true]);
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
  /* No "Added by hand" line under the plot, nor its remark: the office
     asked for both off. The record still carries them (checked above). */
  check('the row carries no "Added by hand" line, and the plot count moved with it',
    [/Added by hand/.test(txt), /PALMS was never closed/.test(txt),
     /2 of 3 plots checked/.test(txt)], [false, false, true]);
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

  /* ── SETTINGS: WHAT MOVES CULLING MONITORING ──────────────────────────
     The office asked for the things that can affect it to be on Settings,
     and the reason is that NOT ONE of them was on a screen: the target of
     15 days, the two names paid on every nursery, and the three Field
     Conductors paid on their own. */
  console.log('— Settings: what moves Culling Monitoring');
  const cm = await mp.evaluate(() => {
    isNopsAdmin = true; switchTab('setting');
    const b = document.getElementById('cm-set-body');
    return { txt: (b.textContent || '').replace(/\s+/g, ' ').trim(),
             rows: b.querySelectorAll('.cm-set-row').length,
             bars: b.querySelectorAll('.cm-pay-top').length,
             notes: b.querySelectorAll('.cm-set-note').length };
  });
  check('it names every person the rule pays, and the price of each block',
    [/Rousell Wayne/.test(cm.txt), /Florence/.test(cm.txt), /Lalu Aenal/.test(cm.txt),
     /Akbar/.test(cm.txt), /Azhar/.test(cm.txt),
     /ADMIN/i.test(cm.txt), /FIELD CONDUCTOR/i.test(cm.txt),
     /RM 20\.00/.test(cm.txt), /RM 50\.00/.test(cm.txt)],
    [true, true, true, true, true, true, true, true, true]);
  /* THE TARGET IS A BAR OF ITS OWN, like the two prices. It was keyed
     inside a sentence of prose -- "A plot that went from Saringan Anak
     Bibit to the end of Transplanting in [15] days or fewer earns this.
     Nothing is paid until the plot is Checked on Worker Activity." -- and
     the office asked the prose off (删掉). The figure had to keep a home or
     the target would stop being keyable, so it took the shape the card
     already had: three bars, three things keyed, no sentences. */
  check('…the target is its own bar, and the prose round it is gone',
    [/TARGET/i.test(cm.txt), /15 days or fewer/.test(cm.txt),
     cm.bars,
     /A plot that went from Saringan/.test(cm.txt),
     /Nothing is paid until the plot is/.test(cm.txt)],
    [true, true, 3, false, false]);
  /* AND NOTHING ELSE. The card carried a six-row reference table under the
     two blocks -- which plots are asked about, Seedling Stock, PALMS, a -R
     plot, by hand, Checked -- and the office took it off in one line
     (这里不用show). None of the six is a lever anybody keys here, so they
     are six rows to read past on a card that exists to be keyed. The dated
     line went with them from the VIEW: it says what Save will do, so it is
     drawn beside Save and nowhere else (asserted in edit mode below). */
  check('…and nothing else: no reference table, and no dated line to read past',
    [cm.rows, cm.notes, /Seedling Stock/.test(cm.txt), /replant/i.test(cm.txt),
     /What else moves it/i.test(cm.txt), /leaves every month before it alone/.test(cm.txt)],
    [0, 0, false, false, false, false]);

  /* IT SAYS WHICH RULE IT IS ON. The tables are not on this fixture, so the
     rule fell back to the one built into the file -- and a card that did
     not say so would have the office believing they had set rates that
     nothing reads. Loud, and no Edit button over a list that cannot save. */
  check('without the tables it pays what it always paid, says so, and offers no Edit',
    await mp.evaluate(() => [MJMCullIncentive.ruleSource(),
      /No rule has been keyed yet/.test(document.getElementById('cm-set-body').textContent),
      /RUN_ME_cull_monitoring_rule_dated\.sql/.test(document.getElementById('cm-set-body').textContent),
      document.querySelectorAll('#cm-set-body .cm-pick, #cm-set-body .cm-x').length,
      /* The CORNER is where Edit lives now, so that is where "no Edit" has
         to be asked -- a card with no rule to save must offer no door into
         one, and `cmEdit` refusing with an alert is a button that looks
         live and is not. */
      /* Null-safe: on a page with no corner slot at all this has to read
         as a FAILED CHECK and not as a crash in the harness. */
      ((document.getElementById('cm-set-corner') || {}).textContent || '').trim(),
      MJMCullIncentive.RULE.everyPlot.length, MJMCullIncentive.RULE.ownNursery.length]),
    ['built-in', true, true, 0, '', 2, 3]);
  /* IT IS ONE LINE, AND IT NAMES THE FILE THAT IS ACTUALLY RUN. The banner
     was four lines telling the office to run `RUN_ME_cull_monitoring_rule
     .sql` -- the superseded undated half -- and it was on screen only
     because the card never read the rule, so it was saying it over a rule
     they had already keyed. 这种废话全部删掉. */
  check('…in one line, and not the four that named the superseded file',
    await mp.evaluate(() => {
      const w = document.querySelector('#cm-set-body .cm-set-warn');
      return [w ? w.textContent.replace(/\s+/g, ' ').trim().length < 170 : false,
              /card becomes editable, seeded/.test(document.getElementById('cm-set-body').textContent),
              /RUN_ME_cull_monitoring_rule\.sql/.test(document.getElementById('cm-set-body').innerHTML)];
    }),
    [true, false, false]);

  /* AND THE EDIT IS THE OFFICE'S SKETCH: a price on the BLOCK, a list of
     names under it with a remove on each, an Add, and the Field Conductor
     rows carrying a nursery. More than one per nursery is allowed -- they
     asked for it. */
  const ed = await mp.evaluate(() => {
    MJMCullIncentive.ruleSource = () => 'office';
    MJMCullIncentive.RULE.everyPlot.forEach((p, i) => { p.id = 100 + i; });
    MJMCullIncentive.RULE.ownNursery.forEach((p, i) => { p.id = 200 + i; });
    renderCullMonitoringSetting();
    /* EDIT IS IN THE CORNER NOW (edit 移动到右上角), so it is asked for in
       `.lst-top` and NOT in the body -- and the body is asked too, because
       a check that only looked for the word anywhere on the card would
       pass just as green with it still at the foot. */
    const top = document.querySelector('.lst-top #cm-set-corner');
    const hadEdit = !!(top && /Edit/.test(top.textContent));
    const editAtFoot = /Edit/.test(document.getElementById('cm-set-body').textContent);
    cmEdit();
    const b = document.getElementById('cm-set-body');
    return { hadEdit, editAtFoot,
             /* …and the corner is EMPTY while editing: Cancel and Save are
                the pair at the foot, and a third button for a state with no
                third thing to do is a trap. */
             cornerWhileEditing: ((document.getElementById('cm-set-corner') || {}).textContent || '').trim(),
             picks: b.querySelectorAll('.cm-pick:not(.cm-pick-n)').length,
             nurseryPicks: b.querySelectorAll('.cm-pick-n').length,
             removes: b.querySelectorAll('.cm-x').length,
             /* The target box is in a bar of its own and is NOT a price --
                asked for separately, or a check about two rates quietly
                becomes a check about three boxes. */
             rates: [...b.querySelectorAll('.cm-pay-rate input:not(.cm-days)')].map(i => i.value),
             target: (b.querySelector('.cm-days') || {}).value,
             adds: [...b.querySelectorAll('.row-add')].length,
             dated: /leaves every month before it alone/.test(b.textContent) };
  });
  check('Edit opens the office\u2019s own shape: one price a block, a row a person',
    [ed.hadEdit, ed.rates, ed.picks, ed.nurseryPicks, ed.removes, ed.adds],
    [true, ['20', '50'], 5, 3, 5, 2]);
  check('\u2026and Edit is in the CORNER, not at the foot, and goes while editing',
    [ed.hadEdit, ed.editAtFoot, ed.cornerWhileEditing], [true, false, '']);
  check('\u2026and the target is keyed in its own bar, not inside a sentence',
    ed.target, '15');
  check('\u2026and the dated line is said HERE, where the decision is made',
    ed.dated, true);
  /* THE NAME IS A DROPDOWN OFF THE REGISTER, and it preselects through the
     CLAIM's own resolver -- the rule says "Florence" and the register says
     "Florence Anak Jugah", so an exact match alone would mark five people
     the claim pays perfectly well as strangers to it. */
  check('the dropdown offers the register, and resolves a short name to its row',
    await mp.evaluate(() => {
      const sel = document.querySelectorAll('#cm-set-body .cm-pick:not(.cm-pick-n)');
      const first = sel[0], florence = sel[1];
      return [[...first.options].map(o => o.value).includes('Rousell Wayne'),
              florence.value, [...florence.options].some(o => /not on the register/.test(o.textContent))];
    }),
    [true, 'Florence Anak Jugah', false]);

  check('Add puts a row on the block it was pressed on, Remove takes one off',
    await mp.evaluate(() => {
      cmAdd('fc');
      const after = document.querySelectorAll('#cm-set-body .cm-pick-n').length;
      cmRemove(cmDraft.people.findIndex(p => p.id == null));
      const back = document.querySelectorAll('#cm-set-body .cm-pick-n').length;
      /* A row that WAS saved is marked, never spliced -- taking somebody off
         the rule is a record, and that is the way back. */
      const i = cmDraft.people.findIndex(p => p.id === 200);
      cmRemove(i);
      return [after, back, cmDraft.people.length, cmDraft.people[i].active,
              document.querySelectorAll('#cm-set-body .cm-pick-n').length];
    }),
    [4, 3, 5, false, 2]);

  check('a rule with nobody on it is refused, not saved as paying nobody',
    await mp.evaluate(async () => {
      const keep = cmDraft.people.slice();
      cmDraft.people.forEach(p => { p.active = false; });
      window.__WRITES = [];
      await cmSave();
      const wrote = window.__WRITES.filter(w => /cull_monitoring/.test(w[1])).length;
      cmDraft.people = keep; cmDraft.people.forEach(p => { p.active = true; });
      return [wrote, !!cmDraft];
    }),
    [0, true]);
  /* ── A PRICE CHANGED TODAY DOES NOT MOVE LAST MONTH ──────────────────
     The office: *"我什么时候改的价钱 是不会影响以前的月份的 例如我10月改
     RM50变40 9月份的还是RM50"*. So the rule is not one row saying what it
     is NOW, it is a rule with a HISTORY, and a month is priced by the rule
     that was in force FOR THAT MONTH.

     Driven through the SHIPPED loader against rows of the shape the table
     actually holds -- the whole question is which rows it picks for a
     month, and a restatement here would prove nothing. */
  const dated = await mp.evaluate(async () => {
    const RATES = [
      { id: 1, kind: 'admin', from_month: '2000-01', rm: 20 },
      { id: 2, kind: 'fc',    from_month: '2000-01', rm: 50 },
      { id: 3, kind: 'fc',    from_month: '2026-10', rm: 40 }   // changed in October
    ];
    const PEOPLE = [
      { id: 11, kind: 'admin', nursery: '',     worker_name: 'Rousell Wayne', from_month: '2000-01', until_month: null },
      { id: 12, kind: 'fc',    nursery: 'UNN2', worker_name: 'Azhar',         from_month: '2000-01', until_month: '2026-10' },
      { id: 13, kind: 'fc',    nursery: 'UNN2', worker_name: 'Someone New',   from_month: '2026-10', until_month: null },
      { id: 14, kind: 'fc',    nursery: 'BNN',  worker_name: 'Added in Nov',  from_month: '2026-11', until_month: null }
    ];
    const supa = { from: (t) => ({ select: () => Promise.resolve(
      { data: t === 'nops_cull_monitoring_rate' ? RATES : PEOPLE, error: null }) }) };
    const CI = window.MJMCullIncentive;
    const read = async (ym) => {
      await CI.loadRule(supa, ym);
      return { fc: (CI.RULE.ownNursery[0] || {}).rm,
               admin: (CI.RULE.everyPlot[0] || {}).rm,
               who: CI.RULE.ownNursery.map(p => p.name).sort() };
    };
    return { sep: await read('2026-09'), oct: await read('2026-10'), nov: await read('2026-11') };
  });
  check('September keeps RM 50 after the price is changed in October',
    [dated.sep.fc, dated.oct.fc, dated.nov.fc], [50, 40, 40]);
  check('…and a price nobody changed is the same in every month',
    [dated.sep.admin, dated.oct.admin, dated.nov.admin], [20, 20, 20]);
  check('a Field Conductor swapped in October still names the old one in September',
    [dated.sep.who, dated.oct.who, dated.nov.who],
    [['Azhar'], ['Someone New'], ['Added in Nov', 'Someone New']]);
  /* The month a row ENDS in is the first month it is off, and the month it
     STARTS in is the first month it is on -- both ends exclusive-of-before,
     or a conductor is paid twice over in the month of the swap. */
  check('nobody is counted twice in the month of a swap', dated.oct.who.length, 1);

  /* ── THE TARGET IS ONE NUMBER, AND THE OFFICE KEYS IT ────────────────
     15 days used to be fixed in shared_palms.js, and Culling Monitoring
     took a COPY of it at load -- so the load ORDER decided the answer and
     this card carried a red line warning that the two might disagree.
     There is one number now: PALMS owns it, everything reads it live, and
     the warning is gone because nothing can drift. */
  check('PALMS owns the target and the rule reads it LIVE, not a copy',
    await mp.evaluate(() => {
      const was = MJMPalms.TARGET_DAYS;
      MJMPalms.setTargetDays(12);
      const seen = [MJMCullIncentive.TARGET_DAYS, MJMPalms.TARGET_DAYS];
      MJMPalms.setTargetDays(was);
      return seen.concat([MJMCullIncentive.TARGET_DAYS, was]);
    }),
    [12, 12, 15, 15]);
  check('…so the card no longer carries a line about the two disagreeing',
    await mp.evaluate(() => {
      /* Not while EDITING: the lead carries the box then, not the
         sentence, and the box shows the draft rather than the live one. */
      cmCancel();
      const was = MJMPalms.TARGET_DAYS;
      MJMPalms.setTargetDays(12); renderCullMonitoringSetting();
      /* The figure and its unit are separate elements in the bar, so the
         text is read with its whitespace collapsed -- a markup change that
         moved the line break would otherwise fail a check about PALMS. */
      const txt = (document.getElementById('cm-set-body').textContent || '')
        .replace(/\s+/g, ' ');
      MJMPalms.setTargetDays(was); renderCullMonitoringSetting();
      return [/12 days or fewer/.test(txt), /have to be the same number/.test(txt)];
    }),
    [true, false]);
  /* A target of nought is every plot off the incentive at once, and it is
     not a number anybody means to key. */
  check('a target under a day is refused, and nothing is written',
    await mp.evaluate(async () => {
      cmEdit();
      cmDraft.rate.target = 0;
      window.__WRITES = [];
      await cmSave();
      const wrote = window.__WRITES.filter(w => /cull_monitoring/.test(w[1])).length;
      const still = !!cmDraft;
      cmCancel();
      return [wrote, still];
    }),
    [0, true]);
  /* And it is DATED like the prices: a target changed in October leaves
     September timing against the one it had. */
  check('the target is dated too, so September keeps the target it had',
    await mp.evaluate(async () => {
      const RATES = [
        { id: 1, kind: 'admin',  from_month: '2000-01', rm: 20 },
        { id: 2, kind: 'fc',     from_month: '2000-01', rm: 50 },
        { id: 3, kind: 'target', from_month: '2000-01', rm: 15 },
        { id: 4, kind: 'target', from_month: '2026-10', rm: 12 }
      ];
      const PEOPLE = [{ id: 11, kind: 'admin', nursery: '', worker_name: 'A',
                        from_month: '2000-01', until_month: null }];
      const supa = { from: (t) => ({ select: () => Promise.resolve(
        { data: t === 'nops_cull_monitoring_rate' ? RATES : PEOPLE, error: null }) }) };
      const was = MJMPalms.TARGET_DAYS;
      await MJMCullIncentive.loadRule(supa, '2026-09');
      const sep = MJMCullIncentive.TARGET_DAYS;
      await MJMCullIncentive.loadRule(supa, '2026-10');
      const oct = MJMCullIncentive.TARGET_DAYS;
      MJMPalms.setTargetDays(was);
      return [sep, oct];
    }),
    [15, 12]);

  await mp.evaluate(() => { cmCancel(); });

  /* ── THE CARD READS THE RULE ITSELF ───────────────────────────────────
     THE FAULT THIS SECTION EXISTS FOR, in the office's own words: 为什么改
     不到. They had run the SQL, the rule was in the database, and the
     Settings card drew the list compiled into the FILE -- short names,
     RM 20 / RM 50 / 15 days whatever they had keyed -- put a red banner
     over it telling them to run a file they had already run, and offered
     NO EDIT BUTTON.

     `loadRule` was called in ONE place: `_loadCullIncentive`, which runs
     when the Culling Monitoring sub-tab of Worker Activity is opened. So
     the one screen the rule is KEYED on was the one screen that never read
     it, and `ruleSource()` answered 'built-in' -- which is what that answer
     means: nobody asked.

     EVERY CHECK ABOVE IS BLIND TO IT, and that is the lesson rather than an
     aside: they all run on the 'maint' landing, which goes through
     ?view=cull_incentive and therefore has the rule in hand before the card
     is drawn at all. A fixture that always walks in through the other door
     cannot see a door that does not open. So this one lands on Settings and
     touches nothing else. */
  console.log('— Settings: the card reads the rule itself');
  const RULE_DB = Object.assign({}, db, {
    nops_cull_monitoring_rate: [
      { id: 1, kind: 'admin',  from_month: '2000-01', rm: 25 },
      { id: 2, kind: 'fc',     from_month: '2000-01', rm: 55 },
      { id: 3, kind: 'target', from_month: '2000-01', rm: 12 }],
    nops_cull_monitoring_people: [
      { id: 11, kind: 'admin', nursery: '', worker_id: 1, worker_name: 'Rousell Wayne',
        from_month: '2000-01', until_month: null },
      { id: 12, kind: 'fc', nursery: 'BNN', worker_id: 3, worker_name: 'Lalu Aenal Mashuri',
        from_month: '2000-01', until_month: null }]
  });
  const sg = await boot(browser, RULE_DB, 'setting');
  const sp = sg.page;
  /* It draws at once off what is in hand and draws AGAIN when the database
     answers, so the check waits for the second draw rather than for a tick
     of the clock -- a fixed wait passes or fails on how fast the harness
     is that morning. */
  /* The wait is CAUGHT, so a card that never reads the rule fails as the
     named check below rather than killing the run with a timeout -- the
     failure has to read as 为什么改不到, not as a harness that hung. */
  await sp.waitForFunction(() => window.MJMCullIncentive
    && MJMCullIncentive.ruleSource() === 'office', { timeout: 8000 })
    .catch(() => {});
  check('opening Settings alone reads the keyed rule — no other tab touched',
    await sp.evaluate(() => {
      const b = document.getElementById('cm-set-body');
      const txt = (b.textContent || '').replace(/\s+/g, ' ').trim();
      return [MJMCullIncentive.ruleSource(),
              /RM 25\.00/.test(txt), /RM 55\.00/.test(txt), /12 days or fewer/.test(txt),
              /Lalu Aenal Mashuri/.test(txt),
              MJMCullIncentive.RULE.everyPlot.length, MJMCullIncentive.RULE.ownNursery.length];
    }),
    ['office', true, true, true, true, 1, 1]);
  check('…so there IS an Edit button, in the corner, and no banner over a rule they keyed',
    await sp.evaluate(() => {
      const b = document.getElementById('cm-set-body');
      const c = document.querySelector('.lst-top #cm-set-corner .cm-set-open');
      return [!!(c && /Edit/.test(c.textContent)), !!b.querySelector('.cm-set-warn'),
              /RUN_ME_/.test(b.textContent)];
    }),
    [true, false, false]);
  /* THE TARGET REACHED PALMS, which is the half a card-only fix would
     miss: one number, so the Motion Study measures against what was keyed
     here and not against the 15 compiled into the file. */
  check('…and the keyed target reached PALMS, so the two cannot disagree',
    await sp.evaluate(() => [MJMPalms.TARGET_DAYS, MJMCullIncentive.TARGET_DAYS]),
    [12, 12]);
  /* AND IT ASKS ONCE. A read fired on every tab switch is a card that goes
     back to the database each time somebody looks at Settings. */
  check('…it asks once, not on every tab switch',
    await sp.evaluate(async () => {
      const before = window.__READS.filter(t => t === 'nops_cull_monitoring_people').length;
      switchTab('capacity'); switchTab('setting'); switchTab('capacity'); switchTab('setting');
      await new Promise(r => setTimeout(r, 120));
      return [before, window.__READS.filter(t => t === 'nops_cull_monitoring_people').length];
    }),
    [1, 1]);
  check('no page error on the Settings landing', sg.errs, []);
  if (process.env.SHOT_CM) {
    const card = sp.locator('#cm-set-body').locator('xpath=..');
    await card.screenshot({ path: process.env.SHOT_CM });
    await sp.evaluate(() => cmEdit());
    await card.screenshot({ path: process.env.SHOT_CM.replace('.png', '_edit.png') });
    await sp.evaluate(() => cmCancel());
  }
  await sp.close();

  await mp.evaluate(() => switchTab('payroll'));

  // What Work Maintenance left in the database is what the payroll reads.
  const left = await mp.evaluate(() => ({
    checks: JSON.parse(JSON.stringify(window.__DB.nops_cull_incentive_checks)),
    overrides: JSON.parse(JSON.stringify(window.__DB.mjmnpayroll_cull_incentive_overrides)) }));
  await mp.close();

  console.log('— the payroll pays the Checked plots and nothing else');
  // N7 checked too, so a second nursery is paid; B7 left unchecked on purpose.
  left.checks.push({ id: 900, month: YM, plot: 'N7', section: 'UNN2', saringan_date: D(1),
    transplant_date: D(8), days: 7, checked_at: `${YM}-20T01:00:00Z`, checked_by: 'elon.mjm@gmail.com' });
  /* N7 is ADDED BY HAND as well as Checked, which is what makes it the plot
     to look at here: it is paid exactly like B1, so the sheet must say
     nothing about how it got on. */
  left.overrides.push({ id: 901, month: YM, plot: 'N7', action: 'add', section: 'UNN2',
    saringan_date: D(1), transplant_date: D(8), remark: 'PALMS was never closed',
    by_email: 'elon.mjm@gmail.com', at: `${YM}-20T01:00:00Z` });
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
    const el = document.getElementById('cull-inc-plots');
    const t = (id) => (document.getElementById(id).textContent || '').replace(/\s+/g, ' ').trim();
    return { plots: t('cull-inc-plots'),
             /* ONE table now, so the second id must be GONE — a card left
                on the page that the renderer no longer writes is an empty
                box under a sheet about money. */
             second: !!document.getElementById('cull-inc-pay'),
             cols: [...el.querySelectorAll('thead th')].map(h => h.textContent.trim()),
             /* The WIDTHS as the browser settled them, not as they were
                asked for: the complaint was about what is on screen. */
             widths: [...el.querySelectorAll('thead th')].map(h => Math.round(h.getBoundingClientRect().width)),
             spans: [...el.querySelectorAll('tbody td[rowspan]')]
               .map(td => [td.textContent.trim().split('\n')[0], Number(td.getAttribute('rowspan'))]),
             bodyRows: el.querySelectorAll('tbody tr').length,
             note: document.getElementById('cull-inc-note').innerHTML,
             link: (document.getElementById('cull-inc-link') || {}).getAttribute ? document.getElementById('cull-inc-link').getAttribute('href') : null,
             add: !!document.getElementById('cull-inc-add'), modal: !!document.getElementById('cull-add-modal') };
  });
  /* ONE TABLE, SIX COLUMNS, THE PLOT MERGED — *"这里合起来 不需要分两个
     plot, started date, ended date, days, person, RM"*. */
  check('one table, and the second one is gone', screen.second, false);
  check('the six columns the office asked for, in their order', screen.cols,
    ['Plot', 'Saringan started', 'Transplanting ended', 'Days', 'Person', 'Incentive (RM)']);
  /* BNN has one Checked plot paying three people, so the plot and its two
     days and its duration are four cells spanning three rows each — asked
     of the rowspan, because a list of words cannot tell a merged cell from
     the plot written out three times. */
  check('the plot and its dates are ONE cell each, three rows tall',
    [screen.spans.length, screen.spans.every(([, n]) => n === 3), screen.bodyRows],
    [4, true, 3]);
  check('the plot, its run and the three people are on the one table',
    [/B1/.test(screen.plots), /13/.test(screen.plots), /Rousell Wayne/.test(screen.plots),
     /Lalu Aenal/.test(screen.plots), /B3|B7/.test(screen.plots)],
    [true, true, true, true, false]);
  /* The RM on a line is what that plot paid that person, so the column adds
     up to the total — 20 + 20 + 50. */
  check('the money is per plot per person, and the total is under it',
    [(screen.plots.match(/RM 20\.00/g) || []).length, /RM 50\.00/.test(screen.plots),
     /TOTAL INCENTIVE.*90\.00/.test(screen.plots)],
    [2, true, true]);
  /* NO COLUMN TAKES THE SLACK ON ITS OWN — *"alignment 不对 有些太大有些
     太小"*. Auto layout hands the most room to the widest content, which
     is the two long date HEADINGS, so a 90px date sat in 400px beside a
     plot squeezed into 131. Pinning only the dates moved the surplus onto
     Person (548px for a name) rather than fixing it.

     Asked of the RENDERED widths, because that is what the office was
     looking at; a check on the style attribute passes over a column the
     browser then stretched anyway. And asked as a RATIO, not in pixels —
     a pixel floor passes or fails on the harness window rather than on
     the layout. */
  {
    const w = screen.widths;
    /* A DATE IS NEVER THE WIDEST COLUMN ON THE ROW. That is the office's
       picture stated as a rule: the widest should be the one carrying the
       longest VALUE (a name), never one carrying the longest HEADING.
       A looser form of this — "nothing takes a third of the table" —
       passed over the broken layout at 28% and proved nothing. */
    const widest = w.indexOf(Math.max(...w));
    check('the widest column is the one with the longest value on it, not a date',
      [w.length, widest], [6, 4]);
    check('neither date is wider than the name beside it, nor than the plot by half',
      [w[1] <= w[4], w[2] <= w[4], w[1] < w[0] * 1.5, w[2] < w[0] * 1.5],
      [true, true, true, true]);
  }
  /* Rule, Checked plots, Checked and Nursery came off. The checker is on
     Worker Activity, one button away at the top of this section. */
  check('and nothing the office struck off is still on it',
    [/Every nursery/.test(screen.plots), /Checked plots/.test(screen.plots),
     /Elon Ting/.test(screen.plots), /Nursery/.test(screen.cols.join(' '))],
    [false, false, false, false]);
  /* NOR "Added by hand", NOR ITS REMARK. The office asked for it off the
     Work Maintenance tab and then off this sheet, and it is the same
     judgement both times: this table is what is being PAID, and a plot
     added by hand is paid exactly like every other plot. N7 is the one to
     look at -- Checked AND added by hand -- and it has to read like B1. */
  check('…nor "Added by hand" on a plot that is paid like every other',
    await page.evaluate(() => {
      /* N7 is UNN2, so it is on ALL SECTIONS and not on the BNN draw the
         checks above read. Put the sheet back afterwards, or every check
         below this one is quietly looking at a different table. */
      renderCullIncentive('');
      const txt = (document.getElementById('cull-inc-plots').textContent || '')
        .replace(/\s+/g, ' ').trim();
      renderCullIncentive('BNN');
      return [/Added by hand/.test(txt), /by hand/.test(txt),
              /PALMS was never closed/.test(txt), /N7/.test(txt)];
    }),
    [false, false, false, true]);
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
     on Worker Activity → Culling Monitoring, which is where the deciding
     happens. A claim form is read by somebody adding up and signing. */
  check('one heading, and no sentence after it',
    [/CULLING MONITORING/.test(pdf), /SARINGAN/.test(pdf), /WHO IT PAYS/.test(pdf)],
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
  const at = drawn.texts.find(t => t.t === 'CULLING MONITORING') || { y: 1e9, p: -1 };
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
    const at = d.texts.find(t => t.t === 'CULLING MONITORING') || { y: 1e9, p: -1 };
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
