/* Review DO Details: the signature/photo wiring was broken three ways at
   once, all in the same corner of operation_delivery.html.

   1. The "View Attached Document" button's onclick called
      viewAttachedDocument() (no suffix), which reads a global
      (currentViewImage) that is declared once and NEVER assigned anywhere
      in the file -- the button has always done nothing. The function that
      WOULD work, viewAttachedDocumentDO(), was defined but never wired to
      anything.
   2. fetchData()'s own shared_do_records select never asked for image_url
      at all, so doRec.image_url was undefined for every DO this page ever
      opened -- the button above was invisible even before (1), and
      printCurrentDO()'s own photo was always blank.
   3. printCurrentDO() hardcoded the PDF's signature argument to `null` --
      even once a real signature_url exists on the row (via the FC
      Portal), nothing on this page ever read it.

   This drives the real page with a mocked Supabase client: a DO that
   carries a signature and a manually-uploaded signed copy, proving both
   show up and that the manual upload wins over the FC Portal's own
   capture for printing; and a DO with none of the three, proving nothing
   breaks and every box stays hidden.

   Run: node tests/do_signature_and_manual_upload.cjs
   with `python3 -m http.server 8783` serving the repository root.        */
const { chromium } = require('playwright');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function checkTrue(name, got) { check(name, !!got, true); }

const DO_ROW = {
  id: 'do-1', do_number: 'DO-53904601', al_number: '539046', delivery_date: '2026-10-20',
  total_qty: 5, remark: 'MEGA JUTAMAS (TESTING) SDN BHD', status: 'Delivered',
  plot_1: 'B1', breed_1: 'AA Hybrida 1S', batch_1: '252', qty_1: 5,
  ba_number: null, ba_raw_name: null, ba_raw_qty: null, created_at: '2026-10-20T00:00:00Z',
};
const EXTRAS_FULL = {
  image_url: 'https://cdn.example.com/do_photos/photo.jpg',
  signature_url: 'https://cdn.example.com/do_signatures/fc_signature.png',
  manual_signed_url: 'https://cdn.example.com/do_manual_signed/scan.jpg',
  manual_signed_uploaded_by: 'office@mjmnursery.com',
  manual_signed_uploaded_at: '2026-10-20T01:00:00Z',
};
const EXTRAS_NONE = { image_url: null, signature_url: null, manual_signed_url: null, manual_signed_uploaded_by: null, manual_signed_uploaded_at: null };

function mockPage(page, { extras }) {
  return page.addInitScript((vars) => {
    const { doRow, extras } = vars;
    function chain(result) {
      const self = {
        select(){return self;}, order(){return self;}, eq(){return self;}, ilike(){return self;},
        maybeSingle(){return Promise.resolve(result);}, single(){return Promise.resolve(result);},
        then(a,b){return Promise.resolve(result).then(a,b);},
      };
      return self;
    }
    window.supabase = {
      createClient: () => ({
        from: (table) => {
          if (table === 'shared_do_records') {
            // The main list query (no .eq) returns the DO row; the
            // per-id extras query (loadDOExtras: .eq('id',...).maybeSingle())
            // returns the extras fixture for THIS test.
            const q = {
              select(cols){
                q._cols = cols;
                return q;
              },
              order(){ return Promise.resolve({ data: [doRow], error: null }); },
              eq(col, val){
                if (col === 'id' && String(val) === doRow.id) {
                  return {
                    maybeSingle: () => Promise.resolve({ data: extras, error: null }),
                    // Thenable: uploadManualSignedDO's .update({...}).eq(...)
                    // is awaited directly, with no further call after it.
                    then: (a, b) => Promise.resolve({ data: null, error: null }).then(a, b),
                  };
                }
                return { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
              },
              update(){ return q; },
            };
            return q;
          }
          return chain({ data: [], error: null });
        },
        storage: {
          from: () => ({
            upload: async () => ({ error: null }),
            getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.example.com/do_manual_signed/uploaded.jpg' } }),
          }),
        },
        auth: {
          getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'office@mjmnursery.com' } } }, error: null }),
          getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
        },
        channel: () => ({ on(){return this;}, subscribe(){return this;} }),
        removeChannel: () => {},
        rpc: () => Promise.resolve({ data: null, error: null }),
      }),
    };
  }, { doRow: DO_ROW, extras });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  async function withPage(extras, fn) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    mockPage(page, { extras });
    await page.route('**/shared_access.js', r => r.fulfill({
      status: 200, contentType: 'application/javascript',
      body: `window.MJMAccess = new Proxy({}, { get(t, k) {
        if (k === 'user')   return () => ({ id: 'u1', email: 'office@mjmnursery.com' });
        if (k === 'load')   return async () => true;
        if (k === 'then')   return undefined;
        return () => true;
      } });`,
    }));
    await page.route('**/cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, body: '' }));
    await page.route('**://*.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('http://localhost:8783/operation/operation_delivery.html', { waitUntil: 'load' }).catch(() => {});
    // The real Tailwind CDN script is stubbed out above (no real network),
    // which means its .hidden{display:none} utility is never generated --
    // put it back by hand, or every visibility check below is meaningless.
    await page.addStyleTag({ content: '.hidden{display:none!important;}' });
    await page.waitForFunction(() => typeof window.openManageDOModal === 'function', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    await fn(page);
    for (const e of errors) console.log('  [page error] ' + e);
    await page.close();
  }

  console.log('\nA DO with an FC Portal signature, a photo, and a manually uploaded signed copy');
  await withPage(EXTRAS_FULL, async (page) => {
    await page.evaluate(() => window.openManageDOModal('do-1'));
    await page.waitForTimeout(500);

    checkTrue('the photo box is visible', await page.locator('#mng-do-image-container').isVisible());
    checkTrue('the "View Attached Document" button is wired to the function that actually reads the photo',
      (await page.locator('#mng-do-image-container button').getAttribute('onclick')) === 'viewAttachedDocumentDO()');
    checkTrue('the signature box is visible', await page.locator('#mng-do-signature-container').isVisible());
    checkTrue('the manual-upload status shows who uploaded it',
      (await page.locator('#mng-do-manual-status').innerText()).includes('office@mjmnursery.com'));
    checkTrue('the manual "View" button is visible once one exists', await page.locator('#mng-do-view-manual-btn').isVisible());

    const pdfArgs = await page.evaluate(async () => {
      // Stubbed rather than left to hit the network for real -- what is
      // under test here is printCurrentDO()'s SOURCE PRIORITY (manual >
      // FC Portal signature > none), not mjmImageAsDataUrl's own fetch,
      // which is unmodified pre-existing code.
      window.mjmImageAsDataUrl = async (src) => src ? ('data:image/png;base64,' + (
        src.includes('manual_signed') ? 'MANUAL' : src.includes('do_signatures') ? 'FCSIG' : 'PHOTO'
      )) : null;
      const calls = [];
      window.mjmBuildDOPdf = (doRec, al, staff, sig, photo) => { calls.push({ sig, photo }); return { save(){} }; };
      await window.printCurrentDO();
      return calls[0];
    });
    check('the printed PDF gets the PHOTO (resolved from image_url)', pdfArgs.photo, 'data:image/png;base64,PHOTO');
    check('the printed PDF prefers the MANUAL upload over the FC Portal signature', pdfArgs.sig, 'data:image/png;base64,MANUAL');
  });

  console.log('\nA DO with none of the three (brand new, straight off the FC Portal with no signature column yet synced)');
  await withPage(EXTRAS_NONE, async (page) => {
    await page.evaluate(() => window.openManageDOModal('do-1'));
    await page.waitForTimeout(500);
    checkTrue('the photo box stays hidden', !(await page.locator('#mng-do-image-container').isVisible()));
    checkTrue('the signature box stays hidden', !(await page.locator('#mng-do-signature-container').isVisible()));
    checkTrue('the manual-upload status reads "None uploaded"', (await page.locator('#mng-do-manual-status').innerText()).includes('None uploaded'));
    checkTrue('the manual "View" button stays hidden', !(await page.locator('#mng-do-view-manual-btn').isVisible()));

    const pdfArgs = await page.evaluate(async () => {
      const calls = [];
      window.mjmBuildDOPdf = (doRec, al, staff, sig, photo) => { calls.push({ sig, photo }); return { save(){} }; };
      await window.printCurrentDO();
      return calls[0];
    });
    check('no photo to print', pdfArgs.photo, null);
    check('no signature to print -- the PDF box reads blank, not broken', pdfArgs.sig, null);
  });

  console.log('\nUploading a manually signed copy');
  await withPage(EXTRAS_NONE, async (page) => {
    await page.evaluate(() => window.openManageDOModal('do-1'));
    await page.waitForTimeout(500);
    checkTrue('starts with nothing uploaded', (await page.locator('#mng-do-manual-status').innerText()).includes('None'));

    // Called directly with a constructed event rather than simulated
    // through a real <input type=file> + DataTransfer -- what is under
    // test is uploadManualSignedDO()'s own logic (storage upload, the DB
    // update, refreshing the UI), not whether Chromium's file-input
    // automation round-trips a synthetic File object.
    await page.evaluate(async () => {
      const file = new File(['fake-jpeg-bytes'], 'signed.jpg', { type: 'image/jpeg' });
      await window.uploadManualSignedDO({ target: { files: [file], value: '' } });
    });
    await page.waitForTimeout(300);
    checkTrue('the status now shows it was uploaded', (await page.locator('#mng-do-manual-status').innerText()).includes('Uploaded'));
    checkTrue('the View button appears', await page.locator('#mng-do-view-manual-btn').isVisible());
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
