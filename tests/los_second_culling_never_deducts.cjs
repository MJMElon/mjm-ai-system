/* THE 2ND CULLING NEVER DEDUCTS. NOT EVEN WHILE NO 3RD EXISTS.

   Life of Seedlings used to read `cull3 > 0 ? cull3 : cull2` — the 2nd
   standing in for the 3rd until a 3rd was keyed — and its own comment claimed
   that was "the same rule as the Movement Report's netOfRow()". It was not.
   The two readers it has to agree with both say the opposite, in their own
   words, in this repository:

     netOfRow(), operation_reports.html:
       "2nd Culled never deducts here, B/F included — 2nd Culling is Tab 6's
        own live snapshot as a batch works through 3rd Culling, not a separate
        loss on top of it."

     the culling rate, operation_batch_record.html:
       (1st culled + 3rd culled) / (transplanted + 1st culled), with cull2
       "carried for reference only — it is inside cull3".

   So every batch 2nd culled and not yet 3rd culled had its Total Culling
   overstated by the 2nd culling and its Balance understated by the same — on
   the one report the office reconciles against, in a column headed "Total
   Culling (1st + 3rd)", with the Movement Report beside it disagreeing.

   The REAL derived block is lifted out of operation_reports.html, and the
   Batch Report's REAL culling rate out of operation_batch_record.html, so
   the two are compared rather than restated. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const los  = fs.readFileSync(path.join(root, 'operation', 'operation_reports.html'), 'utf8');
const rec  = fs.readFileSync(path.join(root, 'operation', 'operation_batch_record.html'), 'utf8');

const start = los.indexOf('  // ── Derived figures ──');
const end   = los.indexOf('  // Years/suppliers offered by their pickers', start);
if (start < 0 || end < 0) throw new Error('could not find the derived-figures block');
const derive = new Function('rowsByBatch', 'asAt', '_losAgeMonths', '_losAgeLabel',
  los.slice(start, end) + '\nreturn rowsByBatch;');

// The Batch Report's own rate, lifted whole.
const rateSrc = rec.slice(rec.indexOf('const cullRate = denom > 0'),
                          rec.indexOf(';', rec.indexOf('Math.round(((cull1 + cull3)')) + 1);
const batchRate = new Function('cull1', 'cull3', 'denom', rateSrc + '\nreturn cullRate;');

const run = (f) => {
  const r = Object.assign({
    batch: 'x', planted: 0, cull1: 0, cull1Dtone: 0, cull2: 0, cull3: 0, trans: 0, sales: 0,
    calibration: 0, calibrationPre: 0, salesPre: 0, received: 0, damaged: 0,
    ver: {}, rec: {},
  }, f);
  derive({ x: r }, null, () => null, () => '');
  return r;
};

let pass = 0, fail = 0;
const is = (what, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log('  ok   ' + what + ' → ' + a); }
  else { fail++; console.log('  FAIL ' + what + '\n         got  ' + a + '\n         want ' + b); }
};

console.log('\n── A batch 2nd culled and NOT yet 3rd culled ──');
// 10,000 planted, 800 culled in the tray, 9,200 out, and 150 found dead in
// the plot on the 2nd culling. No 3rd culling yet.
const open2nd = run({ received: 10500, damaged: 0, planted: 10000, cull1: 800, trans: 9200, cull2: 150 });
is('Total Culling is 1st + 3rd, which is 800 + nothing', open2nd.cullTotal, 800);
is('the 2nd culling does not stand in for the 3rd',      open2nd.postCull, 0);
is('so the Balance keeps the 150',                       open2nd.balance, 10000 - 800);
is('and the 2nd Culled column still carries it',         open2nd.cull2, 150);

console.log('\n── Once the 3rd culling is keyed ──');
// The 3rd is keyed against the original transplanted figure, so it already
// contains the 150.
const with3rd = run({ received: 10500, damaged: 0, planted: 10000, cull1: 800, trans: 9200, cull2: 150, cull3: 400 });
is('Total Culling is 1st + 3rd',          with3rd.cullTotal, 1200);
is('the 2nd is not added on top of it',   with3rd.postCull, 400);
is('and the Balance is planted less that', with3rd.balance, 10000 - 1200);

console.log('\n── It agrees with the Batch Report’s own culling rate ──');
// (1st + 3rd) / (transplanted + 1st) — the Batch Report's real formula,
// lifted out of its own file. The report and the rate have to be made of the
// same numerator, or one screen says a batch has been culled and the other
// says it has not.
[open2nd, with3rd].forEach((r, i) => {
  const denom = r.trans + r.cull1;
  const theirs = batchRate(r.cull1, r.cull3, denom);
  const ours   = Math.round((r.cullTotal / denom) * 10000) / 100;
  is('case ' + (i + 1) + ': Total Culling over the same base equals the Batch Report rate',
    ours, theirs);
});

console.log('\n── A batch with no culling at all is untouched ──');
const none = run({ received: 1000, damaged: 0, planted: 1000, trans: 1000 });
is('Total Culling', none.cullTotal, 0);
is('Balance',       none.balance, 1000);

console.log('\n── And the figure the drilldown opens cannot disagree with it ──');
const collectSrc = los.slice(los.indexOf('    if (spec.list === \'cullTotal\') {'),
                             los.indexOf('    } else {', los.indexOf('    if (spec.list === \'cullTotal\') {')));
is('the records behind Total Culling are the 1st and the 3rd, never the 2nd',
  /rec\.cull2/.test(collectSrc), false);
is('and it does take the 3rd', /rec\.cull3/.test(collectSrc), true);

/* ── 1ST CULLED IS THREE COLUMNS, SPLIT BY THE TRAY ────────────────────────
   A 1st culling happens in a TRAY and the row is keyed against the tray it
   happened in, and the DOUBLE-TONE tray is one of the trays — saveCullingTab
   draws a row for every tray in preNurseryTrayData and gives the d-tone one
   its own icon. So Total 1st Culled splits the way Total Transplant Qty
   does: two DISJOINT halves and the total they add up to, never two
   different things summed.

   The thing that must NOT move is Total Culled (1st + 3rd). It takes the
   WHOLE 1st culling, d-tone tray included — splitting a column for the
   reader is not the same as changing what the arithmetic counts. */
console.log('\n── 1st Culled splits by tray, and the total does not move ──');
const split = run({ planted: 10000, trans: 9251, cull1: 749, cull1Dtone: 149, cull3: 280 });
is('Total 1st Culled Qty',          split.cull1Total, 749);
is('1st Culled Qty, the plain trays', split.cull1Main, 600);
is('Double Tone 1st Culled Qty',      split.cull1Dtone, 149);
is('the two halves add up to the total',
  split.cull1Main + split.cull1Dtone, split.cull1Total);
is('and Total Culled (1st + 3rd) takes the WHOLE 1st culling',
  split.cullTotal, 749 + 280);
is('not just the plain-tray half', split.cullTotal === 600 + 280, false);

console.log('\n── Nothing culled in the d-tone tray ──');
const noDt = run({ planted: 1000, trans: 900, cull1: 100, cull3: 50 });
is('the whole 1st culling is the plain half', noDt.cull1Main, 100);
is('and the d-tone one is nought',            noDt.cull1Dtone, 0);
is('the total is unchanged',                  noDt.cullTotal, 150);

console.log('\n── All of it culled in the d-tone tray ──');
const allDt = run({ planted: 1000, trans: 900, cull1: 100, cull1Dtone: 100, cull3: 50 });
is('the plain half is nought', allDt.cull1Main, 0);
is('and the total still counts it', allDt.cullTotal, 150);

console.log('\n── The three windows cannot disagree with the three figures ──');
const cull1Src = los.slice(los.indexOf("    } else if (spec.list === 'cull1Main'"),
                           los.indexOf("    } else if (spec.list === 'transMain'"));
is('the split is read off the same tray matcher the figures use',
  /_losTrayKey\(x\.place\) === 'DOUBLETONE'/.test(cull1Src), true);
is('out of ONE list, so nothing can be in a window and not its column',
  /r\.rec\.cull1\.forEach/.test(cull1Src), true);

console.log('\n── The headings say Culled, which is what the office asked for ──');
const thead = (() => {
  const t = los.slice(los.indexOf('<colgroup>${LOS_COL_WIDTHS'));
  return t.slice(0, t.indexOf('</thead>'));
})();
is('the group is Culled Detail', /<th colspan="6" class="los-grp">Culled Detail<\/th>/.test(thead), true);
is('and no heading in the table still says Culling',
  (thead.match(/<th[^>]*>([^<]*)<\/th>/g) || [])
    .filter(h => h.replace(/<[^>]*>/g, '').includes('Culling')).length, 0);
is('3rd Culled',                 />3rd Culled</.test(thead), true);
is('Total Culled (1st + 3rd)',   />Total Culled \(1st \+ 3rd\)</.test(thead), true);
is('Total 1st Culled Qty first', thead.indexOf('>Total 1st Culled Qty<') < thead.indexOf('>1st Culled Qty<'), true);
is('then Double Tone 1st Culled Qty',
  thead.indexOf('>1st Culled Qty<') < thead.indexOf('>Double Tone 1st Culled Qty<'), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
