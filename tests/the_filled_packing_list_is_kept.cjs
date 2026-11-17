/* THE FILLED PACKING LIST IS KEPT WITH THE SEED AUDIT, FROM BATCH 281 ON.

   A box under the AI scan takes the supplier sheet after the count (photos or
   PDFs, several at once), writes them onto one Seed_Audit_PackingList row the
   moment they are picked, and a cross takes one off the record. Lifts the
   real code out of the shipped page; only the database, storage and toasts
   are stubbed.
   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_filled_packing_list_is_kept.cjs */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_batch_detail.html'), 'utf8');
let failed = 0;
const ok = (c, m) => { if (c) console.log('pass  ' + m); else { console.log('FAIL  ' + m); failed++; } };

const slice = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i); return i < 0 || j < 0 ? null : SRC.slice(i, j); };
const code = slice('let t8FilledDocs = [];', 'function calcSeedAudit()');
const codec = slice('const T6_DOC_SEP', 'let t6_plotData');
ok(!!code, 'the filled packing list code is in the page');
ok(/id="t8-filled-input"[^>]*\bmultiple\b/.test(SRC), 'its picker takes several files');
ok(SRC.indexOf('id="t8-filled-zone"') > SRC.indexOf('id="t8-dropzone"'), 'it sits under the AI scan box');
ok(/'Seed_Audit_Action', 'Seed_Audit_PackingList'\]/.test(SRC), 'the row belongs to the Seed Audit tab');
ok(/loadFilledPackingList\(batchId\)/.test(SRC), 'opening the tab loads it');
const REP = fs.readFileSync(path.join(__dirname, '..', 'operation', 'operation_reports.html'), 'utf8');
ok(/'Seed_Audit_PackingList'/.test(REP.slice(REP.indexOf('SUMMARY_SKIP_TYPES'), REP.indexOf('SUMMARY_SKIP_TYPES') + 300)), 'the summary report skips the row');
if (!code || !codec) { console.log(`\n${failed} failure(s)`); process.exit(1); }

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage();
  await pg.setContent(`<div id="tab-8"><input id="f-batchno"><input id="f-brand" value="AA"><input id="f-datereceived" value="2026-11-10">
    <div id="t8-filled-wrap" class="hidden"><div id="t8-filled-zone"><input type="file" id="t8-filled-input" multiple><p id="t8-filled-hint"></p></div>
    <div id="t8-filled-list"></div></div></div>`);
  await pg.addScriptTag({ content: `
    window.rows = []; window.toasts = []; window.uploads = 0; window.viewed = null; window.ops = [];
    function showToast(m, t) { toasts.push({ m, t }); }
    function _escAttr(v) { return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
    function withEditMeta(p) { return p; }
    async function safeInsertLogs(list) { ops.push('insert'); list.forEach(r => rows.push(Object.assign({ created_at: new Date().toISOString() }, r))); return { error: null }; }
    async function _t3ReadFile(f) { return 'data:' + (f.type || 'image/jpeg') + ';base64,AAAA'; }
    async function _uploadBatchDoc(folder, b, label, d) { uploads++; if (label.endsWith('-1') && window.failSecond) return null; return 'https://x/' + folder + '/' + label + (d.startsWith('data:application/pdf') ? '.pdf' : '.jpg'); }
    function _openDocViewer(u, n) { viewed = { u, n }; }
    window.confirm = () => true;
    function q(type, batch) { return rows.filter(r => r.transaction_type === type && r.batch_name === batch); }
    const _supabase = { from() { const f = {}; let t, b, del = false;
      const b2 = { select() { return b2; }, delete() { del = true; return b2; },
        eq(c, v) { if (c === 'batch_name') b = v; if (c === 'transaction_type') t = v; if (del && b && t) { ops.push('delete'); window.rows = rows.filter(r => !(r.transaction_type === t && r.batch_name === b)); return Promise.resolve({ error: null }); } return b2; },
        order() { return b2; }, limit() { return Promise.resolve({ data: q(t, b).slice(-1), error: null }); } };
      return b2; } };
    ${codec}
    ${code}
    window.api = { load: loadFilledPackingList, up: uploadFilledPackingList, rm: removeFilledPackingList, open: openFilledPackingList, docs: () => t8FilledDocs };
    window.f = (n, t) => new File(['x'], n, { type: t || 'image/jpeg' });
    window.setBatch = v => { document.getElementById('f-batchno').value = v; };
    window.shown = id => !document.getElementById(id).classList.contains('hidden');
  ` });

  await pg.evaluate(async () => { setBatch('280'); await api.load('280'); });
  ok(!(await pg.evaluate(() => shown('t8-filled-wrap'))), 'batch 280: no box');
  await pg.evaluate(async () => { await api.up([f('a.jpg')]); });
  let r = await pg.evaluate(() => ({ rows: rows.length, t: toasts.pop() }));
  ok(r.rows === 0 && /281/.test(r.t.m), 'batch 280: an upload is refused and nothing written');

  await pg.evaluate(async () => { setBatch('281'); await api.load('281'); });
  ok(await pg.evaluate(() => shown('t8-filled-wrap') && shown('t8-filled-zone')), 'batch 281: the box is there');
  await pg.evaluate(async () => { await api.up([f('page 1.jpg'), f('page 2.pdf', 'application/pdf')]); });
  r = await pg.evaluate(() => ({ rows: rows.slice(), docs: api.docs(), t: toasts.pop(), chips: document.querySelectorAll('.t8-filled-open').length }));
  ok(r.rows.length === 1 && r.rows[0].transaction_type === 'Seed_Audit_PackingList' && r.rows[0].quantity_change === 0, 'two files, ONE row, quantity nought');
  ok(r.docs.length === 2 && r.docs[0].name === 'page 1.jpg', 'both files are on the record, names kept (a space included)');
  ok(r.t.t === 'success' && r.chips === 2, 'it says so and draws both');

  await pg.evaluate(async () => { api.docs().length = 0; await api.load('281'); });
  ok(await pg.evaluate(() => api.docs().length === 2), 'reopening the batch reads both back');

  await pg.evaluate(async () => { await api.up([f('page 3.jpg')]); });
  ok(await pg.evaluate(() => api.docs().length === 3 && rows.length === 1), 'a later upload ADDS to the list, still one row');

  await pg.evaluate(() => api.open(1));
  ok(await pg.evaluate(() => viewed && /\.pdf$/.test(viewed.u) && viewed.n === 'page 2.pdf'), 'pressing a file opens it');

  await pg.evaluate(async () => { await api.rm(0); });
  r = await pg.evaluate(() => ({ docs: api.docs().map(d => d.name), rows: rows.length }));
  ok(r.docs.join() === 'page 2.pdf,page 3.jpg' && r.rows === 1, 'the cross takes ONE file off and leaves the rest');

  await pg.evaluate(async () => { window.failSecond = true; await api.up([f('p4.jpg'), f('p5.jpg')]); window.failSecond = false; });
  r = await pg.evaluate(() => ({ n: api.docs().length, t: toasts.pop() }));
  ok(r.n === 3 && r.t.t === 'warn', 'one file failing keeps the other and warns');

  await pg.evaluate(async () => { document.getElementById('tab-8').classList.add('mjm-locked'); api.rm(0); await api.up([f('p6.jpg')]); });
  r = await pg.evaluate(() => ({ n: api.docs().length, x: document.querySelectorAll('.t8-filled-x').length }));
  ok(r.n === 3, 'a signed-off report refuses adding and removing');
  await pg.evaluate(() => { api.load('281'); });
  await pg.waitForTimeout(50);
  ok(await pg.evaluate(() => document.querySelectorAll('.t8-filled-x').length === 0 && document.querySelectorAll('.t8-filled-open').length === 3), 'and draws no cross, while the files still open');

  await browser.close();
  console.log(failed ? `\n${failed} failure(s)` : '\nall good');
  process.exit(failed ? 1 : 0);
})();
