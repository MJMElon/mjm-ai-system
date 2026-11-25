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
    ];
    pendingFieldRecords = [
      { id: 9101, plot_name: 'B2', work_type: 'weeding', jenis: 'Merumput',
        chemical: 'Manual', qty: 900, work_date: '2026-11-12', week_no: 2,
        schedule_month: m, worked_by: 'Siti', reported_by: 'Siti',
        verified_at: null, rejected_at: null },
      { id: 9102, plot_name: 'B5', work_type: 'weeding', jenis: 'Merumput',
        chemical: 'Manual', qty: 300, work_date: '2026-11-15', week_no: 3,
        schedule_month: m, worked_by: 'Rahim', reported_by: 'Rahim',
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
  check('the two unapproved rows are here', plots.sort(), ['B1', 'B2']);
  check('and the approved one is NOT', plots.indexOf('B1') >= 0 && plots.length === 2, true);
  } catch (e) { fail++; console.log('  FAIL 2. pending -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n3. …and the work a worker did that is waiting for the FC');
  const waiting = await ev(() => [...document.querySelectorAll('#rec-body tr')]
    .filter((tr) => tr.querySelector('.rec-waiting') && !tr.classList.contains('rec-row-loose'))
    .map((tr) => ({ plot: tr.children[3].textContent.trim(),
                    chip: tr.querySelector('.rec-waiting').textContent.replace(/\s+/g, ' ').trim() })));
  check('the B2 row says somebody is waiting on it', (waiting[0] || {}).plot, 'B2');
  check('and the day they say they did it', /12 Nov/.test((waiting[0] || {}).chip || ''), true);
  check('only that row carries one', waiting.length, 1);
  /* THE WHOLE SENTENCE IS IN THE TOOLTIP, and the chip is the day alone.
     `.rec-table` is table-layout:fixed, so the date column is 103px
     whatever goes in it: written out in full the chip is 260px and runs
     clear of its own cell, over the Work Type column of the row BENEATH,
     which makes two rows unreadable rather than one. So the sentence is
     asked of the title and the CELL is measured. Both halves, because a
     chip that fits by having lost the information is not a fix. */
  const fit = await ev(() => {
    const el = document.querySelector('#rec-body .rec-waiting');
    if (!el) return 'no chip';
    const td = el.closest('td');
    return { tip: el.getAttribute('title') || '',
             inside: Math.round(el.getBoundingClientRect().right)
                  <= Math.round(td.getBoundingClientRect().right) };
  });
  check('the tooltip names who did it', /Siti/.test((fit || {}).tip || ''), true);
  check('…and says it is waiting for approval', /waiting/i.test((fit || {}).tip || ''), true);
  check('the chip stays INSIDE its own cell', (fit || {}).inside, true);
  /* AMBER, NEVER GREEN. Green here is the Checked badge two cells along,
     which means the opposite — settled. */
  const amber = await ev(() => {
    const el = document.querySelector('#rec-body .rec-waiting');
    return el ? getComputedStyle(el).color : 'no chip';
  });
  check('the chip is amber and not the settled green', amber, 'rgb(146, 64, 14)');
  } catch (e) { fail++; console.log('  FAIL 3. waiting -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n4. A submission no scheduled round claims is at the foot, named');
  const r = await rows();
  const loose = (r.filter ? r : []).filter((x) => x.loose);
  check('B5 is drawn', loose.length && loose[0].cells[3], 'B5');
  check('with the worker on it', loose.length ? /Rahim/.test(loose[0].cells[7]) : 'no row', true);
  const head = await ev(() => {
    const tr = [...document.querySelectorAll('#rec-body tr.plot-group-row')].pop();
    return tr ? tr.textContent.replace(/\s+/g, ' ').trim() : 'no heading';
  });
  check('under a heading that says what it is',
        /on no scheduled row/i.test(head), true);
  /* It must NOT be folded in among the plots: these are not rows the office
     planned, and a list that mixed them would be the office reading work
     they never scheduled as a round they did. */
  const order = (r.filter ? r : []).map((x) => (x.loose ? 'L' : x.group ? 'G' : 'R')).join('');
  check('and never mixed in among the scheduled rows',
        /^[GR]+G L*$/.test(order.replace(/L/g, ' L').replace(/ +/, ' ')) || order.lastIndexOf('R') < order.indexOf('L'),
        true);
  } catch (e) { fail++; console.log('  FAIL 4. loose -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n5. Approved is what the FC approved, and nothing else');
  await open('approved');
  const r = await rows();
  const plots = (r.filter ? r : []).filter((x) => !x.group && !x.loose).map((x) => x.cells[3]);
  check('only the linked row', plots, ['B1']);
  check('no waiting chip can appear here',
        await ev(() => document.querySelectorAll('#rec-body .rec-waiting').length), 0);
  check('and no unscheduled submission either',
        await ev(() => document.querySelectorAll('#rec-body .rec-row-loose').length), 0);
  } catch (e) { fail++; console.log('  FAIL 5. approved -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n6. The counts on the tabs are the rows under them');
  const n = await ev(() => ({
    pending: (document.getElementById('rec-count-pending') || {}).textContent,
    approved: (document.getElementById('rec-count-approved') || {}).textContent,
  }));
  /* Two unapproved rows plus the one submission nothing claims. A count
     that disagrees with its own list is the whole risk in splitting a tab. */
  check('Pending counts 3', n.pending, '3');
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
  console.log('\n9. An empty tab says WHICH tab is empty');
  await ev(() => { pendingFieldRecords = []; records = records.filter((r) => r.id === 601); renderRecords(); });
  await open('pending');
  const msg = await ev(() => (document.querySelector('#rec-body td') || {}).textContent || '');
  check('Pending empty reads as everything approved', /approved/i.test(msg), true);
  await open('approved');
  await ev(() => { records = records.map((r) => Object.assign({}, r, { _fieldIds: [], gaia: 0 })); renderRecords(); });
  const msg2 = await ev(() => (document.querySelector('#rec-body td') || {}).textContent || '');
  check('Approved empty reads as still in Pending', /pending/i.test(msg2), true);
  } catch (e) { fail++; console.log('  FAIL 9. empty -- ' + String(e.message).split('\n')[0]); }

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

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
