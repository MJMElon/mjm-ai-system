/* AN EXPLANATION IS NEVER LOCKED — 3RD CULLING'S HALF.

   tests/planting_gap.cjs covers the Planting tab's reason. This is the same
   rule on the drone-map mismatch panel, which is the other place the report
   asks why two figures disagree.

   Everything else on a verified report is a claim somebody has signed off,
   and locking it is the point. A reason is the opposite: it is what is still
   MISSING when the report is locked, and the answer turns up afterwards —
   the drone operator remembers, the recount comes back, the person who was
   there comes in on Monday. Locked, the only way to record it was to
   unverify the whole report, change nothing and verify it again.

   So the box stays live, it has its own Save because the tab's is locked,
   that Save touches nothing but the reason, and explaining the last plot
   takes the batch off HQ's Amendment Needed list — a reason that does not
   clear the flag is a reason nobody acted on.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/explanation_open.cjs
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
    b.delete = function () {
      window.__DELETES = window.__DELETES || [];
      window.__DELETES.push({ table: table });
      return b;
    };
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

/* Batch 290. Two plots on 3rd Culling, both with a drone map that disagrees
   with what was culled — and U4 carries BOTH a MAIN row and a D-TONE row, so
   a reason written for one must not land on the other.

     U3   culled 100, drone map 90   → 10 out, unexplained
     U4   culled 200, drone map 180  → 20 out, unexplained (MAIN)
     U4   D-TONE row, already tallies and must be left alone

   The batch is on HQ's Amendment Needed list for them. */
const ROWS = {
  shared_inventory_logs: [
    { id: 1, batch_name: '290', transaction_type: 'Seeds_Received', quantity_change: 1000,
      breed_name: 'IOI DxP HYBRID', transaction_date: '2025-06-01', created_at: '2025-06-01T00:00:00Z',
      plot_name: null, remark: 'Seeds received. Supplier: IOI. DO_Qty: 1000. Incl. 0% FOC.' },
    { id: 2, batch_name: '290', transaction_type: 'Planted', plot_name: 'P90', quantity_change: 1000,
      remark: 'Planted in Pre-Nursery tray P90. TotalPlanted:1000. EmptyHoles:0.' },
    { id: 3, batch_name: '290', transaction_type: 'Transplanted', plot_name: 'U3', quantity_change: 100,
      remark: 'Transplanted from tray [P90] to Main Plot [U3]. Date: 2025-09-01' },
    { id: 4, batch_name: '290', transaction_type: 'Transplanted', plot_name: 'U4', quantity_change: 200,
      remark: 'Transplanted from tray [P90] to Main Plot [U4]. Date: 2025-09-01' },
    { id: 10, batch_name: '290', transaction_type: '3rd_Culling', plot_name: 'U3', quantity_change: 100,
      remark: '3rd Culling. Transplanted: 100, Remaining Balance: 100, Culled: 100, Cull Rate: 100.00%, '
            + '2ndCulled: 0, Sales: 0, DestType: main MapQty: 90 CullDate:2026-06-01' },
    { id: 11, batch_name: '290', transaction_type: '3rd_Culling', plot_name: 'U4', quantity_change: 200,
      remark: '3rd Culling. Transplanted: 200, Remaining Balance: 200, Culled: 200, Cull Rate: 100.00%, '
            + '2ndCulled: 0, Sales: 0, DestType: main MapQty: 180 CullDate:2026-06-01' },
    /* The same plot's D-TONE record. It tallies, nobody is asked about it,
       and a reason written for U4's MAIN row must not be written here. */
    { id: 12, batch_name: '290', transaction_type: '3rd_Culling', plot_name: 'U4', quantity_change: 50,
      remark: '3rd Culling. DestType: doubletone MapQty: 50 CullDate:2026-06-01' },
    // The batch is on HQ's Amendment Needed list because of the two above.
    { id: 20, batch_name: '290', transaction_type: 'Review_Rejection', plot_name: 'cull_3', quantity_change: 0,
      remark: '3rd Culling map qty does not tally — 2 plot(s) to explain. U3: 3rd culled 100, drone map 90 (-10) | U4: 3rd culled 200, drone map 180 (-20)' }
  ],
  operation_trays: [{ tray_name: 'P90', nursery_name: 'PN', total_vacant: 2000 }],
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

  await page.goto(`http://localhost:${port}/operation/operation_batch_detail.html?id=290`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  const panel = await page.evaluate(async () => {
    switchTab(6);
    await new Promise(r => setTimeout(r, 1400));
    calcT6();
    await new Promise(r => setTimeout(r, 400));
    const p = document.getElementById('t6-mismatch-panel');
    return {
      shown: !!p && !p.classList.contains('hidden'),
      boxes: document.querySelectorAll('.t6-mm-note').length,
      count: (document.getElementById('t6-mismatch-count')?.textContent || '').trim(),
      mismatches: (typeof t6Mismatches === 'function' ? t6Mismatches() : []).map(m => m.plot)
    };
  });

  /* ── A SAVED REASON IS READ-ONLY UNTIL SOMEBODY PRESSES EDIT ─────────
     Per plot, because each plot's reason is its own record. U3 already has
     one written against it; U4 does not. */
  const asRecord = await page.evaluate(async () => {
    const idxOf = (plot) => t6_plotData.findIndex(p => String(p.plot).trim().toUpperCase() === plot);
    const read = (plot) => {
      const i = idxOf(plot);
      const box = document.getElementById(`t6-mm-note-${i}`);
      const wrap = box.parentElement;
      const vis = (sel) => { const e = wrap.querySelector(sel); return !!e && !e.classList.contains('hidden'); };
      return { readOnly: box.readOnly, value: box.value,
               edit: vis('.t6-mm-edit'), cancel: vis('.t6-mm-cancel'),
               meta: (wrap.querySelector('.t6-mm-meta')?.textContent || '').trim() };
    };
    t6_plotData[idxOf('U3')].savedMismatchNote = 'Drone flew before the last tray moved out.';
    document.getElementById(`t6-mm-note-${idxOf('U3')}`).value = 'Drone flew before the last tray moved out.';
    syncT6MismatchLocks();
    const u3 = read('U3'), u4 = read('U4');

    editT6MismatchNote(idxOf('U3'));
    const editing = read('U3');
    document.getElementById(`t6-mm-note-${idxOf('U3')}`).value = 'typed over by mistake';
    cancelT6MismatchNote(idxOf('U3'));
    const cancelled = read('U3');
    // …and editing one plot must not open the plot beside it.
    editT6MismatchNote(idxOf('U3'));
    const u4WhileU3Open = read('U4');
    cancelT6MismatchNote(idxOf('U3'));
    return { u3, u4, editing, cancelled, u4WhileU3Open };
  });

  /* Lock the whole tab the way a verified report is locked, then look at
     what is still usable. */
  const locked = await page.evaluate(async () => {
    document.getElementById('tab-6').classList.add('mjm-locked');
    await new Promise(r => setTimeout(r, 150));
    const can = (el) => !!el && getComputedStyle(el).pointerEvents !== 'none';
    return {
      note:    can(document.querySelector('.t6-mm-note')),
      itsSave: can(document.getElementById('t6-mm-save')),
      // …and the rest of the tab is locked exactly as before.
      tabSave: can(document.getElementById('save-t6-btn')),
      aCulledBox: can(document.querySelector('.t6-map-qty'))
    };
  });

  // One plot explained, the other still open.
  const partial = await page.evaluate(async () => {
    window.__UPDATES.length = 0;
    const toasts = []; const realToast = window.showToast;
    window.showToast = (m, k) => toasts.push({ m, k });
    const boxes = [...document.querySelectorAll('.t6-mm-note')];
    const idxOf = (plot) => t6_plotData.findIndex(p => String(p.plot).trim().toUpperCase() === plot);
    const u3 = document.getElementById(`t6-mm-note-${idxOf('U3')}`);
    u3.value = 'Drone flew before the last tray was moved out — recount after transfers close.';
    syncT6MismatchState();
    await saveT6MismatchNotes();
    window.showToast = realToast;
    const writes = window.__UPDATES.filter(u => u.table === 'shared_inventory_logs' && u.payload && 'remark' in u.payload);
    const deletes = window.__DELETES ? window.__DELETES.length : null;
    return { boxes: boxes.length, writes: writes.map(w => w.payload.remark), toasts };
  });

  /* Which ROW it landed on. The stub does not persist updates, so the check
     is on what was sent: exactly one remark, carrying U3's own figures and
     DestType main, and nothing sent for U4 at all. */
  const landed = {
    writes: partial.writes.length,
    onU3: partial.writes.some(r => /Transplanted: 100/.test(r) && /DestType: main/.test(r)),
    onU4: partial.writes.some(r => /Transplanted: 200/.test(r)),
    onDtone: partial.writes.some(r => /doubletone/.test(r)),
    note: partial.writes.some(r => /MismatchNote:Drone%20flew/.test(r)),
    keptTheRest: partial.writes.every(r => /MapQty: 90/.test(r) && /CullDate:2026-06-01/.test(r))
  };

  // Now the second one, which is the last unexplained plot on the batch.
  const cleared = await page.evaluate(async () => {
    window.__DELETES = [];
    window.__UPDATES.length = 0;
    const realToast = window.showToast; const toasts = [];
    window.showToast = (m, k) => toasts.push({ m, k });
    const idxOf = (plot) => t6_plotData.findIndex(p => String(p.plot).trim().toUpperCase() === plot);
    document.getElementById(`t6-mm-note-${idxOf('U4')}`).value = 'Recounted on the ground: 180 is right, 200 was keyed twice.';
    syncT6MismatchState();
    await saveT6MismatchNotes();
    window.showToast = realToast;
    return { deletes: window.__DELETES.slice(), toasts,
             stillUnexplained: t6Mismatches().filter(m => !t6MismatchNote(m.idx)).length };
  });

  console.log('panel       :', JSON.stringify(panel));
  console.log('as a record :', JSON.stringify(asRecord, null, 1));
  console.log('locked      :', JSON.stringify(locked));
  console.log('one saved   :', JSON.stringify({ ...landed, toasts: partial.toasts }));
  console.log('last one    :', JSON.stringify(cleared));
  console.log('page errors :', errs.length ? errs.join(' | ') : 'none');

  const checks = [
    ['both plots are asked for a reason', panel.shown === true && panel.boxes === 2],
    ['named', panel.mismatches.includes('U3') && panel.mismatches.includes('U4')],

    // ── saved is a record, not a box
    ['a plot whose reason is saved reads but does not type',
      asRecord.u3.readOnly === true && /Drone flew/.test(asRecord.u3.value)],
    ['with an Edit button', asRecord.u3.edit === true && /press edit/i.test(asRecord.u3.meta)],
    ['a plot with no reason yet is open',
      asRecord.u4.readOnly === false && asRecord.u4.edit === false],
    ['pressing Edit opens that plot',
      asRecord.editing.readOnly === false && asRecord.editing.cancel === true],
    ['and not the plot beside it', asRecord.u4WhileU3Open.readOnly === false],
    ['Cancel puts back what the database holds',
      /Drone flew/.test(asRecord.cancelled.value) && asRecord.cancelled.readOnly === true],

    // ── locked
    ['the reason box is still live on a locked report', locked.note === true],
    ['and so is its own Save', locked.itsSave === true],
    ['while the tab\'s own Save stays locked', locked.tabSave === false],
    ['and so do its figures', locked.aCulledBox === false],

    // ── where it landed
    ['one reason writes one record', landed.writes === 1],
    ['the plot it was written for', landed.onU3 === true && landed.note === true],
    ['not the other plot', landed.onU4 === false],
    ['and not that plot\'s D-TONE row', landed.onDtone === false],
    ['nothing else on the record moves — map, date, figures all kept',
      landed.keptTheRest === true],
    ['it says what it saved', partial.toasts.some(t => /1 reason\(s\) saved/i.test(t.m))],

    // ── the flag
    ['explaining the last plot leaves none unexplained', cleared.stillUnexplained === 0],
    ['and takes the batch off Amendment Needed',
      (cleared.deletes || []).some(d => d.table === 'shared_inventory_logs')],

    ['no page errors beyond the harness\'s own MJMReview race',
      errs.every(e => /MJMReview is not defined/.test(e))],
  ];
  let bad = 0;
  console.log('');
  for (const [l, p] of checks) { console.log((p ? 'ok   ' : 'FAIL ') + l); if (!p) bad++; }
  await browser.close(); server.close();
  process.exit(bad ? 1 : 0);
})();
