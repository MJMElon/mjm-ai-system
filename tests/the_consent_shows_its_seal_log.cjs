/* THE SEAL LOG MOVED OFF THE ADMIN PORTAL AND ONTO SEAL MANAGE.

   View consent on Seal Manage now carries a Seal Log: one box per seal
   ISSUED on the consent, green when the FC Portal scanned it, and the
   NUMBER in red when it was keyed by hand on the Add dialog. The office own
   example: 003320 - 003322 issued, 003320 and 003321 scanned, 003322 keyed
   -- all three green, 003322 written in red.

   sealLogHtml is LIFTED out of the shipped page with the seal-number helpers
   it reads, so this is the real rule and not a copy of it.

   Run: node tests/the_consent_shows_its_seal_log.cjs  (no server needed) */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'seal', 'seal_dashboard.html'), 'utf8');
let bad = 0;
const is = (g, w, m) => { const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) console.log('ok    ' + m); else { bad++; console.log('FAIL  ' + m + '\n      got  ' + a + '\n      want ' + b); } };

function lift(startToken) {
  const i = SRC.indexOf(startToken);
  if (i < 0) throw new Error('not in the page: ' + startToken);
  if (startToken.startsWith('const ')) return SRC.slice(i, SRC.indexOf('\n', i));
  let depth = 0, j = SRC.indexOf('{', SRC.indexOf(')', i));
  for (; j < SRC.length; j++) { if (SRC[j] === '{') depth++; else if (SRC[j] === '}' && --depth === 0) break; }
  return SRC.slice(i, j + 1);
}
let code;
try {
  code = ['function sealNo(', 'function sealWidth(', 'const SEAL_MIN_WIDTH', 'function sealCode(', 'function sealShow(',
          'function normRanges(', 'const SEAL_LOG_MAX_BOXES', 'function sealLogHtml('].map(lift).join('\n');
} catch (e) { console.log('FAIL  ' + e.message); process.exit(1); }
const ctx = vm.createContext({
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  fmt: (n) => Number(n || 0).toLocaleString('en-MY'),
});
vm.runInContext(code + '\nglobalThis.__log = sealLogHtml;', ctx);
const log = ctx.__log;

// Boxes out of the html: [number, green?, red text?, amber?]
const boxesOf = (html) => {
  const grid = html.split('sl-key')[0];
  return [...grid.matchAll(/<span class="sl-box([^"]*)"[^>]*>([^<]*)<\/span>/g)]
    .map((m) => [m[2], / sl-hit/.test(m[1]), / sl-typed/.test(m[1]), / sl-extra/.test(m[1])]);
};

console.log('\n── 1. The office example ──');
{
  const c = { id: 1, seal_ranges: [{ start: '003320', end: '003322' }] };
  const html = log(c, [
    { consent_id: 1, barcode: '003320', keyed_by_hand: false },
    { consent_id: 1, barcode: '003321' },                     // a row from before the column: scanned
    { consent_id: 1, barcode: '003322', keyed_by_hand: true },
  ]);
  is(boxesOf(html), [['003320', true, false, false], ['003321', true, false, false], ['003322', true, true, false]],
     'all three boxes green, and 003322 written in red');
  is(/3 of 3 issued scanned/.test(html) && /1 keyed by hand/.test(html), true, 'the heading counts 3 of 3, 1 keyed by hand');
}

console.log('\n── 2. Not scanned yet, numbers matched as numbers, and the odd one out ──');
{
  const c = { id: 2, seal_ranges: [{ start: '003320', end: '003323' }] };
  const html = log(c, [
    { consent_id: 2, barcode: '3320' },                          // keyed without its zeros: the same seal
    { consent_id: 2, barcode: '009999', keyed_by_hand: true },   // never issued on this consent
  ]);
  is(boxesOf(html).slice(0, 4).map((b) => [b[0], b[1]]),
     [['003320', true], ['003321', false], ['003322', false], ['003323', false]],
     '3320 is 003320 and goes green; the three not scanned stay plain');
  is(boxesOf(html).filter((b) => b[3]).map((b) => [b[0], b[2]]), [['009999', true]],
     'a seal scanned here and never issued here is listed, not dropped');
}

console.log('\n── 3. A scan log that could not be read says so ──');
is(/could not be read/.test(log({ id: 3, seal_ranges: [{ start: '1', end: '2' }] }, null)), true,
   'null scans says the log could not be read, rather than drawing every seal as not scanned');

console.log('\n── 4. The page wiring ──');
is(/from\('fcportal_scan_records'\)\.select\('\*'\)\.in\('consent_id', ids\)/.test(SRC), true,
   'View consent reads the scan log with select(*), so a missing column cannot refuse the read');
is(/\+ sealLogHtml\(c, scansOf\(c\.id\)\)/.test(SRC), true, 'and draws the log under the seals given');

console.log('\n── 5. Gone from the Admin Portal ──');
const MOB = path.join(__dirname, '..', '..', 'Mobile', 'src', 'pages', 'Consent.jsx');
if (fs.existsSync(MOB)) {
  const m = fs.readFileSync(MOB, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  is(/Seal Log —/.test(m), false, 'the Customer Consent history no longer draws a Seal Log');
  is(/fcportal_scan_records/.test(m), false, 'and no longer reads the scan log at all');
} else console.log('skip  Mobile repository not beside this one');

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
