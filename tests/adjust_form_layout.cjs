/* The Stock Adjustment row must not hang out of its card.

   It used to: the row was a grid of FIXED tracks — 160+170+180+190 is
   700px before the Reason field and the button, and none of it could
   shrink — so on a laptop the Save button sat outside the panel below it
   and "(required)" was clipped off the Reason label. It is a wrapping
   flex row now, which cannot overflow horizontally as long as no single
   item is wider than the card.

   This is a FIXTURE, not the live page: Tailwind's CDN is blocked in this
   environment, so the page renders unstyled and an overflow measured on
   it would mean nothing. The row's markup is lifted out of
   operation_batch_detail.html at run time so it cannot drift from what
   ships, and the handful of utilities that row depends on are
   reimplemented here from Tailwind's own definitions.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/adjust_form_layout.cjs
   No server needed.

   Checked against the bug: putting the old
   `md:grid-cols-[160px_170px_180px_190px_1fr_auto]` back (with a matching
   `grid-template-columns` in the shim) fails this at 1100px and below, the
   Save button hanging 239px outside the card at the 930px width of the
   screenshot it was reported from.                                        */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SRC = path.join(__dirname, '..', 'operation', 'operation_batch_detail.html');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

// The utilities this row uses, straight from Tailwind's scale.
const SHIM = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; font-size: 16px; }
  .flex { display: flex; }
  .flex-wrap { flex-wrap: wrap; }
  .items-end { align-items: flex-end; }
  .gap-3 { gap: 0.75rem; }
  .pt-2 { padding-top: 0.5rem; }
  .flex-1 { flex: 1 1 0%; }
  .flex-\\[2\\] { flex: 2; }
  .shrink-0 { flex-shrink: 0; }
  .whitespace-nowrap { white-space: nowrap; }
  .basis-\\[150px\\] { flex-basis: 150px; }
  .basis-\\[170px\\] { flex-basis: 170px; }
  .basis-\\[180px\\] { flex-basis: 180px; }
  .basis-\\[220px\\] { flex-basis: 220px; }
  .min-w-\\[130px\\] { min-width: 130px; }
  .min-w-\\[140px\\] { min-width: 140px; }
  .min-w-\\[150px\\] { min-width: 150px; }
  .min-w-\\[190px\\] { min-width: 190px; }
  .max-w-\\[180px\\] { max-width: 180px; }
  .max-w-\\[200px\\] { max-width: 200px; }
  .max-w-\\[210px\\] { max-width: 210px; }
  .px-5 { padding-left: 1.25rem; padding-right: 1.25rem; }
  .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
  .text-xs { font-size: 0.75rem; }
  .tracking-widest { letter-spacing: 0.1em; }
  .uppercase { text-transform: uppercase; }
  .font-black { font-weight: 900; }
  .rounded-xl { border-radius: 0.75rem; }
  .hidden { display: none; }
  /* The page's own field styling, from its <style> block. */
  .input-style { width: 100%; padding: 12px 14px; border: 2px solid #e8dcc8;
                 border-radius: 12px; font-size: 14px; }
  .label-style { display: block; font-size: 10px; font-weight: 900;
                 text-transform: uppercase; letter-spacing: .12em; margin-bottom: 6px; }
  .select-wrapper { position: relative; }
  #card { border: 1px solid #e8dcc8; padding: 20px; }
`;

function extractRow(html) {
  // Anchored on the id, not the classes — the classes are the thing under
  // test and the extractor must not stop working the moment they are wrong.
  const at = html.indexOf('id="t7-cal-form-grid"');
  if (at < 0) throw new Error('adjustment row not found — has the id changed?');
  const start = html.lastIndexOf('<div', at);
  // Walk to the matching close tag.
  let i = start, depth = 0;
  const re = /<\/?div\b/g;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(html))) {
    if (m[0] === '<div') depth++; else depth--;
    if (depth === 0) { i = html.indexOf('>', m.index) + 1; break; }
  }
  const row = html.slice(start, i);
  // …plus the button, which is a sibling inside the same row.
  return row;
}

(async () => {
  const html = fs.readFileSync(SRC, 'utf8');
  const row = extractRow(html);

  console.log('\nThe row markup, as it ships');
  check('it is a wrapping flex row, not a fixed grid',
        /class="flex flex-wrap gap-3 items-end pt-2"/.test(row), true);
  check('no fixed grid-cols track list survives anywhere in it',
        /grid-cols-\[/.test(row), false);
  check('the button cannot be squeezed',
        /id="t7-cal-save-btn"[^>]*class="[^"]*shrink-0[^"]*whitespace-nowrap/.test(row), true);
  check('every field carries a min width so it stays readable',
        (row.match(/min-w-\[\d+px\]/g) || []).length, 5);
  check('and a max width so none of them hogs the row',
        (row.match(/max-w-\[\d+px\]/g) || []).length >= 3, true);

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><style>${SHIM}</style></head>
    <body><div id="card">${row}</div></body></html>`);

  console.log('\nNothing hangs out of the card, at any width');
  // 930 is the card in the screenshot; the rest bracket phone to desktop.
  for (const w of [1440, 1280, 1100, 930, 820, 700, 560, 380]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(() => { document.body.offsetHeight; });
    const bad = await page.evaluate(() => {
      const card = document.getElementById('card');
      const inner = card.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(card).paddingRight) || 0;
      const limit = inner.right - pad + 0.5;      // half a pixel for rounding
      const over = [];
      card.querySelectorAll('#t7-cal-form-grid > *').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > limit) {
          over.push({ el: el.id || el.tagName.toLowerCase(), by: Math.round(r.right - limit) });
        }
      });
      return over;
    });
    check(`nothing overflows at ${w}px`, bad, []);
  }

  console.log('\nThe row still reads left to right in the order it is keyed');
  await page.setViewportSize({ width: 1280, height: 900 });
  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#t7-cal-form-grid > *'))
      .map(el => (el.querySelector('label')?.textContent || el.id || '').trim()));
  check('Date, Qty, Report, Plot, Reason, then the button',
        order, ['Date', 'Adjustment Qty (+/-)', 'Report', 'Plot / Tray',
                'Reason (required)', 't7-cal-save-btn']);

  console.log('\nThe Reason label is not clipped');
  const clipped = await page.evaluate(() => {
    const l = Array.from(document.querySelectorAll('#t7-cal-form-grid label'))
                   .find(x => /Reason/.test(x.textContent));
    return l.scrollWidth > l.clientWidth + 1;
  });
  check('"(required)" fits in the space it has', clipped, false);

  console.log('\nOn a narrow screen it wraps rather than overflowing');
  await page.setViewportSize({ width: 560, height: 900 });
  const rows = await page.evaluate(() => {
    const tops = new Set();
    document.querySelectorAll('#t7-cal-form-grid > *')
            .forEach(el => tops.add(Math.round(el.getBoundingClientRect().top)));
    return tops.size;
  });
  check('the fields spill onto more than one line', rows > 1, true);

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
