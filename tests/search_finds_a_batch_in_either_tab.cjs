/* A SEARCH IS A SEARCH OF THE WHOLE LEDGER.

   Typing 235 into the Batch Info search asks WHERE batch 235 is. The answer
   must not depend on which tab happened to be open when it was typed — and it
   did: the office typed 235 on Active and got "No batches matching 235", with
   the batch sitting one tab over in Completed the whole time. A batch that
   cannot be found is a batch somebody keys again.

   So Active and Completed are two halves of ONE list and a query looks at
   both. The Current Stage column on the row says which half it came from, and
   a line above the table says so as well, so a Completed batch listed under
   Active does not read as a fault.

   The To Do List and To Check do NOT move, and that is the interesting half
   of this test. Those tabs are not halves of the batch list, they are
   questions — which report to go and fix, which one to go and check — and a
   row with nothing to fix is not an answer to either of them.

   Driven through the page's own loader with a stubbed Supabase.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/search_finds_a_batch_in_either_tab.cjs
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

const UID = '00000000-0000-0000-0000-000000000001';
const FAKE_SUPABASE = fs.readFileSync(path.join(__dirname, 'tocheck_list.cjs'), 'utf8')
  .split('const FAKE_SUPABASE = `')[1].split('`;')[0];

const rec = (batch, breed) => ({ batch_name: batch, transaction_type: 'Seeds_Received', breed_name: breed,
                                 quantity_change: 15728, transaction_date: '2025-04-11',
                                 created_at: '2025-04-11T00:00:00Z', plot_name: null, remark: '' });

/* Three batches:

   235  transplanted, 3rd culled and the stage signed  → COMPLETED
   236  transplanted and nothing culled                → ACTIVE
   237  like 235, and a report rejected by HQ          → ACTIVE, and the only
                                                         one on Amendment Needed  */
const DONE = (b, plot) => ([
  { batch_name: b, transaction_type: 'Transplanted', plot_name: plot, quantity_change: 9000, remark: 'from tray [P1]' },
  { batch_name: b, transaction_type: '3rd_Culling', plot_name: plot, quantity_change: 500,
    remark: '3rd Culling. DestType: main MapQty: 500 CullDate:2026-06-01' }
]);

const ROWS = {
  shared_inventory_logs: [
    rec('235', 'IOI DxP HYBRID'),
    rec('236', 'SIME DxP'),
    rec('237', 'IOI DxP HYBRID'),
    ...DONE('235', 'U1'),
    { batch_name: '236', transaction_type: 'Transplanted', plot_name: 'U2', quantity_change: 9000, remark: 'from tray [P2]' },
    ...DONE('237', 'U3'),
    { batch_name: '237', transaction_type: 'Review_Rejection', plot_name: 'transplanting', quantity_change: 0,
      remark: 'Plot U3 qty does not match the field sheet.' }
  ],
  operation_batch_verifications: [
    { id: 1, batch_name: '235', stage: 'cull_3' },
    { id: 2, batch_name: '237', stage: 'cull_3' },
    /* 236 is signed off all the way, so it is on NO To Check list -- which is
       what lets the test tell a tab that refuses to widen from one that has
       the batch on it for a reason of its own. 235 really does have reports
       waiting, so looking for 235 there proves nothing. */
    { id: 3, batch_name: '236', stage: 'seeds_in' },
    { id: 4, batch_name: '236', stage: 'seed_audit' },
    { id: 5, batch_name: '236', stage: 'planting' },
    { id: 6, batch_name: '236', stage: 'transplanting' },
    { id: 7, batch_name: '236', stage: 'cull_1' }
  ],
  shared_do_records: [],
  operation_trays: [],
  shared_profiles: []
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.route('**supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**cdn.tailwindcss.com/**', (r) => r.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'document.addEventListener("DOMContentLoaded", function () {' +
          '  document.head.insertAdjacentHTML("beforeend", ' +
          JSON.stringify('<style>.hidden{display:none}</style>') + '); });' }));
  await page.route('**cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await page.route('**cdnjs.cloudflare.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));

  await page.addInitScript(({ uid, rows }) => {
    const user = { id: uid, email: 'esther@mjmnursery.com', user_metadata: { full_name: 'Esther Wong' } };
    window.__FAKE_SESSION = { access_token: 'x', user };
    window.__FAKE_PROFILE = { id: uid, email: user.email, full_name: 'Esther Wong', user_type: 'staff',
      permissions: { modules: { operation: 'admin' }, manage_users: true } };
    window.__ROWS = rows;
    try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}
  }, { uid: UID, rows: ROWS });

  await page.goto(`http://localhost:${port}/operation/operation_batch_record.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  /* Type into the real box through the real handler, then read the table and
     the note the way somebody looking at the screen would. */
  const look = async (tab, q) => page.evaluate(async ({ tab, q }) => {
    switchListTab(tab);
    const box = document.getElementById('search-input');
    box.value = q;
    filterLedger();
    await new Promise(r => setTimeout(r, 250));
    const note = document.getElementById('list-search-note');
    const lit  = ['active', 'completed', 'amendment', 'tocheck', 'tray']
      .find(n => document.getElementById('tab-' + n).className.includes('list-tab-active'));
    return {
      /* The tab that is LIT, not the one asked for -- a search may have moved
         the page, and the lit chip is what somebody looking at it would say
         they are on. */
      tab: lit,
      rows: [...document.querySelectorAll('#ledger-body tr')].map(r =>
        [...r.children].map(c => (c.textContent || '').replace(/\s+/g, ' ').trim())),
      note: note && !note.classList.contains('hidden') ? note.textContent.replace(/\s+/g, ' ').trim() : ''
    };
  }, { tab, q });

  const split      = await page.evaluate(() =>
    Object.fromEntries(masterBatches.map(b => [b.batch_name, !!b.isCompleted])));
  const tabLabel   = await page.evaluate(() => document.getElementById('tab-completed').innerText.replace(/\s+/g, ' ').trim());

  const activeNoQ  = await look('active', '');
  const active235  = await look('active', '235');
  const compl236   = await look('completed', '236');
  /* Matches in BOTH halves: 23 catches all three. The page must NOT move
     somebody off a screen that is already answering them. */
  const bothHalves = await look('active', '23');
  const nowhere    = await look('active', '999');
  const cleared    = await look('active', '');
  const amend235   = await look('amendment', '235');
  const amend237   = await look('amendment', '237');
  const check236   = await look('tocheck', '236');
  const tray235    = await look('tray', '235');

  const names = (r) => r.rows.map(x => x[0]);
  const first = (r) => (r.rows[0] || []);

  console.log('split        :', JSON.stringify(split));
  console.log('tab label    :', JSON.stringify(tabLabel));
  console.log('active, 235  :', active235.tab, JSON.stringify(names(active235)), '|', JSON.stringify(active235.note));
  console.log('completed,236:', compl236.tab, JSON.stringify(names(compl236)), '|', JSON.stringify(compl236.note));
  console.log('active, 23   :', bothHalves.tab, JSON.stringify(names(bothHalves)), '|', JSON.stringify(bothHalves.note));
  console.log('active, none :', JSON.stringify(names(activeNoQ)));
  console.log('nowhere      :', JSON.stringify(first(nowhere)));
  console.log('amendment,235:', JSON.stringify(names(amend235)));
  console.log('page errors  :', errs.length ? errs.join(' | ') : 'none');

  const checks = [
    // the fixture is the thing the office saw
    ['235 is Completed and 236 is Active', split['235'] === true && split['236'] === false],

    // the label
    ['the tab reads Completed', /^✅?\s*completed$/i.test(tabLabel)],
    ['and no longer says In-Active', !/in-?active/i.test(tabLabel)],

    // the ask: looking for 235 on Active lands you on Completed, with 235 on it
    ['searching 235 from Active moves to the Completed tab', active235.tab === 'completed'],
    ['and 235 is on the screen', names(active235).includes('235')],
    ['and the line says it moved', /nothing matching "235" in active/i.test(active235.note)],
    ['naming where it took you', /in Completed/i.test(active235.note)],
    ['and the other way round too', compl236.tab === 'active' && names(compl236).includes('236')],
    ['with its own line', /nothing matching "236" in completed/i.test(compl236.note)],

    // a query answered on this tab must not carry anybody off it
    ['a search that this tab can answer does not move', bothHalves.tab === 'active'],
    ['it lists this tab only', names(bothHalves).includes('236') && names(bothHalves).includes('237')
        && !names(bothHalves).includes('235')],
    ['and says how many more are in the other half', /1 more matching "23" is in Completed/i.test(bothHalves.note)],

    // the split still means something when nobody is searching
    ['with no search, Active is Active only', names(activeNoQ).includes('236') && !names(activeNoQ).includes('235')],
    ['and the line is gone', activeNoQ.note === '' && cleared.note === ''],

    // a real miss
    ['a batch in neither half says so', first(nowhere).some(c => /in Active or in Completed/i.test(c))],

    // the tabs that are questions, not halves
    ['the To Do List does not move', amend235.tab === 'amendment' && !names(amend235).includes('235')],
    ['it still answers its own question', names(amend237).includes('237')],
    ['To Check does not move either', check236.tab === 'tocheck' && !names(check236).includes('236')],
    ['and Tray Status is left alone', tray235.tab === 'tray' && !names(tray235).includes('235')],

    ['no page errors', errs.length === 0]
  ];

  let bad = 0;
  checks.forEach(([label, pass]) => { if (!pass) bad++; console.log((pass ? 'ok   ' : 'FAIL ') + label); });

  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})();
