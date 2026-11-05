/* ONE PRESS OF SAVE IS ONE AUDIT.

   The office opened U03 on 04 Nov and found the same maintenance audit
   listed again and again: same plot, same day, same task, same result,
   the same remark -- and a DIFFERENT photo file behind each copy, about a
   minute apart.

       audit_maintenance_audits_photo_url_1793750892246_...jpeg
       audit_maintenance_audits_photo_url_1793750950196_...jpeg
       ... seven of them

   A DIFFERENT FILE EACH TIME IS THE WHOLE CLUE. A record the sync sweep
   sends again carries the link it uploaded the first time, because
   _rememberPhotoUrl writes it into the queue row before the photo leaves
   the phone -- so sweep retries share ONE file. Seven files means seven
   uploads, which means the picture was uploaded, and then uploaded again.

   It was. smartSave's online path copies the payload into `clean` and
   uploads each photo INTO THAT COPY. `clean` was declared inside the try,
   so when the insert failed the catch fell through to the queue carrying
   `payload` -- the original, still holding the photo as a data: URL. The
   queued copy therefore uploaded the same picture a second time under a
   new name.

   And the insert that "failed" had very often not failed at all: eight
   seconds is a TIMEOUT, not a refusal, and a nursery signal takes longer
   than that while the row still lands. So one press wrote two rows and
   two files, and nothing in the database could tell the second row from a
   new audit -- none of these tables has ever had a unique column.

   Two halves, and this file holds both:

     1. the queue carries what was already uploaded, so one press is one
        upload;
     2. every insert is stamped with one id per press (client_uid), so the
        same press arriving twice comes back 23505 -- which the sweep has
        retired quietly since the day it was written. That path had never
        had anything to fire on.

   shared/RUN_ME_one_audit_per_save.sql is the index that makes the stamp
   mean something, and takes the copies already written off the record.

   Run: node tests/one_press_of_save_is_one_audit.cjs
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const HARNESS = `<!doctype html><meta charset="utf-8"><title>save harness</title>
<body><div id="toast"></div>
<script src="/audit/audit_dexie.min.js"></script>
<script>
window.__calls = [];
window.__inserted = [];
window.sb = {
  lastPhotoError: null,
  behaviour: {},
  async canISave(){ return [{tbl:'audit_maintenance_audits', ok:true, why:''}]; },

  /* The column probe. 'missing' answers the way PostgREST does when the
     column is not there, 'offline' the way a phone with no line does --
     and those two must NOT be read the same way. */
  async select(table, query){
    window.__calls.push('select:' + table + '?' + query);
    const b = sb.behaviour.select || 'ok';
    if (b === 'missing') throw new Error('Supabase error 400: {"code":"42703","message":"column audit_maintenance_audits.client_uid does not exist"}');
    if (b === 'offline') throw new Error('Failed to fetch');
    return [];
  },

  async uploadPhoto(bucket, name, data){
    window.__calls.push('upload:' + name);
    return 'https://example.test/' + name + '.jpg';
  },

  async insert(table, row){
    window.__calls.push('insert:' + table);
    const b = sb.behaviour.insert || 'ok';
    /* THE ONE THE OFFICE MET: the row lands, and the answer is too slow.
       Recorded as inserted and then never resolved, so smartSave's own
       8s cap fires exactly as it does on a nursery signal. */
    if (b === 'lands-late'){
      window.__inserted.push({table, row});
      return await new Promise(()=>{});
    }
    /* A second arrival of a press already written. */
    if (b === 'unique'){
      const uid = row && row.client_uid;
      if (uid && window.__inserted.some(x => x.row && x.row.client_uid === uid)){
        throw new Error('Supabase error 409: {"code":"23505","message":"duplicate key value violates unique constraint"}');
      }
    }
    window.__inserted.push({table, row});
    return {ok:true};
  },
  async update(table, id, row){ return sb.insert(table, row); }
};
</script>
<script src="/audit/audit_dexie_offline.js"></script>
</body>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, {'Content-Type':'text/html'}); res.end(HARNESS); return; }
  const f = path.join(ROOT, url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

let failed = 0, passed = 0;
const fail = (m, got) => { console.log('  FAIL  ' + m + (got === undefined ? '' : '\n          got ' + JSON.stringify(got))); failed++; };
const pass = (m, got) => { console.log('  ok    ' + m + (got === undefined ? '' : '  → ' + JSON.stringify(got))); passed++; };
const is = (m, got, want) =>
  JSON.stringify(got) === JSON.stringify(want) ? pass(m, got) : fail(m + '\n          want ' + JSON.stringify(want), got);

const PHOTO = 'data:image/jpeg;base64,AAAA';

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  async function fresh(behaviour){
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    page.on('console', m => { if (process.env.V) console.log('   [page]', m.text()); });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => typeof smartSave === 'function' && window.Dexie);
    await page.evaluate(async (b) => {
      sb.behaviour = b;
      const db = await getDB();
      await db.queue.clear(); await db.photos.clear();
      window.__calls = []; window.__inserted = [];
    }, behaviour || {});
    return { ctx, page };
  }

  /* What is waiting in the outbox, and what is in it. */
  const queued = (page) => page.evaluate(async () => {
    const db = await getDB();
    const rows = await db.queue.where('synced').equals(0).toArray();
    const photos = await db.photos.count();
    return rows.map(r => ({ payload: JSON.parse(r.payload), photos }));
  });

  const save = (page) => page.evaluate(async (photo) => {
    return await smartSave('audit_maintenance_audits', 'insert', {
      task_id: 4471, nursery: 'UNN1', plot: 'U03', task_type: 'Interrow Spray',
      result: 'Unsatisfactory', remarks: 'Plot U3 Interrow spray belum siap',
      photo_url: photo, auditor_name: 'Main Nursery Auditor', date: '2026-11-04'
    }, null);
  }, PHOTO);

  /* ─────────────────────────────────────────────────────────────── */
  console.log('\n── 1. A slow answer costs ONE upload, not two ──');
  {
    const { ctx, page } = await fresh({ insert: 'lands-late' });
    const r = await save(page);                       // waits out the 8s cap
    const calls = await page.evaluate(() => window.__calls.filter(c => c.startsWith('upload:')));
    const q = await queued(page);

    is('the save was queued for another try', !!(r && r.offline), true);
    is('the save itself uploaded the picture once', calls.length, 1);
    is('and the queued copy carries the LINK, not the picture again',
       !!(q[0] && /^https:/.test(q[0].payload.photo_url)), true);
    is('so nothing was written into the phone photo store',
       q[0] ? q[0].photos : 'nothing queued', 0);

    /* THE PRESS FOLLOWED ALL THE WAY THROUGH, which is what the office
       actually counted. The second upload never happened inside the save
       -- it happened when the sweep sent the queued copy, and a check
       that stops at the save passes over the very thing being fixed. */
    await page.evaluate(async () => { sb.behaviour = { insert: 'ok' }; await syncNow(); });
    const all = await page.evaluate(() => window.__calls.filter(c => c.startsWith('upload:')));
    is('ONE press, ONE photo file on the server', all.length, 1);
    await ctx.close();
  }

  console.log('\n── 2. One press, one row, even when the first answer was lost ──');
  {
    const { ctx, page } = await fresh({ insert: 'lands-late' });
    await save(page);
    const first = await page.evaluate(() => window.__inserted.map(x => x.row.client_uid));
    const q = await queued(page);

    is('the insert that went out carried a stamp', typeof first[0], 'string');
    is('and the queued copy carries the SAME stamp — it is one press',
       q[0] ? q[0].payload.client_uid === first[0] : 'nothing queued', true);

    /* Now the sweep sends it, and the database refuses the repeat. */
    await page.evaluate(async () => { sb.behaviour = { insert: 'unique' }; await syncNow(); });
    const rows = await page.evaluate(() => window.__inserted.length);
    const left = await page.evaluate(async () => {
      const db = await getDB();
      return await db.queue.where('synced').equals(0).count();
    });
    is('the server kept ONE row for the one press', rows, 1);
    is('and the outbox let it go rather than trying for ever', left, 0);
    await ctx.close();
  }

  console.log('\n── 3. A table without the column is never sent one ──');
  {
    const { ctx, page } = await fresh({ select: 'missing' });
    await save(page);
    const row = await page.evaluate(() => window.__inserted[0] && window.__inserted[0].row);
    /* Naming a column the table has not got is not an empty cell in
       PostgREST, it is the whole insert refused — which on this screen is
       an auditor standing in a plot being told the save failed. */
    is('the insert went through', !!row, true);
    is('and carries no stamp at all', row ? ('client_uid' in row) : 'no insert', false);
    await ctx.close();
  }

  console.log('\n── 4. A probe that failed for ANOTHER reason is not an answer ──');
  {
    /* No signal, a policy, a dropped connection: none of those is the
       column being absent, and remembering one as the column being absent
       would switch the guard off for the rest of the session. */
    const { ctx, page } = await fresh({ select: 'offline' });
    await save(page);
    const asked1 = await page.evaluate(() => window.__calls.filter(c => c.startsWith('select:')).length);
    await page.evaluate(() => { sb.behaviour = {}; });
    await save(page);
    const asked2 = await page.evaluate(() => window.__calls.filter(c => c.startsWith('select:')).length);
    const stamped = await page.evaluate(() =>
      window.__inserted.map(x => typeof x.row.client_uid === 'string'));

    is('it asked again on the next save', asked2 > asked1, true);
    is('the first save went unstamped, the second stamped', stamped, [false, true]);
    await ctx.close();
  }

  console.log('\n── 5. A column that IS there is asked about once, not per save ──');
  {
    const { ctx, page } = await fresh({});
    await save(page); await save(page);
    const asked = await page.evaluate(() => window.__calls.filter(c => c.startsWith('select:')).length);
    const uids = await page.evaluate(() => window.__inserted.map(x => x.row.client_uid));
    is('one probe for the session', asked, 1);
    /* A genuine second save is a second press and must not be refused as
       a repeat of the first. */
    is('and two presses are two different stamps', uids[0] !== uids[1], true);
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log('\n' + (failed ? `FAILURES: ${failed} (passed ${passed})` : `all good — ${passed} checks`));
  process.exit(failed ? 1 : 0);
})();
