/* A PAGE THAT CACHES CANNOT DELIVER A FIX.
 *
 * Every script on these pages is cache-busted with a ?v= that lives IN THE
 * PAGE. So the page is the one thing that must never be served from cache: a
 * stale copy goes on asking for the OLD script for ever, and a deploy reaches
 * nobody. The code was right, pushed and on origin/main, and the office still
 * downloaded the old PDF.
 *
 * index.html has carried the three metas since it was written. The module
 * pages had not, which is the whole of the bug.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const META = [
  ['Cache-Control', /http-equiv="Cache-Control"/i],
  ['Pragma',        /http-equiv="Pragma"/i],
  ['Expires',       /http-equiv="Expires"/i],
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const pages = walk(ROOT).filter((p) =>
  /(?:src|href)="[^"]*\?v=\d/.test(fs.readFileSync(p, 'utf8')));
let bad = 0;

pages.forEach((p) => {
  const s = fs.readFileSync(p, 'utf8');
  const missing = META.filter(([, re]) => !re.test(s)).map(([n]) => n);
  if (missing.length) {
    bad++;
    console.log(`FAIL  ${path.relative(ROOT, p)}  missing ${missing.join(', ')}`);
  }
});

if (!bad) console.log(`pass  all ${pages.length} page(s) that version a script refuse to be cached`);

/* And the other half of the bargain: a versioned script must actually carry a
   version, not ?v= with nothing after it. */
let empty = 0;
pages.forEach((p) => {
  const s = fs.readFileSync(p, 'utf8');
  // Only real attributes -- the comment above these metas says "?v=" itself.
  if (/(?:src|href)="[^"]*\?v=(?![0-9])/.test(s)) {
    empty++; console.log(`FAIL  ${path.relative(ROOT, p)}  a ?v= with no number`);
  }
});
if (!empty) console.log('pass  every ?v= carries a number');

process.exit(bad || empty ? 1 : 0);
