/* super_admin used to be a UI convention only -- a greyed-out Save button,
   with nothing in the database asking who holds it. Anybody holding
   manage_users could set super_admin:true on any row, their own included,
   with one API call that never touched the screen.

   shared/RUN_ME_super_admin_and_module_access.sql closes that: a trigger
   on shared_profiles refuses to grant or revoke super_admin unless the
   caller already holds it, and permanently protects the one account the
   whole system is rooted on (nursery.mjsb@gmail.com) from ever losing it,
   through any door. The real refusal lives there -- this drives the
   SCREEN: the Super Admins panel on user_access.html (hidden unless you
   hold it), dragging a system user in to promote them, and the cross to
   demote one that is not the anchor.

   Run: node tests/super_admin_is_rooted_and_promotable.cjs
   with `python3 -m http.server 8779` serving the repository root.      */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

const ANCHOR = { id: 'u-anchor', email: 'nursery.mjsb@gmail.com', full_name: 'Anchor', user_type: 'system', permissions: { super_admin: true, manage_users: true, modules: {} } };
const SUPER2 = { id: 'u-super2', email: 'other.super@example.com', full_name: 'Other Super', user_type: 'system', permissions: { super_admin: true, manage_users: true, modules: {} } };
const PLAIN  = { id: 'u-plain', email: 'plain@example.com', full_name: 'Plain Person', user_type: 'system', permissions: { manage_users: false, modules: {} } };
const MANAGER = { id: 'u-manager', email: 'manager@example.com', full_name: 'Plain Manager', user_type: 'system', permissions: { manage_users: true, modules: {} } };

function mockSupabase(page, { meId }) {
  return page.addInitScript(({ meId, rowsSeed }) => {
    const rows = rowsSeed.map(r => ({ ...r, permissions: JSON.parse(JSON.stringify(r.permissions)) }));
    const me = rows.find(r => r.id === meId);

    function profilesFrom() {
      function builder(state) {
        function resolveSingle() {
          const row = rows.find(r => String(r[state.eqCol]) === String(state.eqVal));
          return Promise.resolve({ data: row || null, error: null });
        }
        function exec() {
          if (state.update) {
            const row = rows.find(r => String(r[state.eqCol]) === String(state.eqVal));
            if (row) Object.assign(row, state.update);
            return Promise.resolve({ error: null });
          }
          if (state.eqCol) {
            const row = rows.find(r => String(r[state.eqCol]) === String(state.eqVal));
            return Promise.resolve({ data: row ? [row] : [], error: null });
          }
          return Promise.resolve({ data: rows, error: null });
        }
        return {
          select() { return builder(state); },
          eq(col, val) { return builder(Object.assign({}, state, { eqCol: col, eqVal: val })); },
          order() { return builder(state); },
          range() { return builder(state); },
          limit() { return builder(state); },
          in() { return builder(state); },
          maybeSingle() { return resolveSingle(); },
          single() { return resolveSingle(); },
          update(vals) { return builder(Object.assign({}, state, { update: vals })); },
          insert() { return Promise.resolve({ data: null, error: null }); },
          then(a, b) { return exec().then(a, b); },
          finally(f) { return exec().finally(f); },
        };
      }
      return builder({});
    }

    function chain(result) {
      const self = {
        select() { return self; }, eq() { return self; }, single() { return self; },
        or() { return self; }, neq() { return self; }, gt() { return self; },
        order() { return self; }, limit() { return self; }, in() { return self; }, gte() { return self; },
        then(a, b) { return Promise.resolve(result).then(a, b); },
        finally(f) { return Promise.resolve(result).finally(f); },
      };
      return self;
    }

    window.supabase = {
      createClient: () => ({
        from: (table) => table === 'shared_profiles' ? profilesFrom() : chain({ data: [], error: null }),
        rpc: (fn, args) => {
          if (fn === 'mjm_set_super_admin') {
            if (!me.permissions.super_admin) return Promise.resolve({ error: { message: 'Only a super admin may grant or revoke super_admin' } });
            if (args.target_id === rows[0].id && !args.make_super) return Promise.resolve({ error: { message: 'anchor protected' } });
            const row = rows.find(r => r.id === args.target_id);
            if (row) {
              row.permissions.super_admin = args.make_super;
              if (args.make_super) row.permissions.manage_users = true;
            }
            return Promise.resolve({ error: null });
          }
          return Promise.resolve({ error: null });
        },
        auth: {
          getSession: async () => ({ data: { session: { user: { id: me.id, email: me.email, user_metadata: { full_name: me.full_name } } } }, error: null }),
          getUser: async () => ({ data: { user: { id: me.id, email: me.email } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null }),
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, { meId, rowsSeed: [ANCHOR, SUPER2, PLAIN, MANAGER] });
}

async function dragRowIntoDropzone(page, rowSelector, dropSelector) {
  await page.evaluate(([rowSelector, dropSelector]) => {
    const row = document.querySelector(rowSelector);
    const zone = document.querySelector(dropSelector);
    const dt = new DataTransfer();
    row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    row.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, [rowSelector, dropSelector]);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nAs a super admin: panel shows, anchor locked, drag promotes, cross demotes');
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-anchor' });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(600);

    checkTrue('super-admin-card is visible', await page.locator('#super-admin-card').isVisible());
    checkTrue('anchor chip shows a lock', await page.locator('#super-admin-drop .sa-chip:has-text("Anchor") .sa-lock').count());
    check('anchor chip has no remove cross', await page.locator('#super-admin-drop .sa-chip:has-text("Anchor") .sa-chip-x').count(), 0);
    checkTrue('Other Super chip HAS a remove cross', await page.locator('#super-admin-drop .sa-chip:has-text("Other Super") .sa-chip-x').count());
    checkTrue('Plain Person row is draggable', await page.locator('.user-row[data-uid="u-plain"]').getAttribute('draggable') === 'true');

    await dragRowIntoDropzone(page, '.user-row[data-uid="u-plain"]', '#super-admin-drop');
    await page.waitForTimeout(300);
    checkTrue('dragging Plain Person into the drop zone promoted them', await page.locator('#super-admin-drop .sa-chip:has-text("Plain Person")').count());
    checkTrue('promoted Plain Person also gets a remove cross', await page.locator('#super-admin-drop .sa-chip:has-text("Plain Person") .sa-chip-x').count());

    await page.locator('#super-admin-drop .sa-chip:has-text("Plain Person") .sa-chip-x').click();
    await page.waitForTimeout(300);
    check('clicking the cross demoted Plain Person', await page.locator('#super-admin-drop .sa-chip:has-text("Plain Person")').count(), 0);

    await page.close();
  }

  console.log('\nAs a plain Manage-Users holder who is NOT super admin: no card at all');
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-manager' });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(600);

    check('the main body is not carrying .hidden for a Manage-Users holder', await page.locator('#main').evaluate(el => el.classList.contains('hidden')), false);
    /* Tailwind's CDN is refused in this harness (no network), so the
       `.hidden{display:none}` utility never gets DEFINED -- isVisible()
       would answer true whatever the class list says. Read the class the
       gate actually writes instead, the same trap CLAUDE.md already names. */
    check('super-admin-card carries .hidden for a non-super-admin', await page.locator('#super-admin-card').evaluate(el => el.classList.contains('hidden')), true);
    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
