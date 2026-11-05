/* A PHONE RECORD RAISES AN AUDIT ONLY ONCE THE CONDUCTOR HAS VERIFIED IT.
 *
 * The office looked at the auditor board -- 77 weeding chips on one day,
 * with B06 three times and U02 seven -- and asked where they all came from:
 * "it should be shown here after FC verified the job".
 *
 * They were right. A maintenance record saved on a phone is a CLAIM until a
 * Field Conductor presses Verify, and the conductor can also SEND IT BACK.
 * The board asked for neither column, so it raised a task for all three
 * states at once, and the rejected record and the one the worker keyed again
 * to replace it both wore a chip for the same morning.
 *
 * The office's own Work Maintenance page has always read the verified ones
 * only. This holds the same rule, one screen along:
 *
 *   - a VERIFIED record raises its task;
 *   - one nobody has checked yet raises none;
 *   - one the conductor REJECTED raises none, ever;
 *   - a database with no such columns behaves exactly as this page did
 *     before the gate, rather than emptying the board (fail OPEN);
 *   - the OFFICE SCHEDULE half is untouched -- it has no Verify of its own,
 *     and the counts the gate drops are on the Diagnostics box so the
 *     office can see what moved.
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_phone_record_waits_for_the_conductor.cjs
 */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT  = path.resolve(__dirname, '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

let pass = 0, fail = 0;
const check = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name
    + '\n         got  ' + JSON.stringify(got)
    + '\n         want ' + JSON.stringify(want)); }
};

const NOW = new Date();
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')
                 + '-' + String(d.getDate()).padStart(2,'0');
/* Two months back, so weeding's 3-day window has long closed whatever day
   this runs -- the same anchor the close test uses. */
const LONG_AGO = iso(new Date(NOW.getFullYear(), NOW.getMonth() - 2, 5));

/* One plot per state, so a row surviving the wrong gate is caught by NAME
   and not by a count. */
const FIELD = [
  { id: 7001, work_date: LONG_AGO, nursery_name:'UNN 2', plot_name:'N01', work_type:'weeding',
    jenis:'Merumput', verified_at: LONG_AGO + 'T02:00:00Z', rejected_at: null },
  { id: 7002, work_date: LONG_AGO, nursery_name:'UNN 2', plot_name:'N02', work_type:'weeding',
    jenis:'Merumput', verified_at: null, rejected_at: null },
  { id: 7003, work_date: LONG_AGO, nursery_name:'UNN 2', plot_name:'N03', work_type:'weeding',
    jenis:'Merumput', verified_at: null, rejected_at: LONG_AGO + 'T03:00:00Z' },
  /* The shape that put one morning on the board twice: the conductor sent
     7004 back and the worker keyed 7005 in its place. Only the second is
     work anybody owes an audit on. */
  { id: 7004, work_date: LONG_AGO, nursery_name:'UNN 2', plot_name:'N04', work_type:'weeding',
    jenis:'Merumput', verified_at: null, rejected_at: LONG_AGO + 'T03:00:00Z' },
  { id: 7005, work_date: LONG_AGO, nursery_name:'UNN 2', plot_name:'N04', work_type:'weeding',
    jenis:'Merumput', verified_at: LONG_AGO + 'T04:00:00Z', rejected_at: null }
];
/* ── AND THE OTHER HALF OF THE QUESTION ──
   "check if auditor audited and saved the x plot, the x plot will no more
   shown in to do list right". N06 is a verified record an auditor HAS
   walked and saved, and N07 is one an admin closed with the cross. Neither
   belongs on the board, and the only thing that takes either off is the
   row in audit_maintenance_audits carrying its task id -- which is why
   both are driven here rather than taken on trust. */
const FIELD_DONE = [
  { id: 7006, work_date: LONG_AGO, nursery_name:'UNN 2', plot_name:'N06', work_type:'weeding',
    jenis:'Merumput', verified_at: LONG_AGO + 'T02:00:00Z', rejected_at: null },
  { id: 7007, work_date: LONG_AGO, nursery_name:'UNN 2', plot_name:'N07', work_type:'weeding',
    jenis:'Merumput', verified_at: LONG_AGO + 'T02:00:00Z', rejected_at: null }
];
const AUDITS = [
  { audit_id:'MTA-1', task_id: 7006, nursery:'UNN2', plot:'N06', task_type:'Weeding',
    result:'Satisfactory',    auditor_name:'Main Nursery Auditor', date: LONG_AGO },
  { audit_id:'MTA-CL7007', task_id: 7007, nursery:'UNN2', plot:'N07', task_type:'Weeding',
    result:'Closed by admin', auditor_name:'Esther',               date: LONG_AGO }
];

/* The office schedule half, which has no Verify of its own and must not be
   quietly gated on one. */
const OFFICE = [
  { id: 7900001, plot: 'N05', jenis: 'Merumput',
    tarikh: LONG_AGO.slice(8,10) + '-' + LONG_AGO.slice(5,7) + '-' + LONG_AGO.slice(0,4) }
];

(async () => {
  await new Promise((r) => server.listen(8781, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  /* The page registers a service worker, and page.route does NOT reach a
     fetch the WORKER makes -- it answers its own synthetic 503 and the
     board reloads empty, which reads exactly like a gate that took
     everything away. The close test already had to learn this. */
  const ctx  = await browser.newContext({ viewport:{ width:1100, height:1600 },
                                          serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { fail++; console.log('  [page error] ' + e.message); });

  let noCols = false;
  const tableOf = (url) => { const m = /\/rest\/v1\/([a-z0-9_]+)/i.exec(url); return m ? m[1] : ''; };
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const t   = tableOf(req.url());
    const sel = new URL(req.url()).searchParams.get('select') || '';
    /* PostgREST refuses the WHOLE read on a column it has not got, which
       is the one thing the fail-open branch exists for. */
    if (noCols && t === 'nops_maint_field_records' && /verified_at/.test(sel)) {
      return route.fulfill({ status: 400, contentType: 'application/json',
        body: JSON.stringify({ code: '42703',
          message: 'column nops_maint_field_records.verified_at does not exist' }) });
    }
    const body = t === 'nops_maint_field_records'  ? FIELD.concat(FIELD_DONE)
               : t === 'nops_maint_records'        ? [{ records: OFFICE }]
               : t === 'audit_maintenance_audits'  ? AUDITS
               : [];
    return route.fulfill({ status: 200, contentType: 'application/json',
                           body: JSON.stringify(body) });
  });
  await page.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ access_token:'x', user:{ id:'u1' } }) }));
  ['**cdn.tailwindcss.com/**','**cdn.jsdelivr.net/**'].forEach(pat =>
    page.route(pat, r => r.fulfill({ status:200, contentType:'text/javascript', body:'' })));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));

  await page.addInitScript(() => {
    const u = { id:'u1', email:'a@mjmnursery.com', name:'Esther', full_name:'Esther',
                role:'admin', audit_role:'admin',
                permissions: { audit_landing:'MN', modules: { audit: 'admin' } } };
    try {
      localStorage.clear();
      localStorage.setItem('mjm_user', JSON.stringify(u));
      localStorage.setItem('mjm_nursery_scope:u1', 'MN');
      localStorage.setItem('sb-kibqjztozokohqmhqqqf-auth-token', JSON.stringify({
        access_token:'x', refresh_token:'y',
        expires_at: Math.floor(Date.now()/1000) + 86400, user:{ id:'u1', email:u.email } }));
    } catch (e) {}
  });

  const plots = () => page.evaluate(() =>
    [...document.querySelectorAll('#todo-section .tl-wt-plots .tl-plot')]
      .map(a => a.textContent.trim()));

  /* \u2500\u2500 1. the three states \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  console.log('\nA claim is not an audit task until somebody checks it');
  await page.goto('http://localhost:8781/audit/audit_home.html', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(6000);
  const seen = await plots();
  console.log('on the board   :', JSON.stringify(seen));
  check('the verified record puts its plot on the board', seen.includes('N01'), true);
  check('the one nobody has checked does not', seen.includes('N02'), false);
  check('the one the conductor sent back does not', seen.includes('N03'), false);
  /* N04 carries TWO records -- one the conductor sent back and the one the
     worker keyed to replace it -- and N01 carries one. The board draws the
     same plot once per occurrence row it puts up, so the test is that the
     two plots appear the SAME number of times: counting chips outright
     would be counting rows. */
  check('a rejected record and its replacement are ONE chip, not two',
        seen.filter((x) => x === 'N04').length,
        seen.filter((x) => x === 'N01').length);
  check('and the office schedule half is untouched', seen.includes('N05'), true);

  /* \u2500\u2500 2. a plot that WAS audited leaves the list \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  console.log('\nA plot somebody audited and saved is off the list');
  check('an audited plot is no longer on the to do list', seen.includes('N06'), false);
  check('nor is one an admin closed with the cross', seen.includes('N07'), false);
  /* The control. Without it the two checks above pass just as green on a
     board that drew nothing at all. */
  check('while the one nobody answered is still there', seen.includes('N01'), true);

  /* \u2500\u2500 3. fail OPEN on a database without the columns \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
  console.log('\nA database that has not got the columns keeps its board');
  noCols = true;
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(6000);
  const open = await plots();
  console.log('on the board   :', JSON.stringify(open));
  check('every record raises a task again, rather than none',
        ['N01','N02','N03','N04','N05'].every((x) => open.includes(x)), true);

  await browser.close();
  server.close();
  console.log('');
  console.log(fail ? fail + ' FAILED  (' + pass + ' ok)' : 'all good  (' + pass + ' ok)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
