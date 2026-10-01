/* The Work Maintenance List in two parts, and what the second one does.

   A Field Conductor going through the morning's submissions gives one of two
   answers. The approved ones have always flowed into this page; the refused
   ones went nowhere at all — loadFieldRecords reads verified rows and nothing
   else — so a refusal was invisible to the office and the only way to undo
   one was to find the record again on a phone.

   This drives the real page: a record sent back, shown in its own part of the
   list with the reason on it, then approved (and it flows up into the
   schedule row it belongs to), then edited, then deleted along with that
   schedule row. The last section leaves the browser behind and checks the
   PAIRING rule on its own, because the delete depends on it picking out
   exactly one row and refusing to guess — and that is the one failure a
   confirm box cannot take back.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/maint_sent_back.cjs
   with a static server on 8777 serving the repository root:
     python3 -c "import http.server as h,socketserver as s; \
       s.ThreadingTCPServer.allow_reuse_address=True; \
       s.ThreadingTCPServer(('',8777), h.SimpleHTTPRequestHandler).serve_forever()"
                                                                            */
const { chromium } = require('playwright');
const path = require('path');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }
function checkFalse(name, got) { check(name, !!got, false); }

/* The page opens on the CURRENT month, which is what a person coming to it
   sees — so the fixtures are dated into it rather than into a month the page
   would have to be steered to. The 10th is week 2 of the month, which is the
   round the office row below is scheduled for. */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _now  = new Date();
const YM    = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
const WORK_DATE   = `${YM}-10`;
const MONTH_LABEL = `${MONTHS[_now.getMonth()]} ${_now.getFullYear()}`;
const SHOWN_DATE  = `10 ${MONTHS[_now.getMonth()]} ${_now.getFullYear()}`;
const PD    = 'Penyemburan racun kulat dan serangga';
const CHEM  = 'Manzate 50gm + Bond 15mL';
const RACUN = `Round 2: ${CHEM}`;

/* B8's morning, refused — the reason, the worker and the quantity all on it. */
const sentBack = () => ({
  id: 901, work_date: WORK_DATE, nursery_name: 'BNN', plot_name: 'B8',
  work_type: 'pd', jenis: PD, chemical: CHEM, batch_name: '252',
  week_no: 2, schedule_month: MONTH_LABEL, qty: 1400, remark: 'Sprayed both sides',
  worked_by: 'Ali Bin Hassan', reported_by: 'Nelos FC',
  verified_at: null, verified_by: null,
  rejected_at: `${WORK_DATE}T09:00:00.000Z`, rejected_by: 'Elon Ting',
  reject_reason: 'Photo does not show the plot'
});
/* Another nursery's, sent back too. Must not appear on BNN's screen. */
const otherNursery = () => Object.assign(sentBack(), {
  id: 902, nursery_name: 'UNN1', plot_name: 'U3',
  reject_reason: 'Wrong plot', worked_by: 'Someone Else'
});

async function boot(opts) {
  const o = opts || {};
  const browser = o.browser;
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept().catch(() => {}); });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript(({ field, missing }) => {
    try {
      localStorage.setItem('mjm_maint_nursery', 'BNN');
      localStorage.removeItem('mjm_maint_month');
    } catch (_) {}
    window.__DB = {
      nops_maint_field_records: field,
      nops_maint_records: [{ id: 1, records: [] }]
    };
    window.__WRITES  = [];
    window.__MISSING = missing || [];
    // Chart.js is on a blocked CDN; the analytics view is not what this is about.
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };

    function makeQuery(table) {
      const st = { nots: [], eqs: [], op: 'select', cols: '', patch: null, single: false };
      const base = () => (window.__DB[table] || (window.__DB[table] = []));
      const rows = () => {
        let out = base().slice();
        st.nots.forEach(([c, op, v]) => {
          if (op === 'is' && v === null) out = out.filter((r) => r[c] != null);
        });
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return out;
      };
      const absent = (keys) => keys.map((k) => String(k).trim())
                                   .find((k) => window.__MISSING.includes(k));
      /* PostgREST hands back the columns that were ASKED FOR and no others,
         which is the whole point of a fallback select — a stub that returns
         the whole row makes "the column is not there" untestable. */
      const project = (out) => {
        const cols = String(st.cols || '').split(',').map((c) => c.trim()).filter(Boolean);
        if (!cols.length || cols.includes('*')) return out;
        return out.map((r) => {
          const o = {};
          cols.forEach((c) => { if (c in r) o[c] = r[c]; });
          return o;
        });
      };
      const run = () => {
        if (st.op === 'select') {
          const bad = absent(String(st.cols || '').split(','));
          if (bad) return { data: null, error: { message: `column ${table}.${bad} does not exist` } };
          const out = project(rows());
          return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
        }
        if (st.op === 'update') {
          const bad = absent(Object.keys(st.patch || {}));
          if (bad) return { data: null, error: { message: `column "${bad}" of relation "${table}" does not exist` } };
          const hit = rows();
          hit.forEach((r) => Object.assign(r, st.patch));
          window.__WRITES.push({ table, op: 'update', patch: JSON.parse(JSON.stringify(st.patch)),
                                 ids: hit.map((r) => r.id) });
          return { data: hit, error: null };
        }
        if (st.op === 'delete') {
          const ids = rows().map((r) => r.id);
          window.__DB[table] = base().filter((r) => !ids.includes(r.id));
          window.__WRITES.push({ table, op: 'delete', ids });
          return { data: null, error: null };
        }
        if (st.op === 'upsert' || st.op === 'insert') {
          window.__WRITES.push({ table, op: st.op, row: JSON.parse(JSON.stringify(st.patch)) });
          return { data: null, error: null };
        }
        return { data: [], error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then')   return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'select') return (c) => { st.cols = c || ''; return q; };
        if (p === 'not')    return (c, op, v) => { st.nots.push([c, op, v]); return q; };
        if (p === 'eq')     return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'update') return (patch) => { st.op = 'update'; st.patch = patch; return q; };
        if (p === 'delete') return () => { st.op = 'delete'; return q; };
        if (p === 'upsert') return (row) => { st.op = 'upsert'; st.patch = row; return q; };
        if (p === 'insert') return (row) => { st.op = 'insert'; st.patch = row; return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range')  return () => Promise.resolve(run());
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery,
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser:    async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      storage: { from: () => ({
        upload: async (p) => ({ data: { path: p }, error: null }),
        getPublicUrl: (p) => ({ data: { publicUrl: 'https://files.test/' + p } }),
        remove: async () => ({ error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, { field: o.field || [], missing: o.missing || [] });

  /* The page redirects when MJMAccess denies, and the Setting tab and the
     admin-only buttons hang off isAdminOf — so it answers yes to everything,
     which is the person this screen is for. */
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html',
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderRejectedSubmissions === 'function'
                                && typeof window.approveSubmission === 'function',
                             { timeout: 20000 });
  // The sent-back list is drawn from the boot read, so wait for the read
  // rather than for a timer.
  await page.waitForFunction(() => {
    const b = document.getElementById('rej-body');
    return b && b.children.length > 0;
  }, { timeout: 20000 });
  // The page lands on the Schedule tab; the list being tested is behind
  // Work Record, so go there the way a person does.
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForSelector('#recview-list', { state: 'visible', timeout: 10000 });
  return { page, dialogs };
}

/* Add an office row the way a person does — the Add Record modal and its own
   Save, not a poke at the array behind it. Returns nothing; the row is in
   `records`, which is a lexical binding and deliberately out of reach. */
async function addScheduleRow(page, row) {
  await page.evaluate((r) => {
    openRecModal();
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('rf-tarikh', '');
    set('rf-jenis', r.jenis);
    set('rf-racun', r.racun);
    set('rf-plot', r.plot);
    set('rf-batch', '');
    set('rf-qty', '');
    saveRec();
  }, row);
}

const rejRows = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#rej-body tr')].map((tr) =>
    [...tr.children].map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim())));

const recText = (page) => page.evaluate(() =>
  (document.getElementById('rec-body').textContent || '').replace(/\s+/g, ' ').trim());

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* ── 1. THE SECOND PART OF THE LIST ──────────────────────────────── */
  console.log('\nThe sent-back part of the Work Maintenance List');
  {
    const { page } = await boot({ browser, field: [sentBack(), otherNursery()] });

    const rows = await rejRows(page);
    check('one row — this nursery’s sent-back record, and only it', rows.length, 1);
    checkTrue('…dated the day the work was done', rows[0][0].includes(SHOWN_DATE));
    checkTrue('…on the plot it was refused for', rows[0][3] === 'B8');
    checkTrue('…carrying the batch the worker ticked', rows[0][4].includes('252'));
    checkTrue('…and the quantity', rows[0][5].includes('1,400'));
    checkTrue('…who did it', rows[0][6].includes('Ali Bin Hassan'));
    checkTrue('THE REASON IT CAME BACK', rows[0][7].includes('Photo does not show the plot'));
    checkTrue('…and who sent it back', rows[0][8].includes('Elon Ting'));

    const btns = rows[0][9];
    checkTrue('the button is APPROVE', /Approve/i.test(btns));
    checkFalse('…and not Check, which locks an office row and is a different thing',
               /Check/i.test(btns));
    checkTrue('Edit is offered', /Edit/i.test(btns));
    checkTrue('…and Del', /Del/i.test(btns));

    const secs = await page.evaluate(() => ({
      approvedOpen: document.getElementById('recsec-approved').classList.contains('active'),
      rejectedOpen: document.getElementById('recsec-rejected').classList.contains('active'),
      tabs: [...document.querySelectorAll('#recview-list > .subtabs-bar .subtab-btn')]
              .map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim())
    }));
    check('the list has two sections, named on their own tabs',
          secs.tabs, ['✓ Approved', '⛔ Rejected 1']);
    checkTrue('…and opens on the approved one', secs.approvedOpen);
    checkFalse('…with the sent-back one behind its tab, not stacked below',
               secs.rejectedOpen);

    const badge = await page.evaluate(() => {
      const el = document.getElementById('rej-count');
      return { text: (el.textContent || '').trim(), shown: el.style.display !== 'none',
               onTab: !!el.closest('#recsec-btn-rejected'),
               tip: document.getElementById('recsec-btn-rejected').title };
    });
    check('the count is on the tab, so a refusal is seen from the other section',
          [badge.text, badge.onTab, badge.shown], ['1', true, true]);
    checkTrue('…and says what it is on hover', /1 sent back/.test(badge.tip));

    await page.click('#recsec-btn-rejected');
    const opened = await page.evaluate(() => ({
      approved: document.getElementById('recsec-approved').classList.contains('active'),
      rejected: document.getElementById('recsec-rejected').classList.contains('active'),
      rowsVisible: document.getElementById('rej-body').offsetParent !== null
    }));
    check('the tab opens the sent-back section and closes the other',
          [opened.rejected, opened.approved, opened.rowsVisible], [true, false, true]);

    checkTrue('the other nursery’s record is NOT on this screen',
              !(await page.evaluate(() => document.getElementById('rej-body').textContent)).includes('Wrong plot'));

    /* The two parts answer the same question, so the same filters apply. */
    await page.evaluate(() => {
      document.getElementById('rf-filter-plot').innerHTML = '<option value="B1">B1</option>';
      document.getElementById('rf-filter-plot').value = 'B1';
      renderRecords();
    });
    const filtered = await rejRows(page);
    check('filtering to another plot empties it', filtered.length, 1);
    checkTrue('…with "no records found", not "nothing was sent back" — '
            + 'something WAS, it is just filtered out',
              /No records found/i.test(filtered[0][0]));
    await page.evaluate(() => {
      document.getElementById('rf-filter-plot').value = '';
      renderRecords();
    });
    await page.close();
  }

  /* ── 2. NOTHING SENT BACK ────────────────────────────────────────── */
  console.log('\nWith nothing sent back');
  {
    // Only the other nursery's record exists, so BNN's half of the list is
    // the empty state — which is still a row in #rej-body, so the boot
    // helper's wait holds just the same.
    const { page: p2 } = await boot({ browser, field: [otherNursery()] });
    const rows = await rejRows(p2);
    check('one line, and it is the empty state', rows.length, 1);
    checkTrue('…which says nothing was sent back for this nursery',
              /Nothing has been sent back/i.test(rows[0][0]));
    const badge = await p2.evaluate(() =>
      document.getElementById('rej-count').style.display);
    check('…and no count badge, because a "0" badge says nothing happened',
          badge, 'none');
    await p2.close();
  }

  /* ── 3. APPROVE ──────────────────────────────────────────────────── */
  console.log('\nApproving one');
  {
    const { page, dialogs } = await boot({ browser, field: [sentBack()] });
    await addScheduleRow(page, { jenis: PD, racun: RACUN, plot: 'B8' });

    const before = await recText(page);
    checkTrue('the scheduled row is there, waiting', before.includes('B8'));
    checkFalse('…with no date on it, because nothing has been signed off',
               before.includes(SHOWN_DATE));

    dialogs.length = 0;
    await page.evaluate(() => approveSubmission(901));
    await page.waitForFunction(() => {
      const b = document.getElementById('rej-body');
      return b && /Nothing has been sent back/i.test(b.textContent || '');
    }, { timeout: 10000 });

    checkTrue('it asks first, naming the job', /Plot B8/.test(dialogs[0] || ''));

    const writes = await page.evaluate(() =>
      window.__WRITES.filter((w) => w.table === 'nops_maint_field_records' && w.op === 'update'));
    check('one write, to the record that was sent back', writes.length, 1);
    check('…on that record', writes[0].ids, [901]);
    checkTrue('…signed', !!writes[0].patch.verified_at);
    check('…by whoever is logged in', writes[0].patch.verified_by, 'Elon Ting');
    check('…and the refusal is CLEARED, not left beside the signature',
          [writes[0].patch.rejected_at, writes[0].patch.rejected_by, writes[0].patch.reject_reason],
          [null, null, null]);

    const after = await recText(page);
    checkTrue('IT FLOWED BACK INTO THE APPROVED LIST — the scheduled row now '
            + 'carries the day it was worked', after.includes(SHOWN_DATE));
    checkTrue('…the batch the worker ticked', after.includes('252'));
    checkTrue('…and the quantity he counted', after.includes('1,400'));
    await page.close();
  }

  /* ── 4. DELETE, AND THE SCHEDULED ROW WITH IT ────────────────────── */
  console.log('\nDeleting one');
  {
    const { page, dialogs } = await boot({ browser, field: [sentBack()] });
    await addScheduleRow(page, { jenis: PD, racun: RACUN, plot: 'B8' });
    await addScheduleRow(page, { jenis: 'Merumput', racun: 'Round 1: Hand weeding', plot: 'B9' });

    dialogs.length = 0;
    await page.evaluate(() => deleteSubmission(901));
    await page.waitForFunction(() => !(window.__DB.nops_maint_field_records || [])
      .some((r) => r.id === 901), { timeout: 10000 });

    const asked = dialogs[0] || '';
    checkTrue('it asks first', /Delete this record/i.test(asked));
    checkTrue('…naming the record', /Plot B8/.test(asked));
    checkTrue('…AND NAMING THE SCHEDULED ROW THAT GOES WITH IT',
              asked.includes(RACUN) && /scheduled row it is paired to/i.test(asked));
    checkTrue('…and saying it cannot be undone', /cannot be undone/i.test(asked));

    const del = await page.evaluate(() =>
      window.__WRITES.filter((w) => w.table === 'nops_maint_field_records' && w.op === 'delete'));
    check('the record is gone from the database', del.length, 1);
    check('…that record', del[0].ids, [901]);

    const after = await recText(page);
    checkFalse('the scheduled row it was paired to is gone too', after.includes(RACUN));
    checkTrue('…and the OTHER plot’s row is untouched', after.includes('B9'));
    await page.close();
  }

  /* ── 5. DELETE WHERE THE PAIRING CANNOT PICK ONE ROW ─────────────── */
  console.log('\nDeleting one whose scheduled row cannot be told apart');
  {
    const { page, dialogs } = await boot({ browser, field: [sentBack()] });
    // The same job, the same plot, the same round, twice. Which of them the
    // morning belongs to is not something this page can know.
    await addScheduleRow(page, { jenis: PD, racun: RACUN, plot: 'B8' });
    await page.waitForTimeout(5);
    await addScheduleRow(page, { jenis: PD, racun: RACUN, plot: 'B8' });
    const twoRows = await page.evaluate(() =>
      (document.getElementById('rec-body').textContent.match(/Manzate/g) || []).length);
    check('two indistinguishable scheduled rows are on the page', twoRows, 2);

    dialogs.length = 0;
    await page.evaluate(() => deleteSubmission(901));
    await page.waitForFunction(() => !(window.__DB.nops_maint_field_records || [])
      .some((r) => r.id === 901), { timeout: 10000 });

    const asked = dialogs[0] || '';
    checkTrue('it says the scheduled row could not be identified',
              /could NOT be identified/i.test(asked));
    checkTrue('…and why — guessing would delete the wrong round',
              /wrong round/i.test(asked));
    checkTrue('…and that the schedule is left alone',
              /schedule is left alone/i.test(asked));

    const stillTwo = await page.evaluate(() =>
      (document.getElementById('rec-body').textContent.match(/Manzate/g) || []).length);
    check('BOTH scheduled rows are still there — nothing was deleted on a guess',
          stillTwo, 2);
    const del = await page.evaluate(() =>
      window.__WRITES.filter((w) => w.table === 'nops_maint_field_records' && w.op === 'delete'));
    check('…and the worker’s record itself did go', del.length, 1);
    await page.close();
  }

  /* ── 6. EDIT ─────────────────────────────────────────────────────── */
  console.log('\nEditing one');
  {
    const { page } = await boot({ browser, field: [sentBack()] });
    await page.evaluate(() => editSubmission(901));

    const open = await page.evaluate(() => ({
      open:  document.getElementById('rej-modal').classList.contains('open'),
      why:   (document.getElementById('rej-modal-why').textContent || '').trim(),
      note:  (document.getElementById('rej-modal-note').textContent || '').trim(),
      date:  document.getElementById('rj-date').value,
      jenis: document.getElementById('rj-jenis').value,
      chem:  document.getElementById('rj-chemical').value,
      plot:  document.getElementById('rj-plot').value,
      batch: document.getElementById('rj-batch').value,
      qty:   document.getElementById('rj-qty').value,
      worked:document.getElementById('rj-worked').value,
      remark:document.getElementById('rj-remark').value,
      save:  (document.querySelector('#rej-modal .modal-footer .btn-primary').textContent || '').trim()
    }));
    checkTrue('the form opens', open.open);
    checkTrue('…showing why it was refused', open.why.includes('Photo does not show the plot'));
    checkTrue('…and who refused it', open.why.includes('Elon Ting'));
    check('…carrying the date', open.date, WORK_DATE);
    check('…the work type', open.jenis, PD);
    check('…the chemical', open.chem, CHEM);
    check('…the plot', open.plot, 'B8');
    check('…the batch', open.batch, '252');
    check('…the quantity', open.qty, '1400');
    check('…who worked it', open.worked, 'Ali Bin Hassan');
    check('…and the remark', open.remark, 'Sprayed both sides');
    checkTrue('the save button says the record stays sent back',
              /still sent back/i.test(open.save));
    checkTrue('…and the form says changing the date moves the week it pairs against',
              /week and month/i.test(open.note));

    // Fix the plot and move the date into the first week of the month.
    const fixedDate = `${YM}-03`;
    await page.evaluate((d) => {
      const set = (id, v) => {
        const el = document.getElementById(id);
        el.value = v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('rj-plot', 'B9');
      set('rj-qty', '1200');
      set('rj-date', d);
      saveRejSubmission();
    }, fixedDate);
    await page.waitForFunction(() => window.__WRITES.some(
      (w) => w.table === 'nops_maint_field_records' && w.op === 'update'), { timeout: 10000 });

    const w = await page.evaluate(() => window.__WRITES.find(
      (x) => x.table === 'nops_maint_field_records' && x.op === 'update').patch);
    check('the corrected plot is written', w.plot_name, 'B9');
    check('…the corrected quantity', w.qty, 1200);
    check('…the corrected date', w.work_date, fixedDate);
    check('…and the WEEK follows the date rather than staying on the old one',
          w.week_no, 1);
    check('…as does the month it is paired against', w.schedule_month, MONTH_LABEL);
    check('the work_type key is kept in step with the office’s wording',
          w.work_type, 'pd');
    check('IT IS STILL SENT BACK — a correction is not a sign-off',
          [w.verified_at, w.verified_by], [undefined, undefined]);
    checkTrue('…and the reason it came back is not quietly wiped',
              !('reject_reason' in w) && !('rejected_at' in w));

    const closed = await page.evaluate(() =>
      document.getElementById('rej-modal').classList.contains('open'));
    checkFalse('the form closes', closed);
    const rows = await rejRows(page);
    checkTrue('and the row is still in the sent-back part, now reading B9',
              rows.length === 1 && rows[0][3] === 'B9');
    await page.close();
  }

  /* ── 7. A DATABASE WITHOUT THE BATCH COLUMNS ─────────────────────── */
  console.log('\nOn a database that has no batch columns yet');
  {
    const { page, dialogs } = await boot({
      browser, field: [sentBack()],
      missing: ['batch_name', 'week_no', 'schedule_month']
    });
    const rows = await rejRows(page);
    check('the list still reads — the select falls back', rows.length, 1);
    checkTrue('…showing the record', rows[0][3] === 'B8');
    checkTrue('…with no batch, because the column is not there', rows[0][4] === '—');

    await page.evaluate(() => editSubmission(901));
    dialogs.length = 0;
    await page.evaluate(() => { document.getElementById('rj-qty').value = '999'; saveRejSubmission(); });
    await page.waitForFunction(() => window.__WRITES.some(
      (w) => w.op === 'update' && w.patch && 'qty' in w.patch && !('batch_name' in w.patch)),
      { timeout: 10000 });
    const saved = await page.evaluate(() => window.__WRITES
      .filter((w) => w.op === 'update' && w.table === 'nops_maint_field_records').pop().patch);
    check('the rest of the correction is saved rather than nothing', saved.qty, 999);
    checkTrue('…and it SAYS the batch number could not be kept, rather than '
            + 'dropping it in silence',
              dialogs.some((m) => /batch number/i.test(m) && /add_maint_field_batch/.test(m)));
    await page.close();
  }

  await browser.close();

  /* ── 8. THE PAIRING RULE, ON ITS OWN ─────────────────────────────── */
  /* The delete rests on this: exactly one office row, or nothing. No browser
     — it is a pure function over two arrays, and the rule itself is the
     shared file both this page and payroll read. */
  console.log('\nWhich scheduled row a submission belongs to');
  {
    require(path.join(__dirname, '..', 'shared', 'shared_maint_field.js'));
    const F = globalThis.MJMMaintField;
    const rec = sentBack();
    const idx = F.index([rec], MONTH_LABEL);
    const paired = (rows) => {
      const pool = rows.filter((r) => F.plotKey(r.plot) === F.plotKey(rec.plot_name));
      const { pairs } = F.pair(pool, idx, { skipChecked: false });
      const ids = Object.keys(pairs);
      return ids.length === 1 ? (pool.find((r) => String(r.id) === ids[0]) || null) : null;
    };

    const one = paired([{ id: 1, jenis: PD, racun: RACUN, plot: 'B8' },
                        { id: 2, jenis: PD, racun: RACUN, plot: 'B9' }]);
    check('the round and the plot pick out one row', one && one.id, 1);

    check('two rows of the same round on the same plot pick out NOTHING',
          paired([{ id: 1, jenis: PD, racun: RACUN, plot: 'B8' },
                  { id: 2, jenis: PD, racun: RACUN, plot: 'B8' }]), null);
    check('a plot with no row this month picks out nothing',
          paired([{ id: 2, jenis: PD, racun: RACUN, plot: 'B9' }]), null);
    check('another job on the same plot and round is not it',
          paired([{ id: 3, jenis: 'Merumput', racun: 'Round 2: Hand weeding', plot: 'B8' }]), null);

    /* The round disagreeing is the normal case, not the exception — the
       office reads it off its own chemical, the phone sends the week its
       board was showing. The chemical is the way in, where it names one row. */
    const byChem = paired([{ id: 7, jenis: PD, racun: `Round 4: ${CHEM}`, plot: 'B8' }]);
    check('a round that disagrees still pairs, on the chemical', byChem && byChem.id, 7);
    check('…but not when two rows carry that chemical',
          paired([{ id: 7, jenis: PD, racun: `Round 4: ${CHEM}`, plot: 'B8' },
                  { id: 8, jenis: PD, racun: `Round 3: ${CHEM}`, plot: 'B8' }]), null);

    /* A CHECKED row is one the office has settled. applyFieldRecords skips
       those on purpose; this lookup must not, or deleting a submission whose
       row has been checked would silently leave the row behind. */
    const pool = [{ id: 5, jenis: PD, racun: RACUN, plot: 'B8', checked: 1 }];
    const { pairs } = F.pair(pool, idx, { skipChecked: false });
    check('a CHECKED row is still found, because this is the office asking',
          Object.keys(pairs), ['5']);
    check('…which is exactly what the sync does not do',
          Object.keys(F.pair(pool, idx).pairs), []);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
