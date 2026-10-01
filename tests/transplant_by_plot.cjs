/* What was transplanted, plot by plot, and the nursery's total under it.

   The salary claim says what each worker is owed. It could not say how many
   seedlings went into a plot, and adding it up would not have answered that
   either: a plot carries FOUR jobs — blanket spray, lining, polybag filling,
   transplanting — and every one of them records the same figure, the number
   the operation report says went into that plot. Add the four and the
   nursery reports at four times its size.

   So this table counts each plot once, from its newest record, and totals
   the nursery at the foot. It is also the only place a plot shows when
   nobody was credited on it, because a record with no crew produces no claim
   line at all.

   Driven on the real page: fixtures into the stub, the circle clicked, the
   table read.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/transplant_by_plot.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }
function checkFalse(name, got) { check(name, !!got, false); }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _now  = new Date();
const YM    = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
const MONTH = `${MONTHS[_now.getMonth()]} ${_now.getFullYear()}`;
const JOBS  = ['blanket_spray', 'lining', 'polybag_fill', 'transplanting'];

const rec = (o) => Object.assign({
  work_date: `${YM}-09`, nursery_name: 'UNN 2', plot_name: 'N3',
  batch_name: '252', work_type: 'transplanting', jenis: 'Memindah anak sawit ke polibeg besar',
  schedule_month: MONTH, source_qty: 6685, workers: [{ name: 'Ali Bin Hassan', qty: null }],
  total_qty: null
}, o);

/* N3 — the whole plot, all four jobs, every one carrying the plot's 6,685.
   N7 — one job, 900, and NOBODY named on it.
   N9 — two jobs keyed against different figures; the newer one is 1,300.
   B3 — another nursery's, which must not be in UNN 2's total.          */
const FIELD = [
  ...JOBS.map((k, i) => rec({ work_type: k, work_date: `${YM}-0${i + 3}` })),
  rec({ plot_name: 'N7', work_type: 'lining', source_qty: 900, batch_name: '253', workers: [] }),
  rec({ plot_name: 'N9', work_type: 'lining',        source_qty: 1200, work_date: `${YM}-10` }),
  rec({ plot_name: 'N9', work_type: 'transplanting', source_qty: 1300, work_date: `${YM}-18` }),
  rec({ nursery_name: 'BNN', plot_name: 'B3', source_qty: 800, batch_name: '260' })
];

const REGISTER = [{ id: 1, full_name: 'Ali Bin Hassan', section: 'UNN2', status: 'active' }];

/* A real 8×8 PNG, served where the maps are. It has to decode: an image the
   browser refuses is indistinguishable from one storage would not hand over,
   and the check would pass for the wrong reason. */
const MAP_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPQiNLAihiGlgQAm7gqgcKuZ38AAAAASUVORK5CYII=',
  'base64');

/* The ledger's transplanting rows, each carrying the map that was flown for
   the plot when the batch report filled it — `MapUrl:` on the remark, which
   is where it has always been written. */
const log = (plot, batch, url, date) => ({
  plot_name: plot, batch_name: batch, transaction_type: 'Transplanted',
  transaction_date: date, created_at: date + 'T02:00:00Z',
  remark: `Transplanted from tray [P4] to Main Plot [${plot}]. Date: ${date}`
        + (url ? ` MapUrl:${url}` : '')
});
const LEDGER = [
  log('N3',  '252', 'https://files.test/maps/n3.jpg',  `${YM}-02`),
  log('N9',  '252', 'https://files.test/maps/n9.pdf',  `${YM}-08`),
  log('B3',  '260', 'https://files.test/maps/b3.jpg',  `${YM}-04`),
  // a map for N3 from another batch, years ago — a plot is re-used, and the
  // batch is what tells one flight from another
  log('N3',  '101', 'https://files.test/maps/old.jpg', '2024-01-05'),
  // N7 was transplanted but nobody flew it
  log('N7',  '253', '',                                `${YM}-09`),
  /* The same flight twice on one plot — two trays fed N3 and the office
     pasted the one map on both rows. */
  log('N3',  '252', 'https://files.test/maps/n3.jpg',  `${YM}-06`)
];

async function boot(browser, field, ledger) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((seed) => {
    window.__DB = seed;
    /* A recording jsPDF. The real one is on a blocked CDN, and what is being
       checked is what the form SAYS — every string it puts on the page, in
       order, with the page it landed on. */
    window.__PDF = null;
    window.jspdf = { jsPDF: class {
      constructor() { this.page = 1; this.lines = []; this.images = []; this.rects = [];
                      this.saved = null; window.__PDF = this; }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {}
      setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect(x, y, w, h) { this.rects.push({ x, y, w, h, page: this.page }); }
      line() {}
      addPage() { this.page++; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.5; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { this.lines.push({ t: String(t), x, y, page: this.page }); }
      addImage(im, fmt, x, y, w, h) {
        this.images.push({ src: (im && im.src) || '', fmt, x, y, w, h, page: this.page });
      }
      save(name) { this.saved = name; }
    } };
    function makeQuery(table) {
      const st = { eqs: [], single: false };
      const rows = () => {
        let out = (window.__DB[table] || []).slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return out;
      };
      const run = () => {
        const out = rows();
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'insert' || p === 'upsert' || p === 'update' || p === 'delete')
          return () => ({ select: () => Promise.resolve({ data: [], error: null }),
                          eq: () => q, then: (a, b) => Promise.resolve({ data: [], error: null }).then(a, b) });
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'elon.mjm@gmail.com' };
    window.supabase = { createClient: () => ({
      from: makeQuery, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      storage: { from: () => ({ upload: async () => ({ data: {}, error: null }),
                                getPublicUrl: () => ({ data: { publicUrl: '' } }),
                                remove: async () => ({ error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, { mjmnpayroll_workers: REGISTER, nops_transplant_field_records: field,
       shared_inventory_logs: ledger === undefined ? LEDGER : ledger });

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
  /* The maps are drawn into the PDF, so they are actually loaded. A real
     (tiny) PNG, served with the CORS header storage sends, so the canvas is
     not tainted — which is the thing that would break the whole file. */
  await page.route('https://files.test/**', (r) => r.fulfill({
    status: 200,
    headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' },
    body: MAP_PNG }));

  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderTransplantByPlot === 'function'
                                && typeof window.drawDroneMaps === 'function',
                             { timeout: 20000 });
  await page.click('[data-sub="transpl"]');
  await page.waitForFunction(() => {
    const t = document.getElementById('transpl-plots-table');
    return t && (t.textContent || '').trim().length > 0;
  }, { timeout: 15000 });
  return page;
}

async function pick(page, code) {
  await page.evaluate((c) => {
    const b = [...document.querySelectorAll('#transpl-section-pills .npill')]
      .find((x) => (x.dataset.code || '') === c);
    if (b) b.click();
  }, code);
  await page.waitForTimeout(150);
}

/* The table as rows of cells, and the footer on its own. */
const read = (page) => page.evaluate(() => {
  const t = document.getElementById('transpl-plots-table');
  const cells = (tr) => [...tr.children].map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim());
  return {
    head: (document.getElementById('transpl-plots-head').textContent || '').replace(/\s+/g, ' ').trim(),
    cols: [...t.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim()),
    body: [...t.querySelectorAll('tbody tr')].map(cells),
    foot: [...t.querySelectorAll('tfoot tr')].map(cells),
    note: (document.getElementById('transpl-plots-note').textContent || '').replace(/\s+/g, ' ').trim()
  };
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nA line per plot, under the nursery on the topbar');
  {
    const page = await boot(browser, FIELD);
    await pick(page, 'UNN2');
    const t = await read(page);

    checkTrue('the section is headed with the nursery and the month',
              t.head.includes('UNN2') && t.head.includes(MONTH));
    check('the columns — the plot, its maps and the amount. No Batch column: '
        + 'the label under each thumbnail already says which batch that map is',
          t.cols, ['No.', 'Plot', 'Drone Map', 'Transplanted']);

    check('three plots, in plot order', t.body.map((r) => r[1]), ['N3', 'N7', 'N9']);
    checkFalse('and not the other nursery’s',
               t.body.some((r) => r[1] === 'B3'));

    const n3 = t.body.find((r) => r[1] === 'N3');
    check('N3 IS ONE LINE, not four — its four jobs all carry the same figure',
          n3[3], '6,685');
    check('a plot with only one of its four jobs recorded still carries its '
        + 'quantity', t.body.find((r) => r[1] === 'N7')[3], '900');

    console.log('\nThe total under it');
    checkTrue('the footer is the nursery and the month',
              t.foot[0][0].includes('UNN2') && t.foot[0][0].includes(MONTH));
    check('IT IS THE PLOTS ADDED UP — 6,685 + 900 + 1,300', t.foot[0][1], '8,885');
    checkFalse('…not the four jobs added up, which would be four times the nursery',
               t.foot[0][1] === (6685 * 4 + 900 + 1300 * 2).toLocaleString());

    console.log('\nWhat the table says out loud');
    checkTrue('a plot whose jobs were keyed against different figures is named',
              /N9/.test(t.note) && /more than one figure/i.test(t.note));
    checkTrue('…with both figures', /1,200/.test(t.note) && /1,300/.test(t.note));
    check('…and the newest is the one counted',
          t.body.find((r) => r[1] === 'N9')[3].replace(/[^0-9,]/g, ''), '1,300');
    checkTrue('a plot that names nobody is named too',
              /N7/.test(t.note) && /on no claim line/i.test(t.note));

    console.log('\nThe other nursery answers for itself');
    await pick(page, 'BNN');
    const b = await read(page);
    check('one plot', b.body.map((r) => r[1]), ['B3']);
    check('…and its own total', b.foot[0][1], '800');
    checkTrue('…headed with its own name', b.head.includes('BNN'));

    console.log('\nA nursery with nothing in it');
    await pick(page, 'UNN1');
    const u = await read(page);
    check('no rows', u.body.length, 1);
    checkTrue('…and it says which nursery and which month is empty',
              /Nothing transplanted/i.test(u.body[0][0])
              && u.body[0][0].includes('UNN1') && u.body[0][0].includes(MONTH));
    await page.close();
  }

  console.log('\nWhen nobody is credited at all');
  {
    /* The claim has no lines to show, and returns early. The plots are still
       the month's work, and this is the only place they appear. */
    const page = await boot(browser, FIELD.filter((r) => r.nursery_name === 'UNN 2')
      .map((r) => Object.assign({}, r, { workers: [] })));
    await pick(page, 'UNN2');
    const t = await read(page);
    check('the plots are still there', t.body.map((r) => r[1]), ['N3', 'N7', 'N9']);
    check('…and the total with them', t.foot[0][1], '8,885');
    const claim = await page.evaluate(() =>
      (document.getElementById('transpl-table').textContent || '').replace(/\s+/g, ' ').trim());
    checkTrue('…while the claim itself has nothing to pay', /name nobody/i.test(claim));
    await page.close();
  }

  console.log('\nA plot with no quantity on its record');
  {
    const page = await boot(browser, [rec({ plot_name: 'N5', source_qty: null })]);
    await pick(page, 'UNN2');
    const t = await read(page);
    check('it is listed', t.body.map((r) => r[1]), ['N5']);
    check('…with a dash rather than a nought', t.body[0][3], '—');
    check('…and adds nothing to the total', t.foot[0][1], '0');
    checkTrue('…which is said, not left to be noticed',
              /no quantity on the record/i.test(t.note));
    await page.close();
  }

  console.log('\nThe summary on the downloaded claim form');
  {
    const page = await boot(browser, FIELD);
    await pick(page, 'UNN2');
    // The download is async now: the maps are fetched before the file is
    // written, so reading it before it has waited reads a file with no name.
    const pdf = await page.evaluate(async () => {
      await downloadTransplantPDF();
      const d = window.__PDF;
      return d ? { lines: d.lines.map((l) => l.t), saved: d.saved,
                   pages: d.page } : null;
    });
    checkTrue('a file is produced', !!(pdf && pdf.saved));
    checkTrue('…named for the nursery and the month',
              /Salary_Claim_Transplanting_UNN2/.test(pdf.saved) && pdf.saved.includes(MONTH.split(' ')[0]));
    const txt = pdf.lines.join(' | ');
    checkTrue('the claim form is still the claim form',
              /SALARY CLAIM FORM/.test(txt) && /Grand Total/.test(txt));
    checkTrue('AND THE PLOT SUMMARY IS ON IT',
              /TRANSPLANTING BY PLOT/.test(txt));
    checkTrue('…headed with the nursery and the month',
              pdf.lines.some((l) => /TRANSPLANTING BY PLOT/.test(l)
                                 && /UNN2/.test(l) && l.includes(MONTH)));
    check('…its columns are the plot and the amount',
          ['No.', 'Plot', 'Transplanted'].filter((c) => pdf.lines.includes(c)),
          ['No.', 'Plot', 'Transplanted']);
    checkFalse('…and not the ones that came off the screen',
               pdf.lines.includes('Batch') || pdf.lines.includes('First worked')
               || pdf.lines.includes('Jobs'));
    checkTrue('every plot is on it',
              ['N3', 'N7', 'N9'].every((p) => pdf.lines.includes(p)));
    checkTrue('…with its amount', ['6,685', '900'].every((n) => pdf.lines.includes(n))
                               && pdf.lines.some((l) => l.indexOf('1,300') === 0));
    checkTrue('…and the nursery total under them',
              pdf.lines.some((l) => /^TOTAL — /.test(l) && /UNN2/.test(l))
              && pdf.lines.includes('8,885'));
    checkTrue('the plot keyed against two figures is marked and explained',
              pdf.lines.some((l) => /^\* N9/.test(l) && /more than one figure/.test(l)));
    checkTrue('…and the one that names nobody',
              pdf.lines.some((l) => /^N7 — names nobody/.test(l)));
    await page.close();
  }

  console.log('\nA month whose records name nobody still downloads');
  {
    const page = await boot(browser, FIELD.filter((r) => r.nursery_name === 'UNN 2')
      .map((r) => Object.assign({}, r, { workers: [] })));
    await pick(page, 'UNN2');
    const pdf = await page.evaluate(async () => {
      window.__ALERT = null;
      const a = window.alert; window.alert = (m) => { window.__ALERT = m; };
      await downloadTransplantPDF();
      window.alert = a;
      const d = window.__PDF;
      return { alert: window.__ALERT, lines: d ? d.lines.map((l) => l.t) : null,
               saved: d ? d.saved : null };
    });
    checkFalse('it is not refused', /Nothing recorded/i.test(String(pdf.alert || '')));
    checkTrue('a file is still produced', !!pdf.saved);
    checkTrue('…saying the claim is empty and why',
              pdf.lines.some((l) => /NOTHING TO CLAIM/.test(l) && /name nobody/.test(l)));
    checkTrue('…and carrying the plots that were worked',
              ['N3', 'N7', 'N9'].every((p) => pdf.lines.includes(p))
              && pdf.lines.includes('8,885'));
    await page.close();
  }

  console.log('\nThe drone map, on the table');
  {
    const page = await boot(browser, FIELD);
    await pick(page, 'UNN2');
    const maps = await page.$$eval('#transpl-plots-table tbody tr', (trs) =>
      trs.map((tr) => ({
        plot: (tr.children[1].textContent || '').trim(),
        links: [...tr.children[2].querySelectorAll('a.tp-map')].map((a) => ({
          href: a.getAttribute('href'), pdf: a.classList.contains('is-pdf'),
          tab: a.getAttribute('target'), title: a.title,
          bg: a.getAttribute('style') || '' })),
        labels: [...tr.children[2].querySelectorAll('.tp-map-b')].map((e) => e.textContent.trim()),
        none: tr.children[2].querySelectorAll('.tp-map.is-none').length,
        txt: (tr.children[2].textContent || '').replace(/\s+/g, ' ').trim()
      })));

    const n3 = maps.find((m) => m.plot === 'N3');
    check('the plot\u2019s map is on its row', n3.links.length, 1);
    check('…the one flown for THIS batch, not the one from years ago',
          n3.links[0].href, 'https://files.test/maps/n3.jpg');
    checkTrue('…shown as the map itself', n3.links[0].bg.includes('n3.jpg'));
    check('…opening in a new tab, which is where it prints', n3.links[0].tab, '_blank');
    checkTrue('…and saying what it is', /Drone map/.test(n3.links[0].title)
                                     && /N3/.test(n3.links[0].title)
                                     && /252/.test(n3.links[0].title));

    const n9 = maps.find((m) => m.plot === 'N9');
    checkTrue('a map that is a PDF cannot be a thumbnail, so it is a document',
              n9.links.length === 1 && n9.links[0].pdf && /\u{1F4C4}/u.test(n9.txt));

    check('the thumbnail is labelled with its batch, which is what a Batch '
        + 'column would have said twice', n3.labels, ['252']);

    checkTrue('…and a map from another batch years ago is NOT on this month\u2019s '
            + 'row', !maps.some((m) => m.links.some((l) => /old\.jpg/.test(l.href))));

    const n7 = maps.find((m) => m.plot === 'N7');
    check('a batch nobody flew keeps its place, greyed, rather than leaving a '
        + 'gap that names nothing', [n7.links.length, n7.none, n7.labels], [0, 1, ['253']]);
    await page.close();
  }

  console.log('\nThe maps, on the end of the claim form');
  {
    const page = await boot(browser, FIELD);
    await pick(page, 'UNN2');
    const pdf = await page.evaluate(async () => {
      window.__PDF = null;
      await downloadTransplantPDF();
      const d = window.__PDF;
      return { lines: d.lines, images: d.images, rects: d.rects, pages: d.page, saved: d.saved };
    });

    const txt = pdf.lines.map((l) => l.t);
    checkTrue('one file, and it is still the claim form',
              /Salary_Claim_Transplanting/.test(pdf.saved)
              && txt.includes('SALARY CLAIM FORM — TRANSPLANTING'));
    checkTrue('…with the plot summary on it', txt.some((t) => /TRANSPLANTING BY PLOT/.test(t)));
    checkTrue('…AND THE DRONE MAPS', txt.some((t) => t === 'DRONE MAPS — TRANSPLANTING'));

    /* THIS NURSERY'S MAPS AND NO OTHER. The claim form is one nursery's, so
       the evidence stapled to it is that nursery's — it carried all three
       for a while, which made BNN's claim a folder with UNN 1's and UNN 2's
       plots in the back of it. */
    const heads = pdf.lines.filter((l) => l.t === 'DRONE MAPS — TRANSPLANTING')
      .map((l) => { const n = pdf.lines.find((x) => x.page === l.page && /^(BNN|UNN1|UNN2) —/.test(x.t));
                    return n ? n.t.split(' —')[0] : '?'; });
    check('every map page is headed with the nursery on the bar, and only it',
          heads, ['UNN2']);

    // Only the map pages: the plot summary names the same plots in a column
    // of its own, and a check that cannot tell the two apart proves nothing.
    const mapPages = new Set(pdf.lines.filter((l) => l.t === 'DRONE MAPS — TRANSPLANTING')
                                      .map((l) => l.page));
    const caps = pdf.lines.filter((l) => mapPages.has(l.page) && /^(B3|N3|N9)/.test(l.t))
                          .map((l) => l.t);
    check('one card per BATCH, naming the plots it covers — not one per plot',
          caps, ['N3', 'N9']);
    checkFalse('…and another nursery\u2019s plot is not among them',
               caps.includes('B3'));
    check('…and every map that can be drawn IS drawn', pdf.images.length, 1);
    checkTrue('…as the map itself',
              pdf.images.every((i) => /files\.test\/maps\//.test(i.src)));
    checkTrue('…and it is this nursery\u2019s',
              /files\.test\/maps\/n3\.jpg/.test(pdf.images[0].src));
    checkTrue('a map that is a PDF says so rather than leaving an empty box',
              txt.some((t) => /cannot be printed with the others/.test(t)));

    /* NOTHING RUNS OFF THE PAGE. The first pass put two fixed-height cards
       under a title, which came to 305mm on a page 297 tall — the second map
       hung off the bottom. A4 is 210 × 297. */
    const over = pdf.images.filter((i) =>
      i.x < 0 || i.y < 0 || i.x + i.w > 210 || i.y + i.h > 297);
    check('every map is inside the paper', over, []);
    const mapRects = pdf.rects.filter((r) => mapPages.has(r.page));
    check('…and so is every frame round one',
          mapRects.filter((r) => r.y + r.h > 297 - 6 || r.x + r.w > 210 - 6), []);
    /* …and inside its OWN frame, which is the other half of the complaint. */
    const outside = pdf.images.filter((im) => !mapRects.some((r) =>
      im.x >= r.x - 0.01 && im.y >= r.y - 0.01
      && im.x + im.w <= r.x + r.w + 0.01 && im.y + im.h <= r.y + r.h + 0.01));
    check('every map is inside the frame drawn round it', outside, []);
    /* The two on a page do not sit on top of each other either. */
    const byPage = {};
    pdf.images.forEach((i) => { (byPage[i.page] || (byPage[i.page] = [])).push(i); });
    const overlap = Object.values(byPage).filter((g) => g.length === 2
      && g[0].y + g[0].h > g[1].y && g[1].y + g[1].h > g[0].y);
    check('…and two on a page do not overlap', overlap, []);
    checkTrue('…and the batch is on the card', txt.some((t) => /Batch 252/.test(t)));
    await page.close();
  }

  console.log('\nAnother nursery\u2019s claim form');
  {
    const page = await boot(browser, FIELD);
    await pick(page, 'BNN');
    const pdf = await page.evaluate(async () => {
      window.__PDF = null;
      await downloadTransplantPDF();
      return { lines: window.__PDF.lines, images: window.__PDF.images };
    });
    const mapPages = new Set(pdf.lines.filter((l) => l.t === 'DRONE MAPS — TRANSPLANTING')
                                      .map((l) => l.page));
    const caps = pdf.lines.filter((l) => mapPages.has(l.page) && /^(B3|N3|N9)/.test(l.t))
                          .map((l) => l.t);
    check('BNN\u2019s claim carries BNN\u2019s map', caps, ['B3']);
    check('…and one picture, not three', pdf.images.length, 1);
    checkTrue('…which is B3\u2019s', /maps\/b3\.jpg/.test(pdf.images[0].src));
    await page.close();
  }

  console.log('\nTwo maps on one page, inside the paper');
  {
    /* The first pass put two fixed-height cards under a title: 59mm gone to
       the title and 117mm a card comes to 305 on a page 297 tall, so the
       SECOND map hung off the bottom. One image per page would never have
       shown it — this is two. */
    const field = [rec({ plot_name: 'N3', source_qty: 1000, batch_name: '252' }),
                   rec({ plot_name: 'N5', source_qty: 2000, batch_name: '254' })];
    const ledger = [log('N3', '252', 'https://files.test/maps/a.jpg', `${YM}-03`),
                    log('N5', '254', 'https://files.test/maps/b.jpg', `${YM}-05`)];
    const page = await boot(browser, field, ledger);
    await pick(page, 'UNN2');
    const pdf = await page.evaluate(async () => {
      window.__PDF = null;
      await downloadTransplantPDF();
      const d = window.__PDF;
      return { images: d.images, rects: d.rects, lines: d.lines };
    });

    check('both maps are drawn', pdf.images.length, 2);
    check('…on the one page', pdf.images[0].page, pdf.images[1].page);
    check('…and BOTH ARE INSIDE THE PAPER — A4 is 210 by 297',
          pdf.images.filter((i) => i.x < 0 || i.y < 0
                                || i.x + i.w > 210 || i.y + i.h > 297), []);
    const mapPage = pdf.images[0].page;
    const frames = pdf.rects.filter((r) => r.page === mapPage && r.w > 100);
    check('…as is every frame round one',
          frames.filter((r) => r.y + r.h > 297 - 6), []);
    check('each map is inside its own frame',
          pdf.images.filter((im) => !frames.some((r) =>
            im.x >= r.x - 0.01 && im.y >= r.y - 0.01
            && im.x + im.w <= r.x + r.w + 0.01 && im.y + im.h <= r.y + r.h + 0.01)), []);
    checkFalse('…and the two do not sit on top of each other',
               pdf.images[0].y + pdf.images[0].h > pdf.images[1].y
               && pdf.images[1].y + pdf.images[1].h > pdf.images[0].y);
    await page.close();
  }

  console.log('\nOne flight over two plots');
  {
    /* One batch filling two plots is one flight. It used to be one sheet of
       A4 per plot — the same picture twice. */
    const field = [rec({ nursery_name: 'BNN', plot_name: 'B3', source_qty: 800, batch_name: '260' }),
                   rec({ nursery_name: 'BNN', plot_name: 'B4', source_qty: 600, batch_name: '260' })];
    const ledger = [log('B3', '260', 'https://files.test/maps/pair.jpg', `${YM}-04`),
                    log('B4', '260', 'https://files.test/maps/pair.jpg', `${YM}-04`)];
    const page = await boot(browser, field, ledger);
    await pick(page, 'BNN');
    const pdf = await page.evaluate(async () => {
      window.__PDF = null;
      await downloadTransplantPDF();
      return { lines: window.__PDF.lines.map((l) => l.t), images: window.__PDF.images };
    });
    check('the picture is drawn once', pdf.images.length, 1);
    const cap = pdf.lines.find((t) => /B3/.test(t) && /B4/.test(t));
    checkTrue('…on one card headed with BOTH plots, so neither is lost', !!cap);

    const rows = await page.$$eval('#transpl-plots-table tbody tr', (trs) =>
      trs.map((tr) => ({ plot: (tr.children[1].textContent || '').trim(),
                         n: tr.children[2].querySelectorAll('a.tp-map').length })));
    check('…while on the table each plot still shows it on its own row',
          rows.map((r) => [r.plot, r.n]), [['B3', 1], ['B4', 1]]);
    await page.close();
  }

  console.log('\nA month nobody flew');
  {
    const page = await boot(browser, FIELD, []);
    const pdf = await page.evaluate(async () => {
      window.__ALERT = null;
      const a = window.alert; window.alert = (m) => { window.__ALERT = m; };
      window.__PDF = null;
      await downloadTransplantPDF();
      window.alert = a;
      return { alert: window.__ALERT, saved: window.__PDF.saved,
               lines: window.__PDF.lines.map((l) => l.t), images: window.__PDF.images };
    });
    checkTrue('the claim form still comes out', !!pdf.saved);
    checkFalse('…with no map pages on it',
               pdf.lines.some((t) => t === 'DRONE MAPS — TRANSPLANTING'));
    check('…and nothing drawn', pdf.images.length, 0);
    check('…and no complaint, because nothing was missing', pdf.alert, null);
    await page.close();
  }

  console.log('\nA map that will not load');
  {
    const page = await boot(browser, FIELD);
    await pick(page, 'UNN2');
    await page.route('https://files.test/**', (r) => r.abort());
    const pdf = await page.evaluate(async () => {
      window.__ALERT = null;
      const a = window.alert; window.alert = (m) => { window.__ALERT = m; };
      window.__PDF = null;
      await downloadTransplantPDF();
      window.alert = a;
      return { alert: window.__ALERT, saved: window.__PDF.saved, images: window.__PDF.images };
    });
    checkTrue('the claim form is still produced', !!pdf.saved);
    check('…without the map it could not read', pdf.images.length, 0);
    checkTrue('…and it SAYS which, rather than coming out quietly short of '
            + 'the evidence it was meant to carry',
              /could not be put on it/i.test(String(pdf.alert || ''))
              && /N3/.test(String(pdf.alert || '')));
    checkTrue('…and where they still are',
              /Drone Map column/i.test(String(pdf.alert || '')));
    await page.close();
  }

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
