/* MODULE ASSESS CONTROL, LAID OUT ON THE OFFICE'S ELEVEN POINTS.

   Only the drawing moved — every tick reads and writes the keys it always
   did, and tests/user_access_reads_portal_by_portal.cjs holds the keys. This
   one holds the layout: every portal folded with an "x/y on" summary, the
   Auditor Portal as one matrix, red-and-asks for a tick that cannot be taken
   back, the four presets, a Save that lights only on a change and counts it,
   the register job title beside a name, the Admin Portal level merged into
   its own header, and 44px targets with the matrix as cards on a phone.

   Every reader is guarded, so the previous page fails by NAME rather than
   taking the harness down on the first missing element.
   PAGE=<file in scan/> runs it against another copy of the page.

   Run: node tests/module_assess_control_layout.cjs
   with `python3 -m http.server 8779` serving the repository root.        */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name + '  → ' + JSON.stringify(got)); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) +
                             '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

/* The people on the fixture. RUTH is the admin doing the setting; the other
   three are what the list has to be able to show.

   AZLAN holds the AUDIT module and no scan at all, which is the whole point
   of him: the list used to be filtered on `modules.scan` alone, so the one
   person this screen now grants the Auditor Portal to was not in it. */
const PEOPLE = [
  { id: 'u-ruth',  full_name: 'Ruth Wong',  email: 'ruth@mjmnursery.com',
    permissions: { modules: { scan: 'admin' }, manage_users: true } },
  { id: 'u-faiz',  full_name: 'Faiz Rahman', email: 'faiz@mjmnursery.com',
    permissions: { modules: { scan: 'normal' } } },
  { id: 'u-azlan', full_name: 'Azlan Omar', email: 'azlan@mjmnursery.com',
    permissions: { modules: { audit: 'normal' } } },
  { id: 'u-siti',  full_name: 'Siti Nurul', email: 'siti@mjmnursery.com',
    permissions: { modules: { mobile: 'normal', seal: 'admin' } } },
  /* Two accounts under ONE name — the case the e-mail and the tag are for. */
  { id: 'u-ahmad1', full_name: 'Ahmad Ali', email: 'ahmad.fc@mjmnursery.com',
    permissions: { modules: { scan: 'normal' } } },
  { id: 'u-ahmad2', full_name: 'Ahmad Ali', email: 'ahmad.office@mjmnursery.com',
    permissions: { modules: { mobile: 'normal' } } },
];

function mockSupabase(page) {
  return page.addInitScript((people) => {
    window.__saved = [];                       // every update this page sends
    const SESSION = { user: { id: 'u-ruth', email: 'ruth@mjmnursery.com',
                              user_metadata: { full_name: 'Ruth Wong' } } };

    function result(table) {
      if (table === 'shared_profiles') return { data: people, error: null };
      if (table === 'operation_nurseries') {
        return { data: [{ name: 'BNN', license: '1' }, { name: 'UNN 1', license: '2' },
                        { name: 'UNN 2', license: '3' }], error: null };
      }
      if (table === 'mjmnpayroll_workers') {
        return { data: [{ full_name: 'Faiz Rahman', role: 'Field Conductor' },
                        { full_name: 'Siti Nurul', role: 'Admin' }], error: null };
      }
      return { data: [], error: null };
    }

    function chain(table) {
      const res = result(table);
      const one = { data: people.find((p) => p.id === 'u-ruth'), error: null };
      const self = {
        select() { return self; }, eq() { return self; }, neq() { return self; },
        or() { return self; }, gt() { return self; }, gte() { return self; },
        lte() { return self; }, order() { return self; }, limit() { return self; },
        in() { return self; },
        /* shared_access.js reads the signed-in person's own row with
           maybeSingle/single; everything else on this page reads a list. */
        single() { return Promise.resolve(one); },
        maybeSingle() { return Promise.resolve(one); },
        update(payload) { window.__saved.push(payload); return self; },
        then(a, b) { return Promise.resolve(res).then(a, b); },
      };
      return self;
    }

    window.supabase = {
      createClient: () => ({
        from: (table) => chain(table),
        rpc: () => Promise.resolve({ data: [], error: null }),
        auth: {
          getSession: async () => ({ data: { session: SESSION }, error: null }),
          getUser: async () => ({ data: { user: SESSION.user }, error: null }),
          onAuthStateChange: (cb) => {
            setTimeout(() => { try { cb('INITIAL_SESSION', SESSION); } catch (e) {} }, 0);
            return { data: { subscription: { unsubscribe() {} } } };
          },
          signOut: async () => ({ error: null }),
        },
        storage: { from: () => ({ upload: async () => ({ data: {}, error: null }),
                                  getPublicUrl: () => ({ data: { publicUrl: '' } }),
                                  remove: async () => ({ error: null }) }) },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, people());
}

function people() { return JSON.parse(JSON.stringify(PEOPLE)); }

async function open(browser, vp) {
  const page = await browser.newPage({ viewport: vp || { width: 1100, height: 1400 } });
  page.on('pageerror', (e) => console.log('  [page error] ' + e.message));
  await mockSupabase(page);
  await page.route('**/cdn.tailwindcss.com/**', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**',
    (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('http://localhost:8779/scan/' + (process.env.PAGE || 'scan_user_access.html') + '', { waitUntil: 'load' })
            .catch(() => {});
  await page.waitForTimeout(900);
  return page;
}

/* Open one person's panel. Faiz by default — an ordinary FC, nobody this
   screen has ever been through, which is the state every fallback is for. */
async function openRow(page, uid) {
  await page.click(`[data-edit="${uid}"]`);
  await page.waitForTimeout(250);
}


const safe = async (fn, dflt) => { try { return await fn(); } catch (e) { return dflt; } };
const T = 1500;

(async () => {
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

console.log('\n── 1. Every portal opens folded, and says what it holds ──');
{
  const page = await open(browser);
  await openRow(page, 'u-faiz');
  const blocks = page.locator('.panel > .area-block');
  check('six blocks: five portals and Other Modules', await blocks.count(), 6);
  check('every one of them folded', await safe(() => page.locator('.area-body:not(.hidden)').count(), -1), 0);
  check('each header carries a summary', await safe(() =>
    page.locator('.area-head .sum').evaluateAll((els) => els.map((e) => e.textContent.trim())), []),
    ['Off', '5/5 on', 'Off', 'Off', 'Off', '0/3 on']);
  await safe(() => page.click('.area-block[data-block="fc"] .area-name', { timeout: T }));
  await page.waitForTimeout(100);
  check('pressing the name unfolds it', await safe(() =>
    page.locator('.area-block[data-block="fc"] .area-body').isVisible(), false), true);
  await safe(() => page.click('[data-page="barcode"]', { timeout: T }));
  await page.waitForTimeout(100);
  check('and it STAYS unfolded when a tick redraws the panel', await safe(() =>
    page.locator('.area-block[data-block="fc"] .area-body').isVisible(), false), true);
  check('with the summary following the tick', await safe(() =>
    page.locator('.area-block[data-block="fc"] .sum').textContent(), ''), '4/5 on');
  check('a description is ONE line, in full on hover', await safe(() =>
    page.locator('.area-block[data-block="fc"] .area-head .desc').evaluate((e) =>
      [getComputedStyle(e).whiteSpace, e.title.length > 20]), []), ['nowrap', true]);
  await page.close();
}

console.log('\n── 2. The Auditor Portal is one matrix ──');
{
  const page = await open(browser);
  await openRow(page, 'u-azlan');
  await safe(() => page.click('.area-block[data-block="audit_portal"] .fold-btn', { timeout: T }));
  await page.waitForTimeout(100);
  const mx = page.locator('.area-block[data-block="audit_portal"] table.mx');
  check('a table, one row per audit', await safe(() => mx.locator('tbody tr').count(), 0), 4);
  check('Open, Record, Edit, Delete across', await safe(() =>
    mx.locator('thead th').evaluateAll((els) => els.map((e) => e.textContent.trim())), []),
    ['Audit', 'Open', 'Record', 'Edit', 'Delete']);
  check('the columns are explained ONCE, above it', await safe(() =>
    page.locator('.area-block[data-block="audit_portal"] .mx-help').count(), 0), 1);
  check('the Delete column is red', await safe(() =>
    mx.locator('thead th').last().evaluate((e) => getComputedStyle(e).color), ''), 'rgb(220, 38, 38)');
  await page.close();
}

console.log('\n── 3. A red tick asks before it is ticked ──');
{
  const page = await open(browser);
  await openRow(page, 'u-faiz');
  await safe(() => page.click('.area-block[data-block="fc"] .fold-btn', { timeout: T }));
  await page.waitForTimeout(100);
  let asked = 0;
  page.once('dialog', (d) => { asked++; d.dismiss(); });
  await safe(() => page.click('[data-act="maintenance"][data-actkey="delete"]', { timeout: T }));
  await page.waitForTimeout(150);
  check('it asked', asked, 1);
  check('and saying no leaves it unticked', await safe(() =>
    page.evaluate(() => !!draft.scan_actions.maintenance.delete), true), false);
  page.once('dialog', (d) => { asked++; d.accept(); });
  await safe(() => page.click('[data-act="maintenance"][data-actkey="delete"]', { timeout: T }));
  await page.waitForTimeout(150);
  check('saying yes ticks it', await safe(() =>
    page.evaluate(() => !!draft.scan_actions.maintenance.delete), false), true);
  let again = 0;
  page.once('dialog', (d) => { again++; d.accept(); });
  await safe(() => page.click('[data-act="maintenance"][data-actkey="delete"]', { timeout: T }));
  await page.waitForTimeout(150);
  check('taking it away again never asks', again, 0);
  page.removeAllListeners('dialog');
  await page.close();
}

console.log('\n── 4. The four presets ──');
{
  const page = await open(browser);
  await openRow(page, 'u-ruth');
  const doors = () => page.evaluate(() =>
    ALL_AREAS.filter((a) => areaOn(draft, a.key)).map((a) => a.key));

  await safe(() => page.click('[data-preset="fc"]', { timeout: T }));
  await page.waitForTimeout(100);
  check('Field Conductor opens the FC Portal and nothing else', await safe(doors, []), ['fc']);
  check('every FC page and action but Delete', await safe(() => page.evaluate(() =>
    [draft.scan_actions.maintenance.verify, draft.scan_actions.maintenance.export,
     draft.scan_actions.maintenance.delete, draft.scan_actions.barcode.view]), []),
    [true, true, false, true]);
  check('and the preset lights', await safe(() =>
    page.locator('.preset.sel').textContent(), ''), 'Field Conductor');

  await safe(() => page.click('[data-preset="admin"]', { timeout: T }));
  await page.waitForTimeout(100);
  check('Admin opens the Admin Portal and nothing else', await safe(doors, []), ['admin_portal']);
  check('with its four pages, and the module raised from None', await safe(() => page.evaluate(() =>
    [Object.values(draft.mobile_actions).map((e) => e.view), draft.modules.mobile]), []),
    [[true, true, true, true], 'normal']);

  await safe(() => page.click('[data-preset="auditor"]', { timeout: T }));
  await page.waitForTimeout(100);
  check('Auditor opens the Auditor Portal and nothing else', await safe(doors, []), ['audit_portal']);
  check('Record and Edit on every audit, Delete on none', await safe(() => page.evaluate(() =>
    Object.values(draft.audit_actions).map((e) => [e.view, e.record, e.edit, e.delete])), []),
    [[true, true, true, false], [true, true, true, false], [true, true, true, false], [true, true, true, false]]);

  await safe(() => page.click('[data-preset="worker"]', { timeout: T }));
  await page.waitForTimeout(100);
  check('Worker opens the 555 Worker Portal and nothing else', await safe(doors, []), ['worker']);

  await safe(() => page.click('[data-preset="none"]', { timeout: T }));
  await page.waitForTimeout(100);
  check('Clear all closes every door', await safe(doors, ['x']), []);
  check('and reads as Custom', await safe(() =>
    page.locator('.preset.sel').textContent(), ''), 'Custom');

  page.once('dialog', (d) => d.accept());
  await safe(() => page.click('[data-preset="all"]', { timeout: T }));
  await page.waitForTimeout(100);
  check('Select all asks first (it opens Delete) and opens every door',
    await safe(async () => (await doors()).length, 0), 8);
  await page.close();
}

console.log('\n── 5. Save lights only on a change, and counts it ──');
{
  const page = await open(browser);
  await openRow(page, 'u-faiz');
  check('not lit at first', await safe(() => page.locator('#save-btn').isDisabled(), false), true);
  check('and says so', await safe(() => page.textContent('#change-count'), ''), 'No changes');
  check('the bar follows the panel down the page', await safe(() =>
    page.locator('.save-bar').evaluate((e) => getComputedStyle(e).position), ''), 'sticky');
  await safe(() => page.click('.area-block[data-block="fc"] .fold-btn', { timeout: T }));
  await page.waitForTimeout(100);
  await safe(() => page.click('[data-page="barcode"]', { timeout: T }));
  await safe(() => page.click('[data-page="palms"]', { timeout: T }));
  await page.waitForTimeout(100);
  check('two ticks, two changes', await safe(() => page.textContent('#change-count'), ''), '2 changes');
  check('and Save says how many', await safe(() => page.textContent('#save-btn'), ''), 'Save (2)');
  await safe(() => page.click('[data-page="barcode"]', { timeout: T }));
  await safe(() => page.click('[data-page="palms"]', { timeout: T }));
  await page.waitForTimeout(100);
  check('putting them back is no change at all', await safe(() =>
    page.locator('#save-btn').isDisabled(), false), true);
  await page.close();
}

console.log('\n── 6. A name carries its e-mail and its job on the register ──');
{
  const page = await open(browser);
  check('two accounts under one name each show their own e-mail', await safe(() =>
    page.locator('.u-row:has-text("Ahmad Ali") .u-email').evaluateAll((els) =>
      els.map((e) => e.textContent.trim())), []),
    ['ahmad.fc@mjmnursery.com', 'ahmad.office@mjmnursery.com']);
  check('Faiz carries FC off the register', await safe(() =>
    page.locator('.u-row[data-uid="u-faiz"] .role-tag').textContent(), ''), 'FC');
  check('Siti carries Admin', await safe(() =>
    page.locator('.u-row[data-uid="u-siti"] .role-tag').textContent(), ''), 'Admin');
  check('a name the register does not carry gets no tag, not a guess', await safe(() =>
    page.locator('.u-row[data-uid="u-azlan"] .role-tag').count(), -1), 0);
  await page.close();
}

console.log('\n── 7. The Admin Portal is drawn once, with no level select ──');
{
  const page = await open(browser);
  await openRow(page, 'u-faiz');
  check('no "555 Admin Portal" row under Other Modules', await safe(() =>
    page.locator('.area-block[data-block="other"] [data-othermod="mobile"]').count(), -1), 0);
  check('and no Admin / Normal / None select on the Admin Portal either', await safe(() =>
    page.locator('.area-block[data-block="admin_portal"] select').count(), -1), 0);
  await safe(() => page.click('.area-block[data-block="admin_portal"] [data-area="admin_portal"]', { timeout: T }));
  await page.waitForTimeout(100);
  check('ticking the portal open still gives the module it needs', await safe(() =>
    page.evaluate(() => [draft.scan_areas.admin_portal.view, draft.modules.mobile]), []), [true, 'normal']);
  await page.close();
}

console.log('\n── 7b. The way back is an icon ──');
{
  const page = await open(browser);
  check('an arrow and no words, its words kept as the label', await safe(() =>
    page.locator('a.back-btn').evaluate((a) => [a.textContent.trim(), !!a.querySelector('svg'),
      a.getAttribute('aria-label'), a.getAttribute('href')]), []),
    ['', true, 'Back to Nursery 555 Team', 'scan_admin.html']);
  await page.close();
}

console.log('\n── 8. On a phone ──');
{
  const page = await open(browser, { width: 390, height: 900 });
  await openRow(page, 'u-azlan');
  await safe(() => page.click('.area-block[data-block="audit_portal"] .fold-btn', { timeout: T }));
  await page.waitForTimeout(150);
  check('the matrix has no header row', await safe(() =>
    page.locator('table.mx thead').evaluate((e) => getComputedStyle(e).display), ''), 'none');
  check('each audit is a card of its own', await safe(() =>
    page.locator('table.mx tbody tr').first().evaluate((e) => getComputedStyle(e).display), ''), 'block');
  const small = await safe(() => page.evaluate(() =>
    [...document.querySelectorAll('.panel .preset, .panel .fold-btn, .panel .btn, .mx .cell')]
      .filter((e) => e.offsetParent)
      .filter((e) => e.getBoundingClientRect().height < 44)
      .map((e) => e.className + ':' + Math.round(e.getBoundingClientRect().height))), ['n/a']);
  check('every button and matrix cell is at least 44px', small, []);
  check('and nothing runs off the side', await safe(() =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), false), true);
  await page.close();
}

await browser.close();
console.log('\n' + (fail ? 'FAILURES: ' + fail + ' (passed ' + pass + ')'
                         : 'all good — ' + pass + ' checks'));
process.exit(fail ? 1 : 0);
})();
