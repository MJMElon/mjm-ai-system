/* A DO IS PAID TO THE GANG THAT LOADED IT.

   worked_by_by_nursery is keyed by the GANG. October 2026 had two UNN 2 DOs
   off N16 (DO-NPGCE401 400, DO-0HVUL302 300) loaded by the UNN 1 gang and
   ticked under UNN1. The Loading Seedlings sheet and the claim asked only the
   plot nursery, so both DOs were on the UNN 2 sheet with nobody ticked and
   paid to nobody. The office own Loading Seedling Payroll pays them to the
   UNN 1 gang.

   Drives the SHIPPED doLoaderQty, and checks both readers call it.
   Run: node tests/a_do_is_paid_to_the_gang_that_loaded_it.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

let bad = 0;
const is = (g, w, m) => { const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) console.log('ok    ' + m); else { bad++; console.log('FAIL  ' + m + '\n      got  ' + a + '\n      want ' + b); } };

const ctx = vm.createContext({});
vm.runInContext(R('shared/shared_maint_plots.js'), ctx);
const P = ctx.MJMMaintPlots;
const q = (d, lines, n) => (P.doLoaderQty ? P.doLoaderQty(d, n, lines) : 'no doLoaderQty');
const UNN1 = ['Haerul', 'Hamzan Wadi', 'Mahnum', 'Mahsiruddin', 'Muazzin', 'Muhamad Fauzan', 'Repi', 'Wina'];

console.log('\n-- 1. The office case: a UNN 2 DO the UNN 1 gang loaded --');
{
  const d = { do_number: 'DO-NPGCE401', worked_by_by_nursery: { UNN1: UNN1 } };
  const lines = [{ nursery: 'UNN2', qty: 400 }];
  is(q(d, lines, 'UNN1'), 400, 'the UNN 1 gang is paid the 400 it loaded');
  is(q(d, lines, 'UNN2'), 0, 'and the UNN 2 sheet does not carry it with nobody ticked');
}

console.log('\n-- 2. Where the plot nursery gang is ticked, nothing moves --');
{
  const d = { worked_by_by_nursery: { UNN2: ['Anton'], UNN1: ['Repi'] } };
  const lines = [{ nursery: 'UNN2', qty: 300 }];
  is([q(d, lines, 'UNN2'), q(d, lines, 'UNN1')], [300, 0], 'the plot nursery gang keeps it');
}

console.log('\n-- 3. Nobody ticked: it stays on its own sheet as a question --');
{
  const d = { worked_by_by_nursery: { UNN1: [] } };
  const lines = [{ nursery: 'BNN', qty: 50 }];
  is([q(d, lines, 'BNN'), q(d, lines, 'UNN1')], [50, 0], 'an unticked DO is the plot nursery row');
}

console.log('\n-- 4. Two other gangs ticked: one line, never paid twice --');
{
  const d = { worked_by_by_nursery: { UNN1: ['Repi'], BNN: ['Yuyak'] } };
  const lines = [{ nursery: 'UNN2', qty: 100 }];
  is([q(d, lines, 'UNN1'), q(d, lines, 'BNN'), q(d, lines, 'UNN2')], [50, 50, 0], 'the line is divided, adding to 100');
}

console.log('\n-- 5. A DO over two nurseries, each line on its own --');
{
  const d = { worked_by_by_nursery: { BNN: ['Yuyak'] } };
  const lines = [{ nursery: 'BNN', qty: 60 }, { nursery: 'UNN2', qty: 40 }];
  is([q(d, lines, 'BNN'), q(d, lines, 'UNN2')], [100, 0], 'the BNN gang carried both lines');
}

console.log('\n-- 6. Both readers ask it --');
is(/MJMMaintPlots\.doLoaderQty\(d, n, _doLines\(d\)\)/.test(R('nursery_ops/plot_maintenance_script.js')), true,
   'the Loading Seedlings sheet lists the DOs a gang carried');
is(/MJMMaintPlots\.doLoaderQty\(do_, nursery, maintDoLines\(do_\)\)/.test(R('npayroll/npayroll_script.js')), true,
   'and the claim pays them by the same rule');

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
