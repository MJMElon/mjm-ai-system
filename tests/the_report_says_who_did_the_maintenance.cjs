/* WHO DID THIS MAINTENANCE RECORD -- the filter, and the column.
 *
 * audit_maintenance_audits holds two different acts under one roof, and
 * that is deliberate:
 *
 *   an AUDITOR walks the plot and answers Satisfied or Unsatisfied;
 *   an ADMIN closes a cold task from the to-do board, which writes an
 *   ordinary row here with result "Closed by admin", so the closure
 *   carries a name and a date like any other record.
 *
 * The Monthly Audit Report listed both with nothing to tell them apart,
 * and the office asked for the one thing that does: "we want to filter to
 * see the cases closed by auditor, now it can view the cases closed by
 * admin also".
 *
 * Four things this holds, and the last two are the ones that go quietly
 * wrong:
 *
 *  - the two tick boxes start BOTH ticked, so the report draws exactly
 *    what it drew before until somebody unticks one;
 *  - the row is judged on its saved RESULT and never on auditor_name --
 *    an admin closure carries the admin who pressed the button, which is
 *    the point of it, so a name test would answer backwards;
 *  - every figure downstream is counted off the same narrowed list, so
 *    the summary card, the section total, the records badge and the table
 *    cannot disagree;
 *  - a narrowed table SAYS it was narrowed. Printed, this sheet is read by
 *    somebody adding up, and a maintenance table cut to one kind reads
 *    exactly like a month that only had that kind in it.
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_report_says_who_did_the_maintenance.cjs
 * Serves the repository itself; no build and no outside server needed.
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

/* THE SAME STRING audit_home.html writes. Spelled out here rather than
   lifted, so a change to it in the page fails this test by name. */
const CLOSED = 'Closed by admin';

/* Four auditor audits and three admin closures, on one nursery in one
   month -- the shape of the office screenshot, which read 1,000
   maintenance records with no way to tell the two apart. */
/* Every row carries its CASE, because the report now draws one -- and the
   three B05 rows at the end are the office own screenshot: one plot, one
   job, one day, one verdict, THREE separate work records. They are what
   made them ask twice whether the report counts a case three times, and
   they are exactly what the Case column exists to tell apart. */
const MAINT = [
  { audit_id:'MTA-1', task_id:1789024370444, nursery:'BNN', plot:'B01', task_type:'Weeding',
    result:'Satisfied',   auditor_name:'Suhaedi',  date:'2026-10-05' },
  { audit_id:'MTA-2', task_id:1789024370445, nursery:'BNN', plot:'B02', task_type:'Weeding',
    result:'Unsatisfied', auditor_name:'Suhaedi',  date:'2026-10-06' },
  { audit_id:'MTA-3', task_id:1789024370446, nursery:'BNN', plot:'B03', task_type:'P & D Spraying',
    result:'Satisfied',   auditor_name:'Ruth Wo',  date:'2026-10-07' },
  { audit_id:'MTA-4', task_id:1789024370447, nursery:'BNN', plot:'B04', task_type:'Manuring',
    result:'Satisfied',   auditor_name:'Suhaedi',  date:'2026-10-08' },
  { audit_id:'MTA-CL91', task_id:1789024370491, nursery:'BNN', plot:'B09', task_type:'Weeding',
    result:CLOSED,        auditor_name:'Elon Ting', date:'2026-10-20' },
  { audit_id:'MTA-CL92', task_id:1789024370492, nursery:'BNN', plot:'B10', task_type:'Weeding',
    result:CLOSED,        auditor_name:'Elon Ting', date:'2026-10-20' },
  { audit_id:'MTA-CL93', task_id:1789024370493, nursery:'BNN', plot:'B11', task_type:'Manuring',
    result:CLOSED,        auditor_name:'Elon Ting', date:'2026-10-20' },
  { audit_id:'MTA-5', task_id:1791248487117, nursery:'BNN', plot:'B05', task_type:'Interrow Spray',
    result:'Unsatisfied', auditor_name:'Main Nursery Auditor', date:'2026-10-22' },
  { audit_id:'MTA-6', task_id:1791248487131, nursery:'BNN', plot:'B05', task_type:'Interrow Spray',
    result:'Unsatisfied', auditor_name:'Main Nursery Auditor', date:'2026-10-22' },
  { audit_id:'MTA-7', task_id:1791248487134, nursery:'BNN', plot:'B05', task_type:'Interrow Spray',
    result:'Unsatisfied', auditor_name:'Main Nursery Auditor', date:'2026-10-22' }
];

/* ── 0. THREE FILES SPELL THIS STRING ─────────────────────────────────
   audit_home.html WRITES it on an admin closure, audit_maintenance_script
   .js colours it grey so a closed task does not read as the amber that
   means waiting, and audit_report.html now filters on it. Change one,
   change all three -- and never change the STRING itself, because a row
   written before keeps the old wording and would fall on the wrong side
   of the filter for ever. Read as source, so this holds without a
   browser. */
{
  const WHO = {
    'audit/audit_home.html':             null,
    'audit/audit_maintenance_script.js': null,
    'audit/audit_report.html':           null
  };
  for (const f of Object.keys(WHO)) {
    const m = fs.readFileSync(path.join(ROOT, f), 'utf8')
                .match(/MAINT_CLOSED_RESULT\s*=\s*'([^']*)'/);
    WHO[f] = m ? m[1] : null;
  }
  console.log('The string, in all three files');
  check('every one of the three declares it', Object.values(WHO).map((v) => v !== null),
        [true, true, true]);
  check('and all three say the same thing', [...new Set(Object.values(WHO))], [CLOSED]);
}

(async () => {
  await new Promise((r) => server.listen(8777, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', (e) => { fail++; console.log('  [page error] ' + e.message); });

  await page.addInitScript((rows) => {
    window.__MAINT = rows;
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: () => { const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve({ data: [], error: null }).then(a, b);
        return () => q; } }); return q; },
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, MAINT);

  await page.route('**/audit_login_guard.js*', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAuditLogin = { requireAdmin: () => true, user: () => ({ email: 'elon.mjm@gmail.com' }) };`
  }));
  await page.route('**/shared_access.js*', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**',
                      '**/cdn.tailwindcss.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, body: '[]' }));

  await page.goto('http://localhost:8777/audit/audit_report.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.buildModTable === 'function',
                             { timeout: 20000 });

  /* Asked as a CHECK and not as a wait. Waited on, a page without the
     filter fails with a timeout, which says nothing about what is wrong;
     named, it fails with the sentence somebody needs. */
  const wired = await page.evaluate(() => ['maintDoneBy','selectedDoneBy','filterByDoneBy']
    .filter((f) => typeof window[f] !== 'function'));
  check('the page carries the Done By filter', wired, []);
  if (wired.length) {
    await browser.close(); server.close();
    console.log('\n' + fail + ' FAILED  (' + pass + ' ok) -- nothing else can be asked');
    process.exit(1);
  }

  /* ── 1. the rule itself, on the real functions ────────────────────── */
  console.log('\nWhich act a row is');
  const kinds = await page.evaluate(() => window.__MAINT.map((r) => maintDoneBy(r)));
  check('the four audits read as the auditor', kinds.slice(0, 4),
        ['auditor', 'auditor', 'auditor', 'auditor']);
  check('and the three closures as the admin', kinds.slice(4, 7),
        ['admin', 'admin', 'admin']);
  check('and the office own three look-alikes are all auditor work',
        kinds.slice(7), ['auditor', 'auditor', 'auditor']);
  check('it is the exact string and nothing looser', await page.evaluate((c) => [
          maintDoneBy({ result: c }),
          maintDoneBy({ result: c + ' ' }),
          maintDoneBy({ result: 'closed by admin' }),
          maintDoneBy({ result: 'Satisfied' }),
          maintDoneBy({})
        ], CLOSED),
        ['admin', 'auditor', 'auditor', 'auditor', 'auditor']);

  /* THE NAME MUST NOT DECIDE. Both kinds carry one, and an admin closure
     carries the ADMIN -- so a test on auditor_name answers backwards for
     every closure, and for an auditor who is also an admin it answers
     backwards both ways. */
  check('a closure keyed by an auditor-named person is still a closure',
        await page.evaluate((c) => maintDoneBy({ result: c, auditor_name: 'Suhaedi' }), CLOSED),
        'admin');
  check('and an audit keyed by an admin is still an audit',
        await page.evaluate(() => maintDoneBy({ result: 'Satisfied', auditor_name: 'Elon Ting' })),
        'auditor');

  /* ── 2. the filter ────────────────────────────────────────────────── */
  console.log('\nThe filter');
  const f = await page.evaluate(() => ({
    both:    filterByDoneBy(window.__MAINT, ['auditor', 'admin']).map((r) => r.plot),
    auditor: filterByDoneBy(window.__MAINT, ['auditor']).map((r) => r.plot),
    admin:   filterByDoneBy(window.__MAINT, ['admin']).map((r) => r.plot),
    none:    filterByDoneBy(window.__MAINT, []).map((r) => r.plot)
  }));
  check('both ticked is every row, in the order it came',
        f.both, ['B01','B02','B03','B04','B09','B10','B11','B05','B05','B05']);
  check('AUDITOR ONLY is the office ask, and the closures are gone',
        f.auditor, ['B01','B02','B03','B04','B05','B05','B05']);
  check('admin only is the three closures', f.admin, ['B09','B10','B11']);
  check('neither ticked hides every row rather than showing every row',
        f.none, []);

  /* ── 3. the ticks, as the page ships them ─────────────────────────── */
  console.log('\nThe ticks on the screen');
  const ticks = await page.evaluate(() => {
    const row = document.getElementById('f-doneby-row');
    const cbs = [...document.querySelectorAll('.f-doneby-cb')];
    return { hiddenAtFirst: row.style.display === 'none',
             values: cbs.map((c) => c.value),
             checked: cbs.map((c) => c.checked),
             selected: selectedDoneBy() };
  });
  check('both start ticked, so the report draws what it always drew',
        ticks.checked, [true, true]);
  check('and selectedDoneBy says so', ticks.selected.sort(), ['admin', 'auditor']);
  check('the two values are the two acts', ticks.values, ['auditor', 'admin']);
  check('the row is hidden while Maintenance is not ticked', ticks.hiddenAtFirst, true);

  /* Ticking Maintenance brings the row out; unticking puts it away. A
     filter for a module that is not in the report is a control that does
     nothing. */
  const maintCb = await page.$('input.mod-cb[onchange*="maint\'"]');
  await maintCb.check();
  check('ticking Maintenance shows it',
        await page.evaluate(() => document.getElementById('f-doneby-row').style.display !== 'none'),
        true);
  await maintCb.uncheck();
  check('and unticking hides it again',
        await page.evaluate(() => document.getElementById('f-doneby-row').style.display === 'none'),
        true);
  await maintCb.check();

  /* ── 4. the column ────────────────────────────────────────────────── */
  console.log('\nThe Done By column');
  /* A RECORD IS DRAWN AS ONE BLOCK NOW, with its #, Date, Plot and Task
     merged down the side of its cases (see MOD_RECORD_KEY in the page). So
     a continuation line emits FEWER cells than the heading has columns, and
     reading `tr.children` by position answers about the wrong column on
     every line but the first.

     `grid` is the table as it READS: a rowspan carried down into the lines
     it covers, so row two of the B05 record still says B05 / Interrow
     Spray / 22 Oct, which is what somebody looking at it sees. `body` is
     the raw cells, kept so the merge itself can be asserted. */
  const t = await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = buildModTable('maint', window.__MAINT);
    document.body.appendChild(d);
    const head = [...d.querySelectorAll('thead th')].map((x) => x.textContent.trim());
    const trs = [...d.querySelectorAll('tbody tr')]
      .filter((tr) => !tr.classList.contains('total-row'));
    const body = trs.map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    const grid = [];
    const carry = {};
    trs.forEach((tr) => {
      const cells = [...tr.children];
      const row = [];
      let k = 0;
      for (let ci = 0; ci < head.length; ci++) {
        if (carry[ci] && carry[ci].left > 0) { row[ci] = carry[ci].text; carry[ci].left--; continue; }
        const td = cells[k++];
        if (!td) { row[ci] = null; continue; }
        const txt = td.textContent.trim();
        row[ci] = txt;
        const rs = parseInt(td.getAttribute('rowspan') || '1', 10);
        if (rs > 1) carry[ci] = { text: txt, left: rs - 1 };
      }
      grid.push(row);
    });
    const tags = [...d.querySelectorAll('tbody .doneby-tag')].length;
    const cont = trs.filter((tr) => tr.classList.contains('rec-cont')).length;
    d.remove();
    return { head, body, grid, tags, cont };
  });
  /* SHOT=/path.png draws the maintenance block as the office sees it. A
     check cannot read a layout, and this table is printed -- a column
     added to it is a width question as much as a content one. */
  if (process.env.SHOT) {
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.className = 'sec';
      d.style.cssText = 'padding:18px;background:#fff';
      d.innerHTML = buildModTable('maint', window.__MAINT);
      document.body.innerHTML = '';
      document.body.style.cssText = 'background:#fff;margin:0';
      document.body.appendChild(d);
    });
    await page.screenshot({ path: process.env.SHOT, fullPage: true });
    console.log('  shot  ' + process.env.SHOT);
  }

  check('it is a column now, and the last one', t.head[t.head.length - 1], 'Done By');
  check('after Result, which says WHAT and not who',
        t.head.slice(-2), ['Result', 'Done By']);
  const nameCol = t.head.indexOf('Done By');
  const plotCol = t.head.indexOf('Plot');
  const rowOn = (plot) => (t.grid.find((r) => r[plotCol] === plot) || []);
  check('an audit names the auditor', rowOn('B01')[nameCol], 'Suhaedi');
  check('a closure names the ADMIN who pressed the button',
        rowOn('B09')[nameCol], 'Elon Ting admin');
  check('and only the closures wear the tag', t.tags, 3);

  /* ── 5. nothing else moved ────────────────────────────────────────── */
  console.log('\nAnd the rest of the row is untouched');
  check('the columns it always had are still there, in order',
        t.head.slice(0, 4), ['#', 'Date', 'Plot', 'Task']);
  check('Result and Done By still close the row',
        t.head.slice(-2), ['Result', 'Done By']);
  check('every row still READS as all seven cells',
        [...new Set(t.grid.map((r) => r.length))], [7]);
  /* And the merge is real rather than the same four values written out
     three times: a continuation line emits only Case, Result and Done By,
     which is the whole of what differs between the cases of one record. */
  check('a line that continues a record emits only what differs',
        [...new Set(t.body.map((r) => r.length))].sort(), [3, 7]);

  /* ── 6. the question the office asked twice ───────────────────────────
     Three rows reading B05 / Interrow Spray / Unsatisfied on 22 Oct are
     three separate work records, and the report had nothing on it that
     said so. A column that merely EXISTS does not answer them -- it has to
     carry a different value on each of those three rows. */
  console.log('\nThree rows that look alike are told apart');
  const caseCol = t.head.indexOf('Case');
  check('the Case column is drawn, after the job it belongs to',
        caseCol > t.head.indexOf('Task') && caseCol < t.head.indexOf('Result'), true);

  const alike = t.grid.filter((r) => r[plotCol] === 'B05');
  check('the office own three rows are all on the report', alike.length, 3);
  check('and each one names a DIFFERENT case',
        new Set(alike.map((r) => r[caseCol])).size, 3);
  check('the case is the task id, not something invented',
        alike.map((r) => r[caseCol]).sort(),
        ['1791248487117', '1791248487131', '1791248487134']);
  /* AND THE OFFICE ASKED FOR THE OTHER HALF OF THIS AFTERWARDS: those three
     cases are one morning's work on one plot, so they are ONE record now --
     numbered once, counted once, with the three cases still each on their
     own line above. The column proves they are separate cases; the record
     says they are one visit. Both answers at once, which is what was
     asked. `one_record_is_one_visit.cjs` holds the rule itself. */
  const recCol = t.head.indexOf('#');
  check('…and the three are ONE record, not three',
        new Set(alike.map((r) => r[recCol])).size, 1);
  check('two of the three lines are continuations of it', t.cont, 2);

  /* The quietest way this fix does nothing is the SELECT not asking for the
     column -- the alert board lost a whole fix that way once. A fixture can
     always supply a field; only the shipped query says it was asked for. */
  const src = fs.readFileSync(path.join(ROOT, 'audit', 'audit_report.html'), 'utf8');
  const sel = (src.match(/audit_maintenance_audits['"`],\s*`select=([^&]+)/) || [])[1] || '';
  check('and the shipped select actually asks for task_id',
        sel.split(',').includes('task_id'), true);

  await browser.close();
  server.close();
  console.log('');
  console.log(fail ? fail + ' FAILED  (' + pass + ' ok)' : 'all good  (' + pass + ' ok)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
