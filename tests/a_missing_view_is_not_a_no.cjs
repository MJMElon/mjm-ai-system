/* A PERMISSION THAT IS NOT WRITTEN DOWN IS NOT A NO.

   User Access lists two ticks per audit page -- Record a new audit, and
   Edit and delete past audits. Nothing on that screen is called "view".
   So a saved row can read

       audit_actions: { maintenance: { record: true, edit: false } }

   with no `view` key in it at all. canOpenAuditPage asked `!!acts.view`,
   which is false for a key that was never written, and denied the page
   to somebody the office had just granted. Every module card vanished
   and the auditor was left looking at the one tile this map does not
   cover.

   Access fails OPEN in this system, deliberately: an absent answer is
   nobody has been asked, not no. Only an explicit false is a no.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_missing_view_is_not_a_no.cjs
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'audit', 'audit_supabase.js'), 'utf8');

/* Lift the real function out of the shipped file rather than copying it. */
const start = src.indexOf('const AUDIT_PAGE_KEYS');
const end   = src.indexOf('/* Pull the current permissions down');
if (start < 0 || end < 0) { console.log('FAIL  could not find canOpenAuditPage in audit_supabase.js'); process.exit(1); }

let failed = 0;
const fail = (m) => { console.log('FAIL  ' + m); failed++; };
const pass = (m) => console.log('pass  ' + m);

function ask(perms, page) {
  const store = { mjm_user: JSON.stringify({ id: 'u1', permissions: perms }) };
  const ctx = { localStorage: { getItem: k => (k in store ? store[k] : null) }, console };
  vm.createContext(ctx);
  vm.runInContext(src.slice(start, end) + '\n;canOpenAuditPage(PAGE);', ctx.PAGE === undefined
    ? Object.assign(ctx, { PAGE: page }) && ctx : ctx);
  return vm.runInContext('canOpenAuditPage(' + JSON.stringify(page) + ')', ctx);
}

const CASES = [
  ['nothing configured at all',                 {},                                                      true ],
  ['Record ticked, no view key written',        {audit_actions:{maintenance:{record:true,edit:false}}},  true ],
  ['Record unticked, still no view key',        {audit_actions:{maintenance:{record:false,edit:false}}}, true ],
  ['view explicitly true',                      {audit_actions:{maintenance:{view:true,record:true}}},   true ],
  ['view explicitly FALSE -- the office said no',{audit_actions:{maintenance:{view:false,record:true}}}, false],
  ['a different page configured, this one not', {audit_actions:{height:{view:false}}},                   true ],
  ['legacy audit_pages says none',              {audit_pages:{maintenance:'none'}},                      false],
];

for (const [label, perms, want] of CASES) {
  let got;
  try { got = ask(perms, 'maintenance'); }
  catch (e) { fail(`${label}: threw — ${e.message}`); continue; }
  if (got === want) pass(`${label} → ${got ? 'open' : 'closed'}`);
  else fail(`${label}: expected ${want ? 'open' : 'closed'}, got ${got ? 'open' : 'closed'}` +
            (want ? '\n      A tick the office never wrote is not a tick they cleared.' : ''));
}

console.log(failed ? `\n${failed} failure(s)` : '\nall good');
process.exit(failed ? 1 : 0);
