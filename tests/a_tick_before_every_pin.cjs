/* Verify AL, Cancel / Restore AL and Delete DO / BA were guarded by the
   Master PIN alone, and the PIN is written into the pages where anybody can
   read it with Inspect. Each is now a tick in Operation > User Access,
   asked BEFORE the PIN (which stays as the office's second lock).

   Two things are held here:
     1. who the three new ticks answer yes for, on a row saved before they
        existed, on a legacy row, and on a row that ticks them — through the
        shipped shared_access.js;
     2. in each of the five pages the tick is asked before the PIN prompt,
        and refuses if the access helper never loaded.

   The database asks the same question in public.mjm_can(); change one,
   change the other. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let fails = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : ' FAIL ') + m); if (!c) fails++; };

async function access(perms) {
  const store = {};
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, key: () => null, length: 0 };
  const ctx = { window: {}, console: { log() {}, warn() {}, info() {}, error() {} }, localStorage: ls, sessionStorage: ls, Date, JSON, setTimeout };
  ctx.global = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared', 'shared_access.js'), 'utf8'), ctx);
  const A = ctx.window.MJMAccess;
  const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return Promise.resolve({ data: { permissions: perms }, error: null }); }, single() { return q.maybeSingle(); } };
  await A.load({ auth: { getSession: async () => ({ data: { session: { user: { id: 'u' + Math.random() } } } }) }, from: () => q });
  return A;
}

(async () => {
  console.log('\n1. Who the new ticks answer for');
  const NEW = ['al_verify', 'al_cancel', 'delete'];
  const cases = [
    ['an Operation admin saved before the ticks existed', { modules: { operation: 'admin' }, operation_actions: { orders: { view: true, manage: true } } }, true],
    ['a normal user saved before the ticks existed',      { modules: { operation: 'normal' }, operation_actions: { orders: { view: true, manage: true } } }, false],
    ['an Operation admin never saved here',               { modules: { operation: 'admin' } }, true],
    ['a normal user never saved here',                    { modules: { operation: 'normal' } }, false],
    ['a normal user with all three ticked',               { modules: { operation: 'normal' }, operation_actions: { orders: { view: true, al_verify: true, al_cancel: true, delete: true } } }, true],
    ['an admin with all three UNticked',                  { modules: { operation: 'admin' }, operation_actions: { orders: { view: true, al_verify: false, al_cancel: false, delete: false } } }, false],
    ['ticked, but the page itself locked',                { modules: { operation: 'admin' }, operation_actions: { orders: { view: false, al_verify: true, al_cancel: true, delete: true } } }, false],
    ['ticked, but the module closed on the portal',       { modules: { operation: 'none' }, operation_actions: { orders: { view: true, al_verify: true, al_cancel: true, delete: true } } }, false],
  ];
  for (const [label, perms, want] of cases) {
    const A = await access(perms);
    const got = NEW.map(a => A.canDoOperation('orders', a));
    check(got.every(g => g === want), label + ': ' + (want ? 'yes' : 'no') + ' (' + got.join(', ') + ')');
  }

  console.log('\n2. In every page the tick comes first, then the PIN');
  const sites = [
    ['operation_booking.html', 'async function verifyAL()',   "'al_verify'", 'Enter Admin PIN to Verify:'],
    ['operation_booking.html', 'async function cancelAL()',   "'al_cancel'", 'Enter Master PIN to Cancel AL:'],
    ['operation_booking.html', 'async function restoreAL()',  "'al_cancel'", 'Enter Master PIN to Restore AL:'],
    ['operation_ba.html',      'async function deleteBA()',   "'delete'",    'Enter Master PIN to delete BA:'],
    ['operation_delivery.html', 'Enter Master PIN to delete DO:', "'delete'", 'Enter Master PIN to delete DO:'],
  ];
  for (const [file, anchor, tick, pin] of sites) {
    const src = fs.readFileSync(path.join(ROOT, 'operation', file), 'utf8');
    const pinAt = src.indexOf(pin);
    const start = anchor === pin ? src.lastIndexOf('function', pinAt) : src.indexOf(anchor);
    const body = src.slice(start, pinAt);
    const gate = "typeof MJMAccess === 'undefined' || !MJMAccess.requireOperationAction('orders', " + tick + ')';
    check(start !== -1 && pinAt > start && body.includes(gate), file + ' ' + pin.replace(/:$/, '') + ': ' + tick + ' asked first, and refuses with no helper');
  }

  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
