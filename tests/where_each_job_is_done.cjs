/* WHERE EACH JOB IS DONE — the Pre Nursery / Main Nursery scope, keyed on
   Settings and obeyed by the side bar and the nursery circles.

   The office asked for three things in one message:

     "maintenance 那里我要做setting, 分pre nursery和main nursery(BNN, UNN1,
      UNN2) (row) ... 这些工作可以drag来drag去，像worker namelist 一样 ...
      main page 的side tab就会跟着我后面的setting show ... main page的UI
      跟着alphabet"

   and then narrowed it twice:

     "main page 不会跟着pre 和 main 分了 所以如果两边都有 当我按那个工作的
      时候上面的圈圈就会show PN BNN UNN1 UNN2"
     "上面nursery的圈圈就会跟着side tab show， 例如我按pnd，而后面的setting
      pnd是drag去main nursery，上面的圈圈只会showBNN UNN1 UNN2"

   So: the side bar is ONE alphabetical list with no Pre / Main headings, and
   the CIRCLES are what say which nurseries the open job is done in.

   It drives the REAL page in a REAL browser, and the drag is the real
   handlers: a DragEvent dispatched at the chip and the row, which fires the
   inline ondragstart / ondragover / ondrop exactly as a mouse does. A drag
   simulated by setting the draft directly would prove nothing about the
   board.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/where_each_job_is_done.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const JOBS = ['pd', 'manuring', 'weeding', 'interrow', 'loading_seedlings',
              'transplanting', 'cull_incentive', 'seed_planting'];

async function boot(browser, db, where) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => {
    if (d.type() === 'confirm') { d.accept(); return; }
    if (d.type() === 'prompt') errs.push('PROMPT: ' + d.message());
    else errs.push('ALERT: ' + d.message());
    d.dismiss();
  });
  await page.addInitScript((seed) => {
    window.__DB = seed;
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    try { localStorage.setItem('mjm_maint_nursery', 'BNN'); localStorage.setItem('mjm_lang', 'en'); } catch (_) {}
    function makeQuery(table) {
      const st = { eqs: [], single: false, op: 'select' };
      const tbl = () => (window.__DB[table] || (window.__DB[table] = []));
      const match = (r) => st.eqs.every(([c, v]) => String(r[c]) === String(v));
      const run = () => {
        if ((window.__DB.__MISSING || []).includes(table))
          return { data: null, error: { message: 'relation "' + table + '" does not exist' } };
        /* A COLUMN THE DATABASE HAS NOT GOT refuses the whole select, the
           way PostgREST does — which is the fail-open this card leans on. */
        const gone = (window.__DB.__NOCOL || {})[table] || [];
        if (gone.some(c => (st.cols || '').indexOf(c) >= 0))
          return { data: null, error: { message: 'column ' + table + '.' + gone[0]
                     + ' does not exist' } };
        if (st.op === 'delete') {
          window.__DB[table] = tbl().filter(r => !match(r));
          return { data: [], error: null };
        }
        const o = tbl().filter(match);
        return st.single ? { data: o[0] || null, error: null } : { data: o, error: null };
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'select') return (cols) => { st.cols = String(cols || ''); return q; };
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'range') return () => Promise.resolve(run());
        if (p === 'delete') return () => { st.op = 'delete'; return q; };
        /* The write LANDS, keyed on what onConflict names, so a read-back
           sees what the screen sent. A stub that recorded an upsert and
           kept nothing would pass a Save that saves nothing. */
        if (p === 'upsert') return (rows, opts) => {
          const list = Array.isArray(rows) ? rows : [rows];
          const on = (opts && opts.onConflict) || 'id';
          (window.__WRITES = window.__WRITES || []).push([table, on, list]);
          const gone = (window.__DB.__NOCOL || {})[table] || [];
          const bad = gone.find(c => list.some(r => Object.hasOwn(r, c)));
          if (bad) return Promise.resolve({ data: null,
            error: { message: 'column "' + bad + '" of relation "' + table + '" does not exist' } });
          const t = tbl();
          list.forEach(row => {
            const i = t.findIndex(r => String(r[on]) === String(row[on]));
            if (i >= 0) t[i] = Object.assign({}, t[i], row); else t.push(Object.assign({}, row));
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
  }, db);
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
  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html', { waitUntil: 'load' });
  /* The scopes arrive with loadSettingLists, inside the boot's own
     Promise.all — so waiting on the page's own ready flag is waiting for
     them. Without it every circle check would read the markup. */
  await page.waitForFunction(() => window._dbReady === true
    || (typeof _dbReady !== 'undefined' && _dbReady), { timeout: 25000 }).catch(() => {});
  await page.evaluate(() => { try { isNopsAdmin = true; } catch (_) {} });
  if (where === 'setting') {
    await page.evaluate(() => { try { switchTab('setting', null); } catch (_) {} });
  } else {
    await page.evaluate(() => { try { switchTab('payroll', null); } catch (_) {} });
  }
  return { page, errs };
}

/* ── What is on screen ─────────────────────────────────────────────────── */

// The circles actually showing, in the order they are drawn.
const circles = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#nursery-circles .nursery-circle')]
    .filter(b => getComputedStyle(b).display !== 'none')
    .map(b => b.dataset.n));

/* The side bar's JOB list, by label, in the order it is drawn — read out of
   the bar a job button is actually in. `#sm-nav .pn-sub .pn-subtab` is the
   wrong selector and finding that out is half of what this file is for:
   there are TWO of those bars, and Work Record's Monthly Records / Monthly
   Performance are in the other one. */
const subnav = (page) => page.evaluate(() => {
  const first = document.getElementById('pn-subtab-pd');
  const box = first && first.parentNode;
  if (!box) return 'no job bar on the page';
  return [...box.querySelectorAll('.pn-subtab')].map(b => b.textContent.trim());
});

/* A CHECK MUST FAIL BY NAME, never take the harness down. On the previous
   code jsEdit, jsSave and the card itself do not exist, and an unguarded
   page.evaluate throws out of the whole file — every check under it never
   asked, which proves nothing about what it used to do. */
const ev = async (page, fn, arg) => {
  try { return await page.evaluate(fn, arg); }
  catch (e) { return 'threw: ' + String(e.message || e).split('\n')[0]; }
};
const rowLens = (rows) => Array.isArray(rows) ? rows.map(r => r[2].length) : rows;

const openJob = async (page, key) =>
  ev(page, (k) => { switchPayrollView(k); }, key);

const scopes = (page) => page.evaluate((ks) => {
  if (typeof jobScopeOf !== 'function') return 'no jobScopeOf in this build';
  const o = {}; ks.forEach(k => { o[k] = jobScopeOf(k); }); return o;
}, JOBS);

const rowsOf = (page) => ev(page, () => {
  const box = document.getElementById('js-set-body');
  if (!box) return 'no #js-set-body on the page';
  return [...box.querySelectorAll('.jb-row')].map(r => [
    (r.querySelector('.jb-lab b') || {}).textContent || '',
    (r.querySelector('.jb-lab span') || {}).textContent || '',
    [...r.querySelectorAll('.jb-chip')].map(c => c.textContent.trim()),
  ]);
});

/* THE REAL HANDLERS. A dispatched DragEvent fires the inline ondragstart /
   ondragover / ondrop, so this is the board's own code and not a shortcut
   past it. The row is found by its LABEL, which is what somebody aims at. */
const drag = (page, label, row) => ev(page, ({ label, row }) => {
  const chip = [...document.querySelectorAll('#js-set-body .jb-chip')]
    .find(c => c.textContent.trim() === label);
  const cell = [...document.querySelectorAll('#js-set-body .jb-row')]
    .find(r => ((r.querySelector('.jb-lab b') || {}).textContent || '').trim() === row);
  if (!chip) return 'no chip reading ' + label;
  if (!cell) return 'no row reading ' + row;
  const dt = new DataTransfer();
  const ev = (type, el) => el.dispatchEvent(new DragEvent(type,
    { dataTransfer: dt, bubbles: true, cancelable: true }));
  ev('dragstart', chip);
  const target = cell.querySelector('.jb-cell');
  ev('dragover', target);
  ev('drop', target);
  ev('dragend', chip);
  return 'dropped';
}, { label, row });

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  /* ── 1. NOBODY HAS KEYED ANYTHING, so nothing moves ─────────────────── */
  console.log('— 1. an unkeyed database behaves exactly as it did before');
  {
    const { page, errs } = await boot(browser, {}, 'payroll');

    check('every job falls back to where it has always been',
      await scopes(page),
      { pd: 'main', manuring: 'main', weeding: 'main', interrow: 'main',
        loading_seedlings: 'main', transplanting: 'main', cull_incentive: 'main',
        seed_planting: 'pre' });

    check('a main nursery job offers the three main nurseries and not PN',
      await (async () => { await openJob(page, 'pd'); return circles(page); })(),
      ['BNN', 'UNN1', 'UNN2']);

    check('Seed Planting offers the Pre Nursery alone',
      await (async () => { await openJob(page, 'seed_planting'); return circles(page); })(),
      ['PN']);

    check('and the nursery moved with it, rather than staying on one no circle shows',
      await ev(page, () => getNursery()), 'PN');

    /* THE LINE OVER THE SHEET SAYS WHAT THE CIRCLES SAY. On the Pre
       Nursery it is the sentence it has always been. */
    check('the Seed Planting line still names the Pre Nursery',
      await page.evaluate(() => /Pre Nursery \(Pre Nursery\)/.test(
        (document.getElementById('payroll-form-line') || {}).textContent || '')),
      true);

    check('Work Records gets every nursery back',
      await (async () => { await ev(page, () => switchTab('record', null));
                           return circles(page); })(),
      ['PN', 'BNN', 'UNN1', 'UNN2']);

    check('no page error', errs, []);
    await page.close();
  }

  /* ── 2. THE SIDE BAR IS ONE ALPHABETICAL LIST ───────────────────────── */
  console.log('— 2. one list, alphabetical, and no Pre / Main headings');
  {
    const { page, errs } = await boot(browser, {}, 'payroll');

    check('both group headings are gone from the job list',
      await page.evaluate(() =>
        document.querySelectorAll('#sm-nav .pn-sub .pn-subgroup').length), 0);

    const en = await subnav(page);
    check('all eight jobs are still in the list', en.length, 8);
    check('and they are in alphabetical order', en,
      en.slice().sort((a, b) => a.localeCompare(b, 'en')));

    /* THE ORDER IS A FACT ABOUT THE LABELS, so the language toggle moves
       it — which is the whole reason it is not written into the markup. */
    const bm = await page.evaluate(async () => { setLang('bm'); return null; })
      .then(() => subnav(page));
    check('Malay is alphabetical in Malay', bm,
      bm.slice().sort((a, b) => a.localeCompare(b, 'ms')));
    check('and it is a different order from the English one',
      JSON.stringify(bm) !== JSON.stringify(en), true);

    check('no page error', errs, []);
    await page.close();
  }

  /* ── 3. THE SETTING CARD, AND THE DRAG ──────────────────────────────── */
  console.log('— 3. the card, the drag and the save');
  {
    const db = {};
    const { page, errs } = await boot(browser, db, 'setting');

    const r0 = await rowsOf(page);
    check('three rows, each naming the nurseries it means',
      Array.isArray(r0) ? r0.map(r => [r[0], r[1]]) : r0,
      [['Pre Nursery', 'PN'],
       ['Main Nursery', 'BNN · UNN 1 · UNN 2'],
       ['Both', 'PN · BNN · UNN 1 · UNN 2']]);

    check('the jobs start where they have always been', rowLens(r0), [1, 7, 0]);

    check('Edit is offered in the corner',
      await ev(page, () => !!document.querySelector('#js-set-corner button')), true);

    /* NOTHING IS DRAGGABLE UNTIL EDIT IS PRESSED. A chip that moves on a
       card nobody opened is a decision made by accident. */
    check('a chip is not draggable while the card is only being read',
      await ev(page, () =>
        [...document.querySelectorAll('#js-set-body .jb-chip')]
          .every(c => c.getAttribute('draggable') === null)), true);

    await ev(page, () => jsEdit());
    check('editing makes them draggable',
      await ev(page, () =>
        [...document.querySelectorAll('#js-set-body .jb-chip')]
          .every(c => c.getAttribute('draggable') === 'true')), true);

    check('P & D drags onto the Pre Nursery row',
      await drag(page, 'P & D — Spraying', 'Pre Nursery'), 'dropped');
    check('and the chip is in that row now', rowLens(await rowsOf(page)), [2, 6, 0]);

    /* A DRAFT WRITES NOTHING. Eight round trips, one per chip somebody
       tried, is a board that fights back — and a move stored before Save
       cannot be cancelled. */
    check('nothing has been written yet',
      await page.evaluate(() => (window.__WRITES || []).length), 0);

    check('Cancel puts it back',
      await (async () => { await ev(page, () => jsCancel());
                           return rowLens(await rowsOf(page)); })(),
      [1, 7, 0]);

    await ev(page, () => jsEdit());
    await drag(page, 'P & D — Spraying', 'Pre Nursery');
    await drag(page, 'Transplanting', 'Both');
    await ev(page, () => jsSave());
    await page.waitForFunction(() => !!(window.__WRITES || []).length, { timeout: 8000 })
      .catch(() => {});

    /* SAVE WRITES ALL EIGHT. A board half keyed and half falling through
       to the code is two rules for one screen, and pressing Save IS being
       asked — so this is not seeding a default into an unasked row. */
    check('one nops_maint_config row per job, keyed on key',
      await ev(page, () => {
        const w = (window.__WRITES || []).filter(x => x[0] === 'nops_maint_config');
        if (!w.length) return 'nothing was written';
        const last = w[w.length - 1];
        return [last[1], last[2].length,
                last[2].map(r => [r.key, r.txt_value]).sort((a, b) => a[0].localeCompare(b[0]))];
      }),
      ['key', 8, [
        ['job_scope:cull_incentive', 'main'],
        ['job_scope:interrow', 'main'],
        ['job_scope:loading_seedlings', 'main'],
        ['job_scope:manuring', 'main'],
        ['job_scope:pd', 'pre'],
        ['job_scope:seed_planting', 'pre'],
        ['job_scope:transplanting', 'both'],
        ['job_scope:weeding', 'main'],
      ]]);

    check('the card goes back to reading, with Edit in the corner',
      await ev(page, () => [
        !!document.querySelector('#js-set-corner button'),
        !!document.getElementById('js-save-btn')]),
      [true, false]);

    /* AND THE CIRCLES MOVED. A setting saved and not obeyed is the fault
       this codebase has a heading about. */
    check('P & D now offers the Pre Nursery alone',
      await (async () => { await ev(page, () => switchTab('payroll', null));
                           await openJob(page, 'pd'); return circles(page); })(),
      ['PN']);
    check('and Transplanting, in both rows, offers all four',
      await (async () => { await openJob(page, 'transplanting'); return circles(page); })(),
      ['PN', 'BNN', 'UNN1', 'UNN2']);

    check('no page error', errs, []);
    await page.close();
  }

  /* ── 4. A KEYED SCOPE IS READ AT BOOT ───────────────────────────────── */
  console.log('— 4. what is keyed is what the page opens on');
  {
    const { page, errs } = await boot(browser, {
      nops_maint_config: [
        { key: 'pump_coverage', num_value: 800 },
        { key: 'job_scope:pd', txt_value: 'both' },
        { key: 'job_scope:seed_planting', txt_value: 'main' },
        { key: 'job_scope:weeding', txt_value: 'nowhere' },   // not a row — ignored
        { key: 'job_scope:not_a_job', txt_value: 'pre' },     // not a job — ignored
      ],
    }, 'payroll');

    check('the keyed rows are read and the nonsense ones are not',
      await scopes(page),
      { pd: 'both', manuring: 'main', weeding: 'main', interrow: 'main',
        loading_seedlings: 'main', transplanting: 'main', cull_incentive: 'main',
        seed_planting: 'main' });

    check('P & D opens on all four',
      await (async () => { await openJob(page, 'pd'); return circles(page); })(),
      ['PN', 'BNN', 'UNN1', 'UNN2']);

    check('Seed Planting dragged to the main nursery offers the three',
      await (async () => { await openJob(page, 'seed_planting'); return circles(page); })(),
      ['BNN', 'UNN1', 'UNN2']);

    /* THE LINE CANNOT SAY PRE NURSERY OVER BNN CIRCLES. The sheet's rows
       are keyed on the batch and the job and on no nursery at all, so the
       one thing it can do is name the nursery that is picked. */
    check('and its line names that nursery instead of the Pre Nursery',
      await ev(page, () => {
        const s = (document.getElementById('payroll-form-line') || {}).textContent || '';
        return [/Pre Nursery/.test(s), /Nursery/.test(s)];
      }),
      [false, true]);

    check('the pump coverage beside them still reads',
      await ev(page, () => pumpCoverage), 800);

    check('no page error', errs, []);
    await page.close();
  }

  /* ── 5. A NURSERY SOMEBODY CHOSE IS NOT WALKED AWAY FROM THEM ───────── */
  console.log('— 5. the picked nursery survives a job that does not have it');
  {
    const { page, errs } = await boot(browser, {}, 'payroll');
    await openJob(page, 'pd');
    await ev(page, () => pickNursery('UNN1'));
    await openJob(page, 'seed_planting');
    check('Seed Planting forces PN', await ev(page, () => getNursery()), 'PN');
    await openJob(page, 'pd');
    check('and P & D goes back to the UNN 1 that was chosen, not to BNN',
      await ev(page, () => getNursery()), 'UNN1');
    check('no page error', errs, []);
    await page.close();
  }

  /* ── 6. IT FAILS OPEN ───────────────────────────────────────────────── */
  console.log('— 6. a database that cannot answer behaves as it did before');
  {
    const { page, errs } = await boot(browser,
      { __NOCOL: { nops_maint_config: ['txt_value'] },
        nops_maint_config: [{ key: 'pump_coverage', num_value: 640 }] }, 'payroll');

    check('a config table with no txt_value reads every job at its default',
      await scopes(page),
      { pd: 'main', manuring: 'main', weeding: 'main', interrow: 'main',
        loading_seedlings: 'main', transplanting: 'main', cull_incentive: 'main',
        seed_planting: 'pre' });

    /* AND THE REST OF THE ROW IS STILL READ. Falling back to the columns
       that predate the scopes is what keeps the pump coverage working on a
       database this change has not reached. */
    check('and the pump coverage still comes through the fallback',
      await ev(page, () => pumpCoverage), 640);

    const gone = await boot(browser, { __MISSING: ['nops_maint_config'] }, 'payroll');
    check('a config table that is not there at all is the same answer',
      await scopes(gone.page),
      { pd: 'main', manuring: 'main', weeding: 'main', interrow: 'main',
        loading_seedlings: 'main', transplanting: 'main', cull_incentive: 'main',
        seed_planting: 'pre' });
    check('no page error', errs.concat(gone.errs), []);
    await gone.page.close();
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
