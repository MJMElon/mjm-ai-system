/* THE MAINTENANCE LIST IS STILL THERE WHEN THE LINE IS NOT.

   Drives the SHIPPED audit_maintenance_script.js in a real browser:
   load once with a signal, pull the plug, load again. The list the
   auditor records against has to still be there, because an outbox with
   nothing to put in it is not offline support.

   On the previous code the second load threw past the whole function --
   audit_maintenance_audits carries no .catch -- and left an empty list
   under a "Failed to load" toast.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/maintenance_list_survives_no_line.cjs
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const PAGE = `<!doctype html><meta charset="utf-8"><title>maint harness</title><body>
<script>
/* Only what the loader touches. The point is loadAll, not the screen. */
window.MJMAuditSettings = { load: async()=>{}, maintDays:()=>30, WORKTYPES:['manuring','weeding','racun','interrow'], windows:()=>[] };
window.MJMAuditDeepLink = { plot:()=>null, reveal:()=>{} };
window.showToast = (m)=>{ (window.__toasts = window.__toasts || []).push(m); };
window.__online = true;
Object.defineProperty(navigator, 'onLine', { get: () => window.__online });

/* A stand-in Supabase holding one nursery of work. When the line is cut
   it behaves the way the service worker does: every read fails. */
window.__rows = {
  nops_maint_field_records: [
    { id: 1, work_date:'2026-10-01', nursery_name:'UNN 1', plot_name:'U03',
      work_type:'manuring', jenis:'Manuring', reported_by:'Andi', qty:500, week_no:1 },
    { id: 2, work_date:'2026-10-02', nursery_name:'UNN 1', plot_name:'U04',
      work_type:'weeding', jenis:'Weeding', reported_by:'Andi', qty:400, week_no:1 }
  ],
  audit_maintenance_audits: [],
  nops_maint_records: []
};
window.sb = {
  async select(table){
    if (!window.__online) throw new Error('Supabase error 503: {"error":"offline"}');
    return window.__rows[table] || [];
  },
  async insert(){ return {ok:true}; }, async update(){ return {ok:true}; }, async delete(){ return {ok:true}; }
};
</script>
<script src="/audit/audit_maintenance_script.js"></script>
<script>
/* The loader paints; this harness does not have a screen. Replace the
   painters AFTER the file has defined them. */
renderLists = function(){ window.__painted = (window.__painted||0) + 1; };
updateStats = function(){};
setLoading   = function(){};
/* The file defines its own showToast, which wants a #toast element. */
showToast    = function(m){ (window.__toasts = window.__toasts || []).push(String(m)); };
</script>
</body>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, {'Content-Type':'text/html'}); res.end(PAGE); return; }
  const f = path.join(ROOT, url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': 'text/javascript' });
  res.end(fs.readFileSync(f));
});

let failed = 0;
const fail = (m) => { console.log('FAIL  ' + m); failed++; };
const pass = (m) => console.log('pass  ' + m);

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (process.env.V) console.log('   [err]', e.message); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => typeof loadAll === 'function');

  /* 1. With a signal. */
  const withLine = await page.evaluate(async () => { await loadAll(); return tasks.length; });
  const cached = await page.evaluate(() => !!localStorage.getItem('mjm_maint_cache_v1'));
  if (!cached) fail('the list was not written to the phone after a good load');
  else pass('the list is written to the phone after a good load');
  if (withLine === 2) pass(`with a signal the auditor sees ${withLine} jobs to audit`);
  else { fail(`the harness never loaded a list with a signal (${withLine}) - nothing below means anything`);
         await browser.close(); server.close(); process.exit(1); }

  /* 2. Line cut, page opened again. */
  const offline = await page.evaluate(async () => {
    /* A FRESH PAGE LOAD with no line, which is what an auditor actually
       does: open the app in the plot, having last opened it in the
       office. Leaving the previous run in memory would pass on code that
       has no cache at all, which is exactly the bug being tested. */
    tasks = []; audits = []; unplacedTasks = [];
    window.__online = false;
    window.__toasts = [];
    await loadAll();
    return { n: tasks.length, toasts: window.__toasts };
  });
  if (offline.n === 2) {
    pass(`with NO line the auditor still sees ${offline.n} jobs - there is something to record against`);
  } else {
    fail(`with no line the list is ${offline.n} job(s) - the auditor has nothing to record against\n` +
         `      toasts: ${JSON.stringify(offline.toasts)}`);
  }

  /* 3. A reader that never had a signal still fails honestly, rather than
        showing somebody else's list. */
  const cold = await page.evaluate(async () => {
    localStorage.clear();
    /* A fresh page load: nothing in memory either. On a live reload the
       module starts with tasks = [], and a failed load leaving what is
       already on screen alone is correct -- it just is not this case. */
    tasks = [];
    window.__online = false; window.__toasts = [];
    await loadAll();
    return { n: tasks.length, toasts: window.__toasts };
  });
  if (cold.n === 0 && cold.toasts.join(' ').match(/Failed to load/i)) {
    pass('a phone that has never loaded this page says so rather than inventing a list');
  } else {
    fail(`a phone with no cache and no line should say Failed to load: ${JSON.stringify(cold)}`);
  }

  /* 4. Signal back: the live list wins again. */
  const back = await page.evaluate(async () => {
    window.__online = true;
    window.__rows.nops_maint_field_records.push({ id:3, work_date:'2026-10-03', nursery_name:'UNN 1',
      plot_name:'U05', work_type:'racun', jenis:'Racun', reported_by:'Andi', qty:300, week_no:1 });
    await loadAll();
    return tasks.length;
  });
  if (back === 3) pass('when the line returns the live list wins, cache does not stick');
  else fail(`after the line returned the list read ${back}, expected 3`);

  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} failure(s)` : '\nall good');
  process.exit(failed ? 1 : 0);
})();
