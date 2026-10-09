/* TWO DROPDOWNS ON ONE ROW.
 *
 * shared_cf_select.js draws its own control beside every <select> and hides
 * the browser's own. It hid it with a CLASS. A page that colours a select by
 * state the blunt way --
 *
 *     sel.className = 'lvl-select lvl-admin';     // User Access drawer
 *     select.className = 'input-style t3-dest-plot';  // Tab 3 destination
 *
 * -- REPLACES the class list, so cf-native-hidden went with it and the native
 * dropdown came back beside the button. Module Access showed a green ADMIN
 * pill and a plain "Admin" box under it, both live, with nothing saying which
 * one the save reads.
 *
 * The hide is an inline display:none now, which a className assignment cannot
 * reach, plus an observer for a style attribute rewritten wholesale.
 *
 * Needs jsdom (no node_modules in this repository):  npm install jsdom
 */
const fs   = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  console.log('SKIP  jsdom is not installed -- run: npm install jsdom');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'shared/shared_cf_select.js'), 'utf8');

let bad = 0;
const ok   = (m) => console.log('pass  ' + m);
const fail = (m) => { bad++; console.log('FAIL  ' + m); };

/* jsdom fires DOMContentLoaded on a later tick, and a MutationObserver
   callback is a microtask, so every check waits one turn. */
const tick = () => new Promise((r) => setTimeout(r, 0));

function page(html, src) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: 'outside-only' });
  dom.window.eval(src == null ? SRC : src);
  return dom;
}

async function main() {

/* -- 1. the skin hides the native dropdown at all ------------------- */
{
  const dom = page('<select id="s"><option value="a">Admin</option><option value="n">None</option></select>');
  await tick();
  const sel = dom.window.document.getElementById('s');
  const btn = dom.window.document.querySelector('.cf-btn');
  if (!btn) fail('no button was drawn');
  else if (sel.style.display !== 'none') fail('the native select was left visible');
  else ok('the skin draws a button and hides the browsers own dropdown');
}

/* -- 2. a page writing the whole className does not bring it back ---- */
{
  const dom = page('<select id="s" class="lvl-select"><option value="admin">Admin</option></select>');
  await tick();
  const sel = dom.window.document.getElementById('s');

  sel.className = 'lvl-select lvl-admin';   // exactly what the drawer did
  await tick();

  const visible = sel.style.display !== 'none';
  const count   = dom.window.document.querySelectorAll('.cf-btn').length;
  if (visible) fail('className assignment un-hid the native select -- two dropdowns again');
  else if (count !== 1) fail(`expected one button, found ${count}`);
  else ok('a className assignment leaves one dropdown on the row, not two');

  if (!sel.classList.contains('lvl-admin')) fail('the pages own lvl- class did not survive');
  else ok('the pages own state class is still on the select for its CSS to read');

  if (!sel.classList.contains('cf-native-hidden')) fail('cf-native-hidden was not put back');
  else ok('cf-native-hidden is put back for anything keying off it');
}

/* -- 3. the style attribute rewritten wholesale ---------------------- */
{
  const dom = page('<select id="s"><option value="admin">Admin</option></select>');
  await tick();
  const sel = dom.window.document.getElementById('s');
  sel.setAttribute('style', 'color:red');
  await tick();
  if (sel.style.display !== 'none') fail('a rewritten style attribute left the native select visible');
  else ok('a rewritten style attribute does not un-hide it either');
}

/* -- 4. the old code really did fail this, so the test can tell ------ */
{
  const OLD = SRC.replace(/\n\s*if \(select\.style\.display !== 'none'\) select\.style\.display = 'none';/, '')
                 .replace(/\n\s*\/\/ And the hide has to survive[\s\S]*?attributeFilter: \['class', 'style'\] \}\);/, '');
  if (OLD === SRC) fail('could not build the previous version -- this test is no longer proving anything');
  else {
    const dom = page('<select id="s" class="lvl-select"><option value="admin">Admin</option></select>', OLD);
    await tick();
    const sel = dom.window.document.getElementById('s');
    sel.className = 'lvl-select lvl-admin';
    await tick();
    const hidden = sel.classList.contains('cf-native-hidden') || sel.style.display === 'none';
    if (hidden) fail('the previous version passed too -- the bug is not what this test says it is');
    else ok('the previous version loses the hide on the same line, which is the bug');
  }
}

/* -- 5. every page that wipes a selects className is covered --------- */
{
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === 'legacy') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(html|js)$/.test(e.name)) files.push(p);
    }
  })(ROOT);

  const wipers = files.filter((p) => {
    if (p.endsWith(path.join('shared', 'shared_cf_select.js'))) return false;
    const src = fs.readFileSync(p, 'utf8');
    return /\b(sel|select|dropdown)\w*\.className\s*=/.test(src);
  }).map((p) => path.relative(ROOT, p));

  /* Not a failure -- the shared file is what makes them safe. Printed so the
     next person sees the list here rather than on a screen in the office. */
  console.log('\npages that write a whole className onto a <select>, and are');
  console.log(`relying on the hide above to survive it: ${wipers.length}`);
  wipers.forEach((f) => console.log('   ' + f));
}

process.exit(bad ? 1 : 0);
}

main();
