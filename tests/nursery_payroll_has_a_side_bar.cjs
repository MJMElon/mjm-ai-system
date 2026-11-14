/* Nursery Payroll reads as a SIDE BAR now, in the order a month is
   worked — Dashboard, Payroll Record (the five sheets), Approval, Report,
   Settings — and the paper comes off the Report rather than off each sheet.

   The office: "Change the Nursery Payroll menu to sidebar ... Report show by
   month then we can direct print or download the file from there. So the
   current payroll can download function just remove and move to report
   part." The approval question was answered "Strip + Approval page": the
   Verify strip stays on every sheet, and Approval lists every sheet and
   nursery of the month with who signed it. Others came off the same day,
   because not one entry had ever been keyed on it.

   Run with a static server on 8777 serving the repository root.        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _now = new Date();
const MONTH_KEY = `${MONTHS_SHORT[_now.getMonth()]} ${_now.getFullYear()}`;

const RECS = [
  { batch_name: '277', month: MONTH_KEY, planted_date: '2026-09-28', qty_planted: 3760,
    workers: { Siti: 2000, Rina: 1760 }, checked_at: '2026-10-29T02:00:00Z', checked_by: 'office' },
  { batch_name: '278', month: MONTH_KEY, planted_date: '2026-10-05', qty_planted: 3000,
    workers: { Siti: 1000, Ani: 2000 }, checked_at: '2026-10-29T02:00:00Z', checked_by: 'office' },
  // Keyed and NOT checked: on no claim, and named.
  { batch_name: '279', month: MONTH_KEY, planted_date: '2026-10-20', qty_planted: 800,
    workers: { Siti: 800 }, checked_at: null, checked_by: null },
  // Another month: nothing to do with this one.
  { batch_name: '270', month: 'Jan 2020', planted_date: '2020-01-05', qty_planted: 500,
    workers: { Siti: 500 }, checked_at: '2020-01-20T00:00:00Z', checked_by: 'office' }
];

async function boot(browser, db) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  page.on('dialog', (d) => { console.log('    dialog:', d.message().slice(0, 160)); d.accept().catch(() => {}); });
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript((seed) => {
    window.__DB = seed;
    window.__PDFS = [];
    /* A STRICT jsPDF, lifted from claim_form_fits_its_jobs.cjs. The stub here
       used to be `class { constructor() {} }`, which takes anything — and a
       stub that takes anything signs off a form that cannot be drawn, which
       is the fault that left the Work Maintenance claim unprintable for
       however long it took the office to need a printout. Every co-ordinate
       is a finite number or the call is refused, the way the real library
       refuses it. */
    const fin = (v) => typeof v === 'number' && isFinite(v);
    function guard(method, args) {
      args.forEach((a, i) => {
        if (!fin(a)) throw new Error('Invalid arguments passed to jsPDF.' + method
                                   + ' (argument ' + (i + 1) + ' is ' + String(a) + ')');
      });
    }
    window.jspdf = { jsPDF: class {
      constructor(o) { this.opt = o; this.page = 1; this.lines = []; this.rects = [];
                       this.saved = null; this.printed = false; window.__PDFS.push(this); }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {}
      setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect(x, y, w, h) { guard('rect', [x, y, w, h]); this.rects.push({ x, y, w, h, page: this.page }); }
      roundedRect(x, y, w, h, rx, ry) { guard('roundedRect', [x, y, w, h, rx, ry]); }
      line(a, b, c, d) { guard('line', [a, b, c, d]); }
      addPage() { this.page++; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.5; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { guard('text', [x, y]); this.lines.push({ t: String(t), x, y, page: this.page }); }
      addImage(im, fmt, x, y, w, h) { guard('addImage', [x, y, w, h]); }
      autoPrint() { this.printed = true; }
      output() { return 'blob:stub'; }
      save(name) { this.saved = name; }
    } };
    function makeQuery(table) {
      const st = { eqs: [], single: false };
      const run = () => {
        if (seed.__missing && seed.__missing.includes(table))
          return { data: null, error: { message: 'relation "public.' + table + '" does not exist' } };
        let out = (window.__DB[table] || []).slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'insert' || p === 'upsert' || p === 'update' || p === 'delete') {
          (window.__WRITES = window.__WRITES || []).push(table + ':' + p);
          return () => ({ select: () => Promise.resolve({ data: [], error: null }),
                          eq: () => q, then: (a, b) => Promise.resolve({ data: [], error: null }).then(a, b) });
        }
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery,
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser:    async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
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
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderSeedPlanting === 'function', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.waitForTimeout(500);
  return { page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ym = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
  const a = await boot(browser, {
    nops_seed_planting_batch_workers: RECS, mjmnpayroll_piece_rates: [],
    mjmnpayroll_workers: [{ id: 1, full_name: 'Ali Bin Abu', section: 'UNN2', nursery: 'UNN2',
      role: 'General Worker', active: true }],
    mjmnpayroll_verifications: [{ id: 1, month: ym, sheet: 'maint', scope: 'BNN',
      verified_by: 'esther@example.com', verified_at: '2026-11-02T03:00:00Z' }]
  });
  const page = a.page;
  const ev = (fn, arg) => page.evaluate(fn, arg).catch(e => 'threw: ' + e.message);

  console.log('1. The side bar');
  check('the entries read in the order a month is worked', await ev(() => {
    const n = document.getElementById('side-nav');
    if (!n) return 'no side bar';
    return [...n.querySelectorAll('.side-btn, .side-head')].map(b => b.textContent.trim());
  }), ['Overview', 'Dashboard', 'Payroll Record', 'Work Maintenance', 'Seed Planting', 'Transplanting',
       'Loading Seedlings', 'Monthly Payroll', 'Sign-off & Output', 'Approval', 'Report', 'Settings', 'Lock Controls', 'Piece Rate']);
  check('Settings has no menu bar of its own any more', await ev(() =>
    [!!document.querySelector('nav.settings-menu'),
     !!document.querySelector('.side-foot #settings-tab-lock'),
     !!document.querySelector('.side-foot #settings-tab-rate')]), [false, true, true]);
  check('Piece Rate in the side bar opens Settings on Piece Rate, lit alone', await ev(() => {
    document.getElementById('settings-tab-rate').click();
    const r = [document.body.dataset.tab,
      document.getElementById('settings-rate-section').classList.contains('active'),
      document.getElementById('settings-tab-rate').classList.contains('active'),
      document.getElementById('settings-tab-lock').classList.contains('active')];
    switchTab('dash');
    r.push(document.getElementById('settings-tab-rate').classList.contains('active'));
    return r;
  }), ['locks', true, true, false, false]);
  /* Top and foot stand still and the middle scrolls: the bar is never
     taller than the window, the middle is the only part that scrolls, and
     Settings and the signed-in name are in the foot. */
  check('top, scrolling middle and fixed foot', await ev(() => {
    const n = document.getElementById('side-nav');
    if (!n) return 'no side bar';
    const top = n.querySelector('.side-top'), mid = n.querySelector('.side-mid'), foot = n.querySelector('.side-foot');
    if (!top || !mid || !foot) return 'missing a part';
    return [!!top.querySelector('[data-tab="dash"]'),
            mid.querySelectorAll('.side-group').length,
            getComputedStyle(mid).overflowY,
            !!foot.querySelector('#tab-btn-locks'),
            !!foot.querySelector('#side-account'),
            n.getBoundingClientRect().height <= window.innerHeight];
  }), [true, 2, 'auto', true, true, true]);
  check('groups sit further apart than rows', await ev(() => {
    const gs = [...document.querySelectorAll('#side-nav .side-mid .side-group')];
    if (gs.length < 2) return 'fewer than two groups';
    const rows = gs[0].querySelectorAll('.side-btn');
    const rowGap = rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom;
    const groupGap = gs[1].getBoundingClientRect().top - gs[0].getBoundingClientRect().bottom;
    return groupGap > rowGap * 3;
  }), true);
  check('the open page is a solid block and the others are quieter text', await ev(() => {
    switchTab('dash');
    const on = document.getElementById('tab-btn-dash'), off = document.getElementById('tab-btn-report');
    const cs = (e) => getComputedStyle(e);
    return [cs(on).backgroundColor !== 'rgba(0, 0, 0, 0)', cs(on).color, cs(off).color];
  }), [true, 'rgb(255, 255, 255)', 'rgb(71, 85, 105)']);
  check('the foot names who is signed in', await ev(() =>
    ((document.getElementById('side-account') || {}).textContent || '').trim() !== ''), true);
  check('the old pill row and the topbar icons are gone', await ev(() => [
    !!document.querySelector('nav.subtabs'), !!document.getElementById('icon-btn-payroll'),
    !!document.querySelector('.topbar #tab-btn-locks')]), [false, false, false]);
  check('Others is gone: no tab, no sheet, no lock entry', await ev(() => [
    !!document.querySelector('[data-sub="other"]'), !!document.getElementById('sub-other'),
    typeof LOCK_SHEETS !== 'undefined' && 'other' in LOCK_SHEETS]), [false, false, false]);
  check('…and the Monthly Payroll has no Others column', await ev(() => {
    switchSub('monthly');
    return /Others/.test(document.getElementById('monthly-table').textContent);
  }), false);
  check('the Seed Planting sheet is called Seed Planting', await ev(() =>
    document.querySelector('#sub-seedplant .bar-title').textContent.trim()), 'Seed Planting — Salary Claim');

  console.log('\n2. Pressing a sheet opens the Payroll Record on it');
  check('a sheet lands on the Payroll Record, that sheet only', await ev(() => {
    switchTab('dash');
    document.querySelector('.side-btn[data-sub="transpl"]').click();
    return [document.body.dataset.tab, document.getElementById('tab-payroll').classList.contains('active'),
            document.getElementById('sub-transpl').classList.contains('active'),
            document.getElementById('tab-dash').classList.contains('active')];
  }), ['payroll', true, true, false]);
  check('no sheet carries a download or print of its own', await ev(() =>
    document.querySelectorAll('#tab-payroll [onclick*="PDF("]').length), 0);

  console.log('\n3. Dashboard');
  check('the Dashboard draws its cards and the section table', await ev(() => {
    switchTab('dash');
    return [document.querySelectorAll('#dash-body .dash-card').length > 2,
            !!document.getElementById('dash-table')];
  }), [true, true]);

  console.log('\n4. Approval');
  const ap = await ev(() => {
    switchTab('approval');
    return {
      rows: [...document.querySelectorAll('#approval-table .ap-row')].map(r =>
        [r.dataset.sheet, r.dataset.scope, r.dataset.state]),
      bnn: (document.querySelector('#approval-table .ap-row[data-scope="BNN"]') || {}).textContent || '',
      sub: document.getElementById('approval-sub').textContent
    };
  });
  if (typeof ap !== 'object' || !ap) { console.log('    approval page: ' + ap); }
  const apOk = (ap && typeof ap === 'object') ? ap : { rows: [], bnn: '', sub: '' };
  check('every sheet and nursery is a row', apOk.rows.map(r => r[0] + ':' + r[1]).filter(k =>
    ['maint:BNN', 'maint:UNN1', 'maint:UNN2', 'seedplant:', 'monthly:'].includes(k)).length, 5);
  check('the BNN Work Maintenance sheet reads verified, by whom', [
    (apOk.rows || []).find(r => r[0] === 'maint' && r[1] === 'BNN')?.[2],
    /esther/.test(apOk.bnn)], ['verified', true]); console.log('    bnn row:', apOk.bnn.replace(/\s+/g, ' '));
  check('UNN1 is still open', (apOk.rows || []).find(r => r[0] === 'maint' && r[1] === 'UNN1')?.[2], 'open');
  check('the line says how many are signed', /1 of \d+ verified/.test(apOk.sub || ''), true);
  check('Open takes you to that sheet on that nursery', await ev(() => {
    document.querySelector('#approval-table .ap-row[data-scope="UNN1"] button').click();
    return [document.getElementById('maint-nursery').value, document.body.dataset.tab,
            document.getElementById('sub-maint').classList.contains('active')];
  }), ['UNN1', 'payroll', true]);

  console.log('\n5. Report');
  check('every form of the month is a row', await ev(() => {
    switchTab('report');
    return [...document.querySelectorAll('#report-table .rep-row')].map(r => r.dataset.report);
  }), ['maint', 'loading', 'seedplant', 'transpl', 'monthly']);
  const pr = await ev(async () => {
    window.__PDFS.length = 0;
    await runReport('seedplant', 'print');
    const d = window.__PDFS[window.__PDFS.length - 1];
    return [!!d, d && d.printed, d && d.saved, !!document.getElementById('payroll-print-frame'), _pdfHow];
  });
  check('Print prints the Seed Planting claim and leaves the mode on save',
    pr, [true, true, null, true, 'save']);
  const dl = await ev(async () => {
    window.__PDFS.length = 0;
    await runReport('seedplant', 'save');
    const d = window.__PDFS[window.__PDFS.length - 1];
    return [d && d.printed, d && d.saved];
  });
  check('Download saves it, under its new name',
    [Array.isArray(dl) ? dl[0] : dl, Array.isArray(dl) && /^Salary_Claim_Seed_Planting_/.test(dl[1] || '')], [false, true]);
  const sc = await ev(async () => {
    const before = document.getElementById('maint-nursery').value;
    document.getElementById('rep-scope-maint').value = 'UNN2';
    window.__PDFS.length = 0;
    await runReport('maint', 'save');
    const d = window.__PDFS[window.__PDFS.length - 1];
    return [before, document.getElementById('maint-nursery').value, d && d.saved];
  });
  console.log('    maint report:', JSON.stringify(sc));
  check('the nursery picked on the Report is the one printed',
    Array.isArray(sc) && /_UNN2_/.test(sc[2] || ''), true);
  check('…and the sheet is left on the nursery it was on', Array.isArray(sc) && sc[1] === sc[0], true);

  console.log('\n6. Settings');
  check('re-opening a month no longer says it takes the verifications back', await ev(() =>
    /takes\s+back the verifications/.test(document.querySelector('.lock-why').textContent)), false);

  /* SHOT=/dir draws the three new pages as the office sees them — a check
     cannot read a layout. */
  if (process.env.SHOT) {
    for (const t of ['dash', 'approval', 'report']) {
      await page.evaluate((x) => switchTab(x), t);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${process.env.SHOT}/payroll_${t}.png`, fullPage: true });
    }
  }
  check('no page errors', a.errs, []);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
