/* WORK RECORDS IS ONE CLEAN PAGE

   The office asked for the Work Records page redesigned: MJM green kept as
   the one brand colour, the three summary cards replaced by ONE slim progress
   strip, a compact toolbar, text tabs, a table whose columns sit where the
   type of what is in them says, neutral chemical labels, one size of track
   picture, and Check / Edit / Delete as icons that do exactly what the words
   did.

   This drives the real page with a month of rows in three states -- open,
   done in the field, checked and settled, one failed by the auditor and
   repaired -- and asks all of it of the screen, the figures in the strip
   against the rows they are counted from, and every icon against the
   handler it calls.

   Run with a static server on 8777 serving the repository root.
   SHOT=/dir draws the page; VW=400 draws it at phone width.            */
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
  const { page, asked } = await boot(browser);
  /* Every read is guarded and a failed read comes back as an OBJECT that
     answers anything, so on the previous page each check below fails by its
     own name instead of the harness dying on the first one. */
  const dead = (msg) => new Proxy({}, { get: (_, k) => (k === 'toJSON' ? () => msg : k === 'map' || k === 'every'
    ? () => msg : k === Symbol.iterator ? undefined : dead(msg)) });
  const ev = (fn, arg) => page.evaluate(fn, arg).catch((e) => dead('ERR: ' + String(e.message).split('\n')[0]));

  /* A month of rows, written straight into the list the page draws. */
  await ev(() => {
    const m = getMonth();
    const row = (o) => Object.assign({ tarikh: '04-11-2026', jenis: 'Penyemburan racun kulat dan serangga',
      racun: 'Round 1: Antracol 50gm + Bond 15mL', batch: '252, 253', qty: 2341, carlos: 0, gaia: 0,
      remark: '', _month: m }, o);
    records = [
      row({ id: 501, plot: 'B1', gaia: 1, checked: true, checked_by: 'elon.mjm@gmail.com' }),
      row({ id: 502, plot: 'B1', gaia: 1, racun: 'Round 2: Antracol 50gm + Bond 15mL', tarikh: '12-11-2026' }),
      row({ id: 503, plot: 'B1', tarikh: '-', racun: 'Round 3: Antracol 50gm + Bond 15mL' }),
      row({ id: 504, plot: 'B2', jenis: 'Merumput', racun: 'Round 1: Manual', qty: 900 }),
      row({ id: 505, plot: 'B2', jenis: 'Membaja', racun: 'Round 1: NPK 15:15:15', qty: 900, gaia: 1, nelos: 1, repaired: 1 }),
      row({ id: 506, plot: 'B3', jenis: 'Membaja', racun: 'Round 1: NPK 15:15:15', qty: 640, gaia: 1, nelos: 1 })
    ];
    maintAudits = { 505: 'Unsatisfactory', 506: 'Unsatisfactory' };
    renderRecords();
  });
  await page.waitForTimeout(200);

  try {
  console.log('\n1. The three cards are ONE slim strip, counted off the rows');
  const strip = await ev(() => {
    const box = document.getElementById('rec-metrics');
    const r = box.getBoundingClientRect();
    const vals = [...box.querySelectorAll('.rp-group')].map(g =>
      [...g.querySelectorAll('.rp-item .rp-val')].map(v => v.textContent).concat(g.querySelector('.rp-pct').textContent));
    return { cards: box.querySelectorAll('.metric-card').length, h: Math.round(r.height), vals,
             bars: [...box.querySelectorAll('.rp-bar > span')].map(s => s.style.width),
             fill: getComputedStyle(box.querySelector('.rp-bar > span')).backgroundColor,
             rest: getComputedStyle(box.querySelector('.rp-bar')).backgroundColor };
  });
  check('no large cards are left', strip.cards, 0);
  check('work: 6 tasks, 4 done, 2 pending, 67%', strip.vals[0], ['6', '4', '2', '67%']);
  check('repair: 2 cases, 1 repaired, 1 left, 50%', strip.vals[1], ['2', '1', '1', '50%']);
  check('the bars are filled to the same percentages', strip.bars, ['67%', '50%']);
  check('green for done, light grey for the rest', [strip.fill, strip.rest], ['rgb(13, 92, 55)', 'rgb(233, 238, 235)']);
  /* On a desk the two halves sit side by side; on a phone they stack, which
     is the right answer for a 400px screen, so the height is a desk rule. */
  if (+(process.env.VW || 1600) >= 1000) check('the strip is no taller than 90px', strip.h <= 90 ? 'ok' : strip.h, 'ok');

  } catch (e) { fail++; console.log('  FAIL '+'1. The three cards are ONE slim strip, counted off the rows'+' -- could not be asked: ' + String(e.message).split('\n')[0]); }
  try {
  console.log('\n2. A new record moves the strip on its own');
  const moved = await ev(() => {
    records.push(Object.assign({}, records[3], { id: 507, plot: 'B3', gaia: 1 }));
    renderRecords();
    return [...document.querySelectorAll('#rec-metrics .rp-work .rp-val')].map(v => v.textContent)
      .concat(document.querySelector('#rec-metrics .rp-work .rp-pct').textContent);
  });
  check('7 tasks, 5 done, 2 pending, 71%', moved, ['7', '5', '2', '71%']);
  await ev(() => { records.pop(); renderRecords(); });

  } catch (e) { fail++; console.log('  FAIL '+'2. A new record moves the strip on its own'+' -- could not be asked: ' + String(e.message).split('\n')[0]); }
  try {
  console.log('\n3. Every column sits where its type says, heading and cells alike');
  const align = await ev(() => {
    const tbl = document.querySelector('#recsec-approved .rec-table');
    const heads = [...tbl.tHead.rows[0].cells].map(th => getComputedStyle(th).textAlign.replace('start', 'left'));
    const row = [...tbl.tBodies[0].rows].find(tr => !tr.classList.contains('plot-group-row'));
    const cells = [...row.cells].map(td => getComputedStyle(td).textAlign.replace('start', 'left'));
    return { heads, cells, last: tbl.tHead.rows[0].cells[11].textContent.trim() };
  });
  const WANT = ['left','left','left','center','left','right','center','left','center','center','center','center'];
  check('the headings', align.heads, WANT);
  check('the cells under them', align.cells, WANT);
  check('the last column is headed Actions', align.last, 'Actions');

  } catch (e) { fail++; console.log('  FAIL '+'3. Every column sits where its type says, heading and cells alike'+' -- could not be asked: ' + String(e.message).split('\n')[0]); }
  try {
  console.log('\n4. One table, no vertical lines, neutral chemical labels');
  const look = await ev(() => {
    const tbl = document.querySelector('#recsec-approved .rec-table');
    const v = [...tbl.querySelectorAll('tbody td')].filter(td => {
      const s = getComputedStyle(td); return parseFloat(s.borderLeftWidth) > 0 || parseFloat(s.borderRightWidth) > 0; }).length;
    const pills = [...tbl.querySelectorAll('.pill')].map(p => { const s = getComputedStyle(p); return [s.backgroundColor, s.borderTopWidth]; });
    const grp = tbl.querySelector('.rec-group-cell'), gs = getComputedStyle(grp);
    return { v, pillKinds: [...new Set(pills.map(p => p.join('|')))], grp: [gs.backgroundColor, gs.color, Math.round(grp.getBoundingClientRect().height)],
             groupText: grp.textContent.replace(/\s+/g, ' ').trim(),
             thumbs: [...new Set([...tbl.querySelectorAll('.trk-mini')].map(s => s.getBoundingClientRect().width + 'x' + s.getBoundingClientRect().height))] };
  });
  check('no body cell draws a vertical line', look.v, 0);
  check('every chemical label is the one neutral label, with no outline', look.pillKinds, ['rgb(242, 245, 243)|0px']);
  check('the plot group is a light green band, compact', [look.grp[0], look.grp[2] <= 40], ['rgb(232, 243, 236)', true]);
  check('…and says the plot and its tasks', look.groupText, 'Plot B1 Task : 2/3');

  } catch (e) { fail++; console.log('  FAIL '+'4. One table, no vertical lines, neutral chemical labels'+' -- could not be asked: ' + String(e.message).split('\n')[0]); }
  try {
  console.log('\n5. The actions are icons, and each one is the old button');
  const acts = await ev(() => {
    const rows = [...document.querySelectorAll('#rec-body tr')].filter(tr => !tr.classList.contains('plot-group-row'));
    const of = (tr) => [...tr.cells[11].querySelectorAll('button')].map(b => ({
      label: b.getAttribute('aria-label'), title: !!b.title, svg: !!b.querySelector('svg'),
      click: b.getAttribute('onclick'), w: Math.round(b.getBoundingClientRect().width),
      colour: getComputedStyle(b).color }));
    return { open: of(rows[1]), checked: of(rows[0]),
             oneLine: rows.every(tr => { const bs = [...tr.cells[11].querySelectorAll('button')];
               return bs.every(b => Math.abs(b.getBoundingClientRect().top - bs[0].getBoundingClientRect().top) < 2); }) };
  });
  check('an open row offers three icon buttons', acts.open.map(a => a.label), ['✓ Check', 'Edit', 'Del']);
  check('…each an icon with a tooltip', acts.open.map(a => a.svg && a.title), [true, true, true]);
  check('…calling the same three handlers', acts.open.map(a => String(a.click).replace(/\(\d+\)/, '()')),
        ['toggleChecked()', 'editRec()', 'deleteRec()']);
  check('…one size', Array.isArray(acts.open) ? [...new Set(acts.open.map(a => a.w))] : acts.open, [30]);
  check('…green, grey and red', acts.open.map(a => a.colour), ['rgb(13, 92, 55)', 'rgb(86, 99, 92)', 'rgb(192, 57, 43)']);
  check('a checked row offers Uncheck and nothing else', acts.checked.map(a => a.label), ['Uncheck']);
  check('the buttons of every row sit on one line', acts.oneLine, true);

  } catch (e) { fail++; console.log('  FAIL '+'5. The actions are icons, and each one is the old button'+' -- could not be asked: ' + String(e.message).split('\n')[0]); }
  try {
  console.log('\n6. Pressing them still does what the words did');
  asked.length = 0;
  const del = await ev(() => { const b = document.querySelector('#rec-body tr:not(.plot-group-row) + tr button[aria-label="Del"]')
    || [...document.querySelectorAll('#rec-body button[aria-label="Del"]')][0]; b.click(); return true; });
  await page.waitForTimeout(200);
  check('Delete still asks to confirm first', asked.length > 0 && /delete/i.test(asked[0]), true);
  const chk = await ev(() => {
    const b = [...document.querySelectorAll('#rec-body button[aria-label="✓ Check"]')][0];
    const id = +b.getAttribute('onclick').match(/\d+/)[0];
    b.click();
    return new Promise(r => setTimeout(() => r(!!records.find(x => x.id === id).checked), 300));
  });
  check('Check still checks the row', chk, true);

  } catch (e) { fail++; console.log('  FAIL '+'6. Pressing them still does what the words did'+' -- could not be asked: ' + String(e.message).split('\n')[0]); }
  try {
  console.log('\n7. Approved / Rejected are text tabs with a green underline');
  const tabs = await ev(() => {
    const a = document.getElementById('recsec-btn-approved'), s = getComputedStyle(a);
    const r = getComputedStyle(document.getElementById('recsec-btn-rejected'));
    return [s.backgroundColor, s.color, s.boxShadow.includes('rgb(13, 92, 55)'), r.color];
  });
  check('active: no fill, green text and underline; idle: grey', tabs, ['rgba(0, 0, 0, 0)', 'rgb(13, 92, 55)', true, 'rgb(107, 122, 114)']);

  } catch (e) { fail++; console.log('  FAIL '+'7. Approved / Rejected are text tabs with a green underline'+' -- could not be asked: ' + String(e.message).split('\n')[0]); }
  try {
  console.log('\n8. The toolbar and the head are one control height');
  const hs = await ev(() => [...new Set([...document.querySelectorAll('#recview-list .toolbar .cf-btn, #recview-list .toolbar input.filter-sel, #recview-list .toolbar .btn-ico, .sm-head .sm-month-btn, .sm-head .sched-step')]
    .filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height)))]);
  check('every control is 34px tall', hs, [34]);

  } catch (e) { fail++; console.log('  FAIL '+'8. The toolbar and the head are one control height'+' -- could not be asked: ' + String(e.message).split('\n')[0]); }
  if (SHOT) { await ev(() => { window.scrollTo(0, 0); }); await page.screenshot({ path: SHOT + '/work_records.png', fullPage: false }); }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
