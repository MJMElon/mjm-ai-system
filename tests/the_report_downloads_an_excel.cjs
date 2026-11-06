/* THE MONTHLY AUDIT REPORT COMES DOWN AS A SPREADSHEET

   *"and it also able to download in excel"* — said straight after the
   three asks that turned the period into a date range and made one record
   one visit, which is why this file is the one that drives the SHAPE
   rather than only the button: the sheet printed off that page is read by
   somebody adding up and signing, and a spreadsheet is read by somebody
   who wants to SORT, FILTER and PIVOT. Those are different documents.

   WHY THIS IS CHECKED BY AN INDEPENDENT READER AND NOT BY ITS OWN CODE.
   The .xlsx is written here, by hand — the zip, the CRCs, the sheet XML —
   so a check written against the same functions proves only that they
   agree with themselves. A workbook Excel refuses opens to nothing and
   says nothing, which on this screen is the office pressing a button that
   does not work. So the file is pulled out of a real browser download and
   read back by python's own `zipfile` (whose `testzip()` recomputes every
   CRC and length) and `ElementTree`, with an extra section through
   openpyxl where it is installed.

   THE THREE THINGS THAT WOULD ARRIVE DESTROYED and are each a named check
   below:

     - **A CASE ID IS THIRTEEN DIGITS.** 1791248487117 in a CSV is read as
       a number and shown as 1.79125E+12. It has to be a TEXT cell.
     - **A MERGED CELL BREAKS A SORT.** The table draws one Plot cell down
       a record's three lines because that is how a visit reads on paper;
       in a spreadsheet every line has to carry its own.
     - **A DATE HAS TO BE A DATE**, or a filter by month is a text match.

   Run: node tests/the_report_downloads_an_excel.cjs
        KEEP=1 node tests/the_report_downloads_an_excel.cjs   (keeps the xlsx)
*/
'use strict';
const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT  = path.resolve(__dirname, '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png' };
const PORT  = 8785;

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('no'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

let pass = 0, fail = 0, skip = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got)
                             + '\n         want ' + JSON.stringify(want)); }
};
const skipped = (name, why) => { skip++; console.log('  skip ' + name + ' — ' + why); };

/* ── the fixture ──────────────────────────────────────────────────────
   The office's own two shapes, because they are the two the spreadsheet
   has to survive: B01 walked once on the 21st with three batches standing
   in it (ONE record, three lines), and B05 sprayed by three workers on the
   22nd (ONE record, three cases, three thirteen-digit ids differing only
   in their last digits). */
const PLOT = [
  { audit_id:'PA-1', nursery:'BNN', plot:'B01', batch:'250',
    pest:'Tidak Ada', tikus:'Tidak Ada', disease:'Sedikit',       warna_daun:'2',
    auditor_name:'Suhaedi', date:'2026-10-21' },
  { audit_id:'PA-2', nursery:'BNN', plot:'B01', batch:'253',
    pest:'Tidak Ada', tikus:'Banyak',    disease:'Banyak bintik', warna_daun:'3',
    auditor_name:'Suhaedi', date:'2026-10-21' },
  { audit_id:'PA-3', nursery:'BNN', plot:'B01', batch:'268',
    pest:'Tidak Ada', tikus:'Tidak Ada', disease:'Tidak Ada',     warna_daun:'2',
    auditor_name:'Suhaedi', date:'2026-10-21' },
  /* No batch at all: the table draws an em dash and a spreadsheet wants an
     empty cell, which is the one difference between the two documents that
     is not about merging. */
  { audit_id:'PA-4', nursery:'BNN', plot:'B02', batch:'',
    pest:'Tidak Ada', tikus:'Tidak Ada', disease:'Tidak Ada',     warna_daun:'2',
    auditor_name:'Suhaedi', date:'2026-10-05' }
];
const MAINT = [
  { audit_id:'MTA-5', task_id:1791248487117, nursery:'BNN', plot:'B05',
    task_type:'Interrow Spray', result:'Unsatisfied',
    auditor_name:'Main Nursery Auditor', date:'2026-10-22' },
  { audit_id:'MTA-9', task_id:1791248487200, nursery:'BNN', plot:'B05',
    task_type:'Manuring',       result:'Satisfied',
    auditor_name:'Suhaedi',     date:'2026-10-22' },
  { audit_id:'MTA-6', task_id:1791248487131, nursery:'BNN', plot:'B05',
    task_type:'Interrow Spray', result:'Unsatisfied',
    auditor_name:'Main Nursery Auditor', date:'2026-10-22' },
  { audit_id:'MTA-7', task_id:1791248487134, nursery:'BNN', plot:'B05',
    task_type:'Interrow Spray', result:'Unsatisfied',
    auditor_name:'Main Nursery Auditor', date:'2026-10-22' }
];
const PAPAN = [
  { audit_id:'PT-1', nursery:'BNN', plot:'B01', batch_no:'250',
    presence:'Ada', info_correct:'Betul', condition:'Baik',
    auditor_name:'Suhaedi', date:'2026-10-21' }
];

/* For section 11. One Pre-Nursery batch sown on 1 Sep and still standing,
   so it is inside the 1-4 month window at the end of October, measured
   twice on one day in P01 -- which gives the Plot Avg column something to
   be (25) and Height by Batch a row with a real Seeds In date on it. */
const HEIGHT = [
  { record_id:'H-1', nursery:'PN', plot:'P01', batch:null,
    sample_1:20, sample_2:20, sample_3:20, avg_height:20,
    auditor_name:'Suhaedi', date:'2026-10-19' },
  { record_id:'H-2', nursery:'PN', plot:'P01', batch:null,
    sample_1:30, sample_2:30, sample_3:30, avg_height:30,
    auditor_name:'Suhaedi', date:'2026-10-19' }
];
const LEDGER = [
  { id:1, batch_name:'310', plot_name:null, transaction_type:'Seeds_Received',
    transaction_date:'2026-09-01', created_at:'2026-09-01T08:00:00+00:00' },
  { id:2, batch_name:'310', plot_name:'P01', transaction_type:'Planted',
    transaction_date:'2026-09-01', created_at:'2026-09-01T08:00:00+00:00' }
];

/* ── the independent reader ───────────────────────────────────────────
   stdlib only, so this runs wherever python3 does. `testzip()` is the
   part that cannot be faked: it recomputes every entry's CRC and length
   against what the central directory claims. */
const PY_STDLIB = `
import sys, json, re, zipfile
import xml.etree.ElementTree as ET
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
z = zipfile.ZipFile(sys.argv[1])
out = {'bad': z.testzip(), 'names': sorted(z.namelist())}
wb = ET.fromstring(z.read('xl/workbook.xml'))
sheets = [s.get('name') for s in wb.iter(NS + 'sheet')]
out['sheets'] = sheets
out['parts'] = {}
for i, name in enumerate(sheets):
    root = ET.fromstring(z.read('xl/worksheets/sheet%d.xml' % (i + 1)))
    rows = []
    for r in root.iter(NS + 'row'):
        cells = {}
        for c in r.iter(NS + 'c'):
            col = re.match(r'[A-Z]+', c.get('r')).group(0)
            if c.get('t') == 'inlineStr':
                tn = c.find(NS + 'is/' + NS + 't')
                cells[col] = {'v': tn.text if tn is not None else '', 'k': 's', 's': c.get('s')}
            else:
                vn = c.find(NS + 'v')
                cells[col] = {'v': vn.text if vn is not None else '', 'k': 'n', 's': c.get('s')}
        rows.append(cells)
    out['parts'][name] = {
        'rows': rows,
        'merged': root.find(NS + 'mergeCells') is not None,
        'autofilter': root.find(NS + 'autoFilter') is not None,
        'frozen': root.find(NS + 'sheetViews/' + NS + 'sheetView/' + NS + 'pane') is not None,
        'widths': [[c.get('min'), c.get('width')] for c in root.iter(NS + 'col')],
    }
print(json.dumps(out))
`;

/* A REAL THIRD-PARTY READER where one is installed. It parses the styles,
   resolves numFmt 14 and hands back datetime objects — so a date cell this
   says is a date is a date to something that was not written here. */
const PY_OPENPYXL = `
import sys, json, datetime
import openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
out = {'sheets': wb.sheetnames, 'cells': {}}
for name in wb.sheetnames:
    ws = wb[name]
    rows = []
    for row in ws.iter_rows():
        rows.append([[None if c.value is None else
                      (c.value.strftime('%Y-%m-%d') if isinstance(c.value, (datetime.date, datetime.datetime))
                       else c.value),
                      type(c.value).__name__] for c in row])
    out['cells'][name] = rows
print(json.dumps(out))
`;

const py = (script, file, bin) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'xlread-'));
  const p = path.join(d, 'read.py');
  fs.writeFileSync(p, script);
  try { return JSON.parse(execFileSync(bin, ['-I', p, file], { encoding:'utf8', maxBuffer:64*1024*1024 })); }
  finally { fs.rmSync(d, { recursive:true, force:true }); }
};
const haveOpenpyxl = (bin) => {
  try { execFileSync(bin, ['-I', '-c', 'import openpyxl'], { stdio:'ignore' }); return true; }
  catch (e) { return false; }
};

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctxBrowser = await browser.newContext({ acceptDownloads: true });
  const page = await ctxBrowser.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text());
                              if (process.env.V) console.log('   [page]', m.text()); });

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
  await page.waitForFunction(() => typeof window.generateReport === 'function', { timeout: 20000 });

  await page.evaluate((seed) => {
    window.sbFetch = async (p) => {
      const t = p.split('?')[0];
      if (t === 'audit_plot_audits')        return seed.plot;
      if (t === 'audit_maintenance_audits') return seed.maint;
      if (t === 'audit_papan_audits')       return seed.papan;
      return [];
    };
  }, { plot: PLOT, maint: MAINT, papan: PAPAN });

  /* ════════════════════════════════════════════════════════════════
     1 — THE BUTTON, AND IT REFUSES BEFORE THERE IS A REPORT
     A download of the LAST report over a screen showing nothing is a
     file nobody can place; and a button that throws inside an onclick
     does nothing and says nothing, which the claim form had to learn
     once already.
     ════════════════════════════════════════════════════════════════ */
  console.log('\n1. the button');
  const btn = await page.evaluate(() => {
    const b = document.querySelector('#print-bar #btn-excel');
    if (!b) return { there:false };
    return { there:true, text:b.textContent.trim(),
             inToolbar:!!b.closest('#print-bar'),
             onclick:(b.getAttribute('onclick')||'') };
  });
  check('the toolbar carries a Download Excel button', btn.there, true);
  check('it says what it does', btn.text || '', 'Download Excel');
  check('it is in the report toolbar beside Print', btn.inToolbar === true, true);
  check('it calls downloadExcel()', (btn.onclick || '').indexOf('downloadExcel') >= 0, true);

  const earlyDl = await page.evaluate(async () => {
    if (typeof downloadExcel !== 'function') return 'no downloadExcel';
    let said = null;
    const real = window.showToast; window.showToast = (m) => { said = m; };
    let threw = null;
    try { downloadExcel(); } catch (e) { threw = e.message; }
    window.showToast = real;
    return { said, threw };
  });
  check('with no report yet it says so rather than throwing',
        earlyDl.threw === null || earlyDl.threw === undefined, true);
  check('and the message names what to do first',
        /generate/i.test(String(earlyDl.said || '')), true);

  /* ════════════════════════════════════════════════════════════════
     2 — GENERATE, THEN DOWNLOAD
     ════════════════════════════════════════════════════════════════ */
  console.log('\n2. the download');
  await page.evaluate(() => {
    /* MUTATED, never reassigned: `selectedMods` is a const Set on the
       page, so a test that assigns a new one dies before it ticks
       anything. */
    selectedMods.clear();
    ['plot', 'papan', 'maint'].forEach((m) => selectedMods.add(m));
    document.querySelectorAll('.f-nurs-cb').forEach((i) => {
      i.checked = (i.value === 'BNN');
    });
    document.getElementById('f-from').value = '2026-10-01';
    document.getElementById('f-to').value   = '2026-10-31';
    document.getElementById('f-plot').value = '';
  });
  await page.evaluate(() => generateReport());
  await page.waitForFunction(
    () => !document.getElementById('print-bar').classList.contains('hidden'),
    { timeout: 20000 });

  let xlsx = null, dlName = null;
  try {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.click('#btn-excel')
    ]);
    dlName = dl.suggestedFilename();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xl-'));
    xlsx = path.join(dir, 'report.xlsx');
    await dl.saveAs(xlsx);
  } catch (e) {
    check('pressing it downloads a file', 'no download: ' + e.message, 'a download');
  }

  if (!xlsx) {
    console.log('\n  (no file — every check below is about its contents)');
    console.log(`\n  ${pass} passed, ${fail} failed, ${skip} skipped`);
    await browser.close(); server.close();
    process.exit(fail ? 1 : 0);
  }

  check('pressing it downloads a file', true, true);
  check('named for the range it covers', dlName,
        'MJM Audit Report 2026-10-01 to 2026-10-31.xlsx');
  check('the file is not empty', fs.statSync(xlsx).size > 1000, true);
  check('nothing threw on the page', errs.filter((e) => /excel/i.test(e)), []);

  /* ════════════════════════════════════════════════════════════════
     3 — IT IS A ZIP, AND EVERY BYTE OF IT ADDS UP
     The CRCs and the lengths are written by hand, and a zip whose
     central directory disagrees with its data is a workbook Excel
     refuses outright.
     ════════════════════════════════════════════════════════════════ */
  console.log('\n3. the container');
  let X = null;
  try { X = py(PY_STDLIB, xlsx, 'python3'); }
  catch (e) { check('python reads it as a zip', 'threw: ' + String(e.message).slice(0, 300), 'read'); }
  if (!X) {
    console.log(`\n  ${pass} passed, ${fail} failed, ${skip} skipped`);
    await browser.close(); server.close();
    process.exit(1);
  }
  check('python reads it as a zip', true, true);
  check('every CRC and length checks out', X.bad, null);
  check('it carries the parts a workbook needs',
        ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels',
         'xl/styles.xml', 'xl/workbook.xml']
          .filter((n) => X.names.indexOf(n) < 0), []);
  check('one worksheet part per sheet',
        X.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length,
        X.sheets.length);

  /* ════════════════════════════════════════════════════════════════
     4 — ONE SHEET PER MODULE, THE CONTEXT FIRST
     ════════════════════════════════════════════════════════════════ */
  console.log('\n4. the sheets');
  check('the context sheet comes first, then a sheet per ticked module',
        X.sheets, ['Report', 'Plot Condition', 'Papan Tanda', 'Maintenance']);

  const sh = (n) => X.parts[n] || { rows: [] };
  const head = (n) => Object.keys(sh(n).rows[0] || {}).sort()
                        .map((k) => (sh(n).rows[0][k] || {}).v);
  const colOf = (n, label) => {
    const r0 = sh(n).rows[0] || {};
    return Object.keys(r0).find((k) => (r0[k] || {}).v === label) || null;
  };
  const down = (n, label) => {
    const c = colOf(n, label); if (!c) return ['no column ' + label];
    return sh(n).rows.slice(1).map((r) => (r[c] || {}).v == null ? '' : (r[c] || {}).v);
  };

  check('the nursery is a COLUMN and not a sheet, so a filter is the two sections back',
        head('Maintenance')[0], 'Nursery');
  check('and it is filled in on every line', down('Maintenance', 'Nursery'),
        ['BNN', 'BNN', 'BNN', 'BNN']);
  check('every column of the page table is in the sheet',
        head('Maintenance').slice(1),
        await page.evaluate(() => MOD_COLS.maint.map((c) => c.h)));
  check('a row per audit, plus the heading', sh('Maintenance').rows.length, MAINT.length + 1);

  /* ════════════════════════════════════════════════════════════════
     5 — THE CASE ID SURVIVES, WHICH CSV CANNOT DO
     ════════════════════════════════════════════════════════════════ */
  console.log('\n5. the thirteen-digit case');
  check('every case id reads back in full, digit for digit',
        down('Maintenance', 'Case').filter((v) => v),
        ['1791248487117', '1791248487131', '1791248487134', '1791248487200']);
  const caseCol = colOf('Maintenance', 'Case');
  check('and it is a TEXT cell, so Excel cannot make it 1.79E+12',
        sh('Maintenance').rows.slice(1).map((r) => ((r[caseCol] || {}).k)),
        ['s', 's', 's', 's']);

  /* ════════════════════════════════════════════════════════════════
     6 — NOTHING IS MERGED, SO IT SORTS
     The table draws one Plot cell down a record's three lines. A
     spreadsheet that did the same would break the one thing it is for.
     ════════════════════════════════════════════════════════════════ */
  console.log('\n6. every line stands on its own');
  check('no merged cells anywhere',
        X.sheets.filter((n) => sh(n).merged), []);
  check('the three interrow lines each carry their own plot',
        down('Maintenance', 'Plot'), ['B05', 'B05', 'B05', 'B05']);
  check('and their own task',
        down('Maintenance', 'Task'),
        ['Interrow Spray', 'Interrow Spray', 'Interrow Spray', 'Manuring']);
  check('the record number is what says they are one visit',
        down('Maintenance', '#'), ['1', '1', '1', '2']);
  check("B01's three batches are three lines of one record",
        down('Plot Condition', '#'), ['1', '1', '1', '2']);
  check('each naming its own batch',
        down('Plot Condition', 'Batch'), ['250', '253', '268', '']);
  /* Asked of the MODULE sheets, not of the workbook: the context sheet
     carries a sentence of prose with an em dash in it, and widening this
     to every sheet makes it a check about punctuation rather than about a
     column of figures. */
  check('a plot with no batch is an EMPTY cell and never an em dash',
        X.sheets.filter((n) => n !== 'Report')
          .filter((n) => sh(n).rows.some((r) => Object.keys(r)
            .some((k) => String((r[k] || {}).v || '').indexOf('—') >= 0))), []);

  /* ════════════════════════════════════════════════════════════════
     7 — A DATE IS A DATE AND A FIGURE IS A NUMBER
     ════════════════════════════════════════════════════════════════ */
  console.log('\n7. the types');
  const dateCol = colOf('Maintenance', 'Date');
  const dcells = sh('Maintenance').rows.slice(1).map((r) => r[dateCol] || {});
  check('a date cell holds a serial, not a string', dcells.map((c) => c.k),
        ['n', 'n', 'n', 'n']);
  check('under the short-date format', dcells.map((c) => c.s), ['2', '2', '2', '2']);
  /* 1899-12-30 is the epoch the 1900 system counts from. 22 Oct 2026. */
  const serial = Math.round((Date.UTC(2026, 9, 22) - Date.UTC(1899, 11, 30)) / 86400000);
  check('and it is the right day', dcells.map((c) => Number(c.v)),
        [serial, serial, serial, serial]);
  check('a date column is wide enough to show a date rather than #####',
        (sh('Maintenance').widths.find((w) => w[0] === String(
          dateCol.charCodeAt(0) - 64)) || [null, 0])[1] >= 10, true);

  /* ════════════════════════════════════════════════════════════════
     8 — THE CONTEXT SHEET
     A spreadsheet that has left the screen with no idea which dates it
     covers is a column of figures nobody can check.
     ════════════════════════════════════════════════════════════════ */
  console.log('\n8. what the report was OF');
  const ctxRows = sh('Report').rows.map((r) => Object.keys(r).sort()
                     .map((k) => (r[k] || {}).v));
  const ctxFlat = JSON.stringify(ctxRows);
  check('it names the from date', ctxFlat.indexOf('2026-10-01') >= 0, true);
  check('it names the to date', ctxFlat.indexOf('2026-10-31') >= 0, true);
  check('it names the nurseries', ctxFlat.indexOf('BNN') >= 0, true);
  check('it says a record is one visit', /record is one visit/i.test(ctxFlat), true);
  const onPage = await page.evaluate(() => ({
    plot:  recordCount('plot',  _lastReport.data.plot),
    maint: recordCount('maint', _lastReport.data.maint),
    papan: recordCount('papan', _lastReport.data.papan)
  }));
  check('the counts on it are the page own, visit for visit',
        [onPage.plot, onPage.maint, onPage.papan], [2, 2, 1]);
  const ctxPair = (label) => {
    const row = ctxRows.find((r) => r[0] === label);
    return row ? row[1] : 'no row ' + label;
  };
  check('Plot Condition agrees with the summary card', ctxPair('Plot Condition'), '2');
  check('Maintenance agrees with the summary card', ctxPair('Maintenance'), '2');
  check('and the total is the sum of them', ctxPair('Total Audits'), '5');

  /* ════════════════════════════════════════════════════════════════
     9 — IT IS A SPREADSHEET AND NOT A PICTURE OF A TABLE
     ════════════════════════════════════════════════════════════════ */
  console.log('\n9. it filters and it scrolls');
  check('every module sheet carries a filter on every column',
        ['Plot Condition', 'Papan Tanda', 'Maintenance'].filter((n) => !sh(n).autofilter), []);
  check('and keeps its heading in view',
        ['Plot Condition', 'Papan Tanda', 'Maintenance'].filter((n) => !sh(n).frozen), []);
  check('the context sheet has neither, being a list and not a table',
        [sh('Report').autofilter, sh('Report').frozen], [false, false]);
  check('every column is sized', sh('Maintenance').widths.length,
        head('Maintenance').length);

  /* ════════════════════════════════════════════════════════════════
     10 — A READER THAT WAS NOT WRITTEN HERE
     openpyxl parses the styles and resolves numFmt 14 itself, so a date
     it hands back as a date is a date to something with no stake in
     this code. Skipped rather than failed where it is not installed:
     the sections above are the proof and this is the corroboration.
     ════════════════════════════════════════════════════════════════ */
  console.log('\n10. openpyxl opens it');
  const bin = ['python3', 'python3.13', 'python3.12'].find(haveOpenpyxl);
  if (!bin) {
    skipped('openpyxl opens the workbook', 'openpyxl is not installed');
  } else {
    let O = null;
    try { O = py(PY_OPENPYXL, xlsx, bin); }
    catch (e) { check('openpyxl opens the workbook',
                      'threw: ' + String(e.message).slice(0, 300), 'opened'); }
    if (O) {
      check('openpyxl opens the workbook', true, true);
      check('and sees the same sheets', O.sheets,
            ['Report', 'Plot Condition', 'Papan Tanda', 'Maintenance']);
      const m = O.cells.Maintenance;
      const hi = m[0].map((c) => c[0]);
      const ci = hi.indexOf('Case'), di = hi.indexOf('Date');
      check('it reads the case as a string', m.slice(1).map((r) => r[ci][1]),
            ['str', 'str', 'str', 'str']);
      check('with the digits intact', m[1][ci][0], '1791248487117');
      check('and the date as a real date', m.slice(1).map((r) => r[di][1]),
            ['datetime', 'datetime', 'datetime', 'datetime']);
      check('on the day it was audited', m[1][di][0], '2026-10-22');
    }
  }

  /* ════════════════════════════════════════════════════════════════
     11 — THE OTHER TWO TABLES
     Seedling Height and Height by Batch are the two sheets the office's
     own run would carry that the sections above never touch, and Height
     by Batch is the only one not drawn through MOD_COLS. Both carry a
     DATE column, which is what says the one cell builder is shared:
     a second copy would have left these as text.
     ════════════════════════════════════════════════════════════════ */
  console.log('\n11. seedling height, and height by batch');
  await page.evaluate((seed) => {
    window.__HEIGHT = seed.height; window.__LEDGER = seed.ledger;
    window.sbFetch = async (p) => {
      const [table, qs] = p.split('?');
      const q = new URLSearchParams(qs || '');
      if (table === 'audit_height_records') {
        const b = q.getAll('date').map((v) => v.slice(4));
        return window.__HEIGHT.filter((r) => r.date >= (b[0] || '') && r.date <= (b[1] || '9999'));
      }
      if (table !== 'shared_inventory_logs') return [];
      const want = q.get('transaction_type') || '';
      const types = want.startsWith('in.') ? want.slice(4, -1).split(',')
                                           : [want.replace('eq.', '')];
      return window.__LEDGER.filter((r) => types.indexOf(r.transaction_type) >= 0);
    };
    selectedMods.clear();
    ['height', 'bheight'].forEach((m) => selectedMods.add(m));
    document.querySelectorAll('.f-nurs-cb').forEach((i) => { i.checked = (i.value === 'PN'); });
  }, { height: HEIGHT, ledger: LEDGER });
  await page.evaluate(() => generateReport());

  let X2 = null, xlsx2 = null;
  try {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.click('#btn-excel')
    ]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xl2-'));
    xlsx2 = path.join(dir, 'r2.xlsx');
    await dl.saveAs(xlsx2);
    X2 = py(PY_STDLIB, xlsx2, 'python3');
  } catch (e) {
    check('the height run downloads too', 'threw: ' + String(e.message).slice(0, 200), 'a file');
  }
  if (X2) {
    check('the height run downloads too', X2.bad, null);
    check('with a sheet for each', X2.sheets,
          ['Report', 'Seedling Height', 'Height by Batch']);
    const s2 = (n) => X2.parts[n] || { rows: [] };
    const col2 = (n, label) => {
      const r0 = s2(n).rows[0] || {};
      return Object.keys(r0).find((k) => (r0[k] || {}).v === label) || null;
    };
    const dn2 = (n, label) => {
      const c = col2(n, label); if (!c) return ['no column ' + label];
      return s2(n).rows.slice(1).map((r) => ((r[c] || {}).v == null ? '' : (r[c] || {}).v));
    };
    check('the plot average rides on every line, not just the first',
          dn2('Seedling Height', 'Plot Avg (cm)'), ['25', '25']);
    check('and the samples are numbers', s2('Seedling Height').rows.slice(1)
            .map((r) => (r[col2('Seedling Height', 'S1 (cm)')] || {}).k), ['n', 'n']);
    /* Height by Batch is not a MOD_COLS table, so these two are what say
       the date handling is shared and not copied. */
    const seedSerial = Math.round((Date.UTC(2026, 8, 1) - Date.UTC(1899, 11, 30)) / 86400000);
    check('Seeds In is a real date on Height by Batch',
          dn2('Height by Batch', 'Seeds In').map(Number), [seedSerial]);
    check('and so is the day it was last audited',
          s2('Height by Batch').rows.slice(1)
            .map((r) => (r[col2('Height by Batch', 'Audited')] || {}).s), ['2']);
    check('the batch is on its line and not merged away',
          dn2('Height by Batch', 'Batch'), ['310']);
    if (xlsx2 && !process.env.KEEP) fs.rmSync(path.dirname(xlsx2), { recursive:true, force:true });
    else if (xlsx2) console.log('  kept: ' + xlsx2);
  }

  if (process.env.KEEP) console.log('\n  kept: ' + xlsx);
  else fs.rmSync(path.dirname(xlsx), { recursive: true, force: true });

  console.log(`\n  ${pass} passed, ${fail} failed`
              + (skip ? `, ${skip} skipped` : ''));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
