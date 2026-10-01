/* What was transplanted, plot by plot, and the nursery's total under it.

   The salary claim says what each worker is owed. It could not say how many
   seedlings went into a plot, and adding it up would not have answered that
   either: a plot carries FOUR jobs — blanket spray, lining, polybag filling,
   transplanting — and every one of them records the same figure, the number
   the operation report says went into that plot. Add the four and the
   nursery reports at four times its size.

   So this table counts each plot once, from its newest record, and totals
   the nursery at the foot. It is also the only place a plot shows when
   nobody was credited on it, because a record with no crew produces no claim
   line at all.

   Driven on the real page: fixtures into the stub, the circle clicked, the
   table read.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/transplant_by_plot.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }
function checkFalse(name, got) { check(name, !!got, false); }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _now  = new Date();
const YM    = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
const MONTH = `${MONTHS[_now.getMonth()]} ${_now.getFullYear()}`;
const JOBS  = ['blanket_spray', 'lining', 'polybag_fill', 'transplanting'];

const rec = (o) => Object.assign({
  work_date: `${YM}-09`, nursery_name: 'UNN 2', plot_name: 'N3',
  batch_name: '252', work_type: 'transplanting', jenis: 'Memindah anak sawit ke polibeg besar',
  schedule_month: MONTH, source_qty: 6685, workers: [{ name: 'Ali Bin Hassan', qty: null }],
  total_qty: null
}, o);

/* N3 — the whole plot, all four jobs, every one carrying the plot's 6,685.
   N7 — one job, 900, and NOBODY named on it.
   N9 — two jobs keyed against different figures; the newer one is 1,300.
   B3 — another nursery's, which must not be in UNN 2's total.          */
const FIELD = [
  ...JOBS.map((k, i) => rec({ work_type: k, work_date: `${YM}-0${i + 3}` })),
  rec({ plot_name: 'N7', work_type: 'lining', source_qty: 900, batch_name: '253', workers: [] }),
  rec({ plot_name: 'N9', work_type: 'lining',        source_qty: 1200, work_date: `${YM}-10` }),
  rec({ plot_name: 'N9', work_type: 'transplanting', source_qty: 1300, work_date: `${YM}-18` }),
  rec({ nursery_name: 'BNN', plot_name: 'B3', source_qty: 800, batch_name: '260' })
];

const REGISTER = [{ id: 1, full_name: 'Ali Bin Hassan', section: 'UNN2', status: 'active' }];

async function boot(browser, field) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((seed) => {
    window.__DB = seed;
    /* A recording jsPDF. The real one is on a blocked CDN, and what is being
       checked is what the form SAYS — every string it puts on the page, in
       order, with the page it landed on. */
    window.__PDF = null;
    window.jspdf = { jsPDF: class {
      constructor() { this.page = 1; this.lines = []; this.saved = null; window.__PDF = this; }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {}
      setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect() {} line() {}
      addPage() { this.page++; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.5; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { this.lines.push({ t: String(t), x, y, page: this.page }); }
      save(name) { this.saved = name; }
    } };
    function makeQuery(table) {
      const st = { eqs: [], single: false };
      const rows = () => {
        let out = (window.__DB[table] || []).slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return out;
      };
      const run = () => {
        const out = rows();
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'insert' || p === 'upsert' || p === 'update' || p === 'delete')
          return () => ({ select: () => Promise.resolve({ data: [], error: null }),
                          eq: () => q, then: (a, b) => Promise.resolve({ data: [], error: null }).then(a, b) });
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
  }, { mjmnpayroll_workers: REGISTER, nops_transplant_field_records: field });

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
  await page.waitForFunction(() => typeof window.renderTransplantByPlot === 'function',
                             { timeout: 20000 });
  await page.click('[data-sub="transpl"]');
  await page.waitForFunction(() => {
    const t = document.getElementById('transpl-plots-table');
    return t && (t.textContent || '').trim().length > 0;
  }, { timeout: 15000 });
  return page;
}

async function pick(page, code) {
  await page.evaluate((c) => {
    const b = [...document.querySelectorAll('#transpl-section-pills .npill')]
      .find((x) => (x.dataset.code || '') === c);
    if (b) b.click();
  }, code);
  await page.waitForTimeout(150);
}

/* The table as rows of cells, and the footer on its own. */
const read = (page) => page.evaluate(() => {
  const t = document.getElementById('transpl-plots-table');
  const cells = (tr) => [...tr.children].map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim());
  return {
    head: (document.getElementById('transpl-plots-head').textContent || '').replace(/\s+/g, ' ').trim(),
    cols: [...t.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim()),
    body: [...t.querySelectorAll('tbody tr')].map(cells),
    foot: [...t.querySelectorAll('tfoot tr')].map(cells),
    note: (document.getElementById('transpl-plots-note').textContent || '').replace(/\s+/g, ' ').trim()
  };
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nA line per plot, under the nursery on the topbar');
  {
    const page = await boot(browser, FIELD);
    await pick(page, 'UNN2');
    const t = await read(page);

    checkTrue('the section is headed with the nursery and the month',
              t.head.includes('UNN2') && t.head.includes(MONTH));
    check('the columns — the plot and the amount, and nothing else to read '
        + 'past on the way to them', t.cols, ['No.', 'Plot', 'Transplanted']);

    check('three plots, in plot order', t.body.map((r) => r[1]), ['N3', 'N7', 'N9']);
    checkFalse('and not the other nursery’s',
               t.body.some((r) => r[1] === 'B3'));

    const n3 = t.body.find((r) => r[1] === 'N3');
    check('N3 IS ONE LINE, not four — its four jobs all carry the same figure',
          n3[2], '6,685');
    check('a plot with only one of its four jobs recorded still carries its '
        + 'quantity', t.body.find((r) => r[1] === 'N7')[2], '900');

    console.log('\nThe total under it');
    checkTrue('the footer is the nursery and the month',
              t.foot[0][0].includes('UNN2') && t.foot[0][0].includes(MONTH));
    check('IT IS THE PLOTS ADDED UP — 6,685 + 900 + 1,300', t.foot[0][1], '8,885');
    checkFalse('…not the four jobs added up, which would be four times the nursery',
               t.foot[0][1] === (6685 * 4 + 900 + 1300 * 2).toLocaleString());

    console.log('\nWhat the table says out loud');
    checkTrue('a plot whose jobs were keyed against different figures is named',
              /N9/.test(t.note) && /more than one figure/i.test(t.note));
    checkTrue('…with both figures', /1,200/.test(t.note) && /1,300/.test(t.note));
    check('…and the newest is the one counted',
          t.body.find((r) => r[1] === 'N9')[2].replace(/[^0-9,]/g, ''), '1,300');
    checkTrue('a plot that names nobody is named too',
              /N7/.test(t.note) && /on no claim line/i.test(t.note));

    console.log('\nThe other nursery answers for itself');
    await pick(page, 'BNN');
    const b = await read(page);
    check('one plot', b.body.map((r) => r[1]), ['B3']);
    check('…and its own total', b.foot[0][1], '800');
    checkTrue('…headed with its own name', b.head.includes('BNN'));

    console.log('\nA nursery with nothing in it');
    await pick(page, 'UNN1');
    const u = await read(page);
    check('no rows', u.body.length, 1);
    checkTrue('…and it says which nursery and which month is empty',
              /Nothing transplanted/i.test(u.body[0][0])
              && u.body[0][0].includes('UNN1') && u.body[0][0].includes(MONTH));
    await page.close();
  }

  console.log('\nWhen nobody is credited at all');
  {
    /* The claim has no lines to show, and returns early. The plots are still
       the month's work, and this is the only place they appear. */
    const page = await boot(browser, FIELD.filter((r) => r.nursery_name === 'UNN 2')
      .map((r) => Object.assign({}, r, { workers: [] })));
    await pick(page, 'UNN2');
    const t = await read(page);
    check('the plots are still there', t.body.map((r) => r[1]), ['N3', 'N7', 'N9']);
    check('…and the total with them', t.foot[0][1], '8,885');
    const claim = await page.evaluate(() =>
      (document.getElementById('transpl-table').textContent || '').replace(/\s+/g, ' ').trim());
    checkTrue('…while the claim itself has nothing to pay', /name nobody/i.test(claim));
    await page.close();
  }

  console.log('\nA plot with no quantity on its record');
  {
    const page = await boot(browser, [rec({ plot_name: 'N5', source_qty: null })]);
    await pick(page, 'UNN2');
    const t = await read(page);
    check('it is listed', t.body.map((r) => r[1]), ['N5']);
    check('…with a dash rather than a nought', t.body[0][2], '—');
    check('…and adds nothing to the total', t.foot[0][1], '0');
    checkTrue('…which is said, not left to be noticed',
              /no quantity on the record/i.test(t.note));
    await page.close();
  }

  console.log('\nThe summary on the downloaded claim form');
  {
    const page = await boot(browser, FIELD);
    await pick(page, 'UNN2');
    const pdf = await page.evaluate(() => {
      downloadTransplantPDF();
      const d = window.__PDF;
      return d ? { lines: d.lines.map((l) => l.t), saved: d.saved,
                   pages: d.page } : null;
    });
    checkTrue('a file is produced', !!(pdf && pdf.saved));
    checkTrue('…named for the nursery and the month',
              /Salary_Claim_Transplanting_UNN2/.test(pdf.saved) && pdf.saved.includes(MONTH.split(' ')[0]));
    const txt = pdf.lines.join(' | ');
    checkTrue('the claim form is still the claim form',
              /SALARY CLAIM FORM/.test(txt) && /Grand Total/.test(txt));
    checkTrue('AND THE PLOT SUMMARY IS ON IT',
              /TRANSPLANTING BY PLOT/.test(txt));
    checkTrue('…headed with the nursery and the month',
              pdf.lines.some((l) => /TRANSPLANTING BY PLOT/.test(l)
                                 && /UNN2/.test(l) && l.includes(MONTH)));
    check('…its columns are the plot and the amount',
          ['No.', 'Plot', 'Transplanted'].filter((c) => pdf.lines.includes(c)),
          ['No.', 'Plot', 'Transplanted']);
    checkFalse('…and not the ones that came off the screen',
               pdf.lines.includes('Batch') || pdf.lines.includes('First worked')
               || pdf.lines.includes('Jobs'));
    checkTrue('every plot is on it',
              ['N3', 'N7', 'N9'].every((p) => pdf.lines.includes(p)));
    checkTrue('…with its amount', ['6,685', '900'].every((n) => pdf.lines.includes(n))
                               && pdf.lines.some((l) => l.indexOf('1,300') === 0));
    checkTrue('…and the nursery total under them',
              pdf.lines.some((l) => /^TOTAL — /.test(l) && /UNN2/.test(l))
              && pdf.lines.includes('8,885'));
    checkTrue('the plot keyed against two figures is marked and explained',
              pdf.lines.some((l) => /^\* N9/.test(l) && /more than one figure/.test(l)));
    checkTrue('…and the one that names nobody',
              pdf.lines.some((l) => /^N7 — names nobody/.test(l)));
    await page.close();
  }

  console.log('\nA month whose records name nobody still downloads');
  {
    const page = await boot(browser, FIELD.filter((r) => r.nursery_name === 'UNN 2')
      .map((r) => Object.assign({}, r, { workers: [] })));
    await pick(page, 'UNN2');
    const pdf = await page.evaluate(() => {
      window.__ALERT = null;
      const a = window.alert; window.alert = (m) => { window.__ALERT = m; };
      downloadTransplantPDF();
      window.alert = a;
      const d = window.__PDF;
      return { alert: window.__ALERT, lines: d ? d.lines.map((l) => l.t) : null,
               saved: d ? d.saved : null };
    });
    check('it is not refused', pdf.alert, null);
    checkTrue('a file is still produced', !!pdf.saved);
    checkTrue('…saying the claim is empty and why',
              pdf.lines.some((l) => /NOTHING TO CLAIM/.test(l) && /name nobody/.test(l)));
    checkTrue('…and carrying the plots that were worked',
              ['N3', 'N7', 'N9'].every((p) => pdf.lines.includes(p))
              && pdf.lines.includes('8,885'));
    await page.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
