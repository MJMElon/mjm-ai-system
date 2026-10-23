/* THE SEED AUDIT SHEET PRINTS, AND IT CARRIES THE DAMAGE.

   The office asked for a Print button on the Seed Audit page, showing the
   bag numbers, the supplier figure, the audited figure, the two totals and
   the variance — and NO photographs — plus the Damage Control panel, whose
   figures live one tab away on Seed Planting.

   Two things this holds that are easy to get wrong:

     · ONE DOCUMENT, TWO BUTTONS. Print was asked for after the PDF already
       existed. A second builder drifts, and a printed sheet that disagrees
       with the file beside it is a difference nobody can explain later — so
       the test drives both and compares what they drew, line for line.
     · THE DAMAGE FIGURES ARE calcPlanting's OWN. Damage rate, the FOC
       allowance and how much of it is used are worked out from the same
       three inputs on both screens, so the sheet cannot say one thing while
       Tab 2 says another.

   The jsPDF here is STRICT — every co-ordinate must be a finite number, the
   way the real library refuses one. A stub that takes anything signs off a
   sheet that cannot be drawn, which is exactly how the payroll claim form
   came to be dead for weeks with every test passing.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_seed_audit_sheet_prints.cjs
   with a static server on 8777 serving the repository root.                */
const { chromium } = require('playwright');

const BATCH = '278';
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

/* Batch 278, as the office had it on screen: four bags of 250 that tally,
   one that does not, and 327 damaged seeds against a 500-seed FOC. */
const DO_QTY = 10000, FOC_QTY = 500, DAMAGED = 327;
const ROWS = [
  { id: 'sr-1', batch_name: BATCH, transaction_type: 'Seeds_Received',
    breed_name: 'AA HYBRIDA 1S', quantity_change: DO_QTY + FOC_QTY, plot_name: 'Pre-Nursery',
    transaction_date: '2026-09-01', created_at: '2026-09-01T02:00:00Z', workers: 4,
    remark: `Seeds received. Supplier: AAR. DO_Qty: ${DO_QTY}. FOC_Qty: ${FOC_QTY}. MPOB: 123-456` },
  { id: 'dm-1', batch_name: BATCH, transaction_type: 'Damaged_Seeds',
    quantity_change: DAMAGED, plot_name: null, transaction_date: '2026-09-02',
    created_at: '2026-09-02T02:00:00Z', remark: 'Damaged seeds' }
];
const BAGS = [
  ['MJ11', 250, 250, 250], ['MJ12', 250, 250, 250], ['MJ13', 250, 250, 250],
  ['MJ14', 250, 250, 250], ['MJ15', 250, 300, 300]
].map(([bag, sup, rec, ai], i) => ({
  id: 'sa-' + i, batch_name: BATCH, transaction_type: 'Seed_Audit', plot_name: bag,
  quantity_change: rec, transaction_date: '2026-09-02', created_at: '2026-09-02T0' + i + ':00:00Z',
  remark: `Seed audit. SupplierQty:${sup}. ReceivedQty:${rec}. AiCount:${ai}.`
           + (ai === rec && ai === sup ? '' : ' PhotoUrl:https://files.test/x.jpg')
}));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', e => { if (!/MJMReview/.test(e.message)) console.log('  [page error] ' + e.message); });

  await page.addInitScript(({ rows, bags }) => {
    window.__ROWS = rows; window.__BAGS = bags; window.__PDFS = []; window.__TOASTS = [];

    /* STRICT. A co-ordinate that is not a finite number is refused the way
       the real library refuses it. */
    const fin = v => typeof v === 'number' && isFinite(v);
    function guard(method, args) {
      args.forEach((a, i) => {
        if (!fin(a)) throw new Error('Invalid arguments passed to jsPDF.' + method
                                   + ' (argument ' + (i + 1) + ' is ' + String(a) + ')');
      });
    }
    window.jspdf = { jsPDF: class {
      constructor() {
        this.page = 1; this.pages = 1; this.lines = []; this.images = 0; this.drawn = [];
        this.saved = null; this.printed = false; this.outputs = []; this.boxes = [];
        this.internal = {
          pageSize: { getWidth: () => 595, getHeight: () => 842 },
          getNumberOfPages: () => this.pages
        };
        window.__PDFS.push(this);
      }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {}
      setFillColor() {} setDrawColor() {} setLineWidth() {} setLineDashPattern() {}
      rect(x, y, w, h) { guard('rect', [x, y, w, h]); this.boxes.push({ x, y, w, h, page: this.page }); }
      roundedRect(x, y, w, h, rx, ry) {
        guard('roundedRect', [x, y, w, h, rx, ry]);
        this.boxes.push({ x, y, w, h, page: this.page });
      }
      line(a, b, c, d) { guard('line', [a, b, c, d]); }
      addPage() { this.pages++; this.page = this.pages; }
      setPage(p) { guard('setPage', [p]); this.page = p; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.5; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { guard('text', [x, y]); this.lines.push({ t: String(t), x, y, page: this.page }); }
      addImage(im, fmt, x, y, w, h) {
        guard('addImage', [x, y, w, h]);
        this.images++;
        // Kept so the test can tell a damaged-seed photo from a bag photo —
        // a bare count cannot, and "no photos" means only the bag ones.
        this.drawn.push({ im: String(im).slice(0, 40), x, y, w, h, page: this.page });
      }
      /* IT PAGINATES, and it honours the margin it is given.
         A stub that lays every row on one page cannot see a row drawn into
         the footer band, which is exactly the fault this sheet had: the
         table was given `margin: {left, right}` only, autoTable fell back
         to its own default of 40 for the other two, and page one's 24th row
         landed at y=789 where the footer draws its rule at 802 — eaten by
         the printer. The head and row heights are the real library's own
         for this table (35 and 23.5 at fontSize 10, cellPadding 6, measured
         off jspdf-autotable 3.8.2), so the break falls on the same row the
         real one breaks on. */
      autoTable(opts) {
        this.head = (opts.head || [])[0] || [];
        this.body = opts.body || [];
        const m = opts.margin || {};
        const mTop = m.top == null ? 40 : m.top;
        const mBottom = m.bottom == null ? 40 : m.bottom;
        const HEAD_H = 35, ROW_H = 23.5, floor = 842 - mBottom;
        this.tableRows = [];
        let ty = (opts.startY || 0) + HEAD_H;
        this.body.forEach((r, i) => {
          if (ty + ROW_H > floor) { this.addPage(); ty = mTop + HEAD_H; }
          this.tableRows.push({ n: i + 1, page: this.page, top: ty, bottom: ty + ROW_H });
          ty += ROW_H;
        });
        this.lastAutoTable = { finalY: ty };
      }
      get lastAutoTable() { return this._lat || { finalY: 300 }; }
      set lastAutoTable(v) { this._lat = v; }
      autoPrint() { this.printed = true; }
      output(kind) { this.outputs.push(kind); return 'blob:seed-audit'; }
      save(name) { this.saved = name; }
    } };

    function makeQuery() {
      const st = { filters: {}, single: false };
      const rows = () => {
        const t = st.filters.transaction_type;
        if (t === 'Seed_Audit') return window.__BAGS;
        return (window.__ROWS || []).filter(r => !t || r.transaction_type === t);
      };
      const run = () => { const o = rows(); return st.single ? { data: o[0] || null, error: null } : { data: o, error: null }; };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.filters[c] = v; return q; };
        if (p === 'in') return (c, v) => { st.filters[c] = v[0]; return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'insert' || p === 'upsert') return () => Promise.resolve({ data: null, error: null });
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
  }, { rows: ROWS, bags: BAGS });

  await page.route('**/shared_access.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id: 'u1', email: 'elon.mjm@gmail.com', full_name: 'Elon' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/cdn.jsdelivr.net/**',    r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**',     r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/operation/operation_batch_detail.html?id=' + BATCH, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.printSeedAuditPdf === 'function', { timeout: 15000 });
  await page.evaluate(() => { window.showToast = (m, t) => window.__TOASTS.push({ m, t }); });
  await page.waitForSelector('.t8-bag-row', { state: 'attached', timeout: 10000 });
  await page.waitForTimeout(600);

  console.log('\nThe button is on the page');
  const btn = await page.evaluate(() => {
    const b = document.getElementById('print-t8-btn');
    return b ? { text: (b.textContent || '').trim(), onclick: b.getAttribute('onclick') } : null;
  });
  checkTrue('there is a Print button', btn && /print/i.test(btn.text));
  checkTrue('…and it prints', btn && /printSeedAuditPdf\(\)/.test(btn.onclick));

  /* The delivery and the damage, keyed the way the office keys them: the
     D/O quantity and the FOC percentage on Tab 1 — which is where the
     expected total and the FOC allowance are worked out — and the damaged
     count on Tab 2. Driven through the page's own calculateTotalSeeds and
     calcPlanting, so the figures the sheet reads are the figures the screen
     reads and not a second arithmetic. */
  await page.evaluate(({ doQty, focPct, damaged }) => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('f-do-qty', String(doQty));
    set('f-foc-percent', String(focPct));
    window.calculateTotalSeeds();
    set('t2-damaged', String(damaged));
    window.calcPlanting();
  }, { doQty: DO_QTY, focPct: 5, damaged: DAMAGED });

  /* The damaged seed photos the office asked to see on the sheet. The
     gallery is a `let` at script scope, so the one accessor the sheet reads
     it through is what the fixture supplies — two tall, two wide and one
     that will not load, so the shapes and the refusal are both driven. */
  await page.evaluate(() => {
    window._damagePhotosForPrint = () => ([
      { name: 'site 1', src: 'https://files.test/dmg1.jpg' },
      { name: 'site 2', src: 'https://files.test/dmg2.jpg' },
      { name: 'site 3', src: 'https://files.test/gone.jpg' }
    ]);
    const SHAPES = { 'https://files.test/dmg1.jpg': { w: 400, h: 300 },
                     'https://files.test/dmg2.jpg': { w: 300, h: 600 } };
    window._seedLoadPhoto = async (url) => {
      const s = SHAPES[url];
      return s ? { dataUrl: 'data:image/jpeg;base64,' + url.slice(-8), w: s.w, h: s.h } : null;
    };
  });

  console.log('\nPrint sends the document to the printer');
  await page.evaluate(() => { window.__PDFS = []; return window.printSeedAuditPdf(); });
  const printed = await page.evaluate(() => {
    const d = window.__PDFS[0];
    return d && { head: d.head, body: d.body, images: d.images, printed: d.printed,
                  outputs: d.outputs, saved: d.saved, pages: d.pages, drawn: d.drawn,
                  lines: d.lines, text: d.lines.map(l => l.t) };
  });
  checkTrue('a document was built', !!printed);
  checkTrue('…it asked to be printed', printed.printed);
  check('…and was handed over as a blob, not a download', printed.outputs, ['bloburl']);
  check('…nothing was saved to disk', printed.saved, null);
  const frame = await page.evaluate(() => {
    const f = document.getElementById('seed-audit-print-frame');
    return f ? { src: f.getAttribute('src'), count: document.querySelectorAll('#seed-audit-print-frame').length } : null;
  });
  checkTrue('…and it went into a frame', frame && /^blob:/.test(frame.src));

  console.log('\nWhat the sheet shows');
  check('the bag table has the three columns the office asked for', printed.head.length, 5);
  checkTrue('…bag number', /Bag No/i.test(printed.head[1]));
  checkTrue('…seed per bag from the supplier', /Supplier/i.test(printed.head[2]));
  checkTrue('…seed received on the audit', /Audit/i.test(printed.head[3]));
  checkTrue('…and the variance', /Variance/i.test(printed.head[4]));
  check('one line per bag', printed.body.length, 5);
  check('…the first is MJ11', printed.body[0][1], 'MJ11');
  check('…reading 250 against 250', [printed.body[0][2], printed.body[0][3]], ['250', '250']);
  check('…and the bag that disagrees carries its variance', printed.body[4][4], '+50');

  /* THE OFFICE SAID NO BAG PHOTOGRAPHS. A sheet of bag pictures is not what
     somebody adding up a delivery wants in their hand — five bags here, and
     one of them carries a PhotoUrl. The damaged seed photos ARE wanted, and
     are counted separately below, so the test cannot pass on a bare count. */
  check('no bag photo is drawn', printed.drawn.filter(d => /x\.jpg/.test(d.im)).length, 0);

  console.log('\nThe totals, and BOTH variances');
  const has = re => printed.text.some(t => re.test(t));
  checkTrue('total supplier qty', has(/TOTAL SUPPLIER QTY/i));
  checkTrue('total audited qty', has(/TOTAL AUDITED QTY/i));
  /* The Variance COLUMN adds up to audited − supplier, and that figure was
     worked out and then not printed, so adding the column down gave a number
     that appeared nowhere. */
  checkTrue('the variance the column above adds up to', has(/VARIANCE \(AUDIT/i));
  checkTrue('…and the variance against what was expected', has(/VARIANCE VS EXPECTED/i));
  check('the supplier total is 1,250', printed.text.includes('1,250'), true);
  check('the audited total is 1,300', printed.text.includes('1,300'), true);
  check('…so the variance is +50', printed.text.includes('+50'), true);

  console.log('\nDamage Control, off the Seed Planting figures');
  checkTrue('the section is on the sheet', has(/DAMAGE CONTROL/));
  checkTrue('…the damaged count', printed.text.includes(String(DAMAGED)));
  /* 327 of 10,500 is 3.11%, which is the figure on Tab 2 — the same three
     inputs, worked out the same way. */
  checkTrue('…the damage rate, as Tab 2 reads it', has(/^3\.11%$/));
  checkTrue('…the FOC allowance and what it is in seeds', has(/FOC 5\.00% \(500 seeds\)/));
  checkTrue('…and how much of the allowance is used', has(/FOC allowance used: 65\.40% of FOC limit/));
  check('nothing is called excess while it is inside the allowance',
        has(/EXCESS/i), false);

  console.log('\nThe damaged seed photos are ON the sheet');
  checkTrue('the section is headed', has(/DAMAGED SEED PHOTOS/));
  check('the two that loaded are drawn', printed.drawn.length, 2);
  /* SIZED FROM THEIR OWN SHAPE. A damaged seed count stretched into a fixed
     box is a picture nobody can count anything in. */
  const shapeOf = d => (d.w / d.h).toFixed(2);
  check('the landscape one keeps 4:3', shapeOf(printed.drawn[0]), (400 / 300).toFixed(2));
  check('…and the tall one keeps 1:2', shapeOf(printed.drawn[1]), (300 / 600).toFixed(2));

  /* THEY FILL THE ROOM THEY ARE GIVEN. Three across at a fixed height meant
     two photos sat as thumbnails at the top of an otherwise empty page
     while the page before them ended early — half a sheet of nothing either
     side of them, which is what the office said of it. */
  const PAGE_H = 842, FOOT = 60, TOP = 36 + 20;
  const bottomOf = d => d.y + d.h;
  const lastBottom = Math.max(...printed.drawn.map(bottomOf));
  const firstTop = Math.min(...printed.drawn.map(d => d.y));
  const used = lastBottom - firstTop;
  /* MIN_USEFUL is the page's own floor — under that it moves the section to
     a page of its own rather than printing in the gap. A number pinned
     higher than it fails the day the block above grows by a line, which is
     what a bag table that now stops short of the footer did to it. The
     room-relative check below is the one that carries the weight. */
  const MIN_USEFUL = 90;
  checkTrue('the pictures are not stamps on an empty page (' +
            Math.round(used) + 'pt)', used > MIN_USEFUL);
  checkTrue('…and they stay inside the foot', lastBottom <= PAGE_H - FOOT + 1);
  /* THE MEASURE IS THE ROOM, never a number pinned here. A threshold on the
     photo width would pass or fail on how many bag rows the fixture happens
     to carry, which is exactly the thing the layout is supposed to adapt
     to. So: the block is compared against the room it was actually given —
     heading to foot, less what still has to go under it. */
  const headY = (printed.lines.find(l => /DAMAGED SEED PHOTOS/.test(l.t)) || {}).y;
  const TAIL = 12;                       // the could-not-be-loaded line
  const roomGiven = (PAGE_H - FOOT) - (headY + 14) - TAIL;
  checkTrue('they fill the room they were given (' + Math.round(used) + ' of ' +
            Math.round(roomGiven) + 'pt)', used >= roomGiven * 0.8);
  const availW = 595 - 36 * 2;
  checkTrue('…and no wider than the page allows',
            printed.drawn.every(d => d.w <= availW + 1));
  // Centred, so a row narrower than the page reads as laid out rather than
  // as pushed into the left margin.
  const row0 = printed.drawn.filter(d => Math.abs(d.y - printed.drawn[0].y) < 1);
  const rowW = row0.reduce((t, d) => t + d.w, 0) + 10 * (row0.length - 1);
  check('the row is centred', Math.round(row0[0].x),
        Math.round(36 + Math.max(0, (availW - rowW) / 2)));
  /* A sheet short of a picture with nothing saying so reads as a count
     nobody photographed. */
  checkTrue('the one that would not load is SAID, not silently dropped',
            has(/1 damaged seed photo\(s\) could not be loaded/));

  /* A HEADING WITH NOTHING UNDER IT reads as a section somebody forgot to
     fill in — which on this sheet is the wrong thing to suggest. The break
     was measured for the words and then again for the pictures, so a page
     with room for one and not the other split them. */
  const headPage = (printed.lines.find(l => /DAMAGED SEED PHOTOS/.test(l.t)) || {}).page;
  check('the heading is on the same page as its first picture',
        headPage, printed.drawn[0].page);
  check('…and both pictures are on that page', printed.drawn[1].page, headPage);

  /* AND THE PANEL GOES WITH THEM. The office asked for it in one line —
     "这个移动去第三页 永远和照片在一起". 3.11% on one sheet and the trays it
     was counted off on the next is the reader doing the joining up, over a
     figure that exists to be checked against those very trays. */
  const dmgPage = (printed.lines.find(l => /^DAMAGE CONTROL$/.test(l.t)) || {}).page;
  check('the DAMAGE CONTROL panel is on that page too', dmgPage, headPage);

  const onScreen = await page.evaluate(() => ({
    rate: (document.getElementById('t2-dmg-pct').textContent || '').trim(),
    used: (document.getElementById('t2-dmg-used-pct').textContent || '').trim(),
    damaged: (document.getElementById('t2-damage-actual-text').textContent || '').trim()
  }));
  check('THE SHEET AGREES WITH TAB 2 — rate', onScreen.rate, '3.11%');
  check('…used', onScreen.used, '65.40% of FOC limit');
  check('…damaged', onScreen.damaged, '327');

  console.log('\nThe footer numbers every page it made');
  checkTrue('page numbering is there', has(/^Page \d+ of \d+$/));
  const feet = printed.text.filter(t => /^Page \d+ of \d+$/.test(t));
  check('one foot per page', feet.length, printed.pages);
  check('…and it does not claim 1 of 1 over two pages',
        feet.every(f => f.endsWith('of ' + printed.pages)), true);

  console.log('\nDownload draws the SAME document');
  /* Two builders drift. Comparing what each drew is the only thing that
     says they have not. */
  await page.evaluate(() => { window.__PDFS = []; return window.downloadSeedAuditPdf(); });
  const saved = await page.evaluate(() => {
    const d = window.__PDFS[0];
    return d && { saved: d.saved, printed: d.printed, text: d.lines.map(l => l.t),
                  head: d.head, body: d.body, drawn: d.drawn };
  });
  checkTrue('it saved a file', saved && /^Seed_Audit_278_/.test(saved.saved));
  check('…and did NOT send it to the printer', saved.printed, false);
  check('every line on the printed sheet is on the downloaded one', saved.text, printed.text);
  check('…the same table', [saved.head, saved.body], [printed.head, printed.body]);
  check('…and the same pictures, in the same places', saved.drawn, printed.drawn);

  console.log('\nExcess damage says so');
  await page.evaluate(() => {
    const el = document.getElementById('t2-damaged');
    el.value = '800';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    window.calcPlanting();
    window.__PDFS = [];
    return window.downloadSeedAuditPdf();
  });
  const over = await page.evaluate(() => window.__PDFS[0].lines.map(l => l.t));
  checkTrue('800 against a 500 allowance is named as excess',
            over.some(t => /EXCESS: 300 seed\(s\) over the allowance/.test(t)));

  /* ── A DELIVERY OF MANY BAGS, WHICH IS WHERE THE SHEET BROKE.

        The office printed one and said the 24 on page one had been eaten.
        It is always the 24th, because everything above the table is a fixed
        height: the table started at 190, the rows are 23.5 each, and
        autoTable — given a left and a right margin and nothing else — fell
        back to its own default of 40 for the bottom. So it filled page one
        to y=802, which is the exact line the footer draws its rule on, and
        the 24th row sat at 765.5–789 inside the band the footer owns and
        the printer trims.

        The blocks after the table were worse off, having no floor at all.
        At 53 bags the totals box was drawn at 771 — straight over the
        footer — and the analysis under it at 835, off the foot of the page
        entirely: the one figure on the sheet claiming to be the delivery,
        and the percentages beside it, both gone with nothing saying so.

        53 bags is the count that shows all three at once: a 24th row in the
        band on page one, and a second page whose rows end at 757 so the
        totals box and the analysis fall into it behind them.             */
  console.log('\nA sheet of 53 bags keeps every row and every figure off the footer');
  const MANY = 53;
  await page.evaluate((n) => {
    document.querySelectorAll('.t8-bag-row').forEach(r => r.remove());
    for (let i = 1; i <= n; i++) window.addSeedAuditRow('MJ' + (100 + i), 250, 250, 250);
    window.__PDFS = [];
    return window.downloadSeedAuditPdf();
  }, MANY);
  const big = await page.evaluate(() => {
    const d = window.__PDFS[0];
    return { pages: d.pages, rows: d.tableRows, boxes: d.boxes, drawn: d.drawn,
             lines: d.lines.map(l => ({ t: l.t, y: l.y, page: l.page })) };
  });

  /* THE FLOOR, NOT THE RULE. The footer draws its rule at 802 and its type
     at 812, so the band it owns opens at 842 − FOOT. Measuring against the
     rule is what makes this fault look fine: the 24th row ended at 789,
     which is above the rule and still inside the band — printed on paper
     where the tray trims, and with no air between it and the footer. */
  const FLOOR = 842 - 60;
  check('the table ran onto more than one page', big.rows.length, MANY);
  const numbers = big.rows.map(r => r.n);
  check('…and not one bag was lost on the way',
        numbers.join(','), Array.from({ length: MANY }, (_, i) => i + 1).join(','));

  const inBand = big.rows.filter(r => r.bottom > FLOOR);
  check('NO BAG ROW IS DRAWN INTO THE FOOTER BAND',
        inBand.map(r => 'p' + r.page + ' #' + r.n + ' ends ' + Math.round(r.bottom)), []);
  const p1 = big.rows.filter(r => r.page === 1);
  checkTrue('…so page one stops short of it (' +
            Math.round(p1[p1.length - 1].bottom) + ' of ' + FLOOR + ')',
            p1[p1.length - 1].bottom <= FLOOR);

  /* Nothing else may be down there either. The footer's own two lines are
     the only things entitled to the band. */
  const below = big.lines.filter(l => l.y > FLOOR
                                 && !/^Page \d+ of \d+$/.test(l.t)
                                 && !/MEGA JUTAMAS SDN BHD/.test(l.t));
  check('nothing but the footer is printed in the footer band',
        below.map(l => l.t + ' @ ' + Math.round(l.y)), []);
  const boxesBelow = big.boxes.filter(b => b.y + b.h > FLOOR);
  check('…and no box reaches into it either',
        boxesBelow.map(b => Math.round(b.y) + '+' + Math.round(b.h)), []);

  /* The blocks that had no floor at all, each named so a failure says which.
     At 53 bags the totals box was drawn at 771 over the footer and the
     analysis at 835 off the page. */
  const at = re => (big.lines.find(l => re.test(l.t)) || {});
  checkTrue('the TOTAL AUDITED QTY heading is above the floor',
            at(/^TOTAL AUDITED QTY$/).y > 0 && at(/^TOTAL AUDITED QTY$/).y < FLOOR);
  checkTrue('the analysis heading too', at(/AUDIT ANALYSIS/).y < FLOOR);
  checkTrue('and DAMAGE CONTROL', at(/^DAMAGE CONTROL$/).y < FLOOR);
  /* AND THE PAIR STAYS A PAIR ON A LONG SHEET TOO. This is the one that
     put it on the office's desk: with the bag table running over, the panel
     fitted where the first picture did not, so DAMAGE CONTROL printed alone
     at the foot of page two and the trays followed on page three. */
  const bigDmgPage = (big.lines.find(l => /^DAMAGE CONTROL$/.test(l.t)) || {}).page;
  check('the damage panel and its first picture are on ONE page',
        bigDmgPage, big.drawn[0] && big.drawn[0].page);
  check('…and the heading between them is on it as well',
        (big.lines.find(l => /DAMAGED SEED PHOTOS/.test(l.t)) || {}).page, bigDmgPage);

  const feetBig = big.lines.filter(l => /^Page \d+ of \d+$/.test(l.t));
  check('every page of the long sheet is numbered', feetBig.length, big.pages);

  /* ── AND AT 40 BAGS THE PANEL USED TO BE LEFT BEHIND.

        This is the shape the office printed: the bag table runs over, the
        damage panel still fits at the foot of page two, and the pictures do
        not — so DAMAGE CONTROL printed alone on one sheet and the trays it
        was counted off on the next. Their words were "这个移动去第三页 永远
        和照片在一起".

        40 is not arbitrary: on the previous code the pair splits at 38 to
        43 bags and nowhere else — few enough that the panel still fits at
        the foot of page two, many enough that a picture does not. A count
        outside that window passes whatever the code does, which is how the
        first version of this check came back green on the broken page. */
  console.log('\nThe damage panel never leaves its pictures');
  await page.evaluate(() => {
    document.querySelectorAll('.t8-bag-row').forEach(r => r.remove());
    for (let i = 1; i <= 40; i++) window.addSeedAuditRow('MJ' + (100 + i), 250, 250, 250);
    window.__PDFS = [];
    return window.downloadSeedAuditPdf();
  });
  const pair = await page.evaluate(() => {
    const d = window.__PDFS[0];
    return { pages: d.pages, drawn: d.drawn,
             lines: d.lines.map(l => ({ t: l.t, page: l.page })) };
  });
  const pg = re => (pair.lines.find(l => re.test(l.t)) || {}).page;
  checkTrue('the sheet ran to three pages', pair.pages >= 3);
  check('DAMAGE CONTROL is on the page its first picture is on',
        pg(/^DAMAGE CONTROL$/), pair.drawn[0] && pair.drawn[0].page);
  check('…and the heading between them with it',
        pg(/DAMAGED SEED PHOTOS/), pg(/^DAMAGE CONTROL$/));
  check('…and both pictures, not just the first',
        pair.drawn.map(d => d.page), pair.drawn.map(() => pg(/^DAMAGE CONTROL$/)));

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
