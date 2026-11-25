/* INACTIVE WORKERS ARE IN ONE CARD UNDER THE BOARD, NEVER IN A COLUMN.
 * Rejected signups and people who left, together, only with Show inactive.
 * (Harness from the role-row test.)
 *
 * '+ Add role' sits in the corner over the role names, in Edit only, and
 * stores the list in nops_maint_config (key worker_roles). An added role is a
 * row, a choice on the record, and can be removed while nobody holds it.
 * Built on every_role_has_its_own_row.cjs.
 */
/* EVERY ROLE THE REGISTER OFFERS HAS A ROW ON THE BOARD.
 *
 * The Team Board drew four rows -- FC, Assistant FC, Water Pump Operator,
 * Workers -- and swept everybody else into Other. Driver and Gardener were
 * real roles on the register the whole time, so four people sat under a
 * heading that means "a role nobody recognises" over roles the list names.
 * And Other is the one row that cannot be added to, because adding there
 * would have to invent a role: so a Driver could not be added to the board
 * at all, which is the question the office actually asked.
 *
 * Estate Manager and Admin joined the list on the same day, above FC,
 * because the company has both and neither had anywhere to stand.
 *
 * OTHERS IS A COLUMN, not a row, and it is the only column that is not a
 * place. Two office staff were filed under a section called ADMIN, which is
 * in no nursery list, so the board headed their column "ADMIN -- not in the
 * nursery list" -- which reads as a fault rather than as an answer. Admin is
 * a JOB and is a row now; the column is simply for people who work for the
 * company rather than at a nursery.
 * shared/RUN_ME_worker_section_others.sql is what moves them.
 *
 * Drives the real scan/scan_workers.html in a real browser.
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/every_role_has_its_own_row.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

/* A stub that is STRICT about the columns the table has, for the same reason
 * the admin-close stub had to be: writing a column the table does not have
 * fails the WHOLE save, and a stub that takes anything signs off a write the
 * database refuses. A select naming a missing column comes back as an error
 * the way PostgREST sends it, which is exactly what the page's probes read. */
const FAKE_SUPABASE = `
window.__WRITES = [];
window.__READS  = [];
window.supabase = { createClient: function () {
  function missing(cols) {
    var have = window.__COLS;
    if (!have) return null;
    var want = String(cols || '*').split(',').map(function (c) { return c.trim(); });
    for (var i = 0; i < want.length; i++)
      if (want[i] !== '*' && have.indexOf(want[i]) < 0) return want[i];
    return null;
  }
  function builder(table) {
    var b = { _eq: {} };
    ['neq','is','or','not','gt','gte','lt','lte','ilike','order','limit','in','range']
      .forEach(function (m) { b[m] = function () { return b; }; });
    b.select = function (cols) { b._cols = cols; return b; };
    b.eq = function (c, v) { b._eq[c] = v; return b; };
    b.single = b.maybeSingle = function () { b._one = true; return b; };
    b._settle = function () {
      if (table === 'mjmnpayroll_workers') {
        window.__READS.push(b._cols || '*');
        var bad = missing(b._cols);
        if (bad) return { data: null, error: { message: 'column mjmnpayroll_workers.' + bad + ' does not exist', code: '42703' } };
      }
      var rows = table === 'shared_profiles' ? [window.__FAKE_PROFILE] : ((window.__ROWS || {})[table] || []);
      rows = rows.filter(function (r) { for (var k in b._eq) if (String(r[k]) !== String(b._eq[k])) return false; return true; });
      return { data: b._one ? (rows[0] || null) : rows, error: null };
    };
    b.then = function (r, j) { return Promise.resolve(b._settle()).then(r, j); };
    b.upsert = function (row) {
      window.__WRITES.push({ verb: 'upsert', table: table, row: row });
      var t = (window.__ROWS[table] = window.__ROWS[table] || []);
      var i = t.findIndex(function (x) { return x.key === row.key; });
      if (i >= 0) t[i] = row; else t.push(row);
      return Promise.resolve({ data: null, error: null });
    };
    b.insert = function (row) { window.__WRITES.push({ verb: 'insert', table: table, row: row }); return Promise.resolve({ data: null, error: null }); };
    b.delete = function () { window.__WRITES.push({ verb: 'delete', table: table }); return b; };
    b.update = function (row) {
      var w = { verb: 'update', table: table, row: row, eq: {} };
      window.__WRITES.push(w);
      var u = { _eq: w.eq };
      ['select','order','limit','is','neq','in'].forEach(function (m) { u[m] = function () { return u; }; });
      u.eq = function (c, v) { w.eq[c] = v; return u; };
      u.then = function (r, j) {
        // The page writes the row into its own copy of the register too, so
        // the reload has to see the write -- that is what lets the test ask
        // whether the board rebuilt from the table rather than from the screen.
        (window.__ROWS.mjmnpayroll_workers || []).forEach(function (x) {
          if (String(x.id) === String(w.eq.id)) for (var k in w.row) x[k] = w.row[k];
        });
        return Promise.resolve({ data: null, error: null }).then(r, j);
      };
      return u;
    };
    return b;
  }
  return {
    from: builder,
    rpc: function () { return Promise.resolve({ data: [], error: null }); },
    channel: function () { var c = { on: function(){return c;}, subscribe: function(){return c;} }; return c; },
    removeChannel: function () {},
    storage: { from: function () { return {
      upload: function () { return Promise.resolve({ data: {}, error: null }); },
      getPublicUrl: function () { return { data: { publicUrl: 'x' } }; } }; } },
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: window.__FAKE_SESSION }, error: null }); },
      getUser: function () { return Promise.resolve({ data: { user: window.__FAKE_SESSION.user }, error: null }); },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
      signOut: function () { return Promise.resolve({ error: null }); }
    }
  };
} };`;

async function open(browser, port, opts) {
  const o = opts || {};
  const page = await browser.newPage();
  // Catch-all FIRST: routes match in reverse registration order.
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('http://localhost:' + port)) return r.continue();
    return r.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  await page.route('**cdn.tailwindcss.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: 'document.addEventListener("DOMContentLoaded",function(){document.head.insertAdjacentHTML("beforeend","<style>.hidden{display:none}</style>")});' }));
  await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await page.addInitScript(({ cfgOn, manage, cols, workers }) => {
    const user = { id: 'u1', email: 'office@mjmnursery.com', user_metadata: { full_name: 'Office' } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    const perms = { modules: { npayroll: 'normal', operation: 'admin' } };
    // A plain user keeps the page and loses the one action that moves people.
    if (!manage) perms.npayroll_actions = { workers: { view: true, manage: false } };
    window.__FAKE_PROFILE = { id: 'u1', email: user.email, user_type: 'system', permissions: perms };
    window.__COLS = cols;
    if (cfgOn) window.__CFG = [{ key: 'worker_roles', txt_value: JSON.stringify(['Security']) }];
    window.__ROWS = {
      mjmnpayroll_workers: JSON.parse(JSON.stringify(workers)),
      operation_nurseries: [{ name: 'PN' }, { name: 'BNN' }, { name: 'Ulu Niah 1' }, { name: 'Ulu Niah 2' }],
      nelos_modules: [],
      nops_maint_config: window.__CFG || [],
    };
    window.__CONFIRMS = [];
    window.__ALERTS = [];
    window.alert = (m) => { window.__ALERTS.push(String(m)); };
    window.prompt = () => { throw new Error('nothing here may raise a prompt'); };
  }, { cfgOn: !!o.cfg, manage: o.manage !== false, cols: o.cols || BASE_COLS.concat(REJ_COLS), workers: o.workers || WORKERS });
  await page.goto('http://localhost:' + port + '/scan/scan_workers.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#worker-board .bd', { timeout: 8000 });
  return page;
}


/* One of every role the list offers, plus the two shapes that belong in
 * Other and nowhere else: a role typed before the list existed, and none at
 * all. The two in OTHERS are the office staff the SQL moves. */
const WORKERS = [
  { id: 1, full_name: 'Estate Man',     section: 'UNE',    role: 'Estate Manager',            active: true },
  { id: 2, full_name: 'Office Admin',   section: 'OTHERS', role: 'Admin',                     active: true },
  { id: 3, full_name: 'ROUSELL WAYNE',  section: 'OTHERS', role: 'Field Conductor',           active: true },
  { id: 4, full_name: 'Conductor One',  section: 'BNN',    role: 'Field Conductor',           active: true },
  { id: 5, full_name: 'Assistant One',  section: 'UNN1',   role: 'Assistant Field Conductor', active: true },
  { id: 6, full_name: 'Pump One',       section: 'UNN1',   role: 'Water Pump Operator',       active: true },
  { id: 7, full_name: 'Ahmad Bin Ali',  section: 'UNN1',   role: 'General Worker',            active: true },
  { id: 8, full_name: 'Sahrun',         section: 'UNN1',   role: 'Gardener',                  active: true },
  { id: 9, full_name: 'Arif',           section: 'UNE',    role: 'Driver',                    active: true },
  { id: 10, full_name: 'Kerani Lama',   section: 'UNN2',   role: 'Kerani',                    active: true },
];
const BASE_COLS = ['id','full_name','section','role','nursery','job_title','active','remark',
                   'pin','photo_url','maint_general','registered_on','last_day',
                   'created_at','created_by','updated_at','updated_by',
                   'rejected_at','rejected_by'];
const REJ_COLS  = [];

let fails = 0;
function is(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'pass  ' : 'FAIL  ') + msg
    + (ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want)));
}
const yes = (c, msg) => is(!!c, true, msg);

/* The row headings down the left, in the order they are drawn. */
const rowNames = (page) => page.$$eval('#worker-board .bd-role-name', (e) => e.map((x) => x.textContent.trim()));
/* Who is in one row, across every column. */
const inRow = (page, label) => page.evaluate((l) => {
  const th = [...document.querySelectorAll('#worker-board .bd-role-name')].find((x) => x.textContent.trim() === l);
  if (!th) return null;
  return [...th.closest('tr').querySelectorAll('.wchip > span:last-child')].map((x) => x.textContent.trim());
}, label);
/* The column headings, which are the sections. */
const colNames = (page) => page.$$eval('#worker-board .bd-div', (e) => e.map((x) => x.textContent.trim()));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const W = [
    { id: 1, full_name: 'Ahmad Bin Ali', section: 'UNN1', role: 'General Worker', active: true },
    { id: 2, full_name: 'Left Worker A', section: 'UNN1', role: 'General Worker', active: false },
    { id: 3, full_name: 'Left Worker B', section: 'UNN1', role: 'General Worker', active: false },
    { id: 4, full_name: 'Turned Down',   section: '',     role: null, active: false, rejected_at: '2026-11-01', rejected_by: 'x' },
    { id: 5, full_name: 'New Signup',    section: '',     role: null, active: true },
  ];
  try {
    const page = await open(browser, port, { workers: W });
    yes(!(await page.$('.off-wrap')), 'nothing inactive on screen before Show inactive');
    await page.click('#w-show-inactive'); await page.waitForTimeout(150);
    is(await inRow(page, 'Workers'), ['Ahmad Bin Ali'], 'the UNN1 Workers column keeps only the active worker');
    const off = await page.$$eval('.off-wrap .wchip > span:nth-child(2)', (e) => e.map((x) => x.textContent.trim()));
    is(off.sort(), ['Left Worker A', 'Left Worker B', 'Turned Down'], 'every inactive person is in the Inactive card');
    is(await page.$$eval('.off-wrap .off-grp .wchip', (e) => e.length), 2, 'two under Left / inactive');
    is(await page.$$eval('.off-wrap .pend-rej .wchip', (e) => e.length), 1, 'one under Registration rejected');
    yes(/UNN1/.test(await page.$eval('.off-wrap .off-grp .off-where', (e) => e.textContent)), 'and each says where it was filed');
    yes(await page.evaluate(() => {
      const t = document.querySelector('.bd-wrap'), o = document.querySelector('.off-wrap');
      return !!(t.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), 'the card is UNDER the board');
    const pend = await page.$$eval('.pend-wrap .wchip > span:last-child', (e) => e.map((x) => x.textContent.trim()));
    is(pend, ['New Signup'], 'the queue on top holds only the active signup');
    if (process.env.SHOT) { await page.setViewportSize({ width: 1300, height: 1100 }); await page.screenshot({ path: process.env.SHOT, fullPage: true }); }
    await page.close();
  } finally { await browser.close(); server.close(); }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
