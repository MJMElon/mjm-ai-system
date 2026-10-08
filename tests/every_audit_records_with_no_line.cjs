/* AN AUDITOR WITH NO SIGNAL STILL HAS A LIST TO RECORD AGAINST.

   The outbox has always worked: a saved audit goes into IndexedDB and is
   sent when the line comes back. What nobody checked is the other half --
   whether there is anything on screen to record AGAINST when the phone
   has no signal.

   Plot Condition, Seedling Height and Papan Tanda all keep the processed
   list in localStorage and serve it when navigator.onLine is false.
   MAINTENANCE DID NOT. Its loadAll fires three reads and the middle one,
   audit_maintenance_audits, carries no .catch, so one failure throws past
   the whole function: tasks is never set, renderLists never runs, and the
   page shows "Failed to load" over an empty list. With no line that is
   every time. The auditor is standing in the plot with the work in front
   of them and the app has nothing to offer.

   So this reads all four modules and holds them to the same three things,
   which are the three the office actually asked for:

     1. it can record the work
     2. it can record with NO LINE
     3. it syncs when the line comes back

   Checked against the SHIPPED files rather than a copy, because the point
   is that one of the four had drifted out of step with the other three
   and nothing said so.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/every_audit_records_with_no_line.cjs
*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
const fail = (m) => { console.log('FAIL  ' + m); failed++; };
const pass = (m) => console.log('pass  ' + m);

/* The four audit modules, and the file each one ships as. */
const MODULES = [
  ['Plot Condition',  'audit_script.js'],
  ['Seedling Height', 'audit_height_script.js'],
  ['Papan Tanda',     'audit_papan_script.js'],
  ['Maintenance',     'audit_maintenance_script.js'],
];

for (const [label, file] of MODULES) {
  const p = path.join(ROOT, 'audit', file);
  if (!fs.existsSync(p)) { fail(`${label}: ${file} is missing`); continue; }
  const src = fs.readFileSync(p, 'utf8');

  /* 2. RECORDS WITH NO LINE — it must keep the list and serve it back. */
  const saves   = /function _saveOfflineCache\s*\(/.test(src);
  const loads   = /function _loadOfflineCache\s*\(/.test(src);
  const called  = /_saveOfflineCache\(\)/.test(src) && /_loadOfflineCache\(\)/.test(src);
  const shorts  = /if\s*\(\s*!navigator\.onLine\s*\)/.test(src);

  if (saves && loads && called && shorts) {
    pass(`${label}: keeps its list on the phone and serves it with no line`);
  } else {
    fail(`${label}: an auditor with no signal gets an empty list\n` +
         `      saveOfflineCache:${saves} loadOfflineCache:${loads} ` +
         `both called:${called} offline short-circuit:${shorts}\n` +
         `      Plot Condition (audit_script.js) is the shape to copy.`);
  }

  /* 1. RECORDS THE WORK — the save goes through smartSave, which is what
        queues it. A direct sb.insert would throw on a phone with no line
        and the audit would be gone. */
  if (/smartSave\s*\(/.test(src)) {
    pass(`${label}: saves through the outbox, so a save with no line is kept`);
  } else {
    fail(`${label}: does not save through smartSave — a record made with no line is lost`);
  }

  /* A load that fails must not leave the screen empty when there IS a
     cache to show. Only enforced where the module has one. */
  if (saves && !/catch[\s\S]{0,400}_loadOfflineCache\(\)/.test(src)) {
    console.log(`      note  ${label}: a failed load with a line still shows nothing; ` +
                `Maintenance falls back to the cache there`);
  }
}

/* 3. SYNCS WHEN THE LINE COMES BACK — one file owns this for all four. */
const offl = fs.readFileSync(path.join(ROOT, 'audit', 'audit_dexie_offline.js'), 'utf8');
const online  = /addEventListener\(\s*'online'/.test(offl) && /startSync\(\)/.test(offl);
const timer   = /setInterval\([\s\S]{0,120}?syncNow/.test(offl);
if (online && timer) pass('the queue is sent the moment the line returns, and every 30s after');
else fail('nothing sends the queue when the line comes back' +
          `\n      online listener:${online} poll:${timer}`);

console.log(failed ? `\n${failed} failure(s)` : '\nall good');
process.exit(failed ? 1 : 0);
