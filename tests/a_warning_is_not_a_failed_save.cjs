/* A WARNING IS NOT A FAILED SAVE.

   The office pressed X on batch 241 and got a red bar:

       Not closing — 3rd Culling did not save. Nothing has been lost.

   It HAD saved. Every time.

   Closing watches for an error toast while a tab's save runs and leaves the
   tab unsaved if it sees one -- which is right, because that is how every
   save on the page reports a refusal. But three saves were reporting a
   WARNING the same way:

     · a 3rd Culling whose drone map does not tally is stored and then says
       so, because the plot goes on the To Do List until somebody explains
       it;
     · a row whose drone map failed to upload is stored without the map
       (Tabs 3, 5 and 6);
     · the To Do flag failing to update after the report itself is stored.

   So the tab was left dirty by its own success. Saving again said the same
   thing, so the only way out was Don't save -- which reads as throwing a
   day's counting away.

   'error' now means ONE thing: what you keyed is not in the database.
   Everything else is 'warn' -- amber, and not a failure.

   Driven through the real page and the real saveTab6, with the office's own
   figures: 500 third culled against a drone map of 540.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_warning_is_not_a_failed_save.cjs
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'operation', 'operation_batch_detail.html'), 'utf8');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

const UID = '00000000-0000-0000-0000-000000000001';
const FAKE_SUPABASE = `
window.supabase = { createClient: function () {
  function builder(table) {
    var b = { _t: table, _eq: {}, _in: null, _like: null, _one: false };
    ['neq','is','or','not','gt','gte','lt','lte','ilike','order','limit','filter','match','contains','overlaps','select','range']
      .forEach(function (m) { b[m] = function () { return b; }; });
    b.eq = function (c, v) { b._eq[c] = v; return b; };
    b.in = function (c, v) { b._in = { col: c, vals: v.map(String) }; return b; };
    b.like = function (c, p) { b._like = { col: c, pat: p }; return b; };
    b.single = function () { b._one = true; return b; };
    b.maybeSingle = b.single;
    b._rows = function () {
      if (table === 'shared_profiles' && window.__FAKE_PROFILE) return [window.__FAKE_PROFILE];
      var rows = (window.__ROWS && window.__ROWS[table]) || [];
      var eq = b._eq, lk = b._like;
      return rows.filter(function (r) {
        for (var k in eq) { if (String(r[k]) !== String(eq[k])) return false; }
        if (b._in && b._in.vals.indexOf(String(r[b._in.col])) < 0) return false;
        if (lk) { var pre = String(lk.pat).replace(/%$/, '');
                  if (String(r[lk.col] || '').indexOf(pre) !== 0) return false; }
        return true;
      });
    };
    b._settle = function () {
      var rows = b._deleted ? b._rows() : b._rows();
      return { data: b._one ? (rows[0] || null) : rows, error: null, count: rows.length };
    };
    b.then = function (r, j) { return Promise.resolve(b._settle()).then(r, j); };
    b.catch = function (f) { return Promise.resolve(b._settle()).catch(f); };
    b.finally = function (f) { return Promise.resolve(b._settle()).finally(f); };
    b.insert = function (rows) { return Promise.resolve({ data: null, error: null }); };
    b.update = function () { return b; };
    b.delete = function () { b._deleted = true; return b; };
    b.upsert = function () { return Promise.resolve({ data: null, error: null }); };
    return b;
  }
  return {
    from: builder,
    rpc: function () { return Promise.resolve({ data: null, error: null }); },
    channel: function () { var c = { on: function(){return c;}, subscribe: function(){return c;} }; return c; },
    removeChannel: function () {},
    storage: { from: function () { return {
      upload: function () { return Promise.resolve({ data: null, error: null }); },
      getPublicUrl: function () { return { data: { publicUrl: '' } }; } }; } },
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: window.__FAKE_SESSION }, error: null }); },
      getUser: function () { return Promise.resolve({ data: { user: window.__FAKE_SESSION.user }, error: null }); },
      onAuthStateChange: function (cb) {
        setTimeout(function () { try { cb('SIGNED_IN', window.__FAKE_SESSION); } catch (e) {} }, 0);
        return { data: { subscription: { unsubscribe: function () {} } } };
      },
      signOut: function () { return Promise.resolve({ error: null }); }
    }
  };
} };`;

/* Batch 241 as the office had it: U4 standing in the main nursery with
   seedlings to third-cull. */
const ROWS = {
  shared_inventory_logs: [
    { id: 1, batch_name: '241', transaction_type: 'Seeds_Received', quantity_change: 11000,
      breed_name: 'IOI DxP HYBRID', transaction_date: '2025-06-01', created_at: '2025-06-01T00:00:00Z',
      plot_name: null, remark: 'Seeds received. Supplier: IOI. DO_Qty: 11000. Incl. 0% FOC.' },
    { id: 2, batch_name: '241', transaction_type: 'Transplanted', plot_name: 'U4', quantity_change: 10000,
      transaction_date: '2025-09-01', created_at: '2025-09-01T00:00:00Z',
      remark: 'Transplanted from tray [P1] to Main Plot [U4]. Date: 2025-09-01' }
  ],
  operation_trays: [], shared_do_records: [], operation_batch_verifications: [], nelos_cases: []
};

let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  await page.route('**supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**cdn.tailwindcss.com/**', r => r.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'document.addEventListener("DOMContentLoaded", function () {' +
          '  document.head.insertAdjacentHTML("beforeend", ' +
          JSON.stringify('<style>.hidden{display:none}</style>') + '); });' }));
  await page.route('**cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await page.route('**cdnjs.cloudflare.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

  await page.addInitScript(({ uid, rows }) => {
    const user = { id: uid, email: 'esther@mjmnursery.com', user_metadata: { full_name: 'Esther Wong' } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    window.__FAKE_PROFILE = { id: uid, email: user.email, full_name: 'Esther Wong', user_type: 'staff',
      permissions: { modules: { operation: 'admin' }, manage_users: true } };
    window.__ROWS = rows;
    try { localStorage.clear(); } catch (e) {}
  }, { uid: UID, rows: ROWS });

  await page.goto(`http://localhost:${port}/operation/operation_batch_detail.html?id=241`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.saveTab6 === 'function', { timeout: 20000 });
  await page.waitForTimeout(4500);         // the load handler wraps the saves

  /* Everything the save reaches outside the page is captured, and nothing is
     allowed to navigate: leaving would take the rest of the test with it. */
  await page.evaluate(() => {
    window.__TOASTS = [];
    const realToast = window.showToast;
    window.__realToast = realToast;
    window.showToast = function (m, t) { window.__TOASTS.push({ m: m, t: t || 'success' }); return realToast.apply(this, arguments); };
    window.__WROTE = [];
    window.safeReplaceLogs = (b, types, logs) => {
      if (window.__REPLACE_FAILS) return Promise.resolve({ error: { message: 'Database blocked save.' } });
      window.__WROTE.push(...logs);
      return Promise.resolve({ error: null });
    };
    window.safeInsertLogs = (logs) => { window.__WROTE.push(...logs); return Promise.resolve({ error: null }); };
    window.__LEFT = false;
    window._leaveBatchRecord = () => { window.__LEFT = true; };
    window.confirm = () => true;
  });

  // The office's own figures, keyed the way a person keys them.
  const keyed = await page.evaluate(async () => {
    switchTab(6);
    await new Promise(r => setTimeout(r, 1500));
    const idx = t6_plotData.findIndex(p => String(p.plot).trim().toUpperCase() === 'U4');
    const row = document.getElementById('t6-row-' + idx);
    const put = (sel, v) => {
      const el = row.querySelector(sel);
      if (!el) return false;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const ok = [put('.t6-balance', '9500'), put('.t6-culled-input', '500'), put('.t6-map-qty', '540')];
    await new Promise(r => setTimeout(r, 300));
    return { idx, ok, dirty: window._dirtyTabNames() };
  });
  check('a plot of batch 241 is there to third-cull', keyed.idx >= 0);
  check('500 culled against a drone map of 540, keyed', keyed.ok.every(Boolean));
  check('…which makes 3rd Culling unsaved work, as it should',
        keyed.dirty.indexOf('3rd Culling') >= 0);

  console.log('\nThe save goes through, and the unexplained map is a WARNING');
  const saved = await page.evaluate(async () => {
    window.__TOASTS = [];
    window.__WROTE = [];
    await window.saveTab6();                       // the wrapped one, as the button calls it
    await new Promise(r => setTimeout(r, 600));
    return {
      toasts: window.__TOASTS.slice(),
      culled: window.__WROTE.filter(l => l.transaction_type === '3rd_Culling')
                             .map(l => ({ plot: l.plot_name, qty: l.quantity_change })),
      flags: window.__WROTE.filter(l => l.transaction_type === 'Review_Rejection').length,
      dirty: window._dirtyTabNames()
    };
  });
  console.log('  toasts: ' + JSON.stringify(saved.toasts));
  check('the counting reached the database', saved.culled.length === 1
        && saved.culled[0].plot === 'U4' && saved.culled[0].qty === 500);
  check('…and the plot went on the To Do List, so nothing is being hidden', saved.flags === 1);
  check('nothing was reported as an error', saved.toasts.every(t => t.t !== 'error'));
  check('the drone map is a warning', saved.toasts.some(t => t.t === 'warn' && /drone map reason/i.test(t.m)));
  check('…and it says the report saved', saved.toasts.some(t => t.t === 'warn' && /saved/i.test(t.m)));
  /* THE WHOLE BUG: a save that worked must not leave the tab unsaved. */
  check('3rd Culling is no longer unsaved work', saved.dirty.indexOf('3rd Culling') < 0);

  console.log('\nSo pressing X closes');
  const closed = await page.evaluate(() => {
    window.__LEFT = false;
    window.closeBatchRecord();
    return { left: window.__LEFT,
             asked: !document.getElementById('unsaved-modal').classList.contains('hidden'),
             toasts: window.__TOASTS.slice() };
  });
  check('it leaves', closed.left === true);
  check('…without asking about a tab that is saved', closed.asked === false);
  check('…and nothing claims 3rd Culling did not save',
        !closed.toasts.some(t => /did not save/i.test(t.m)));

  console.log('\nA drone map that will not upload is a warning too — the row is stored without it');
  const upFailed = await page.evaluate(async () => {
    window.__TOASTS = [];
    window.__WROTE = [];
    const idx = t6_plotData.findIndex(p => String(p.plot).trim().toUpperCase() === 'U4');
    const rowId = 't6-row-' + idx;
    t6SetDocs(rowId, [{ name: 'north.jpg', base64: 'data:image/jpeg;base64,AAAA', note: 'North half', isImg: true }]);
    window._uploadBatchDoc = async () => { window._mjmLastUploadError = 'bucket policy'; return ''; };
    await window.saveTab6();
    await new Promise(r => setTimeout(r, 600));
    return { toasts: window.__TOASTS.slice(),
             culled: window.__WROTE.filter(l => l.transaction_type === '3rd_Culling').length,
             dirty: window._dirtyTabNames() };
  });
  check('the counting still reached the database', upFailed.culled === 1);
  check('the failed upload is a warning, not an error',
        upFailed.toasts.some(t => t.t === 'warn' && /failed to upload/i.test(t.m))
        && upFailed.toasts.every(t => t.t !== 'error'));
  check('…and 3rd Culling is not left unsaved over a picture', upFailed.dirty.indexOf('3rd Culling') < 0);

  console.log('\nAnd a REAL refusal still holds the door');
  const refused = await page.evaluate(async () => {
    window.__TOASTS = [];
    window.__REPLACE_FAILS = true;
    const idx = t6_plotData.findIndex(p => String(p.plot).trim().toUpperCase() === 'U4');
    const el = document.getElementById('t6-row-' + idx).querySelector('.t6-culled-input');
    el.value = '501';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await window.saveTab6();
    await new Promise(r => setTimeout(r, 400));
    window.__LEFT = false;
    window.closeBatchRecord();
    return { toasts: window.__TOASTS.slice(), dirty: window._dirtyTabNames(),
             left: window.__LEFT,
             asked: !document.getElementById('unsaved-modal').classList.contains('hidden'),
             named: Array.from(document.querySelectorAll('#unsaved-modal-list .unsaved-row span'))
                         .map(s => s.textContent.trim()) };
  });
  check('the refusal is an error', refused.toasts.some(t => t.t === 'error'));
  check('…the tab stays unsaved', refused.dirty.indexOf('3rd Culling') >= 0);
  check('…pressing X does not leave', refused.left === false);
  check('…it asks, naming 3rd Culling', refused.asked && refused.named.indexOf('3rd Culling') >= 0);

  console.log('\nA warning does not look like a failure');
  const look = await page.evaluate(() => {
    document.getElementById('toast-container').innerHTML = '';
    window.__realToast('saved, with one thing left to do', 'warn');
    window.__realToast('not in the database', 'error');
    const t = Array.from(document.querySelectorAll('#toast-container .toast'));
    return t.map(el => ({ cls: el.className, icon: (el.querySelector('.toast-icon') || {}).textContent }));
  });
  check('a warning is its own kind of toast',
        /toast-warn/.test(look[0].cls) && !/toast-error/.test(look[0].cls));
  check('…marked ⚠️, not ❌', look[0].icon === '⚠️' && look[1].icon === '❌');

  console.log('\nNo save anywhere on the page calls something SAVED an error');
  /* The next one will be written the same way, so it is the shape that is
     held and not the sentences. A toast saying nothing WAS saved is a
     refusal and says so. */
  const liars = (SRC.match(/showToast\([^;]*'error'\)/g) || [])
    .filter(s => /\bsaved\b/i.test(s))
    .filter(s => !/not saved|nothing (?:was )?saved/i.test(s));
  check('none left' + (liars.length ? ': ' + liars.join(' | ') : ''), liars.length === 0);

  console.log('\npage errors : ' + (errs.length ? errs.join(' | ') : 'none'));
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
