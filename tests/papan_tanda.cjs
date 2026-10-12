/* THE PAPAN TANDA IS THE REPORT ROW, DRAWN.

   The board that gets nailed up at the plot when the seedlings arrive. The
   office was making these by hand off the Transplanting Report on the
   screen beside them, so it is drawn FROM that row — and the figure on the
   board is the figure on the report by construction.

   Batch 270 is the one it was asked for, and it is the case that matters:
   B4 took 1,931 out of P32 and 378 out of P33 on 23 Sep, and the board says
   2,309. ONE BOARD PER PLOT, because what goes up at the plot is how many
   are standing in it — and the report already merges a plot's rows for the
   day, so following that is what keeps the two from disagreeing.

   What each field is, and why:

     PLOT / BATCH / JENAMA   the row
     JUMLAH TANAM            the row's merged qty
     TARIKH TANAM            the batch's Seeds_Received transaction_date,
                             which is what the Batch Record list shows as
                             Planted Date. Newest reception row wins — a
                             batch is meant to have one and some have many.
     TARIKH PINDAH           the transplant date

   Driven through the REAL page in a real browser, because the two things
   most likely to go wrong cannot be seen from the source: a canvas drawn
   before the font has loaded comes out in Times, and a fill colour left
   behind by the logo draws the whole board white on white. Both happened.

   Needs a browser and a server on the page:
     (cd .. && python3 -m http.server 8812 &)
     NODE_PATH=/opt/node22/lib/node_modules node tests/papan_tanda.cjs */
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

/* Batch 270's own figures, off the office screenshot: two trays into B4 on
   the same day, and N3 fed by three — one of them the DOUBLE-TONE tray. */
const LOGS = [
  log({ batch_name: '270', breed_name: 'AA Hybrida 1S', transaction_type: 'Seeds_Received',
        transaction_date: '2026-06-25', created_at: '2026-06-25T00:00:00Z', quantity_change: 12000 }),
  log({ batch_name: '270', transaction_type: 'Transplanted', transaction_date: '2026-09-23',
        plot_name: 'B4', quantity_change: 1931,
        remark: 'Transplanted from tray [P32] to Main Plot [B4]. Date: 2026-09-23' }),
  log({ batch_name: '270', transaction_type: 'Transplanted', transaction_date: '2026-09-23',
        plot_name: 'B4', quantity_change: 378,
        remark: 'Transplanted from tray [P33] to Main Plot [B4]. Date: 2026-09-23' }),
  log({ batch_name: '270', transaction_type: 'Transplanted', transaction_date: '2026-09-15',
        plot_name: 'N3', quantity_change: 2214,
        remark: 'Transplanted from tray [P34] to Main Plot [N3]. Date: 2026-09-15' }),
  log({ batch_name: '270', transaction_type: 'Transplanted', transaction_date: '2026-09-15',
        plot_name: 'N3', quantity_change: 160,
        remark: 'Transplanted from tray [DOUBLE-TONE] to Main Plot [N3]. Date: 2026-09-15' }),
  log({ batch_name: '270', transaction_type: 'Transplanted', transaction_date: '2026-09-15',
        plot_name: 'N3', quantity_change: 2100,
        remark: 'Transplanted from tray [P33] to Main Plot [N3]. Date: 2026-09-15' }),
  /* 271 — reception keyed TWICE, the later one correcting the date. The
     board must take the newest, the same way the Seeds In form does. */
  log({ batch_name: '271', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
        transaction_date: '2026-01-01', created_at: '2026-01-01T00:00:00Z', quantity_change: 9000 }),
  log({ batch_name: '271', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
        transaction_date: '2026-02-14', created_at: '2026-03-01T00:00:00Z', quantity_change: 9000 }),
  log({ batch_name: '271', transaction_type: 'Transplanted', transaction_date: '2026-09-20',
        plot_name: 'B9', quantity_change: 500,
        remark: 'Transplanted from tray [P40] to Main Plot [B9]. Date: 2026-09-20' }),
];

const DATA = {
  shared_inventory_logs: LOGS,
  shared_plots: [{ plot_name: 'B4', nursery_name: 'BNN' }, { plot_name: 'N3', nursery_name: 'BNN' },
                 { plot_name: 'B9', nursery_name: 'BNN' }],
  operation_trays: [],
  shared_breeds: [{ name: 'AA Hybrida 1S' }, { name: 'IOI DxP HYBRID' }],
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
/* No range and no nursery chips: this file is about the board, and the
   report's own filtering has its own tests. */
await page.evaluate(() => {
  ['f-from', 'f-to', 'f-breed'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  window.selectedNurseries = () => [];
  return runTransplantingReport();
});
await page.waitForTimeout(1500);

console.log('\n── 1. The report draws, with a board for every row ──');
is(errs.length, 0, 'no page errors');
const table = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#report-output tbody tr')];
  return rows.map(tr => [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()));
});
if (table.length !== 3) console.log('   table was:', JSON.stringify(table));
is(table.length, 3, 'three rows: B4, N3 and B9');
if (table.length !== 3) { await browser.close(); process.exit(1); }
is(table[0].slice(3, 7), ['B4', '270', 'AA Hybrida 1S', '2,309'],
  'B4 is ONE row of 2,309 — the two trays merged, which is what goes on the board');
/* Newest first, so B9 (20 Sep) sits between B4 (23 Sep) and N3 (15 Sep). */
is(table[2].slice(3, 7), ['N3', '270', 'AA Hybrida 1S', '4,474'],
  'and N3 is its three merged, the DOUBLE-TONE tray among them');
is(table.map(r => r[r.length - 1]), ['⬇ PNG', '⬇ PNG', '⬇ PNG'], 'every row offers its board');
is(await page.evaluate(() =>
  !!document.querySelector('#report-output button[onclick^="papanTandaAll"]')), true,
  'and the header offers the lot');
is(await page.evaluate(() => {
  const b = document.querySelector('#report-output button[onclick^="papanTandaAll"]');
  return b ? b.textContent.replace(/\s+/g, ' ').trim() : '';
}), '⬇ Papan Tanda · all 3', 'saying how many');

console.log('\n── 2. The board is the row ──');
const board = await page.evaluate(() => {
  const r = _ptRows.find(x => x.plot === 'B4');
  return { plot: r.plot, batch: r.batch, breed: r.breed, qty: r.qty, planted: r.planted, date: r.date };
});
is(board.qty, 2309, 'JUMLAH TANAM is the merged quantity');
is(board.date, '2026-09-23', 'TARIKH PINDAH is the transplant date');
is(board.planted, '2026-06-25', 'TARIKH TANAM is the batch keyed planting date');
is(board.breed, 'AA Hybrida 1S', 'JENAMA');

console.log('\n── 3. A batch with two reception rows takes the NEWEST ──');
is(await page.evaluate(() => (_ptRows.find(x => x.plot === 'B9') || {}).planted),
  '2026-02-14', 'the corrected date, not the first one keyed');

console.log('\n── 4. It actually draws, in the right font and not white on white ──');
const px = await page.evaluate(async () => {
  const c = await _ptDraw(_ptRows.find(x => x.plot === 'B4'));
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let ink = 0, green = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60) ink++;
    if (Math.abs(d[i] - 0x6f) < 12 && Math.abs(d[i + 1] - 0x8c) < 12 && Math.abs(d[i + 2] - 0x63) < 12) green++;
  }
  return { w: c.width, h: c.height, ink, green };
});
is([px.w, px.h], [2000, 1400], 'a print-sized board');
is(px.ink > 50000, true, 'with black type on it — ' + px.ink + ' ink pixels');
is(px.green > 50000, true, 'and the MJM mark — ' + px.green + ' green pixels');
/* THE FONT HAS TO BE LOADED BEFORE THE FIRST STROKE. A canvas asked for a
   font it does not have yet does not wait — it draws the fallback, and the
   board comes out in Times, which nobody would notice until it was on a
   post in a field.

   Asked as a question about the ORDER rather than about the glyphs: this
   harness has no network for Google Fonts, so comparing widths here would
   only prove the sandbox has no Outfit. Every weight the board uses must
   have been awaited before the first stroke lands. */
const order = await page.evaluate(async () => {
  const seen = [];
  const realLoad = document.fonts.load.bind(document.fonts);
  const realFill = CanvasRenderingContext2D.prototype.fillText;
  let pending = 0;
  document.fonts.load = (f) => { pending++; seen.push('ask:' + f);
    return realLoad(f).finally(() => { pending--; seen.push('got:' + f); }); };
  CanvasRenderingContext2D.prototype.fillText = function (...a) {
    seen.push('draw' + (pending ? ':WHILE-WAITING' : ''));
    return realFill.apply(this, a);
  };
  try {
    await _ptDraw({ plot: 'B4', batch: '270', breed: 'AA Hybrida 1S', qty: 2309,
                    planted: '2026-06-25', date: '2026-09-23' });
  } finally {
    document.fonts.load = realLoad;
    CanvasRenderingContext2D.prototype.fillText = realFill;
  }
  const asked = seen.filter(x => x.startsWith('ask:')).map(x => x.slice(4));
  return { asked, drewEarly: seen.some(x => x === 'draw:WHILE-WAITING'),
           firstDraw: seen.indexOf('draw'), lastGot: seen.map((x, i) => [x, i])
             .filter(([x]) => x.startsWith('got:')).map(([, i]) => i).pop() };
});
is(order.drewEarly, false, 'nothing is drawn while a font is still loading');
is(order.lastGot < order.firstDraw, true, 'every weight is awaited before the first stroke');
is(order.asked.some(f => /900 190px Outfit/.test(f)), true, 'the PLOT weight among them');
is(order.asked.some(f => /700 110px Outfit/.test(f)), true, 'and the one the breed is set in');

console.log('\n── 5. A long name is shrunk to fit, never clipped ──');
const longBoard = await page.evaluate(async () => {
  const c = await _ptDraw({ plot: 'N18-R', batch: '1234',
    breed: 'UPB PREMIER HYBRID DxP SELECTION', qty: 11280,
    planted: '2025-11-28', date: '2026-10-11' });
  // Nothing may be drawn in the right-hand margin.
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(c.width - 90, 0, 90, c.height).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60) ink++;
  return ink;
});
is(longBoard, 0, 'no type runs off the right edge');

console.log('\n── 6. The file is named for the plot and the batch ──');
is(await page.evaluate(() => _ptFileName(_ptRows.find(x => x.plot === 'B4'))),
  'papan-tanda-B4-270.png', 'so a folder of them sorts by plot');
is(await page.evaluate(() => _ptFileName({ plot: 'B4 / spare', batch: '27 0' })),
  'papan-tanda-B4-spare-27-0.png', 'and a plot with a slash in it is still a filename');

console.log('\n── 7. Pressing it saves a PNG ──');
const dl = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  page.evaluate(() => document.querySelector('#report-output tbody tr button').click())
]);
is(dl[0].suggestedFilename(), 'papan-tanda-B4-270.png', 'the download arrives, named');

console.log('\n' + (bad ? 'FAILURES: ' + bad : 'all good'));
await browser.close();
process.exit(bad ? 1 : 0);

})();
