/* FEATURE PERMISSION CONTROL CAN RUN LONG, SO A LONG PAGE FOLDS.

   Nursery Maintenance carries seven action ticks now that Approve has
   joined Add & edit, Tick schedule, Tick Worker Record, Verify, Unlock
   and Open Setting -- a wall of checkboxes between it and the next
   page's card. The office asked for exactly this: "if a page's list is
   long, make it expandable/collapsible."

   Past COLLAPSE_AFTER (3) the rest fold under a "Show N more" toggle, in
   both shared_module_access.js (the engine behind nursery_ops, npayroll
   and audit's own screens) and operation_user_access.html's own
   hand-written drawer, kept in step rather than solving it once and
   leaving the other page to drift.

   THE FOLD IS BY POSITION, NOT BY VALUE. Hiding only the actions that
   happen to read off would barely shorten the common, never-configured
   row at all -- most actions default to allowed, so there would be
   almost nothing to fold on the row this exists for. The one thing a
   reader can always rely on is that the same three rows are the ones
   showing, whatever is ticked underneath the fold.

   A HIDDEN CHECKBOX STILL SAVES WHAT IT WAS TICKED TO. Folding is a CSS
   display:none, never a removal, so a row already answered one way before
   this shipped keeps answering that way until somebody expands the card
   and looks.

   THE TOGGLE IS ONE-WAY. Expanding, ticking something, then folding again
   would hide the row somebody just ticked under the same class that hid
   it before -- which reads as the tick being lost, even though Save would
   still pick it up. So there is no way back once a card has been
   expanded.

   A page at or under the limit gets no toggle at all -- the point is a
   long list, not a button on every card.

   Run: node tests/a_long_page_list_folds_under_a_toggle.cjs
   with `python3 -m http.server 8779` serving the repository root.        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

function mockSupabase(page, { meId, rowsSeed }) {
  return page.addInitScript(({ meId, rowsSeed }) => {
    const rows = rowsSeed.map(r => ({ ...r, permissions: JSON.parse(JSON.stringify(r.permissions)) }));
    const me = rows.find(r => r.id === meId);
    window.__ROWS = rows;

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
          limit() { return builder(state); },
          maybeSingle() { return resolveSingle(); },
          single() { return resolveSingle(); },
          update(vals) { return builder(Object.assign({}, state, { update: vals })); },
          then(a, b) { return exec().then(a, b); },
          finally(f) { return exec().finally(f); },
        };
      }
      return builder({});
    }
    function chain(result) {
      const self = {
        select() { return self; }, eq() { return self; }, order() { return self; }, limit() { return self; },
        then(a, b) { return Promise.resolve(result).then(a, b); },
        finally(f) { return Promise.resolve(result).finally(f); },
      };
      return self;
    }

    window.supabase = {
      createClient: () => ({
        from: (table) => table === 'shared_profiles' ? profilesFrom() : chain({ data: [], error: null }),
        rpc: (fn, args) => {
          if (fn === 'mjm_set_module_access') {
            const row = rows.find(r => r.id === args.target_id);
            if (row) {
              row.permissions[args.p_module + '_pages'] = args.p_pages;
              row.permissions[args.p_module + '_actions'] = args.p_actions;
            }
          }
          return Promise.resolve({ error: null });
        },
        auth: {
          getSession: async () => ({ data: { session: { user: { id: me.id, email: me.email, user_metadata: { full_name: me.full_name } } } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null }),
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, { meId, rowsSeed });
}

const NOPS_ADMIN = { id: 'u-nops-admin', email: 'nops.admin@example.com', full_name: 'Nops Admin', user_type: 'system',
  permissions: { modules: { nursery_ops: 'admin' }, manage_users: true } };
const TARGET = { id: 'u-target', email: 'target@example.com', full_name: 'Target One', user_type: 'system',
  permissions: { modules: { nursery_ops: 'normal' } } };

const OP_ADMIN = { id: 'u-op-admin', email: 'op.admin@example.com', full_name: 'Op Admin', user_type: 'system',
  permissions: { modules: { operation: 'admin' }, manage_users: true } };
const OP_TARGET = { id: 'u-op-target', email: 'op.target@example.com', full_name: 'Op Target', user_type: 'system',
  permissions: { modules: { operation: 'normal' },
    operation_actions: { orders: { view: true, manage: true, ba_manage: true, al_manage: false,
      al_verify: false, al_cancel: true, delete: false } } } };

async function clickToggle(page, key) {
  // The drawer scrolls, and Playwright's own actionability check can read
  // a toggle below the fold as "outside the viewport" even after it has
  // scrolled there -- the harness runs with Tailwind's CDN blocked, so the
  // drawer's layout utility classes do not apply and the scroll container
  // is not where a styled build would put it. Clicking in the page avoids
  // relying on Playwright's own notion of visibility for an element that
  // is, in fact, on screen.
  await page.evaluate((k) => document.querySelector(`[data-toggle-acts="${k}"]`).click(), key);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nshared_module_access.js: Nursery Maintenance (7 actions) folds, a short page does not');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-nops-admin', rowsSeed: [NOPS_ADMIN, TARGET] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/nursery_ops/nursery_ops_user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);
    await page.locator('.user-row:has-text("Target One") [data-action="edit"]').click();
    await page.waitForTimeout(150);

    checkTrue('the maintenance card offers a toggle', await page.locator('[data-toggle-acts="maintenance"]').count());
    check('exactly four rows (7 - 3) are folded', await page.locator('#d-acts-maintenance .act-row.act-more').count(), 4);
    checkTrue('the approve row, 4th in the list, is one of the folded ones',
      await page.locator('#d-act-maintenance-approve').evaluate(el => el.closest('.act-row').classList.contains('act-more')));
    checkTrue('the toggle names how many it is hiding', (await page.locator('[data-toggle-acts="maintenance"]').textContent()).includes('4'));

    checkTrue('a short page (seeds, one action) offers no toggle', await page.locator('[data-toggle-acts="seeds"]').count() === 0);

    await clickToggle(page, 'maintenance');
    checkTrue('expanding reveals the folded rows', await page.locator('#d-acts-maintenance').evaluate(el => el.classList.contains('acts-expanded')));
    check('and removes the toggle', await page.locator('[data-toggle-acts="maintenance"]').count(), 0);
    checkTrue('the approve checkbox is now visible and tickable', await page.locator('#d-act-maintenance-approve').isVisible());

    await page.evaluate(() => {
      const el = document.getElementById('d-act-maintenance-approve');
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.evaluate(() => document.getElementById('d-save').click());
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => window.__ROWS.find(r => r.id === 'u-target').permissions);
    checkTrue('a tick made after expanding is saved', saved.nursery_ops_actions && saved.nursery_ops_actions.maintenance && saved.nursery_ops_actions.maintenance.approve);

    await page.close();
  }

  console.log('\nshared_module_access.js: a row already ticked beyond the fold still saves what it was ticked to');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    const target2 = { id: 'u-target2', email: 'target2@example.com', full_name: 'Target Two', user_type: 'system',
      permissions: { modules: { nursery_ops: 'normal' },
        nursery_ops_actions: { maintenance: { view: true, add_record: true, tick_schedule: false,
          worker_record: false, approve: true, verify: false, unverify: false, setting: false } } } };
    mockSupabase(page, { meId: 'u-nops-admin', rowsSeed: [NOPS_ADMIN, target2] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/nursery_ops/nursery_ops_user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);
    await page.locator('.user-row:has-text("Target Two") [data-action="edit"]').click();
    await page.waitForTimeout(150);

    checkTrue('approve, already ticked, is STILL folded by position',
      await page.locator('#d-act-maintenance-approve').evaluate(el => el.closest('.act-row').classList.contains('act-more')));
    check('but it IS checked underneath the fold',
      await page.locator('#d-act-maintenance-approve').evaluate(el => el.checked), true);

    // Save without ever expanding the card -- the hidden, already-true
    // checkbox must not be read as false just because nobody looked at it.
    await page.evaluate(() => document.getElementById('d-save').click());
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => window.__ROWS.find(r => r.id === 'u-target2').permissions);
    checkTrue('a folded tick survives a save nobody expanded the card for',
      saved.nursery_ops_actions.maintenance.approve);

    await page.close();
  }

  console.log('\noperation_user_access.html: Customer Order Documentation (6 actions) folds the same way');
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
    page.on('pageerror', e => console.log('  [page error] ' + e.message));
    mockSupabase(page, { meId: 'u-op-admin', rowsSeed: [OP_ADMIN, OP_TARGET] });
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto('http://localhost:8779/operation/operation_user_access.html', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(700);
    await page.locator('.user-row:has-text("Op Target") [data-action="edit"]').click();
    await page.waitForTimeout(150);

    checkTrue('orders offers a toggle', await page.locator('[data-toggle-acts="orders"]').count());
    check('three rows (6 - 3) are folded', await page.locator('#d-acts-orders .act-row.act-more').count(), 3);
    checkTrue('a page with three actions (stock) offers no toggle', await page.locator('[data-toggle-acts="stock"]').count() === 0);

    checkTrue('al_cancel, already ticked and folded, is checked underneath',
      await page.locator('#d-act-orders-al_cancel').evaluate(el => el.checked));

    await clickToggle(page, 'orders');
    checkTrue('expanding shows it', await page.locator('#d-act-orders-al_cancel').isVisible());

    await page.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
