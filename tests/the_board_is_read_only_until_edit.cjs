/* THE WORKER BOARD IS A RECORD UNTIL SOMEBODY PRESSES EDIT
 *
 * The office asked for it in one line, over a screenshot of the board:
 * *"help to add save button and edit button. Editable only when user click
 * edit button. and show last update date & who update."*
 *
 * WHAT THEY WERE LOOKING AT IS WHY. Every drag on that board wrote to the
 * register the moment the name landed — one UPDATE, no confirm, and nothing
 * on screen saying it had happened. A drag is the easiest gesture on a
 * trackpad to make by accident, and moving a name moves which nursery pays
 * them and which Work Maintenance tick sheets they appear on. A board that
 * writes on contact cannot tell a decision from a sleeve.
 *
 * So there are two states and the difference is visible, and the moves are a
 * DRAFT — the shape Where Each Job Is Done already uses, for its reasons: a
 * move stored before Save cannot be cancelled, and a round trip per chip
 * somebody tried is a board that fights back.
 *
 * It drives the REAL scan/scan_workers.html in a REAL browser, and the drag
 * is the board's own handlers: a DragEvent dispatched at the chip and the
 * cell, which fires the inline ondragstart / ondragover / ondrop exactly as
 * a mouse does. A drag simulated by writing into `boardDraft` would prove
 * nothing about the board.
 *
 * THE GATE IS ASKED SEPARATELY FROM THE PAINT, in section 6. `draggable` is
 * an attribute, Save Worker is hidden by a class, and a disabled input is
 * still a disabled input — none of those stops a call. Every one of them is
 * driven from the console here with the board locked, because that is the
 * only way to tell a gate from a greyed-out button.
 *
 * Run: NODE_PATH=/opt/node-tools/node_modules node tests/the_board_is_read_only_until_edit.cjs
 */
const http = require('http');
const fs   = require('fs');
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

/* The same strict stub the reject test uses: writing a column the table has
 * not got fails the WHOLE save, so one that takes anything signs off a write
 * the database refuses. `__FAIL_IDS` is this file's own addition — a write
 * keyed on one of those ids comes back refused, which is what proves a
 * refused worker STAYS in the draft instead of being reported as saved. */
const FAKE_SUPABASE = `
window.__WRITES = [];
window.__FAIL_IDS = [];
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
        var bad = missing(b._cols);
        if (bad) return { data: null, error: { message: 'column mjmnpayroll_workers.' + bad + ' does not exist', code: '42703' } };
      }
      var rows = table === 'shared_profiles' ? (window.__PROFILES || [window.__FAKE_PROFILE])
                                             : ((window.__ROWS || {})[table] || []);
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
        if ((window.__FAIL_IDS || []).map(String).indexOf(String(w.eq.id)) >= 0) {
          w.refused = true;
          return Promise.resolve({ data: null, error: { message: 'row level security' } }).then(r, j);
        }
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

/* Two filed workers and one signup, which is every state a chip can be in.
 * The two `updated_at` stamps are DIFFERENT on purpose: the strip answers
 * "is what I am looking at current", so it must read the NEWEST across the
 * whole register and not the first row it meets. */
const WORKERS = [
  { id: 1, full_name: 'Ahmad Bin Ali',  section: 'UNN1', role: 'General Worker',  active: true,
    updated_at: '2026-11-02T03:15:00Z', updated_by: 'office@mjmnursery.com' },
  { id: 2, full_name: 'Muhamad Fauzan', section: 'BNN',  role: 'Field Conductor', active: true,
    updated_at: '2026-11-09T06:40:00Z', updated_by: 'esther@mjmnursery.com' },
  { id: 3, full_name: 'Florence Indun', section: null,   role: null,              active: true,
    updated_at: '2026-10-28T01:00:00Z', updated_by: 'office@mjmnursery.com' },
];
const COLS = ['id','full_name','section','role','nursery','job_title','active','remark',
              'pin','photo_url','maint_general','registered_on','last_day',
              'created_at','created_by','updated_at','updated_by','rejected_at','rejected_by'];

let fails = 0, passes = 0;
function is(got, want, msg) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passes++; console.log('pass  ' + msg); }
  else { fails++; console.log('FAIL  ' + msg + '\n        got  ' + JSON.stringify(got)
                              + '\n        want ' + JSON.stringify(want)); }
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
  await page.addInitScript(({ manage, workers, cols }) => {
    const user = { id: 'u1', email: 'office@mjmnursery.com', user_metadata: { full_name: 'Office' } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    const perms = { modules: { npayroll: 'normal', operation: 'admin' } };
    if (!manage) perms.npayroll_actions = { workers: { view: true, manage: false } };
    window.__FAKE_PROFILE = { id: 'u1', email: user.email, user_type: 'system',
                              full_name: 'The Office', permissions: perms };
    /* shared_profiles is what turns a stored email into a name. The strip
       says "by Esther Wong Sze Qi", never "by esther@mjmnursery.com". */
    window.__PROFILES = [
      window.__FAKE_PROFILE,
      { email: 'esther@mjmnursery.com', full_name: 'Esther Wong Sze Qi' },
    ];
    window.__COLS = cols;
    window.__ROWS = {
      mjmnpayroll_workers: JSON.parse(JSON.stringify(workers)),
      operation_nurseries: [{ name: 'PN' }, { name: 'BNN' }, { name: 'Ulu Niah 1' }, { name: 'Ulu Niah 2' }],
      nelos_modules: [],
    };
    window.__ALERTS = []; window.__CONFIRMS = [];
    window.alert = (m) => { window.__ALERTS.push(String(m)); };
    window.confirm = (m) => { window.__CONFIRMS.push(String(m)); return window.__SAY_YES !== false; };
    window.prompt = () => { throw new Error('nothing here may raise a prompt'); };
  }, { manage: o.manage !== false, workers: o.workers || WORKERS, cols: o.cols || COLS });
  await page.goto('http://localhost:' + port + '/scan/scan_workers.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#worker-board .bd', { timeout: 8000 });
  return page;
}

/* THE REAL HANDLERS. A dispatched DragEvent fires the inline ondragstart /
 * ondragover / ondrop, so this is the board's own code and not a shortcut
 * past it. The chip is found by NAME and the cell by the row and column
 * headings, which is what somebody aims at. */
const drag = (page, name, section, roleLabel) => page.evaluate(({ name, section, roleLabel }) => {
  const cells = [...document.querySelectorAll('#worker-board .bd-cell-in, .pend-list')];
  const chip = [...document.querySelectorAll('#worker-board .wchip')]
    .find(c => (c.querySelector('span:last-child') || {}).textContent === name);
  const heads = [...document.querySelectorAll('#worker-board .bd-secs th .bd-sec')]
    .map(s => s.textContent.trim());
  const col = heads.indexOf(section);
  const row = [...document.querySelectorAll('#worker-board tbody tr')]
    .find(tr => ((tr.querySelector('.bd-role-name') || {}).textContent || '').trim() === roleLabel);
  if (!chip) return 'no chip reading ' + name;
  if (col < 0) return 'no column headed ' + section;
  if (!row)  return 'no row headed ' + roleLabel;
  const target = row.querySelectorAll('td.bd-cell')[col];
  if (!target) return 'no cell at ' + section + ' / ' + roleLabel;
  const dt = new DataTransfer();
  const fire = (type, el) => el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  fire('dragstart', chip);
  fire('dragover', target);
  fire('drop', target);
  fire('dragend', chip);
  return 'ok';
  // eslint-disable-next-line no-unused-vars
}, { name, section, roleLabel, cells: null });

/* Where every name on the board is drawn, as a reader sees it: section and
 * role row per name. Read off the TABLE, so it is the board's own answer. */
const placed = (page) => page.evaluate(() => {
  const heads = [...document.querySelectorAll('#worker-board .bd-secs th .bd-sec')].map(s => s.textContent.trim());
  const out = {};
  document.querySelectorAll('#worker-board tbody tr').forEach((tr) => {
    const role = ((tr.querySelector('.bd-role-name') || {}).textContent || '').trim();
    [...tr.querySelectorAll('td.bd-cell')].forEach((td, i) => {
      td.querySelectorAll('.wchip').forEach((c) => {
        out[(c.querySelector('span:last-child') || {}).textContent] = heads[i] + '|' + role;
      });
    });
  });
  return out;
});

/* EVERY READER IS GUARDED, and the page this is about is the reason. On the
 * board as it was there is no strip, no Save, no `boardEdit` and no
 * read-only note — so an unguarded `$eval` or a bare call takes the harness
 * down on the first line and the seventy checks under it are never asked,
 * which proves nothing about the code being replaced. Each of these answers
 * with what is missing instead, so the failure arrives as a NAMED check. */
const one = (page, sel, fn, missing) => page.$$eval(sel, (es, f) =>
  (es.length ? (0, eval)('(' + f + ')')(es[0]) : null), fn.toString())
  .then((v) => (v === null ? (missing === undefined ? 'no ' + sel : missing) : v));

const call = (page, name, ...args) => page.evaluate(({ name, args }) =>
  (typeof window[name] === 'function' ? (window[name](...args), 'called') : 'no ' + name),
  { name, args });

/* THE OFFICE PRESSES BUTTONS, not functions, so the two that matter are
 * driven through the real control — `el.click()` in the page rather than
 * Playwright's, which times out for thirty seconds on a button that is not
 * there and says nothing about why. */
const press = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return 'no ' + s;
  el.click();
  return 'pressed';
}, sel);

const strip = (page) => one(page, '.bd-bar-when', (e) => e.textContent.replace(/\s+/g, ' ').trim());
/* The button LABELS. The count rides inside Save as a pill of its own and
 * is asked about separately, so it is dropped here — otherwise this reads
 * "Save1" and a check about which buttons are offered fails over a number. */
const btns = (page) => page.$$eval('.bd-bar-btns .btn', (es) => es.map((e) => {
  const c = e.cloneNode(true);
  c.querySelectorAll('.bd-bar-n').forEach((n) => n.remove());
  return c.textContent.replace(/\s+/g, ' ').trim();
}));
const count  = (page) => one(page, '.bd-bar-n', (e) => e.textContent, 'none');
const writes = (page) => page.evaluate(() => window.__WRITES.slice());
const nth    = (page, sel) => page.$$eval(sel, (es) => es.length);
/* Waits for a condition and says so rather than throwing when it never
 * comes — a 30-second timeout in the middle of a run reads as a hang. */
const until = (page, fn, ms) => page.waitForFunction(fn, null, { timeout: ms || 5000 })
  .then(() => true, () => false);

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  try {
    /* ══ 1. THE BOARD AS IT OPENS ══════════════════════════════════════
       Nothing on it moves, and the one thing the office asked to see is
       the first thing on it. */
    console.log('\n-- 1. it opens locked, and says when it was last touched --');
    let page = await open(browser, port, {});

    is(await page.$$eval('#worker-board .wchip[draggable="true"]', (e) => e.length), 0,
      'no chip on a locked board can be dragged');
    is(await page.$$eval('#worker-board .wchip-add', (e) => e.length), 0,
      'no cell offers to add a person');
    is(await page.$$eval('#worker-board .pend-x', (e) => e.length), 0,
      'and no signup offers the cross');
    is(await btns(page), ['✎ Edit'], 'the strip offers Edit, and only Edit');

    /* THE LINE IS ABOVE THE BOARD, which is the whole of why the office
       asked for something that had been on this page all along: it was a
       foot-note under thirty-two rows of names, so on the screen anybody
       actually looks at it was never there. */
    is(await page.evaluate(() => {
      const bar = document.querySelector('#worker-board .bd-bar');
      const tbl = document.querySelector('#worker-board .bd-wrap');
      if (!bar || !tbl) return 'missing';
      return (bar.compareDocumentPosition(tbl) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'above' : 'below';
    }), 'above', 'and it is drawn ABOVE the board, not under it');

    /* The NEWEST stamp on the register, not the first row met — and the
       name, never the address it is stored as. */
    const line = await strip(page);
    is(/^Last updated 09 Nov 2026/.test(line), true,
      'the newest stamp across the whole register is the one shown  → ' + line);
    is(/by Esther Wong Sze Qi\.$/.test(line), true, 'and WHO, resolved to a name');
    is(/@/.test(line), false, 'never the email address it is stored as');

    /* ══ 2. EDIT UNLOCKS IT, AND SAYS SO ══════════════════════════════ */
    console.log('\n-- 2. Edit unlocks the board --');
    is(await press(page, '.bd-bar-btns .btn'), 'pressed', 'the Edit button on the strip is pressed');
    is(await page.$$eval('#worker-board .wchip[draggable="true"]', (e) => e.length > 0), true,
      'now the chips are draggable');
    is(await page.$$eval('#worker-board .wchip-add', (e) => e.length > 0), true,
      'the cells offer Add person');
    is(await page.$$eval('#worker-board .pend-x', (e) => e.length), 1,
      'and the signup gets its cross back');
    is(await btns(page), ['Cancel', 'Save'], 'the strip offers Cancel and Save');
    is(await one(page, '#bd-save', (e) => e.disabled), true,
      'Save is offered with nothing moved and DISABLED — a button that appears halfway through is one nobody knows is coming');
    is(await one(page, '.bd-bar', (e) => e.classList.contains('is-edit')), true,
      'and the strip is tinted, because a live board and a locked one otherwise look identical');
    is(await writes(page), [], 'pressing Edit wrote nothing');

    /* ══ 3. A DRAG IS A DRAFT ═════════════════════════════════════════
       The whole point. The name moves on screen and the register does not. */
    console.log('\n-- 3. a drag writes NOTHING until Save --');
    is(await drag(page, 'Ahmad Bin Ali', 'BNN', 'FC'), 'ok', 'the drag ran through the real handlers');
    is((await placed(page))['Ahmad Bin Ali'], 'BNN|FC', 'the name is drawn where it was dropped');
    is(await writes(page), [], 'and NOTHING was written');
    is(await one(page, '#bd-save', (e) => e.disabled), false, 'Save is live now');
    is(await count(page), '1', 'and says it is holding one move');
    is(/nothing is saved yet/.test(await strip(page)), true, 'the strip says so in words too');

    /* A second name, so Save is asked about more than one — and a drag OUT
       of the queue, which is the gesture that files a signup. */
    is(await drag(page, 'Florence Indun', 'UNN1', 'Admin'), 'ok', 'a signup drags out of the queue');
    is(await page.$$eval('.pend-head ~ .pend-list .wchip', (e) => e.length), 0,
      'and leaves it at once — the queue is a count of work left to do');
    is(await count(page), '2', 'two moves held');

    /* DRAGGED BACK IS NOT A MOVE. Without this the draft would carry a
       worker whose columns are what the register already holds, and Save
       would ask the office to write work they had just undone. */
    is(await drag(page, 'Ahmad Bin Ali', 'UNN1', 'Workers'), 'ok', 'dragging a name back to where it started');
    is(await count(page), '1',
      'takes it off the draft rather than counting it as a second move');

    /* ══ 4. SAVE ═════════════════════════════════════════════════════ */
    console.log('\n-- 4. Save writes the moves, and only the moves --');
    is(await press(page, '#bd-save'), 'pressed', 'the Save button on the strip is pressed');
    await until(page, () => window.__WRITES.length > 0);
    const w = await writes(page);
    const w0 = w[0] || { row: {} };
    is(w.length, 1, 'one write, for the one name still moved');
    is(w0.verb, 'update', 'an UPDATE — nothing on this board deletes a worker');
    is(w0.table, 'mjmnpayroll_workers', 'against the register');
    is(w0.eq, { id: 3 }, 'keyed on the worker who moved');
    is([w0.row.section, w0.row.role], ['UNN1', 'Admin'], 'carrying where they were dropped');
    is([w0.row.nursery, w0.row.job_title], ['UNN1', 'Admin'],
      'and the original pair kept in step, so nothing still reading those columns disagrees');
    is(typeof w0.row.updated_at === 'string' && w0.row.updated_by, 'office@mjmnursery.com',
      'stamped with when and by whom — which is what the strip then reads');
    is(await btns(page), ['✎ Edit'], 'a clean save locks the board behind the person who finished with it');
    is(await nth(page, '.bd-bar-n'), 0, 'and nothing is left waiting');
    is(/Last updated/.test(await strip(page)), true, 'the strip is a last-updated line again');
    await page.close();

    /* ══ 5. CANCEL ═══════════════════════════════════════════════════ */
    console.log('\n-- 5. Cancel puts them back and writes nothing --');
    page = await open(browser, port, {});
    await call(page, 'boardEdit');
    await drag(page, 'Ahmad Bin Ali', 'BNN', 'FC');
    is((await placed(page))['Ahmad Bin Ali'], 'BNN|FC', 'moved on screen');
    await page.evaluate(() => { window.__CONFIRMS = []; });
    await call(page, 'boardCancel');
    is(await page.evaluate(() => window.__CONFIRMS.length), 1,
      'Cancel ASKS before throwing a move away');
    is((await placed(page))['Ahmad Bin Ali'], 'UNN1|Workers', 'and puts the name back');
    is(await writes(page), [], 'having written nothing at any point');
    is(await btns(page), ['✎ Edit'], 'the board is locked again');

    /* With nothing moved there is nothing to throw away, so it asks
       nothing — a confirm over an empty draft is a box people learn to
       dismiss, and then they dismiss the one that mattered. */
    await call(page, 'boardEdit');
    await page.evaluate(() => { window.__CONFIRMS = []; });
    await call(page, 'boardCancel');
    is(await page.evaluate(() => window.__CONFIRMS.length), 0,
      'with nothing moved Cancel is just the way out, and asks nothing');
    await page.close();

    /* ══ 6. THE GATE, NOT THE PAINT ══════════════════════════════════
       `draggable` is an attribute, `.hidden` is a class, and a disabled
       input is still a disabled input. None of them stops a call. */
    console.log('\n-- 6. the gate is not the paint --');
    page = await open(browser, port, {});

    is(await drag(page, 'Ahmad Bin Ali', 'BNN', 'FC'), 'ok',
      'a drag CAN be fired at a locked board from outside');
    is((await placed(page))['Ahmad Bin Ali'], 'UNN1|Workers', '…and the name does not move');
    is(await writes(page), [], '…and nothing is written');

    await call(page, 'rejectWorker', 3);
    is(await writes(page), [], 'rejectWorker called with the board locked writes nothing');
    is(await page.evaluate(() => window.__ALERTS.pop() || ''), 'Press Edit above the board first.',
      'and says where the lever is');

    /* The record OPENS — looking somebody up is reading — and cannot be
       saved. A board whose names cannot be opened answers nothing. */
    await call(page, 'openWorker', 1);
    is(await one(page, '#worker-modal', (e) => e.classList.contains('open')), true,
      'a chip still opens the record with the board locked');
    is(await one(page, '#wf-name', (e) => e.value), 'Ahmad Bin Ali', 'on the right person');
    is(/^Worker —/.test(await one(page, '#worker-modal-title', (e) => e.textContent)), true,
      'headed Worker and not Edit Worker — a form headed Edit with no Save is a contradiction');
    is(await one(page, '#wf-name', (e) => e.disabled), true, 'with every box disabled');
    is(await page.$$eval('#worker-modal input:not([disabled]), #worker-modal select:not([disabled]), #worker-modal textarea:not([disabled])',
      (e) => e.length), 0, 'every one of them, not only the first');
    is(await one(page, '#wf-save', (e) => e.classList.contains('hidden')), true, 'Save Worker is gone');
    is(await one(page, '#wf-ro-note', (e) => e.classList.contains('hidden')), false,
      'and a line says why, where the button would have been');
    is(await one(page, '#wf-close', (e) => e.textContent.trim()), 'Close',
      'nothing was keyed, so it is a Close and not a Cancel');

    await call(page, 'saveWorker');
    is(await writes(page), [], 'and saveWorker called from outside writes nothing');
    is(await page.evaluate(() => window.__ALERTS.pop() || ''), 'Press Edit above the board first.',
      'saying the same thing');

    /* The same record, unlocked. Asked as a PAIR: "the fields are disabled"
       passes just as well on a form that is broken. */
    await call(page, 'closeModal', 'worker-modal');
    await call(page, 'boardEdit');
    await call(page, 'openWorker', 1);
    is(await one(page, '#wf-name', (e) => e.disabled), false, 'with the board unlocked the boxes take typing');
    is(await one(page, '#wf-save', (e) => e.classList.contains('hidden')), false, 'and Save Worker is back');
    is(await one(page, '#wf-close', (e) => e.textContent.trim()), 'Cancel', 'beside a Cancel');
    is(/^Edit Worker —/.test(await one(page, '#worker-modal-title', (e) => e.textContent)), true,
      'and the heading is Edit Worker again');
    await page.close();

    /* ══ 7. A WORKER THE FORM SAVED COMES OFF THE DRAFT ══════════════
       The form is the more specific statement about that person. Left on
       the draft, the next Save would put the board's row back over what
       was keyed. */
    console.log('\n-- 7. the form is the more specific statement --');
    page = await open(browser, port, {});
    await call(page, 'boardEdit');
    await drag(page, 'Ahmad Bin Ali', 'BNN', 'FC');
    is(await count(page), '1', 'one move held');
    await call(page, 'openWorker', 1);
    await call(page, 'saveWorker');
    await until(page, () => window.__WRITES.length > 0);
    is(await nth(page, '.bd-bar-n'), 0,
      'saving that worker on their own record takes them off the draft');
    is(await one(page, '#bd-save', (e) => e.disabled), true, 'so Save has nothing left to write');
    await page.close();

    /* ══ 8. A REFUSED WRITE STAYS ON THE BOARD ═══════════════════════
       Reporting success over a board that only agrees with itself is the
       one outcome worth avoiding. */
    console.log('\n-- 8. a refused move stays waiting --');
    page = await open(browser, port, {});
    await page.evaluate(() => { window.__FAIL_IDS = [2]; });
    await call(page, 'boardEdit');
    await drag(page, 'Ahmad Bin Ali', 'BNN', 'FC');          // id 1 — goes
    await drag(page, 'Muhamad Fauzan', 'UNN1', 'Workers');   // id 2 — refused
    is(await count(page), '2', 'two moves held');
    await page.evaluate(() => { window.__ALERTS = []; });
    await call(page, 'boardSave');
    await until(page, () => window.__ALERTS.length > 0);
    is(await count(page), '1',
      'the one that went comes off the draft and the refused one stays');
    is(await btns(page), ['Cancel', 'Save'], 'so the board is still unlocked, with Save still live');
    is((await placed(page))['Muhamad Fauzan'], 'UNN1|Workers',
      'and the refused name is still in the box it was dropped in, ready to be saved again');
    const said = await page.evaluate(() => window.__ALERTS.join('\n'));
    is(/Saved 1 of 2/.test(said), true, 'the count is what came BACK, not what was sent');
    is(/Muhamad Fauzan/.test(said), true, 'and the refusal names the person');
    await page.close();

    /* ══ 9. SOMEBODY WHO MAY NOT WRITE IS OFFERED NO EDIT ════════════
       A button that refuses the press is worse than no button, because it
       looks like a door. */
    console.log('\n-- 9. a plain user --');
    page = await open(browser, port, { manage: false });
    is(await btns(page), [], 'no Edit for somebody who may not move a worker');
    is(await page.$$eval('#worker-board .wchip[draggable="true"]', (e) => e.length), 0, 'and nothing draggable');
    is(/Last updated/.test(await strip(page)), true,
      'but they still see when the register was last touched — that is a reading');
    await call(page, 'boardEdit');
    is(await btns(page), [], 'and boardEdit from outside does not unlock it either');
    await page.close();

  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n' + (fails ? fails + ' check(s) FAILED' : 'all good') + '  (' + passes + ' ok)');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
