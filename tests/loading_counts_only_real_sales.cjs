/* LOADING SEEDLINGS COUNTS ONLY WHAT A LORRY WAS LOADED FOR.

   The office: "Nursery Report - Sales listing total for each of the
   nursery is not tally with the operation worker activity total."

   August 2026 was the whole of it: 110 CAL- calibration-DO lines —
   125,110 seedlings — that the Worker Activity Loading Seedlings sheet
   and the payroll claim counted as loading work, and the Sales Listing
   rightly did not. A CAL- DO is a stock correction; nobody loaded a
   lorry for it. So both readers now apply the Sales Listing's own line
   rule: no CAL-, no cancelled DO (status OR [CANCELLED] remark), and the
   same single-line total_qty fallback — one rule, three screens, one
   total. No CAL- DO had ever been ticked or locked, so nobody's pay
   moves.

   Lifts the REAL functions out of the two shipped files and drives both
   copies over the same delivery orders.
   Run: node tests/loading_counts_only_real_sales.cjs
*/
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

let fails = 0;
const check = (ok, m) => { console.log((ok ? '  ok  ' : ' FAIL ') + m); if (!ok) fails++; };

// Slice `function NAME(...) {...}` out of a file by matching its braces —
// the real shipped code, not a copy that can drift.
function lift(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  return null;
}

const waSrc = fs.readFileSync(path.join(ROOT, 'nursery_ops/plot_maintenance_script.js'), 'utf8');
const npSrc = fs.readFileSync(path.join(ROOT, 'npayroll/npayroll_script.js'), 'utf8');
const rpSrc = fs.readFileSync(path.join(ROOT, 'operation/operation_reports.html'), 'utf8');

// ── The fixtures every copy is driven over ─────────────────────────────────
const DOS = [
  { do_number: '03701', status: 'Issued',    remark: 'ACME SDN BHD', total_qty: 500,  plot_1: 'U1', qty_1: 500 },
  { do_number: 'CAL-00001', status: 'Issued', remark: 'calibration', total_qty: 9000, plot_1: 'U1', qty_1: 9000 },
  { do_number: '03702', status: 'Cancelled', remark: '',             total_qty: 400,  plot_1: 'U1', qty_1: 400 },
  { do_number: '03703', status: 'Issued',    remark: 'x [CANCELLED] y', total_qty: 300, plot_1: 'U1', qty_1: 300 },
  // single-line DO whose per-line qty was never keyed: the DO's own total
  { do_number: '03704', status: 'Issued',    remark: '',             total_qty: 250,  plot_1: 'U1', qty_1: 0 },
  // two lines, one qty missing: NO fallback — the total is not one line's
  { do_number: '03705', status: 'Issued',    remark: '',             total_qty: 900,  plot_1: 'U1', qty_1: 600, plot_2: 'B9', qty_2: 0 },
  // a collection off a "-R" transfer plot — on NO schedule list, placed
  // only by Seedling Stock. The office's second report was exactly these:
  // the sheet ran short of the Sales Listing by the -R collections.
  { do_number: '03707', status: 'Issued',    remark: '',             total_qty: 200,  plot_1: 'U12-R', qty_1: 200 }
];
const WANT_U1 = 500 + 250 + 600 + 200; // 1,550 — what the Sales Listing counts for UNN 1
// What Seedling Stock says — the index both pay readers resolve through.
// U12-R is UNN 1's, and is deliberately NOT in the schedule's plot list.
const PLOT_INDEX = { U1: 'UNN1', B9: 'BNN', U12R: 'UNN1' };
const MJM_STUB = {
  plotKey: v => String(v == null ? '' : v).replace(/[^a-z0-9]/gi, '').toUpperCase(),
  nurseryOfPlot(plot, idx) { return (idx || {})[this.plotKey(plot)] || null; }
};

// ── 1. The Worker Activity sheet's copy ────────────────────────────────────
const waGate = lift(waSrc, '_doIsLoadingWork');
const waQty  = lift(waSrc, '_doQtyForNursery');
check(!!waGate, 'plot_maintenance_script.js carries _doIsLoadingWork — the Sales Listing line rule');
check(/\.filter\(_doIsLoadingWork\)/.test(waSrc), 'and loadingSeedlingsRows filters the sheet through it');

let waTotal = null, waNoIndex = null;
if (waGate && waQty) {
  const run = new Function('NURSERY_PLOTS', 'MJMMaintPlots', '_doPlotIndex', 'dos', `${waGate}\n${waQty}\n
    return dos.filter(_doIsLoadingWork).reduce((s, d) => s + _doQtyForNursery(d, 'UNN1'), 0);`);
  waTotal   = run({ UNN1: ['U1'] }, MJM_STUB, PLOT_INDEX, DOS);
  waNoIndex = run({ UNN1: ['U1'] }, MJM_STUB, null, DOS);
}
check(waTotal === WANT_U1,
  `the sheet's UNN 1 total is the Sales Listing's — CAL- out, both cancels out, single-line fallback in, and the -R collection placed by Seedling Stock (got ${waTotal}, want ${WANT_U1})`);
check(waNoIndex === WANT_U1 - 200,
  `with no Seedling Stock index (the read failed) the schedule list is still the fallback — every ordinary plot counts (got ${waNoIndex})`);

if (waGate) {
  const g = new Function('d', `${waGate}\nreturn _doIsLoadingWork(d);`);
  check(g(DOS[1]) === false, 'a CAL- DO is refused — a stock correction loaded no lorry');
  check(g(DOS[2]) === false && g(DOS[3]) === false, 'a cancelled DO is refused by status OR by its [CANCELLED] remark');
  check(g(DOS[0]) === true, 'and an ordinary issued DO counts');
} else { check(false, 'cannot drive the gate'); check(false, 'cannot drive the gate'); check(false, 'cannot drive the gate'); }

// ── 2. The payroll claim's copy ────────────────────────────────────────────
const npGate = lift(npSrc, '_doIsLoadingWork');
const npQty  = lift(npSrc, 'maintDoQtyForNursery');
check(!!npGate, 'npayroll_script.js carries its own _doIsLoadingWork');
check(/_doIsLoadingWork\(do_\)/.test(npSrc), 'and the maintTotals Loading Seedlings pass asks it per DO');

let npTotal = null;
if (npGate && npQty) {
  const run = new Function('MJMMaintPlots', 'maint', 'dos', `${npGate}\n${npQty}\n
    return dos.filter(_doIsLoadingWork).reduce((s, d) => s + maintDoQtyForNursery(d, 'UNN1'), 0);`);
  npTotal = run(MJM_STUB, { plotIndex: PLOT_INDEX }, DOS);
}
check(npTotal === WANT_U1, `the claim's UNN 1 total is the same figure, -R collection included (got ${npTotal}, want ${WANT_U1})`);
check(npGate && waGate && npGate.replace(/\s+/g, ' ') === waGate.replace(/\s+/g, ' '),
  'the two copies are word for word one rule — a comment in each names the other');

// ── 3. The claim's DO read can carry the rule ──────────────────────────────
check(/shared_do_records'\)\s*\n?\s*\.select\('[^']*total_qty/.test(npSrc.replace(/\r/g, '')),
  "the claim's DO read selects total_qty — the fallback is nothing without it");
check(/PlotMovement\.fetchAll\(\(\)\s*=>\s*_supabase\.from\('shared_do_records'\)/.test(npSrc),
  'and it pages through fetchAll — an unpaged read goes quietly short past 1,000 DOs');

// ── 4. The Sales Listing side still holds the same three exclusions ────────
const sl = rpSrc.slice(rpSrc.indexOf('async function runSalesListing'), rpSrc.indexOf('async function bootstrap'));
check(/\^CAL-/.test(sl) && /\[CANCELLED\]/.test(sl) && /filled === 1.*total_qty|total_qty.*filled === 1/s.test(sl),
  'runSalesListing still excludes CAL- and cancelled DOs and keeps the single-line fallback — the rule the other two now share');

console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
