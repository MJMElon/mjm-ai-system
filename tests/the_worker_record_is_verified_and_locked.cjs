/* VERIFY & LOCK on the Worker Record — Work Maintenance, Worker Activity.

   The office asked for it in four words, standing on the P & D sheet for
   UNN 2: 加一个verified and lock 按钮.

   WHAT IT SIGNS IS THE RECORD. The payroll module has had a verify strip
   for months and it closes the CLAIM — `maint` in its LOCK_SHEETS freezes
   what the claim shows and says in its own words that "Worker Record stays
   exactly as editable as it always was". So the money was protected and the
   record underneath it was not. This is its own signature, under its own
   key: sheet `workrec:<job>`, scope the nursery, in the payroll module's own
   `mjmnpayroll_verifications` through the SHARED lock file — not a second
   copy of the rules.

   The three things it has to get right, and every one of them is a way this
   goes wrong quietly:

     the strip is on EVERY sheet, because a strip on one lies about seven;
     a verified sheet REFUSES in JavaScript, because a class cannot stop a
       call — the lock-in-the-stylesheet fault this codebase has a heading
       about;
     it reads its OWN verification and never `isSheetLocked`, because the
       payroll MONTH lock auto-shuts on the 2nd of the following month and
       reading it here would have turned every October sheet read-only the
       morning this shipped.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_worker_record_is_verified_and_locked.cjs
   with a static server on 8777 serving the repository root.               */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/* A guarded evaluate: on the previous code these functions do not exist, and
   an unguarded page.evaluate throws out of the whole file — every check
   under it never asked, which proves nothing about what it used to do. */
const ev = async (page, fn, arg) => {
  try { return await page.evaluate(fn, arg); }
  catch (e) { return 'threw: ' + String(e.message || e).split('\n')[0]; }
};

const MONTH = (() => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
})();
const MLABEL = (() => {
  const n = new Date();
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][n.getMonth()]
       + ' ' + n.getFullYear();
})();

const REGISTER = [
  { id: 1, full_name: 'Muhamad Azhar', section: 'UNN2', role: 'General Worker', active: true },
  { id: 2, full_name: 'Awaludin',      section: 'UNN2', role: 'General Worker', active: true },
];

async function boot(browser, db, opts) {
  opts = opts || {};
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [], dialogs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => {
    dialogs.push(d.type() + ': ' + d.message());
    if (d.type() === 'prompt') { d.dismiss(); return; }
    /* Confirm is ACCEPTED, because the whole point is to get through to the
       write; an alert is dismissed and recorded, which is how a refusal is
       told from a save. */
    if (d.type() === 'confirm') d.accept(); else d.dismiss();
  });
  await page.addInitScript((seed) => {
    window.__DB = seed.db;
    window.__PERMS = seed.perms;
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    try { localStorage.setItem('mjm_maint_nursery', 'UNN2'); localStorage.setItem('mjm_lang', 'en'); } catch (_) {}
    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select' };
      const tbl = () => (window.__DB[table] || (window.__DB[table] = []));
      const match = (r) => st.eqs.every(([c, v]) => String(r[c]) === String(v));
      const run = () => {
        if ((window.__DB.__MISSING || []).includes(table))
          return { data: null, error: { message: 'relation "' + table + '" does not exist' } };
        if (st.op === 'delete') {
          const before = tbl().length;
          window.__DB[table] = tbl().filter(r => !match(r));
          (window.__WRITES = window.__WRITES || []).push(['delete', table, st.eqs.slice()]);
          return { data: [], error: null, count: before - window.__DB[table].length };
        }
        const o = tbl().filter(match);
        return st.single ? { data: o[0] || null, error: null } : { data: o, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'select') return () => q;
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'delete') return () => { st.op = 'delete'; return q; };
        /* The write LANDS, keyed on what onConflict names — a stub that
           recorded an upsert and kept nothing would pass a Verify that
           verifies nothing, and every check about the sheet then shutting
           would be asking about a row that was never there. */
        if (p === 'upsert') return (rows, o) => {
          const list = Array.isArray(rows) ? rows : [rows];
          const on = ((o && o.onConflict) || 'id').split(',').map(s => s.trim());
          (window.__WRITES = window.__WRITES || []).push(['upsert', table, list]);
          const t = tbl();
          list.forEach(row => {
            const i = t.findIndex(r => on.every(c => String(r[c]) === String(row[c])));
            /* The database stamps verified_at, not the browser — see the
               comment above setManualOverride. The stub does what the
               trigger does. */
            const withStamp = Object.assign({}, row);
            if (table === 'mjmnpayroll_verifications' && !withStamp.verified_at)
              withStamp.verified_at = new Date().toISOString();
            if (i >= 0) t[i] = Object.assign({}, t[i], withStamp); else t.push(withStamp);
          });
          return Promise.resolve({ data: list, error: null });
        };
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
    /* NO saved row for this page is nobody having been asked, so the module
       level decides — which is what governed every one of these before the
       tick existed. Section 5 is the two saved-row cases. */
  }, { db, perms: opts.perms || { modules: { nursery_ops: 'admin' } } });
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'elon.mjm@gmail.com', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => (window.__PERMS || {});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof _dbReady !== 'undefined' && _dbReady, { timeout: 25000 })
    .catch(() => {});
  await ev(page, () => { try { isNopsAdmin = true; } catch (_) {} });
  await ev(page, () => { try { switchTab('payroll', null); } catch (_) {} });
  return { page, errs, dialogs };
}

const openJob = (page, key) => ev(page, (k) => { switchPayrollView(k); }, key);

/* ALWAYS THE SAME SHAPE. On the previous code there is no strip at all, and
   a reader that hands back a string makes the next check throw — which
   takes the harness down and leaves every check under it unasked, proving
   nothing about what the page used to do. */
const strip = (page) => ev(page, () => {
  const el = document.getElementById('vb-workrec');
  if (!el) return { cls: 'no #vb-workrec on the page', text: '', buttons: [] };
  return { cls: el.className,
           text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
           buttons: [...el.querySelectorAll('button')].map(b => b.textContent.trim()) };
});

const vers = (page) => ev(page, () =>
  (window.__DB.mjmnpayroll_verifications || [])
    .map(v => [v.month, v.sheet, v.scope, !!v.verified_at]));

/* Same rule for the strip reader's own callers: `ev` turns a throw into a
   named string, so a check that then indexes it has to cope. */
const classOf = (s) => (s && typeof s === 'object') ? s.cls : String(s);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* ── 0. ONE RULE, ONE FILE ──────────────────────────────────────────── */
  console.log('— 0. the lock rules are the shared file, not a second copy');
  {
    const page = read('nursery_ops', 'nursery_ops_maintenance.html');
    check('the page loads shared_npayroll_lock.js',
      /shared_npayroll_lock\.js/.test(page), true);
    /* A second copy of verificationOf / isSheetLocked in this page would be
       the drift this codebase keeps finding. */
    const js = read('nursery_ops', 'plot_maintenance_script.js');
    check('and writes no lock rules of its own',
      /function\s+(verificationOf|isSheetLocked|isMonthLocked)\s*\(/.test(js), false);
    /* THE MONTH LOCK MUST NOT REACH THIS PAGE: the payroll auto-locks a
       month on the 2nd of the next one, so reading it here would shut every
       elapsed month's Worker Record with nobody pressing anything. */
    check('and never asks isSheetLocked or the month lock',
      /MJMPayrollLock\.(isSheetLocked|isMonthLocked)/.test(js), false);
    check('it asks its own verification instead',
      /MJMPayrollLock\.verificationOf\(/.test(js), true);

    /* The fallback is declared in BOTH places or it is declared in neither:
       the screen draws the tick and the page obeys it. */
    const screen = read('nursery_ops', 'nursery_ops_user_access.html');
    check('the screen offers Verify and Unlock, both falling back to the old tick',
      ["verify", "unverify"].map(k =>
        new RegExp("key:'" + k + "'[\\s\\S]{0,400}?fallbackTo:'worker_record'").test(screen)),
      [true, true]);
    check('and the page reads them with the same fallback',
      ["mayMaintAct('verify', 'worker_record')", "mayMaintAct('unverify', 'worker_record')"]
        .map(s => js.includes(s)), [true, true]);
  }

  /* ── 1. THE STRIP IS ON EVERY SHEET ─────────────────────────────────── */
  console.log('— 1. open on every sheet, naming the sheet it is about');
  {
    const { page, errs } = await boot(browser, { mjmnpayroll_workers: REGISTER });

    await openJob(page, 'pd');
    const s = await strip(page);
    check('P & D opens with the strip open and a Verify & lock button',
      [s.cls, s.buttons], ['verify-bar verify-open', ['✔ Verify & lock']]);
    check('and it names the job, the nursery and the month',
      /* The strip shows the month as a LABEL, which is what everything
         else on this page shows; the KEY is what is stored. */
      [/P & D/.test(s.text), /Ulu Niah Nursery 2/.test(s.text), s.text.includes(MLABEL)],
      [true, true, true]);

    const everywhere = [];
    for (const job of ['pd', 'manuring', 'weeding', 'interrow', 'loading_seedlings',
                       'transplanting', 'cull_incentive', 'seed_planting']) {
      await openJob(page, job);
      const t = await strip(page);
      everywhere.push(t && t.cls === 'verify-bar verify-open' && t.buttons.length === 1);
    }
    /* A strip on one sheet is a strip that lies about the other seven. */
    check('all eight sheets carry it', everywhere,
      [true, true, true, true, true, true, true, true]);

    check('nothing is verified yet', await vers(page), []);
    check('no page error', errs, []);
    await page.close();
  }

  /* ── 2. VERIFYING, AND WHAT IT SHUTS ────────────────────────────────── */
  console.log('— 2. Verify & lock writes one row and shuts that sheet');
  {
    const { page, errs, dialogs } = await boot(browser, { mjmnpayroll_workers: REGISTER });
    await openJob(page, 'pd');
    await ev(page, () => verifyWorkRec());
    await page.waitForFunction(() => (window.__DB.mjmnpayroll_verifications || []).length > 0,
      { timeout: 8000 }).catch(() => {});

    check('ONE row, keyed on the job and the nursery', await vers(page),
      [[MONTH, 'workrec:pd', 'UNN2', true]]);
    check('and the confirm said what it signs and what it does not',
      dialogs.some(d => /salary claim is signed separately/i.test(d)), true);

    const s = await strip(page);
    check('the strip turns over to Verified, with a name and an Unlock',
      [s.cls, s.buttons], ['verify-bar verify-done', ['↺ Unlock']]);

    /* THE PAINT. It is only the paint, which is why the gate is checked
       separately below. */
    check('the table is greyed', await ev(page, () =>
      document.getElementById('payroll-table').classList.contains('wr-shut')), true);

    /* THE GATE. A class cannot stop a call, so the refusal has to be in the
       handler — the lock-in-the-stylesheet fault, which this codebase has a
       heading about. */
    const before = await ev(page, () => JSON.stringify(payrollData));
    const said = dialogs.length;
    await ev(page, () => togglePayrollTick(1, 'Muhamad Azhar'));
    check('a tick called straight out is REFUSED, not merely greyed',
      await ev(page, () => JSON.stringify(payrollData)), before);
    check('and it says who shut it',
      dialogs.slice(said).some(d => /^alert/.test(d) && /verified by/i.test(d)), true);

    /* A sheet signed off is one sheet. Signing P & D must not shut work
       nobody has finished keying. */
    await openJob(page, 'manuring');
    check('Manuring beside it is still open',
      (await strip(page)).cls, 'verify-bar verify-open');
    check('and its ticks still work', await (async () => {
      await ev(page, () => { try { togglePayrollTick(99, 'Awaludin'); } catch (_) {} });
      return ev(page, () => !!(payrollData[payrollKey(getNursery(), getMonth(), 'manuring')] || {})[99]);
    })(), true);

    check('no page error', errs, []);
    await page.close();
  }

  /* ── 3. UNLOCK PUTS IT BACK ─────────────────────────────────────────── */
  console.log('— 3. Unlock takes the one sheet back and nothing else');
  {
    const { page, errs } = await boot(browser, {
      mjmnpayroll_workers: REGISTER,
      mjmnpayroll_verifications: [
        { month: MONTH, sheet: 'workrec:pd', scope: 'UNN2',
          verified_by: 'esther@mjmnursery.com', verified_at: '2026-11-01T02:00:00Z' },
        { month: MONTH, sheet: 'workrec:weeding', scope: 'UNN2',
          verified_by: 'esther@mjmnursery.com', verified_at: '2026-11-01T02:00:00Z' },
      ],
    });
    await openJob(page, 'pd');
    check('a sheet verified before the page opened draws shut',
      (await strip(page)).cls, 'verify-bar verify-done');

    await ev(page, () => unverifyWorkRec());
    await page.waitForFunction(() => (window.__DB.mjmnpayroll_verifications || []).length < 2,
      { timeout: 8000 }).catch(() => {});

    check('only its own row goes', await vers(page),
      [[MONTH, 'workrec:weeding', 'UNN2', true]]);
    check('the strip is open again',
      (await strip(page)).cls, 'verify-bar verify-open');
    check('and the ticks work again', await (async () => {
      await ev(page, () => { try { togglePayrollTick(7, 'Awaludin'); } catch (_) {} });
      return ev(page, () => !!(payrollData[payrollKey(getNursery(), getMonth(), 'pd')] || {})[7]);
    })(), true);

    check('no page error', errs, []);
    await page.close();
  }

  /* ── 4. THE SCOPE IS THE NURSERY ────────────────────────────────────── */
  console.log('— 4. one nursery, and the other is untouched');
  {
    const { page, errs } = await boot(browser, {
      mjmnpayroll_workers: REGISTER,
      mjmnpayroll_verifications: [
        { month: MONTH, sheet: 'workrec:pd', scope: 'UNN2',
          verified_by: 'esther@mjmnursery.com', verified_at: '2026-11-01T02:00:00Z' },
      ],
    });
    await openJob(page, 'pd');
    check('UNN 2 is shut', (await strip(page)).cls, 'verify-bar verify-done');
    await ev(page, () => pickNursery('BNN'));
    check('BNN on the same job and month is open',
      (await strip(page)).cls, 'verify-bar verify-open');
    check('no page error', errs, []);
    await page.close();
  }

  /* ── 5. PERMISSION, AND IT IS ASKED AGAIN AT THE WRITE ──────────────── */
  console.log('— 5. a saved row the office keyed decides, and the write asks again');
  {
    /* A row saved before these keys existed: it carries worker_record and
       neither of the new ones. Reading an absent key as OFF would take the
       button away from everybody who has a row — fallbackTo is what stops
       that, and this is the case it was written for. */
    const { page, errs } = await boot(browser, { mjmnpayroll_workers: REGISTER }, {
      perms: { modules: { nursery_ops: 'normal' },
               nursery_ops_actions: { maintenance: { view: true, worker_record: true } } },
    });
    await openJob(page, 'pd');
    check('an old saved row still offers Verify, off the Worker Record tick',
      (await strip(page)).buttons, ['✔ Verify & lock']);
    await page.close();

    const shutOut = await boot(browser, { mjmnpayroll_workers: REGISTER }, {
      perms: { modules: { nursery_ops: 'normal' },
               nursery_ops_actions: { maintenance: { view: true, worker_record: false } } },
    });
    await openJob(shutOut.page, 'pd');
    const s = await strip(shutOut.page);
    check('a row with the Worker Record tick OFF offers no button, and says where it is set',
      [s.buttons, /User Access/.test(s.text)], [[], true]);
    /* ASKED AGAIN AT THE WRITE: a button drawn before somebody's access
       changed is still sitting on the screen, so the call has to refuse on
       its own rather than trusting the render. */
    await ev(shutOut.page, () => verifyWorkRec());
    check('and calling verify straight out writes nothing', await vers(shutOut.page), []);
    await shutOut.page.close();

    check('no page error', errs, []);
  }

  /* ── 6. IT FAILS OPEN ───────────────────────────────────────────────── */
  console.log('— 6. lock tables that cannot be read lock nothing');
  {
    const { page, errs } = await boot(browser, {
      mjmnpayroll_workers: REGISTER,
      __MISSING: ['mjmnpayroll_month_locks', 'mjmnpayroll_lock_days', 'mjmnpayroll_verifications'],
    });
    await openJob(page, 'pd');
    const s = await strip(page);
    /* No band at all rather than an empty one — `.verify-bar:empty` hides
       it — and above all nothing shut: a read error must not take a nursery
       out of its own record. */
    check('the strip draws nothing', [s.cls, s.text], ['verify-bar', '']);
    check('the table is not greyed', await ev(page, () =>
      document.getElementById('payroll-table').classList.contains('wr-shut')), false);
    check('and the ticks still work', await (async () => {
      await ev(page, () => { try { togglePayrollTick(3, 'Awaludin'); } catch (_) {} });
      return ev(page, () => !!(payrollData[payrollKey(getNursery(), getMonth(), 'pd')] || {})[3]);
    })(), true);
    check('no page error', errs, []);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
