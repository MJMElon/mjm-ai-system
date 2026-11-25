/* EACH JOB HAS ITS OWN WORKER LIST — Settings → Worker List for Each Job.

   The office: "I drag the BNN-Worker to PxD part. So the worker activity
   for pxd worker name list will show all BNN worker name."

   Drives the REAL page and the REAL drag handlers (a DragEvent dispatched
   at the palette chip and the cell), then opens the P & D sheet and reads
   the columns it drew. The claim half lifts maintJobNames out of the
   shipped npayroll_script.js and asks it the same question.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/each_job_has_its_own_worker_list.cjs
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
        /* An update and an insert LAND, or a Save that saves nothing reads
           exactly like one that worked. */
        if (st.op === 'update') {
          tbl().filter(match).forEach(r => Object.assign(r, st.patch));
          return { data: [], error: null };
        }
        if (st.op === 'insert') {
          const t = tbl();
          st.rows.forEach(r => t.push(Object.assign({ id: 900 + t.length }, r)));
          return { data: st.rows, error: null };
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
        if (p === 'update') return (patch) => { st.op = 'update'; st.patch = patch; return q; };
        if (p === 'insert') return (rows) => { st.op = 'insert';
          st.rows = Array.isArray(rows) ? rows : [rows]; return q; };
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


const ev = async (page, fn, arg) => {
  try { return await page.evaluate(fn, arg); }
  catch (e) { return 'threw: ' + String(e.message || e).split('\n')[0]; }
};

const REGISTER = [
  { id: 1, full_name: 'Andi Rosmini', section: 'BNN', role: 'General Worker', active: true },
  { id: 2, full_name: 'Yuyak',        section: 'BNN', role: 'General Worker', active: true },
  { id: 3, full_name: 'Lalu Aenal',   section: 'BNN', role: 'Field Conductor', active: true },
  { id: 4, full_name: 'Wira UNE',     section: 'UNE', role: 'General Worker', active: true },
  { id: 5, full_name: 'Budi UNN1',    section: 'UNN 1', role: 'General Worker', active: true },
];

/* The worker columns the P & D sheet drew for BNN, read off the table. */
const sheetCols = (page, job) => ev(page, (job) => {
  switchTab('payroll', null);
  switchPayrollView(job);
  const tbl = document.getElementById('payroll-table');
  if (!tbl) return 'no table';
  const txt = tbl.textContent;
  return ['Andi Rosmini', 'Yuyak', 'Lalu Aenal', 'Wira UNE', 'Budi UNN1'].filter(n => txt.includes(n));
}, job);

const drag = (page, label, cell) => ev(page, ({ label, cell }) => {
  const chip = [...document.querySelectorAll('#jc-set-body .jc-pal .jc-chip')]
    .find(c => c.textContent.replace(/\s+\d+$/, '').trim() === label);
  const td = document.querySelector(`#jc-set-body td[data-cell="${cell}"]`);
  if (!chip) return 'no palette chip ' + label;
  if (!td) return 'no cell ' + cell;
  const dt = new DataTransfer();
  const fire = (type, el) => el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  fire('dragstart', chip); fire('dragover', td); fire('drop', td); fire('dragend', chip);
  return 'dropped';
}, { label, cell });
const cellChips = (page, cell) => ev(page, (cell) => {
  const td = document.querySelector(`#jc-set-body td[data-cell="${cell}"]`);
  if (!td) return 'no cell ' + cell;
  return [...td.querySelectorAll('.jc-chip')].map(c => c.childNodes[0].textContent.trim());
}, cell);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('— 1. nothing keyed: every sheet reads what it read before');
  {
    const { page, errs } = await boot(browser, { mjmnpayroll_workers: REGISTER }, 'payroll');
    check('BNN P & D shows its general workers, and only them', await sheetCols(page, 'pd'), ['Andi Rosmini', 'Yuyak']);
    check('no page error', errs, []);
    await page.close();
  }

  console.log('— 2. drag groups onto P & D for BNN, save, and the sheet follows');
  {
    const db = { mjmnpayroll_workers: REGISTER, nops_maint_config: [] };
    const { page, errs } = await boot(browser, db, 'setting');
    check('the card is on Settings', await ev(page, () => !!document.getElementById('jc-set-body')), true);
    /* THE DEFAULT CHIPS ARE OFF — *"default的全部不要 我自己drag"*. Eighteen
       dashed `BNN · Workers DEFAULT` chips made a table nobody had touched
       look full, so the cells that ARE set could not be picked out. An
       unkeyed cell is EMPTY now, and what it does is said once under the
       table instead of eighteen times inside it. */
    check('an unkeyed cell is empty — no default chip anywhere on it',
      await ev(page, () => { const td = document.querySelector('#jc-set-body td[data-cell="pd"]');
        return td ? [td.querySelectorAll('.jc-chip').length, td.textContent.trim()] : 'no cell'; }),
      [0, '']);
    check('…and the word DEFAULT is nowhere on the card',
      await ev(page, () => /default/i.test(document.getElementById('jc-set-body').textContent)), false);
    /* NO NURSERY COLUMNS — *"我上面已经有PN BNN UNN1 UNN2的分类了 底下不需要
       再分"*. The palette is already laid out section by section and every
       chip is spelled with its own, so a BNN column holding a chip that
       says BNN said nothing a reader did not have, over thirty-two cells. */
    check('the table has no nursery columns: the chip is what says the nursery',
      await ev(page, () => [...document.querySelectorAll('#jc-set-body .jc-tbl thead th')].map(t => t.textContent.trim())),
      ['Job', 'Who does it']);
    check('…so a job is ONE cell', await ev(page, () => {
      const tr = [...document.querySelectorAll('#jc-set-body .jc-tbl tbody tr')]
        .find(x => /P & D/.test(x.querySelector('th.jc-job').textContent));
      return tr ? tr.querySelectorAll('td').length : 'no row'; }), 1);
    check('…but the card still says what an empty cell does',
      await ev(page, () => /unchanged/i.test((document.querySelector('#jc-set-body .jc-empty-note') || {}).textContent || '')), true);
    /* THE NAME AND NOTHING ELSE — the office took the people-count off
       (*"名字后面的人数也不用"*). It moved with the register and was not
       what somebody dragging is choosing; the names are on the hover. */
    check('the palette offers the Team Board groups, named and nothing more',
      await ev(page, () => [...document.querySelectorAll('#jc-set-body .jc-pal .jc-chip')].map(c => c.textContent.replace(/\s+/g, ' ').trim())),
      ['BNN · FC', 'BNN · Workers', 'UNN 1 · Workers', 'UNE · Workers']);
    check('…and the names are still on the hover',
      await ev(page, () => { const c = [...document.querySelectorAll('#jc-set-body .jc-pal .jc-chip')]
        .find(x => x.textContent.trim() === 'BNN · Workers');
        return c ? c.getAttribute('title') : 'no chip'; }),
      'Andi Rosmini, Yuyak');
    /* An empty cell before and after proves nothing on its own, so the gate
       is asked as the DRAFT not existing — and the same drag landing one
       line down, once Edit is pressed, is the control. */
    check('a drop before Edit does nothing',
      await (async () => { await drag(page, 'UNE · Workers', 'pd');
        return [await cellChips(page, 'pd'), await ev(page, () => jobCrewDraft)]; })(),
      [[], null]);
    if (process.env.SHOT) { await ev(page, () => document.getElementById('jc-set-body').scrollIntoView()); await page.screenshot({ path: process.env.SHOT + '/jc_view.png' }); }
    await ev(page, () => jcEdit());
    check('drop UNE · Workers on BNN P & D', await drag(page, 'UNE · Workers', 'pd'), 'dropped');
    check('drop BNN · FC on BNN P & D', await drag(page, 'BNN · FC', 'pd'), 'dropped');
    /* WHAT YOU SEE IS WHAT YOU GET. A drop onto an empty cell used to be
       added to the default, which was honest while the default was a chip
       in the cell and is a lie once it is blank — so BNN's own workers are
       NOT quietly in here beside the two that were dropped. */
    check('the cell carries exactly what was dropped, and not the old default',
      await cellChips(page, 'pd'), ['UNE · Workers', 'BNN · FC']);
    check('dropping the same group twice adds it once', await (async () => { await drag(page, 'BNN · FC', 'pd'); return (await cellChips(page, 'pd')).length; })(), 2);
    check('Manuring was not touched', await cellChips(page, 'manuring'), []);
    if (process.env.SHOT) { await ev(page, () => document.getElementById('jc-set-body').scrollIntoView()); await page.screenshot({ path: process.env.SHOT + '/jc_edit.png' }); }
    check('nothing was written before Save', await ev(page, () => (window.__WRITES || []).length), 0);
    await ev(page, () => jcSave());
    await page.waitForTimeout(300);
    check('Save wrote the cell as its groups',
      await ev(page, () => (window.__DB.nops_maint_config.find(r => r.key === 'job_crew:BNN:pd') || {}).txt_value),
      'UNE|General Worker,BNN|Field Conductor');
    /* THE DROP WORKED THE NURSERY OUT OF THE CHIP. `BNN · FC` is BNN's, so
       it was keyed against BNN and nowhere else — exactly what dropping it
       in the BNN column did. `UNE · Workers` belongs to no P & D nursery,
       so it has no sheet of its own and goes on all three; that is the
       crew that comes over to help, and a chip that landed nowhere would
       be one sitting on the card doing nothing. */
    check('…UNE, which is on no P & D nursery, was keyed against all three',
      await ev(page, () => ['BNN', 'UNN1', 'UNN2'].map(n =>
        (window.__DB.nops_maint_config.find(r => r.key === 'job_crew:' + n + ':pd') || {}).txt_value)),
      ['UNE|General Worker,BNN|Field Conductor', 'UNE|General Worker', 'UNE|General Worker']);
    check('and a cell nobody dragged into as DEFAULT',
      await ev(page, () => (window.__DB.nops_maint_config.find(r => r.key === 'job_crew:BNN:manuring') || {}).txt_value), 'default');
    check('BNN P & D now shows the UNE crew and its FC, and not its own workers',
      await sheetCols(page, 'pd'), ['Lalu Aenal', 'Wira UNE']);
    /* THE RULE THE DEFAULT CHIPS WERE ONLY EVER A PICTURE OF. Taking them
       off is paint; an untouched cell still falls back to the nursery's own
       list, or six jobs in three nurseries would empty themselves — and the
       claim with them — between the deploy and eighteen drags. */
    check('BNN Manuring is unchanged, although its cell is empty', await sheetCols(page, 'manuring'), ['Andi Rosmini', 'Yuyak']);
    check('no page error', errs, []);
    await page.close();
  }

  /* ── 2b. THE TWO THINGS THE EMPTY CELLS MUST NOT HAVE BROKEN ────────────
     Pressing Save on a table of empty cells must change no sheet, because
     an empty cell is nobody having been asked and not nobody; and a drag
     of the nursery's OWN workers must be stored as a drag, where it used
     to serialise as DEFAULT — invisible while the default was a chip, and
     with the chip gone it would read as the drag being thrown away. */
  console.log('— 2b. Save with nothing dragged moves nothing, and an own-workers drag is stored');
  {
    const db = { mjmnpayroll_workers: REGISTER, nops_maint_config: [] };
    const { page, errs } = await boot(browser, db, 'setting');
    await ev(page, () => { jcEdit(); jcSave(); });
    await page.waitForTimeout(300);
    check('every cell nobody touched is written as DEFAULT',
      await ev(page, () => (window.__DB.nops_maint_config || [])
        .filter(r => r.key.indexOf('job_crew:') === 0)
        .every(r => r.txt_value === 'default')), true);
    check('…and every sheet reads exactly what it read before',
      [await sheetCols(page, 'pd'), await sheetCols(page, 'manuring')],
      [['Andi Rosmini', 'Yuyak'], ['Andi Rosmini', 'Yuyak']]);

    await ev(page, () => { switchTab('setting', null); jcEdit(); });
    check('drop BNN · Workers on BNN Weeding', await drag(page, 'BNN · Workers', 'weeding'), 'dropped');
    await ev(page, () => jcSave());
    await page.waitForTimeout(300);
    check('it is stored as the group, never folded back into DEFAULT',
      await ev(page, () => (window.__DB.nops_maint_config.find(r => r.key === 'job_crew:BNN:weeding') || {}).txt_value),
      'BNN|General Worker');
    check('…so the chip is still on the cell after the save',
      await cellChips(page, 'weeding'), ['BNN · Workers']);
    check('and the sheet reads the same either way', await sheetCols(page, 'weeding'), ['Andi Rosmini', 'Yuyak']);
    check('no page error', errs, []);
    await page.close();
  }

  console.log('— 3. a saved list survives a reload, and a group taken off leaves');
  {
    const db = { mjmnpayroll_workers: REGISTER, nops_maint_config: [
      { key: 'job_crew:BNN:pd', txt_value: 'UNE|General Worker' },
      { key: 'job_crew:BNN:weeding', txt_value: 'default' } ] };
    const { page, errs } = await boot(browser, db, 'setting');
    check('the keyed list replaces the default', await cellChips(page, 'pd'), ['UNE · Workers']);
    check('BNN P & D shows only the UNE crew', await sheetCols(page, 'pd'), ['Wira UNE']);
    check('DEFAULT reads as nobody having been asked', await sheetCols(page, 'weeding'), ['Andi Rosmini', 'Yuyak']);
    await ev(page, () => { switchTab('setting', null); jcEdit(); });
    await ev(page, () => document.querySelector('#jc-set-body td[data-cell="pd"] .jc-x').click());
    check('× takes the group off', await cellChips(page, 'pd'), []);
    await ev(page, () => jcSave()); await page.waitForTimeout(300);
    check('an emptied cell is saved as nobody', await ev(page, () => (window.__DB.nops_maint_config.find(r => r.key === 'job_crew:BNN:pd') || {}).txt_value), '');
    check('and the sheet has no worker columns', await sheetCols(page, 'pd'), []);
    check('no page error', errs, []);
    await page.close();
  }

  console.log('— 4. the salary claim pays the same list');
  {
    const page = await browser.newPage();
    await page.goto('http://localhost:8777/index.html').catch(() => {});
    await page.addScriptTag({ url: 'http://localhost:8777/shared/shared_job_crew.js' }).catch(() => {});
    const got = await ev(page, async () => {
      const src = await (await fetch('/npayroll/npayroll_script.js')).text();
      const lift = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return '';
        let d = 0, j = src.indexOf('{', src.indexOf(')', i)); for (let k = j; k < src.length; k++) {
          if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } return ''; };
      const code = ['_rowsOnMonth', 'maintWorkerNames', 'maintJobNames', 'maintClaimNames', 'registerNurseryKey', 'isGeneralWorker'].map(lift);
      if (code.some(c => !c)) return 'previous build: ' + ['_rowsOnMonth', 'maintJobNames', 'maintClaimNames'].filter((n, i) => !lift(n)).join(', ') + ' missing';
      const workers = [
        { full_name: 'Andi Rosmini', section: 'BNN', role: 'General Worker' },
        { full_name: 'Yuyak', section: 'BNN', role: 'General Worker' },
        { full_name: 'Lalu Aenal', section: 'BNN', role: 'Field Conductor' },
        { full_name: 'Wira UNE', section: 'UNE', role: 'General Worker' } ];
      /* `BNN:pd` IS THE STORAGE KEY and not a cell on the card. The card
         lost its nursery columns, so its cells are keyed by JOB — the
         storage never moved, and the claim reads it per nursery as it
         always has. */
      const maint = { rows: { BNN: workers.slice(0, 2) }, workers: {}, crews: { 'BNN:pd': ['UNE|General Worker', 'BNN|Field Conductor'] } };
      const MAINT_TYPES = [{ code: 'pd' }, { code: 'manuring' }];
      const ROLES = ['Field Conductor', 'General Worker'];
      const MAINT_ROLE = /^general\s*worker$/i, NON_GENERAL_ROLE = /conductor/i;
      const roleOf = w => String(w.role || '').trim();
      const isKnownRole = r => ROLES.some(x => x.toLowerCase() === String(r).trim().toLowerCase());
      const f = new Function('maint', 'workers', 'MAINT_TYPES', 'ROLES', 'MAINT_ROLE', 'NON_GENERAL_ROLE', 'roleOf', 'isKnownRole',
        code.join('\n') + '; return [maintJobNames("BNN","2026-11","pd"), maintJobNames("BNN","2026-11","manuring"), maintClaimNames("BNN","2026-11")];');
      return f(maint, workers, MAINT_TYPES, ROLES, MAINT_ROLE, NON_GENERAL_ROLE, roleOf, isKnownRole);
    });
    check('P & D is priced on the keyed list, Manuring on the old one, and the claim has a line for all',
      got, [['Lalu Aenal', 'Wira UNE'], ['Andi Rosmini', 'Yuyak'], ['Andi Rosmini', 'Yuyak', 'Lalu Aenal', 'Wira UNE']]);
    await page.close();
  }

  /* ── 5. EVERY JOB ON WORKER ACTIVITY IS ON THIS CARD ───────────────────
     The office counted the two lists against each other and found this one
     two short — "这一部分少了culling和seed planting 吧". The two are there
     now, SAYING where their crew is set instead of offering a drop that
     would be a second writer.

     IT IS ASKED AS "EVERY SHEET IS ON THE CARD", not as "these two rows
     exist": a ninth sheet added next year is short again under a check
     that names the two, and the whole fault was a list going quietly
     short. */
  console.log('— 5. every Worker Activity sheet is on the card, draggable or not');
  {
    const { page, errs } = await boot(browser, { mjmnpayroll_workers: REGISTER, nops_maint_config: [] }, 'setting');
    const rows = await ev(page, () => [...document.querySelectorAll('#jc-set-body .jc-tbl tbody tr')]
      .map(tr => ({
        job: tr.querySelector('th.jc-job').textContent.trim(),
        elsewhere: tr.classList.contains('jc-elsewhere'),
        cells: [...tr.querySelectorAll('td')].length,
        /* The row's own cell — it carried a colspan while the table had
           nursery columns, and there is one column to span now. */
        says: (tr.querySelector('td') || {}).textContent || '',
      })));
    /* THE SIDE BAR ITSELF, never PAYROLL_VIEW_KEYS — that is a script-scope
       const and so is not on window (the trap this codebase already names
       about seedAuditPhotoState), and it is also the list the office
       actually counted.

       FOUND THROUGH ONE OF ITS OWN BUTTONS, never by `.pn-sub`: there are
       TWO of those bars and the other is Work Records, which answered this
       with Monthly Watering Record on it. `_syncSubNav` says the same in
       its own comment. */
    const sheets = await ev(page, () => {
      const bar = document.getElementById('pn-subtab-pd').closest('.pn-sub');
      return [...bar.querySelectorAll('.pn-subtab')].map(b => b.textContent.trim());
    });
    check('the card lists every sheet the side bar does',
      (rows || []).map(r => r.job).sort(), (sheets || []).sort());
    /* SEVEN take a drop. Seed Planting joined them when the office said the
       Pre Nursery has no crew of its own and other positions take turns —
       section 6 is that half. Culling Monitoring is the one left, and it
       cannot join: a group carries no price. */
    check('…and seven of them take a drop, which is the Team Board half',
      (rows || []).filter(r => !r.elsewhere).length, 7);
    check('…and the one that cannot says so instead',
      (rows || []).filter(r => r.elsewhere).map(r => r.job),
      ['Culling Monitoring']);
    check('a row set elsewhere is ONE cell, like every other row',
      (rows || []).filter(r => r.elsewhere).map(r => r.cells), [1]);
    check('Culling Monitoring presets nothing: empty until a group is dragged on',
      (rows || []).filter(r => r.elsewhere).map(r => r.says.trim()), ['']);

    /* THE DROP IS THE THING THAT MUST NOT WORK. A row that merely LOOKS
       different while still taking a group would write a crew nothing
       reads, which is worse than the silence it replaced. */
    await ev(page, () => jcEdit());
    check('no drop target on a row set elsewhere',
      await ev(page, () => document.querySelectorAll('#jc-set-body tr.jc-elsewhere td[data-cell]').length), 0);
    check('and nothing can be keyed against it',
      await ev(page, () => ['cull_incentive']
        .filter(j => Object.keys(jobCrewDraft || {}).some(k => k.endsWith(':' + j)))), []);
    await ev(page, () => jcSave());
    await page.waitForTimeout(300);
    check('Save writes a row for the seven and none for it',
      await ev(page, () => (window.__DB.nops_maint_config || [])
        .map(r => r.key).filter(k => k.indexOf('job_crew:') === 0)
        .some(k => /cull_incentive/.test(k))), false);
    if (process.env.SHOT) { await ev(page, () => document.getElementById('jc-set-body').scrollIntoView()); await page.screenshot({ path: process.env.SHOT + '/jc_elsewhere.png' }); }
    check('no page error', errs, []);
    await page.close();
  }

  /* ── 6. SEED PLANTING: THE DRAG SAYS WHO MAY BE PICKED ─────────────────
     The office, when told PN had no Workers to drag:

       "pre nursery 是没有工人的 是由别的职位轮流去做 但是有些职位不能做
        所以要drag"
       "例如我drag BNN worker UNN1 worker UNN2 worker 过去seed planting,
        admin drag down 可以看到这三个职位，她可以选这个月是谁"
       "选了后 名单就会出来 admin就可以tick 人"

     So it is NOT the other six: the groups narrow the sheet's own dropdown
     and the month list the office picks is still what the columns are. */
  console.log('— 6. Seed Planting takes a drag, and it narrows the dropdown');
  {
    const db = { mjmnpayroll_workers: REGISTER, nops_maint_config: [] };
    const { page, errs } = await boot(browser, db, 'setting');
    const row = () => ev(page, () => {
      const tr = [...document.querySelectorAll('#jc-set-body .jc-tbl tbody tr')]
        .find(x => /Seed Planting/.test(x.querySelector('th.jc-job').textContent));
      if (!tr) return 'no Seed Planting row';
      return {
        elsewhere: tr.classList.contains('jc-elsewhere'),
        pn: (tr.querySelector('td[data-cell="seed_planting"]') || {}).textContent || '',
        cells: tr.querySelectorAll('td').length,
      };
    });
    const r0 = await row();
    check('it is a droppable row now, not one set elsewhere', (r0 || {}).elsewhere, false);
    /* ONE cell, like every other row: the nursery columns are gone and
       Where Each Job Is Done above is what says this job is PN only. */
    check('…and ONE cell, the nursery columns having gone', (r0 || {}).cells, 1);
    /* THE DEFAULT IS NOT "PN · Workers". PN has no Workers — that is the
       office's own first sentence — so a group chip there would stand for
       nobody. It says what the dropdown has always offered instead. */
    check('the default is everybody, never an empty PN · Workers chip',
      [/Everybody on the register/.test((r0 || {}).pn || ''), /Workers/.test((r0 || {}).pn || '')],
      [true, false]);

    /* THE DROPDOWN BEFORE ANY DRAG: everybody, by register section. */
    /* THE SHEET LOADS ITS MONTH ASYNCHRONOUSLY, so the FIRST open has no
       dropdown yet — later ones read a cached month and answer at once. A
       check that did not wait would read the race rather than the rule. */
    const picker = async () => {
      await ev(page, () => { switchTab('payroll', null); switchPayrollView('seed_planting'); });
      await page.waitForSelector('#sp-new-name', { timeout: 8000 }).catch(() => {});
      return ev(page, () => {
      const sel = document.getElementById('sp-new-name');
      if (!sel) return 'no #sp-new-name';
      /* The dropdown is the groups; each group's people are the ticks
         drawn when it is picked, read here off what was drawn. */
      return (typeof _spBands === 'undefined' ? [] : _spBands)
        .map(g => g.label + ': ' + g.names.join(', '));
      });
    };
    check('unkeyed, it offers everybody by section', await picker(),
      ['BNN: Andi Rosmini, Lalu Aenal, Yuyak', 'UNE: Wira UNE', 'UNN 1: Budi UNN1']);

    await ev(page, () => { switchTab('setting', null); jcEdit(); });
    check('BNN · Workers drops onto Seed Planting', await drag(page, 'BNN · Workers', 'seed_planting'), 'dropped');
    check('and UNN 1 · Workers beside it', await drag(page, 'UNN 1 · Workers', 'seed_planting'), 'dropped');
    check('the cell carries the two groups', await cellChips(page, 'seed_planting'),
      ['BNN · Workers', 'UNN 1 · Workers']);
    await ev(page, () => jcSave());
    await page.waitForTimeout(300);
    check('Save wrote them under PN',
      await ev(page, () => (window.__DB.nops_maint_config.find(r => r.key === 'job_crew:PN:seed_planting') || {}).txt_value),
      'BNN|General Worker,UNN1|General Worker');

    /* THE OPTGROUP IS THE GROUP — "可以看到这三个职位" — and the Field
       Conductor is gone, which is the whole of 有些职位不能做. */
    check('the dropdown now shows the dragged GROUPS and only their people',
      await picker(), ['BNN · Workers: Andi Rosmini, Yuyak', 'UNN 1 · Workers: Budi UNN1']);

    /* AND THE COLUMNS ARE STILL THE MONTH LIST, never the groups: two
       people were made eligible and the sheet shows neither until the
       office picks one. That is 轮流, and it is why this is not the
       other six. */
    const cols = () => ev(page, () => {
      const tbl = document.getElementById('payroll-table');
      const txt = tbl ? tbl.textContent : '';
      return ['Andi Rosmini', 'Yuyak', 'Budi UNN1'].filter(n => txt.includes(n));
    });
    check('eligible is not the same as on the sheet', await cols(), []);
    await ev(page, () => {
      const sel = document.getElementById('sp-new-name');
      sel.value = 'g0'; _spPickWorker('g0');
      [...document.querySelectorAll('#sp-pick-list .sp-pick-tick')]
        .forEach(x => { x.checked = x.value === 'Yuyak'; _spTick(x.value, x.checked); });
      addSeedPlantingWorker();
    });
    await page.waitForTimeout(300);
    check('…and the one picked IS', await cols(), ['Yuyak']);
    check('who then leaves the dropdown, being on the list already',
      /Yuyak/.test(JSON.stringify(await picker())), false);
    if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT + '/sp_picker.png' }); }
    check('no page error', errs, []);
    await page.close();
  }

  /* ── 7. CULLING MONITORING IS EDITED HERE TOO ─────────────────────────
     "culling monitoring也要在这里改", then "我drag admin and FC过去culling
     monitoring 这里就会出现他们的名字". A group dropped on that row is its
     PEOPLE, by name: an FC group goes on the Field Conductor list for its
     own nursery, an Admin group on the list paid on every nursery. Saved
     through the card above's own dated writer, so the new rows start at
     this month. */
  console.log('— 7. Culling Monitoring: drag Admin and FC, the names appear and are saved dated');
  {
    const d = new Date();
    const M = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const reg = REGISTER.concat([
      { id: 6, full_name: 'Rousell Wayne', section: 'UNE', role: 'Admin', active: true },
      { id: 7, full_name: 'Florence',      section: 'OTHERS', role: 'Admin', active: true },
      { id: 8, full_name: 'Akbar',         section: 'UNN 1', role: 'Field Conductor', active: true },
    ]);
    const db = { mjmnpayroll_workers: reg, nops_maint_config: [],
      nops_cull_monitoring_rate: [{ id: 1, kind: 'admin', from_month: '2026-01', rm: 20 },
                                  { id: 2, kind: 'fc', from_month: '2026-01', rm: 50 }],
      nops_cull_monitoring_people: [
        { id: 11, kind: 'admin', nursery: '', worker_id: 6, worker_name: 'Rousell Wayne', from_month: '2026-01', until_month: null },
        { id: 12, kind: 'fc', nursery: 'BNN', worker_id: 3, worker_name: 'Lalu Aenal', from_month: '2026-01', until_month: null }] };
    const { page, errs } = await boot(browser, db, 'setting');
    await page.waitForFunction(() => window.MJMCullIncentive && MJMCullIncentive.ruleSource() === 'office',
      { timeout: 8000 }).catch(() => {});
    /* EDIT PRESSED BEFORE THE RULE IS READ still opens the names once it
       lands: the office pressed Edit and the row stayed read-only. */
    await ev(page, () => { MJMCullIncentive.loadRule = ((f) => (s, m) =>
      new Promise(r => setTimeout(r, 400)).then(() => f(s, m)))(MJMCullIncentive.loadRule); });
    await ev(page, () => { cmDraft = null; jobCrewDraft = null; jcEdit(); });
    await page.waitForTimeout(900);
    check('Edit before the rule is read still opens the names', await ev(page, () =>
      [!!cmDraft && cmDraft.viaJc, !!document.querySelector('#jc-set-body tr.jc-cull td.jc-cm-drop')]), [true, true]);
    await ev(page, () => jcCancel());
    const row = () => ev(page, () => { const tr = document.querySelector('#jc-set-body tr.jc-cull');
      return tr ? tr.textContent.replace(/\s+/g, ' ').trim() : 'no row'; });
    check('nothing is preset: nobody has dragged a group here yet ("不要preset")', await row(), 'Culling Monitoring');
    check('the names are on the Culling Monitoring card above', await ev(page, () =>
      /Rousell Wayne/.test(document.getElementById('cm-set-body').textContent)), true);
    await ev(page, () => jcEdit());
    check('Edit opens the names here, not on the card above',
      await ev(page, () => [!!cmDraft && cmDraft.viaJc,
        !!document.querySelector('#jc-set-body tr.jc-cull td.jc-cm-drop'),
        !!document.getElementById('cm-save')]), [true, true, false]);
    check('the row is chips like the rows above, no pickers and no buttons', await ev(page, () =>
      [document.querySelectorAll('#jc-set-body tr.jc-cull select').length,
       document.querySelectorAll('#jc-set-body tr.jc-cull button.row-add').length]), [0, 0]);
    const dropCull = (label) => ev(page, (label) => {
      const chip = [...document.querySelectorAll('#jc-set-body .jc-pal .jc-chip')]
        .find(c => c.textContent.trim() === label);
      const td = document.querySelector('#jc-set-body tr.jc-cull td');
      if (!chip) return 'no palette chip ' + label;
      const dt = new DataTransfer();
      const fire = (type, el) => el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
      fire('dragstart', chip); fire('dragover', td); fire('drop', td); fire('dragend', chip);
      return 'dropped';
    }, label);
    check('drag OTHERS · Admin', await dropCull('OTHERS · Admin'), 'dropped');
    check('drag UNN 1 · FC', await dropCull('UNN 1 · FC'), 'dropped');
    check('drag OTHERS · Admin again adds nobody twice', await dropCull('OTHERS · Admin'), 'dropped');
    const live = () => ev(page, () => cmDraft.people.filter(r => r.active !== false)
      .map(r => r.kind + ':' + (r.nursery || '') + ':' + r.name).sort());
    check('Admin goes on every nursery, FC on its own nursery, nobody twice', await live(),
      ['admin::Florence', 'admin::Rousell Wayne', 'fc:BNN:Lalu Aenal', 'fc:UNN1:Akbar']);
    check('…and the row shows the groups DRAGGED, never a name ("不要自带名字")', await ev(page, () =>
      [...document.querySelectorAll('#jc-set-body tr.jc-cull .jc-chip')].map(c => c.childNodes[0].textContent.trim()).sort()),
      ['OTHERS · Admin', 'UNN 1 · FC']);
    check('the card above shows the new names as they are dragged ("上面的部分也会改")', await ev(page, () =>
      ['Florence', 'Akbar'].map(n => document.getElementById('cm-set-body').textContent.includes(n))), [true, true]);
    await ev(page, () => jcSave());
    await page.waitForTimeout(500);
    check('saved through the dated writer: the two new rows start this month', await ev(page, (M) =>
      window.__DB.nops_cull_monitoring_people.filter(r => r.from_month === M)
        .map(r => r.kind + ':' + r.nursery + ':' + r.worker_name).sort(), M),
      ['admin::Florence', 'fc:UNN1:Akbar']);
    /* LIVE, and the month it changes in is the month it moves -- *"什么月份
       改就影响什么月份 但是在那个月份里的所有变动都是live的"*. Rousell (UNE ·
       Admin) and Lalu (BNN · FC) stand in no group dragged here, so they come
       off from THIS month; their rows are ENDED, never deleted, and every
       earlier month still pays them. */
    check('people in no dragged group are ended at this month, never deleted',
      await ev(page, () => window.__DB.nops_cull_monitoring_people.filter(r => r.id < 100)
        .map(r => r.until_month)), [M, M]);
    check('the groups are stored, so the row reads them after a reload', await ev(page, () =>
      (window.__DB.nops_maint_config.find(r => r.key === 'cull_monitoring_groups') || {}).txt_value),
      'OTHERS|Admin,UNN1|Field Conductor');
    check('edit is closed and the row reads the new list', await ev(page, () =>
      [cmDraft, !!jobCrewDraft, /UNN 1 · FC/.test(document.querySelector('#jc-set-body tr.jc-cull').textContent)]),
      [null, false, true]);
    if (process.env.SHOT) { await ev(page, () => jcEdit()); await ev(page, () => document.querySelector('#jc-set-body tr.jc-cull').scrollIntoView()); await page.screenshot({ path: process.env.SHOT + '/jc_cull.png' }); }
    check('no page error', errs, []);
    await page.close();
  }

  /* ── 8. THE GROUP IS FOLLOWED ─────────────────────────────────────────
     "我刚刚try 把surnano drag去admin ... 为什么这里不跟着变动". Somebody
     moved into a group already dragged onto Culling Monitoring joins the
     rule on the next load, dated this month, through the same save. */
  console.log('— 8. somebody moved into a dragged group joins the rule');
  {
    const d = new Date();
    const M = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const reg = REGISTER.concat([
      { id: 7, full_name: 'Florence', section: 'OTHERS', role: 'Admin', active: true },
      { id: 9, full_name: 'Surnano',  section: 'OTHERS', role: 'Admin', active: true },
    ]);
    const db = { mjmnpayroll_workers: reg,
      nops_maint_config: [{ key: 'cull_monitoring_groups', txt_value: 'OTHERS|Admin' }],
      nops_cull_monitoring_rate: [{ id: 1, kind: 'admin', from_month: '2026-01', rm: 20 }],
      nops_cull_monitoring_people: [
        { id: 21, kind: 'admin', nursery: '', worker_id: 7, worker_name: 'Florence', from_month: '2026-01', until_month: null }] };
    const { page, errs } = await boot(browser, db, 'setting');
    await page.waitForTimeout(1500);
    check('Surnano is on the rule from this month, nobody added twice', await ev(page, (M) =>
      window.__DB.nops_cull_monitoring_people.filter(r => !r.until_month)
        .map(r => r.worker_name + ':' + r.from_month).sort(), M),
      ['Florence:2026-01', 'Surnano:' + M]);
    check('…and the card above names him', await ev(page, () =>
      /Surnano/.test(document.getElementById('cm-set-body').textContent)), true);
    check('…and the row still shows the group, not a name', await ev(page, () =>
      [...document.querySelectorAll('#jc-set-body tr.jc-cull .jc-chip')].map(c => c.textContent.trim())), ['OTHERS · Admin']);
    check('no page error', errs, []);
    await page.close();
  }

  /* ── 9. AND TAKES OFF: live, earlier months untouched ──────────────── */
  console.log('— 9. somebody taken out of a dragged group leaves the rule from this month');
  {
    const d = new Date();
    const M = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const reg = REGISTER.concat([
      { id: 7, full_name: 'Florence', section: 'OTHERS', role: 'Admin', active: true },
      { id: 9, full_name: 'Sunarno',  section: 'OTHERS', role: 'General Worker', active: true },
    ]);
    const db = { mjmnpayroll_workers: reg,
      nops_maint_config: [{ key: 'cull_monitoring_groups', txt_value: 'OTHERS|Admin' }],
      nops_cull_monitoring_rate: [{ id: 1, kind: 'admin', from_month: '2026-01', rm: 20 }],
      nops_cull_monitoring_people: [
        { id: 21, kind: 'admin', nursery: '', worker_id: 7, worker_name: 'Florence', from_month: '2026-01', until_month: null },
        { id: 22, kind: 'admin', nursery: '', worker_id: 9, worker_name: 'Sunarno',  from_month: '2026-01', until_month: null },
        { id: 23, kind: 'fc', nursery: 'BNN', worker_id: 3, worker_name: 'Lalu Aenal', from_month: '2026-01', until_month: null }] };
    const { page, errs } = await boot(browser, db, 'setting');
    await page.waitForTimeout(1500);
    check('Sunarno is ENDED at this month, not deleted, so earlier months keep him', await ev(page, () =>
      window.__DB.nops_cull_monitoring_people.map(r => r.worker_name + ':' + (r.until_month || '-')).sort()),
      ['Florence:-', 'Lalu Aenal:-', 'Sunarno:' + M]);
    check('…the FC list, which no FC group was dragged for, is left alone', await ev(page, () =>
      /Lalu Aenal/.test(document.getElementById('cm-set-body').textContent)), true);
    check('…and the card no longer names Sunarno', await ev(page, () =>
      /Sunarno/.test(document.getElementById('cm-set-body').textContent)), false);
    check('no page error', errs, []);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
