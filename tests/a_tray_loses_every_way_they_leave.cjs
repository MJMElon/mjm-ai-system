/* A TRAY EMPTIES EVERY WAY THE SEEDLINGS LEAVE, NOT TWO OF THEM.

   Tray Status read **P3 · 230 (81)** over a batch with nothing standing in
   P3, and the office checked it before saying so.

   `shared_tray_stock.js` knew two ways out of a tray: the 1st culling and
   the transplant. Life of Seedlings has known four since it was written —

       preBalance = planted - cull1 - trans - salesPre + calibrationPre

   — and the two missing ones are not rare. A batch SOLD out of the tray,
   and a batch whose pre-nursery count was corrected by an approved
   calibration, both went on standing in a tray here. Its own arithmetic was
   then too big, so the trim took nothing off, and the phantom was parked on
   whichever tray happened to survive.

   Batch 230 is the batch this system already names for it: an approved
   -1,000 against tray P30, "Sold out 1,000 Pre nursery seedlings (DO:
   01605)". Its standing read a thousand too high, and the remainder had to
   land somewhere.

   Driven through the SHIPPED shared_tray_stock.js, so this is the rule both
   screens run.

   Run: node tests/a_tray_loses_every_way_they_leave.cjs
*/
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'shared', 'shared_tray_stock.js'), 'utf8');
const win = {};
new Function('window', SRC + '\n')(win);
const T = win.MJMTrayStock;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

const TRAYS = ['P3', 'P30', 'P1'].map(n => ({ tray_name: n, nursery_name: 'UNN 1', total_vacant: 2560 }));
const P = (tray, batch, qty) => ({ plot_name: tray, batch_name: batch, quantity_change: qty });
const TX = (batch, qty, from, to) => ({
  batch_name: batch, quantity_change: qty, plot_name: to || 'B4',
  remark: 'Transplanted from tray [' + from + '] to Main Plot [' + (to || 'B4') + ']. Date: 2026-03-01'
});
const CAL = (tray, batch, signed, approved) => ({
  plot_name: tray, batch_name: batch, quantity_change: signed,
  remark: 'Report: Planting. Plot: ' + tray + '. Sold out Pre nursery seedlings (DO: 01605)'
          + (approved === false ? '' : ' [APPROVED by esther on 2026-03-02]')
});
const DO = (lines, opts) => Object.assign(
  { status: 'Delivered', remark: '' },
  opts || {},
  lines.reduce((o, l, i) => {
    o['batch_' + (i + 1)] = l[0]; o['plot_' + (i + 1)] = l[1]; o['qty_' + (i + 1)] = l[2];
    return o;
  }, {}));

const of = (res, tray) => (res.byBatch[tray] || []).map(r => r.batch + ':' + r.qty);

console.log('\nBatch 230, as the office found it');
/* 230 planted 1,081 across two trays, transplanted nothing, and sold 1,000
   out of P30 — recorded the way it really was recorded, as an approved
   calibration against the tray. */
{
  const input = {
    trays: TRAYS,
    planted: [P('P30', '230', 1000), P('P3', '230', 81)],
    transplanted: [], cull1: [],
    calibrations: [CAL('P30', '230', -1000)],
    sales: []
  };
  const before = T.compute({ trays: input.trays, planted: input.planted,
                             transplanted: [], cull1: [] });
  check('BEFORE: the sale was invisible, so P3 still held 81', of(before, 'P3'), ['230:81']);
  check('…and P30 held the thousand that had gone', of(before, 'P30'), ['230:1000']);

  const after = T.compute(input);
  check('the tray the correction NAMES gives its holes back', of(after, 'P30'), []);
  /* P3 is the office's own figure: 81 planted, none sold, none moved — so
     it is still 81 and the fault was never P3 going up, it was P30 never
     coming down and the batch total covering for it. */
  check('…and P3 is left alone, because nothing left P3', of(after, 'P3'), ['230:81']);
  check('P30 reads empty', after.vacant.P30, 2560);
}

console.log('\nAnd when the whole batch has gone, no tray holds it');
{
  const after = T.compute({
    trays: TRAYS,
    planted: [P('P30', '230', 1000), P('P3', '230', 81)],
    transplanted: [], cull1: [],
    calibrations: [CAL('P30', '230', -1081)],
    sales: []
  });
  /* The correction is bigger than the tray it names, so the batch runs out
     and the trim takes the rest off — which is the fallback working, not a
     guess being drawn as a figure. */
  check('nothing is standing anywhere', [of(after, 'P3'), of(after, 'P30')], [[], []]);
}

console.log('\nA sale straight out of the tray');
{
  const after = T.compute({
    trays: TRAYS,
    planted: [P('P1', '231', 2000)],
    transplanted: [], cull1: [], calibrations: [],
    sales: T.salesLinesOf([DO([['231', 'P1', 500]])])
  });
  check('the tray gives back what was sold out of it', of(after, 'P1'), ['231:1500']);
  check('…and the holes are free', after.vacant.P1, 2560 - 1500);
}
{
  // Sold out of a FIELD plot — those seedlings left the tray long ago as a
  // transplant, and taking them off again would be the same loss twice.
  const after = T.compute({
    trays: TRAYS,
    planted: [P('P1', '232', 2000)],
    transplanted: [TX('232', 1800, 'P1', 'B4')], cull1: [], calibrations: [],
    sales: T.salesLinesOf([DO([['232', 'B4', 1800]])])
  });
  check('a field sale does not empty a tray twice', of(after, 'P1'), ['232:200']);
}
{
  const after = T.compute({
    trays: TRAYS,
    planted: [P('P1', '233', 2000)],
    transplanted: [], cull1: [], calibrations: [],
    sales: T.salesLinesOf([DO([['233', 'P1', 500]], { status: 'Cancelled' }),
                           DO([['233', 'P1', 300]], { remark: 'void [CANCELLED] by office' })])
  });
  check('a cancelled delivery sells nothing', of(after, 'P1'), ['233:2000']);
}

console.log('\nAn UNAPPROVED calibration moves nothing, here as everywhere');
{
  const after = T.compute({
    trays: TRAYS,
    planted: [P('P1', '234', 2000)],
    transplanted: [], cull1: [],
    calibrations: [CAL('P1', '234', -500, false)],
    sales: []
  });
  check('the tray still holds all of it', of(after, 'P1'), ['234:2000']);
}

console.log('\nA calibration against a FIELD plot is not this tray\'s business');
{
  const after = T.compute({
    trays: TRAYS,
    planted: [P('P1', '235', 2000)],
    transplanted: [TX('235', 1500, 'P1', 'B4')], cull1: [],
    calibrations: [CAL('B4', '235', -300)],
    sales: []
  });
  check('the tray keeps what is in the tray', of(after, 'P1'), ['235:500']);
}

console.log('\nA PLUS puts seedlings back');
{
  const after = T.compute({
    trays: TRAYS,
    planted: [P('P1', '236', 2000)],
    transplanted: [], cull1: [],
    calibrations: [CAL('P1', '236', 40)],
    sales: []
  });
  check('found 40 more in the tray', of(after, 'P1'), ['236:2040']);
}

console.log('\nThe five lines of a delivery order');
{
  const lines = T.salesLinesOf([DO([['a', 'P1', 10], ['b', 'P3', 20], ['c', 'P30', 30],
                                    ['d', 'P1', 40], ['e', 'P3', 50]])]);
  check('all five come out', lines.length, 5);
  check('…with the batch, the plot and the quantity',
        lines[4], { batch: 'e', plot: 'P3', qty: 50 });
  check('an empty line is not a sale', T.salesLinesOf([DO([['a', 'P1', 0]])]).length, 0);
  check('nothing at all is no lines', T.salesLinesOf(null), []);
}

console.log('\nBoth screens pass the same four things');
/* One rule, two callers, and the whole reason this file exists. A caller
   short of an input is the thinner copy again. */
[['the batch list', 'operation/operation_batch_record.html'],
 ['the batch report', 'operation/operation_batch_detail.html']].forEach(([who, f]) => {
  const page = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const call = page.slice(page.indexOf('MJMTrayStock.compute('),
                          page.indexOf("MJMTrayStock.compute(") + 1000);
  checkTrue(who + ' passes the calibrations', /calibrations:/.test(call));
  checkTrue(who + ' passes the sales', /sales:\s*MJMTrayStock\.salesLinesOf\(/.test(call));
  checkTrue(who + ' fetches the delivery orders', /from\('shared_do_records'\)/.test(page));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
