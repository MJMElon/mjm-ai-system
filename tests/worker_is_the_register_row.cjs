/* A WORKER IS THE REGISTER ROW, NOT THE NAME ON IT.
 *
 * The ticks are keyed by name. Correct a name on the register and every tick
 * made under the old spelling is orphaned: no column on the Worker Record,
 * capacity out of the totals, and the salary claim no longer paying it.
 * "Fauzan" became "Muhamad Fauzan" and his earlier months read as a worker
 * who does not exist.
 *
 * Loads the REAL shared/shared_maint_workers.js.
 */
const fs = require('fs');
const path = require('path');
const g = {};
new Function('window', fs.readFileSync(
  path.join(__dirname, '..', 'shared', 'shared_maint_workers.js'), 'utf8'))(g);
const W = g.MJMMaintWorkers;

let fails = 0;
const ok = (c, what) => { console.log(`${c ? 'pass' : 'FAIL'}  ${what}`); if (!c) fails++; };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b),
  `${what}${JSON.stringify(a) === JSON.stringify(b) ? '' : `  got ${JSON.stringify(a)} want ${JSON.stringify(b)}`}`);

/* The register, exactly as the trigger leaves it. */
const rows = [
  { id: 1, full_name: 'Muhamad Fauzan', previous_names: ['Fauzan'] },
  { id: 2, full_name: 'Asriawan',       previous_names: [] },
  { id: 3, full_name: 'Haerul',         previous_names: ['Haerul Anwar'] },
];
const idx = W.index(rows);

ok(W.canonical(idx, 'Fauzan') === 'Muhamad Fauzan',
   'a tick saved as "Fauzan" is Muhamad Fauzan now');
ok(W.canonical(idx, 'Muhamad Fauzan') === 'Muhamad Fauzan',
   'and the current name still resolves to itself');
ok(W.canonical(idx, 'Haerul Anwar') === 'Haerul',
   'a rename that was undone resolves back');
ok(W.canonical(idx, 'fauzan') === 'Muhamad Fauzan',
   'matching is on letters and digits, so case and spacing do not matter');
ok(W.canonical(idx, 'Somebody Else') === 'Somebody Else',
   'a name the register cannot place is returned unchanged, not dropped');

/* The money case: one person must not become two ticks. */
eq(W.canonicalCells(idx, { 'Fauzan': 1, 'Asriawan': 1 }),
   { 'Muhamad Fauzan': 1, 'Asriawan': 1 },
   'an old tick lands in the current column');

eq(W.canonicalCells(idx, { 'Fauzan': 1, 'Muhamad Fauzan': 1, 'Asriawan': 1 }),
   { 'Muhamad Fauzan': 1, 'Asriawan': 1 },
   'a row ticked under BOTH names is ONE worker, not two');

eq(W.canonicalCells(idx, { 'Fauzan': 'field', 'Muhamad Fauzan': 1 }),
   { 'Muhamad Fauzan': 1 },
   'where a hand tick meets a field tick the hand one wins');

/* Two different people who share a spelling must not be merged. */
const clash = W.index([
  { id: 1, full_name: 'Ahmad Bin Ali', previous_names: ['Ahmad'] },
  { id: 2, full_name: 'Ahmad',         previous_names: [] },
]);
ok(W.canonical(clash, 'Ahmad') === 'Ahmad',
   'a name claimed by two different rows is left alone rather than guessed at');

/* A register that has not had the migration yet. */
const old = W.index([{ id: 1, full_name: 'Asriawan' }]);
ok(W.canonical(old, 'Asriawan') === 'Asriawan',
   'a register with no previous_names column still works');

/* The whole store, and the count a caller uses to decide whether to save. */
const res = W.canonicalStore(idx, {
  101: { 'Fauzan': 1 },
  102: { 'Asriawan': 1 },
});
eq(res.store, { 101: { 'Muhamad Fauzan': 1 }, 102: { 'Asriawan': 1 } },
   'the store is rewritten row by row');
ok(res.moved === 1, 'and only the row that actually moved is counted');

ok(W.canonicalStore(idx, res.store).moved === 0,
   'running it again moves nothing');

/* The share is capacity divided by ticks, so a merge that failed would pay
   the wrong number of people. This is the reason the test above matters. */
const cells = W.canonicalCells(idx, { 'Fauzan': 1, 'Muhamad Fauzan': 1 });
ok(Object.keys(cells).length === 1 && 2353 / Object.keys(cells).length === 2353,
   'one person on a 2,353 plot earns 2,353, not half of it');

console.log(fails ? `\n${fails} failed` : '\nall good');
process.exit(fails ? 1 : 0);
