/* A DRONE MAP ASKS FOR ITS REMARK WHEN IT ARRIVES.

   The remark box has existed since the maps became a list — "north half,
   flown 21 Feb" is what tells two pictures of one plot apart, and it is not
   in a file name. What it did not have was a way IN.

   The panel it lives in opened on the CHIP, and the chip only opened it with
   a map already behind it. So on the first upload the picker closed, the chip
   went green, and nothing anywhere offered a remark: the one route to the box
   was knowing to press the chip a SECOND time, which is not a thing a screen
   says. The office said it in one line — 3rd culling upload 的 drone map 要可
   以放 remark.

   So a map that ARRIVES opens the panel on its own and puts the cursor in its
   remark. The moment to write it is the moment somebody is holding the
   picture in their head, not a press they have to discover.

   Two things it must NOT do, and both are in here:

     · a REPLACE keeps the remark already written, so it is not offered for
       typing again — selecting a sentence somebody meant to keep is how it
       gets overwritten;
     · a map that never landed — a locked row, a file that would not read —
       offers nothing, because there is nothing to write a remark about.

   Driven through the real page and the real picker.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_drone_map_asks_for_its_remark.cjs
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
  await page.waitForTimeout(4500);

  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const map = (n) => ({ name: n, mimeType: 'image/png', buffer: PNG });

  await page.evaluate(() => {
    window.__TOASTS = [];
    const real = window.showToast;
    window.showToast = (m, t) => { window.__TOASTS.push({ m: String(m), t: t || 'success' }); };
    window.__realToast = real;
    window.__ALERTS = [];
    window.alert = (m) => { window.__ALERTS.push(String(m)); };
  });

  console.log('\nThe page came up');
  check('no page error', errs.filter(e => !/MJMReview/.test(e)).length === 0);

  /* U4 is the plot the office was looking at, and `t6_plotData` is what the
     tab builds its rows from — the row id follows its index. */
  const rowId = await page.evaluate(async () => {
    switchTab(6);
    await new Promise(r => setTimeout(r, 1800));
    const i = t6_plotData.findIndex(p => String(p.plot).trim().toUpperCase() === 'U4');
    return i < 0 ? null : 't6-row-' + i;
  });
  check('the 3rd Culling tab has a row for U4', !!rowId);
  if (!rowId) {
    await browser.close(); server.close();
    console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1);
  }

  console.log('\n── 1 · THE FIRST MAP OPENS THE PANEL AND ASKS ──');
  /* Before: the panel is shut and there is no box anywhere on screen. */
  check('the panel starts closed',
        await page.evaluate(() => document.getElementById('t6-maps-panel').classList.contains('hidden')));
  check('…and no remark box is on screen',
        await page.evaluate(() => document.querySelectorAll('.t6-doc-note').length === 0));

  await page.setInputFiles(`#${rowId}-doc-input`, [map('u4-north.png')]);
  await page.waitForTimeout(900);
  const first = await page.evaluate(() => {
    const panel = document.getElementById('t6-maps-panel');
    const boxes = document.querySelectorAll('#t6-maps-body .t6-doc-note');
    return {
      open: !panel.classList.contains('hidden'),
      boxes: boxes.length,
      focused: boxes.length ? document.activeElement === boxes[0] : false,
      empty: boxes.length ? boxes[0].value === '' : null,
      title: (document.getElementById('t6-maps-title') || {}).innerText || '',
      placeholder: boxes.length ? boxes[0].placeholder : ''
    };
  });
  check('the panel opened on its own', first.open);
  check('…with a remark box for the map that just arrived', first.boxes === 1);
  check('…and the cursor is IN it', first.focused);
  check('…empty, because there is nothing yet to replace', first.empty === true);
  check('…and it says what a remark is for', /which part of the plot/i.test(first.placeholder));
  check('…under a heading naming the plot', /U4/i.test(first.title));

  /* On the previous code nothing opens, so there is no box to type in and the
     rest of this would report a stack instead of a finding. */
  if (!first.boxes) {
    check('a map that arrives is offered a remark — on the previous code the panel never opened', false);
    await browser.close(); server.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(1);
  }

  console.log('\nWhat is typed lands on THAT map, and survives the panel closing');
  await page.evaluate(() => {
    const box = document.querySelector('#t6-maps-body .t6-doc-note');
    box.value = 'North half, flown 21 Feb';
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => closeT6Gallery());
  await page.waitForTimeout(200);
  check('the panel closes', await page.evaluate(() =>
    document.getElementById('t6-maps-panel').classList.contains('hidden')));
  await page.evaluate((r) => onT6DocChip(r), rowId);
  await page.waitForTimeout(400);
  check('…and the remark is still there when it is opened again',
        await page.evaluate(() => document.querySelector('#t6-maps-body .t6-doc-note').value)
          === 'North half, flown 21 Feb');
  await page.evaluate(() => closeT6Gallery());

  console.log('\n── 2 · SEVERAL AT ONCE OPEN ON THE FIRST OF THEM ──');
  /* The panel lists every one underneath, so the rest are a tab away —
     and scrolling to the last is the one that is never what you want. */
  await page.setInputFiles(`#${rowId}-doc-input`, [map('u4-south.png'), map('u4-reflown.png')]);
  await page.waitForTimeout(1200);
  const many = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('#t6-maps-body .t6-doc-note'));
    return {
      open: !document.getElementById('t6-maps-panel').classList.contains('hidden'),
      boxes: boxes.length,
      at: boxes.indexOf(document.activeElement),
      kept: boxes[0] ? boxes[0].value : null
    };
  });
  check('all three maps are on the plot', many.boxes === 3);
  check('…the panel is open', many.open);
  check('…the cursor is on the FIRST of the two that just arrived', many.at === 1);
  check('…and the one already written is untouched', many.kept === 'North half, flown 21 Feb');

  console.log('\n── 3 · A REPLACE KEEPS THE REMARK AND DOES NOT ASK AGAIN ──');
  await page.evaluate(() => {
    const boxes = document.querySelectorAll('#t6-maps-body .t6-doc-note');
    boxes[1].value = 'South half, re-flown after cloud';
    boxes[1].dispatchEvent(new Event('input', { bubbles: true }));
    document.activeElement.blur();
  });
  await page.evaluate((r) => replaceT6Doc(r, 1), rowId);
  await page.setInputFiles(`#${rowId}-doc-input`, [map('u4-south-v2.png')]);
  await page.waitForTimeout(900);
  const replaced = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('#t6-maps-body .t6-doc-note'));
    const names = Array.from(document.querySelectorAll('#t6-maps-body .truncate')).map(e => e.innerText);
    return {
      boxes: boxes.length,
      note: boxes[1] ? boxes[1].value : null,
      name: names[1] || '',
      focusedBox: boxes.indexOf(document.activeElement)
    };
  });
  check('still three maps — a replace swaps, it does not add', replaced.boxes === 3);
  check('…the picture is the new one', /u4-south-v2/.test(replaced.name));
  check('…the remark it had is kept', replaced.note === 'South half, re-flown after cloud');
  check('…and it is NOT offered for typing again', replaced.focusedBox === -1);

  console.log('\n── 4 · A MAP THAT NEVER LANDED OFFERS NOTHING ──');
  /* A row dated in a locked month refuses the file. Opening a panel and
     pointing at a remark box for a map that was not taken would be the
     screen saying the upload worked. */
  await page.evaluate(() => closeT6Gallery());
  await page.evaluate((r) => { document.getElementById(r).classList.add('mjm-locked'); }, rowId);
  await page.evaluate(() => { window.__ALERTS = []; });
  await page.setInputFiles(`#${rowId}-doc-input`, [map('u4-late.png')]);
  await page.waitForTimeout(800);
  const locked = await page.evaluate(() => ({
    open: !document.getElementById('t6-maps-panel').classList.contains('hidden'),
    alerts: window.__ALERTS,
    boxes: document.querySelectorAll('#t6-maps-body .t6-doc-note').length
  }));
  check('the panel stays shut', !locked.open);
  check('…and it said why', locked.alerts.some(m => /locked month/i.test(m)));
  await page.evaluate((r) => { document.getElementById(r).classList.remove('mjm-locked'); }, rowId);

  console.log('\nAnd the maps are still the three that were really attached');
  check('three, with their remarks', await page.evaluate((r) => {
    const n = document.querySelectorAll(`#${r}-doc-chip`).length;
    return n === 1;
  }, rowId));
  await page.evaluate((r) => onT6DocChip(r), rowId);
  await page.waitForTimeout(400);
  const final = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#t6-maps-body .t6-doc-note')).map(b => b.value));
  check('…and nothing was lost on the way',
        JSON.stringify(final) === JSON.stringify(
          ['North half, flown 21 Feb', 'South half, re-flown after cloud', '']));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
