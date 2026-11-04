/* THE LINKED CAPACITY IS THE SUMMARY REPORT, and it used to take one loss
   off twice.

   The office asked for it in one line, over a screenshot of the report
   itself: *"link的capacity完全不要管手机送进来的，我要link这个summary
   report，一样interrow spray要包括2nd cull amount"*.

   The second clause is the arithmetic, and the fault it names was invisible
   for the same reason the first version of the 2nd-culling rule was: a
   figure that has had one loss taken off twice and a figure that has had it
   taken off once are both just numbers on a screen. `liveCount` deducted
   the 2nd culling unconditionally; the Summary Report deducts it only while
   the same plot and batch carries no EVIDENCED 3rd culling, because a 3rd
   culling already contains the seedlings 2nd culled on the way to it (the
   Batch Report own rule -- cull2 "is inside cull3"). So every plot 2nd
   culled and then 3rd culled read LOW on the Work Maintenance list, on the
   Worker Record capacity totals and on the payroll claim, by exactly its
   2nd culling, against the one report the office reconciles with.

   THE COMPARISON IS AGAINST THE REPORT ITSELF, never against a restatement
   of its rule. `netOfRow` and `MOVE_COLS` are lifted out of the shipped
   `operation/operation_reports.html` and driven over the very same ledger
   as the shipped `shared/shared_plot_movement.js`, plot and batch by plot
   and batch. A comment claiming the two agree is not agreement -- this file
   already exists because one of them said so and was wrong.

   The third clause is the interrow rule, reaffirmed: the ground between the
   rows is the same walk whether the polybag has a dead seedling in it or
   not, so interrow keeps the whole 2nd culling standing. That is a
   DIFFERENT reason from the one above and it has to go on holding on a plot
   where neither, either or both apply.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_link_is_the_summary_report.cjs
   (no browser and no server -- both files are read off disk.)             */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const ROOT = path.join(__dirname, '..');

/* ── THE SHIPPED LINK ───────────────────────────────────────────────────── */
const win = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'shared/shared_plot_movement.js'), 'utf8'))(win);
const PlotMovement = win.PlotMovement;

/* ── THE SHIPPED REPORT, lifted ──────────────────────────────────────────
   MOVE_COLS, MOVE_COLS.main2 and netOfRow, taken out of the page by slicing
   between landmarks rather than copied. A copy is the thing this file is
   written to catch. */
const HTML = fs.readFileSync(path.join(ROOT, 'operation/operation_reports.html'), 'utf8');
function slice(from, to) {
  const a = HTML.indexOf(from);
  const b = HTML.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error('could not lift ' + from);
  return HTML.slice(a, b);
}
const REPORT = new Function(
  slice('const MOVE_COLS = {', 'const emptyRow =') +
  slice('const emptyRow =', '/* "2 months".') +
  '\nreturn { MOVE_COLS, emptyRow, netOfRow };')();

/* ── ONE LEDGER, read by both ────────────────────────────────────────────
   U1 is the worked example in shared_plot_movement.js own header, carried
   one step further: 100 transplanted, 5 second culled, 25 sold, a 3 taken
   off by an approved calibration, and then 60 THIRD culled and flown. The
   5 goes back in at that last step, because it is inside the 60.

   U2 holds TWO batches and only one of them reaches a 3rd culling, which is
   what makes the rule a per-plot-and-batch question rather than a per-plot
   one: half of that plot 2nd culling comes off and half of it does not.

   U3 is a 3rd culling NOBODY HAS FLOWN. It is a claim and not a deduction
   -- the report leaves the batch standing and so does the link -- so it
   must not supersede anything either. */
const log = (type, date, plot, batch, qty, remark) => ({
  transaction_type: type, transaction_date: date,
  created_at: date + 'T00:00:00Z', remark: remark || '',
  plot_name: plot, batch_name: batch, quantity_change: qty
});
const LOGS = [
  log('Transplanted',     '2026-09-01', 'U1', '250', 100),
  log('2nd_Culling',      '2026-09-10', 'U1', '250', 5),
  log('Stock_Calibration','2026-09-20', 'U1', '250', -3,
      'Report: 3rd Culling [APPROVED by esther on 2026-09-21]'),
  log('3rd_Culling',      '2026-09-24', 'U1', '250', 60, 'MapQty: 60'),

  log('Transplanted',     '2026-09-01', 'U2', '260', 1000),
  log('2nd_Culling',      '2026-09-08', 'U2', '260', 40),
  log('3rd_Culling',      '2026-09-22', 'U2', '260', 300, 'MapQty: 300'),
  log('Transplanted',     '2026-09-01', 'U2', '261', 500),
  log('2nd_Culling',      '2026-09-08', 'U2', '261', 20),

  log('Transplanted',     '2026-09-01', 'U3', '270', 200),
  log('2nd_Culling',      '2026-09-09', 'U3', '270', 10),
  // No MapQty: in the remark, so this never becomes an event at all.
  log('3rd_Culling',      '2026-09-23', 'U3', '270', 50, 'CullDate: 2026-09-23')
];
// The 25 sold on the 18th comes out of the delivery-order system, exactly
// as it does on the report.
const DOS = [
  { delivery_date: '2026-09-18', status: 'Delivered', remark: '',
    plot_1: 'U1', qty_1: 25, batch_1: '250' }
];

function fakeSupabase() {
  return { from(table) {
    const all = table === 'shared_inventory_logs' ? LOGS : DOS;
    const q = {
      _types: null,
      select() { return q; },
      in(_col, vals) { q._types = vals; return q; },
      order() { return q; },
      range(a, b) {
        const rows = q._types
          ? all.filter((r) => q._types.indexOf(r.transaction_type) >= 0)
          : all;
        return Promise.resolve({ data: rows.slice(a, b + 1), error: null });
      }
    };
    return q;
  } };
}

/* The report's own bucket, built from the events the LINK resolved -- so
   the EVIDENCED and APPROVED gates are applied once, by the shipped code,
   and this is only the type-to-column map. Stock_Calibration is summed as
   STORED because that is the one column the report signs itself (+1 over an
   already-signed figure); every other column is a magnitude. */
const COL_OF = {
  Transplanted: 'transIn', Cull3_Transfer_In: 'trIn', Cull3_Transfer_Out: 'trOut',
  Sold: 'sold', '2nd_Culling': 'cull2', '3rd_Culling': 'cull3',
  Stock_Calibration: 'adjust'
};
function reportRow(plotKey, batchKey) {
  const row = REPORT.emptyRow('main2');
  PlotMovement.events().forEach((e) => {
    if (e.plotKey !== plotKey || e.batchKey !== batchKey) return;
    const col = COL_OF[e.type];
    if (!col) return;
    row[col] += e.type === 'Stock_Calibration'
      ? Number(e.qty || 0) : Math.abs(Number(e.qty || 0));
  });
  return row;
}

const linkOf = (plot, batch, date, opts) =>
  PlotMovement.linkedQty(plot, batch, date, opts || {});

/* A TEST THAT DIES ON THE PREVIOUS CODE PROVES NOTHING ABOUT IT. The
   previous `shared_plot_movement.js` exports no `cull2Superseded`, so
   calling it bare takes the harness down at that line and every check
   underneath -- the report comparison among them -- is never asked. It
   answers by NAME instead. */
const supersededOf = (evs) => typeof PlotMovement.cull2Superseded === 'function'
  ? PlotMovement.cull2Superseded(evs) : 'no cull2Superseded in this build';

(async () => {
  await PlotMovement.load(fakeSupabase());
  if (!PlotMovement.ready()) { console.log('  the ledger did not load'); process.exit(1); }

  console.log('\nU1 — the header worked example, one step further');
  /* Nothing has happened on the 1st; the 5 is off by the 11th; the 25 and
     the 3 are off by the 21st. Those three are unchanged by this rule and
     are here so a change that moved them is caught by NAME. */
  check('as the month goes on', [
    linkOf('U1', '250', '2026-09-01').qty,
    linkOf('U1', '250', '2026-09-11').qty,
    linkOf('U1', '250', '2026-09-21').qty
  ], [100, 95, 67]);
  /* AND THE ONE THAT MOVED. 100 − 25 − 3 − 60 = 12, with the 5 back in
     because it is inside the 60. The previous code read 7. */
  const after = linkOf('U1', '250', '2026-09-25');
  check('once the 3rd culling is flown, the 2nd culling is not taken off again',
        after.qty, 12);
  check('…and the row can SAY so rather than leaving it to be noticed',
        [after.cull2, after.cull2Off, after.cull2Inside, after.cull3],
        [5, 0, 5, 60]);

  console.log('\nU2 — two batches, and only one of them 3rd culled');
  /* THE RULE IS PER PLOT AND BATCH, which is the bucket the report asks it
     of. 260 reads 1000 − 300 = 700 with its 40 back in; 261 reads
     500 − 20 = 480 with its 20 off. A rule asked of the PLOT would be wrong
     about one of them whichever way it answered. */
  const plot = linkOf('U2', '', '2026-09-30');
  check('the whole plot adds up to its two batches, each by its own rule',
        [plot.qty, linkOf('U2', '260', '2026-09-30').qty,
                   linkOf('U2', '261', '2026-09-30').qty],
        [1180, 700, 480]);
  check('…and the two halves of the 2nd culling are named separately',
        [plot.cull2, plot.cull2Off, plot.cull2Inside], [60, 20, 40]);

  console.log('\nU3 — a 3rd culling nobody has flown');
  /* It is a CLAIM. The report leaves the batch standing, the link leaves it
     standing, and it must not supersede the 2nd culling either -- otherwise
     keying an unflown 3rd culling would silently raise every maintenance
     figure on that plot. */
  const claim = linkOf('U3', '270', '2026-09-30');
  check('it deducts nothing, and supersedes nothing',
        [claim.qty, claim.cull3, claim.cull2Off, claim.cull2Inside],
        [190, 0, 10, 0]);
  check('…and cull2Superseded says so of the events themselves',
        [supersededOf(PlotMovement.events().filter((e) => e.plotKey === 'U3')),
         supersededOf(PlotMovement.events().filter((e) => e.plotKey === 'U1'))],
        [false, true]);

  console.log('\nInterrow keeps the 2nd culling in, for its own reason');
  /* A DIFFERENT RULE, and it has to go on holding where the other one also
     applies. On U2 interrow counts 1000 + 500 − 300 = 1200: the 300 third
     culled are gone from the ground, and all 60 second culled are still
     standing in their polybags. Nothing is "taken off" and nothing is
     "inside", because neither sentence is the reason here. */
  const ir = linkOf('U2', '', '2026-09-30', { keepCull2: true });
  check('the whole 2nd culling is counted, superseded or not',
        [ir.qty, ir.cull2, ir.keptCull2, ir.cull2Off, ir.cull2Inside],
        [1200, 60, true, 0, 0]);
  /* And the job decides it, off the JENIS and never the chemical — the same
     rule `qtyOpts` has always applied. Asked here so the two rules cannot
     be wired up to each other by accident. */
  check('…and the job is what asks for it',
        [PlotMovement.qtyOpts({ jenis: 'Meracun rumput secara selingan' }).keepCull2,
         PlotMovement.qtyOpts({ jenis: 'Penyemburan racun kulat dan serangga' }).keepCull2,
         PlotMovement.qtyOpts({ jenis: 'Membaja', racun: 'Monex' }).keepCull2],
        [true, false, false]);

  console.log('\nAnd it IS the Summary Report, asked of the report itself');
  /* THE ONE CHECK THAT CANNOT DRIFT. Every plot and batch in the ledger,
     the link with no date (so the whole history, which is what the report
     nets over) against netOfRow('main2', …) lifted out of the page. On the
     previous code U1/250 and U2/260 disagree with it by their own 2nd
     culling. */
  const pairs = [...new Set(PlotMovement.events()
    .filter((e) => e.plotKey && e.batchKey)
    .map((e) => e.plotKey + '|' + e.batchKey))].sort();
  const disagree = pairs.filter((k) => {
    const [p, b] = k.split('|');
    return linkOf(p, b, '-').qty !== REPORT.netOfRow('main2', reportRow(p, b));
  });
  check('every plot and batch reads what the report reads', disagree, []);
  check('…and that was asked of all four of them', pairs,
        ['U1|250', 'U2|260', 'U2|261', 'U3|270']);
  /* AND IT IS THE SUMMARY REPORT AND NOT THE MPOB ONE. Those two differ by
     exactly a 2nd culling not yet superseded, and a link that happened to
     equal both would prove nothing about which it is. */
  check('the MPOB report is a different figure on the batch that proves it',
        [REPORT.netOfRow('main',  reportRow('U2', '261')),
         REPORT.netOfRow('main2', reportRow('U2', '261'))],
        [500, 480]);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
