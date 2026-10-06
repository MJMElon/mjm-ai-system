/* THE SUPABASE SQL EDITOR IS NOT psql.
 *
 * A file can run perfectly here and still fail there, with
 *
 *     ERROR: 42601: syntax error at end of input   LINE 0:
 *
 * pointing at nothing. psql strips a dash-dash comment BEFORE parsing. The
 * editor counts quotes FIRST, so a single apostrophe in a comment -- the
 * possessive form of a month, a "doesn't" -- opens a string literal that
 * never closes, swallows the rest of the file, and leaves a statement with no
 * statement in it.
 *
 * An EVEN number of them happens to survive, which is worse than failing,
 * because it makes the rule look like it does not exist. So the rule is NONE,
 * and this test is what keeps it true.
 *
 * It guards the files that have been swept. The rest of shared/ is reported
 * at the end, loudest first, so the sweep can be finished without guessing
 * where to start. Add a file to SWEPT once it is clean.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHARED = path.join(ROOT, 'shared');

const SWEPT = [
  'RUN_ME_restore_sep_2026_from_sheet.sql',
  'RUN_ME_sep_four_missing_rows.sql',
  'RUN_ME_put_dragged_rows_back.sql',
  'CHECK_sep_missing_four_rows.sql',
  'CHECK_what_is_in_each_month.sql',
  'CHECK_rows_dragged_out_of_month.sql',
  'CHECK_bnn_sep_what_survived.sql',
  'CHECK_undated_rows_vs_field.sql',
  'CHECK_worker_record_vs_fc_history.sql',
  'RUN_ME_worker_previous_names.sql',
  'RUN_ME_worker_name_was.sql',
  'CHECK_worker_names_with_no_column.sql',
  'CHECK_claim_vs_worker_record.sql',
];

const isComment = (line) => line.trimStart().startsWith('--');

function faults(text) {
  const out = [];
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    if (!isComment(line)) return;
    // The one that cost a paste: a quote the editor counts.
    if (line.includes("'")) out.push(`line ${i + 1}: apostrophe in a comment`);
    // A comment that ends the statement early.
    if (line.includes(';')) out.push(`line ${i + 1}: semicolon in a comment`);
  });

  if (text.includes('\\')) out.push('a backslash somewhere in the file');

  // The file must END at its last semicolon: a trailing comment block is a
  // statement with no statement in it.
  const tail = lines.filter((l) => l.trim() !== '');
  const last = tail[tail.length - 1] || '';
  if (!last.trimEnd().endsWith(';')) out.push('the file does not end at a semicolon');

  return out;
}

let bad = 0;
for (const name of SWEPT) {
  const p = path.join(SHARED, name);
  if (!fs.existsSync(p)) { console.log(`MISSING  ${name}`); bad++; continue; }
  const f = faults(fs.readFileSync(p, 'utf8'));
  if (f.length) { bad++; console.log(`FAIL  ${name}`); f.forEach((x) => console.log(`        ${x}`)); }
}

// Everything not yet swept, so the backlog is visible rather than forgotten.
const rest = fs.readdirSync(SHARED)
  .filter((n) => n.endsWith('.sql') && !SWEPT.includes(n))
  .map((n) => {
    const quotes = fs.readFileSync(path.join(SHARED, n), 'utf8').split('\n')
      .filter(isComment).join('\n').split("'").length - 1;
    return { n, quotes };
  })
  .filter((r) => r.quotes > 0);

const willBreak = rest.filter((r) => r.quotes % 2 === 1);
console.log(`\nnot yet swept: ${rest.length} files carry an apostrophe in a comment.`);
console.log(`of those, ${willBreak.length} have an ODD count and WILL fail a paste:`);
willBreak.sort((a, b) => b.quotes - a.quotes).slice(0, 5)
  .forEach((r) => console.log(`   ${String(r.quotes).padStart(3)}  ${r.n}`));
if (willBreak.length > 5) console.log(`   ...and ${willBreak.length - 5} more`);

if (bad) { console.log(`\n${bad} swept file(s) regressed`); process.exit(1); }
console.log('\nevery swept file still pastes clean');
