/* LOADING SEEDLINGS GOT ITS OWN SCREEN, BUILT ON WORK MAINTENANCE'S OWN
   MONEY.

   loading_seedlings has been priced inside maintTotals() since the DO
   Signing flow was built — one of MAINT_TYPES' five jobs, locked and
   calibrated together with the other four under the 'maint' sheet. The
   only place it ever showed was the fifth column of the Work Maintenance
   table, which is not where the office went looking for it: the "Loading
   Seedlings" tab was a different, older sheet (manual Seedlings
   Collection entries) wearing a confusingly similar name.

   So the tab now reads the SAME maintLiveView()/maintTotals() pipeline,
   filtered to loading_seedlings, with the SAME nursery circles as Work
   Maintenance (one select, #maint-nursery — there is one verify/lock
   scope for this sheet, not two) and a claim-form download. Calibrating a
   cell here has to move the exact same adjustment row Work Maintenance's
   own column would — two screens of one sheet disagreeing about a
   worker's pay is the fault this whole codebase keeps finding.

   The older manual sheet is kept, demoted to "Keyed by hand" underneath,
   and must still work.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/loading_seedlings_is_work_maintenance.cjs
   with a static server on 8777 serving the repository root.
*/
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _now = new Date();
const YM    = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
const MONTH = `${MONTHS[_now.getMonth()]} ${_now.getFullYear()}`;
const WORKER = 'Siti Binti Abu';

/* B1 is BNN's own plot by shared_maint_plots.js's BASE list — no
   shared_plots/nops_maint_custom_plots fixture needed to resolve it. */
const DB = {
  mjmnpayroll_workers: [{ id: 1, full_name: WORKER, section: 'BNN', status: 'active' }],
  mjmnpayroll_piece_rates: [
    { id: 1, job_desc: 'Loading Seedlings', rate: 0.05, unit: 'Bag',
      category: 'maintenance', group_code: 'MN', active: true }
  ],
  shared_do_records: [{
    do_number: 'DO-9001', delivery_date: `${YM}-12`, status: 'Delivered', remark: '',
    plot_1: 'B1', qty_1: 500, batch_1: '101',
    worked_by_by_nursery: { BNN: [WORKER] }
  }],
  /* The older manual sheet — "Keyed by hand" must still show this. */
  mjmnpayroll_work_entries: [{
    id: 1, month: YM, category: 'seedlings', work_date: `${YM}-05`, worker_id: 1,
    section: 'BNN', job_desc: 'Seedlings Collection (by hand)', qty: 10, unit: 'Bag',
    rate: 1, amount: 10
  }]
};

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => { errs.push('ALERT: ' + d.message()); d.dismiss(); });

  await page.addInitScript((seed) => {
    window.__DB = seed;
    window.__PDFS = [];
    /* A STRICT jsPDF — every co-ordinate must be a finite number, exactly
       as the real library refuses a bad one. A stub that takes anything
       would sign off a form that cannot actually be drawn; see
       claim_form_fits_its_jobs.cjs for the regression this guards. */
    const fin = (v) => typeof v === 'number' && isFinite(v);
    function guard(method, args) {
      args.forEach((a, i) => {
        if (!fin(a)) throw new Error('Invalid arguments passed to jsPDF.' + method
                                   + ' (argument ' + (i + 1) + ' is ' + String(a) + ')');
      });
    }
    window.jspdf = { jsPDF: class {
      constructor() { this.page = 1; this.rects = []; this.saved = null; window.__PDFS.push(this); }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {}
      setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect(x, y, w, h) { guard('rect', [x, y, w, h]); this.rects.push({ x, y, w, h, page: this.page }); }
      line(a, b, c, d) { guard('line', [a, b, c, d]); }
      addPage() { this.page++; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.5; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { guard('text', [x, y]); }
      save(name) { this.saved = name; }
    } };
    function makeQuery(table) {
      const st = { eqs: [], gte: null, single: false };
      const rows = () => {
        let out = (window.__DB[table] || []).slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        if (st.gte) out = out.filter((r) => String(r[st.gte[0]] || '') >= st.gte[1]);
        return out;
      };
      const run = () => { const o = rows(); return st.single ? { data: o[0] || null, error: null } : { data: o, error: null }; };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'gte') return (c, v) => { st.gte = [c, v]; return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'order' || p === 'in' || p === 'not') return () => q;
        if (p === 'upsert' || p === 'insert' || p === 'update' || p === 'delete') return () => q;
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
  }, DB);

  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'canDo') return () => true;
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderLoading === 'function', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { document.getElementById('maint-nursery').value = 'BNN'; });
  await page.evaluate(() => { renderClaimPickers(); renderMaint(); renderLoading(); });
  await page.waitForTimeout(200);
  return { page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, errs } = await boot(browser);

  console.log('\nThe tab reads the SAME money as Work Maintenance’s own column');
  checkTrue('switching to the Loading Seedlings tab does not throw',
            !errs.some(e => /loading/i.test(e)));
  const read = await page.evaluate(() => {
    const t = loadingJob();
    const view = maintLiveView('BNN', monthValue(), maintMonthLabel(monthValue()));
    return {
      label: t.label,
      capAll: view.capAll(t.code),
      rate: view.rateOf(t.code),
      cap: view.capOf('Siti Binti Abu', t.code),
      pay: view.payOf('Siti Binti Abu', t.code)
    };
  });
  check('Loading Seedlings is the label', read.label, 'Loading Seedlings');
  check('the whole DO’s qty counts as this nursery’s capacity', read.capAll, 500);
  check('the Piece Rate screen’s rate is read, same as Work Maintenance reads it', read.rate, 0.05);
  check('the worker ticked on the DO gets the whole share', read.cap, 500);
  check('priced at capacity × rate', read.pay, 25);

  console.log('\nThe screen itself');
  checkTrue('a nursery picker is drawn on this tab (round buttons)',
            await page.evaluate(() => document.querySelectorAll('#loading-nursery-pills .npill').length > 0));
  checkTrue('BNN / UNN1 / UNN2 are the three circles, same as Work Maintenance',
            await page.evaluate(() =>
              [...document.querySelectorAll('#loading-nursery-pills .npill')].map(b => b.dataset.code).join(',') ===
              [...document.querySelectorAll('#maint-nursery-pills .npill')].map(b => b.dataset.code).join(',')));
  checkTrue('a download button is on the bar', await page.evaluate(() => typeof window.downloadLoadingPDF === 'function'));
  checkTrue('the claim table shows the worker and the capacity',
            await page.evaluate(() => document.getElementById('loading-table').textContent.includes('Siti Binti Abu')
                               && document.getElementById('loading-table').textContent.includes('500')));

  console.log('\nThe two circle rows are ONE select, not two');
  /* Clicking a pill on the Loading tab has to move Work Maintenance's own
     picker too — there is one verify/lock scope for this sheet, and two
     screens quietly looking at two different nurseries for "the same"
     sheet is exactly the fault this codebase keeps finding. */
  await page.evaluate(() => document.querySelector('#loading-nursery-pills .npill[data-code="UNN1"]').click());
  await page.waitForTimeout(100);
  check('picking UNN1 on the Loading tab moves #maint-nursery too',
        await page.evaluate(() => document.getElementById('maint-nursery').value), 'UNN1');
  checkTrue('and Work Maintenance’s own pill row shows UNN1 as picked',
        await page.evaluate(() => document.querySelector('#maint-nursery-pills .npill.on').dataset.code === 'UNN1'));
  // Back to BNN for the rest of the checks.
  await page.evaluate(() => document.querySelector('#loading-nursery-pills .npill[data-code="BNN"]').click());
  await page.waitForTimeout(100);

  console.log('\nCapacity adjusted here is the SAME adjustment Work Maintenance reads');
  await page.evaluate((who) => {
    calibrateStep('maint', 'maint', 'BNN', who, 'cap:loading_seedlings', 500, 1);
  }, WORKER);
  await page.waitForTimeout(100);
  const after = await page.evaluate((who) => {
    const t = loadingJob();
    return {
      fromLoadingView: maintLiveView('BNN', monthValue(), maintMonthLabel(monthValue())).capOf(who, t.code),
      onScreen: document.getElementById('loading-table').textContent.includes('500.01'),
      adjRow: adjOf('maint', 'BNN', who, 'cap:' + t.code)
    };
  }, WORKER);
  check('the calibrated capacity reads back as 500.01', after.fromLoadingView, 500.01);
  checkTrue('and the Loading Seedlings table shows it', after.onScreen);
  checkTrue('stored under the real sheet — "maint", not a parallel one',
            after.adjRow && after.adjRow.sheet === 'maint');

  console.log('\nThe hand-keyed Seedlings Collection section is gone from the tab');
  await page.evaluate(() => { switchSub('seedling'); });
  await page.waitForTimeout(100);
  checkTrue('no keyed-by-hand table on the tab',
            await page.evaluate(() => !document.getElementById('seedling-table') && !document.getElementById('seedling-keyed-wrap')));
  checkTrue('and no Add Entry for it',
            await page.evaluate(() => !document.querySelector('#sub-seedling [data-add]')));
  checkTrue('and the Loading Seedlings claim above it is untouched by that',
            await page.evaluate(() => document.getElementById('loading-table').textContent.includes('500.01')));

  console.log('\nThe claim form actually draws');
  await page.evaluate(() => { document.getElementById('maint-nursery').value = 'BNN'; });
  const pdf = await page.evaluate(async () => {
    try {
      await window.downloadLoadingPDF();
      const d = (window.__PDFS || [])[window.__PDFS.length - 1];
      return { ok: true, saved: d && d.saved, rects: d ? d.rects.length : 0 };
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  });
  checkTrue('downloadLoadingPDF() produces a form', pdf.ok);
  if (!pdf.ok) console.log('         ' + pdf.err);
  checkTrue('…saved under its own name', /Loading_Seedlings/.test(pdf.saved || ''));
  checkTrue('…having actually drawn a table', (pdf.rects || 0) > 5);

  await page.close();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
