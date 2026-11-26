/* A MERGE TAKES THE SIDE THAT HAS IT, AND ASKS WHERE THEY DISAGREE

   The office, over a drag in progress: *"现在我要drag去下面一个 每一次merge
   你要看有什么部分不一样 有的就跟着有的 例如下面的没有工人 上的有工人那就
   跟着上的 上的有日期下的没有 就跟有日期的 但是chemical部分会不一样 如果不
   一样 你要让我选哪一个是对的 还是两个都不对 我可以manual改"*.

   So the drop is a MERGE, and the two rows become one — the SCHEDULE ROW,
   which is the row the office checks and the claim pays. Three states per
   field:

     ONE SIDE HAS IT   taken, never asked (*有的就跟着有的*)
     THEY AGREE        taken, never asked
     THEY DIFFER       asked, with "neither, key it" as a third answer
                       (*还是两个都不对 我可以manual改*)

   TWO FIELDS ARE NOT MERGED and the dialog says so: the CREW, because a
   tick is money and it is written when the Field Conductor approves, and
   the QUANTITY, by the office's own standing rule.

   THE OFFICE'S OWN EXAMPLE PAIR AGREES, which is the one reading in here
   they may want to correct: "Antracol 50gm + Bond 15mL" against "Round 3:
   Antracol 50gm + Bond 15mL" is ONE chemical under a round label, compared
   on the pairing's own `chemKey`. Section 1 asserts that, so a change to it
   fails here.

   Run with a static server on 8777 serving the repository root.
   SHOT=/dir draws the dialog.                                          */
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

/* THE FIXTURE IS THE FOUR SHAPES THE MERGE HAS TO TELL APART, on one plot
   and one job so every row is a place the record may be dropped:

     701  the office's own picture, near enough: a round with NO day and NO
          batch and a DIFFERENT chemical, carrying a remark of its own. So
          Date and Batch come off the record, Remark stays on the row, and
          Chemical is the one question.
     702  the office's own PAIR: "Round 4: Antracol 50gm + Bond 15mL"
          against the worker's bare "Antracol 50gm + Bond 15mL". One
          chemical under a round label, so nothing is asked about it.
     703  the SAME BATCHES in another order, and a DIFFERENT DAY. The
          batches must read as one answer and the days as a question.
     704  CHECKED, so it is refused outright and opens no dialog.

   NO ROW IS ROUND 3, and the record is week 3 — which is what leaves it
   loose and draggable at all. The first version of this fixture wrote 702
   as Round 3, so the record PAIRED with it and every check about the drag
   read "no draggable loose row": a fixture whose record is not loose
   cannot test a gesture only a loose row has.

   AND ONLY THE ROW CARRIES A REMARK. With one on both sides the remark is
   an ordinary disagreement and the *one side has it* rule — the office's
   own first sentence — is tested nowhere. */
const seedFn = () => {
  const m = getMonth();
  const row = (o) => Object.assign({
    tarikh: '-', jenis: 'Penyemburan racun kulat dan serangga',
    racun: 'Round 1: Antracol 50gm + Bond 15mL', batch: '', qty: null,
    carlos: 0, gaia: 0, remark: '', plot: 'B1', _month: m }, o);
  records = [
    row({ id: 701, racun: 'Round 2: Daconil 50gm', remark: 'Pagi' }),
    row({ id: 702, racun: 'Round 4: Antracol 50gm + Bond 15mL' }),
    row({ id: 703, batch: '271, 255', tarikh: '2026-11-20' }),
    row({ id: 704, racun: 'Round 5: Daconil 50gm', checked: 1 }),
  ];
  pendingFieldRecords = [
    { id: 9201, plot_name: 'B1', work_type: 'pd',
      jenis: 'Penyemburan racun kulat dan serangga',
      chemical: 'Antracol 50gm + Bond 15mL', qty: 5690, work_date: '2026-11-21',
      week_no: 3, schedule_month: m, batch_name: '255, 271',
      remark: '', worked_by: 'Muhamad Azhar',
      reported_by: 'Muhamad Azhar', verified_at: null, rejected_at: null },
  ];
  rejectedFieldRecords = [];
  fieldRecords = [];
  renderRecords();
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await boot(browser, 'full');
  const dead = (msg) => new Proxy({}, { get: (_, k) => (k === 'toJSON' ? () => msg
    : k === 'map' || k === 'every' || k === 'filter' || k === 'find' ? () => msg
    : k === Symbol.iterator ? undefined : dead(msg)) });
  const ev = (fn, arg) => page.evaluate(fn, arg).catch((e) => dead('ERR: ' + String(e.message).split('\n')[0]));
  const seed = () => ev(seedFn);
  const writes = () => ev(() => (window.__WRITES || [])
    .filter((w) => w.table === 'nops_maint_field_records'));
  const clearWrites = () => ev(() => { window.__WRITES = []; });
  /* The drop, through the page's own handlers, which is what opens the
     dialog. Called directly it would prove nothing about the screen. */
  const drop = (rowId) => ev((row) => {
    const src = document.querySelector('#rec-body tr.rec-row-loose[draggable="true"]');
    if (!src) return 'no draggable loose row';
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const tgt = document.querySelector(`#rec-body tr[data-rec-id="${row}"]`);
    if (!tgt) return 'no row ' + row;
    tgt.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
    tgt.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    return 'dropped';
  }, String(rowId));
  const rowOf = (id) => ev((i) => {
    const r = (records || []).find((x) => String(x.id) === String(i));
    return r ? { tarikh: r.tarikh, racun: r.racun, batch: r.batch, remark: r.remark,
                 qty: r.qty === undefined ? null : r.qty,
                 byHandDate: r._tarikhByHand ? 1 : 0, byHandBatch: r._batchByHand ? 1 : 0 }
             : 'no row ' + i;
  }, String(id));

  await seed();
  await page.waitForTimeout(250);

  try {
  console.log('\n1. The rule, field by field, driven directly');
  const st = await ev(() => {
    const f = pendingFieldRecords[0];
    const r = (id) => records.find((x) => String(x.id) === String(id));
    const put = (id) => { const o = {}; recMergeRows(f, r(id))
      .forEach((x) => { o[x.key] = x.state; }); return o; };
    return { a: put(701), b: put(702), c: put(703) };
  });
  check('a day only the record has comes off the record', (st.a || {}).tarikh, 'rec');
  check('a batch only the record has, likewise', (st.a || {}).batch, 'rec');
  check('a remark only the row has stays on the row', (st.a || {}).remark, 'row');
  check('a different chemical IS the question', (st.a || {}).racun, 'differ');
  check('the crew is shown and never asked', (st.a || {}).worker, 'locked');
  /* THE OFFICE'S OWN PAIR. Their screenshot pointed at exactly this and
     called it a difference; under the pairing's own key it is one
     chemical wearing a round label, so it is taken and not asked. */
  check('"Antracol…" and "Round N: Antracol…" are ONE chemical', (st.b || {}).racun, 'same');
  check('a field NEITHER side has is not a row at all', (st.b || {}).remark, 'empty');
  /* THE BATCH IS A SET, which is how every batch comparison here reads:
     "255, 271" and "271, 255" are one answer. */
  check('the same batches in another order agree', (st.c || {}).batch, 'same');
  /* BOTH SIDES HAVE A DAY AND THEY ARE DIFFERENT DAYS, which is a real
     question — the office rule for the chemical, asked of the date. */
  check('two different days is a question too', (st.c || {}).tarikh, 'differ');
  } catch (e) { fail++; console.log('  FAIL 1. rule -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n2. The drop opens the dialog and draws what the rule says');
  await clearWrites();
  check('the drop itself writes nothing yet', await drop(701), 'dropped');
  await page.waitForTimeout(200);
  check('…nothing at all', (await writes()).length, 0);
  const dlg = await ev(() => {
    const m = document.getElementById('rec-merge-modal');
    if (!m || !m.classList.contains('open')) return 'the dialog is not open';
    const rows = [...m.querySelectorAll('.rm-row')].map((d) => ({
      f: d.getAttribute('data-f'),
      asked: d.classList.contains('rm-differ'),
      opts: d.querySelectorAll('input[type=radio]').length,
      own: !!d.querySelector('.rm-own'),
      ownOff: !!(d.querySelector('.rm-own') || {}).disabled,
    }));
    return { title: document.getElementById('rec-merge-title').textContent,
             sub: document.getElementById('rec-merge-sub').textContent, rows };
  });
  check('it names the round it is merging into', /Round 2/.test((dlg || {}).title || ''), true);
  check('…and the record it is merging in', /Muhamad Azhar/.test((dlg || {}).sub || ''), true);
  const byF = {}; ((dlg || {}).rows || []).forEach((r) => { byF[r.f] = r; });
  check('four fields are drawn', Object.keys(byF).sort(),
        ['batch', 'racun', 'remark', 'tarikh', 'worker'].filter((k) => byF[k]).sort());
  check('the chemical is the only one asked about',
        ((dlg || {}).rows || []).filter((r) => r.asked).map((r) => r.f), ['racun']);
  /* THREE ANSWERS, which is the office's own count: the record, the row,
     and neither. */
  check('…and it offers three answers', (byF.racun || {}).opts, 3);
  check('the box for keying one is there and SHUT until it is chosen',
        [(byF.racun || {}).own, (byF.racun || {}).ownOff], [true, true]);
  check('nothing is asked about the crew', (byF.worker || {}).asked, false);
  /* THE QUANTITY IS NOT A FIELD OF THIS DIALOG AT ALL. The office settled
     it: the row keeps the Summary Report link. */
  check('and the quantity is not on the dialog', !!byF.qty, false);
  } catch (e) { fail++; console.log('  FAIL 2. dialog -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n3. Merging takes each side that has it, and writes the round');
  await clearWrites();
  await ev(() => recMergeApply());
  await page.waitForTimeout(250);
  const w = await writes();
  check('one write to the record', (w.filter ? w : []).length, 1);
  check('…and it is the ROUND, which is what pairs them', (w[0] || {}).patch, { week_no: 2 });
  check('…on that record', ((w[0] || {}).eqs || []).map(String), ['id,9201']);
  const r = await rowOf(701);
  check('the day came off the record', (r || {}).tarikh, '2026-11-21');
  check('the batch came off the record', (r || {}).batch, '255, 271');
  check('the remark the row already had is untouched', (r || {}).remark, 'Pagi');
  /* THE DEFAULT ANSWER TO A DISAGREEMENT IS THE RECORD — the worker was
     standing in the plot — and it keeps the row own round label, see
     section 6. */
  check('the chemical defaulted to the record, under the row own round',
        (r || {}).racun, 'Round 2: Antracol 50gm + Bond 15mL');
  /* NEITHER TAKEN VALUE IS MARKED BY HAND. A value off the record is the
     field own first answer, and the sync fills only an EMPTY cell anyway. */
  check('nothing is marked as keyed by the office',
        [(r || {}).byHandDate, (r || {}).byHandBatch], [0, 0]);
  check('THE QUANTITY DID NOT MOVE', (r || {}).qty, null);
  check('the dialog closed', await ev(() =>
    document.getElementById('rec-merge-modal').classList.contains('open')), false);
  } catch (e) { fail++; console.log('  FAIL 3. apply -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n4. The ROW own answer, chosen');
  await seed(); await page.waitForTimeout(200);
  await drop(701);
  await page.waitForTimeout(150);
  await ev(() => {
    document.querySelector('.rm-differ input[value="row"]').click();
  });
  await ev(() => recMergeApply());
  await page.waitForTimeout(250);
  check('the row keeps its own chemical', (await rowOf(701)).racun, 'Round 2: Daconil 50gm');
  } catch (e) { fail++; console.log('  FAIL 4. row answer -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n5. Neither — key it');
  await seed(); await page.waitForTimeout(200);
  await drop(701);
  await page.waitForTimeout(150);
  const shut = await ev(() => {
    document.querySelector('.rm-differ input[value="own"]').click();
    return !!document.querySelector('.rm-own').disabled;
  });
  check('choosing it opens the box', shut, false);
  /* A BLANK ANSWER IS REFUSED rather than written as an empty chemical —
     somebody chose to key one and has not. */
  await clearWrites();
  await ev(() => recMergeApply());
  await page.waitForTimeout(200);
  check('an empty answer writes nothing', (await writes()).length, 0);
  check('…and the dialog stays open to be answered', await ev(() =>
    document.getElementById('rec-merge-modal').classList.contains('open')), true);
  await ev(() => {
    const b = document.querySelector('.rm-own');
    b.value = 'Antracol 50gm only'; b.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await ev(() => recMergeApply());
  await page.waitForTimeout(250);
  check('what was keyed is what is written',
        (await rowOf(701)).racun, 'Round 2: Antracol 50gm only');
  } catch (e) { fail++; console.log('  FAIL 5. key it -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n6. A day the office keyed IS marked as theirs, and the round label survives');
  await seed(); await page.waitForTimeout(200);
  /* 703 carries 20 Nov against the record own 21st, so the DATE is the
     question here. Answered by hand, that day is the office own answer and
     the field sync must never fill it in again — which is exactly what
     `_tarikhByHand` has always meant. */
  await drop(703);
  await page.waitForTimeout(150);
  await ev(() => {
    const d = [...document.querySelectorAll('.rm-differ')].find((x) => x.getAttribute('data-f') === 'tarikh');
    d.querySelector('input[value="own"]').click();
    const b = d.querySelector('.rm-own');
    b.value = '2026-11-19'; b.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await ev(() => recMergeApply());
  await page.waitForTimeout(250);
  const r = await rowOf(703);
  check('the keyed day is on the row', (r || {}).tarikh, '2026-11-19');
  check('…and marked as the office own answer', (r || {}).byHandDate, 1);
  /* THE ROUND LABEL IS PUT BACK. `rowWeek` reads the week off "Round N:"
     on a row with no slot, so a bare chemical written over one would move
     it to another round with nothing saying so. 703 agreed on its
     chemical, so nothing was asked and nothing was rewritten — the label
     is still there. */
  check('the row still carries its round label', /^Round 1:/.test((r || {}).racun || ''), true);
  } catch (e) { fail++; console.log('  FAIL 6. by hand -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n7. A Checked row opens no dialog at all');
  await seed(); await page.waitForTimeout(200);
  await clearWrites();
  await ev(async () => {
    const f = pendingFieldRecords[0];
    await recPinRecord(f, records.find((x) => String(x.id) === '704'));
  });
  await page.waitForTimeout(200);
  check('no dialog', await ev(() =>
    document.getElementById('rec-merge-modal').classList.contains('open')), false);
  check('and nothing written', (await writes()).length, 0);
  } catch (e) { fail++; console.log('  FAIL 7. checked -- ' + String(e.message).split('\n')[0]); }

  try {
  console.log('\n8. Cancel writes nothing and moves nothing');
  await seed(); await page.waitForTimeout(200);
  await drop(701);
  await page.waitForTimeout(150);
  await clearWrites();
  await ev(() => closeRecMerge());
  await page.waitForTimeout(200);
  const r = await rowOf(701);
  check('nothing written', (await writes()).length, 0);
  check('the row is as it was', [(r || {}).tarikh, (r || {}).racun, (r || {}).batch],
        ['-', 'Round 2: Daconil 50gm', '']);
  check('…and the record is still loose', await ev(() =>
    document.querySelectorAll('#rec-body tr.rec-row-loose').length), 1);
  } catch (e) { fail++; console.log('  FAIL 8. cancel -- ' + String(e.message).split('\n')[0]); }

  if (SHOT) {
    await seed();
    await page.waitForTimeout(200);
    await drop(701);
    await page.waitForTimeout(300);
    await page.screenshot({ path: SHOT.replace(/\/$/, '') + '/merge.png', fullPage: false });
    console.log('\n  shot: ' + SHOT.replace(/\/$/, '') + '/merge.png');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
