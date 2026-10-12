/* A LATE AUDIT CLEARS ITS ROW, AND THE ROUND IS RECORDED AS MISSED.

   The auditor portal's to-do row asks one question: was this plot
   audited INSIDE the window? For a window still open that is right. For
   one that closed it is unanswerable for ever — "audit B01 between 1 and
   5 August" cannot be satisfied in October. So an auditor who walked the
   plot today had done the work and the row stayed, listing every plot,
   reading "lewat 68 hari", and nothing they could do would clear it.
   Every overdue row on the board was in that state.

   The office's rule: a late audit clears the old rounds too, because
   auditing August back is not a thing anybody can do — and the rounds it
   cleared are recorded as a MISSED AUDIT, filed under the month that
   owed them, in Audit History.

   Held here, through the real page in a real browser:

     1. a plot audited LATE drops off the overdue row
     2. a plot NOT audited stays on it, so the fix is not "clear
        everything"
     3. a round cleared only by late work shows in Audit History under
        the month that owed it, saying Missed audit
     4. the row and its circles agree — a row that clears while its
        plots remain is worse than the bug
     5. an audit from BEFORE the window opened does not close it

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/late_work_clears_the_backlog.cjs
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
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

/* The board carries a backlog LOOKBACK_MONTHS deep, so the missed month
   has to be inside it whatever month this test is run in. Two months
   back, first of the month, is always closed and always in range. */
const NOW   = new Date();
const BACKY = new Date(NOW.getFullYear(), NOW.getMonth() - 2, 1);
const BACK_YM = BACKY.getFullYear() + '-' + String(BACKY.getMonth() + 1).padStart(2, '0');
const TODAY_ISO = NOW.getFullYear() + '-' + String(NOW.getMonth()+1).padStart(2,'0')
                + '-' + String(NOW.getDate()).padStart(2,'0');
/* Before the schedule's earliest window of any month, so it can never be
   read as "done on time" for the round it precedes. */
const EARLY_ISO = BACK_YM + '-01';

/* Two B plots in the main nursery, one batch each. */
const ROSTER = [
  { plot_name:'B01', batch_name:'901', transaction_type:'Transplanted', transaction_date:'2026-01-05' },
  { plot_name:'B02', batch_name:'902', transaction_type:'Transplanted', transaction_date:'2026-01-05' }
];
const BALANCE = [
  { plot_name:'B01', batch_name:'901', qty: 5000 },
  { plot_name:'B02', batch_name:'902', qty: 5000 }
];

function tableOf(url){
  const m = /\/rest\/v1\/([a-z0-9_]+)/i.exec(url);
  return m ? m[1] : '';
}

async function boot(page, plotAudits){
  await page.addInitScript(({ audits }) => {
    const u = { id:'u1', email:'auditor@mjmnursery.com', full_name:'Auditor',
                role:'admin', audit_role:'admin',
                permissions:{ audit_landing:'MN' } };
    try {
      localStorage.clear();
      localStorage.setItem('mjm_user', JSON.stringify(u));
      localStorage.setItem('mjm_nursery_scope:u1', 'MN');
      localStorage.setItem('sb-kibqjztozokohqmhqqqf-auth-token', JSON.stringify({
        access_token:'x', refresh_token:'y',
        expires_at: Math.floor(Date.now()/1000) + 86400, user:{ id:'u1', email:u.email }
      }));
    } catch (e) {}
    window.__AUDITS = audits;
  }, { audits: plotAudits });
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  async function run(plotAudits){
    const ctx  = await browser.newContext({ viewport:{ width:900, height:1400 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));

    await page.route('**/rest/v1/**', (route) => {
      const t = tableOf(route.request().url());
      const body =
          t === 'shared_inventory_logs'       ? ROSTER
        : t === 'shared_plot_batch_balance'   ? BALANCE
        : t === 'audit_plot_audits'           ? plotAudits
        : [];
      route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ access_token:'x', refresh_token:'y', user:{ id:'u1' } }) }));
    await page.route('**cdn.tailwindcss.com/**', r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
    await page.route('**cdn.jsdelivr.net/**',    r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
    await page.route('**fonts.googleapis.com/**',r => r.fulfill({ status:200, contentType:'text/css', body:'' }));

    await boot(page, plotAudits);
    await page.goto(`http://localhost:${port}/audit/audit_home.html`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(6000);

    const out = await page.evaluate((backYm) => {
      const rows = [...document.querySelectorAll('#todo-section .tl-item')].map(el => ({
        title: (el.querySelector('.tl-ttl') || {}).innerText || '',
        from:  (el.querySelector('.tl-from') || {}).innerText || '',
        plots: [...el.querySelectorAll('.tl-plot')].map(a => a.textContent.trim())
      }));
      /* Open every "+N" so the circles under a row are the whole list,
         not the first ten. */
      document.querySelectorAll('.tl-plots-toggle').forEach(b => b.click());
      const missed = (window.MJMAuditMissed && MJMAuditMissed.rounds)
        ? MJMAuditMissed.rounds(Number(backYm.split('-')[0]), Number(backYm.split('-')[1]) - 1)
        : null;
      return { rows, missed, pendingReady: !!(window.MJMAuditPending && MJMAuditPending.ready()) };
    }, BACK_YM);

    /* The circles after expanding, and the history for the owed month. */
    await page.waitForTimeout(400);
    const after = await page.evaluate((backYm) => {
      const rows = [...document.querySelectorAll('#todo-section .tl-item')].map(el => ({
        title: (el.querySelector('.tl-ttl') || {}).innerText || '',
        plots: [...el.querySelectorAll('.tl-plot')].map(a => a.textContent.trim())
      }));
      /* Drive the history to the month that owed the round. */
      let hops = 0;
      while (typeof HIST_MONTH !== 'undefined' && HIST_MONTH > backYm && hops++ < 12) histShift(-1);
      const histMonth = typeof HIST_MONTH !== 'undefined' ? HIST_MONTH : null;
      const histRows  = [...document.querySelectorAll('#hist-list .hist-row')].map(el => ({
        missed: el.classList.contains('hist-missed'),
        ttl: (el.querySelector('.hist-ttl') || {}).textContent || '',
        sub: (el.querySelector('.hist-sub') || {}).textContent || ''
      }));
      return { rows, histMonth, histRows };
    }, BACK_YM);

    await ctx.close();
    return { ...out, after, errs };
  }

  const plotOf = (r) => r.plots;
  const owedPlots = (r) => {
    const s = new Set();
    r.rows.filter(x => /Plot Condition/i.test(x.title)).forEach(x => plotOf(x).forEach(p => s.add(p)));
    r.after.rows.filter(x => /Plot Condition/i.test(x.title)).forEach(x => plotOf(x).forEach(p => s.add(p)));
    return [...s].sort();
  };

  /* ── A. nothing audited at all ────────────────────────────────── */
  const none = await run([]);

  /* ── B. B01 walked TODAY, long after its windows closed ───────── */
  const late = await run([
    { nursery:'BNN', plot:'B01', batch:'901', date: TODAY_ISO }
  ]);

  /* ── C. both walked today — the month owed a round and got none ─ */
  const bothLate = await run([
    { nursery:'BNN', plot:'B01', batch:'901', date: TODAY_ISO },
    { nursery:'BNN', plot:'B02', batch:'902', date: TODAY_ISO }
  ]);

  /* ── D. audited BEFORE the window opened ──────────────────────── */
  const tooEarly = await run([
    { nursery:'BNN', plot:'B01', batch:'901', date:'2025-12-31' },
    { nursery:'BNN', plot:'B02', batch:'902', date:'2025-12-31' }
  ]);

  const missedOf = (r) => (r.missed || []).map(x => x.mod + '/' + (x.round || 0) + '/' + x.nursery);

  console.log('owed month   :', BACK_YM, '  today:', TODAY_ISO);
  console.log('A none       :', JSON.stringify(owedPlots(none)));
  console.log('B B01 late   :', JSON.stringify(owedPlots(late)));
  console.log('C both late  :', JSON.stringify(owedPlots(bothLate)), '| missed:', JSON.stringify(missedOf(bothLate)));
  console.log('C history    :', bothLate.after.histMonth,
              JSON.stringify(bothLate.after.histRows.filter(x => x.missed).slice(0, 3)));
  console.log('D too early  :', JSON.stringify(owedPlots(tooEarly)));
  console.log('page errors  :', none.errs.length ? none.errs.join(' | ') : 'none');

  let bad = 0;
  const check = (label, pass) => { if (!pass) bad++; console.log((pass ? 'ok   ' : 'FAIL ') + label); };

  check('the roster loaded, so the rest of this means something', none.pendingReady === true);
  check('with nothing audited, both plots are owed',
        owedPlots(none).includes('B01') && owedPlots(none).includes('B02'));

  check('a plot walked today drops off its overdue row', !owedPlots(late).includes('B01'));
  check('and the plot nobody walked stays on it', owedPlots(late).includes('B02'));

  check('walk both and the rows go altogether', owedPlots(bothLate).length === 0);
  check('the round is recorded as missed, not forgotten', missedOf(bothLate).length > 0);
  check('under the month that owed it', bothLate.after.histMonth === BACK_YM);
  check('and Audit History says so in words',
        bothLate.after.histRows.some(x => x.missed && /missed audit/i.test(x.sub)));
  check('naming the nursery', bothLate.after.histRows.some(x => x.missed && /BNN/.test(x.sub)));

  check('an audit from before the window opened closes nothing',
        owedPlots(tooEarly).includes('B01') && owedPlots(tooEarly).includes('B02'));

  check('no page errors', none.errs.length === 0 && bothLate.errs.length === 0);

  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})();
