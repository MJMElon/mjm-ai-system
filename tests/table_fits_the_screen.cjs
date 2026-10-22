/* A WIDE SHEET IS SHRUNK TO FIT, NEVER TRUNCATED.

   The payroll sheet grows one column per crew member on the nursery — eight,
   ten, more — and every column in it carries a figure somebody is paid
   against. Opening the side bar used to leave the table wider than the
   content area with the only way to read the rest a sideways drag, in a
   browser window the office was not going to resize to make room.

   fitTableToWrap() shrinks the WHOLE table toward the wrapper's own width
   with a CSS transform, so every column stays on screen at a smaller size
   rather than one being dropped or scrolled out of sight. Below
   TABLE_FIT_MIN_SCALE it backs off and leaves the wrapper's own
   overflow-x:auto (every .tbl-wrap carries one) to take over, because type
   too small to read is worse than a scrollbar.

   This lifts the real function out of the shipped file and drives it against
   fake DOM nodes whose layout numbers are set by hand, which is the only way
   to test real layout arithmetic with no browser.

   Run: node tests/table_fits_the_screen.cjs
   No build and no server needed.
*/
'use strict';
const fs = require('fs');
const path = require('path');

const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let failed = 0;
const fail = (m) => { console.log('FAIL  ' + m); failed++; };
const ok = (m) => console.log('ok    ' + m);
const is = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want)
  ? ok(m)
  : fail(m + '  — got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want)));
const close = (got, want, tol, m) => (Math.abs(got - want) <= tol
  ? ok(m)
  : fail(m + '  — got ' + got + ', wanted ~' + want));

const src = R('nursery_ops/plot_maintenance_script.js');
const start = src.indexOf('const TABLE_FIT_MIN_SCALE');
if (start === -1) { console.log('FAIL  could not find TABLE_FIT_MIN_SCALE in the shipped file'); process.exit(1); }
const fnStart = src.indexOf('function fitTableToWrap', start);
const fnEnd = src.indexOf('\nfunction fitAllTables', fnStart);
if (fnEnd === -1) { console.log('FAIL  could not find the end of fitTableToWrap'); process.exit(1); }
const code = src.slice(start, fnEnd);

function makeWrap({ availW, naturalW, naturalH, hidden }) {
  const style = {};
  const table = {
    style,
    get scrollWidth() { return naturalW; },
    get scrollHeight() { return naturalH; },
  };
  const wrapStyle = {};
  const wrap = {
    style: wrapStyle,
    clientWidth: availW,
    offsetParent: hidden ? null : {},
    querySelector: (sel) => (sel === 'table' ? table : null),
  };
  return { wrap, table };
}

function run(fn, wrap) {
  const f = new Function('wrap', code + '\nreturn fitTableToWrap(wrap);');
  f(wrap);
}

console.log('A table that already fits is left alone');
{
  const { wrap, table } = makeWrap({ availW: 1000, naturalW: 800, naturalH: 400 });
  run(null, wrap);
  is(table.style.transform, '', 'no transform applied');
  is(wrap.style.height, '', 'no height forced');
  is(wrap.style.overflowX, '', 'overflow left at its CSS default (auto)');
}

console.log('');
console.log('A table too wide for the wrapper is scaled down to fit it');
{
  const { wrap, table } = makeWrap({ availW: 700, naturalW: 1000, naturalH: 500 });
  run(null, wrap);
  is(table.style.transform, 'scale(0.7)', 'scaled to availW / naturalW');
  is(table.style.transformOrigin, 'top left', 'scales from the top-left corner, not the centre');
  is(wrap.style.overflowX, 'hidden', 'no scrollbar once it is made to fit');
  close(parseFloat(wrap.style.height), 500 * 0.7, 0.5, 'wrapper height matches the SCALED table, not the natural one');
}

console.log('');
console.log('Below the floor it gives up and lets the scrollbar take over');
{
  // availW/naturalW = 0.3, well under TABLE_FIT_MIN_SCALE (0.62) — fourteen
  // worker columns, say, not eight.
  const { wrap, table } = makeWrap({ availW: 300, naturalW: 1000, naturalH: 500 });
  run(null, wrap);
  is(table.style.transform, '', 'left unscaled rather than shrunk illegibly small');
  is(wrap.style.overflowX, '', 'back to the wrapper\'s own overflow-x:auto');
}

console.log('');
console.log('A table on a tab that is not open is not measured at all');
{
  const { wrap, table } = makeWrap({ availW: 700, naturalW: 1000, naturalH: 500, hidden: true });
  run(null, wrap);
  is(table.style.transform, '', 'nothing scaled while hidden — offsetParent is null, there is nothing to measure yet');
}

console.log('');
console.log('A previous scale is cleared before a fresh measurement, not stacked on top of it');
{
  const { wrap, table } = makeWrap({ availW: 1000, naturalW: 800, naturalH: 400 });
  table.style.transform = 'scale(0.4)';           // left over from a narrower window
  wrap.style.height = '160px';
  wrap.style.overflowX = 'hidden';
  run(null, wrap);
  is(table.style.transform, '', 'the stale scale is reset once the table fits again');
  is(wrap.style.height, '', 'and so is the forced height');
}

console.log('\n' + (failed ? failed + ' FAILED' : 'all green'));
process.exit(failed ? 1 : 0);
