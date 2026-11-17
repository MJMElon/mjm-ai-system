/* THE PRE-NURSERY SECTION OF THE NURSERY REPORT AND THE SUMMARY REPORT
   IS THE BATCH REPORT'S OWN TRAYS.

   The office: the figures must come from Planting & Damage, Transplanting
   (which is the Transplanted Out) and the 1st culled. They did, except at
   the two holding trays. A transplant out of PREMIUM CARE or DOUBLE-TONE
   was sent back to the batch home tray, so a seedling moved into Premium
   Care came off its numbered tray TWICE, and Premium Care never emptied.
   Tab 3 (calcTransplanting) debits the holding tray itself, and fills the
   Double-Tone one from the keyed Double Tone Quantity in Nursery.

   The event builder and the section builder are LIFTED out of the shipped
   page, so this drives the code that runs.

   Run: node tests/the_pre_nursery_follows_the_batch_report.cjs
*/
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function lift(a0, b0) {
  const a = src.indexOf(a0); const b = src.indexOf(b0, a);
  if (a < 0 || b < 0) { console.log('FAILED  cannot lift ' + a0); process.exit(1); }
  return src.slice(a, b + b0.length);
}
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
const evStart = src.indexOf('  const ev = [];');
const evEnd = src.indexOf('// ── Sales, only against', evStart);
const eventBlock = src.slice(evStart, evEnd);

function run(logs) {
  const code = helpers + `
    const passMain = (plot) => plot === 'N5';
  ` + eventBlock + `
    const pre = ev.filter(e => e.sc === 'pre');
    const bal = {};
    pre.forEach(e => {
      const c = MOVE_COLS.pre.find(x => x.key === e.col);
      bal[e.place] = (bal[e.place] || 0) + (c ? c.sign : 0) * e.qty;
    });
    const html = buildMovementSection('pre', pre, { fromMs: -Infinity, toMs: Infinity, fromStr: '', toStr: '',
      groupBy: 'plot', plotToLoc: {}, trayNursery: {}, batchPlantedAt: {}, saleDetails: {}, colDetails, unmatchedSales: [] });
    return { bal, html, pre };
  `;
  return new Function('logs', code)(logs);
}
const L = (type, plot, qty, remark, created) => ({ transaction_type: type, batch_name: '400', plot_name: plot,
  transaction_date: '2026-10-05', created_at: created || '2026-10-05T08:00:00Z', quantity_change: qty, remark: remark || '' });

const LOGS = [
  L('Planted', 'P1', 1000),
  L('Damaged_Seeds', null, 30),
  L('1st_Culling', 'P1', 50, 'Date: 2026-10-06'),
  L('Transplanted_Premium', 'PREMIUM CARE', 100, 'Moved from tray [P1] to PREMIUM CARE tray. Date: 2026-10-07'),
  L('1st_Culling', 'PREMIUM CARE', 10, 'Date: 2026-10-08'),
  L('Transplanted', 'N5', 90, 'Transplanted from tray [PREMIUM CARE] to Main Plot [N5]. Date: 2026-10-09'),
  L('Transplanted', 'N5', 600, 'Transplanted from tray [P1] to Main Plot [N5]. Date: 2026-10-09'),
  L('DTone_Nursery_Qty', 'DOUBLE-TONE', 25, '', '2026-10-01T08:00:00Z'),
  L('DTone_Nursery_Qty', 'DOUBLE-TONE', 40, '', '2026-10-04T08:00:00Z'),
  L('Transplanted', 'N5', 40, 'Transplanted from tray [DOUBLE-TONE] to Main Plot [N5]. Date: 2026-10-10'),
];
console.log('\nBatch 400: P1 1,000 planted, 100 to Premium Care, D-Tone keyed 40');
const r = run(LOGS);
check('P1 is planted less its 1st culling less what left it (incl. into Premium Care)', r.bal.P1, 1000 - 50 - 100 - 600);
check('Premium Care is what went in less its culling less what left it', r.bal['PREMIUM CARE'], 100 - 10 - 90);
check('Double-Tone is the NEWEST keyed figure less what left it', r.bal['DOUBLE-TONE'], 40 - 40);
const tot = Object.values(r.bal).reduce((s, n) => s + n, 0);
check('the section adds up to planted + keyed D-Tone − 1st culled − transplanted to a plot', tot, 1000 + 40 - 60 - 730);
check('Transplanted Out is every transplant row by its own tray', 
  r.pre.filter(e => e.col === 'transOut').reduce((s, e) => s + e.qty, 0), 100 + 90 + 600 + 40);
check('Seed Damage is shown and moves no balance', r.pre.filter(e => e.col === 'damaged').reduce((s, e) => s + e.qty, 0), 30);
check('the section draws', /Pre-Nursery Movement/.test(r.html), true);

console.log('\nA Transplanted_DoubleTone fill is not counted on top of a keyed figure');
const r2 = run(LOGS.concat([L('Transplanted_DoubleTone', 'DOUBLE-TONE', 15, 'from tray [P1]')]));
check('Double-Tone still reads the keyed 40 in, not 55', r2.pre.filter(e => e.place === 'DOUBLE-TONE' && e.col === 'trIn').reduce((s, e) => s + e.qty, 0), 40);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
