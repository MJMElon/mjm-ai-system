/* ADD RECORD ASKS THE PLOT ONCE, AND IT ASKS FOR THE CENSUS.

   The form was one flat row per tray, each with its own date, its own
   destination and its own drone map. The office asked for it to match the
   record the saved list now draws: *"当我按 add record 我可以选 plot 填日期，
   接下来如果还是同个 plot 同个日期我就可以在那一条记录下单独 add tray add
   quantity，然后最后的 column 可以有一个总 transplant quantity."*

   TWO PEOPLE, AND THE FORM IS ONE OF THEM. *"我们有两个人负责这一部分，一个
   负责填所有资料，一个负责算 drone count，和 system tally 了 upload 图并且
   verify."* So the form has NO drone count and NO drone map on it — those are
   the checker's, on the saved card — and it has the CENSUS, which is the
   recorder's: *"填资料的人在 part 1 要 upload census."*

   AND THE CENSUS IS COMPULSORY, for what is keyed from now on and nothing
   else. *"c 一定要有才可以 save"*, *"只是没 census 的话按 save 会 pop out 不能
   save 因为没 census"*, and the scope in their own words: *"以前的批次我只要
   format 改，census 不需要加，但是如果以前的批次现在又 add record，这时候就需要
   census"* — 包括 271 N15. So the test is not a date and not a batch: it is
   whether the tray line sits inside a DRAFT CARD. A line a sync rebuilt from
   the ledger is in no card and is owed nothing.

   WHAT MUST NOT MOVE is the bar the office set for the whole change:
   *"完全不要影响其他 link 者的东西如何去 read data."* A tray line is still
   `.action-row.transplant-row` carrying `.t3-date`, `.t3-dest-type`,
   `.t3-dest-plot`, `.t3-source-tray` and `.t3-qty`, so the save, the
   allocation engine, the over-draw check and the silent rows a sync rebuilds
   all read exactly what they always read. Section 3 asserts that directly.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/add_record_asks_for_the_census.cjs
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

  console.log('\n── 1 · ADD RECORD IS A CARD, AND IT ASKS THE PLOT ONCE ──');
  await page.evaluate(() => {
    document.querySelectorAll('#transplant-rows-container .t3-draft-card').forEach(el => el.remove());
    window.addTransplantRow();
  });
  await page.waitForTimeout(300);
  const N = await liveDraft(page);
  /* ON THE PREVIOUS CODE THERE IS NO CARD AT ALL, and a test that then throws
     on a null id reports a stack instead of a finding. It says what is
     missing and stops. */
  if (N === null) {
    check('Add Record opens a CARD — on the previous code it opened a flat row, so there is none',
          'no .t3-draft-card in the form', 'one draft card');
    await browser.close(); server.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(1);
  }
  const shape = await page.evaluate((n) => {
    const card = document.getElementById(`transplant-draft-${n}`);
    const head = document.getElementById(`transplant-draft-${n}-head`);
    const pick = card && card.querySelector('input[type=file][id$="-censuspick"]');
    return {
      cards: document.querySelectorAll('#transplant-rows-container .t3-draft-card').length,
      headDate: !!(head && head.querySelector('.t3-date')),
      headType: !!(head && head.querySelector('.t3-dest-type')),
      headPlot: !!(head && head.querySelector('.t3-dest-plot')),
      census:   !!pick,
      multiple: !!(pick && pick.multiple),
      accept:   pick ? pick.accept : '',
      trays:    card ? card.querySelectorAll('.transplant-row').length : 0
    };
  }, N);
  check('one card', shape.cards, 1);
  check('…asking the date, the category and the plot ONCE, in its head',
        [shape.headDate, shape.headType, shape.headPlot], [true, true, true]);
  checkTrue('…with a census box on it', shape.census);
  checkTrue('…which takes more than one file', shape.multiple);
  checkTrue('…a photo OR a pdf', /image/.test(shape.accept) && /pdf/.test(shape.accept));
  check('…and it opens with one tray line, so the card asks something', shape.trays, 1);

  console.log('\nThe form has NO drone count and NO drone map on it');
  const noChecker = await page.evaluate((n) => {
    const card = document.getElementById(`transplant-draft-${n}`);
    return {
      drone: /drone/.test((card.textContent || '').toLowerCase()),
      files: card.querySelectorAll('input[type=file]').length,
      census: card.querySelectorAll('input[type=file][id$="-censuspick"]').length
    };
  }, N);
  checkFalse('the word drone is nowhere on the form', noChecker.drone);
  check('…and the only file it asks for is the census', [noChecker.files, noChecker.census], [1, 1]);

  console.log('\n── 2 · ADD TRAY PUTS A LINE UNDER THE SAME RECORD ──');
  await page.evaluate((n) => window.addTransplantTray(n), N);
  await page.waitForTimeout(200);
  const PLOT = await fillDraft(page, N, '2026-10-20', [680, 377]);
  const two = await page.evaluate((n) => {
    const card = document.getElementById(`transplant-draft-${n}`);
    const rows = Array.from(card.querySelectorAll('.transplant-row'));
    return {
      cards: document.querySelectorAll('#transplant-rows-container .t3-draft-card').length,
      rows: rows.length,
      // Every reader of this form asks a ROW for these three.
      mirrored: rows.map(r => [
        (r.querySelector('.t3-date') || {}).value,
        (r.querySelector('.t3-dest-type') || {}).value,
        (r.querySelector('.t3-dest-plot') || {}).value
      ]),
      ownTray: rows.every(r => !!r.querySelector('select.t3-source-tray')),
      ownQty:  rows.every(r => !!r.querySelector('input.t3-qty')),
      total: (document.getElementById(`transplant-draft-${n}-total`) || {}).innerText
    };
  }, N);
  check('still ONE record, not two', two.cards, 1);
  check('…with two tray lines under it', two.rows, 2);
  checkTrue('…and the head is mirrored onto BOTH, which is what every reader asks a row for',
            two.rows === 2 && JSON.stringify(two.mirrored[0]) === JSON.stringify(two.mirrored[1])
            && two.mirrored[0][0] === '2026-10-20' && two.mirrored[0][1] === 'main' && !!two.mirrored[0][2]);
  checkTrue('…while the tray and the quantity are each line own', two.ownTray && two.ownQty);

  console.log('\nThe running total is the figure the checker will compare');
  check('680 + 377, said on the card as it is keyed', two.total, '1,057');

  console.log('\n── 3 · NO CENSUS, NO SAVE ──');
  await page.evaluate(() => { window.__TOASTS = []; window.__INSERTED = []; window.__DELETED = []; window.__UPLOADS = []; });
  await page.evaluate(async () => { await window.saveTransplantTab(); });
  await page.waitForTimeout(600);
  const refused = await page.evaluate(() => ({
    toasts: window.__TOASTS,
    rows: (window.__INSERTED || []).filter(r => r && /^Transplanted/.test(String(r.transaction_type || ''))).length,
    cards: (window.__INSERTED || []).filter(r => r && r.transaction_type === 'Transplant_Card').length,
    deleted: (window.__DELETED || []).filter(d => d.table === 'shared_inventory_logs').length,
    uploads: (window.__UPLOADS || []).length,
    btn: (document.getElementById('save-transplant-btn') || {}).disabled
  }));
  checkTrue('it says no census, and says WHICH record',
            refused.toasts.some(t => t.t === 'error' && /no census/i.test(t.m)));
  check('…and NOTHING is written — not a row, not a card, not even the delete',
        [refused.rows, refused.cards, refused.deleted], [0, 0, 0]);
  check('…nor is a census uploaded for a save that refused', refused.uploads, 0);
  checkFalse('…and the button comes back, so it can be pressed again', refused.btn);
  check('…and it says nothing else — no explaining line, just the refusal', refused.toasts.length, 1);

  console.log('\n── 4 · WITH A CENSUS IT SAVES, AND THE CENSUS GOES WITH IT ──');
  await page.evaluate(() => { window.__TOASTS = []; window.__INSERTED = []; window.__DELETED = []; window.__UPLOADS = []; });
  await page.setInputFiles(`#transplant-draft-${N}-censuspick`, [CENSUS_PNG, CENSUS_PDF]);
  await page.waitForTimeout(400);
  check('both files are on the card, each one named',
        await page.evaluate((n) => Array.from(
          document.querySelectorAll(`#transplant-draft-${n}-censuslist .t3-draft-census`))
          .map(el => el.textContent.replace(/[✕\s]+/g, ' ').trim()), N),
        ['census-N15.png', '\ud83d\udcc4 census-N15.pdf']);
  await page.evaluate(async () => { await window.saveTransplantTab(); });
  await page.waitForTimeout(1500);
  const saved = await page.evaluate(() => ({
    toasts: window.__TOASTS,
    rows: (window.__INSERTED || []).filter(r => r && r.transaction_type === 'Transplanted')
            .map(r => ({ plot: r.plot_name, qty: r.quantity_change, remark: String(r.remark || '') })),
    cards: (window.__INSERTED || []).filter(r => r && r.transaction_type === 'Transplant_Card')
            .map(r => ({ plot: r.plot_name, day: r.transaction_date, remark: String(r.remark || '') })),
    uploads: window.__UPLOADS
  }));
  check('the two tray rows went in, under one plot and one day',
        saved.rows.filter(r => r.plot === PLOT).map(r => r.qty).sort((a, b) => a - b), [377, 680]);
  checkTrue('…and the EXISTING B07 record went back in with its map, untouched',
            saved.rows.some(r => r.plot === 'B07' && r.qty === 900 && /MapUrl:https:\/\/x\/b07\.jpg/.test(r.remark)));
  check('both census files were uploaded', saved.uploads.length, 2);
  checkTrue('…one of them a pdf, which is what 可以 upload pdf asked for',
            saved.uploads.some(u => u.pdf));
  checkTrue('…into a folder of its own, not among the drone maps',
            saved.uploads.every(u => u.folder === 'transplant_census'));
  check('ONE card row carries them, for that plot on that day', saved.cards.length, 1);
  checkTrue('…and it is the plot and the day keyed on the form',
            saved.cards[0] && saved.cards[0].plot === PLOT && saved.cards[0].day === '2026-10-20');
  checkTrue('…with both files in the list, by name',
            saved.cards[0] && /CensusList:/.test(saved.cards[0].remark)
            && /census-N15\.png/.test(decodeURIComponent(saved.cards[0].remark))
            && /census-N15\.pdf/.test(decodeURIComponent(saved.cards[0].remark)));
  checkTrue('…and the card claims no drone count nobody has keyed',
            saved.cards[0] && !/DroneQty:/.test(saved.cards[0].remark));
  checkTrue('the save says it saved', saved.toasts.some(t => t.t === 'success' && /saved/i.test(t.m)));
  checkFalse('…and nothing says error over a report that is in the database',
             saved.toasts.some(t => t.t === 'error'));

  console.log('\n── 5 · A RECORD THAT ALREADY EXISTS IS OWED NOTHING ──');
  /* No draft card at all — just the hidden rows a sync rebuilt from the
     ledger. 以前填的就不需要, and that has to include a record nobody has
     verified: the test is the CARD, never a date and never a batch. */
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.__TOASTS = []; window.__INSERTED = []; window.__UPLOADS = [];
    document.querySelectorAll('#transplant-rows-container .t3-draft-card').forEach(el => el.remove());
  });
  const silent = await page.evaluate(() => ({
    drafts: document.querySelectorAll('#transplant-rows-container .t3-draft-card').length,
    rows: document.querySelectorAll('.action-row.transplant-row').length
  }));
  check('no draft card on screen', silent.drafts, 0);
  checkTrue('…but the ledger own rows are still in the form', silent.rows > 0);
  await page.evaluate(async () => { await window.saveTransplantTab(); });
  await page.waitForTimeout(1000);
  const resave = await page.evaluate(() => ({
    toasts: window.__TOASTS,
    rows: (window.__INSERTED || []).filter(r => r && /^Transplanted/.test(String(r.transaction_type || ''))).length,
    uploads: (window.__UPLOADS || []).length
  }));
  checkFalse('saving them again is NOT refused for want of a census',
             resave.toasts.some(t => t.t === 'error' && /census/i.test(t.m)));
  checkTrue('…and they went back in', resave.rows > 0);
  check('…with no census uploaded, because none was asked for', resave.uploads, 0);

  console.log('\n── 6 · THE CENSUS FLOATS OFF THE TOTAL, FOR THE CHECKER ──');
  /* Keyed straight into the ledger the way the save above leaves it, so the
     card is drawn from a STORED row and not from anything on screen. */
  await page.evaluate(() => {
    const enc = encodeURIComponent;
    window.__ROWS.shared_inventory_logs.push({
      id: 901, batch_name: '280', transaction_type: 'Transplanted', plot_name: 'N15',
      quantity_change: 1057, transaction_date: '2026-10-20', created_at: '2026-10-20T01:00:00Z',
      remark: 'Transplanted from tray [P24] to Main Plot [N15]. Date: 2026-10-20'
    });
    window.__ROWS.shared_inventory_logs.push({
      id: 902, batch_name: '280', transaction_type: 'Transplant_Card', plot_name: 'N15',
      quantity_change: 0, transaction_date: '2026-10-20', created_at: '2026-10-20T02:00:00Z',
      /* TWO files, because that is the screen the office sent back: a page
         attached twice, with no way to take one of them off. */
      remark: 'Transplant card. Date: 2026-10-20 CensusList:'
            + [enc('https://store/transplant_census/280/N15-0.jpg'), enc('census-N15.png'), enc('')].join('|')
            + ';' + [enc('https://store/transplant_census/280/N15-1.pdf'), enc('census-N15.pdf'), enc('')].join('|')
    });
  });
  await page.evaluate(async () => { await window.syncOnce(3, window.syncTab3); });
  await page.waitForTimeout(1500);
  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('#t3-saved-rows-list .t3-saved-row')).map(el => {
    const btn = el.querySelector('.t3-cardtotal-btn');
    const pop = el.querySelector('[id^="t3-census-pop-"]');
    return {
      key: el.dataset.reviewKey,
      total: btn ? btn.textContent.trim() : null,
      dotted: btn ? /dotted/.test(btn.getAttribute('style') || '') : null,
      popHidden: pop ? pop.classList.contains('hidden') : null,
      files: pop ? pop.querySelectorAll('.t3-census-file').length : 0,
      addCensus: pop ? /Add Census/i.test(pop.textContent || '') : false,
      i: Number(((btn && btn.id) || '').replace('t3-cardtotal-', ''))
    };
  }));
  const n15 = cards.find(c => c.key === 'N15|2026-10-20');
  const b07 = cards.find(c => c.key === 'B07|2026-10-11');
  checkTrue('the card with a census is there', !!n15);
  check('…its total is the figure', n15 && n15.total, '1,057');
  checkTrue('…dotted, because a total with paper behind it has to say so', n15 && n15.dotted);
  check('…and the panel lists BOTH census files', n15 && n15.files, 2);
  checkTrue('…closed until somebody asks', n15 && n15.popHidden);

  await page.evaluate(i => window._t3CensusPop(i, true), n15.i);
  checkFalse('hovering the total floats it',
             await page.evaluate(i => document.getElementById('t3-census-pop-' + i).classList.contains('hidden'), n15.i));
  await page.evaluate(i => window._t3CensusPop(i, false), n15.i);
  checkTrue('…and it goes away again',
            await page.evaluate(i => document.getElementById('t3-census-pop-' + i).classList.contains('hidden'), n15.i));
  await page.evaluate(i => { window._t3CensusPop(i, 'toggle'); window._t3CensusPop(i, false); }, n15.i);
  checkFalse('a PRESS pins it open, so the files inside can be reached',
             await page.evaluate(i => document.getElementById('t3-census-pop-' + i).classList.contains('hidden'), n15.i));

  console.log('\nA card from before the rule says so, and offers the way to attach one');
  checkTrue('B07 is on the list', !!b07);
  check('…its total is not dotted, because there is nothing behind it', b07 && b07.dotted, false);
  checkTrue('…and its panel offers Add Census', b07 && b07.addCensus);
  checkTrue('…which picks more than one file, photo or pdf',
            await page.evaluate(i => {
              const inp = document.getElementById('t3-cardcensus-' + i);
              return !!inp && inp.multiple && /image/.test(inp.accept) && /pdf/.test(inp.accept);
            }, b07.i));

  console.log('\nAdd Census on a card that has none writes it, and nothing else');
  await page.evaluate(() => { window.__TOASTS = []; window.__INSERTED = []; window.__UPDATED = []; window.__UPLOADS = []; });
  await page.setInputFiles(`#t3-cardcensus-${b07.i}`, [{ name: 'b07-census.pdf', mimeType: 'application/pdf', buffer: PDF }]);
  await page.waitForTimeout(1500);
  const added = await page.evaluate(() => ({
    toasts: window.__TOASTS,
    uploads: window.__UPLOADS,
    cards: (window.__INSERTED || []).filter(r => r && r.transaction_type === 'Transplant_Card')
            .map(r => ({ plot: r.plot_name, day: r.transaction_date, remark: String(r.remark || '') })),
    rows: (window.__INSERTED || []).filter(r => r && /^Transplanted/.test(String(r.transaction_type || ''))).length
  }));
  check('one upload, into the census folder', added.uploads.map(u => u.folder), ['transplant_census']);
  check('…and ONE card row for B07 on its own day',
        added.cards.map(c => [c.plot, c.day]), [['B07', '2026-10-11']]);
  checkTrue('…carrying the file by name', added.cards[0] && /b07-census\.pdf/.test(decodeURIComponent(added.cards[0].remark)));
  check('…and not one transplant row was touched', added.rows, 0);
  checkTrue('it says so', added.toasts.some(t => t.t === 'success' && /census attached/i.test(t.m)));

  console.log('\n── 6b · ONE CENSUS COMES OFF WITHOUT TAKING THE REST ──');
  /* The office attached the same page twice and found the panel open-only:
     添加了的 census 无法被删除 要删除全部才重新 upload. Two faults in one
     sentence — no cross on a file, and no Add on a panel that already had
     files, so putting it right meant clearing the record and starting again. */
  const panel = await page.evaluate(i => {
    const pop = document.getElementById('t3-census-pop-' + i);
    return {
      files: pop.querySelectorAll('.t3-census-file').length,
      dels: pop.querySelectorAll('.t3-census-del').length,
      add: pop.querySelectorAll('.t3-census-add').length,
      /* The cross must be a SIBLING: inside the file button, every press
         would remove the census AND open it over the top of the panel. */
      delInsideFile: pop.querySelectorAll('.t3-census-file .t3-census-del').length,
      /* …and it must NOT carry mjm-review-allow, or a signed-off report
         would grey everything on the tab except the one button that
         destroys something. */
      delAllowedWhenLocked: pop.querySelectorAll('.t3-census-del.mjm-review-allow').length
    };
  }, n15.i);
  check('a cross on every file', [panel.files, panel.dels], [2, 2]);
  checkTrue('…and an Add on a panel that already has some', panel.add === 1);
  check('…the cross is beside the file, never inside it', panel.delInsideFile, 0);
  check('…and it is not exempt from the verified-tab lock', panel.delAllowedWhenLocked, 0);

  /* On the previous code the panel is open-only, so there is nothing to press
     and the rest of this section would report a stack instead of a finding. */
  if (!panel.dels) {
    check('a census comes off one file at a time — on the previous code the panel was open-only',
          'no .t3-census-del in the panel', 'a cross on each file');
    await browser.close(); server.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(1);
  }

  console.log('\nCancelling the confirm writes nothing');
  await page.evaluate(() => { window.__TOASTS = []; window.__UPDATED = []; window.confirm = () => false; });
  await page.evaluate(i => document.querySelector('#t3-census-pop-' + i + ' .t3-census-del').click(), n15.i);
  await page.waitForTimeout(700);
  check('no write went out', await page.evaluate(() => (window.__UPDATED || []).length), 0);

  console.log('\nRemoving one leaves the other, on the screen and in the ledger');
  await page.evaluate(() => { window.__TOASTS = []; window.__UPDATED = []; window.__INSERTED = []; window.confirm = () => true; });
  await page.evaluate(i => document.querySelector('#t3-census-pop-' + i + ' .t3-census-del').click(), n15.i);
  await page.waitForTimeout(1500);
  const afterOne = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('#t3-saved-rows-list .t3-saved-row'))
      .find(c => c.dataset.reviewKey === 'N15|2026-10-20');
    const btn = el && el.querySelector('.t3-cardtotal-btn');
    const pop = el && el.querySelector('[id^="t3-census-pop-"]');
    return {
      toasts: window.__TOASTS,
      patch: (window.__UPDATED || []).map(u => String((u.patch || {}).remark || '')),
      rows: (window.__INSERTED || []).filter(r => r && /^Transplanted/.test(String(r.transaction_type || ''))).length,
      files: pop ? pop.querySelectorAll('.t3-census-file').length : null,
      dotted: btn ? /dotted/.test(btn.getAttribute('style') || '') : null,
      i: Number(((btn && btn.id) || '').replace('t3-cardtotal-', ''))
    };
  });
  check('one file left on the panel', afterOne.files, 1);
  checkTrue('…and the total is still dotted, because there is still paper behind it', afterOne.dotted);
  check('…one write, and it is an update on the card row', afterOne.patch.length, 1);
  checkTrue('…whose list keeps the pdf and drops the png',
            afterOne.patch[0] && /census-N15\.pdf/.test(decodeURIComponent(afterOne.patch[0]))
            && !/census-N15\.png/.test(decodeURIComponent(afterOne.patch[0])));
  check('…and not one transplant row was touched', afterOne.rows, 0);
  checkTrue('it says so', afterOne.toasts.some(t => t.t === 'success' && /census removed/i.test(t.m)));

  console.log('\nTaking the LAST one off leaves a card that says it has none');
  await page.evaluate(() => { window.__TOASTS = []; window.__UPDATED = []; });
  await page.evaluate(i => document.querySelector('#t3-census-pop-' + i + ' .t3-census-del').click(), afterOne.i);
  await page.waitForTimeout(1500);
  const afterAll = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('#t3-saved-rows-list .t3-saved-row'))
      .find(c => c.dataset.reviewKey === 'N15|2026-10-20');
    const btn = el && el.querySelector('.t3-cardtotal-btn');
    const pop = el && el.querySelector('[id^="t3-census-pop-"]');
    return {
      patch: (window.__UPDATED || []).map(u => String((u.patch || {}).remark || '')),
      files: pop ? pop.querySelectorAll('.t3-census-file').length : null,
      addCensus: pop ? /Add Census/i.test(pop.textContent || '') : false,
      dotted: btn ? /dotted/.test(btn.getAttribute('style') || '') : null,
      total: btn ? btn.textContent.trim() : null,
      i: Number(((btn && btn.id) || '').replace('t3-cardtotal-', ''))
    };
  });
  check('no files left', afterAll.files, 0);
  checkTrue('…the remark carries no CensusList at all, rather than an empty one',
            afterAll.patch[0] && !/CensusList:/.test(afterAll.patch[0]));
  check('…the total stops being dotted', afterAll.dotted, false);
  check('…and the figure itself did not move', afterAll.total, '1,057');
  checkTrue('…and the card offers Add Census again', afterAll.addCensus);

  console.log('\nA SIGNED-OFF report refuses both, and the stylesheet is not what stops it');
  /* .mjm-locked greys a button and takes its pointer away. It does not stop
     the keyboard and it cannot stop a call, which is what an onclick is. */
  await page.evaluate(() => {
    window.__TOASTS = []; window.__UPDATED = []; window.__INSERTED = []; window.__UPLOADS = [];
    document.getElementById('tab-3').classList.add('mjm-locked');
  });
  await page.evaluate(i => window.removeT3CardCensus(i, 'https://store/transplant_census/280/N15-1.pdf', 'census-N15.pdf'), afterAll.i);
  await page.setInputFiles(`#t3-cardcensus-${afterAll.i}`, [{ name: 'sneaked-in.png', mimeType: 'image/png', buffer: PNG }]);
  await page.waitForTimeout(1200);
  const locked = await page.evaluate(() => ({
    toasts: window.__TOASTS,
    writes: (window.__UPDATED || []).length + (window.__INSERTED || []).length,
    uploads: (window.__UPLOADS || []).length
  }));
  check('neither the remove nor the add wrote anything', [locked.writes, locked.uploads], [0, 0]);
  check('…and both said why, rather than doing nothing',
        locked.toasts.filter(t => t.t === 'error' && /signed off/i.test(t.m)).length, 2);
  await page.evaluate(() => document.getElementById('tab-3').classList.remove('mjm-locked'));

  console.log('\n── 7 · THE DRONE MAP IS THE CARD OWN, AND THE RING KNOWS ──');
  /* The map left the form, so a ring that only ever looked at the ROW would
     sit under 100 for ever on everything keyed since, with the map on screen.
     `updateTransplantCompletion` is driven directly with a balanced
     allocation, because what is under test is the map rule and not the
     arithmetic: N15 has 1,057 on a row with no map of its own, and B07 has
     its map on its tray row from before. */
  await page.evaluate(async () => { await window.syncOnce(3, window.syncTab3); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.updateTransplantCompletion(1957, 1957, 0, false));
  const beforeMap = await page.evaluate(() => (document.getElementById('t3-status-desc') || {}).innerText);
  check('exactly one map is outstanding, and it is N15', beforeMap, 'Attach 1 Drone Map');

  await page.evaluate(() => {
    const r = window.__ROWS.shared_inventory_logs.find(x => x.id === 902);
    r.remark += ' MapUrl:https://store/transplant_maps/280/N15.jpg';
  });
  await page.evaluate(async () => { await window.syncOnce(3, window.syncTab3); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.updateTransplantCompletion(1957, 1957, 0, false));
  check('a map on the CARD answers for its rows',
        await page.evaluate(() => (document.getElementById('t3-status-desc') || {}).innerText), '100% Allocated');
  check('…and the ring fills', await page.evaluate(() => (document.getElementById('t3-percent-text') || {}).innerText), '100%');
  checkTrue('…and the card shows the map it is answering with',
            await page.evaluate(() => {
              const el = Array.from(document.querySelectorAll('#t3-saved-rows-list .t3-saved-row'))
                .find(c => c.dataset.reviewKey === 'N15|2026-10-20');
              return !!el && /N15\.jpg/.test(el.innerHTML);
            }));

  console.log('\n── 8 · A CENSUS THAT WILL NOT UPLOAD IS A WARNING, NEVER AN ERROR ──');
  /* The report is in the database by the time the census goes up. Saying
     error over stored work is what leaves a tab dirty by its own success, and
     the office keys the morning again. */
  await page.evaluate(() => {
    window.__TOASTS = []; window.__INSERTED = []; window.__UPLOAD_FAILS = true;
    document.querySelectorAll('#transplant-rows-container .t3-draft-card').forEach(el => el.remove());
    window.addTransplantRow();
  });
  const N2 = await liveDraft(page);
  await fillDraft(page, N2, '2026-10-21', [120]);
  await page.setInputFiles(`#transplant-draft-${N2}-censuspick`, [{ name: 'census-fails.png', mimeType: 'image/png', buffer: PNG }]);
  await page.waitForTimeout(400);
  await page.evaluate(async () => { await window.saveTransplantTab(); });
  await page.waitForTimeout(1500);
  const warned = await page.evaluate(() => ({
    toasts: window.__TOASTS,
    rows: (window.__INSERTED || []).filter(r => r && r.transaction_type === 'Transplanted' && r.quantity_change === 120).length,
    cards: (window.__INSERTED || []).filter(r => r && r.transaction_type === 'Transplant_Card').length
  }));
  check('the row is saved all the same', warned.rows, 1);
  check('…and no card is written for a census that never reached storage', warned.cards, 0);
  checkTrue('it is a WARNING, and it says the report IS saved',
            warned.toasts.some(t => t.t === 'warn' && /IS saved/i.test(t.m)));
  checkFalse('…never an error, which on this page means it is not in the database',
             warned.toasts.some(t => t.t === 'error'));
  checkTrue('…and it names the door to put it right',
            warned.toasts.some(t => t.t === 'warn' && /Add Census/i.test(t.m)));

  console.log('\n── 9 · THE LAST TRAY OFF A CARD TAKES THE CARD AND ITS CENSUS ──');
  /* A card with no tray asks nothing, and a census left behind would ride onto
     whatever is keyed next and read as that record. */
  await page.evaluate(() => {
    window.__UPLOAD_FAILS = false;
    document.querySelectorAll('#transplant-rows-container .t3-draft-card').forEach(el => el.remove());
    window.addTransplantRow();
  });
  const N3 = await liveDraft(page);
  await page.setInputFiles(`#transplant-draft-${N3}-censuspick`, [{ name: 'orphan.png', mimeType: 'image/png', buffer: PNG }]);
  await page.waitForTimeout(400);
  check('the census is on it', await page.evaluate((n) =>
    document.querySelectorAll(`#transplant-draft-${n}-censuslist .t3-draft-census`).length, N3), 1);
  await page.evaluate((n) => {
    const row = document.querySelector(`#transplant-draft-${n}-trays .transplant-row`);
    window.removeTransplantTray(row.id, n);
  }, N3);
  await page.waitForTimeout(300);
  checkFalse('the card went with its last tray',
             await page.evaluate((n) => !!document.getElementById(`transplant-draft-${n}`), N3));
  /* And the proof the census went with it: a brand-new card refuses to save,
     which it could not do if the old census had been left lying about. */
  await page.evaluate(() => { window.__TOASTS = []; window.__INSERTED = []; window.addTransplantRow(); });
  const N4 = await liveDraft(page);
  await fillDraft(page, N4, '2026-10-22', [55]);
  await page.evaluate(async () => { await window.saveTransplantTab(); });
  await page.waitForTimeout(700);
  checkTrue('…and the next record is asked for its own census, not given the last one',
            await page.evaluate(() => (window.__TOASTS || []).some(t => t.t === 'error' && /no census/i.test(t.m))));

  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
