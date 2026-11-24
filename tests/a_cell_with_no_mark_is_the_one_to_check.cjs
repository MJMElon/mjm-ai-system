/* A CELL WITH NO MARK IS THE ONE TO GO AND CHECK, and a batch somebody
   typed that WAS the report is held like one the link filled in.

   One rule, read off the office's own three sentences, and the middle one
   is the one that was misread first:

     *"这个链接的icon出来了 但是因为自己有打字 所以check的时候底下没有线
       我要线"*
     *"如果图二我看到没虚线我还是要check"*
     *"打的batch不等于如果不打自动link的batch 那就不要虚线"*

   THE ABSENCE IS THE SIGNAL. A marked cell is the batch report's own answer
   — green and 🔗 while it is live, dark and solid once the row is checked —
   and a cell wearing NOTHING is somebody's own answer that the report does
   not agree with, which is the row they go and open. So the first sentence
   was never "mark every cell somebody typed into": it was about the one
   case where what they typed IS the report's answer, which carried the 🔗
   right up until the row was checked and then went bare.

   A build that marked every keyed cell shipped for a few hours in between,
   and taking it back is the whole reason this file asserts the ABSENCES as
   hard as the marks. A mark put on the wrong cell here does not look like a
   bug — it looks like a row that has already been checked.

   WHAT IT COSTS, and it is why the second half is not simply a stylesheet
   rule: a checked row is NEVER re-read, so whether the two agreed has to
   have been written down on the day. `freezeFor` writes `batchFrozen` for a
   keyed batch as well now, where the keyed answer matches the link, and it
   asks the link DIRECTLY rather than through `recBatches` — that one
   short-circuits on a checked row by design, and `freezeCheckedRows` calls
   `freezeFor` over rows that are already checked, which is how a row
   checked before any of this is repaired on the next page load.

   Section 1 drives the shipped shared_plot_movement.js. Section 2 and 3
   drive the REAL page in a REAL browser, because a mark is a thing somebody
   looks at and nothing else here can see one.

   EVERY READER IS GUARDED, and a cell with no span answers 'no mark at all'
   rather than throwing, because that is a real state this file asks about.

   Needs a static server on 8777.
   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_cell_with_no_mark_is_the_one_to_check.cjs */
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

/* Two plots and nothing clever. B5 holds 240 and 241, so a row keyed "240,
   241" is the report's own answer and one keyed "240" is not. B7 holds 243
   and nothing else has happened to it.

   B7 CARRIED A 3RD CULLING NOBODY HAD FLOWN, as a way of proving nothing
   was deducted — and the day an unflown culling started taking the batch
   OFF the plot, this file's whole subject went with it: every B7 cell drew
   a dash and the mark states could not be read at all. Proving an unflown
   culling deducts nothing is `a_batch_3rd_culled_is_off_the_plot.cjs`'s
   job. A fixture that is about marks holds nothing but standing batches. */
const LOGS = [
  log('Transplanted', '2026-09-01', 'B5', '240', 1000),
  log('Transplanted', '2026-09-01', 'B5', '241', 800),
  log('Transplanted', '2026-09-01', 'B7', '243', 500)
];

function fakeSupabase() {
  const q = (rows) => { const o = new Proxy({}, { get(_, k) {
    if (k === 'then') return (a, b) => Promise.resolve({ data: rows, error: null }).then(a, b);
    if (k === 'range') return (f) => q(f === 0 ? rows : []);
    return () => o; } }); return o; };
  return { from: (t) => q(t === 'shared_inventory_logs' ? LOGS : []) };
}

/* ONE ROW PER STATE. */
const R = (id, o) => Object.assign({ id, _month: 'Nov 2026', tarikh: '2026-11-20',
  racun: 'Round 1', jenis: 'Membaja', plot: 'B5', batch: '', qty: null,
  carlos: 0, gaia: 0, remark: '' }, o);
const RECORDS = [
  R(901, { batch: '240, 241' }),                              // keyed AND agrees — carries the 🔗
  R(902, { batch: '240' }),                                   // keyed, NOT the report — bare, and that is the signal
  R(903, { qty: 777 }),                                       // keyed quantity — an override, bare
  R(904, { batch: '241', checked: 1, qtyFrozen: 800 }),       // checked, keyed batch that disagrees — still bare
  R(905, { batch: '241', checked: 1, qty: 777 }),             // checked, both keyed and neither is the report
  R(906, { plot: 'B7' }),                                     // nothing keyed at all
  R(907, { plot: 'B7', checked: 1, batchFrozen: '243', qtyFrozen: 500 }),  // frozen at Check
  /* CHECKED, and the batch they typed WAS the report's own answer:
     *"人为打的=link的batch的话,checked了也要长这样图一"*. */
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
  console.log('\n1  the rule itself');
  const ctx = { console, Date, Math, Promise, Set, Map, Object, Array, String, Number, JSON, isNaN };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared', 'shared_plot_movement.js'), 'utf8'), ctx);
  const PM = ctx.PlotMovement;
  await PM.load(fakeSupabase());
  const bat = (o) => PM.recBatches(Object.assign({ plot: 'B5', tarikh: '2026-11-20' }, o));

  check('a keyed batch that IS the report carries the mark',
        [bat({ batch: '240, 241' }).linked, !!bat({ batch: '240, 241' }).agrees], [true, true]);
  /* IT HANDS BACK NOTHING TO DESCRIBE ITSELF WITH, on purpose: the cell
     wears nothing, so a field here would only ever feed a sentence that
     must not be on the screen. */
  check('…and one that is NOT carries nothing at all',
        [bat({ batch: '240' }).linked, bat({ batch: '240' }).info === undefined], [false, true]);
  check('a CHECKED row is not re-read',
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

  const rows = await page.evaluate(() => {
    const out = [];
    [...document.querySelectorAll('#recview-list .rec-table tbody tr')].forEach((tr) => {
      const td = [...tr.querySelectorAll('td')];
      if (td.length < 6) return;                       // a plot group header
      const read = (cell) => {
        const sp = cell && cell.querySelector('span');
        /* NO SPAN IS A REAL ANSWER HERE and not a failure to read one —
           it is the state half this file is about. */
        if (!sp) return { mark: 'no mark at all', line: 'none',
                          textColour: getComputedStyle(cell).color, tip: '' };
        const cs = getComputedStyle(sp);
        return { mark: sp.className,
                 line: cs.borderBottomStyle === 'none' ? 'none'
                     : cs.borderBottomWidth + ' ' + cs.borderBottomStyle,
                 /* The two crops the office sent differ by the TEXT colour
                    and nothing else, so it has to be read back. */
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
     rows read "241". A map keyed on the text drops four of the states on
     the floor and answers "row not drawn" about a row that is on the
     screen, which is the quietest way for a check like this to pass over
     the thing it is for. That was the first version of this reader. */
  const BARE = { mark: 'row not drawn', line: 'none', textColour: '', tip: '' };
  const row = (p) => rows.filter(p).length === 1 ? rows.filter(p)[0] : null;
  const at = (p, col) => (row(p) || {})[col] || BARE;
  const AGREES        = (r) => r.plot === 'B5' && !r.checked && r.qtyText === '🔗 1,800';
  const DISAGREES     = (r) => r.batchText === '240';
  const KEYED_QTY     = (r) => r.plot === 'B5' && !r.checked && r.qtyText === '777';
  const KEYED_CHECKED = (r) => r.plot === 'B5' && r.checked && r.qtyText === '800';
  const BOTH_KEYED    = (r) => r.plot === 'B5' && r.checked && r.qtyText === '777';
  const LINKED        = (r) => r.plot === 'B7' && !r.checked;
  const FROZEN        = (r) => r.plot === 'B7' && r.checked;
  const HELD_KEYED    = (r) => r.plot === 'B5' && r.checked && r.qtyText === '1,800';

  console.log('\n2  a marked cell is the batch report answer, and nothing else is marked');
  check('all eight states are on the screen', rows.length, 8);
  check('the report own answer is marked', at(LINKED, 'batch').mark, 'qty-linked');
  check('…and so is a keyed batch that IS it', at(AGREES, 'batch').mark, 'qty-linked');
  check('…and a held one', at(FROZEN, 'batch').mark, 'qty-frozen');
  /* THE OFFICE OWN TWO CROPS: a keyed batch that was the report has to read
     like the held one beside it, or they go on checking a cell that is
     already agreed. */
  check('a keyed batch that WAS the report reads as held once the row is checked',
        [at(HELD_KEYED, 'batch').mark, at(HELD_KEYED, 'batch').line],
        ['qty-frozen', '1px solid']);
  check('…the same colour as a held batch nobody keyed, letter for letter',
        at(HELD_KEYED, 'batch').textColour === at(FROZEN, 'batch').textColour, true);
  check('…and its hover says a person keyed it',
        /Keyed by hand/.test(at(HELD_KEYED, 'batch').tip), true);

  console.log('\n3  and a cell with NO mark is the one to go and check');
  /* *"打的batch不等于如果不打自动link的batch 那就不要虚线"*. A build that
     marked these shipped for a few hours, so the absences are asserted as
     hard as the marks. */
  check('a keyed batch that is NOT the report wears nothing',
        [at(DISAGREES, 'batch').mark, at(DISAGREES, 'batch').line],
        ['no mark at all', 'none']);
  check('…and nor does it once the row is checked',
        [at(KEYED_CHECKED, 'batch').mark, at(KEYED_CHECKED, 'batch').line],
        ['no mark at all', 'none']);
  check('a keyed QUANTITY wears nothing either — it is an override by design',
        [at(KEYED_QTY, 'qty').mark, at(BOTH_KEYED, 'qty').mark],
        ['no mark at all', 'no mark at all']);
  check('the quantity frozen beside a bare batch still wears its own',
        [at(KEYED_CHECKED, 'qty').mark, at(KEYED_CHECKED, 'qty').line],
        ['qty-frozen', '1px solid']);
  check('nothing anywhere wears a mark that is not one of the two',
        [...new Set(rows.flatMap((r) => [r.batch.mark, r.qty.mark]))].sort(),
        ['no mark at all', 'qty-frozen', 'qty-linked']);
  check('…and no bare cell carries a hover nobody can reach',
        rows.filter((r) => (r.batch.mark === 'no mark at all' && r.batch.tip)
                        || (r.qty.mark === 'no mark at all' && r.qty.tip)), []);

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
