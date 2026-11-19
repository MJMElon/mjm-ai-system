/* THE COLLECTION TIME SLOTS ARE THE SYSTEM SETTING.

   The office, over the booking modal: "Create a collection time slot
   setting at system setting while if we change the setting there, it will
   direct affect here." The hours were written into the page (8 AM - 5 PM
   weekdays, 8 AM - 12 PM Saturday, 350 and 600) and nothing could move
   them.

   This drives the REAL Collection Time Slot Booking page and the REAL
   System Settings page against one stubbed database:

     1. the shared rule, lifted out of the shipped file
     2. a saved setting becomes the slots in the booking modal, the rows of
        the week grid, the closing hour and the load figures
     3. a database without the table books exactly as before
     4. the settings card shows the saved row, refuses a day that closes
        before it opens, and saves what was keyed

   Run: node tests/the_collection_slots_are_the_setting.cjs
*/
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

/* ── 1. The rule ─────────────────────────────────────────────────────── */
console.log('\nThe shared rule');
const RULE = path.join(ROOT, 'shared', 'shared_collection_slots.js');
let S = null;
if (!fs.existsSync(RULE)) { fail++; console.log('  FAIL shared/shared_collection_slots.js exists'); }
else {
  const g = {};
  new Function('window', 'globalThis', fs.readFileSync(RULE, 'utf8'))(g, g);
  S = g.MJMCollectionSlots;
  check('the defaults are the hours the page had written in', [S.hours(1), S.hours(6), S.hours(0)],
        [[8, 9, 10, 11, 12, 13, 14, 15, 16], [8, 9, 10, 11], []]);
  check('and the two load figures', [S.get().rate_per_hour, S.get().max_load_per_hour], [350, 600]);
  check('a weekday that closes when it opens is refused', !!S.problem({ weekday_open: 9, weekday_close: 9, sat_open: 8, sat_close: 12, rate_per_hour: 1, max_load_per_hour: 1 }), true);
  check('a Saturday that closes before it opens is refused', !!S.problem({ weekday_open: 8, weekday_close: 17, sat_open: 12, sat_close: 10, rate_per_hour: 1, max_load_per_hour: 1 }), true);
  check('a nought load is refused', !!S.problem({ weekday_open: 8, weekday_close: 17, sat_open: 8, sat_close: 12, rate_per_hour: 0, max_load_per_hour: 600 }), true);
  check('a good setting is not', S.problem({ weekday_open: 9, weekday_close: 15, sat_open: 8, sat_close: 10, rate_per_hour: 500, max_load_per_hour: 800 }), '');
}

/* ── The stubbed world ───────────────────────────────────────────────── */
const SUPA_STUB = `
(function(){
  window.__WRITES = [];
  function builder(table){
    var q = { table: table, filters: [], op: 'select', payload: null, single: false };
    var b = {
      select: function(){ return b; }, eq: function(c,v){ q.filters.push([c,v]); return b; },
      neq: function(){ return b; }, in: function(){ return b; }, not: function(){ return b; },
      gte: function(){ return b; }, lte: function(){ return b; }, lt: function(){ return b; }, gt: function(){ return b; },
      ilike: function(){ return b; }, like: function(){ return b; }, or: function(){ return b; }, is: function(){ return b; },
      order: function(){ return b; }, limit: function(){ return b; }, range: function(){ return b; },
      maybeSingle: function(){ q.single = true; return b; }, single: function(){ q.single = true; return b; },
      upsert: function(p){ q.op = 'upsert'; q.payload = p; return b; },
      insert: function(p){ q.op = 'insert'; q.payload = p; return b; },
      update: function(p){ q.op = 'update'; q.payload = p; return b; },
      delete: function(){ q.op = 'delete'; return b; },
      then: function(res, rej){
        var F = window.__FIX || {};
        if (q.op !== 'select') {
          window.__WRITES.push({ table: q.table, op: q.op, payload: q.payload });
          if (q.table === 'shared_collection_slot_settings') F[q.table] = [q.payload];
          return Promise.resolve({ data: q.single ? q.payload : [q.payload], error: null }).then(res, rej);
        }
        if (F.__missing && F.__missing.indexOf(q.table) >= 0)
          return Promise.resolve({ data: null, error: { message: 'relation "public.' + q.table + '" does not exist' } }).then(res, rej);
        var rows = (F[q.table] || []).slice();
        return Promise.resolve({ data: q.single ? (rows[0] || null) : rows, error: null }).then(res, rej);
      }
    };
    return b;
  }
  var user = { id: 'u1', email: 'office@mjm.test' };
  var auth = {
    getUser: async function(){ return { data: { user: user } }; },
    getSession: async function(){ return { data: { session: { user: user } } }; },
    onAuthStateChange: function(){ return { data: { subscription: { unsubscribe: function(){} } } }; }
  };
  var storage = { from: function(){ return { upload: async function(){ return {}; }, getPublicUrl: function(){ return { data: { publicUrl: '' } }; } }; } };
  window.supabase = { createClient: function(){ return { from: builder, auth: auth, storage: storage, rpc: async function(){ return { data: null, error: null }; }, channel: function(){ var c = { on: function(){ return c; }, subscribe: function(){ return c; } }; return c; }, removeChannel: function(){} }; } };
})();`;
const ACCESS_STUB = `window.MJMAccess = { load: async function(){}, user: function(){ return { id: 'u1' }; },
  canOpenOperationPage: function(){ return true; }, requireOperationAction: function(){ return true; },
  canDo: function(){ return true; }, isAdminOf: function(){ return true; } };`;

function serve() {
  return new Promise(r => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      const ext = path.extname(p);
      res.writeHead(200, { 'content-type': ext === '.html' ? 'text/html' : ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    }).listen(0, () => r(srv));
  });
}

async function open(browser, base, page_, fix) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('dialog', d => { page.__dialogs = (page.__dialogs || []).concat(d.message()); d.accept(); });
  page.on('pageerror', e => { page.__errors = (page.__errors || []).concat(String(e.message)); });
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base)) {
      if (/shared\/shared_access\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: ACCESS_STUB });
      if (/shared\/shared_staff_gate\.js|shared_nelos_dock\.js|shared_supabase\.js/.test(u))
        return r.fulfill({ contentType: 'text/javascript', body: 'window.SHARED_SUPA_URL="x";window.SHARED_SUPA_KEY="y";' });
      return r.continue();
    }
    if (/supabase-js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: SUPA_STUB });
    return r.fulfill({ contentType: 'text/javascript', body: '' });
  });
  await page.addInitScript(f => { window.__FIX = f; }, fix);
  await page.goto(base + page_);
  return { page, ctx };
}

// A Monday and a Saturday safely in the future.
function nextDow(dow) { const d = new Date(); d.setDate(d.getDate() + 14); while (d.getDay() !== dow) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
const MON = nextDow(1), SAT = nextDow(6);

async function bookingRead(page) {
  return page.evaluate(([mon, sat]) => {
    const slots = (ds) => {
      document.getElementById('bk-date').value = ds;
      renderBkTimeSlots();
      return Array.from(document.querySelectorAll('#bk-time-slots-list .ts-time, #bk-time-slots-list .time-slot-row'))
        .filter(el => el.classList.contains('time-slot-row'))
        .map(el => (el.querySelector('.ts-time') || el).textContent.trim().split('\n')[0].trim());
    };
    return {
      mon: slots(mon), sat: slots(sat),
      closeMon: closingHour(mon), closeSat: closingHour(sat),
      rate: RATE, max: MAX_LOAD_PER_HOUR
    };
  }, [MON, SAT]);
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  try {
    /* ── 2. A saved setting is the slots ─────────────────────────────── */
    console.log('\nThe booking page follows a saved setting (9 AM - 3 PM weekdays, 8 - 10 AM Saturday)');
    const SAVED = { shared_collection_slot_settings: [{ id: 1, weekday_open: 9, weekday_close: 15, sat_open: 8, sat_close: 10, rate_per_hour: 500, max_load_per_hour: 800 }] };
    {
      const { page, ctx } = await open(browser, base, 'operation/operation_collection_booking.html', SAVED);
      try { await page.waitForFunction(() => typeof RATE !== 'undefined' && RATE === 500, null, { timeout: 8000 }); } catch (e) {}
      let r = null;
      try { r = await bookingRead(page); } catch (e) { r = { error: String(e.message).split('\n')[0] }; }
      check('a Monday offers the six slots 9 AM to 3 PM', r && r.mon, ['9 AM - 10 AM', '10 AM - 11 AM', '11 AM - 12 PM', '12 PM - 1 PM', '1 PM - 2 PM', '2 PM - 3 PM']);
      check('a Saturday offers the two slots 8 AM to 10 AM', r && r.sat, ['8 AM - 9 AM', '9 AM - 10 AM']);
      check('the closing hour is the setting', r && [r.closeMon, r.closeSat], [15, 10]);
      check('and so are the two load figures', r && [r.rate, r.max], [500, 800]);
      check('no page errors', page.__errors || [], []);
      await ctx.close();
    }

    /* ── 3. No table: exactly as before ─────────────────────────────── */
    console.log('\nA database without the table books exactly as it always has');
    {
      const { page, ctx } = await open(browser, base, 'operation/operation_collection_booking.html', { __missing: ['shared_collection_slot_settings'] });
      try { await page.waitForFunction(() => typeof RATE !== 'undefined' && document.getElementById('period-label') && !/Loading/i.test(document.getElementById('period-label').textContent), null, { timeout: 8000 }); } catch (e) {}
      let r = null;
      try { r = await bookingRead(page); } catch (e) { r = { error: String(e.message).split('\n')[0] }; }
      check('a Monday still offers 8 AM to 5 PM', r && r.mon && r.mon.length, 9);
      check('a Saturday still offers 8 AM to 12 PM', r && r.sat && r.sat.length, 4);
      check('350 and 600 as before', r && [r.rate, r.max], [350, 600]);
      check('no page errors', page.__errors || [], []);
      await ctx.close();
    }

    /* ── 4. The settings card ────────────────────────────────────────── */
    console.log('\nSystem Settings: the Collection Time Slot card');
    {
      const { page, ctx } = await open(browser, base, 'operation/operation_settings.html', SAVED);
      try { await page.waitForFunction(() => document.getElementById('slot-wd-open') && document.getElementById('slot-wd-open').value === '9', null, { timeout: 8000 }); } catch (e) {}
      const shown = await page.evaluate(() => {
        const v = id => { const e = document.getElementById(id); return e ? e.value : null; };
        return [v('slot-wd-open'), v('slot-wd-close'), v('slot-sat-open'), v('slot-sat-close'), v('slot-rate'), v('slot-max')];
      });
      check('it shows the saved setting', shown, ['9', '15', '8', '10', '500', '800']);

      const refused = await page.evaluate(() => {
        const e = document.getElementById('slot-wd-close'); if (!e) return null;
        e.value = '9'; e.dispatchEvent(new Event('change'));
        return { disabled: document.getElementById('slot-save').disabled, said: document.getElementById('slot-preview').textContent };
      });
      check('a weekday closing when it opens disables Save', refused && refused.disabled, true);
      check('and says why', refused && /close after it opens/.test(refused.said), true);

      const saved = await page.evaluate(async () => {
        const set = (id, v) => { const e = document.getElementById(id); e.value = String(v); e.dispatchEvent(new Event('change')); };
        set('slot-wd-open', 7); set('slot-wd-close', 18); set('slot-sat-open', 8); set('slot-sat-close', 13);
        document.getElementById('slot-rate').value = '400'; document.getElementById('slot-max').value = '900';
        await saveSlotSetting();
        return window.__WRITES.filter(w => w.table === 'shared_collection_slot_settings').map(w => w.payload);
      });
      const p = saved && saved[0] || {};
      check('Save writes ONE row of the setting', saved && saved.length, 1);
      check('carrying what was keyed', [p.id, p.weekday_open, p.weekday_close, p.sat_open, p.sat_close, p.rate_per_hour, p.max_load_per_hour], [1, 7, 18, 8, 13, 400, 900]);
      check('and who saved it', p.updated_by, 'office@mjm.test');
      check('no page errors', (page.__errors || []).filter(e => !/leaflet|L is not defined/i.test(e)), []);
      await ctx.close();
    }

    /* ── 5. Every screen of this repository that books reads it ─────── */
    console.log('\nNo booking screen keeps its own hours any more');
    const booking = fs.readFileSync(path.join(ROOT, 'operation', 'operation_collection_booking.html'), 'utf8');
    check('the booking page loads the shared rule', /shared_collection_slots\.js\?v=/.test(booking), true);
    check('and writes no hour list of its own', /HOURS_WEEKDAY\s*=\s*\[/.test(booking), false);
    check('nor a closing hour of 12 or 17', /dow === 6 \? 12 : 17/.test(booking), false);
  } finally {
    await browser.close(); srv.close();
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
