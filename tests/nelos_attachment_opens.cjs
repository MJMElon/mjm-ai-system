/* The attachment on a Nelos case opens, and can be downloaded.

   The row showed a thumbnail of the empty-hole sheet and nothing else could
   be done with it — the office: "我要可以view和download ... 那个document".
   Now every attachment on the case list carries data-file, one listener
   opens it whole in a viewer, and the viewer has a Download that saves the
   file under its own name.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/nelos_attachment_opens.cjs
   with a static server on 8777 serving the repository root.               */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPQiNLAihiGlgQAm7gqgcKuZ38AAAAASUVORK5CYII=', 'base64');
const PHOTO = 'https://files.test/storage/v1/object/public/nelos/empty_hole_279.png';
const DOC = 'https://files.test/storage/v1/object/public/nelos/do_03682.pdf';
const CASE = {
  id: 'c55', case_no: 'NLS-0055', title: 'Batch 279', status: 'open',
  assigned_module: 'audit', assignee_name: 'Pre Nursery Auditor + Drone Operator',
  raised_by: 'Esther Wong Sze Qi', created_at: new Date().toISOString(),
  description: 'Check empty hole', photo_url: PHOTO, doc_url: DOC, doc_name: 'DO 03682.pdf'
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript((c) => {
    window.__DB = {
      nelos_modules: [{ key: 'audit', label: 'Audit Portal', active: true, sort_order: 1 }],
      nelos_handlers: [{ user_id: 'u1', full_name: 'Elon Ting', email: 'e@m', primary_module: 'audit', seat_no: 1 }],
      nelos_categories: [], nelos_routes: [], nelos_cases: [c]
    };
    function makeQuery(table) {
      const st = { single: false };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(
          st.single ? { data: (window.__DB[table] || [])[0] || null, error: null }
                    : { data: window.__DB[table] || [], error: null }).then(a, b);
        if (p === 'maybeSingle' || p === 'single')
          return () => { st.single = true; return Promise.resolve({ data: (window.__DB[table] || [])[0] || null, error: null }); };
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'e@m' };
    window.supabase = { createClient: () => ({
      from: makeQuery, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null }) },
      storage: { from: () => ({ upload: async () => ({ data: {}, error: null }),
                                getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, CASE);
  await page.route('**/shared_access.js', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t,k){
      if (k==='user') return () => ({ id:'u1', email:'e@m', full_name:'Elon Ting' });
      if (k==='load') return async () => true;
      if (k==='normalize') return (x)=>x||{};
      if (k==='then') return undefined;
      return () => true; } });`
  }));
  for (const host of ['**/cdn.tailwindcss.com/**', '**/cdn.jsdelivr.net/**',
                      '**/cdnjs.cloudflare.com/**', '**/fonts.googleapis.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, body: '[]' }));
  await page.route('https://files.test/**', (r) => {
    const u = r.request().url();
    if (/\.png/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG,
      headers: { 'access-control-allow-origin': '*' } });
    return r.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4\n%%EOF'),
      headers: { 'access-control-allow-origin': '*' } });
  });

  await page.goto('http://localhost:8777/nelos/nelos_dashboard.html', { waitUntil: 'load' });
  await page.waitForSelector('.thumb-btn', { timeout: 20000 });

  console.log('— the photo on the row');
  await page.click('.thumb-btn:not(.thumb-doc)');
  check('pressing the thumbnail opens the viewer with the picture, not the case',
    await page.evaluate(() => {
      const v = document.querySelector('.fv-scrim');
      return [!!v && v.classList.contains('on'), (v.querySelector('.fv-body img') || {}).src || '',
              document.getElementById('view-scrim').classList.contains('hidden')];
    }), [true, PHOTO, true]);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.fv-dl')]);
  check('Download saves it under the case name, keeping its type', dl.suggestedFilename(), 'NLS-0055 photo.png');
  await page.click('.fv-x');
  check('Close shuts it', await page.evaluate(() => document.querySelector('.fv-scrim').classList.contains('on')), false);

  console.log('— the document on the row');
  await page.click('.thumb-doc');
  check('the document opens in a frame', await page.evaluate(() =>
    (document.querySelector('.fv-body iframe') || {}).src || ''), DOC);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('.fv-dl')]);
  check('…and downloads under its own name', dl2.suggestedFilename(), 'DO 03682.pdf');
  await page.click('.fv-x');

  console.log('— and the same in the View dialog');
  await page.click('[data-act="view"]');
  await page.waitForSelector('#view-scrim:not(.hidden)');
  await page.click('#v-case .s-case-shot');
  check('the photo in the View dialog opens the viewer too', await page.evaluate(() =>
    document.querySelector('.fv-scrim').classList.contains('on')), true);
  check('no page errors', errs, []);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
