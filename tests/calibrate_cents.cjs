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
    window.jspdf = { jsPDF: class { constructor() {} save() {} } };
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

/* The transplanting cell of the worker's row — the last Total (RM) column. */
const CELL = '#transpl-table tbody tr:first-child td:nth-child(10)';
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

  console.log('\nThe buttons on the cell');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    const cell = await page.$eval(CELL, (td) => ({
      text: (td.textContent || '').replace(/\s+/g, ' ').trim(),
      buttons: [...td.querySelectorAll('.cal-btn')].map((b) => b.textContent.trim()),
      titles: [...td.querySelectorAll('.cal-btn')].map((b) => b.title)
    }));
    checkTrue('the cell shows what the sheet worked out', cell.text.startsWith('RM 250.00'));
    check('…with a minus and a plus beside it', cell.buttons, ['−', '+']);
    check('…which say what they do', cell.titles, ['Take RM 0.01 off', 'Add RM 0.01']);
    checkFalse('and no pencil, which is what they replaced', /✎/.test(cell.text));

    const money = await page.$$eval('#transpl-table tbody tr:first-child td.money', (tds) =>
      tds.map((td) => ({ txt: (td.textContent || '').replace(/\s+/g, ' ').trim(),
                         n: td.querySelectorAll('.cal-btn').length })));
    check('every one of the four jobs has them, not just the first',
          money.slice(0, 4).map((m) => m.n), [2, 2, 2, 2]);
    /* The subtotal is the four added up. A stepper on it would have nowhere
       to put the cent — which job did it go on? — so it does not get one. */
    check('…and the subtotal does not, because it is the four added up',
          money[money.length - 1].n, 0);
    checkTrue('…which is the subtotal', /880\.00/.test(money[money.length - 1].txt));
    await page.close();
  }

  console.log('\nOne press is one cent');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    await press(page, '+');
    check('the cell goes up by a cent', await cellText(page), 'RM 250.01');
    check('…and the worker’s name says so', await calLine(page), 'calibrate RM0.01');

    await press(page, '+', 2);
    check('three presses, three cents', await cellText(page), 'RM 250.03');
    check('…counted under the name', await calLine(page), 'calibrate RM0.03');

    await press(page, '-', 4);
    check('and down the other way, past where it started', await cellText(page), 'RM 249.99');
    check('…which reads as a minus', await calLine(page), 'calibrate -RM0.01');

    console.log('\n…and the sheet follows it');
    const foot = await page.$eval('#transpl-table tfoot tr', (tr) =>
      [...tr.children].map((td) => (td.textContent || '').trim()));
    checkTrue('the grand total is the calibrated figure, not the worked-out one',
              foot.join(' ').includes('249.99'));

    console.log('\nStepping back onto the sheet’s own figure');
    await press(page, '+');
    check('the cell is back where it started', await cellText(page), 'RM 250.00');
    check('…and the line under the name goes, rather than reading RM0.00',
          await calLine(page), null);
    await page.close();
  }

  console.log('\nWhat reaches the database');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    await press(page, '+', 5);
    const during = await page.evaluate(() => window.__WRITES.length);
    check('five presses in a row write NOTHING while the pressing goes on',
          during, 0);

    await page.waitForFunction(() => window.__WRITES.length > 0, { timeout: 5000 });
    await page.waitForTimeout(300);
    const w = await page.evaluate(() => window.__WRITES);
    check('…then one write, once it stops', w.length, 1);
    check('…of the figure it ended on', w[0].row.amount, 250.05);
    check('…as an ordinary earn adjustment', [w[0].table, w[0].op],
          ['mjmnpayroll_earn_adjustments', 'upsert']);
    check('…against this worker and this job',
          [w[0].row.worker_name, w[0].row.work_code, w[0].row.sheet, w[0].row.section],
          [WORKER, 'transplanting', 'transplanting', 'UNN2']);
    check('…in this month', w[0].row.month, YM);
    checkTrue('…carrying a reason, which the table requires',
              /Calibrated to the cent/.test(w[0].row.reason)
              && /250\.00/.test(w[0].row.reason));
    checkTrue('…and who did it', /elon/i.test(String(w[0].row.adjusted_by || '')));

    console.log('\n…and stepping all the way back removes the row');
    await page.evaluate(() => { window.__WRITES = []; });
    await press(page, '-', 5);
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

  console.log('\nThe cell is still the way to the full form');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    await press(page, '+');
    checkFalse('pressing a button does NOT open the adjustment form',
               await page.evaluate(() =>
                 document.getElementById('adjust-modal').classList.contains('open')));
    await page.click(CELL, { position: { x: 20, y: 10 } });
    checkTrue('clicking the amount still does',
              await page.evaluate(() =>
                document.getElementById('adjust-modal').classList.contains('open')));
    check('…carrying the calibrated figure, not the worked-out one',
          await page.$eval('#adj-amount', (el) => el.value), '250.01');
    await page.close();
  }

  console.log('\nWhere it refuses');
  {
    const page = await boot(browser, JSON.parse(JSON.stringify(DB)));
    // Nothing is paid below nothing.
    const low = await page.evaluate(() => {
      calibrateStep('transplanting', 'transpl', 'UNN2', 'Ali Bin Hassan', 'lining', 0, -1);
      const a = earnAdjForTest ? null : null;
      return (window.__DB.mjmnpayroll_earn_adjustments || []).length;
    }).catch(() => 0);
    check('a cell worth nothing cannot be stepped below nothing', low, 0);

    /* The permission is asked again at the press, not only when the cell was
       drawn — the two must not be able to disagree. */
    const refused = await page.evaluate(() => {
      let said = null;
      const a = window.alert; window.alert = (m) => { said = m; };
      const real = window.mayAdjust;
      window.mayAdjust = () => false;
      calibrateStep('transplanting', 'transpl', 'UNN2', 'Ali Bin Hassan', 'transplanting', 250, 1);
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
    await press(page, '+', 2);
    check('the screen shows it straight away', await cellText(page), 'RM 250.02');
    await page.waitForFunction(() => (window.__ALERTS || []).length > 0, { timeout: 5000 });
    await page.waitForTimeout(200);
    checkTrue('…and says so when it does not save',
              await page.evaluate(() => /did not save/i.test(window.__ALERTS[0] || '')));
    check('…and puts the cell back to what the database actually holds',
          await cellText(page), 'RM 250.00');
    check('…with nothing left under the name', await calLine(page), null);
    await page.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
