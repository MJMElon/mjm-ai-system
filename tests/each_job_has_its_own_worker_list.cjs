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
    check('an unkeyed cell shows its own nursery workers, as the default',
      await ev(page, () => { const td = document.querySelector('#jc-set-body td[data-cell="BNN:pd"]');
        return td ? [td.querySelectorAll('.jc-def').length, td.textContent.includes('BNN · Workers')] : 'no cell'; }),
      [1, true]);
    check('the palette offers the Team Board groups with their counts',
      await ev(page, () => [...document.querySelectorAll('#jc-set-body .jc-pal .jc-chip')].map(c => c.textContent.replace(/\s+/g, ' ').trim())),
      ['BNN · FC 1', 'BNN · Workers 2', 'UNN 1 · Workers 1', 'UNE · Workers 1']);
    check('a drop before Edit does nothing', await (async () => { await drag(page, 'UNE · Workers', 'BNN:pd'); return cellChips(page, 'BNN:pd'); })(), ['BNN · Workers']);
    if (process.env.SHOT) { await ev(page, () => document.getElementById('jc-set-body').scrollIntoView()); await page.screenshot({ path: process.env.SHOT + '/jc_view.png' }); }
    await ev(page, () => jcEdit());
    check('drop UNE · Workers on BNN P & D', await drag(page, 'UNE · Workers', 'BNN:pd'), 'dropped');
    check('drop BNN · FC on BNN P & D', await drag(page, 'BNN · FC', 'BNN:pd'), 'dropped');
    check('the cell now carries three groups', await cellChips(page, 'BNN:pd'), ['BNN · Workers', 'UNE · Workers', 'BNN · FC']);
    check('dropping the same group twice adds it once', await (async () => { await drag(page, 'BNN · FC', 'BNN:pd'); return (await cellChips(page, 'BNN:pd')).length; })(), 3);
    check('Manuring was not touched', await cellChips(page, 'BNN:manuring'), ['BNN · Workers']);
    if (process.env.SHOT) { await ev(page, () => document.getElementById('jc-set-body').scrollIntoView()); await page.screenshot({ path: process.env.SHOT + '/jc_edit.png' }); }
    check('nothing was written before Save', await ev(page, () => (window.__WRITES || []).length), 0);
    await ev(page, () => jcSave());
    await page.waitForTimeout(300);
    check('Save wrote the cell as its groups',
      await ev(page, () => (window.__DB.nops_maint_config.find(r => r.key === 'job_crew:BNN:pd') || {}).txt_value),
      'BNN|General Worker,UNE|General Worker,BNN|Field Conductor');
    check('and a cell left as it stood as DEFAULT',
      await ev(page, () => (window.__DB.nops_maint_config.find(r => r.key === 'job_crew:BNN:manuring') || {}).txt_value), 'default');
    check('BNN P & D now shows its workers, the UNE crew and its FC',
      await sheetCols(page, 'pd'), ['Andi Rosmini', 'Yuyak', 'Lalu Aenal', 'Wira UNE']);
    check('BNN Manuring is unchanged', await sheetCols(page, 'manuring'), ['Andi Rosmini', 'Yuyak']);
    check('no page error', errs, []);
    await page.close();
  }

  console.log('— 3. a saved list survives a reload, and a group taken off leaves');
  {
    const db = { mjmnpayroll_workers: REGISTER, nops_maint_config: [
      { key: 'job_crew:BNN:pd', txt_value: 'UNE|General Worker' },
      { key: 'job_crew:BNN:weeding', txt_value: 'default' } ] };
    const { page, errs } = await boot(browser, db, 'setting');
    check('the keyed list replaces the default', await cellChips(page, 'BNN:pd'), ['UNE · Workers']);
    check('BNN P & D shows only the UNE crew', await sheetCols(page, 'pd'), ['Wira UNE']);
    check('DEFAULT reads as nobody having been asked', await sheetCols(page, 'weeding'), ['Andi Rosmini', 'Yuyak']);
    await ev(page, () => { switchTab('setting', null); jcEdit(); });
    await ev(page, () => document.querySelector('#jc-set-body td[data-cell="BNN:pd"] .jc-x').click());
    check('× takes the group off', await cellChips(page, 'BNN:pd'), []);
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

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
