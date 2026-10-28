/* "RECORD A NEW AUDIT" AND "EDIT & DELETE PAST AUDITS" ARE READ NOW.

   User Access has listed those two against each of the four audit modules
   since that screen was written, and NOTHING EVER READ THEM. Unticking
   Edit for an auditor saved cleanly, showed as set on the screen, and that
   auditor went on editing and deleting. It is the same fault the `view`
   half of audit_supabase.js was written to correct, one level down -- that
   file says so in its own comment: "audit_user_access.html has always
   written audit_actions.<page> ... but nothing in the audit module ever
   read them."

   Putting the same two ticks on a second screen (555 MJM Team -> User
   Access -> Auditor Portal) is what made it worth closing.

   Two halves, and both are needed:

   THE RULE, driven through the SHIPPED audit_supabase.js rather than a
   copy of it. Fails open everywhere -- no entry is nobody having been
   asked, an absent action key is the same, only an explicit false is a
   no -- and a page that is closed closes every action inside it.

   THE WIRING, read off the four shipped module files. The rule being
   right is worth nothing if a form does not ask it, and the whole reason
   this needed doing is that for months none of them did. Each module is
   held to the same four places:

     the NEW form asks `record`      before the work, not after it
     the EDIT form asks `edit`       same
     the SAVE asks again             a form opened before a permission
                                     changed is still on the screen
     DELETE asks `delete`            its own tick since the office asked
                                     for the two apart, and asked BESIDE
                                     the admin test rather than instead

   Run: node tests/the_audit_ticks_are_obeyed.cjs
*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name + '  → ' + JSON.stringify(got)); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) +
                             '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── Running the shipped file ────────────────────────────────────────────
   audit_supabase.js is a plain script that expects a browser: it registers
   two DOMContentLoaded handlers and runs one IIFE that may redirect. Stub
   just enough for it to load, and hand back the two functions under test.
   Driving the real file is the point -- a copy of the rule in here would
   go on passing after the original changed. */
function loadGate(storage, pathname) {
  const store = Object.assign({}, storage);
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop },
                      appendChild: noop, remove: noop, setAttribute: noop,
                      offsetHeight: 0, textContent: '' });
  const document = {
    addEventListener: noop, createElement: el, getElementById: () => null,
    querySelectorAll: () => [], body: el(), dispatchEvent: noop,
  };
  const location = { pathname, hash: '', replace: noop, href: '' };
  const src = read('audit/audit_supabase.js');
  const make = new Function(
    'window', 'document', 'localStorage', 'location', 'navigator', 'history',
    'fetch', 'console', 'self',
    src + '\n;return {' +
    '  canAuditAction: typeof canAuditAction === "function" ? canAuditAction : null,' +
    '  canOpenAuditPage: typeof canOpenAuditPage === "function" ? canOpenAuditPage : null };');
  /* Named rather than destructured, so a shipped file WITHOUT the gate
     reports a failed check instead of a stack trace -- which is what it did
     on the previous code, and an unreadable failure is a failure somebody
     argues with. */
  const g = make({}, document, localStorage, location, { onLine: false },
              { replaceState: noop }, () => Promise.reject(new Error('no network')),
              { log: noop, warn: noop, error: noop }, {});
  const missing = () => 'no gate in the shipped file';
  return {
    canAuditAction:   g.canAuditAction   ? g.canAuditAction   : missing,
    canOpenAuditPage: g.canOpenAuditPage ? g.canOpenAuditPage : missing,
  };
}

/* A signed-in auditor, with whatever the office has ticked for them. */
const user = (audit_actions) => ({
  mjm_user: JSON.stringify({ id: 'u1', name: 'Hafiz', permissions:
    audit_actions ? { audit_actions } : {} }),
});

const PLOT_PAGE = '/audit/audit_plot_audit.html';

console.log('\n── 1. Absent is a yes, everywhere ──');
{
  let g = loadGate(user(null), PLOT_PAGE);
  check('nobody has been asked about this auditor at all',
        [g.canAuditAction('record'), g.canAuditAction('edit')], [true, true]);

  /* A row saved by either office screen carries `view`; one saved before
     the actions existed may carry nothing else. An absent action key is
     not a no. */
  g = loadGate(user({ plot_audit: { view: true } }), PLOT_PAGE);
  check('the page is open and no action was named',
        [g.canAuditAction('record'), g.canAuditAction('edit')], [true, true]);

  /* No mjm_user in storage at all, and storage that will not parse. A
     check that cannot run must not take the module away from somebody who
     was working fine a minute ago. */
  g = loadGate({}, PLOT_PAGE);
  check('nobody signed in', [g.canAuditAction('record'), g.canAuditAction('edit')], [true, true]);
  g = loadGate({ mjm_user: '{not json' }, PLOT_PAGE);
  check('storage that will not parse', g.canAuditAction('edit'), true);
}

console.log('\n── 2. An explicit no is a no, and only for what it names ──');
{
  let g = loadGate(user({ plot_audit: { view: true, record: false, edit: true } }), PLOT_PAGE);
  check('record off, edit on', [g.canAuditAction('record'), g.canAuditAction('edit')],
        [false, true]);

  g = loadGate(user({ plot_audit: { view: true, record: true, edit: false } }), PLOT_PAGE);
  check('edit off, record on', [g.canAuditAction('record'), g.canAuditAction('edit')],
        [true, false]);

  /* The modules are separate ticks. Closing editing on Plot Condition says
     nothing about Seedling Height. */
  g = loadGate(user({ plot_audit: { view: true, edit: false },
                      height:     { view: true, edit: true } }), PLOT_PAGE);
  check('and it closes only the module it names',
        [g.canAuditAction('edit'), g.canAuditAction('edit', 'height')], [false, true]);
}

console.log('\n── 3. Delete is its own tick, and the old answer still counts ──');
{
  /* The office asked for Edit and Delete apart, so `delete` is a key of its
     own. A row saved under the OLD combined tick carries `edit` and no
     `delete` at all, and there are only three things it can mean:

       read it as OFF  -> takes a deletion away from somebody nobody closed
       read it as ON   -> hands back one the office deliberately closed
       read the OLD    -> what they actually answered

     The third is the only one that is true, and it holds until somebody
     saves that row again on either screen. */
  let g = loadGate(user({ plot_audit: { view: true, record: true, edit: false } }), PLOT_PAGE);
  check('a row saved before the split, with editing closed',
        [g.canAuditAction('edit'), g.canAuditAction('delete')], [false, false]);

  g = loadGate(user({ plot_audit: { view: true, record: true, edit: true } }), PLOT_PAGE);
  check('and one with editing open', 
        [g.canAuditAction('edit'), g.canAuditAction('delete')], [true, true]);

  /* Once it HAS been answered the fallback is out of it, both ways round —
     editing open and deleting closed is the whole point of the split. */
  g = loadGate(user({ plot_audit: { view: true, edit: true, delete: false } }), PLOT_PAGE);
  check('edit open, delete closed',
        [g.canAuditAction('edit'), g.canAuditAction('delete')], [true, false]);
  g = loadGate(user({ plot_audit: { view: true, edit: false, delete: true } }), PLOT_PAGE);
  check('and the other way round',
        [g.canAuditAction('edit'), g.canAuditAction('delete')], [false, true]);
}

console.log('\n── 4. A closed page closes everything inside it ──');
{
  const g = loadGate(user({ plot_audit: { view: false, record: true, edit: true } }), PLOT_PAGE);
  check('there is nothing left to do on a page they may not open',
        [g.canAuditAction('record'), g.canAuditAction('edit'), g.canAuditAction('delete')],
        [false, false, false]);
  check('which is the same answer the page guard gives',
        g.canOpenAuditPage('plot_audit'), false);
}

console.log('\n── 5. Every module asks, in all five places ──');
{
  /* The four shipped modules. `page` is the key in AUDIT_PAGE_KEYS, and the
     names are the functions each one actually uses -- they are not the same
     four names in every file, which is why this is a list and not a regex
     over the directory. */
  const MODULES = [
    { label: 'Plot Condition',  file: 'audit_script.js',
      newForm: 'openAddForm', editForm: 'openEdit', save: 'saveRecord' },
    { label: 'Seedling Height', file: 'audit_height_script.js',
      newForm: 'openAddForm', editForm: 'openEdit', save: 'saveRecord' },
    { label: 'Papan Tanda',     file: 'audit_papan_script.js',
      newForm: 'openAuditForm', editForm: 'openAuditForm', save: 'saveAudit' },
    { label: 'Maintenance',     file: 'audit_maintenance_script.js',
      newForm: 'openForm', editForm: 'openForm', save: 'saveAudit' },
  ];

  /* The body of one function, from its opening line to the next top-level
     one. Crude, and right for these files: every function in them starts at
     column 0. */
  function body(src, name) {
    const at = src.search(new RegExp('^(?:async )?function ' + name + '\\(', 'm'));
    if (at === -1) return null;
    const rest = src.slice(at + 1);
    const end = rest.search(/^(?:async )?function \w+\(/m);
    return end === -1 ? rest : rest.slice(0, end);
  }

  for (const m of MODULES) {
    const src = read('audit/' + m.file);

    const nf = body(src, m.newForm) || '';
    checkTrue(m.label + ': the new-audit form asks `record` before the work',
              /requireAuditAction\('record'/.test(nf));

    const ef = body(src, m.editForm) || '';
    checkTrue(m.label + ': the edit form asks `edit`',
              /requireAuditAction\('edit'/.test(ef));

    /* The save asks AGAIN, and asks the right one: a form opened before a
       permission changed is still sitting on the screen. */
    const sv = body(src, m.save) || '';
    checkTrue(m.label + ': the save asks again, both ways',
              /requireAuditAction\('record'/.test(sv) && /requireAuditAction\('edit'/.test(sv));

    /* Delete is governed by the EDIT tick -- "Edit & delete past audits" --
       and asked beside the admin test, never instead of it. Both the confirm
       and the modal's own Delete button, which is reachable on its own. */
    const cd = body(src, 'confirmDelete') || '';
    checkTrue(m.label + ': the delete confirm asks `delete`, its own tick',
              /requireAuditAction\('delete'/.test(cd));
    checkTrue(m.label + ': and not the edit one it used to share',
              !/requireAuditAction\('edit'/.test(cd));
    checkTrue(m.label + ': and still asks whether they are an admin',
              /isAuditAdmin\(\)/.test(cd));

    const dd = body(src, 'doDelete') || '';
    checkTrue(m.label + ': the Delete button itself asks too',
              /canAuditAction\('delete'\)/.test(dd));
  }
}

console.log('\n── 6. The three refusals say where they are set ──');
{
  /* A button that does nothing is read as a broken app and reported as one,
     so the message has to name the screen that would switch it back on --
     and it has to exist in both languages, or an auditor working in Malay
     gets the key printed at them. */
  const lang = read('audit/audit_lang.js');
  for (const key of ['err_no_record', 'err_no_edit', 'err_no_delete']) {
    const hits = lang.split(key + ':').length - 1;
    check('`' + key + '` is written in both languages', hits, 2);
  }
  checkTrue('and all of them say where the tick lives',
            (lang.match(/User Access/g) || []).length >= 6);
}

console.log('\n── 7. The mirror follows, so the versions had to move ──');
{
  /* audit.mjmnursery.com is a machine-written MIRROR of audit/ -- its own
     README says so and says to bump the service worker when JS changes.
     The office pages cache-bust with ?v=, so a changed script behind an
     unchanged number reaches nobody. */
  const CHANGED = ['audit_supabase.js', 'audit_lang.js', 'audit_script.js',
                   'audit_height_script.js', 'audit_papan_script.js',
                   'audit_maintenance_script.js'];
  const vers = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'audit'))) {
    if (!f.endsWith('.html')) continue;
    const html = read('audit/' + f);
    for (const name of CHANGED) {
      /* [0-9a-z], not \\d: this module's numbers carry a revision letter
         (20261012e), and a digits-only match reads 20261022a as 20261022 —
         so two different versions compare equal and the check passes over a
         page asking for yesterday's file. */
      const re = new RegExp(name.replace('.', '\\.') + '\\?v=([0-9a-z]+)', 'g');
      let m;
      while ((m = re.exec(html))) vers.add(name + '@' + m[1]);
    }
  }
  /* At or above the version these changes went out under. A later change
     to one of these files moves its number on (audit_supabase.js went to
     20261027a for the customer refusal), and that is not staleness. Same
     length, so the strings compare in order. */
  const stale = [...vers].filter((v) => v.split('@')[1] < '20261022e');
  check('every page asks for the version these changes went out under', stale, []);
}

console.log('\n── 8. Three readers of one answer, and they must agree ──');
{
  /* The gate decides, but TWO SCREENS draw ticks from the same keys: the
     Team page's User Access block and the audit module's own screen. A
     screen that draws `delete` unticked over a gate that allows it is the
     worst kind of wrong, because it looks configured.

     modPage is liftable -- it is a top-level function in the page -- so it
     is driven here against the gate on the same saved rows. */
  const page = read('scan/scan_user_access.html');
  const at = page.indexOf('function modPage(');
  const end = page.indexOf('\n}\n', at);
  // eslint-disable-next-line no-new-func
  const modPage = new Function(page.slice(at, end + 2) + '; return modPage;')();
  const PG = { key: 'plot_audit', actions: [
    { key: 'record', label: 'r' }, { key: 'edit', label: 'e' },
    { key: 'delete', label: 'd', fallbackTo: 'edit' }] };

  const ROWS = [
    ['saved before the split, editing closed', { view: true, record: true, edit: false }],
    ['saved before the split, editing open',   { view: true, record: true, edit: true }],
    ['answered since, edit open delete closed', { view: true, record: true, edit: true, delete: false }],
    ['answered since, edit closed delete open', { view: true, record: true, edit: false, delete: true }],
  ];
  for (const [label, entry] of ROWS) {
    const drawn = modPage({ audit_actions: { plot_audit: entry } }, 'audit', PG);
    const g = loadGate(user({ plot_audit: entry }), PLOT_PAGE);
    check('the Team page draws what the phone obeys — ' + label,
          [drawn.record, drawn.edit, drawn.delete],
          [g.canAuditAction('record'), g.canAuditAction('edit'), g.canAuditAction('delete')]);
  }

  /* The module's own screen reads through shared_module_access.js, whose
     effectiveActions is inside a closure and cannot be lifted. The line is
     asserted instead -- a copy that loses it draws the other answer. */
  const shared = read('shared/shared_module_access.js');
  checkTrue('and the module\u2019s own screen carries the same fallback',
            /a\.fallbackTo && !\(a\.key in saved\)/.test(shared));
  checkTrue('as does the Team page',
            /a\.fallbackTo && !\(a\.key in saved\)/.test(page));
  /* Both screens have to OFFER the tick, or one of them cannot set what the
     other can. */
  checkTrue('both screens offer a delete tick on every audit',
            (read('audit/audit_user_access.html').match(/key:'delete'/g) || []).length === 4 &&
            /key:'delete'/.test(page));
}

console.log('\n' + (fail ? 'FAILURES: ' + fail + ' (passed ' + pass + ')'
                         : 'all good — ' + pass + ' checks'));
process.exit(fail ? 1 : 0);
