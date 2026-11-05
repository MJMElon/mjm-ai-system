/* ONE MORNING ON ONE PLOT FOR ONE JOB IS ONE CASE.
 *
 * The office, in one line: "as long as is the same work, no matter submitted
 * by how many workers, it should consider as 1 time only."
 *
 * A maintenance TASK is one work RECORD, and one morning on one plot can be
 * several of them -- a phone record per worker, plus the office schedule row
 * for the same morning. The auditor walks that plot once and saves once,
 * which answers ONE task id, so the rest kept their chips. That is what the
 * office was looking at as B06 three times and U02 seven, and it is why an
 * October plot they had audited and saved was still on the to do list.
 *
 * Driven here over ONE ledger, through BOTH REAL PAGES in a real browser,
 * because the board groups the chips and the module page groups the cards
 * and a chip that cleared on one screen while a card waited on the other
 * would be two answers again:
 *
 *   U02  seven workers and the office row, one morning   -> ONE chip, ONE card
 *   U03  two records, ONE of them audited                -> no chip at all
 *   U04  the same plot and job on TWO mornings           -> two cases, still
 *   U05  two different JOBS on one morning               -> two cases, still
 *   U06  one record, the control
 *
 * and the admin close writes ONE row for the case, not one per worker.
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/one_morning_is_one_case.cjs
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
   this runs. */
const DAY1 = iso(new Date(NOW.getFullYear(), NOW.getMonth() - 2, 5));
const DAY2 = iso(new Date(NOW.getFullYear(), NOW.getMonth() - 2, 12));
const V    = DAY1 + 'T02:00:00Z';

const fieldRow = (id, plot, wt, day, worker) => ({
  id: id, work_date: day, nursery_name: 'UNN 1', plot_name: plot, work_type: wt,
  jenis: wt === 'weeding' ? 'Merumput' : 'Membaja', chemical: '', batch_name: '',
  reported_by: worker, photo_urls: '', qty: 100, remark: '', week_no: 1,
  created_at: day + 'T05:00:00Z', verified_at: V, rejected_at: null
});

/* THE OFFICE OWN SHAPE: one plot, one job, one morning, seven workers --
   and the office schedule row for the same morning on top of it. */
const FIELD = [
  fieldRow(8001, 'U02', 'weeding', DAY1, 'Wisnu'),
  fieldRow(8002, 'U02', 'weeding', DAY1, 'Akbar'),
  fieldRow(8003, 'U02', 'weeding', DAY1, 'Lalu'),
  fieldRow(8004, 'U02', 'weeding', DAY1, 'Azhar'),
  fieldRow(8005, 'U02', 'weeding', DAY1, 'Rousell'),
  fieldRow(8006, 'U02', 'weeding', DAY1, 'Florence'),
  fieldRow(8007, 'U02', 'weeding', DAY1, 'Mashuri'),
  /* Two records, and the SECOND one carries the audit -- so the answer is
     on a record the case is not named after, which is the case a find on
     one id gets wrong. */
  fieldRow(8011, 'U03', 'weeding', DAY1, 'Wisnu'),
  fieldRow(8012, 'U03', 'weeding', DAY1, 'Akbar'),
  /* Same plot, same job, TWO mornings. Two jobs of work, two walks. */
  fieldRow(8021, 'U04', 'weeding', DAY1, 'Wisnu'),
  fieldRow(8022, 'U04', 'weeding', DAY2, 'Wisnu'),
  /* One morning, TWO jobs. */
  fieldRow(8031, 'U05', 'weeding',  DAY1, 'Wisnu'),
  fieldRow(8032, 'U05', 'manuring', DAY1, 'Wisnu'),
  /* The control: one record, one case, so whatever the board does to it is
     what it should be doing to U02. */
  fieldRow(8041, 'U06', 'weeding', DAY1, 'Wisnu')
];
const OFFICE = [
  { id: 8800001, plot: 'U02', jenis: 'Merumput', racun: '', batch: '', qty: 700,
    remark: '', checked: true,
    tarikh: DAY1.slice(8,10) + '-' + DAY1.slice(5,7) + '-' + DAY1.slice(0,4) }
];
const AUDITS = [
  { id: 1, audit_id:'MTA-1', task_id: 8012, nursery:'UNN1', plot:'U03',
    task_type:'Weeding', result:'Satisfactory', remarks:'', photo_url:null,
    auditor_name:'Main Nursery Auditor', date: DAY1, created_at: DAY1 + 'T09:00:00Z' }
];

(async () => {
  await new Promise((r) => server.listen(8787, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  /* page.route does NOT reach a fetch the service WORKER makes -- it answers
     its own synthetic 503 and the board reloads empty, which reads exactly
     like a grouping that took everything away. */
  const ctx  = await browser.newContext({ viewport:{ width:1100, height:1800 },
                                          serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { fail++; console.log('  [page error] ' + e.message); });

  const inserts = [];
  const tableOf = (url) => { const m = /\/rest\/v1\/([a-z0-9_]+)/i.exec(url); return m ? m[1] : ''; };
  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const t   = tableOf(req.url());
    if (req.method() === 'POST') {
      let body = []; try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
      (Array.isArray(body) ? body : [body]).forEach(r => inserts.push({ table: t, row: r }));
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (req.method() !== 'GET')
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const body = t === 'nops_maint_field_records' ? FIELD
               : t === 'nops_maint_records'       ? [{ id: 1, records: OFFICE, updated_at: DAY1 }]
               : t === 'audit_maintenance_audits' ? AUDITS
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

  /* Read the board one ROW at a time. The board puts up a row per deadline
     day and a today-row for anything the strict walk could not place, so a
     plot counted across the whole page is counted once per row -- which
     says nothing about whether a morning is one case. The claim is about
     ONE row: one chip for one morning on one plot for one job. */
  const rows = () => page.evaluate(() =>
    [...document.querySelectorAll('#todo-section .tl-item[data-mod="maint"]')].map(it => ({
      jobs: [...it.querySelectorAll('.tl-wt')].map(w => ({
        job:   (w.querySelector('.tl-wt-name')  || {}).textContent || '',
        count: (w.querySelector('.tl-wt-count') || {}).textContent || '',
        plots: [...w.querySelectorAll('.tl-wt-plots .tl-plot')].map(a => a.textContent.trim())
      }))
    })));
  const most = (rs, plot, job) => rs.reduce((n, r) => Math.max(n,
    r.jobs.filter(j => !job || j.job === job)
          .reduce((k, j) => k + j.plots.filter(p => p === plot).length, 0)), 0);

  /* ── 1. the office own seven workers ───────────────────────────── */
  console.log('\nSeven workers on one plot on one morning is one case');
  await page.goto('http://localhost:8787/audit/audit_home.html', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(6000);
  const R = await rows();
  console.log('maintenance rows:', JSON.stringify(R.map(r => r.jobs.map(j => j.job + ' ' + j.count))));
  check('the plot seven people weeded wears ONE chip in a row',
        most(R, 'U02'), 1);
  check('which is exactly what the one-record plot beside it wears',
        most(R, 'U06'), 1);
  check('and the count over the job agrees with the chips under it',
        R.map(r => r.jobs.map(j => j.count === String(j.plots.length))).flat()
         .every(Boolean), true);

  /* ── 2. an answer on ANY of the records answers the case ───────── */
  console.log('\nAn audit on any one of the records answers the morning');
  const all = R.map(r => r.jobs.map(j => j.plots).flat()).flat();
  check('the plot somebody audited is off the board', all.includes('U03'), false);
  /* The control. Without it the check above is just as green over a board
     that drew nothing at all. */
  check('while the ones nobody answered are still on it',
        ['U02','U04','U05','U06'].every(p => all.includes(p)), true);

  /* ── 3. what the rule must NOT merge ──────────────────────────── */
  console.log('\nTwo mornings are two cases, and so are two jobs');
  check('the same plot and job on two days is two chips',
        most(R, 'U04'), 2);
  check('one morning on two jobs is a chip under each',
        [most(R, 'U05', 'Weeding'), most(R, 'U05', 'Manuring')], [1, 1]);

  /* ── 4. the close writes ONE row for the case ──────────────────── */
  console.log('\nClosing the case writes one row, not one per worker');
  page.on('dialog', d => d.accept());
  const closed = await page.evaluate(() => {
    const x = [...document.querySelectorAll('#todo-section .tl-plot-wrap')]
      .find(w => (w.querySelector('.tl-plot') || {}).textContent.trim() === 'U02');
    if (!x) return 'no U02 chip';
    const b = x.querySelector('.tl-plot-x');
    if (!b) return 'no x on the U02 chip';
    b.click(); return 'pressed';
  });
  check('the x is on the chip', closed, 'pressed');
  await page.waitForTimeout(3000);
  const wrote = inserts.filter(i => i.table === 'audit_maintenance_audits');
  check('one closure row for the morning, not one per record', wrote.length, 1);
  check('and it names the case by its lowest record id',
        wrote.map(w => w.row.task_id), [8001]);

  /* ── 5. THE MODULE PAGE ASKS THE SAME QUESTION ─────────────────── */
  console.log('\nThe page the chip opens groups the same way');
  inserts.length = 0;
  await page.goto('http://localhost:8787/audit/audit_maintenance_index.html',
                  { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const b = document.querySelector('.nursery-tab-item[data-n="UNN1"]');
    if (b) b.click();
  });
  await page.waitForTimeout(1500);
  const cards = (sel) => page.evaluate((s) =>
    [...document.querySelectorAll(s + ' .task-card')].map(c => ({
      plot: ((c.querySelector('.task-plot')||{}).textContent || '').trim(),
      work: ((c.querySelector('.task-work')||{}).textContent || '').trim(),
      meta: ((c.querySelector('.task-meta')||{}).textContent || '').trim(),
      chips: [...c.querySelectorAll('.task-chip')].map(x => x.textContent.trim())
    })), sel);
  const pending = await cards('#pending-list');
  const done    = await cards('#done-list');
  console.log('pending cards  :', JSON.stringify(pending.map(c => c.plot + ' ' + c.work)));
  check('one card for the morning seven people worked',
        pending.filter(c => c.plot === 'U02').length, 1);
  check('and it SAYS it is eight records',
        pending.find(c => c.plot === 'U02').chips
               .some(x => /8 records, one job/.test(x)), true);
  check('naming every worker rather than one of the seven',
        /Wisnu/.test((pending.find(c => c.plot === 'U02')||{}).meta || '') &&
        /Mashuri/.test((pending.find(c => c.plot === 'U02')||{}).meta || ''), true);
  check('the audited morning is not waiting to be audited',
        pending.filter(c => c.plot === 'U03').length, 0);
  check('it is in the audited list, once', done.filter(c => c.plot === 'U03').length, 1);
  check('two mornings on one plot are two cards',
        pending.filter(c => c.plot === 'U04').length, 2);
  check('two jobs on one morning are two cards',
        pending.filter(c => c.plot === 'U05').map(c => c.work).sort(),
        ['Manuring','Weeding']);
  check('and the one-record plot is one card', pending.filter(c => c.plot === 'U06').length, 1);
  /* The board and the page have to AGREE, which is the whole reason both
     are driven here: the pending cards for UNN 1 are the cases the board
     drew chips for. */
  check('the two screens name the same cases',
        pending.filter(c => c.work === 'Weeding').map(c => c.plot).sort(),
        ['U02','U04','U04','U05','U06']);

  await browser.close();
  server.close();
  console.log('');
  console.log(fail ? fail + ' FAILED  (' + pass + ' ok)' : 'all good  (' + pass + ' ok)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
