/* THE DOSAGE BOX, AND THE SAVE BUTTON THAT LOOKED LIKE IT DID NOTHING.

   Two faults the office reported together off one screenshot of the Setting
   tab, and both of them had the same shape: something changed underneath a
   rule that was written before it.

   1. THE DOSE NUMBER BOX WAS 22 PIXELS WIDE, which is its padding and its
      borders and no room for a digit at all. The cell is 112px and holds two
      controls, the number and the unit; that was right while the unit was a
      bare <select> about 50px wide. shared_cf_select.js then skinned every
      select in the system, and its wrapper carries width:100% INLINE with a
      normal shrink factor, where the number box is flex:1 — basis 0, so it
      is never the one that shrinks first. The wrapper took 86 of the 112.
      It overflowed the cell as well, clipping the left edge of Covers beside
      it, which is why the preset read "300" on a screen that said 800.

   2. SAVE TOOK A PRESS AND DID NOTHING VISIBLE WITH IT. The office said "I
      need to click many times only then it saved". It was not dropping the
      clicks — one click has always called saveChemEdit once. It disabled the
      pair for the length of the write and there was no `.btn:disabled` rule
      in the whole stylesheet, so a disabled Save was the same green, the
      same shadow and the same pointer as a live one. The write behind it was
      one round trip PER CHEMICAL, end to end.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_dose_box_fits_a_number.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name + '  → ' + JSON.stringify(got)); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) +
                             '\n         want ' + JSON.stringify(want)); }
}
function atLeast(name, got, floor) {
  const ok = typeof got === 'number' && got >= floor;
  if (ok) { pass++; console.log('  ok   ' + name + '  → ' + got + ' (needs ' + floor + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + got + ', needs at least ' + floor); }
}

async function boot(browser, opts) {
  const o = opts || {};
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept().catch(() => {}); });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));

  await page.addInitScript((cfg) => {
    /* Eight chemicals and three fertilisers, which is roughly the office
       list — the point of the count is that each one used to be its own
       round trip. */
    const chem = [];
    ['Cyper', 'Destroy', 'Becker'].forEach((n, i) =>
      chem.push({ id: 10 + i, kind: 'pest', name: n, dose: 60, unit: 'mL',
                  coverage: null, tag: null, sort_order: i }));
    ['Antracol', 'Dithane', 'Thiram', 'Daconil', 'Manzate'].forEach((n, i) =>
      chem.push({ id: 20 + i, kind: 'disease', name: n, dose: 50, unit: 'gm',
                  coverage: null, tag: null, sort_order: i }));
    // The Other list is a column wider than the two above it, so its dose
    // cell is sized separately and has to be asked separately.
    chem.push({ id: 30, kind: 'other', name: 'Asir', dose: 0.5, unit: 'mL',
                coverage: 1, tag: 'sticker', sort_order: 0 });
    window.__DB = {
      nops_maint_chemicals: chem,
      nops_maint_fertilisers: [
        { id: 1, name: 'NPK Blue', dose_transplant: 2.5, dose_monthly: 2.5, unit: 'gm' },
        { id: 2, name: 'Urea', dose_transplant: null, dose_monthly: 1.25, unit: 'gm' },
        { id: 3, name: 'Kieserite', dose_transplant: 0.0001, dose_monthly: null, unit: 'gm' },
      ],
      nops_maint_config: [{ key: 'pump_coverage', num_value: 800 }],
    };
    /* Every write is stamped with the moment it was sent and the moment it
       answered, so the test can SEE whether they went together or in a
       queue. The delay is what a nursery line does to each one. */
    window.__WRITES = [];
    window.__T0 = Date.now();
    window.__DELAY = cfg.delay;
    window.__THROW_ON = cfg.throwOn || null;
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };

    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select', row: null };
      const base = () => (window.__DB[table] || (window.__DB[table] = []));
      const run = async () => {
        if (st.op !== 'select') {
          const rec = { table, op: st.op, sent: Date.now() - window.__T0 };
          window.__WRITES.push(rec);
          if (window.__THROW_ON && window.__THROW_ON === st.op) {
            throw new Error('the line went');       // a THROW, not an {error}
          }
          await new Promise(r => setTimeout(r, window.__DELAY));
          rec.back = Date.now() - window.__T0;
          return { data: null, error: null };
        }
        let out = base().slice();
        st.eqs.forEach(([c, v]) => { out = out.filter(r => String(r[c]) === String(v)); });
        return st.single ? { data: out[0] || null, error: null } : { data: out, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => run().then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return run(); };
        if (p === 'upsert' || p === 'insert' || p === 'update' || p === 'delete')
          return (r) => { st.op = p; st.row = r; return q; };
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
      removeChannel: () => {},
    }) };
  }, { delay: o.delay == null ? 120 : o.delay, throwOn: o.throwOn });

  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'e@x', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`,
  }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, body: '[]' }));

  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html',
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.startChemEdit === 'function', { timeout: 20000 });
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.pn-tab')]
      .find(x => /setting/i.test(x.getAttribute('onclick') || ''));
    if (t) t.click();
  });
  await page.waitForTimeout(400);
  return { page, dialogs };
}

(async () => {
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

console.log('\n── 1. The dosage box is big enough to read a number out of ──');
{
  const { page } = await boot(browser, {});
  await page.evaluate(() => { startChemEdit(); startFertEdit(); });
  await page.waitForTimeout(350);

  const m = await page.evaluate(() => {
    const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null);
    const read = (sel) => {
      const row = document.querySelector(sel);
      if (!row) return null;
      const dose = row.querySelector('.lst-dose');
      const inp  = dose && dose.querySelector('input[type=number]');
      const wrap = dose && dose.querySelector('.cf-wrap');
      const btn  = wrap && wrap.querySelector('.cf-btn');
      /* The room for DIGITS, not the box: padding and borders show nothing.
         This is the number that was zero. */
      const cs = inp && getComputedStyle(inp);
      const text = inp ? Math.round(inp.getBoundingClientRect().width
        - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)) : null;
      return { cell: w(dose), input: w(inp), unit: w(wrap), text,
               unitH: btn ? Math.round(btn.getBoundingClientRect().height) : null,
               inputH: inp ? Math.round(inp.getBoundingClientRect().height) : null,
               overflows: dose && wrap
                 ? Math.round(wrap.getBoundingClientRect().right)
                   > Math.round(dose.getBoundingClientRect().right) + 1 : null };
    };
    return { pest: read('#chem-pest-list .lst-row'),
             other: read('#chem-other-list .lst-row'),
             fert: read('#fert-list .lst-row') };
  });

  /* 80px of tabular Outfit at 14px is about ten digits. The office asked
     for this twice — the first pass left 68 and they still could not read
     it — so the floor is set where there is no argument left. */
  atLeast('a pest dose has room for its digits', m.pest.text, 80);
  atLeast('so does a fertiliser dose, which goes to four decimals', m.fert.text, 80);
  check('the unit control is down to what gm and mL need', m.pest.unit, 52);
  /* THE OFFICE ASKED FOR IT AS A RELATIONSHIP — bigger number, smaller unit
     — so it is held as one. A rule phrased only in pixels invites the next
     person to shave the number column for something else and leave both
     numbers passing. */
  check('and the number box is the bigger of the two, by a long way',
        m.pest.input > m.pest.unit * 2, true);
  check('on the Other list too', m.other.input > m.other.unit * 2, true);
  check('and on the fertilisers', m.fert.input > m.fert.unit * 2, true);
  check('and it lines up with the boxes beside it', m.pest.unitH, m.pest.inputH);
  check('nothing hangs out of the dose cell into Covers', m.pest.overflows, false);

  /* Covers was being clipped from the left by that overflow, so the preset
     800 read as 300 on the office screen. */
  const cov = await page.evaluate(() => {
    const row = document.querySelector('#chem-pest-list .lst-row');
    const dose = row.querySelector('.lst-dose');
    const c = row.querySelectorAll('input[type=number]')[1];
    const cs = getComputedStyle(c);
    return { clear: Math.round(c.getBoundingClientRect().left)
                    >= Math.round(dose.getBoundingClientRect().right),
             text: Math.round(c.getBoundingClientRect().width
               - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
               - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth)),
             placeholder: c.placeholder };
  });
  check('the Covers box starts clear of the dose cell', cov.clear, true);
  check('and it is still showing the preset', cov.placeholder, '800');
  atLeast('with room for all four digits of it', cov.text, 44);

  await page.context().close();
}

console.log('\n── 2. A disabled Save does not look like a live one ──');
{
  const { page } = await boot(browser, { delay: 400 });
  await page.evaluate(() => startChemEdit());
  await page.waitForTimeout(300);

  const live = await page.evaluate(() => {
    const b = document.querySelector('#chem-actions .btn-primary');
    return { opacity: getComputedStyle(b).opacity, label: b.textContent.trim() };
  });
  await page.evaluate(() => { saveChemEdit(); });   // in flight — NOT returned,
  // because page.evaluate awaits a promise it is handed and this one is the
  // whole save.
  /* `.btn` carries transition:all 0.14s, so the grey is on its way rather
     than there the instant the press lands. Read it after the fade. */
  await page.waitForTimeout(220);
  const busy = await page.evaluate(() => {
    const b = document.querySelector('#chem-actions .btn-primary');
    return { opacity: getComputedStyle(b).opacity, cursor: getComputedStyle(b).cursor,
             label: b.textContent.trim(), disabled: b.disabled,
             cancelDisabled: document.querySelector('#chem-actions .btn:not(.btn-primary)').disabled };
  });
  check('it starts as a live Save', [live.label, live.opacity], ['Save', '1']);
  check('and while the write is in the air it SAYS so', busy.label, 'Saving…');
  check('greyed', busy.opacity !== '1', true);
  check('with the cursor that means no', busy.cursor, 'not-allowed');
  check('and Cancel is held too, so a half-written list cannot be abandoned',
        [busy.disabled, busy.cancelDisabled], [true, true]);

  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => {
    const b = document.querySelector('#chem-actions .btn-primary');
    return { label: b.textContent.trim(), disabled: b.disabled,
             editing: !!document.querySelector('#chem-pest-list input') };
  });
  check('and it is a live Save again once the write lands', after, { label: 'Save', disabled: false, editing: false });

  await page.context().close();
}

console.log('\n── 3. Nine chemicals is one wave, not nine round trips ──');
{
  const { page } = await boot(browser, { delay: 150 });
  await page.evaluate(() => startChemEdit());
  await page.waitForTimeout(300);
  await page.evaluate(() => saveChemEdit());
  await page.waitForTimeout(2500);

  const w = await page.evaluate(() => {
    const ups = window.__WRITES.filter(x => x.table === 'nops_maint_chemicals' && x.op === 'update');
    const sent = ups.map(x => x.sent);
    return { n: ups.length, spread: sent.length ? Math.max(...sent) - Math.min(...sent) : null };
  });
  check('every row went up', w.n, 9);
  /* Serially each one waits 150ms for the one before it, so eight of them
     span a bit over a second. Together they are sent inside a tick. */
  check('and they were sent together, not queued behind each other', w.spread < 150, true);

  await page.context().close();
}

console.log('\n── 4. A save that THROWS still gives the buttons back ──');
{
  /* The whole body used to be unguarded, so an exception anywhere in it left
     Save and Cancel disabled with nothing on screen saying why, and the only
     way out was a reload — which loses the edit.

     Every call to the database inside the save is already wrapped, so the
     throw has to be put where one is not: the redraw at the end. That is a
     real place for one — it reads the rows that just came back — and it is
     the last thing the save does, so on the previous code it leaves the pair
     dead with the list looking saved. */
  const { page } = await boot(browser, { delay: 50 });
  await page.evaluate(() => startChemEdit());
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.renderChemBoth = () => { throw new Error('something in the redraw'); };
    try { saveChemEdit(); } catch (e) {}
  });
  await page.waitForTimeout(1200);

  const out = await page.evaluate(() => {
    const b = document.querySelector('#chem-actions .btn-primary');
    const c = document.querySelector('#chem-actions .btn:not(.btn-primary)');
    return { save: b.disabled, cancel: c.disabled, label: b.textContent.trim() };
  });
  check('Save can be pressed again', out.save, false);
  check('Cancel can be pressed, so the edit is not a trap', out.cancel, false);
  check('and it reads Save, not Saving', out.label, 'Save');

  await page.context().close();
}

console.log('\n── 5. The fertiliser list does the same thing ──');
{
  const { page } = await boot(browser, { delay: 700 });
  await page.evaluate(() => startFertEdit());
  await page.waitForTimeout(300);
  await page.evaluate(() => { saveFertEdit(); });
  await page.waitForTimeout(220);                // past the .btn transition
  const busy = await page.evaluate(() => {
    const b = document.querySelector('#fert-actions .btn-primary');
    return { label: b.textContent.trim(), disabled: b.disabled,
             opacity: getComputedStyle(b).opacity };
  });
  check('its Save says Saving too', busy.label, 'Saving…');
  check('and greys', [busy.disabled, busy.opacity !== '1'], [true, true]);
  await page.waitForTimeout(3000);
  const w = await page.evaluate(() => {
    const ups = window.__WRITES.filter(x => x.table === 'nops_maint_fertilisers' && x.op === 'update');
    const sent = ups.map(x => x.sent);
    return { n: ups.length, spread: sent.length ? Math.max(...sent) - Math.min(...sent) : null,
             label: document.querySelector('#fert-actions .btn-primary').textContent.trim() };
  });
  check('all three rows went up together', [w.n, w.spread < 700], [3, true]);
  check('and the button came back', w.label, 'Save');

  await page.context().close();
}

await browser.close();
console.log('\n' + (fail ? 'FAILURES: ' + fail + ' (passed ' + pass + ')'
                         : 'all good — ' + pass + ' checks'));
process.exit(fail ? 1 : 0);
})();
