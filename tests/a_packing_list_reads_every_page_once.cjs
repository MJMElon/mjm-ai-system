/* EVERY PAGE OF A PACKING LIST IN ONE DROP, AND A PAGE READ TWICE ADDS NOTHING.

   A supplier list comes as Box 1/4 .. 4/4. The dropzone read only the first
   file of a drop, and a page dropped twice added its bags twice. Lifts the
   real scan out of the shipped page; only the AI call, the row builder and
   the toast are stubbed.
   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/a_packing_list_reads_every_page_once.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_batch_detail.html'), 'utf8');
let failed = 0;
const ok = (c, m) => { if (c) console.log('pass  ' + m); else { console.log('FAIL  ' + m); failed++; } };

ok(/id="t8-file-input"[^>]*\bmultiple\b/.test(SRC), 'the file picker takes more than one file');
const from = SRC.indexOf('function _seedBagKey(');
const to = SRC.indexOf('function _wireSeedAuditDropzone(');
if (from < 0 || to < 0 || to < from) {
  console.log('FAIL  the multi-file scan is not in the page');
  process.exit(1);
}
const code = SRC.slice(from, to);
ok(/scanPackingListFiles\(e\.dataTransfer\.files\)/.test(SRC), 'a drop hands over every file');
ok(/scanPackingListFiles\(input\.files\)/.test(SRC), 'the picker hands over every file');

/* Page 2/4 of the office list: 14525..14535, 250 each. */
const page = (a, b) => { const o = []; for (let n = a; n <= b; n++) o.push({ bag_no: String(n), supplier_qty: 250 }); return o; };
const PAGES = { 'p1.jpg': page(14514, 14524), 'p2.jpg': page(14525, 14535), 'p3.jpg': page(14536, 14546), 'p4.pdf': page(14547, 14556), 'p2-again.jpg': page(14525, 14535), 'mixed.jpg': page(14555, 14560) };

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage();
  await pg.setContent('<div id="rows"></div><input id="t8-file-input">');
  await pg.addScriptTag({ content: `
    const PAGES = ${JSON.stringify(PAGES)};
    window.toasts = []; window.calls = []; window.busy = [];
    function showToast(m, t) { toasts.push({ m, t }); }
    function readNumericInput(el) { return Number(String(el && el.value || '').split(',').join('')) || 0; }
    function _setSeedAuditDropzoneBusy(b, f) { busy.push(b ? f : null); }
    async function _fileToBase64(f) { return f.name; }
    const _supabase = { functions: { invoke: async (fn, { body }) => {
      calls.push(body.filename);
      if (body.filename === 'bad.jpg') return { data: null, error: { message: 'boom' } };
      return { data: { bags: PAGES[body.filename] || [] }, error: null };
    } } };
    function addSeedAuditRow(bagNo, sup) {
      const d = document.createElement('div'); d.className = 't8-bag-row';
      d.innerHTML = '<input class="t8-bag-no"><input class="t8-supplier-qty"><input class="t8-received-qty">';
      d.querySelector('.t8-bag-no').value = bagNo || ''; d.querySelector('.t8-supplier-qty').value = sup || '';
      document.getElementById('rows').appendChild(d);
    }
    ${code}
    window.scanPackingListFiles = scanPackingListFiles;
    window.f = (name, size = 1000) => new File(['x'.repeat(size)], name, { type: 'image/jpeg', lastModified: 1 });
    window.bags = () => Array.from(document.querySelectorAll('.t8-bag-no')).map(i => i.value);
    window.reset = () => { document.getElementById('rows').innerHTML = ''; toasts = []; calls = []; addSeedAuditRow('', ''); };
  ` });

  await pg.evaluate(async () => { reset(); await scanPackingListFiles([f('p1.jpg'), f('p2.jpg'), f('p3.jpg'), f('p4.pdf')]); });
  let r = await pg.evaluate(() => ({ bags: bags(), calls, toasts, busy }));
  ok(r.calls.length === 4, 'four pages dropped together are all read → ' + r.calls.join(','));
  ok(r.bags.length === 43, 'all 43 bags of the delivery are on the list → ' + r.bags.length);
  ok(!r.bags.includes(''), 'the empty starter row is gone');
  ok(r.busy.some(b => b && b.startsWith('2 of 4')), 'the dropzone says which page it is on');
  ok(r.toasts.length === 1 && r.toasts[0].t === 'success' && /43 bag/.test(r.toasts[0].m), 'one success toast with the total → ' + JSON.stringify(r.toasts));

  await pg.evaluate(async () => { await scanPackingListFiles([f('p2-again.jpg')]); });
  r = await pg.evaluate(() => ({ bags: bags(), toasts }));
  ok(r.bags.length === 43, 'a page dropped again adds nothing → ' + r.bags.length);
  ok(/Already scanned[^.]*p2-again\.jpg/.test(r.toasts[1].m) && r.toasts[1].t === 'warn', 'and it is named as already scanned → ' + r.toasts[1].m);

  await pg.evaluate(async () => { await scanPackingListFiles([f('mixed.jpg')]); });
  r = await pg.evaluate(() => ({ bags: bags(), toasts }));
  ok(r.bags.length === 47 && r.bags.filter(b => b === '14556').length === 1, 'a page half already on the list adds only the new bags → ' + r.bags.length);
  ok(/2 bag number\(s\) were already/.test(r.toasts[2].m), 'and says how many it skipped → ' + r.toasts[2].m);

  await pg.evaluate(async () => { reset(); await scanPackingListFiles([f('p2.jpg'), f('p2.jpg')]); });
  r = await pg.evaluate(() => ({ bags: bags(), calls, toasts }));
  ok(r.calls.length === 1 && r.bags.length === 11, 'the same file picked twice in one drop is read once');
  ok(/Same file picked twice/.test(r.toasts[0].m), 'and the toast says so');

  await pg.evaluate(async () => { reset(); addSeedAuditRow(' 14525 ', 250); await scanPackingListFiles([f('p2.jpg')]); });
  r = await pg.evaluate(() => bags());
  ok(r.length === 11, 'a bag keyed by hand (with stray spaces) is not added a second time → ' + r.length);

  await pg.evaluate(async () => { reset(); await scanPackingListFiles([f('bad.jpg'), f('p3.jpg')]); });
  r = await pg.evaluate(() => ({ bags: bags(), toasts }));
  ok(r.bags.length === 11, 'one page failing does not stop the next → ' + r.bags.length);
  ok(/Could not read: bad\.jpg/.test(r.toasts[0].m) && r.toasts[0].t === 'warn', 'and the failed page is named → ' + JSON.stringify(r.toasts[0]));

  await browser.close();
  console.log(failed ? `\n${failed} failure(s)` : '\nall good');
  process.exit(failed ? 1 : 0);
})();
