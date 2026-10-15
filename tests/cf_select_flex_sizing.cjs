/* A skinned select next to a flex-1 input split roughly 98/2, not evenly.

   skin() wraps the <select> in a .cf-wrap div and that div steps into the
   select's own slot in the row -- but the wrap carried none of the
   select's OWN flex sizing (a select written `class="input-style flex-1"`,
   the standard pairing all over this system, has flex-basis:0% from
   flex-1). The wrap's flex-basis fell back to auto, which then falls back
   to its own `width:100%` -- 100% of the whole ROW, not of its own slot --
   so next to a real flex-1 sibling the row's shrink algorithm took almost
   all of the overflow out of the wrap and left the sibling close to
   nothing. Main Nursery Settings' "Assign to Nursery..." select next to
   its "Plot Name" input is exactly this: a user screenshot showed the
   select eating the row and the input squeezed to a sliver.

   The fix reads the select's own computed flex-grow/shrink/basis before
   it is reparented and copies them onto the wrap, so the wrap behaves
   exactly as the select itself would have -- whatever Tailwind width/flex
   classes a given page used.

   Run: node tests/cf_select_flex_sizing.cjs
   with `python3 -m http.server 8778` serving the repository root.        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

const PAGE = `<!doctype html><html><head>
<style>
.flex{display:flex}
.gap-3{gap:12px}
.p-5{padding:20px}
.flex-1{flex:1 1 0%}
.input-style { border: 1px solid #cbd5e1; background-color: #ffffff; padding: 10px; border-radius: 8px; outline: none; width: 100%; font-weight: 600; }
button.addbtn{padding:12px 24px;}
</style>
<script src="/shared/shared_cf_select.js"></script>
</head><body>
<div class="flex gap-3 p-5" style="width:1300px" id="row">
  <select id="sel" class="input-style flex-1">
    <option value="">Assign to Nursery...</option>
    <option>UNN 1</option><option>UNN 2</option>
  </select>
  <input type="text" id="inp" class="input-style flex-1" placeholder="Plot Name (e.g. PLOT-A)">
  <button class="addbtn">+ Add Plot</button>
</div>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 400 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));

  await page.route('**/cf-select-flex-sizing-fixture.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await page.goto('http://localhost:8778/cf-select-flex-sizing-fixture.html', { waitUntil: 'load' });
  await page.waitForTimeout(200);

  const wrap = page.locator('.cf-wrap');
  const inp = page.locator('#inp');
  const wrapBox = await wrap.boundingBox();
  const inpBox = await inp.boundingBox();

  console.log('\nA skinned select (flex-1) next to a flex-1 input, 1300px row');
  checkTrue('the wrap exists (select got skinned)', wrapBox);
  const diff = Math.abs(wrapBox.width - inpBox.width);
  checkTrue('select and input land within 40px of each other (was ~1170px apart)', diff < 40);
  checkTrue('the select is not eating the row on its own (was ~1192 of 1300)', wrapBox.width < 800);
  checkTrue('the input is not squeezed to a sliver (was ~22px)', inpBox.width > 400);

  const flexVals = await wrap.evaluate(el => {
    const cs = getComputedStyle(el);
    return { grow: cs.flexGrow, shrink: cs.flexShrink, basis: cs.flexBasis };
  });
  console.log('\nThe wrap carries the selects own flex sizing, not its own defaults');
  check('flex-grow copied from the select (flex-1 -> 1)', flexVals.grow, '1');
  check('flex-shrink copied from the select (flex-1 -> 1)', flexVals.shrink, '1');
  check('flex-basis copied from the select (flex-1 -> 0%)', flexVals.basis, '0%');

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
