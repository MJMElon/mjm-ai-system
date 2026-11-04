/* SELECT ALL ON THE SENT-BACK LIST, AND ONE DELETE.

   The office, looking at twelve rejected records in UNN 2 whose reasons are
   the same sentence over and over ("kerja belum di buat", "pekerja salah
   tekan"): *"加一个select all button，可以一次过删掉"*.

   Twelve confirms for one decision, and the decision was never per-record.
   Everything here is the shape the Nelos bulk close already has, plus the
   one thing that is this screen's own:

     1. a tick per row, and Select all takes the FILTERED list, never the
        nursery's whole backlog;
     2. a tick only stands for a row the list can show -- narrow the filter,
        change the nursery or leave the tab and it drops;
     3. ONE delete, `.in('id', …)` AND `.not('rejected_at','is',null)`, and
        the count is what came BACK: a record somebody approved since the
        list was drawn is theirs and is left alone;
     4. THE PAIRED SCHEDULED ROWS GO TOO, exactly as a single Del takes one,
        or the work comes back on next month's list as outstanding.

   Drives the real page with a stubbed database.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/many_sent_back_records_go_at_once.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

/* UNN 2's own shape, off the office screenshot: several P & D Spraying rows
   on N2 and one Manuring, all sent back by Azhar. One BNN row is in the
   fixture so a nursery filter has something to hide. */
const REJ = [
  { id: 101, work_date: '2026-10-24', plot_name: 'N2',  work_type: 'pd',      jenis: 'Penyemburan racun kulat dan serangga', chemical: 'Antracol 50gm + Bond 15mL', qty: null, worked_by: 'LUKMAN SIREGAR', nursery_name: 'UNN 2', rejected_at: '2026-10-25', rejected_by: 'Azhar', reject_reason: 'Awal udin' },
  { id: 102, work_date: '2026-10-24', plot_name: 'N2',  work_type: 'pd',      jenis: 'Penyemburan racun kulat dan serangga', chemical: 'Antracol 50gm + Bond 15mL', qty: null, worked_by: 'Awaludin',       nursery_name: 'UNN 2', rejected_at: '2026-10-24', rejected_by: 'Azhar', reject_reason: 'kerja belum di buat pekerja salah tekan bos' },
  { id: 103, work_date: '2026-10-23', plot_name: 'N14', work_type: 'pd',      jenis: 'Penyemburan racun kulat dan serangga', chemical: 'Antracol 50gm + Bond 15mL', qty: null, worked_by: 'MUSTAFA',        nursery_name: 'UNN 2', rejected_at: '2026-10-23', rejected_by: 'Azhar', reject_reason: 'Kerja belum di buat pekerja salah tekan' },
  { id: 104, work_date: '2026-11-02', plot_name: 'N7',  work_type: 'manuring',jenis: 'Membaja',                              chemical: 'Yaramila 20gm',             qty: null, worked_by: 'Suhaedi',        nursery_name: 'UNN 2', rejected_at: '2026-11-02', rejected_by: 'Azhar', reject_reason: 'Kerja belum di buat' },
  // Another nursery's. Never on UNN 2's list, so never selectable from it.
  { id: 201, work_date: '2026-10-20', plot_name: 'B1',  work_type: 'pd',      jenis: 'Penyemburan racun kulat dan serangga', chemical: 'Antracol 50gm + Bond 15mL', qty: null, worked_by: 'Someone',        nursery_name: 'BNN',   rejected_at: '2026-10-20', rejected_by: 'Lalu',  reject_reason: 'Salah plot' },
];

async function boot(browser, opts) {
  opts = opts || {};
  const page = await browser.newPage({ viewport: { width: 1700, height: 1200 } });
  const errs = [], dialogs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => {
    dialogs.push({ type: d.type(), msg: d.message() });
    const accept = opts.cancelConfirm ? false : true;
    if (d.type() === 'confirm' && accept) d.accept().catch(() => {});
    else d.dismiss().catch(() => {});
  });

  await page.addInitScript((o) => {
    window.__DELETES = [];
    const db = { rej: o.rej.map((r) => Object.assign({}, r)) };
    window.__DB = db;
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    window.jspdf = { jsPDF: class { constructor() {} setFont() {} setFontSize() {} setTextColor() {}
      setFillColor() {} setDrawColor() {} setLineWidth() {} rect() {} line() {} addPage() {}
      getTextWidth() { return 10; } splitTextToSize(t) { return [String(t)]; } text() {} save() {} } };

    const answer = (table, st) => {
      if (table !== 'nops_maint_field_records') return { data: [], error: null };

      if (st.op === 'delete') {
        /* THE STUB IS THE DATABASE HERE, so it has to honour both halves of
           the write. A stub that applied `.in` and ignored `.not` would sign
           off a delete that takes an approved record with it -- which is the
           one thing this guard exists to stop. */
        /* The single Del writes `.eq('id', …)` and the bulk one
           `.in('id', […])`. Both are honoured or section 7 reads a working
           button as a dead one. */
        const want = (st.in.id || (st.eq.id == null ? [] : [st.eq.id])).map(String);
        const hits = db.rej.filter((r) => want.includes(String(r.id))
          && (!st.notNullRejected || r.rejected_at != null));
        window.__DELETES.push({ ids: want.slice(), notNullRejected: !!st.notNullRejected,
                                returned: hits.map((r) => r.id) });
        const killed = new Set(hits.map((r) => String(r.id)));
        db.rej = db.rej.filter((r) => !killed.has(String(r.id)));
        return { data: hits.map((r) => ({ id: r.id })), error: null };
      }

      // The two reads: verified (none here) and rejected.
      const [a, b] = st.range || [0, 999];
      if (st.notNullRejected) return { data: db.rej.slice(a, b + 1), error: null };
      return { data: [], error: null };
    };

    const from = (table) => {
      const st = { op: 'select', eq: {}, in: {} };
      const p = new Proxy({}, { get(_, k) {
        if (k === 'then') return (f, g) => Promise.resolve(answer(table, st)).then(f, g);
        if (k === 'maybeSingle' || k === 'single') return () => Promise.resolve({ data: null, error: null });
        if (k === 'eq') return (c, v) => { st.eq[c] = v; return p; };
        if (k === 'in') return (c, v) => { st.in[c] = v; return p; };
        if (k === 'range') return (x, y) => { st.range = [x, y]; return p; };
        if (k === 'not') return (c, op, v) => {
          if (c === 'rejected_at' && op === 'is' && v === null) st.notNullRejected = true;
          if (c === 'verified_at') st.notNullVerified = true;
          return p;
        };
        if (k === 'delete') return () => { st.op = 'delete'; return p; };
        if (k === 'insert' || k === 'update' || k === 'upsert') return () => { st.op = k; return p; };
        return () => p; } });
      return p;
    };

    const user = { id: 'u1', email: 'azhar@x' };
    window.supabase = { createClient: () => ({
      from, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {}
    }) };
  }, { rej: REJ });

  await page.route('**/shared_access.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'azhar@x', full_name:'Azhar' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true; } });` }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**', '**/cdn.tailwindcss.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderRejectedSubmissions === 'function', { timeout: 20000 });
  await page.waitForTimeout(400);

  /* Land on the sent-back list of UNN 2, with one scheduled row that pairs
     to record 101 so the schedule half can be driven. */
  await page.evaluate(() => {
    /* UNN 2, which is where the office was looking: N1-N20 is its plot
       list, and the sent-back rows are filtered by the plot and not by the
       record's own nursery_name -- the house rule. */
    document.getElementById('global-nursery').value = 'UNN2';
    document.getElementById('global-month').value = '2026-10';
    const btn = [...document.querySelectorAll('#sm-nav .pn-tab')]
      .find(b => /switchTab\('records'/.test(b.getAttribute('onclick')));
    if (btn) btn.click();
    const tab = document.getElementById('recsec-btn-rejected');
    if (tab) tab.click();
    renderRecords();
  });
  await page.waitForTimeout(400);
  return { page, errs, dialogs };
}

/* The list as a person sees it: the ids with a tick, in order, plus the bar. */
/* Pressed through the page rather than by Playwright: a control that is
   missing must fail the CHECK underneath by name, not kill the harness on a
   30-second timeout -- which is the whole point of running this against the
   previous code. */
const clickIt = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  el.click();
  return true;
}, sel);

const listOf = (page) => page.evaluate(() => {
  /* A DATA ROW IS COUNTED WITHOUT ASKING FOR A BOX, because the previous
     page has no boxes at all -- counting rows by their checkbox would read
     the whole list as empty there and every check below would pass or fail
     for the wrong reason. */
  const rows = [...document.querySelectorAll('#rej-body tr')]
    .filter(tr => !tr.querySelector('.rej-none'));
  const all = document.getElementById('rej-all');
  const bar = document.getElementById('rej-bulk');
  return {
    plots: rows.map(tr => (tr.children[3] || {}).textContent ? tr.children[3].textContent.trim() : ''),
    boxes: rows.filter(tr => tr.querySelector('input[type=checkbox]')).length,
    ticked: rows.filter(tr => { const i = tr.querySelector('input[type=checkbox]'); return i && i.checked; }).length,
    picked: rows.filter(tr => tr.classList.contains('rej-row-picked')).length,
    barShown: !!bar && bar.style.display !== 'none',
    barText: (document.getElementById('rej-bulk-n') || {}).textContent || '',
    delText: (document.getElementById('rej-bulk-del') || {}).textContent || '',
    allChecked: !!(all && all.checked),
    allIndet: !!(all && all.indeterminate),
    selected: typeof _rejSelCount === 'function' ? _rejSelCount() : -1,
  };
});

/* -1 where the selection does not exist at all, which is what the previous
   page answers. Never a throw: the check underneath has to say so by name. */
const selCount = (page) => page.evaluate(() =>
  (typeof _rejPickedIds === 'undefined') ? -1 : _rejPickedIds.size);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // ── 1. The bar is not there until something is ticked ─────────────────
  console.log('\n1. Nothing ticked, nothing offered');
  {
    const { page, errs } = await boot(browser);
    const a = await listOf(page);
    check('the sent-back list is drawn, and every row carries a box',
      [a.plots.length, a.boxes], [4, 4]);
    check('…with no bulk bar over it', [a.barShown, a.selected], [false, 0]);
    check('…and Select all is clear, not half-ticked', [a.allChecked, a.allIndet], [false, false]);
    check('no page errors', errs, []);
    await page.close();
  }

  // ── 2. Select all takes the list ON SCREEN ────────────────────────────
  console.log('\n2. Select all, and what it reaches');
  {
    const { page, errs } = await boot(browser);
    check('four rows to begin with', (await listOf(page)).plots.length, 4);
    await clickIt(page, '#rej-all');
    await page.waitForTimeout(250);
    const a = await listOf(page);
    check('every row on screen is ticked', [a.ticked, a.selected], [4, 4]);
    check('…the rows say so without counting the boxes', a.picked, 4);
    check('…and the bar names the count', [a.barShown, /\b4\b/.test(a.barText), /\b4\b/.test(a.delText)],
      [true, true, true]);
    /* THE OTHER NURSERY'S RECORD IS NOT IN IT. Select all is a press made
       over a list, and a nursery's whole backlog is not that list. */
    check('a record of another nursery is never selected',
      await page.evaluate(() => typeof _rejPickedIds === 'undefined'
        ? 'no selection exists' : [..._rejPickedIds].includes('201')), false);

    // Untick it again.
    await clickIt(page, '#rej-all');
    await page.waitForTimeout(250);
    check('pressing it again clears everything', (await listOf(page)).selected, 0);
    check('no page errors', errs, []);
    await page.close();
  }

  // ── 3. A tick only stands for a row the list can show ─────────────────
  console.log('\n3. A tick is dropped when its row goes');
  {
    const { page, errs } = await boot(browser);
    await clickIt(page, '#rej-all');
    await page.waitForTimeout(250);
    check('four ticked to begin with', (await listOf(page)).selected, 4);

    /* The filter select is HIDDEN by shared_cf_select.js -- the skin draws a
       button and takes the native dropdown off the screen -- so Playwright
       cannot act on it and the value is set the way the skin's own button
       sets it. */
    const setJenis = (v) => page.evaluate((x) => {
      const el = document.getElementById('rf-filter-jenis');
      el.value = x; el.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);

    // Narrow to one work type. The Manuring row leaves, and its tick with it.
    await setJenis('Membaja');
    await page.waitForTimeout(350);
    const a = await listOf(page);
    check('narrowing the filter drops the ticks of the rows it hid',
      [a.plots, a.selected], [['N7'], 1]);
    check('…and Select all reads as full again, over the list that is left',
      [a.allChecked, a.allIndet], [true, false]);

    // Widen it. The ticks do NOT come back: they were dropped, not hidden.
    await setJenis('');
    await page.waitForTimeout(350);
    const b = await listOf(page);
    check('widening it again does not resurrect them', [b.plots.length, b.selected], [4, 1]);
    check('…and Select all is half, which is what one of four is',
      [b.allChecked, b.allIndet], [false, true]);
    check('no page errors', errs, []);
    await page.close();
  }

  // ── 4. Leaving the tab drops the selection ────────────────────────────
  console.log('\n4. Leaving the tab');
  {
    const { page, errs } = await boot(browser);
    await clickIt(page, '#rej-all');
    await page.waitForTimeout(250);
    check('ticked', (await listOf(page)).selected, 4);
    await page.evaluate(() => {
      const t = document.querySelector('#recsec-btn-approved')
             || [...document.querySelectorAll('.subtab-btn')].find(b => /approved/.test(b.id || ''));
      if (t) t.click(); else switchRecSection('approved', null);
      renderRecords();
    });
    await page.waitForTimeout(300);
    check('the selection is gone when the tab is left',
      await selCount(page), 0);
    check('no page errors', errs, []);
    await page.close();
  }

  // ── 5. ONE delete, and it carries the still-rejected guard ────────────
  console.log('\n5. One write, and only of what is still sent back');
  {
    const { page, errs, dialogs } = await boot(browser);
    await clickIt(page, '#rej-all');
    await page.waitForTimeout(250);
    await clickIt(page, '#rej-bulk-del');
    await page.waitForTimeout(700);

    const d = await page.evaluate(() => window.__DELETES);
    check('ONE delete and not one per row', d.length, 1);
    /* Sorted to ask about the SET and not the order: the ids go in the
       order the list is drawn (newest work day first), which is a fact
       about the sort above and nothing this write promises. */
    check('…carrying every ticked id', ((d[0] || {}).ids || []).slice().sort(),
      ['101', '102', '103', '104']);
    /* THE GUARD IS THE HALF THAT CANNOT BE SEEN ON SCREEN. Without it a
       record somebody approved between the draw and the press is deleted
       along with the rest, and nothing anywhere says so. */
    check('…and `.not(rejected_at is null)`, so an approved row is safe',
      (d[0] || {}).notNullRejected, true);
    check('the confirm named the count before any of it ran',
      /Delete 4 record/.test((dialogs[0] || {}).msg || ''), true);
    check('…and named the records rather than only counting them',
      /Plot N2/.test((dialogs[0] || {}).msg || ''), true);
    check('…and said it cannot be undone',
      /cannot be undone/.test((dialogs[0] || {}).msg || ''), true);
    check('the selection is empty afterwards',
      await selCount(page), 0);
    check('the list is empty afterwards',
      (await listOf(page)).plots.length, 0);
    check('no page errors', errs, []);
    await page.close();
  }

  // ── 6. Cancel writes nothing ──────────────────────────────────────────
  console.log('\n6. Cancel');
  {
    const { page, errs } = await boot(browser, { cancelConfirm: true });
    await clickIt(page, '#rej-all');
    await page.waitForTimeout(250);
    await clickIt(page, '#rej-bulk-del');
    await page.waitForTimeout(500);
    check('cancelling the confirm sends no delete',
      await page.evaluate(() => window.__DELETES.length), 0);
    check('…and the ticks are still there, so one press does not undo the choosing',
      (await listOf(page)).selected, 4);
    check('no page errors', errs, []);
    await page.close();
  }

  // ── 7. One row at a time still works, and is still its own confirm ────
  console.log('\n7. The single Del is untouched');
  {
    const { page, errs, dialogs } = await boot(browser);
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('#rej-body tr')][0];
      [...row.querySelectorAll('button')].find(b => /Del/.test(b.textContent)).click();
    });
    await page.waitForTimeout(700);
    const d = await page.evaluate(() => window.__DELETES);
    check('one record goes on its own', (d[0] || {}).ids.length, 1);
    check('…and its confirm is the single one, not the bulk sentence',
      /Delete this record/.test((dialogs[0] || {}).msg || ''), true);
    check('no page errors', errs, []);
    await page.close();
  }

  // ── 8. The markup, because a box drawn by nothing is not a feature ────
  console.log('\n8. The wiring');
  {
    const fs = require('fs'), path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'nursery_ops', 'nursery_ops_maintenance.html'), 'utf8');
    const js   = fs.readFileSync(path.join(__dirname, '..', 'nursery_ops', 'plot_maintenance_script.js'), 'utf8');
    /* `applyI18n` writes textContent, so a data-i18n on the th that holds
       the box wipes it out on every language switch -- it has to be on the
       span beside it. */
    const th = (html.match(/<th class="th-left rej-th-pick">[\s\S]*?<\/th>/) || [''])[0];
    check('the Select all box is in the date heading', /id="rej-all"/.test(th), true);
    check('…and the data-i18n is on the span, never on the th',
      [/<th[^>]*data-i18n/.test(th), /<span data-i18n="rec\.tarikh"/.test(th)], [false, true]);
    check('the bar starts hidden in the markup',
      /id="rej-bulk"[^>]*display:none/.test(html), true);
    check('Select all reads the SHOWN ids and never the nursery list',
      /_rejShownIds/.test(js) && !/toggleRejAll[\s\S]{0,200}\bmine\b/.test(js), true);
    check('the delete carries both halves of the write',
      /\.in\('id'[\s\S]{0,200}\.not\('rejected_at', 'is', null\)/.test(js), true);
    /* The paired scheduled rows are the half a bulk delete most easily
       loses -- without them the work comes back next month as outstanding. */
    check('…and the scheduled rows are paired BEFORE the delete',
      js.indexOf('const pairOf = new Map()') < js.indexOf("from('nops_maint_field_records')\n    .delete()"),
      true);
  }

  await browser.close();
  console.log(fail ? `\n${pass} passed, ${fail} failed` : `\n${pass} passed, 0 failed`);
  process.exit(fail ? 1 : 0);
})();
