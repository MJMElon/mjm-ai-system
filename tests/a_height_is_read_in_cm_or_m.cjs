/* THE UNIT A HEIGHT IS READ IN, on the Monthly Audit Report.

   The office asked for it over the one column they were looking at:
   *plot avg 我要可以选择cm or换算m*.

   IT IS EVERY HEIGHT ON THE SHEET. A row reading 141.7 · 161.1 · 120 ·
   1.417 is four centimetres and one metre side by side, which is a worse
   sheet than one with no choice on it at all -- and this report has TWO
   columns headed Plot Avg, one in the Seedling Height table and one in
   Height by Batch, so moving the one in the screenshot would have been
   two answers on one page.

   WHAT HAS TO HOLD, and every one of these is a way it goes wrong:

     cm moves NOTHING. A figure is printed exactly as the auditor keyed
       it until somebody picks metres, so the sheet the office already
       reconciles against is byte for byte the sheet it was.
     PRECISION DOES NOT MOVE. 141.7 cm is 1.417 m. Two decimals reads
       1.42 and has thrown a measurement away.
     THE HEADING NAMES THE UNIT -- the control is in the toolbar and the
       toolbar does not print, so the heading is the only thing a PRINTED
       sheet can say it with.
     IT READS NOTHING. Changing a unit is not a filter: the batch half of
       this report pages the whole inventory ledger, and pressing m must
       not go near it.

   Run: node tests/a_height_is_read_in_cm_or_m.cjs
        SHOT=/tmp/r.png node tests/a_height_is_read_in_cm_or_m.cjs
*/
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT  = path.resolve(__dirname, '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png' };
const PORT  = 8791;

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('no'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got)
                             + '\n         want ' + JSON.stringify(want)); }
};

/* ── THE READINGS ────────────────────────────────────────────────────
   The office's own figures off the screenshot -- 141.7, 161.1, 120, 48.9
   -- chosen because each says something different about the conversion:

     141.7 needs THREE decimals of a metre or a tenth of a centimetre is
           rounded away;
     120   must come back 1.2 and not 1.200, the same way the cm column
           prints 120 and not 120.0;
     48.9  is under a metre, so it leads with a nought;
     P10's two readings make a PLOT AVERAGE of 151.4, which is the one
           figure here the page works out rather than reads.                */
const HEIGHT = [
  { audit_id:'HT-1', nursery:'PN', plot:'P10', batch:'250',
    sample_1:'140', sample_2:'142', sample_3:'143.1', avg_height:'141.7',
    auditor_name:'Suhaedi', date:'2026-10-21' },
  { audit_id:'HT-2', nursery:'PN', plot:'P10', batch:'253',
    sample_1:'160', sample_2:'161', sample_3:'162.3', avg_height:'161.1',
    auditor_name:'Suhaedi', date:'2026-10-21' },
  { audit_id:'HT-3', nursery:'PN', plot:'P11', batch:'260',
    sample_1:'48',  sample_2:'49',  sample_3:'49.7',  avg_height:'48.9',
    auditor_name:'Suhaedi', date:'2026-10-21' },
  { audit_id:'HT-4', nursery:'PN', plot:'P12', batch:'262',
    sample_1:'120', sample_2:'120', sample_3:'120',   avg_height:'120',
    auditor_name:'Suhaedi', date:'2026-10-21' }
];

/* One batch, sown inside the 1-to-4-month window as at 31 Oct, standing in
   P10 -- so Height by Batch reads P10's own 151.4 and the 2-month age card
   reads it too. The SECOND Plot Avg column on this report. */
const LEDGER = {
  seeds:   [{ batch_name:'250', transaction_date:'2026-08-20', created_at:'2026-08-20T00:00:00Z' }],
  planted: [{ batch_name:'250', plot_name:'P10' }],
  gone:    []
};

/* Plot Condition is the CONTROL: it has no height on it, so nothing in it
   may move and the toolbar control must not be offered for it. */
const PLOT = [
  { audit_id:'PA-1', nursery:'PN', plot:'P10', batch:'250',
    pest:'Tidak Ada', tikus:'Tidak Ada', disease:'Sedikit', warna_daun:'2',
    auditor_name:'Suhaedi', date:'2026-10-21' }
];

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on('console', (m) => { if (process.env.V) console.log('   [page]', m.text()); });

  await page.addInitScript(() => {
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: () => { const qq = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve({ data: [], error: null }).then(a, b);
        return () => qq; } }); return qq; },
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  });
  await page.route('**/audit_login_guard.js*', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAuditLogin = { requireAdmin: () => true, user: () => ({ email: 'elon.mjm@gmail.com' }) };`
  }));
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com' });
      if (k === 'load') return async () => true;
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**',
                      '**/cdn.tailwindcss.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, body: '[]' }));

  await page.goto(`http://localhost:${PORT}/audit/audit_report.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.buildModTable === 'function', { timeout: 20000 });

  /* The database at the one place this page reaches it, and a COUNT of
     every call -- section 6 is entirely about that count not moving. */
  await page.evaluate((seed) => {
    window.__calls = [];
    window.sbFetch = async (p) => {
      window.__calls.push(p);
      const t = p.split('?')[0];
      if (t === 'audit_height_records') return seed.height;
      if (t === 'audit_plot_audits')    return seed.plot;
      if (t === 'shared_inventory_logs') {
        if (p.indexOf('Seeds_Received') >= 0) return seed.led.seeds;
        if (p.indexOf('eq.Planted') >= 0)     return seed.led.planted;
        return seed.led.gone;
      }
      return [];
    };
  }, { height: HEIGHT, plot: PLOT, led: LEDGER });

  /* Every reader is guarded: on the page BEFORE this change there is no
     setHeightUnit and no unit bar, and a harness that throws on the first
     of those leaves every check under it unasked, which proves nothing
     about what the page used to do. */
  const ev = async (fn, arg) => {
    try { return await page.evaluate(fn, arg); }
    catch (e) { return { err: String(e.message || e).split('\n')[0] }; }
  };

  /* The Seedling Height table, built straight off the shipped column
     specs, as a heading row and a grid with the rowspans carried down --
     the Plot Avg cell is one cell over a plot's lines. */
  const heightTable = () => ev(() => {
    if (typeof buildModTable !== 'function') return { err: 'no buildModTable' };
    const d = document.createElement('div');
    d.innerHTML = buildModTable('height', window.__H);
    document.body.appendChild(d);
    const head = [...d.querySelectorAll('thead th')].map((x) => x.textContent.trim());
    const trs = [...d.querySelectorAll('tbody tr')].filter((t) => !t.classList.contains('total-row'));
    const grid = []; const labels = []; const carry = {};
    trs.forEach((tr) => {
      const cells = [...tr.children]; const row = []; const lab = []; let k = 0;
      for (let ci = 0; ci < head.length; ci++) {
        if (carry[ci] && carry[ci].left > 0) { row[ci] = carry[ci].text; lab[ci] = carry[ci].lab; carry[ci].left--; continue; }
        const td = cells[k++];
        if (!td) { row[ci] = null; lab[ci] = null; continue; }
        row[ci] = td.textContent.trim();
        lab[ci] = td.getAttribute('data-label');
        const rs = parseInt(td.getAttribute('rowspan') || '1', 10);
        if (rs > 1) carry[ci] = { text: row[ci], lab: lab[ci], left: rs - 1 };
      }
      grid.push(row); labels.push(lab);
    });
    d.remove();
    return { head, grid, labels };
  });

  await page.evaluate((h) => { window.__H = h; }, HEIGHT);
  const colOf = (t, h) => (t.head || []).indexOf(h);

  /* ── 1. AS IT STANDS, IN CENTIMETRES ──────────────────────────────── */
  console.log('\n1. cm is the sheet the office already has');
  const cm = await heightTable();
  check('the five height columns name cm', (cm.head || []).slice(4),
        ['S1 (cm)', 'S2 (cm)', 'S3 (cm)', 'Avg (cm)', 'Plot Avg (cm)']);
  /* PRINTED EXACTLY AS STORED, never re-rounded: a report the office
     reconciles against must not move because a control was added to it. */
  check('every reading prints exactly what was keyed',
        (cm.grid || []).map((r) => r.slice(4, 8)),
        [['140','142','143.1','141.7'], ['160','161','162.3','161.1'],
         ['48','49','49.7','48.9'],     ['120','120','120','120']]);
  const pa = colOf(cm, 'Plot Avg (cm)');
  check('and the plot average is the mean of the lines it covers',
        (cm.grid || []).map((r) => r[pa]), ['151.4','151.4','48.9','120']);

  /* ── 2. METRES, AND NOTHING ROUNDED AWAY ──────────────────────────── */
  console.log('\n2. m is the same measurement, not a coarser one');
  await ev(() => { if (typeof setHeightUnit === 'function') setHeightUnit('m'); });
  const m = await heightTable();
  check('the headings move with the figures', (m.head || []).slice(4),
        ['S1 (m)', 'S2 (m)', 'S3 (m)', 'Avg (m)', 'Plot Avg (m)']);
  check('141.7 cm is 1.417 m, to the millimetre',
        (m.grid || []).map((r) => r.slice(4, 8)),
        [['1.4','1.42','1.431','1.417'], ['1.6','1.61','1.623','1.611'],
         ['0.48','0.49','0.497','0.489'], ['1.2','1.2','1.2','1.2']]);
  /* The one that says the precision rule is doing work: at two decimals
     this cell reads 1.42 and a tenth of a centimetre is gone for good. */
  check('…and NOT 1.42, which would have thrown the reading away',
        ((m.grid || [])[0] || [])[7] === '1.42', false);
  const pam = colOf(m, 'Plot Avg (m)');
  check('the plot average converts too, worked out before it is converted',
        (m.grid || []).map((r) => r[pam]), ['1.514','1.514','0.489','1.2']);
  check('a plot under a metre leads with its nought',
        (m.grid || []).map((r) => r[pam])[2], '0.489');

  /* ── 3. ONLY THE HEIGHTS ──────────────────────────────────────────── */
  console.log('\n3. nothing that is not a height moves');
  check('the date, plot and batch read the same in both units',
        (m.grid || []).map((r) => r.slice(0, 4)),
        (cm.grid || []).map((r) => r.slice(0, 4)));
  check('a phone card says the unit too, or the figure has none on it',
        ((m.labels || [])[0] || [])[pam], 'Plot average that day (m)');

  /* ── 4. THE OTHER PLOT AVG COLUMN ─────────────────────────────────── */
  console.log('\n4. Height by Batch is the second Plot Avg, and it moves with it');
  const gen = async (mods) => ev(async (want) => {
    const g = (id) => document.getElementById(id);
    if (!g('f-from')) return { err: 'no date boxes' };
    g('f-from').value = '2026-10-01'; g('f-to').value = '2026-10-31';
    [...document.querySelectorAll('.mod-cb')].forEach((cb) => { cb.checked = false; });
    if (typeof selectedMods !== 'undefined') selectedMods.clear();
    [...document.querySelectorAll('.mod-cb')].forEach((cb) => {
      if (want.some((w) => cb.parentElement.textContent.indexOf(w) >= 0)) {
        cb.checked = true; cb.dispatchEvent(new Event('change'));
      }
    });
    [...document.querySelectorAll('.f-nurs-cb')].forEach((cb) => { cb.checked = cb.value === 'PN'; });
    await generateReport();
    return true;
  }, mods);

  const batchTable = () => ev(() => {
    const sec = [...document.querySelectorAll('#report-output .mod-section')]
      .find((s) => (s.textContent || '').indexOf('Height by Batch') >= 0);
    if (!sec) return { err: 'no Height by Batch section' };
    return {
      blockName: (sec.querySelector('.mod-block-name') || {}).textContent || '',
      head: [...sec.querySelectorAll('thead th')].map((x) => x.textContent.trim()),
      row:  [...(sec.querySelector('tbody tr') || { children: [] }).children]
              .map((td) => td.textContent.trim()),
      cards: [...sec.querySelectorAll('.sum-card')].map((c) => [
        (c.querySelector('.sum-label') || {}).textContent.trim(),
        (c.querySelector('.sum-val')   || {}).textContent.trim()])
    };
  });

  await ev(() => { if (typeof setHeightUnit === 'function') setHeightUnit('cm'); });
  await gen(['Seedling Height', 'Height by Batch']);
  const bcm = await batchTable();
  check('its two height columns name cm',
        (bcm.head || []).filter((h) => /Avg/.test(h)), ['Plot Avg (cm)', 'Batch Avg (cm)']);
  check('and the block over the age cards says which unit they are',
        (bcm.blockName || '').trim(), 'Average Height by Age (cm)');
  check('P10 reads its own 151.4 on both of them',
        (bcm.row || []).slice(-2), ['151.4', '151.4']);
  check('…and so does the age card the batch falls in',
        ((bcm.cards || []).find((c) => c[0] === '2 Months Old') || [])[1], '151.4');

  await ev(() => { if (typeof setHeightUnit === 'function') setHeightUnit('m'); });
  const bm = await batchTable();
  check('picking m moves this table as well -- two Plot Avgs, one answer',
        (bm.head || []).filter((h) => /Avg/.test(h)), ['Plot Avg (m)', 'Batch Avg (m)']);
  check('…its figures',  (bm.row || []).slice(-2), ['1.514', '1.514']);
  check('…its block head', (bm.blockName || '').trim(), 'Average Height by Age (m)');
  /* The four cards carry no unit of their own, so a card left in cm under
     a head reading (m) is the one shape this must not have. */
  check('…and the age card under that head',
        ((bm.cards || []).find((c) => c[0] === '2 Months Old') || [])[1], '1.514');

  /* ── 5. THE CONTROL ───────────────────────────────────────────────── */
  console.log('\n5. offered where there is a height, and it says which is on');
  const bar = () => ev(() => {
    const b = document.getElementById('unit-bar');
    if (!b) return { err: 'no #unit-bar on the page' };
    return {
      shown: getComputedStyle(b).display !== 'none',
      on: [...b.querySelectorAll('.tbtn-unit')]
            .filter((x) => x.classList.contains('is-on')).map((x) => x.dataset.unit),
      units: [...b.querySelectorAll('.tbtn-unit')].map((x) => x.dataset.unit),
      pressed: [...b.querySelectorAll('.tbtn-unit')].map((x) => x.getAttribute('aria-pressed'))
    };
  });
  const withHeight = await bar();
  check('both units are offered', withHeight.units, ['cm', 'm']);
  check('it is on screen over a report with heights on it', withHeight.shown, true);
  check('and exactly one of the two is marked on', withHeight.on, ['m']);
  check('…which the button says for a reader that cannot see colour',
        withHeight.pressed, ['false', 'true']);

  /* THE SAME RULE THE DONE BY ROW FOLLOWS: a control over a module that
     is not on the page is a control that does nothing. */
  await gen(['Plot Condition']);
  const noHeight = await bar();
  check('a report with no height on it is offered no unit', noHeight.shown, false);
  check('…and nothing in it moved', await ev(() => {
    const t = document.querySelector('#report-output .rec-table');
    return t ? [...t.querySelectorAll('thead th')].map((x) => x.textContent.trim()) : null;
  }), ['#', 'Date', 'Plot', 'Batch', 'Pest', 'Animal', 'Disease', 'Leaf']);

  /* ── 6. IT READS NOTHING ──────────────────────────────────────────── */
  console.log('\n6. a unit is not a filter, so it costs no read');
  await gen(['Seedling Height', 'Height by Batch']);
  const costs = await ev(() => {
    if (typeof setHeightUnit !== 'function') return { err: 'no setHeightUnit' };
    const before = window.__calls.length;
    const stamp = (document.querySelector('.report-generated') || {}).textContent;
    setHeightUnit('m'); setHeightUnit('cm'); setHeightUnit('m');
    return { reads: window.__calls.length - before,
             stampMoved: (document.querySelector('.report-generated') || {}).textContent !== stamp,
             drew: ((document.querySelector('#report-output .rec-table thead') || {}).textContent || '')
                     .indexOf('(m)') >= 0 };
  });
  check('three presses read the database NOUGHT times', costs.reads, 0);
  check('…and the sheet was redrawn all the same', costs.drew, true);
  /* The report was generated when it was generated. Reading it in another
     unit a minute later has not generated anything. */
  check('…and Generated: still says when it was generated', costs.stampMoved, false);

  /* ── 7. THE SPREADSHEET COMES DOWN IN THE UNIT ON SCREEN ─────────── */
  console.log('\n7. the Excel follows the sheet it is of');
  const sheet = (unit) => ev((u) => {
    if (typeof _xlSheetOf !== 'function') return { err: 'no _xlSheetOf' };
    if (typeof setHeightUnit === 'function') setHeightUnit(u);
    const s = _xlSheetOf(MOD_COLS.height, window.__H, { h:'Nursery', v:(r)=>r.nursery||'' });
    const b = _xlSheetOf(BATCH_HEIGHT_COLS, (_lastReport.batchHeight||{}).rows||[], null);
    return { head: s ? s.head : null,
             /* The Avg cell of the first row, as the file would carry it:
                a NUMBER, so the column sorts and sums in Excel. */
             avg: s ? s.rows[0][8] : null,
             batchHead: b ? b.head.filter((h) => /Avg/.test(h)) : null };
  }, unit);
  const xcm = await sheet('cm');
  check('its columns name cm when the sheet does',
        (xcm.head || []).slice(5), ['S1 (cm)','S2 (cm)','S3 (cm)','Avg (cm)','Plot Avg (cm)']);
  check('…and the figure goes in as a number, not as text',
        xcm.avg, { v: 141.7, t: 'n' });
  const xm = await sheet('m');
  /* A spreadsheet headed (cm) over a column of metres is the worst of the
     three places this could go wrong: the file outlives the screen. */
  check('picking m moves the spreadsheet with it',
        (xm.head || []).slice(5), ['S1 (m)','S2 (m)','S3 (m)','Avg (m)','Plot Avg (m)']);
  check('…figures and all', xm.avg, { v: 1.417, t: 'n' });
  check('…on the batch sheet too', xm.batchHead, ['Plot Avg (m)', 'Batch Avg (m)']);

  /* BOTH, because the thing being judged by eye is the pair: whether the
     control says which unit is on, and whether a column of 1.417 reads as
     easily as a column of 141.7. A check cannot read a layout. */
  if (process.env.SHOT) {
    const cmShot = process.env.SHOT.replace(/(\.png)?$/, '_cm.png');
    await page.screenshot({ path: process.env.SHOT, fullPage: true });
    await ev(() => setHeightUnit('cm'));
    /* The chips carry a .15s background transition, so a shot taken the
       instant after the press catches BOTH of them half filled and reads
       as a control that cannot say which unit is on. */
    await page.waitForTimeout(400);
    await page.screenshot({ path: cmShot, fullPage: true });
    console.log('\n  shots → ' + process.env.SHOT + '  ' + cmShot);
  }

  await browser.close();
  server.close();
  console.log(fail ? `\n${fail} FAILED  (${pass} ok)` : `\nall good  (${pass} ok)`);
  process.exit(fail ? 1 : 0);
})();
