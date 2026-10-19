/* THE SEED BOARD — the same papan tanda, nailed up three months earlier.

   The office asked for a board when the seeds go INTO the tray, not only
   when the seedlings come out of it: a pre-nursery tray stands for three
   months with nothing on it saying what is in it.

   It is the SAME drawing. Two boards on two posts in one nursery that do
   not look alike are two boards somebody has to compare, so the Seed In
   Report calls `_ptDraw` and changes one field.

   THAT ONE FIELD IS TARIKH PINDAH, and it is a MONTH. The transplant board
   knows the day the seedlings moved because it is drawn after they did.
   The seed board does not: the move is three months off, so a date printed
   there would be a promise the board cannot keep. DEC 2026, short, because
   the board is read from a distance and a month spelled out shrinks the
   line it is on.

   THREE MONTHS IS NOT A RULE THIS REPORT INVENTS. audit_papan_script.js has
   drawn the auditor's papan tanda off planted-plus-three since it was
   written, shown as a month and a year. A second rule here would be two
   answers on two boards a few metres apart.

   ONE BOARD PER TRAY, PER DAY: the Planted log says which tray took how
   many and when. A batch sown into three trays is three boards.

   Driven through the REAL page in a real browser, for the same reason the
   transplant board is: a canvas drawn before its font has loaded comes out
   in Times, and that cannot be seen from the source.

   Needs a browser and a server on the page:
     (cd .. && python3 -m http.server 8812 &)
     NODE_PATH=/opt/node22/lib/node_modules node tests/papan_tanam_seed_in.cjs */
const { chromium } = require('playwright');

(async () => {

const B = 'http://127.0.0.1:8812';
let bad = 0;
const is = (g, w, what) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a !== b) { console.log('  FAIL', what, '\n        got ', a, '\n        want', b); bad++; }
  else console.log('  ok  ', what, '→', a);
};

const L = (o) => Object.assign({ plot_name: 'Pre-Nursery', quantity_change: 0, remark: '' }, o);
let id = 0;
const log = (o) => L(Object.assign({ id: ++id }, o));

/* 277 — the office's own board: P1, 2,560 sown on 29 Sep 2026, due out in
   December. Sown into a second tray on the same day and into P1 again on a
   LATER day, which is three boards and not one. */
const LOGS = [
  log({ batch_name: '277', breed_name: 'UPB PREMIER HYBRID', transaction_type: 'Seeds_Received',
        transaction_date: '2026-09-28', created_at: '2026-09-28T00:00:00Z', quantity_change: 10000,
        remark: 'Seeds received. Supplier: UPB. DO_Qty: 10000.' }),
  log({ batch_name: '277', transaction_type: 'Planted', transaction_date: '2026-09-29',
        plot_name: 'P1', quantity_change: 2000 }),
  log({ batch_name: '277', transaction_type: 'Planted', transaction_date: '2026-09-29',
        plot_name: 'P1', quantity_change: 560 }),
  log({ batch_name: '277', transaction_type: 'Planted', transaction_date: '2026-09-29',
        plot_name: 'P2', quantity_change: 3000 }),
  log({ batch_name: '277', transaction_type: 'Planted', transaction_date: '2026-10-02',
        plot_name: 'P1', quantity_change: 900 }),
  /* 279 — THE MONTH PLUS THREE, NOT THE DAY PLUS THREE MONTHS. Sown on the
     30th of November: 30 November plus three months is 30 February, which
     JavaScript rolls into 2 March, so the board used to read MAR over a
     tray due out in FEBRUARY. The office said the rule in the words that
     avoid it — the seed planted MONTH plus three — so the day takes no
     part. */
  log({ batch_name: '279', breed_name: 'UPB PREMIER HYBRID', transaction_type: 'Seeds_Received',
        transaction_date: '2026-11-29', created_at: '2026-11-29T00:00:00Z', quantity_change: 4000,
        remark: 'Seeds received. Supplier: UPB. DO_Qty: 4000.' }),
  log({ batch_name: '279', transaction_type: 'Planted', transaction_date: '2026-11-30',
        plot_name: 'P7', quantity_change: 3800 }),
  /* 280 — the other two days the day-based sum lost: 31 January read MAY
     for APRIL, and 31 March read JUL for JUNE. */
  log({ batch_name: '280', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
        transaction_date: '2026-01-30', created_at: '2026-01-30T00:00:00Z', quantity_change: 2000,
        remark: 'Seeds received. Supplier: IOI. DO_Qty: 2000.' }),
  log({ batch_name: '280', transaction_type: 'Planted', transaction_date: '2026-01-31',
        plot_name: 'P8', quantity_change: 1900 }),
  log({ batch_name: '280', transaction_type: 'Planted', transaction_date: '2026-03-31',
        plot_name: 'P9', quantity_change: 100 }),
  /* 278 — received and NOT yet sown. No tray, no board, and the button on
     its row must not be offered. */
  log({ batch_name: '278', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
        transaction_date: '2026-09-30', created_at: '2026-09-30T00:00:00Z', quantity_change: 5000,
        remark: 'Seeds received. Supplier: IOI. DO_Qty: 5000.' }),
];

const DATA = {
  shared_inventory_logs: LOGS,
  shared_plots: [],
  operation_trays: ['P1', 'P2', 'P7', 'P8', 'P9'].map(t => ({ tray_name: t, nursery_name: 'BNN' })),
  shared_breeds: [{ name: 'UPB PREMIER HYBRID' }, { name: 'IOI DxP HYBRID' }],
  shared_do_records: [],
  operation_batch_verifications: [],
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = [];
page.on('pageerror', e => { errs.push(e.message); console.log('  [err]', e.message.slice(0, 220)); });
await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ body: '', contentType: 'text/javascript' }));
await page.route('**/@supabase/supabase-js**', r => r.fulfill({ contentType: 'text/javascript',
  body: 'window.supabase={createClient:()=>window.__stub};' }));
await page.route('**/shared/shared_access.js', r => r.fulfill({ contentType: 'text/javascript',
  body: `window.MJMAccess={load:async()=>{},user:()=>({email:'t@t'}),canAccess:()=>true,
    canOpenOperationPage:()=>true,canDoOperation:()=>true,canOpenPage:()=>true,canDo:()=>true};` }));
await page.addInitScript((data) => {
  const q = (table) => {
    let rows = (data[table] || []).slice();
    const w = {
      select: () => w, order: () => w, like: () => w, not: () => w, limit: () => w,
      in: (col, vals) => { rows = rows.filter(r => vals.indexOf(r[col]) >= 0); return w; },
      eq: (col, val) => { rows = rows.filter(r => String(r[col] == null ? '' : r[col]) === String(val)); return w; },
      range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (ok, no) => Promise.resolve({ data: rows, error: null }).then(ok, no)
    };
    return w;
  };
  window.__stub = { from: q, rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: { user: { email: 't@t' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}, DATA);

await page.goto(B + '/operation/operation_reports.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  ['f-from', 'f-to', 'f-breed'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  window.selectedNurseries = () => [];
  return runSeedInReport();
});
await page.waitForTimeout(1500);

console.log('\n── 1. The report draws, and the boards come off it ──');
is(errs.length, 0, 'no page errors');
const boards = await page.evaluate(() => _ptSeedRows.map(r =>
  ({ plot: r.plot, batch: r.batch, breed: r.breed, qty: r.qty, planted: r.planted, pindah: r.pindah })));
is(boards.filter(b => b.batch === '277').length, 3,
  "277 has three boards: P1 and P2 on the 29th, P1 again on the 2nd");

console.log('\n── 2. The office own board ──');
const p1 = boards.find(b => b.plot === 'P1' && b.planted === '2026-09-29');
is(p1 && p1.qty, 2560, 'P1 on the 29th is ONE board of 2,560 — the two rows merged');
is(p1 && p1.batch, '277', 'the batch');
is(p1 && p1.breed, 'UPB PREMIER HYBRID', 'and its breed, off the ledger');
is(p1 && p1.pindah, 'DEC 2026', 'TARIKH PINDAH is the month, three on from September');

console.log('\n── 3. A tray filled on another day is another board ──');
const p1b = boards.find(b => b.plot === 'P1' && b.planted === '2026-10-02');
is(p1b && p1b.qty, 900, 'the 2nd of October is its own board of 900');
is(p1b && p1b.pindah, 'JAN 2027',
  'and it crosses the year end on its own — three months from October is January');
const p2 = boards.find(b => b.plot === 'P2');
is(p2 && [p2.qty, p2.pindah], [3000, 'DEC 2026'], 'P2 is a board of its own');

console.log('\n── 3b. THE MONTH PLUS THREE, NOT THE DAY ──');
/* The three days the day-based sum lost. Every one of them is a sowing on
   the last day of a month whose third month on is shorter, so the date
   rolled into the month AFTER the answer. */
const on = (d) => (boards.find(b => b.planted === d) || {}).pindah;
is(on('2026-11-30'), 'FEB 2027',
  '30 November is due out in FEBRUARY — the day-based sum read MAR');
is(on('2026-01-31'), 'APR 2026',
  '31 January is APRIL — it read MAY');
is(on('2026-03-31'), 'JUN 2026',
  '31 March is JUNE — it read JUL');

console.log('\n── 4. A batch not yet sown has no board, and is not offered one ──');
is(boards.filter(b => b.batch === '278').length, 0, '278 has no Planted row, so no board');
const btns = await page.evaluate(() => [...document.querySelectorAll('#report-output tbody tr')]
  .map(tr => {
    const cells = [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim());
    const b = tr.querySelector('button[onclick^="papanTanam("]');
    return { batch: cells[1] || '', btn: b ? b.textContent.trim() : '' };
  }).filter(x => /27[78]/.test(x.batch)));
is(btns.find(x => /277/.test(x.batch)) && btns.find(x => /277/.test(x.batch)).btn, '⬇ 3',
  "277's row offers its three boards, and says three");
is(btns.find(x => /278/.test(x.batch)) && btns.find(x => /278/.test(x.batch)).btn, '',
  'and 278 is offered nothing at all, rather than a button that answers nothing');

console.log('\n── 5. It is the SAME board, drawn ──');
const shot = await page.evaluate(async () => {
  const c = await _ptDraw(_ptSeedRows.find(r => r.plot === 'P1' && r.planted === '2026-09-29'));
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 128 && d[i + 1] < 128 && d[i + 2] < 128) ink++;
  return { w: c.width, h: c.height, ink };
});
is([shot.w, shot.h], [2000, 1400], 'the same canvas the transplant board uses');
is(shot.ink > 20000, true, 'and there is ink on it — not a white board on white: ' + shot.ink);

console.log('\n── 6. Pressing it saves a PNG, named for the tray and the day ──');
const dl = page.waitForEvent('download', { timeout: 15000 });
await page.evaluate(() => papanTanam('277', null));
const got = await dl;
is(/^papan-tanam-P\d-277-2026-\d\d-\d\d\.png$/.test(got.suggestedFilename()), true,
  'the download arrives, named → ' + got.suggestedFilename());

console.log('');
console.log(bad ? bad + ' FAILED' : 'all good');
await browser.close();
process.exit(bad ? 1 : 0);
})();
