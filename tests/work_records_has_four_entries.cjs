/* WORK RECORDS HAS FOUR ENTRIES

   The office, over the side bar: "help me add Monthly Night Watchman Record
   and Monthly Watering Record under Work records there. and change the
   monthly records name to Monthly Maintenance Record" -- and Monthly
   Performance to Monthly Maintenance Performance, once asked which.

   What the two new records HOLD was asked too, and the answer was "menu
   entry only for now". So this holds exactly that and no more:

     - four entries under Work Records, in this order, under these names;
     - the two old ones kept their KEYS (list / chart) -- only the words
       moved, so every link, test and handler that names them still works;
     - the night watchman entry is the Mata Malam report, moved off the phone
       (section 2b drives it off a night of check-ins); the watering entry
       SAYS it is not set up yet and draws no table, no box and no button -- a sheet of invented columns is a
       record somebody would start keying into;
     - pressing one lights it and un-lights the other three, and coming back
       to the maintenance record brings the list back;
     - opening either writes nothing;
     - the Malay names move with the language.

   It serves the repository itself. SHOT=/dir draws the three views.
   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/work_records_has_four_entries.cjs */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const SHOT = process.env.SHOT || '';
const PORT = 8793;
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

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

  await page.goto('http://localhost:' + PORT + '/nursery_ops/nursery_ops_maintenance.html',
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.autoSyncRecords === 'function'
                                && typeof window._scheduleTicksFor === 'function',
                             { timeout: 20000 });
  await page.click('.pn-tab[onclick*="\'record\'"]');
  await page.waitForSelector('#recview-list', { state: 'visible', timeout: 10000 });
  return { page, asked };
}



(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page } = await boot(browser);
  let pageErrors = 0;
  page.on('pageerror', () => { pageErrors++; });

  /* The Work Records bar is found THROUGH one of its own buttons, never by
     .pn-sub: there are two of those bars on this page. textContent, not
     innerText, so a stylesheet cannot change the answer. */
  const entries = () => page.evaluate(() => {
    const b = document.getElementById('pn-subtab-list');
    const box = b && b.closest('.pn-sub');
    if (!box) return [];
    return [...box.querySelectorAll('.pn-subtab')].map((x) => ({
      id: x.id, label: x.textContent.trim(), on: x.classList.contains('active') }));
  });
  /* Every read answers something for a view that is not there, so on the
     previous page each check fails by NAME instead of the file dying. */
  const view = (k) => page.evaluate((key) => {
    const el = document.getElementById('recview-' + key);
    if (!el) return { there: false };
    return { there: true,
             shown: getComputedStyle(el).display !== 'none',
             text: el.textContent.replace(/\s+/g, ' ').trim(),
             tables: el.querySelectorAll('table').length,
             controls: el.querySelectorAll('input,select,textarea,button').length };
  }, k);
  const press = (id) => page.evaluate((i) => {
    const b = document.getElementById(i); if (!b) return 'no such entry'; b.click(); return 'pressed';
  }, id);

  /* ── 1. the four entries, and their names ───────────────────────── */
  console.log('\nFour entries under Work Records');
  let E = await entries();
  check('there are four, in this order', E.map((e) => e.label),
        ['Monthly Maintenance Record', 'Monthly Maintenance Performance',
         'Monthly Night Watchman Record', 'Monthly Watering Record']);
  check('the two old ones kept their keys', E.slice(0, 2).map((e) => e.id),
        ['pn-subtab-list', 'pn-subtab-chart']);
  check('the page opens on the maintenance record', E.filter((e) => e.on).map((e) => e.id),
        ['pn-subtab-list']);

  /* ── 2. Night Watchman ──────────────────────────────────────────── */
  console.log('\nMonthly Night Watchman Record');
  /* The page saves its own synced rows about a second after it opens, with
     nothing pressed -- so the count is taken once that has landed, or this
     would blame the two views for the page's own startup save. */
  await page.waitForTimeout(2500);
  const writesBefore = await page.evaluate(() => window.__WRITES.length);
  check('the entry can be pressed', await press('pn-subtab-watchman'), 'pressed');
  await page.waitForTimeout(300);
  E = await entries();
  check('it is the ONE entry lit', E.filter((e) => e.on).map((e) => e.id), ['pn-subtab-watchman']);
  let V = await view('watchman');
  check('its view is on screen', V.shown, true);
  check('and the maintenance list is not', (await view('list')).shown, false);
  check('it names itself', /Monthly Night Watchman Record/.test(V.text || ''), true);
  /* It is the Mata Malam report now (watchman_report.js). With nothing ever
     checked in, it says so in words rather than drawing an empty table. */
  check('with nothing recorded it says there is nothing to report', /No nights to report/i.test(V.text || ''), true);
  check('with no table and nothing to key into', [V.tables, V.controls], [0, 0]);

  /* ── 2b. the report, off a night of check-ins ─────────────────── */
  console.log('\nThe Mata Malam report');
  const R = await page.evaluate(async () => {
    // BNN: two times, two pins. The 20th has every pin at both times; the 21st
    // misses one pin at 21:00, which is a time not done and a night not complete.
    window.__DB.mata_malam_settings = [{ id: 1, settings: {
      locations: { BNN: { active: true, slots: ['18:00', '21:00'] } },
      timing: { opensBeforeMinutes: 15, windowMinutes: 60 },
      pins: [{ name: 'Gate', location: 'BNN', lat: 1, lng: 1 }, { name: 'Store', location: 'BNN', lat: 1, lng: 1 }] } }];
    const L = (d, slot, point, who) => ({ location: 'BNN', point, shift_date: d, slot, status: 'completed', worker_name: who });
    window.__DB.mata_malam_logs = [
      L('2026-11-20', '6pm', 'Gate', 'Siti'), L('2026-11-20', '6pm', 'Store', 'Siti'),
      L('2026-11-20', '9pm', 'Gate', 'Ali'), L('2026-11-20', '9pm', 'Store', 'Ali'),
      L('2026-11-21', '6pm', 'Gate', 'Siti'), L('2026-11-21', '6pm', 'Store', 'Siti'),
      L('2026-11-21', '9pm', 'Gate', 'Siti'),
      { location: 'UNN1', point: '', shift_date: '2026-11-21', slot: '6pm', status: 'completed', worker_name: 'Other' }
    ];
    document.getElementById('global-month').value = '2026-11';
    await renderWatchman();
    const rows = [...document.querySelectorAll('#recview-watchman tbody tr')];
    const pick = (d) => { const r = rows.find((x) => x.cells[0].textContent.trim() === d);
      return r ? [...r.cells].map((c) => c.textContent.replace(/\s+/g, ' ').trim()) : null; };
    return { first: rows[0] && rows[0].cells[0].textContent.trim(), last: rows.length && rows[rows.length - 1].cells[0].textContent.trim(),
             d20: pick('2026-11-20'), d21: pick('2026-11-21'),
             sum: (document.querySelector('#recview-watchman .wm-sum') || {}).textContent,
             print: !!document.querySelector('#recview-watchman .wm-print') };
  });
  check('it starts at the first night anybody checked in', R.last, '2026-11-20');
  check('and opens on the newest night', R.first > '2026-11-21', true);
  check('a night with every pin at every time is Completed',
        R.d20 && [R.d20[2], R.d20[3], R.d20[4]], ['2 / 2', 'Completed', 'Siti, Ali']);
  check('a pin missed at one time makes the night Not Completed',
        R.d21 && [R.d21[1], R.d21[2], R.d21[3]], ['✓ 18:00✕ 21:00', '1 / 2', 'Not Completed']);
  check('another location is not in this nursery report', R.d21 && /Other/.test(R.d21[4]), false);
  check('the summary counts the nights that are over', /^BNN 1 \/ \d+ nights complete$/.test((R.sum || '').trim()), true);
  check('and it can be printed', R.print, true);
  if (SHOT) await page.screenshot({ path: path.join(SHOT, 'watchman_report.png') });
  if (SHOT) await page.screenshot({ path: path.join(SHOT, 'watchman.png') });

  /* ── 3. Watering ────────────────────────────────────────────────── */
  console.log('\nMonthly Watering Record');
  check('the entry can be pressed', await press('pn-subtab-watering'), 'pressed');
  await page.waitForTimeout(300);
  E = await entries();
  check('it is the ONE entry lit', E.filter((e) => e.on).map((e) => e.id), ['pn-subtab-watering']);
  V = await view('watering');
  check('its view is on screen', V.shown, true);
  check('and the night watchman one has gone', (await view('watchman')).shown, false);
  check('it names itself', /Monthly Watering Record/.test(V.text || ''), true);
  check('and says it is not set up yet', /not set up yet/i.test(V.text || ''), true);
  check('with no table and nothing to key into', [V.tables, V.controls], [0, 0]);
  check('opening the two wrote nothing (the report only reads)',
        await page.evaluate(() => window.__WRITES.length), writesBefore);
  if (SHOT) await page.screenshot({ path: path.join(SHOT, 'watering.png') });

  /* ── 4. and back ────────────────────────────────────────────────── */
  console.log('\nThe two that were there still work');
  await press('pn-subtab-chart');
  await page.waitForTimeout(300);
  E = await entries();
  check('Monthly Maintenance Performance lights alone',
        E.filter((e) => e.on).map((e) => e.id), ['pn-subtab-chart']);
  check('and shows the performance view', (await view('chart')).shown, true);
  check('with neither new view left standing',
        [(await view('watchman')).shown, (await view('watering')).shown], [false, false]);
  await press('pn-subtab-list');
  await page.waitForTimeout(300);
  E = await entries();
  check('Monthly Maintenance Record lights alone',
        E.filter((e) => e.on).map((e) => e.id), ['pn-subtab-list']);
  check('and the list is back', (await view('list')).shown, true);
  if (SHOT) await page.screenshot({ path: path.join(SHOT, 'list.png') });

  /* ── 5. the Malay names move with the language ──────────────────── */
  console.log('\nIn Malay');
  await page.evaluate(() => { if (typeof setLang === 'function') setLang('bm'); });
  await page.waitForTimeout(300);
  E = await entries();
  check('all four are named', E.map((e) => e.label),
        ['Rekod Penyelenggaraan Bulanan', 'Prestasi Penyelenggaraan Bulanan',
         'Rekod Jaga Malam Bulanan', 'Rekod Penyiraman Bulanan']);
  await press('pn-subtab-watering');
  await page.waitForTimeout(200);
  check('and the empty view speaks Malay too',
        /Rekod Penyiraman Bulanan/.test((await view('watering')).text || '')
        && /belum disediakan/.test((await view('watering')).text || ''), true);
  await page.evaluate(() => { if (typeof setLang === 'function') setLang('en'); });

  check('no page errors', pageErrors, 0);

  await browser.close();
  server.close();
  console.log('');
  console.log(fail ? fail + ' FAILED  (' + pass + ' ok)' : 'all good  (' + pass + ' ok)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
