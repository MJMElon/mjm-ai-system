#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   EVERY TABLE THE AUDIT APP WRITES TO HAS A POLICY WAITING FOR IT

   An auditor saved 70 maintenance audits into a phone and none of them
   reached the server: the table was gated on a module check the app had
   stopped asking for, so the database refused every row. It had happened
   before on audit_height_records and been repaired there.

   What made it cost a second round was the shape of the repair, not the
   repair itself. The table list lives inside a SQL file, the app writes
   through smartSave in another file, and nothing held the two together.
   Add an audit table tomorrow and it ships with no policy at all - the
   screen works for whoever has modules.audit set, and refuses everybody
   else, silently, until somebody reads a phone.

   So this test reads BOTH and fails when they disagree. It is the cheap
   half of the guard; the expensive half is in the SQL itself, which ends
   by inserting a row as each auditor and rolling it back, because a check
   that only inspects the gate is how the first green result got handed
   over on a database that refused every save.
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SQL  = path.join(ROOT, 'shared', 'RUN_ME_auditor_can_save.sql');

let failed = 0;
const fail = (m) => { console.log('FAIL  ' + m); failed++; };
const pass = (m) => console.log('pass  ' + m);

/* Every table the audit app saves into. smartSave is the one door - it is
   what queues offline and retries - and sb.insert/update are the two that
   bypass it, so all three are read. */
const writes = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'audit'))) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(ROOT, 'audit', f), 'utf8');
  for (const m of src.matchAll(/(?:smartSave|sb\.insert|sb\.update)\(\s*'([a-z_]+)'/g)) {
    if (m[1].startsWith('audit_')) writes.add(m[1]);
  }
}

if (!writes.size) fail('found no audit_* table the app writes to - has the parser gone stale?');
else pass(`the audit app writes to ${writes.size} table(s): ${[...writes].sort().join(', ')}`);

if (!fs.existsSync(SQL)) {
  fail('shared/RUN_ME_auditor_can_save.sql is missing - the repair every auditor depends on');
} else {
  const sql = fs.readFileSync(SQL, 'utf8');

  /* The FOREACH list the policies are applied over. */
  const block = sql.slice(sql.indexOf('FOREACH t IN ARRAY ARRAY['));
  const listed = new Set(
    [...block.slice(0, block.indexOf(']')).matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  );

  const missing = [...writes].filter(t => !listed.has(t));
  if (missing.length) {
    fail('the app writes to these, and the repair never gives them a policy: ' + missing.join(', ') +
         '\n      Add them to the FOREACH list in shared/RUN_ME_auditor_can_save.sql.');
  } else {
    pass(`every table the app writes to is in the repair (${listed.size} listed)`);
  }

  /* The proof step. Without it the file is an inspection, and an
     inspection is what reported four green lines last time. */
  if (!/INSERT INTO public\.audit_maintenance_audits/.test(sql) ||
      !/mjm_probe_rollback/.test(sql)) {
    fail('the repair no longer PROVES a save - it must insert as each auditor and roll back');
  } else {
    pass('the repair still ends by attempting a real save and rolling it back');
  }

  /* A probe that forgets to undo itself writes rubbish into the ledger. */
  if (!/RAISE EXCEPTION 'mjm_probe_rollback'/.test(sql)) {
    fail('the probe does not raise to roll its row back');
  } else {
    pass('the probe row is rolled back rather than committed');
  }
}

console.log(failed ? `\n${failed} failure(s)` : '\nall good');
process.exit(failed ? 1 : 0);
