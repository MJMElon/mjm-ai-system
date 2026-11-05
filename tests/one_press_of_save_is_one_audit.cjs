/* ONE PRESS OF SAVE IS ONE AUDIT, AND ONE PHOTO.

   The office opened U03 on 04 Nov and found the same maintenance audit
   listed again and again: same plot, same day, same task, same result,
   the same remark -- and a DIFFERENT photo file behind each copy, about a
   minute apart.

       audit_maintenance_audits_photo_url_1793750892246_...jpeg
       audit_maintenance_audits_photo_url_1793750950196_...jpeg
       ... seven of them

   THE NAME IS THE WHOLE FAULT, read the right way round. Those two
   numbers are Date.now() called twice -- once in uploadPhoto, once again
   inside sb.uploadPhoto -- so the path of a photo could not help being
   different on every attempt. Nothing about sending the same picture
   twice could ever be recognised as sending the same picture twice.

   And the insert that "failed" had very often not failed at all: eight
   seconds is a TIMEOUT, not a refusal, and a nursery signal takes longer
   than that while the row still lands. So one press wrote two rows and
   two files, and nothing in the database could tell the second row from a
   new audit -- none of these tables has ever had a unique column.

   The answer is one id per press of Save, made ON THE PHONE so a save
   with no signal has one too, and used for BOTH halves:

     1. `client_uid` on the row, with a unique index behind it, so the
        same press arriving twice comes back 23505 -- which the sweep has
        retired quietly since the day it was written;
     2. THE PHOTO FILENAME, uploaded with upsert, so a second upload of
        that press writes the SAME object rather than a new file beside
        it. That closes every re-upload path at once, including the ones
        nobody has enumerated.

   shared/RUN_ME_one_audit_per_save.sql is the index that makes the stamp
   mean something, and took the copies already written off the record.

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
window.__uploads = [];
window.__refusedForColumn = 0;
window.sb = {
  lastPhotoError: null,
  behaviour: {},
  async canISave(){ return [{tbl:'audit_maintenance_audits', ok:true, why:''}]; },

  async select(table, query){
    window.__calls.push('select:' + table + '?' + query);
    return [];
  },

  /* The fourth argument is the one that matters: 'exact' means the
     caller owns the path and the real sb.uploadPhoto adds no clock to
     it. Recorded rather than resolved, so the check can ask whether one
     press asked for one path. */
  async uploadPhoto(bucket, name, data, exact){
    window.__calls.push('upload:' + name);
    window.__uploads.push({name: name, exact: !!exact});
    return 'https://example.test/' + name + '.jpg';
  },

  async insert(table, row){
    window.__calls.push('insert:' + table);
    const b = sb.behaviour.insert || 'ok';

    /* THE ONE THE OFFICE MET: the row lands, and the answer is too slow.
       Recorded as inserted and then never resolved, so smartSave's own
       8s cap fires exactly as it does on a nursery signal. */
    if(b === 'lands-late'){
      window.__inserted.push({table, row});
      return await new Promise(()=>{});
    }

    /* A table that has not had the SQL run. PostgREST refuses the WHOLE
       insert over a column it has not got -- it is not an empty cell. */
    if(b === 'no-column' && row && row.client_uid !== undefined){
      window.__refusedForColumn++;
      throw new Error('Supabase error 400: {"code":"42703","message":"column ' + table + '.client_uid does not exist"}');
    }

    /* A refusal that is nothing to do with the column. */
    if(b === 'refused'){
      throw new Error('Supabase error 403: {"code":"42501","message":"new row violates row-level security policy"}');
    }

    /* A second arrival of a press already written. */
    if(b === 'unique'){
      const uid = row && row.client_uid;
      if(uid && window.__inserted.some(x => x.row && x.row.client_uid === uid)){
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
      window.__calls = []; window.__inserted = []; window.__uploads = [];
      window.__refusedForColumn = 0;
    }, behaviour || {});
    return { ctx, page };
  }

  /* No signal, the way a phone in a nursery has no signal. Redefined
     rather than switched at the network, because what smartSave reads is
     navigator.onLine and nothing else. */
  const setOnline = (page, on) => page.evaluate((v) => {
    Object.defineProperty(navigator, 'onLine', { get: () => v, configurable: true });
  }, on);

  /* What is waiting in the outbox, and what is in it. */
  const queued = (page) => page.evaluate(async () => {
    const db = await getDB();
    const rows = await db.queue.where('synced').equals(0).toArray();
    const photos = await db.photos.count();
    return rows.map(r => ({ payload: JSON.parse(r.payload), photos }));
  });

  const uploadNames = (page) => page.evaluate(() => window.__uploads.map(u => u.name));

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
    const names = await uploadNames(page);
    const q = await queued(page);

    is('the save was queued for another try', !!(r && r.offline), true);
    is('the save itself uploaded the picture once', names.length, 1);
    is('and the queued copy carries the LINK, not the picture again',
       !!(q[0] && /^https:/.test(q[0].payload.photo_url)), true);
    is('so nothing was written into the phone photo store',
       q[0] ? q[0].photos : 'nothing queued', 0);

    /* THE PRESS FOLLOWED ALL THE WAY THROUGH, which is what the office
       actually counted. The second upload never happened inside the save
       -- it happened when the sweep sent the queued copy, and a check
       that stops at the save passes over the very thing being fixed. */
    await setOnline(page, true);
    await page.evaluate(async () => { sb.behaviour = { insert: 'ok' }; await syncNow(); });
    const all = await uploadNames(page);
    is('ONE press, ONE photo file on the server', all.length, 1);
    is('and every upload of it asked for the SAME path',
       new Set(all).size, 1);
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

  console.log('\n── 3. A save with NO SIGNAL is stamped too ──');
  {
    /* The fault the office met takes this path, not the online one: an
       auditor saves in a plot with no bars, the record waits in the
       outbox, and the sweep sends it hours later. The first version
       asked the database whether the column existed before it would
       stamp anything, so exactly these records went up unprotected. */
    const { ctx, page } = await fresh({});
    await setOnline(page, false);
    const r = await save(page);
    const q = await queued(page);
    const tried = await page.evaluate(() => window.__inserted.length);
    const uid = q[0] && q[0].payload.client_uid;

    is('it was queued and nothing was sent', [!!(r && r.offline), tried], [true, 0]);
    is('the queued record carries a stamp all the same', typeof uid, 'string');
    is('and the press that made it, for the photo', typeof (q[0] && q[0].payload.__press), 'string');
    is('the photo is on the phone, not uploaded yet',
       [q[0] ? q[0].photos : 'nothing queued', (await uploadNames(page)).length], [1, 0]);

    /* The line comes back, the sweep sends it -- and the row had already
       landed on an earlier try. With no stamp this is a second audit of
       U03 that nothing can ever tell apart. */
    await setOnline(page, true);
    await page.evaluate(async (u) => {
      window.__inserted.push({ table: 'audit_maintenance_audits', row: { client_uid: u } });
      sb.behaviour = { insert: 'unique' };
      await syncNow();
    }, uid);
    const rows = await page.evaluate(() => window.__inserted.length);
    const left = await page.evaluate(async () => {
      const db = await getDB();
      return await db.queue.where('synced').equals(0).count();
    });
    const names = await uploadNames(page);
    is('the repeat is refused, so the plot keeps ONE row', rows, 1);
    is('the outbox retires it quietly', left, 0);
    is('and the photo it uploaded is named after that press',
       names.length === 1 && names[0].indexOf(String(uid)) >= 0, true);
    await ctx.close();
  }

  console.log('\n── 4. The WRITE is what says whether the column is there ──');
  {
    /* Naming a column the table has not got is not an empty cell in
       PostgREST, it is the whole insert refused -- which on this screen
       is an auditor standing in a plot being told the save failed. */
    const { ctx, page } = await fresh({ insert: 'no-column' });
    await save(page);
    const row = await page.evaluate(() => window.__inserted[0] && window.__inserted[0].row);
    const refused1 = await page.evaluate(() => window.__refusedForColumn);

    is('the record was SAVED, not lost over it', !!row, true);
    is('and the row that landed carries no stamp', row ? ('client_uid' in row) : 'no insert', false);
    is('it took exactly one refusal to find that out', refused1, 1);

    /* REMEMBERED FOR THE SESSION. A refused round trip per save, all day,
       on a database nobody has run the file on, is the cost of asking
       again rather than remembering. */
    await save(page);
    const refused2 = await page.evaluate(() => window.__refusedForColumn);
    const rows = await page.evaluate(() => window.__inserted.length);
    is('the second save is not refused again', refused2, 1);
    is('and both saves are in the table', rows, 2);

    /* The photo does not depend on the column at all. */
    const names = await uploadNames(page);
    is('two presses, two files, even with no stamp anywhere',
       new Set(names).size, 2);
    await ctx.close();
  }

  console.log('\n── 5. A refusal for ANOTHER reason does not switch the stamp off ──');
  {
    /* A policy, a dropped connection, no signal: none of those is the
       column being absent, and reading one as the column being absent
       would leave every record for the rest of the day unprotected. */
    const { ctx, page } = await fresh({ insert: 'refused' });
    await save(page);
    await page.evaluate(() => { sb.behaviour = { insert: 'ok' }; });
    await save(page);
    const stamped = await page.evaluate(() =>
      window.__inserted.map(x => typeof x.row.client_uid === 'string'));
    is('the save after it still carries a stamp', stamped, [true]);
    await ctx.close();
  }

  console.log('\n── 6. Two presses are two audits, and must not refuse each other ──');
  {
    const { ctx, page } = await fresh({ insert: 'unique' });
    await save(page); await save(page);
    const uids  = await page.evaluate(() => window.__inserted.map(x => x.row.client_uid));
    const names = await uploadNames(page);
    is('both went in', uids.length, 2);
    is('two presses are two different stamps', uids[0] !== uids[1], true);
    is('and two different files', new Set(names).size, 2);
    await ctx.close();
  }

  await browser.close();
  server.close();

  console.log('\n── 7. The path is the press\'s, and the clock is only the fallback ──');
  {
    /* Driven out of the SHIPPED sb.uploadPhoto rather than restated, so
       a clock put back into the exact branch fails here. */
    const src  = fs.readFileSync(path.join(ROOT, 'audit/audit_supabase.js'), 'utf8');
    const m    = src.match(/const path = ([^;]+);/);
    if(!m){
      fail('audit_supabase.js still builds a path for an uploaded photo');
    } else {
      let pathOf;
      try { pathOf = new Function('filename', 'ext', 'exact', 'return ' + m[1]); }
      catch(e){ pathOf = null; fail('the path expression evaluates', e.message); }
      if(pathOf){
        const a = pathOf('audit_maintenance_audits_photo_url_abc123', 'jpeg', true);
        let b;
        const until = Date.now() + 3;
        while(Date.now() < until){ /* make sure the clock has moved */ }
        b = pathOf('audit_maintenance_audits_photo_url_abc123', 'jpeg', true);
        is('the same press asks for the same object, twice running', a === b, true);
        is('and the path is the name it was given', a,
           'audit_maintenance_audits_photo_url_abc123.jpeg');

        const c = pathOf('audit_maintenance_audits_photo_url', 'jpeg', false);
        is('a caller with no press still gets a name of its own',
           c !== 'audit_maintenance_audits_photo_url.jpeg', true);
      }
    }

    /* And the upsert header is what makes writing the same path a
       replacement rather than a refusal. */
    is('the upload is an upsert', /x-upsert[^\n]*true/i.test(src), true);
  }

  console.log('\n' + (failed ? `FAILURES: ${failed} (passed ${passed})` : `all good — ${passed} checks`));
  process.exit(failed ? 1 : 0);
})();
