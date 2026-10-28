/* THE SHEET AND THE CLAIM DIVIDE A PLOT THE SAME WAY.
 *
 * The Field Conductor records a transplanting job on his own portal: the
 * plot, which of the four jobs, the day, and the crew. Two screens in the
 * office then read it -- the Worker Record tab, which is what somebody
 * looks at, and the salary claim, which is what somebody is PAID from.
 *
 * They each work out one worker's share, and if those two ever disagree
 * the sheet shows a figure nobody is paid and the claim pays a figure
 * nobody can see. That has happened in this codebase often enough to have
 * its own heading: two copies of one rule, one of them thinner.
 *
 * So both copies are lifted out of the shipped files and driven side by
 * side over the same records. Nothing here restates the rule; if they ever
 * answer differently this fails, whichever one moved.
 *
 * Run: node tests/the_worker_record_shares_like_the_claim.cjs
 * No build and no server needed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let failed = 0;
const fail = (m) => { console.log('FAIL  ' + m); failed++; };
const ok = (m) => console.log('ok    ' + m);
const is = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want)
  ? ok(m)
  : fail(m + '  — got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want)));
const near = (got, want, m) => (Math.abs(got - want) < 1e-9
  ? ok(m)
  : fail(m + '  — got ' + got + ', wanted ' + want));
const yes = (c, m) => (c ? ok(m) : fail(m));

const SHEET = R('nursery_ops/plot_maintenance_script.js');
const CLAIM = R('npayroll/npayroll_script.js');

function lift(src, header) {
  const at = src.indexOf(header);
  if (at < 0) throw new Error('not in the shipped file: ' + header);
  let depth = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('unbalanced braces after ' + header);
}
function constBlock(src, header) {
  const at = src.indexOf(header);
  if (at < 0) throw new Error('not in the shipped file: ' + header);
  return src.slice(at, src.indexOf('];', at) + 2);
}

/* ── THE SHEET's copy ─────────────────────────────────────────────── */
const sheetCtx = { Object, Array, Number, String, Math, out: null };
vm.createContext(sheetCtx);
const lineOf = (src, re) => {
  const m = src.match(re);
  if (!m) throw new Error('not in the shipped file: ' + re);
  return m[0];
};
vm.runInContext(
  constBlock(SHEET, 'const TP_JOBS = [')
  + '\nconst TP_JOB = Object.fromEntries(TP_JOBS.map(j => [j.key, j]));\n'
  /* The not-done test is the sheet's own one-liner, not a copy: a job the
     conductor answered with "nobody did this" pays nobody, and the two
     files have to agree about that as much as about the division. */
  + lineOf(SHEET, /^const tpNotDone = .*$/m) + '\n'
  + lift(SHEET, 'function tpShare(rec, w)')
  + '\n;globalThis.__sheet = tpShare;', sheetCtx);
const sheetShare = vm.runInContext('__sheet', sheetCtx);

/* ── THE CLAIM's copy, as it really divides inside transplantFieldLines ──
   The surrounding function prices and groups; the two lines that decide a
   SHARE are lifted with the real TRANSPLANT_JOB map behind them. */
const claimCtx = { Object, Array, Number, String, Math };
vm.createContext(claimCtx);
vm.runInContext(
  constBlock(CLAIM, 'const TRANSPLANT_JOBS = [')
  + '\nconst TRANSPLANT_JOB = Object.fromEntries(TRANSPLANT_JOBS.map(j => [j.key, j]));\n'
  + lineOf(CLAIM, /^const _tpNotDone = .*$/m) + '\n'
  + `globalThis.__claim = function (rec, w) {
       const job  = TRANSPLANT_JOB[rec.work_type];
       if (_tpNotDone(rec)) return 0;
       const crew = Array.isArray(rec.workers) ? rec.workers.filter(x => x && x.name) : [];
       if (!crew.length) return 0;
       const cap  = Number(rec.source_qty || 0);
       return job && job.split ? Number(w.qty || 0) : (crew.length ? cap / crew.length : 0);
     };`, claimCtx);
const claimShare = vm.runInContext('__claim', claimCtx);

/* The claim's own lines, verbatim, so the lift above cannot drift from
   what the file actually runs. */
const claimSrc = lift(CLAIM, 'function transplantFieldLines(src)');
yes(/const qty = job && job\.split/.test(claimSrc)
 && /\? Number\(w\.qty \|\| 0\)/.test(claimSrc)
 && /: \(crew\.length \? cap \/ crew\.length : 0\)/.test(claimSrc),
    'the claim still divides the way this test lifted it');
yes(/const cap\s+= Number\(rec\.source_qty \|\| 0\)/.test(claimSrc),
    'and still takes the plot figure off source_qty');
yes(/if \(_tpNotDone\(rec\)\) return;/.test(claimSrc),
    'and still refuses to price a job nobody did');

/* ── Both, over the same records ──────────────────────────────────── */
const crew3 = [{ name: 'Ali', qty: 500 }, { name: 'Bakar', qty: 300 }, { name: 'Cik', qty: 200 }];
const CASES = [
  { what: 'the SPLIT job pays each worker the quantity keyed against them',
    rec: { work_type: 'polybag_fill', source_qty: 1000, workers: crew3 },
    expect: [500, 300, 200] },
  { what: 'transplanting divides the plot equally among the crew',
    rec: { work_type: 'transplanting', source_qty: 900, workers: crew3 },
    expect: [300, 300, 300] },
  { what: 'blanket spray the same',
    rec: { work_type: 'blanket_spray', source_qty: 2300, workers: crew3 },
    expect: [2300 / 3, 2300 / 3, 2300 / 3] },
  { what: 'lining the same',
    rec: { work_type: 'lining', source_qty: 7, workers: crew3 },
    expect: [7 / 3, 7 / 3, 7 / 3] },
  { what: 'one worker on an unsplit job takes the whole plot',
    rec: { work_type: 'lining', source_qty: 2300, workers: [{ name: 'Ali' }] },
    expect: [2300] },
  { what: 'a split job with nothing keyed against a name pays that name nothing',
    rec: { work_type: 'polybag_fill', source_qty: 1000, workers: [{ name: 'Ali', qty: null }] },
    expect: [0] },
  { what: 'an unsplit job with no source figure divides nothing',
    rec: { work_type: 'transplanting', source_qty: null, workers: crew3 },
    expect: [0, 0, 0] },
];

CASES.forEach(({ what, rec, expect }) => {
  const crew = rec.workers;
  const sheet = crew.map((w) => sheetShare(rec, w));
  const claim = crew.map((w) => claimShare(rec, w));
  expect.forEach((want, i) => near(sheet[i], want, what + ' — ' + crew[i].name));
  is(sheet.map(x => Math.round(x * 1e6)), claim.map(x => Math.round(x * 1e6)),
     '  and the claim agrees to the millionth');
});

/* A NAME WITH NO NAME is not a crew member, on either side. A blank in the
   list would otherwise divide the plot among one more person than did the
   work and cut everybody else's share. */
{
  const rec = { work_type: 'transplanting', source_qty: 600,
                workers: [{ name: 'Ali' }, { name: '' }, { name: 'Bakar' }] };
  near(sheetShare(rec, rec.workers[0]), 300, 'a blank name is not counted in the division');
  is(Math.round(sheetShare(rec, rec.workers[0]) * 1e6),
     Math.round(claimShare(rec, rec.workers[0]) * 1e6), '  and the claim agrees');
}
/* An EMPTY crew pays nobody and divides by nothing -- never NaN or
   Infinity, either of which would print as a figure on the sheet. */
{
  const rec = { work_type: 'transplanting', source_qty: 600, workers: [] };
  is(sheetShare(rec, { name: 'Ali' }), 0, 'an empty crew shares nothing, and never NaN');
}
/* A JOB NOBODY DID pays nobody, on both sides. The record keeps the plot's
   own figure -- that is what the job WOULD have been -- and the flag is
   what decides, not the names left on the row: one hand-edited in the
   Supabase dashboard could carry a crew AND the flag, and the answer is
   still that nobody carried the work out. */
{
  const rec = { work_type: 'transplanting', source_qty: 3164, workers: [], not_done: true };
  is(sheetShare(rec, { name: 'Ali' }), 0, 'a job recorded as not done shares nothing');
  is(claimShare(rec, { name: 'Ali' }), 0, '  and the claim pays nothing for it');
  const odd = { work_type: 'transplanting', source_qty: 3164,
                workers: [{ name: 'Ali' }], not_done: true };
  is(sheetShare(odd, odd.workers[0]), 0,
     'the FLAG decides, not the crew left on the row');
  is(claimShare(odd, odd.workers[0]), 0, '  and the claim agrees');
  const normal = { work_type: 'transplanting', source_qty: 3164, workers: [{ name: 'Ali' }] };
  is(sheetShare(normal, normal.workers[0]), 3164,
     'and an ordinary row is untouched by any of this');
}

/* ── The tab on the page ──────────────────────────────────────────── */
const HTML = R('nursery_ops/nursery_ops_maintenance.html');
/* The tab exists and goes to that view. The SECOND argument is not asked
   about: it was `,this` when this check was written and the markup has
   since dropped it, which changed nothing this check is about -- a test
   that pins the exact spelling of a line fails on a change that did not
   touch what it was for. */
yes(/switchPayrollView\('transplanting'/.test(HTML), 'the Worker Record has a Transplanting tab');
yes(/_payrollView === 'transplanting'\)\s*\{ renderTransplantingPayroll\(\); return; \}/.test(SHEET),
    'and the view routes to its own renderer');
yes(/\.eq\('schedule_month', m\)/.test(SHEET),
    'asked by schedule_month, the same key the claim asks on');
yes(/'tab.transplanting':'Transplanting'/.test(SHEET) && /'tab.transplanting':'Pemindahan Bibit'/.test(SHEET),
    'the tab is named in both languages');

/* THE CREW IS STILL READ-ONLY HERE, and that is the point: the FC Portal is
   the only writer of a transplanting crew in either repository, so a tick
   box over a NAME would be a second writer of somebody's pay.

   The tab is not read-only as a whole any more -- it carries the office's
   Checked tick, which is what sends a row to the salary claim. That one
   write is held to its shape in
   tests/the_transplant_claim_asks_the_office.cjs. */
const tab = lift(SHEET, 'function renderTransplantingPayroll()');
yes(!/onclick=/.test(tab),
    'the renderer puts no handler on a cell of its own — only the tick cell has one');
yes(!/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(tab),
    'and the renderer writes nothing');
const tickWrite = lift(SHEET, 'async function toggleTransplantChecked(id)');
yes(!/workers|source_qty|work_date|plot_name/.test(tickWrite),
    'the one write on this tab touches neither the crew nor the figure');

/* A name the FC credited that the register cannot place still gets a
   column. Without it their share leaves the sheet with nothing saying so,
   which is the fault pay.fieldNoColumn exists to shout about elsewhere. */
/* The rule lives in tpWorkerColumns, which the tab AND its PDF both call, so
   the paper cannot leave somebody out that the screen shows. */
yes(/const extra = onRecords\.filter\(name => !reg\.includes\(name\)\)/.test(lift(SHEET, 'function tpWorkerColumns(n, rows)'))
    && /tpWorkerColumns\(n, rows\)/.test(tab),
    'a name the register cannot place still gets a column');
yes(/t\('pay\.fieldNoColumn'\)/.test(tab), 'and the sheet says so underneath');

console.log('');
console.log(failed ? 'FAILED (' + failed + ')' : 'all green');
process.exit(failed ? 1 : 0);
