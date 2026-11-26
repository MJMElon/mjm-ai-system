/* A job added on Work Maintenance waits on Piece Rate for its price.

   The office: "价钱在这里订 operation那边改动后 这边要detect到 然后add job那边
   要有一个pending". Work Maintenance → Settings → Where Each Job Is Done adds
   a job (one nops_maint_config row, custom_jobs) with no price; this page
   reads that row and lists every such job with no rate filed under its key
   as PENDING above the groups, with Set price opening the ordinary Add Job
   form already filled in.

   Run with a static server on 8777 serving the repository root.        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

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
  const JOBS = [
    { key: 'cj_a1', label: 'Racun Rumput', sidebar: true, under: null, qtyFrom: 'plot' },
    { key: 'cj_b2', label: 'Siram Air', sidebar: false, under: 'weeding', qtyFrom: 'keyed' },
    { key: 'cj_c3', label: 'Already Priced', sidebar: true, under: null, qtyFrom: 'plot' },
  ];
  const { page, errs } = await boot(browser, {
    nops_maint_config: [{ key: 'custom_jobs', txt_value: JSON.stringify(JOBS) },
                        { key: 'job_scope:cj_a1', txt_value: 'pre' },
                        { key: 'job_scope:cj_b2', txt_value: 'both' }],
    mjmnpayroll_piece_rates: [{ id: 1, job_desc: 'Already Priced', unit: 'Plot', rate: 1, category: 'cj_c3', group_code: 'MN', active: true },
                              { id: 2, job_desc: 'Seed Planting', unit: 'Seed', rate: 0.02, category: 'seed_planting', group_code: 'PN', active: true }]
  });
  await page.evaluate(() => { try { openSettings('rate'); } catch (_) { try { renderRates(); } catch (e) {} } });
  await page.waitForTimeout(400);
  const pend = await page.evaluate(() => [...document.querySelectorAll('#rate-pending tr[data-pending]')]
    .map(tr => [...tr.children].slice(1, 4).map(td => td.textContent.trim())));
  check('the jobs with no price are Pending, above the groups, saying where and which side bar',
    pend, [['Racun Rumput', 'Pre Nursery', 'Its own entry'], ['Siram Air', 'Pre & Main Nursery', 'Under Weeding']]);
  check('a job that has a rate is not pending, and its Used For names it',
    await page.evaluate(() => [...document.querySelectorAll('#rate-groups tr')].some(tr =>
      /Already Priced/.test(tr.textContent) && !tr.dataset.pending && /Already Priced\s*$/.test(tr.children[4] ? tr.children[4].textContent.trim() : ''))),
    true);
  check('the pending block comes before the groups',
    await page.evaluate(() => { const g = document.getElementById('rate-groups'); return g.firstElementChild && g.firstElementChild.id; }),
    'rate-pending');
  await page.evaluate(() => { const b = document.querySelector('#rate-pending tr[data-pending="cj_a1"] button'); if (b) b.click(); });
  await page.waitForTimeout(200);
  check('Set price opens Add Job filled in: the name, Used For the job, filed under PN',
    await page.evaluate(() => [document.getElementById('rate-modal').classList.contains('open'),
      document.getElementById('rf-job').value, document.getElementById('rf-cat').value,
      document.getElementById('rate-modal-title').textContent]),
    [true, 'Racun Rumput', 'cj_a1', 'Add Job — PN — Pre Nursery']);
  check('no page errors', errs, []);
  await page.close();

  const none = await boot(browser, { __missing: ['nops_maint_config'], mjmnpayroll_piece_rates: [] });
  await none.page.evaluate(() => { try { openSettings('rate'); } catch (_) {} });
  await none.page.waitForTimeout(300);
  check('a config table that cannot be read draws no Pending block and no error',
    [await none.page.evaluate(() => !!document.getElementById('rate-pending')), none.errs], [false, []]);
  console.log('— 2. a CHECKED row reaches the claim; with no rate it is listed and not paid');
  {
    const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date(); const M = `${MS[now.getMonth()]} ${now.getFullYear()}`;
    const SI = { key: 'cj_si1', label: 'Seedlings Incentive', desc: 'Transfer seedling to big polybag',
      sidebar: false, under: 'transplanting', attach: 'separate', rows: 'tp_nursery', cols: {}, split: 'equal' };
    const base = (rates) => ({
      nops_maint_config: [{ key: 'custom_jobs', txt_value: JSON.stringify([SI]) }],
      mjmnpayroll_workers: [{ id: 1, full_name: 'Andi', section: 'BNN', active: true }, { id: 2, full_name: 'Ayub', section: 'BNN', active: true }],
      mjmnpayroll_piece_rates: rates,
      nops_custom_job_rows: [
        { job_key: 'cj_si1', month: M, nursery: 'BNN', row_key: 'nursery', qty: 2450, workers: { Andi: 1, Ayub: 1 }, checked_at: '2026-11-20T00:00:00Z' },
        { job_key: 'cj_si1', month: M, nursery: 'UNN1', row_key: 'nursery', qty: 999, workers: { Andi: 1 }, checked_at: null }]
    });
    const read = (page) => page.evaluate(() => {
      try { switchSub('transpl'); } catch (_) {}
      const c = document.querySelector('#sub-transpl .cj-claim');
      if (!c) return 'no section';
      return { head: c.querySelector('.cj-claim-head').textContent.replace(/\s+/g, ' ').trim(),
               underCull: (() => { const w = document.getElementById('cull-inc-wrap'); return !!w && w.nextElementSibling === c.parentNode; })(),
               rows: [...c.querySelectorAll('tbody tr')].map(tr => [...tr.children].slice(1).map(td => td.textContent.trim())),
               norate: !!c.querySelector('.cj-norate'),
               monthly: monthlyRows('').filter(r => r.transpl).map(r => [r.name, r.transpl]) };
    });
    const a = await boot(browser, base([]));
    await a.page.waitForTimeout(400);
    const ga = await read(a.page);
    check('the checked row is on the Transplanting claim, the unchecked one is not', ga.rows,
      [['Andi', '1,225', '—', '—'], ['Ayub', '1,225', '—', '—']]);
    check('…headed like Culling Monitoring', ga.head, 'Seedlings Incentive — Checked — BNN — Batu Niah · November 2026');
    check('…in a section of its own directly under Culling Monitoring', ga.underCull, true);
    check('…and with no piece rate it says so and pays nothing', [ga.norate, ga.monthly], [true, []]);
    check('no page errors', a.errs, []);
    await a.page.close();

    const b = await boot(browser, base([{ id: 9, job_desc: 'Seedlings Incentive', unit: 'Seedling', rate: 0.02, category: 'cj_si1', group_code: 'MN', active: true }]));
    await b.page.waitForTimeout(400);
    const gb = await read(b.page);
    check('once the rate is set it prices: 1,225 at RM 0.02 is RM 24.50 each', gb.rows,
      [['Andi', '1,225', '0.02', '24.50'], ['Ayub', '1,225', '0.02', '24.50']]);
    check('…the note goes, and the Monthly Payroll carries it in Transplanting', [gb.norate, gb.monthly],
      [false, [['Andi', 24.5], ['Ayub', 24.5]]]);
    check('no page errors', b.errs, []);
    await b.page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
