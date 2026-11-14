// Seedling Stock Management (operation/) and the Nursery Reporting System
// (reporting/, npayroll/) read on a phone, a tablet and a desk.
//
// shared/shared_responsive.css is the phone baseline both modules link. This
// test holds three things:
//   1. every page of both modules has the viewport tag and links the file
//      with a ?v=, and no page links it twice;
//   2. the file's rules do what they say in a REAL browser, with a stand-in
//      for Tailwind's grid-cols-N appended AFTER it, the way the CDN appends
//      its sheet. A rule that only wins when it loads last is the trap
//      operation_batch_detail.html already documents.
//   3. the page-specific fixes are in place: the Stock & Sales tabs stack,
//      the header triads and the label/value trio keep their columns, and
//      each page carries its own floor for the small type it sets itself.
//
// Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_two_modules_fit_a_phone.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, got) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (got !== undefined ? '  -> got ' + JSON.stringify(got) : '')); } };

const PAGES = [
  ...fs.readdirSync(path.join(ROOT, 'operation')).filter(f => f.endsWith('.html')).map(f => 'operation/' + f),
  ...fs.readdirSync(path.join(ROOT, 'reporting')).filter(f => f.endsWith('.html')).map(f => 'reporting/' + f),
  'npayroll/npayroll_dashboard.html',
];

console.log('\n1. every page has the viewport and the stylesheet');
for (const p of PAGES) {
  const s = read(p);
  const head = s.slice(0, s.search(/<\/head>/i));
  ok(/<meta[^>]+name="viewport"[^>]+width=device-width/.test(head), p + ' has the viewport tag');
  const links = head.match(/<link[^>]+shared\/shared_responsive\.css\?v=[0-9a-z]+/g) || [];
  ok(links.length === 1, p + ' links shared_responsive.css once, with a ?v=', links.length);
}

console.log('\n2. the rules, in a real browser');
const CSS = read('shared/shared_responsive.css');
// What the CDN would append after the page: one class each, same weight as Tailwind.
const TAILWIND_AFTER = `
  .grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
  .grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .grid-cols-12{grid-template-columns:repeat(12,minmax(0,1fr))}
  .col-span-2{grid-column:span 2/span 2}
  .text-\\[9px\\]{font-size:9px}.h-8{height:2rem}
  @media (min-width:768px){.md\\:grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}}`;
const FIXTURE = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}</style><style>${TAILWIND_AFTER}</style></head><body style="margin:0">
<div id="g3" class="grid grid-cols-3"><div>a</div><div>b</div><div class="col-span-2">c</div></div>
<div id="g2md" class="grid grid-cols-2 md:grid-cols-3"><div>a</div><div>b</div></div>
<div id="keep" class="grid grid-cols-3 keep-cols"><div>a</div><div>b</div><div>c</div></div>
<div id="g12" class="grid grid-cols-12"><div>a</div></div>
<span id="tiny" class="text-[9px]">label</span>
<img id="wide" width="1200" height="600" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='600'/%3E">
<img id="logo" class="h-8" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'/%3E">
<input id="box" type="text"><button id="btn" style="padding:0">x</button>
</body></html>`;

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('  playwright missing: ' + e.message); process.exit(1); }
  const browser = await chromium.launch();
  const at = async (w) => {
    const page = await browser.newPage({ viewport: { width: w, height: 800 } });
    await page.setContent(FIXTURE);
    const r = await page.evaluate(() => {
      const cols = id => getComputedStyle(document.getElementById(id)).gridTemplateColumns.split(' ').length;
      const box = id => document.getElementById(id).getBoundingClientRect();
      return {
        g3: cols('g3'), g2md: cols('g2md'), keep: cols('keep'), g12: cols('g12'),
        tiny: parseFloat(getComputedStyle(document.getElementById('tiny')).fontSize),
        wideW: box('wide').width, wideH: box('wide').height, logoH: box('logo').height,
        boxFont: parseFloat(getComputedStyle(document.getElementById('box')).fontSize),
        btnH: box('btn').height, sw: document.documentElement.scrollWidth,
      };
    });
    await page.close();
    return r;
  };

  const phone = await at(390);
  ok(phone.g3 === 1, 'phone: a grid-cols-3 section stacks to one column', phone.g3);
  ok(phone.g2md === 1, 'phone: a grid-cols-2 md:grid-cols-3 section stacks too', phone.g2md);
  ok(phone.keep === 3, 'phone: .keep-cols keeps its three columns', phone.keep);
  ok(phone.g12 === 12, 'phone: the 12-column bar chart keeps its bars', phone.g12);
  ok(phone.tiny >= 11, 'phone: 9px label type is raised to at least 11px', phone.tiny);
  ok(phone.wideW <= 390 && Math.abs(phone.wideH / phone.wideW - 0.5) < 0.01, 'phone: a 1200px picture scales to the screen and keeps its shape', [phone.wideW, phone.wideH]);
  ok(Math.round(phone.logoH) === 32, 'phone: a class height on a logo still wins over height:auto', phone.logoH);
  ok(phone.boxFont === 16, 'phone: a text box is 16px, so iOS does not zoom on focus', phone.boxFont);
  ok(phone.btnH >= 36, 'phone: a button is at least 36px tall', phone.btnH);
  ok(phone.sw <= 390, 'phone: nothing runs off the screen', phone.sw);

  const desk = await at(1280);
  ok(desk.g3 === 3, 'desk: grid-cols-3 is three columns, untouched', desk.g3);
  ok(desk.g2md === 3, 'desk: md:grid-cols-3 is three columns', desk.g2md);
  ok(desk.tiny === 9, 'desk: label type is left as designed', desk.tiny);
  ok(desk.btnH < 36, 'desk: buttons keep their own size', desk.btnH);

  const tablet = await at(768);
  ok(tablet.g3 === 3, 'tablet (768px): the desktop columns come back', tablet.g3);
  await browser.close();

  console.log('\n3. the page fixes');
  const ss = read('operation/operation_stock_sales.html');
  ok(/@media \(max-width:767\.98px\)\{\s*\.ssm-tabs\{flex-direction:column/.test(ss), 'Stock & Sales: the three tabs stack below 768px');
  ok(/px-5 py-3 flex flex-wrap gap-2 justify-between/.test(ss), 'Stock & Sales: the header row wraps rather than running off');
  for (const p of ['operation/operation_audit_trail.html', 'operation/operation_user_access.html'])
    ok(/grid grid-cols-3 keep-cols items-center sticky/.test(read(p)), p + ': the back · title · spacer header keeps its columns');
  ok(/grid grid-cols-3 keep-cols gap-x-4 gap-y-1 items-baseline text-center/.test(read('operation/operation_batch_detail.html')),
     'batch detail: the Plot / Balance / Total Transferred labels stay over their figures');
  ok(/id="mlk-months" class="grid grid-cols-2 keep-cols/.test(read('operation/operation_settings.html')), 'settings: the month lock tiles stay two across');

  // Every px font-size under 11 a page sets in its own CSS has a phone floor.
  // A page that adds a 9px rule later without one is what this catches.
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const SKIP = /invmap|heat-cell|@|keyframes|mon-dash-month|print/;
  const check = (p, css) => {
    const parts = strip(css).split(/@media \(max-width:767\.98px\)\{/);
    const before = parts[0], floor = parts.slice(1).join('');
    const missing = [];
    for (const m of before.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const f = /font-size\s*:\s*(\d+(?:\.\d+)?)px/.exec(m[2]); if (!f) continue;
      const v = +f[1]; if (v < 7 || v >= 11) continue;
      const sel = m[1].split(/\s+/).join(' ').trim();
      if (!sel || SKIP.test(sel) || /^(from|to|\d)/.test(sel)) continue;
      for (const one of sel.split(',').map(x => x.trim())) if (one && !floor.includes(one)) missing.push(one);
    }
    ok(missing.length === 0, p + ': every small-type rule has a phone floor', missing.slice(0, 5));
  };
  for (const p of PAGES) {
    const s = read(p);
    const blocks = [...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).filter(b => /font-size\s*:\s*(?:[7-9]|10)(?:\.\d+)?px/.test(b));
    blocks.forEach(b => check(p, b));
  }
  check('npayroll/npayroll_styles.css', read('npayroll/npayroll_styles.css'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
