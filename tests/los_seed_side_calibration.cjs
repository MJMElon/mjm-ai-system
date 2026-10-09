/* A SEED-SIDE CALIBRATION IS NOT IN THE FIELD BALANCE.

   Life of Seedlings' Balance is what is STANDING IN THE FIELD:

     transplant qty − 3rd culling − total sales + approved stock calibration

   and that last term is the PLOT-side calibrations only.

   Batch 230 is why. Its calibration is minus 1,000 reported against
   PLANTING — "Sold out 1,000 Pre nursery seedlings (DO: 01605)", keyed
   against tray P30 — and those seedlings never reached a field plot. Taking
   them off what is standing in one subtracts a loss from a figure that
   never contained it: the batch balanced to nought on its own three terms
   and the report read MINUS 1,000.

   WHICH SIDE IT IS, IS THE REPORT. `ADJUST_SIDE_OF` in
   operation_batch_detail.html calls Seeds Received, Planting and Seed Audit
   the seed side and everything else the plot side, and its own comment says
   why the "Side:" written in the remark is ignored: rows written while the
   form still asked carry one, and a row somebody filed on the wrong side
   has to correct itself. This file keeps the same list (and asserts the two
   copies still match) rather than reading the marker.

   Three things it does NOT change, each worth its own case:

     · The Stock Calibration COLUMN still shows every approved one. It is a
       real correction; it is only the field Balance it does not belong in.
     · preBalance still carries it, because the tray IS where those
       seedlings were. The correction is not lost, it is in the other half.
     · An unapproved one still counts for nothing, on either side.

   The REAL builder is lifted whole out of operation_reports.html, remark
   parsing included — the whole fault was in reading a remark, so a test
   that hands the derived block a ready-made number proves nothing. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src  = fs.readFileSync(path.join(root, 'operation', 'operation_reports.html'), 'utf8');
const det  = fs.readFileSync(path.join(root, 'operation', 'operation_batch_detail.html'), 'utf8');

const i = src.indexOf('async function _losBuildAllRows(asAt) {');
const body = src.slice(src.indexOf('  // ── One row per batch ──', i),
                       src.indexOf('  // Years/suppliers offered by their pickers', i));

const L = (o) => Object.assign({ plot_name: 'Pre-Nursery', quantity_change: 0, remark: '' }, o);
const APPROVED = ' [APPROVED by office on 2026-09-13]';

const logs = [
  /* 230, with its own figures off the report the office sent:
     transplanted 11,619, 3rd culled 2,452, sold 9,167 — which comes to
     nought — and a calibration of minus 1,000 against Planting. */
  L({ batch_name: '230', breed_name: 'UPB PREMIER HYBRID', transaction_type: 'Seeds_Received',
      transaction_date: '2025-01-14', created_at: '2025-01-14T00:00:00Z', quantity_change: 13125,
      remark: 'Seeds received. DO_Qty: 12500. Incl. 5% FOC.' }),
  L({ batch_name: '230', transaction_type: 'Damaged_Seeds', transaction_date: '2025-01-15', quantity_change: -46 }),
  L({ batch_name: '230', transaction_type: 'Planted', transaction_date: '2025-01-15', plot_name: 'P30', quantity_change: 12689 }),
  L({ batch_name: '230', transaction_type: '1st_Culling', transaction_date: '2025-03-01', plot_name: 'P30', quantity_change: -470 }),
  L({ batch_name: '230', transaction_type: 'Transplanted', transaction_date: '2025-04-01',
      plot_name: 'V1', quantity_change: 11219,
      remark: 'Transplanted from tray [P30] to Main Plot [V1]. Date: 2025-04-01' }),
  L({ batch_name: '230', transaction_type: 'Transplanted', transaction_date: '2025-04-02',
      plot_name: 'V2', quantity_change: 400,
      remark: 'Transplanted from tray [DOUBLE-TONE] to Main Plot [V2]. Date: 2025-04-02' }),
  L({ batch_name: '230', transaction_type: '3rd_Culling', transaction_date: '2026-02-01', plot_name: 'V1', quantity_change: -2452 }),
  L({ batch_name: '230', transaction_type: 'Stock_Calibration', transaction_date: '2026-09-12', plot_name: 'P30',
      quantity_change: -1000,
      remark: 'Report: Planting. Plot: P30. Side: seed. Sold out 1,000 Pre nursery seedlings (DO: 01605).' + APPROVED }),

  /* 231 — the same shape with a PLOT-side report. This one IS in the
     Balance: the seedlings reached V5 and then went. */
  L({ batch_name: '231', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
      transaction_date: '2025-02-01', created_at: '2025-02-01T00:00:00Z', quantity_change: 10000,
      remark: 'Seeds received. DO_Qty: 10000.' }),
  L({ batch_name: '231', transaction_type: 'Planted', transaction_date: '2025-02-02', plot_name: 'P31', quantity_change: 10000 }),
  L({ batch_name: '231', transaction_type: 'Transplanted', transaction_date: '2025-04-01',
      plot_name: 'V5', quantity_change: 9000,
      remark: 'Transplanted from tray [P31] to Main Plot [V5]. Date: 2025-04-01' }),
  L({ batch_name: '231', transaction_type: 'Stock_Calibration', transaction_date: '2026-09-12', plot_name: 'V5',
      quantity_change: -40,
      remark: 'Report: 3rd Culling. Plot: V5. Found 40 fewer on the ground.' + APPROVED }),

  /* 232 — a seed-side one nobody has approved. Counts for nothing at all,
     which is the rule every reader of this ledger shares. */
  L({ batch_name: '232', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
      transaction_date: '2025-03-01', created_at: '2025-03-01T00:00:00Z', quantity_change: 5000,
      remark: 'Seeds received. DO_Qty: 5000.' }),
  L({ batch_name: '232', transaction_type: 'Planted', transaction_date: '2025-03-02', plot_name: 'P32', quantity_change: 5000 }),
  L({ batch_name: '232', transaction_type: 'Transplanted', transaction_date: '2025-05-01',
      plot_name: 'V8', quantity_change: 4800,
      remark: 'Transplanted from tray [P32] to Main Plot [V8]. Date: 2025-05-01' }),
  L({ batch_name: '232', transaction_type: 'Stock_Calibration', transaction_date: '2026-09-12', plot_name: 'P32',
      quantity_change: -500, remark: 'Report: Planting. Plot: P32. Nobody has approved this.' }),

  /* 233 — Seeds Received and Seed Audit are the other two seed-side
     reports, and the match ignores case and surrounding space. */
  L({ batch_name: '233', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
      transaction_date: '2025-04-01', created_at: '2025-04-01T00:00:00Z', quantity_change: 8000,
      remark: 'Seeds received. DO_Qty: 8000.' }),
  L({ batch_name: '233', transaction_type: 'Planted', transaction_date: '2025-04-02', plot_name: 'P33', quantity_change: 8000 }),
  L({ batch_name: '233', transaction_type: 'Transplanted', transaction_date: '2025-06-01',
      plot_name: 'V9', quantity_change: 7500,
      remark: 'Transplanted from tray [P33] to Main Plot [V9]. Date: 2025-06-01' }),
  L({ batch_name: '233', transaction_type: 'Stock_Calibration', transaction_date: '2026-09-12', plot_name: 'P33',
      quantity_change: -200, remark: 'Report: SEEDS RECEIVED. Plot: P33. Short delivery.' + APPROVED }),
  L({ batch_name: '233', transaction_type: 'Stock_Calibration', transaction_date: '2026-09-13', plot_name: 'P33',
      quantity_change: -30, remark: 'Report:  Seed Audit . Plot: P33. Counted again.' + APPROVED }),
];

const fn = new Function('asAt','logsRes','dosRes','_logDate','_mvBatchKey','nurseryOf',
  'PRE_NURSERY_PLOTS','_losAgeMonths','_losAgeLabel','_RE_LOS_SUPPLIER','_RE_LOS_MPOB',
  '_RE_LOS_DONO','_RE_LOS_DO_QTY','_RE_LOS_FOC_PCT','_RE_LOS_REPL','_RE_LOS_FROM_TRAY',
  '_RE_LOS_FROM_PLOT','_RE_LOS_APPROVED','_RE_LOS_CAL_REPORT','_RE_LOS_CAL_SIDE',
  '_losTrayKey','_LOS_CAL_SEED_REPORTS',
  body + '\nreturn rows;');

const grab = (name) => new Function('return ' + src.slice(
  src.indexOf('= ', src.indexOf('const ' + name + ' ')) + 2,
  src.indexOf('\n', src.indexOf('const ' + name + ' '))).replace(/;$/, ''))();

// A tray is pre-nursery; a V plot is the field. The report's own test.
const nurseryOf = (p) => (String(p || '').charAt(0).toUpperCase() === 'P'
                          || String(p || '') === 'Pre-Nursery') ? 'Pre-Nursery' : 'UNN 1';

// 230 sold 9,167 and 231/232/233 sold nothing — the delivery orders.
const dos = [{ do_number: 'DO-01605', delivery_date: '2026-03-01', status: null,
               batch_1: '230', qty_1: 9167, plot_1: 'V1' }];

const build = () => {
  const rows = fn('', { data: logs }, { data: dos },
    (l) => l.transaction_date || (l.created_at || '').slice(0, 10) || null,
    (b) => String(b || '').trim(), nurseryOf, ['Pre-Nursery'],
    () => 20, () => '20 months',
    grab('_RE_LOS_SUPPLIER'), grab('_RE_LOS_MPOB'), grab('_RE_LOS_DONO'),
    grab('_RE_LOS_DO_QTY'), grab('_RE_LOS_FOC_PCT'), grab('_RE_LOS_REPL'),
    grab('_RE_LOS_FROM_TRAY'), grab('_RE_LOS_FROM_PLOT'), grab('_RE_LOS_APPROVED'),
    grab('_RE_LOS_CAL_REPORT'), grab('_RE_LOS_CAL_SIDE'),
    grab('_losTrayKey'), grab('_LOS_CAL_SEED_REPORTS'));
  const by = {}; rows.forEach(r => { by[r.batch] = r; });
  return by;
};

let pass = 0, fail = 0;
const is = (what, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log('  ok   ' + what + ' → ' + a); }
  else { fail++; console.log('  FAIL ' + what + '\n         got  ' + a + '\n         want ' + b); }
};

const B = build();

console.log('\n── Batch 230, the one this was raised on ──');
is('transplanted',    B['230'].transTotal, 11619);
is('3rd culled',      B['230'].cull3, 2452);
is('sold',            B['230'].sales, 9167);
is('so the three terms come to nought', 11619 - 2452 - 9167, 0);
is('the calibration is read, and shown in its own column', B['230'].calibration, -1000);
is('it is recognised as the SEED side',  B['230'].calibrationSeed, -1000);
is('and so it is NOT in the field Balance', B['230'].balance, 0);
is('which used to read minus the whole of it',
  11619 - 2452 - 9167 + B['230'].calibration, -1000);

console.log('\n── The correction is not lost — it is in the other half ──');
/* P30 is a tray, so the row is in the pre-nursery figure, which is where
   those 1,000 seedlings actually were. */
is('preBalance carries it', B['230'].preBalance,
  12689 - 470 - 11619 - 0 + -1000);
is('and the field figure does not', B['230'].mainBalance, 11619 - 2452 - 9167);
is('the drilldown still lists it', B['230'].rec.calibration.length, 1);
is('named by the report that decides the side', B['230'].rec.calibration[0].report, 'Planting');

console.log('\n── A PLOT-side calibration still counts ──');
is('231 has one',                   B['231'].calibration, -40);
is('and it is NOT the seed side',   B['231'].calibrationSeed, 0);
is('so the Balance takes it',       B['231'].balance, 9000 - 40);
is('and so does the field figure',  B['231'].mainBalance, 9000 - 40);

console.log('\n── An UNAPPROVED one counts for nothing, on either side ──');
is('232 does not count it at all', B['232'].calibration, 0);
is('nor on the seed side',         B['232'].calibrationSeed, 0);
is('so the Balance is the three terms', B['232'].balance, 4800);
is('and it is still listed, waiting', B['232'].rec.calibration.length, 1);
is('marked as not approved',          B['232'].rec.calibration[0].approved, false);

console.log('\n── The other two seed-side reports, and the matching ──');
is('Seeds Received and Seed Audit are both the seed side',
  B['233'].calibrationSeed, -230);
is('the column still shows them',   B['233'].calibration, -230);
is('and the Balance is untouched',  B['233'].balance, 7500);

console.log('\n── The two copies of the list have not drifted ──');
/* ADJUST_INITIAL_REPORTS in operation_batch_detail.html is the original.
   A list that grows on one side and not the other puts a correction into
   the field balance that the batch report says belongs to the seed count. */
const here  = grab('_LOS_CAL_SEED_REPORTS');
const there = new Function('return ' + det.slice(
  det.indexOf('= ', det.indexOf('const ADJUST_INITIAL_REPORTS ')) + 2,
  det.indexOf('\n', det.indexOf('const ADJUST_INITIAL_REPORTS '))).replace(/;$/, ''))();
is('Life of Seedlings and the batch detail page name the same reports',
  here.slice().sort(), there.slice().sort());
is('and there are three of them', here.length, 3);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
