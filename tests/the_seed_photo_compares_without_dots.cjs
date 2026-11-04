/* THE SEED PHOTO CAN BE SEEN WITHOUT THE AI DOTS.

   A red dot sits on the seed it counted, so the dotted picture hides the one
   thing somebody checking the count needs: is there a seed under the dot,
   and a seed with no dot. The full-size view carries a Hide AI dots button
   that swaps to the clean frame (sourceBase64 / SrcUrl) and back.

   Lifts the real lightbox out of the shipped page and drives it in Chromium.
   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_seed_photo_compares_without_dots.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_batch_detail.html'), 'utf8');
const from = SRC.indexOf('function viewBagPhoto(');
const to = SRC.indexOf('function deleteBagPhoto(');
if (from < 0 || to < 0) { console.log('FAIL  could not find the lightbox in the page'); process.exit(1); }
const code = SRC.slice(from, to);

let failed = 0;
const ok = (c, m) => { if (c) console.log('pass  ' + m); else { console.log('FAIL  ' + m); failed++; } };
const px = (c) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="${c}"/></svg>`);
const DOTTED = px('red'), CLEAN = px('green');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: `const seedAuditPhotoState = {
      a: { photoUrl: ${JSON.stringify(DOTTED)}, sourceUrl: ${JSON.stringify(CLEAN)} },
      old: { photoUrl: ${JSON.stringify(DOTTED)} } };\n` + code + `\nwindow.viewBagPhoto = viewBagPhoto;` });

  const state = () => page.evaluate(() => {
    const lb = document.getElementById('seed-photo-lightbox');
    const b = lb && lb.querySelector('.seed-lb-compare');
    return { img: lb && lb.querySelector('img').getAttribute('src'),
             btn: b && b.style.display !== 'none' ? b.textContent : null,
             cap: lb && lb.querySelector('.seed-lb-cap') ? lb.querySelector('.seed-lb-cap').textContent : '' };
  });

  await page.evaluate(() => viewBagPhoto('a'));
  let s = await state();
  ok(s.img === DOTTED, 'it opens on the dotted picture the AI counted');
  ok(s.btn === 'Hide AI dots', 'a Hide AI dots button is offered');

  await page.click('.seed-lb-compare');
  s = await state();
  ok(s.img === CLEAN, 'pressing it shows the clean photo with no dots');
  ok(s.btn === 'Show AI dots' && /hidden/i.test(s.cap), 'the button and caption say the dots are hidden');
  ok(await page.isVisible('#seed-photo-lightbox'), 'pressing it does not close the view');

  await page.click('.seed-lb-compare');
  s = await state();
  ok(s.img === DOTTED && s.btn === 'Hide AI dots', 'pressing again puts the dots back');

  await page.click('.seed-lb-compare');
  await page.keyboard.press('Escape');
  await page.evaluate(() => viewBagPhoto('a'));
  s = await state();
  ok(s.img === DOTTED, 'reopened, it starts on the dotted picture again');

  await page.evaluate(() => viewBagPhoto('old'));
  s = await state();
  ok(s.img === DOTTED && s.btn === null, 'a row with no clean frame offers no button');

  await browser.close();
  console.log(failed ? `\n${failed} failure(s)` : '\nall good');
  process.exit(failed ? 1 : 0);
})();
