/* TURNING A SIGNUP DOWN, on the Worker System board.
 *
 * Somebody signs themselves up and the office does not want them. The
 * Waiting to be allocated queue is everybody on the register with no
 * section, so a name nobody is ever going to file sat in that queue for
 * ever. The X on a chip rejects the registration.
 *
 * Drives the real scan/scan_workers.html in a real browser and holds it to
 * what the office asked for, and to the rules the admin-close of a dead plot
 * laid down for exactly this shape of button:
 *
 *   - every name in the queue carries an X, and it is a SIBLING of the chip
 *     and never a child: the chip opens the worker and carries a drag, so a
 *     cross inside it would fire both
 *   - a plain user who may not move a worker is offered no X at all
 *   - the confirm NAMES the person, and cancelling writes nothing
 *   - IT IS A RECORD AND NEVER A DELETION -- one UPDATE, no DELETE anywhere
 *   - the permission is asked AGAIN at the write, not only when the button
 *     was drawn
 *   - the board rebuilds from the DATABASE, not from the screen
 *   - a rejected signup is OUT of the queue and still on the register: with
 *     Show inactive ticked it is under its own heading, not back in the
 *     count of work left to do
 *   - setting them Active on their own record undoes it
 *   - and with the two columns not yet installed the X still works, says so,
 *     and does not write a column the table has not got -- which would fail
 *     the whole save
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_rejected_signup_leaves_the_queue.cjs
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

/* The office's own four names off the screenshot, and two workers already
 * filed, so the queue is not the whole register. */
const WORKERS = [
  { id: 1, full_name: 'Ahmad Bin Ali',  section: 'UNN1', role: 'General Worker', active: true },
  { id: 2, full_name: 'Muhamad Fauzan', section: 'BNN',  role: 'Field Conductor', active: true },
  { id: 3, full_name: 'Florence Indun', section: null,   role: null, active: true },
  { id: 4, full_name: 'Muhamad Azhar',  section: '',     role: null, active: true },
  { id: 5, full_name: 'ROUSELL WAYNE',  section: null,   role: null, active: true },
  { id: 6, full_name: 'Wirawijayadi',   section: null,   role: null, active: true },
];
/* Every column the real table has by the time this ships, the two new ones
 * last so a run can be made without them. */
const BASE_COLS = ['id','full_name','section','role','nursery','job_title','active','remark',
                   'pin','photo_url','maint_general','registered_on','last_day',
                   'created_at','created_by','updated_at','updated_by'];
const REJ_COLS  = ['rejected_at','rejected_by'];

let fails = 0;
function is(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'pass  ' : 'FAIL  ') + msg + (ok ? '' : '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want)));
}

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

// The confirm is answered by the test, and what it was asked is kept.
const answerConfirm = (page, yes) => page.evaluate((y) => {
  window.__CONFIRMS = [];
  window.confirm = (m) => { window.__CONFIRMS.push(String(m)); return y; };
}, yes);

const queue = (page) => page.$$eval('.pend-head ~ .pend-list .pend-item .wchip > span:last-child',
  (els) => els.map((e) => e.textContent));
const rejectedList = (page) => page.$$eval('.pend-rej .wchip > span:last-child',
  (els) => els.map((e) => e.textContent));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  try {
    // ── 1. the queue, and the cross on every name in it ──
    let page = await open(browser, port, {});
    is(await queue(page), ['Florence Indun', 'Muhamad Azhar', 'ROUSELL WAYNE', 'Wirawijayadi'],
      'the four signups with no section are the queue');
    is(await page.$eval('.pend-count', (e) => e.textContent), '4', 'and the count agrees with it');
    is(await page.$$eval('.pend-head ~ .pend-list .pend-x', (e) => e.length), 4,
      'every name in the queue carries a cross');
    is(await page.$$eval('.wchip .pend-x', (e) => e.length), 0,
      'and the cross is OUTSIDE the chip, never inside it -- the chip opens the worker and carries the drag');
    is(await page.$eval('.pend-item', (el) => el.children[0].className.split(' ')[0] + '|' + el.children[1].className),
      'wchip|pend-x', 'chip then cross, as siblings');
    is(await page.isVisible('#reject-setup'), false, 'the two columns are there, so no setup warning');

    // ── 2. cancelling writes nothing, and the confirm names the person ──
    await answerConfirm(page, false);
    await page.click('.pend-head ~ .pend-list .pend-item:first-child .pend-x');
    is(await page.evaluate(() => window.__CONFIRMS.length), 1, 'the cross asks before it writes');
    is(await page.evaluate(() => window.__CONFIRMS[0].includes('Florence Indun')), true,
      'and the confirm NAMES the person -- the crosses are a row of identical targets');
    is(await page.evaluate(() => window.__WRITES.length), 0, 'cancelling writes nothing');
    is(await queue(page), ['Florence Indun', 'Muhamad Azhar', 'ROUSELL WAYNE', 'Wirawijayadi'],
      'and leaves the queue as it was');

    // ── 3. the permission is asked AGAIN at the write ──
    await page.evaluate(() => { window.__wasMayDo = window.mayDo; window.mayDo = () => false; });
    await answerConfirm(page, true);
    await page.evaluate(() => window.rejectWorker(3));
    is(await page.evaluate(() => window.__WRITES.length), 0,
      'a cross drawn before the permission changed still writes nothing -- it is asked again at the write');
    is(await page.evaluate(() => window.__CONFIRMS.length), 0, 'and it does not even ask');
    await page.evaluate(() => { window.mayDo = window.__wasMayDo; });

    // ── 4. rejecting: one UPDATE, no DELETE, and off the queue ──
    const readsBefore = await page.evaluate(() => window.__READS.length);
    await answerConfirm(page, true);
    await page.click('.pend-head ~ .pend-list .pend-item:first-child .pend-x');
    await page.waitForFunction(() => window.__WRITES.length > 0, null, { timeout: 4000 });
    await page.waitForFunction(() => !document.body.innerText.includes('Florence Indun'), null, { timeout: 4000 }).catch(() => {});
    const w = await page.evaluate(() => window.__WRITES);
    is(w.length, 1, 'rejecting sends exactly one write');
    is(w[0].verb, 'update', 'and it is an UPDATE -- a rejection is a record, never a deletion');
    is(w[0].table, 'mjmnpayroll_workers', 'against the register');
    is(w[0].eq, { id: 3 }, 'keyed on the person who was rejected');
    is(w[0].row.active, false, 'they come off the board');
    is(typeof w[0].row.rejected_at === 'string' && w[0].row.rejected_at.length > 10, true,
      'the day it was decided is written down');
    is(w[0].row.rejected_by, 'office@mjmnursery.com', 'and who decided it');
    is(await page.evaluate(() => window.__WRITES.some((x) => x.verb === 'delete')), false,
      'nothing is ever deleted');
    is(await page.evaluate(() => window.__ALERTS.length), 0, 'and nothing went wrong');
    is(await queue(page), ['Muhamad Azhar', 'ROUSELL WAYNE', 'Wirawijayadi'],
      'the rejected name is out of the queue');
    is(await page.$eval('.pend-count', (e) => e.textContent), '3',
      'and the count is the work actually left to do');
    is(await page.evaluate((n) => window.__READS.length > n, readsBefore), true,
      'the board rebuilt from the DATABASE, not from the screen');

    // ── 5. still on the register, under its own heading ──
    await page.check('#w-show-inactive');
    is(await rejectedList(page), ['Florence Indun'],
      'with Show inactive ticked the rejected signup is on the register under its own heading');
    is(await queue(page), ['Muhamad Azhar', 'ROUSELL WAYNE', 'Wirawijayadi'],
      'and it does NOT come back into the queue');
    is(await page.$eval('.pend-count', (e) => e.textContent), '3', 'so the count does not move either');
    is(await page.$$eval('.pend-rej .pend-x', (e) => e.length), 0,
      'a signup already rejected is offered no cross');
    is((await page.$eval('.pend-rej .wchip', (e) => e.getAttribute('title'))).includes('registration rejected'), true,
      'and the hover says what happened to them');
    await page.close();

    // ── 6. a plain user is offered no cross at all ──
    page = await open(browser, port, { manage: false });
    is(await queue(page), ['Florence Indun', 'Muhamad Azhar', 'ROUSELL WAYNE', 'Wirawijayadi'],
      'somebody who may not move a worker still sees the queue');
    is(await page.$$eval('.pend-x', (e) => e.length), 0, 'and is offered no cross');
    is((await page.$eval('.pend-why', (e) => e.textContent)).includes('reject'), false,
      'nor told about one');
    await page.close();

    // ── 7. the columns not installed yet ──
    page = await open(browser, port, { cols: BASE_COLS });
    is(await page.isVisible('#reject-setup'), true, 'without the columns the page says which file to run');
    is((await page.$eval('#reject-setup', (e) => e.textContent)).includes('RUN_ME_worker_rejected.sql'), true,
      'and names it');
    await answerConfirm(page, true);
    await page.click('.pend-head ~ .pend-list .pend-item:first-child .pend-x');
    await page.waitForFunction(() => window.__WRITES.length > 0, null, { timeout: 4000 });
    const w2 = await page.evaluate(() => window.__WRITES[0]);
    is(Object.keys(w2.row).sort(), ['active', 'updated_at', 'updated_by'],
      'the cross still works and writes no column the table has not got -- that would fail the whole save');
    is(await page.evaluate(() => window.__CONFIRMS[0].includes('not switched on yet')), true,
      'and the confirm says the rejection will not be recorded');
    is(await page.evaluate(() => window.__ALERTS.length), 0, 'no refusal came back');
    await page.close();

    // ── 8. setting them Active again undoes it ──
    page = await open(browser, port, {
      workers: WORKERS.map((x) => x.id === 3
        ? { ...x, active: false, rejected_at: '2026-10-20T01:00:00Z', rejected_by: 'office@mjmnursery.com' } : x) });
    await page.check('#w-show-inactive');
    is(await rejectedList(page), ['Florence Indun'], 'a rejected signup opens on the register');
    await page.evaluate(() => window.openWorker(3));
    // shared_cf_select.js hides the native select behind its own button, so
    // the value is set on the real control the save reads.
    await page.evaluate(() => {
      const sel = document.getElementById('wf-active');
      sel.value = '1';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.evaluate(() => window.saveWorker());
    await page.waitForFunction(() => window.__WRITES.length > 0, null, { timeout: 4000 });
    const w3 = await page.evaluate(() => window.__WRITES[0]);
    is([w3.row.active, w3.row.rejected_at, w3.row.rejected_by], [true, null, null],
      'setting them Active clears the rejection -- same reason Active clears the last day');
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(fails ? '\n' + fails + ' FAILED' : '\nall good');
  process.exit(fails ? 1 : 0);
})();
