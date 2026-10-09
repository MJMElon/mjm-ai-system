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

/* ONLY THE MODULES THAT HAVE BEEN ASKED FOR.
   The metas change how a live page is fetched, so they go on a module when
   somebody wants that module current -- not across the site because a test
   would be tidier. The rest are counted at the end so the next person can see
   the same trap is still set for them. */
/* audit/ joined npayroll/ the day a fix to the auditor phone had to
   arrive twice -- once for the database refusing every save, once for a
   sweep that stopped part-way -- and the only thing standing between the
   fix and the phone was which copy of the page it fetched. legacy/ is
   excluded: it is kept to read, not to deploy. */
const GUARDED = (p) => {
  const r = path.relative(ROOT, p);
  return r.startsWith('npayroll/') || r.startsWith('audit/');
};

let bad = 0;
const guarded = pages.filter(GUARDED);

guarded.forEach((p) => {
  const s = fs.readFileSync(p, 'utf8');
  const missing = META.filter(([, re]) => !re.test(s)).map(([n]) => n);
  if (missing.length) {
    bad++;
    console.log(`FAIL  ${path.relative(ROOT, p)}  missing ${missing.join(', ')}`);
  }
});

if (!bad) console.log(`pass  all ${guarded.length} payroll and audit page(s) that version a script refuse to be cached`);

/* And the other half of the bargain: a versioned script must actually carry a
   version, not ?v= with nothing after it. */
let empty = 0;
guarded.forEach((p) => {
  const s = fs.readFileSync(p, 'utf8');
  // Only real attributes -- the comment above these metas says "?v=" itself.
  if (/(?:src|href)="[^"]*\?v=(?![0-9])/.test(s)) {
    empty++; console.log(`FAIL  ${path.relative(ROOT, p)}  a ?v= with no number`);
  }
});
if (!empty) console.log('pass  every ?v= carries a number');

/* What is still exposed, so it is a decision rather than an oversight. */
const rest = pages.filter((p) => !GUARDED(p))
  .filter((p) => !path.relative(ROOT, p).startsWith('legacy/'))
  .filter((p) => {
  const s = fs.readFileSync(p, 'utf8');
  return META.some(([, re]) => !re.test(s));
});
if (rest.length) {
  console.log(`\nnot guarded, and a deploy to them will not reach a browser that has`);
  console.log(`already loaded them: ${rest.length} page(s) outside npayroll/ and audit/`);
  rest.forEach((p) => console.log(`   ${path.relative(ROOT, p)}`));
}

process.exit(bad || empty ? 1 : 0);
