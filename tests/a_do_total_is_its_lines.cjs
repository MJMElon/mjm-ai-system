/* A DO TOTAL IS ITS LINES ADDED UP.

   DO-B1PXG701 was saved reading 109 at the top and 200 on its one line,
   through the office Delivery Order screen, whose Total box is keyed on its
   own. The dashboard reads total_qty and the Sales Listing reads the lines,
   so November read 25,928 on one and 26,019 on the other.

   Drives the SHIPPED linesDisagreeWithTotal and checks both saves call it.

   Run: node tests/a_do_total_is_its_lines.cjs
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'operation/operation_delivery.html'), 'utf8');
let failed = 0;
const is = (got, want, m) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'ok    ' : 'FAIL  ') + m + (ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want)));
  if (!ok) failed++;
};

function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  if (at < 0) return null;
  let depth = 0;
  for (let j = SRC.indexOf('{', at); j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}' && --depth === 0) return SRC.slice(at, j + 1);
  }
  return null;
}
const body = lift('linesDisagreeWithTotal');
is(!!body, true, 'the page carries linesDisagreeWithTotal');
const fn = body ? new Function(body + '; return linesDisagreeWithTotal;')() : () => 'missing';

const box = (qtys) => ({
  querySelectorAll: () => qtys.map((q) => ({ querySelector: () => ({ value: String(q) }) })),
});
is(fn(box([200]), 109), 200, 'one line of 200 under a total of 109 is refused (the B1PXG701 shape)');
is(fn(box([109]), 109), null, 'a line that matches its total saves');
is(fn(box([60, 49]), 109), null, 'two lines adding up to the total save');
is(fn(box([60, 40]), 109), 100, 'two lines short of the total are refused');
is(fn(box(['', '']), 109), null, 'lines with no quantity keyed are left to the total');
is(fn(null, 109), null, 'no line box at all is not a refusal');

const strip = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
is(/linesDisagreeWithTotal\(document\.getElementById\('items_container_mng'\), newQty\)/.test(strip), true, 'editing a DO asks it before saving');
is(/linesDisagreeWithTotal\(document\.getElementById\(`items_container_\$\{rId\}`\), doTotalQty\)/.test(strip), true, 'a new DO keyed on this screen asks it too');

console.log(failed ? '\n' + failed + ' FAILED' : '\nall checks passed');
process.exit(failed ? 1 : 0);
