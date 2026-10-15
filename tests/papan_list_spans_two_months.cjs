/* THE PAPAN STRIP SPANS TWO MONTHS, THROUGH THE REAL PAGE.
 *
 * tests/papan_sees_both_months.cjs holds the rule by lifting the
 * functions out of the shipped files. This one opens what the auditor
 * actually opens and reads what they would see.
 *
 * WHICH PAGE THAT IS, IS THE FIRST THING TO KNOW. The papan module has
 * no landing list of its own any more — `init()` in
 * audit_papan_script.js redirects to audit_home.html unless the address
 * names a plot, so the auditor's list of papan plots IS the To Do
 * card's strip of circles on the home board. A test that drove the
 * module page would be testing a screen nobody reaches.
 *
 * Held here:
 *   1. a plot transplanted LAST month is on the strip
 *   2. so is one from THIS month
 *   3. one from two months back is not
 *   4. the strip says which month each run belongs to, newest first
 *   5. the module page, reached by a deep link, groups its own list the
 *      same way
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/papan_list_spans_two_months.cjs
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

/* Whatever month this is run in, the three cases have to hold: this
   month, last month, and one month too far back. The 15th is used so no
   neighbouring month can be reached by a day of slop. */
const NOW = new Date();
const ym  = (back) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth() - back, 15);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-15';
};
const THIS_M = ym(0), LAST_M = ym(1), TOO_FAR = ym(2);
const MON3 = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const tagOf = iso => MON3[Number(iso.slice(5,7)) - 1] + ' ' + iso.slice(2,4);

const LOGS = [
  { plot_name:'B01', batch_name:'901', transaction_type:'Transplanted',
    breed_name:'IOI', quantity_change:2300, transaction_date:THIS_M, created_at:THIS_M+'T02:00:00Z' },
  /* B02 below is LAST month, which is what makes last month's round
     one that owed something and was never done -- the carried row. */
  { plot_name:'B02', batch_name:'902', transaction_type:'Transplanted',
    breed_name:'IOI', quantity_change:2100, transaction_date:LAST_M, created_at:LAST_M+'T02:00:00Z' },
  { plot_name:'B03', batch_name:'903', transaction_type:'Transplanted',
    breed_name:'IOI', quantity_change:1900, transaction_date:TOO_FAR, created_at:TOO_FAR+'T02:00:00Z' }
];
const BALANCE = LOGS.map(l => ({ plot_name:l.plot_name, batch_name:l.batch_name, qty:5000 }));

function tableOf(url){
  const m = /\/rest\/v1\/([a-z0-9_]+)/i.exec(url);
  return m ? m[1] : '';
}
/* What PostgREST would do with the or=(…) the module page sends. A stub
   that ignored it would pass over a page asking for the wrong month. */
function applyWindow(url, rows){
  const m = /transaction_date\.gte\.(\d{4}-\d{2}-\d{2})/.exec(decodeURIComponent(url));
  if (!m) return { rows, from: null };
  return { rows: rows.filter(r => (r.transaction_date || '') >= m[1]), from: m[1] };
}

let fail = 0;
const ok = (cond, what) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + what);
  if (!cond) fail = 1;
};

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* Same reason admin_can_close_a_dead_plot.cjs blocks them: page.route
     does not reach a fetch the service worker makes, and once it
     activates it answers its own synthetic 503. */
  async function open(url){
    const ctx  = await browser.newContext({ viewport:{ width:900, height:1600 },
                                            serviceWorkers:'block' });
    const page = await ctx.newPage();
    const errs = [];
    let askedFrom = null;
    page.on('pageerror', e => errs.push(String(e)));
    await page.route('**/rest/v1/**', (route) => {
      const u = route.request().url();
      const t = tableOf(u);
      let body = [];
      if (t === 'shared_inventory_logs'){
        const r = applyWindow(u, LOGS);
        body = r.rows;
        if (r.from) askedFrom = r.from;
      } else if (t === 'shared_plot_batch_balance'){
        body = BALANCE;
      }
      route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ access_token:'x', refresh_token:'y', user:{ id:'u1' } }) }));
    await page.route('**cdn.tailwindcss.com/**', r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
    await page.route('**cdn.jsdelivr.net/**',    r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
    await page.route('**fonts.googleapis.com/**',r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
    await page.addInitScript(() => {
      const u = { id:'u1', email:'auditor@mjmnursery.com', full_name:'Auditor',
                  role:'admin', audit_role:'admin', permissions:{ audit_landing:'MN' } };
      try {
        localStorage.clear();
        localStorage.setItem('mjm_user', JSON.stringify(u));
        localStorage.setItem('mjm_nursery_scope:u1', 'MN');
        localStorage.setItem('sb-kibqjztozokohqmhqqqf-auth-token', JSON.stringify({
          access_token:'x', refresh_token:'y',
          expires_at: Math.floor(Date.now()/1000) + 86400, user:{ id:'u1', email:u.email }
        }));
      } catch (e) {}
    });
    await page.goto(`http://localhost:${port}${url}`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(7000);
    return { ctx, page, errs, askedFrom: () => askedFrom };
  }

  /* ── 1. the home board, which is where the auditor actually looks ── */
  {
    const { ctx, page, errs } = await open('/audit/audit_home.html');
    /* Open every "+N" so the strip is the whole list, not the first ten. */
    await page.evaluate(() => document.querySelectorAll('.tl-plots-toggle').forEach(b => b.click()));
    await page.waitForTimeout(400);

    const strip = await page.evaluate(() => {
      /* THIS month's row: the board tags a carried one with the month
         it came from, so the one without that tag is the current one. */
      const row = [...document.querySelectorAll('#todo-section .tl-item')]
        .find(el => el.dataset.mod === 'papan' && !el.querySelector('.tl-from'));
      if (!row) return null;
      return [...row.querySelectorAll('.tl-plots > *')].map(el =>
        el.classList.contains('tl-plot-mon')
          ? { kind:'month', text: el.textContent.trim(), month: el.dataset.month }
          : el.classList.contains('tl-plot')
            ? { kind:'plot', text: el.textContent.trim(), title: el.getAttribute('title') || '' }
            : { kind:'other' });
    });

    ok(!!strip, 'the home board carries a Papan Tanda row for THIS month, with a plot strip');
    const plots = (strip||[]).filter(e => e.kind === 'plot').map(e => e.text);
    const months = (strip||[]).filter(e => e.kind === 'month').map(e => e.text);

    ok(plots.includes('B02'), 'a plot transplanted LAST month is on the strip');
    ok(plots.includes('B01'), 'and one from THIS month');
    ok(!plots.includes('B03'), 'a plot from two months back is not');

    ok(months.length === 2, 'the strip is marked with two months (' + months.join(' / ') + ')');
    ok(months[0] === tagOf(THIS_M), 'this month heads it (' + months[0] + ')');
    ok(months[1] === tagOf(LAST_M), 'last month follows (' + months[1] + ')');
    /* The tag comes BEFORE the run it names, or it labels the wrong one. */
    const order = (strip||[]).map(e => e.kind === 'month' ? e.text : e.text);
    ok(order.join('>') === [tagOf(THIS_M),'B01',tagOf(LAST_M),'B02'].join('>'),
       'each tag sits above the run it names (' + order.join(' > ') + ')');

    const b02 = (strip||[]).find(e => e.kind === 'plot' && e.text === 'B02');
    ok(!!(b02 && b02.title.indexOf(tagOf(LAST_M)) !== -1),
       'and the chip itself says the month on hover (' + ((b02||{}).title || '') + ')');

    ok(errs.length === 0, 'no page errors on the board' + (errs.length ? ': ' + errs[0] : ''));
    await ctx.close();
  }

  /* -- 1b. PAPAN IS NOT CARRIED FORWARD ---------------------------- */
  /* The board carries an unfinished round forward, and for papan that
     put the same plots on the screen two and three times over: the
     office saw an AUG 2026 row and a SEP 2026 row above October's, with
     B03, B06, N08 and U04 under both of the first two, and said "this 2
     already passed, no need to show."

     It falls out of the window rather than being a preference. Papan's
     roster is TWO MONTHS WIDE on its own, so October's row already asks
     about every plot transplanted in September -- carrying September's
     row asks the same question again. The two-month window IS the
     catching up.

     The fixture places a plot in each of the last three months, so a
     carried row would be visible and would carry plots of its own. */
  {
    const { ctx, page, errs } = await open('/audit/audit_home.html');
    await page.evaluate(() => document.querySelectorAll('.tl-plots-toggle').forEach(b => b.click()));
    await page.waitForTimeout(400);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('#todo-section .tl-item')]
        .filter(el => el.dataset.mod === 'papan')
        .map(el => ({
          from:  ((el.querySelector('.tl-from') || {}).textContent || '').trim(),
          plots: [...el.querySelectorAll('.tl-plot')].map(a => a.textContent.trim()).sort()
        })));
    const other = [...new Set(await page.evaluate(() =>
      [...document.querySelectorAll('#todo-section .tl-item')]
        .filter(el => el.dataset.mod !== 'papan' && el.dataset.mod !== 'maint'
                   && el.querySelector('.tl-from'))
        .map(el => el.dataset.mod)))];

    ok(rows.length === 1, 'exactly ONE Papan Tanda row on the board (' + rows.length + ')');
    ok(!!rows[0] && !rows[0].from,
       'and it is this month -- no carried row above it ('
       + ((rows[0]||{}).from || 'none') + ')');
    ok(!!rows[0] && rows[0].plots.join(',') === 'B01,B02',
       'carrying nothing loses nothing of the two months: this month and last are both on it ('
       + ((rows[0]||{}).plots || []).join(',') + ')');
    ok(other.length > 0,
       'the OTHER modules are still carried -- this is papan only, because papan is the '
       + 'only one whose roster already spans two months (' + other.join(',') + ')');
    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
    await ctx.close();
  }

  /* ── 2. the module page, reached the one way it can be ──────────── */
  {
    const { ctx, page, errs, askedFrom } = await open('/audit/audit_papan_index.html?admin=1');
    const seen = await page.evaluate(() => ({
      url: location.pathname,
      groups: [...document.querySelectorAll('.papan-month-group')].map(g => ({
        month: g.dataset.month,
        head:  (g.querySelector('.papan-month-head') || {}).innerText || '',
        plots: [...g.querySelectorAll('.plot-chip')].map(b => b.textContent.trim()).sort()
      }))
    }));
    const expectFrom = (() => {
      const d = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1);
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-01';
    })();
    ok(/audit_papan_index/.test(seen.url), 'an admin link opens the module itself');
    ok(askedFrom() === expectFrom,
       'it asks the ledger for everything since ' + expectFrom + ' (asked: ' + askedFrom() + ')');
    ok(seen.groups.length === 2,
       'its own list is split into two month groups (' + seen.groups.length + ')');
    ok(!!(seen.groups[0] && seen.groups[0].plots.join(',') === 'B01'), 'this month first');
    ok(!!(seen.groups[1] && seen.groups[1].plots.join(',') === 'B02'), 'last month after it');
    const name = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1)
      .toLocaleString('en', { month:'long' }).toUpperCase();
    ok(!!(seen.groups[1] && seen.groups[1].head.toUpperCase().indexOf(name) !== -1),
       'the heading names the month in words, the way the physical sign spells it');
    ok(errs.length === 0, 'no page errors in the module' + (errs.length ? ': ' + errs[0] : ''));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log('');
  console.log(fail ? 'FAILED' : 'all green');
  process.exit(fail);
})();
