/* Nelos card on the portal home — it must wear the Nelos pink, not the
   old purple. The card's whole look (corner brackets, the tag under the
   name, the hover border, both glows and the icon tile) is driven by
   four CSS variables on the <a>, so this reads them back from the live
   page rather than from the file, and checks the icon's own colours too.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/nelos_card_colour.cjs
   with `python3 -m http.server 8777` serving the repository root. */
const { chromium } = require('playwright');

const BRAND = 'rgb(239, 199, 226)';   // #efc7e2
const TINT  = '#f8e2f1';
const SOFT  = '#f2cfe7';

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = String(got).toLowerCase() === String(want).toLowerCase();
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + got + '\n         want ' + want); }
}
function checkNot(name, got, banned) {
  const bad = String(got).toLowerCase().includes(String(banned).toLowerCase());
  if (!bad) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + ' — still contains ' + banned + ': ' + got); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  page.on('pageerror', () => {});                 // the portal wants Supabase; the card is static
  await page.goto('http://localhost:8777/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('a[data-card="nelos"]', { state: 'attached', timeout: 10000 });

  /* The portal hides the module grid until somebody is signed in, and this
     harness is not. The card is in the page with all its styling; reveal it
     and its ancestors so the colours can be read and photographed. */
  await page.evaluate(() => {
    let n = document.querySelector('a[data-card="nelos"]');
    while (n && n !== document.documentElement) {
      n.style.setProperty('display', n.tagName === 'A' ? 'flex' : 'block', 'important');
      n.style.setProperty('visibility', 'visible', 'important');
      n.style.setProperty('opacity', '1', 'important');
      n.classList.remove('hidden');
      n = n.parentElement;
    }
  });
  await page.waitForSelector('a[data-card="nelos"]', { timeout: 5000 });

  const card = await page.evaluate(() => {
    const a = document.querySelector('a[data-card="nelos"]');
    const cs = getComputedStyle(a);
    const v  = n => cs.getPropertyValue(n).trim();
    const tag = a.querySelector('.module-tag');
    const brackets = Array.from(a.querySelectorAll('.card-corner'));
    return {
      accent:     v('--accent'),
      glow:       v('--glow'),
      glowStrong: v('--glow-strong'),
      iconBg:     v('--icon-bg'),
      tagColour:  getComputedStyle(tag).color,
      bracket:    getComputedStyle(brackets[0]).borderTopColor,
      iconBorder: getComputedStyle(a.querySelector('.module-icon-wrap')).borderTopColor,
      svg:        a.querySelector('svg').outerHTML,
      href:       a.getAttribute('href'),
      name:       a.querySelector('.module-name').innerHTML.replace(/<br\s*\/?>/gi, ' ')
                           .replace(/\s+/g, ' ').trim()
    };
  });

  console.log('\nThe card');
  check('it is still the Nursery Case Log card', card.name, 'Nursery Case Log');
  check('it still opens the Nelos dashboard', card.href, 'nelos/nelos_dashboard.html');
  check('--accent is the Nelos brand pink', card.accent, '#efc7e2');
  check('--glow is the brand at .25', card.glow, 'rgba(239,199,226,.25)');
  check('--glow-strong is the brand at .35', card.glowStrong, 'rgba(239,199,226,.35)');
  check('--icon-bg is the brand at .12', card.iconBg, 'rgba(239,199,226,.12)');

  console.log('\nWhat the variables actually paint');
  check('the corner brackets come out pink', card.bracket, BRAND);
  check('the icon tile border comes out pink', card.iconBorder, BRAND);
  // .module-tag is var(--accent) at opacity .7 — the colour itself is the brand
  check('the nelos_ tag under the name is pink', card.tagColour, BRAND);

  console.log('\nThe clipboard icon');
  check('its outline is the brand', /stroke="(#efc7e2)"/i.test(card.svg), true);
  check('its clip is the brand', /fill="#efc7e2"/i.test(card.svg), true);
  check('its fill is the brand at .18', /fill="rgba\(239,199,226,\.18\)"/i.test(card.svg), true);
  check('the tick uses the lighter tint', card.svg.toLowerCase().includes(TINT), true);
  check('the bottom rule uses the soft step', card.svg.toLowerCase().includes(SOFT), true);

  console.log('\nNo purple left on this card');
  checkNot('no #a855f7 in the icon', card.svg, 'a855f7');
  checkNot('no #d8b4fe in the icon', card.svg, 'd8b4fe');
  checkNot('no #c084fc in the icon', card.svg, 'c084fc');
  checkNot('no 168,85,247 in the icon', card.svg, '168,85,247');
  checkNot('no 168,85,247 in the glows', card.glow + card.glowStrong + card.iconBg, '168,85,247');

  console.log('\nThe neighbouring cards are untouched');
  const others = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a.module-card'))
      .filter(a => a.dataset.card !== 'nelos')
      .map(a => getComputedStyle(a).getPropertyValue('--accent').trim()));
  check('no other card was repainted pink', others.includes('#efc7e2'), false);
  check('the other cards still have their own accents', others.length > 0, true);

  await page.locator('a[data-card="nelos"]').scrollIntoViewIfNeeded();
  await page.locator('a[data-card="nelos"]').screenshot({ path: '/tmp/nelos_card.png' });
  await page.locator('a[data-card="nelos"]').hover();
  await page.waitForTimeout(500);
  await page.locator('a[data-card="nelos"]').screenshot({ path: '/tmp/nelos_card_hover.png' });

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
