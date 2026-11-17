/* ONE MODULE, ONE MARK IN THE BROWSER TAB.

   The office had the PALMS board open and said it twice, over a crop of the
   badge and then over the tab itself: 删掉, then icon改掉. What they were
   looking at was a teal square reading **NO** -- the nursery-operations
   initials, the house favicon pattern every module wears (AI, NL, FC, SL,
   NP, SI) -- in two places at once: the browser tab, and again in the right
   cell of the page's own ribbon.

   A leaf had already gone onto nursery_ops_maintenance.html that morning, so
   the module was wearing TWO marks: a leaf on one tab and NO on the other
   nine. That is the fault worth a test rather than the wording -- a mark
   that is the module's identity cannot be half changed, because the whole
   value of it is that every tab in the set looks like the same system.

   So: every nursery_ops page carries the SAME leaf, byte for byte, and the
   NO badge is gone from every ribbon. The leaf is not restated here -- it is
   lifted out of the shipped pages and compared against itself, because a data
   URI typed into a test is a second copy of the thing under test.

   Run: NODE_PATH=/opt/node22/lib/node_modules \
        node tests/the_nursery_module_wears_one_mark.cjs
   SHOT=/tmp/x.png draws the ribbon as the office sees it.             */
const fs   = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const DIR  = path.join(ROOT, 'nursery_ops');
const PORT = 8795;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

/* The page explains in prose why there is no badge on the right any more, so
   a plain search for the word reads the explanation as the badge. Same trap
   this codebase has met five times. */
function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, ' ')
             .replace(/\/\*[\s\S]*?\*\//g, ' ')
             .replace(/(^|[\s;{}()])\/\/[^\n]*/g, '$1 ');
}

const PAGES = fs.readdirSync(DIR).filter(f => f.endsWith('.html')).sort();

(async () => {
  console.log('\n1. Every page in the module carries the same tab icon');
  check('there are pages to check', PAGES.length > 0, true);

  const icons = {};
  for (const f of PAGES) {
    const m = fs.readFileSync(path.join(DIR, f), 'utf8').match(/<link rel="icon"[^>]*>/g) || [];
    icons[f] = m.map(s => s.trim());
  }
  const noIcon = PAGES.filter(f => icons[f].length === 0);
  check('every page declares one', noIcon, []);
  const twoIcons = PAGES.filter(f => icons[f].length > 1);
  /* Two <link rel="icon"> in one head is how a page comes to show whichever
     the browser picked, which is not a decision anybody made. */
  check('…and only one', twoIcons, []);

  const distinct = [...new Set(PAGES.flatMap(f => icons[f]))];
  check('…and it is the SAME one on all of them', distinct.length, 1);
  if (distinct.length > 1) {
    const by = {};
    distinct.forEach((d, i) => { by['icon ' + (i + 1)] = PAGES.filter(f => icons[f][0] === d); });
    console.log('       ' + JSON.stringify(by));
  }

  const ICON = distinct[0] || '';
  checkTrue('it is a leaf and not the NO square', /M20 44C20 26/.test(ICON) && !/>NO<\/text>/.test(ICON));
  checkTrue('…drawn in the house green', /%231b4332/.test(ICON) && /%23d8f3dc/.test(ICON));

  console.log('\n2. The NO badge is off every ribbon');
  const left = PAGES.filter(f => />NO<\/div>/.test(stripComments(fs.readFileSync(path.join(DIR, f), 'utf8'))));
  check('no page draws it any more', left, []);

  console.log('\n3. The ribbon still reads as a ribbon, with the name centred');
  /* The right cell is what the module name is centred against. Deleting the
     LEFT one would make the name the first grid item and slide it left --
     which is the fault audit_admin.html keeps a .fcr-spacer for -- so this is
     asked of the rendered box rather than of the markup. */
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch (e) { console.log('  (playwright not available — section 3 skipped)'); chromium = null; }

  if (chromium) {
    const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
    const server = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
      res.end(fs.readFileSync(f));
    });
    await new Promise(r => server.listen(PORT, r));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 420 } });
    await page.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

    /* TAILWIND COMES FROM A CDN THE HARNESS CANNOT REACH, which this
       codebase has been caught by before: without it the ribbon is a plain
       block, the name sits hard left, and a centring check fails over
       nothing. So the three declarations the ribbon's classes stand for are
       served in its place, written out exactly as nursery_ops_maintenance
       .html -- which loads no Tailwind -- has them inline. That page is the
       control: it is measured here too, with no stand-in at all. */
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({
      status: 200, contentType: 'application/javascript',
      body: `document.addEventListener('DOMContentLoaded',function(){
        var s=document.createElement('style');
        s.textContent='#mjm-ribbon{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:16px 24px;}'
          + '#mjm-ribbon .justify-self-start{justify-self:start}'
          + '#mjm-ribbon .justify-self-center{justify-self:center}'
          + '#mjm-ribbon .justify-self-end{justify-self:end}';
        document.head.appendChild(s);
      });`
    }));

    for (const f of ['nursery_ops_palms_board.html', 'nursery_ops_maintenance.html']) {
      await page.goto(`http://localhost:${PORT}/nursery_ops/${f}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const bar = document.getElementById('mjm-ribbon');
        if (!bar) return 'no ribbon';
        const name = bar.querySelector('span');
        const back = bar.querySelector('a');
        if (!name || !back) return 'ribbon is missing a part';
        const b = bar.getBoundingClientRect(), n = name.getBoundingClientRect();
        return {
          off: Math.round(Math.abs((n.left + n.right) / 2 - (b.left + b.right) / 2)),
          back: Math.round(back.getBoundingClientRect().left - b.left),
          no: /\bNO\b/.test(bar.innerText || '')
        };
      });
      if (typeof r === 'string') { check(f + ': the ribbon drew', r, 'a ribbon'); continue; }
      checkTrue(f + ': the module name is still on the centre line', r.off <= 2);
      checkTrue('…the Back pill is still on the left', r.back >= 0 && r.back < 60);
      check('…and nothing on it says NO', r.no, false);
    }

    if (process.env.SHOT) {
      await page.goto(`http://localhost:${PORT}/nursery_ops/nursery_ops_palms_board.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      await page.locator('#mjm-ribbon').screenshot({ path: process.env.SHOT });
      console.log('\n  shot: ' + process.env.SHOT);
    }
    await browser.close();
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
