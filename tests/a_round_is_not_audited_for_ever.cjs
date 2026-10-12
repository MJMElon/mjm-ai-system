/* "I SAW GOT AUDIT DONE BUT STILL SHOW IN THE TO DO LIST."

   N02 sat on the to-do list owing Plot Condition round 3, and the plot
   page showed three cards: batch 244 green, batch 253 green, batch 230
   Not Required. Every one of them looked finished. The to-do list was
   the one telling the truth — 253's last audit was round 2 — and the
   plot page was the one not saying enough:

       const audit = records.find(... batch matches ...);
       const done  = !!audit;

   ANY audit, EVER. So a batch audited once stayed green in every round
   after it, for ever, and the only screen that knew otherwise was the
   board, which names a plot and not a batch. An auditor who opens the
   plot and sees green does not audit it, and the round never closes.

   The grid above the cards asked the same way (isBatchAudited /
   isPlotAudited), so the plot badge, the "N / M audited" count and the
   cell colour all said done too.

   Both now ask about the round that is currently owed —
   MJMAuditSettings.currentWindow, the same range the board asks on, so
   a plot green here is a plot the board is not asking for.

   Held here, through the real page in a real browser:

     1. a batch audited in an EARLIER round is not green
     2. its record is still on the card — the auditor's work is not
        hidden, only stopped from answering this round
     3. a batch audited INSIDE the round is green
     4. the grid count agrees with the cards
     5. Not Required still wins over both

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_round_is_not_audited_for_ever.cjs
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

/* MN Plot Condition runs on the 10th, the 20th and the 30th. Today is
   whatever today is, so the dates are built from the round the page
   will actually be asking for rather than from the calendar in the
   office's screenshot — a test pinned to October stops meaning
   anything in November. */
const NOW = new Date();
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')
                 + '-' + String(d.getDate()).padStart(2,'0');
const TODAY = iso(NOW);
/* Well before any window this month or last opened. */
const LONG_AGO = iso(new Date(NOW.getFullYear(), NOW.getMonth() - 2, 2));

const ROSTER = [
  { plot_name:'N01', batch_name:'244', transaction_type:'Transplanted', transaction_date:'2026-01-05' },
  { plot_name:'N01', batch_name:'253', transaction_type:'Transplanted', transaction_date:'2026-01-05' },
  { plot_name:'N01', batch_name:'230', transaction_type:'Transplanted', transaction_date:'2026-01-05' }
];
const BALANCE = [
  { plot_name:'N01', batch_name:'244', qty: 5000 },
  { plot_name:'N01', batch_name:'253', qty: 4000 },
  { plot_name:'N01', batch_name:'230', qty: 0 }      /* Not Required */
];
/* 244 walked today — inside whatever round is open.
   253 walked two months ago — a round long closed. Both have a record,
   and only one of them answers the round. */
const AUDITS = [
  { id:1, audit_id:'AUD-UNN2-024', nursery:'UNN2', plot:'N01', batch:'244',
    pest:'Tidak Ada', tikus:'Tidak Ada', disease:'Banyak', warna_daun:'1',
    auditor_name:'Auditor', date: TODAY,    created_at: TODAY + 'T14:29:00Z' },
  { id:2, audit_id:'AUD-UNN2-004', nursery:'UNN2', plot:'N01', batch:'253',
    pest:'Tidak Ada', tikus:'Tidak Ada', disease:'Banyak', warna_daun:'1',
    auditor_name:'Auditor', date: LONG_AGO, created_at: LONG_AGO + 'T15:22:00Z' }
];

const tableOf = (url) => { const m = /\/rest\/v1\/([a-z0-9_]+)/i.exec(url); return m ? m[1] : ''; };

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx  = await browser.newContext({ viewport:{ width:1000, height:1400 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  await page.route('**/rest/v1/**', (route) => {
    const t = tableOf(route.request().url());
    const body = t === 'shared_inventory_logs'     ? ROSTER
               : t === 'shared_plot_batch_balance' ? BALANCE
               : t === 'audit_plot_audits'         ? AUDITS
               : [];
    route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ access_token:'x', user:{ id:'u1' } }) }));
  ['**cdn.tailwindcss.com/**','**cdn.jsdelivr.net/**'].forEach(p =>
    page.route(p, r => r.fulfill({ status:200, contentType:'text/javascript', body:'' })));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));

  await page.addInitScript(() => {
    const u = { id:'u1', email:'auditor@mjmnursery.com', full_name:'Auditor',
                role:'admin', audit_role:'admin', permissions:{ audit_landing:'MN' } };
    try {
      localStorage.clear();
      localStorage.setItem('mjm_user', JSON.stringify(u));
      localStorage.setItem('mjm_nursery_scope:u1', 'MN');
      localStorage.setItem('sb-kibqjztozokohqmhqqqf-auth-token', JSON.stringify({
        access_token:'x', refresh_token:'y',
        expires_at: Math.floor(Date.now()/1000) + 86400, user:{ id:'u1', email:u.email } }));
    } catch (e) {}
  });

  await page.goto(`http://localhost:${port}/audit/audit_plot_audit.html?plot=N01&admin=1`,
                  { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(5500);

  await page.evaluate(() => { try { selectTab('UNN2'); } catch (e) {} });
  await page.waitForTimeout(600);
  await page.evaluate(() => { try { openPlotDetail('N01'); } catch (e) {} });
  await page.waitForTimeout(900);

  const seen = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#plot-detail-list .record-item')].map(el => ({
      text:  (el.innerText || '').replace(/\s+/g, ' ').trim(),
      style: el.getAttribute('style') || '',
      hasEdit: !!el.querySelector('.edit-btn')
    }));
    return {
      round: (window.MJMAuditSettings && MJMAuditSettings.currentWindow)
        ? MJMAuditSettings.currentWindow('MN', 'plot',
            new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0')
            + '-' + String(new Date().getDate()).padStart(2,'0'))
        : null,
      cards,
      audited244: typeof isBatchAudited === 'function' ? isBatchAudited('N01','244') : null,
      audited253: typeof isBatchAudited === 'function' ? isBatchAudited('N01','253') : null
    };
  });

  const GREEN = '#22a34a';
  const card = (b) => seen.cards.find(c => c.text.indexOf('Batch ' + b) === 0) || { text:'', style:'' };
  const c244 = card('244'), c253 = card('253'), c230 = card('230');

  console.log('round        :', JSON.stringify(seen.round));
  console.log('244 (today)  :', JSON.stringify(c244.text.slice(0, 70)));
  console.log('253 (lapsed) :', JSON.stringify(c253.text.slice(0, 70)));
  console.log('230 (not req):', JSON.stringify(c230.text.slice(0, 60)));
  console.log('isBatchAudited 244 / 253 :', seen.audited244, '/', seen.audited253);
  console.log('page errors  :', errs.length ? errs.join(' | ') : 'none');

  let bad = 0;
  const check = (l, p) => { if (!p) bad++; console.log((p ? 'ok   ' : 'FAIL ') + l); };

  check('the page worked out which round is owed', !!seen.round);
  check('all three batches are on the plot', !!c244.text && !!c253.text && !!c230.text);

  check('a batch audited INSIDE the round is green', c244.style.indexOf(GREEN) !== -1);
  check('a batch whose last audit was an earlier round is NOT green',
        c253.style.indexOf(GREEN) === -1);
  check('and it says which round is due', /round \d+ due|this round due/i.test(c253.text));
  check('and when it was last audited', /last audited/i.test(c253.text));
  check('its record is still there to open', c253.hasEdit === true);

  check('the grid agrees with the card on the audited one',  seen.audited244 === true);
  check('the grid agrees with the card on the lapsed one',   seen.audited253 === false);

  check('Not Required still wins', /not required/i.test(c230.text));

  check('no page errors', errs.length === 0);

  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})();
