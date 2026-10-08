/* A SYNC THAT STOPS ANSWERING MUST NOT STOP THE QUEUE.

   Seventy finished maintenance audits sat on an auditor phone because the
   database refused every row. That was repaired and proved -- 46 of 46
   auditors could save. The phone still would not empty: the banner read
   "69 pending (1 stuck)" and did not move while it was watched, and the
   Sync pill said the last clean sweep was a minute earlier.

   Those two facts together say the sweep is not failing. It is not
   finishing. Every network call in syncNow went out with NO TIMEOUT --
   neither the photo upload nor the insert -- while smartSave, the other
   door, wrapped both. One stalled upload on a nursery mobile signal and
   the for-loop never reached item two; _syncing stayed true, so the 30s
   timer and every tap after it returned "already syncing" and did
   nothing. A reload started the same stall again. Sixty-nine records,
   none of them retried even once: that is why none of them had reached
   the five-try park.

   Four things are held here, each the shape of a way a queue wedges:

     1. a call that never answers is a FAILED item, not a stopped sweep
     2. _syncing is released however the sweep ends
     3. a sweep already wedged by older code recovers by itself
     4. a photo that HAS uploaded is not lost when the insert after it
        fails -- the url goes into the queue row at once, so the retry
        does not go looking for a photo that was deleted

   And the last one holds the instrument rather than the fault. The only
   thing on screen about those seventy audits was a count in a green bar,
   so the question "refused, or waiting, or going up right now and
   slow?" could only be answered by sending a video of a number not
   moving. Diagnostics now reads the outbox out of IndexedDB and says
   which it is -- and says it WITHOUT loading the file it is reporting
   on, so it still answers when that file is the broken one.

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/sync_cannot_wedge.cjs
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.NODE_PATH + '/playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const HARNESS = `<!doctype html><meta charset="utf-8"><title>sync harness</title>
<body><div id="toast"></div>
<script src="/audit/audit_dexie.min.js"></script>
<script>
/* A stand-in Supabase. Each table name and photo field can be told to
   answer, to refuse, or to never answer at all -- the last being the one
   the phone actually met. */
window.__calls = [];
window.__inserted = [];
window.sb = {
  lastPhotoError: null,
  behaviour: {},            /* set per test */
  async canISave(){
    const b = sb.behaviour.canISave;
    if (b === 'unreachable') return null;
    if (b === 'hang') return await new Promise(()=>{});
    if (b === 'refused') return [
      {tbl:'audit_maintenance_audits', ok:false, why:'your login does not satisfy the insert policy on this table'},
      {tbl:'audit_plot_audits', ok:true, why:''}
    ];
    return [{tbl:'audit_maintenance_audits', ok:true, why:''}];
  },
  async uploadPhoto(bucket, name, data){
    window.__calls.push('upload:' + name);
    const b = sb.behaviour.upload || 'ok';
    if (b === 'hang') return await new Promise(()=>{});
    if (b === 'null') { sb.lastPhotoError = 'Photo upload failed 404: bucket missing'; return null; }
    return 'https://example.test/' + name + '.jpg';
  },
  async insert(table, row){
    window.__calls.push('insert:' + table);
    const b = sb.behaviour.insert || 'ok';
    if (b === 'hang') return await new Promise(()=>{});
    if (b === 'refuse') throw new Error('Supabase error 400: {"code":"XX000","message":"nope"}');
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
  if (url === '/' ) { res.writeHead(200, {'Content-Type':'text/html'}); res.end(HARNESS); return; }
  const f = path.join(ROOT, url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});

let failed = 0;
const fail = (m) => { console.log('FAIL  ' + m); failed++; };
const pass = (m) => console.log('pass  ' + m);

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  async function fresh(){
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();
    page.on('console', m => { if (process.env.V) console.log('   [page]', m.text()); });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => typeof syncNow === 'function' && window.Dexie);
    return { ctx, page };
  }

  /* n queued maintenance audits, each with its photo in IndexedDB, the
     shape smartSave leaves behind when it queues offline. */
  async function seed(page, n){
    await page.evaluate(async (n) => {
      const db = await getDB();
      await db.queue.clear(); await db.photos.clear();
      for (let i = 0; i < n; i++){
        const qkey = 'q' + i;
        await db.photos.add({qkey, field:'photo_url', data:'data:image/jpeg;base64,AAAA', created_at: Date.now()});
        await db.queue.add({
          table:'audit_maintenance_audits', method:'insert',
          payload: JSON.stringify({plot:'U0'+i, result:'Satisfied', photo_url:'__IMG__:'+qkey+':photo_url', __qkey:qkey}),
          edit_id:null, synced:0, retries:0, created_at: Date.now() + i
        });
      }
    }, n);
  }

  const left = (page) => page.evaluate(async () => {
    const db = await getDB();
    const rows = await db.queue.where({synced:0}).toArray();
    return { pending: rows.filter(r=>!r.blocked).length, blocked: rows.filter(r=>r.blocked).length };
  });

  /* ── 1. ONE CALL THAT NEVER ANSWERS ──────────────────────────────── */
  {
    const { ctx, page } = await fresh();
    await seed(page, 4);
    /* The first upload hangs; everything after it would be fine. */
    await page.evaluate(() => {
      let first = true;
      const real = sb.uploadPhoto;
      sb.uploadPhoto = async (b,n,d) => {
        if (first) { first = false; return await new Promise(()=>{}); }
        return real(b,n,d);
      };
      window.__sweep = syncNow(true);
    });

    const done = await page.evaluate(() =>
      Promise.race([window.__sweep.then(()=> 'finished'),
                    new Promise(r => setTimeout(()=>r('still running'), 60000))]));
    if (done !== 'finished') {
      fail('a single upload that never answers stops the whole sweep for ever\n' +
           '      Every call in syncNow needs a timeout, the way smartSave already wraps both of its.');
    } else {
      pass('a call that never answers ends that item, not the sweep');
      const l = await left(page);
      if (l.pending + l.blocked !== 1) {
        fail(`the three healthy records behind the stalled one did not go up (${l.pending} pending, ${l.blocked} stuck left)`);
      } else {
        pass('the records queued behind it went up anyway');
      }
    }
    await ctx.close();
  }

  /* ── 2. _syncing IS RELEASED HOWEVER THE SWEEP ENDS ───────────────── */
  {
    const { ctx, page } = await fresh();
    await seed(page, 2);
    await page.evaluate(async () => {
      /* clearDone runs after the loop and outside every try. If it
         throws, the flag used to be left set and the phone was done
         syncing for good. */
      const db = await getDB();
      const realDelete = db.queue.where;
      window.__boom = true;
      await syncNow(true).catch(()=>{});
    });
    const stuckFlag = await page.evaluate(async () => {
      /* Make the tail of the sweep throw, then look at the flag. */
      const db = await getDB();
      await db.queue.clear();
      await db.queue.add({table:'audit_maintenance_audits', method:'insert',
        payload: JSON.stringify({plot:'X'}), synced:0, retries:0, created_at: Date.now()});
      const realClear = window.clearDone;
      window.clearDone = async () => { throw new Error('disk full'); };
      try { await syncNow(true); } catch(e){}
      window.clearDone = realClear;
      return _syncing;
    });
    if (stuckFlag) fail('_syncing was left set when the sweep threw - the phone can never sync again');
    else pass('_syncing is released however the sweep ends');
    await ctx.close();
  }

  /* ── 3. A FLAG ALREADY WEDGED RECOVERS BY ITSELF ──────────────────── */
  {
    const { ctx, page } = await fresh();
    await seed(page, 2);
    const drained = await page.evaluate(async () => {
      /* The state the auditor phone is in right now: an older sweep set
         the flag and never came back. Nothing on the phone can clear it. */
      _syncing = true;
      if (typeof _syncStartedAt !== 'undefined') _syncStartedAt = Date.now() - 20 * 60 * 1000;
      await syncNow(true);
      const db = await getDB();
      return (await db.queue.where({synced:0}).toArray()).length;
    });
    if (drained !== 0) {
      fail('a sweep wedged by the old code can never be taken over - the queue is frozen for good\n' +
           '      A sweep that has been running far longer than any sweep can needs to be abandoned.');
    } else {
      pass('a long-wedged sweep is taken over and the queue drains');
    }
    await ctx.close();
  }

  /* ── 4. AN UPLOADED PHOTO SURVIVES A FAILED INSERT ────────────────── */
  {
    const { ctx, page } = await fresh();
    await seed(page, 1);
    await page.evaluate(async () => {
      sb.behaviour.insert = 'refuse';      // upload works, the row does not
      await syncNow(true);
    });
    const after = await page.evaluate(async () => {
      const db = await getDB();
      const row = (await db.queue.where({synced:0}).toArray())[0];
      const photosLeft = await db.photos.count();
      return { payload: row && row.payload, photosLeft };
    });
    const hasUrl = after.payload && after.payload.includes('https://example.test/');
    const hasLostPointer = after.payload && after.payload.includes('__IMG__') && after.photosLeft === 0;
    if (hasLostPointer) {
      fail('the photo was uploaded, deleted from the phone, and the queue row still points at it\n' +
           '      The next try finds no photo and saves the audit photo-less, silently.');
    } else if (!hasUrl && after.photosLeft === 0) {
      fail('the photo is gone from the phone and its url is not in the queue row');
    } else {
      pass('an uploaded photo is written into the queue row before the insert is attempted');
    }

    /* And the retry must actually send it. */
    const sent = await page.evaluate(async () => {
      sb.behaviour.insert = 'ok';
      window.__inserted = [];
      await syncNow(true);
      return window.__inserted.map(i => i.row.photo_url);
    });
    if (sent.length !== 1 || !sent[0] || !String(sent[0]).startsWith('https://')) {
      fail('the retry sent the audit without its photo: ' + JSON.stringify(sent));
    } else {
      pass('the retry sends the audit with the photo it had already uploaded');
    }
    await ctx.close();
  }

  /* ── 5. THE BANNER MOVES WHILE THE SWEEP RUNS ─────────────────────── */
  {
    const { ctx, page } = await fresh();
    await seed(page, 6);
    const sawProgress = await page.evaluate(async () => {
      const seen = new Set();
      const b = document.createElement('div'); b.id = '_offl_badge';
      /* Watch what the badge is told while the sweep is in flight. */
      const obs = setInterval(() => {
        const el = document.getElementById('_offl_badge');
        if (el) seen.add(el.textContent);
      }, 15);
      await syncNow(true);
      clearInterval(obs);
      return [...seen];
    });
    const counted = sawProgress.filter(t => /Sending \d+ of 6/.test(t));
    if (!counted.length) {
      fail('the banner never said which record was going up: ' + JSON.stringify(sawProgress) +
           '\n      A number that does not move is the same thing on screen as a sync that is stuck.');
    } else {
      pass('the banner counts the records up while the sweep runs: ' + counted[0]);
    }
    await ctx.close();
  }

  /* ── 6. DIAGNOSTICS CAN SAY WHAT IS IN THE OUTBOX ─────────────────── */
  {
    const { ctx, page } = await fresh();
    await seed(page, 5);
    /* One of them parked by the server, the way the phone was. */
    await page.evaluate(async () => {
      const db = await getDB();
      const first = (await db.queue.where({synced:0}).toArray())[0];
      await db.queue.update(first.id, {blocked:1, retries:3,
        last_error:'Not allowed to save to audit_maintenance_audits.'});
    });
    /* Diagnostics is a signed-in auditor looking at a phone that will
       not empty, so give it a session - otherwise "you are not signed
       in" answers first, which it should, and the outbox never gets to
       speak. Supabase itself is cut off: this test is about what the
       page can say with no help from the server. */
    await page.route('**://*.supabase.co/**', r => r.abort());
    await page.evaluate(() => {
      const b = o => btoa(JSON.stringify(o)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const claims = { role:'authenticated', sub:'00000000-0000-0000-0000-000000000001',
                       email:'joyce@mjm.test' };
      localStorage.setItem('mjm_user', JSON.stringify({email:'joyce@mjm.test'}));
      localStorage.setItem('sb-kibqjztozokohqmhqqqf-auth-token', JSON.stringify({
        access_token: b({alg:'HS256'}) + '.' + b(claims) + '.x',
        refresh_token: 'r', expires_at: Math.floor(Date.now()/1000) + 3600
      }));
    });
    await page.goto(`http://127.0.0.1:${port}/audit/audit_diagnostics.html`);
    /* Wait for the verdict, not for section 6: the verdict is written
       last, and reading it while the page is still working gives
       "Checking..." rather than an answer. */
    await page.waitForFunction(
      () => { const v = document.getElementById('verdict');
              return v && !/Checking/.test(v.textContent); },
      null, { timeout: 40000 }).catch(()=>{});
    const txt = await page.evaluate(() => ({
      queue:   (document.getElementById('g-queue')||{}).innerText || '',
      verdict: (document.getElementById('verdict')||{}).innerText || ''
    }));

    const says = (re, what) => {
      if (re.test(txt.queue)) pass('diagnostics says ' + what);
      else fail('diagnostics never says ' + what + '\n      section 6 read:\n' +
                txt.queue.split('\n').map(l=>'        '+l).join('\n'));
    };
    says(/waiting to go up\s*4/, 'how many are waiting');
    says(/stuck \(server refused\)\s*1/, 'how many the server refused');
    says(/Not allowed to save to audit_maintenance_audits/, 'WHY the stuck one is stuck');
    says(/audit_maintenance_audits\s*5/, 'which table they belong to');
    says(/none of them has been tried even once/, 'that no sweep has reached them');

    if (/not being refused - the sync is not finishing/.test(txt.verdict)) {
      pass('the verdict tells the two apart: a sweep not finishing, not a server refusing');
    } else {
      fail('the verdict did not name the fault. It read: ' + JSON.stringify(txt.verdict.slice(0,200)));
    }
    await ctx.close();
  }

  /* ── 7. THE PHONE ASKS BEFORE THE WORK, AND FAILS OPEN ────────────── */
  {
    const { ctx, page } = await fresh();
    await page.evaluate(() => localStorage.setItem('mjm_user', JSON.stringify({email:'joyce@mjm.test'})));

    const barText = async () => page.evaluate(() => {
      const el = document.getElementById('_save_check_bar');
      return el ? el.textContent : null;
    });

    /* A database that says no, before a single form has been opened. */
    await page.evaluate(async () => { sb.behaviour.canISave = 'refused'; await checkCanSave(); });
    const warned = await barText();
    if (warned && /cannot save/i.test(warned) && /maintenance audits/i.test(warned)) {
      pass('a login that cannot save is told so, and told which audits');
    } else {
      fail('nothing warned the auditor before the work: ' + JSON.stringify(warned));
    }
    if (warned && !/plot condition/i.test(warned)) {
      pass('it names only what is refused, not the audits that are fine');
    } else {
      fail('the warning named an audit the database said yes to');
    }

    /* The queue badge must not be drawn on top of it. */
    await page.evaluate(async () => { const db = await getDB();
      await db.queue.add({table:'audit_maintenance_audits', method:'insert',
        payload: JSON.stringify({plot:'U1'}), synced:0, retries:0, created_at: Date.now()});
      await refreshBadge(); });
    const stacked = await page.evaluate(() => {
      const w = document.getElementById('_save_check_bar');
      const b = document.getElementById('_offl_badge');
      return w && b ? (parseInt(b.style.top||'0', 10) >= w.offsetHeight) : null;
    });
    if (stacked) pass('the queue badge sits under the warning rather than over it');
    else fail('the two top bars overlap - the warning is the one that gets covered');

    /* Access fails OPEN. A check that cannot be answered is not a no. */
    for (const [mode, label] of [['unreachable', 'the function is not installed yet'],
                                 ['hang', 'the server never answers']]) {
      await page.evaluate(async (mode) => {
        sb.behaviour.canISave = mode;
        await checkCanSave();
      }, mode);
      const after = await barText();
      if (after === null || !/cannot save/i.test(after)) {
        fail(`${label}: the warning was cleared, so a stale no can linger — expected it LEFT ALONE`);
      } else {
        pass(`${label}: fails open, the previous answer is left alone and no new refusal is invented`);
      }
    }

    /* And a yes takes it down again. */
    await page.evaluate(async () => { sb.behaviour.canISave = 'ok'; await checkCanSave(); });
    if (await barText() === null) pass('a yes from the database takes the warning down');
    else fail('the warning stayed up after the database said yes');

    /* Signed out: nothing to tell anybody. */
    await page.evaluate(async () => {
      sb.behaviour.canISave = 'refused';
      localStorage.removeItem('mjm_user');
      await checkCanSave();
    });
    if (await barText() === null) pass('nobody signed in is told nothing');
    else fail('the login page carries a warning about a login that is not there');

    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} failure(s)` : '\nall good');
  process.exit(failed ? 1 : 0);
})();
