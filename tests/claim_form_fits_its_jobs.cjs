/* A CLAIM FORM HAS AS MANY COLUMNS AS THERE ARE JOBS.

   The Work Maintenance claim laid itself out with eleven numbers typed in a
   row — No, Worker, four pairs of Capacity and Total, Subtotal — which was
   right for exactly as long as there were four jobs. **Loading Seedlings
   made five.** The fifth pair asked for COL[11] on a list of eleven, X[11]
   came back undefined, and jsPDF answered

       Invalid arguments passed to jsPDF.rect

   so the button did nothing at all. The form had been unprintable since the
   day that job was added, and nothing anywhere said so: the error went to a
   console nobody has open.

   Two things are needed to catch that, and the second is the one that was
   missing:

     · the columns must be COUNTED off the job list, not typed; and
     · the fake jsPDF the tests drive has to REFUSE a bad argument the way
       the real one does. A stub whose rect() takes anything will sign off a
       form that cannot be drawn.

   So this one is strict: every co-ordinate is checked, and the page is
   driven with a job added at run time — the real regression, not a
   description of it.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/claim_form_fits_its_jobs.cjs
   with a static server on 8777 serving the repository root.
*/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const PAY = fs.readFileSync(path.join(__dirname, '..', 'npayroll', 'npayroll_script.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _now  = new Date();
const YM    = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
const MONTH = `${MONTHS[_now.getMonth()]} ${_now.getFullYear()}`;
const WORKER = 'Ali Bin Hassan';

const JOBS = [
  { key: 'blanket_spray', desc: 'Menyembur rumput secara rata',           rate: 0.01 },
  { key: 'lining',        desc: 'Menyusun dan mengatur polibeg 15" X 18"', rate: 0.38 },
  { key: 'polybag_fill',  desc: 'Mengisi polibeg 15" X 18"',              rate: 0.24 },
  { key: 'transplanting', desc: 'Memindah anak sawit ke polibeg besar',   rate: 0.25 }
];
const DB = {
  mjmnpayroll_workers: [{ id: 1, full_name: WORKER, section: 'UNN2', status: 'active' }],
  nops_transplant_field_records: JOBS.map((j, i) => ({
    work_date: `${YM}-0${i + 3}`, nursery_name: 'UNN 2', plot_name: 'N3',
    batch_name: '252', work_type: j.key, jenis: j.desc, schedule_month: MONTH,
    source_qty: 1000, total_qty: null, workers: [{ name: WORKER, qty: null }]
  })),
  mjmnpayroll_piece_rates: JOBS.map((j, i) => ({
    id: i + 1, job_desc: j.desc, rate: j.rate, unit: 'bag', category: 'transplanting', active: true
  }))
};

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => { errs.push('ALERT: ' + d.message()); d.dismiss(); });

  await page.addInitScript((seed) => {
    window.__DB = seed;
    window.__PDFS = [];
    /* A STRICT jsPDF. Every co-ordinate is a finite number or the call is
       refused, exactly as the real library refuses it — which is the whole
       point of this harness. The previous stub took anything, which is why
       a form that could not be drawn passed every test there was. */
    const fin = (v) => typeof v === 'number' && isFinite(v);
    function guard(method, args) {
      args.forEach((a, i) => {
        if (!fin(a)) throw new Error('Invalid arguments passed to jsPDF.' + method
                                   + ' (argument ' + (i + 1) + ' is ' + String(a) + ')');
      });
    }
    window.jspdf = { jsPDF: class {
      constructor() { this.page = 1; this.lines = []; this.rects = []; this.saved = null; window.__PDFS.push(this); }
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
      save(name) { this.saved = name; }
    } };
    function makeQuery(table) {
      const st = { eqs: [], single: false };
      const rows = () => {
        let out = (window.__DB[table] || []).slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return out;
      };
      const run = () => { const o = rows(); return st.single ? { data: o[0] || null, error: null } : { data: o, error: null }; };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
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
  await page.waitForFunction(() => typeof window.downloadMaintPDF === 'function', { timeout: 20000 });
  await page.waitForTimeout(1500);
  /* Put a worker on the Work Maintenance sheet for the nursery being printed.
     Who ends up on it is resolved from the register by rules this harness is
     not about -- claim_pays_checked_only drives those -- and an empty sheet
     refuses to print at all, which would make every check below pass by
     printing nothing. */
  await page.evaluate((who) => {
    const sel = document.getElementById('maint-nursery');
    if (sel) sel.value = 'UNN2';
    maint.rows    = maint.rows    || {};
    maint.workers = maint.workers || {};
    maint.rows.UNN2    = [{ full_name: who, active: true }];
    maint.workers.UNN2 = [who];
  }, WORKER);
  return { page, errs };
}

/* Runs one builder and reports what came back rather than throwing. */
const run = (page, fn) => page.evaluate(async (name) => {
  try {
    await window[name]();
    const d = (window.__PDFS || [])[window.__PDFS.length - 1];
    return { ok: true, saved: d && d.saved, pages: d && d.page, rects: d ? d.rects.length : 0 };
  } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
}, fn);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nThe columns are counted off the job list, never typed out');
  /* Eleven numbers in a row is the shape the bug had. Neither claim may
     carry one again, whichever job somebody adds next. */
  checkTrue('no claim form hard-codes its column widths',
            !/const COL = \[11, 47, 17, 23, 17, 23, 17, 23, 17, 23, 29\]/.test(PAY));
  checkTrue('Work Maintenance divides the room by its own job count',
            /const PAIR_W = \(PAGE_W - MARGIN \* 2 - W_NO - W_WORKER - W_SUB\) \/ MAINT_TYPES\.length;/.test(PAY));
  checkTrue('and Transplanting by its own',
            /const PAIR_W = \(PAGE_W - MARGIN \* 2 - W_NO - W_WORKER - W_SUB\) \/ TRANSPLANT_JOBS\.length;/.test(PAY));
  checkTrue('the bands divide by the count too',
            (PAY.match(/const cardW = \(W - GAP \* \(N - 1\)\) \/ N/g) || []).length === 2);
  /* Four jobs has to give back exactly what was typed before, or this is a
     redesign wearing a bug fix's clothes. */
  const pairW = (297 - 50 - 11 - 47 - 29) / 4;
  check('four jobs gives the old widths back exactly',
        [pairW, pairW * 0.425, pairW - pairW * 0.425], [40, 17, 23]);

  console.log('\nEvery claim form draws, with the five jobs the office has');
  {
    const { page, errs } = await boot(browser);
    const n = await page.evaluate(() => MAINT_TYPES.length);
    check('Work Maintenance has five jobs, not four', n, 5);
    check('and a worker on its sheet, so the form is actually drawn',
          await page.evaluate(() => maintWorkerNames($('maint-nursery').value, monthValue()).length), 1);
    const maint = await run(page, 'downloadMaintPDF');
    checkTrue('the Work Maintenance form is produced', maint.ok);
    if (!maint.ok) console.log('         ' + maint.err);
    checkTrue('…and saved under its own name', /Work_Maintenance/.test(maint.saved || ''));
    checkTrue('…having actually drawn a table', (maint.rects || 0) > 20);

    const transpl = await run(page, 'downloadTransplantPDF');
    checkTrue('the Transplanting form is produced', transpl.ok);
    if (!transpl.ok) console.log('         ' + transpl.err);

    const monthly = await run(page, 'downloadMonthlyPDF');
    // Nothing earned is a legitimate refusal and says so on screen.
    checkTrue('the Monthly Payroll either prints or says why',
              monthly.ok || /Nothing earned/i.test(errs.join(' ')));
    /* "Nothing earned" and "nothing recorded" are the sheets saying so out
       loud, which is right. Anything else reaching a dialog is a fault. */
    check('nothing was thrown past the button',
          errs.filter(e => !/^ALERT: (Nothing earned|Nothing recorded)/.test(e)), []);
    await page.close();
  }

  console.log('\nAnd it keeps drawing when the office adds a sixth job');
  /* The regression itself, not a description of it: this is what adding
     Loading Seedlings did, and it must not be able to do it again. */
  {
    const { page } = await boot(browser);
    await page.evaluate(() => {
      MAINT_TYPES.push({ code: 'fencing', label: 'Fencing', unit: 'Bag',
                         jenis: 'Memagar', mark: ['fencing'] });
    });
    const maint = await run(page, 'downloadMaintPDF');
    checkTrue('six jobs still produce a form', maint.ok);
    if (!maint.ok) console.log('         ' + maint.err);
    await page.close();
  }
  {
    const { page } = await boot(browser);
    await page.evaluate(() => {
      TRANSPLANT_JOBS.push({ key: 'potting', jenis: 'Memasu', label: 'Potting', mark: ['potting'] });
    });
    const transpl = await run(page, 'downloadTransplantPDF');
    checkTrue('and so does a fifth transplanting job', transpl.ok);
    if (!transpl.ok) console.log('         ' + transpl.err);
    await page.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
