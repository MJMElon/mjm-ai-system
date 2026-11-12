/* RE-OPENING A MONTH KEEPS ITS VERIFICATIONS.

   Payroll Lock Controls used to delete every sheet verification of a month
   when the month was re-opened. The office asked for the opposite: a sheet
   they verified stays verified and closed, and is taken back one sheet at a
   time with the Unlock on its own strip.

   Drives the SHIPPED toggleLockMonth with a stub lock module and asserts no
   unverify is called, and the shipped isSheetLocked still closes a verified
   sheet in an open month.
   Run: node tests/reopening_a_month_keeps_its_verifications.cjs */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
let bad = 0;
const ok = (c, m) => { if (c) console.log('ok    ' + m); else { bad++; console.log('FAIL  ' + m); } };

const SRC = R('npayroll/npayroll_script.js');
function lift(name) {
  const i = SRC.indexOf('async function ' + name + '(');
  if (i < 0) return null;
  let d = 0, j = SRC.indexOf('{', SRC.indexOf(')', i));
  for (; j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}' && --d === 0) break; }
  return SRC.slice(i, j + 1);
}

console.log('\n-- 1. Re-opening a locked month --');
{
  const calls = { unverify: 0, override: [] , confirms: [] };
  const ctx = vm.createContext({
    LOCK_MONTHS: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    _lockYear: 2026, userEmail: 'office', _supabase: {},
    mayDo: () => true, alert: () => {},
    confirm: (t) => { calls.confirms.push(t); return true; },
    renderLockCalendar: () => {}, refreshPayrollTab: () => {},
    MJMPayrollLock: {
      isMonthLocked: () => true,
      verificationsFor: () => [{ month: '2026-10', sheet: 'maint', scope: 'BNN' }, { month: '2026-10', sheet: 'transpl', scope: '' }],
      setManualOverride: async (s, y, m, v) => { calls.override.push([y, m, v]); return null; },
      unverify: async () => { calls.unverify++; return null; }
    }
  });
  const fn = lift('toggleLockMonth');
  ok(!!fn, 'toggleLockMonth is in the shipped file');
  vm.runInContext(fn + '\nglobalThis.__t = toggleLockMonth;', ctx);
  ctx.__t(10).then(() => {
    ok(calls.override.length === 1 && calls.override[0][2] === false, 'the month is re-opened');
    ok(calls.unverify === 0, 'and NO verification is taken back');
    ok(/stay verified and closed/.test(calls.confirms[0] || ''), 'the confirm says the sheets stay verified');

    console.log('\n-- 2. A verified sheet in an open month is still shut --');
    const lctx = vm.createContext({ window: {} });
    vm.runInContext(R('shared/shared_npayroll_lock.js'), lctx);
    const L = lctx.window.MJMPayrollLock || lctx.MJMPayrollLock;
    ok(/isMonthLockedStr\(ym\) \|\| !!verificationOf\(ym, sheet, scope\)/.test(R('shared/shared_npayroll_lock.js')),
       'isSheetLocked asks the month OR the verification');
    ok(!!L, 'lock module loads');

    console.log('\n-- 3. The Lock Controls note says so --');
    ok(/keeps every verification on it/.test(SRC), 'the note under the calendar says verifications are kept');
    ok(!/takes back every verification/.test(SRC), 'and no longer says they are taken back');

    console.log(bad ? `\n${bad} FAILED` : '\nall passed');
    process.exit(bad ? 1 : 0);
  });
}
