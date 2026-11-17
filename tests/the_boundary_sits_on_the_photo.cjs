/* THE OVERLAY IS PINNED TO A WRAPPER, SO THE WRAPPER HAS TO BE THE PHOTO.

   The office opened B11 on the PALMS board and said four words:
   PALMS的地图跑掉了 — the map has run off. The blue boundary sat up in the
   trees, well above the plot it is drawn round.

   Every one of these maps is built the same way, and it is the only way the
   percentages in shared_plots.map_top can be drawn at all:

       .wrap   position:relative, SHRINKS TO THE PHOTO
         img   the nursery photo, at its own aspect
         svg   position:absolute; inset:0 — a 0..100 box over the wrapper

   So the whole thing rests on one fact: the wrapper box IS the photo box.
   It stops being true the moment the photo is capped with a PERCENTAGE
   height, because a percentage height against a parent whose own height is
   AUTO resolves to none (CSS 2.1 §10.7) — the photo then renders at its
   natural size and overflows, while the wrapper stays clamped by whatever
   clamps it and takes the overlay down with it.

   Measured on the shipped modal before the fix, 1600x900 photo in a 920x396
   panel: photo 509px tall, overlay 380. Every polygon was therefore drawn at
   75% of its height — about an eighth of the nursery too high — and the
   photo's bottom eighth was quietly clipped. The one shape that was right is
   a photo WIDER than the frame, where max-width binds first.

   So this does not read the CSS and argue about it. It puts five photo
   shapes through the REAL screens and compares the two boxes.

   Run: NODE_PATH=/opt/node22/lib/node_modules \
        node tests/the_boundary_sits_on_the_photo.cjs
   with nothing else needed — it serves the repository itself.           */
const fs   = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = 8794;
const PAGE = '/nursery_ops/nursery_ops_palms_board.html';

/* Landscape, portrait, a letterbox, a square, and a big landscape. The
   letterbox is in on purpose: it is the ONE shape the broken modal got
   right, so a fixture of only that would have passed over all of this. */
const SHAPES = [[1600, 900], [900, 1600], [1600, 400], [800, 800], [4000, 2250]];

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

/* A canvas of the wanted shape, as a data URI — no file to serve, no decode
   surprise, and the photo's own aspect is the whole variable under test. */
const MAKE_IMG = (w, h) => `(() => {
  const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h};
  const x = c.getContext('2d'); x.fillStyle = '#2d6a4f'; x.fillRect(0, 0, ${w}, ${h});
  return c.toDataURL();
})()`;

const SETTLE = `await new Promise(r => { if (img.complete && img.naturalWidth) r(); else { img.onload = r; setTimeout(r, 3000); } });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`;

const BOXES = `const i = img.getBoundingClientRect(), v = svg.getBoundingClientRect();
  return { imgW: Math.round(i.width), imgH: Math.round(i.height),
           svgW: Math.round(v.width), svgH: Math.round(v.height),
           dx: Math.round(v.left - i.left), dy: Math.round(v.top - i.top),
           dw: Math.round(v.width - i.width), dh: Math.round(v.height - i.height),
           spill: Math.round(Math.max(0, i.height - box.height, i.width - box.width)) };`;

(async () => {
  let chromium;
  try { chromium = require('playwright').chromium; }
  catch (e) { console.log('playwright is not available — nothing can be measured'); process.exit(1); }

  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(PORT, r));

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => { if (!/MJM|supabase/i.test(String(e))) console.log('  [page error] ' + e); });
  await page.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(`http://localhost:${PORT}${PAGE}`, { waitUntil: 'domcontentloaded' });

  /* TAILWIND COMES FROM A CDN THE HARNESS CANNOT REACH, and the board map's
     wrapper is `class="relative inline-block"` — two Tailwind classes. Without
     them the wrapper is a full-width block and the overlay spans the column,
     which reads as this very fault and is not. The two declarations they
     stand for are served in their place. The modal and the editor are styled
     by the page's and the module's OWN <style>, so they need none of it. */
  await page.addStyleTag({ content: '.relative{position:relative}.inline-block{display:inline-block}'
    + '.hidden{display:none}'
    /* Tailwind's preflight, which is the only thing keeping the board map's
       photo inside its column. Left out, the spill line below reports a
       640px overflow that no real browser sees. */
    + 'img{max-width:100%}' });
  await page.waitForTimeout(600);

  async function sweep(title, run) {
    console.log('\n' + title);
    for (const [w, h] of SHAPES) {
      const r = await page.evaluate(run(w, h));
      if (typeof r === 'string') { check(`${w}x${h}: it drew`, r, 'a photo and an overlay'); continue; }
      const tag = `${w}x${h} → photo ${r.imgW}x${r.imgH}, overlay ${r.svgW}x${r.svgH}`;
      check(tag, { dx: r.dx, dy: r.dy, dw: r.dw, dh: r.dh }, { dx: 0, dy: 0, dw: 0, dh: 0 });
      if (r.spill > 1) console.log(`       (photo overflows its frame by ${r.spill}px and is clipped)`);
    }
  }

  /* ── 1. The plot modal — the screen the office was looking at ───────── */
  await sweep('1. The plot modal on the PALMS board', (w, h) => `(async () => {
    document.querySelectorAll('#main, #loading, #pv-modal').forEach(e => e.classList.remove('hidden'));
    const img = document.getElementById('pv-img'), svg = document.getElementById('pv-svg');
    if (!img || !svg) return 'no modal on the page';
    img.src = ${MAKE_IMG(w, h)};
    ${SETTLE}
    const box = document.querySelector('.pv-frame').getBoundingClientRect();
    ${BOXES}
  })()`);

  /* ── 2. The board's own map, which was never wrong ──────────────────── */
  await sweep('2. The nursery map under it (shared_plot_map.js)', (w, h) => `(async () => {
    document.querySelectorAll('#pm-probe').forEach(e => e.remove());
    const host = document.createElement('div');
    host.id = 'pm-probe'; host.style.width = '960px';
    document.body.appendChild(host);
    MJMPlotMap.create({ mount: host, statusOf: () => ({ tone: 'ok' }) });
    const img = host.querySelector('.pm-image'), svg = host.querySelector('.pm-svg');
    if (!img || !svg) return 'the map did not mount';
    img.src = ${MAKE_IMG(w, h)};
    ${SETTLE}
    const box = host.querySelector('.pm-viewport').getBoundingClientRect();
    ${BOXES}
  })()`);

  /* ── 3. The boundary EDITOR, which is the one that WRITES ───────────────
     Worth measuring above all of them: a polygon dragged over a misplaced
     overlay would be stored wrong, and no screen afterwards could tell. It
     was right before this change and the sweep is here to keep it so.

     Its photo DOES spill out of the stage on anything taller than about 4:5
     — 785px hidden on a portrait — and that is left alone deliberately: it
     is a photo you cannot scroll to the bottom of, not a boundary in the
     wrong place, the nursery aerials are landscape, and the office has not
     asked. The spill is printed so it is a known number rather than a
     surprise. */
  await sweep('3. The boundary editor (shared_plot_draw.js)', (w, h) => `(async () => {
    document.querySelectorAll('.pd-bg').forEach(e => e.remove());
    const url = ${MAKE_IMG(w, h)};
    const q = new Proxy({}, { get(_, p) {
      if (p === 'then') return (a, b) => Promise.resolve({ data: [], error: null }).then(a, b);
      return () => q; } });
    MJMPlotDraw.open({ supa: { from: () => q }, plot: 'B11', nursery: 'BNN', mapUrl: url,
                       mapTop: '[{"x":10,"y":10},{"x":60,"y":10},{"x":60,"y":60}]' });
    const img = document.querySelector('.pd-img'), svg = document.querySelector('.pd-svg');
    if (!img || !svg) return 'the editor did not open';
    if (!img.getAttribute('src')) img.src = url;
    ${SETTLE}
    const box = document.querySelector('.pd-stage').getBoundingClientRect();
    ${BOXES}
  })()`);

  /* ── 4. And no photo under an overlay is capped with a per cent ──────── */
  console.log('\n4. Every photo under an overlay is capped in real units');
  /* The browser sweeps above are the proof; this is what carries the rule to
     the two Seedling Stock maps, which are built the same way and are not
     booted here. Both already cap in px / calc — they are what the modal
     should have copied. */
  const FILES = [
    'nursery_ops/nursery_ops_palms_board.html',
    'shared/shared_plot_map.js',
    'shared/shared_plot_draw.js',
    'operation/operation_inventory_all.html',
    'operation/operation_inventory_map.html',
  ];
  const offenders = [];
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    /* A rule whose selector names an image and whose max-height is a per
       cent. The WRAPPER may carry one — it is clamped by a real frame — and
       the editor's img is the deliberate exception noted in section 3. */
    const re = /([#.][A-Za-z0-9_-]*(?:img|image)[A-Za-z0-9_-]*)\s*\{[^}]*max-height\s*:\s*100%/g;
    let m;
    while ((m = re.exec(src))) if (m[1] !== '.pd-img') offenders.push(f + '  ' + m[1]);
  }
  check('none of them is', offenders, []);

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
