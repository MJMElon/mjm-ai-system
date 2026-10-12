/* A SPECIAL AUDIT IS A DEADLINE, AND IT REACHES THE AUDITOR AT ONCE.

   The ordinary schedule is a monthly pattern — Plot Condition on the
   10th, the 20th and the 30th, every month, for ever. A SPECIAL audit is
   that same question asked once: "walk these plots in BNN by the 20th",
   raised from Settings → System Setting when something happens and not
   expected again for months.

   The office's words: "i clicked + in plot condition audit - bnn, then i
   can select the audit date, audit plot (can pick more than 1 plot) / all
   plot and save. once i clicked save, it will show to to do list."

   So it is a DEADLINE and never a window, which is the whole difference
   from a round:

     1. it is on the To Do list the moment it is saved, days before its
        own date — a round whose window has not opened is greyed out and
        will not navigate, and that would be the opposite of asking
     2. it names only the plots it asked for, and only its own nursery
     3. "all plots" is worked out LIVE off the same roster everything
        else reads, so a plot added afterwards is included
     4. an audit from BEFORE it was raised does NOT answer it — the
        request is a new question, and this is the one rule that keeps
        it alive now that a closed round is cleared by any past audit
     5. it clears the moment every plot it named is audited
     6. no round rule touches it
     7. and once every plot IS walked the board RETIRES it, through the
        one narrow door an auditor has — otherwise the office screen
        lists it as outstanding for ever and the only way off is
        Withdraw, which means cancelled and not done

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/special_audit_reaches_the_auditor.cjs
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
const TODAY = iso(NOW);
/* Eight days out: comfortably in the future, so a row that shows is
   showing because it was RAISED and not because its date has come. */
const DUE   = iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 8));
/* Last month: old enough to have closed every round, which is exactly
   what must NOT close a request raised today. */
const OLD   = iso(new Date(NOW.getFullYear(), NOW.getMonth() - 1, 15));

const ROSTER = [
  { plot_name:'B01', batch_name:'901', transaction_type:'Transplanted', transaction_date:'2026-01-05' },
  { plot_name:'B02', batch_name:'902', transaction_type:'Transplanted', transaction_date:'2026-01-05' }
];
const BALANCE = [
  { plot_name:'B01', batch_name:'901', qty: 5000 },
  { plot_name:'B02', batch_name:'902', qty: 5000 }
];
const tableOf = (url) => { const m = /\/rest\/v1\/([a-z0-9_]+)/i.exec(url); return m ? m[1] : ''; };

async function run(browser, { specials, plotAudits, rpcBroken }){
  const rpcs = [];
  const ctx  = await browser.newContext({ viewport:{ width:1000, height:1600 },
                                          serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  await page.route('**/rest/v1/**', (route) => {
    const t = tableOf(route.request().url());
    const body =
        t === 'shared_inventory_logs'      ? ROSTER
      : t === 'shared_plot_batch_balance'  ? BALANCE
      : t === 'audit_plot_audits'          ? plotAudits
      : t === 'audit_special_audits'       ? specials
      : [];
    route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(body) });
  });
  /* AFTER the catch-all on purpose: Playwright matches routes in REVERSE
     registration order, so the last one registered wins. Register this
     first and the catch-all above swallows every rpc, answers it 200 with
     an empty list, and the test sees no call at all while the page
     carries on perfectly happily. */
  await page.route('**/rest/v1/rpc/**', (route) => {
    const u = route.request().url();
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    rpcs.push({ fn: u.split('/rpc/')[1].split('?')[0], body });
    if (rpcBroken) return route.fulfill({ status: 404, contentType:'application/json',
      body: JSON.stringify({ message: 'function does not exist' }) });
    return route.fulfill({ status: 200, contentType:'application/json', body: 'true' });
  });
  await page.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ access_token:'x', user:{ id:'u1' } }) }));
  ['**cdn.tailwindcss.com/**','**cdn.jsdelivr.net/**'].forEach(p =>
    page.route(p, r => r.fulfill({ status:200, contentType:'text/javascript', body:'' })));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));

  await page.addInitScript(() => {
    const u = { id:'u1', email:'a@mjmnursery.com', full_name:'Auditor',
                role:'admin', audit_role:'admin', permissions:{ audit_landing:'MN' } };
    try {
      localStorage.clear();
      localStorage.setItem('mjm_user', JSON.stringify(u));
      localStorage.setItem('mjm_nursery_scope:u1', 'MN');
      localStorage.setItem('sb-kibqjztozokohqmhqqqf-auth-token', JSON.stringify({
        access_token:'x', refresh_token:'y',
        expires_at: Math.floor(Date.now()/1000) + 86400, user:{ id:'u1' } }));
    } catch (e) {}
  });

  const port = server.address().port;
  await page.goto(`http://localhost:${port}/audit/audit_home.html`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.querySelectorAll('.tl-plots-toggle').forEach(b => b.click()));
  await page.waitForTimeout(300);

  const out = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#todo-section .tl-item')].map(el => ({
      special: !!el.querySelector('.tl-special'),
      ttl:   ((el.querySelector('.tl-ttl') || {}).innerText || '').replace(/\s+/g, ' ').trim(),
      due:   ((el.querySelector('.tl-due-date') || {}).innerText || '').trim(),
      badge: ((el.querySelector('.tl-badge') || {}).innerText || '').trim(),
      note:  ((el.querySelector('.tl-note') || {}).textContent || '').trim(),
      link:  !!el.querySelector('a.tl-card'),
      plots: [...el.querySelectorAll('.tl-plot')].map(a => a.textContent.trim())
    }));
    return { rows, special: rows.filter(r => r.special) };
  });
  await page.waitForTimeout(400);     // the retire sweep runs after the roster
  await ctx.close();
  return { ...out, rpcs, errs };
}

const REQ = (over) => Object.assign({
  id: 1, module: 'plot', nursery: 'BNN', due_date: DUE, raised_on: TODAY,
  all_plots: false, plots: ['B01'], note: 'Storm damage'
}, over || {});

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* Every scenario carries an audit on BOTH plots from LAST MONTH, which
     clears every ordinary round — so anything left on the board is the
     special request and nothing else. */
  const oldAudits = [
    { nursery:'BNN', plot:'B01', batch:'901', date: OLD },
    { nursery:'BNN', plot:'B02', batch:'902', date: OLD }
  ];

  const none    = await run(browser, { specials: [],            plotAudits: oldAudits });
  const named   = await run(browser, { specials: [REQ()],       plotAudits: oldAudits });
  const allP    = await run(browser, { specials: [REQ({ all_plots: true, plots: [] })], plotAudits: oldAudits });
  const walkedAudits = oldAudits.concat([{ nursery:'BNN', plot:'B01', batch:'901', date: TODAY }]);
  const walked  = await run(browser, { specials: [REQ()], plotAudits: walkedAudits });
  /* The same, with the closer not installed: the row must stay exactly
     where it was rather than the page falling over. */
  const noCloser = await run(browser, { specials: [REQ()], plotAudits: walkedAudits, rpcBroken: true });
  /* UNN 1 is one of the three the main-nursery board covers, so that
     one SHOULD appear. The Pre Nursery is a different scope entirely
     and must not. */
  const sibling = await run(browser, { specials: [REQ({ nursery:'UNN1' })], plotAudits: oldAudits });
  const otherScope = await run(browser, { specials: [REQ({ nursery:'PN' })], plotAudits: oldAudits });
  const cancelled = await run(browser, { specials: [], plotAudits: oldAudits });

  const s = (r) => r.special[0] || {};
  console.log('no request    : rows =', none.rows.length, '| special =', none.special.length);
  console.log('named B01     :', JSON.stringify(s(named)));
  console.log('all plots     :', JSON.stringify(s(allP).plots));
  console.log('after walking :', walked.special.length, 'special row(s) | rpc:',
              JSON.stringify(walked.rpcs));
  console.log('closer missing:', noCloser.special.length, 'row(s), errors:', noCloser.errs.length);
  console.log('UNN 1 request :', s(sibling).ttl, '| PN request rows:', otherScope.special.length);
  console.log('page errors   :', named.errs.length ? named.errs.join(' | ') : 'none');

  let bad = 0;
  const check = (l, p) => { if (!p) bad++; console.log((p ? 'ok   ' : 'FAIL ') + l); };

  check('with no request raised, the board has no special row', none.special.length === 0);
  check('and last month\'s audit has cleared the ordinary rounds',
        none.rows.every(r => !/Plot Condition/i.test(r.ttl) || r.plots.length === 0));

  check('a saved request is on the To Do list at once', named.special.length === 1);
  check('days before its own date, and not greyed out', s(named).link === true);
  check('reading as due rather than upcoming', /due/i.test(s(named).badge));
  check('it names the deadline that was picked',
        s(named).due.indexOf(String(Number(DUE.slice(8,10)))) !== -1);
  check('it names its nursery', /BNN/.test(s(named).ttl));
  check('and carries the note the office typed', /storm damage/i.test(s(named).note));

  check('only the plots it asked for', JSON.stringify(s(named).plots) === JSON.stringify(['B01']));
  check('"all plots" is worked out live off the roster',
        JSON.stringify(s(allP).plots) === JSON.stringify(['B01','B02']));

  /* The one that matters most. Every round on this board was cleared by
     that audit from last month; the request must not be. */
  check('an audit from BEFORE it was raised does not answer it',
        named.special.length === 1 && s(named).plots.length === 1);
  check('walking the plot today clears it', walked.special.length === 0);
  /* ── AND IT IS RETIRED, not left outstanding on the office screen ── */
  /* The page makes other rpc calls of its own (the access checks), so
     this counts only the one that retires a request. */
  const closed = (r) => (r.rpcs || []).filter(x => x.fn === 'audit_special_mark_done');
  check('and the board retires it through the one door it has',
        closed(walked).length === 1 && Number(closed(walked)[0].body.p_id) === 1);
  check('exactly once, not on every redraw', closed(walked).length === 1);
  check('a request still owed is NOT retired', closed(named).length === 0);
  check('and one out of this scope retires nothing', closed(otherScope).length === 0);
  check('with the closer not installed the page carries on regardless',
        noCloser.errs.length === 0);

  check('a request for a sibling nursery in the same scope IS shown',
        sibling.special.length === 1 && /UNN 1/.test(s(sibling).ttl));
  check('one for the Pre Nursery is not, on a main-nursery board',
        otherScope.special.length === 0);
  check('a cancelled request is gone', cancelled.special.length === 0);

  check('no page errors', named.errs.length === 0 && allP.errs.length === 0);

  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})();
