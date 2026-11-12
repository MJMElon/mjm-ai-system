/* PROJECT MONITORING SYSTEM signs nobody in. It reads the portal's login.
 *
 * The tracker it was built from had a "Signed in as" dropdown: anybody
 * picked any name, and until somebody was made Admin everybody was one.
 * As a module of the MJM AI system it has the portal's own login instead
 * (shared_profiles), and this drives the real pms/pms_dashboard.html with a
 * stubbed database to hold it to that:
 *
 *   - a login with no `pms` level is sent back to the portal and draws nothing
 *   - THERE IS NO TEAM LIST. The people are the staff accounts holding the
 *     module on User Access, and they are who a task is assigned to
 *   - what a person holds there is their level on EVERY tab: Admin is
 *     Admin, Normal is view only
 *   - Settings -> User access opens or closes one tab for one person, by
 *     E-MAIL, whatever case it was keyed in, and saves only the difference
 *   - A NAME IS NEVER A LOGIN. A profile's full name is the one thing its
 *     owner can edit, so somebody named like another is still themselves
 *   - a module Admin can have a tab closed, and never Settings
 *   - the data is the portal's own tables, pms_*, and nothing else
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
    // A function nobody installed answers the way PostgREST does: an error, never a throw.
    rpc: function (name) { window.__READS.push('rpc:' + name); var f = (window.__RPC || {})[name];
      return Promise.resolve(f ? { data: f, error: null } : { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }); },
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
// What Settings keeps: only the tabs that differ from a person's module level, by e-mail.
const TEAM = [
  // Tasks opened to Admin for her, and Settings opened to view: a Normal login does not see Settings by itself
  { email: 'ruth@mjm.test', access: { list: 'Admin', settings: 'Normal' } },
  { email: 'closed@mjm.test', access: { board: 'None', settings: 'None' } },
  // a row from when this was a list of names: no login, so it ties to nobody
  { id: 'm9', name: 'Old Name', email: '', access: lv('Admin') },
];
const ROWS = () => ({
  pms_settings: [{ id: 'config', projects: [{ id: 'p1', name: 'Nursery', code: 'N', start: '2026-03-22', duration: 365, modules: [] }],
    priorities: ['High', 'Medium', 'Low'], types: ['Web', 'Mobile'], team: JSON.parse(JSON.stringify(TEAM)) }],
  pms_tasks: [
    { id: 't001', project: 'Nursery', type: 'Web', name: 'Batch Report from the portal tables', priority: 'High', status: 'In Progress',
      assignees: ['Ruth Wong'], start_date: '2026-11-01', due_date: '2026-11-20', end_date: null, sort_order: 1 },
  ],
  pms_task_requests: [],
  // what a read of everybody's profile hands back: two holding the module, one member of
  // staff who does not, and a customer whose row says she does
  shared_profiles: [
    { email: 'Coco@MJM.test', full_name: 'Coco Lau', user_type: 'system', permissions: { modules: { pms: 'admin' } } },
    { email: 'ruth@mjm.test', full_name: 'Ruth Wong', user_type: 'system', permissions: { modules: { pms: 'normal' } } },
    { email: 'ken@mjm.test', full_name: 'Ken Tan', user_type: 'system', permissions: { modules: { operation: 'admin', pms: 'none' } } },
    { email: 'buyer@farm.test', full_name: 'A Customer', user_type: 'customer', permissions: { modules: { pms: 'admin' } } },
  ],
});

let fails = 0;
function is(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'pass  ' : 'FAIL  ') + msg + (ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want)));
}

async function open(browser, port, who, file, rows, rpc) {
  const page = await browser.newPage();
  // Catch-all FIRST: routes match in reverse registration order.
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('http://localhost:' + port)) return r.continue();
    return r.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await page.addInitScript(({ who, rows, rpc }) => {
    const user = { id: 'u1', email: who.email, user_metadata: { full_name: who.name } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    window.__FAKE_PROFILE = { id: 'u1', email: who.email, full_name: who.name, user_type: 'system',
      permissions: { modules: Object.assign({ operation: 'normal' }, who.pms ? { pms: who.pms } : {}) } };
    window.__ROWS = rows; window.__RPC = rpc || null;
    window.alert = () => {}; window.confirm = () => true;
  }, { who, rows: rows || ROWS(), rpc });
  await page.goto('http://localhost:' + port + '/' + (file || 'pms/pms_dashboard.html'), { waitUntil: 'domcontentloaded' });
  return page;
}
// What the page looks like once it has drawn, or 'never drew' -- a missing
// element must fail the check underneath by name, not time out.
async function drawn(page) {
  try { await page.waitForFunction(() => !document.body.hasAttribute('data-boot') && document.querySelector('#who') && document.querySelector('#who').textContent, null, { timeout: 4000 }); }
  catch (e) { return null; }
  await page.waitForTimeout(250);
  // In the order the access rules name them, not the order the bar draws them: the request button sits above the list.
  const d = await page.evaluate(() => ({
    who: document.querySelector('#who').textContent,
    tabs: [...document.querySelectorAll('nav.tabs button[data-view]')].filter((b) => !b.hidden).map((b) => b.dataset.view),
  }));
  d.tabs = TABS.filter((t) => d.tabs.includes(t));
  return d;
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

  const paNames = (page) => page.evaluate(() => [...document.querySelectorAll('#v-settings .pa-row .pa-name')].map((n) => n.firstChild.textContent));
  const picks = (page) => page.evaluate(() => [...document.querySelectorAll('#fPerson option')].map((o) => o.value).filter(Boolean));
  const openPerson = (page, name) => page.evaluate((name) => { const r = [...document.querySelectorAll('#v-settings .pa-row')].find((x) => x.querySelector('.pa-name').firstChild.textContent === name);
    if (!r) return 'no row for ' + name; r.click(); return 'open'; }, name);
  const setTab = (page, label, v) => page.evaluate(({ label, v }) => { const s = document.querySelector('.access-sheet select[aria-label="' + label + ' access"]');
    if (!s) return 'no ' + label + ' select'; if (s.disabled) return 'disabled'; s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); return 'set'; }, { label, v });
  const press = (page, sel, re) => page.evaluate(({ sel, re }) => { const b = [...document.querySelectorAll(sel)].find((x) => new RegExp(re, 'i').test(x.textContent)); if (!b) return 'no button'; b.click(); return 'pressed'; }, { sel, re });
  const teamWrites = (page) => page.evaluate(() => window.__WRITES.filter((x) => x.table === 'pms_settings').map((x) => ({ op: x.op, id: x.row.id, team: x.row.team })));

  console.log('\n2. A module Admin, and who the people are');
  {
    const page = await open(browser, port, { email: 'boss@mjm.test', name: 'The Boss', pms: 'admin' });
    const d = await drawn(page);
    is(d && d.who, 'The Boss', 'is named from the portal profile, with no name to pick');
    is(await page.locator('select#who').count(), 0, 'there is no "Signed in as" dropdown at all');
    is(d && d.tabs, TABS, 'has every tab');
    is(await page.title(), 'Project Monitoring System', 'the page is called Project Monitoring System');
    await go(page, 'list'); await page.waitForTimeout(200);
    is(await page.locator('#v-list').innerText().then((t) => t.includes('Batch Report from the portal tables')), true, 'the task list is read from pms_tasks');
    is(await page.locator('#addBtn').isVisible(), true, 'and may add a task');
    const reads = await page.evaluate(() => [...new Set(window.__READS)].sort());
    is(reads.filter((t) => t !== 'shared_profiles' && !/^rpc:/.test(t)), ['pms_settings', 'pms_task_requests', 'pms_tasks'], 'only the pms_ tables are read');
    is(await picks(page), ['Coco Lau', 'Ruth Wong', 'The Boss'], 'the assignees are whoever holds the module: not the staff without it, never the customer');

    // SHOT=/path.png draws the page as the office sees it: a check cannot read a layout.
    await go(page, 'settings'); await page.waitForTimeout(250);
    if (process.env.SHOT) { await page.setViewportSize({ width: 1400, height: 1100 }); await page.waitForTimeout(200); await page.screenshot({ path: process.env.SHOT, fullPage: true }); }
    const set = await page.evaluate(() => ({
      panels: [...document.querySelectorAll('#v-settings .panel > h2')].map((h) => h.textContent).filter((t) => /team|user access/i.test(t)),
      logins: document.querySelectorAll('#v-settings select[aria-label$="MJM AI login"], #v-settings input[type="email"]').length }));
    is(set, { panels: ['User access'], logins: 0 }, 'Settings has User access and no Team panel, and no login to pick');
    is(await paNames(page), ['Coco Lau', 'Ruth Wong', 'The Boss'], 'User access lists the same people');
    const tags = await page.evaluate(() => [...document.querySelectorAll('#v-settings .pa-row .pa-def')].map((n) => n.textContent));
    is(tags, ['Admin on User Access', 'Normal on User Access · changed here', 'Admin on User Access'], 'each with what they hold on User Access, and whether a tab was changed here');
    await page.close();
  }

  console.log('\n2b. The people come from pms_people() where it is installed');
  {
    // A login that may read nobody else's profile: the table hands back nothing useful, the function answers.
    const rows = ROWS(); rows.shared_profiles = [];
    const page = await open(browser, port, { email: 'ruth@mjm.test', name: 'Ruth Wong', pms: 'normal' }, null, rows,
      { pms_people: [{ email: 'Coco@MJM.test', full_name: 'Coco Lau', level: 'admin' }, { email: 'ruth@mjm.test', full_name: 'Ruth Wong', level: 'normal' }] });
    await drawn(page);
    is(await picks(page), ['Coco Lau', 'Ruth Wong'], 'the list is the function answer, this login not listed twice');
    await page.close();
  }

  console.log('\n3. A Normal login with tabs changed for it, found by e-mail');
  {
    const page = await open(browser, port, { email: 'Ruth@MJM.test', name: 'Ruth Wong', pms: 'normal' });
    const d = await drawn(page);
    is(d && d.tabs, TABS, 'Settings is opened for her, whatever case her e-mail was keyed in');
    await go(page, 'list'); await page.waitForTimeout(200);
    is(await page.locator('#addBtn').isVisible(), true, 'and Tasks is opened to Admin for her');
    await page.close();
  }

  console.log('\n4. A Normal login nobody has changed anything for');
  {
    const page = await open(browser, port, { email: 'new@mjm.test', name: 'New Starter', pms: 'normal' });
    const d = await drawn(page);
    is(d && d.who, 'New Starter', 'is named from the portal profile');
    is(d && d.tabs, TABS.filter((t) => t !== 'settings'), 'views every tab but Settings, which is hidden from a Normal login');
    await go(page, 'list'); await page.waitForTimeout(200);
    is(await page.locator('#addBtn').isVisible(), false, 'and cannot add a task');
    const typed = await page.evaluate(() => { location.hash = '#settings'; return true; });
    await page.reload({ waitUntil: 'domcontentloaded' }); await drawn(page);
    is(await page.evaluate(() => document.querySelector('#v-settings').hidden), true, 'typing the Settings address does not open it either');
    await page.close();
  }

  console.log('\n5. A name is never a login');
  {
    // Ruth Wong has Tasks opened to Admin. This login is CALLED Ruth Wong and is somebody else.
    const page = await open(browser, port, { email: 'someone.else@mjm.test', name: 'Ruth Wong', pms: 'normal' });
    const d = await drawn(page);
    is(d && d.tabs.includes('settings'), false, 'a login named like her does not get the Settings opened for her');
    await go(page, 'list'); await page.waitForTimeout(200);
    is(await page.locator('#addBtn').isVisible(), false, 'nor her right to add a task');
    await page.close();
  }

  console.log('\n5b. A module Admin can have a tab closed, and never Settings');
  {
    const page = await open(browser, port, { email: 'closed@mjm.test', name: 'Closed Admin', pms: 'admin' });
    const d = await drawn(page);
    is(d && d.tabs, TABS.filter((t) => t !== 'board'), 'Board is closed as saved; Settings stays open though the saved row closes it');
    await go(page, 'settings'); await page.waitForTimeout(250);
    is(await openPerson(page, 'Closed Admin'), 'open', 'their own row opens');
    is(await setTab(page, 'Settings', 'None'), 'disabled', 'and Settings cannot be closed on a module Admin');
    await page.close();
  }

  console.log('\n6. Saving Settings keeps only the difference, in the portal table');
  {
    const page = await open(browser, port, { email: 'boss@mjm.test', name: 'The Boss', pms: 'admin' }, 'pms/pms_dashboard.html#settings');
    await drawn(page);
    is(await openPerson(page, 'Ruth Wong'), 'open', 'a person is opened from User access');
    is(await setTab(page, 'Value analysis', 'None'), 'set', 'and one tab is closed for her');
    await press(page, '.access-sheet footer button', '^save'); await page.waitForTimeout(400);
    is(await teamWrites(page), [{ op: 'upsert', id: 'config', team: [
      { email: 'closed@mjm.test', access: { board: 'None', settings: 'None' } },
      { email: 'ruth@mjm.test', access: { list: 'Admin', value: 'None', settings: 'Normal' } }] }],
      'one save of pms_settings/config: her three changed tabs, somebody not on the list left as saved, the nameless row gone');

    await page.evaluate(() => { window.__WRITES.length = 0; });
    is(await openPerson(page, 'Ruth Wong'), 'open', 'opened again');
    is(await press(page, '.access-sheet .acts button', 'follow user access'), 'pressed', 'Follow User Access');
    await press(page, '.access-sheet footer button', '^save'); await page.waitForTimeout(400);
    is(await teamWrites(page), [{ op: 'upsert', id: 'config', team: [{ email: 'closed@mjm.test', access: { board: 'None', settings: 'None' } }] }],
      'puts her back on her module level, and nothing is kept for her at all');
    await page.close();
  }

  console.log('\n6b. The side bar');
  {
    const page = await open(browser, port, { email: 'boss@mjm.test', name: 'The Boss', pms: 'admin' });
    await page.setViewportSize({ width: 1400, height: 520 });
    await drawn(page);
    const sb = await page.evaluate(() => {
      const nav = document.querySelector('nav.tabs.side'); if (!nav) return 'no side bar';
      const txt = (b) => b.firstChild.textContent.trim();
      const groups = [...nav.querySelectorAll('.side-mid .side-group')].map((g) => [g.querySelector('.side-title').textContent, [...g.querySelectorAll('button')].map(txt)]);
      const foot = nav.querySelector('.side-foot'), mid = nav.querySelector('.side-mid'), top = nav.querySelector('.side-top');
      const r = (e) => e.getBoundingClientRect();
      const gs = [...mid.querySelectorAll('.side-group')], bs = [...gs[0].querySelectorAll('button')];
      const sel = nav.querySelector('button[aria-selected="true"]'), other = nav.querySelector('button[aria-selected="false"]');
      return { groups, foot: [...foot.querySelectorAll('button')].map(txt), portal: !!top.querySelector('a.back') && !foot.querySelector('a.back'),
        column: r(nav).width < 300 && r(nav).height >= window.innerHeight - 1,
        groupGap: Math.round(r(gs[1]).top - r(gs[0]).bottom), rowGap: Math.round(r(bs[1]).top - r(bs[0]).bottom),
        selBg: getComputedStyle(sel).backgroundColor !== getComputedStyle(other).backgroundColor,
        midScrolls: getComputedStyle(mid).overflowY, footAtBottom: Math.round(r(foot).bottom) === window.innerHeight, topAtTop: Math.round(r(top).top) === 0 };
    });
    is(sb.groups, [['Overview', ['Dashboard', 'Board', 'Timeline']], ['Task', ['Task list', 'Value analysis']]], 'two groups, each under its own title; Task requests is the button above them');
    is([sb.foot, sb.portal], [['Settings'], true], 'Settings is at the foot, and the way back to the portal is in the top part, which never scrolls');
    is([sb.column, sb.topAtTop, sb.footAtBottom, sb.midScrolls], [true, true, true, 'auto'], 'a column the height of the window: top and foot stay put, the middle scrolls');
    is(sb.groupGap >= sb.rowGap * 4 && sb.groupGap >= 16, true, 'the gap between groups is far wider than the gap between entries (' + sb.groupGap + ' against ' + sb.rowGap + ')');
    is(sb.selBg, true, 'the open entry wears a block the others do not');
    await go(page, 'value'); await page.waitForTimeout(150);
    is(await page.evaluate(() => [document.querySelector('nav.tabs button[aria-selected="true"]').dataset.view, document.querySelector('#v-value').hidden]), ['value', false], 'pressing an entry opens its view');
    // + Request a task IS the Task requests entry, and the form is ON that page: no panel slides in from the side.
    await go(page, 'board'); await page.waitForTimeout(150);
    const cta = await page.evaluate(() => { const b = document.querySelector('.side-top #reqBtn'); if (!b) return 'no request button';
      b.click();
      return { text: b.firstChild.nextSibling.textContent.trim(), shown: !b.hidden, view: b.dataset.view, open: b.getAttribute('aria-selected'),
        page: !document.querySelector('#v-requests').hidden, formOnPage: !!document.querySelector('#v-requests .reqform #r-name'),
        sidePanel: !!document.querySelector('#sheetRoot .sheet'), listUnder: !!document.querySelector('#v-requests .reqform-wrap + .reqlist .seg'),
        badgeInside: !!b.querySelector('#reqCount'), entries: document.querySelectorAll('nav.tabs button[data-view="requests"]').length }; });
    is(cta, { text: 'Request a task', shown: true, view: 'requests', open: 'true', page: true, formOnPage: true, sidePanel: false, listUnder: true, badgeInside: true, entries: 1 },
      'it opens the Task requests page with the form on the page and the list under it, and no side panel');
    // What is half typed survives the page being redrawn under it, and a request sent is written and the form cleared.
    const sent = await page.evaluate(async () => {
      const q = (s) => document.querySelector('#v-requests .reqform ' + s); if (!q('#r-name')) return 'no form';
      const set = (e, val, ev) => { e.value = val; e.dispatchEvent(new Event(ev, { bubbles: true })); };
      set(q('#r-name'), 'Stock card for the store', 'input');
      document.querySelector('nav.tabs button[data-view="board"]').click(); document.querySelector('#reqBtn').click();
      const kept = q('#r-name') && q('#r-name').value;
      set(q('#f-project'), 'Nursery', 'change');
      [...document.querySelectorAll('#v-requests .reqform-foot button')].find((b) => /send/i.test(b.textContent)).click();
      await new Promise((r) => setTimeout(r, 300));
      const w = window.__WRITES.filter((x) => x.table === 'pms_task_requests').map((x) => [x.row.data.name, x.row.data.project, x.row.data.status, x.row.data.requestedBy]);
      return { kept, w, cleared: document.querySelector('#v-requests .reqform #r-name').value };
    });
    is(sent, { kept: 'Stock card for the store', w: [['Stock card for the store', 'Nursery', 'Pending', 'The Boss']], cleared: '' },
      'a half-typed request survives leaving the page and coming back, and Send writes one request and clears the form');
    if (process.env.SHOT) { await page.setViewportSize({ width: 1400, height: 900 }); await go(page, 'overview'); await page.waitForTimeout(200); await page.screenshot({ path: process.env.SHOT.replace('.png', '_side.png') }); }
    await page.close();
    // A login with every entry of a group closed sees no title over nothing.
    const rows = ROWS(); rows.pms_settings[0].team.push({ email: 'few@mjm.test', access: { list: 'None', requests: 'None', value: 'None' } });
    const p2 = await open(browser, port, { email: 'few@mjm.test', name: 'Few Tabs', pms: 'normal' }, null, rows);
    await drawn(p2);
    is(await p2.evaluate(() => { const b = document.querySelector('#reqBtn'); return b ? b.hidden : 'no button'; }), true, 'a login with Task requests closed is offered no request button');
    is(await p2.evaluate(() => [...document.querySelectorAll('nav.tabs .side-group')].filter((g) => !g.hidden).map((g) => g.querySelector('.side-title').textContent)), ['Overview'], 'a group with nothing left in it is not drawn');
    await p2.close();
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

  console.log('\n7b. Nothing is preset in code');
  {
    // A database nobody has keyed anything into: no settings row, no task.
    const page = await browser.newPage();
    await page.route('**/*', (r) => r.request().url().startsWith('http://localhost:' + port) ? r.continue() : r.fulfill({ status: 200, body: '' }));
    await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
    await page.addInitScript(() => {
      window.__FAKE_SESSION = { access_token: 'x', user: { id: 'u1', email: 'boss@mjm.test', user_metadata: {} } };
      window.__FAKE_PROFILE = { id: 'u1', email: 'boss@mjm.test', full_name: 'The Boss', user_type: 'system', permissions: { modules: { pms: 'admin' } } };
      window.__ROWS = { pms_settings: [], pms_tasks: [], pms_task_requests: [], shared_profiles: [] };
    });
    await page.goto('http://localhost:' + port + '/pms/pms_dashboard.html#settings', { waitUntil: 'domcontentloaded' });
    const d = await drawn(page);
    is(!!d, true, 'an empty database still draws');
    const got = await page.evaluate(() => ({
      projects: [...document.querySelectorAll('#fProject option')].map((o) => o.value).filter(Boolean),
      people: [...document.querySelectorAll('#fPerson option')].map((o) => o.value).filter(Boolean),
      seed: typeof window.SEED_SETTINGS + '/' + typeof window.SEED_TASKS,
    }));
    is(got, { projects: [], people: ['The Boss'], seed: 'undefined/undefined' }, 'with no project, nobody but this login, and no seed of either');
    await page.close();

    is(fs.existsSync(path.join(ROOT, 'pms/pms_data.js')), false, 'there is no data file beside the app');
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const app = strip(fs.readFileSync(path.join(ROOT, 'pms/pms_app.js'), 'utf8'));
    is(/SEED_|Coco Lau|Ruth Wong|"Nursery"|'Nursery'/.test(app), false, 'the app names no person and no project');
    is(/myRow|loginPick|teamPanel|"Team"\)/.test(app), false, 'and has no team list to keep');
    const sql = fs.readFileSync(path.join(ROOT, 'shared/RUN_ME_project_monitoring.sql'), 'utf8');
    is(/INSERT\s+INTO\s+public\.pms_/i.test(sql), false, 'and the SQL writes no row into any of the three tables');
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
