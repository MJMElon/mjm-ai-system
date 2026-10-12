/* RAISING A SPECIAL AUDIT, ON THE REAL SCREEN.

   The office: "in the each module, add + button. this is for special
   case audit. Eg i clicked + in plot condition audit - bnn, then i can
   select the audit date, audit plot (can pick more than 1 plot) / all
   plot and save."

   It lives on Settings → System Setting beside "+ Add round", because it
   is the same question that card already answers — when does this audit
   happen — asked once instead of monthly, and because a one-off needs
   somewhere to be seen and withdrawn.

   Held here, by mounting the REAL AuditSystemSetting against a stubbed
   Supabase client:

     1. every module in both scopes carries the button
     2. the dialog offers only the nurseries in that scope
     3. picking plots and saving writes ONE insert, carrying the module,
        the nursery, the deadline, the plots — and raised_on, which is
        what stops an audit from last month answering it
     4. "every plot" saves all_plots with an empty list, so the plots are
        worked out live rather than frozen at the moment it was raised
     5. a date already gone, or no plot at all, is refused and writes
        nothing
     6. an outstanding request is listed, and Withdraw STAMPS it rather
        than deleting it
     7. with the table not installed the card says so in words and the
        button explains instead of throwing
     8. and the list asks for OPEN requests only — not cancelled, and not
        completed. Without the second of those a finished request sat
        here reading outstanding for ever, and the only way off was
        Withdraw, which means cancelled and not done

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/special_audit_is_raised_on_the_screen.cjs
*/
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT  = path.resolve(__dirname, '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="host"></div>
<script src="/audit/audit_settings.js"></script>
<script src="/audit/audit_system_setting.js"></script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/harness.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(HARNESS); return;
  }
  const f = path.join(ROOT, url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

const TODAY = (() => { const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')
       + '-' + String(d.getDate()).padStart(2,'0'); })();
const LATER = (() => { const d = new Date(); d.setDate(d.getDate() + 9);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')
       + '-' + String(d.getDate()).padStart(2,'0'); })();
const GONE  = '2020-01-01';

async function boot(browser, { open, broken }){
  const ctx  = await browser.newContext({ viewport:{ width:1100, height:1500 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  await page.addInitScript(({ open, broken }) => {
    window.__CALLS = [];
    window.SHARED_SUPA_URL = 'x'; window.SHARED_SUPA_KEY = 'y';
    window.MJMAccess = { user: () => ({ full_name: 'Esther', email: 'e@mjm' }) };
    const mk = (table) => {
      const st = { table, verb: null, payload: null };
      const api = {
        select(){ st.verb = st.verb || 'select'; return api; },
        insert(p){ st.verb = 'insert'; st.payload = p; window.__CALLS.push({ ...st }); return api; },
        update(p){ st.verb = 'update'; st.payload = p; window.__CALLS.push({ ...st }); return api; },
        delete(){ st.verb = 'delete'; window.__CALLS.push({ ...st }); return api; },
        upsert(p){ st.verb = 'upsert'; st.payload = p; window.__CALLS.push({ ...st }); return api; },
        eq(){ return api; },
        is(col, v){ (st.filters = st.filters || []).push(col + ' is ' + v); return api; },
        order(){ return api; },
        maybeSingle(){ return api; },
        then(res){
          if (table === 'audit_special_audits' && st.verb === 'select')
            window.__CALLS.push({ table, verb: 'select', filters: st.filters || [] });
          if (table === 'audit_special_audits') {
            if (broken) return res({ data: null, error: { message: 'relation does not exist' } });
            if (st.verb === 'select') return res({ data: open, error: null });
            return res({ data: null, error: null });
          }
          if (st.verb === 'select') return res({ data: { data: {} }, error: null });
          return res({ data: null, error: null });
        }
      };
      return api;
    };
    window.supabase = { createClient: () => ({ from: mk }) };
  }, { open, broken });

  const port = server.address().port;
  await page.goto(`http://localhost:${port}/harness.html`, { waitUntil:'load' });
  await page.evaluate(async () => {
    const host = document.getElementById('host');
    host.innerHTML = AuditSystemSetting.html;
    await AuditSystemSetting.mount(host);
  });
  await page.waitForTimeout(400);
  return { page, ctx, errs };
}

const calls = (page) => page.evaluate(() => window.__CALLS.map(c => ({
  table: c.table, verb: c.verb, payload: c.payload, filters: c.filters })));
const writes = (c) => c.filter(x => x.table === 'audit_special_audits' && x.verb !== 'select');

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let bad = 0;
  const check = (l, p) => { if (!p) bad++; console.log((p ? 'ok   ' : 'FAIL ') + l); };

  /* ── A. the buttons ─────────────────────────────────────────────── */
  {
    const { page, ctx, errs } = await boot(browser, { open: [], broken: false });
    const n = await page.$$eval('.ss-sp-new', els => els.length);
    const empty = await page.$eval('#ss-special-list', el => el.innerText.trim());
    console.log('buttons:', n, '| empty list:', JSON.stringify(empty.slice(0, 60)));
    check('every module in both scopes carries a + Special audit', n === 6);
    const sel = (await calls(page)).find(c => c.table === 'audit_special_audits' && c.verb === 'select');
    console.log('list filters:', JSON.stringify(sel && sel.filters));
    check('the list asks for open requests only — not cancelled, not done',
          !!sel && sel.filters.indexOf('cancelled_at is null') !== -1
                && sel.filters.indexOf('completed_at is null') !== -1);
    check('and the card says plainly that nothing is outstanding', /nothing outstanding/i.test(empty));
    check('no page errors mounting it', errs.length === 0);
    await ctx.close();
  }

  /* ── B. raising one with named plots ────────────────────────────── */
  {
    const { page, ctx, errs } = await boot(browser, { open: [], broken: false });
    await page.click('.ss-sp-new[data-scope="MN"][data-mod="plot"]');
    await page.waitForSelector('#ss-sp-dlg');
    const nurs = await page.$$eval('#sp-nur option', o => o.map(x => x.value));
    console.log('MN nurseries offered:', JSON.stringify(nurs));
    check('the dialog offers only the nurseries in that scope',
          JSON.stringify(nurs) === JSON.stringify(['BNN','UNN1','UNN2']));

    const chips = await page.$$eval('.sp-plot', e => e.length);
    check('and every plot the nursery has, to pick from', chips === 14);   // BNN B01..B14

    await page.fill('#sp-due', LATER);
    await page.click('.sp-plot[data-plot="B01"]');
    await page.click('.sp-plot[data-plot="B03"]');
    await page.fill('#sp-note', 'Storm damage');
    await page.click('#sp-save');
    await page.waitForTimeout(300);

    const w = writes(await calls(page));
    console.log('insert:', JSON.stringify(w[0] && w[0].payload));
    check('saving writes exactly one row', w.length === 1 && w[0].verb === 'insert');
    const p = (w[0] || {}).payload || {};
    check('naming the module and the nursery', p.module === 'plot' && p.nursery === 'BNN');
    check('the deadline that was picked', p.due_date === LATER);
    check('the plots that were ticked', JSON.stringify(p.plots) === JSON.stringify(['B01','B03']));
    check('and raised_on, which is what stops an old audit answering it', p.raised_on === TODAY);
    check('the note rides with it', p.note === 'Storm damage');
    check('and the dialog closes', (await page.$('#ss-sp-dlg')) === null);
    check('no page errors', errs.length === 0);
    await ctx.close();
  }

  /* ── C. every plot ──────────────────────────────────────────────── */
  {
    const { page, ctx } = await boot(browser, { open: [], broken: false });
    await page.click('.ss-sp-new[data-scope="MN"][data-mod="height"]');
    await page.waitForSelector('#ss-sp-dlg');
    await page.fill('#sp-due', LATER);
    await page.check('#sp-all');
    await page.click('#sp-save');
    await page.waitForTimeout(300);
    const p = (writes(await calls(page))[0] || {}).payload || {};
    console.log('all plots:', JSON.stringify(p));
    check('"every plot" saves the flag, not a frozen list',
          p.all_plots === true && JSON.stringify(p.plots) === JSON.stringify([]));
    await ctx.close();
  }

  /* ── D. what it refuses ─────────────────────────────────────────── */
  {
    const { page, ctx } = await boot(browser, { open: [], broken: false });
    await page.click('.ss-sp-new[data-scope="MN"][data-mod="plot"]');
    await page.waitForSelector('#ss-sp-dlg');
    await page.click('#sp-save');                        // no plot picked
    await page.waitForTimeout(150);
    const e1 = await page.$eval('#sp-err', el => el.textContent);
    await page.click('.sp-plot[data-plot="B01"]');
    await page.fill('#sp-due', GONE);
    await page.click('#sp-save');
    await page.waitForTimeout(150);
    const e2 = await page.$eval('#sp-err', el => el.textContent);
    console.log('refusals:', JSON.stringify([e1, e2]));
    check('no plot picked is refused', /at least one plot/i.test(e1));
    check('a day already gone is refused', /gone/i.test(e2));
    check('and neither wrote anything', writes(await calls(page)).length === 0);
    await ctx.close();
  }

  /* ── E. the outstanding list, and withdrawing ───────────────────── */
  {
    const open = [{ id: 7, module:'plot', nursery:'BNN', due_date: LATER, raised_on: TODAY,
                    all_plots:false, plots:['B01','B03'], note:'Storm damage', created_by:'Esther' }];
    const { page, ctx } = await boot(browser, { open, broken: false });
    const txt = await page.$eval('#ss-special-list', el => el.innerText.replace(/\s+/g,' '));
    console.log('listed:', JSON.stringify(txt.slice(0, 110)));
    check('an outstanding request is listed', /Plot Condition Audit/.test(txt) && /BNN/.test(txt));
    check('with its deadline and how many plots', /due/i.test(txt) && /2 plots/.test(txt));
    check('and the plots it named', /B01/.test(txt) && /B03/.test(txt));

    page.on('dialog', d => d.accept());
    await page.click('.ss-sp-drop');
    await page.waitForTimeout(300);
    const w = writes(await calls(page));
    console.log('withdraw:', JSON.stringify(w.map(x => ({ v:x.verb, p:x.payload }))));
    check('Withdraw stamps the row', w.length === 1 && w[0].verb === 'update'
          && !!w[0].payload.cancelled_at);
    check('and never deletes it', w.every(x => x.verb !== 'delete'));
    await ctx.close();
  }

  /* ── F. the table is not installed ──────────────────────────────── */
  {
    const { page, ctx, errs } = await boot(browser, { open: [], broken: true });
    const txt = await page.$eval('#ss-special-list', el => el.innerText.replace(/\s+/g,' '));
    let said = '';
    page.on('dialog', d => { said = d.message(); d.accept(); });
    await page.click('.ss-sp-new[data-scope="MN"][data-mod="plot"]');
    await page.waitForTimeout(250);
    console.log('not installed:', JSON.stringify(txt.slice(0, 80)));
    check('the card names the file to run', /RUN_ME_audit_special_audits\.sql/.test(txt));
    check('and the button says so rather than opening a form that cannot save',
          /not installed/i.test(said) && (await page.$('#ss-sp-dlg')) === null);
    check('no page errors', errs.length === 0);
    await ctx.close();
  }

  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})();
