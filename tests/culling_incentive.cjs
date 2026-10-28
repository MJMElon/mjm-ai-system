/* The culling incentive on the Transplanting sheet.

   A plot that went from Saringan Anak Bibit to the end of Transplanting in
   15 days or fewer pays: RM 20 a plot to Rousell Wayne and to Florence,
   whatever the nursery, and RM 50 a plot to that nursery's own Field
   Conductor — Lalu Aenal BNN, Akbar UNN 1, Azhar UNN 2. The plots asked
   about are the ones the LEDGER transplanted in the month; the time comes
   from PALMS, the plot's LATEST run.

   This drives the real page with a ledger and a PALMS log built to hit
   every way a plot can come out, and reads what is on screen, the Monthly
   Payroll and the claim PDF.

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

async function boot(browser, db) {
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
  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderCullIncentive === 'function', { timeout: 20000 });
  await page.click('[data-sub="transpl"]');
  await page.waitForFunction(() => {
    const t = document.getElementById('cull-inc-pay');
    return t && (t.textContent || '').trim().length > 0;
  }, { timeout: 15000 });
  return { page, errs };
}

const plotsOf = (page, sec) => page.evaluate((s) =>
  cullIncentivePlots(s).map(r => [r.plot, r.state, r.days == null ? null : r.days]), sec);
const payOf = (page, sec) => page.evaluate((s) =>
  cullIncentivePay(cullIncentivePlots(s), s).map(p => [p.known ? p.known.full_name : p.name, p.amount]), sec);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('— the plots and how long each took');
  const db = { mjmnpayroll_workers: REGISTER, shared_inventory_logs: LEDGER,
               fcportal_palms_plot_logs: PALMS };
  const { page, errs } = await boot(browser, db);
  check('BNN: every plot transplanted this month, timed off its latest run',
    await plotsOf(page, 'BNN'),
    [['B1', 'ok', 13], ['B2', 'slow', 19], ['B3', 'ok', 14], ['B4', 'open', null],
     ['B5', 'none', null], ['B6', 'slow', 20], ['B7', 'ok', 10]]);
  check('UNN 2 is its own list', await plotsOf(page, 'UNN2'), [['N7', 'ok', 7]]);
  check('UNN 1 has nothing this month — U9 was last month', await plotsOf(page, 'UNN1'), []);

  console.log('— who it pays');
  check('BNN: RM 20 a plot each to Rousell and Florence, RM 50 a plot to Lalu Aenal only',
    await payOf(page, 'BNN'),
    [['Rousell Wayne', 60], ['Florence Anak Jugah', 60], ['Lalu Aenal Mashuri', 150]]);
  check('UNN 2: Azhar for his own plot', await payOf(page, 'UNN2'),
    [['Rousell Wayne', 20], ['Florence Anak Jugah', 20], ['Muhamad Azhar', 50]]);
  check('All nurseries: Akbar gets nothing — UNN 1 finished nothing', await payOf(page, ''),
    [['Rousell Wayne', 80], ['Florence Anak Jugah', 80], ['Lalu Aenal Mashuri', 150],
     ['Akbar Cahaya', 0], ['Muhamad Azhar', 50]]);

  const screen = await page.evaluate(() => {
    const t = (id) => (document.getElementById(id).textContent || '').replace(/\s+/g, ' ').trim();
    return { plots: t('cull-inc-plots'), pay: t('cull-inc-pay'), note: t('cull-inc-note') };
  });
  check('the screen draws B1 as qualifying and B2 as over 15 days',
    [/B1.*Qualifies/.test(screen.plots), /B2.*Over 15 days/.test(screen.plots)], [true, true]);
  check('the screen total is the BNN incentive', /TOTAL INCENTIVE.*270\.00/.test(screen.pay), true);
  check('nothing to warn about', screen.note, '');
  if (process.env.SHOT) await page.locator('#cull-inc-wrap').screenshot({ path: process.env.SHOT });

  console.log('— the Monthly Payroll');
  const monthly = await page.evaluate(() => {
    document.getElementById('monthly-section').value = '';
    return monthlyRows().filter(r => r.transpl).map(r => [r.name, r.transpl]);
  });
  check('each person is paid across every nursery, under Transplanting', monthly.sort(),
    [['Florence Anak Jugah', 80], ['Lalu Aenal Mashuri', 150], ['Muhamad Azhar', 50], ['Rousell Wayne', 80]]);

  console.log('— the claim PDF');
  await page.evaluate(() => downloadTransplantPDF());
  await page.waitForFunction(() => window.__PDFS.length && window.__PDFS[0].saved, { timeout: 10000 }).catch(() => {});
  const pdf = await page.evaluate(() => (window.__PDFS[0] || { lines: [] }).lines.join(' | '));
  check('the form carries both tables', [/CULLING INCENTIVE — SARINGAN/.test(pdf), /WHO IT PAYS/.test(pdf)], [true, true]);
  check('no page errors', errs.filter(e => !/^ALERT: Nothing recorded/.test(e)), []);

  console.log('— by hand: add, remove, delete');
  await page.evaluate(() => openCullAdd());
  await page.fill('#ca-plot', 'b3-r'); await page.fill('#ca-remark', 'try');
  await page.click('#ca-save');
  check('a -R plot cannot be added by hand either',
    [errs.some(e => /B3-R is a -R plot/.test(e)),
     await page.evaluate(() => (window.__WRITES || []).some(w => /-R/i.test((w[2] || {}).plot || '')))], [true, false]);
  await page.evaluate(() => closeModal('cull-add-modal'));
  const st = (page, sec) => page.evaluate((s) => cullIncentivePlots(s)
    .map(r => [r.plot, r.counts, r.override ? r.override.action : null]), sec);
  const pick = (rows, plot) => rows.find(r => r[0] === plot);
  const fill = async (o) => {
    for (const [id, v] of Object.entries(o)) await page.fill('#' + id, v);
  };
  check('+ Add plot is shown to somebody with Adjust Pay',
    await page.evaluate(() => !document.getElementById('cull-inc-add').classList.contains('hidden')), true);

  // A plot the ledger never transplanted, added through the real dialog.
  await page.click('#cull-inc-add');
  await fill({ 'ca-plot': 'b40', 'ca-saringan': D(1), 'ca-transplant': D(12), 'ca-remark': 'PALMS never keyed' });
  await page.selectOption('#ca-nursery', 'BNN').catch(() => page.evaluate(() => { document.getElementById('ca-nursery').value = 'BNN'; }));
  await page.click('#ca-save');
  await page.waitForFunction(() => !document.getElementById('cull-add-modal').classList.contains('open'));
  check('a plot added by hand is counted, written once with its reason',
    [pick(await st(page, 'BNN'), 'B40'),
     await page.evaluate(() => window.__WRITES.filter(w => w[0] === 'upsert').map(w => [w[2].plot, w[2].action, w[2].remark]))],
    [['B40', true, 'add'], [['B40', 'add', 'PALMS never keyed']]]);
  check('…and it pays: Lalu Aenal now four plots, Rousell five across all',
    [(await payOf(page, 'BNN'))[2], (await payOf(page, ''))[0]],
    [['Lalu Aenal Mashuri', 200], ['Rousell Wayne', 100]]);

  // A plot PALMS cannot time, counted by hand off its own row.
  await page.evaluate(() => openCullAdd('B4'));
  check('Count it opens on the plot and does not let it be retyped',
    await page.evaluate(() => [document.getElementById('ca-plot').value, document.getElementById('ca-plot').readOnly]), ['B4', true]);
  await page.click('#ca-save');   // no reason
  check('a change with no reason is refused', errs.some(e => /Say why/.test(e)), true);
  await fill({ 'ca-remark': 'Transplanting finished 10th, FC forgot to close' });
  await page.click('#ca-save');
  await page.waitForFunction(() => !document.getElementById('cull-add-modal').classList.contains('open'));
  check('B4 now counts', pick(await st(page, 'BNN'), 'B4'), ['B4', true, 'add']);

  // A qualifying plot taken out.
  await page.evaluate(() => cullRemovePlot('B1'));
  check('Remove asks in the dialog, with no date boxes', await page.evaluate(() =>
    [document.getElementById('cull-add-modal').classList.contains('open'),
     document.getElementById('ca-add-only').classList.contains('hidden'),
     document.getElementById('ca-save').textContent]), [true, true, 'Remove']);
  await fill({ 'ca-remark': 'Re-culled, does not count' });
  await page.click('#ca-save');
  await page.waitForFunction(() => !document.getElementById('cull-add-modal').classList.contains('open'));
  check('B1 is listed and not paid', pick(await st(page, 'BNN'), 'B1'), ['B1', false, 'remove']);
  if (process.env.SHOT2) await page.locator('#cull-inc-wrap').screenshot({ path: process.env.SHOT2 });
  check('BNN pays B3, B4, B7, B40', (await payOf(page, 'BNN'))[2], ['Lalu Aenal Mashuri', 200]);
  const screen2 = await page.evaluate(() => (document.getElementById('cull-inc-plots').textContent || '').replace(/\s+/g, ' '));
  check('the row says who changed it and why',
    [/Taken out by hand ?Re-culled, does not count ?elon\.mjm/.test(screen2), /Added by hand ?PALMS never keyed/.test(screen2)], [true, true]);

  // Put back, then delete the hand-added plot.
  const idOf = (plot) => page.evaluate((p) => cullOverrides.find(o => o.plot === p).id, plot);
  await page.evaluate((id) => cullDeleteOverride(id), await idOf('B1'));
  await page.waitForFunction(() => !cullOverrides.some(o => o.plot === 'B1'));
  check('Put back returns B1 to what PALMS says', pick(await st(page, 'BNN'), 'B1'), ['B1', true, null]);
  await page.evaluate((id) => cullDeleteOverride(id), await idOf('B40'));
  await page.waitForFunction(() => !cullOverrides.some(o => o.plot === 'B40'));
  check('Delete takes the hand-added plot off entirely', pick(await st(page, 'BNN'), 'B40'), undefined);
  check('the Monthly Payroll follows: B4 by hand, B1 back — Lalu 4 plots',
    await page.evaluate(() => { document.getElementById('monthly-section').value = '';
      return monthlyRows().filter(r => r.name === 'Lalu Aenal Mashuri').map(r => r.transpl); }), [200]);
  check('only the by-hand records were ever deleted, and nothing else written',
    await page.evaluate(() => [...new Set(window.__WRITES.map(w => w[1]))]), ['mjmnpayroll_cull_incentive_overrides']);
  check('no prompt was ever raised', errs.filter(e => /^PROMPT/.test(e)), []);
  await page.close();

  console.log('— the faults that must be said');
  const r2 = await boot(browser, { mjmnpayroll_workers: REGISTER.concat([{ id: 6, full_name: 'Florence Lee', section: 'BNN', active: true }]).filter(w => w.id !== 1),
                                   shared_inventory_logs: LEDGER, fcportal_palms_plot_logs: [],
                                   __MISSING: ['mjmnpayroll_cull_incentive_overrides'] });
  const note2 = await r2.page.evaluate(() => document.getElementById('cull-inc-note').textContent);
  check('an empty PALMS says to run the read policy', /RUN_ME_payroll_reads_palms\.sql/.test(note2), true);
  check('nobody is paid when PALMS times nothing', await payOf(r2.page, 'BNN'),
    [['Rousell Wayne', 0], ['Florence', 0], ['Lalu Aenal Mashuri', 0]]);
  check('without the table, the page says which file to run',
    /RUN_ME_cull_incentive_overrides\.sql/.test(note2), true);
  check('a missing name and a name on two people are both named',
    [/Rousell Wayne is not on the worker register/.test(note2), /Florence matches more than one worker/.test(note2)], [true, true]);
  await r2.page.close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
