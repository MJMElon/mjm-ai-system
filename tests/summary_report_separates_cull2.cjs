/* THE SUMMARY REPORT SEPARATES THE 2ND CULLED; THE MPOB SUBMISSION REPORT
   DOES NOT MOVE.

   The office asked for the Nursery Report's "Summary Report" to be renamed
   MPOB Submission Report — exactly as it was, only the name — and for a NEW
   report called Summary Report that separates the 2nd culled from the 3rd:
   "this balance should be lesser than MPOB Submission report as if got the
   2nd culled qty, it will flow into this report."

   The one trap in that sentence is the double deduction: a 3rd culling
   already includes the seedlings 2nd culled on the way to it (the Batch
   Report's own rule — cull2 "is inside cull3"), so the 2nd Culled column
   deducts ONLY while its bucket carries no evidenced 3rd culling. The
   Summary Report therefore reads lower than the MPOB one exactly while a
   plot is 2nd culled and not yet 3rd culled, and the two agree again the
   day the 3rd is keyed with its drone map.

   Every block below is LIFTED out of the shipped page — MOVE_COLS with its
   derived main2, netOfRow's supersede, the event builder inside
   runMovementReportCombined (the 2nd_Culling branch included), and the
   whole of buildMovementSection — so this drives the code that runs, not a
   copy of it.

   Run: node tests/summary_report_separates_cull2.cjs
*/
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

function lift(startMark, endMark) {
  const a = src.indexOf(startMark);
  if (a < 0) { console.log('FAILED  cannot find: ' + startMark); process.exit(1); }
  const b = src.indexOf(endMark, a);
  if (b < 0) { console.log('FAILED  cannot find end of: ' + startMark); process.exit(1); }
  return src.slice(a, b + endMark.length);
}

/* ── 1. The wiring: two reports, one value that never moved ─────────────── */
console.log('\nThe selector, the registry and the dispatch');
check('the option value summary now reads MPOB Submission Report',
      src.includes('<option value="summary">MPOB Submission Report</option>'), true);
check('and a new option summary_cull2 wears the old name',
      src.includes('<option value="summary_cull2">Summary Report</option>'), true);
check('the old option markup is gone',
      src.includes('<option value="summary">Summary Report</option>'), false);
check('NURSERY_SUB_REPORTS keeps value summary under the new label',
      /value:\s*'summary',\s*label:\s*'MPOB Submission Report'/.test(src), true);
check('and carries summary_cull2 labelled Summary Report',
      /value:\s*'summary_cull2',\s*label:\s*'Summary Report'/.test(src), true);
check('the dispatch sends summary to the builder as the MPOB report',
      src.includes("if (sub === 'summary')       return runMovementReportCombined(false);"), true);
check('and summary_cull2 as the cull2 one',
      src.includes("if (sub === 'summary_cull2') return runMovementReportCombined(true);"), true);
check('both share the movement filter set',
      src.includes("const isMovement = sub === 'summary' || sub === 'summary_cull2';"), true);
check('the main section call picks the scope off withCull2',
      src.includes("buildMovementSection(withCull2 ? 'main2' : 'main'"), true);
check('the cull2 tooltip is wired like its five siblings',
      src.includes("['trIn', 'transIn', 'cull2', 'cull3', 'trOut', 'adjust']") &&
      /DETAIL_TITLES = \{[^}]*cull2: '2nd Culled'/.test(src), true);

/* ── 2. Lift the real code ──────────────────────────────────────────────── */
const helpers = [
  lift('const _RE_LOG_DATE', 'return l.created_at ? String(l.created_at).slice(0, 10) : null;\n}'),
  lift('function _mvPlotKey', "return m ? String(parseInt(m[1], 10)) : '';\n}"),
  lift('function fmtNum', "{ day:'2-digit', month:'short', year:'numeric' }); }"),
  lift('const SUMMARY_SKIP_TYPES', ']);'),
  lift("const NURSERY_ORDER = ['PN'", 'return i === -1 ? NURSERY_ORDER.length : i;\n}'),
  lift('const MOVE_COLS = {', "(c.key === 'cull2' && superseded) ? s : s + c.sign * (b[c.key] || 0), 0);\n}"),
  lift('function ageLabel', "return m + (m === 1 ? ' month' : ' months');\n}"),
  'let _mvDetailPool = [];',
  lift('function buildMovementSection(scope, ev, ctx) {', '${unmatchedHtml}\n    </div>\n  `;\n}'),
].join('\n');

// The event builder: everything from `const ev = [];` up to the sales pass —
// push/pushDetail, srcTrayOf, batchHomeTray and the one logs.forEach,
// 2nd_Culling branch included.
const evStart = src.indexOf('  const ev = [];');
const evEnd = src.indexOf('// ── Sales, only against', evStart);
if (evStart < 0 || evEnd < 0) { console.log('FAILED  cannot lift the event builder'); process.exit(1); }
const eventBlock = src.slice(evStart, evEnd);

/* One run of the movement build: logs in, the main section's HTML out, both
   as the MPOB report (withCull2 false) and as the Summary (true). */
function run({ logs, withCull2, from, to, plotToLoc }) {
  const code = helpers + `
    const passMain = (plot) => !!plot && !!plotToLoc[plot];
  ` + eventBlock + `
    _mvDetailPool = [];
    const ctx = { fromMs, toMs, fromStr, toStr, groupBy: 'plot', plotToLoc,
                  trayNursery: {}, batchPlantedAt: {}, saleDetails: {},
                  colDetails, unmatchedSales: [] };
    const scope = withCull2 ? 'main2' : 'main';
    const html = buildMovementSection(scope, ev.filter(e => e.sc === 'main'), ctx);
    return { html, ev, cols: MOVE_COLS[scope].map(c => c.label) };
  `;
  return new Function('logs', 'withCull2', 'plotToLoc', 'fromMs', 'toMs', 'fromStr', 'toStr', code)(
    logs, withCull2, plotToLoc || { N5: 'BNN' },
    from ? new Date(from).getTime() : -Infinity,
    to ? new Date(to).getTime() + 86400000 : Infinity,
    from || '', to || '');
}

const num = (s) => Number(String(s).replace(/,/g, ''));
/* The GRAND TOTAL row's cells, as numbers: [bf, ...cols, closing, closing]. */
function grandRow(html) {
  const m = html.match(/GRAND TOTAL<\/td>([\s\S]*?)<\/tr>/);
  if (!m) return null;
  return [...m[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)]
    .map(x => x[1].trim()).filter(x => x !== '').map(num);
}
const headers = (html) => [...html.matchAll(/<th>([^<]+)<\/th>/g)].map(m => m[1]);

const L = (type, batch, plot, date, qty, remark) => ({
  transaction_type: type, batch_name: batch, plot_name: plot,
  transaction_date: date, created_at: date, quantity_change: qty, remark: remark || ''
});

/* ── 3. The office's case: 2nd culled, no 3rd yet ───────────────────────── */
console.log('\nBatch 300 in N5: 5,000 in, 400 2nd culled, no 3rd culling yet');
const BASE = [
  L('Transplanted', '300', 'N5', '2026-09-10', 5000, 'from tray [P1]'),
  L('2nd_Culling',  '300', 'N5', '2026-10-12', -400),
];
const OCT = { from: '2026-10-01', to: '2026-10-31' };
{
  const mpob = run({ logs: BASE, withCull2: false, ...OCT });
  const sum  = run({ logs: BASE, withCull2: true,  ...OCT });
  check('the MPOB report has no 2nd Culled column', headers(mpob.html).includes('2nd Culled'), false);
  check('and its balance ignores the 2nd culling', grandRow(mpob.html).slice(-1), [5000]);
  check('the Summary Report carries the column, before the 3rd',
        sum.cols.indexOf('2nd Culled') === sum.cols.indexOf('3rd Culled') - 1, true);
  check('its 2nd Culled total is the 400', grandRow(sum.html)[sum.cols.indexOf('2nd Culled') + 1], 400);
  check('and its balance is LESSER by exactly the 2nd culled', grandRow(sum.html).slice(-1), [4600]);
  check('no 2nd culling ever lands in the pre-nursery section',
        sum.ev.some(e => e.sc === 'pre' && e.col === 'cull2'), false);
}

/* ── 4. The 3rd culling supersedes the 2nd ──────────────────────────────── */
console.log('\nThe same plot, 3rd culled 600 with a drone map: the 2nd stops deducting');
const DONE = BASE.concat([L('3rd_Culling', '300', 'N5', '2026-10-20', -600, 'MapQty: 4400')]);
{
  const mpob = run({ logs: DONE, withCull2: false, ...OCT });
  const sum  = run({ logs: DONE, withCull2: true,  ...OCT });
  check('MPOB deducts the evidenced 3rd culling', grandRow(mpob.html).slice(-1), [4400]);
  check('the Summary still SHOWS the 400 2nd culled',
        grandRow(sum.html)[sum.cols.indexOf('2nd Culled') + 1], 400);
  check('but no longer deducts it — the two reports agree again',
        grandRow(sum.html).slice(-1), [4400]);
  check('and the page says why, on the Summary alone',
        [sum.html.includes('already includes the seedlings 2nd culled'),
         mpob.html.includes('already includes the seedlings 2nd culled')], [true, false]);
}

console.log('\nAn un-evidenced 3rd culling (no MapQty) supersedes nothing');
{
  const half = BASE.concat([L('3rd_Culling', '300', 'N5', '2026-10-20', -600, '')]);
  const mpob = run({ logs: half, withCull2: false, ...OCT });
  const sum  = run({ logs: half, withCull2: true,  ...OCT });
  check('MPOB counts no un-evidenced culling', grandRow(mpob.html).slice(-1), [5000]);
  check('so the Summary goes on deducting the 2nd', grandRow(sum.html).slice(-1), [4600]);
}

/* ── 5. B/F is its own honest bucket ────────────────────────────────────── */
console.log('\nA 2nd culling from LAST month: B/F already carries it, superseded this month');
{
  const logs = [
    L('Transplanted', '300', 'N5', '2026-09-10', 5000, 'from tray [P1]'),
    L('2nd_Culling',  '300', 'N5', '2026-09-20', -400),
    L('3rd_Culling',  '300', 'N5', '2026-10-20', -600, 'MapQty: 4400'),
  ];
  const sum = run({ logs, withCull2: true, ...OCT });
  const g = grandRow(sum.html);
  check('B/F into October reads 4,600 — the 2nd was the standing deduction then', g[0], 4600);
  check('the closing reads 4,400 — the 3rd is the standing deduction now', g.slice(-1), [4400]);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
