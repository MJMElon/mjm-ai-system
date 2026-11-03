/* THE PRE NURSERY HAS TWO JOBS, AND ONE CLAIM.

   It had one, tanam biji benih, and the office added a second:
   *"这个工作是tanam biji benih 现在我要加多一个工作是Mengisi tanah ke hyplug
   RM0.027 per biji"* -- filling the hyplug trays with soil, which happens
   BEFORE the seeds go in and is paid by the same unit, a biji.

   Asked where it should go, the office chose both halves:

     Work Maintenance  ITS OWN SHEET beside Seed Planting. The table already
                       scrolls sideways at eight workers, so a second group
                       of eight would be sixteen columns nobody reads across.
     Nursery Payroll   ONE claim carrying both, one sheet of paper and one
                       signature, each job at its own rate with a grand
                       total under them.

   What the two sheets share is everything except the figures: the same
   batch rows, the same month moves, the same list of names. What differs is
   the figures, the Check and the rate. The job is a COLUMN on the record,
   so the key is (batch_name, job).

   Run: NODE_PATH=/opt/node22/lib/node_modules node tests/the_pre_nursery_pays_two_jobs.cjs
   with a static server on 8777 serving the repository root.               */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, gotIn, want) {
  let got;
  try { got = typeof gotIn === 'function' ? gotIn() : gotIn; }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n         threw ' + e.message); return; }
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}

/* ── The SHIPPED claim arithmetic, lifted ─────────────────────────────────
   A restatement of it here would be a second copy of the thing under test,
   which is the fault this codebase has a heading about. The scanner takes a
   body from after the PARAMETER LIST rather than the first brace on the
   line -- a default argument matches first and hands back half a signature. */
function liftFrom(file, names) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const missing = [];
  let out = '';
  for (const n of names) {
    const m = new RegExp('^(?:function|const)\\s+' + n + '\\b', 'm').exec(src);
    if (!m) { missing.push(n); continue; }
    let i = m.index;
    let j = src.indexOf(n, i) + n.length;
    if (src.slice(i).startsWith('function')) {
      while (src[j] !== '(') j++;                 // the parameter list
      let d = 0; for (; j < src.length; j++) { if (src[j] === '(') d++; else if (src[j] === ')') { d--; if (!d) { j++; break; } } }
      while (src[j] !== '{') j++;                 // the body opens HERE
      d = 0; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) { j++; break; } } }
    } else {
      while (src[j] !== '=') j++;                 // a const: to its own semicolon
      let d = 0;
      for (; j < src.length; j++) {
        const c = src[j];
        if ('([{'.includes(c)) d++;
        else if (')]}'.includes(c)) d--;
        else if (c === ';' && d === 0) { j++; break; }
      }
    }
    out += src.slice(i, j) + '\n';
  }
  return { code: out, missing };
}

const WANT = ['SEED_PLANTING_DEFAULT_RATE', 'HYPLUG_SOIL_DEFAULT_RATE', 'PN_JOBS',
              'pnJobRate', 'pnJobOf', 'seedPlantingClaim', 'preNurseryClaim'];
const lifted = liftFrom('npayroll/npayroll_script.js', WANT);
let PN = null, liftErr = '';
if (lifted.missing.length) liftErr = 'not in npayroll_script.js: ' + lifted.missing.join(', ');
else {
  try {
    PN = new Function('rates', lifted.code + '\nreturn { preNurseryClaim, pnJobOf, pnJobRate, PN_JOBS };');
  } catch (e) { liftErr = e.message; }
}
const api = (rateRows) => {
  if (!PN) throw new Error(liftErr || 'nothing lifted');
  return PN(rateRows || []);
};

/* One batch sown and filled, one sown only, one filled only, one HELD, and
   one record from before the job column existed. */
const RECS = [
  { batch_name: '277', job: 'seed',   planted_date: '2026-09-28', checked_at: 'x', checked_by: 'esther@mjm',
    workers: { Siti: 2000, Rina: 1760 } },
  { batch_name: '278', job: 'seed',   planted_date: '2026-10-05', checked_at: 'x', checked_by: 'esther@mjm',
    workers: { Siti: 1000, Ani: 2000 } },
  { batch_name: '277', job: 'hyplug', planted_date: '2026-09-28', checked_at: 'x', checked_by: 'office@mjm',
    workers: { Siti: 3000, Ani: 1000 } },
  { batch_name: '279', job: 'hyplug', planted_date: '2026-10-20', checked_at: null,
    workers: { Ani: 500 } },                                   // keyed, not Checked
  { batch_name: '280',                planted_date: '2026-10-21', checked_at: 'x', checked_by: 'esther@mjm',
    workers: { Ani: 100 } },                                   // NO job: it is a seed row
];

(async () => {
  console.log('\n1. The claim: each job at its own rate, and one figure underneath');

  check('a record written before the job column reads as SEED, which is what it is',
    () => api().pnJobOf(RECS[4]), 'seed');
  check('…and an empty job reads the same way, never as a job of its own',
    () => [api().pnJobOf({}), api().pnJobOf({ job: '' }), api().pnJobOf(null)], ['seed', 'seed', 'seed']);

  check('the office figures: RM 0.02 a seed, RM 0.027 a biji',
    () => api().PN_JOBS.map(j => [j.job, j.fallback, j.unit, j.category]),
    [['seed', 0.02, 'seed', 'seed_planting'], ['hyplug', 0.027, 'biji', 'hyplug_soil']]);

  const c = () => api().preNurseryClaim(RECS);
  check('each job carries its OWN rate and its own total',
    () => c().jobs.map(j => [j.job, j.rate, j.claim.qty, j.claim.amount]),
    [['seed', 0.02, 6860, 137.2], ['hyplug', 0.027, 4000, 108]]);
  /* 6,860 seeds is 277 and 278 and the record with no job on it; 4,000 biji
     is 277 alone, since 279 has not been Checked. */
  check('…and the arithmetic is the office’s own, by hand',
    () => [Math.round(6860 * 0.02 * 100) / 100, Math.round(4000 * 0.027 * 100) / 100],
    [137.2, 108]);

  check('THE GRAND TOTAL is the two added, and it is what the month pays',
    () => [c().qty, c().amount], [10860, 245.2]);
  check('…and the people column adds up to exactly that',
    () => Math.round(c().people.reduce((a, p) => a + p.amount, 0) * 100) / 100, 245.2);

  /* A WORKER IS PAID ACROSS BOTH JOBS and the claim says so on one line,
     which is the whole reason the office asked for one sheet. */
  check('a worker who did both is ONE line, carrying both jobs',
    () => c().people.map(p => [p.name, p.qty, p.amount,
                               (p.byJob.seed || {}).qty || 0, (p.byJob.hyplug || {}).qty || 0]),
    [['Ani',  3100, 69,    2100, 1000],
     ['Rina', 1760, 35.2,  1760, 0],
     ['Siti', 6000, 141,   3000, 3000]]);
  /* Ani: 2,100 seeds at 0.02 is RM 42.00, 1,000 biji at 0.027 is RM 27.00.
     Siti: 3,000 seeds at 0.02 is RM 60.00, 3,000 biji at 0.027 is RM 81.00. */
  check('…Siti’s two halves priced at two different rates',
    () => Math.round((3000 * 0.02 + 3000 * 0.027) * 100) / 100, 141);

  check('HELD WORK IS NAMED, with the job it is waiting on',
    () => c().held.map(h => [h._label, h.batch_name]), [['Mengisi Tanah ke Hyplug', '279']]);
  check('…and it is on no claim line', () => c().jobs[1].claim.checked.length, 1);

  /* A JOB WITH NOTHING ON IT IS NOT DRAWN, which is what `shown` is for --
     an empty table under a heading is a section somebody reads past. One
     that is entirely HELD still is, because a claim short of work reads
     exactly like a quiet month. */
  check('a job with nothing keyed at all is not drawn',
    () => api().preNurseryClaim(RECS.filter(r => api().pnJobOf(r) === 'seed')).shown.map(j => j.job), ['seed']);
  check('…but a job that is entirely HELD is, so the month can say so',
    () => {
      const only = api().preNurseryClaim([RECS[0], RECS[3]]);
      return [only.shown.map(j => j.job), only.held.map(h => h.batch_name)];
    }, [['seed', 'hyplug'], ['279']]);
  check('nothing at all is no sections and nought',
    () => { const n = api().preNurseryClaim([]); return [n.shown.length, n.qty, n.amount]; }, [0, 0, 0]);

  /* THE PIECE RATE THE OFFICE KEYS WINS over the figure in the code. */
  check('a Piece Rate row filed under the job prices it',
    () => api([{ id: 9, job_desc: 'Isi Tanah', unit: 'biji', rate: 0.03,
                 category: 'hyplug_soil', active: true }])
          .preNurseryClaim(RECS).jobs[1].claim.amount,
    120);
  check('…and an INACTIVE one is not a setting, so the default stands',
    () => api([{ id: 9, rate: 0.03, category: 'hyplug_soil', active: false }])
          .preNurseryClaim(RECS).jobs[1].rate, 0.027);
  check('…and the two rates cannot be read off one another',
    () => { const a = api([{ id: 9, rate: 0.05, category: 'seed_planting', active: true }]);
            return a.preNurseryClaim(RECS).jobs.map(j => j.rate); },
    [0.05, 0.027]);

  console.log('\n2. The office’s own screens');

  const SRC = {
    maintHtml: fs.readFileSync(path.join(ROOT, 'nursery_ops/nursery_ops_maintenance.html'), 'utf8'),
    maintJs:   fs.readFileSync(path.join(ROOT, 'nursery_ops/plot_maintenance_script.js'), 'utf8'),
    payHtml:   fs.readFileSync(path.join(ROOT, 'npayroll/npayroll_dashboard.html'), 'utf8'),
    payJs:     fs.readFileSync(path.join(ROOT, 'npayroll/npayroll_script.js'), 'utf8'),
    css:       fs.readFileSync(path.join(ROOT, 'npayroll/npayroll_styles.css'), 'utf8'),
    sql:       fs.existsSync(path.join(ROOT, 'shared/RUN_ME_hyplug_soil.sql'))
                 ? fs.readFileSync(path.join(ROOT, 'shared/RUN_ME_hyplug_soil.sql'), 'utf8') : '',
  };
  check('the Pre Nursery has a second sheet in the side bar',
    /pn-subtab-hyplug_soil/.test(SRC.maintHtml), true);
  check('…and the view is one Worker Activity knows about',
    /'cull_incentive', 'seed_planting', 'hyplug_soil'/.test(SRC.maintJs), true);
  check('…and the figures are keyed by (batch, job), never by the batch alone',
    [/function _spKey\(batch, job\)/.test(SRC.maintJs),
     /'batch_name,job'/.test(SRC.maintJs)], [true, true]);

  /* THE PIECE RATE SCREEN HAS TO OFFER IT, or the office cannot set the
     RM 0.027 anywhere and the claim is stuck on the figure in the code. */
  check('Settings → Piece Rate offers the new Used For',
    /<option value="hyplug_soil">/.test(SRC.payHtml), true);
  /* `seed_planting` was written by the SQL and never named on that list, so
     that row read as the raw key. Named now, and its neighbour with it. */
  check('…and both Pre Nursery jobs are NAMED on that list rather than shown as keys',
    [/seed_planting:'Seed Planting'/.test(SRC.payJs),
     /hyplug_soil:'Mengisi Tanah ke Hyplug'/.test(SRC.payJs)], [true, true]);

  check('the claim tab reads Pre Nursery, since it carries both jobs',
    /data-sub="seedplant" onclick="switchSub\('seedplant'\)">Pre Nursery</.test(SRC.payHtml), true);
  /* THE KEY DID NOT MOVE. `seedplant` is what the verification, the
     permission and every saved row are filed under; only the word somebody
     reads changed, or every tick the office ever set reads as unset. */
  check('…and the KEY did not move with the label',
    [/data-sub="seedplant"/.test(SRC.payHtml),
     /seedplant: \{ label: 'Pre Nursery'/.test(SRC.payJs),
     /pdfVerifiedNote\(doc, y, 'seedplant'/.test(SRC.payJs)], [true, true, true]);

  /* The section head cannot be a <thead> -- there are two of them -- so it
     needs its own rule, or a head reads as an ordinary body row. */
  check('the job band and its head are styled',
    [/tbody tr\.pn-job-row td\.pn-job/.test(SRC.css),
     /tbody tr\.pn-head th/.test(SRC.css),
     /tbody tr\.pn-sub-row td/.test(SRC.css)], [true, true, true]);

  check('the SQL is handed over, and it moves the key',
    [SRC.sql.length > 0, /ADD COLUMN IF NOT EXISTS job TEXT NOT NULL DEFAULT 'seed'/.test(SRC.sql),
     /PRIMARY KEY \(batch_name, job\)/.test(SRC.sql),
     /0\.027/.test(SRC.sql)], [true, true, true, true]);

  console.log('\n3. The two sheets, driven');

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { page, errs } = await bootMaint(browser);

  const sheet = () => page.evaluate(() => {
    const tbl = document.getElementById('payroll-table');
    if (!tbl) return { title: '', band: '', head: [], body: [], hint: '' };
    return {
      title: (document.getElementById('payroll-form-line') || {}).textContent || '',
      band: (tbl.querySelector('thead .wk-th') || {}).textContent || '',
      head: [...tbl.querySelectorAll('thead tr:nth-child(2) th')].map(th => th.textContent.trim()),
      body: [...tbl.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => {
        const i = td.querySelector('input'); return i ? (i.value || '_') : td.textContent.trim().replace(/\s+/g, ' ');
      })),
      hint: (document.getElementById('payroll-hint') || {}).textContent || '',
    };
  });
  /* A VIEW THE PAGE DOES NOT KNOW ABOUT MUST FAIL AS A NAMED CHECK and not
     take the run down: on the previous code `hyplug_soil` reaches
     payrollRowsFor, which indexes PAYROLL_TYPES and throws, and a harness
     that dies there reports nothing about the twenty checks after it. */
  const go = async (v) => {
    try { await page.evaluate((x) => switchPayrollView(x), v); }
    catch (e) { errs.length = 0; }
    await page.waitForTimeout(250);
  };

  await go('seed_planting');
  let s = await sheet();
  check('Seed Planting opens on its own name', [/Seed Planting/.test(s.band), /Hyplug/.test(s.band)], [true, false]);
  check('…and its figures are the ones keyed against it', s.body.map(r => [r[1], r[3]]),
    [['277', '2000'], ['278', '_']]);

  await go('hyplug_soil');
  s = await sheet();
  check('Mengisi Tanah ke Hyplug is a sheet of its OWN name', /Mengisi Tanah ke Hyplug/.test(s.band), true);
  check('…over the SAME batch rows off the same ledger', s.body.map(r => r[1]), ['277', '278']);
  /* THE WHOLE POINT: one batch, two jobs, two sets of figures that cannot
     see each other. Keyed on the batch alone the second would overwrite the
     first and a crew would be paid for the wrong work. */
  check('…and its OWN figures, not the other sheet’s', s.body.map(r => [r[1], r[3]]),
    [['277', '900'], ['278', '_']]);
  check('…and the same shared name list, so a name is keyed once',
    s.head.slice(3, 5), ['Siti', 'Ani']);
  check('…and its hint says what the job is paid by', /a biji/.test(s.hint), true);

  // Keying on the Hyplug sheet writes the job on the row.
  try {
    await page.fill('#sp-1-1', '750', { timeout: 4000 });
    await page.dispatchEvent('#sp-1-1', 'change');
  } catch (e) { /* no such box: the checks below say so by name */ }
  await page.waitForTimeout(900);
  check('a figure keyed here is saved AS HYPLUG, keyed on the batch and the job',
    await page.evaluate(() => (window.__WRITES || []).map(w =>
      [w.row.batch_name, w.row.job, w.row.workers, w.opt && w.opt.onConflict])),
    [['278', 'hyplug', { Ani: 750 }, 'batch_name,job']]);

  /* THE TWO CHECKS ARE INDEPENDENT. They are different work, agreed by
     different people on different days, and the claim prices them apart. */
  await page.evaluate(() => { window.__WRITES.length = 0; });
  try { await page.evaluate(() => toggleSeedPlantingCheck(0)); } catch (e) {}
  await page.waitForTimeout(500);
  check('Checking a batch here ticks the HYPLUG record and not the seed one',
    await page.evaluate(() => (window.__WRITES || []).map(w =>
      [w.row.batch_name, w.row.job, !!w.row.checked_at])),
    [['277', 'hyplug', true]]);

  /* A NAME WITH FIGURES ON EITHER SHEET STAYS ON THE SHARED LIST. Taken off
     from the sheet that has none, its figures would come back on the other
     one as a column nobody can place. */
  await go('seed_planting');
  const said = await page.evaluate(() => {
    const st = _spCache[getMonth()];
    if (!st || !st.names) return ['no sheet', false];
    const was = window.alert; let msg = '';
    window.alert = (m) => { msg = String(m); };
    // "Ani" has no seed figures at all, and a morning of hyplug filling.
    const i = _spCache[getMonth()].names.indexOf('Ani');
    removeSeedPlantingWorker(i);
    window.alert = was;
    return [msg, _spCache[getMonth()].names.includes('Ani')];
  });
  check('a name used on the OTHER sheet cannot be taken off the shared list',
    [/Ani/.test(said[0]), said[1]], [true, true]);

  check('no page errors on either sheet', errs, []);
  await page.close();

  /* ── A DATABASE STILL WAITING ON THE SQL ────────────────────────────────
     Naming a column the table has not got is not an empty cell, it is the
     whole row refused. So Seed Planting goes on saving exactly as it did,
     and the Hyplug sheet is the one that says to run the file rather than
     taking figures all morning and storing none of them. */
  const old = await bootMaint(browser, { noJob: true });
  await old.page.evaluate(() => switchPayrollView('seed_planting'));
  await old.page.waitForTimeout(250);
  try {
    await old.page.fill('#sp-1-1', '123', { timeout: 4000 });
    await old.page.dispatchEvent('#sp-1-1', 'change');
  } catch (e) {}
  await old.page.waitForTimeout(900);
  check('without the column, Seed Planting writes the row it always wrote',
    await old.page.evaluate(() => (window.__WRITES || []).map(w =>
      [w.row.batch_name, 'job' in w.row, w.opt && w.opt.onConflict])),
    [['278', false, 'batch_name']]);
  try { await old.page.evaluate(() => switchPayrollView('hyplug_soil')); } catch (e) {}
  await old.page.waitForTimeout(250);
  const shut = await old.page.evaluate(() => ({
    hint: (document.getElementById('payroll-hint') || {}).textContent || '',
    boxes: [...document.querySelectorAll('#payroll-table .sp-in')].every(i => i.disabled),
  }));
  check('…and the Hyplug sheet refuses, naming the file to run',
    [/RUN_ME_hyplug_soil\.sql/.test(shut.hint), shut.boxes], [true, true]);
  await old.page.close();

  console.log('\n4. One claim, both jobs, on the paper');

  const { page: pay, errs: payErrs } = await bootPayroll(browser, RECS);
  const v = await pay.evaluate(() => {
    const t = document.getElementById('seedplant-table');
    if (!t) return { bands: [], subs: [], foot: [], note: '' };
    const cells = (tr) => [...tr.children].map(td => td.textContent.trim());
    const out = { bands: [], subs: [], foot: [], note: '' };
    [...t.querySelectorAll('tbody tr')].forEach(tr => {
      if (tr.classList.contains('pn-job-row')) out.bands.push(tr.textContent.replace(/\s+/g, ' ').trim());
      else if (tr.classList.contains('pn-sub-row')) out.subs.push(cells(tr));
    });
    out.foot = [...t.querySelectorAll('tfoot tr')].map(cells);
    out.note = (document.getElementById('seedplant-note') || {}).textContent.replace(/\s+/g, ' ').trim();
    return out;
  });
  check('one table, a band per job, each naming its own rate', v.bands,
    ['Seed Planting · RM 0.02 a seed', 'Mengisi Tanah ke Hyplug · RM 0.027 a biji']);
  check('…a total per job', v.subs.map(r => [r[0], r[r.length - 1]]),
    [['Seed Planting total', 'RM 137.20'], ['Mengisi Tanah ke Hyplug total', 'RM 108.00']]);
  check('…and ONE figure under both, which is what the month pays',
    v.foot, [['PRE NURSERY TOTAL', '', '10,860', '', 'RM 245.20']]);
  check('…the note names both rates', [/Seed Planting: RM 0\.02 a seed/.test(v.note),
    /Mengisi Tanah ke Hyplug: RM 0\.027 a biji/.test(v.note)], [true, true]);
  check('…and names the held batch WITH the job it is waiting on',
    /Mengisi Tanah ke Hyplug batch 279 is keyed and not yet Checked/.test(v.note), true);

  const dl = await pay.evaluate(() => {
    window.__PDFS.length = 0;
    if (typeof window.downloadSeedPlantingPDF !== 'function') return null;
    window.downloadSeedPlantingPDF();
    const d = window.__PDFS[0];
    return d ? { lines: d.lines, saved: d.saved } : null;
  });
  check('the claim form draws both jobs and totals them',
    dl && [dl.lines.some(t => /^Seed Planting {2}·  RM 0\.02 a seed$/.test(t)),
           dl.lines.some(t => /^Mengisi Tanah ke Hyplug {2}·  RM 0\.027 a biji$/.test(t)),
           dl.lines.includes('Seed Planting total'),
           dl.lines.includes('Mengisi Tanah ke Hyplug total'),
           dl.lines.includes('PRE NURSERY TOTAL'),
           dl.lines.includes('RM 245.20')],
    [true, true, true, true, true, true]);
  check('…and the column reads Biji filled on the one, Seeds planted on the other',
    dl && [dl.lines.includes('Seeds planted'), dl.lines.includes('Biji filled')], [true, true]);
  check('…and it is the Pre Nursery claim it saves',
    dl && /^Salary_Claim_Pre_Nursery_/.test(dl.saved || ''), true);
  check('no page errors on the claim', payErrs, []);
  await pay.close();

  await browser.close();
  console.log(fail ? `\n${fail} FAILED, ${pass} passed\n` : `\nAll ${pass} good.\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* ── the two harnesses ───────────────────────────────────────────────── */

const LOGS = [
  { id: 1, transaction_type: 'Planted', batch_name: '277', plot_name: 'P1', quantity_change: 5000, transaction_date: '2026-10-02' },
  { id: 2, transaction_type: 'Planted', batch_name: '277', plot_name: 'P2', quantity_change: 5461, transaction_date: '2026-10-02' },
  { id: 3, transaction_type: 'Planted', batch_name: '278', plot_name: 'P3', quantity_change: 10173, transaction_date: '2026-10-14' },
];
/* One batch keyed on BOTH jobs with different figures, which is the whole
   thing: 2,000 sown and 900 filled on 277. */
const SAVED = [
  { batch_name: '277', job: 'seed',   month: 'Oct 2026', planted_date: '2026-10-02', qty_planted: 10461, workers: { Siti: 2000 } },
  { batch_name: '277', job: 'hyplug', month: 'Oct 2026', planted_date: '2026-10-02', qty_planted: 10461, workers: { Siti: 900 } },
  { batch_name: '279', job: 'hyplug', month: 'Oct 2026', planted_date: '2026-10-20', qty_planted: 800,  workers: { Ani: 500 } },
];

async function bootMaint(browser, opts) {
  const o = Object.assign({ noJob: false }, opts || {});
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript((seed) => {
    window.__WRITES = [];
    window.jspdf = { jsPDF: class { constructor() { this.lines = []; } setFont() {} setFontSize() {} setTextColor() {}
      setFillColor() {} setDrawColor() {} setLineWidth() {} rect() {} line() {} addPage() {}
      getTextWidth(t) { return String(t).length * 2; } splitTextToSize(t) { return [String(t)]; }
      text(t) { this.lines.push(String(t)); } save() {} } };
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    const db = { saved: seed.saved.slice() };
    const answer = (table, st) => {
      if (table === 'shared_inventory_logs' && st.eq.transaction_type === 'Planted') {
        const [a, b] = st.range || [0, 999];
        return { data: seed.logs.slice(a, b + 1), error: null };
      }
      if (table === 'nops_seed_planting_batch_workers') {
        if (st.op === 'upsert') { window.__WRITES.push({ row: st.row, opt: st.opt }); return { data: null, error: null }; }
        /* THE PROBE for the job column. A read cannot find it out --
           select('*') is happy on a table without it -- so the page asks
           for the column by name, and a database that has not had the SQL
           run refuses exactly this one call. */
        if (st.sel && /\bjob\b/.test(st.sel)) {
          return seed.noJob
            ? { data: null, error: { message: 'column nops_seed_planting_batch_workers.job does not exist' } }
            : { data: [], error: null };
        }
        const want = st.in.batch_name || [];
        /* Without the column the rows come back WITHOUT a job, which is how
           a month of records written before it reads. */
        const rows = db.saved.filter(r => want.includes(r.batch_name))
          .filter(r => !seed.noJob || (r.job || 'seed') === 'seed')
          .map(r => seed.noJob ? Object.assign({}, r, { job: undefined }) : r);
        return { data: rows, error: null };
      }
      if (table === 'nops_seed_planting_names') {
        if (st.op === 'upsert') return { data: null, error: null };
        return { data: [{ month: 'Oct 2026', names: ['Siti', 'Ani'] }], error: null };
      }
      if (table === 'nops_seed_planting_batch_month') return { data: [], error: null };
      return { data: [], error: null };
    };
    const from = (table) => {
      const st = { op: 'select', eq: {}, in: {} };
      const p = new Proxy({}, { get(_, k) {
        if (k === 'then') return (a, b) => Promise.resolve(answer(table, st)).then(a, b);
        if (k === 'maybeSingle' || k === 'single') return () => Promise.resolve({ data: null, error: null });
        if (k === 'select') return (s) => { st.sel = s; return p; };
        if (k === 'eq') return (c, v) => { st.eq[c] = v; return p; };
        if (k === 'in') return (c, v) => { st.in[c] = v; return p; };
        if (k === 'range') return (a, b) => { st.range = [a, b]; return p; };
        if (k === 'upsert') return (row, opt) => { st.op = 'upsert'; st.row = row; st.opt = opt; return p; };
        if (k === 'insert' || k === 'update' || k === 'delete') return () => { st.op = k; return p; };
        return () => p; } });
      return p;
    };
    const user = { id: 'u1', email: 'e@x' };
    window.supabase = { createClient: () => ({
      from, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {}
    }) };
  }, { logs: LOGS, saved: SAVED, noJob: o.noJob });
  await page.route('**/shared_access.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'e@x', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true; } });` }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**', '**/cdn.tailwindcss.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.goto('http://localhost:8777/nursery_ops/nursery_ops_maintenance.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.renderSeedPlantingPayroll === 'function', { timeout: 20000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.getElementById('global-month').value = '2026-10';
    _linkedRows.PN = []; _localWorkers.PN = [];
    _registerRows = [{ full_name: 'Siti', section: 'PN', active: true }, { full_name: 'Ani', section: 'PN', active: true }];
    const btn = [...document.querySelectorAll('#sm-nav .pn-tab')].find(b => /switchTab\('payroll'/.test(b.getAttribute('onclick')));
    btn.click();
    switchPayrollView('seed_planting');
  });
  await page.waitForTimeout(600);
  return { page, errs };
}

async function bootPayroll(browser, recs) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errs = [];
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => errs.push(e.message));
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const month = `${M[now.getMonth()]} ${now.getFullYear()}`;
  await page.addInitScript((seed) => {
    window.__PDFS = [];
    /* A STRICT jsPDF: one that takes anything signs off a form that cannot
       be drawn, which is how the Work Maintenance claim stayed unprintable. */
    const fin = (v) => typeof v === 'number' && isFinite(v);
    const guard = (m, a) => a.forEach((v, i) => {
      if (!fin(v)) throw new Error('Invalid arguments passed to jsPDF.' + m + ' (argument ' + (i + 1) + ' is ' + v + ')');
    });
    window.jspdf = { jsPDF: class {
      constructor(op) { this.o = op || {}; this.lines = []; this.saved = null; window.__PDFS.push(this); }
      setFont() {} setFontSize(n) { this._s = n; } setTextColor() {} setFillColor() {} setDrawColor() {} setLineWidth() {}
      rect(x, y, w, h) { guard('rect', [x, y, w, h]); }
      line(a, b, c, d) { guard('line', [a, b, c, d]); }
      addPage() {} autoPrint() { this.printed = true; } output() { return 'blob:x'; }
      getTextWidth(t) { return String(t).length * (this._s || 9) * 0.18; }
      splitTextToSize(t) { return [String(t)]; }
      text(t, x, y) { guard('text', [x, y]); this.lines.push(String(t)); }
      save(n) { this.saved = n; }
    } };
    window.Chart = class { constructor() {} update() {} destroy() {} resize() {} };
    const answer = (table, st) => {
      if (table === 'nops_seed_planting_batch_workers')
        return { data: seed.recs.map(r => Object.assign({ month: seed.month }, r)), error: null };
      if (table === 'mjmnpayroll_piece_rates') return { data: [], error: null };
      return { data: [], error: null };
    };
    const from = (table) => {
      const st = { op: 'select', eq: {}, in: {} };
      const p = new Proxy({}, { get(_, k) {
        if (k === 'then') return (a, b) => Promise.resolve(answer(table, st)).then(a, b);
        if (k === 'maybeSingle' || k === 'single') return () => Promise.resolve({ data: null, error: null });
        if (k === 'eq') return (c, v) => { st.eq[c] = v; return p; };
        if (k === 'in') return (c, v) => { st.in[c] = v; return p; };
        if (k === 'insert' || k === 'update' || k === 'delete' || k === 'upsert') return () => { st.op = k; return p; };
        return () => p; } });
      return p;
    };
    const user = { id: 'u1', email: 'e@x' };
    window.supabase = { createClient: () => ({
      from, rpc: () => Promise.resolve({ data: [], error: null }),
      auth: { getUser: async () => ({ data: { user }, error: null }),
              getSession: async () => ({ data: { session: { user } }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {}
    }) };
  }, { recs, month });
  await page.route('**/shared_access.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript',
    body: `window.MJMAccess = new Proxy({}, { get(t, k) {
      if (k === 'user') return () => ({ id:'u1', email:'e@x', full_name:'Elon Ting' });
      if (k === 'load') return async () => true;
      if (k === 'perms' || k === 'permissions' || k === 'profile') return () => ({});
      if (k === 'normalize') return (x) => x || {};
      if (k === 'then') return undefined;
      return () => true; } });` }));
  for (const host of ['**/cdn.jsdelivr.net/**', '**/cdnjs.cloudflare.com/**', '**/cdn.tailwindcss.com/**',
                      '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, body: '' }));
  }
  await page.goto('http://localhost:8777/npayroll/npayroll_dashboard.html', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('[data-sub="seedplant"]');
  await page.waitForFunction(() => !/Loading/.test(document.getElementById('seedplant-table').textContent || 'Loading'),
                             { timeout: 15000 });
  await page.waitForTimeout(300);
  return { page, errs };
}
