/* A seed count that tallies has to survive Save and come back.

   Eight bags counted, Save pressed more than once, and every row came
   back showing "Count Seeds" again -- the counts gone. Every one of them
   tallied: 250 from the supplier, 250 audited, 250 counted.

   This drives the whole round trip on the real page: count through the
   real handler, save through the real save, then reload a page with
   exactly the rows that save wrote and look at what comes back.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/seed_count_roundtrip.cjs
   with a static server on 8777 serving the repository root.              */
const { chromium } = require('playwright');

const BATCH = '242';
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

const SEEDS_ROW = {
  id: 'sr-1', batch_name: BATCH, transaction_type: 'Seeds_Received',
  breed_name: 'AA HYBRIDA 1S', quantity_change: 2000, plot_name: 'Pre-Nursery',
  transaction_date: '2026-09-01', created_at: '2026-09-01T02:00:00.000Z',
  workers: 4, remark: 'Supplier: AAR. MPOB: 123-456'
};

async function openPage(browser, auditRows) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on('pageerror', e => { if (!/MJMReview/.test(e.message)) console.log('  [page error] ' + e.message); });

  await page.addInitScript(({ seedsRow, audits }) => {
    window.__INSERTS = []; window.__DELETES = []; window.__TOASTS = [];
    window.__SEEDS_ROWS = [seedsRow];
    window.__AUDIT_ROWS = audits;

    function makeQuery() {
      const st = { filters: {}, types: null, del: false };
      const rows = () => {
        if (st.filters.transaction_type === 'Seed_Audit')     return window.__AUDIT_ROWS;
        if (st.filters.transaction_type === 'Seeds_Received') return window.__SEEDS_ROWS;
        return [];
      };
      const q = new Proxy({}, { get(_, p) {
        if (p === 'then') return (a, b) => Promise.resolve({ data: rows(), error: null }).then(a, b);
        if (p === 'in') return (c, v) => { if (c === 'transaction_type') st.types = v; return q; };
        if (p === 'delete') return () => { st.del = true; return q; };
        if (p === 'insert') return r => {
          const list = [].concat(r);
          window.__INSERTS.push(...list);
          const out = Promise.resolve({ data: list, error: null });
          return { select: () => out, then: (a, b) => out.then(a, b) };
        };
        if (p === 'eq') return (c, v) => {
          st.filters[c] = v;
          if (st.del && c === 'transaction_type') window.__DELETES.push(v);
          return q;
        };
        if (p === 'maybeSingle' || p === 'single')
          return () => Promise.resolve({ data: rows()[0] || null, error: null });
        return () => q;
      } });
      return q;
    }
    const user = { id: 'u1', email: 'elon@mjm' };
    window.supabase = { createClient: () => ({
      from: makeQuery, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: { user } }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null })
      },
      storage: { from: () => ({
        upload: async (path) => ({ data: { path }, error: null }),
        getPublicUrl: (path) => ({ data: { publicUrl: 'https://files.test/' + path } }),
        remove: async () => ({ error: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {}
    }) };
  }, { seedsRow: SEEDS_ROW, audits: auditRows });

  await page.route('**/shared_access.js', r => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id: 'u1', email: 'elon@mjm', full_name: 'Elon' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true;
    } });`
  }));
  await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
  await page.route('**/cdn.jsdelivr.net/**',    r => r.fulfill({ status: 200, body: '' }));
  await page.route('**://*.supabase.co/**',     r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.goto('http://localhost:8777/operation/operation_batch_detail.html?id=' + BATCH,
                  { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.saveSeedAudit === 'function', { timeout: 15000 });
  await page.evaluate(() => {
    window.showToast = (m, t) => { window.__TOASTS.push({ m, t }); };
    // the AI and the two canvas steps; everything else is the real thing
    window._seedCallGemini = async () => ({
      seeds: Array.from({ length: 250 }, (_, i) => [i, i]), confidence: 'high' });
    window._seedCompressImage = async (d) => d;
    window._seedDrawDotsOnImage = async (d) => d;
  });
  await page.waitForSelector('.t8-bag-row', { state: 'attached', timeout: 10000 });
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  console.log('\nCount a bag that tallies, then save');
  const page = await openPage(browser, []);
  const rowId = await page.evaluate(() => {
    const r = document.querySelector('.t8-bag-row');
    r.querySelector('.t8-bag-no').value = '14514';
    const sup = r.querySelector('.t8-supplier-qty'), rec = r.querySelector('.t8-received-qty');
    sup.value = '250'; sup.dispatchEvent(new Event('input', { bubbles: true }));
    rec.value = '250'; rec.dispatchEvent(new Event('input', { bubbles: true }));
    return r.id;
  });
  await page.setInputFiles(`#${rowId}-photo`, {
    name: 'bag.jpg', mimeType: 'image/jpeg',
    buffer: Buffer.from('ffd8ffe000104a46494600', 'hex')
  });
  await page.waitForFunction(id => {
    const el = document.getElementById(id).querySelector('.t8-verify-result');
    return el && /counted/i.test(el.textContent);
  }, rowId, { timeout: 10000 });

  const counted = await page.evaluate(id =>
    document.getElementById(id).querySelector('.t8-verify-result').textContent.trim(), rowId);
  checkTrue('the bag reads as checked, having tallied', /Checked/i.test(counted));
  checkTrue('…and names the count', /250/.test(counted));

  await page.evaluate(() => { window.__INSERTS = []; });
  await page.evaluate(() => window.saveSeedAudit());
  await page.waitForFunction(() => window.__INSERTS.length > 0, { timeout: 10000 });
  const written = await page.evaluate(() => window.__INSERTS.filter(r => r.transaction_type === 'Seed_Audit'));

  console.log('\nWhat the save actually wrote');
  check('one seed-audit row', written.length, 1);
  checkTrue('…with the bag number', /14514/.test(written[0].plot_name));
  checkTrue('…the supplier quantity', /SupplierQty:250/.test(written[0].remark));
  checkTrue('…the audited quantity', /ReceivedQty:250/.test(written[0].remark));
  checkTrue('…AND THE COUNT', /AiCount:250/.test(written[0].remark));
  await page.close();

  console.log('\nOpen it again, the way the next person would');
  const back = await openPage(browser, [{
    id: 'sa-1', batch_name: BATCH, transaction_type: 'Seed_Audit',
    plot_name: written[0].plot_name, quantity_change: written[0].quantity_change,
    transaction_date: written[0].transaction_date, created_at: '2026-09-29T02:00:00Z',
    remark: written[0].remark
  }]);
  const restored = await page.evaluate(() => 0).catch(() => 0);
  const shown = await back.evaluate(() => {
    const r = document.querySelector('.t8-bag-row');
    return {
      bag: r.querySelector('.t8-bag-no').value,
      sup: r.querySelector('.t8-supplier-qty').value,
      rec: r.querySelector('.t8-received-qty').value,
      result: (r.querySelector('.t8-verify-result').textContent || '').trim(),
      button: (r.querySelector('.t8-photo-btn').textContent || '').trim()
    };
  });
  check('the bag number came back', shown.bag, '14514');
  check('the supplier quantity came back', shown.sup, '250');
  check('the audited quantity came back', shown.rec, '250');
  checkTrue('THE COUNT CAME BACK', /counted\s*250/i.test(shown.result));
  check('…and the button is not offering to count it again',
        /Count Seeds/i.test(shown.button) && !/counted/i.test(shown.result), false);

  console.log('\nSaving again does not throw the count away');
  await back.evaluate(() => { window.__INSERTS = []; });
  await back.evaluate(() => window.saveSeedAudit());
  await back.waitForFunction(() => window.__INSERTS.length > 0, { timeout: 10000 });
  const again = await back.evaluate(() => window.__INSERTS.filter(r => r.transaction_type === 'Seed_Audit'));
  checkTrue('the second save still carries the count', /AiCount:250/.test(again[0].remark));

  await back.close();
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
