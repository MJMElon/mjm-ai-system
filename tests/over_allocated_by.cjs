/* "Over Allocated" says by how much.

   The tile said only that something was wrong, so finding out how bad it
   was meant subtracting two figures by hand -- and the number is right
   there in the code that writes the words. Three places say it: the small
   match tile on Transplanting, that tab's big status line, and 1st
   Culling's.

   Checked against the source: each message has to carry the figure its
   own tab already worked out. See the note at the bottom for why this one
   does not render the page.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/over_allocated_by.cjs
   No server needed.                                                       */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'operation',
                                        'operation_batch_detail.html'), 'utf8');

  console.log('\nNowhere is left saying only "Over Allocated"');
  /* Every place that writes the words has to carry the figure with them.
     A bare one would be a screen that names a problem and hides its size. */
  /* Only what is WRITTEN to the screen. The file also tells the batch-234
     story in two long comments, and those are prose, not a message. */
  const uiBare = [];
  const re = /innerText\s*=\s*[`'"]([^`'"]*Over Allocated[^`'"]*)/gi;
  let m;
  while ((m = re.exec(src))) { if (!/Over Allocated by/i.test(m[1])) uiBare.push(m[1]); }
  check('no message writes it without a figure', uiBare, []);

  const withFigure = (src.match(/Over Allocated by \$\{/g) || []).length;
  check('all three places carry one', withFigure, 3);

  console.log('\nAnd the figure is the one the tab already worked out');
  checkTrue('the Transplanting tile uses its own pending figure',
            /Over Allocated by \$\{Math\.abs\(rawPending\)/.test(src));
  checkTrue('the Transplanting status line uses the untransplanted figure',
            /Over Allocated by \$\{Math\.abs\(untransplanted\)/.test(src));
  checkTrue('1st Culling uses its unaccounted figure',
            /Over Allocated by \$\{Math\.abs\(unaccounted\)/.test(src));
  checkTrue('each is made positive, so it never reads "by -53"',
            (src.match(/Over Allocated by \$\{Math\.abs\(/g) || []).length === 3);
  checkTrue('and thousands are grouped',
            (src.match(/Over Allocated by \$\{Math\.abs\([a-zA-Z]+\)\.toLocaleString\(\)\}/g) || []).length === 3);

  /* NO LIVE RENDER HERE, deliberately. Reaching the over-allocated branch
     needs a loaded batch with saved planting and transplant rows -- the
     figures come from the tab's own state, not from anything a blank
     fixture can set -- and a check that never enters the branch is not
     evidence that the branch is right. The assertions above are on the
     exact expressions that produce the words, which is the whole of this
     change: three messages, each carrying the figure its own tab already
     worked out, made positive and grouped.

     tests/t3_row_adjustments.cjs drives the same tab with a real batch; if
     this ever needs rendering end to end, build it from that fixture. */

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
