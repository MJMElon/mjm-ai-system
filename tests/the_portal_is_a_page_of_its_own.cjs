/* THE AUDITOR PORTAL IS A PAGE OF ITS OWN.
 *
 * audit_home.html carried a back arrow out to the MJM AI hub, aimed at
 * audit_admin.html instead for an admin. The office asked for it to go --
 * "remove the back button in auditor portal. so the auditor portal will
 * become an individual webpage. It only link the data back to auditor
 * portal manage webpage" -- which is the mirror of the change that took
 * "Visit 555 Auditor Portal" off the back office. Neither page now
 * carries a door into the other; what joins them is the data.
 *
 * Three things this holds, and only the second is obvious:
 *
 *  - the anchor is gone, and gone from the MARKUP rather than from the
 *    file. A page that explains what it removed contains the words, so
 *    the comments are stripped before anything is asked. That trap has
 *    already caught one test in this repository.
 *  - the left grid cell is still THERE, as .fcr-spacer. The ribbon is
 *    1fr auto 1fr and the empty cell is what balances the right-hand
 *    cluster, so deleting it slides the wordmark into the first column.
 *    audit_admin.html has done it that way since it was written.
 *  - the portal has no OTHER way out either. An arrow removed while a
 *    pill somewhere else still leaves for the hub is not a page of its
 *    own, and that is the thinner-copy fault this codebase is full of.
 *
 * Run: node tests/the_portal_is_a_page_of_its_own.cjs
 * No build, no server and no browser needed.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* Comments out, so what is asserted is the markup a browser is handed. */
const strip = (html) => html
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

let failed = 0;
const ok   = (m) => console.log('ok    ' + m);
const fail = (m) => { console.log('FAIL  ' + m); failed++; };

const HOME_RAW = read('audit/audit_home.html');
const HOME     = strip(HOME_RAW);
const ADMIN    = strip(read('audit/audit_admin.html'));

/* ── 1. the arrow is out of the markup ──────────────────────────────── */
if (!/fcr-back/.test(HOME)) {
  ok('the auditor portal carries no back arrow');
} else {
  fail('the back arrow is still in the markup of audit_home.html');
}

/* ── 2. and the cell it sat in is still there ───────────────────────── */
if (/<span class="fcr-spacer"/.test(HOME)) {
  ok('the empty left cell stays, so the wordmark keeps the centre line');
} else {
  fail('the left grid cell is gone, so the ribbon brand slides left');
}
if (/<span class="fcr-spacer"/.test(ADMIN)) {
  ok('and it is the same spacer the back office has always used');
} else {
  fail('audit_admin.html no longer uses .fcr-spacer, so the two have drifted');
}

/* ── 3. no other door out of the portal ─────────────────────────────── */
/* Sign Out is the way out and is not a link; a bookmark to the hub in a
   comment is not a door. So this asks the markup for an anchor whose
   href leaves for the hub or for the back office. */
const hrefs = (HOME.match(/href\s*=\s*"[^"]*"/g) || [])
  .map(h => h.slice(h.indexOf('"') + 1, -1));
const leaks = hrefs.filter(h =>
  h.indexOf('ai.mjmnursery.com') !== -1 || h.indexOf('audit_admin.html') !== -1);
if (leaks.length === 0) {
  ok('and no anchor on the page leaves for the hub or the back office');
} else {
  fail('the portal still links out: ' + leaks.join(', '));
}

/* ── 4. the module cards are untouched ──────────────────────────────── */
/* The portal is standalone, not inert -- it still opens its own four
   modules, and a removal that took those with it would be silent. */
['audit_height_index.html', 'audit_papan_index.html',
 'audit_maintenance_index.html'].forEach(f => {
  if (HOME.indexOf(f) !== -1) ok('the portal still opens ' + f);
  else fail('the portal lost its link to ' + f);
});

/* ── 5. the arrow is not left behind on any live page ───────────────── */
/* audit_nursery_select.html keeps its markup and is allowed to: it
   redirects in its own head and never renders. Anything else carrying
   one is a door this change missed. */
const dir  = path.join(__dirname, '..', 'audit');
const live = fs.readdirSync(dir).filter(f => /\.html$/.test(f))
  .filter(f => f !== 'audit_nursery_select.html')
  .filter(f => /fcr-back/.test(strip(fs.readFileSync(path.join(dir, f), 'utf8'))));
if (live.length === 0) {
  ok('no live audit page carries a ribbon back arrow');
} else {
  fail('a back arrow is still drawn on: ' + live.join(', '));
}

/* ── 6. the service worker will actually deliver it ─────────────────── */
/* audit_sw.js precaches audit_home.html, so a VER that did not move is a
   change that reaches nobody. */
const SW = read('audit/audit_sw.js');
if (/audit_home\.html/.test(SW)) {
  const ver = (SW.match(/const VER\s*=\s*'([^']+)'/) || [])[1] || '';
  if (/^mjm-\d{8}$/.test(ver)) ok('audit_sw.js VER is ' + ver + ', so the page is deliverable');
  else fail('audit_sw.js VER does not look bumped: ' + ver);
}

console.log('');
console.log(failed ? failed + ' FAILED' : 'all good');
process.exit(failed ? 1 : 0);
