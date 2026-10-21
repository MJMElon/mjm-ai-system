/* THE AUDIT MODULE HAS TWO HALVES, AND THEY WERE ONE DOOR.

   `audit_home.html` is the AUDITOR PORTAL: a to-do list built for a phone
   held in a nursery, with the overdue rounds on it and nothing else.

   `audit_admin.html` is the BACK OFFICE: what is scheduled this month and
   how far through it each nursery is, the cross-nursery alerts, the four
   module cards, the monthly report and Settings. It is a desk screen.

   One door led to both, and which one you got depended on who you were. An
   audit ADMIN pressing "Audit Portal" on the 555 MJM Team page -- a door
   labelled "Plot audits & sign-off" -- landed on the desk screen, not on
   their own to-do list, and had to navigate out of it. Signing in at the
   auditor login did the same thing.

   So the back office moved out and became a hub module of its own,
   "Nursery Audit System", and the two doors each mean one thing now:

     hub tile  -> audit_admin.html   (the back office)
     Audit Portal / auditor sign-in -> audit_home.html  (the to-do list)

   What this test is really guarding is that NOBODY LOST A ROUTE in the
   move. The hub tile is gated on the same `audit` module the portal has
   always used, so anyone who used to be sent to the back office still
   reaches it; and a plain auditor, who never landed there by sign-in
   anyway, is untouched.

   Run: node tests/the_audit_system_is_its_own_module.cjs
   with `python3 -m http.server 8779` serving the repository root.        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name + '  → ' + JSON.stringify(got)); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) +
                             '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

function mockSupabase(page, permissions) {
  return page.addInitScript((perms) => {
    const SESSION = { user: { id: 'u1', email: 'ruth@mjmnursery.com',
                              user_metadata: { full_name: 'Ruth Wong' } } };
    function chain(result) {
      const self = {
        select() { return self; }, eq() { return self; }, single() { return self; },
        or() { return self; }, neq() { return self; }, gt() { return self; },
        order() { return self; }, limit() { return self; }, in() { return self; }, gte() { return self; },
        /* index.html reads the profile with maybeSingle(). Without it the
           read comes back undefined, the hub falls open, and EVERY tile is
           shown — which is a gate test that cannot fail. */
        maybeSingle() { return Promise.resolve(result); },
        then(a, b) { return Promise.resolve(result).then(a, b); },
        finally(f) { return Promise.resolve(result).finally(f); },
      };
      return self;
    }
    window.supabase = {
      createClient: () => ({
        from: (table) => {
          if (table === 'shared_profiles') {
            return chain({ data: { full_name: 'Ruth Wong', email: 'ruth@mjmnursery.com',
                                   permissions: perms }, error: null });
          }
          return chain({ data: [], error: null });
        },
        auth: {
          getSession: async () => ({ data: { session: SESSION }, error: null }),
          getUser: async () => ({ data: { user: SESSION.user }, error: null }),
          /* The hub does its gating inside this callback, so a subscription
             that never fires is a page that never gates. */
          onAuthStateChange: (cb) => {
            setTimeout(() => { try { cb('INITIAL_SESSION', SESSION); } catch (e) {} }, 0);
            return { data: { subscription: { unsubscribe() {} } } };
          },
          signOut: async () => ({ error: null }),
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, permissions);
}

/* Tailwind comes from a CDN this harness refuses, so every card on the hub
   measures 0x0 and isVisible() answers false for all of them. The thing to
   ask is what the GATE wrote: applyModuleVisibility sets an inline
   display:none on a card it closes and clears it on one it opens, and that
   is the rule under test rather than a layout the harness cannot produce. */
const shown = (page, card) => page.evaluate((c) => {
  const el = document.querySelector('.module-card[data-card="' + c + '"]');
  return el ? el.style.display !== 'none' : null;
}, card);

async function openHub(browser, perms) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => console.log('  [page error] ' + e.message));
  await mockSupabase(page, perms);
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('http://localhost:8779/index.html', { waitUntil: 'load' }).catch(() => {});
  await page.waitForTimeout(800);
  return page;
}

(async () => {
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

console.log('\n── 1. The hub carries a Nursery Audit System tile ──');
{
  const page = await openHub(browser, { modules: { audit: 'admin', scan: 'admin' }, manage_users: true });
  const tile = page.locator('.module-card[data-card="auditsys"]');

  check('the tile exists', await tile.count(), 1);
  check('and an audit admin can see it', await shown(page, 'auditsys'), true);
  check('it opens the back office', await tile.getAttribute('href'), 'audit/audit_admin.html');
  /* The name is split over two lines with a <br>, the way every tile here
     is, so the break is read as the space it draws as. */
  check('it is named for the system, not for the portal',
        (await tile.locator('.module-name').innerHTML())
          .replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim(),
        'Nursery Audit System');
  check('and it sits in the Nursery sector',
        await page.locator('#sector-nursery .module-card[data-card="auditsys"]').count(), 1);

  /* The 555 Audit Portal card was taken OFF this hub when the doors moved
     onto the MJM Team grid. This tile is not that card coming back: it
     opens the other half of the module. */
  check('the old 555 Audit Portal card has not come back',
        await page.locator('.module-card[data-card="audit"]').count(), 0);
  await page.close();
}

console.log('\n── 2. It is gated on the same `audit` module, and closed until granted ──');
{
  /* Hidden-by-default is the rule for a card that opens something
     privileged: an unset answer costs nothing, where hiding a long-standing
     card from everybody would. No `data-module-open` on this one. */
  const page = await openHub(browser, { modules: { audit: 'admin' } });
  check('it is gated on `audit`, the same module the portal uses',
        await page.locator('.module-card[data-card="auditsys"]').getAttribute('data-module'), 'audit');
  await page.close();
}
{
  const page = await openHub(browser, { modules: { audit: 'normal' } });
  check('a plain auditor sees it too — the four module cards live behind it',
        await shown(page, 'auditsys'), true);
  await page.close();
}
{
  /* Another module held, or the hub refuses this login altogether and
     never gets as far as gating a tile. */
  const page = await openHub(browser, { modules: { audit: 'none', scan: 'admin' } });
  check('an explicit None closes it', await shown(page, 'auditsys'), false);
  await page.close();
}
{
  const page = await openHub(browser, { modules: { scan: 'admin' } });
  check('and so does nobody having been asked, because it opens a back office',
        await shown(page, 'auditsys'), false);
  await page.close();
}

console.log('\n── 3. The Audit Portal door means ONE thing now ──');
{
  /* This is the half the office actually asked for: pressing a door called
     Audit Portal gets you the auditor portal, whoever you are. */
  for (const [who, perms] of [
    ['an audit ADMIN',  { modules: { scan: 'admin', audit: 'admin' },  manage_users: true }],
    ['a plain auditor', { modules: { scan: 'none',  audit: 'normal' }, manage_users: false }],
  ]) {
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    await mockSupabase(page, perms);
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('http://localhost:8779/scan/scan_admin.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(800);
    check('Audit Portal goes to the to-do list for ' + who,
          await page.locator('#audit-portal-link').getAttribute('href'), '../audit/audit_home.html');
    await page.close();
  }
}

console.log('\n── 4. Signing in at the auditor login lands on the auditor portal ──');
{
  /* auditLanding() used to read the audit module level and send an admin to
     audit_admin.html. Driven directly rather than through a sign-in, because
     the function IS the rule and a redirect would only prove the harness. */
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'audit', 'audit_index.html'), 'utf8');
  const a = src.indexOf('function auditLanding');
  if (a < 0) throw new Error('auditLanding has been renamed');
  const body = src.slice(a, src.indexOf('\n  }', a) + 4);

  const land = (user) => new Function('localStorage',
    'function applyLandingScope(){}\n' + body + '\nreturn auditLanding;')({
      getItem: () => JSON.stringify(user), setItem: () => {}, removeItem: () => {},
    })();

  check('an audit admin lands on the to-do list',
        land({ permissions: { modules: { audit: 'admin' } } }), 'audit_home.html');
  check('so does one whose ROLE says administrator',
        land({ role: 'administrator' }), 'audit_home.html');
  check('and a plain auditor, unchanged',
        land({ permissions: { modules: { audit: 'normal' } } }), 'audit_home.html');
  check('and a signed-in user with nothing recorded at all',
        land({}), 'audit_home.html');
}

console.log('\n── 5. Nobody is stranded, and the back office still works ──');
{
  /* The one real risk in moving a page behind a new door: the page itself
     refusing the people who now arrive through it. audit_admin.html asks
     only for a signed-in audit session, deliberately — its own comment says
     why — so the hub tile is a door and not a wall. */
  const fs = require('fs');
  const path = require('path');
  const admin = fs.readFileSync(path.join(__dirname, '..', 'audit', 'audit_admin.html'), 'utf8');
  checkTrue('audit_admin.html asks for a sign-in and not for admin',
            admin.indexOf('MJMAuditLogin.requireSignIn()') >= 0 &&
            admin.indexOf('MJMAuditLogin.requireAdmin()') < 0);
  checkTrue('the back office still has its own way back to the hub',
            admin.indexOf('ai.mjmnursery.com/index.html') >= 0);
  const home = fs.readFileSync(path.join(__dirname, '..', 'audit', 'audit_home.html'), 'utf8');
  checkTrue('and so does the auditor portal, which is how an admin reaches the tile',
            home.indexOf('ai.mjmnursery.com/index.html') >= 0);

  /* scan_admin.html carries every line of its own code inline, so a cached
     copy is the OLD routing for ever. It had no no-cache metas and the
     routing is the first thing that changed in it. */
  const scan = fs.readFileSync(path.join(__dirname, '..', 'scan', 'scan_admin.html'), 'utf8');
  check('scan_admin.html carries all three no-cache metas, or the move reaches nobody',
        [/Cache-Control/.test(scan), /Pragma/.test(scan), /Expires/.test(scan)], [true, true, true]);
}

await browser.close();
console.log('\n' + (fail ? 'FAILURES: ' + fail + ' (passed ' + pass + ')'
                         : 'all good — ' + pass + ' checks'));
process.exit(fail ? 1 : 0);
})();
