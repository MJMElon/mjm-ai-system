/* TRANSPLANT DETAILS IS THE BATCH REPORT'S OWN SPLIT, NOT A SUM.

   The three columns mirror the batch report's allocation engine:

     Total Transplant Qty   every main-plot transplant
     Transplant Qty         the batch report's Main Plot card
     Double Tone            its Main Plot (D-Tone) card

   The last two are DISJOINT halves of the first: a Transplanted row is a
   main-plot transplant whatever tray it came out of, and the ones that came
   out of the DOUBLE-TONE tray are the ones that had the treatment. That is
   `calcTransplanting` in operation_batch_detail.html, whose own comment says
   the two tiles are disjoint "so the two tiles add up to the total main-plot
   population (totalMain)".

   The first version added the transplant quantity to the admin-keyed Double
   Tone Quantity in Nursery instead. BATCH 276 is what that looked like:
   nothing transplanted, 100% still pending on its own batch report, and a
   Total Transplant Qty of 3 — because somebody had keyed 3 into the Quantity
   in Nursery box. Three seedlings transplanted, on a batch that had
   transplanted none.

   THREE numbers wear the name Double Tone and this test keeps a batch with
   all three, because only one of them is the column:

     the D-Tone-sourced main-plot transplant   THE COLUMN
     DTone_Nursery_Qty                         what is STANDING, keyed by an
                                               admin. Still read, still
                                               newest-wins, still verified,
                                               and not a column.
     Transplanted_DoubleTone                   the transplant INTO the d-tone
                                               tray. Those seedlings leave it
                                               again as ordinary Transplanted
                                               rows, which is why counting it
                                               here would count them twice.

   The REAL builder is lifted out of operation_reports.html, and so is the
   REAL tray matcher. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');
const i = src.indexOf('async function _losBuildAllRows(asAt) {');
const body = src.slice(src.indexOf('  // ── One row per batch ──', i),
                       src.indexOf('  // Years/suppliers offered by their pickers', i));

const L = (o) => Object.assign({ plot_name: 'Pre-Nursery', quantity_change: 0, remark: '' }, o);

const logs = [
  /* 300 — all three numbers at once. 9,608 into main plots out of ordinary
     PN trays, 96 more into main plots out of the DOUBLE-TONE tray, 1,250
     keyed as standing in the nursery, and 40 pushed into the d-tone tray. */
  L({ batch_name: '300', breed_name: 'IOI DxP HYBRID', transaction_type: 'Seeds_Received',
      transaction_date: '2026-01-05', created_at: '2026-01-05T00:00:00Z', quantity_change: 10000,
      remark: 'Seeds received. DO_Qty: 10000.' }),
  L({ batch_name: '300', transaction_type: 'Planted', transaction_date: '2026-01-06', quantity_change: 10000 }),
  L({ batch_name: '300', transaction_type: 'Transplanted', transaction_date: '2026-03-01',
      plot_name: 'U3', quantity_change: 9608,
      remark: 'Transplanted from tray [P1] to Main Plot [U3]. Date: 2026-03-01' }),
  L({ batch_name: '300', transaction_type: 'Transplanted', transaction_date: '2026-03-02',
      plot_name: 'U4', quantity_change: 96,
      remark: 'Transplanted from tray [DOUBLE-TONE] to Main Plot [U4]. Date: 2026-03-02' }),
  L({ batch_name: '300', transaction_type: 'Transplanted_DoubleTone', transaction_date: '2026-02-20',
      plot_name: 'DOUBLE-TONE', quantity_change: 40,
      remark: 'Moved from tray [P1] to DOUBLE-TONE tray. Date: 2026-02-20' }),
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

  /* 276 — the office batch this was raised on, with its real figures:
     10,097 planted, nothing transplanted, and 3 keyed into the Quantity in
     Nursery box. All three Transplant Details columns must read nought. */
  L({ batch_name: '276', breed_name: 'AA Hybrida 1S', transaction_type: 'Seeds_Received',
      transaction_date: '2026-09-16', created_at: '2026-09-16T00:00:00Z', quantity_change: 10500,
      remark: 'Seeds received. Supplier: Applied Agricultural Resources Sdn. Bhd. DO_Qty: 10000. Incl. 5% FOC.' }),
  L({ batch_name: '276', transaction_type: 'Damaged_Seeds', transaction_date: '2026-09-16', quantity_change: -398 }),
  L({ batch_name: '276', transaction_type: 'Planted', transaction_date: '2026-09-16', quantity_change: 10097 }),
  L({ batch_name: '276', transaction_type: 'DTone_Nursery_Qty', transaction_date: '2026-09-17',
      created_at: '2026-09-17T00:00:00Z', quantity_change: 3 }),

  // 303 — ONLY a d-tone TRAY transplant. Still a batch, and still nought.
  L({ batch_name: '303', transaction_type: 'Transplanted_DoubleTone', transaction_date: '2026-05-01',
      plot_name: 'DOUBLE-TONE', quantity_change: 40,
      remark: 'Moved from tray [P9] to DOUBLE-TONE tray. Date: 2026-05-01' }),

  /* 304 — the tray written another way. The match is on letters and digits,
     so "Double Tone" and DOUBLE-TONE are the same tray and a stray space or
     dash cannot drop a row out of the column it belongs in. */
  L({ batch_name: '304', transaction_type: 'Transplanted', transaction_date: '2026-06-01',
      plot_name: 'U9', quantity_change: 120,
      remark: 'Transplanted from tray [Double Tone] to Main Plot [U9]. Date: 2026-06-01' }),
];

const fn = new Function('asAt','logsRes','dosRes','_logDate','_mvBatchKey','nurseryOf',
  'PRE_NURSERY_PLOTS','_losAgeMonths','_losAgeLabel','_RE_LOS_SUPPLIER','_RE_LOS_MPOB',
  '_RE_LOS_DONO','_RE_LOS_DO_QTY','_RE_LOS_FOC_PCT','_RE_LOS_REPL','_RE_LOS_FROM_TRAY',
  '_RE_LOS_FROM_PLOT','_RE_LOS_APPROVED','_RE_LOS_CAL_REPORT','_RE_LOS_CAL_SIDE','_losTrayKey','_LOS_CAL_SEED_REPORTS',
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
    grab('_RE_LOS_CAL_REPORT'), grab('_RE_LOS_CAL_SIDE'), grab('_losTrayKey'), grab('_LOS_CAL_SEED_REPORTS'));
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

console.log('\n── Batch 276, the one this was raised on ──');
/* Its batch report reads MAIN PLOT 0, MAIN PLOT (D-TONE) 0, PENDING 10,100
   at 100%. Nothing has been transplanted, so nothing may appear in any of
   the three columns — whatever is in the Quantity in Nursery box. */
is('Total Transplant Qty', B['276'].transTotal, 0);
is('Transplant Qty',       B['276'].transMain,  0);
is('Double Tone',          B['276'].transDtone, 0);
is('while the keyed Quantity in Nursery is still read', B['276'].dtone, 3);
is('and it is still listed behind the row',             B['276'].rec.dtone.length, 1);
is('the batch is on the report as usual',               B['276'].planted, 10097);

console.log('\n── A batch with all three Double Tone numbers ──');
is('the column is the D-Tone-sourced main-plot transplant', B['300'].transDtone, 96);
is('Transplant Qty is the rest of the main-plot transplant', B['300'].transMain, 9608);
is('and the total is every main-plot transplant',            B['300'].transTotal, 9608 + 96);
is('the two halves add up to the total',
  B['300'].transMain + B['300'].transDtone, B['300'].transTotal);
is('the keyed Quantity in Nursery is NOT in any of them',    B['300'].dtone, 1250);
is('nor is the transplant INTO the d-tone tray',             B['300'].dtoneTray, 40);
/* Those two are kept, counted and named in the row verdict precisely so that
   leaving them out of the column is a decision rather than a loss. */
is('both are still listed behind the row',
  [B['300'].rec.dtone.length, B['300'].rec.dtoneTray.length], [1, 1]);

console.log('\n── And the Balance follows the total, never the keyed box ──');
// 9,704 transplanted, nothing culled in the field, nothing sold.
is('Balance is the main-plot transplant', B['300'].balance, 9608 + 96);
is('276 has transplanted nothing, so its Balance is nought', B['276'].balance, 0);

console.log('\n── The tray is matched on letters and digits ──');
is('"Double Tone" is the DOUBLE-TONE tray', B['304'].transDtone, 120);
is('so none of it falls into Transplant Qty', B['304'].transMain, 0);

console.log('\n── A batch whose only movement is INTO the d-tone tray ──');
is('is still a batch',                  !!B['303'], true);
is('with a Double Tone column of nought', B['303'].transDtone, 0);
is('and a total of nought',               B['303'].transTotal, 0);
is('its tray transplant still recorded',  B['303'].dtoneTray, 40);

console.log('\n── The keyed Quantity in Nursery keeps its own rules ──');
is('keyed twice, the newest is the figure', B['301'].dtone, 760);
is('both keyings are still listed',         B['301'].rec.dtone.length, 2);
is('and the report can say there were two', B['301'].dtRows, 2);

console.log('\n── The As At date cuts a keying off like any other line ──');
// 301 was keyed on 1 April and corrected on 9 April.
const early = build('2026-04-05');
is('as at 5 Apr the correction has not happened', early['301'].dtone, 800);
is('and only the first keying is listed',         early['301'].rec.dtone.length, 1);

console.log('\n── What signs each figure off ──');
is('all three columns are the transplanting stage',
  /const LOS_TRANSTOTAL_GROUPS = \(r\) => \['transplanting'\]/.test(src), true);
is('the keyed box keeps its own group',
  /DTone_Nursery_Qty:\s*'dtone'/.test(src), true);
is('signed off on the Transplanting tab',
  /dtone: 'transplanting'/.test(src), true);
is('under the box own row key, not a plot',
  /rowKey = 'DTONE-NURSERY-QTY'/.test(src), true);

console.log('\n── The split is read off the batch report, not re-derived ──');
is('the Double Tone column opens the D-Tone-sourced transplants',
  /dtone: \{ title: 'Double Tone \(Main Plot, out of the D-Tone tray\)', list: 'transDtone'/.test(src), true);
is('and the total opens every main-plot transplant',
  /transTotal: \{ title: 'Total Transplant Qty', list: 'trans'/.test(src), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
