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
  await page.addInitScript(({ manage, cols, workers }) => {
    const user = { id: 'u1', email: 'office@mjmnursery.com', user_metadata: { full_name: 'Office' } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    const perms = { modules: { npayroll: 'normal', operation: 'admin' } };
    // A plain user keeps the page and loses the one action that moves people.
    if (!manage) perms.npayroll_actions = { workers: { view: true, manage: false } };
    window.__FAKE_PROFILE = { id: 'u1', email: user.email, user_type: 'system', permissions: perms };
    window.__COLS = cols;
    window.__ROWS = {
      mjmnpayroll_workers: JSON.parse(JSON.stringify(workers)),
      operation_nurseries: [{ name: 'PN' }, { name: 'BNN' }, { name: 'Ulu Niah 1' }, { name: 'Ulu Niah 2' }],
      nelos_modules: [],
    };
    window.__CONFIRMS = [];
    window.__ALERTS = [];
    window.alert = (m) => { window.__ALERTS.push(String(m)); };
    window.prompt = () => { throw new Error('nothing here may raise a prompt'); };
  }, { manage: o.manage !== false, cols: o.cols || BASE_COLS.concat(REJ_COLS), workers: o.workers || WORKERS });
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
  try {
    const page = await open(browser, port, {});

    console.log('\n-- 1. a row for every role, in the order the yard says them --');
    is(await rowNames(page),
      ['Estate Manager', 'Admin', 'FC', 'Assistant FC', 'Water Pump Operator',
       'Workers', 'Gardener', 'Driver', 'Other'],
      'the two that answer for the company, then the nursery roles, then the two trades, then Other');

    console.log('\n-- 2. a recognised role is never in Other --');
    is(await inRow(page, 'Driver'), ['Arif'], 'the driver has a row of his own');
    is(await inRow(page, 'Gardener'), ['Sahrun'], 'and so does the gardener');
    is(await inRow(page, 'Admin'), ['Office Admin'], 'admin is a job, and it is a row');
    is(await inRow(page, 'Estate Manager'), ['Estate Man'], 'so is estate manager');
    /* THE ONE THING OTHER IS FOR. A role typed before the list existed --
       everything else now has somewhere to stand, so a name appearing here
       is the thing to go and look at. */
    is(await inRow(page, 'Other'), ['Kerani Lama'],
      'only a role the list does not know is left in Other');

    console.log('\n-- 3. Others is a COLUMN, and not an unknown one --');
    const cols = await colNames(page);
    yes(cols.includes('Others'), 'the board heads that column Others');
    yes(!cols.some((c) => /not in the nursery list/i.test(c)),
      'and no column reads as a section nobody recognises');
    is(await inRow(page, 'FC'), ['Conductor One', 'ROUSELL WAYNE'],
      'the office staff still stand in their own row, in the Others column');

    console.log('\n-- 4. every row but Other can be added to --');
    /* Adding from Other would have to invent a role, so that one row takes
       drops and does not offer to add -- which is exactly why Driver and
       Gardener needed rows rather than a wider Other. */
    const addable = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll('#worker-board tbody tr').forEach((tr) => {
        const n = tr.querySelector('.bd-role-name');
        if (n) out[n.textContent.trim()] = tr.querySelectorAll('.wchip-add').length > 0;
      });
      return out;
    });
    is(addable['Driver'], true, 'a driver can be added straight to the board');
    is(addable['Gardener'], true, 'and a gardener');
    is(addable['Admin'], true, 'and an admin');
    is(addable['Other'], false, 'Other still offers no Add, because it would have to invent a role');

    console.log('\n-- 5. the form offers the same list --');
    const roles = await page.evaluate(() => {
      if (typeof ROLES === 'undefined') return null;
      return ROLES.slice();
    });
    is(roles,
      ['Estate Manager', 'Admin', 'Field Conductor', 'Assistant Field Conductor',
       'Water Pump Operator', 'General Worker', 'Gardener', 'Driver'],
      'the role dropdown reads in the order the board draws its rows');
    /* A role on the board that the form cannot offer is a row nobody can
       ever put anybody in. */
    const boardKeys = await page.evaluate(() => BOARD_ROLES.map((b) => b.key));
    is(boardKeys.filter((k) => !roles.includes(k)), [],
      'and every board row is a role the form can set');

    /* NEITHER NEW ROLE IS GENERAL NURSERY WORK, so neither lands on the Work
       Maintenance tick sheets by accident -- isKnownRole answers yes for
       them now, which is what keeps them off. */
    const onSheet = await page.evaluate(() =>
      ['Estate Manager', 'Admin'].map((r) =>
        onMaintSheet({ section: 'UNN1', role: r, active: true })));
    is(onSheet, [false, false],
      'and neither new role walks onto the maintenance tick sheets');

    await page.close();

    console.log('\n-- 6. an empty row and an empty orphan column are not drawn --');
    {
      /* EVERY ROLE THE LIST OFFERS NOW HAS A ROW, so Other holds one thing:
         a role typed before the list existed. On a register nobody has keyed
         free text into, it is a row of empty cells carrying a 0 under a
         heading that means "a role nobody recognises" — a question about
         nothing. And an ORPHAN column is its people: nobody can be added to
         one, so an empty one is a heading reading "not in the nursery list"
         over nothing at all. */
      const p2 = await open(browser, port, { workers: [
        { id: 1, full_name: 'Conductor One', section: 'BNN',   role: 'Field Conductor', active: true },
        { id: 2, full_name: 'Ahmad Bin Ali', section: 'UNN1',  role: 'General Worker',  active: true },
        { id: 3, full_name: 'Office Admin',  section: 'OTHERS', role: 'Admin',          active: true },
        /* The live shape of an empty orphan: the section is not on any
           nursery list and the one person left in it is inactive, so the
           column has nobody to show. */
        { id: 4, full_name: 'Moved Away',    section: 'ADMIN', role: 'Field Conductor', active: false },
      ] });
      is(await rowNames(p2),
        ['Estate Manager', 'Admin', 'FC', 'Assistant FC', 'Water Pump Operator',
         'Workers', 'Gardener', 'Driver'],
        'no Other row where no role is unrecognised');
      const c2 = await colNames(p2);
      yes(!c2.some((c) => /not in the nursery list/i.test(c)),
        'and no column for a section with nobody in it');
      yes(c2.includes('Others') && c2.includes('Estate'),
        'while the company own sections keep their columns, empty or not');

      /* Show inactive brings the person back, so the column comes with them
         — the one standing there is still somebody to be moved. */
      await p2.click('#w-show-inactive');
      await p2.waitForTimeout(120);
      const c3 = await colNames(p2);
      yes(c3.some((c) => /not in the nursery list/i.test(c)),
        'ticking Show inactive brings the orphan column back with its person');
      is(await inRow(p2, 'Other'), null, 'and the Other row is still not drawn');
      await p2.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log('');
  console.log(fails ? fails + ' check(s) FAILED' : 'all good');
  process.exit(fails ? 1 : 0);
})();
