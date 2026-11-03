/* THE TRANSPLANTING CLAIM IS PAID ON A ROW THE OFFICE HAS CHECKED.
 *
 * The four transplanting jobs are keyed by the Field Conductor on his own
 * portal and used to reach the salary claim straight from there -- so the
 * office had no way to hold a row it was still asking about, and the first
 * anybody saw of a figure was the money. The gate is the same Checked tick
 * the other four Worker Record tabs have carried for months.
 *
 * Three things have to be true of a gate like this, and all three have been
 * got wrong in this codebase before:
 *
 *   1. held work is COUNTED AND NAMED, never silently missing -- a claim
 *      short of work reads exactly like a quiet month
 *   2. it FAILS OPEN -- a database without the columns must not empty a
 *      month's claim, it must pay it the way it did before and say so
 *   3. the OFFICE writes only the tick, never the crew -- the FC Portal is
 *      still the only writer of somebody's pay
 *
 * Everything here is lifted out of the shipped files and driven; nothing
 * restates a rule.
 *
 * Run: node tests/the_transplant_claim_asks_the_office.cjs
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
const yes = (c, m) => (c ? ok(m) : fail(m));
const no  = (c, m) => (!c ? ok(m) : fail(m));

const CLAIM = R('npayroll/npayroll_script.js');
const SHEET = R('nursery_ops/plot_maintenance_script.js');
const SQL   = R('shared/RUN_ME_transplant_checked.sql');

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
const line = (src, header) => {
  const at = src.indexOf(header);
  if (at < 0) throw new Error('not in the shipped file: ' + header);
  return src.slice(at, src.indexOf(';', at) + 1);
};
/* `const X = '...' + '...';` across lines -- read to the semicolon that ends
   the statement rather than to the end of the line. */
const stmt = line;
const constBlockOf = (src, header) => {
  const at = src.indexOf(header);
  if (at < 0) throw new Error('not in the shipped file: ' + header);
  return src.slice(at, src.indexOf('];', at) + 2);
};
const lineOf = (src, re) => {
  const m = src.match(re);
  if (!m) throw new Error('not in the shipped file: ' + re);
  return m[0];
};

/* A database that answers the way PostgREST answers: a resolved object
   carrying `data` or `error`, and `.then(onOk, onErr)` on the builder. */
function makeDb(answer) {
  const asked = [];
  const db = {
    from(table) {
      return { select(cols) {
        return { eq(col, val) {
          return { then(onOk, onErr) {
            asked.push({ table, cols, col, val });
            const r = answer({ table, cols, col, val });
            if (r && r.__throw) return Promise.resolve(onErr(r.__throw));
            return Promise.resolve(onOk(r));
          } };
        } };
      } };
    }
  };
  return { db, asked };
}

const ROWS = [
  { plot_name: 'B04', work_type: 'polybag_fill', work_date: '2026-10-12',
    nursery_name: 'UNN 1', schedule_month: 'Oct 2026', source_qty: 2300,
    total_qty: 2300, checked_at: '2026-10-20T02:00:00Z', checked_by: 'office@mjm',
    workers: [{ name: 'Ali', qty: 1200 }, { name: 'Siti', qty: 1100 }] },
  { plot_name: 'B07', work_type: 'lining', work_date: '2026-10-12',
    nursery_name: 'UNN 1', schedule_month: 'Oct 2026', source_qty: 1900,
    total_qty: null, checked_at: null, checked_by: null,
    workers: [{ name: 'Ali' }, { name: 'Siti' }] },
  { plot_name: 'N15', work_type: 'transplanting', work_date: '2026-10-14',
    nursery_name: 'UNN 1', schedule_month: 'Oct 2026', source_qty: 900,
    total_qty: null, checked_at: null, checked_by: null,
    workers: [{ name: 'Ali' }] },
];

/* ── THE CLAIM'S LOADER AND SPLIT, as shipped ───────────────────────── */
function runLoader(answer, lock) {
  const { db, asked } = makeDb(answer);
  const ctx = {
    Object, Array, Number, String, Math, Promise, console,
    _supabase: db,
    monthLabel: () => 'Oct 2026',
    monthValue: () => '2026-10',
    /* The plot decides the nursery everywhere in this system; which section
       that comes to is not what is under test here. */
    _tpSection: () => 'UNN1',
    MJMPayrollLock: lock,
  };
  vm.createContext(ctx);
  vm.runInContext(
    'var transplantRowsAll = [], transplantField = [], transplantHeld = [],'
    + ' transplantNotDone = [], transplantGateOff = false;\n'
    + stmt(CLAIM, "const TP_FIELD_COLS = ") + '\n'
    + stmt(CLAIM, 'const _tpNotDone = (rec) =>') + '\n'
    + lift(CLAIM, 'async function loadTransplantField()') + '\n'
    + lift(CLAIM, 'function _tpVerifiedMonth(sec)') + '\n'
    + stmt(CLAIM, 'const _tpAgreed = (rec) =>') + '\n'
    + lift(CLAIM, 'function splitTransplantField()')
    + '\n;globalThis.__go = () => loadTransplantField().then(() => ({'
    + ' paid: transplantField.map(r => r.plot_name),'
    + ' held: transplantHeld.map(r => r.plot_name),'
    + ' skipped: transplantNotDone.map(r => r.plot_name),'
    + ' gateOff: transplantGateOff }));', ctx);
  return vm.runInContext('__go()', ctx).then(r => ({ ...r, asked }));
}

(async () => {
console.log('\n── 1. only a Checked row reaches the claim ──');
{
  const r = await runLoader(() => ({ data: ROWS.map(x => ({ ...x })) }));
  is(r.paid, ['B04'], 'the checked row is what the claim pays');
  is(r.held, ['B07', 'N15'], 'the two rows nobody has agreed are held, not dropped');
  no(r.gateOff, 'the gate is installed, so it is not reported as missing');
  yes(/checked_at/.test(r.asked[0].cols), 'the read asks for the tick');
  is(r.asked[0].col, 'schedule_month', 'asked by the month the claim pays on');
  is(r.asked[0].val, 'Oct 2026', 'and in the SHORT month shape, which is the stored key');
}

console.log('\n── 1b. a job nobody did is on NEITHER list ──');
{
  /* A blanket spray is not always needed, so the conductor can answer the
     job with "nobody did this" -- see shared/RUN_ME_transplant_not_done.sql.
     It is not held work: held means the office has still to agree a figure,
     and there is no figure here to agree. Left in the held list the claim
     would read "RM 0.00 is NOT on this claim, 1 row has not been Checked"
     and send somebody to tick a row that can never pay anybody. */
  const rows = ROWS.map(x => ({ ...x })).concat([{
    plot_name: 'B2', work_type: 'blanket_spray', work_date: '2026-10-28',
    nursery_name: 'BNN', schedule_month: 'Oct 2026', source_qty: 3164,
    total_qty: null, checked_at: null, checked_by: null,
    workers: [], not_done: true }]);
  const r = await runLoader(() => ({ data: rows }));
  is(r.paid, ['B04'], 'it is not paid');
  is(r.held, ['B07', 'N15'], 'and it is not held either');
  is(r.skipped, ['B2'], 'it is kept on its own, so the claim can say what it is');
  yes(/not_done/.test(r.asked[0].cols), 'the read asks for the column');

  /* AND AGREEING ONE CHANGES NOTHING. The office can tick a row in the
     database by hand; the flag is the answer that decides. */
  const ticked = rows.map(x => x.not_done
    ? { ...x, checked_at: '2026-10-29T02:00:00Z' } : x);
  const r2 = await runLoader(() => ({ data: ticked }));
  is(r2.paid, ['B04'], 'a not-done row that somebody ticked is still not paid');
  is(r2.skipped, ['B2'], 'it is still the answer it was');
}

console.log('\n── 2. a database without the columns FAILS OPEN ──');
{
  /* The one failure that must not empty the sheet. Before this gate every
     recorded row was paid, and that is what a database which has not had
     RUN_ME_transplant_checked.sql run has to go on doing. */
  const r = await runLoader(({ cols }) => (/checked_at/.test(cols)
    ? { error: { message: 'column nops_transplant_field_records.checked_at does not exist' } }
    : { data: ROWS.map(x => { const y = { ...x }; delete y.checked_at; delete y.checked_by; return y; }) }));
  is(r.paid, ['B04', 'B07', 'N15'], 'every recorded row is paid, as it was before the tick existed');
  is(r.held, [], 'nothing is held back by a gate that is not there');
  yes(r.gateOff, 'and the claim knows to SAY the gate is missing');
  is(r.asked.length, 2, 'it asked twice: with the tick, then without');
}

console.log('\n── 3. no table at all is still not a crash ──');
{
  const r = await runLoader(() => ({ __throw: { message: 'relation does not exist' } }));
  is(r.paid, [], 'nothing to pay');
  is(r.held, [], 'nothing held');
}

console.log('\n── 3b. a month the office has VERIFIED is already agreed ──');
{
  /* The Transplanting sheet keeps no snapshot the way Work Maintenance does,
     so it is always read live -- which means deploying this gate would take
     every settled month to NOUGHT, and ticking a row in a locked month is
     not a thing this system lets anybody do. Verifying a sheet is the office
     signing the whole of it, so it counts. */
  const verified = { ready: () => true, verificationOf: () => ({ verified_by: 'office@mjm' }) };
  const r = await runLoader(() => ({ data: ROWS.map(x => ({ ...x })) }), verified);
  is(r.paid, ['B04', 'B07', 'N15'], 'a verified month pays its rows, ticked or not');
  is(r.held, [], 'and holds nothing back in a month it can no longer tick');

  const open = { ready: () => true, verificationOf: () => null };
  const r2 = await runLoader(() => ({ data: ROWS.map(x => ({ ...x })) }), open);
  is(r2.paid, ['B04'], 'a month nobody has verified is back to the tick');

  const r3 = await runLoader(() => ({ data: ROWS.map(x => ({ ...x })) }), undefined);
  is(r3.paid, ['B04'], 'and no lock module at all is not a verification');
}

console.log('\n── 4. held work is priced, so the claim can say what it is holding ──');
{
  /* transplantFieldLines(src) over the HELD rows, with the real job list and
     split rule behind it. A held row has to produce a priced line or the note
     under the total could only count rows, and "RM 380 is not on this claim"
     is the sentence somebody acts on. */
  const ctx = { Object, Array, Number, String, Math, console };
  vm.createContext(ctx);
  const JOBS = CLAIM.slice(CLAIM.indexOf('const TRANSPLANT_JOBS = ['),
                           CLAIM.indexOf('];', CLAIM.indexOf('const TRANSPLANT_JOBS = [')) + 2);
  vm.runInContext(
    JOBS + '\nconst TRANSPLANT_JOB = Object.fromEntries(TRANSPLANT_JOBS.map(j => [j.key, j]));\n'
    + 'var transplantRateClash = { lining: ["kept"] };\n'
    + 'var transplantField = [];\n'
    + 'var workers = [{ full_name: "Ali", section: "UNN1" }, { full_name: "Siti", section: "UNN1" }];\n'
    + 'const _tpSection = () => "UNN1";\n'
    + 'const transplantRate = () => ({ rate: 0.2, unit: "Bag" });\n'
    + stmt(CLAIM, 'const _tpNotDone = (rec) =>') + '\n'
    + lift(CLAIM, 'function transplantFieldLines(src)')
    + '\n' + lift(CLAIM, 'function transplantHeldLines()')
    + '\n;globalThis.__held = (rows) => { transplantHeld = rows; return transplantHeldLines(); };'
    + '\nvar transplantHeld = [];'
    + '\n;globalThis.__clash = () => transplantRateClash;', ctx);
  const held = vm.runInContext('__held(' + JSON.stringify(ROWS.slice(1)) + ')', ctx);
  is(held.length, 3, 'three held lines — two on the lining plot, one on N15');
  const rm = held.reduce((s, l) => s + Number(l.amount || 0), 0);
  /* B07: 1900 split two ways is 950 each, at RM 0.20 = RM 190 each, RM 380
     for the row. N15: 900 to one person = RM 180. RM 560 held. */
  is(Math.round(rm * 100) / 100, 560, 'and they price, so the holding can be said in money');
  is(Math.round(held.filter(l => l.plot === 'B07')
       .reduce((s, l) => s + l.amount, 0) * 100) / 100, 380,
     'RM 380 of it is the one lining row, which is the sentence the office reads');
  is(vm.runInContext('__clash()', ctx), { lining: ['kept'] },
     'asking about held rows leaves the rate-clash map exactly as it was');
}

console.log('\n── 5. the claim says what it is holding, in money and by plot ──');
{
  const notes = lift(CLAIM, 'function transplantSectionNotes(secFilter)');
  yes(/transplantHeld/.test(notes), 'the notes read the held rows');
  yes(/transplantHeldLines\(\)/.test(notes), 'and price them');
  yes(/money\(rm\)/.test(notes), 'the sentence is in RM, not only in rows');
  yes(/r\.plot_name/.test(notes), 'and names the plots, so somebody can go and tick them');
  yes(/transplantGateOff/.test(notes), 'a missing gate is said too — louder than being short');
  const lead = lift(CLAIM, 'function transplantEmptyLead(secFilter)');
  yes(lead.indexOf('transplantHeld') < lead.indexOf('No transplanting was recorded'),
      'a month entirely held is answered BEFORE "nothing was recorded"');
  const pick = lift(CLAIM, 'function transplantExtraSections()');
  yes(/transplantHeldLines/.test(pick),
      'a nursery whose only work is held still gets a pill, or the note cannot be reached');
}

console.log('\n── 6. the office writes the TICK and never the crew ──');
{
  const w = lift(SHEET, 'async function toggleTransplantChecked(id)');
  yes(/\.update\(\{ checked_at: at, checked_by: by \}\)/.test(w),
      'the write carries the two columns and nothing else');
  no(/workers/.test(w), 'it never writes the crew — that is the FC Portal’s answer');
  yes(/\.eq\('id', id\)/.test(w), 'one row, keyed on its id');
  yes(/r\.checked_at = was\.at/.test(w), 'a refused write is rolled back on screen');
  yes(/confirm\(/.test(w), 'unchecking asks first, because it takes a row off the claim');
  no(/prompt\(/.test(w), 'and never a prompt — a cancel that looks like a save');
  /* The whole page must not be a second writer of the record itself. */
  const writes = SHEET.match(/from\('nops_transplant_field_records'\)[\s\S]{0,160}/g) || [];
  const bad = writes.filter(x => /\.(insert|upsert|delete)\(/.test(x)
    || /\.update\(\{[^}]*(workers|source_qty|work_date|plot_name)/.test(x));
  is(bad, [], 'the office page inserts, upserts and deletes nothing in that table');
}

console.log('\n── 7. the sheet totals what the claim pays ──');
{
  const r = lift(SHEET, 'function renderTransplantingPayroll()');
  yes(/else if \(agreed\(r\)\) capTotal \+= rowCap; else \{ heldCap \+= rowCap; heldRows\+\+; \}/.test(r),
      'the foot adds up the agreed rows and keeps the held ones apart');
  /* A JOB NOBODY DID IS A THIRD STATE and is in neither total. Held means
     the office has still to agree a figure; there is no figure here to
     agree, and putting it on the held line would send somebody to tick a
     row that can never pay anybody. */
  yes(/if \(skipped\) skipRows\+\+;/.test(r),
      'and a job recorded as not done is counted apart from both');
  yes(/pay\.tpNotDoneFoot/.test(r), 'and the sheet says so under the total');
  yes(/if \(agreed\(r\)\) totals\[w\] \+= share;/.test(r),
      'a worker column totals only the rows the office has agreed');

  /* THE TWO HELPERS BOTH SHEETS SHARE, driven rather than read off a line:
     the screen and the PDF of the same sheet each call these, so a rule
     living in one caller is a rule the other does not obey. */
  const hctx = { Object, Array, Number, String, Math, _tpNoGate: {} };
  vm.createContext(hctx);
  vm.runInContext(
    constBlockOf(SHEET, 'const TP_JOBS = [')
    + '\nconst TP_JOB = Object.fromEntries(TP_JOBS.map(j => [j.key, j]));\n'
    + lineOf(SHEET, /^const tpNotDone = .*$/m) + '\n'
    + lift(SHEET, 'function tpRowCap(r)') + '\n'
    + lineOf(SHEET, /^function tpAgreed\(key, r\).*$/m)
    + '\n;globalThis.__cap = tpRowCap; globalThis.__ag = tpAgreed;', hctx);
  const cap = vm.runInContext('__cap', hctx);
  const ag  = vm.runInContext('__ag', hctx);
  is(cap({ work_type: 'transplanting', source_qty: 3164, workers: [{ name: 'Ali' }] }), 3164,
     'the row capacity is the plot figure on an ordinary row');
  is(cap({ work_type: 'transplanting', source_qty: 3164, workers: [], not_done: true }), 0,
     'and NOUGHT on a job nobody did — tested in the helper, so the PDF gets it free');
  /* And where the gate is not installed every row is agreed, because every
     row is being paid — a sheet drawn entirely held under an orange line
     saying the opposite is two screens disagreeing on one page. */
  is(ag('k', { checked_at: null }), false, 'an unticked row is not agreed');
  vm.runInContext('_tpNoGate.k = true;', hctx);
  is(ag('k', { checked_at: null }), true,
     'a database with no gate draws every row as agreed, not every row as held');
  yes(/pay\.tpHeld/.test(r), 'and the held capacity is named under the total');
  yes(/_tpCheckCell\(r, key\)/.test(r), 'every row carries the tick cell');
  /* The cell itself, driven. */
  /* MJMPeople is the real resolver the page loads beside this file: every
     "by <person>" is STORED as an email and must not be SHOWN as one. The
     two display helpers are lifted rather than restated, so a change to
     either is driven here. */
  const ctx = { esc: (v) => String(v == null ? '' : v), _tpNoGate: {},
                t: (k) => k,
                MJMPeople: { name: (v) => v === 'office@mjm' ? 'Siti Rahmah' : v } };
  vm.createContext(ctx);
  vm.runInContext(lineOf(SHEET, /^const tpNotDone = .*$/m) + '\n'
    + lift(SHEET, 'function _maintWho(v)') + '\n'
    + lift(SHEET, 'function _maintWhen(t)') + '\n'
    + lift(SHEET, 'function _tpCheckCell(r, key)')
    + '\n;globalThis.__cell = _tpCheckCell;', ctx);
  const cell = vm.runInContext('__cell', ctx);
  yes(/✓ Check</.test(cell({ id: 1, checked_at: null }, 'k')), 'an unagreed row offers Check');
  const on = cell({ id: 1, checked_at: '2026-10-20T02:00:00Z', checked_by: 'office@mjm' }, 'k');
  yes(/rec-checked-badge/.test(on) && /Uncheck/.test(on),
      'an agreed row says so and offers Uncheck to whoever could check');
  /* THE BADGE NAMES THE PERSON, not the word CHECKED and not their email
     address — *"在这里 checked改成check的人的名字"*, asked of Culling
     Monitoring and true of this badge for the same reason. */
  yes(/✓ Siti Rahmah/.test(on) && !/office@mjm</.test(on),
      'and it names the PERSON, not the address the tick is stored under');
  yes(/20 Oct 2026/.test(on), 'with the day it was agreed, written out');
  /* IT FAILS OPEN. A profile table that cannot be read must leave the badge
     saying the stored value rather than saying nothing — an empty green
     pill reads as a fault. */
  const noNames = { esc: ctx.esc, _tpNoGate: {}, t: ctx.t };
  vm.createContext(noNames);
  vm.runInContext(lineOf(SHEET, /^const tpNotDone = .*$/m) + '\n'
    + lift(SHEET, 'function _maintWho(v)') + '\n'
    + lift(SHEET, 'function _maintWhen(t)') + '\n'
    + lift(SHEET, 'function _tpCheckCell(r, key)')
    + '\n;globalThis.__cell = _tpCheckCell;', noNames);
  yes(/✓ office@mjm/.test(vm.runInContext('__cell', noNames)(
        { id: 1, checked_at: '2026-10-20T02:00:00Z', checked_by: 'office@mjm' }, 'k')),
      'and with no resolver at all it says what is stored, never nothing');
  /* A JOB NOBODY DID HAS NOTHING TO AGREE. A Check button over it would
     offer a tick that moves no money, and a ticked row that pays nobody is
     what somebody later reads as a fault. */
  const nd = cell({ id: 1, checked_at: null, not_done: true }, 'k');
  no(/button/.test(nd), 'a job recorded as not done is offered no tick');
  yes(/pay\.tpNotDoneLabel/.test(nd), 'it says what it is instead');
  vm.runInContext('_tpNoGate.k = true;', ctx);
  no(/button/.test(cell({ id: 1, checked_at: null }, 'k')),
     'and no button at all where the database has not got the columns');
}

console.log('\n── 8. the loader on the sheet falls open the same way ──');
{
  const l = lift(SHEET, 'async function loadTransplantRecordsForPayroll(n, m)');
  yes(/checked_at\|checked_by/.test(l), 'it notices which column the database refused');
  yes(/_tpNoGate\[key\] = true/.test(l), 'marks the gate missing');
  /* A LADDER AND NOT TWO IFS: there are two optional columns now and
     PostgREST names only the first one it cannot find, so each refusal
     drops the column it names and asks again. */
  yes(/want\.nd && \/not_done\//.test(l), 'and it notices the other optional column too');
  yes(/const build = \(\) => TP_PAY_COLS/.test(l),
      'the column list is rebuilt from what is left, which is what it always reads');
  yes(/pay\.tpNoGate/.test(lift(SHEET, 'function renderTransplantingPayroll()')),
      'the tab says so in orange rather than reading empty');
}

console.log('\n── 9. the SQL pastes into the editor ──');
{
  const comments = SQL.split('\n').filter(l => l.trim().startsWith('--'));
  no(comments.some(l => l.includes("'")), 'no apostrophe in a comment');
  no(comments.some(l => l.includes(';')), 'no semicolon in a comment');
  no(SQL.includes('\\'), 'no backslash anywhere');
  yes(SQL.trimEnd().endsWith(';'), 'the file ends at its last semicolon');
  yes(/ADD COLUMN IF NOT EXISTS checked_at/.test(SQL)
      && /ADD COLUMN IF NOT EXISTS checked_by/.test(SQL), 'safe to run twice');
  no(/UPDATE nops_transplant_field_records/i.test(SQL),
     'and it backfills NOTHING — a tick nobody made is not a signature');
  yes(/CREATE OR REPLACE FUNCTION/.test(SQL) && /BEFORE UPDATE/.test(SQL),
      'the tick is cleared by a trigger, so all three writers obey it');
  ['work_date', 'plot_name', 'work_type', 'schedule_month', 'source_qty', 'total_qty', 'workers']
    .forEach(c => yes(new RegExp('NEW\\.' + c + ' +IS DISTINCT FROM').test(SQL),
      'a change to ' + c + ' clears the tick'));
  no(/NEW\.remark +IS DISTINCT FROM/.test(SQL),
     'a corrected remark does not — it moves no money');
  const tail = SQL.slice(SQL.lastIndexOf('SELECT * FROM ('));
  yes(/UNION ALL/.test(tail), 'the check is one result set');
  yes(/VERDICT/.test(tail), 'ending in a verdict');

  /* AND THE CHECK THAT SAYS WHAT IT MOVES. The question that decides whether
     a rule like this is right is "what does it actually move", and handing
     the check over with the change is the house rule. */
  const CHK = R('shared/CHECK_transplant_held_back.sql');
  const chkComments = CHK.split('\n').filter(l => l.trim().startsWith('--'));
  no(chkComments.some(l => l.includes("'")), 'the check carries no apostrophe in a comment');
  no(chkComments.some(l => l.includes(';')), 'and no semicolon in one');
  no(/UPDATE |DELETE |INSERT |ALTER |CREATE TABLE|CREATE TEMP/i.test(CHK),
     'it is read-only and creates nothing — a temp table is an editor warning to click past');
  yes(/to_jsonb\(r\) ->> 'checked_at'/.test(CHK),
      'it reads the tick as a JSON key, so it still PARSES where the column is absent');
  yes(/no gate/.test(CHK), 'and says so rather than reporting every row as held');
}

console.log('\n── 10. the NOT DONE column, and the trigger the two files share ──');
{
  const ND = R('shared/RUN_ME_transplant_not_done.sql');
  const c = ND.split('\n').filter(l => l.trim().startsWith('--'));
  no(c.some(l => l.includes("'")), 'no apostrophe in a comment');
  no(c.some(l => l.includes(';')), 'no semicolon in a comment');
  no(ND.includes('\\'), 'no backslash anywhere');
  yes(ND.trimEnd().endsWith(';'), 'the file ends at its last semicolon');
  yes(/ADD COLUMN IF NOT EXISTS not_done BOOLEAN NOT NULL DEFAULT false/.test(ND),
      'safe to run twice, and false until somebody answers a job');
  no(/UPDATE nops_transplant_field_records/i.test(ND),
     'it backfills NOTHING — a flag nobody set is not an answer');
  const tail = ND.slice(ND.lastIndexOf('SELECT * FROM ('));
  yes(/UNION ALL/.test(tail), 'the check is one result set');
  yes(/VERDICT/.test(tail), 'ending in a verdict');

  /* ONE TRIGGER FUNCTION IN TWO FILES, word for word -- whichever is run
     last is the one the database keeps, so a condition added to one and not
     the other is a tick that survives a change it should not. not_done is
     compared THROUGH to_jsonb in both, which is what makes the body valid
     on a database where only one of the two files has been run. */
  /* The CODE, with the comments taken out: the two bodies have to run the
     same, and a comment reworded in one of them has altered nothing this
     is about. */
  const body = (src) => src
    .slice(src.indexOf('CREATE OR REPLACE FUNCTION'), src.indexOf('$$ LANGUAGE plpgsql;'))
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  is(body(ND).replace(/\s+/g, ' ').trim(), body(SQL).replace(/\s+/g, ' ').trim(),
     'both files carry the SAME clear-the-tick function');
  yes(/\(to_jsonb\(NEW\) ->> 'not_done'\) IS DISTINCT FROM \(to_jsonb\(OLD\) ->> 'not_done'\)/
        .test(body(ND)),
      'and a job turning not-done, or back, clears the office agreement');
  no(/NEW\.not_done/.test(ND),
     'never named as a column — that body has to parse before the ALTER has run');
}

console.log('');
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed ? 1 : 0);
})();
