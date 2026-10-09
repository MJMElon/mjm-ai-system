/* DOUBLE TONE IS THE FIGURE THE OFFICE KEYED, NOT THE TRANSPLANT INTO THE TRAY.

   The Transplanting tab carries a box headed "Double Tone Quantity in
   Nursery": an admin counts the double-tone seedlings standing in the nursery
   and keys the number, and Tabs 3 and 4 add it to the planted total to get
   their allocation base. It is stored as ONE DTone_Nursery_Qty row per batch
   and read back newest-first with `.limit(1)` -- see loadDtoneNurseryQty().

   Life of Seedlings' Double Tone column read Transplanted_DoubleTone instead:
   the transplant INTO the d-tone tray, which is a different number and is
   nought on most batches. So the report showed 0 against batches the office
   had keyed a figure for, in a column headed Double Tone.

   The two numbers are both real and they are not the same, so this test keeps
   a batch that has BOTH and checks the column takes the keyed one.

   The REAL builder is lifted out of operation_reports.html. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');
const i = src.indexOf('async function _losBuildAllRows(asAt) {');
const body = src.slice(src.indexOf('  // ── One row per batch ──', i),
                       src.indexOf('  // Years/suppliers offered by their pickers', i));

const L = (o) => Object.assign({ plot_name: 'Pre-Nursery', quantity_change: 0, remark: '' }, o);

const logs = [
  // 300 — the office keyed 1,250 double tone in the nursery, and the batch
  // also pushed 96 of its own seedlings into the d-tone tray. Two different
  // numbers, both real.
  L({ batch_name: '300', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
      transaction_date: '2026-01-05', created_at: '2026-01-05T00:00:00Z', quantity_change: 10000,
      remark: 'Seeds received. DO_Qty: 10000.' }),
  L({ batch_name: '300', transaction_type: 'Planted', transaction_date: '2026-01-06', quantity_change: 10000 }),
  L({ batch_name: '300', transaction_type: 'Transplanted_DoubleTone', transaction_date: '2026-03-01',
      plot_name: 'DOUBLE-TONE', quantity_change: 96, remark: 'from tray [P1] Date: 2026-03-01' }),
  L({ batch_name: '300', transaction_type: 'DTone_Nursery_Qty', transaction_date: '2026-03-10',
      created_at: '2026-03-10T00:00:00Z', quantity_change: 1250, remark: 'Counted on the walk' }),

  // 301 — keyed twice. The second is a CORRECTION, not a second lot.
  L({ batch_name: '301', breed_name: 'AA Hybrida 1S', transaction_type: 'Seeds_Received',
      transaction_date: '2026-02-01', created_at: '2026-02-01T00:00:00Z', quantity_change: 5000,
      remark: 'Seeds received. DO_Qty: 5000.' }),
  L({ batch_name: '301', transaction_type: 'DTone_Nursery_Qty', transaction_date: '2026-04-01',
      created_at: '2026-04-01T00:00:00Z', quantity_change: 800 }),
  L({ batch_name: '301', transaction_type: 'DTone_Nursery_Qty', transaction_date: '2026-04-09',
      created_at: '2026-04-09T00:00:00Z', quantity_change: 760 }),

  // 302 — nothing keyed. Reads nought, and is still a batch.
  L({ batch_name: '302', breed_name: 'AA Hybrida 1S', transaction_type: 'Seeds_Received',
      transaction_date: '2026-02-02', created_at: '2026-02-02T00:00:00Z', quantity_change: 4000,
      remark: 'Seeds received. DO_Qty: 4000.' }),

  // 303 — ONLY a d-tone tray transplant. Nothing keyed, so the column is
  // nought, but the batch must not vanish off the report.
  L({ batch_name: '303', transaction_type: 'Transplanted_DoubleTone', transaction_date: '2026-05-01',
      plot_name: 'DOUBLE-TONE', quantity_change: 40, remark: 'from tray [P9] Date: 2026-05-01' }),
];

const fn = new Function('asAt','logsRes','dosRes','_logDate','_mvBatchKey','nurseryOf',
  'PRE_NURSERY_PLOTS','_losAgeMonths','_losAgeLabel','_RE_LOS_SUPPLIER','_RE_LOS_MPOB',
  '_RE_LOS_DONO','_RE_LOS_DO_QTY','_RE_LOS_FOC_PCT','_RE_LOS_REPL','_RE_LOS_FROM_TRAY',
  '_RE_LOS_FROM_PLOT','_RE_LOS_APPROVED','_RE_LOS_CAL_REPORT','_RE_LOS_CAL_SIDE',
  body + '\nreturn rows;');

const grab = (name) => new Function('return ' + src.slice(
  src.indexOf('= ', src.indexOf('const ' + name + ' ')) + 2,
  src.indexOf('\n', src.indexOf('const ' + name + ' '))).replace(/;$/, ''))();

const build = (asAt) => {
  const rows = fn(asAt || '', { data: logs }, { data: [] },
    (l) => l.transaction_date || (l.created_at || '').slice(0, 10) || null,
    (b) => String(b || '').trim(), () => 'Pre-Nursery', ['Pre-Nursery'],
    () => 3, () => '3 months',
    grab('_RE_LOS_SUPPLIER'), grab('_RE_LOS_MPOB'), grab('_RE_LOS_DONO'),
    grab('_RE_LOS_DO_QTY'), grab('_RE_LOS_FOC_PCT'), grab('_RE_LOS_REPL'),
    grab('_RE_LOS_FROM_TRAY'), grab('_RE_LOS_FROM_PLOT'), grab('_RE_LOS_APPROVED'),
    grab('_RE_LOS_CAL_REPORT'), grab('_RE_LOS_CAL_SIDE'));
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

console.log('\n── A batch with BOTH figures ──');
is('Double Tone is the keyed Quantity in Nursery', B['300'].dtone, 1250);
is('not the transplant into the d-tone tray',      B['300'].dtoneTray, 96);
is('and the keying is listed behind the figure',   B['300'].rec.dtone.length, 1);
is('the tray transplant keeps its own records',    B['300'].rec.dtoneTray.length, 1);
/* The Balance is transplanting qty − 3rd culling − total sales, and 300 has
   transplanted nothing, so it is nought. The point of the assertion is that
   NEITHER double-tone number is in it: the keyed 1,250 counts seedlings
   already standing where they stand, and the 96 into the d-tone tray leaves
   again later as ordinary Transplanted rows. */
is('neither touches the Balance',                  B['300'].balance, 0);

console.log('\n── The three Transplanting Details columns ──');
// Total = Transplanting Qty + Double Tone, and the Double Tone in it is the
// KEYED figure, which is the whole of the fix above.
is('Total Transplanting Qty is the two added', B['300'].transTotal, 0 + 1250);
is('on a batch that has neither it is nought', B['302'].transTotal, 0);
is('and the tray transplant is not in it',     B['303'].transTotal, 0);

console.log('\n── Keyed twice is a correction, not a second lot ──');
is('the newest keying is the figure', B['301'].dtone, 760);
is('both keyings are still listed',   B['301'].rec.dtone.length, 2);
is('and the report can say there were two', B['301'].dtRows, 2);

console.log('\n── Nothing keyed ──');
is('reads nought', B['302'].dtone, 0);
is('and the batch is still on the report', !!B['302'], true);

console.log('\n── A batch whose only movement is into the d-tone tray ──');
is('is still a batch', !!B['303'], true);
is('with a Double Tone of nought', B['303'].dtone, 0);
is('and its tray transplant recorded', B['303'].dtoneTray, 40);

console.log('\n── The As At date cuts a keying off like any other line ──');
// 301 was keyed on 1 April and corrected on 9 April.
const early = build('2026-04-05');
is('as at 5 Apr the correction has not happened', early['301'].dtone, 800);
is('and only the first keying is listed',         early['301'].rec.dtone.length, 1);

console.log('\n── The column it is verified under ──');
is('DTone_Nursery_Qty belongs to the dtone group',
  /DTone_Nursery_Qty:\s*'dtone'/.test(src), true);
is('which is signed off on the Transplanting tab',
  /dtone: 'transplanting'/.test(src), true);
is('under the box own row key, not a plot',
  /rowKey = 'DTONE-NURSERY-QTY'/.test(src), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
