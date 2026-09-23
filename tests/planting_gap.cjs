/* A PLANTING DISCREPANCY IS EXPLAINED ON THE TAB, NOT FILED IN NELOS.

   Saving the planting report used to raise a Nelos case whenever the figures
   did not tally. That sent the question to a queue: the person keying the
   report had the answer in their head at that moment, and was asked for it
   somewhere else, days later, by somebody who was not there. Worse, the case
   never closed itself — fixing the figures only stopped a NEW one being
   raised, so the queue filled with questions already answered.

   It is asked here now, on the tab, beside the shortfall, while the person
   who caused it is standing in front of it.

   The two things that make a discrepancy, unchanged:
     · SHORTFALL      planted + damaged  <  D/O + FOC + Replacement
     · EXCESS DAMAGE  damaged  >  the FOC allowance

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/planting_gap.cjs
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

const UID = '00000000-0000-0000-0000-000000000001';
/* The stub records every INSERT by table, so "no Nelos case was raised" is
   something this can actually check rather than assume. */
const FAKE_SUPABASE = `
window.__INSERTS = [];
window.__UPDATES = [];
window.supabase = { createClient: function () {
  function builder(table) {
    var b = { _t: table, _eq: {}, _in: null, _like: null, _one: false, _from: 0, _to: 1e9 };
    ['neq','is','or','not','gt','gte','lt','lte','ilike','order','limit','filter','match','contains','overlaps','select','range']
      .forEach(function (m) { b[m] = function () { return b; }; });
    b.eq = function (col, val) { b._eq[col] = val; return b; };
    b.in = function (col, vals) { b._in = { col: col, vals: vals.map(String) }; return b; };
    b.like = function (col, pat) { b._like = { col: col, pat: pat }; return b; };
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
    b._settle = function () {
      var rows = b._rows();
      return { data: b._one ? (rows[0] || null) : rows, error: null, count: rows.length };
    };
    b.then = function (r, j) { return Promise.resolve(b._settle()).then(r, j); };
    b.catch = function (f) { return Promise.resolve(b._settle()).catch(f); };
    b.finally = function (f) { return Promise.resolve(b._settle()).finally(f); };
    b.insert = function (rows) {
      window.__INSERTS.push({ table: table, rows: [].concat(rows || []) });
      return Promise.resolve({ data: null, error: null });
    };
    b.update = function (payload) {
      window.__UPDATES.push({ table: table, payload: payload });
      return b;
    };
    b.delete = function () { return b; };
    b.upsert = function (rows) {
      window.__INSERTS.push({ table: table, rows: [].concat(rows || []) });
      return Promise.resolve({ data: null, error: null });
    };
    return b;
  }
  return {
    from: builder,
    rpc: function () { return Promise.resolve({ data: null, error: null }); },
    channel: function () { var c = { on: function(){return c;}, subscribe: function(){return c;} }; return c; },
    removeChannel: function () {},
    storage: { from: function () { return { upload: function(){return Promise.resolve({data:null,error:null});},
                                            getPublicUrl: function(){return {data:{publicUrl:''}};} }; } },
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

/* Batch 276: 10,000 on the D/O with 7% FOC = 700, and 206 replacement seeds
   the supplier owed from an earlier batch. Total in = 10,906.

   Planted 10,000 into one tray and 194 damaged → 10,194 accounted, which is
   712 short. That is the shortfall the tab has to ask about. */
const ROWS = {
  shared_inventory_logs: [
    { id: 1, batch_name: '276', transaction_type: 'Seeds_Received', quantity_change: 10906,
      breed_name: 'IOI DxP HYBRID', transaction_date: '2026-03-25', created_at: '2026-03-25T00:00:00Z',
      plot_name: null,
      remark: 'Seeds received. Supplier: IOI. DO_Qty: 10000. Incl. 7% FOC. Replacement: 206.' },
    { id: 2, batch_name: '276', transaction_type: 'Planted', plot_name: 'P60', quantity_change: 10000,
      transaction_date: '2026-03-26', remark: 'Planted in Pre-Nursery tray P60. TotalPlanted:10000. EmptyHoles:0.' },
    { id: 3, batch_name: '276', transaction_type: 'Damaged_Seeds', quantity_change: 194,
      transaction_date: '2026-03-26', plot_name: null,
      remark: 'Damaged seeds recorded during initial planting.' }
  ],
  operation_trays: [{ tray_name: 'P60', nursery_name: 'PN', total_vacant: 12000 }],
  shared_do_records: [],
  operation_batch_verifications: [],
  nelos_cases: []
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.route('**supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**cdn.tailwindcss.com/**', (r) => r.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'document.addEventListener("DOMContentLoaded", function () {' +
          '  document.head.insertAdjacentHTML("beforeend", ' +
          JSON.stringify('<style>.hidden{display:none}</style>') + '); });' }));
  await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await page.route('**cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

  await page.addInitScript(({ uid, rows }) => {
    const user = { id: uid, email: 'esther@mjmnursery.com', user_metadata: { full_name: 'Esther Wong' } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    window.__FAKE_PROFILE = { id: uid, email: user.email, full_name: 'Esther Wong', user_type: 'staff',
      permissions: { modules: { operation: 'admin', nelos: 'admin' }, manage_users: true } };
    window.__ROWS = rows;
    try { localStorage.clear(); } catch (e) {}
  }, { uid: UID, rows: ROWS });

  await page.goto(`http://localhost:${port}/operation/operation_batch_detail.html?id=276`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  const look = () => page.evaluate(async () => {
    switchTab(2);
    await new Promise(r => setTimeout(r, 400));
    calcPlanting();
    const vis = (el) => !!el && !el.classList.contains('hidden');
    const txt = (id) => (document.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      panel:   vis(document.getElementById('t2-gap-panel')),
      banner:  vis(document.getElementById('follow-up-warning')),
      why:     txt('t2-gap-why'),
      sum:     txt('t2-gap-sum'),
      note:    document.getElementById('t2-gap-note')?.value || '',
      pct:     txt('t2-percent-text'),
      missing: (document.getElementById('t2-status-desc')?.textContent || '').replace(/\s+/g, ' ').trim(),
      bannerText: (document.getElementById('follow-up-warning')?.textContent || '').replace(/\s+/g, ' ').trim(),
      state:   typeof t2GapState === 'function' ? t2GapState() : null
    };
  });

  const unexplained = await look();

  // The reason, typed the way a person types it.
  await page.click('#t2-gap-note');
  await page.type('#t2-gap-note', '712 seeds mouldy in the bag, thrown away before counting.', { delay: 5 });
  await page.waitForTimeout(300);
  const explained = await look();

  // What the save writes, and what it does NOT write.
  const written = await page.evaluate(async () => {
    const rows = [];
    const real = window.safeReplaceLogs;
    window.safeReplaceLogs = (batch, types, logs) => { rows.push(...logs); return Promise.resolve({ error: null }); };
    const toasts = [];
    const realToast = window.showToast;
    window.showToast = (m, k) => toasts.push({ m, k });
    window.__INSERTS.length = 0;
    await savePlantingTab();
    window.safeReplaceLogs = real; window.showToast = realToast;
    return {
      damagedRemark: (rows.find(r => r.transaction_type === 'Damaged_Seeds') || {}).remark || '',
      nelosInserts: window.__INSERTS.filter(i => i.table === 'nelos_cases').length,
      toasts
    };
  });

  /* ── HQ SIGNED IT OFF WITH THE REASON STILL MISSING ──────────────────
     A tab showing a part-filled ring beside its own green tick is two
     answers to one question. Once HQ has verified the stage, an unwritten
     reason is something still OWED, not a report that is unfinished — the
     same rule the tab already carries for an unattached photograph.

     Every figure has to be in for that: a missing worker count still holds
     the ring down, verified or not. */
  const verified = await page.evaluate(async () => {
    const note = document.getElementById('t2-gap-note');
    note.value = '';                                    // the reason goes away again
    currentWorkers = 4;                                 // every FIGURE now in
    opsPhotoBase64 = null;                              // …and the photo still owed
    window.MJMReview = Object.assign({}, window.MJMReview, { isVerified: () => false });
    calcPlanting();
    const before = { pct: (document.getElementById('t2-percent-text')?.textContent || '').trim(),
                     desc: (document.getElementById('t2-status-desc')?.textContent || '').replace(/\s+/g, ' ').trim() };
    window.MJMReview.isVerified = (stage) => stage === 'planting';
    calcPlanting();
    const after = { pct: (document.getElementById('t2-percent-text')?.textContent || '').trim(),
                    desc: (document.getElementById('t2-status-desc')?.textContent || '').replace(/\s+/g, ' ').trim(),
                    panel: !document.getElementById('t2-gap-panel').classList.contains('hidden') };
    // …and a FIGURE still missing is not settled by a signature.
    currentWorkers = 0;
    calcPlanting();
    const withFigureMissing = { pct: (document.getElementById('t2-percent-text')?.textContent || '').trim() };
    currentWorkers = 4;
    calcPlanting();
    return { before, after, withFigureMissing };
  });

  /* ── A LOCKED REPORT STILL TAKES THE REASON ─────────────────────────
     Everything else on a verified report is a claim somebody has signed
     off, and locking it is the point. A reason why the figures do not
     tally is the opposite: it is what is still MISSING when the report is
     locked, and the answer often turns up afterwards. Locked, the only way
     to record it was to unverify the whole report, change nothing and
     verify it again.

     So the box stays live — and so does its own Save, because the tab's
     own Save is locked and a box that cannot be saved is worse than a box
     that cannot be typed in. */
  const locked = await page.evaluate(async () => {
    const tab = document.getElementById('tab-2');
    tab.classList.add('mjm-locked');
    await new Promise(r => setTimeout(r, 150));
    const can = (el) => !!el && getComputedStyle(el).pointerEvents !== 'none';
    return {
      note:      can(document.getElementById('t2-gap-note')),
      itsSave:   can(document.getElementById('t2-gap-save')),
      // …while the rest of the tab is locked exactly as before.
      damaged:   can(document.getElementById('t2-damaged')),
      tabSave:   can(document.getElementById('save-planting-btn'))
    };
  });

  /* And it reaches the database on its own: only the GapNote changes, and
     nothing else on the record moves. */
  const loneSave = await page.evaluate(async () => {
    const row = window.__ROWS.shared_inventory_logs.find(r => r.transaction_type === 'Damaged_Seeds');
    row.remark = 'Damaged seeds recorded during initial planting. GapNote:old%20reason';
    const before = { remark: row.remark, qty: row.quantity_change, date: row.transaction_date };
    window.__UPDATES.length = 0;
    document.getElementById('t2-gap-note').value = 'Supplier wrote back: 712 short-delivered.';
    const toasts = [];
    const realToast = window.showToast; window.showToast = (m, k) => toasts.push({ m, k });
    await saveT2GapNote();
    window.showToast = realToast;
    const u = window.__UPDATES.find(x => x.table === 'shared_inventory_logs' && x.payload && 'remark' in x.payload);
    return {
      updated: !!u,
      remark: u ? u.payload.remark : '',
      touchedOnly: u ? Object.keys(u.payload).filter(k => !/^last_edited/.test(k)) : [],
      before, toasts
    };
  });

  /* Reopening the batch: the reason has to come back, or the panel asks a
     question somebody has already answered and the ring falls off 100%. */
  const reloaded = await page.evaluate(async (remark) => {
    const row = window.__ROWS.shared_inventory_logs.find(r => r.transaction_type === 'Damaged_Seeds');
    row.remark = remark;
    await loadSavedPlantingData('276');
    await new Promise(r => setTimeout(r, 400));
    calcPlanting();
    return { note: document.getElementById('t2-gap-note')?.value || '',
             sum: (document.getElementById('t2-gap-sum')?.textContent || '').trim(),
             panel: !document.getElementById('t2-gap-panel').classList.contains('hidden') };
  }, written.damagedRemark);

  /* …and a batch whose figures tally is never asked to explain nothing.
     906 more planted closes the 712 gap and puts it into surplus. */
  const tallies = await page.evaluate(async () => {
    const row = document.querySelector('.tray-row');
    setNumericInput(row.querySelector('.t-planted'), '10906');
    calcTrayRow(row.id || row.querySelector('.t-planted').closest('.tray-row').id);
    calcPlanting();
    await new Promise(r => setTimeout(r, 200));
    return { panel: !document.getElementById('t2-gap-panel').classList.contains('hidden'),
             banner: !document.getElementById('follow-up-warning').classList.contains('hidden'),
             state: t2GapState() };
  }).catch(async () => {
    // calcTrayRow wants the row id; fall back to typing into the box.
    await page.fill('.tray-row .t-planted', '10906');
    await page.dispatchEvent('.tray-row .t-planted', 'input');
    await page.waitForTimeout(300);
    return page.evaluate(() => ({
      panel: !document.getElementById('t2-gap-panel').classList.contains('hidden'),
      banner: !document.getElementById('follow-up-warning').classList.contains('hidden'),
      state: t2GapState() }));
  });

  console.log('unexplained :', JSON.stringify(unexplained));
  console.log('explained   :', JSON.stringify(explained));
  console.log('saved remark:', JSON.stringify(written.damagedRemark));
  console.log('nelos rows  :', written.nelosInserts, '| toasts:', JSON.stringify(written.toasts));
  console.log('verified    :', JSON.stringify(verified));
  console.log('locked      :', JSON.stringify(locked));
  console.log('lone save   :', JSON.stringify(loneSave));
  console.log('reloaded    :', JSON.stringify(reloaded));
  console.log('tallies     :', JSON.stringify(tallies));
  console.log('page errors :', errs.length ? errs.join(' | ') : 'none');

  const checks = [
    // ── the question is asked, here
    ['a shortfall opens the explanation panel', unexplained.panel === true],
    ['and the banner points at it rather than promising a case',
      unexplained.banner === true && /explain it below/i.test(unexplained.bannerText)
      && !/case/i.test(unexplained.bannerText)],
    ['naming which discrepancy it is', /SHORTFALL/i.test(unexplained.why)],
    ['and by how much — 10,906 in, 10,194 accounted',
      /712/.test(unexplained.why) && /10,906/.test(unexplained.why) && /10,194/.test(unexplained.why)],
    ['saying nobody has answered it yet', /not explained/i.test(unexplained.sum)],
    ['the report is not complete until somebody does',
      unexplained.pct !== '100%' && /discrepancy explanation/i.test(unexplained.missing)],

    // ── and answered
    ['typing the reason marks it explained', /explained/i.test(explained.sum) && !/not explained/i.test(explained.sum)],
    /* This fixture is deliberately short of a worker count and a photo, so
       the ring cannot reach 100 — what matters is that the EXPLANATION is no
       longer one of the things holding it down, and the ring moved for it. */
    ['and the explanation stops holding the report back',
      !/discrepancy explanation/i.test(explained.missing)
      && parseInt(explained.pct) > parseInt(unexplained.pct)],
    ['the panel stays on screen with the reason in it',
      explained.panel === true && /mouldy/.test(explained.note)],

    // ── what the save does
    ['the reason is saved with the record', /GapNote:/.test(written.damagedRemark)],
    ['readable again', /mouldy/.test(decodeURIComponent(
      (written.damagedRemark.match(/GapNote:(\S+)/) || ['', ''])[1] || ''))],
    ['and NO Nelos case is raised', written.nelosInserts === 0],
    ['the save is not blocked', written.toasts.some(t => /saved/i.test(t.m))],

    // ── HQ signed it off anyway
    ['unverified, a missing reason holds the ring down',
      verified.before.pct !== '100%' && /discrepancy explanation/i.test(verified.before.desc)],
    ['once HQ verifies the stage, the tab ticks', verified.after.pct === '100%'],
    ['and says what is still owed rather than what is missing',
      /verified/i.test(verified.after.desc) && /outstanding/i.test(verified.after.desc)
      && /discrepancy explanation/i.test(verified.after.desc)],
    ['the panel stays open so it can still be written', verified.after.panel === true],
    ['but a missing FIGURE is not settled by a signature',
      verified.withFigureMissing.pct !== '100%'],

    // ── a locked report
    ['the explanation box is still live on a locked report', locked.note === true],
    ['and so is its own Save', locked.itsSave === true],
    ['while the rest of the tab stays locked',
      locked.damaged === false && locked.tabSave === false],
    ['saving it on its own reaches the record', loneSave.updated === true],
    ['writing the new reason', /Supplier%20wrote%20back/.test(loneSave.remark)],
    ['replacing the old one rather than stacking a second',
      (loneSave.remark.match(/GapNote:/g) || []).length === 1 && !/old%20reason/.test(loneSave.remark)],
    ['keeping the record\'s own words', /Damaged seeds recorded/.test(loneSave.remark)],
    ['and touching nothing else — no quantity, no date, no sign-off',
      JSON.stringify(loneSave.touchedOnly) === JSON.stringify(['remark'])],
    ['it says so', loneSave.toasts.some(t => /explanation saved/i.test(t.m) && t.k === 'success')],

    // ── reopening
    ['the reason comes back on the next load', /mouldy/.test(reloaded.note)],
    ['reading as explained', /explained/i.test(reloaded.sum) && !/not explained/i.test(reloaded.sum)],

    // ── a report that tallies
    ['a batch whose figures tally is asked nothing', tallies.panel === false && tallies.banner === false],
    ['and counts as explained by having nothing to explain', tallies.state.explained === true],

    ['no page errors beyond the harness\'s own MJMReview race',
      errs.every(e => /MJMReview is not defined/.test(e))],
  ];
  let bad = 0;
  console.log('');
  for (const [l, p] of checks) { console.log((p ? 'ok   ' : 'FAIL ') + l); if (!p) bad++; }
  await browser.close(); server.close();
  process.exit(bad ? 1 : 0);
})();
