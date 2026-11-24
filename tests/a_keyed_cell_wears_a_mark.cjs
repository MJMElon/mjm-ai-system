/* A CELL SOMEBODY TYPED INTO WEARS A MARK, like every other cell that has
   something to say.

   The office, over a Work Record row whose batch they had keyed themselves
   and which had just grown the 🔗 because it agreed with the batch report:

     *"这个链接的icon出来了 但是因为自己有打字 所以check的时候底下没有线
       我要线"*

   They are right, and the screen was worse than their sentence. Rendered
   through the real page, every state of those two columns answered:

     linked                 🔗  green dotted      hover explains it
     keyed AND agreeing     🔗  green dotted      hover explains it
     keyed and NOT agreeing     NOTHING AT ALL
     keyed quantity             NOTHING AT ALL
     frozen at Check            grey solid        hover explains it
     checked + keyed batch      NOTHING AT ALL

   So on a CHECKED row the quantity the system filled in carried a line and
   the batch THEY had typed carried none, which is the row they were looking
   at — and it was true unchecked too, and of the quantity as well as the
   batch. A cell with something to say has to look like one, or the only
   cells anybody can hover are the ones the system filled in.

   `.qty-keyed` is that mark, and the two decisions in it are:

   - DOTTED LIKE THE LINK AND NEVER GREEN. The green is the batch report's
     own answer, and the whole of what the 🔗 was asked for one message
     earlier is reading down this column for the rows that are NOT it. A
     keyed value wearing the report's colour would undo that in one line of
     CSS, so section 3 asks for the colours to be DIFFERENT rather than
     pinning either of them.
   - IT NAMES WHAT THE REPORT SAYS where it can. `recBatches` had already
     worked the link out to decide the mark and was throwing it away; it is
     the one thing somebody reading down for the unmarked rows wants. A
     CHECKED row is the exception and returns before the ledger is read at
     all, so there is nothing to name and the sentence says so instead —
     a settled row is not re-read, not even to describe itself.

   Section 1 drives the shipped shared_plot_movement.js. Section 2 and 3
   drive the REAL page in a REAL browser, because a mark is a thing somebody
   looks at and nothing else here can see one.

   EVERY READER IS GUARDED. On the previous build a keyed cell has no span
   at all, so an unguarded read of its className takes the harness down at
   the first line and leaves every check under it unasked.

   Needs a static server on 8777.
   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_keyed_cell_wears_a_mark.cjs */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
};
const ROOT = path.join(__dirname, '..');

const log = (type, date, plot, batch, qty, remark) => ({
  transaction_type: type, transaction_date: date, created_at: date + 'T00:00:00Z',
  remark: remark || '', plot_name: plot, batch_name: batch, quantity_change: qty });

/* Two plots and nothing clever. B5 holds 240 and 241; B7 holds 243 and has
   a 3rd culling nobody has flown, which takes nothing off. The states this
   file is about are made by the RECORDS below, not by the ledger. */
const LOGS = [
  log('Transplanted', '2026-09-01', 'B5', '240', 1000),
  log('Transplanted', '2026-09-01', 'B5', '241', 800),
  log('Transplanted', '2026-09-01', 'B7', '243', 500),
  log('3rd_Culling',  '2026-11-03', 'B7', '243', 400, 'CullDate: 2026-11-03')
];

function fakeSupabase() {
  const q = (rows) => { const o = new Proxy({}, { get(_, k) {
    if (k === 'then') return (a, b) => Promise.resolve({ data: rows, error: null }).then(a, b);
    if (k === 'range') return (f) => q(f === 0 ? rows : []);
    return () => o; } }); return o; };
  return { from: (t) => q(t === 'shared_inventory_logs' ? LOGS : []) };
}

/* ONE ROW PER STATE, in the order the header lists them. */
const R = (id, o) => Object.assign({ id, _month: 'Nov 2026', tarikh: '2026-11-20',
  racun: 'Round 1', jenis: 'Membaja', plot: 'B5', batch: '', qty: null,
  carlos: 0, gaia: 0, remark: '' }, o);
const RECORDS = [
  R(901, { batch: '240, 241' }),                              // keyed AND agrees — B5 holds both
  R(902, { batch: '240' }),                                   // keyed, NOT what the report says
  R(903, { qty: 777 }),                                       // keyed quantity, batch linked
  R(904, { batch: '241', checked: 1, qtyFrozen: 800 }),       // checked + keyed batch — the office own row
  R(905, { batch: '241', checked: 1, qty: 777 }),             // checked, both keyed
  R(906, { plot: 'B7' }),                                     // nothing keyed at all
  R(907, { plot: 'B7', checked: 1, batchFrozen: '243', qtyFrozen: 500 }),  // frozen at Check
  /* CHECKED, and the batch they typed WAS the report's own answer. The
     office asked for this one to stop reading as a row still to go
     through: *"人为打的=link的batch的话,checked了也要长这样"*. */
  R(908, { batch: '240, 241', checked: 1, batchFrozen: '240, 241', qtyFrozen: 1800 })
];
async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));
  await page.addInitScript((seed) => {
    try { localStorage.setItem('mjm_maint_nursery', 'BNN');
          localStorage.setItem('mjm_maint_month', 'Nov 2026'); } catch (_) {}
    window.__DB = {
      nops_maint_records: [{ id: 1, records: seed.records }],
      shared_inventory_logs: seed.logs,
      shared_do_records: []
    };
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
      const run = (from, to) => {
        if (st.op === 'upsert' || st.op === 'insert') {
          window.__WRITES.push({ table, row: JSON.parse(JSON.stringify(st.row)) });
          const b = base();
          const i = b.findIndex((r) => String(r.id) === String(st.row.id));
          if (i >= 0) b[i] = st.row; else b.push(st.row);
          return { data: null, error: null };
        }
        let out = rows();
        if (from !== undefined) out = out.slice(from, to + 1);
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return (f, t2) => Promise.resolve(run(f, t2));
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
  }, { records: RECORDS, logs: LOGS });

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
  await page.waitForFunction(() => typeof window.renderRecords === 'function', { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForFunction(() => window.PlotMovement && PlotMovement.ready(), { timeout: 20000 });
  await page.evaluate(() => renderRecords());
  await page.waitForTimeout(200);
  return page;
}
(async () => {
  console.log('\n1  the link rides along on a keyed answer that disagrees');
  const ctx = { console, Date, Math, Promise, Set, Map, Object, Array, String, Number, JSON, isNaN };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared', 'shared_plot_movement.js'), 'utf8'), ctx);
  const PM = ctx.PlotMovement;
  await PM.load(fakeSupabase());
  const bat = (o) => PM.recBatches(Object.assign({ plot: 'B5', tarikh: '2026-11-20' }, o));
  /* Answered by NAME on a build that throws the link away, rather than by a
     crash — see the header. */
  const says = (b) => (b && b.info && b.info.batches) || 'no info in this build';

  check('a keyed batch that is NOT the report says so, and names what the report has',
        [bat({ batch: '240' }).linked, says(bat({ batch: '240' }))], [false, ['240', '241']]);
  /* THE MARK IS UNTOUCHED. The office asked for this one message earlier and
     a line must not quietly take it back. */
  check('…and one that agrees still carries the mark',
        [bat({ batch: '240, 241' }).linked, !!bat({ batch: '240, 241' }).agrees], [true, true]);
  /* A SETTLED ROW IS NOT RE-READ, not even to describe itself — the rule
     Checked exists for, and the reason the cell has a sentence of its own. */
  check('a CHECKED row keeps no link at all',
        [bat({ batch: '240', checked: 1 }).linked, bat({ batch: '240', checked: 1 }).info === undefined],
        [false, true]);

  console.log('\n1b  a keyed batch that WAS the report is HELD like one');
  /* The only way to say so without re-reading the ledger under a settled
     row is to have written down what the report said on the day. */
  const froze = (o) => (PM.freezeFor(Object.assign({ plot: 'B5', tarikh: '2026-11-20' }, o)) || {}).batchFrozen;
  check('checking a row writes the batch names for a keyed batch that agrees',
        froze({ batch: '240, 241' }), '240, 241');
  check('…matched as a SET, so a different spelling is the same answer',
        froze({ batch: '241,240' }), '240, 241');
  check('…and nothing at all for one that does not agree',
        froze({ batch: '240' }), undefined);
  /* freezeCheckedRows calls this over rows that are ALREADY checked — it is
     how a row checked before any of this is repaired on the next load — so
     a reader that short-circuits on `checked` could never answer here. */
  check('…and it still answers for a row that is already checked',
        froze({ batch: '240, 241', checked: 1 }), '240, 241');
  const held = (o) => { const b = bat(Object.assign({ checked: 1 }, o));
                        return [b.frozen === true, !!b.agrees, b.value]; };
  check('a held keyed batch reads as held, and says a person keyed it',
        held({ batch: '240, 241', batchFrozen: '240, 241' }), [true, true, '240, 241']);
  check('…a held batch nobody keyed is exactly what it was',
        held({ batch: '', batchFrozen: '240, 241' }), [true, false, '240, 241']);
  check('…and one that disagrees is still the row left to check',
        held({ batch: '240', batchFrozen: '240, 241' }), [false, false, '240']);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await boot(browser);

  /* Read back what a person actually sees: the class the cell wears and
     whether it has a line under it at all. */
  const rows = await page.evaluate(() => {
    const out = [];
    [...document.querySelectorAll('#recview-list .rec-table tbody tr')].forEach((tr) => {
      const td = [...tr.querySelectorAll('td')];
      if (td.length < 6) return;                       // a plot group header
      const read = (cell) => {
        const sp = cell && cell.querySelector('span');
        if (!sp) return { mark: 'no mark at all', line: 'none', colour: '',
                          textColour: getComputedStyle(cell).color, tip: '' };
        const cs = getComputedStyle(sp);
        return { mark: sp.className,
                 line: cs.borderBottomStyle === 'none' ? 'none'
                     : cs.borderBottomWidth + ' ' + cs.borderBottomStyle,
                 colour: cs.borderBottomColor,
                 /* The two pictures the office sent differ by the TEXT
                    colour and nothing else, so it has to be read back. */
                 textColour: cs.color,
                 tip: sp.getAttribute('title') || '' };
      };
      out.push({ plot: String(td[3].textContent).trim(),
                 checked: tr.classList.contains('rec-row-checked'),
                 batchText: String(td[4].textContent).trim(),
                 qtyText: String(td[5].textContent).trim(),
                 batch: read(td[4]), qty: read(td[5]) });
    });
    return out;
  });
  if (process.env.DUMP) rows.forEach((r, i) => console.log('   ', i, JSON.stringify(
    [r.plot, r.checked, r.batchText, r.batch.mark, r.qtyText, r.qty.mark])));
  /* FOUND BY WHAT THE ROW IS, never by the text in the cell: three of these
     rows read "241" and two more read "500". A map keyed on the text drops
     four of the seven states on the floor and answers "row not drawn" about
     a row that is on the screen, which is the quietest way for a check like
     this to pass over the thing it is for. */
  const BARE = { mark: 'row not drawn', line: 'none', colour: '', textColour: '', tip: '' };
  const row = (p) => rows.filter(p).length === 1 ? rows.filter(p)[0] : null;
  const at = (p, col) => (row(p) || {})[col] || BARE;
  const KEYED_CHECKED = (r) => r.plot === 'B5' && r.checked && r.batchText === '241' && r.qtyText === '800';
  const BOTH_KEYED    = (r) => r.plot === 'B5' && r.checked && r.batchText === '241' && r.qtyText === '777';
  const DISAGREES     = (r) => r.batchText === '240';
  const KEYED_QTY     = (r) => r.plot === 'B5' && !r.checked && r.qtyText === '777';
  const LINKED        = (r) => r.plot === 'B7' && !r.checked;
  const FROZEN        = (r) => r.plot === 'B7' && r.checked;
  const KEYED_AGREED  = (r) => r.plot === 'B5' && r.checked && r.qtyText === '1,800';

  console.log('\n2  every cell with something to say has a line under it');
  /* THE OFFICE OWN ROW: checked, and the batch is the one they typed. The
     quantity beside it carried a line the whole time. */
  check('all eight states are on the screen', rows.length, 8);
  check('a keyed batch on a CHECKED row is marked',
        [at(KEYED_CHECKED, 'batch').mark, at(KEYED_CHECKED, 'batch').line], ['qty-keyed', '1px dotted']);
  check('…and the quantity frozen beside it still wears its own',
        [at(KEYED_CHECKED, 'qty').mark, at(KEYED_CHECKED, 'qty').line], ['qty-frozen', '1px solid']);
  check('a keyed batch that disagrees is marked',
        [at(DISAGREES, 'batch').mark, at(DISAGREES, 'batch').line], ['qty-keyed', '1px dotted']);
  check('a keyed QUANTITY is marked too — the same fault, one column along',
        [at(KEYED_QTY, 'qty').mark, at(KEYED_QTY, 'qty').line], ['qty-keyed', '1px dotted']);
  check('a batch and a quantity BOTH keyed on a checked row are both marked',
        [at(BOTH_KEYED, 'batch').mark, at(BOTH_KEYED, 'qty').mark], ['qty-keyed', 'qty-keyed']);
  check('the linked cell is untouched',
        [at(LINKED, 'batch').mark, at(LINKED, 'qty').mark], ['qty-linked', 'qty-linked']);
  check('and so is the frozen one',
        [at(FROZEN, 'batch').mark, at(FROZEN, 'qty').mark], ['qty-frozen', 'qty-frozen']);
  /* THE OFFICE OWN TWO PICTURES. A keyed batch that was the report's own
     answer has to read like the held one beside it — same dark, same solid
     line — or they go on checking a cell that is already agreed. */
  check('a keyed batch that WAS the report reads as held once the row is checked',
        [at(KEYED_AGREED, 'batch').mark, at(KEYED_AGREED, 'batch').line],
        ['qty-frozen', '1px solid']);
  check('…and it is the same colour as a held batch nobody keyed, letter for letter',
        at(KEYED_AGREED, 'batch').textColour === at(FROZEN, 'batch').textColour, true);
  check('…and it is NOT the muted one still to check',
        at(KEYED_AGREED, 'batch').textColour === at(KEYED_CHECKED, 'batch').textColour, false);
  check('…and its hover says a person keyed it',
        /Keyed by hand/.test(at(KEYED_AGREED, 'batch').tip), true);
  check('nothing on either column is left bare',
        rows.filter((r) => r.batch.mark === 'no mark at all'
                        || r.qty.mark === 'no mark at all').map((r) => r.batchText), []);

  console.log('\n3  the keyed mark is NOT the report mark');
  /* The 🔗 is read down this column for the rows that are not it. A keyed
     value in the report colour would undo that, so the two are asked to
     DIFFER rather than either being pinned to a hex nobody would notice
     changing. */
  const keyed = at(KEYED_CHECKED, 'batch'), linked = at(LINKED, 'batch');
  check('they are different colours', keyed.colour !== linked.colour, true);
  check('…and a keyed cell carries no 🔗',
        rows.filter((r) => r.batch.mark === 'qty-keyed' && /🔗/.test(r.batchText)), []);
  check('the keyed batch names what the report has instead',
        /NOT what the batch report says/.test(at(DISAGREES, 'batch').tip), true);
  check('…and a CHECKED one says it is not read again rather than naming anything',
        /not read again/.test(at(KEYED_CHECKED, 'batch').tip), true);
  check('the keyed quantity says how to put it back on the link',
        /Use the linked amount/.test(at(KEYED_QTY, 'qty').tip), true);

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
