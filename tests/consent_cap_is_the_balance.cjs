/* A NEW CONSENT IS CAPPED ON THE BALANCE, NOT ON EVERY CONSENT EVER SIGNED.

   The cap used to be ordered qty minus the sum of every consent_qty ever
   signed on the AL, "regardless of how much has physically been delivered
   so far" — which read an order as fully consented the moment two
   consents happened to add up to the ordered total, even while most of
   it was still sitting uncollected.

   N2T596 is the real case: ordered 1,200, one consent of 600 signed in
   July with nothing ever scanned against it, one consent of 600 signed
   in November scanned past its own cap to 750 collected. Two consents
   summed to the full 1,200 ordered, so the office could not sign a third
   consent for the 450 still outstanding on the balance — the modal read
   "Max: 0 remaining of 1,200 ordered" over an order that was nowhere
   near finished.

   Decided 3 Nov 2026: gate a new consent on the AL's own balance_quantity
   instead. Signing a consent does not move that column — only a DO does
   — so the max does not fall as more consents are signed in one sitting;
   that is a known, accepted trade (see the comment in openConsentModal).

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/consent_cap_is_the_balance.cjs
   with a static server on 8777 serving the repository root.
*/
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
const checkTrue = (name, got) => check(name, !!got, true);

const AL_NUMBER = 'N2T596';
const DB = {
  shared_al_orders: [{
    id: 1, al_number: AL_NUMBER, order_number: 'ORD-N2T596',
    customer_name: 'UNIBEAR PLANTATION SDN BHD', product_name: 'Oil Palm Seedling — July 2026',
    quantity_ordered: 1200, balance_quantity: 750, status: 'Verified',
    created_at: '2026-06-01T00:00:00Z'
  }],
  mobile_consent_records: [
    { id: 1, al_number: AL_NUMBER, order_number: 'ORD-N2T596', customer_name: 'UNIBEAR PLANTATION SDN BHD',
      consent_qty: 600, signature_data: 'x', created_at: '2026-07-02T09:43:00Z' },
    { id: 2, al_number: AL_NUMBER, order_number: 'ORD-N2T596', customer_name: 'UNIBEAR PLANTATION SDN BHD',
      consent_qty: 600, signature_data: 'x', created_at: '2026-11-03T08:17:00Z' }
  ],
  shared_profiles: [{ id: 'u1', user_type: 'staff', role: 'admin',
    permissions: { manage_users: true, modules: { mobile: 'admin' } } }]
};

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => { errs.push('ALERT: ' + d.message()); d.dismiss(); });

  await page.addInitScript((seed) => {
    window.__DB = seed;
    function makeQuery(table) {
      const st = { eqs: [], single: false };
      const rows = () => {
        let out = (window.__DB[table] || []).slice();
        st.eqs.forEach(([c, v]) => { out = out.filter((r) => String(r[c]) === String(v)); });
        return out;
      };
      const run = () => { const o = rows(); return st.single ? { data: o[0] || null, error: null } : { data: o, error: null }; };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve(run()).then(a, b);
        if (p === 'eq') return (c, v) => { st.eqs.push([c, v]); return q; };
        if (p === 'maybeSingle' || p === 'single') return () => { st.single = true; return Promise.resolve(run()); };
        if (p === 'order' || p === 'in' || p === 'not' || p === 'gt' || p === 'lte' || p === 'range') return () => q;
        if (p === 'insert' || p === 'update' || p === 'upsert' || p === 'delete') return () => q;
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'test@mjmnursery.com' };
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
  }, DB);

  for (const host of ['**/cdn.tailwindcss.com/**', '**/cdn.jsdelivr.net/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.route('**/shared_nelos_dock.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

  await page.goto('http://localhost:8777/mobile/mobile_consent.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.openConsentModal === 'function', { timeout: 20000 });
  await page.waitForFunction(() => Array.isArray(window.alData) && window.alData.length > 0, { timeout: 20000 })
    .catch(() => {}); // alData isn't on window by default; fall through and poll the modal itself below
  return { page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, errs } = await boot(browser);

  console.log('\nTwo old consents already sum to the full 1,200 ordered');
  // Open the consent modal for N2T596 — same AL, two consents of 600 each
  // already on file (600 + 600 = 1,200 = quantity_ordered).
  await page.evaluate((al) => openConsentModal(al), AL_NUMBER);
  await page.waitForTimeout(400);

  const max = await page.evaluate(() => (typeof getMaxConsentQty === 'function' ? getMaxConsentQty() : null));
  check('the cap is the balance (750), not ordered-minus-consented (0)', max, 750);

  const hint = await page.evaluate(() => {
    const el = document.getElementById('max-qty-hint');
    return el ? el.textContent : null;
  });
  checkTrue('the hint says remaining to collect, not "of 1,200 ordered"', hint && hint.includes('750') && !/of\s*1,200\s*ordered/.test(hint));

  console.log('\nA quantity up to the balance can be picked');
  // selectedQty is a `let` at classic-script top scope, so it is not a
  // property of window — read back what the UI itself shows instead.
  await page.evaluate(() => selectQty(450));
  const selectedLabel = await page.evaluate(() => {
    const el = document.getElementById('qty-selected-value');
    return el ? el.textContent : null;
  });
  check('450 (part of the still-uncollected balance) can be selected', selectedLabel, '450');
  checkTrue('nothing was thrown picking it', !errs.some(e => /ALERT/.test(e)));

  console.log('\nOver the balance is still refused');
  await page.evaluate(() => selectQty(900));
  const afterOverLabel = await page.evaluate(() => {
    const el = document.getElementById('qty-selected-value');
    return el ? el.textContent : null;
  });
  check('900 (over the 750 balance) is refused — selection unchanged', afterOverLabel, '450');

  await page.close();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
