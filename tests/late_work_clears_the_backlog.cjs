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

   The LOWER bound went the same way, later and for the same reason. It
   used to hold: an audit from before a window opened belonged to the
   round before it and closed nothing. N02 is what that looked like on
   screen — batch 253 walked 22 Sep, September round 3 opening on the
   30th, so the row stayed red over a plot somebody had walked eight days
   earlier and nothing 253 could be given would ever close it. The
   office: "latest audit clears every overdue round (if is not audit on
   time). but as long as not yet audit, it will still showing there."

   Held here, through the real page in a real browser:

     1. a plot audited LATE drops off the overdue row
     2. a plot NOT audited stays on it, so the fix is not "clear
        everything"
     3. a round cleared only by late work shows in Audit History under
        the month that owed it, saying Missed audit
     4. the row and its circles agree — a row that clears while its
        plots remain is worse than the bug
     5. an audit from BEFORE the window opened clears it too, and is
        recorded as missed like any other
     6. but it does NOT clear a window still OPEN. Letting an old audit
        answer a round nobody has walked yet would mark work done before
        anybody had the chance, which is the one direction this board
        must never be wrong in.

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
      /* The same question asked of a month whose windows are all still
         in the FUTURE. Nothing can be cleared there, so this comes back
         empty -- and it is the one thing that tells a widened lower
         bound on a CLOSED window from a widened one everywhere: drop it
         on open windows too and next month reports three missed rounds
         before anybody has had a chance to walk them. */
      const nm = new Date();
      nm.setMonth(nm.getMonth() + 1);
      const missedNext = (window.MJMAuditMissed && MJMAuditMissed.rounds)
        ? MJMAuditMissed.rounds(nm.getFullYear(), nm.getMonth()) : null;
      return { rows, missed, missedNext,
               pendingReady: !!(window.MJMAuditPending && MJMAuditPending.ready()) };
    }, BACK_YM);

    /* The circles after expanding, and the history for the owed month. */
    await page.waitForTimeout(400);
    const after = await page.evaluate(({ backYm, todayYm }) => {
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
      /* …and back to the month the work was actually DONE in. The office
         put it plainly: once the case is completed it goes from the
         to-do list and lands in Audit History. The missed round is
         filed under the month that owed it; the RECORD is filed under
         the day somebody walked the plot. Both are true at once and
         this reads both. */
      let fwd = 0;
      while (typeof HIST_MONTH !== 'undefined' && HIST_MONTH < todayYm && fwd++ < 24) histShift(1);
      const doneMonth = typeof HIST_MONTH !== 'undefined' ? HIST_MONTH : null;
      const doneRows  = [...document.querySelectorAll('#hist-list .hist-row')].map(el => ({
        missed: el.classList.contains('hist-missed'),
        ttl: (el.querySelector('.hist-ttl') || {}).textContent || '',
        sub: (el.querySelector('.hist-sub') || {}).textContent || ''
      }));
      return { rows, histMonth, histRows, doneMonth, doneRows };
    }, { backYm: BACK_YM, todayYm: TODAY_ISO.slice(0, 7) });

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

  /* ── D. audited long BEFORE any of these windows opened ────────
     Before the schedule itself begins, so there is no round this could
     be "on time" for. It still clears every CLOSED round, and must
     still clear none of the open or future ones. */
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
  console.log('D too early  :', JSON.stringify(owedPlots(tooEarly)),
              '| missed:', JSON.stringify(missedOf(tooEarly)),
              '| next month:', JSON.stringify((tooEarly.missedNext || []).length));
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

  /* ── THE LOWER BOUND, AS THE OFFICE ASKED FOR IT ───────────────── */
  check('an audit from before the window opened clears it too',
        !owedPlots(tooEarly).includes('B01') && !owedPlots(tooEarly).includes('B02'));
  check('and every round it cleared is recorded as missed',
        missedOf(tooEarly).length >= 3);
  check('but it clears nothing whose window has not closed yet',
        Array.isArray(tooEarly.missedNext) && tooEarly.missedNext.length === 0);
  /* Only audit_plot_audits is served, so Seedling Height has no audit of
     any kind -- the office's "as long as not yet audit, it will still
     showing there", standing right beside the plots that cleared. */
  const heightPlots = (r) => {
    const s = new Set();
    r.rows.filter(x => /Seedling Height/i.test(x.title)).forEach(x => x.plots.forEach(p => s.add(p)));
    return [...s].sort();
  };
  check('a module nobody has audited at all is untouched by any of it',
        heightPlots(tooEarly).includes('B01') && heightPlots(tooEarly).includes('B02'));

  /* THE OFFICE'S OWN ACCEPTANCE: gone from the to-do list, and in the
     history. The row leaving is checked above; this is the other half,
     and it is the half somebody would otherwise take on trust. */
  check('the completed work is in Audit History',
        bothLate.after.doneMonth === TODAY_ISO.slice(0, 7));
  check('under the month it was done in, as a real record and not a missed one',
        bothLate.after.doneRows.some(r => !r.missed && /plot condition/i.test(r.ttl)));
  check('one row per plot walked',
        bothLate.after.doneRows.filter(r => !r.missed).length === 2);

  check('no page errors', none.errs.length === 0 && bothLate.errs.length === 0);

  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})();
