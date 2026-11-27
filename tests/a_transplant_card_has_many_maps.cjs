/* A TRANSPLANT CARD HAS AS MANY DRONE MAPS AS IT TOOK TO FLY IT, each with
   its own remark. The office, over the Drone Map window on Tab 3: *"transplant
   map 我要可以upload多张 和 写remark"*.

   The card stored ONE map (`MapUrl:`), so a plot flown in two passes had the
   second picture replace the first and nowhere to say which half was which.
   `MapList:` carries them all with tab 6 own codec; `MapUrl:` stays the first
   one, so every reader of the old field (the ring, Life of Plot) still works.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_transplant_card_has_many_maps.cjs
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
      /* INSERTS LAND, so the card the page writes is the card it reads back. */
      [].concat(rows).forEach(function (r, k) {
        var t = (window.__ROWS[table] = window.__ROWS[table] || []);
        t.push(Object.assign({ id: 5000 + t.length + k, created_at: new Date().toISOString() }, r));
      });
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
    // A pre-nursery tray: PREMIUM CARE can only be drawn from once something
    // has been moved into it, which this fixture never does (section 7c).
    const all = Array.from(t.options).map(o => o.value).filter(Boolean);
    const pn = all.filter(v => v !== 'PREMIUM CARE' && v !== 'DOUBLE-TONE');
    // The fixture plants no tray, so the dropdown offers only the two
    // holding trays; the ledger own source tray P2 is offered by hand.
    if (!pn.length) { const o = document.createElement('option'); o.value = o.textContent = 'P2'; t.appendChild(o); pn.push('P2'); }
    const opts = pn;
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

  const cardOf = (key) => page.evaluate(k => {
    const el = Array.from(document.querySelectorAll('#t3-saved-rows-list .t3-saved-row')).find(c => c.dataset.reviewKey === k);
    if (!el) return null;
    const chip = el.querySelector('.t3-cardmap-chip');
    return { i: Number(el.dataset.cardIndex), chip: chip ? chip.textContent.replace(/\s+/g, ' ').trim() : null,
             input: (() => { const inp = document.getElementById('t3-cardmap-' + el.dataset.cardIndex); return inp ? { multiple: inp.multiple } : null; })() };
  }, key);
  const panel = () => page.evaluate(() => {
    const box = document.getElementById('t3-maps-modal');
    if (!box) return null;
    return {
      open: !box.classList.contains('hidden'),
      rows: Array.from(box.querySelectorAll('.t3-map-row')).map(r => ({ url: r.dataset.url, note: r.querySelector('.t3-map-note').value, ro: r.querySelector('.t3-map-note').readOnly })),
      dels: box.querySelectorAll('.t3-map-del').length,
      add: box.querySelectorAll('.t3-map-add').length,
      focusIdx: Array.from(box.querySelectorAll('.t3-map-note')).indexOf(document.activeElement),
      delInsideOpen: box.querySelectorAll('.t3-map-open .t3-map-del').length
    };
  });
  const cardRemark = () => page.evaluate(() => {
    const r = window.__ROWS.shared_inventory_logs.filter(x => x.transaction_type === 'Transplant_Card' && x.plot_name === 'B07');
    return r.length ? String(r[r.length - 1].remark || '') : '';
  });
  const listOf = (remark) => {
    const m = remark.match(/MapList:(\S+)/);
    if (!m) return [];
    return m[1].split(';').map(p => { const b = p.split('|').map(v => decodeURIComponent(v || '')); return { url: b[0], name: b[1], note: b[2] }; });
  };

  console.log('\n── 1 · A CARD FROM BEFORE OPENS ITS ONE MAP IN THE PANEL ──');
  let b07 = await cardOf('B07|2026-10-11');
  checkTrue('B07 is on the list', !!b07);
  check('its chip reads Map', b07 && b07.chip, 'Map');
  checkTrue('the picker takes more than one file', b07 && b07.input && b07.input.multiple);
  await page.evaluate(i => window.openT3CardMaps(i), b07.i);
  let p = await panel();
  checkTrue('pressing the chip opens the maps panel', p && p.open);
  check('…listing the map that sat on the tray row', p && p.rows.map(r => r.url), ['https://x/b07.jpg']);
  check('…with a cross and an Add', p && [p.dels, p.add], [1, 1]);
  check('…the cross is a SIBLING of the map, never inside it', p && p.delInsideOpen, 0);
  await page.evaluate(() => window.closeT3CardMaps());

  console.log('\n── 2 · TWO MORE MAPS ARE ADDED, NEVER REPLACED ──');
  await page.evaluate(() => { window.__TOASTS = []; window.__UPLOADS = []; window.__INSERTED = []; window.__UPDATED = []; });
  await page.setInputFiles(`#t3-cardmap-${b07.i}`, [
    { name: 'north.png', mimeType: 'image/png', buffer: PNG },
    { name: 'south.pdf', mimeType: 'application/pdf', buffer: PDF }]);
  await page.waitForTimeout(2500);
  let rem = await cardRemark();
  check('both uploaded into the maps folder', await page.evaluate(() => window.__UPLOADS.map(u => u.folder)), ['transplant_maps', 'transplant_maps']);
  check('the card carries all three, the old one first', listOf(rem).map(d => d.name), ['Drone map', 'north.png', 'south.pdf']);
  checkTrue('MapUrl: is still the first map, for every older reader', /MapUrl:https:\/\/x\/b07\.jpg/.test(rem));
  checkTrue('it says so', await page.evaluate(() => window.__TOASTS.some(t => t.t === 'success' && /2 drone maps attached/i.test(t.m))));
  b07 = await cardOf('B07|2026-10-11');
  check('the chip counts them', b07 && b07.chip, 'Maps · 3');
  p = await panel();
  checkTrue('the panel opens by itself on the new maps', p && p.open && p.rows.length === 3);
  check('…with the cursor in the FIRST new map remark', p && p.focusIdx, 1);
  check('not one transplant row was touched',
        await page.evaluate(() => (window.__INSERTED || []).filter(r => /^Transplanted/.test(String(r.transaction_type || ''))).length), 0);

  console.log('\n── 3 · EACH MAP CARRIES ITS OWN REMARK ──');
  checkTrue('Save Remarks waits for something typed', await page.evaluate(() => document.getElementById('t3-maps-save').disabled));
  await page.evaluate(() => {
    const t = document.querySelectorAll('#t3-maps-modal .t3-map-note');
    t[1].value = 'North half, flown 21 Feb'; t[1].dispatchEvent(new Event('input'));
    t[2].value = 'South half'; t[2].dispatchEvent(new Event('input'));
  });
  checkFalse('…and lights once one is', await page.evaluate(() => document.getElementById('t3-maps-save').disabled));
  await page.evaluate(() => window.saveT3CardMapNotes());
  await page.waitForTimeout(1500);
  rem = await cardRemark();
  check('the remarks are on the card, map by map', listOf(rem).map(d => d.note), ['', 'North half, flown 21 Feb', 'South half']);
  p = await panel();
  check('…and the panel reads them back', p && p.rows.map(r => r.note), ['', 'North half, flown 21 Feb', 'South half']);
  checkTrue('a remark with a semicolon and a pipe survives the codec', await (async () => {
    await page.evaluate(() => { const t = document.querySelectorAll('#t3-maps-modal .t3-map-note'); t[0].value = 'old; pass | 1'; t[0].dispatchEvent(new Event('input')); });
    await page.evaluate(() => window.saveT3CardMapNotes());
    await page.waitForTimeout(1500);
    return listOf(await cardRemark())[0].note === 'old; pass | 1' && listOf(await cardRemark()).length === 3;
  })());

  console.log('\n── 4 · CLOSING OVER AN UNSAVED REMARK ASKS ──');
  await page.evaluate(() => { const t = document.querySelectorAll('#t3-maps-modal .t3-map-note'); t[2].value = 'typed, not saved'; t[2].dispatchEvent(new Event('input')); });
  await page.evaluate(() => { window.__ASKED = 0; window.confirm = () => { window.__ASKED++; return false; }; window.closeT3CardMaps(); });
  check('the close asked, and staying keeps the panel open', [await page.evaluate(() => window.__ASKED), (await panel()).open], [1, true]);
  await page.evaluate(() => { window.confirm = () => true; window.closeT3CardMaps(); });
  checkFalse('…and leaving closes it', (await panel()).open);

  console.log('\n── 5 · ONE MAP COMES OFF WITHOUT TAKING THE REST ──');
  b07 = await cardOf('B07|2026-10-11');
  await page.evaluate(i => window.openT3CardMaps(i), b07.i);
  await page.evaluate(() => window.removeT3CardMap(document.querySelectorAll('#t3-maps-modal .t3-map-row')[1].dataset.url, 'north.png'));
  await page.waitForTimeout(1500);
  rem = await cardRemark();
  check('north is off, the other two and their remarks stay', listOf(rem).map(d => [d.name, d.note]), [['Drone map', 'old; pass | 1'], ['south.pdf', 'South half']]);
  check('the chip counts two', (await cardOf('B07|2026-10-11')).chip, 'Maps · 2');

  console.log('\n── 6 · A SIGNED-OFF REPORT IS READ ONLY, AND THE CALL REFUSES TOO ──');
  await page.evaluate(() => { window.__TOASTS = []; window.__UPDATED = []; window.__INSERTED = []; window.__UPLOADS = [];
                              document.getElementById('tab-3').classList.add('mjm-locked'); });
  b07 = await cardOf('B07|2026-10-11');
  await page.evaluate(i => window.openT3CardMaps(i), b07.i);
  p = await panel();
  check('the panel still opens, the maps still view', p && [p.open, p.rows.length], [true, 2]);
  check('…with no cross and no Add, and the remarks read only', p && [p.dels, p.add, p.rows.every(r => r.ro)], [0, 0, true]);
  await page.evaluate(() => window.removeT3CardMap(document.querySelector('#t3-maps-modal .t3-map-row').dataset.url, 'x'));
  await page.setInputFiles(`#t3-cardmap-${b07.i}`, [{ name: 'sneaked.png', mimeType: 'image/png', buffer: PNG }]);
  await page.waitForTimeout(1200);
  check('nothing was written or uploaded', await page.evaluate(() => (window.__UPDATED || []).length + (window.__INSERTED || []).length + (window.__UPLOADS || []).length), 0);
  check('…and both said why', await page.evaluate(() => window.__TOASTS.filter(t => t.t === 'error' && /signed off/i.test(t.m)).length), 2);

  check('no page error at the end', errs.filter(e => !/MJMReview/.test(e)), []);
  await browser.close(); server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
