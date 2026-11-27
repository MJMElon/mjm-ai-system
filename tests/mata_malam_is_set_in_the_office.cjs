/* MATA MALAM IS SET IN THE OFFICE.

   Mata Malam (the night check-in app) had a Settings screen of its own:
   the task timing, each location's own check-in times, and where each
   location is pinned on a map. A guard does the check-ins and changes none
   of that, so the office asked for the whole of it moved here, onto System
   Setting beside Portal View & Function. The app has no Settings screen now
   and follows this card on its next sync.

   What this holds: the card reads the one settings row, shows every location
   of the nursery register with its own times, can add, remove and change a
   time, can place a pin by clicking the map with the stored boundaries
   behind it, and saves ONE row in the shape the app already reads. And that
   a bad answer is refused before anything is written.

   Run: node tests/mata_malam_is_set_in_the_office.cjs
   with `python3 -m http.server 8779` serving the repository root.
   Leaflet is read from LEAFLET_DIST (a leaflet/dist folder) where there is
   one; without it the map checks are named as not asked rather than passed. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

const LEAFLET = [process.env.LEAFLET_DIST, '/home/user/FC-Portal/node_modules/leaflet/dist',
                 path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist')].find(d => d && fs.existsSync(path.join(d, 'leaflet.js')));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const box = (w, s, e, n) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
  geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }] });

function mock(page, fixture) {
  return page.addInitScript((fx) => {
    const SESSION = { user: { id: 'u1', email: 'ruth@mjmnursery.com', user_metadata: { full_name: 'Ruth Wong' } } };
    window.__writes = [];
    const rows = (table) => table === 'shared_profiles'
      ? { full_name: 'Ruth Wong', email: 'ruth@mjmnursery.com', permissions: { modules: { scan: 'admin' }, manage_users: true } }
      : (fx[table] || []);
    function chain(table) {
      let one = false, write = null;
      const result = () => {
        if (write) {
          if (fx.refuseWrite) return { data: null, error: { message: fx.refuseWrite } };
          window.__writes.push({ table, row: write });
          if (table === 'mata_malam_settings') fx.mata_malam_settings = [write];
          return { data: null, error: null };
        }
        if (fx.refuse && fx.refuse.includes(table)) return { data: null, error: { message: 'relation does not exist' } };
        const r = rows(table);
        return { data: one ? (Array.isArray(r) ? (r[0] || null) : r) : r, error: null };
      };
      const self = {
        select() { return self; }, eq() { return self; }, or() { return self; }, neq() { return self; },
        order() { return self; }, limit() { return self; }, in() { return self; }, gt() { return self; },
        gte() { return self; }, lte() { return self; },
        single() { one = true; return self; },
        maybeSingle() { one = true; return Promise.resolve(result()); },
        upsert(row) { write = row; return self; }, insert(row) { write = row; return self; },
        update(row) { write = row; return self; }, delete() { write = { deleted: true }; return self; },
        then(a, b) { return Promise.resolve(result()).then(a, b); },
      };
      return self;
    }
    window.supabase = { createClient: () => ({
      from: (t) => chain(t),
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getSession: async () => ({ data: { session: SESSION }, error: null }),
              getUser: async () => ({ data: { user: SESSION.user }, error: null }),
              onAuthStateChange: (cb) => { setTimeout(() => { try { cb('INITIAL_SESSION', SESSION); } catch (e) {} }, 0);
                                            return { data: { subscription: { unsubscribe() {} } } }; },
              signOut: async () => ({ error: null }) },
      storage: { from: () => ({ upload: async () => ({ data: {}, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {},
    }) };
  }, fixture);
}

async function open(browser, fixture) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await mock(page, fixture);
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('https://tile.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('https://unpkg.com/**', r => {
    const u = r.request().url();
    if (!LEAFLET) return r.abort();
    r.fulfill({ status: 200, contentType: u.endsWith('.css') ? 'text/css' : 'application/javascript',
                headers: { 'access-control-allow-origin': '*' },
                body: fs.readFileSync(path.join(LEAFLET, u.endsWith('.css') ? 'leaflet.css' : 'leaflet.js')) });
  });
  await page.goto('http://localhost:8779/scan/scan_system_setting.html', { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(1200);
  return { page, errors };
}

const NURSERIES = [{ name: 'BNN' }, { name: 'UNN 2' }, { name: 'UNN 1' }, { name: 'PN' }, { name: 'UNE' }];
const BOUNDS = [
  { nursery: 'BNN',  geojson: box(113.77761, 3.7369647, 113.7809224, 3.7397372), bbox: [113.77761, 3.7369647, 113.7809224, 3.7397372], source_name: 'bnn.kml', format: 'kml', point_count: 5 },
  { nursery: 'UNN1', geojson: box(113.7802813, 3.7242332, 113.7862919, 3.7288992), bbox: [113.7802813, 3.7242332, 113.7862919, 3.7288992], source_name: 'unn1.kml', format: 'kml', point_count: 5 },
];
const locs = (page) => page.$$eval('#mm-locs .mm-loc', els => els.map(e => ({
  name: e.querySelector('.mm-loc-name').textContent.trim(),
  on: e.querySelector('input[type=checkbox]').checked,
  times: [...e.querySelectorAll('.mm-time')].map(t => t.querySelector('.mm-hh').value + ':' + t.querySelector('.mm-mi').value) }))).catch(() => 'no Mata Malam card');

(async () => {
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

console.log('\n── 1. Nothing saved yet: the card opens on the starting times ──');
{
  const { page, errors } = await open(browser, { operation_nurseries: NURSERIES, shared_site_boundary: BOUNDS, mata_malam_settings: [] });
  const order = await page.$$eval('#main > .card .card-name', e => e.map(x => x.textContent.trim())).catch(() => []);
  check('the card sits straight after Portal View & Function', order.slice(0, 4), ['Location', 'Portal View & Function', 'Mata Malam', 'Boundary']);
  const l = await locs(page);
  check('every location of the register, main nursery first', Array.isArray(l) ? l.map(x => x.name + ':' + x.on) : l,
        ['BNN:true', 'UNN 1:true', 'UNN 2:true', 'PN:false', 'UNE:false']);
  check('each one that is on starts on the five times', Array.isArray(l) && l[0].times, ['18:00', '21:00', '00:00', '03:00', '06:00']);
  check('one that is off shows no times', Array.isArray(l) && l[3].times, []);
  check('timing starts at 15 and 60', [await page.inputValue('#mm-opens').catch(() => ''), await page.inputValue('#mm-window').catch(() => '')], ['15', '60']);
  checkTrue('and it says nothing has been saved yet', /Nothing has been saved yet/.test(await page.textContent('#mm-note').catch(() => '')));
  check('opening the card wrote nothing', await page.evaluate(() => window.__writes.length), 0);

  console.log('\n── 2. Add a time, remove times, change one, and save ──');
  await page.locator('#mm-locs .mm-loc').nth(1).locator('.mm-add').click().catch(() => {});
  check('Add time adds a sixth, and it is BLANK', ((await locs(page))[1] || {}).times, ['18:00', '21:00', '00:00', '03:00', '06:00', ':']);
  check('the blank one reads --:-- and is marked',
        await page.locator('#mm-locs .mm-loc').nth(1).locator('.mm-time').nth(5).evaluate(e => [e.classList.contains('blank'), e.querySelector('.mm-hh').selectedOptions[0].textContent, e.querySelector('.mm-mi').selectedOptions[0].textContent]).catch(() => ''), [true, '--', '--']);
  await page.locator('#mm-locs .mm-loc').nth(1).locator('.mm-add').click().catch(() => {});
  check('a second press adds no second blank', (((await locs(page))[1] || {}).times || []).length, 6);
  await page.click('#mm-save').catch(() => {});
  checkTrue('a blank time is refused at Save, by name', /still blank/.test(await page.textContent('#mm-status').catch(() => '')));
  check('and nothing was written', await page.evaluate(() => window.__writes.length), 0);
  await page.locator('#mm-locs .mm-loc').nth(1).locator('.mm-hh').nth(5).selectOption('07').catch(() => {});
  await page.locator('#mm-locs .mm-loc').nth(1).locator('.mm-mi').nth(5).selectOption('00').catch(() => {});
  check('picked, it is an ordinary time with no -- left',
        await page.locator('#mm-locs .mm-loc').nth(1).locator('.mm-time').nth(5).evaluate(e => [e.classList.contains('blank'), e.querySelector('.mm-hh').options.length, e.querySelector('.mm-hh').value + ':' + e.querySelector('.mm-mi').value]).catch(() => ''), [false, 24, '07:00']);
  for (let i = 0; i < 5; i++) await page.locator('#mm-locs .mm-loc').nth(1).locator('.mm-x').first().click().catch(() => {});
  check('times can be taken away down to one', ((await locs(page))[1] || {}).times, ['07:00']);
  checkTrue('and the last one cannot be removed', await page.locator('#mm-locs .mm-loc').nth(1).locator('.mm-x').first().isDisabled().catch(() => false));
  await page.locator('#mm-locs .mm-loc').nth(1).locator('.mm-hh').first().selectOption('19').catch(() => {});
  await page.locator('#mm-locs .mm-loc').nth(1).locator('.mm-mi').first().selectOption('30').catch(() => {});
  check('a time reads in 24-hour figures, whatever the machine clock is set to',
        await page.locator('#mm-locs .mm-loc').nth(0).locator('.mm-time').first().evaluate(e => e.textContent.replace(/\s+/g, '').slice(0, 6)).catch(() => ''), '000102');
  check('and the hour list runs 00 to 23',
        await page.locator('#mm-locs .mm-loc').nth(0).locator('.mm-hh').first().evaluate(e => [e.options.length, e.options[0].value, e.options[23].value, e.value]).catch(() => ''), [24, '00', '23', '18']);
  await page.locator('#mm-locs .mm-loc').nth(4).locator('input[type=checkbox]').check().catch(() => {});
  await page.fill('#mm-opens', '10').catch(() => {});
  check('nothing is written until Save', await page.evaluate(() => window.__writes.length), 0);

  if (LEAFLET) {
    console.log('\n── 3. The map: boundaries behind, and as many pins as are clicked ──');
    const m = await page.evaluate(() => ({ outlines: document.querySelectorAll('#mm-map .leaflet-overlay-pane svg path').length,
      interactive: document.querySelectorAll('#mm-map path.leaflet-interactive').length,
      chips: [...document.querySelectorAll('#mm-pins .mm-pin')].map(b => b.childNodes[0].textContent.trim()),
      sel: (document.querySelector('#mm-pins .mm-pin.on') || { childNodes: [{ textContent: '' }] }).childNodes[0].textContent.trim() }));
    check('the two stored boundaries are drawn, and cannot swallow a click', [m.outlines, m.interactive], [2, 0]);
    check('a chip for every location that is on, the first selected', [m.chips, m.sel], [['BNN', 'UNN 1', 'UNN 2', 'UNE'], 'BNN']);
    await page.evaluate(() => mmPick('BNN')); await page.waitForTimeout(500);
    await page.locator('#mm-map').scrollIntoViewIfNeeded();
    const b = await page.locator('#mm-map').boundingBox();
    const inBNN = (p) => p && p.lng > 113.77761 && p.lng < 113.7809224 && p.lat > 3.7369647 && p.lat < 3.7397372;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250);
    await page.mouse.click(b.x + b.width / 2 + 40, b.y + b.height / 2 - 30); await page.waitForTimeout(250);
    await page.mouse.click(b.x + b.width / 2 - 50, b.y + b.height / 2 + 35); await page.waitForTimeout(250);
    let pins = await page.evaluate(() => mm.pins);
    check('three clicks are THREE pins for BNN, each named', pins.map(p => p.location + '|' + p.name), ['BNN|BNN Pin 1', 'BNN|BNN Pin 2', 'BNN|BNN Pin 3']);
    checkTrue('each where it was clicked, inside the BNN boundary', pins.length === 3 && pins.every(inBNN) && new Set(pins.map(p => p.lat + ',' + p.lng)).size === 3);
    check('the chip counts them', await page.$eval('#mm-pins .mm-pin.on small', e => e.textContent), '3 pins');
    check('and each has a row in the list', await page.$$eval('#mm-pin-list .mm-pin-row', e => e.length), 3);
    // another location takes pins of its own
    await page.evaluate(() => mmPick('UNN1')); await page.waitForTimeout(500);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250);
    pins = await page.evaluate(() => mm.pins);
    check('a click with UNN 1 selected adds a UNN 1 pin and leaves BNN its three', pins.map(p => p.location), ['BNN', 'BNN', 'BNN', 'UNN1']);
    check('with UNN 1 picked, the list shows only UNN 1 pins', await page.$$eval('#mm-pin-list .mm-pin-name', e => e.map(x => x.value)), ['UNN 1 Pin 1']);
    await page.evaluate(() => mmPick('BNN')); await page.waitForTimeout(300);
    check('and with BNN picked, only the three of BNN', await page.$$eval('#mm-pin-list .mm-pin-row', e => e.length), 3);
    // rename one, remove one
    await page.locator('#mm-pin-list .mm-pin-row').nth(0).locator('.mm-pin-name').fill('Main Gate');
    await page.locator('#mm-pin-list .mm-pin-row').nth(1).locator('.mm-x').click(); await page.waitForTimeout(200);
    pins = await page.evaluate(() => mm.pins);
    check('a pin is renamed in the list, and one is removed by its own cross', pins.map(p => p.name), ['Main Gate', 'BNN Pin 3', 'UNN 1 Pin 1']);
    check('the name on the map follows, as the hover of the pin', await page.$$eval('#mm-map .mm-pin-mark .mm-pin-ic', e => e.map(x => x.title)), ['Main Gate', 'BNN Pin 3', 'UNN 1 Pin 1']);
    check('a pin on the map is an icon with its number in its own location, not its name', await page.$$eval('#mm-map .mm-pin-mark', e => e.map(x => x.textContent.trim())), ['1', '2', '1']);
    check('and the list carries the same number', await page.$$eval('#mm-pin-list .mm-pin-go', e => e.map(x => x.textContent.trim())), ['1', '2']);
    await page.locator('#mm-locs').scrollIntoViewIfNeeded();
  } else {
    fail++; console.log('  FAIL the map checks were NOT ASKED: no leaflet/dist found (set LEAFLET_DIST)');
  }

  console.log('\n── 4. Save writes ONE row, in the shape the app reads ──');
  check('the capture distance opens on 3 m and the shortest track on 0, what the phones did before',
        [await page.inputValue('#mm-pin-range').catch(() => 'missing'), await page.inputValue('#mm-min-track').catch(() => 'missing')], ['3', '0']);
  await page.fill('#mm-pin-range', '5').catch(() => {});
  await page.fill('#mm-min-track', '20').catch(() => {});
  check('History shows opens on 7 days, what the phones always showed', await page.inputValue('#mm-history-days').catch(() => 'missing'), '7');
  await page.fill('#mm-history-days', '14').catch(() => {});
  await page.click('#mm-save').catch(() => {}); await page.waitForTimeout(600);
  const w = await page.evaluate(() => window.__writes);
  check('one write, to mata_malam_settings row 1', w.map(x => [x.table, x.row.id]), [['mata_malam_settings', 1]]);
  const st = (w[0] || { row: {} }).row.settings || {};
  check('UNN1 carries its own time, BNN keeps five', [(st.locations || {}).UNN1, ((st.locations || {}).BNN || {}).slots],
        [{ active: true, slots: ['19:30'] }, ['18:00', '21:00', '00:00', '03:00', '06:00']]);
  check('every location is stored with its switch', Object.entries(st.locations || {}).map(([k, v]) => k + ':' + v.active), ['BNN:true', 'UNN1:true', 'UNN2:true', 'PN:false', 'UNE:true']);
  check('the timing, with the capture distance and the shortest track', st.timing, { opensBeforeMinutes: 10, windowMinutes: 60, pinRangeMeters: 5, minTrackMeters: 20, historyDays: 14 });
  if (LEAFLET) check('and the pins as a list, each with its name and location', (st.pins || []).map(p => p.location + '|' + p.name + '|' + (Number.isFinite(p.lat) && Number.isFinite(p.lng))), ['BNN|Main Gate|true', 'BNN|BNN Pin 3|true', 'UNN1|UNN 1 Pin 1|true']);
  check('signed with who saved it', (w[0] || { row: {} }).row.updated_by, 'ruth@mjmnursery.com');
  checkTrue('the card says it is saved and the phones follow', /Saved\. The phones follow/.test(await page.textContent('#mm-status').catch(() => '')));
  check('reading it back shows what was saved', ((await locs(page))[1] || {}).times, ['19:30']);

  console.log('\n── 5. A bad answer is refused before anything is written ──');
  const before = await page.evaluate(() => window.__writes.length);
  await page.fill('#mm-window', '5').catch(() => {});
  await page.click('#mm-save').catch(() => {}); await page.waitForTimeout(200);
  checkTrue('a time limit no longer than Appears early is refused', /longer than Appears early/.test(await page.textContent('#mm-status').catch(() => '')));
  await page.fill('#mm-window', '60').catch(() => {});
  await page.fill('#mm-pin-range', '0').catch(() => {});
  await page.click('#mm-save').catch(() => {}); await page.waitForTimeout(200);
  checkTrue('a capture distance of 0 m is refused', /Capture photo within must be/.test(await page.textContent('#mm-status').catch(() => '')));
  await page.fill('#mm-pin-range', '5').catch(() => {});
  await page.locator('#mm-locs .mm-loc').nth(0).locator('.mm-hh').nth(1).selectOption('18').catch(() => {});
  await page.click('#mm-save').catch(() => {}); await page.waitForTimeout(200);
  checkTrue('the same time twice on one location is refused, naming it', /BNN has the same time twice/.test(await page.textContent('#mm-status').catch(() => '')));
  check('and neither reached the database', await page.evaluate(() => window.__writes.length), before);
  check('no page errors', errors, []);
  if (process.env.SHOT) { await page.locator('#mm-card').screenshot({ path: process.env.SHOT }).catch(() => {}); }
  await page.close();
}

console.log('\n── 6. Saved settings are what the card opens on ──');
{
  const saved = { id: 1, updated_at: '2026-11-18T03:04:00Z', updated_by: 'ruth@mjmnursery.com', settings: {
    locations: { BNN: { active: false, slots: ['20:00'] }, UNN1: { active: true, slots: ['02:00', '19:00'] } },
    timing: { opensBeforeMinutes: 30, windowMinutes: 90 }, pins: [{ name: 'Store', location: 'UNN1', lat: 3.7265, lng: 113.7832 }, { name: 'Pump', location: 'UNN1', lat: 3.7270, lng: 113.7840 }, { name: 'Ghost', location: 'NOWHERE', lat: 1, lng: 1 }] } };
  const { page } = await open(browser, { operation_nurseries: NURSERIES, shared_site_boundary: BOUNDS, mata_malam_settings: [saved] });
  const l = await locs(page);
  check('BNN is off as saved, UNN1 has its two times in night order', Array.isArray(l) ? [l[0].on, l[1].times] : l, [false, ['19:00', '02:00']]);
  check('a location the saved row does not name follows the default', Array.isArray(l) ? [l[2].on, l[2].times.length, l[3].on] : l, [true, 5, false]);
  check('the timing as saved', [await page.inputValue('#mm-opens').catch(() => ''), await page.inputValue('#mm-window').catch(() => '')], ['30', '90']);
  check('the saved pins open as a list, and one for a location that no longer exists is left out',
        await page.$$eval('#mm-pin-list .mm-pin-name', e => e.map(x => x.value)).catch(() => []), ['Store', 'Pump']);
  checkTrue('and it says who saved it and when', /Last saved 2026-11-18 03:04 by ruth@mjmnursery.com/.test(await page.textContent('#mm-note').catch(() => '')));
  await page.close();
}

console.log('\n── 6b. A row saved while a location had ONE pin still opens with it ──');
{
  const saved = { id: 1, updated_at: '2026-11-18T03:04:00Z', settings: { pins: { BNN: [3.7383, 113.7792] } } };
  const { page } = await open(browser, { operation_nurseries: NURSERIES, shared_site_boundary: BOUNDS, mata_malam_settings: [saved] });
  check('the old shape is read as one pin for that location', await page.evaluate(() => (typeof mm === 'object' && mm ? mm.pins : 'no mm')).catch(() => 'no mm'),
        [{ name: 'BNN', location: 'BNN', lat: 3.7383, lng: 113.7792 }]);
  await page.close();
}

console.log('\n── 7. A database without the table says so, and the rest of the page stands ──');
{
  const { page, errors } = await open(browser, { operation_nurseries: NURSERIES, shared_site_boundary: BOUNDS, refuse: ['mata_malam_settings'] });
  checkTrue('the card names the file to run', /RUN_ME_mata_malam\.sql/.test(await page.textContent('#mm-note').catch(() => '')));
  checkTrue('Save is shut', await page.locator('#mm-save').isDisabled().catch(() => false));
  checkTrue('the Location card above still drew', (await page.textContent('#n-list').catch(() => '')).length > 20);
  check('no page errors', errors, []);
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
