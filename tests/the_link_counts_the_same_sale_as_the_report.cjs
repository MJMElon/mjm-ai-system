/* THE LINK HAS TO PLACE A DELIVERY ORDER LINE WHERE THE REPORT PLACES IT.

   The office, over the batch report Sales tile for B14-R -- two delivery
   notes, 30 on DO 03357 and 5 on DO 03364, total 35 -- against a linked
   row still reading 30 standing: *"B14-R卖出去了不是吗？？"*

   They were right. 44 of batch 232 came onto B14-R by transfer, 30 went
   on one note, 5 on the other and 9 were transferred on, which is nought
   -- and the link counted only the 5. DO 03357 had "232 (B13)" typed into
   its batch field, the origin plot in brackets, and shared_plot_movement
   .js keyed a batch by dropping punctuation, which reads that as batch
   "232B13" and matches nothing. So the sale reached no plot, the plot
   went on reading 30 standing, and 30 of CAPACITY was paid on ground the
   lorry had emptied.

   operation_reports.html met this on this very plot and fixed it:
   _mvBatchKey there names B14-R and "232 (B13)" in its own comment. This
   file never got the fix, and the `real` set in _load says in its own
   words that it exists to stop the two screens quoting different numbers
   for one plot.

   SO THE CHECK THAT CANNOT DRIFT is section 1: it lifts the REAL
   _mvBatchKey and _mvPlotKey out of the shipped operation_reports.html
   and drives them beside the SHIPPED PlotMovement.batchKey and
   .plotKey over the same spellings. A comment claiming the two agree is
   not agreement -- this file has that lesson from LOS, one report along.

   THE RULE IS STRICTLY MORE FORGIVING, NEVER LESS, and section 2 is that
   half: a name with no trailing digits ("24D") is no batch at all to the
   report, and here it keeps the old key rather than being taken off every
   plot it used to match.

   EVERY READER IS GUARDED, because a test that dies on the first throw
   leaves everything under it unasked -- and on the previous build the
   fields this asks about are simply absent.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_link_counts_the_same_sale_as_the_report.cjs */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
};
const ROOT = path.join(__dirname, '..');

/* Lift a named function out of a shipped file by scanning its braces, so
   what is driven here is the real one and not a copy that can drift. The
   body opens after the PARAMETER LIST, never at the first brace on the
   line -- the harness in nobody_signed_for_this_work.cjs had to learn the
   same thing over a default argument. */
function liftFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const open = src.indexOf('{', src.indexOf(')', at));
  if (open < 0) return null;
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}' && --d === 0) return src.slice(at, i + 1);
  }
  return null;
}

const log = (type, date, plot, batch, qty, remark) => ({
  transaction_type: type, transaction_date: date,
  created_at: date + 'T00:00:00Z', remark: remark || '',
  plot_name: plot, batch_name: batch, quantity_change: qty });

/* ── B14-R IS THE OFFICE OWN PLOT, to the seedling ─────────────────────
   B13 is 3rd culled and 44 of batch 232 land on B14-R. Then the two
   notes the tile shows, then 9 transferred on. 44 - 30 - 5 - 9 = 0. */
const LOGS = [
  log('Transplanted', '2026-02-10', 'B13', '232', 500),
  log('3rd_Culling',  '2026-06-05', 'B13', '232', 456, 'MapQty: 456 CullDate: 2026-06-05'),
  log('Cull3_Transfer', '2026-06-05', 'B14-R', '232', 44, 'From: [B13|232]'),
  log('Cull3_Transfer', '2026-07-04', 'B11-R', '232', 9,  'From: [B14-R|232]'),
  /* U15 holds a batch whose DO line names the plot with a breed in
     brackets, which is the plot half of the same fault. */
  log('Transplanted', '2026-03-01', 'U15', '239', 200),
  /* A batch with NO trailing digits. Nothing here may take it off its
     own plot. */
  log('Transplanted', '2026-03-01', 'U16', '24D', 150)
];

const DOS = [
  /* THE ONE THAT WAS BEING DROPPED. The origin plot in brackets. */
  { do_number: '03357', delivery_date: '2026-06-10', status: 'Delivered', remark: '',
    plot_1: 'B14-R', qty_1: 30, batch_1: '232 (B13)' },
  { do_number: '03364', delivery_date: '2026-06-16', status: 'Delivered', remark: '',
    plot_1: 'B14-R', qty_1: 5, batch_1: '232' },
  { do_number: '03370', delivery_date: '2026-06-20', status: 'Delivered', remark: '',
    plot_1: 'U15 (UPB PREMIER HYBRID)', qty_1: 50, batch_1: 'MJM-239' },
  { do_number: '03371', delivery_date: '2026-06-21', status: 'Delivered', remark: '',
    plot_1: 'U16', qty_1: 20, batch_1: '24D' }
].map(d => Object.assign({ plot_2: null, qty_2: null, batch_2: null,
                           plot_3: null, qty_3: null, batch_3: null,
                           plot_4: null, qty_4: null, batch_4: null,
                           plot_5: null, qty_5: null, batch_5: null }, d));

function fakeSupabase() {
  const q = (rows) => { const o = new Proxy({}, { get(_, k) {
    if (k === 'then') return (a, b) => Promise.resolve({ data: rows, error: null }).then(a, b);
    if (k === 'range') return (f) => q(f === 0 ? rows : []);
    return () => o; } }); return o; };
  return { from: (t) => q(t === 'shared_inventory_logs' ? LOGS
                        : t === 'shared_do_records' ? DOS : []) };
}

(async () => {
  const ctx = { console, Date, Math, Promise, Set, Map, Object, Array, String, Number, JSON, isNaN, parseInt };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared', 'shared_plot_movement.js'), 'utf8'), ctx);
  const PM = ctx.PlotMovement;

  console.log('\n0  the two rules, lifted out of the two shipped files');
  const rep = fs.readFileSync(path.join(ROOT, 'operation', 'operation_reports.html'), 'utf8');
  const srcB = liftFn(rep, '_mvBatchKey'), srcP = liftFn(rep, '_mvPlotKey');
  check('the report own _mvBatchKey is in the shipped file', !!srcB, true);
  check('…and its _mvPlotKey', !!srcP, true);
  const rctx = { String, parseInt };
  vm.createContext(rctx);
  if (srcB) vm.runInContext(srcB, rctx);
  if (srcP) vm.runInContext(srcP, rctx);
  const repB = rctx._mvBatchKey || (() => 'no _mvBatchKey in this build');
  const repP = rctx._mvPlotKey  || (() => 'no _mvPlotKey in this build');
  const linkB = PM && PM.batchKey ? PM.batchKey : () => 'no batchKey exported';
  const linkP = PM && PM.plotKey  ? PM.plotKey  : () => 'no plotKey exported';

  console.log('\n1  A BATCH THE REPORT CAN PLACE, THE LINK PLACES THE SAME WAY');
  /* Only where the report places it at all. "24D" is no batch there and
     is section 2 own case. */
  const SPELLINGS = ['232', '232 (B13)', ' 232 ', '225.', 'MJM-225', '232(B13)', '232, B13'];
  const disagree = SPELLINGS.filter(s => repB(s) !== '' && linkB(s) !== repB(s))
                            .map(s => s + ' -> link ' + linkB(s) + ', report ' + repB(s));
  check('every spelling the report can place, the link places identically', disagree, []);
  check('…and "232 (B13)" is batch 232, never batch 13', linkB('232 (B13)'), '232');

  console.log('\n2  AND IT IS STRICTLY MORE FORGIVING, NEVER LESS');
  check('the report places no batch at all for "24D"', repB('24D'), '');
  check('…so the link keeps its own key rather than losing the batch',
        [linkB('24D'), linkB('24D') === linkB('24D')], ['24D', true]);

  console.log('\n3  a plot carrying a note is the same plot');
  const pDis = ['B14-R', 'U15 (UPB PREMIER HYBRID)', 'PLOT: U15', ' U15 ']
    .filter(s => linkP(s) !== String(repP(s)).replace(/-/g, ''))
    .map(s => s + ' -> link ' + linkP(s) + ', report ' + repP(s));
  check('every plot spelling lands on the report own plot', pDis, []);
  check('…and B14-R is still not B14', linkP('B14-R') === linkP('B14'), false);

  console.log('\n4  THE OFFICE OWN PLOT, to the seedling');
  await PM.load(fakeSupabase());
  check('the fake ledger loaded', PM.ready(), true);
  const link = (plot, date) => PM.linkedQty(plot, '', date, {}) || {};
  const emptyOf = (l) => (l && l.emptyBatches) || 'no emptyBatches in this build';

  const b14r = link('B14-R', '-');
  check('B14-R reads NOUGHT standing, which is what the lorry left', b14r.qty, 0);
  check('…and 232 is named as a batch with nothing standing, not as capacity',
        [b14r.batches, emptyOf(b14r)], [[], ['232']]);

  console.log('\n5  the other two halves of the same fault');
  const u15 = link('U15', '-');
  check('a DO naming the plot with a breed in brackets still reaches U15',
        u15.qty, 150);
  const u16 = link('U16', '-');
  check('a batch with no trailing digits still sells off its own plot',
        u16.qty, 130);

  console.log('\n6  and the sale is counted ONCE, not once per spelling');
  check('B14-R holds exactly one bucket for 232',
        Object.keys((PM.events() || []).reduce((m, e) => {
          if (e.plotKey === linkP('B14-R')) m[e.batchKey] = 1; return m; }, {})), ['232']);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
