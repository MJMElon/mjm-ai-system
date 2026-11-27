/* THE RECORDS LIST IS THREE PARTS: PENDING, APPROVED, REJECTED

   The office, over the two tabs that were there: *"我要把这一部分 分成3个
   部分，rejected保留，approved 分成 pending & approved, tick了的schedule
   全部会在这里出现+worker做了的工 但是还没被approved也会在这里出现,
   approved的就是FC approved了的"*.

   Two of the three sentences were a filter the page already had as a COUNT
   (`done` / `pend` in the strip) and nowhere else. The third was not:
   `loadFieldRecords` is `_verifiedOnly`, so work a worker recorded and
   nobody has approved reached no row, no cell and no list — on this page it
   was indistinguishable from work nobody had done.

   This drives the REAL page with a month in all four states: approved,
   ticked and untouched, ticked with a submission waiting, and a submission
   that matches no scheduled round at all.

   Run with a static server on 8777 serving the repository root.
   SHOT=/dir draws all three tabs.                                      */
const { chromium } = require('playwright');
const SHOT = process.env.SHOT || '';

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: +(process.env.VW || 1600), height: 1100 } });
  const asked = [];
  page.on('dialog', (d) => { asked.push(d.message()); d.accept().catch(() => {}); });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript(() => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.removeItem('mjm_maint_month'); } catch (_) {}
    /* A saved blob, so the page's own demo seed is replaced. One row, on a
       plot no nursery claims, so it is never drawn and never in the way. */
    window.__DB = { nops_maint_records: [{ id: 1, records: [
      { id: 1, tarikh: '-', jenis: 'Merumput', racun: 'offstage', plot: 'ZZ',
        batch: '', qty: null, carlos: 0, gaia: 0, remark: '' }
    ] }] };
    window.__WRITES = [];
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select', row: null };
      const base = () => (window.__DB[table] || (window.__DB[table] = []));
      const rows = () => {
        let out = base().slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return out;
      };
      const run = () => {
        if (st.op === 'upsert' || st.op === 'insert') {
          window.__WRITES.push({ table, row: JSON.parse(JSON.stringify(st.row)) });
          const b = base();
          const i = b.findIndex((r) => String(r.id) === String(st.row.id)
            || (r.nursery === st.row.nursery && r.month === st.row.month));
          if (i >= 0) b[i] = st.row; else b.push(st.row);
          return { data: null, error: null };
        }
        const out = rows();
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'upsert' || p === 'insert') return (r) => { st.op = p; st.row = r; return q; };
        if (p === 'update' || p === 'delete') return () => q;
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
  });

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
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, body: '[]' }));

  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html',
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.autoSyncRecords === 'function'
                                && typeof window._scheduleTicksFor === 'function',
                             { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForSelector('#recview-list', { state: 'visible', timeout: 10000 });
  return { page, asked };
}



(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page } = await boot(browser);
  const dead = (msg) => new Proxy({}, { get: (_, k) => (k === 'toJSON' ? () => msg
    : k === 'map' || k === 'every' ? () => msg
    : k === Symbol.iterator ? undefined : dead(msg)) });
  const ev = (fn, arg) => page.evaluate(fn, arg).catch((e) => dead('ERR: ' + String(e.message).split('\n')[0]));

  /* ── The office's month ────────────────────────────────────────────────
     B1 round 1 is APPROVED (a linked field record). B1 round 2 is ticked
     and untouched. B2 weeding is ticked and a worker HAS done it, waiting
     for the conductor. And a submission on B5, which the office scheduled
     nothing for this month — the replant case, and what _fieldUnpaired has
     been counting in silence. */
  /* A FUNCTION, because section 9 empties it to reach the two empty states
     and the SHOT block below has to draw a list with something in it — a
     picture of the screen taken after the last check is a picture of the
     last check, not of the screen. */
  const seed = () => ev(() => {
    const m = getMonth();
    const row = (o) => Object.assign({
      tarikh: '-', jenis: 'Penyemburan racun kulat dan serangga',
      racun: 'Round 1: Antracol 50gm + Bond 15mL', batch: '', qty: null,
      carlos: 0, gaia: 0, remark: '', _month: m }, o);
    records = [
      row({ id: 601, plot: 'B1', tarikh: '04-11-2026', qty: 2341, _fieldIds: [9001] }),
      row({ id: 602, plot: 'B1', racun: 'Round 2: Antracol 50gm + Bond 15mL' }),
      row({ id: 603, plot: 'B2', jenis: 'Merumput', racun: 'Round 1: Manual' }),
      /* THE OFFICE'S OWN N20-R, which is the one shape that makes the two
         dates a QUESTION: a row carrying a day of its OWN, with a
         submission underneath it claiming another. They read
         `10 Nov 2026` over `21 Nov 2...` and asked what it meant. */
      row({ id: 604, plot: 'B4', jenis: 'Merumput', tarikh: '10-11-2026',
            racun: 'Round 3: Manual' }),
    ];
    pendingFieldRecords = [
      { id: 9101, plot_name: 'B2', work_type: 'weeding', jenis: 'Merumput',
        chemical: 'Manual', qty: 900, work_date: '2026-11-12', week_no: 2,
        schedule_month: m, worked_by: 'Siti', reported_by: 'Siti',
        verified_at: null, rejected_at: null },
      /* A SECOND WORKER ON THE SAME ROUND, and it is the office's own U12:
         two people recorded that morning, so the chip stood for both and
         said so as `+1`, which they read and asked what it meant. One
         waiting record per row cannot test a count at all. */
      { id: 9105, plot_name: 'B2', work_type: 'weeding', jenis: 'Merumput',
        chemical: 'Manual', qty: 400, work_date: '2026-11-13', week_no: 2,
        schedule_month: m, worked_by: 'Lina', reported_by: 'Lina',
        verified_at: null, rejected_at: null },
      { id: 9102, plot_name: 'B5', work_type: 'weeding', jenis: 'Merumput',
        chemical: 'Manual', qty: 300, work_date: '2026-11-15', week_no: 3,
        schedule_month: m, worked_by: 'Rahim', reported_by: 'Rahim',
        verified_at: null, rejected_at: null },
      /* THE OFFICE'S OWN CASE, which B5 cannot test: a submission that
         matches no round on a plot the schedule DOES carry rows for.
         *"放下去楼下 就是U7 interrow 14.11就放去U7那边"* — B1 has two P & D
         rounds and no weeding round, so this one has nowhere to pair and
         has to come to rest inside B1's own group. A fixture whose every
         loose record is on a plot with nothing else on it passes just as
         green on a page that draws them in a block of their own. */
      { id: 9103, plot_name: 'B1', work_type: 'weeding', jenis: 'Merumput',
        chemical: 'Manual', qty: 120, work_date: '2026-11-14', week_no: 2,
        schedule_month: m, worked_by: 'Hadi', reported_by: 'Hadi',
        verified_at: null, rejected_at: null },
      /* PAIRS WITH 601, WHICH IS APPROVED. The office has since taken the
         orange off that tab altogether, so this record is what makes the
         ABSENCE worth asserting: without it the fixture has no approved row
         that could carry a chip, and "no chip on Approved" passes just as
         green on a page that draws one. */
      { id: 9106, plot_name: 'B1', work_type: 'pd',
        jenis: 'Penyemburan racun kulat dan serangga',
        chemical: 'Antracol 50gm + Bond 15mL', qty: 700,
        work_date: '2026-11-05', week_no: 1,
        schedule_month: m, worked_by: 'Jaya', reported_by: 'Jaya',
        verified_at: null, rejected_at: null },
      /* Pairs with 604 (B4 weeding round 3), so it lands as a chip on a
         row that already shows a date of its own. */
      { id: 9104, plot_name: 'B4', work_type: 'weeding', jenis: 'Merumput',
        chemical: 'Manual', qty: 450, work_date: '2026-11-21', week_no: 3,
        schedule_month: m, worked_by: 'Anton', reported_by: 'Anton',
        verified_at: null, rejected_at: null },
    ];
    rejectedFieldRecords = [];
    renderRecords();
  });
  await seed();
  await page.waitForTimeout(250);

  const tabs = () => ev(() => [...document.querySelectorAll('.rec-tabs .subtab-btn')]
    .map((b) => ({ id: b.id, on: b.classList.contains('active'),
                   text: b.textContent.replace(/\s+/g, ' ').trim() })));
  const rows = () => ev(() => [...document.querySelectorAll('#rec-body tr')].map((tr) => ({
    group: tr.classList.contains('plot-group-row'),
    loose: tr.classList.contains('rec-row-loose'),
    cells: [...tr.children].map((td) => td.textContent.replace(/\s+/g, ' ').trim()),
  })));
  const open = async (which) => {
    await ev((w) => { const b = document.getElementById('recsec-btn-' + w); if (b) b.click(); }, which);
    await page.waitForTimeout(150);
  };

  try {
  console.log('\n1. Three tabs, in the office own order');
  const tb = await tabs();
  check('there are three', Array.isArray(tb) ? tb.map((x) => x.id) : String(tb),
        ['recsec-btn-pending', 'recsec-btn-approved', 'recsec-btn-rejected']);
  check('and the page opens on Pending', (tb[0] || {}).on, true);
  /* Guarded: on the previous page there IS no third tab, and a section
     that dies here leaves the twenty under it unasked. */
  check('Rejected kept its own tab and its own badge',
        /^Rejected/.test(((tb[2] || {}).text) || ''), true);
  } catch (e) { fail++; console.log('  FAIL 1. three tabs -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n2. Pending: every ticked row nobody has approved');
  await open('pending');
  const r = await rows();
  const plots = (r.filter ? r : []).filter((x) => !x.group && !x.loose).map((x) => x.cells[3]);
  check('the unapproved rows are here', plots.sort(), ['B1', 'B2', 'B4']);
  check('and the approved one is NOT', plots.indexOf('B1') >= 0 && plots.length === 3, true);
  } catch (e) { fail++; console.log('  FAIL 2. pending -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n3. …and the work a worker did that is waiting for the FC');
  const waiting = await ev(() => [...document.querySelectorAll('#rec-body tr')]
    .filter((tr) => tr.querySelector('.rec-waiting') && !tr.classList.contains('rec-row-loose'))
    .map((tr) => ({ plot: tr.children[3].textContent.trim(),
                    chip: tr.querySelector('.rec-waiting').textContent.replace(/\s+/g, ' ').trim() })));
  check('the B2 row says somebody is waiting on it', (waiting[0] || {}).plot, 'B2');
  check('and the day they say they did it', /12 Nov/.test((waiting[0] || {}).chip || ''), true);
  /* B2 (no date of its own) and B4 (one of its own) — the two shapes. */
  check('two rows carry one', waiting.length, 2);
  /* THE WHOLE SENTENCE IS IN THE TOOLTIP, and the chip is the day alone.
     `.rec-table` is table-layout:fixed, so the date column is 103px
     whatever goes in it: written out in full the chip is 260px and runs
     clear of its own cell, over the Work Type column of the row BENEATH,
     which makes two rows unreadable rather than one. So the sentence is
     asked of the title and the CELL is measured. Both halves, because a
     chip that fits by having lost the information is not a fix. */
  /* THE PLOT ROW'S CHIP, never simply the first `.rec-waiting` in the body.
     The unclaimed-submissions block was moved ABOVE the plots, and its own
     rows carry the whole sentence as text with only the explanation in the
     title — so a bare querySelector started measuring that one instead and
     reported a working chip as having lost its name. */
  const fit = await ev(() => {
    const row = [...document.querySelectorAll('#rec-body tr')]
      .find((tr) => tr.querySelector('.rec-waiting') && !tr.classList.contains('rec-row-loose'));
    const el = row && row.querySelector('.rec-waiting');
    if (!el) return 'no chip';
    const td = el.closest('td');
    return { tip: el.getAttribute('title') || '',
             inside: Math.round(el.getBoundingClientRect().right)
                  <= Math.round(td.getBoundingClientRect().right) };
  });
  check('the tooltip names who did it', /Siti/.test((fit || {}).tip || ''), true);
  check('…and says it is waiting for approval', /waiting/i.test((fit || {}).tip || ''), true);
  check('the chip stays INSIDE its own cell', (fit || {}).inside, true);
  /* AND IT IS NOT CUT OFF, which the check above cannot see and which is
     the whole of what the office reported: *"直接放日期啊 干嘛这样"* over a
     chip reading `21 Nov 2...`. A pill with `text-overflow:ellipsis`
     always FITS its cell — it fits by throwing the date away, which is
     the one thing the cell is there to say. So the rendered width is
     asked against the SCROLL width, and the day is asked for in full. */
  const whole = await ev(() => {
    const row = [...document.querySelectorAll('#rec-body tr')]
      .find((tr) => tr.querySelector('.rec-waiting') && !tr.classList.contains('rec-row-loose'));
    const el = row && row.querySelector('.rec-waiting');
    if (!el) return 'no chip';
    return { clipped: el.scrollWidth > el.clientWidth + 1,
             text: el.textContent.replace(/\s+/g, ' ').trim() };
  });
  check('nothing of it is clipped', (whole || {}).clipped, false);
  check('…so the whole day is readable', /12 Nov 2026/.test((whole || {}).text || ''), true);
  /* AND THE COUNT IS IN WORDS. It read `+1`, which is the office's own
     U12 screenshot and the half of *"我不知道这是什么意思"* that no
     tooltip was ever going to answer, there being no tooltip on a phone. */
  check('…and the second worker is counted in words',
        /2 records/i.test((whole || {}).text || ''), true);
  check('no bare +n is left', /\+\s*\d/.test((whole || {}).text || ''), false);
  /* THE DAY IS NEVER BROKEN IN HALF, which is the whole reason the date
     column was given a width of its own. The SENTENCE may wrap and reads
     fine over two lines; `21 Nov` over `2026` does not, and a date in
     two pieces is most of the way back to `21 Nov 2...`. Measured,
     because a width in the stylesheet proves nothing about the font that
     renders it. */
  const lines = await ev(() => {
    /* B2's chip: the day and the count, which is what has to stay on one
       line each. It is found by its PLOT and never by "the first chip with
       a label", because on Pending the chip with a label is B4's — the one
       row that has a date of its own — and that one carries no count, so
       the count check would silently read a row it is not about. */
    const row = [...document.querySelectorAll('#rec-body tr')]
      .find((tr) => tr.children[3] && tr.children[3].textContent.trim() === 'B2'
                 && tr.querySelector('.rec-waiting'));
    const el = row && row.querySelector('.rec-waiting');
    if (!el) return 'no chip';
    const one = (s) => {
      const n = el.querySelector(s);
      if (!n) return 0;
      return Math.round(n.getBoundingClientRect().height
                        / parseFloat(getComputedStyle(n).lineHeight));
    };
    const lab = el.querySelector('.rw-lab');
    return { day: one('.rw-day'), n: one('.rw-n'),
             lab: lab ? lab.textContent.replace(/\s+/g, ' ').trim() : null };
  });
  check('the day is on ONE line', (lines || {}).day, 1);
  check('…and so is the count', (lines || {}).n, 1);
  /* AND THE SENTENCE IS NOT REPEATED ON THE TAB THAT SAYS IT — *"waiting
     for approval 也拿掉 因为它已经under pending了"*. B2 is a Pending row
     whose own date is a dash, so the chip is the day and the count and
     nothing else. The two rows below are where it survives. */
  check('on Pending, a chip with no other date says only the day',
        (lines || {}).lab, null);
  /* THE OFFICE'S OWN N20-R: a row with a day of its own and a claim under
     it. *"这什么意思"* — two dates one above the other with nothing
     between them is a question, so the claim wears a mark the row's own
     date does not. Asked of the CELL, because what they were reading is
     the two lines together. */
  const both = await ev(() => {
    const row = [...document.querySelectorAll('#rec-body tr')]
      .find((tr) => tr.children[3] && tr.children[3].textContent.trim() === 'B4'
                 && tr.querySelector('.rec-waiting'));
    if (!row) return 'no B4 row';
    const td = row.children[0], el = row.querySelector('.rec-waiting');
    return { cell: td.textContent.replace(/\s+/g, ' ').trim(),
             claim: el.textContent.replace(/\s+/g, ' ').trim(),
             own: td.firstChild ? String(td.firstChild.textContent || '').trim() : '',
             clipped: el.scrollWidth > el.clientWidth + 1 };
  });
  /* THE DASH GOES WHERE THE CHIP SPEAKS — *"符号 - 就不用了"*. It means the
     office keyed no date, which the chip under it already says; over a day
     it reads as a contradiction. Asked in BOTH directions, because "no dash
     anywhere" would pass just as green on a page that stopped drawing it at
     all, and an empty date cell reads as a column that failed to draw. */
  const dash = await ev(() => {
    const cellOf = (plot) => {
      const row = [...document.querySelectorAll('#rec-body tr')]
        .find((tr) => tr.children[3] && tr.children[3].textContent.trim() === plot
                   && !tr.classList.contains('rec-row-loose'));
      return row ? row.children[0].textContent.replace(/\s+/g, ' ').trim() : 'no ' + plot;
    };
    /* B2 is waiting and the office keyed nothing; B1 round 2 is keyed
       nothing and has no chip, which is the control. */
    return { waiting: cellOf('B2'), plain: cellOf('B1') };
  });
  check('a cell with a chip under it carries no dash',
        /^-/.test((dash || {}).waiting || '') , false);
  check('…and a cell with no date and no chip still does',
        (dash || {}).plain, '-');
  check('the row keeps its own day', (both || {}).own, '10 Nov 2026');
  check('…and the claim is the other day, in full',
        /21 Nov 2026/.test((both || {}).claim || ''), true);
  check('…not cut off either', (both || {}).clipped, false);
  /* IT SAYS IT IN WORDS, and a glyph is what it had to replace. The chip
     carried `⏳ 25 Nov 2026 +1` and the office asked *"我不知道这是什么意
     思"* — a hourglass means nothing to somebody who has not been told,
     and `+1` means nothing to anybody.

     THIS IS THE ROW THE SENTENCE SURVIVES ON, even on Pending where the
     office took it off everywhere else: two dates one above the other with
     nothing between them is a question whatever tab they are on, and the
     sentence is the one thing that answers it. */
  check('…and SAYS it is waiting, in words',
        /waiting for approval/i.test((both || {}).claim || ''), true);
  check('no glyph is left standing in for the sentence',
        /⏳/.test((both || {}).cell || ''), false);
  check('the row own date carries no such words',
        /waiting/i.test((both || {}).own || ''), false);
  /* AMBER, NEVER GREEN. Green here is the Checked badge two cells along,
     which means the opposite — settled. */
  const amber = await ev(() => {
    const row = [...document.querySelectorAll('#rec-body tr')]
      .find((tr) => tr.querySelector('.rec-waiting') && !tr.classList.contains('rec-row-loose'));
    const el = row && row.querySelector('.rec-waiting');
    return el ? getComputedStyle(el).color : 'no chip';
  });
  check('the chip is amber and not the settled green', amber, 'rgb(146, 64, 14)');
  } catch (e) { fail++; console.log('  FAIL 3. waiting -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n4. A submission no scheduled round claims sits under ITS OWN PLOT');
  const r = await rows();
  const loose = (r.filter ? r : []).filter((x) => x.loose);
  check('both are drawn', (loose.map ? loose : []).map((x) => x.cells[3]).sort(), ['B1', 'B5']);
  check('with the worker on it',
        loose.length ? /Rahim|Hadi/.test(loose[0].cells[7]) : 'no row', true);
  /* THE OFFICE'S OWN SENTENCE, and the one check that cannot pass on the
     previous page: the B1 submission is inside B1's group, under B1's own
     heading, not in a block above the plots. Read as the group the row
     falls under rather than as a position, because what the office asked
     for is where it is FILED. */
  const under = await ev(() => {
    const out = [];
    let plot = null;
    [...document.querySelectorAll('#rec-body tr')].forEach((tr) => {
      if (tr.classList.contains('plot-group-row')) {
        const p = tr.querySelector('.rec-group-plot');
        plot = p ? p.textContent.replace(/\s+/g, ' ').trim() : '';
        return;
      }
      if (tr.classList.contains('rec-row-loose')) {
        out.push({ plot: tr.children[3].textContent.trim(), group: plot });
      }
    });
    return out;
  });
  check('the B1 submission is filed under Plot B1',
        ((under.filter ? under : []).find((x) => x.plot === 'B1') || {}).group, 'Plot B1');
  check('…and B5 under Plot B5',
        ((under.filter ? under : []).find((x) => x.plot === 'B5') || {}).group, 'Plot B5');
  /* NO BLOCK ABOVE THE PLOTS ANY MORE. The heading it used to carry is
     gone with it, so a half-removal that leaves the block drawn and the
     rows folded in as well — the same morning twice — fails here. */
  const heads = await ev(() => [...document.querySelectorAll('#rec-body tr.plot-group-row')]
    .map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()));
  check('no "on no scheduled row" block is drawn',
        (heads.some ? heads : []).some((h) => /on no scheduled row/i.test(h)), false);
  /* WHAT THE BLOCK WAS FOR IS STILL SAID, on the row: a record that
     reached the office and attached to nothing is the one thing this list
     must not swallow, so the tag says so and its hover carries the
     sentence that used to be the block's subtitle. */
  const tag = await ev(() => {
    const el = document.querySelector('#rec-body tr.rec-row-loose .rec-loose-tag');
    return el ? { text: el.textContent.replace(/\s+/g, ' ').trim(),
                  tip: el.getAttribute('title') || '' } : 'no tag';
  });
  /* THE OFFICE'S OWN WORDS, asked for as written: *"后面小remark not on
     schedule"*. */
  check('the row says it is not on the schedule',
        /not on schedule/i.test((tag || {}).text || ''), true);
  check('…and the hover says what to do about it',
        /schedule/i.test((tag || {}).tip || ''), true);
  /* B5 IS ON THE SCHEDULE FOR NOTHING THIS MONTH, so its group line cannot
     read "Task : 0/0" — a count of nothing dressed as progress, on the one
     plot that is here only because a worker recorded something. */
  const b5line = await ev(() => {
    const tr = [...document.querySelectorAll('#rec-body tr.plot-group-row')]
      .find((x) => /Plot B5$/.test(((x.querySelector('.rec-group-plot') || {}).textContent || '').trim()));
    const s = tr && tr.querySelector('.rec-group-sub');
    return s ? s.textContent.replace(/\s+/g, ' ').trim() : 'no line';
  });
  check('a plot with nothing scheduled says so instead of 0/0',
        b5line, 'Nothing on the schedule this month');
  /* AND A PLOT THAT HAS BOTH still counts its scheduled rows. B1 carries
     two rounds and one loose record; its line is about the rounds. */
  const b1line = await ev(() => {
    const tr = [...document.querySelectorAll('#rec-body tr.plot-group-row')]
      .find((x) => /Plot B1$/.test(((x.querySelector('.rec-group-plot') || {}).textContent || '').trim()));
    const s = tr && tr.querySelector('.rec-group-sub');
    return s ? s.textContent.replace(/\s+/g, ' ').trim() : 'no line';
  });
  check('…and a plot that has both still counts its rounds', b1line, 'Task : 1/2');
  } catch (e) { fail++; console.log('  FAIL 4. loose -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n5. Approved is what the FC approved, and nothing else');
  await open('approved');
  const r = await rows();
  const plots = (r.filter ? r : []).filter((x) => !x.group && !x.loose).map((x) => x.cells[3]);
  check('only the linked row', plots, ['B1']);
  /* NO CHIP HERE AT ALL — *"Approved tab 的橙色 完全不需要这个功能"*. 9106
     is a second submission waiting on the approved B1 row, so the fixture
     has one to draw and this is an ABSENCE rather than a check that passes
     over nothing. What the orange was for — a warning before pressing Check
     — went when the fault went: a record verified after the row is checked
     is let in now, rather than reaching nothing. */
  const appr = await ev(() => {
    const el = document.querySelector('#rec-body .rec-waiting');
    if (!el) return null;
    return el.textContent.replace(/\s+/g, ' ').trim();
  });
  check('no waiting chip is drawn on the Approved tab', appr, null);
  check('…and not the sentence either, anywhere on it',
        await ev(() => /Waiting for approval/i.test(
          (document.getElementById('rec-body') || {}).textContent || '')), false);
  check('and no unscheduled submission either',
        await ev(() => document.querySelectorAll('#rec-body .rec-row-loose').length), 0);
  } catch (e) { fail++; console.log('  FAIL 5. approved -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n6. The counts on the tabs are the rows under them');
  const n = await ev(() => ({
    pending: (document.getElementById('rec-count-pending') || {}).textContent,
    approved: (document.getElementById('rec-count-approved') || {}).textContent,
  }));
  /* Two unapproved rows plus the two submissions nothing claims. A count
     that disagrees with its own list is the whole risk in splitting a tab. */
  check('Pending counts 5', n.pending, '5');
  check('Approved counts 1', n.approved, '1');
  } catch (e) { fail++; console.log('  FAIL 6. counts -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n7. One table, one body — never a second copy');
  check('there is exactly one rec-body',
        await ev(() => document.querySelectorAll('#rec-body').length), 1);
  check('and Pending and Approved share the pane',
        await ev(() => !document.getElementById('recsec-pending')), true);
  } catch (e) { fail++; console.log('  FAIL 7. one table -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n8. The plot line counts the MONTH, not the tab');
  /* B1 carries two rows — 601 approved, 602 not — so it is 1 of 2 done, and
     that is true of the plot whichever tab somebody is looking at. Counted
     off the tab own slice instead it would read 0/1 on Pending and 1/1 on
     Approved, which is a line that cannot say anything: every Pending group
     would be 0/N and every Approved one N/N, by construction. Asked of BOTH
     tabs, because one of them passes on the broken rule by luck. */
  const plotLine = async (w) => { await open(w);
    const rs = await rows();
    const g = rs.find((r) => r.group && /Plot B1/.test(r.cells[0]));
    return g ? g.cells[0].replace(/\s+/g, ' ').trim() : 'no B1 group drawn'; };
  check('Pending says B1 is 1 of 2 done', await plotLine('pending'), 'Plot B1 Task : 1/2');
  check('…and Approved says the same', await plotLine('approved'), 'Plot B1 Task : 1/2');
  } catch (e) { fail++; console.log('  FAIL 8. the plot line -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n9. A row the office keyed and CHECKED is approved');
  /* The office's own two rows: keyed by hand, so no field record and no
     Gaia tick, and then Checked. Theirs were U13 and this fixture is BNN,
     so they are keyed on B7 — the nursery filter runs BEFORE the tab split,
     so a UNN plot here draws on neither tab and both checks pass for the
     wrong reason, which is what the first run of this did. On `_fieldIds || gaia` alone they read as
     pending — and NOTHING anybody could do would ever move them off that
     tab, there being no submission to approve. Checked is a signature:
     only a deliberate press sets it, it freezes the figure, and it is what
     puts the row on the payroll claim.
     The UNCHECKED twin is the control, and it is what makes this a test of
     the rule rather than of the plot: without it, "the checked one is in
     Approved" passes just as well on a page that sent every hand-keyed row
     there, which is the office's own first sentence broken. */
  await ev(() => {
    const m = getMonth();
    const hand = (o) => Object.assign({
      tarikh: '07-11-2026', jenis: 'Penyemburan racun kulat dan serangga',
      racun: 'Round 1: Antracol 50gm + Bond 15mL', batch: '264, 262, 256',
      qty: 6309, carlos: 0, gaia: 0, remark: '', _month: m }, o);
    records.push(hand({ id: 701, plot: 'B7', checked: 1, qtyFrozen: 6309 }));
    records.push(hand({ id: 702, plot: 'B7', racun: 'Round 1: Cyper 60mL + Bond 15mL' }));
    renderRecords();
  });
  /* Read by the CHEMICAL, because the two rows are alike in every other
     cell — same plot, same day, same job, same batches, same figure, which
     is exactly the pair the office sent over. Keyed on plot and date the
     twin answers for the checked one and "not in Pending" passes for the
     wrong reason, which is what the second run of this did. */
  const chemOn = async (w) => { await open(w);
    const rs = await rows();
    return rs.filter((r) => !r.group && !r.loose && /^B7$/.test(r.cells[3]))
             .map((r) => r.cells[2]); };
  const appr = await chemOn('approved');
  const pend = await chemOn('pending');
  check('the CHECKED row is in Approved', (appr || []).some((s) => /Antracol/.test(s)), true);
  check('…and not in Pending', (pend || []).some((s) => /Antracol/.test(s)), false);
  check('the unchecked twin is still in Pending', (pend || []).filter((s) => /Cyper/.test(s)).length, 1);
  await ev(() => { records = records.filter((r) => r.id !== 701 && r.id !== 702); renderRecords(); });
  } catch (e) { fail++; console.log('  FAIL 9. checked is approved -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n10. An empty tab says WHICH tab is empty');
  await ev(() => { pendingFieldRecords = []; records = records.filter((r) => r.id === 601); renderRecords(); });
  await open('pending');
  const msg = await ev(() => (document.querySelector('#rec-body td') || {}).textContent || '');
  check('Pending empty reads as everything approved', /approved/i.test(msg), true);
  await open('approved');
  await ev(() => { records = records.map((r) => Object.assign({}, r, { _fieldIds: [], gaia: 0 })); renderRecords(); });
  const msg2 = await ev(() => (document.querySelector('#rec-body td') || {}).textContent || '');
  check('Approved empty reads as still in Pending', /pending/i.test(msg2), true);
  } catch (e) { fail++; console.log('  FAIL 10. empty -- ' + String(e.message).split('\n')[0]); }

  if (SHOT) {
    const fs = require('fs');
    try { fs.mkdirSync(SHOT, { recursive: true }); } catch (_) {}
    await seed();                       // section 9 emptied it
    /* The side nav is OPEN by default and lies OVER the first four columns,
       so a shot taken without collapsing it is a picture of the nav. */
    await ev(() => { try { toggleNav(); } catch (_) {} window.scrollTo(0, 0); });
    /* The frame's padding-left TRANSITIONS (.2s) when the nav folds, and a
       fullPage shot resizes the viewport under a position:fixed nav — both
       draw the content sliding under the rail, which is the picture and
       not the page. Waited out, and taken at the viewport. */
    await page.waitForTimeout(600);
    for (const w of ['pending', 'approved', 'rejected']) {
      await open(w);
      await page.screenshot({ path: SHOT + '/records-' + w + '.png', fullPage: false });
    }
    console.log('\n  drew ' + SHOT + '/records-{pending,approved,rejected}.png');
  }

  /* ── 9. WHICH COLUMNS EACH TAB DRAWS ─────────────────────────────────
     "pending部分 图二都不需要": Pending shows no Track Record, Remark, Audit
     or Nelos Case. "done repair in approved也是removed": Done Repair is on
     neither. And Track Record must hold its picture and distance in full. */
  const heads = () => page.evaluate(() => [...document.querySelectorAll('#recview-list .rec-table:not(.rej-table) thead th')]
    .filter((th) => th.offsetWidth > 0).map((th) => th.textContent.trim()));
  const overflow = () => page.evaluate(() => {
    const t = document.querySelector('#recview-list .rec-table:not(.rej-table)');
    const bad = [...t.querySelectorAll('tbody td')].filter((td) => td.offsetWidth > 0 && td.scrollWidth > td.clientWidth + 1)
      .map((td) => td.className + ':' + td.textContent.trim().slice(0, 20));
    const rows = [...t.querySelectorAll('tbody tr')].filter((tr) => tr.offsetWidth > 0)
      .map((tr) => [...tr.cells].filter((c) => c.offsetWidth > 0).reduce((n, c) => n + c.colSpan, 0));
    return { bad, spans: [...new Set(rows)] };
  });
  await open('pending');
  check('Pending draws seven columns, none of the five', (await heads()).length + ' ' + (await heads()).some((h) => /Track|Remark|Audit|Nelos|Repair/i.test(h)), '7 false');
  check('every Pending row spans exactly those seven', JSON.stringify((await overflow()).spans), '[7]');
  await open('approved');
  const ah = await heads();
  check('Approved draws eleven columns and no Done Repair', ah.length + ' ' + ah.some((h) => /Repair/i.test(h)), '11 false');
  check('every Approved row spans those eleven', JSON.stringify((await overflow()).spans), '[11]');
  await page.evaluate(() => {
    const td = document.querySelector('#recview-list .rec-table:not(.rej-table) tbody td.rc-track');
    if (td) td.innerHTML = '<button type="button" class="trk-btn"><svg class="trk-mini" viewBox="0 0 92 52"></svg><span class="trk-far">1.63 km</span></button>';
  });
  check('a Track Record of 1.63 km fits its cell', (await overflow()).bad.filter((b) => /rc-track/.test(b)).join(','), '');

  /* ── 10. THE ACTIONS HEADING FILTERS CHECKED / UNCHECKED ─────────── */
  const pick = async (v) => { await page.click('#rec-chk-btn');
    await page.click('#rec-chk-menu button[data-v="' + v + '"]'); await page.waitForTimeout(80); };
  const rowsNow = () => page.evaluate(() => [...document.querySelectorAll('#rec-body tr')]
    .filter((tr) => !tr.querySelector('.rec-group-cell') && tr.cells.length > 1)
    .map((tr) => !!tr.querySelector('.rec-checked-badge')));
  await open('approved');
  await page.evaluate(() => {
    /* One row of the month checked and one approved by Gaia and not checked,
       so both answers have something to show. */
    const mine = records.filter((x) => NURSERY_PLOTS[getNursery()].includes(x.plot) && _recInMonth(x, getMonth()));
    if (mine[0]) mine[0].checked = true;
    if (mine[0]) records.push(Object.assign({}, mine[0], { id: 990001, checked: false, gaia: 1 }));
    renderRecords(); });
  const allA = await rowsNow();
  await pick('checked');
  const chk = await rowsNow();
  await pick('unchecked');
  const unc = await rowsNow();
  check('the Actions heading carries a filter ICON, not a dropdown',
    await page.evaluate(() => !!document.querySelector('.rec-act-th #rec-chk-btn svg') && !document.querySelector('.rec-act-th select, .rec-act-th .cf-wrap')), true);
  check('the icon is filled while a filter is on', await page.evaluate(() => document.getElementById('rec-chk-btn').classList.contains('on')), true);
  check('Checked shows only checked rows', chk.length > 0 && chk.every(Boolean), true);
  check('Unchecked shows only unchecked rows', unc.length > 0 && unc.every((x) => !x), true);
  check('the two add up to All', chk.length + unc.length, allA.length);
  const counts = await page.evaluate(() => document.getElementById('rec-count-approved').textContent.trim());
  await pick('');
  check('the tab count does not move with the filter', await page.evaluate(() => document.getElementById('rec-count-approved').textContent.trim()), counts);
  await open('pending'); await pick('checked');
  check('Checked on Pending leaves no loose row', await page.evaluate(() => document.querySelectorAll('#rec-body .rec-row-loose').length), 0);
  await pick('');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
