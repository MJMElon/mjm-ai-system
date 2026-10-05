/* Nudging a claim cell by the cent, without opening a form.

   A plot's capacity divided among seven people does not land on a whole
   cent, so a cell comes out a penny or two from the field's own total and
   the header says "RM 0.03 OVER". Putting that right meant opening the
   adjustment form, typing a figure and writing a reason — for one cent.
   Which is why the cent never got nudged and the two totals never agreed.

   So every money cell now carries minus and plus, one press is RM 0.01, and
   what those presses come to shows under the worker's name. What gets
   written is an ordinary earn adjustment, so the monthly claim picks it up
   without having to know the difference.

   Driven on the real page: the real cells, the real presses, the real writes.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/calibrate_cents.cjs
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
const WORKER = 'Ali Bin Hassan';

/* One plot, 1,000 seedlings, one worker on all four jobs. At RM 0.25 the
   transplanting cell is RM 250.00, which is a round figure on purpose: the
   cents being added here have to be visible as cents. */
const JOBS = [
  { key: 'blanket_spray', desc: 'Menyembur rumput secara rata',      rate: 0.01 },
  { key: 'lining',        desc: 'Menyusun dan mengatur polibeg 15" X 18"', rate: 0.38 },
  { key: 'polybag_fill',  desc: 'Mengisi polibeg 15" X 18"',         rate: 0.24 },
  { key: 'transplanting', desc: 'Memindah anak sawit ke polibeg besar', rate: 0.25 }
];
const FIELD = JOBS.map((j, i) => ({
  work_date: `${YM}-0${i + 3}`, nursery_name: 'UNN 2', plot_name: 'N3',
  batch_name: '252', work_type: j.key, jenis: j.desc, schedule_month: MONTH,
  source_qty: 1000, total_qty: j.key === 'polybag_fill' ? 1000 : null,
  workers: [{ name: WORKER, qty: j.key === 'polybag_fill' ? 1000 : null }]
}));
const RATES = JOBS.map((j, i) => ({
  id: i + 1, job_desc: j.desc, rate: j.rate, unit: 'bag',
  category: 'transplanting', active: true
}));
const REGISTER = [{ id: 1, full_name: WORKER, section: 'UNN2', status: 'active' }];

async function boot(browser, db) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((seed) => {
    window.__DB = seed;
    window.__WRITES = [];
    window.__FAIL = false;
    /* A recording jsPDF. The real one is on a blocked CDN, and what is being
       checked is what the form SAYS. */
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
      const st = { eqs: [], single: false, op: 'select', row: null };
      const rows = () => {
        let out = (window.__DB[table] || []).slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return out;
      };
      const run = () => {
        if (st.op === 'upsert' || st.op === 'insert') {
          window.__WRITES.push({ table, op: 'upsert', row: JSON.parse(JSON.stringify(st.row)) });
          if (window.__FAIL) return { data: null, error: { message: 'stubbed failure' } };
          const base = (window.__DB[table] = window.__DB[table] || []);
          const same = (a, b) => ['month', 'sheet', 'section', 'worker_name', 'work_code']
            .every((k) => String(a[k] || '') === String(b[k] || ''));
          const i = base.findIndex((r) => same(r, st.row));
          if (i >= 0) base[i] = st.row; else base.push(st.row);
          return { data: null, error: null };
        }
        if (st.op === 'delete') {
          const gone = rows();
          window.__WRITES.push({ table, op: 'delete', n: gone.length,
                                 where: Object.fromEntries(st.eqs) });
          if (window.__FAIL) return { data: null, error: { message: 'stubbed failure' } };
          window.__DB[table] = (window.__DB[table] || []).filter((r) => !gone.includes(r));
          return { data: null, error: null };
        }
        const out = rows();
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'upsert' || p === 'insert') return (r) => { st.op = p; st.row = r; return q; };
        if (p === 'update') return () => q;
        if (p === 'delete') return () => { st.op = 'delete'; return q; };
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
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calibrateStep === 'function', { timeout: 20000 });
  await page.click('[data-sub="transpl"]');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#transpl-section-pills .npill')]
      .find((x) => x.dataset.code === 'UNN2');
    if (b) b.click();
  });
  await page.waitForFunction(() => {
    const t = document.getElementById('transpl-table');
    return t && /RM 250\.00/.test(t.textContent || '');
  }, { timeout: 15000 });
  return page;
}

/* The worker's row: capacity for transplanting is the 9th cell, the money
   worked out from it the 10th. */
const CELL = '#transpl-table tbody tr:first-child td:nth-child(9)';
const RM   = '#transpl-table tbody tr:first-child td:nth-child(10)';
const NAME = '#transpl-table tbody tr:first-child td:nth-child(2)';

const cellText = (page) => page.$eval(CELL, (td) =>
  (td.firstChild.textContent || '').trim());
const calLine = (page) => page.$eval(NAME, (td) => {
  const d = td.querySelector('.cal-line');
  return d ? (d.textContent || '').replace(/\s+/g, ' ').trim() : null;
});
const press = async (page, which, times) => {
  for (let i = 0; i < (times || 1); i++) {
    await page.click(`${CELL} .cal-btn:nth-child(${which === '+' ? 2 : 1})`);
    await page.waitForTimeout(40);
  }
};


(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const DB = { mjmnpayroll_workers: REGISTER, nops_transplant_field_records: FIELD,
               mjmnpayroll_piece_rates: RATES, mjmnpayroll_earn_adjustments: [] };

  console.log('\nWhere the buttons are, and where they are not');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    const row = await page.$$eval('#transpl-table tbody tr:first-child td', (tds) =>
      tds.map((td) => ({ txt: (td.textContent || '').replace(/\s+/g, ' ').trim(),
                         money: td.classList.contains('money'),
                         n: td.querySelectorAll('.cal-btn').length })));

    const caps = row.filter((c) => !c.money && /[0-9]/.test(c.txt) && c.txt !== '1');
    check('every capacity on the row has a minus and a plus',
          caps.map((c) => c.n), [2, 2, 2, 2]);
    check('…and the money worked out from them has none — one figure, one way '
        + 'to move it', row.filter((c) => c.money).map((c) => c.n), [0, 0, 0, 0, 0]);
    checkTrue('the money still offers the full adjustment form, as it always did',
              row.some((c) => c.money && /✎/.test(c.txt)));

    const foot = await page.$$eval('#transpl-table tfoot tr td',
      (tds) => tds.map((td) => td.querySelectorAll('.cal-btn').length));
    check('the Grand Total has none: it is the column added up, and it follows',
          foot, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await page.close();
  }

  console.log('\nOne press is one hundredth of a share');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    check('it starts as the field divided it out', await cellText(page), '1,000');
    check('…and the money is that times the rate',
          await page.$eval(RM, (td) => (td.firstChild.textContent || '').trim()), 'RM 250.00');

    await press(page, '-');
    check('one press takes a hundredth off the share', await cellText(page), '999.99');
    check('…and says so under the worker’s name', await calLine(page), 'calibrate -0.01');

    await press(page, '-', 3);
    check('four presses, four hundredths', await cellText(page), '999.96');
    check('…counted under the name', await calLine(page), 'calibrate -0.04');
    check('THE MONEY FOLLOWS THE SHARE IT IS WORKED OUT FROM',
          await page.$eval(RM, (td) => (td.firstChild.textContent || '').trim()), 'RM 249.99');

    const foot = await page.$$eval('#transpl-table tfoot tr td',
      (tds) => tds.map((td) => (td.textContent || '').trim()));
    check('…and so does the column total', foot[7], '999.96');
    check('…and the money total with it', foot[8], 'RM 249.99');

    await press(page, '+', 4);
    check('stepping back is where it started', await cellText(page), '1,000');
    check('…the money with it',
          await page.$eval(RM, (td) => (td.firstChild.textContent || '').trim()), 'RM 250.00');
    check('…and the line goes, rather than reading 0.00', await calLine(page), null);
    await page.close();
  }

  console.log('\nWhat reaches the database');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    await press(page, '-', 5);
    check('five presses in a row write NOTHING while the pressing goes on',
          await page.evaluate(() => window.__WRITES.length), 0);

    await page.waitForFunction(() => window.__WRITES.length > 0, { timeout: 5000 });
    await page.waitForTimeout(300);
    const w = await page.evaluate(() => window.__WRITES);
    check('…then one write, once it stops', w.length, 1);
    check('…of the share it ended on', w[0].row.amount, 999.95);
    check('…as an ordinary earn adjustment', [w[0].table, w[0].op],
          ['mjmnpayroll_earn_adjustments', 'upsert']);
    check('…against this worker, under a job code that cannot be a real one',
          [w[0].row.worker_name, w[0].row.work_code, w[0].row.sheet, w[0].row.section],
          [WORKER, 'cap:transplanting', 'transplanting', 'UNN2']);
    check('…in this month', w[0].row.month, YM);
    checkTrue('…carrying a reason in the right units, which the table requires',
              /the field divided out 1,000/.test(w[0].row.reason)
              && !/RM/.test(w[0].row.reason));
    checkTrue('…and who did it', /elon/i.test(String(w[0].row.adjusted_by || '')));

    console.log('\n…and stepping all the way back removes the row');
    await page.evaluate(() => { window.__WRITES = []; });
    await press(page, '+', 5);
    await page.waitForFunction(() => window.__WRITES.length > 0, { timeout: 5000 });
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => window.__WRITES);
    check('one write', back.length, 1);
    check('…and it is a DELETE, not an adjustment to the same number',
          back[0].op, 'delete');
    check('…leaving nothing behind',
          await page.evaluate(() => (window.__DB.mjmnpayroll_earn_adjustments || []).length), 0);
    await page.close();
  }

  console.log('\nThe money cell is untouched by any of this');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    await press(page, '-');
    checkFalse('pressing a capacity button does not open the adjustment form',
               await page.evaluate(() =>
                 document.getElementById('adjust-modal').classList.contains('open')));
    await page.click(RM, { position: { x: 20, y: 10 } });
    checkTrue('clicking the money still does',
              await page.evaluate(() =>
                document.getElementById('adjust-modal').classList.contains('open')));
    await page.close();
  }

  console.log('\nWhere it refuses');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    const empty = await page.$$eval('#transpl-table tbody tr:first-child td', (tds) =>
      tds.filter((td) => (td.textContent || '').trim() === '—')
         .map((td) => td.querySelectorAll('.cal-btn').length));
    checkTrue('a share the field never divided out has nothing to nudge',
              empty.every((n) => n === 0));

    /* The permission is asked again at the press, not only when the cell was
       drawn — the two must not be able to disagree. */
    const refused = await page.evaluate(() => {
      let said = null;
      const a = window.alert; window.alert = (m) => { said = m; };
      const real = window.mayAdjust;
      window.mayAdjust = () => false;
      calibrateStep('transplanting', 'transpl', 'UNN2', 'Ali Bin Hassan',
                    'cap:transplanting', 1000, 1);
      window.mayAdjust = real; window.alert = a;
      return said;
    });
    checkTrue('…and somebody without the tick is told why, not ignored',
              /permission/i.test(String(refused || '')));
    await page.close();
  }

  console.log('\nWhen the write fails');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    await page.evaluate(() => {
      window.__FAIL = true;
      window.__ALERTS = [];
      window.alert = (m) => { window.__ALERTS.push(m); };
    });
    await press(page, '-', 2);
    check('the screen shows it straight away', await cellText(page), '999.98');
    await page.waitForFunction(() => (window.__ALERTS || []).length > 0, { timeout: 5000 });
    await page.waitForTimeout(200);
    checkTrue('…and says so when it does not save',
              await page.evaluate(() => /did not save/i.test(window.__ALERTS[0] || '')));
    check('…and puts the cell back to what the database actually holds',
          await cellText(page), '1,000');
    check('…with nothing left under the name', await calLine(page), null);
    await page.close();
  }

  console.log('\nWhat the printed claim form carries');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    const pdfOf = () => page.evaluate(() => {
      window.__PDF = null;
      downloadTransplantPDF();
      return window.__PDF ? window.__PDF.lines.map((l) => l.t) : null;
    });

    const before = await pdfOf();
    checkTrue('with nothing calibrated the form says nothing about it',
              !before.some((l) => /calibrate/.test(l)));
    checkTrue('…and the worker is on it', before.includes(WORKER));

    await press(page, '-', 4);
    await page.waitForTimeout(50);
    const after = await pdfOf();
    checkTrue('THE PAPER SAYS IT TOO, under the name',
              after.includes('calibrate -0.04'));
    checkTrue('…the worker is still named above it', after.includes(WORKER));
    checkTrue('…and the figures printed are the calibrated ones',
              after.includes('999.96') && after.includes('RM 249.99'));
    await page.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
