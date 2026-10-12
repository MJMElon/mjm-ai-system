/* CLOSING A PLOT NOBODY IS EVER GOING TO AUDIT.

   A maintenance deadline overdue by two months is not work anybody is
   going to do — the job it was raised against was finished in August and
   there is nothing left in the plot to look at. It sat on the board for
   ever, because the only thing that retires a maintenance row is an
   audit against it.

   So an admin may close one from the board. What that writes is an
   ORDINARY audit_maintenance_audits row against the same task_id, with
   its result reading "Closed by admin" — it goes through the one door
   everything else goes through, it leaves the board for the one reason
   anything leaves it, and it lands in Audit History with a name and a
   date on it. NOTHING IS DELETED: the work record in
   nops_maint_field_records is untouched, because the field did that work
   and said so.

   Held here, through the real board in a real browser:

     1. an admin sees an x on every maintenance plot chip, and one on
        every work-type SECTION header
     2. a plain auditor sees neither — the chips are exactly as before
     3. pressing a chip x writes a record against THAT task id, with the
        result, the plot, the job and who closed it
     4. pressing the SECTION x closes every plot under that job, in ONE
        insert, with a remark naming the section
     5. the chip is gone afterwards, and the row with it when it was the
        last plot on it
     6. cancelling the confirm writes nothing
     7. the work record is not deleted
     8. the reason is NOT asked for — it is written onto the record
     9. and Audit History says so, there and then, without a reload --
        naming what the task was DUE and how far past it had gone, not
        just the day somebody pressed the button

   The POST stub is STRICT about what the real table will take. A stub
   that accepts anything signs off a write the database refuses: the
   first version of this close left audit_id out, which is NOT NULL with
   no default on audit_maintenance_audits, and every check here passed
   while the office got "Supabase error 400 ... 23502". NOT_NULL below is
   the column set the maintenance form itself supplies, and a row missing
   one comes back refused the way PostgREST refuses it.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/admin_can_close_a_dead_plot.cjs
*/
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT  = path.resolve(__dirname, '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

const NOW = new Date();
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')
                 + '-' + String(d.getDate()).padStart(2,'0');
/* Two months back: weeding carries a 3-day window, so this is a deadline
   long closed whatever day the test runs. */
const LONG_AGO = iso(new Date(NOW.getFullYear(), NOW.getMonth() - 2, 5));
/* Weeding allows 3 days after the work, so this is the deadline the
   board works out for the two records below -- the same arithmetic,
   written out here rather than imported, so a change to either side has
   to be made deliberately on both. */
const WEEDING_DAYS = 3;
const dueOf = (d) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + WEEDING_DAYS); return iso(x); };
const DUE_ISO   = dueOf(LONG_AGO);
const DUE_SHOWN = new Date(DUE_ISO + 'T00:00:00')
  .toLocaleDateString('en-MY', { day:'numeric', month:'short', year:'numeric' });

const FIELD = [
  { id: 9001, work_date: LONG_AGO, nursery_name:'UNN 2', plot_name:'N01', work_type:'weeding', jenis:'Merumput' },
  { id: 9002, work_date: LONG_AGO, nursery_name:'UNN 2', plot_name:'N02', work_type:'weeding', jenis:'Merumput' }
];

const tableOf = (url) => { const m = /\/rest\/v1\/([a-z0-9_]+)/i.exec(url); return m ? m[1] : ''; };

/* What audit_maintenance_audits will not take a null in. Taken off the
   payload the maintenance form writes (audit_maintenance_script.js
   saveAudit) -- it is the one proof we have of the real table's shape
   from in here, since this environment cannot reach Supabase. */
const NOT_NULL = ['audit_id', 'task_id', 'nursery', 'plot', 'result', 'auditor_name', 'date'];
const refusedFor = (row) => {
  const miss = NOT_NULL.find(c => row[c] === undefined || row[c] === null || row[c] === '');
  return miss ? { code: '23502', details: null, hint: null,
                  message: 'null value in column "' + miss +
                           '" of relation "audit_maintenance_audits" violates not-null constraint' }
              : null;
};

async function run(asAdmin, action){
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  /* The page registers a service worker, and page.route does NOT reach a
     fetch the WORKER makes. Once it activates it answers its own
     synthetic 503 and the board reloads into an empty list -- which is
     the worker doing its offline job correctly against a network that is
     not there, and nothing to do with what this test is about. */
  const ctx  = await browser.newContext({ viewport:{ width:1100, height:1600 },
                                          serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  const posted = [];
  const refused = [];
  const dialogs = [];
  const deleted = [];
  let audits = [];
  page.on('pageerror', e => errs.push(String(e)));
  const logs = [];
  page.on('console', m => { const x = m.text(); if (/maintenance timeline|could not close/.test(x)) logs.push(x.slice(0, 300)); });

  await page.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const t = tableOf(req.url());
    const m = req.method();
    if (m === 'POST') {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      /* A section close goes up as ONE insert of many rows, so the body
         is an array. Counted as one POST and unpacked into many rows --
         "how many round trips" and "how many records" are two different
         questions and the test asks both. */
      const rowsIn = Array.isArray(body) ? body : [body];
      if (t === 'audit_maintenance_audits') {
        const bad = rowsIn.map(refusedFor).find(Boolean);
        if (bad) {
          refused.push(bad.message);
          return route.fulfill({ status:400, contentType:'application/json',
                                 body: JSON.stringify(bad) });
        }
        posted.push({ table: t, body: rowsIn[0], rows: rowsIn });
        /* The real thing: once the record exists, the task is audited --
           and the whole row goes back, because Audit History reads the
           same table and needs the date, the nursery and the result. */
        rowsIn.forEach((r, k) => audits.push(
          Object.assign({ audit_id: 7000 + audits.length + k }, r)));
      }
      return route.fulfill({ status:201, contentType:'application/json', body: JSON.stringify(rowsIn) });
    }
    if (m === 'DELETE' || m === 'PATCH') { deleted.push({ table: t, method: m, url: req.url() }); }
    const body = t === 'nops_maint_field_records'    ? FIELD
               : t === 'audit_maintenance_audits'    ? audits
               : [];
    return route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ access_token:'x', user:{ id:'u1' } }) }));
  ['**cdn.tailwindcss.com/**','**cdn.jsdelivr.net/**'].forEach(p =>
    page.route(p, r => r.fulfill({ status:200, contentType:'text/javascript', body:'' })));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));

  await page.addInitScript(({ admin }) => {
    const u = { id:'u1', email:'a@mjmnursery.com', name:'Esther', full_name:'Esther',
                role: admin ? 'admin' : 'auditor',
                audit_role: admin ? 'admin' : 'auditor',
                permissions: { audit_landing:'MN', modules: { audit: admin ? 'admin' : 'normal' } } };
    try {
      localStorage.clear();
      localStorage.setItem('mjm_user', JSON.stringify(u));
      localStorage.setItem('mjm_nursery_scope:u1', 'MN');
      localStorage.setItem('sb-kibqjztozokohqmhqqqf-auth-token', JSON.stringify({
        access_token:'x', refresh_token:'y',
        expires_at: Math.floor(Date.now()/1000) + 86400, user:{ id:'u1', email:u.email } }));
    } catch (e) {}
  }, { admin: asAdmin });

  const port = server.address().port;
  await page.goto(`http://localhost:${port}/audit/audit_home.html`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(6000);

  const snap = () => page.evaluate(() => ({
    xs:    document.querySelectorAll('.tl-plot-x').length,
    sects: document.querySelectorAll('.tl-wt-close').length,
    /* The section x must be a SIBLING of the header, never inside it --
       .tl-wt-head is itself a <button> and a button inside a button is
       not a thing a browser will draw. */
    nested: document.querySelectorAll('.tl-wt-head .tl-wt-close').length,
    plots: [...document.querySelectorAll('#todo-section .tl-wt-plots .tl-plot')].map(a => a.textContent.trim()),
    /* What Audit History says about it, without a reload. Writing the
       record is only half of it -- the plot leaves the board, and if the
       history does not pick it up until next time somebody opens the
       page, nothing on screen says where it went. */
    hist:  [...document.querySelectorAll('#hist-list .hist-row')].map(el =>
             (el.innerText || '').replace(/\s+/g, ' ').trim()),
    rows:  [...document.querySelectorAll('#todo-section .tl-item[data-mod="maint"]')].map(el => ({
             from: (el.querySelector('.tl-from') || {}).innerText || '',
             due:  (el.querySelector('.tl-due-date') || {}).innerText || '',
             n:    el.querySelectorAll('.tl-plot').length,
             x:    el.querySelectorAll('.tl-plot-x').length
           })),
  }));
  const before = await snap();

  let after = before;
  if (action) {
    page.on('dialog', async (d) => {
      dialogs.push({ type: d.type(), msg: d.message() });
      if (action === 'cancel-confirm') return d.dismiss();
      return d.accept();
    });
    const hit = await page.evaluate((act) => {
      const sel = act === 'close-section' ? '.tl-wt-close' : '.tl-plot-x[data-close-plot="N01"]';
      const b = document.querySelector(sel);
      if (!b) return false;
      b.click();
      return true;
    }, action);
    if (hit) await page.waitForTimeout(2500);
    after = await snap();
  }

  await browser.close();
  return { before, after, posted, refused, dialogs, deleted, errs, logs };
}

(async () => {
  await new Promise(r => server.listen(0, r));

  const plain  = await run(false, null);
  const admin  = await run(true,  null);
  const closed = await run(true,  'close');
  const sect   = await run(true,  'close-section');
  const noConf = await run(true,  'cancel-confirm');

  const post = (r) => r.posted.find(p => p.table === 'audit_maintenance_audits') || {};
  const row  = post(closed).body || {};
  const sRows = post(sect).rows || [];

  console.log('plain auditor  : xs =', plain.before.xs,  'plots =', JSON.stringify(plain.before.plots));
  console.log('admin          : xs =', admin.before.xs,  'plots =', JSON.stringify(admin.before.plots));
  console.log('admin rows     :', JSON.stringify(admin.before.rows));
  console.log('after close    : plots =', JSON.stringify(closed.after.plots),
              'rows =', JSON.stringify(closed.after.rows));
  console.log('row written    :', JSON.stringify(row));
  console.log('section crosses:', admin.before.sects, '(plain:', plain.before.sects, ')');
  console.log('section posts  :', sect.posted.length, 'insert(s),', sRows.length, 'row(s)');
  console.log('section rows   :', JSON.stringify(sRows));
  console.log('section dialogs:', JSON.stringify(sect.dialogs.map(d => d.type)));
  console.log('chip dialogs   :', JSON.stringify(closed.dialogs.map(d => d.type)));
  console.log('writes on cancel:', noConf.posted.length);
  console.log('history after  :', JSON.stringify(sect.after.hist));
  console.log('refused by db  :', JSON.stringify(closed.refused.concat(sect.refused)));
  console.log('deadline       :', DUE_ISO, '->', DUE_SHOWN);
  console.log('deletes/patches :', JSON.stringify(closed.deleted));
  console.log('page errors     :', closed.errs.length ? closed.errs.join(' | ') : 'none');
  closed.logs.slice(-2).forEach(l => console.log('LOG:', l));

  let bad = 0;
  const check = (l, p) => { if (!p) bad++; console.log((p ? 'ok   ' : 'FAIL ') + l); };

  check('the board drew the two overdue plots', admin.before.plots.includes('N01') && admin.before.plots.includes('N02'));
  check('an admin gets an x on every maintenance plot', admin.before.xs === admin.before.plots.length && admin.before.xs > 0);
  check('a plain auditor gets none', plain.before.xs === 0);
  check('and sees the chips exactly as before', plain.before.plots.join() === admin.before.plots.join());

  check('the database takes the row -- every NOT NULL column is filled',
        closed.refused.length === 0 && sect.refused.length === 0);
  check('including the audit_id the table has no default for',
        !!row.audit_id && sRows.every(r => !!r.audit_id));
  check('and no two rows of one section share one',
        new Set(sRows.map(r => r.audit_id)).size === sRows.length);

  check('closing writes a record against that task id', Number(row.task_id) === 9001);
  check('saying it was closed by an admin', row.result === 'Closed by admin');
  check('naming the plot and the job', row.plot === 'N01' && !!row.task_type);
  check('with who closed it and when', !!row.auditor_name && !!row.date);
  check('writing the reason rather than asking for one',
        /overdue/i.test(row.remarks || '') &&
        /work done/i.test(row.remarks || '') &&
        closed.dialogs.every(d => d.type !== 'prompt'));
  check('and no photo, because there was nothing to photograph', !row.photo_url);

  check('the chip is gone afterwards', !closed.after.plots.includes('N01'));
  check('and the plot nobody closed is still there', closed.after.plots.includes('N02'));

  /* ── THE SECTION ── */
  check('an admin gets an x on the work-type section too', admin.before.sects > 0);
  check('a plain auditor gets none of those either', plain.before.sects === 0);
  check('and it is never nested inside the header button', admin.before.nested === 0);
  check('closing the section goes up as ONE insert', sect.posted.length === 1);
  check('carrying every plot under that job',
        sRows.length === 2 &&
        sRows.map(r => r.plot).sort().join() === 'N01,N02' &&
        sRows.map(r => Number(r.task_id)).sort().join() === '9001,9002');
  check('every row saying it was closed by an admin',
        sRows.length > 0 && sRows.every(r => r.result === 'Closed by admin'));
  check('and the remark naming the section it went with',
        sRows.length > 0 && sRows.every(r => /whole .* section \(2 plots\)/i.test(r.remarks || '')));
  check('and Audit History says so there and then, without a reload',
        sect.after.hist.filter(h => /Closed by admin/i.test(h)).length === 2 &&
        sect.after.hist.some(h => /Closed by admin/i.test(h) && /Weeding/i.test(h)));
  /* The whole point of a closure is that it was OLD. The date on the
     right of the row is the day it was closed, so without this the run
     reads as this month's work. */
  check('naming what the task was due, not just when it was closed',
        sect.after.hist.every(h => !/Closed by admin/i.test(h) || /was due/i.test(h)));
  check('and how far past the deadline it had gone',
        sect.after.hist.every(h => !/Closed by admin/i.test(h) || /days overdue/i.test(h)));
  check('which is the deadline the board itself drew',
        sect.after.hist.some(h => h.indexOf(DUE_SHOWN) !== -1));
  check('the record keeps it too, in its own remark',
        sRows.length > 0 && sRows.every(r => (r.remarks || '').indexOf('Due ' + DUE_ISO) === 0));
  check('which it did not say before the close',
        sect.before.hist.every(h => !/Closed by admin/i.test(h)));

  check('the whole section is gone afterwards',
        !sect.after.plots.includes('N01') && !sect.after.plots.includes('N02'));
  check('one confirm for the lot, and no reason asked for',
        sect.dialogs.length === 1 && sect.dialogs[0].type === 'confirm');
  check('the confirm naming the job and how many plots',
        /2 plots/.test((sect.dialogs[0] || {}).msg || ''));

  check('NOTHING is deleted or patched',
        closed.deleted.length === 0 && sect.deleted.length === 0);
  check('cancelling the confirm writes nothing', noConf.posted.length === 0);

  check('no page errors',
        closed.errs.length === 0 && plain.errs.length === 0 && sect.errs.length === 0);

  server.close();
  process.exit(bad ? 1 : 0);
})();
