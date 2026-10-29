/* THE OFFICE IS A COLUMN ON THE TEAM BOARD, AND IT IS NOT A NURSERY.

   The office asked for a column on the Worker System board for the people
   who work for the company rather than at a nursery. A column is a SECTION,
   and a section is three things in three files:

     the board draws it           scan/scan_workers.html
     the Location card offers it  scan/scan_system_setting.html
     the payroll decides whether  npayroll/npayroll_script.js
     work is done there

   Each of those kept its own copy of what a section is, which is the fault
   this codebase has a heading about. Two of them are what this test is for.

   THE LOCATION CARD KEPT THE WORD "UNE" WRITTEN DOWN SEPARATELY, so a
   section added to the board alone would have drawn a column the card
   reported as "Not in a location" -- configured on one screen and a fault
   on the next.

   AND THE PAYROLL ASKED "IS THIS NOT THE ESTATE", which was right for
   exactly as long as the estate was the only place in the company with no
   plots in it. On that test this column arrives as a nursery to be sprayed:
   a maintenance sheet, a column of plots and a claim, for the people who sit
   in the office. It asks a FLAG now, and section 4 drives the old rule
   beside the new one to show what it cost.

   IT IS CALLED OTHERS AND NOT ADMIN, AND THAT IS THE POINT OF THE RENAME.
   It shipped as ADMIN for a day. Then the board grew a row per role --
   Estate Manager, Admin, Gardener, Driver -- and a column headed Admin
   beside a row headed Admin is one word answering two questions: admin is a
   JOB, and the place is simply not-a-nursery.
   shared/RUN_ME_worker_section_others.sql moved the two people who were
   filed under the old code.

   Run: node tests/others_is_a_column_and_not_a_nursery.cjs
   No build, no browser and no server needed.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

let failed = 0;
const fail = (m) => { console.log('FAIL  ' + m); failed++; };
const pass = (m) => console.log('pass  ' + m);
const is = (m, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass(m + '  → ' + JSON.stringify(got));
  else fail(m + '\n        got  ' + JSON.stringify(got) + '\n        want ' + JSON.stringify(want));
};

/* The real shared file, loaded the way a page loads it. */
const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(read('shared', 'shared_worker_locations.js').replace('})(window);', '})(window);'),
                sandbox);
const LOC = sandbox.window.MJMWorkerLocations;

console.log('\n-- 1. Others is a place the board knows --');
if (!LOC) {
  fail('shared_worker_locations.js did not define MJMWorkerLocations');
} else {
  const loc = LOC.locationOf('OTHERS');
  is('OTHERS lands in a location', !!loc, true);
  is('and it is called Others', loc && loc.name, 'Others');
  /* It must not be swept up by the Main Nursery pattern, which takes
     anything beginning BNN or UNN -- and must not take the others with it. */
  is('PN is still Pre Nursery', (LOC.locationOf('PN') || {}).name, 'Pre Nursery');
  is('UNN2 is still Main Nursery', (LOC.locationOf('UNN2') || {}).name, 'Main Nursery');
  is('UNE is still Estate', (LOC.locationOf('UNE') || {}).name, 'Estate');
  /* The office asked for it last, after the nurseries and the estate: the
     board reads from the seedlings outwards. */
  const order = LOC.LOCATIONS.map((l) => l.name);
  is('and it comes last', order[order.length - 1], 'Others');
}

console.log('\n-- 2. The board and the Location card offer the SAME sections --');
{
  /* The two screens get the nurseries from operation_nurseries. What is
     left is the sections that are not nurseries, and the table will never
     hand those over -- so each screen has to add them, and that is the one
     list they both have to read. */
  const off = (LOC && LOC.OFF_NURSERY) || [];
  is('the shared file names the non-nursery sections',
     off.map((f) => f.code), ['UNE', 'OTHERS']);

  const board = read('scan', 'scan_workers.html');
  const card  = read('scan', 'scan_system_setting.html');

  is('the board takes its fixed sections from there',
     /const FIXED_SECTIONS = LOC\.OFF_NURSERY/.test(board), true);
  is('and the Location card does too',
     /LOC\.OFF_NURSERY/.test(card), true);

  /* THE WORD ITSELF MUST NOT BE WRITTEN DOWN AGAIN. A screen that pushes
     its own 'UNE' is a screen that will be missing the next section. */
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const pushes = (s) => (strip(s).match(/codes\.push\('UNE'\)|push\(\s*'UNE'\s*\)/g) || []);
  is('the card no longer pushes UNE on its own', pushes(card), []);

  /* And the seed the board opens on, before any read lands, carries them
     both -- or a page whose nursery read failed could not file an admin. */
  is('the board seed carries Others',
     /\]\.concat\(FIXED_SECTIONS\)/.test(board), true);
}

console.log('\n-- 3. Grouping puts everything somewhere --');
if (LOC) {
  const codes = ['PN', 'BNN', 'UNN1', 'UNN2', 'UNE', 'OTHERS'];
  const g = LOC.group(codes);
  is('nothing is left unplaced', g.unplaced, []);
  const named = {};
  g.locations.forEach((l) => { named[l.name] = l.codes; });
  is('the office column holds exactly OTHERS', named.Others, ['OTHERS']);
  is('and the Main Nursery is unchanged', named['Main Nursery'], ['BNN', 'UNN1', 'UNN2']);
  /* A section nobody can place is still handed back rather than dropped.
     A worker in a column nobody can see is a worker nobody fixes. */
  is('a section in no location is still reported',
     LOC.group(['PN', 'DRIVER']).unplaced, ['DRIVER']);
}

console.log('\n-- 4. Nobody in the office is on a maintenance sheet --');
if (LOC) {
  is('the office is not a maintenance section', LOC.isMaintSection('OTHERS'), false);
  is('nor is the estate',                        LOC.isMaintSection('UNE'),   false);
  is('the nurseries are',                        LOC.isMaintSection('UNN1'),  true);
  is('including one added later',                LOC.isMaintSection('UNN3'),  true);
  /* UNCHANGED, and deliberately: a code this file cannot place answers NO.
     The claim offers a nursery to be ticked and signed, and one nothing can
     place is a sheet nobody can reconcile. */
  is('a section in no location still answers no', LOC.isMaintSection('DRIVER'), false);

  /* What the PREVIOUS rule did with the same question. Not a copy of the
     old code for its own sake -- it is the cost of the change, and the one
     thing a flag-vs-name argument can be settled by. */
  const oldRule = (c) => {
    const loc = LOC.locationOf(c);
    return !!loc && loc.key !== 'estate';
  };
  is('on the old rule the office was a nursery to be sprayed',
     oldRule('OTHERS'), true);
  is('and the new one says it is not', LOC.isMaintSection('OTHERS'), false);

  /* The payroll has to be the one asking. A second copy of the test in
     that file is a second thing to get wrong. */
  const pay = read('npayroll', 'npayroll_script.js');
  is('npayroll asks the shared file',
     /isMaintNursery[\s\S]{0,400}L\.isMaintSection\(code\)/.test(pay), true);
}

console.log('\n-- 5. The board can still draw it --');
{
  /* boardColumns() lifted out of the shipped page, so this is the real
     rule and not a transcription of it. */
  const board = read('scan', 'scan_workers.html');
  const at = board.indexOf('function boardColumns()');
  const end = board.indexOf('\n}', at);
  if (at < 0 || end < 0) {
    fail('boardColumns is not in scan_workers.html any more');
  } else {
    const SECTIONS = [
      { code: 'PN', name: 'PN — Pre Nursery' }, { code: 'BNN', name: 'BNN — Batu Niah' },
      { code: 'UNN1', name: 'UNN1' }, { code: 'UNN2', name: 'UNN2' },
      { code: 'UNE', name: 'UNE' }, { code: 'OTHERS', name: 'Others' },
    ];
    const ctx = {
      SECTIONS,
      DIVISIONS: LOC.LOCATIONS.map((l) => ({ name: l.name, match: l.match })),
    };
    vm.createContext(ctx);
    vm.runInContext(board.slice(at, end + 2) + '; _cols = boardColumns();', ctx);
    const cols = ctx._cols;
    is('the board draws the four locations, Others last',
       cols.map((c) => c.name), ['Pre Nursery', 'Main Nursery', 'Estate', 'Others']);
    is('and the Others column holds the Others section',
       (cols.find((c) => c.name === 'Others') || {}).sections, ['OTHERS']);
    /* Others must come through as a LOCATION, not through the fallback that
       gives an unrecognised section a column of its own. The fallback is a
       safety net for a nursery read that went wrong; leaning on it for a
       section the company decided to have is how the Location card and the
       board come to disagree again. */
    is('through the location and not the fallback',
       cols.length, LOC.LOCATIONS.filter((l) => ['PN', 'BNN', 'UNN1', 'UNN2', 'UNE', 'OTHERS']
         .some((c) => l.match(c))).length);
  }
}

/* ── 6. THE REAL PAGE, IN A REAL BROWSER ───────────────────────────────
   Everything above reads the shipped files and lifts the shipped rule out
   of them, which is worth having and is not the same as the office opening
   the screen. A column that is right in boardColumns() and missing on the
   board is exactly the shape of fault this whole file exists to catch.

   Needs a static server on 8779; it says so and stops rather than failing
   if there is none. */
(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) { console.log('\n-- 6. skipped: playwright is not installed --'); return done(); }

  console.log('\n-- 6. The office opens the board --');
  const WORKERS = [
    { id: 1, full_name: 'Wisnu',      section: 'PN',    role: 'Field Conductor', active: true },
    { id: 2, full_name: 'Asriawan',   section: 'UNN1',  role: 'General Worker',  active: true },
    { id: 3, full_name: 'Sahrun',     section: 'UNE',   role: 'Driver',          active: true },
    /* The one this is all about: somebody who sits in the office. */
    { id: 4, full_name: 'Siti Others', section: 'OTHERS', role: 'General Worker',  active: true },
  ];

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', (e) => fail('page error: ' + e.message));

  await page.addInitScript((rows) => {
    function chain(result) {
      const self = {
        select() { return self; }, eq() { return self; }, order() { return self; },
        limit() { return self; }, in() { return self; }, is() { return self; },
        single() { return self; }, maybeSingle() { return self; },
        then(a, b) { return Promise.resolve(result).then(a, b); },
        finally(f) { return Promise.resolve(result).finally(f); },
      };
      return self;
    }
    const perms = { modules: { scan: 'admin', npayroll: 'admin' }, manage_users: true };
    window.supabase = {
      createClient: () => ({
        from: (t) => {
          if (t === 'shared_profiles') {
            return chain({ data: { full_name: 'Coco Lau', email: 'coco@mjmnursery.com', permissions: perms }, error: null });
          }
          if (t === 'mjmnpayroll_workers') return chain({ data: rows, error: null });
          /* The nursery table answers with the three it really holds, so
             the board has to add the non-nursery sections itself -- which
             is the half of this that was written down twice. */
          if (t === 'operation_nurseries') {
            return chain({ data: [{ name: 'BNN' }, { name: 'UNN 1' }, { name: 'UNN 2' }], error: null });
          }
          return chain({ data: [], error: null });
        },
        auth: {
          getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'coco@mjmnursery.com' } } }, error: null }),
          getUser: async () => ({ data: { user: { id: 'u1', email: 'coco@mjmnursery.com' } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null }),
        },
        storage: { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, WORKERS);
  await page.route('**/cdn.tailwindcss.com/**', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  const res = await page.goto('http://localhost:8779/scan/scan_workers.html', { waitUntil: 'load' })
    .catch(() => null);
  if (!res) {
    console.log('  skipped: nothing is serving on 8779 (python3 -m http.server 8779)');
  } else {
    await page.waitForTimeout(900);
    /* textContent, never innerText: the headings are uppercased in CSS, so
       innerText hands back ESTATE where the page says Estate. The bands are
       compared as WRITTEN -- this test is about which columns are drawn and
       in what order, not about what the stylesheet does to them. */
    const heads = await page.locator('#worker-board th, #worker-board td').evaluateAll(
      (els) => els.map((e) => (e.textContent || '').trim()).filter(Boolean));
    const all = heads.join(' | ');
    is('the board carries an Others heading', /\bOthers\b/.test(all), true);
    is('and the estate is still there', /\bEstate\b/.test(all), true);
    is('the office worker is on the board', /Siti Others/.test(all), true);

    /* IN THE OTHERS COLUMN, not merely somewhere on the page. The columns
       are in order, so the cell the name sits in is what says so. */
    const where = await page.evaluate(() => {
      const cell = [...document.querySelectorAll('#worker-board td')]
        .find((td) => (td.textContent || '').includes('Siti Others'));
      if (!cell) return null;
      const idx = [...cell.parentElement.children].indexOf(cell);
      const bands = [...document.querySelectorAll('#worker-board tr')][0];
      return bands ? [...bands.children].map((c) => (c.textContent || '').trim()) : null;
    });
    is('the bands read left to right from the seedlings outwards',
       where && where.filter(Boolean).map((s) => s.replace(/\s+/g, ' ')),
       ['Pre Nursery', 'Main Nursery', 'Estate', 'Others']);
  }
  await browser.close();
  done();
})();

function done() {

console.log('\n' + (failed ? 'FAILURES: ' + failed : 'all good'));
process.exit(failed ? 1 : 0);
}
