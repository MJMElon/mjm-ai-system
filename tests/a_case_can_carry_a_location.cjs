/* A NELOS CASE CAN CARRY A LOCATION, AND IT IS OPTIONAL.

   The office: "help me add location coordinate in nelos case form. and
   this is optional. make it can auto detect the location, and can manual
   key in location."

   One box that takes "latitude, longitude" and a Detect button that fills
   it from the device. Three rules, and this file is what holds them:

     1. EMPTY IS ALLOWED. A case with no location is saved exactly as it
        was before, naming neither column.
     2. A WRONG ONE IS NOT. Something typed that is not two numbers in
        range is refused BEFORE anything is sent, by name.
     3. THE BOX IS NOT DRAWN UNTIL THE DATABASE HAS THE COLUMNS
        (shared/RUN_ME_nelos_case_location.sql). Naming a column a table
        has not got is the whole insert refused, so a box that took a
        coordinate there would lose the case over it.

   FOUR COPIES OF ONE PARSER, in three repositories: the dock, MJMNelos,
   and src/lib/latLng.js in Barcode_Counter and in Mobile. Section 5 runs
   all of them over the same inputs.

   Run: node tests/a_case_can_carry_a_location.cjs
   Needs Playwright and the Chromium at /opt/pw-browsers/chromium. It
   serves the repository itself, so nothing has to be started first.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8783;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name + '  → ' + JSON.stringify(got)); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) +
                             '\n         want ' + JSON.stringify(want)); }
}

const CATEGORIES = [
  { name: 'Repair Maintenance Work', module_key: 'scan', raise_modules: ['scan'],
    pic_seat_no: null, pic_user_id: null },
];
const MODULES = [
  { key: 'scan',   label: 'FC Portal',    handler_label: 'FC',    active: true },
  { key: 'mobile', label: 'Admin Portal', handler_label: 'Admin', active: true },
];

const FIXTURE = `<!doctype html>
<html><head><meta charset="utf-8"><title>dock fixture</title></head>
<body><div id="page">a module page</div>
<script>
  window.SHARED_SUPA_URL = 'https://test.supabase.co';
  window.SHARED_SUPA_KEY = 'anon-key';
</script>
<script src="/shared/shared_nelos_dock.js" data-source="scan"></script>
</body></html>`;

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('no');
      }
      res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'application/javascript' : 'text/plain' });
      res.end(fs.readFileSync(file));
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

/* geo: 'ok' answers a position, 'denied' refuses, 'none' is a device with
   no geolocation at all. hasCols: whether the database has the columns —
   PostgREST answers 400 to any select naming one it has not got. */
async function openForm(browser, { hasCols = true, geo = 'ok' } = {}) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const posts = [];
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));
  await page.addInitScript((geo) => {
    try {
      localStorage.setItem('sb-test-auth-token', JSON.stringify({
        access_token: 'tok',
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        user: { id: 'u1', email: 'office@x.com', user_metadata: { full_name: 'The Office' } },
      }));
    } catch (_) {}
    const g = geo === 'none' ? undefined : {
      getCurrentPosition(ok, bad) {
        setTimeout(() => {
          if (geo === 'ok') ok({ coords: { latitude: 4.12345678, longitude: 117.87654321, accuracy: 8.4 } });
          else bad({ code: 1, message: 'denied' });
        }, 20);
      },
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => g });
  }, geo);

  await page.route('**://*.supabase.co/**', (r) => {
    const req = r.request();
    const url = req.url();
    const json = (status, body) => r.fulfill({ status, contentType: 'application/json',
                                               body: JSON.stringify(body) });
    if (url.includes('/nelos_cases')) {
      if (req.method() === 'POST') {
        const row = JSON.parse(req.postData())[0];
        posts.push(row);
        if (!hasCols && ('location_lat' in row || 'location_lng' in row)) {
          return json(400, { code: 'PGRST204', message: "Could not find the 'location_lat' column" });
        }
        return json(201, [Object.assign({ id: 1, case_no: 'NL-0001' }, row)]);
      }
      if (!hasCols && url.includes('location_l')) {
        return json(400, { code: '42703', message: 'column nelos_cases.location_lat does not exist' });
      }
      return json(200, []);
    }
    if (url.includes('shared_profiles'))  return json(200, [{ permissions: { modules: { nelos: 'admin' } } }]);
    if (url.includes('nelos_my_rights'))  return json(200, [{ may_solve: true, may_close: true }]);
    if (url.includes('nelos_my_scope'))   return json(200, [{ primary_module: null, seat_no: null,
                                                              categories: null, is_admin: true }]);
    if (url.includes('nelos_categories')) return json(200, CATEGORIES);
    if (url.includes('nelos_modules'))    return json(200, MODULES);
    return json(200, []);
  });
  await page.route('**/__dock_fixture.html', (r) => r.fulfill({
    status: 200, contentType: 'text/html', body: FIXTURE,
  }));
  await page.goto(`http://localhost:${PORT}/__dock_fixture.html`, { waitUntil: 'load' }).catch(() => {});
  await page.waitForSelector('#nelos-dock', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => window.NelosDock.newCase());
  await page.waitForFunction(
    () => (document.getElementById('nd-f-to') || { options: [] }).options.length > 1,
    null, { timeout: 8000 });
  await page.waitForTimeout(200);          // the column probe is its own read
  return { page, posts };
}

/* 'no such box' is a different answer from hidden: on the previous dock
   there is no box at all, and a check that cannot tell the two apart
   passes for the wrong reason. */
const box = (page) => page.evaluate(() => {
  const f = document.querySelector('.nd-loc-fld');
  if (!f) return 'no such box';
  return {
    shown: !f.hidden,
    value: f.querySelector('#nd-f-loc').value,
    msg: f.querySelector('.nd-loc-msg').textContent,
    label: f.querySelector('.nd-lbl').textContent.replace(/\s+/g, ' ').trim(),
  };
});
const err = (page) => page.evaluate(() => (document.querySelector('.nd-err') || {}).textContent || '');

async function fill(page, text) {
  try { await page.fill('#nd-f-loc', text, { timeout: 3000 }); }
  catch (_) { check('the Location box takes typing', 'it would not', 'typed'); }
}
async function pickWorkAndSave(page) {
  try { await page.selectOption('#nd-f-work', 'Repair Maintenance Work', { timeout: 4000 }); }
  catch (_) { check('the Work list offers the title', 'it would not', 'chosen'); return; }
  await page.waitForTimeout(120);
  await page.evaluate(() => document.querySelector('.nd-save').click());
  await page.waitForTimeout(350);
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium/chrome' })
    .catch(() => chromium.launch());

  console.log('\n1. the box is on the form, says it is optional, and takes a keyed coordinate');
  {
    const { page, posts } = await openForm(browser);
    const b = await box(page);
    check('the Location box is shown', b === 'no such box' ? b : b.shown, true);
    check('its label says optional', b === 'no such box' ? b : b.label, 'Location (optional)');
    await fill(page, '4.5, 117.9');
    await pickWorkAndSave(page);
    check('one case was sent', posts.length, 1);
    check('it carries the latitude', (posts[0] || {}).location_lat, 4.5);
    check('and the longitude', (posts[0] || {}).location_lng, 117.9);
    await page.close();
  }

  console.log('\n2. EMPTY IS ALLOWED, and names neither column');
  {
    const { page, posts } = await openForm(browser);
    await pickWorkAndSave(page);
    check('the case was sent', posts.length, 1);
    check('with no location_lat key at all', posts[0] ? 'location_lat' in posts[0] : 'no post', false);
    check('and no location_lng key', posts[0] ? 'location_lng' in posts[0] : 'no post', false);
    check('nothing was refused', await err(page), '');
    await page.close();
  }

  console.log('\n3. A WRONG ONE IS REFUSED before anything is sent');
  for (const bad of ['B11 near the pump', '4.5', '400, 117.9', '4.5, 117.9, 3']) {
    const { page, posts } = await openForm(browser);
    await fill(page, bad);
    await pickWorkAndSave(page);
    check('"' + bad + '" sends nothing', posts.length, 0);
    check('"' + bad + '" is refused by name', /location is not a coordinate/i.test(await err(page)), true);
    await page.close();
  }

  console.log('\n4. DETECT fills the box, and every failure says to key it in');
  {
    const { page, posts } = await openForm(browser, { geo: 'ok' });
    await page.evaluate(() => { const b = document.querySelector('.nd-loc-btn'); if (b) b.click(); });
    await page.waitForTimeout(200);
    let b = await box(page);
    check('the box holds the reading, six decimals', b === 'no such box' ? b : b.value, '4.123457, 117.876543');
    check('and says how accurate', b === 'no such box' ? b : /about 8 m/.test(b.msg), true);
    /* A detected reading is still the person's to correct. */
    await fill(page, '4.200000, 117.800000');
    await pickWorkAndSave(page);
    check('what is saved is what the box says', [(posts[0] || {}).location_lat, (posts[0] || {}).location_lng],
          [4.2, 117.8]);
    await page.close();
  }
  {
    const { page } = await openForm(browser, { geo: 'denied' });
    await page.evaluate(() => { const b = document.querySelector('.nd-loc-btn'); if (b) b.click(); });
    await page.waitForTimeout(200);
    const b = await box(page);
    check('refused permission leaves the box empty', b === 'no such box' ? b : b.value, '');
    check('and says to key it in', b === 'no such box' ? b : /key it in/i.test(b.msg), true);
    await page.close();
  }
  {
    const { page } = await openForm(browser, { geo: 'none' });
    await page.evaluate(() => { const b = document.querySelector('.nd-loc-btn'); if (b) b.click(); });
    await page.waitForTimeout(100);
    const b = await box(page);
    check('a device with no location says to key it in', b === 'no such box' ? b : /key it in/i.test(b.msg), true);
    await page.close();
  }

  console.log('\n5. a database WITHOUT the columns: no box, and the case still goes');
  {
    const { page, posts } = await openForm(browser, { hasCols: false });
    const b = await box(page);
    check('the Location box is not shown', b === 'no such box' ? b : b.shown, false);
    await pickWorkAndSave(page);
    check('the case was sent', posts.length, 1);
    check('naming no location column', posts[0] ? Object.keys(posts[0]).filter((k) => /^location_/.test(k)) : 'no post', []);
    check('and was not refused', await err(page), '');
    await page.close();
  }

  await browser.close();
  srv.close();

  console.log('\n6. FOUR COPIES OF ONE PARSER agree');
  {
    const INPUTS = ['', '   ', '4.5, 117.9', '4.5 117.9', '(4.123456789, 117.987654321)', '4.5;117.9',
                    '-90, 180', '90.0001, 0', '0, -180.5', 'abc', '4.5', '1,2,3', '4.5, east'];
    /* Lifted out of each shipped file by name, to the end of its body. */
    const lift = (file, re) => {
      let src;
      try { src = fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
      const m = re.exec(src);
      if (!m) return null;
      let i = src.indexOf('{', src.indexOf(')', m.index)), depth = 0, j = i;
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) break;
      }
      const body = src.slice(m.index, j + 1).replace(/^export\s+/, '');
      return vm.runInNewContext('(' + body + ')');
    };
    const copies = {
      dock:   lift(path.join(ROOT, 'shared/shared_nelos_dock.js'), /function parseLatLng\(/),
      nelos:  lift(path.join(ROOT, 'shared/shared_nelos.js'), /function parseLatLng\(/),
      fc:     lift(path.join(ROOT, '../Barcode_Counter/src/lib/latLng.js'), /export function parseLatLng\(/),
      mobile: lift(path.join(ROOT, '../Mobile/src/lib/latLng.js'), /export function parseLatLng\(/),
    };
    const run = (fn) => fn ? INPUTS.map((t) => fn(t)) : 'not found';
    const want = [null, null, { lat: 4.5, lng: 117.9 }, { lat: 4.5, lng: 117.9 },
                  { lat: 4.123457, lng: 117.987654 }, { lat: 4.5, lng: 117.9 },
                  { lat: -90, lng: 180 }, false, false, false, false, false, false];
    check('the dock answers the office rules', run(copies.dock), want);
    check('MJMNelos agrees with the dock', run(copies.nelos), want);
    /* The phone repositories sit beside this one where they are checked
       out. Absent is said, never passed: this environment may not have
       them, and a check that is green over a file it did not read is the
       fault this file is checking for. */
    for (const k of ['fc', 'mobile']) {
      if (!copies[k]) { console.log('  --   ' + k + ' copy not checked out here, not compared'); continue; }
      check('the ' + k + ' copy agrees', run(copies[k]), want);
    }
    const a = path.join(ROOT, '../Barcode_Counter/src/lib/latLng.js');
    const b = path.join(ROOT, '../Mobile/src/lib/latLng.js');
    if (fs.existsSync(a) && fs.existsSync(b)) {
      check('the two phone copies are the same file',
            fs.readFileSync(a, 'utf8') === fs.readFileSync(b, 'utf8'), true);
    }
  }

  console.log('\n7. every screen that READS a case shows it, and the SQL is held to the paste rules');
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
    check('the dock detail draws it', /fact\('Location'/.test(read('shared/shared_nelos_dock.js')), true);
    check('the case page draws it', /c-loc-link/.test(read('nelos/nelos_case.html')), true);
    check('the hub list draws it', /add\('Location'/.test(read('nelos/nelos_dashboard.html')), true);
    check('the hub drawer asks for it', /id="c-loc"/.test(read('nelos/nelos_dashboard.html')), true);
    check('the SQL is on the swept list',
          /RUN_ME_nelos_case_location\.sql/.test(read('tests/sql_pastes_into_the_editor.cjs')), true);
  }

  console.log('\n8. THE COORDINATE IS THE GAIA LINK, with no button beside it');
  {
    /* The office: "if i saw the case and click the location, can it bring
       me to there by gaia?" On a phone it is the app link, which does
       nothing where the app is not installed -- so it is a SECOND door
       and the Maps one is never taken away. On a desk there is no app, so
       it is the Gaia web map, whose address is zoom / LONGITUDE /
       latitude: the order is the thing to get wrong. */
    const liftG = (file, re, ua) => {
      let src;
      try { src = fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
      const m = re.exec(src);
      if (!m) return null;
      let i = src.indexOf('{', src.indexOf(')', m.index)), depth = 0, j = i;
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) break;
      }
      const body = src.slice(m.index, j + 1).replace(/^export\s+/, '');
      return vm.runInNewContext('(' + body + ')', { navigator: { userAgent: ua } });
    };
    const PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile';
    const DESK  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    const files = {
      dock:   [path.join(ROOT, 'shared/shared_nelos_dock.js'), /function gaiaHref\(/],
      nelos:  [path.join(ROOT, 'shared/shared_nelos.js'), /function gaiaHref\(/],
      fc:     [path.join(ROOT, '../Barcode_Counter/src/lib/latLng.js'), /export function gaiaHref\(/],
      mobile: [path.join(ROOT, '../Mobile/src/lib/latLng.js'), /export function gaiaHref\(/],
    };
    for (const k of Object.keys(files)) {
      const onPhone = liftG(files[k][0], files[k][1], PHONE);
      const onDesk  = liftG(files[k][0], files[k][1], DESK);
      if (!onPhone) {
        if (k === 'dock' || k === 'nelos') check('the ' + k + ' copy has a Gaia link', 'not found', 'found');
        else console.log('  --   ' + k + ' copy not checked out here, not compared');
        continue;
      }
      check(k + ': a phone opens the Gaia web map, which the app takes with a pin',
            onPhone(4.123457, 117.876543), 'https://www.gaiagps.com/map/?loc=17/117.876543/4.123457');
      check(k + ': a desk opens the Gaia web map, longitude first',
            onDesk(4.123457, 117.876543), 'https://www.gaiagps.com/map/?loc=17/117.876543/4.123457');
    }
    const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
    const dock = read('shared/shared_nelos_dock.js');
    /* "dont do it button. direct click the location": the two numbers are
       the ONE link, to Gaia, with no Gaia or Maps button beside them. */
    check('the dock detail: the coordinate is the Gaia link', /nd-d-gaia/.test(dock), true);
    check('and no Maps button beside it', />Maps<\/a>/.test(dock), false);
    const casePg = read('nelos/nelos_case.html');
    check('the case page coordinate goes to Gaia',
          /\$\('c-loc-link'\)\.href = MJMNelos\.gaiaHref/.test(casePg) && /data-copy/.test(casePg), true);
    check('and has no second button', /c-gaia-link/.test(casePg), false);
    const dashPg = read('nelos/nelos_dashboard.html');
    check('the hub sheet Location value is the Gaia link',
          /k === 'Location'[\s\S]{0,300}s-loc-gaia[\s\S]{0,400}MJMNelos\.gaiaHref/.test(dashPg), true);
    check('and has no Gaia or Maps button', /Open the location in (Gaia GPS|Maps)/.test(dashPg), false);
    for (const [k, f] of [['fc', '../Barcode_Counter/src/components/NelosWindow.jsx'], ['mobile', '../Mobile/src/components/NelosCase.jsx']]) {
      const fp = path.join(ROOT, f);
      if (!fs.existsSync(fp)) continue;
      const src = fs.readFileSync(fp, 'utf8');
      check(k + ': the coordinate is the Gaia link and copies itself',
            /<a href=\{gaiaHref\(c\.location_lat, c\.location_lng\)\}[\s\S]{0,260}clipboard\.writeText/.test(src), true);
      check(k + ': no Maps button', /mapsHref\(/.test(src), false);
    }
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
