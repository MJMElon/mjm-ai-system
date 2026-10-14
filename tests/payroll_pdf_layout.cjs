/* WHAT THE PRINTED PAYROLL FORMS OWE THE OFFICE.

   Seven things were wrong with them at once, and every one of them is only
   visible on paper:

     1  RM2117.74 with no comma in it, on a sheet read down a column
     2  …and the screen had the comma, so the two disagreed
     3  "Sep 2026" where the month on a signed form should be written out
     4  the four cards the screen opens with were nowhere on the paper
     5  the drone maps came out landscape because the claim they ride on is
     6  eight workers broke onto a second page with a third of the first one
        blank under them, and the plot summary then took a third page
     7  a plot split across a page break on the Worker Record

   The money and the pagination rule are lifted out of the real files and
   driven; the rest is asserted against the source, because a jsPDF page has
   no DOM to read back and the thing being checked IS which call was made.

   Run: node tests/payroll_pdf_layout.cjs
*/
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PAY  = fs.readFileSync(path.join(ROOT, 'npayroll', 'npayroll_script.js'), 'utf8');
const MNT  = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'plot_maintenance_script.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

/* ── the money, lifted ──────────────────────────────────────────────────── */
const lift = (src, from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) { console.log('FAILED  could not lift ' + from); process.exit(1); }
  return src.slice(a, b + to.length);
};
const moneySrc = lift(PAY, 'const moneyFig = v =>', 'return \'RM \' + grouped(4);\n}');
const { money, moneyFig, rateTxt } =
  new Function(moneySrc + '\nreturn { money, moneyFig, rateTxt };')();

console.log('\n1 · every printed figure carries its commas');
check('two thousand one hundred and seventeen', money(2117.74), 'RM 2,117.74');
check('…and so does a six-figure claim', money(196777), 'RM 196,777.00');
check('under a thousand is unchanged', money(55.73), 'RM 55.73');
check('a loss keeps its sign', money(-1337.5), 'RM -1,337.50');
check('and two places always', money(1000), 'RM 1,000.00');
/* A rate may carry more than two places, and the one that reaches four
   digits must not be the only money on the page without a comma. */
check('a rate keeps its extra places', rateTxt(0.015), 'RM 0.015');
check('…and groups when it is large enough to', rateTxt(1234.5), 'RM 1,234.50');
check('nothing keyed reads as a dash', rateTxt(null), '—');

console.log('\n2 · nothing in the payroll file prints money the ungrouped way');
/* "RM " followed by a toFixed is the shape that produced RM2117.74. money()
   and moneyFig() are the only places a figure may be turned into text. */
const ungrouped = PAY.split('\n')
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => /['"`]RM ?['"`]?\s*\+[^\n]*toFixed\(|RM\$\{[^}]*toFixed\(/.test(l))
  .map(([n, l]) => n + ': ' + l.trim());
check('no bare RM + toFixed anywhere', ungrouped, []);
checkTrue('and the Worker Record prints no money of its own',
          !/['"`]RM/.test(MNT.slice(MNT.indexOf('function downloadPayrollPDF'),
                                    MNT.indexOf('function downloadPayrollPDF') + 9000)));

console.log('\n3 · the month on a signed form is written out');
const transplPdf = PAY.slice(PAY.indexOf('async function _downloadTransplantPDF'),
                             PAY.indexOf('/* THE PLOT SUMMARY, ON THE CLAIM FORM'));
checkTrue('the Transplanting claim takes the full month',
          /const monthTxt = monthLabelFull\(monthValue\(\)\)/.test(transplPdf));
checkTrue('so do the Monthly Payroll and the Work Maintenance claim',
          (PAY.match(/pdfTitle\(doc, \['MONTHLY PAYROLL'[^;]*monthLabelFull/s) ? 1 : 0)
          + (PAY.match(/SALARY CLAIM FORM — WORK MAINTENANCE[^;]*monthLabelFull/s) ? 1 : 0) === 2);
/* monthLabel() itself must NOT change: the maintenance module STORES its
   month in that shape, so making it full would be a change of key. */
checkTrue('and the short form still exists, because it is a database key',
          /\.eq\('schedule_month', monthLabel\(/.test(PAY));

console.log('\n4 · the four cards are on the paper too');
checkTrue('the Transplanting form draws the ribbon', /const drawCapRibbon = \(y\)/.test(transplPdf));
checkTrue('…under the title, before the column heads',
          transplPdf.indexOf('if (withRibbon) y = drawCapRibbon(y);') > transplPdf.indexOf("pdfTitle(doc, ['SALARY CLAIM FORM")
       && transplPdf.indexOf('if (withRibbon) y = drawCapRibbon(y);') < transplPdf.indexOf("'Capacity'"));
/* ON THE FIRST PAGE ONLY. The band carries the whole nursery total, not this
   page of it, so a second copy on page two states the same four figures again
   and invites somebody to add the two pages together. The column heads DO
   repeat — those label the rows under them. */
checkTrue('the band is drawn on the first page and not after it',
          /let y = drawHead\(true\);/.test(transplPdf)
       && /doc\.addPage\(\); y = drawHead\(false\); \}/.test(transplPdf));
/* WORK MAINTENANCE KEEPS ITS BAND ON EVERY PAGE, which the office asked for
   after seeing both. The two sheets are otherwise deliberately the same
   shape, so this is the one place they differ on purpose and the difference
   is worth a test of its own — otherwise the next person tidies one into
   line with the other. */
const maintPdf = PAY.slice(PAY.indexOf('function _downloadMaintPDF'),
                           PAY.indexOf('/* The Transplanting claim, on paper.'));
checkTrue('Work Maintenance keeps its band on every page',
          /const drawHead = \(\) => \{/.test(maintPdf)
       && /y = drawCapRibbon\(y\);/.test(maintPdf)
       && !/drawHead\((?:true|false)\)/.test(maintPdf));
checkTrue('…one card per job, the same four the screen shows',
          /TRANSPLANT_JOBS\.forEach\(\(j, i\) => \{\s*const x = X\[0\] \+ i \* \(cardW \+ GAP\)/.test(transplPdf));
checkTrue('…carrying the capacity and what it prices at',
          /doc\.text\(capFmt\(cap\)/.test(transplPdf) && /const wdTxt = workdoneTxt\(j\.key\)/.test(transplPdf));
/* And the row it replaced is gone from the column heads, which is where the
   height for the band came from. */
checkTrue('and the per-column Total Workdone row is gone',
          !/workdoneTxt\(j\.key\),\s*$[\s\S]{0,80}bold: true, size: 6\.5/m.test(transplPdf));

console.log('\n5 · the drone maps are portrait, the claim stays landscape');
checkTrue('the claim is landscape', /const doc = pdfDoc\('landscape'\);/.test(transplPdf));
const maps = PAY.slice(PAY.indexOf('async function drawDroneMaps'),
                       PAY.indexOf('async function downloadTransplantPDF'));
checkTrue('each map page names its own orientation', /doc\.addPage\('a4', 'portrait'\)/.test(maps));
checkTrue('…and is laid out to a portrait page', /const X = 25, W = 160;/.test(maps)
                                              && /const BOTTOM = 297 - 12;/.test(maps));
checkTrue('…with the title centred on it', /centerX: 105, lineLeft: 25, lineRight: 185/.test(maps));

console.log('\n6 · the page is used before it is turned');
/* The old reserve was a flat 40mm on top of a 25mm margin, on a page 210
   tall: rows had to stop at 145, which is where the blank third came from. */
checkTrue('the claim reserves what it actually needs',
          /const FOOT_RESERVE = \(RH \+ 1\) \+ 6 \+ 4 \+ 3;/.test(transplPdf));
checkTrue('…and no longer takes the margin off on top of it',
          /if \(y \+ RH > PAGE_H - FOOT_RESERVE\)/.test(transplPdf)
       && !/PAGE_H - MARGIN - 40/.test(transplPdf));
const plots = PAY.slice(PAY.indexOf('function drawTransplantPlots'));
checkTrue('the plot summary does the same arithmetic',
          /const BOTTOM = 210 - \(\(RH \+ 1\) \+ 6 \+ 4 \+ 3\);/.test(plots));
/* Eight workers, the figures off the office sheet: title 59, ribbon 19,
   heads 20, nine millimetres a row. The last row has to end above the floor
   or the sheet is two pages again. */
const TITLE = 59, BAND = 14 + 2, HEADS = 8 + 6 + 6;
const firstRowY = TITLE + BAND + HEADS;
const floorFor = (rh) => 210 - ((rh + 1) + 6 + 4 + 3);
check('so eight workers fit on one page', firstRowY + 8 * 9 <= floorFor(9), true);
/* And eight CALIBRATED workers too, which is the sheet the office actually
   has: the band costing three millimetres less is what that one was short
   by, and it is the case that spilled a single row onto a second page. */
check('…calibration band and all', firstRowY + 8 * 11 <= floorFor(11), true);
check('and the Grand Total under them', firstRowY + 8 * 11 + 12 <= 210 - 10, true);
/* A page after the first has no band on it, so it carries more rows than the
   first did rather than fewer. */
check('a later page is not tighter than the first', TITLE + HEADS < firstRowY, true);

console.log('\n7 · a plot is not broken across two pages');
const pagesSrc = lift(MNT, 'function payrollPlotPages(rows, o) {', '\n  return page;\n}');
const payrollPlotPages = new Function(pagesSrc + '\nreturn payrollPlotPages;')();
const R = (plot, n) => Array.from({ length: n }, () => ({ plot }));
{
  /* Two plots of four rows each, with room for six on the first page: the
     second plot goes over whole rather than 2 and 2. */
  const rows = [...R('N15', 4), ...R('N16', 4)];
  const o = { rowH: 10, floor: 100, firstY: 40, freshY: 40 };   // six to a page
  check('the second plot goes over together',
        payrollPlotPages(rows, o), [0, 0, 0, 0, 1, 1, 1, 1]);
}
{
  // One plot per row cannot be kept together with anything, so it packs.
  const rows = [R('A', 1), R('B', 1), R('C', 1), R('D', 1), R('E', 1), R('F', 1), R('G', 1)].flat();
  const o = { rowH: 10, floor: 100, firstY: 40, freshY: 40 };
  check('single-row plots still fill the page',
        payrollPlotPages(rows, o), [0, 0, 0, 0, 0, 0, 1]);
}
{
  // A plot taller than any page has to split, and splits at the page edge.
  const rows = R('BIG', 9);
  const o = { rowH: 10, floor: 100, firstY: 40, freshY: 40 };
  check('a plot too tall for a page splits rather than looping',
        payrollPlotPages(rows, o), [0, 0, 0, 0, 0, 0, 1, 1, 1]);
}
{
  // Nothing moves when everything fits.
  check('one page stays one page',
        payrollPlotPages([...R('N15', 2), ...R('N16', 2)],
                         { rowH: 10, floor: 200, firstY: 40, freshY: 40 }),
        [0, 0, 0, 0]);
}
check('and no rows is no pages', payrollPlotPages([], { rowH: 10, floor: 100, firstY: 40, freshY: 40 }), []);
checkTrue('the PDF asks the rule rather than keeping a second copy',
          /const pageOf = payrollPlotPages\(rows, \{/.test(MNT)
       && /if \(ri > 0 && pageOf\[ri\] !== pageOf\[ri - 1\]\)/.test(MNT));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
