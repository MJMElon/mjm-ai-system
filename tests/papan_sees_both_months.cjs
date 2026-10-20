/* Papan Tanda audits the signs on the plots transplanted LAST MONTH and
 * THIS MONTH, not this month alone.
 *
 * The office asked for it in one line -- "so i can see sep transplanting
 * plot and oct transplanting plot. So our auditor just based on this to
 * audit plot needed" -- and the reason one month was too narrow is the
 * walking: a plot transplanted on the 28th gets its sign nailed up days
 * later, and on the 1st it dropped off the list whether or not anybody
 * had looked at it.
 *
 * TWO COPIES OF THE WINDOW, and that is what this test is mostly about.
 * audit_papan_script.js queries the ledger with it; audit_pending.js
 * builds the home board's to-do row and its plot chips from it. A plot
 * inside one and outside the other is a to-do row with no card to open,
 * or a card nothing ever asked for. The test runs BOTH shipped copies
 * over the same days and compares the answers.
 *
 * It reads the SHIPPED files and lifts the real functions, because the
 * whole risk here is two copies drifting apart with nothing saying so.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const A = path.join(__dirname, '..', 'audit');
const papanSrc   = fs.readFileSync(path.join(A, 'audit_papan_script.js'), 'utf8');
const pendingSrc = fs.readFileSync(path.join(A, 'audit_pending.js'), 'utf8');

/* A function this test cannot FIND is the same answer as one that gives
   the wrong number -- the rule is not in the shipped file. Reported as a
   failed check rather than as a stack trace, so running this against an
   older copy reads as a result instead of as a broken test. */
let fail = 0;
const ok = (cond, what) => {
  console.log((cond ? '  pass  ' : '  FAIL  ') + what);
  if (!cond) fail = 1;
};
function done(){
  console.log('');
  console.log(fail ? 'FAILED' : 'all green');
  process.exit(fail);
}
function lift(src, header){
  const at = src.indexOf(header);
  if (at < 0){
    ok(false, 'the shipped file carries ' + header.replace('function ', ''));
    done();
  }
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++){
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('unbalanced braces after ' + header);
}

/* ── 1. the window, in both copies, on the same days ─────────────── */

/* Both files name the helper the same thing on purpose — it is one
   rule, and a grep for it has to find both halves. The board's copy
   takes an `asOfISO`, because it has to ask about the month a carried
   row is ABOUT; the module page only ever shows now. Asked about
   today, the two must give the same answer, which is what this runs. */
const winPapan   = lift(papanSrc,   'function _papanWindowStartISO()');
const monthOf    = lift(pendingSrc, 'function _papanMonthOf(asOfISO)');
const isoDayLine = (() => {
  const at = pendingSrc.indexOf('const _isoDay =');
  return pendingSrc.slice(at, pendingSrc.indexOf(';', pendingSrc.indexOf('\n', at)) + 1);
})();
const winPending = monthOf + '\n' + isoDayLine + '\n'
                 + lift(pendingSrc, 'function _papanWindowStartISO(asOfISO)');
const endPending = winPending + '\n'
                 + lift(pendingSrc, 'function _papanWindowEndISO(asOfISO)');

function runWindow(fnSrc, y, m, d, call){
  const ctx = { Date: class extends Date {
    constructor(...a){ if (!a.length) super(y, m, d); else super(...a); }
  }, Number, RegExp, String, out: null };
  vm.createContext(ctx);
  vm.runInContext(fnSrc + '\nout = ' + (call || '_papanWindowStartISO()') + ';', ctx);
  return ctx.out;
}

const DAYS = [
  { y:2026, m:9,  d:14, want:'2026-09-01', say:'14 Oct 2026 opens the window on 1 September' },
  { y:2026, m:9,  d:1,  want:'2026-09-01', say:'the 1st of the month keeps last month in' },
  { y:2026, m:9,  d:31, want:'2026-09-01', say:'the last day of the month is the same window' },
  { y:2026, m:0,  d:5,  want:'2025-12-01', say:'January reaches back into LAST YEARS December' },
  { y:2026, m:2,  d:31, want:'2026-02-01', say:'31 March gives 1 February, not a rolled-over 3 March' },
];
DAYS.forEach(c => {
  const p = runWindow(winPapan, c.y, c.m, c.d);
  const q = runWindow(winPending, c.y, c.m, c.d);
  ok(p === c.want, c.say + ' (module page: ' + p + ')');
  ok(q === p, '  and the home board agrees on that day (' + q + ')');
});

/* ── 2. the module page actually QUERIES with it ─────────────────── */
ok(/transaction_date\.gte\.'\s*\+\s*monthStart/.test(papanSrc)
   && /const monthStart = _papanWindowStartISO\(\);/.test(papanSrc),
   'the ledger query is built from the two-month window');
ok(!/_startOfThisMonthISO/.test(papanSrc) && !/_startOfThisMonthISO/.test(pendingSrc),
   'the one-month helper is gone from both files, so nothing can call it by habit');

/* ── 3. which plots the home board hands over ────────────────────── */
const latestSrc = lift(pendingSrc, 'function latestPapanPerPlot(nursery, asOfISO)');
function roster(rows, today, asOf){
  const ctx = {
    papanBat: rows,
    Date: class extends Date {
      constructor(...a){ if (!a.length) super(today[0], today[1], today[2]); else super(...a); }
    },
    Object, Number, RegExp, String, out: null
  };
  vm.createContext(ctx);
  vm.runInContext(endPending + '\n' + latestSrc + '\nout = latestPapanPerPlot("BNN", '
                  + (asOf ? JSON.stringify(asOf) : 'undefined') + ');', ctx);
  return ctx.out;
}
{
  const rows = [
    {nursery:'BNN', plot:'B04', batch:'268', date:'2026-09-20'},   // last month
    {nursery:'BNN', plot:'B07', batch:'271', date:'2026-10-03'},   // this month
    {nursery:'BNN', plot:'B09', batch:'255', date:'2026-08-28'},   // two months back
    {nursery:'BNN', plot:'B11', batch:'262', date:'2026-09-02'},   // last month, then again
    {nursery:'BNN', plot:'B11', batch:'274', date:'2026-10-09'},
    {nursery:'BNN', plot:'B12', batch:'277', date:''},             // nobody dated it
    {nursery:'UNN1',plot:'U03', batch:'270', date:'2026-10-01'},   // another nursery
  ];
  const got = roster(rows, [2026, 9, 14]);
  const plots = got.map(b => b.plot).sort();
  ok(plots.join(',') === 'B04,B07,B11',
     'last month and this month are both on the list (' + plots.join(',') + ')');
  ok(!plots.includes('B09'), 'two months back is out');
  ok(!plots.includes('B12'), 'an undated record is dropped rather than guessed at');
  ok(got.every(b => b.nursery === 'BNN'), 'another nursery is not on this one list');
  const b11 = got.find(b => b.plot === 'B11');
  ok(b11 && b11.batch === '274',
     'a plot transplanted in BOTH months is its NEWER batch -- the sign says what is standing there now');
}

/* ── 3b. AND IT IS AS AT THE ROW, NOT AS AT TODAY ──────────── */
/* The board carries an unfinished round forward, so in October it drew
   an AUG 2026 papan row, a SEP 2026 one and October's own -- three rows,
   each listing the same six plots, every one tagged SEP 26. A round that
   closed on 20 August cannot be owed a sign that went up in September:
   that row was asking about plots which did not exist when it was due,
   so nothing an auditor did would ever clear it and it never left the
   board. Anchoring the window on the row's own month is the fix, and the
   UPPER bound is the half that was missing altogether. */
{
  const rows = [
    {nursery:'BNN', plot:'B04', batch:'268', date:'2026-09-20'},
    {nursery:'BNN', plot:'B11', batch:'274', date:'2026-09-02'},
    {nursery:'BNN', plot:'B07', batch:'271', date:'2026-10-03'},
    {nursery:'BNN', plot:'B01', batch:'244', date:'2026-07-11'}
  ];
  const at = (asOf) => roster(rows, [2026, 9, 15], asOf).map(b => b.plot).sort().join(',');

  ok(at('2026-08-01') === 'B01',
     'the AUGUST row asks about July and August only -- Septembers plots are not on it ('
     + (at('2026-08-01') || 'nothing') + ')');
  ok(at('2026-09-01') === 'B04,B11',
     'the SEPTEMBER row is August and September (' + at('2026-09-01') + ')');
  ok(at('2026-10-01') === 'B04,B07,B11',
     'October is September and October (' + at('2026-10-01') + ')');
  ok(at('2026-09-01').indexOf('B07') === -1,
     'and the UPPER bound holds -- an OCTOBER plot is not on Septembers row');
  ok(at(undefined) === at('2026-10-01'),
     'asking without a month means today, which is what the module page wants');
  ok(at('2026-07-01') === 'B01',
     'a July row is June and July, so it carries the July plot and nothing later');
  ok(at('2026-06-01') === '',
     'and a row from a month with no placements at all comes back empty, '
     + 'which is what takes it off the board');
}

/* ── 4. the plots are grouped by the month they went out in ──────── */
const keySrc = lift(papanSrc, 'function _papanMonthKey(b)');
{
  const ctx = { out:null };
  vm.createContext(ctx);
  vm.runInContext(keySrc + `
    const rows = [
      {plot:'B07', dateTransplant:'2026-10-03'},
      {plot:'B04', dateTransplant:'2026-09-20'},
      {plot:'B12', dateTransplant:'', datePlanted:''},
      {plot:'P31', datePlanted:'2026-09-08'},
      {plot:'B02', dateTransplant:'2026-10-11'}
    ];
    const byMonth = new Map();
    rows.forEach(b => {
      const k = _papanMonthKey(b);
      if(!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(b.plot);
    });
    const keys = [...byMonth.keys()].sort((a,b) => {
      if(!a) return 1;
      if(!b) return -1;
      return b.localeCompare(a);
    });
    out = keys.map(k => k + ':' + byMonth.get(k).sort().join('|'));
  `, ctx);
  ok(ctx.out[0] === '2026-10:B02|B07', 'this month heads the list');
  ok(ctx.out[1] === '2026-09:B04|P31',
     'last month follows it, and a PN plot is grouped by its PLANTED date');
  ok(ctx.out[2] === ':B12',
     'an undated record gets a heading of its own at the BOTTOM, rather than being dropped');
}

/* ── 5. a batch is not audited for ever because it was audited once ─ */
/* The window being two months is what makes this necessary: a plot
   audited in September now rides into October, and "ever audited" would
   draw it green while the board, which asks about the round's own dates,
   went on listing it as owed. */
const inRoundSrc = lift(papanSrc, 'function _papanInRound(a, w)');
{
  const ctx = { out:null };
  vm.createContext(ctx);
  vm.runInContext(inRoundSrc, ctx);
  const sep = {date:'2026-09-18'}, oct = {date:'2026-10-16'};
  /* 14 Oct: Octobers window (15-20) has not opened, so the round still
     owed is Septembers, held open to today by the overdue rule. */
  const stillSep = {fromISO:'2026-09-15', toISO:'2026-10-14'};
  ok(ctx._papanInRound(sep, stillSep) === true,
     'while Septembers round is the one owed, Septembers audit answers it');
  /* 16 Oct: Octobers window is open and asks its own question. */
  const octWin = {fromISO:'2026-10-15', toISO:'2026-10-20'};
  ok(ctx._papanInRound(sep, octWin) === false,
     'once Octobers round opens, Septembers audit stops answering it');
  ok(ctx._papanInRound(oct, octWin) === true, 'Octobers audit answers Octobers round');
  ok(ctx._papanInRound(sep, null) === true,
     'no rounds configured falls back to the old question -- showing too much is the safe direction');
}

/* ── 6. the card still shows the work that WAS done ──────────────── */
ok(/function getLastAuditForBatch\(/.test(papanSrc),
   'the last audit is still reachable, so a lapsed round does not hide an auditors own work');
ok(/const audit=getLastAuditForBatch\(b\.uid\);/.test(papanSrc),
   'Batch Info keeps the EVER question -- it is a register, not a to-do list');

done();
