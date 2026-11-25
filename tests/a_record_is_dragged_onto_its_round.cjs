/* A RECORD NO ROUND CLAIMS IS DRAGGED ONTO THE ROUND IT BELONGS TO

   The office, over a month of records wearing NOT ON SCHEDULE: *"在这里我要
   可以drag 例如我把这个21 Nov 2026 可以drag去他的下一个上面 drag的话 代表它
   就是on schedule 是同一个工"*.

   The pairing keys on (job, plot, ROUND) and the round a record carries is
   the week its own day falls in — so a worker who ticked round 2 and walked
   the plot on the 21st sends week 3, the office scheduled round 2, and the
   two never meet. The drag writes the ROUND and nothing else.

   THE DRAG IS THE PAGE'S OWN HANDLERS, fired by real DragEvents at the real
   rows — a drag simulated by calling the writer would prove nothing about
   the screen.

   Run with a static server on 8777 serving the repository root.
   SHOT=/dir draws the list mid-drag.                                   */
const { chromium } = require('playwright');
const SHOT = process.env.SHOT || '';

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

async function boot(browser, level) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript(() => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.removeItem('mjm_maint_month'); } catch (_) {}
    window.__DB = { nops_maint_records: [{ id: 1, records: [
      { id: 1, tarikh: '-', jenis: 'Merumput', racun: 'offstage', plot: 'ZZ',
        batch: '', qty: null, carlos: 0, gaia: 0, remark: '' }
    ] }] };
    /* EVERY WRITE, so a refusal can be shown to have written NOTHING — a
       stub that swallows an update signs off a gate that is not there. */
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
        if (st.op === 'update') {
          window.__WRITES.push({ table, patch: JSON.parse(JSON.stringify(st.row)),
                                 eqs: st.eqs.slice() });
          rows().forEach((r) => Object.assign(r, st.row));
          return { data: null, error: null };
        }
        if (st.op === 'upsert' || st.op === 'insert') {
          window.__WRITES.push({ table, patch: JSON.parse(JSON.stringify(st.row)), eqs: [] });
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
        if (p === 'update') return (r) => { st.op = 'update'; st.row = r; return q; };
        if (p === 'delete') return () => { st.op = 'delete'; return q; };
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

  /* The permission layer, so section 7 can ask the same page as somebody
     who may not approve. `mayMaintAct` reads nursery_ops_actions.maintenance
     and falls back to the module level, so both have to be answered. */
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.__LVL = ${JSON.stringify(level)};
    window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'permissions' || k === 'perms') return () => ({
        modules: { nursery_ops: 'admin' },
        nursery_ops_actions: { maintenance: { view: true, approve: window.__LVL !== 'noapprove' } }
      });
      if (k === 'profile') return () => ({});
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
                                && typeof window.renderRecords === 'function',
                             { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForSelector('#recview-list', { state: 'visible', timeout: 10000 });
  return page;
}

/* The office's own month, in the shape their screenshot shows.

   B1 carries two P & D rounds, 1 and 2. The submission is dated 21 Nov,
   which falls in round 3, so nothing claims it and it comes to rest in B1's
   group wearing NOT ON SCHEDULE. That is the row to drag.

   THE THREE REFUSALS ARE EACH ON THE RIGHT ROW TO REFUSE FOR, and that took
   a run to get right: `recPinRefusal` asks the PLOT first, so a weeding row
   on another plot is refused for the plot and the job test is never
   reached. So B1 carries a weeding row of its own and a CHECKED P & D round
   of its own, and only the other-plot refusal is on another plot.

   The checked round is round 4 and not round 3, or the record — which is
   week 3 — would pair with it and never be loose at all. */
const seedFn = () => {
  const m = getMonth();
  const row = (o) => Object.assign({
    tarikh: '-', jenis: 'Penyemburan racun kulat dan serangga',
    racun: 'Round 1: Antracol 50gm + Bond 15mL', batch: '', qty: null,
    carlos: 0, gaia: 0, remark: '', _month: m }, o);
  records = [
    row({ id: 601, plot: 'B1' }),
    row({ id: 602, plot: 'B1', racun: 'Round 2: Antracol 50gm + Bond 15mL' }),
    row({ id: 603, plot: 'B1', jenis: 'Merumput', racun: 'Round 2: Manual' }),
    row({ id: 604, plot: 'B9', racun: 'Round 2: Antracol 50gm + Bond 15mL' }),
    row({ id: 605, plot: 'B1', racun: 'Round 4: Antracol 50gm + Bond 15mL', checked: 1 }),
  ];
  pendingFieldRecords = [
    { id: 9101, plot_name: 'B1', work_type: 'pd',
      jenis: 'Penyemburan racun kulat dan serangga',
      chemical: 'Antracol 50gm + Bond 15mL', qty: 5690, work_date: '2026-11-21',
      week_no: 3, schedule_month: m, worked_by: 'Muhamad Azhar',
      reported_by: 'Muhamad Azhar', verified_at: null, rejected_at: null },
    /* A record on a plot with no row of its job at all — nowhere to drag
       it, so the screen must not offer the gesture. */
    { id: 9102, plot_name: 'B7', work_type: 'pd',
      jenis: 'Penyemburan racun kulat dan serangga',
      chemical: 'Antracol 50gm + Bond 15mL', qty: 100, work_date: '2026-11-21',
      week_no: 3, schedule_month: m, worked_by: 'Anton',
      reported_by: 'Anton', verified_at: null, rejected_at: null },
  ];
  rejectedFieldRecords = [];
  fieldRecords = [];
  renderRecords();
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await boot(browser, 'full');
  const dead = (msg) => new Proxy({}, { get: (_, k) => (k === 'toJSON' ? () => msg
    : k === 'map' || k === 'every' || k === 'filter' ? () => msg
    : k === Symbol.iterator ? undefined : dead(msg)) });
  const ev = (fn, arg) => page.evaluate(fn, arg).catch((e) => dead('ERR: ' + String(e.message).split('\n')[0]));

  const seed = () => ev(seedFn);
  /* THE FIELD RECORD TABLE ONLY. This page saves a Worker Record sheet and
     the schedule blob on its own timers, and a count of every write reads
     one of those landing in the window as the gate having failed. */
  const writes = () => ev(() => (window.__WRITES || [])
    .filter((w) => w.table === 'nops_maint_field_records'));
  const clearWrites = () => ev(() => { window.__WRITES = []; });

  /* THE PAGE'S OWN HANDLERS, through real DragEvents — dragstart on the
     loose row, dragover and drop on the scheduled one. Returns what the
     drag lit up, which is the only thing the screen says about where a row
     may land. */
  const drag = (recId, rowId) => ev(([rid, row]) => {
    const src = [...document.querySelectorAll('#rec-body tr.rec-row-loose')]
      .find((tr) => (tr.getAttribute('ondragstart') || '').includes('(' + rid) ||
                    (tr.getAttribute('ondragstart') || '').includes(',' + rid));
    if (!src) return { err: 'no draggable row for ' + rid };
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const lit = [...document.querySelectorAll('#rec-body tr.rec-drop-ok')]
      .map((tr) => tr.getAttribute('data-rec-id'));
    const tgt = document.querySelector(`#rec-body tr[data-rec-id="${row}"]`);
    if (!tgt) { src.dispatchEvent(new DragEvent('dragend', { bubbles: true })); return { lit, err: 'no target row ' + row }; }
    tgt.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
    tgt.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    return { lit };
  }, [String(recId), String(rowId)]);

  await seed();
  await page.waitForTimeout(250);

  try {
  console.log('\n1. A row with a round to go to can be picked up; one without cannot');
  const rows = await ev(() => [...document.querySelectorAll('#rec-body tr.rec-row-loose')]
    .map((tr) => ({ plot: tr.children[3].textContent.trim(),
                    drag: tr.getAttribute('draggable') === 'true',
                    grab: tr.classList.contains('rec-row-drag'),
                    tip: (tr.querySelector('.rec-loose-tag') || {}).title || '' })));
  const b1 = (rows.filter ? rows : []).find((x) => x.plot === 'B1') || {};
  const b7 = (rows.filter ? rows : []).find((x) => x.plot === 'B7') || {};
  check('the B1 record can be dragged', b1.drag, true);
  check('…and says so with the grab cursor', b1.grab, true);
  check('…and its tag invites the drag', /drag this row onto the round/i.test(b1.tip || ''), true);
  /* B7 HAS NO P & D ROW THIS MONTH, so there is nowhere for it to land. A
     drag that can never land is a gesture somebody tugs at and is told
     nothing by. */
  check('the B7 record cannot, having nowhere to go', b7.drag, false);
  check('…and its tag does not invite one', /drag this row/i.test(b7.tip || ''), false);
  } catch (e) { fail++; console.log('  FAIL 1. draggable -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n2. Only the rows that may take it light up');
  const lit = await ev(() => {
    const src = document.querySelector('#rec-body tr.rec-row-loose[draggable="true"]');
    src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: new DataTransfer(), bubbles: true }));
    const out = [...document.querySelectorAll('#rec-body tr.rec-drop-ok')]
      .map((tr) => tr.getAttribute('data-rec-id')).sort();
    
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    return out;
  });
  /* 601 and 602 are B1's own two P & D rounds. 603 is weeding, 604 is
     another plot, 605 is Checked — each refused by name in section 5. */
  check('B1 own two P & D rounds, and nothing else', lit, ['601', '602']);
  /* AND THE LIGHT IS ON THE SCREEN, not only in the class list. The zebra
     rule `.rec-table tbody tr:nth-child(even) td` is a heavier selector
     than a single class, so a tint written once shows on the odd rows and
     not the even ones — which is what the first version did, and a class
     check passes over the whole of it. Asked of BOTH rows for that reason:
     one of them is an even row. */
  const tint = await ev(() => {
    const src = document.querySelector('#rec-body tr.rec-row-loose[draggable="true"]');
    src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: new DataTransfer(), bubbles: true }));
    const bg = (id) => {
      const tr = document.querySelector(`#rec-body tr[data-rec-id="${id}"]`);
      return tr ? getComputedStyle(tr.children[0]).backgroundColor : 'no row';
    };
    const out = { lit1: bg(601), lit2: bg(602), plain: bg(604) };
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    return out;
  });
  check('both lit rows really are tinted', (tint || {}).lit1 === (tint || {}).lit2, true);
  check('…and a row that cannot take it is not',
        (tint || {}).lit1 !== (tint || {}).plain, true);
  check('the lights go out when the row is dropped',
        await ev(() => document.querySelectorAll('#rec-body tr.rec-drop-ok').length), 0);
  } catch (e) { fail++; console.log('  FAIL 2. targets -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n3. The drop writes the ROUND, on that record, and nothing else');
  /* THE DROP OPENS THE MERGE DIALOG and the write is behind its Merge
     button — a field only one side has is taken, and a disagreement is
     asked. `a_merge_takes_the_side_that_has_it.cjs` is all of that; what
     this section is still about is the ROUND, which is the one thing the
     drag itself decides. */
  await clearWrites();
  const d = await drag(9101, 602);
  await page.waitForTimeout(200);
  check('the drop itself writes nothing', (await writes()).length, 0);
  check('…it opens the merge dialog', await ev(() =>
    document.getElementById('rec-merge-modal').classList.contains('open')), true);
  await ev(() => recMergeApply());
  await page.waitForTimeout(250);
  const w = await writes();
  check('one write', (w.filter ? w : []).length, 1);
  const only = (w[0] || {});
  check('…to the field record table', only.table, 'nops_maint_field_records');
  /* ROUND 2, which is the row it was dropped on, and the record's own day,
     plot, job, batches and crew are not in the patch at all: what the
     worker reported is untouched. */
  check('…setting the round to the row own', only.patch, { week_no: 2 });
  check('…on that record and no other', (only.eqs || []).map(String), ['id,9101']);
  } catch (e) { fail++; console.log('  FAIL 3. write -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n4. …and then it pairs: the row claims it and the loose row is gone');
  /* The write went to the database; this drives the REAL pairing over the
     record as it now stands, which is the thing that actually matters —
     asserting the write alone would pass over a round that still matches
     nothing. */
  /* RE-SEEDED rather than mutated in place: the drop ends in
     `_reloadSubmissions`, which re-reads the table — and the stub's table is
     empty, so `pendingFieldRecords[0]` is nobody by the time this runs. */
  await seed();
  await ev(() => {
    pendingFieldRecords[0].week_no = 2;
    renderRecords();
  });
  await page.waitForTimeout(150);
  const after = await ev(() => {
    const loose = [...document.querySelectorAll('#rec-body tr.rec-row-loose')]
      .map((tr) => tr.children[3].textContent.trim());
    const tr = document.querySelector('#rec-body tr[data-rec-id="602"]');
    const chip = tr && tr.querySelector('.rec-waiting');
    return { loose, chip: chip ? chip.textContent.replace(/\s+/g, ' ').trim() : 'no chip',
             tip: chip ? chip.getAttribute('title') || '' : '' };
  });
  check('the B1 record has left the loose rows', (after.loose || []).indexOf('B1'), -1);
  check('…and B7, which nothing moved, is still there', (after.loose || []).indexOf('B7') >= 0, true);
  check('round 2 carries the waiting chip', /21 Nov/.test(after.chip || ''), true);
  check('…naming who is waiting on it', /Muhamad Azhar/.test(after.tip || ''), true);
  } catch (e) { fail++; console.log('  FAIL 4. pairs -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n5. Three refusals, each by name, and NOTHING written');
  await seed();
  await page.waitForTimeout(200);
  const say = await ev(() => {
    const f = pendingFieldRecords.find((x) => String(x.id) === '9101');
    const r = (id) => records.find((x) => String(x.id) === String(id));
    return { plot: recPinRefusal(f, r(604)), job: recPinRefusal(f, r(603)),
             checked: recPinRefusal(f, r(605)), ok: recPinRefusal(f, r(602)) };
  });
  check('another plot is refused, and says which', /Plot B9/.test((say || {}).plot || ''), true);
  check('another job is refused, and names both', /Weeding|Merumput/i.test((say || {}).job || ''), true);
  check('a Checked row is refused, and says to Uncheck it',
        /Uncheck/i.test((say || {}).checked || ''), true);
  check('and the round it belongs to is refused for nothing', (say || {}).ok, '');
  /* THE REFUSAL IS A GATE AND NOT A PAINT. The drop is called straight out
     of the console on a row that never lit up — which is the only way to
     tell the two apart. */
  await clearWrites();
  await ev(async () => {
    const f = pendingFieldRecords.find((x) => String(x.id) === '9101');
    await recPinRecord(f, records.find((x) => String(x.id) === '604'));
    await recPinRecord(f, records.find((x) => String(x.id) === '603'));
    await recPinRecord(f, records.find((x) => String(x.id) === '605'));
  });
  await page.waitForTimeout(150);
  check('a refused drop writes nothing at all', (await writes()).length, 0);
  } catch (e) { fail++; console.log('  FAIL 5. refusals -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n6. The way back off a round');
  /* Offered only on a record whose round is NOT the week its own day falls
     in — which is every record the drag put here, and no record that
     matched by itself: for those the two numbers are the same and the
     button would change nothing. */
  const before = await ev(() => {
    const tr = document.querySelector('#rec-body tr[data-rec-id="601"]');
    return !!(tr && tr.querySelector('.rec-unpin'));
  });
  check('a round nobody moved anything onto offers no way back', before, false);
  await ev(() => { pendingFieldRecords[0].week_no = 2; renderRecords(); });
  await page.waitForTimeout(150);
  check('a round carrying a moved record does',
        await ev(() => !!document.querySelector('#rec-body tr[data-rec-id="602"] .rec-unpin')), true);
  await clearWrites();
  await ev(() => document.querySelector('#rec-body tr[data-rec-id="602"] .rec-unpin').click());
  await page.waitForTimeout(200);
  const w = await writes();
  /* BACK TO THE WEEK ITS OWN DAY FALLS IN — 21 Nov is round 3 — which is
     what the phone sends. Nothing recorded what it was before, and the
     confirm says so rather than promising to restore it. */
  check('it puts the round back to the day own', (w[0] || {}).patch, { week_no: 3 });
  check('…on that record', ((w[0] || {}).eqs || []).map(String), ['id,9101']);
  } catch (e) { fail++; console.log('  FAIL 6. unpin -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n7. A login that may not approve is offered none of it');
  const p2 = await boot(browser, 'noapprove');
  await p2.evaluate(seedFn);
  await p2.waitForTimeout(250);
  const seen = await p2.evaluate(() => ({
    drag: document.querySelectorAll('#rec-body tr.rec-row-loose[draggable="true"]').length,
    tip: ((document.querySelector('#rec-body tr.rec-row-loose .rec-loose-tag') || {}).title) || '',
  }));
  check('no loose row can be picked up', seen.drag, 0);
  check('…and the tag does not invite a drag', /drag this row/i.test(seen.tip || ''), false);
  /* ASKED AGAIN AT THE WRITE, because a row drawn before somebody access
     changed is still sitting on the screen. */
  await p2.evaluate(() => { window.__WRITES = []; });
  p2.on('dialog', (d) => d.accept().catch(() => {}));
  await p2.evaluate(async () => {
    const f = pendingFieldRecords.find((x) => String(x.id) === '9101');
    await recPinRecord(f, records.find((x) => String(x.id) === '602'));
  });
  await p2.waitForTimeout(150);
  check('and the writer refuses when it is called anyway',
        (await p2.evaluate(() => window.__WRITES
          .filter((w) => w.table === 'nops_maint_field_records').length)), 0);
  const unpin = await p2.evaluate(() => {
    pendingFieldRecords[0].week_no = 2; renderRecords();
    return document.querySelectorAll('#rec-body .rec-unpin').length;
  });
  check('…and no way back is drawn either', unpin, 0);
  await p2.close();
  } catch (e) { fail++; console.log('  FAIL 7. permission -- ' + String(e.message).split('\n')[0]); }

  if (SHOT) {
    await seed();
    await page.waitForTimeout(200);
    await ev(() => {
      const src = document.querySelector('#rec-body tr.rec-row-loose[draggable="true"]');
      src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: new DataTransfer(), bubbles: true }));
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: SHOT.replace(/\/$/, '') + '/drag-mid.png', fullPage: false });
    console.log('\n  shot: ' + SHOT.replace(/\/$/, '') + '/drag-mid.png');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
