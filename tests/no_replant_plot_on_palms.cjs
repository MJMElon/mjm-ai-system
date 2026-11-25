/* A -R plot is on no PALMS screen.

   The office: "plot-R 不需要出现在palms 完全不需要". A -R plot is a REPLANT
   plot, ground a 3rd-culling transfer moved seedlings onto, and PALMS has
   nothing to say about one.

   The rule is written twice — isReplantPlot in shared/shared_palms.js here,
   and in the FC Portal's src/modules/palms/data.js — so this runs BOTH
   shipped copies over the same names and compares, then drives the places
   each one guards: the office's PALMS log (every PALMS page reads it), the
   office board's map (opt-in, so Life of Plot keeps its -R plots), and the
   FC Portal's plot list, cached copy included.

   Run: node tests/no_replant_plot_on_palms.cjs
   Needs the FC-Portal checkout beside this one (../FC-Portal).          */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const ROOT = path.join(__dirname, '..');
const FC = path.join(ROOT, '..', 'FC-Portal', 'src', 'modules', 'palms');

// ── the office copy, the whole shipped file ──────────────────────────────
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'shared', 'shared_palms.js'), 'utf8'), { window: win });
const P = win.MJMPalms;

// ── the FC Portal copy ───────────────────────────────────────────────────
// isReplantPlot MOVED to src/modules/maintenance/plotBatches.js the day a
// worker boundary had to carry a plot's replant: that file imports nothing,
// where palms/data.js pulls in supabase, so it is the only place in that
// repository a plot-name rule can live without dragging a module in behind
// it. palms/data.js re-exports it, which is where the PALMS screens have
// always read it, and the sweep at the end of this file asserts it does not
// go back to keeping a copy.
const DATA = fs.readFileSync(path.join(FC, 'data.js'), 'utf8');
const PLOTB = fs.readFileSync(
  path.join(FC, '..', 'maintenance', 'plotBatches.js'), 'utf8');
const lift = (src, start, where) => {
  const a = src.indexOf(start);
  if (a < 0) throw new Error('not found: ' + start + (where ? ' in ' + where : ''));
  let depth = 0, i = src.indexOf('{', a);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(a, i + 1).replace(/^export /, '');
};
// The two consts the rule is written out of, lifted rather than restated —
// one regex answers both "is this a replant" and "whose", which is the whole
// reason they live together.
const liftLine = (src, name) => {
  const a = src.indexOf('const ' + name);
  if (a < 0) throw new Error('not found: const ' + name);
  return src.slice(a, src.indexOf('\n', a));
};
const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  liftLine(PLOTB, 'REPLANT_OF') + '\n' +
  liftLine(PLOTB, 'bareName') + '\n' +
  lift(PLOTB, 'export function isReplantPlot', 'plotBatches.js') + '\n' +
  "const NURSERIES = { BNN: { prefix: 'B', count: 3, plots: null } };\n" +
  lift(DATA, 'export function plotsOf', 'palms/data.js') +
  '\nglobalThis.R = isReplantPlot; globalThis.plotsOf = plotsOf; globalThis.N = NURSERIES;', ctx);

const NAMES = ['B4', 'B4-R', 'B4-R2', 'b4-r', 'B4-R#A', 'B4#A', 'U10', 'N1-R', 'B14', 'BR4', 'B4-RX', ' B4-R '];
const WANT  = [false, true, true, true, true, false, false, true, false, false, false, true];
check('office: which names are -R', NAMES.map(P.isReplantPlot), WANT);
check('FC Portal: the same answer for every name', NAMES.map(ctx.R), WANT);

// ── only the PALMS pages leave them out; the shared log keeps them ─────
// The office, after the first version dropped them in the shared log: "不要乱改
// 只有关系到palms而已的不用显示". Life of Plot and the payroll culling incentive
// read the same log and must go on seeing their -R plots.
const raw = P.logsFromRows([
  { plot_name: 'B4', act_n: 1, start_date: '2026-10-01' },
  { plot_name: 'B4-R', act_n: 1, start_date: '2026-10-01' },
  { plot_name: 'B4-R#A', act_n: 1, start_date: '2026-10-01' },
  { plot_name: 'U10', act_n: 9, start_date: '2026-10-02' }
]);
check('the shared log keeps -R plots, for Life of Plot and the payroll',
  Object.keys(raw).sort(), ['B4', 'B4-R', 'B4-R#A', 'U10']);
const logs = P.withoutReplant(raw);
check('withoutReplant leaves them out', Object.keys(logs).sort(), ['B4', 'U10']);
check('…without changing the log it was given', Object.keys(raw).length, 4);
check('…so a PALMS page built off it lists none', P.unitsOf(logs, 'all').sort(), ['B4', 'U10']);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
/* The Plot Motion Study was the second of these and the office took the
   whole page off -- "Plot Motion Study也不需要存在". One page is still a
   list rather than a literal, because the next PALMS page has to arrive
   into a check that already asks this of every one of them. */
const PALMS_PAGES = ['nursery_ops/nursery_ops_palms_board.html'];
PALMS_PAGES.forEach(f => {
  const src = read(f);
  const all = (src.match(/LOGS = [^;]*loadLogs\(/g) || []);
  check(f + ': every read of the log goes through withoutReplant',
    all.length > 0 && all.every(l => /withoutReplant\(await MJMPalms\.loadLogs\(/.test(l)), true);
});
check('Life of Plot is not a PALMS page and keeps its -R plots',
  /withoutReplant|isReplantPlot/.test(read('nursery_ops/nursery_ops_plot_life.html')), false);
/* The culling incentive leaves them out too -- "culling incentive也不会有r
   plot" -- and asks PALMS's own rule rather than keeping a second one. The
   rule moved into shared_cull_incentive.js when the incentive moved to Work
   Maintenance; both pages read it from there. */
const CI = read('shared/shared_cull_incentive.js');
check('the culling incentive leaves -R plots out, by PALMS\'s own rule',
  [/\.filter\(p => p\.dates\.length && !isReplant\(p\.plot\)\)/.test(CI),
   /if \(p && p\.isReplantPlot\) return p\.isReplantPlot\(plot\);/.test(CI)], [true, true]);

// ── the board map is opt-in, so Life of Plot keeps its -R plots ──────────
const MAP = fs.readFileSync(path.join(ROOT, 'shared', 'shared_plot_map.js'), 'utf8');
check('the map filters only when asked (skipReplant)',
  /if \(lo\.skipReplant && global\.MJMPalms && MJMPalms\.isReplantPlot\)/.test(MAP), true);
const BOARD = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'nursery_ops_palms_board.html'), 'utf8');
/* ASKED OF THE PROPERTY, NOT THE SPELLING. This pinned the exact line it was
   written against -- `MAP_SCOPE = allowed ? { … } : { … }` -- and the office
   then asked for PN and UNE off the map ("PN UNE不需要出现在这里"), which made
   the nursery list unconditional and left the ternary behind. A check pinned
   to a line fails on a change that altered nothing it was about, which is a
   lesson this repository already carries one screen along; and this one could
   not even be SEEN, because the test died on a missing path before reaching
   it. What it is protecting is that EVERY assignment of MAP_SCOPE asks for
   the replants to be left off, so a second branch added later cannot quietly
   put them back.

   The empty `let MAP_SCOPE = {}` is left out: it is a placeholder, and
   reloadMap -- the only other thing that reads it -- can only run after a
   boundary has been redrawn or a plot hidden, which is after the real scope
   has been set. */
const scopes = (BOARD.match(/MAP_SCOPE\s*=\s*\{[^}]*\}/g) || [])
  .filter((s) => !/=\s*\{\s*\}/.test(s));
check('the PALMS board asks for it on every load',
  scopes.length > 0 && scopes.every((s) => /skipReplant:\s*true/.test(s)), true);
const LIFE = fs.readFileSync(path.join(ROOT, 'nursery_ops', 'nursery_ops_plot_life.html'), 'utf8');
check('Life of Plot does not — a -R plot is real ground with maintenance on it', /skipReplant/.test(LIFE), false);

// ── the FC Portal plot list, built and cached ────────────────────────────
ctx.N.BNN.plots = ['B1', 'B1-R', 'B2', 'B4-R2'];   // a list cached before this change
check('FC Portal: a cached list loses its -R plots', ctx.plotsOf('BNN'), ['B1', 'B2']);
const OC = fs.readFileSync(path.join(FC, 'officeConfig.js'), 'utf8');
check('FC Portal: the list built from shared_plots leaves them out',
  /if \(isReplantPlot\(plot\)\) return;/.test(lift(OC, 'function plotsFromShared')), true);
const CS = fs.readFileSync(path.join(FC, 'cullingSource.js'), 'utf8');
check('FC Portal: the Culling Calculator uses the same one copy, not its own',
  [/import \{ isReplantPlot, nurseryOfPlot, todayStr \} from '\.\/data\.js';/.test(CS),
   /export function isReplantPlot/.test(CS)], [true, false]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
