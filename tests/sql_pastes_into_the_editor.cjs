/* THE SUPABASE SQL EDITOR IS NOT psql.
 *
 * A file can run perfectly on the scratch Postgres and still fail there with
 *
 *     ERROR: 42601: syntax error at end of input   LINE 0:
 *
 * pointing at nothing. psql strips comments BEFORE parsing. The editor counts
 * quotes FIRST, so one apostrophe in a comment -- the possessive of a month, a
 * "doesn't" -- opens a string literal that never closes, swallows the rest of
 * the file, and leaves a statement with no statement in it.
 *
 * An EVEN number survives by luck, which is worse than failing, because it
 * makes the rule look like it does not exist. So the rule is NONE, and this is
 * what keeps it true.
 *
 * Finding a comment needs a scan rather than a startsWith: a line beginning
 * '--' inside a string literal is DATA, block comments count too, and a
 * dollar-quoted body is CODE with its own comments and strings. The same
 * scanner swept the files in the first place.
 */
const fs = require('fs');
const path = require('path');

const SHARED = path.join(__dirname, '..', 'shared');

/* Files written or verified against the whole list of paste rules, not just
   the apostrophe one. The rest of shared/ is older and is reported below. */
const SWEPT = [
  'RUN_ME_audit_save_check.sql',
  'RUN_ME_restore_sep_2026_from_sheet.sql',
  'RUN_ME_sep_four_missing_rows.sql',
  'RUN_ME_put_dragged_rows_back.sql',
  'RUN_ME_worker_previous_names.sql',
  'RUN_ME_worker_name_was.sql',
  'CHECK_sep_missing_four_rows.sql',
  'CHECK_what_is_in_each_month.sql',
  'CHECK_rows_dragged_out_of_month.sql',
  'CHECK_bnn_sep_what_survived.sql',
  'CHECK_undated_rows_vs_field.sql',
  'CHECK_worker_record_vs_fc_history.sql',
  'CHECK_worker_names_with_no_column.sql',
  'CHECK_claim_vs_worker_record.sql',
  'CHECK_balance_is_what_is_standing.sql',
  'CHECK_transplant_details.sql',
];

const DQ = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

/** Every stretch of comment in the file, as [line, start, end]. */
function commentSpans(text) {
  const out = [];
  let inStr = false, dq = null, blk = false;
  text.split('\n').forEach((line, i) => {
    let j = 0, begin = blk ? 0 : null;
    while (j < line.length) {
      if (blk) {
        const k = line.indexOf('*/', j);
        if (k < 0) { j = line.length; break; }
        out.push([i, begin, k + 2]); blk = false; begin = null; j = k + 2; continue;
      }
      if (inStr) {
        if (line[j] === "'") {
          if (line[j + 1] === "'") { j += 2; continue; }
          inStr = false;
        }
        j++; continue;
      }
      if (dq && line.startsWith(dq, j)) { j += dq.length; dq = null; continue; }
      if (line.startsWith('--', j)) { out.push([i, j, line.length]); j = line.length; break; }
      if (line.startsWith('/*', j)) { blk = true; begin = j; j += 2; continue; }
      if (!dq) {
        const m = DQ.exec(line.slice(j));
        if (m) { dq = m[0]; j += m[0].length; continue; }
      }
      if (line[j] === "'") inStr = true;
      j++;
    }
    if (blk && begin !== null) out.push([i, begin, line.length]);
  });
  return out;
}

const read = (n) => fs.readFileSync(path.join(SHARED, n), 'utf8');
const files = fs.readdirSync(SHARED).filter((n) => n.endsWith('.sql')).sort();

let bad = 0;

/* ── 1. THE rule that cost a paste, on EVERY file ─────────────────────── */
const count = (n, ch) => {
  const text = read(n); const L = text.split('\n');
  let c = 0;
  commentSpans(text).forEach(([i, a, b]) => {
    c += (L[i].slice(a, b).split(ch).length - 1);
  });
  return c;
};

const offenders = files.filter((n) => count(n, "'"));
if (offenders.length) {
  bad++;
  console.log(`FAIL  ${offenders.length} file(s) carry an apostrophe in a comment:`);
  offenders.slice(0, 10).forEach((n) => console.log(`        ${n}`));
} else {
  console.log(`pass  no apostrophe in any comment, across all ${files.length} files`);
}

/* ── 2. the stricter rules, on the files held to them ─────────────────── */
let strict = 0;
SWEPT.forEach((n) => {
  if (!files.includes(n)) { console.log(`FAIL  missing  ${n}`); strict++; return; }
  const text = read(n);
  const tail = text.split('\n').filter((l) => l.trim() !== '');
  const last = tail[tail.length - 1] || '';
  if (text.includes('\\')) { console.log(`FAIL  ${n}: a backslash`); strict++; }
  if (!last.trimEnd().endsWith(';')) { console.log(`FAIL  ${n}: does not end at a semicolon`); strict++; }
});
if (strict) bad++;
else console.log(`pass  all ${SWEPT.length} swept file(s) end at a semicolon and carry no backslash`);

/* ── 3. what is still owed, so it is not forgotten ────────────────────── */
const slash = files.filter((n) => read(n).includes('\\'));
const noSemi = files.filter((n) => {
  const t = read(n).split('\n').filter((l) => l.trim() !== '');
  return !(t[t.length - 1] || '').trimEnd().endsWith(';');
});
const semiInComment = files.filter((n) => count(n, ';'));
console.log(`\nstill owed, and each one is its own sweep:`);
console.log(`  ${semiInComment.length} carry a SEMICOLON in a comment`);
console.log(`  ${slash.length} contain a backslash`);
console.log(`  ${noSemi.length} do not end at a semicolon (a trailing comment block is the usual cause)`);

process.exit(bad ? 1 : 0);
