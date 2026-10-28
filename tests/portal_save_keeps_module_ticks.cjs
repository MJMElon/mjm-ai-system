/* Saving a person on the portal User Access page writes normPerms() back
   whole. It used to rebuild the permissions from a short list of keys, so
   every save there silently threw away what the OTHER User Access pages had
   set — scan_actions / scan_areas (FC Portal), nursery_ops_*, npayroll_*,
   audit_pages / audit_actions, every *_nurseries limit — and the super admin
   flag. This lifts the shipped normPerms and holds it to keeping them. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'user_access.html'), 'utf8');
function lift(name) {
  const at = src.indexOf('function ' + name + '(');
  let depth = 0, i = src.indexOf('{', at);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(at, i + 1);
}
const ctx = {};
vm.createContext(ctx);
vm.runInContext("const LEVELS = ['admin','normal','none'];\n" + lift('defaultPerms') + '\n' + lift('normPerms') + '\nthis.normPerms = normPerms;', ctx);
let fails = 0;
const check = (c, m) => { console.log((c ? '  ok  ' : ' FAIL ') + m); if (!c) fails++; };
const saved = {
  modules: { operation: 'admin', scan: 'normal', bogus: 'super' },
  manage_users: true, super_admin: true,
  scan_actions: { do: { view: true } }, scan_areas: { fc: true }, scan_area_nurseries: { fc: ['UNN 1'] },
  nursery_ops_actions: { maintenance: { view: true, edit_schedule: false } },
  npayroll_actions: { workers: { view: true } },
  audit_pages: { plot: 'edit' }, audit_actions: { plot: { save: true } },
  operation_actions: { orders: { view: true, al_verify: true } },
  plot_status_nurseries: ['BNN'],
};
const out = ctx.normPerms(JSON.parse(JSON.stringify(saved)));
for (const k of ['scan_actions', 'scan_areas', 'scan_area_nurseries', 'nursery_ops_actions', 'npayroll_actions', 'audit_pages', 'audit_actions', 'operation_actions', 'plot_status_nurseries']) {
  check(JSON.stringify(out[k]) === JSON.stringify(saved[k]), k + ' survives a save on the portal page');
}
check(out.super_admin === true, 'the super admin flag survives');
check(out.manage_users === true, 'manage_users kept');
check(out.modules.operation === 'admin' && out.modules.scan === 'normal', 'module levels kept');
check(!('bogus' in out.modules), 'a module level that is not admin / normal / none is still tidied away');
check(out.modules.audit === 'none', 'a module nobody set reads none');
const plain = ctx.normPerms({ modules: { operation: 'normal' } });
check(!('super_admin' in plain), 'nobody is made super admin by a save');
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
