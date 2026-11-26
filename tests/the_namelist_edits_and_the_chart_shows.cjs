/* THE WORKER NAMELIST EDITS, AND THE WORKER SYSTEM CHART ONLY SHOWS.
 *
 * The office: changing things belongs on the namelist, and the Worker
 * System should only show who is in which place and which job, like an
 * organisation chart. So scan/scan_workers.html opens on the namelist (Add
 * Worker, an Edit on every row, Waiting to be allocated with Edit and a
 * cross, Manage Roles), and #chart is the board with nothing on it that
 * writes: no Edit, no drag, no Add, no cross. A name there still opens its
 * record, read-only. A role added in Manage Roles waits for Save, and
 * Cancel throws it away.
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_namelist_edits_and_the_chart_shows.cjs
 * SHOT=/dir draws both views.
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
  await page.goto('http://localhost:' + port + '/scan/scan_workers.html' + (o.hash || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(o.hash === '#chart' ? '#worker-board .bd' : '#wl-body tr', { timeout: 8000 });
  return page;
}


/* One of every role the list offers, plus the two shapes that belong in
 * Other and nowhere else: a role typed before the list existed, and none at
 * all. The two in OTHERS are the office staff the SQL moves. */
const WORKERS = [
  { id: 11, full_name: 'New Signup',    section: '',       role: 'General Worker',            active: true },
  { id: 12, full_name: 'Gone Worker',   section: 'BNN',    role: 'General Worker',            active: false, last_day: '2026-10-01' },
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
const BASE_COLS = ['id','full_name','section','role','nursery','job_title','active','remark','portal',
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

const names = (page) => page.$$eval('#wl-body tr .wl-name > span:last-child', (e) => e.map((x) => x.textContent));
const shown = (page, sel) => page.$$eval(sel, (e) => e.filter((x) => x.offsetParent !== null).length);
const setSel = (page, id, v) => page.evaluate(([i, val]) => {
  const s = document.getElementById(i); s.value = val; s.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, v]);

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  try {
    console.log('\n-- 1. the page opens on the namelist --');
    let page = await open(browser, port);
    yes(await page.isVisible('#tab-list'), 'the namelist is the first thing shown');
    yes(!(await page.isVisible('#tab-workers')), 'and the chart is not');
    is(await page.$eval('#page-back', (e) => e.getAttribute('href')), 'scan_admin.html', 'its back icon goes to the 555 Team page');
    is(await page.$eval('#wl-go', (e) => e.getAttribute('href')), '#chart', 'and Worker System opens the chart');
    const n = await names(page);
    is(n.length, WORKERS.length, 'every worker on the register is listed');
    is(n[n.length - 1], 'Gone Worker', 'active first, the inactive under them');
    is(await page.$eval('#wl-n-off', (e) => e.textContent), '1', 'one inactive');
    is(await page.$$eval('#wl-body .wl-ic', (e) => e.length), WORKERS.length, 'every row carries an Edit');
    yes(await page.isVisible('#wl-add'), 'there is an Add Worker');
    yes(await page.isVisible('#wl-roles'), 'and a Manage Roles');

    console.log('\n-- 2. Waiting to be allocated is the to-do, at the top --');
    is(await page.$$eval('#wl-pending .wl-pend-row .wl-name > span:last-child', (e) => e.map((x) => x.textContent)),
      ['New Signup'], 'the one signup with no section waits on top');
    is(await page.$$eval('#wl-pending .wl-ic', (e) => e.length), 2, 'with an Edit and a cross');
    is(await page.$$eval('#wl-body tr', (trs) => trs.filter((t) => t.textContent.includes('New Signup'))
      .map((t) => t.querySelector('.wl-loc').textContent.trim())), ['Not allocated'], 'and the list says Not allocated');

    console.log('\n-- 3. editing a pending signup keeps them unallocated until a location is picked --');
    await page.evaluate(() => openWorker(11));
    yes(await page.isVisible('#wf-section-row'), 'the form asks for the location');
    is(await page.$eval('#wf-section', (e) => e.value), '', 'and it opens on Not allocated -- never on the first nursery by accident');
    yes(await page.isVisible('#wf-save'), 'it can be saved');
    await setSel(page, 'wf-section', 'UNN1');
    await page.evaluate(() => saveWorker());
    await page.waitForFunction(() => window.__WRITES.some((w) => w.verb === 'update'), null, { timeout: 4000 });
    const up = await page.evaluate(() => window.__WRITES.find((w) => w.verb === 'update'));
    is([up.eq.id, up.row.section, up.row.nursery], [11, 'UNN1', 'UNN1'], 'Save writes the location onto that worker');
    await page.waitForFunction(() => !document.querySelector('#wl-pending .wl-pend-row'), null, { timeout: 4000 }).catch(() => {});
    is(await shown(page, '#wl-pending .wl-pend-row'), 0, 'and they leave the queue');

    console.log('\n-- 4. Add Worker files from the form --');
    await page.evaluate(() => { window.__WRITES.length = 0; });
    await page.click('#wl-add');
    yes(await page.isVisible('#worker-modal.open'), 'Add Worker opens the form');
    is(await page.$eval('#worker-modal-title', (e) => e.textContent), 'Add Worker — Not allocated yet', 'empty, headed Add Worker');
    await page.fill('#wf-name', 'Brand New');
    await setSel(page, 'wf-section', 'BNN');
    await setSel(page, 'wf-role', 'Driver');
    await page.evaluate(() => saveWorker());
    await page.waitForFunction(() => window.__WRITES.some((w) => w.verb === 'insert'), null, { timeout: 4000 });
    const ins = await page.evaluate(() => window.__WRITES.find((w) => w.verb === 'insert'));
    is([ins.row.full_name, ins.row.section, ins.row.role], ['Brand New', 'BNN', 'Driver'], 'one INSERT, with the location and role picked');

    console.log('\n-- 5. Manage Roles waits for Save, and Cancel throws it away --');
    await page.evaluate(() => { window.__WRITES.length = 0; });
    await page.click('#wl-roles');
    await page.fill('#rf-name', 'Mata Malam');
    await page.click('#role-modal .frow .btn');
    is(await page.$$eval('#rf-list .rf-item > span', (e) => e.map((x) => x.textContent)), ['Mata Malam'], 'the role is in the window');
    is(await page.evaluate(() => window.__WRITES.length), 0, 'and nothing is written yet');
    await page.click('#role-modal .modal-foot .btn:not(.btn-primary)');
    is(await page.evaluate(() => window.__WRITES.length), 0, 'Cancel writes nothing');
    is(await page.evaluate(() => ROLES.includes('Mata Malam')), false, 'and the role is not on the list');
    await page.click('#wl-roles');
    is(await page.$$eval('#rf-list .rf-item', (e) => e.length), 0, 'reopened, the cancelled role is gone');
    await page.fill('#rf-name', 'Mata Malam');
    await page.click('#rf-save');
    await page.waitForFunction(() => window.__WRITES.some((w) => w.verb === 'upsert'), null, { timeout: 4000 });
    const ro = await page.evaluate(() => window.__WRITES.find((w) => w.verb === 'upsert'));
    is([ro.table, ro.row.key, JSON.parse(ro.row.txt_value)], ['nops_maint_config', 'worker_roles', ['Mata Malam']],
      'Save writes the role list, the typed name included');
    is(await page.evaluate(() => ROLES.includes('Mata Malam')), true, 'and the form now offers it');
    await page.close();

    console.log('\n-- 5b. the Work Maintenance box is on Add as on Edit --');
    page = await open(browser, port);
    await page.click('#wl-add');
    await setSel(page, 'wf-role', 'General Worker');
    yes(await page.isVisible('#wf-maint-row'), 'Add Worker carries the Work Maintenance box');
    yes(await page.$eval('#wf-maint', (e) => e.disabled), 'switched off while the worker is filed under no nursery');
    yes(!(await page.isVisible('#wf-hint-row')), 'and no Filed under line over an editable location box');
    await setSel(page, 'wf-section', 'UNN1');
    yes(!(await page.$eval('#wf-maint', (e) => e.disabled)), 'live once a nursery is picked');
    is(await page.$eval('#wf-role', (s) => [...s.options].some((o) => /New role/.test(o.textContent))), false, 'the Role box offers no New role');
    await page.close();

    console.log('\n-- 5c. Jobs: Work Maintenance, Siram Go and Mata Malam --');
    page = await open(browser, port, { workers: WORKERS.map((x) => x.id === 6
      ? { ...x, portal: { modules: { maintenance: true, settings: true, mata_malam: false } } } : x) });
    await page.evaluate(() => openWorker(7));
    is(await page.$$eval('#wf-maint-row .wf-job', (e) => e.map((x) => x.textContent.trim())),
      ['Work Maintenance', 'Siram Go', 'Mata Malam'], 'the Jobs box names the three jobs');
    is(await page.$eval('#wf-job-siram', (e) => e.checked) && await page.$eval('#wf-job-mata', (e) => e.checked), true,
      'a worker whose record says nothing keeps both (absent is on)');
    await page.evaluate(() => closeModal('worker-modal'));
    await page.evaluate(() => openWorker(6));
    is([await page.$eval('#wf-job-siram', (e) => e.checked), await page.$eval('#wf-job-mata', (e) => e.checked)], [true, false],
      'a record with Mata Malam unticked opens unticked');
    await page.evaluate(() => { window.__WRITES.length = 0; document.getElementById('wf-job-siram').click(); });
    await page.evaluate(() => saveWorker());
    await page.waitForFunction(() => window.__WRITES.some((w) => w.verb === 'update'), null, { timeout: 4000 });
    const jw = await page.evaluate(() => window.__WRITES.find((w) => w.verb === 'update').row.portal);
    is(jw && jw.modules, { maintenance: true, settings: true, mata_malam: false, siram_go: false },
      'Save writes the two ticks into portal.modules and keeps what else is there');
    await page.close();
    page = await open(browser, port);
    await page.click('#wl-add');
    is([await page.$eval('#wf-job-siram', (e) => e.checked), await page.$eval('#wf-job-mata', (e) => e.checked)], [false, false],
      'a new worker with no role does neither');
    await setSel(page, 'wf-role', 'Water Pump Operator');
    is(await page.$eval('#wf-job-siram', (e) => e.checked), true, 'a new Water Pump Operator is ticked for Siram Go');
    if (process.env.SHOT) { await setSel(page, 'wf-section', 'UNN1'); await page.setViewportSize({ width: 1280, height: 1000 }); await page.screenshot({ path: process.env.SHOT + '/jobs_form.png' }); }
    await page.close();

    console.log('\n-- 5d. the Jobs row is only for a General Worker and a Water Pump Operator --');
    page = await open(browser, port);
    await page.evaluate(() => openWorker(9));
    yes(!(await page.isVisible('#wf-maint-row')), 'a Driver has no Jobs row');
    await setSel(page, 'wf-role', 'General Worker');
    yes(await page.isVisible('#wf-maint-row'), 'turned General Worker, the row appears');
    await setSel(page, 'wf-role', 'Water Pump Operator');
    yes(await page.isVisible('#wf-maint-row'), 'and for a Water Pump Operator');
    await setSel(page, 'wf-role', 'Gardener');
    yes(!(await page.isVisible('#wf-maint-row')), 'and goes again for a Gardener');
    await page.evaluate(() => { window.__WRITES.length = 0; });
    await page.click('#wf-save');
    await page.waitForTimeout(300);
    const gw = await page.evaluate(() => (window.__WRITES.find((x) => x.table === 'mjmnpayroll_workers') || {}).row);
    yes(gw && !('portal' in gw), 'saving a Gardener leaves Siram Go and Mata Malam as they are');
    await page.close();
    page = await open(browser, port);
    await page.click('#wl-add');
    yes(!(await page.isVisible('#wf-maint-row')), 'a new worker with no role yet has no Jobs row');
    await page.close();

    console.log('\n-- 6. the chart only shows --');
    page = await open(browser, port, { hash: '#chart' });
    yes(await page.isVisible('#tab-workers'), 'the chart is drawn at #chart');
    yes(!(await page.isVisible('#tab-list')), 'without the namelist');
    is(await page.$eval('#page-back', (e) => e.getAttribute('href')), '#list', 'its back icon returns to the namelist');
    is(await page.$$eval('#worker-board button', (e) => e.map((x) => x.textContent.trim())), [], 'no button anywhere on the chart -- no Edit, Save, Add or cross');
    is(await page.$$eval('#worker-board [draggable]', (e) => e.length), 0, 'and nothing can be dragged');
    yes(await page.$eval('#worker-board .bd-bar', (e) => e.textContent.includes('Worker Namelist')), 'the strip says where a worker is changed');
    await page.evaluate(() => openWorker(4));
    yes(!(await page.isVisible('#wf-save')), 'a name opens read-only');
    yes(!(await page.isVisible('#wf-section-row')), 'with no location box');
    yes(await page.$eval('#wf-name', (e) => e.disabled), 'and every box disabled');
    await page.evaluate(() => { window.__WRITES.length = 0; window.__ALERTS.length = 0; saveWorker(); rejectWorker(11); openManageRoles(); });
    await page.waitForTimeout(200);
    is(await page.evaluate(() => window.__WRITES.length), 0, 'a save, a rejection or a role called from the console on the chart writes nothing');
    await page.evaluate(() => closeModal('worker-modal'));
    await page.click('#page-back');
    await page.waitForTimeout(200);
    yes(await page.isVisible('#tab-list'), 'back goes to the namelist');
    await page.close();

    console.log('\n-- 7. a plain user can only look --');
    page = await open(browser, port, { manage: false });
    is(await page.$$eval('#wl-body .wl-ic', (e) => e.length), 0, 'no Edit on any row');
    yes(!(await page.isVisible('#wl-add')), 'no Add Worker');
    yes(!(await page.isVisible('#wl-roles')), 'no Manage Roles');
    await page.close();

    console.log('\n-- 9. the page sits in the middle --');
    page = await open(browser, port);
    await page.setViewportSize({ width: 1900, height: 900 });
    const pad = await page.evaluate(() => getComputedStyle(document.body).paddingLeft);
    is(pad, '0px', 'no payroll side-bar padding on this page');
    const m = await page.evaluate(() => { const r = document.getElementById('main').getBoundingClientRect();
      /* measured against BODY: the stylesheet reserves a scrollbar gutter on the right */
      return [Math.round(r.left), Math.round(document.body.getBoundingClientRect().right - r.right)]; });
    yes(Math.abs(m[0] - m[1]) <= 2, 'the page has the same margin left and right -> ' + JSON.stringify(m));
    await page.close();

    if (process.env.SHOT) {
      page = await open(browser, port);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.screenshot({ path: process.env.SHOT + '/namelist.png', fullPage: true });
      await page.close();
      page = await open(browser, port, { hash: '#chart' });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.screenshot({ path: process.env.SHOT + '/chart.png', fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(fails ? '\n' + fails + ' FAILED' : '\nall good');
  process.exit(fails ? 1 : 0);
})();
