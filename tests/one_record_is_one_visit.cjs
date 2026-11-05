/* THE MONTHLY AUDIT REPORT: THE DATES SOMEBODY PICKED, AND ONE RECORD PER
   VISIT.

   Three asks, one message, one page — so one file. The range is in here
   with the grouping because it is what decides which rows the grouping
   then runs over, and a check on one that booted the other way round
   would prove nothing about the report anybody actually generates.

     1. "change the month and year to from date to to date. so the report
        generated based on date selected."
     2. "for the plot condition, group same plot same audit date as 1
        record although different batch. but here still need to show the
        batches"
     3. "maintenance do the same. group same task same plot same audit date
        as 1 record although diff case number"

   WHY 2 AND 3 ARE THE SAME SENTENCE ABOUT TWO DIFFERENT KEYS. A table row
   is what the database holds, and on these two modules that is finer than
   the thing being counted: Plot Condition in the main nursery is one row
   per plot per BATCH, and Maintenance is one row per CASE. So one walk
   round B01 with three batches standing in it read as three audits, and
   one morning's spraying of B05 by three workers read as three.

   AND THE BATCHES AND THE CASES STAY, each on its own line — the other
   half of what was asked, and the only safe way to do it. A plot's
   readings are PER BATCH: the rat on 253 with nothing on 268 is the whole
   reason the alert board is per batch, so folding four readings into one
   cell could hide the one worth walking to.

   Run: node tests/one_record_is_one_visit.cjs
        SHOT=/tmp/r.png node tests/one_record_is_one_visit.cjs
*/
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT  = path.resolve(__dirname, '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png' };
const PORT  = 8783;

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

/* ── PLOT CONDITION ──────────────────────────────────────────────────
   B01 walked once on the 21st with three batches standing in it; the SAME
   plot walked again on the 5th, which is a different visit; and B02 on the
   21st keyed twice, the second time with a stray trailing space on the
   plot — matched on letters and digits like every other plot comparison in
   this system, so it is the same visit and not a fourth record. */
const PLOT = [
  { audit_id:'PA-1', nursery:'BNN', plot:'B01',  batch:'250',
    pest:'Tidak Ada', tikus:'Tidak Ada', disease:'Sedikit',       warna_daun:'2',
    auditor_name:'Suhaedi', date:'2026-10-21' },
  { audit_id:'PA-2', nursery:'BNN', plot:'B01',  batch:'253',
    pest:'Tidak Ada', tikus:'Banyak',    disease:'Banyak bintik', warna_daun:'3',
    auditor_name:'Suhaedi', date:'2026-10-21' },
  { audit_id:'PA-3', nursery:'BNN', plot:'B01',  batch:'268',
    pest:'Tidak Ada', tikus:'Tidak Ada', disease:'Tidak Ada',     warna_daun:'2',
    auditor_name:'Suhaedi', date:'2026-10-21' },
  { audit_id:'PA-4', nursery:'BNN', plot:'B01',  batch:'250',
    pest:'Tidak Ada', tikus:'Tidak Ada', disease:'Tidak Ada',     warna_daun:'2',
    auditor_name:'Suhaedi', date:'2026-10-05' },
  { audit_id:'PA-5', nursery:'BNN', plot:'B02',  batch:'260',
    pest:'Tidak Ada', tikus:'Tidak Ada', disease:'Sedikit',       warna_daun:'2',
    auditor_name:'Suhaedi', date:'2026-10-21' },
  { audit_id:'PA-6', nursery:'BNN', plot:'B02 ', batch:'262',
    pest:'Tidak Ada', tikus:'Tidak Ada', disease:'Tidak Ada',     warna_daun:'2',
    auditor_name:'Suhaedi', date:'2026-10-21' }
];

/* ── MAINTENANCE ─────────────────────────────────────────────────────
   The office's own three B05 / Interrow Spray / 22 Oct cases, with a
   MANURING case on the same plot and the same day sitting BETWEEN them in
   the list on purpose: that is a second record, and on a sort that does not
   know about the task the three interrow lines come back broken into two
   runs with the manuring one in the middle — which draws the record as two
   blocks instead of one. */
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
    auditor_name:'Main Nursery Auditor', date:'2026-10-22' },
  { audit_id:'MTA-8', task_id:1791248487300, nursery:'BNN', plot:'B06',
    task_type:'Interrow Spray', result:'Satisfied',
    auditor_name:'Suhaedi',     date:'2026-10-22' }
];

/* Papan and Height are the control: neither has a row the office reads as
   a repeat, so neither is grouped and both go on counting rows. */
const PAPAN = [
  { audit_id:'PT-1', nursery:'BNN', plot:'B01', batch_no:'250',
    presence:'Ada', info_correct:'Betul', condition:'Baik',
    auditor_name:'Suhaedi', date:'2026-10-21' },
  { audit_id:'PT-2', nursery:'BNN', plot:'B01', batch_no:'253',
    presence:'Ada', info_correct:'Betul', condition:'Baik',
    auditor_name:'Suhaedi', date:'2026-10-21' }
];

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
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

  /* The database at the one place this page reaches it. Set after load,
     because audit_supabase.js declares the real sbFetch. */
  await page.evaluate((seed) => {
    window.__PLOT = seed.plot; window.__MAINT = seed.maint; window.__PAPAN = seed.papan;
    window.__calls = [];
    window.sbFetch = async (p) => {
      window.__calls.push(p);
      const t = p.split('?')[0];
      if (t === 'audit_plot_audits')          return seed.plot;
      if (t === 'audit_maintenance_audits')   return seed.maint;
      if (t === 'audit_papan_audits')         return seed.papan;
      return [];
    };
  }, { plot: PLOT, maint: MAINT, papan: PAPAN });

  /* Every reader is guarded, so a page WITHOUT any of this fails each
     check by name instead of taking the harness down on the first throw
     and leaving the rest of the file unasked. */
  const read = (mod, rows) => page.evaluate(([m, rs]) => {
    if (typeof buildModTable !== 'function') return { err: 'no buildModTable' };
    const d = document.createElement('div');
    d.innerHTML = buildModTable(m, rs);
    document.body.appendChild(d);
    const head = [...d.querySelectorAll('thead th')].map((x) => x.textContent.trim());
    const trs = [...d.querySelectorAll('tbody tr')]
      .filter((tr) => !tr.classList.contains('total-row'));
    const body = trs.map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    /* The table as it READS: a rowspan carried down the lines it covers. */
    const grid = []; const carry = {};
    trs.forEach((tr) => {
      const cells = [...tr.children]; const row = []; let k = 0;
      for (let ci = 0; ci < head.length; ci++) {
        if (carry[ci] && carry[ci].left > 0) { row[ci] = carry[ci].text; carry[ci].left--; continue; }
        const td = cells[k++];
        if (!td) { row[ci] = null; continue; }
        row[ci] = td.textContent.trim();
        const rs2 = parseInt(td.getAttribute('rowspan') || '1', 10);
        if (rs2 > 1) carry[ci] = { text: row[ci], left: rs2 - 1 };
      }
      grid.push(row);
    });
    const foot = (d.querySelector('tbody .total-row td') || {}).textContent || '';
    const cont = trs.map((tr) => ({ cont: tr.classList.contains('rec-cont'),
                                    note: tr.getAttribute('data-cont') || null }));
    d.remove();
    return { head, body, grid, foot: foot.trim(), cont };
  }, [mod, rows]);

  const col = (t, h) => (t.head || []).indexOf(h);

  /* ── 1. THE PERIOD IS A FROM DATE AND A TO DATE ───────────────────── */
  console.log('\n1. The report is the dates somebody picked');
  const period = await page.evaluate(() => {
    const g = (id) => document.getElementById(id);
    return {
      hasFrom: !!g('f-from'), hasTo: !!g('f-to'),
      typeFrom: g('f-from') ? g('f-from').type : null,
      oldMonth: !!g('f-month'), oldYear: !!g('f-year'),
      from: g('f-from') ? g('f-from').value : null,
      to:   g('f-to')   ? g('f-to').value   : null,
      label: typeof periodLabel === 'function' ? periodLabel('2026-10-05','2026-10-09') : null,
      oneDay: typeof periodLabel === 'function' ? periodLabel('2026-10-05','2026-10-05') : null
    };
  });
  check('there is a From date and a To date, both real date boxes',
        [period.hasFrom, period.hasTo, period.typeFrom], [true, true, 'date']);
  check('…and the Month and Year selects are gone, not left beside them',
        [period.oldMonth, period.oldYear], [false, false]);
  /* It opens on the current month first-to-last, so somebody who ticks a
     module and presses Generate gets the report this page always gave. */
  const thisMonth = await page.evaluate(() => {
    const n = new Date();
    const iso = (d) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
                      +'-'+String(d.getDate()).padStart(2,'0');
    return [iso(new Date(n.getFullYear(), n.getMonth(), 1)),
            iso(new Date(n.getFullYear(), n.getMonth()+1, 0))];
  });
  check('it opens on this month, first day to last', [period.from, period.to], thisMonth);
  check('a range reads as both ends', period.label, '05 Oct 2026 – 09 Oct 2026');
  check('…and one day reads as one date, not the same date twice',
        period.oneDay, '05 Oct 2026');

  /* THE READ ASKS FOR THE RANGE, inclusive at both ends. A heading that
     says the dates over a query that asked for a month is the quietest way
     this could do nothing. */
  const asked = await page.evaluate(async () => {
    if (typeof fetchData !== 'function') return { err: 'no fetchData' };
    window.__calls = [];
    selectedMods.clear(); selectedMods.add('plot');
    await fetchData('2026-10-05', '2026-10-09');
    return { calls: window.__calls.slice() };
  });
  check('the read asks gte the from date and lte the to date',
        (asked.calls || []).some((c) => c.indexOf('date=gte.2026-10-05') >= 0
                                     && c.indexOf('date=lte.2026-10-09') >= 0), true);

  const refused = await page.evaluate(async () => {
    const g = (id) => document.getElementById(id);
    if (!g('f-from') || !g('f-to')) return { err: 'no date boxes' };
    const said = [];
    const realToast = window.showToast;
    window.showToast = (m) => said.push(m);
    const out = {};
    selectedMods.clear(); selectedMods.add('plot');
    [...document.querySelectorAll('.f-nurs-cb')].forEach((cb) => { cb.checked = cb.value === 'BNN'; });
    g('f-from').value = '2026-10-20'; g('f-to').value = '2026-10-05';
    await generateReport();
    out.backwards = said.slice(); said.length = 0;
    g('f-from').value = ''; g('f-to').value = '2026-10-05';
    await generateReport();
    out.empty = said.slice();
    window.showToast = realToast;
    return out;
  });
  check('a from date after the to date is refused, and says which',
        /after the to date/i.test((refused.backwards || [])[0] || ''), true);
  check('…and an empty box is refused rather than read as everything',
        /pick a from date/i.test((refused.empty || [])[0] || ''), true);

  /* ── 2. PLOT CONDITION: ONE PLOT, ONE DAY, ONE RECORD ─────────────── */
  console.log('\n2. Plot Condition — one plot on one day is one record');
  const p = await read('plot', PLOT);
  const pRec = col(p, '#'), pDate = col(p, 'Date'), pPlot = col(p, 'Plot'),
        pBatch = col(p, 'Batch'), pAnimal = col(p, 'Animal'), pDisease = col(p, 'Disease');

  check('every one of the six rows is still a line on the table',
        (p.grid || []).length, 6);
  /* THREE RECORDS: B01 on the 21st, B01 on the 5th, B02 on the 21st. */
  check('…but they are THREE records, numbered 1 to 3',
        [...new Set((p.grid || []).map((r) => r[pRec]))], ['1', '2', '3']);
  const b01on21 = (p.grid || []).filter((r) => r[pPlot] === 'B01' && r[pDate] === '21 Oct 2026');
  check('B01 on the 21st is one record over its three batches',
        [b01on21.length, new Set(b01on21.map((r) => r[pRec])).size], [3, 1]);
  check('AND THE BATCHES ARE STILL SHOWN, one line each',
        b01on21.map((r) => r[pBatch]), ['250', '253', '268']);
  /* The whole argument for keeping the lines: the readings are per batch. */
  check('…each with its own readings — the rat on 253 is not folded away',
        b01on21.map((r) => r[pAnimal]), ['Tidak Ada', 'Banyak', 'Tidak Ada']);
  check('…and the disease reading likewise',
        b01on21.map((r) => r[pDisease]), ['Sedikit', 'Banyak bintik', 'Tidak Ada']);
  check('the SAME plot on another day is a second record, not more of the first',
        new Set((p.grid || []).filter((r) => r[pPlot] === 'B01').map((r) => r[pRec])).size, 2);
  /* The house rule: plots compare on letters and digits. A stray trailing
     space is not a fourth visit to B02. */
  const b02 = (p.grid || []).filter((r) => (r[pPlot] || '').trim() === 'B02');
  check('a stray space on the plot does not split the visit',
        [b02.length, new Set(b02.map((r) => r[pRec])).size], [2, 1]);
  check('the merge is real: a continuation line emits only what differs',
        [...new Set((p.body || []).map((r) => r.length))].sort(), [5, 8]);
  check('the foot says both figures, records first',
        p.foot, 'Total: 3 records · 6 batches');

  /* ── 3. MAINTENANCE: ONE PLOT, ONE TASK, ONE DAY ──────────────────── */
  console.log('\n3. Maintenance — one plot and one task on one day is one record');
  const m = await read('maint', MAINT);
  const mRec = col(m, '#'), mPlot = col(m, 'Plot'), mTask = col(m, 'Task'),
        mCase = col(m, 'Case'), mResult = col(m, 'Result');

  check('all five cases are still lines on the table', (m.grid || []).length, 5);
  check('…and they are THREE records', [...new Set((m.grid || []).map((r) => r[mRec]))],
        ['1', '2', '3']);
  const b05spray = (m.grid || []).filter((r) => r[mPlot] === 'B05' && r[mTask] === 'Interrow Spray');
  check('the office own three B05 cases are one record',
        [b05spray.length, new Set(b05spray.map((r) => r[mRec])).size], [3, 1]);
  check('AND THE CASE NUMBERS ARE STILL SHOWN, one line each',
        b05spray.map((r) => r[mCase]).sort(),
        ['1791248487117', '1791248487131', '1791248487134']);
  /* A closure and a real audit on one plot, task and day are two cases
     saying different things -- the pair the duplicate repair arbitrated 188
     of -- so Result cannot be merged either. */
  check('Result is per case, never merged over them',
        (m.grid || []).filter((r) => r[mPlot] === 'B05').map((r) => r[mResult]).join('|')
          .indexOf('Satisfied') >= 0, true);
  /* THE TASK IS WHAT SPLITS THEM, and it has to be in the SORT as well as
     the key: the manuring case sits between the interrow ones in the
     fixture, so a sort that ignores the task draws the record as two runs
     with another record's line in the middle of it. */
  const b05 = (m.grid || []).filter((r) => r[mPlot] === 'B05');
  check('weeding and spraying the same plot on one day are TWO records',
        new Set(b05.map((r) => r[mRec])).size, 2);
  check('…and neither is broken into two blocks by the other',
        b05.map((r) => r[mRec]).join(''), '1112');
  check('a different plot on the same day and task is its own record',
        new Set((m.grid || []).filter((r) => r[mPlot] === 'B06').map((r) => r[mRec])).size, 1);
  check('the foot counts records and cases',
        m.foot, 'Total: 3 records · 5 cases');

  /* ── 4. EVERY FIGURE ON THE PAGE AGREES ───────────────────────────── */
  console.log('\n4. The card, the badge and the foot are the same figure');
  const out = await page.evaluate(async () => {
    const g = (id) => document.getElementById(id);
    if (!g('f-from')) return { err: 'no date boxes' };
    g('f-from').value = '2026-10-01'; g('f-to').value = '2026-10-31';
    [...document.querySelectorAll('.mod-cb')].forEach((cb) => { cb.checked = false; });
    selectedMods.clear();
    [...document.querySelectorAll('.mod-cb')].forEach((cb) => {
      const want = /Plot Condition|Maintenance|Papan Tanda/.test(cb.parentElement.textContent);
      if (want) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
    });
    [...document.querySelectorAll('.f-nurs-cb')].forEach((cb) => { cb.checked = cb.value === 'BNN'; });
    await generateReport();
    const cards = {};
    [...document.querySelectorAll('#report-output .sum-card')].forEach((c) => {
      cards[c.querySelector('.sum-label').textContent.trim()] =
        c.querySelector('.sum-val').textContent.trim();
    });
    const badges = [...document.querySelectorAll('#report-output .mod-block')].map((b) => [
      b.querySelector('.mod-block-name').textContent.trim(),
      b.querySelector('.badge').textContent.trim(),
      (b.querySelector('.total-row td') || {}).textContent.trim()
    ]);
    return {
      cards, badges,
      sectionTotal: (document.querySelector('#report-output .mod-head-badge') || {}).textContent,
      period: (document.querySelector('#report-output .report-period') || {}).textContent
    };
  });
  const badgeOf = (name) => ((out.badges || []).find((b) => b[0].indexOf(name) >= 0) || [])[1];
  const footOf  = (name) => ((out.badges || []).find((b) => b[0].indexOf(name) >= 0) || [])[2];
  check('the Plot Condition card counts visits, not batches',
        (out.cards || {})['Plot Condition'], '3');
  check('…and its badge says the same', badgeOf('Plot Condition'), '3 records');
  check('…and its foot says the same, with the batches beside it',
        footOf('Plot Condition'), 'Total: 3 records · 6 batches');
  check('the Maintenance card counts visits, not cases',
        (out.cards || {})['Maintenance'], '3');
  check('…and its badge says the same', badgeOf('Maintenance'), '3 records');
  check('Total Audits is the sum of those records', (out.cards || {})['Total Audits'], '8');
  check('…and so is the section total', (out.sectionTotal || '').trim(), '8 total');
  check('the heading names the range that was picked',
        (out.period || '').indexOf('01 Oct 2026 – 31 Oct 2026') >= 0, true);

  /* ── 5. THE OTHER TWO MODULES ARE UNTOUCHED ───────────────────────── */
  console.log('\n5. Papan Tanda and Seedling Height are not grouped');
  /* Papan is one sign per plot and Height is measured plot by plot, so
     neither has a row the office reads as a repeat. Two papan rows on one
     plot and one day stay TWO records -- grouping them would be inventing
     a rule nobody asked for, on the module whose roster is already two
     months wide. */
  check('two papan rows on one plot and day are still two records',
        (out.cards || {})['Papan Tanda'], '2');
  const pt = await read('papan', PAPAN);
  check('…and nothing on its table is merged',
        [...new Set((pt.body || []).map((r) => r.length))], [(pt.head || []).length]);
  check('and neither module has a record key at all',
        await page.evaluate(() => typeof MOD_RECORD_KEY === 'undefined'
          ? 'no MOD_RECORD_KEY'
          : Object.keys(MOD_RECORD_KEY).sort()), ['maint', 'plot']);

  /* ── 6. THE PHONE ─────────────────────────────────────────────────── */
  console.log('\n6. On a phone the card says what it continues');
  /* Below 720px the table folds into one card per ROW and a rowspan means
     nothing at all -- so the cards after the first would open on a batch
     with no plot and no day on them. The continuation lines are marked and
     carry what they are a continuation OF. */
  /* Read in the order the table DRAWS, which is plot, then day, then
     batch -- so B01 on the 5th comes first and is a record of its own,
     then B01 on the 21st with its two continuations, then B02 with one. */
  check('the lines that continue a plot record are marked',
        (p.cont || []).map((c) => (c.cont ? 1 : 0)).join(''), '001101');
  check('…and say what they continue',
        [...new Set((p.cont || []).filter((c) => c.cont).map((c) => c.note))],
        ['same plot · same day']);
  check('maintenance says its own, naming the task',
        [...new Set((m.cont || []).filter((c) => c.cont).map((c) => c.note))],
        ['same plot · same task · same day']);

  if (process.env.SHOT) {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.screenshot({ path: process.env.SHOT, fullPage: true });
    console.log('  shot  ' + process.env.SHOT);
  }

  await browser.close();
  server.close();
  console.log('');
  console.log(fail ? fail + ' FAILED  (' + pass + ' ok)' : 'all good  (' + pass + ' ok)');
  process.exit(fail ? 1 : 0);
})();
