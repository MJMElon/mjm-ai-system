/* THE PLATE IS THE MODULE. THE MARK ON IT IS THE PAGE.

   The office had the PALMS board open and said it twice, over a crop of the
   badge and then over the tab itself: 删掉, then icon改掉. What they were
   looking at was a teal square reading **NO** -- the nursery-operations
   initials, the house favicon pattern every module wears (AI, NL, FC, SL,
   NP, SI) -- in two places at once: the browser tab, and again in the right
   cell of the page's own ribbon.

   A leaf had already gone onto nursery_ops_maintenance.html that morning, so
   the module was wearing TWO marks: a leaf on one tab and NO on the other
   nine. That is the fault worth a test rather than the wording -- a mark
   that is half changed stops the set reading as one system, which is the
   whole value of having one.

   SO THE FIRST VERSION OF THIS FILE ASKED FOR TEN IDENTICAL ICONS, and the
   office then asked for the PALMS one specifically: "PALMS 的icon我要一个
   地图板块感 里面有蓝黄红绿板块" -- a map of parcels, blue, yellow, red and
   green. They are the ones who read these tabs; that is their call to make,
   and it is a better rule than the one it replaces:

     * the PLATE -- the house rounded square in #1b4332 -- is the module, and
       every page in the set still carries it, so the set still reads as one
       system;
     * the MARK on it is the page, and only where the office has asked for
       one. The three pages whose own name begins PALMS wear the plot map;
       the other seven wear the module's leaf.

   Named by FILENAME rather than by a list somebody maintains, so a PALMS
   page written next year arrives wearing the right mark. Life of Plot is
   deliberately not in it: it reads the same plot log, but it is not a PALMS
   screen and the office did not name it.

   Neither mark is restated here -- both are lifted out of the shipped pages
   and compared against themselves, because a data URI typed into a test is a
   second copy of the thing under test.

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
  console.log('\n1. Every page in the module declares exactly one tab icon');
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

  /* THE PLATE IS WHAT KEEPS THE SET ONE SET. Whatever a page draws on it,
     the icon is still the house rounded square in the module's green — so
     an icon invented from scratch fails here even if it is pretty. */
  const noPlate = PAGES.filter(f => !/rx='14' fill='%231b4332'/.test(icons[f][0] || ''));
  check('every one of them is the house plate', noPlate, []);

  console.log('\n2. A page the office has named wears its own mark; the rest wear the leaf');
  /* THE GROUPS, and there is deliberately no fourth. A page gets a mark of
     its own because the office asked for one, never because somebody drawing
     an icon felt like it — so an eleventh page arriving with a bespoke icon
     fails here until that decision is made and written down. PALMS is matched
     by FILENAME, so a PALMS page written next year arrives in the right
     group without anybody adding it to a list. */
  const GROUPS = [
    ['PALMS',       (f) => /^nursery_ops_palms_/.test(f)],
    ['Maintenance', (f) => f === 'nursery_ops_maintenance.html'],
  ];
  const named = new Set(PAGES.filter(f => GROUPS.some(g => g[1](f))));
  const REST  = PAGES.filter(f => !named.has(f));
  check('every page lands in exactly one group',
        [named.size > 0, REST.length > 0], [true, true]);

  function oneMark(label, list) {
    const distinct = [...new Set(list.map(f => icons[f][0]))];
    check(label + ': one mark across them', distinct.length, 1);
    if (distinct.length > 1) {
      const by = {};
      distinct.forEach((d, i) => { by['icon ' + (i + 1)] = list.filter(f => icons[f][0] === d); });
      console.log('       ' + JSON.stringify(by));
    }
    return distinct[0] || '';
  }
  const MAP  = oneMark('PALMS', PAGES.filter(GROUPS[0][1]));
  const SPAN = oneMark('Maintenance', PAGES.filter(GROUPS[1][1]));
  const LEAF = oneMark('the rest', REST);

  /* A named page sharing the module's leaf is a mark nobody decided, and two
     named pages sharing one is the same fault the other way round. */
  check('…and no two groups wear the same mark',
        new Set([MAP, SPAN, LEAF]).size, 3);

  /* THE RING IS THE OFFICE'S OWN DRAWING, handed over as a picture once
     "整体形状要和bnn boundry一样" turned out not to be readable from here —
     shared_plots.map_top is in a database this environment cannot reach. So
     the mark is their picture and not an invention: ten plot segments round a
     centre, clockwise from the top, two blue, one red, three green, four
     yellow. Their numbers are the specification, the same way the papan tanda
     the office drew is the specification for that board.

     Asked as the COUNT PER COLOUR rather than as a list of ten, because what
     the picture says is how much of the ring each stage holds — a segment
     moved one place round is the same drawing, a colour that lost a segment
     is not. */
  const seg = [...MAP.matchAll(/%3Cpath d='M[^']*A[^']*A[^']*Z' fill='(%23[0-9a-f]{6})'/g)]
    .map(m => m[1]);
  const tally = {};
  seg.forEach((c) => { tally[c] = (tally[c] || 0) + 1; });
  check('the mark is a ring of ten plot segments', seg.length, 10);
  check('…two blue, one red, three green, four yellow',
        tally, { '%233b82f6': 2, '%23ef4444': 1, '%2322c55e': 3, '%23f5b324': 4 });
  /* 蓝黄红绿, in the office's own order round the ring. */
  check('…laid out clockwise from the top as the office drew it',
        seg.join(' ').replace(/%23/g, ''),
        '3b82f6 3b82f6 ef4444 22c55e 22c55e 22c55e f5b324 f5b324 f5b324 f5b324');
  checkTrue('…and it is a map and not the leaf', !/M20 44C20 26/.test(MAP));

  /* 不规则形状的 — IRREGULAR, which is the whole difference between a plot map
     and an app-launcher grid of four squares. A rect cannot be irregular, and
     the first version of this mark was four of them; every parcel is drawn as
     an arc now, so nothing on the plate is square to the page. */
  check('nothing on the plate but the plate itself is a rectangle',
        MAP.indexOf('%3Crect x=') >= 0, false);
  /* A RING AND NOT A PIE: the segments stand off a centre, which is what the
     office drew and what makes it read as plots round a nursery rather than
     as a chart. Each one is bounded by TWO arcs — the outer edge and the
     inner — so a pie slice, which has one, fails here. */
  const twoArcs = seg.length > 0 &&
    [...MAP.matchAll(/d='(M[^']*Z)' fill='%23/g)].every((m) => (m[1].match(/A/g) || []).length === 2);
  checkTrue('…standing off a centre, so it is a ring and not a pie', twoArcs);

  checkTrue('the leaf is the leaf, and not the NO square',
            /M20 44C20 26/.test(LEAF) && !/>NO<\/text>/.test(LEAF));
  checkTrue('…drawn in the house green', /%231b4332/.test(LEAF) && /%23d8f3dc/.test(LEAF));

  console.log('\n3. The NO badge is off every ribbon');
  const left = PAGES.filter(f => />NO<\/div>/.test(stripComments(fs.readFileSync(path.join(DIR, f), 'utf8'))));
  check('no page draws it any more', left, []);

  console.log('\n4. The ribbon still reads as a ribbon, with the name centred');
  /* The right cell is what the module name is centred against. Deleting the
     LEFT one would make the name the first grid item and slide it left --
     which is the fault audit_admin.html keeps a .fcr-spacer for -- so this is
     asked of the rendered box rather than of the markup. */
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch (e) { console.log('  (playwright not available — section 4 skipped)'); chromium = null; }

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
