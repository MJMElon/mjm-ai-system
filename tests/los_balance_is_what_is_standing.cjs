/* THE BALANCE IS WHAT IS STANDING IN THE FIELD, AND TRANSPLANTING IS THREE
   COLUMNS.

   The office asked for two things on Life of Seedlings:

     1. Balance = transplanting qty − 3rd culling − total sales
     2. Transplanting Details, three columns:
          Total Transplanting Qty | Transplanting Qty | Double Tone
        with the total being the other two added.

   The Balance used to be a different question — actual planted − total
   culling − total sales + approved calibration, which is everything the
   batch has ANYWHERE, tray included. On a batch that was over- or
   under-allocated the two answers differ by the allocation gap for ever, and
   the gap does not close: 224 read −416 and 226 read −560 with nothing
   standing in either of them.

   The office's five batches are the fixture, with their real figures, and
   two things fall out of them that are worth holding:

     the old and the new formula AGREE exactly where planted − 1st culling
     equals the transplanting qty (227 and 228, fully allocated), and

     the three batches where they differ come to exactly their own approved
     stock calibration — 1 against −1, −1 against +1, 13 against −13. The
     calibration is NOT in the Balance, because that is not what was asked
     for, and this test records the fact rather than the wish.

   The 1st culling is not taken off the new figure. It happens in the TRAY,
   so the transplanting quantity is already net of it; taking it off again
   would subtract it twice.

   The REAL derived-figures block is lifted out of operation_reports.html. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const los  = fs.readFileSync(path.join(root, 'operation', 'operation_reports.html'), 'utf8');

const start = los.indexOf('  // ── Derived figures ──');
const end   = los.indexOf('  // Years/suppliers offered by their pickers', start);
if (start < 0 || end < 0) throw new Error('could not find the derived-figures block');
const derive = new Function('rowsByBatch', 'asAt', '_losAgeMonths', '_losAgeLabel',
  los.slice(start, end) + '\nreturn rowsByBatch;');

const run = (f) => {
  const r = Object.assign({
    batch: 'x', planted: 0, cull1: 0, cull2: 0, cull3: 0, trans: 0, dtone: 0,
    sales: 0, salesPre: 0, calibration: 0, calibrationPre: 0,
    received: 0, damaged: 0, transfer: 0
  }, f);
  derive({ x: r }, null, () => null, () => '');
  return r;
};

let pass = 0, fail = 0;
const is = (what, got, want) => {
  if (got === want) { pass++; console.log('  ok   ' + what + ' → ' + got); }
  else { fail++; console.log('  FAIL ' + what + '\n         got  ' + got + '\n         want ' + want); }
};

/* ── The office's own five batches, off the report they sent ────────────── */
const OFFICE = [
  // batch  planted  trans   cull1  cull3  sales  calibration
  ['224',     9920,   9608,   728,    983,  8624,  -1],
  ['225',    10423,   9888,   815,   1270,  8619,   1],
  ['226',    10459,  10411,   608,   1672,  8726, -13],
  ['227',     9368,   8388,   980,   1788,  6600,   0],
  ['228',     6319,   6007,   312,   1864,  4143,   0],
];

console.log('\n── The office’s five batches ──');
console.log('  batch   planted    trans   cull1   cull3    sales  calib |   old     new');
const diffs = [];
for (const [b, planted, trans, cull1, cull3, sales, calibration] of OFFICE) {
  const r = run({ batch: b, planted, trans, cull1, cull3, sales, calibration });
  // What the previous formula gave, written out here so the change is
  // visible rather than asserted.
  const old = planted - (cull1 + cull3) - sales + calibration;
  diffs.push({ b, old, now: r.balance, calibration });
  console.log('  ' + b.padEnd(6) + String(planted).padStart(8) + String(trans).padStart(9) +
              String(cull1).padStart(8) + String(cull3).padStart(8) + String(sales).padStart(9) +
              String(calibration).padStart(7) + ' | ' +
              String(old).padStart(5) + String(r.now = r.balance).padStart(8));
  is('  ' + b + ' balance is trans − cull3 − sales', r.balance, trans - cull3 - sales);
}

console.log('\n── Where the old and the new formula agree, and why ──');
for (const [b, planted, trans, cull1] of OFFICE) {
  const d = diffs.find(x => x.b === b);
  const fully = planted - cull1 === trans;
  is('  ' + b + (fully ? ' is fully allocated, so the two agree'
                       : ' is not, so they differ') + ' (' + d.old + ' / ' + d.now + ')',
     d.old === d.now, fully);
}

console.log('\n── The three that differ come to their own approved calibration ──');
for (const d of diffs.filter(x => x.old !== x.now)) {
  is('  ' + d.b + ': balance + calibration', d.now + d.calibration, 0);
}
is('and the calibration is NOT folded in — three would read nought if it were',
  diffs.filter(x => x.now === 0).length, 2);

/* ── The 1st culling is not taken off twice ──────────────────────────────
   A batch with a 1st culling and nothing else out of the tray: the old
   formula held the uncull'd remainder (it starts from planted), the new one
   reads nought, because nothing has gone to the field yet. */
console.log('\n── A batch 1st culled and not yet transplanted ──');
const inTray = run({ planted: 1000, cull1: 100 });
is('balance is nought — nothing is standing in the field', inTray.balance, 0);
is('and preBalance still holds the 900 in the tray',       inTray.preBalance, 900);
is('so it is NOT reported completed',                      inTray.completed, false);

console.log('\n── Once it goes out, the 1st culling is not subtracted again ──');
const out = run({ planted: 1000, cull1: 100, trans: 900 });
is('balance is the transplanting qty', out.balance, 900);
is('the tray is empty',                out.preBalance, 0);
is('and it is not finished — 900 are standing', out.completed, false);

console.log('\n── The 2nd culling never deducts here either ──');
const c2 = run({ planted: 1000, cull1: 100, trans: 900, cull2: 120 });
is('a 2nd culling with no 3rd leaves the balance alone', c2.balance, 900);
is('and the 3rd is what takes it off',
  run({ planted: 1000, cull1: 100, trans: 900, cull2: 120, cull3: 150 }).balance, 750);

console.log('\n── A batch sold entirely out of the tray ──');
/* The Balance takes TOTAL sales off, so this one reads minus what left the
   tray. That is the figure the office asked for and it is right on every
   batch that sells out of the field. What must NOT inherit it is the
   main-nursery figure, or the Pre / Main filter lists a batch under a
   nursery it never reached — a fault this report has already had once. */
const tray = run({ planted: 1000, trans: 0, sales: 400, salesPre: 400 });
is('the balance carries the tray sale',      tray.balance, -400);
is('the main-nursery figure does NOT',        tray.mainBalance, 0);
is('the tray still holds the other 600',      tray.preBalance, 600);
is('and it is not reported completed',        tray.completed, false);

const trayGone = run({ planted: 1000, trans: 0, sales: 1000, salesPre: 1000 });
is('sold out entirely: nothing in the tray',  trayGone.preBalance, 0);
is('nothing in the field',                    trayGone.mainBalance, 0);
is('and NOW it is completed',                 trayGone.completed, true);

console.log('\n── Transplanting Details: the total is the two added ──');
const d1 = run({ planted: 10000, trans: 9608, dtone: 1250 });
is('Total Transplanting Qty', d1.transTotal, 9608 + 1250);
is('and the Balance uses the transplanting qty alone, never the total',
  d1.balance, 9608);
is('no double tone keyed: the total is the transplanting qty',
  run({ trans: 9608 }).transTotal, 9608);
is('nothing transplanted: the total is the double tone',
  run({ dtone: 96 }).transTotal, 96);
is('neither: nought', run({}).transTotal, 0);

/* ── The page, not just the arithmetic ──────────────────────────────────── */
console.log('\n── The report markup says the same thing ──');
is('there is a Transplanting Details group of three',
  /<th colspan="3" class="los-grp">Transplanting Details<\/th>/.test(los), true);
is('with Total Transplanting Qty in front of the two',
  los.indexOf('>Total Transplanting Qty<') < los.indexOf('>Transplanting Qty<'), true);
is('Transplanting Qty in front of Double Tone',
  los.indexOf('>Transplanting Qty<') < los.indexOf('>Double Tone<'), true);
is('nineteen column widths', (() => {
  const m = los.match(/const LOS_COL_WIDTHS = \[([\s\S]*?)\]/);
  return m ? m[1].split(',').length : 0;
})(), 19);
is('and nothing still spans eighteen', /colspan="18"/.test(los), false);

/* The thead must have as many cells as the colgroup, counting the spans, or
   every column after the mistake is drawn in the wrong width. */
const theadRow = (n) => {
  const t = los.slice(los.indexOf('<colgroup>${LOS_COL_WIDTHS'));
  const rows = t.slice(0, t.indexOf('</thead>')).split('<tr>');
  const cells = rows[n].match(/<th[^>]*>/g) || [];
  return cells.reduce((s, c) => {
    const r = (c.match(/rowspan="(\d+)"/) || [])[1];
    const cs = (c.match(/colspan="(\d+)"/) || [])[1];
    return s + (n === 1 ? Number(cs || 1) : (r ? 0 : Number(cs || 1)));
  }, 0);
};
is('the top header row covers all nineteen', theadRow(1), 19);
is('and the second row fills every grouped column', theadRow(2), 11);

console.log('\n── The verification marks follow the new formula ──');
is('Balance is marked by the transplanting and the 3rd culling',
  /const LOS_BALANCE_GROUPS = \(r\) => \['transplanting', 'cull_3'\]/.test(los), true);
is('and the planting no longer marks it',
  /LOS_BALANCE_GROUPS = \(r\) => \['planting'\]/.test(los), false);
is('Total Transplanting Qty is marked by both its parts',
  /const LOS_TRANSTOTAL_GROUPS = \(r\) => \['transplanting', 'dtone'\]/.test(los), true);
is('and the drilldown knows the same two',
  /transTotal: LOS_TRANSTOTAL_GROUPS/.test(los), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
