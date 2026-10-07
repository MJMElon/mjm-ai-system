/* An adjustment on a plot nothing reached writes the transplant row.

   B8 had +140 raised against Transplanting and no transplanting record at
   all -- seedlings standing in a plot that nothing says how they got to.
   Filing that as an adjustment leaves the plot unattributed forever. So
   the form asks the two things it cannot work out -- which tray they came
   out of, and the drone map -- and approving the adjustment writes the
   row: plot, date and quantity off the adjustment, tray and map off the
   answers.

   What this drives, on the real tab 7 form:
     · a POSITIVE adjustment on a plot with no transplant row asks for a
       source tray and a drone map
     · both are required; the save refuses without either and writes
       nothing
     · a NEGATIVE one does not ask -- taking seedlings off a plot that has
       none recorded is a different thing and stays an adjustment
     · a plot that HAS trays gets the split table, not this
     · the answers ride on the adjustment as TxTray / TxMap, and do not
       leak into the Reason column
     · approving writes a Transplanted row with the right plot, date,
       quantity, tray and map, and marks the adjustment TxRow:<id>
     · and that row THEN STOPS COUNTING AS AN ADJUSTMENT, or the same 140
       would be in B8 twice

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/adjust_creates_plot.cjs
   with `python3 -m http.server 8777` serving the repository root.        */
const { chromium } = require('playwright');

const BATCH = '242';
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

async function setSelect(page, sel, value) {
  await page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    if (!Array.from(el.options).some(o => o.value === v)) el.add(new Option(v, v));
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [sel, value]);
  await page.waitForTimeout(200);
}

const SEEDS_ROW = {
  id: 'sr-1', batch_name: BATCH, transaction_type: 'Seeds_Received',
  breed_name: 'DxP', quantity_change: 10000, plot_name: 'Pre-Nursery',
  transaction_date: '2026-01-05', created_at: '2026-01-05T02:00:00.000Z',
  workers: 4, remark: 'Supplier: AAR. MPOB: 123-456'
};
// B7 was transplanted into; B8 was not.
const TX_ROWS = [
  { id: 'tx1', transaction_type: 'Transplanted', plot_name: 'B7', quantity_change: 3000,
    transaction_date: '2025-06-20', created_at: '2025-06-20T02:00:00Z',
    remark: 'Transplanted from tray [P4] to Main Plot [B7]. Date: 2025-06-20' }
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', e => { if (!/MJMReview/.test(e.message)) console.log('  [page error] ' + e.message); });

  await page.addInitScript(({ seedsRow, txRows }) => {
    window.__INSERTS = []; window.__UPDATES = []; window.__TOASTS = []; window.__UPLOADS = [];
    window.__CAL_ROWS = [];
    window.__SEEDS_ROWS = [seedsRow];
    window.__TX_ROWS = txRows;
    let nextId = 900;

    function makeQuery() {
      const st = { filters: {}, types: null, upd: null, ins: null };
      const rows = () => {
        if (st.filters.transaction_type === 'Stock_Calibration') return window.__CAL_ROWS;
        if (st.filters.transaction_type === 'Seeds_Received')    return window.__SEEDS_ROWS;
        if (st.types && st.types.indexOf('Transplanted') >= 0)   return window.__TX_ROWS;
        if (st.filters.id) return window.__CAL_ROWS.filter(r => r.id === st.filters.id);
        return [];
      };
      const q = new Proxy({}, {
        get(_, p) {
          if (p === 'then') return (a, b) => Promise.resolve({ data: rows(), error: null }).then(a, b);
          if (p === 'in') return (c, v) => { if (c === 'transaction_type') st.types = v; return q; };
          if (p === 'insert') return r => {
            const list = [].concat(r).map(x => Object.assign({ id: 'new-' + (nextId++) }, x));
            window.__INSERTS.push(...list);
            // keep the fixture in step so a re-read sees what was written
            list.forEach(x => { if (x.transaction_type === 'Transplanted') window.__TX_ROWS.push(x); });
            st.ins = list;
            const out = Promise.resolve({ data: list, error: null });
            return { select: () => out, then: (a, b) => out.then(a, b) };
          };
          if (p === 'update') return r => { st.upd = r; return q; };
          if (p === 'eq') return (c, v) => {
            if (st.upd) { window.__UPDATES.push({ id: v, row: st.upd }); st.upd = null; return Promise.resolve({ data: [], error: null }); }
            st.filters[c] = v; return q;
          };
          if (p === 'maybeSingle' || p === 'single')
            return () => Promise.resolve({ data: rows()[0] || null, error: null });
          return () => q;
        }
      });
      return q;
    }

    const user = { id: 'u1', email: 'coco@mjmnursery.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery,
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      storage: { from: () => ({
        upload: async (path, blob, opts) => { window.__UPLOADS.push({ path, type: opts && opts.contentType }); return { data: { path }, error: null }; },
        getPublicUrl: (path) => ({ data: { publicUrl: 'https://files.test/' + path } }),
        remove: async () => ({ error: null })
      }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, { seedsRow: SEEDS_ROW, txRows: TX_ROWS });

  await page.route('**/shared_access.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user')   return () => ({ id: 'u1', email: 'coco@mjmnursery.com', full_name: 'Coco Lau' });
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

  await page.goto('http://localhost:8777/operation/operation_batch_detail.html?id=' + BATCH,
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.saveCalibration === 'function'
                                && typeof window.approveCalibration === 'function', { timeout: 15000 });
  await page.evaluate(() => {
    window._t7IsAdmin = () => true;
    window.mjmLoadNames = async () => {};
    window.mjmWho = (e) => String(e || '').split('@')[0] || '—';
    window.showToast = (m, t) => { window.__TOASTS.push({ m, t }); };
    window._t7PopulatePlotDropdown = () => {};
    window.syncAdjustmentBars = async () => {};
    window.confirm = () => true;
  });
  await page.evaluate(b => window.renderCalibrationHistory(b), BATCH);
  await page.evaluate(() => window.switchTab(7));
  await page.waitForSelector('#t7-cal-date', { timeout: 5000 });

  console.log('\nA plot nothing reached is asked about');
  await setSelect(page, '#t7-cal-report', 'Transplanting');
  await page.fill('#t7-cal-qty', '140');
  await setSelect(page, '#t7-cal-plot', 'B8');
  await page.waitForSelector('#t7-newplot-tray', { state: 'attached', timeout: 5000 });
  checkTrue('it says the plot has no transplanting record',
            /B8 has no transplanting record/i.test(await page.textContent('#t7-cal-trays')));
  checkTrue('…and that approving will create one',
            /this will create one/i.test(await page.textContent('#t7-cal-trays')));
  check('it asks for a source tray', await page.locator('#t7-newplot-tray').count(), 1);
  check('and for a drone map', await page.locator('#t7-newplot-map-file').count(), 1);
  check('the quantity box is still typable — this is not the split table',
        await page.getAttribute('#t7-cal-qty', 'readonly'), null);

  console.log('\nA plot that HAS trays gets the split table instead');
  await setSelect(page, '#t7-cal-plot', 'B7');
  check('no create-the-plot panel', await page.locator('#t7-newplot-tray').count(), 0);
  check('the split table is there', await page.locator('#t7-cal-trays .t7-tray-adj').count(), 1);

  console.log('\nTaking seedlings OFF such a plot is a different thing');
  await setSelect(page, '#t7-cal-plot', 'B8');
  await page.fill('#t7-cal-qty', '-140');
  await page.evaluate(() => window.t7SyncTrayPanel());
  await page.waitForTimeout(250);
  check('a negative adjustment does not offer to create a row',
        await page.locator('#t7-newplot-tray').count(), 0);
  checkTrue('it says so instead',
            /Nothing has been transplanted into/i.test(await page.textContent('#t7-cal-trays')));

  console.log('\nBoth answers are required');
  await page.fill('#t7-cal-qty', '140');
  await page.evaluate(() => window.t7SyncTrayPanel());
  await page.waitForSelector('#t7-newplot-tray', { state: 'attached', timeout: 5000 });
  await page.fill('#t7-cal-reason', 'Move to B8');
  await page.fill('#t7-cal-date', '2025-06-20');
  await setSelect(page, '#t7-newplot-tray', 'P4');

  await page.evaluate(() => { window.__INSERTS = []; window.__TOASTS = []; });
  await page.evaluate(() => window.saveCalibration());
  await page.waitForTimeout(300);
  let res = await page.evaluate(() => ({ ins: window.__INSERTS.length, t: window.__TOASTS.slice(-1)[0] || {} }));
  check('no map means nothing is written', res.ins, 0);
  check('and it is an error', res.t.t, 'error');
  checkTrue('naming the map', /drone map/i.test(res.t.m));

  // Attach it the way somebody does — the handler reads the file itself.
  await page.setInputFiles('#t7-newplot-map-file', {
    name: 'b8-map.jpg', mimeType: 'image/jpeg',
    buffer: Buffer.from('ffd8ffe000104a46494600', 'hex')
  });
  await page.waitForTimeout(250);
  check('the map shows as attached once picked',
        await page.evaluate(() => !document.getElementById('t7-newplot-map-done').classList.contains('hidden')), true);
  await setSelect(page, '#t7-newplot-tray', '');
  await page.evaluate(() => { window.__INSERTS = []; window.__TOASTS = []; });
  await page.evaluate(() => window.saveCalibration());
  await page.waitForTimeout(300);
  res = await page.evaluate(() => ({ ins: window.__INSERTS.length, t: window.__TOASTS.slice(-1)[0] || {} }));
  check('no tray means nothing is written', res.ins, 0);
  checkTrue('naming the tray', /which tray/i.test(res.t.m));

  console.log('\nSaving carries the answers on the adjustment');
  await setSelect(page, '#t7-newplot-tray', 'P4');
  await page.evaluate(() => { window.__INSERTS = []; window.__UPLOADS = []; window.__TOASTS = []; });
  await page.evaluate(() => window.saveCalibration());
  await page.waitForFunction(() => window.__INSERTS.length > 0, { timeout: 8000 });
  const saved = await page.evaluate(() => ({ ins: window.__INSERTS, up: window.__UPLOADS }));
  check('one adjustment row', saved.ins.length, 1);
  check('…still a Stock_Calibration on the plot',
        { t: saved.ins[0].transaction_type, p: saved.ins[0].plot_name, q: saved.ins[0].quantity_change },
        { t: 'Stock_Calibration', p: 'B8', q: 140 });
  check('the map was uploaded, not held in a variable', saved.up.length, 1);
  checkTrue('…into the transplant maps folder', /^transplant_maps\/242\//.test(saved.up[0].path));
  checkTrue('the remark carries the tray', /TxTray:P4\./.test(saved.ins[0].remark));
  checkTrue('…and the map url', /TxMap:https:\/\/files\.test\//.test(saved.ins[0].remark));

  const parsed = await page.evaluate(r =>
    window._parseCalibration({ id: 'x', quantity_change: 140, remark: r }), saved.ins[0].remark);
  check('none of it leaks into the Reason column', parsed.reason, 'Move to B8');
  check('the tray is read back', parsed.txTray, 'P4');
  check('nothing has been created yet', parsed.txRow, '');

  console.log('\nApproving writes the transplanting row');
  await page.evaluate(remark => {
    window.__CAL_ROWS = [{
      id: 'cal-b8', batch_name: '242', transaction_type: 'Stock_Calibration',
      plot_name: 'B8', quantity_change: 140, transaction_date: '2025-06-20',
      created_at: '2026-09-24T02:00:00Z', last_edited_by: null, remark
    }];
    window.__INSERTS = []; window.__UPDATES = []; window.__TOASTS = [];
  }, saved.ins[0].remark);
  /* Spy on the list rebuild. syncAdjustmentBars only recolours rows that are
     already drawn; the transplanting list is rebuilt from the database by
     syncTab3, so without it a row written a moment ago is not on screen and it
     looks like nothing happened. */
  await page.evaluate(() => {
    window.__SYNCED = 0;
    const real = window.syncTab3;
    window.syncTab3 = async function () { window.__SYNCED++; return real && real.apply(this, arguments); };
  });
  await page.evaluate(() => window.approveCalibration('cal-b8'));
  await page.waitForFunction(() => window.__INSERTS.length > 0, { timeout: 8000 });
  await page.waitForTimeout(300);
  const made = await page.evaluate(() => ({ ins: window.__INSERTS, upd: window.__UPDATES }));
  check('one transplanting row was written', made.ins.length, 1);
  const tx = made.ins[0];
  check('…of the right kind, plot and date',
        { t: tx.transaction_type, p: tx.plot_name, d: tx.transaction_date },
        { t: 'Transplanted', p: 'B8', d: '2025-06-20' });
  /* NOUGHT, not 140. Nobody keyed a transplant into B8 — that is why it had
     no record. The 140 is what the ADJUSTMENT put there, so it stays in the
     adjustment and the row is only where it lands:
         Qty 0 · Adjustment +140 · Final 140 */
  check('…with a quantity of nought', tx.quantity_change, 0);
  checkTrue('…naming the tray the way tab 3 reads it',
            /Transplanted from tray \[P4\] to Main Plot \[B8\]\./.test(tx.remark));
  checkTrue('…carrying the drone map', /MapUrl:https:\/\/files\.test\//.test(tx.remark));
  checkTrue('…and saying which adjustment put it there', /FromAdjustment:cal-b8/.test(tx.remark));
  checkTrue('…and who approved that', /CalApprovedBy:coco@mjmnursery\.com/.test(tx.remark));

  const approvalUpd = made.upd.filter(u => u.id === 'cal-b8');
  checkTrue('the adjustment is marked approved', approvalUpd.some(u => /APPROVED by/.test(u.row.remark || '')));
  checkTrue('…and linked to the row it created', approvalUpd.some(u => /TxRow:new-/.test(u.row.remark || '')));

  console.log('\nAnd the list is rebuilt, so the row is on screen straight away');
  check('the transplanting list was reloaded after approval',
        await page.evaluate(() => window.__SYNCED) > 0, true);
  await page.waitForSelector('#t3-saved-rows-list .t3-adj-cell[data-plot="B8"]',
                             { state: 'attached', timeout: 8000 });
  const onScreen = await page.evaluate(() => {
    const c = document.querySelector('#t3-saved-rows-list .t3-adj-cell[data-plot="B8"]');
    const row = c.closest('[id^="t3-row-view-"]');
    return {
      tray: c.getAttribute('data-tray'),
      qty:  c.getAttribute('data-qty'),
      locked: /calibration approved by/i.test(row.lastElementChild.innerHTML
                 .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    };
  });
  check('B8 is in the list, from P4, holding nought, and marked as the adjustment\'s',
        onScreen, { tray: 'P4', qty: '0', locked: true });

  console.log('\nThe adjustment goes on counting — the row does not take it over');
  const counted = await page.evaluate(() => {
    const r = window._parseCalibration({ id: 'a', quantity_change: 140,
      remark: 'Report: Transplanting. Plot: B8. Move to B8. TxTray:P4. TxMap:https://x/y.jpg TxRow:new-900 [APPROVED by coco@mjm on 2026-09-24]' });
    return { txRow: r.txRow, txTray: r.txTray, approved: r.approved, qty: r.qty, plot: r.plot };
  });
  check('the link back to its row is kept', counted.txRow, 'new-900');
  check('…so a second row is never created for it', counted.txRow !== '', true);
  check('but it is still an approved adjustment of +140 on the plot',
        { approved: counted.approved, qty: counted.qty, plot: counted.plot },
        { approved: true, qty: 140, plot: 'B8' });

  /* The two places that decide whether an adjustment counts. Both must take
     it — the row it wrote carries 0, so nothing is counted twice, and hiding
     the adjustment would leave the plot reading 0 instead of 140. */
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'operation',
                                                              'operation_batch_detail.html'), 'utf8');
  check('the adjustment maps do not skip a row-writing adjustment',
        /rows\.filter\(r => r\.approved && !r\.txRow\)/.test(src), false);
  checkTrue('they take every approved one', /rows\.filter\(r => r\.approved\)\.forEach/.test(src));
  check('and neither does the per-row painter', /if \(r\.txRow\) return;/.test(src), false);
  checkTrue('which pairs it with its row by the tray it answered',
            /_t3TrayKey\(r\.tray \|\| r\.txTray\)/.test(src));

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
