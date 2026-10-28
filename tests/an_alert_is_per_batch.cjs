/* AN ALERT IS PER BATCH, BECAUSE A PLOT CONDITION AUDIT IS.
 *
 * The back office alert board showed nothing but Papan Tanda. The office
 * asked why Plot Condition had gone quiet, and it was not a clean month:
 * every reading but one was being thrown away before any filter ran.
 *
 *   audit_script.js, in its own words: "The main nursery tracks work batch
 *   by batch: a plot holds several, each with its own age and its own
 *   audit. Pre Nursery does not work that way."
 *
 * latestPerPlot collapsed on nursery + plot alone, so a plot carrying
 * seven batches kept ONE row. A rat found on batch 253 in B01 vanished the
 * moment batch 268 was saved and came back clean -- and because a plot's
 * batches go up in ONE insert (the batch queue holds them until the last
 * one), which row survived was not even the latest reading. Papan Tanda
 * was unaffected and that is why it was the only thing left: one sign per
 * plot, so the plot really is the unit.
 *
 * Drives the SHIPPED latestPerPlot out of audit/audit_admin.html.
 *
 * Run: node tests/an_alert_is_per_batch.cjs
 * No build, no server and no browser needed.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HOME = fs.readFileSync(
  path.join(__dirname, '..', 'audit/audit_admin.html'), 'utf8');

let failed = 0;
const ok   = (m) => console.log('ok    ' + m);
const fail = (m) => { console.log('FAIL  ' + m); failed++; };
const is   = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want)
  ? ok(m)
  : fail(m + '  — got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want)));

/* ── the real function, lifted ──────────────────────────────────────── */
const from = HOME.indexOf('function latestPerPlot(');
const to   = HOME.indexOf('\n}', from);
if (from < 0 || to < 0) { fail('latestPerPlot not found in the shipped page'); process.exit(1); }
const latestPerPlot = new Function(HOME.slice(from, to + 2) + '\n;return latestPerPlot;')();

/* ── 1. the main nursery: one plot, several batches ─────────────────── */
/* B01 holds three batches. One has rats. All three go up in the same
   insert, so created_at differs by milliseconds and the clean one happens
   to sort last -- which is the case that was silently losing the alert. */
const MN = [
  { nursery:'BNN', plot:'B01', batch:'253', tikus:'Banyak',    created_at:'2026-10-20T02:00:00.001Z' },
  { nursery:'BNN', plot:'B01', batch:'261', tikus:'Tidak Ada', created_at:'2026-10-20T02:00:00.002Z' },
  { nursery:'BNN', plot:'B01', batch:'268', tikus:'Tidak Ada', created_at:'2026-10-20T02:00:00.003Z' },
];
const byBatch = (r) => r.nursery + '_' + r.plot + '_' + (r.batch || '');

const kept = latestPerPlot(MN, byBatch);
is(kept.length, 3, 'a plot with three batches keeps all three readings');
is(kept.filter(r => r.tikus === 'Banyak').map(r => r.batch), ['253'],
   'so the rat on batch 253 survives to be flagged');

/* The previous behaviour, driven to show what it cost. */
const old = latestPerPlot(MN);
is(old.length, 1, 'collapsed on the plot alone it kept one row');
is(old.filter(r => r.tikus === 'Banyak').length, 0,
   'and it was the clean one -- the alert was lost before any filter ran');

/* ── 2. a batch re-audited is still only its LATEST reading ─────────── */
const AGAIN = MN.concat([
  { nursery:'BNN', plot:'B01', batch:'253', tikus:'Tidak Ada', created_at:'2026-10-27T02:00:00.000Z' },
]);
const after = latestPerPlot(AGAIN, byBatch);
is(after.length, 3, 'walking batch 253 again does not add a fourth reading');
is(after.filter(r => r.tikus === 'Banyak').length, 0,
   'and the rat clears once that batch comes back clean');

/* ── 3. papan tanda is per PLOT and must not change ─────────────────── */
const PAPAN = [
  { nursery:'PN', plot:'P16', presence:'Empty', created_at:'2026-10-02T02:00:00.000Z' },
  { nursery:'PN', plot:'P16', presence:'Good',  created_at:'2026-10-09T02:00:00.000Z' },
];
is(latestPerPlot(PAPAN).length, 1, 'one sign per plot, so one reading');
is(latestPerPlot(PAPAN)[0].presence, 'Good', 'and it is the latest one');

/* ── 4. pre nursery plot condition carries no batch ─────────────────── */
/* PN is audited plot by plot, so the rows have batch null and the key
   falls back to the plot -- the same answer it always gave. */
const PN = [
  { nursery:'PN', plot:'P16', batch:null, warna_daun:'5', created_at:'2026-10-02T02:00:00.000Z' },
  { nursery:'PN', plot:'P16', batch:null, warna_daun:'3', created_at:'2026-10-09T02:00:00.000Z' },
];
is(latestPerPlot(PN, byBatch).length, 1, 'a PN plot with no batch still collapses to one');
is(latestPerPlot(PN, byBatch)[0].warna_daun, '3', 'and keeps the latest reading');

/* ── 5. the wiring in the shipped page ──────────────────────────────── */
/* Asked of the batch alone, not of the whole column list: a new
   column has to be addable without this failing for the wrong
   reason -- adding disease broke it once. Section 6 asks for
   disease by name. */
if (/audit_plot_audits',\s*\n?\s*'select=[a-z_,]*\bbatch\b/.test(HOME)) {
  ok('the query asks for the batch it now keys on');
} else {
  fail('the plot audit query does not select batch, so the key is always blank');
}
if (/latestPerPlot\(plotRows \|\| \[\],\s*\n?\s*r => r\.nursery \+ '_' \+ r\.plot \+ '_' \+ \(r\.batch \|\| ''\)\)/.test(HOME)) {
  ok('plot condition collapses on plot AND batch');
} else {
  fail('plot condition is not keyed on the batch');
}
if (/const papan = latestPerPlot\(papanRows \|\| \[\]\);/.test(HOME)) {
  ok('and papan tanda is left on the plot, which is its real unit');
} else {
  fail('papan tanda stopped collapsing on the plot');
}
if (/const nPlots = new Set\(hits\.map\(r => r\.plot\)\)\.size;/.test(HOME)
 && /nPlots \+ ' plot'/.test(HOME)) {
  ok('the card still counts PLOTS affected, not readings');
} else {
  fail('the count says readings where it says plots');
}
if (/r\.plot \+\s*\n?\s*\(r\.batch \? ' · ' \+ r\.batch : ''\)/.test(HOME)) {
  ok('and the pill names the batch, so somebody knows which one to walk');
} else {
  fail('the pill does not name the batch, so a plot flagged on one batch reads as the whole plot');
}
if (/r\.nursery \+ '\/' \+ r\.plot \+ \(r\.batch \? '\/' \+ r\.batch : ''\)/.test(HOME)) {
  ok('a newly flagged batch on an already-flagged plot still raises a notification');
} else {
  fail('the fingerprint ignores the batch, so a second flagged batch is silent');
}

/* ── 6. disease is asked on the form and must be TESTED ─────────────── */
/* The census over the whole ledger: 76 readings of Banyak bintik and 40
   of Sedikit, 116 of the 142 ever taken, and the board tested none of
   them -- the column was not in the select. Rats and pests really are
   Tidak Ada everywhere and leaf colour never reaches 4, so disease was
   the only thing the auditors were finding and the only reason Plot
   Condition had never raised a card. */
if (/select=plot,batch,nursery,pest,tikus,disease,warna_daun,/.test(HOME)) {
  ok('the board asks the database for the disease column');
} else {
  fail('disease is not in the select, so nothing downstream can test it');
}
if (/match: plots\.filter\(r => r\.disease === 'Banyak'\)/.test(HOME)) {
  ok('and raises a card on Banyak disease');
} else {
  fail('a plot with Banyak disease still raises nothing');
}
if (/title:'Disease', note:'Banyak only'/.test(HOME)) {
  ok('the card says which threshold it is on, the same as pest');
} else {
  fail('the disease card does not name its threshold');
}
/* The sentinel must not reach it. A declined audit stores the whole
   "No Audit Required — Culling Plot" string in this column, which is not
   a reading of a disease. An EXACT equality is what keeps it out, so a
   loosened test (indexOf, a LIKE, a truthiness check) would put five
   culling plots on the board as diseased. */
{
  const diseaseTest = (rows) => rows.filter(r => r.disease === 'Banyak');
  const rows = [
    { plot:'U06', batch:'244', disease:'Banyak' },
    { plot:'U04', batch:'259', disease:'Sedikit' },
    { plot:'B02', batch:'242', disease:'Tidak Ada' },
    { plot:'B14', batch:'234', disease:'No Audit Required — Culling Plot' },
  ];
  is(diseaseTest(rows).map(r => r.plot), ['U06'],
     'Banyak is flagged, and Sedikit, Tidak Ada and a declined audit are not');
}

console.log('');
console.log(failed ? failed + ' FAILED' : 'all good');
process.exit(failed ? 1 : 0);
