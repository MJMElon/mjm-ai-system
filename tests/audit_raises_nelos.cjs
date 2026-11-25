/* The Nelos case an Unsatisfied maintenance audit raises: the Work Records
   column shows the case number, green once the FC has solved it and red
   while it is open, and links straight to the case.

   The functions are lifted out of nursery_ops/plot_maintenance_script.js and
   driven here. The SQL that raises the case is checked for the rules the SQL
   Editor needs (no backslash, no regular expression, no apostrophe inside a
   comment, ends at its last semicolon).
   Run: node tests/audit_raises_nelos.cjs */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'plot_maintenance_script.js'), 'utf8');
const SQL = fs.readFileSync(path.join(ROOT, 'shared', 'RUN_ME_audit_raises_nelos.sql'), 'utf8');

function lift(name) {
  const start = SRC.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) break; }
  }
  return SRC.slice(start, i + 1);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const t = (k) => k;
const api = new Function('esc', 't', 'maintCaseByTask', 'nelosCaseStatus',
  `${lift('_nelosCaseOf')}\n${lift('_nelosCell')}\nreturn { _nelosCaseOf, _nelosCell };`)(
  esc, t,
  { '3311': 77, '3364': 78 },
  { '77': { no: 'NLS-0077', status: 'resolved' }, '78': { no: 'NLS-0078', status: 'open' } });

let n = 0;
const ok = (label, fn) => { fn(); n++; console.log(`  ok  ${label}`); };

console.log('The Nelos cell');

ok('a solved case is green and links to the case', () => {
  const html = api._nelosCell({ id: 3311, _fieldIds: [3311] });
  assert.ok(html.includes('#15803d'), 'green');
  assert.ok(html.includes('../nelos/nelos_case.html?id=77'), 'link to case 77');
  assert.ok(html.includes('>NLS-0077<'), 'case number shown');
});

ok('an open case is red and still links', () => {
  const html = api._nelosCell({ id: 3364, _fieldIds: [3364] });
  assert.ok(html.includes('#b91c1c'), 'red');
  assert.ok(html.includes('id=78'));
  assert.ok(html.includes('>NLS-0078<'));
});

ok('a closed case counts as solved too', () => {
  const closed = new Function('esc', 't', 'maintCaseByTask', 'nelosCaseStatus',
    `${lift('_nelosCaseOf')}\n${lift('_nelosCell')}\nreturn _nelosCell;`)(
    esc, t, { '42': 80 }, { '80': { no: 'NLS-0080', status: 'closed' } });
  assert.ok(closed({ id: 42, _fieldIds: [] }).includes('#15803d'), 'closed is green');
});

ok('a record with no case shows a dash, not a link', () => {
  const html = api._nelosCell({ id: 9999, _fieldIds: [9999] });
  assert.ok(!html.includes('nelos_case.html'));
  assert.ok(html.includes('chk-na'));
});

ok('the case is found through the records it was made from', () => {
  assert.strictEqual(api._nelosCaseOf({ id: 5, _fieldIds: [3311] }), 77);
});

console.log('\nThe SQL that raises the case');

ok('no backslash in the file', () => assert.ok(!SQL.includes('\\')));
ok('no regular expression keyword', () => assert.ok(!/~\*|\bsimilar to\b|\bregexp\b/i.test(SQL)));
ok('no apostrophe inside a comment', () => {
  SQL.split('\n').filter((l) => l.trim().startsWith('--')).forEach((l) =>
    assert.ok(!l.includes("'"), 'apostrophe in: ' + l));
});
ok('the trigger fires only when the verdict changes', () =>
  assert.ok(SQL.includes('AFTER INSERT OR UPDATE OF result')));
ok('the case number is written back onto the audit row', () =>
  assert.ok(SQL.includes('SET nelos_case_id = v_case')));
ok('the file ends at its last semicolon', () =>
  assert.ok(SQL.trimEnd().endsWith(';')));

console.log(`\n${n} checks passed`);
