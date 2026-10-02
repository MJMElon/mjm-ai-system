/* An empty transplanting claim has to say WHICH kind of empty it is.

   The sheet printed "No transplanting recorded in the FC Portal for <month>"
   for five different situations, and only one of them is "nothing was
   recorded". A Field Conductor who has spent the month keying records reads
   that sentence as the office losing his work.

   The one that matters most is a record with NOBODY NAMED on it: the claim
   pays per worker, so a crew of nobody divides into no lines at all, and the
   work and its quantity sit in the database saying nothing. This drives the
   real page through each situation and reads what the cell says.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/transplant_claim_empty.cjs
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
const _now = new Date();
const YM    = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
const MONTH = `${MONTHS[_now.getMonth()]} ${_now.getFullYear()}`;

const rec = (o) => Object.assign({
  work_date: `${YM}-09`, nursery_name: 'UNN 2', plot_name: 'N4',
  batch_name: null, work_type: 'transplant', jenis: 'Memindah anak benih',
  schedule_month: MONTH, source_qty: 1200, workers: [], total_qty: null
}, o);

/* The register. A worker's own section is what a line is filed under, which
   is the fifth situation: work on UNN 2's plots by somebody the register has
   in UNN 1. */
const REGISTER = [
  { id: 1, full_name: 'Ali Bin Hassan', section: 'UNN2', status: 'active' },
  { id: 2, full_name: 'Ramli Anak Juna', section: 'UNN1', status: 'active' }
];

async function boot(browser, db) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((seed) => {
    window.__DB = seed;
    window.jspdf = { jsPDF: class { constructor() {} } };
    function makeQuery(table) {
      const st = { eqs: [], op: 'select', single: false };
      const base = () => (window.__DB[table] || (window.__DB[table] = []));
      const rows = () => {
        let out = base().slice();
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
      from: makeQuery,
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser:    async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
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
  await page.waitForFunction(() => typeof window.renderTransplantClaim === 'function'
                                && typeof window.transplantEmptyLead === 'function',
                             { timeout: 20000 });
  // Through the tabs, the way a person gets here.
  await page.click('[data-sub="transpl"]');
  await page.waitForFunction(() => {
    const t = document.getElementById('transpl-table');
    return t && (t.textContent || '').trim().length > 0;
  }, { timeout: 15000 });
  return page;
}

/* The cell, as one line of text. */
const cell = (page) => page.evaluate(() =>
  (document.getElementById('transpl-table').textContent || '').replace(/\s+/g, ' ').trim());

/* Open one of the nursery circles and let the sheet redraw. */
async function pick(page, label) {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll('#transpl-section-pills .npill')]
      .find((x) => (x.dataset.code || '') === l);
    if (b) b.click();
  }, label);
  await page.waitForTimeout(150);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nNothing recorded anywhere');
  {
    const page = await boot(browser, { mjmnpayroll_workers: REGISTER,
                                       nops_transplant_field_records: [] });
    await pick(page, 'UNN2');
    const txt = await cell(page);
    checkTrue('it says nothing was recorded at all', /No transplanting was recorded/i.test(txt));
    checkTrue('…for the month on screen', txt.includes(MONTH));
    checkTrue('…and says so of EVERY nursery, not just this circle',
              /in any nursery/i.test(txt));
    checkTrue('…and says where a conductor records it',
              /Transplanting Job/i.test(txt));
    await page.close();
  }

  console.log('\nRecords on this nursery’s plots with NOBODY NAMED on them');
  {
    const page = await boot(browser, {
      mjmnpayroll_workers: REGISTER,
      nops_transplant_field_records: [
        rec({ plot_name: 'N4', workers: [] }),
        rec({ plot_name: 'N7', work_type: 'polybag', source_qty: 900, workers: [] })
      ]
    });
    await pick(page, 'UNN2');
    const txt = await cell(page);
    checkFalse('it does NOT claim nothing was recorded — the records are there',
               /No transplanting was recorded/i.test(txt));
    checkTrue('it counts them', /2 transplanting records on/i.test(txt));
    checkTrue('…says they are on this nursery’s plots', /UNN2/.test(txt));
    checkTrue('THE REASON: nobody is named on them', /name nobody/i.test(txt));
    checkTrue('…naming the plots, so they can be opened', /N4/.test(txt) && /N7/.test(txt));
    checkTrue('…saying why that means no line at all',
              /cannot be paid to anyone/i.test(txt));
    checkTrue('…and what to do about it',
              /FC Portal/.test(txt) && /add who did the work/i.test(txt));
    await page.close();
  }

  console.log('\nRecords, but on another nursery’s plots');
  {
    const page = await boot(browser, {
      mjmnpayroll_workers: REGISTER,
      nops_transplant_field_records: [
        // Credited to somebody the register has in UNN 1, so the line is
        // filed there and UNN 2's sheet really is empty.
        rec({ nursery_name: 'BNN', plot_name: 'B3',
              workers: [{ name: 'Ramli Anak Juna', qty: null }] })
      ]
    });
    await pick(page, 'UNN2');
    const txt = await cell(page);
    checkTrue('it says a record did reach the office', /1 transplanting record reached/i.test(txt));
    checkTrue('…but none on this nursery’s plots', /none on UNN2/i.test(txt));
    checkTrue('…and says which nursery they ARE on', /BNN/.test(txt));
    await page.close();
  }

  console.log('\nA nursery name the payroll sections do not know');
  {
    const page = await boot(browser, {
      mjmnpayroll_workers: REGISTER,
      nops_transplant_field_records: [
        // Credited to a name the register does not hold, so nothing but the
        // plot's nursery decides where the line goes -- and that name
        // matches no section.
        rec({ nursery_name: 'Ulu Niah Nursery 2', plot_name: 'N11',
              workers: [{ name: 'Nobody On The Register', qty: null }] })
      ]
    });
    await pick(page, 'UNN2');
    const txt = await cell(page);
    checkTrue('it quotes the name as it is written',
              txt.includes('Ulu Niah Nursery 2'));
    checkTrue('…and says that is why it matches nothing',
              /matches no payroll section/i.test(txt));
    await page.close();
  }

  console.log('\nThe work is here, the worker is registered elsewhere');
  {
    const page = await boot(browser, {
      mjmnpayroll_workers: REGISTER,
      nops_transplant_field_records: [
        rec({ nursery_name: 'UNN 2', plot_name: 'N9',
              workers: [{ name: 'Ramli Anak Juna', qty: null }] })
      ]
    });
    await pick(page, 'UNN2');
    const txt = await cell(page);
    checkTrue('it does not pretend nothing happened here',
              /1 transplanting record on UNN2/i.test(txt));
    checkTrue('…and names who the work was by', /Ramli Anak Juna/.test(txt));
    checkTrue('…and where the money went instead', /filed under UNN1/i.test(txt));
    checkTrue('…and why — the register puts them there',
              /worker register/i.test(txt));

    // And the same fact, from the circle the money IS on: a row, not a note.
    await pick(page, 'UNN1');
    const paid = await cell(page);
    checkTrue('on that circle it is an ordinary paid row', /Ramli Anak Juna/.test(paid));
    checkFalse('…with no empty-sheet explanation', /No transplanting was recorded/i.test(paid));
    await page.close();
  }

  console.log('\nA sheet that DOES have rows still says what is missing from it');
  {
    const page = await boot(browser, {
      mjmnpayroll_workers: REGISTER,
      nops_transplant_field_records: [
        rec({ plot_name: 'N9', workers: [{ name: 'Ali Bin Hassan', qty: null }] }),
        rec({ plot_name: 'N4', workers: [] })
      ]
    });
    await pick(page, 'UNN2');
    const txt = await cell(page);
    checkTrue('the paid row is there', /Ali Bin Hassan/.test(txt));
    const note = await page.evaluate(() =>
      (document.getElementById('transpl-note').textContent || '').replace(/\s+/g, ' ').trim());
    checkTrue('AND the crewless record is reported underneath, not hidden by '
            + 'the sheet no longer being empty', /name nobody/i.test(note));
    checkTrue('…naming the plot', /N4/.test(note));
    await page.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
