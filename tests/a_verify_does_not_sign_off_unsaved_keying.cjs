/* A SIGNATURE IS OVER WHAT IS IN THE DATABASE, NOT WHAT IS ON SCREEN.

   The office said it in one line, over batch 257:

       如果我自己amend 自己按verify 然后close 就会出现这个 按了save也save不到

   -- if I amend it myself, press verify myself, then close, THIS comes up,
   and pressing Save does not save. The screen they were looking at listed
   Seed Planting with SAVE / DON'T SAVE and, in red, "DID NOT SAVE --
   NOTHING LOST".

   The chain, and every link of it was working as written:

     1. they key into Seed Planting            -> _tabDirty[2] = true
     2. they press Verify                      -> verify() writes the
        verification row, calls renderBanner, which locks the tab. It runs
        NO save and clears NO dirty flag.
     3. they press the X                       -> the close guard sees a
        dirty tab and offers to save it
     4. they press Save                        -> _tabSaveBlocked refuses it,
        because the tab is now locked

   So three things were wrong at once, and the first is the worst:

     · the report was SIGNED OFF without the amendment -- the signature says
       somebody checked figures the report does not hold;
     · "nothing lost" was FALSE: the keying was on screen only;
     · and LEAVE could not close either. An untouched row defaults to being
       kept, the save refused, so `stillDirty` held it and the page stayed.
       Stay and Leave both did nothing.

   What this drives, on the real page:
     · the office's own path -- key, then Verify: REFUSED, nothing written,
       the tab is not locked, and the toast names the tab
     · save, then Verify: it signs off as it always did
     · the same rule on the other two doors -- a per-row Verify and Mark as
       Reviewed
     · a tab that is dirty AND locked: no Save button is drawn, the row says
       why and how to get back in, and LEAVE closes

   Run: NODE_PATH=/opt/node22/lib/node_modules \
        node tests/a_verify_does_not_sign_off_unsaved_keying.cjs
   with `python3 -m http.server 8792` serving the repository root.        */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const http = require('http');

const ROOT  = path.join(__dirname, '..');
const PORT  = 8792;
const BATCH = '257';

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png', '.sql': 'text/plain' };

const SEEDS_ROW = {
  id: 'sr-1', batch_name: BATCH, transaction_type: 'Seeds_Received',
  breed_name: 'DxP', quantity_change: 10000, plot_name: 'Pre-Nursery',
  transaction_date: '2026-01-05', created_at: '2026-01-05T02:00:00.000Z',
  workers: 4, remark: 'Supplier: AAR. MPOB: 123-456'
};

/* Strip comments before searching the source: this page explains in prose
   why a locked row carries no Save button and why the sign-off refuses, and
   a plain search reads the explanation as the thing still being there. Same
   trap this codebase has met four times. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/(^|[\s;{}()])\/\/[^\n]*/g, '$1 ');
}

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('no'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
  res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));

  await page.addInitScript(({ seedsRow }) => {
    window.__SEEDS_ROWS = [seedsRow];
    window.__WRITES = [];
    function makeQuery(table) {
      const st = { filters: {} };
      const rows = () => (st.filters.transaction_type === 'Seeds_Received')
                       ? window.__SEEDS_ROWS : [];
      const res = () => Promise.resolve({ data: rows(), error: null });
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => res().then(a, b);
        if (p === 'eq') return (c, v) => { st.filters[c] = v; return q; };
        if (p === 'maybeSingle' || p === 'single')
          return () => Promise.resolve({ data: rows()[0] || null, error: null });
        if (p === 'insert' || p === 'upsert' || p === 'update' || p === 'delete')
          return (payload) => { window.__WRITES.push({ table, op: p, payload }); return q; };
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'tester@mjmnursery.com' };
    window.supabase = { createClient: () => ({
      from: (t) => makeQuery(t),
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      storage: { from: () => ({
        upload: async () => ({ data: { path: 'x' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'http://x/y.jpg' } }),
        remove: async () => ({ error: null })
      }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, { seedsRow: SEEDS_ROW });

  await page.route('**/shared_access.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user')   return () => ({ id: 'u1', email: 'tester@mjmnursery.com', full_name: 'Esther Wong' });
      if (k === 'load')   return async () => true;
      if (k === 'perms' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then')   return undefined;
      return () => true;
    } });`
  }));
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/cdn.jsdelivr.net/**',    r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**',     r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  const URL_HERE = `http://localhost:${PORT}/operation/operation_batch_detail.html?id=` + BATCH;
  await page.goto(URL_HERE, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.closeBatchRecord === 'function', { timeout: 15000 });
  await page.waitForFunction(() => !!(window.MJMReview && MJMReview.verify), { timeout: 15000 });
  await page.waitForTimeout(600);   // the load handler wraps the save functions

  /* THE REVIEW MODULE HAS TO BE BOOTED BY HAND HERE, and it is a harness
     artifact rather than a fault. The page's bootstrap sits at the end of
     the FIRST script block and calls `MJMReview.boot()`, which the SECOND
     block defines. In production the awaits before it are real network
     reads, so the document has long finished parsing by the time it runs;
     against stubs that answer instantly the continuation drains before the
     browser parses the next script tag, so it reaches a MJMReview that does
     not exist yet -- which the bootstrap catches and logs. Booting it here
     is what the office's browser does by itself. */
  await page.evaluate(async () => { await MJMReview.boot(); });
  await page.waitForTimeout(400);

  let dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });

  const catchToasts = () => page.evaluate(() => {
    window.__TOASTS = [];
    const real = window.showToast;
    window.showToast = function (m, t) { window.__TOASTS.push({ m, t }); return real.apply(this, arguments); };
  });
  await catchToasts();

  const toasts   = () => page.evaluate(() => (window.__TOASTS || []).slice());
  const writesTo = (t) => page.evaluate((tt) =>
    (window.__WRITES || []).filter(w => w.table === tt).length, t);
  const locked   = (n) => page.evaluate((i) =>
    !!document.getElementById('tab-' + i).classList.contains('mjm-locked'), n);
  const dirty    = () => page.evaluate(() => window._dirtyTabNames());
  const type = (sel, val) => page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.value = v;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, [sel, val]);

  /* ── 1. The office's own path ───────────────────────────────────────── */
  console.log('\n1. Key into Seed Planting, then press Verify');
  check('nothing is unsaved to begin with', await dirty(), []);
  check('nothing has been verified to begin with',
        await page.evaluate(() => !!MJMReview.isVerified('planting')), false);

  /* Keyed into the DAMAGED box rather than the discrepancy one, so the
     figures do not tally and nobody has said why -- which is the state
     batch 257 is actually in, and what section 2 below turns on. */
  checkTrue('there is a Seed Planting box to key into', await type('#t2-damaged', '5'));
  check('keying makes Seed Planting unsaved', await dirty(), ['Seed Planting']);

  await page.evaluate(() => { window.__TOASTS = []; });
  await page.evaluate(() => MJMReview.verify(2));
  await page.waitForTimeout(400);

  check('the verify is REFUSED -- nothing is written to the verifications table',
        await writesTo('operation_batch_verifications'), 0);
  check('…so the tab is NOT signed off',
        await page.evaluate(() => !!MJMReview.isVerified('planting')), false);
  check('…and NOT locked, so the Save at the bottom of it still works',
        await locked(2), false);
  check('…and the keying is still on screen',
        await page.inputValue('#t2-damaged'), '5');
  check('…and the keying is still unsaved', await dirty(), ['Seed Planting']);

  const t1 = await toasts();
  check('it says so as a refusal, not as a warning',
        t1.map(t => t.t), ['error']);
  checkTrue('…naming the tab', /Seed Planting/.test((t1[0] || {}).m || ''));
  checkTrue('…saying nothing was verified', /Nothing verified/i.test((t1[0] || {}).m || ''));
  checkTrue('…and saying what to do', /[Ss]ave the tab first/.test((t1[0] || {}).m || ''));

  /* ── 2. Save, then verify ───────────────────────────────────────────── */
  console.log('\n2. Save it first, and the verify goes through');
  /* THE REAL SAVE, because this is where the office was actually stuck and
     a stub would have proved nothing about it.

     257 is 7 seeds short and nobody has written why, so the planting save
     stores the report and then says so. That sentence went out as an
     'error' -- and an error is the one thing the close guard reads as "what
     you keyed is not in the database", so the tab could NEVER stop being
     dirty. For months that only mis-worded the X; the moment a sign-off
     started refusing a dirty tab it meant the report could not be VERIFIED
     at all, which is the nine refusals the office sent back.

     The discrepancy box is deliberately left empty, which is the whole
     condition. */
  await page.evaluate(() => { window.__TOASTS = []; });
  await page.evaluate(async () => { await window.savePlantingTab(); });
  await page.waitForTimeout(700);
  const t2 = await toasts();
  checkTrue('the save says the report is saved', /saved/i.test((t2[0] || {}).m || ''));
  checkTrue('…and that nobody has said why the figures do not tally',
            /do not tally/i.test((t2[0] || {}).m || ''));
  check('…as a WARNING, because the report IS in the database',
        (t2[0] || {}).t, 'warn');
  check('the save clears the tab', await dirty(), []);

  await page.evaluate(() => { window.__TOASTS = []; });
  await page.evaluate(() => MJMReview.verify(2));
  await page.waitForTimeout(500);
  check('the verification row is written',
        await writesTo('operation_batch_verifications'), 1);
  check('…the tab reads as signed off',
        await page.evaluate(() => !!MJMReview.isVerified('planting')), true);
  check('…and it is locked, as it always was', await locked(2), true);
  check('no refusal was raised', (await toasts()).filter(t => t.t === 'error').length, 0);

  /* ── 3. A per-row Verify is the second door ─────────────────────────── */
  console.log('\n3. One rule, three doors');
  /* A ROW tab stays UNLOCKED, so the save is never refused there -- but the
     signature is still over figures the report does not hold, which is the
     half that matters. Tab 6 is 3rd Culling, verified plot by plot. */
  await page.evaluate(() => {
    const el = document.querySelector('#tab-6 select');
    if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  check('3rd Culling is unsaved', (await dirty()).indexOf('3rd Culling') >= 0, true);

  await page.evaluate(() => { window.__TOASTS = []; window.__WRITES = []; });
  await page.evaluate(() => MJMReview.rowVerify(6, encodeURIComponent('U3')));
  await page.waitForTimeout(400);
  check('a per-row Verify is refused the same way',
        (await toasts()).map(t => t.t), ['error']);
  check('…and writes nothing at all',
        await page.evaluate(() => (window.__WRITES || []).length), 0);

  /* Put 3rd Culling back to clean, so the close dialog below is about the
     one tab this is testing. */
  await page.evaluate(() => {
    window.saveTab6 = function () { window.showToast('Saved.', 'success'); };
    window._trackTabSave('saveTab6', 6);
  });
  await page.evaluate(() => window.saveTab6());
  await page.waitForTimeout(250);
  check('3rd Culling is clean again', await dirty(), []);

  /* ── 4. A tab that is dirty AND locked ──────────────────────────────── */
  console.log('\n4. A dirty, locked tab: no Save that cannot run, and Leave closes');
  /* .mjm-locked is pointer-events:none, which stops a mouse and stops
     neither the keyboard nor a call -- which is the whole reason this state
     is reachable at all. Reached here the same way: a dispatched event. */
  await page.evaluate(() => {
    const el = document.querySelector('#t2-gap-note');
    el.value = 'amended after the signature';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  check('Seed Planting is unsaved again', (await dirty()).indexOf('Seed Planting') >= 0, true);
  check('…and still locked', await locked(2), true);

  /* THE THIRD DOOR, which is only reachable on a verified tab: Mark as
     Reviewed asks for a verification first. */
  await page.evaluate(() => { window.__TOASTS = []; });
  await page.evaluate(() => MJMReview.mark(2));
  await page.waitForTimeout(400);
  check('Mark as Reviewed is refused too',
        (await toasts()).filter(t => t.t === 'error').length, 1);
  check('…and writes no review row', await writesTo('operation_batch_reviews'), 0);
  check('…and no alert box was raised instead', dialogs.length, 0);

  await page.evaluate(() => window.closeBatchRecord());
  await page.waitForTimeout(300);
  check('the close dialog opens',
        await page.evaluate(() => !document.getElementById('unsaved-modal').classList.contains('hidden')), true);

  const row2 = () => page.evaluate(() => {
    const r = document.querySelector('#unsaved-modal-list .unsaved-row[data-tab="2"]');
    if (!r) return 'no row for Seed Planting';
    return {
      save:   !!r.querySelector('.unsaved-save'),
      choice: r.getAttribute('data-choice'),
      tag:    (r.querySelector('.unsaved-state') || {}).textContent || '',
      why:    (r.querySelector('.unsaved-why')   || {}).textContent || ''
    };
  });
  const r2 = await row2();
  check('NO Save button is drawn on it', r2.save, false);
  check('…it says it cannot be saved', (r2.tag || '').trim(), 'Cannot be saved');
  checkTrue('…and why, naming the way back in', /Unverify/.test(r2.why || ''));
  check('…and it is decided, so Leave is not a dead end', r2.choice, 'drop');

  /* The button is gone; the refusal is in the handler all the same. */
  await page.evaluate(() => { window.__TOASTS = []; });
  const before = await writesTo('operation_batch_verifications');
  await page.evaluate(() => window.saveOneUnsaved(2));
  await page.waitForTimeout(300);
  check('calling the save straight out of the console runs nothing',
        await writesTo('operation_batch_verifications'), before);
  check('…and the row still says it cannot be saved',
        ((await row2()).tag || '').trim(), 'Cannot be saved');

  check('no browser confirm box anywhere in this', dialogs.length, 0);

  await page.evaluate(() => window.confirmCloseBatchRecord());
  await page.waitForTimeout(900);
  check('Leave closes the batch rather than refusing for ever',
        new URL(page.url()).pathname.endsWith('operation_batch_record.html'), true);

  /* ── 5. The source: one rule, three doors ───────────────────────────── */
  console.log('\n5. The rule is written once and asked by all three');
  const src = stripComments(fs.readFileSync(
    path.join(ROOT, 'operation/operation_batch_detail.html'), 'utf8'));
  check('one refusal, three call sites',
        (src.match(/_denySignOffUnsaved\(/g) || []).length, 4);   // 1 definition + 3 doors
  /* The row's test has to be the SAVE's test, or the row says one thing
     while the save does another. Asked of the list builder itself. */
  const builder = (src.split('list.innerHTML = dirty.map')[1] || '').slice(0, 1400);
  checkTrue('the close dialog branches on the save\'s OWN test',
        /_tabSaveBlocked\(/.test(builder));
  checkTrue('the lock reason is answered where the lock state lives',
        /lockReason:/.test(src));

  await browser.close();
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
