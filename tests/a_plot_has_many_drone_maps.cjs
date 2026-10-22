/* A PLOT HAS AS MANY DRONE MAPS AS IT TOOK TO FLY IT, AND EACH ONE SAYS WHICH.

   It had one. A plot flown in two passes, or re-flown because the first run
   was cloudy, had the second picture REPLACE the first — `t6_plotDocs[rowId]
   = {...}` — and the rest lived in a folder the report knows nothing about.

   Two halves to this:

     · the maps are a LIST, added to rather than replaced, and
     · each one carries its own REMARK, because "north half, 21 Feb" is what
       tells two pictures of one plot apart and it is not in a file name.

   The format is the part to get right. `DocList:` carries all of them with
   every field percent-encoded, so neither separator can turn up inside one —
   and the FIRST map is still written as `DocUrl:` / `DocName:` exactly as it
   always was, so every remark written before this goes on loading and every
   reader of one goes on working.

   The encode and decode are lifted out of the shipped page and driven; the
   wiring is asserted against the source, because what is being checked is
   which call the page makes.

   Run: node tests/a_plot_has_many_drone_maps.cjs
*/
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'operation', 'operation_batch_detail.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

/* The real pair, lifted. */
const from = SRC.indexOf("        const T6_DOC_SEP = ';', T6_FIELD_SEP = '|';");
const end  = SRC.indexOf('}).filter(Boolean);\n        }', from);
if (from < 0 || end < 0) { console.log('FAILED  could not lift the doc codec'); process.exit(1); }
const body = SRC.slice(from, end + '}).filter(Boolean);\n        }'.length);
const { t6EncodeDocs, t6DecodeDocs } =
  new Function(body + '\nreturn { t6EncodeDocs, t6DecodeDocs };')();

const D = (url, name, note) => ({ base64: url, name, note });

console.log('\nEvery map survives the round trip, remark and all');
{
  const list = [
    D('https://x/cull3_docs/241/N3-1.jpg', 'north.jpg', 'North half, flown 21 Feb'),
    D('https://x/cull3_docs/241/N3-2.jpg', 'south.jpg', 'South half, re-flown 23 Feb — first run cloudy')
  ];
  const back = t6DecodeDocs(t6EncodeDocs(list));
  check('both come back', back.length, 2);
  check('with their urls', back.map(d => d.base64), list.map(d => d.base64));
  check('their names', back.map(d => d.name), ['north.jpg', 'south.jpg']);
  check('and their remarks', back.map(d => d.note), list.map(d => d.note));
}

console.log('\nNeither separator can turn up inside a field');
{
  /* A remark with a semicolon and a pipe in it is an ordinary remark, and
     splitting on them raw is how one map becomes three. */
  const list = [D('https://x/a.jpg', 'a;b|c.jpg', 'Flown 21 Feb; re-flown 23 | cloudy')];
  const enc = t6EncodeDocs(list);
  check('the encoded form holds one entry', enc.split(';').length, 1);
  const back = t6DecodeDocs(enc);
  check('and it comes back whole', [back.length, back[0].name, back[0].note],
        [1, 'a;b|c.jpg', 'Flown 21 Feb; re-flown 23 | cloudy']);
}
{
  // A space would end the DocUrl token the remark is scanned with.
  const enc = t6EncodeDocs([D('https://x/a.jpg', 'two words.jpg', 'a remark with spaces')]);
  check('nothing encoded carries a space', /\s/.test(enc), false);
}

console.log('\nThe awkward shapes');
check('no maps encodes to nothing', t6EncodeDocs([]), '');
check('and decodes back to none', t6DecodeDocs(''), []);
check('a map with no url is not a map', t6EncodeDocs([D('', 'x.jpg', 'hm')]), '');
{
  const back = t6DecodeDocs(t6EncodeDocs([D('https://x/a.jpg', '', '')]));
  check('a map with no name still loads', [back.length, back[0].name, back[0].note],
        [1, 'document', '']);
}
{
  const back = t6DecodeDocs(t6EncodeDocs([D('https://x/a.pdf', 'a.pdf', '')]));
  check('a pdf is not taken for an image', back[0].isImg, false);
  const img = t6DecodeDocs(t6EncodeDocs([D('https://x/a.JPG', 'a.JPG', '')]));
  check('and a picture is, whatever the case of it', img[0].isImg, true);
}

console.log('\nA remark written before any of this still loads');
/* The single DocUrl stands in for a list of one, which is what it always
   was. Nothing may be dropped on the way past. */
checkTrue('the loader falls back to the one DocUrl',
          /if \(!list\.length && p\.savedDocUrl\)/.test(SRC));
checkTrue('…and the save still writes DocUrl and DocName as it always did',
          /docUrl \? `\$\{docNamePart\} DocUrl:\$\{docUrl\}` : ''/.test(SRC));
checkTrue('…taking them from the FIRST map',
          /if \(stored\[0\]\) \{\s*\n\s*docUrl = stored\[0\]\.base64;/.test(SRC));
checkTrue('and DocList is written beside them',
          / DocList:\$\{t6EncodeDocs\(stored\)\}/.test(SRC));

console.log('\nAdding is adding, not replacing');
checkTrue('the picker takes more than one file', /id="\$\{rowId\}-doc-input" class="hidden" multiple/.test(SRC));
checkTrue('and every file picked is processed',
          /files\.forEach\(f => processT6Doc\(f, rowId\)\);/.test(SRC));
checkTrue('a drop takes all of them too',
          /const files = Array\.from\(\(event\.dataTransfer && event\.dataTransfer\.files\) \|\| \[\]\);/.test(SRC));
checkTrue('a new file is pushed onto the list', /list\.push\(\{ name: file\.name/.test(SRC));
/* Replace is the deliberate one, and it keeps the remark: that describes the
   PLOT, and swapping a cloudy picture has not changed where it was flown. */
checkTrue('Replace swaps one and keeps its remark',
          /note: list\[_t6ReplaceAt\]\.note \|\| ''/.test(SRC));
checkTrue('…and takes one file even if several are picked',
          /if \(_t6ReplaceAt != null && _t6ReplaceRow === rowId\) \{\s*\n\s*if \(files\[0\]\) processT6Doc\(files\[0\], rowId\);/.test(SRC));
checkTrue('Remove takes one by index', /function removeT6Doc\(rowId, idx\)/.test(SRC));

console.log('\nThe row says how many, and the panel says which');
checkTrue('the chip shows the count where there is more than one',
          /chip\.innerText = docs\.length > 1 \? String\(docs\.length\)/.test(SRC));
checkTrue('the chip opens the panel', /if \(t6DocsOf\(rowId\)\.length\) \{ openT6Gallery\(rowId\); return; \}/.test(SRC));
checkTrue('the panel draws a remark box per map', /class="input-style !text-\[12px\] !py-1\.5 mt-1\.5 w-full t6-doc-note"/.test(SRC));
checkTrue('…and the box writes back onto that map',
          /oninput="onT6DocNote\('\$\{rowId\}', \$\{i\}, this\.value\)"/.test(SRC));
/* A locked row views and does not edit — the same rule as everywhere else on
   this tab, and the remark boxes are part of it. */
checkTrue('a locked row gets no Add', /add\.classList\.toggle\('hidden', locked\)/.test(SRC));
checkTrue('…no Replace or Remove', /\$\{locked \? '' : `/.test(SRC));
checkTrue('…and read-only remarks', /\$\{locked \? 'readonly' : ''\}/.test(SRC));
checkTrue('the viewer says which of them it is showing',
          /const which = docs\.length > 1 \? ` \(\$\{at \+ 1\} of \$\{docs\.length\}\)` : '';/.test(SRC));

console.log('\nEach upload stands on its own');
/* One failure costs that picture and not the rest, and the one that failed
   is still on screen with its remark to be saved again. */
checkTrue('a failed upload keeps the map on screen', /saved\.push\(d\);   \/\/ kept on screen, still unsent/.test(SRC));
checkTrue('and only the ones that reached storage are written',
          /const stored = saved\.filter\(d => \/\^https\?:/.test(SRC));
checkTrue('the storage path carries the index, so two in one millisecond cannot collide',
          /`\$\{plotName\}-\$\{row\.id\}-\$\{dI \+ 1\}`/.test(SRC));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
