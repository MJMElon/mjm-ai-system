/* PROJECT MONITORING SYSTEM signs nobody in. It reads the portal's login.
 *
 * The tracker it was built from had a "Signed in as" dropdown: anybody
 * picked any name, and until somebody was made Admin everybody was one.
 * As a module of the MJM AI system it has the portal's own login instead
 * (shared_profiles), and this drives the real pms/pms_dashboard.html with a
 * stubbed database to hold it to that:
 *
 *   - a login with no `pms` level is sent back to the portal and draws nothing
 *   - a module Admin is Admin on every tab
 *   - a Normal login gets the levels of the Team row LINKED TO ITS E-MAIL,
 *     whatever case the e-mail was keyed in
 *   - a Normal login nobody has linked can look and request, and cannot
 *     open Settings or add a task
 *   - A NAME IS NEVER A LOGIN. A profile's full name is the one thing its
 *     owner can edit, so somebody named like an admin is still themselves
 *   - the data is the portal's own tables, pms_*, and nothing else
 *   - Settings -> Team offers the staff accounts, never a customer's
 *   - the hub tile is hidden until granted, and User Access can grant it
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/project_monitoring_uses_the_portal_login.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require((process.env.NODE_PATH || '/opt/node22/lib/node_modules') + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

/* A stub that APPLIES what it is sent and records it. One that swallowed a
   write would sign off whatever the page sent, and one that answered every
   table with the same rows could not tell pms_tasks from tasks. */
const FAKE_SUPABASE = `
window.__READS = []; window.__WRITES = [];
window.supabase = { createClient: function () {
  function builder(table) {
    var b = { _eq: {} };
    ['or','not','gt','gte','lt','lte','ilike','order','limit','in','range','neq','is']
      .forEach(function (m) { b[m] = function () { return b; }; });
    b.select = function () { b._sel = true; return b; };
    b.eq = function (c, v) { b._eq[c] = v; return b; };
    b.single = b.maybeSingle = function () { b._one = true; return b; };
    b.upsert = function (row) { b._op = 'upsert'; b._row = row; return b; };
    b.update = function (row) { b._op = 'update'; b._row = row; return b; };
    b.delete = function () { b._op = 'delete'; return b; };
    b.insert = function (row) { b._op = 'upsert'; b._row = row; return b; };
    function rowsOf() { var R = window.__ROWS; return R[table] || (R[table] = []); }
    function match(r) { for (var k in b._eq) if (String(r[k]) !== String(b._eq[k])) return false; return true; }
    b.then = function (res, rej) {
      var rows = rowsOf(), out;
      if (!b._op) {
        window.__READS.push(table);
        if (table === 'shared_profiles' && b._eq.id) rows = [window.__FAKE_PROFILE];
        var got = rows.filter(match);
        out = { data: b._one ? (got[0] || null) : got, error: null };
      } else {
        window.__WRITES.push({ table: table, op: b._op, row: b._row, eq: b._eq });
        if (b._op === 'upsert') {
          var i = rows.findIndex(function (r) { return r.id === b._row.id; });
          if (i < 0) rows.push(b._row); else rows[i] = Object.assign({}, rows[i], b._row);
          out = { data: [b._row], error: null };
        } else if (b._op === 'update') {
          var hit = rows.filter(match); hit.forEach(function (r) { Object.assign(r, b._row); });
          out = { data: hit.map(function (r) { return { id: r.id }; }), error: null };
        } else {
          var gone = rows.filter(match); window.__ROWS[table] = rows.filter(function (r) { return !match(r); });
          out = { data: gone.map(function (r) { return { id: r.id }; }), error: null };
        }
      }
      return Promise.resolve(out).then(res, rej);
    };
    return b;
  }
  return {
    from: builder,
    channel: function () { var c = { on: function(){return c;}, subscribe: function(){return c;} }; return c; },
    removeChannel: function () {},
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: window.__FAKE_SESSION }, error: null }); },
      getUser: function () { return Promise.resolve({ data: { user: window.__FAKE_SESSION && window.__FAKE_SESSION.user }, error: null }); },
      // The hub gates its tiles INSIDE this callback. A stub that never fires it leaves the
      // hub with no profile, which fails open, and every tile check then passes for nothing.
      onAuthStateChange: function (cb) { setTimeout(function () { cb(window.__FAKE_SESSION ? 'SIGNED_IN' : 'SIGNED_OUT', window.__FAKE_SESSION); }, 0);
        return { data: { subscription: { unsubscribe: function () {} } } }; },
      signOut: function () { return Promise.resolve({ error: null }); }
    }
  };
} };`;

const TABS = ['overview', 'board', 'timeline', 'list', 'requests', 'value', 'settings'];
const lv = (base, over) => Object.assign(Object.fromEntries(TABS.map((k) => [k, base])), over || {});
const TEAM = [
  { id: 'm1', name: 'Coco Lau', email: 'coco@mjm.test', access: lv('Admin') },
  // list Admin, Settings closed: the row a Normal login is meant to inherit
  { id: 'm4', name: 'Ruth Wong', email: 'ruth@mjm.test', access: lv('Normal', { list: 'Admin', settings: 'None' }) },
];
const ROWS = () => ({
  pms_settings: [{ id: 'config', projects: [{ id: 'p1', name: 'Nursery', code: 'N', start: '2026-03-22', duration: 365, modules: [] }],
    priorities: ['High', 'Medium', 'Low'], types: ['Web', 'Mobile'], team: JSON.parse(JSON.stringify(TEAM)) }],
  pms_tasks: [
    { id: 't001', project: 'Nursery', type: 'Web', name: 'Batch Report from the portal tables', priority: 'High', status: 'In Progress',
      assignees: ['Ruth Wong'], start_date: '2026-11-01', due_date: '2026-11-20', end_date: null, sort_order: 1 },
  ],
  pms_task_requests: [],
  // what a read of everybody's profile hands back: two staff and a customer
  shared_profiles: [
    { email: 'Coco@MJM.test', full_name: 'Coco Lau', user_type: 'system' },
    { email: 'ruth@mjm.test', full_name: 'Ruth Wong', user_type: 'system' },
    { email: 'buyer@farm.test', full_name: 'A Customer', user_type: 'customer' },
  ],
});

let fails = 0;
function is(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'pass  ' : 'FAIL  ') + msg + (ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want)));
}

async function open(browser, port, who, file) {
  const page = await browser.newPage();
  // Catch-all FIRST: routes match in reverse registration order.
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('http://localhost:' + port)) return r.continue();
    return r.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await page.addInitScript(({ who, rows }) => {
    const user = { id: 'u1', email: who.email, user_metadata: { full_name: who.name } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    window.__FAKE_PROFILE = { id: 'u1', email: who.email, full_name: who.name, user_type: 'system',
      permissions: { modules: Object.assign({ operation: 'normal' }, who.pms ? { pms: who.pms } : {}) } };
    window.__ROWS = rows;
    window.alert = () => {}; window.confirm = () => true;
  }, { who, rows: ROWS() });
  await page.goto('http://localhost:' + port + '/' + (file || 'pms/pms_dashboard.html'), { waitUntil: 'domcontentloaded' });
  return page;
}
// What the page looks like once it has drawn, or 'never drew' -- a missing
// element must fail the check underneath by name, not time out.
async function drawn(page) {
  try { await page.waitForFunction(() => !document.body.hasAttribute('data-boot') && document.querySelector('#who') && document.querySelector('#who').textContent, null, { timeout: 4000 }); }
  catch (e) { return null; }
  await page.waitForTimeout(250);
  return page.evaluate(() => ({
    who: document.querySelector('#who').textContent,
    tabs: [...document.querySelectorAll('nav.tabs button')].filter((b) => !b.hidden).map((b) => b.dataset.view),
  }));
}
const go = (page, view) => page.evaluate((v) => document.querySelector('nav.tabs button[data-view="' + v + '"]').click(), view);

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  console.log('\n1. A login the portal has not given the module to');
  {
    const page = await open(browser, port, { email: 'coco@mjm.test', name: 'Coco Lau' });
    await page.waitForURL(/index\.html/, { timeout: 5000 }).catch(() => {});
    is(/\/index\.html/.test(page.url()), true, 'is sent back to the portal');
    await page.close();
    // Named like the Team admin and linked like her, with no module: still nothing.
    const p2 = await open(browser, port, { email: 'coco@mjm.test', name: 'Coco Lau' });
    const seen = await p2.evaluate(() => (window.__READS || []).filter((t) => /^pms_/.test(t)));
    is(seen, [], 'and reads none of the module tables on the way');
    await p2.close();
  }

  console.log('\n2. A module Admin');
  {
    const page = await open(browser, port, { email: 'boss@mjm.test', name: 'The Boss', pms: 'admin' });
    const d = await drawn(page);
    is(d && d.who, 'The Boss', 'is named from the portal profile, with no name to pick');
    is(await page.locator('select#who').count(), 0, 'there is no "Signed in as" dropdown at all');
    is(d && d.tabs, TABS, 'has every tab, linked to no Team row at all');
    is(await page.title(), 'Project Monitoring System', 'the page is called Project Monitoring System');
    await go(page, 'list'); await page.waitForTimeout(200);
    is(await page.locator('#v-list').innerText().then((t) => t.includes('Batch Report from the portal tables')), true, 'the task list is read from pms_tasks');
    is(await page.locator('#addBtn').isVisible(), true, 'and may add a task');
    const reads = await page.evaluate(() => [...new Set(window.__READS)].sort());
    is(reads.filter((t) => t !== 'shared_profiles'), ['pms_settings', 'pms_task_requests', 'pms_tasks'], 'only the pms_ tables are read');

    // SHOT=/path.png draws the page as the office sees it: a check cannot read a layout.
    if (process.env.SHOT) { await go(page, 'overview'); await page.setViewportSize({ width: 1400, height: 900 }); await page.waitForTimeout(200); await page.screenshot({ path: process.env.SHOT }); }
    await go(page, 'settings'); await page.waitForTimeout(250);
    const opts = await page.evaluate(() => { const s = document.querySelector('#v-settings select[aria-label$="MJM AI login"]');
      return s ? [...s.options].map((o) => o.value) : 'no login picker'; });
    is(opts, ['', 'coco@mjm.test', 'ruth@mjm.test'], 'Team offers the staff logins, lower-cased, and never the customer');
    await page.close();
  }

  console.log('\n3. A Normal login LINKED to a Team row by e-mail');
  {
    const page = await open(browser, port, { email: 'Ruth@MJM.test', name: 'Ruth W. (profile spelling)', pms: 'normal' });
    const d = await drawn(page);
    is(d && d.who, 'Ruth Wong', 'is the Team row its e-mail is linked to, whatever case it was keyed in');
    is(d && d.tabs, TABS.filter((t) => t !== 'settings'), 'Settings is closed, as that row says');
    await go(page, 'list'); await page.waitForTimeout(200);
    is(await page.locator('#addBtn').isVisible(), true, 'and Tasks is Admin, as that row says');
    await page.close();
  }

  console.log('\n4. A Normal login nobody has linked');
  {
    const page = await open(browser, port, { email: 'new@mjm.test', name: 'New Starter', pms: 'normal' });
    const d = await drawn(page);
    is(d && d.who, 'New Starter', 'is named from the portal profile');
    is(d && d.tabs, TABS.filter((t) => t !== 'settings'), 'can look at everything but Settings');
    await go(page, 'list'); await page.waitForTimeout(200);
    is(await page.locator('#addBtn').isVisible(), false, 'and cannot add a task');
    await page.close();
  }

  console.log('\n5. A name is never a login');
  {
    // Coco Lau is Admin on every tab in Team. This login is CALLED Coco Lau and is somebody else.
    const page = await open(browser, port, { email: 'someone.else@mjm.test', name: 'Coco Lau', pms: 'normal' });
    const d = await drawn(page);
    is(d && d.tabs.includes('settings'), false, 'a login named like a Team admin does not get her Settings');
    await go(page, 'list'); await page.waitForTimeout(200);
    is(await page.locator('#addBtn').isVisible(), false, 'nor her right to add a task');
    await page.close();
  }

  console.log('\n6. Saving Settings writes the link, to the portal table');
  {
    const rows = ROWS(); rows.pms_settings[0].team[1].email = '';       // Ruth not linked yet
    const page = await browser.newPage();
    await page.route('**/*', (r) => r.request().url().startsWith('http://localhost:' + port) ? r.continue() : r.fulfill({ status: 200, body: '' }));
    await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
    await page.addInitScript(({ rows }) => {
      window.__FAKE_SESSION = { access_token: 'x', user: { id: 'u1', email: 'boss@mjm.test', user_metadata: {} } };
      window.__FAKE_PROFILE = { id: 'u1', email: 'boss@mjm.test', full_name: 'The Boss', user_type: 'system', permissions: { modules: { pms: 'admin' } } };
      window.__ROWS = rows; window.confirm = () => true;
    }, { rows });
    await page.goto('http://localhost:' + port + '/pms/pms_dashboard.html#settings', { waitUntil: 'domcontentloaded' });
    await drawn(page);
    const picked = await page.evaluate(() => {
      const s = document.querySelector('#v-settings select[aria-label="Ruth Wong MJM AI login"]');
      if (!s) return 'no picker for Ruth';
      s.value = 'ruth@mjm.test'; s.dispatchEvent(new Event('change', { bubbles: true })); return 'picked';
    });
    is(picked, 'picked', 'the login is picked against the person');
    await page.evaluate(() => { const b = [...document.querySelectorAll('#v-settings .savebar button')].find((x) => /save/i.test(x.textContent)); if (b) b.click(); });
    await page.waitForTimeout(400);
    const w = await page.evaluate(() => window.__WRITES.filter((x) => x.table === 'pms_settings').map((x) => ({ op: x.op, id: x.row.id, ruth: (x.row.team.find((m) => m.name === 'Ruth Wong') || {}).email })));
    is(w, [{ op: 'upsert', id: 'config', ruth: 'ruth@mjm.test' }], 'one save of pms_settings/config carrying the e-mail');
    await page.close();
  }

  console.log('\n7. The source');
  {
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '');
    const app = strip(fs.readFileSync(path.join(ROOT, 'pms/pms_app.js'), 'utf8'));
    const html = strip(fs.readFileSync(path.join(ROOT, 'pms/pms_dashboard.html'), 'utf8'));
    is(/createClient|SUPABASE_CONFIG|persistSession/.test(app), false, 'the app opens no database connection of its own');
    is(/localStorage\.(get|set)Item\(\s*["']pm\.me/.test(app) || /pm\.me/.test(app), false, 'and remembers no picked name');
    is(/sb\.from\(\s*table\s*\)/.test(app), false, 'no read or write goes to an unprefixed table');
    is(/SHARED_SUPA_URL/.test(html) && /MJMAccess\.load/.test(html) && /shared_staff_gate\.js/.test(html), true,
      'the page uses the portal project, MJMAccess and the staff gate');
    is(['Cache-Control', 'Pragma', 'Expires'].every((m) => html.includes('http-equiv="' + m + '"')), true, 'and carries the three no-cache metas');

    const hub = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const tile = (hub.match(/<a class="module-card"[^>]*data-module="pms"[^>]*>/) || [''])[0];
    is(/href="pms\/pms_dashboard\.html"/.test(tile), true, 'the hub has the tile');
    is(/data-module-open/.test(tile), false, 'hidden until granted: no data-module-open');
    const ua = fs.readFileSync(path.join(ROOT, 'user_access.html'), 'utf8');
    const mods = (ua.match(/const MODULES = \[([^\]]*)\]/) || ['', ''])[1];
    is(/'pms'/.test(mods) && /id="d-mod-pms"/.test(ua), true, 'and User Access can grant it');
  }

  console.log('\n8. The hub shows the tile only to a login holding the module');
  for (const [pms, want] of [[undefined, 'none'], ['normal', 'shown']]) {
    const page = await open(browser, port, { email: 'x@mjm.test', name: 'X', pms }, 'index.html');
    await page.waitForTimeout(900);
    // Tailwind is not loaded here, so size says nothing: read the display the gate writes.
    const got = await page.evaluate(() => { const c = document.querySelector('.module-card[data-module="pms"]');
      return !c ? 'no tile' : (c.style.display === 'none' ? 'none' : 'shown'); });
    is(got, want, 'pms ' + (pms || 'not set') + ' -> tile ' + want);
    await page.close();
  }

  await browser.close(); server.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
