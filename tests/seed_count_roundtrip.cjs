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

  /* THE PHOTO OF A BAG THAT TALLIES IS KEPT AND CAN BE LOOKED AT.

     It used to be dropped the instant the row went green — the office
     pressed Count Seeds and the picture the AI had just counted was gone
     before anybody could see it, leaving "Checked, AI counted 250" with
     nothing behind it. */
  await page.waitForFunction(id => {
    const el = document.getElementById(id).querySelector('.t8-verify-result');
    return el && /photo saved/i.test(el.textContent);
  }, rowId, { timeout: 10000 });

  /* The state is a `const` at script scope and so is not reachable from
     window — which is as it should be. Everything here is read off the row
     the office is actually looking at. */
  const kept = await page.evaluate(id => {
    const r = document.getElementById(id);
    return {
      said: (r.querySelector('.t8-verify-result').textContent || '').trim(),
      actionsHidden: r.querySelector('.t8-photo-actions').classList.contains('hidden'),
      thumbHidden:   r.querySelector('.t8-photo-thumb').classList.contains('hidden')
    };
  }, rowId);
  checkTrue('a bag that tallies still has its photo', /photo saved/i.test(kept.said));
  checkTrue('…and still reads as Checked, not as a mismatch', /Checked/i.test(kept.said));
  check('…the View button is offered', kept.actionsHidden, false);
  /* The list is read by running down it for the row that disagrees, so a
     matched row offers the button and not the picture. */
  check('…and the thumbnail stays shut on a row that agrees', kept.thumbHidden, true);

  const lb = await page.evaluate(id => {
    window.viewBagPhoto(id);
    const el = document.getElementById('seed-photo-lightbox');
    return el ? { shown: el.style.display, src: (el.querySelector('img').getAttribute('src') || '').slice(0, 5) } : null;
  }, rowId);
  checkTrue('pressing View opens it', lb && lb.shown === 'flex');
  checkTrue('…on an actual picture', lb && (lb.src === 'data:' || lb.src === 'https'));
  await page.evaluate(() => { const el = document.getElementById('seed-photo-lightbox'); if (el) el.click(); });

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
  checkTrue('…AND THE PHOTO, on a bag that tallied', /PhotoUrl:https?:/.test(written[0].remark));
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
      button: (r.querySelector('.t8-photo-btn').textContent || '').trim(),
      actionsHidden: r.querySelector('.t8-photo-actions').classList.contains('hidden')
    };
  });
  check('the bag number came back', shown.bag, '14514');
  check('the supplier quantity came back', shown.sup, '250');
  check('the audited quantity came back', shown.rec, '250');
  checkTrue('THE COUNT CAME BACK', /counted\s*250/i.test(shown.result));
  check('…and the button is not offering to count it again',
        /Count Seeds/i.test(shown.button) && !/counted/i.test(shown.result), false);
  /* The whole point of keeping it: somebody opening the batch months later
     can look at the bag that agreed, not only at the one that did not. */
  checkTrue('THE PHOTO CAME BACK TOO', /photo saved/i.test(shown.result));
  check('…and can be opened from the row', shown.actionsHidden, false);

  console.log('\nSaving again does not throw the count away');
  await back.evaluate(() => { window.__INSERTS = []; });
  await back.evaluate(() => window.saveSeedAudit());
  await back.waitForFunction(() => window.__INSERTS.length > 0, { timeout: 10000 });
  const again = await back.evaluate(() => window.__INSERTS.filter(r => r.transaction_type === 'Seed_Audit'));
  checkTrue('the second save still carries the count', /AiCount:250/.test(again[0].remark));
  checkTrue('…and the photo', /PhotoUrl:https?:/.test(again[0].remark));

  console.log('\nA row corrected into a mismatch still has its evidence');
  /* The hole the old rule left: a bag that agreed had its photo dropped
     while it agreed, so correcting a figure afterwards turned it into a
     mismatch with nothing to look at — the one state where the picture is
     most wanted. */
  const edited = await back.evaluate(() => {
    const r = document.querySelector('.t8-bag-row');
    const rec = r.querySelector('.t8-received-qty');
    rec.value = '251';
    rec.dispatchEvent(new Event('input', { bubbles: true }));
    const thumb = r.querySelector('.t8-photo-thumb');
    return {
      said: (r.querySelector('.t8-verify-result').textContent || '').trim(),
      thumbHidden: thumb.classList.contains('hidden'),
      thumbSrc: (thumb.getAttribute('src') || '').slice(0, 5),
      actionsHidden: r.querySelector('.t8-photo-actions').classList.contains('hidden')
    };
  });
  checkTrue('it reads as a mismatch now', /Mismatch/i.test(edited.said));
  checkTrue('…and the photo is still there', /photo saved/i.test(edited.said));
  check('…shown open, because this is the row to look at', edited.thumbHidden, false);
  checkTrue('…on a real picture', edited.thumbSrc === 'https' || edited.thumbSrc === 'data:');
  check('…with View and Delete beside it', edited.actionsHidden, false);

  console.log('\nRecount asks WHICH, because the photo was never the problem');
  /* A count that comes back wrong over a perfectly good photo used to be
     answerable only by walking back to the bag: the button opened the
     camera, every time. */
  const chooser = await back.evaluate(() => {
    const r = document.querySelector('.t8-bag-row');
    let opened = false;
    const input = document.getElementById(r.id + '-photo');
    input.click = () => { opened = true; };
    window.onBagCountBtn(r.id);
    const el = document.getElementById('recount-chooser');
    return {
      shown: el ? el.style.display : null,
      wentStraightToCamera: opened,
      same: el ? (el.querySelector('#recount-same').textContent || '').trim() : '',
      fresh: el ? (el.querySelector('#recount-new').textContent || '').trim() : '',
      upload: el ? (el.querySelector('#recount-upload').textContent || '').trim() : '',
      sub: el ? (el.querySelector('#recount-sub').textContent || '').trim() : ''
    };
  });
  checkTrue('pressing Recount opens the choice', chooser.shown === 'flex');
  check('…instead of opening the camera on its own', chooser.wentStraightToCamera, false);
  checkTrue('…offering the same photo again', /count this photo again/i.test(chooser.same));
  checkTrue('…and a new one', /take a new photo/i.test(chooser.fresh));
  checkTrue('…or one to upload', /upload photo/i.test(chooser.upload));
  checkTrue('…and it says what the AI made of it last time', /250/.test(chooser.sub));

  const cancelled = await back.evaluate(() => {
    const r = document.querySelector('.t8-bag-row');
    const before = (r.querySelector('.t8-verify-result').textContent || '').trim();
    document.getElementById('recount-chooser').querySelector('#recount-cancel').click();
    return { shut: document.getElementById('recount-chooser').style.display,
             same: (r.querySelector('.t8-verify-result').textContent || '').trim() === before };
  });
  check('Cancel shuts it', cancelled.shut, 'none');
  checkTrue('…and changes nothing', cancelled.same);

  const picked = await back.evaluate(() => {
    const r = document.querySelector('.t8-bag-row');
    let opened = false;
    /* A phone: its own camera, through the capture box. */
    window._bagUseLiveCamera = () => false;
    document.getElementById(r.id + '-photo').click = () => { opened = true; };
    window.onBagCountBtn(r.id);
    document.getElementById('recount-chooser').querySelector('#recount-new').click();
    return { opened, shut: document.getElementById('recount-chooser').style.display };
  });
  checkTrue('Take a new photo opens the camera', picked.opened);
  check('…and closes the dialog', picked.shut, 'none');

  const uploaded = await back.evaluate(() => {
    const r = document.querySelector('.t8-bag-row');
    let cam = false, up = false;
    document.getElementById(r.id + '-photo').click = () => { cam = true; };
    const box = document.getElementById(r.id + '-upload');
    box.click = () => { up = true; };
    window.onBagCountBtn(r.id);
    document.getElementById('recount-chooser').querySelector('#recount-upload').click();
    return { cam, up, capture: box.hasAttribute('capture') };
  });
  checkTrue('Upload photo opens the file box', uploaded.up);
  check('…not the camera', uploaded.cam, false);
  check('…and that box carries no capture, so the gallery is offered', uploaded.capture, false);

  console.log('\nA row with no photo is asked too: take one, or upload one');
  const plain = await back.evaluate(() => {
    window.addSeedAuditRow();
    const rows = document.querySelectorAll('.t8-bag-row');
    const r = rows[rows.length - 1];
    let opened = false;
    document.getElementById(r.id + '-photo').click = () => { opened = true; };
    window.onBagCountBtn(r.id);
    const el = document.getElementById('recount-chooser');
    const out = {
      opened, dialog: el.style.display,
      title: el.querySelector('#recount-title').textContent,
      same: el.querySelector('#recount-same-wrap').style.display,
      fresh: el.querySelector('#recount-new').textContent.trim()
    };
    el.querySelector('#recount-cancel').click();
    return out;
  });
  check('nothing opened before a choice', plain.opened, false);
  check('…the choice is shown', plain.dialog, 'flex');
  check('…headed Count seeds', plain.title, 'Count seeds');
  check('…with no photo to count again', plain.same, 'none');
  check('…offering to take one', plain.fresh, '📷 Take photo');
  await back.close();

  console.log('\nOn a laptop, Take photo opens the webcam and counts what it sees');
  const camBrowser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const cam = await openPage(camBrowser, []);
  const camRow = await cam.evaluate(() => {
    const r = document.querySelector('.t8-bag-row');
    const sup = r.querySelector('.t8-supplier-qty'), rec = r.querySelector('.t8-received-qty');
    sup.value = '250'; sup.dispatchEvent(new Event('input', { bubbles: true }));
    rec.value = '250'; rec.dispatchEvent(new Event('input', { bubbles: true }));
    window.__CAM_FILE = false;
    document.getElementById(r.id + '-photo').click = () => { window.__CAM_FILE = true; };
    document.getElementById(r.id + '-upload').click = () => { window.__CAM_FILE = true; };
    window.onBagCountBtn(r.id);
    document.getElementById('recount-chooser').querySelector('#recount-new').click();
    return r.id;
  });
  await cam.waitForFunction(() => {
    const b = document.getElementById('bag-cam-snap');
    return b && !b.disabled;
  }, null, { timeout: 10000 });
  check('the live camera is open, not a file box', await cam.evaluate(() =>
    [document.getElementById('bag-camera').style.display, window.__CAM_FILE]), ['flex', false]);
  await cam.click('#bag-cam-snap');
  await cam.waitForFunction(id => /counted/i.test(document.getElementById(id).querySelector('.t8-verify-result').textContent),
    camRow, { timeout: 10000 });
  const camAfter = await cam.evaluate(id => ({
    said: document.getElementById(id).querySelector('.t8-verify-result').textContent.trim(),
    shut: document.getElementById('bag-camera').style.display,
    live: !!document.getElementById('bag-cam-video').srcObject
  }), camRow);
  checkTrue('the captured frame is counted', /Checked/i.test(camAfter.said) && /250/.test(camAfter.said));
  check('…the camera dialog closes', camAfter.shut, 'none');
  check('…and the webcam is let go', camAfter.live, false);
  await camBrowser.close();

  console.log('\nTHE CLEAN FRAME IS WHAT GETS COUNTED');
  /* What is on screen and what is stored as PhotoUrl carry a red dot on
     every seed the AI found. Handing that back would have it counting its
     own marks, so the untouched frame is kept beside it and that is what a
     recount is given. Driven through the real handler both times — the
     only stub is the AI itself and the two canvas steps. */
  const rc = await openPage(browser, []);
  await rc.evaluate(() => {
    window.__SAW = [];
    window._seedDrawDotsOnImage = async (d) => d + '#DOTS';
    window._seedCallGemini = async (img) => {
      window.__SAW.push(String(img));
      return { seeds: Array.from({ length: 250 }, (_, i) => [i, i]), confidence: 'high' };
    };
  });
  const rcRow = await rc.evaluate(() => {
    const r = document.querySelector('.t8-bag-row');
    r.querySelector('.t8-bag-no').value = 'MJ11';
    return r.id;
  });
  await rc.setInputFiles(`#${rcRow}-photo`, {
    name: 'bag.jpg', mimeType: 'image/jpeg',
    buffer: Buffer.from('ffd8ffe000104a46494600', 'hex')
  });
  await rc.waitForFunction(id => {
    const el = document.getElementById(id).querySelector('.t8-verify-result');
    return el && /counted/i.test(el.textContent);
  }, rcRow, { timeout: 10000 });

  const firstPass = await rc.evaluate(id => ({
    asked: window.__SAW.length,
    dotted: /#DOTS$/.test(window.__SAW[0] || ''),
    thumb: (document.getElementById(id).querySelector('.t8-photo-thumb').getAttribute('src') || '')
  }), rcRow);
  check('the first count asked the AI once', firstPass.asked, 1);
  check('…about the frame as it came off the camera', firstPass.dotted, false);

  await rc.evaluate(() => {
    window.__SAW = [];
    window._seedCallGemini = async (img) => {
      window.__SAW.push(String(img));
      return { seeds: Array.from({ length: 251 }, (_, i) => [i, i]), confidence: 'high' };
    };
  });
  await rc.evaluate(id => {
    window.onBagCountBtn(id);
    document.getElementById('recount-chooser').querySelector('#recount-same').click();
  }, rcRow);
  await rc.waitForFunction(() => window.__SAW.length > 0, { timeout: 10000 });
  await rc.waitForFunction(id => {
    const el = document.getElementById(id).querySelector('.t8-verify-result');
    return el && /251/.test(el.textContent);
  }, rcRow, { timeout: 10000 });

  const second = await rc.evaluate(id => ({
    asked: window.__SAW.length,
    dotted: /#DOTS$/.test(window.__SAW[0] || ''),
    said: (document.getElementById(id).querySelector('.t8-verify-result').textContent || '').trim(),
    thumb: (document.getElementById(id).querySelector('.t8-photo-thumb').getAttribute('src') || '')
  }), rcRow);
  check('Count this photo again asks the AI once more', second.asked, 1);
  /* The one that matters: a second pass over the dotted picture would be
     the AI counting red dots, and it would agree with itself for ever. */
  check('…AND IT IS GIVEN THE CLEAN FRAME, not the dotted one', second.dotted, false);
  checkTrue('the new figure replaces the old on the row', /251/.test(second.said));
  checkTrue('…and the old figure is gone from it', !/\b250\b/.test(second.said));

  await rc.evaluate(() => { window.__INSERTS = []; });
  await rc.evaluate(() => window.saveSeedAudit());
  await rc.waitForFunction(() => window.__INSERTS.length > 0, { timeout: 10000 });
  const rcWritten = await rc.evaluate(() => window.__INSERTS.filter(r => r.transaction_type === 'Seed_Audit'));
  checkTrue('the save carries the recounted figure', /AiCount:251/.test(rcWritten[0].remark));
  checkTrue('…the picture people look at', /PhotoUrl:https?:/.test(rcWritten[0].remark));
  /* Without this the choice only works until the page is reloaded. */
  checkTrue('…AND the clean frame, so Recount still works tomorrow',
            /SrcUrl:https?:/.test(rcWritten[0].remark));
  await rc.close();
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
