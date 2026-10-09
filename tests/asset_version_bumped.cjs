/* A CHANGED SCRIPT WITH AN UNCHANGED ?v= REACHES NOBODY.

   Every script and stylesheet on an office page is cache-busted with a `?v=`
   that lives in the PAGE. The no-cache metas keep the page itself fresh, so
   the browser re-reads it every load and then asks for exactly the file the
   page names -- `npayroll_script.js?v=68` -- which it already has. Editing
   the script without touching that number changes nothing for anybody who
   has opened the page before.

   It has now happened twice. The first time a PDF fix sat on origin/main
   while the office went on downloading the old form, and the answer was the
   three metas. The metas were in place the second time: seven changes to
   npayroll_script.js went up behind `?v=68`, and the office opened the form
   and saw the old one. The metas were never the whole lever -- they only
   make the page fresh enough to ASK for a new number, and somebody still
   has to put a new number there.

   So the number is tied to the file. Each versioned asset is hashed and the
   hash recorded beside the version it was published under; a file whose
   contents moved while its `?v=` stood still fails here, and the failure
   says which page to edit and what to write.

   Updating the manifest is deliberately a separate step (--write), so the
   check cannot be silenced by the same keystroke that broke it.

   Run:        node tests/asset_version_bumped.cjs
   After a bump: node tests/asset_version_bumped.cjs --write
*/
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(__dirname, 'asset_versions.json');
const WRITE = process.argv.includes('--write');

/* Every page in the repository, minus the places that are not pages. */
const SKIP = new Set(['node_modules', '.git', 'legacy', 'tests', 'tools']);
function htmlFiles(dir, out) {
  out = out || [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) htmlFiles(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

/* src="x.js?v=12" and href="x.css?v=3", in either quote. The version has to
   be a number; a `?v=` with nothing after it is pages_do_not_go_stale's
   business, not this one. */
const REF = /(?:src|href)\s*=\s*["']([^"'?]+\.(?:js|css))\?v=(\d+)["']/g;

const refs = [];      // { page, asset (repo-relative), version }
for (const page of htmlFiles(ROOT)) {
  const src = fs.readFileSync(page, 'utf8');
  let m;
  while ((m = REF.exec(src))) {
    const asset = path.resolve(path.dirname(page), m[1]);
    if (!fs.existsSync(asset)) continue;   // a reference to something not here
    refs.push({
      page:    path.relative(ROOT, page),
      asset:   path.relative(ROOT, asset),
      version: m[2]
    });
  }
}

const sha = (p) => crypto.createHash('sha1')
  .update(fs.readFileSync(path.join(ROOT, p))).digest('hex').slice(0, 12);

/* One asset can be named by several pages, each with its own number. The
   record is keyed on "asset@version", so a page left behind on the old
   number is its own entry and shows up as the stale one it is. */
const now = {};
refs.forEach(r => { now[r.asset + '@' + r.version] = sha(r.asset); });

if (WRITE) {
  fs.writeFileSync(MANIFEST, JSON.stringify(now, null, 2) + '\n');
  console.log('recorded ' + Object.keys(now).length + ' versioned assets');
  process.exit(0);
}

if (!fs.existsSync(MANIFEST)) {
  console.log('FAILED  no manifest yet — run: node tests/asset_version_bumped.cjs --write');
  process.exit(1);
}
const was = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

const stale = [], fresh = [];
refs.forEach(r => {
  const key = r.asset + '@' + r.version;
  const recorded = was[key];
  if (recorded == null) { fresh.push(r); return; }       // a new number: fine
  if (recorded !== now[key]) stale.push(r);
});

console.log('\n' + refs.length + ' versioned reference(s) across '
          + new Set(refs.map(r => r.page)).size + ' page(s)');
fresh.forEach(r => console.log('  new    ' + r.asset + ' at ?v=' + r.version
                             + '  (' + r.page + ')'));

if (!stale.length) {
  console.log('\nok   every changed asset carries a number nobody has cached');
  console.log('     after bumping a ?v=, record it: node tests/asset_version_bumped.cjs --write');
  process.exit(0);
}

console.log('\nFAILED  ' + stale.length + ' asset(s) changed without their ?v= moving.');
console.log('        A browser that has opened the page already will go on');
console.log('        serving the copy it has, and the change reaches nobody.\n');
stale.forEach(r => {
  console.log('  ' + r.asset);
  console.log('    edit ' + r.page);
  console.log('    ?v=' + r.version + '  →  ?v=' + (Number(r.version) + 1));
});
console.log('\n  then: node tests/asset_version_bumped.cjs --write');
process.exit(1);
