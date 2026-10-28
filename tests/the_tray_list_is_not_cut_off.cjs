/* THE TRAY LIST IS NOT CUT OFF BY THE FOOT OF THE WINDOW.

   The office opened Source Tray on a draft card near the bottom of the
   screen and said 看不到full -- they could see four trays of thirteen and
   nothing would bring the rest up.

   It is the shared select skin, and the shape of it is worth keeping. The
   menu is `position:absolute` under its button, and this page scrolls
   inside `.modal-backdrop`, which is `position:fixed; inset:0`. So a menu
   that reaches past the foot of the window is CUT there -- and scrolling
   cannot rescue it, because scrolling moves the button by exactly the same
   amount and the menu rides with it. At the end of the document it cannot
   move at all. A flat `max-height:260px` was never going to help: the cut
   is below the window, not inside the menu.

   So `placeMenu()` measures the room on open -- the window narrowed by
   every ancestor that clips -- opens UPWARDS where there is more room
   above, and re-measures while the menu is open, because a scroll moves
   the button under it.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_tray_list_is_not_cut_off.cjs
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
    /* EVERY WRITE IS RECORDED. A stub that takes an insert and says nothing
       signs off whatever the page sent it -- and the check below that nothing
       was written would have passed over a page writing on every load. */
    b._settle = function () {
      var rows = b._rows();
      if (b._deleted) (window.__DELETED = window.__DELETED || []).push({ table: table, eq: b._eq, n: rows.length });
      if (b._patch) {
        (window.__UPDATED = window.__UPDATED || []).push({ table: table, eq: b._eq, patch: b._patch });
        /* AND IT IS APPLIED. A stub that records an update and leaves the row
           as it was cannot show what the screen does after one -- a census
           removed would redraw exactly as it did before, and the check would
           pass on a page that changed nothing. */
        rows.forEach(function (r) { for (var k in b._patch) r[k] = b._patch[k]; });
      }
      return { data: b._one ? (rows[0] || null) : rows, error: null, count: rows.length };
    };
    b.then = function (r, j) { return Promise.resolve(b._settle()).then(r, j); };
    b.catch = function (f) { return Promise.resolve(b._settle()).catch(f); };
    b.finally = function (f) { return Promise.resolve(b._settle()).finally(f); };
    b.insert = function (rows) {
      (window.__INSERTED = window.__INSERTED || []).push.apply(window.__INSERTED, [].concat(rows));
      return Promise.resolve({ data: null, error: null });
    };
    b.update = function (p) { b._patch = p; return b; };
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


/* Batch 280 with ONE existing record already in the ledger, so both halves of
   the census rule are on one screen: the record that already exists and is
   owed nothing, and the one being keyed now, which is. B07 carries its drone
   map on the TRAY row, the way every record keyed before the cards does. */
const ROWS = {
  shared_inventory_logs: [
    { id: 1, batch_name: '280', transaction_type: 'Seeds_Received', quantity_change: 12000,
      breed_name: 'AA HYBRIDA 1S', transaction_date: '2026-06-01', created_at: '2026-06-01T00:00:00Z',
      plot_name: null, remark: 'Seeds received. Supplier: AAR. DO_Qty: 12000. Incl. 0% FOC.' },
    { id: 2, batch_name: '280', transaction_type: 'Transplanted', plot_name: 'B07',
      quantity_change: 900, transaction_date: '2026-10-11', created_at: '2026-10-11T01:00:00Z',
      remark: 'Transplanted from tray [P2] to Main Plot [B07]. Date: 2026-10-11 MapUrl:https://x/b07.jpg' }
  ],
  /* THE DROPDOWNS COME FROM SETTINGS, so Settings has to be in the fixture.
     With no `shared_plots` every plot box reads "No plots found", every row
     the form builds is invalid, and the save refuses for want of a ROW --
     which looks exactly like it refusing for want of a census. U03 and U04
     are deliberately plots the ledger has nothing on, so a record keyed here
     cannot be mistaken for one of the two already in it.

     AND THE LEDGER OWN PLOTS HAVE TO BE IN IT TOO. The form restores every
     existing record into a hidden row, and that row holds its plot in a
     SELECT -- so a plot Settings has never heard of cannot be restored, the
     save drops the record, and the page says so in a dialog about losing
     rows. B07 and N15 are here for that reason and not because the test
     needs them in a dropdown. */
  shared_plots: [
    { plot_name: 'B07', nursery_name: 'BNN' },
    { plot_name: 'N15', nursery_name: 'UNN 1' },
    { plot_name: 'U03', nursery_name: 'UNN 2' },
    { plot_name: 'U04', nursery_name: 'UNN 2' }
  ],
  operation_trays: [], shared_do_records: [], operation_batch_verifications: [], nelos_cases: []
};

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue  = (name, got) => check(name, !!got, true);
const checkFalse = (name, got) => check(name, !!got, false);

/* A one-pixel PNG and a one-page PDF. The census takes a photo OR a pdf —
   census 部分也可以 upload pdf — and a test with only images cannot tell. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('JVBERi0xLjQKJcOkw7zDtsOfCjEgMCBvYmoKPDwvVHlwZS9DYXRhbG9nPj4KZW5kb2JqCg==', 'base64');
const CENSUS_PNG = { name: 'census-N15.png', mimeType: 'image/png', buffer: PNG };
const CENSUS_PDF = { name: 'census-N15.pdf', mimeType: 'application/pdf', buffer: PDF };

/* THE CARD IS DRIVEN THROUGH ITS OWN CONTROLS, never through its state.
   `transplantDraftCount` and `t3DraftCensus` are `let`/`const` at script
   scope, so they are deliberately NOT on `window` — the same thing
   `seedAuditPhotoState` is, and for the same reason. So the draft number is
   read off the card's own id and the census goes in through the real file
   picker, which also means the real reader runs. */
const liveDraft = (page) => page.evaluate(() => {
  const cards = document.querySelectorAll('#transplant-rows-container .t3-draft-card');
  const last = cards[cards.length - 1];
  const m = last && String(last.id || '').match(/transplant-draft-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
});

/* Fill a draft card's head and its tray lines with whatever the page's own
   dropdowns actually offer, so the test cannot pin a plot or a tray name that
   Settings does not have. */
const fillDraft = (page, n, dateISO, qtys) => page.evaluate(({ n, dateISO, qtys }) => {
  const head = document.getElementById(`transplant-draft-${n}-head`);
  head.querySelector('.t3-date').value = dateISO;
  const plotSel = head.querySelector('.t3-dest-plot');
  const plots = Array.from(plotSel.options).map(o => o.value).filter(Boolean);
  // U03 on purpose: a plot the ledger has nothing on, so a record keyed here
  // cannot be confused with one of the two already in it.
  plotSel.value = plots.indexOf('U03') >= 0 ? 'U03' : (plots[0] || '');
  window._t3SyncDraft(n);
  const rows = Array.from(document.querySelectorAll(`#transplant-draft-${n}-trays .transplant-row`));
  rows.forEach((r, k) => {
    const t = r.querySelector('select.t3-source-tray');
    const opts = Array.from(t.options).map(o => o.value).filter(Boolean);
    if (opts.length) t.value = opts[Math.min(k, opts.length - 1)];
    r.querySelector('input.t3-qty').value = String(qtys[k] || 0);
  });
  window._t3DraftTotal(n);
  window.calcTransplanting();
  return plotSel.value;
}, { n, dateISO, qtys });

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 } });
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
    window.__INSERTED = []; window.__UPLOADS = []; window.__TOASTS = [];
    try { localStorage.clear(); } catch (e) {}
  }, { uid: UID, rows: ROWS });

  await page.goto(`http://localhost:${port}/operation/operation_batch_detail.html?id=280`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.saveTransplantTab === 'function', { timeout: 20000 });
  await page.waitForTimeout(5000);

  /* The storage upload and the toast are the two things this rule is made of,
     so they are watched rather than stubbed away: a census that was never
     uploaded and a refusal that was never said both have to be visible. The
     upload answers with a url the way the real bucket does. */
  await page.evaluate(() => {
    window.showToast = (m, t) => { window.__TOASTS.push({ m: String(m), t: t || 'success' }); };
    window._uploadBatchDoc = async (folder, batch, label, dataUrl) => {
      /* A URL IS HANDED BACK UNCHANGED AND IS NOT AN UPLOAD -- which is what
         the real one does on its second line, and it matters here: a save
         re-sends the drone map of every existing row, already a storage url,
         so a stub that re-uploaded it would count three uploads for two
         census files and hand B07 a map it never had. */
      if (/^https?:\/\//i.test(String(dataUrl))) return String(dataUrl);
      window.__UPLOADS.push({ folder, batch, label, pdf: /^data:application\/pdf/.test(String(dataUrl)) });
      if (window.__UPLOAD_FAILS) return null;
      return `https://store/${folder}/${batch}/${label}.${/^data:application\/pdf/.test(String(dataUrl)) ? 'pdf' : 'jpg'}`;
    };
    window.confirm = () => true;
  });

  console.log('\nThe page came up');
  check('no page error', errs.filter(e => !/MJMReview/.test(e)), []);

  /* Thirteen trays is the office's own screen: DOUBLE-TONE and twelve
     pre-nursery trays. The fixture batch has three, so the select is
     filled directly -- the skin rebuilds its menu off the <option>s
     through its own observer, which is the path every tray picker on this
     page already uses (`select.innerHTML = getTrayOptionsHTML()`). */
  const TRAYS = ['DOUBLE-TONE', 'P16 [Remaining: 2,560]', 'P17 [Remaining: 2,560]',
                 'P24 [Remaining: 240]', 'P25 [Remaining: 2,558]', 'P26 [Remaining: 1,100]',
                 'P27 [Remaining: 900]', 'P28 [Remaining: 870]', 'P29 [Remaining: 640]',
                 'P30 [Remaining: 310]', 'P31 [Remaining: 120]', 'P32 [Remaining: 80]'];

  const wrapOf = `
    document.querySelector('.t3-draft-card select.t3-source-tray').closest('.cf-wrap')`;

  await page.evaluate(async (trays) => {
    switchTab(3);
    await new Promise(r => setTimeout(r, 1500));
    document.querySelectorAll('#transplant-rows-container .t3-draft-card').forEach(el => el.remove());
    window.addTransplantRow();
    await new Promise(r => setTimeout(r, 400));
    const cards = document.querySelectorAll('#transplant-rows-container .t3-draft-card');
    const n = String(cards[cards.length - 1].id).match(/transplant-draft-(\d+)$/)[1];
    window.addTransplantTray(Number(n));
    await new Promise(r => setTimeout(r, 400));
    const sel = document.querySelector('.t3-draft-card select.t3-source-tray');
    sel.innerHTML = '<option value="">Select Tray...</option>'
      + trays.map(t => `<option value="${t}">${t}</option>`).join('');
  }, TRAYS);
  await page.waitForTimeout(500);

  const ready = await page.evaluate(() => {
    const sel = document.querySelector('.t3-draft-card select.t3-source-tray');
    return !!(sel && sel.closest('.cf-wrap') && sel.options.length === 13);
  });
  checkTrue('a draft card with a tray row and thirteen trays on it', ready);
  if (!ready) { await browser.close(); server.close();
                console.log('\n' + pass + ' passed, ' + (fail) + ' failed'); process.exit(1); }

  /* Put the button where the office had it: near the foot of the window,
     with the page scrolled as far as it will go under it. */
  const place = async (fromFoot) => {
    await page.evaluate((f) => {
      const wrap = document.querySelector('.t3-draft-card select.t3-source-tray').closest('.cf-wrap');
      const back = document.querySelector('.modal-backdrop');
      back.scrollTop += (wrap.getBoundingClientRect().top - (window.innerHeight - f));
    }, fromFoot);
    await page.waitForTimeout(250);
  };
  const openMenu = async () => {
    await page.evaluate(() => {
      const wrap = document.querySelector('.t3-draft-card select.t3-source-tray').closest('.cf-wrap');
      const menu = wrap.querySelector('.cf-menu');
      if (!menu.classList.contains('hidden')) wrap.querySelector('.cf-btn').click();
      wrap.querySelector('.cf-btn').click();
    });
    await page.waitForTimeout(300);
  };
  const read = () => page.evaluate(() => {
    const wrap = document.querySelector('.t3-draft-card select.t3-source-tray').closest('.cf-wrap');
    const menu = wrap.querySelector('.cf-menu');
    const b = wrap.querySelector('.cf-btn').getBoundingClientRect();
    const r = menu.getBoundingClientRect();
    return {
      up: menu.classList.contains('cf-up'),
      open: !menu.classList.contains('hidden'),
      top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
      scrollH: menu.scrollHeight, clientH: menu.clientHeight,
      btnTop: Math.round(b.top), btnBottom: Math.round(b.bottom),
      vh: window.innerHeight
    };
  });

  console.log('\n── 1 · A ROW AT THE FOOT OF THE WINDOW OPENS UPWARDS ──');
  await place(180);
  await openMenu();
  const low = await read();
  checkTrue('the menu is open', low.open);
  checkTrue('it opened UPWARDS, which is the only room there is', low.up);
  checkTrue('nothing of it is below the foot of the window', low.bottom <= low.vh);
  checkTrue('…nor above the top of it', low.top >= 0);
  checkTrue('it sits above the button, not over it', low.bottom <= low.btnTop);
  /* The whole point: with the room used, all thirteen fit. */
  check('every tray is on screen — nothing is scrolled out of reach',
        low.clientH >= low.scrollH, true);

  console.log('\n── 2 · AND THE PREVIOUS VERSION CUT IT OFF ──');
  /* Driven directly rather than described: a flat 260px absolute menu
     under the same button, which is what the stylesheet alone gives. */
  const old = await page.evaluate(() => {
    const wrap = document.querySelector('.t3-draft-card select.t3-source-tray').closest('.cf-wrap');
    const menu = wrap.querySelector('.cf-menu');
    const was = { up: menu.classList.contains('cf-up'), mh: menu.style.maxHeight };
    menu.classList.remove('cf-up');
    menu.style.maxHeight = '260px';
    const r = menu.getBoundingClientRect();
    const out = { bottom: Math.round(r.bottom), vh: window.innerHeight,
                  clientH: menu.clientHeight, scrollH: menu.scrollHeight };
    menu.classList.toggle('cf-up', was.up);
    menu.style.maxHeight = was.mh;
    return out;
  });
  checkTrue('the old menu hangs below the foot of the window', old.bottom > old.vh);
  checkTrue('…and most of the list is out of reach', old.scrollH > old.clientH);

  console.log('\n── 3 · WITH ROOM UNDER IT, IT STILL OPENS DOWNWARDS ──');
  await place(900);
  await openMenu();
  const high = await read();
  checkTrue('the menu is open', high.open);
  check('it opens downwards', high.up, false);
  checkTrue('it hangs under the button', high.top >= high.btnBottom);
  checkTrue('and still inside the window', high.bottom <= high.vh);

  console.log('\n── 4 · A SCROLL WHILE IT IS OPEN RE-MEASURES IT ──');
  /* The menu moves with its button, so a height worked out once goes
     stale the moment anybody scrolls -- and goes stale in the one
     direction that puts it back off the foot of the window. */
  const before = await read();
  /* Back UP the page, by enough to matter and not so far that the button
     leaves the screen -- which is a different rule, in section 5. */
  await page.evaluate(() => {
    const wrap = document.querySelector('.t3-draft-card select.t3-source-tray').closest('.cf-wrap');
    const back = document.querySelector('.modal-backdrop');
    back.scrollTop -= Math.min(back.scrollTop,
      (window.innerHeight - 260) - wrap.getBoundingClientRect().top);
  });
  await page.waitForTimeout(350);
  const after = await read();
  checkTrue('it is still open', after.open);
  checkTrue('it moved with the button', after.btnTop !== before.btnTop);
  checkTrue('the button is still on screen', after.btnTop >= 0 && after.btnBottom <= after.vh);
  checkTrue('and the menu is STILL inside the window',
            after.bottom <= after.vh && after.top >= 0);

  console.log('\n\u2500\u2500 5 \u00b7 AND A BUTTON SCROLLED OUT OF SIGHT CLOSES IT \u2500\u2500');
  /* The menu is anchored to its button, so a button scrolled off the
     screen leaves the menu hanging where the button now is -- off the
     screen, or over a part of the page with nothing saying what it
     belongs to. */
  /* To the TOP of the page: the card is near the end of a long tab, so
     scrolling further down is clamped and moves nothing. */
  await page.evaluate(() => { document.querySelector('.modal-backdrop').scrollTop = 0; });
  await page.waitForTimeout(350);
  const gone = await read();
  checkTrue('the button has left the window', gone.btnTop > gone.vh || gone.btnBottom < 0);
  check('…and the menu closed with it', gone.open, false);

  console.log('\n── 6 · THE RULE LIVES IN THE ONE SHARED FILE ──');
  const skin = fs.readFileSync(path.join(ROOT, 'shared', 'shared_cf_select.js'), 'utf8');
  checkTrue('placeMenu is in the skin', /function placeMenu\(/.test(skin));
  checkTrue('it measures every ancestor that clips, not only the window',
            /function clipBand\(/.test(skin) && /overflowY !== 'visible'/.test(skin));
  checkTrue('it is re-measured on scroll, captured so an inner scroller counts',
            /addEventListener\('scroll',[\s\S]{0,80}placeMenu\(openWrap\)[\s\S]{0,20}, true\)/.test(skin));
  /* The 260 stays as the fallback for a menu drawn before any of this
     runs, so it is NOT an escaped copy of the rule. */
  checkTrue('the stylesheet keeps 260px as a fallback', /max-height:260px/.test(skin));
  /* And the max-height has to mean what it says whether or not the page
     loaded Tailwind's preflight, which is the only thing otherwise
     setting box-sizing on it. */
  checkTrue('the menu sizes border-box of its own accord', /\.cf-menu\{[^}]*box-sizing:border-box/.test(skin));
  /* The upward form is the skin's own and nothing else declares it -- a
     page that grew a second `.cf-up` would be the thinner-copy fault this
     codebase is full of. Pages with their OWN pre-built cf-* widget are
     left alone deliberately (the skin's comment names one), so this asks
     about the new class and not about `.cf-menu` in general. */
  check('cf-up is declared in exactly one file',
        require('child_process').execSync(
          "grep -rl 'cf-up' --include=*.html --include=*.js --include=*.css " + ROOT
          + " | grep -v '^" + ROOT + "/tests/' | wc -l", { encoding: 'utf8' }).trim(), '1');

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
