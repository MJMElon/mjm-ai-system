/* The Seed Planting tab on the Nursery Payroll prices what Work Maintenance
   CHECKED, and nothing else.

   The office: "种一粒种子是RM0.02, 图一只show qty, after checked, 这份表格会
   flow 去图二, 新加一个tab - seed planting", then "tab里面才会有价钱". So the
   quantities are keyed on Work Maintenance with no money on them, a batch is
   Checked there, and this tab is where the money first appears. A batch keyed
   and not checked is NAMED, because a claim short of work reads exactly like
   a quiet month.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/seed_planting_is_paid_when_checked.cjs
   with a static server on 8777 serving the repository root.               */
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
  page.on('dialog', (d) => d.accept().catch(() => {}));
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
  await page.click('[data-sub="seedplant"]');
  await page.waitForFunction(() => !/Loading/.test(document.getElementById('seedplant-table').textContent || 'Loading'),
                             { timeout: 15000 });
  return { page, errs };
}

/* THE BATCH HEADING CARRIES TWO LINES — the batch and the day it was
   planted — so its textContent runs them together ("Batch 27728 Sep"). The
   day is read on its own rather than tidied out of the way: it is the fact
   the COLUMNS are ordered by, and a check that threw it away would pass over
   a sheet that had stopped showing it. */
const read = (page) => page.evaluate(() => {
  const t = document.getElementById('seedplant-table');
  const cells = (tr) => [...tr.children].map(td => td.textContent.trim());
  const heads = [...t.querySelectorAll('thead th')].map(th => {
    const day = th.querySelector('.sp-day');
    return (day ? th.textContent.replace(day.textContent, '') : th.textContent).trim();
  });
  return {
    head: heads,
    body: [...t.querySelectorAll('tbody tr')].map(cells),
    days: [...t.querySelectorAll('thead .sp-day')].map(d => d.textContent.trim()),
    foot: [...t.querySelectorAll('tfoot tr')].map(cells),
    note: document.getElementById('seedplant-note').textContent.replace(/\s+/g, ' ').trim()
  };
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ── 1. The tab is there, between Loading Seedlings and Monthly Payroll ──
  const a = await boot(browser, { nops_seed_planting_batch_workers: RECS, mjmnpayroll_piece_rates: [] });
  check('the Seed Planting tab sits before Transplanting', await a.page.evaluate(() =>
    [...document.querySelectorAll('.subtab')].map(b => b.dataset.sub)),
    ['maint', 'seedplant', 'transpl', 'seedling', 'monthly', 'other']);

  /* ── 2. A PLANTER A ROW, A BATCH A COLUMN ───────────────────────────────
     It was turned over for a day — *"我要横向的 batch是row 工人是column"* —
     and the office looked at it and asked for it back in the plainest words
     there are: *"算了做回之前的 batch和人名交换"*. They are the ones reading
     it. The one thing kept from the turn is the planted DAY, which moved up
     into the batch's own heading: the columns are in date order and the day
     is what says why. */
  let v = await read(a.page);
  check('a column per BATCH, with the worker down the side', v.head,
    ['Worker', 'Batch 277', 'Batch 278', 'Seeds planted', 'Rate', 'Amount']);
  check('a row per PLANTER, their own total, times RM 0.02', v.body, [
    ['Ani',  '—',     '2,000', '2,000', 'RM 0.02', 'RM 40.00'],
    ['Rina', '1,760', '—',     '1,760', 'RM 0.02', 'RM 35.20'],
    ['Siti', '2,000', '1,000', '3,000', 'RM 0.02', 'RM 60.00']]);
  check('…and the planted day rides in the batch HEADING, which is what the columns order on',
    v.days, ['28 Sep', '05 Oct']);
  check('one foot row: each batch’s total, the grand total and the money', v.foot, [
    ['Total', '3,760', '3,000', '6,760', '', 'RM 135.20']]);
  check('…and the Amount column adds up to the total in the foot',
    await a.page.evaluate(() => {
      const rm = s => Number(String(s).replace(/[^0-9.]/g, '')) || 0;
      const rows = [...document.querySelectorAll('#seedplant-table tbody tr')];
      const paid = rows.reduce((s, tr) => s + rm(tr.children[tr.children.length - 1].textContent), 0);
      const f = document.querySelector('#seedplant-table tfoot tr');
      /* Answers rather than throwing: a sheet with no foot has to FAIL this
         as a named check, not take the run down. */
      if (!f) return [Math.round(paid * 100) / 100, 'no foot'];
      return [Math.round(paid * 100) / 100, rm(f.children[f.children.length - 1].textContent)];
    }),
    [135.2, 135.2]);
  check('the unchecked batch is named, not paid', /Not on this claim: batch 279 is keyed and not yet Checked/.test(v.note), true);
  check('with no rate set the default is said to be the default', /RM 0.02 a seed, the default/.test(v.note), true);
  check('this page writes nothing', await a.page.evaluate(() => (window.__WRITES || []).filter(w => w.startsWith('nops_seed'))), []);

  /* ── 2b. THE VERIFY STRIP AND THE TWO BUTTONS ───────────────────────────
     The office asked for both in the line that asked for the turn. The strip
     is the one every other claim sheet carries; the scope is the PRE NURSERY
     and not "all sections", because seed planting is only ever done there
     and a strip offering a choice that does not exist is a question. */
  check('the sheet has a verify strip, scoped to the Pre Nursery',
    await a.page.evaluate(() => {
      const el = document.getElementById('vb-seedplant');
      /* Null-safe for the same reason the PDF reader below is: a sheet with
         no strip at all has to FAIL this check, not kill the run. */
      return [!!el, el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : 'no strip'];
    }),
    [true, 'Open — Seed Planting · the Pre Nursery · ' +
      (() => { const d = new Date(); const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
               return `${M[d.getMonth()]} ${d.getFullYear()}`; })() +
      '\u2714 Verify & lock']);
  check('…and Print and Download are both offered',
    await a.page.evaluate(() => [
      !!document.querySelector('#sub-seedplant [onclick="printSeedPlantingPDF()"]'),
      !!document.querySelector('#sub-seedplant [onclick="downloadSeedPlantingPDF()"]')]),
    [true, true]);
  /* ── 2c. THE CLAIM FORM, AND IT IS THE SAME TABLE ───────────────────────
     One builder, two buttons — Download saves it, Print calls the browser's
     own dialog on the same document. Two drawings of one report drift, and a
     printed sheet that disagrees with the file beside it is a difference
     nobody can explain afterwards, which is the Seed Audit sheet's rule. */
  /* Null-safe: on a page with no such builder this has to read as a FAILED
     check and not as a crash in the harness — what the previous code DID is
     the whole argument for the change. */
  const pdfOf = (page, fn) => page.evaluate((f) => {
    window.__PDFS.length = 0;
    if (typeof window[f] !== 'function') return null;
    window[f]();
    const d = window.__PDFS[0];
    return d ? { saved: d.saved, printed: d.printed, fmt: d.opt && d.opt.format,
                 lines: d.lines.map(l => l.t) } : null;
  }, fn);
  const dl = await pdfOf(a.page, 'downloadSeedPlantingPDF');
  check('Download draws the form and names the file',
    [!!dl, dl && /^Salary_Claim_Seed_Planting_/.test(dl.saved || ''), dl && dl.printed],
    [true, true, false]);
  check('…and the paper is the screen’s table: a planter a row, a batch a column',
    dl && [dl.lines.includes('Worker'), dl.lines.includes('Siti'),
           dl.lines.includes('Batch 277\n28 Sep'),
           dl.lines.includes('Total'), dl.lines.includes('Amount (RM)'),
           dl.lines.includes('RM 135.20')],
    [true, true, true, true, true, true]);
  /* WHO CHECKED IT, beside who verified it — *"所以每次print出来 就可以显示
     check by谁 verify by 谁"*. They are two different signatures and the form
     carried only the second. A line, never a column: the office already took
     the dates-and-days table off this kind of form. */
  check('…and the paper says who CHECKED it as well as who verified it',
    dl && [dl.lines.some(t => /^Checked by /.test(t)),
           dl.lines.some(t => /^(Verified by |Not yet verified)/.test(t))],
    [true, true]);
  check('…the unchecked batch is named on the paper too',
    dl && dl.lines.some(t => /Not on this claim: batch 279/.test(t)), true);
  const pr = await pdfOf(a.page, 'printSeedPlantingPDF');
  check('Print draws the SAME document and saves nothing',
    [pr && pr.printed, pr && pr.saved, JSON.stringify(pr && pr.lines) === JSON.stringify(dl && dl.lines)],
    [true, null, true]);
  check('…and two batches still fit portrait A4', dl && dl.fmt, 'a4');
  check('no page errors', a.errs, []);
  /* SHOT gives the office the sheet as it stands. */
  if (process.env.SHOT) await a.page.locator('#sub-seedplant').screenshot({ path: process.env.SHOT });
  await a.page.close();

  /* ── 2d. A CREW TOO TALL FOR ONE PAGE GETS A SECOND, WITH ITS HEADINGS ──
     The sheet grows DOWN now: a planter is a row and a month can be worked
     by thirty of them. A second page of figures under no column headings is
     a page of numbers nobody can place, so the head is drawn again on every
     page — the rule the Work Maintenance and Transplanting claims already
     follow.

     AND NOTHING IS DRAWN INTO THE FOOTER BAND. That is the fault the Seed
     Audit sheet had to be corrected for after the office found a row eaten
     off the foot of page one, and it reads identically on paper: the row is
     there in the file and the printer trims it. */
  const many = {};
  for (let i = 0; i < 30; i++) many['Planter ' + String(i + 1).padStart(2, '0')] = 100;
  const w = await boot(browser, { mjmnpayroll_piece_rates: [],
    nops_seed_planting_batch_workers: [{ batch_name: '280', month: MONTH_KEY,
      planted_date: '2026-10-08', qty_planted: 3000, workers: many,
      checked_at: '2026-10-29T02:00:00Z', checked_by: 'office' }] });
  const tall = await w.page.evaluate(() => {
    window.__PDFS.length = 0;
    if (typeof window.downloadSeedPlantingPDF !== 'function') return null;
    window.downloadSeedPlantingPDF();
    const d = window.__PDFS[0];
    if (!d) return null;
    const pages = Math.max(...d.rects.map(r => r.page), ...d.lines.map(l => l.page));
    /* "Worker" is the first heading of the head band, so one per page is
       one head band per page. */
    const heads = d.lines.filter(l => l.t === 'Worker').map(l => l.page);
    /* The floor is 297 − 34. A cell drawn past it is in the band the
       signature and the footer note own. */
    const past = d.rects.filter(r => r.y + r.h > 297 - 34 + 0.01).length;
    return { pages, heads, past, fmt: d.opt && d.opt.format };
  });
  check('30 planters run onto a second page, and the headings go with them',
    tall && [tall.pages >= 2, tall.heads.length === tall.pages, tall.past],
    [true, true, 0]);
  check('…and two batches still fit the ordinary page', tall && tall.fmt, 'a4');
  check('…and it still draws: no jsPDF argument is NaN', w.errs, []);
  await w.page.close();

  // ── 3. A rate set on Piece Rate is the one used ──
  const b = await boot(browser, { nops_seed_planting_batch_workers: RECS,
    mjmnpayroll_piece_rates: [{ id: 9, job_desc: 'Seed Planting', unit: 'seed', rate: 0.025, category: 'seed_planting', group_code: 'PN', active: true, sort_order: 0 }] });
  v = await read(b.page);
  /* `at` rather than indexing straight in: a sheet of a different shape has
     to fail this as a named check and not take the run down with it. */
  const at = (grid, i, j) => ((grid || [])[i] || [])[j];
  check('the Piece Rate row prices it',
    [at(v.body, 0, 4), at(v.body, 0, 5), at(v.foot, 0, 5), at(v.foot, 0, 3)],
    ['RM 0.025', 'RM 50.00', 'RM 169.00', '6,760']);
  check('…and the note names where the rate came from', /from Piece Rate \(Seed Planting\)/.test(v.note), true);
  await b.page.close();

  // ── 4. Nothing checked yet is not "nothing keyed" ──
  const c = await boot(browser, { nops_seed_planting_batch_workers: RECS.map(r => Object.assign({}, r, { checked_at: null })),
                                  mjmnpayroll_piece_rates: [] });
  v = await read(c.page);
  check('a month keyed and unchecked says Nothing is Checked yet', /Nothing is Checked yet/.test(v.body[0][0]), true);
  await c.page.close();

  // ── 5. Before the SQL is run, the tab says which file ──
  const d = await boot(browser, { __missing: ['nops_seed_planting_batch_workers'], mjmnpayroll_piece_rates: [] });
  v = await read(d.page);
  check('a missing table says so and names the file', [/Could not read/.test(v.body[0][0]), /RUN_ME_seed_planting_workers\.sql/.test(v.note)], [true, true]);
  await d.page.close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
