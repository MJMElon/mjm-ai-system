/* ════════════════════════════════════════════════════════════════
   MJM NURSERY — Payroll System
   npayroll_script.js

   Three tabs:
     Payroll       Work Maintenance · Transplanting · Seedlings Collection
                   · Monthly Payroll
     Worker System — moved to the 555 FC Portal's Manage page
     Piece Rate    job description · unit · rate

   Work Maintenance is READ from the Worker Record in the Nursery Operation
   module. That sheet records the capacity each worker completed and carries
   no money; this one prices it. One place records the work, one place pays
   for it. Transplanting and Seedlings Collection are keyed here, priced from
   the Piece Rate list.
════════════════════════════════════════════════════════════════ */

const _supabase = supabase.createClient(SHARED_SUPA_URL, SHARED_SUPA_KEY);
const $  = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* Sections the payroll is filed under. The first four match the nurseries;
   UNE and Driver exist only here. */
const SECTIONS = [
  { code:'PN',     name:'PN — Pre Nursery'     },
  { code:'BNN',    name:'BNN — Batu Niah'      },
  { code:'UNN1',   name:'UNN1 — Ulu Niah 1'    },
  { code:'UNN2',   name:'UNN2 — Ulu Niah 2'    },
  { code:'UNE',    name:'UNE'                  },
  { code:'Driver', name:'Driver'               }
];
const SECTION_NAME = Object.fromEntries(SECTIONS.map(s => [s.code, s.name]));
/* The names shown on the claim and its PDF.
 
   The written-out name wins where there is one. Facility Management stores a
   nursery's CODE as its name — the cards read "BNN", "UNN 1" — so preferring
   the register turned "BNN — Batu Niah Nursery" into "BNN — BNN" and told the
   reader nothing. The register answers for nurseries this module has never
   heard of, which is the case that needed it: a UNN 3 created there gets
   "UNN3 — UNN 3" rather than no name at all. */
const NURSERY_FULL_BUILTIN = { PN:'Pre Nursery', BNN:'Batu Niah Nursery',
                               UNN1:'Ulu Niah Nursery 1', UNN2:'Ulu Niah Nursery 2' };
const NURSERY_FULL = new Proxy({}, {
  get: (_, k) => NURSERY_FULL_BUILTIN[k] || NURSERY_REGISTER[k],
  has: (_, k) => k in NURSERY_FULL_BUILTIN || k in NURSERY_REGISTER,
});
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let workers   = [];    // mjmnpayroll_workers
let rates     = [];    // mjmnpayroll_piece_rates
let entries   = [];    // mjmnpayroll_work_entries for the open month
let userEmail = '';
let isAdmin   = false;
let _tablesOk = true;

/* Work-maintenance data, mirrored from the Nursery Operation module. */
let maint = { records: [], ticks: {}, rates: {}, workers: {}, localWorkers: {},
              plotIndex: {}, orphanPlots: [], linked: {} };

/* The Work Maintenance tick sheets take their worker names from the Worker
   System below — a nursery's own section, general workers only. Resolve it the
   same way here, or the salary claim would price a different set of names than
   the sheet it is priced from shows. Kept identical to isGeneralWorker in
   nursery_ops/plot_maintenance_script.js. */
/* WHICH NURSERIES THERE ARE.
 
   The register is Facility Management — Manage Nurseries & Base Maps, which
   writes operation_nurseries. That is the one place a nursery is created, so
   it is the one place this list should come from: add UNN 3 there next year
   and it appears here, on the claim and in its dropdown, without anybody
   editing a file.
 
   The four below are a FLOOR, not the list. They are what this module has
   always had, kept so a register that cannot be read — RLS, a dropped
   connection, a table not created yet — leaves the payroll working on the
   nurseries it already knew rather than showing an empty dropdown. A nursery
   in the register is added to them; none is ever taken away by a failed read.
 
   The code is the name with the spaces taken out, which is how the rest of
   the system keys a nursery: "UNN 1" in the register is UNN1 here, and
   matches the section on a worker's row. Same rule as registerNurseryKey
   below. */
const MAINT_NURSERIES_FLOOR = ['PN', 'BNN', 'UNN1', 'UNN2'];
let MAINT_NURSERIES = MAINT_NURSERIES_FLOOR.slice();

/* code → the name Facility Management gave it, for headings and the PDF. */
let NURSERY_REGISTER = {};

const nurseryCode = (name) =>
  String(name == null ? '' : name).replace(/[^a-z0-9]/gi, '').toUpperCase();

/* Is this one a place maintenance work is done, or the Estate?
 
   The Estate is a section of the payroll register and a location on System
   Setting, but it is not a nursery sheet — there are no plots on it and no
   rounds to spray. Decided by shared_worker_locations.js, the file the Team
   Board and the Location card already use, so all three agree about where a
   section sits. Without that file loaded, everything in the register counts,
   which is the old behaviour. */
function isMaintNursery(code) {
  const L = window.MJMWorkerLocations;
  if (!L || typeof L.locationOf !== 'function') return true;
  const loc = L.locationOf(code);
  return !!loc && loc.key !== 'estate';
}

async function loadNurseryRegister() {
  const res = await _supabase.from('operation_nurseries').select('name, license')
    .order('name').then(r => r, e => ({ error: e }));
  if (res.error || !res.data) {
    console.warn('[npayroll] the nursery register could not be read, so the '
      + 'built-in list stands:', res.error && res.error.message);
    return;
  }
  const reg = {};
  res.data.forEach((r) => {
    const c = nurseryCode(r.name);
    if (c) reg[c] = String(r.name || '').trim();
  });
  NURSERY_REGISTER = reg;
  /* The floor first, so nothing this module has always offered disappears
     because somebody has not added it to Facility Management yet. */
  const all = MAINT_NURSERIES_FLOOR.concat(Object.keys(reg));
  MAINT_NURSERIES = [...new Set(all)].filter(isMaintNursery);
  fillMaintNurseries();
}

/* ── THE CLAIM'S NURSERY PICKER: CIRCLES, NOT A DROPDOWN ────────────────────

   A salary claim is read one nursery at a time — you check BNN, sign it, then
   check UNN 1 — so the nurseries belong on the bar where you can see all of
   them and which one you are in. A dropdown hid two of the three answers
   behind a click and never said how many there were.

   THE <select> IS STILL THERE, HIDDEN, and is still the value. Roughly a
   dozen lines on this page ask it what is chosen — renderMaint, the PDF, the
   lock scope, renderEntries' filter — and a picker that changed shape must
   not also change what any of them read. The circles set it and fire its
   change, exactly as a finger on the dropdown did.

   THE THREE ARE A FLOOR, NOT A CEILING. Anything else that actually has work
   filed against it this month gets a circle of its own after them. A nursery
   with a real claim must never become unreachable because it is not one of
   the three named — that is how a claim goes unpaid with nobody the wiser. */
const CLAIM_NURSERIES  = ['BNN', 'UNN1', 'UNN2'];
const CLAIM_PILL_LABEL = { PN:'PN', BNN:'BNN', UNN1:'UNN 1', UNN2:'UNN 2',
                           UNE:'UNE', Driver:'Driver', __none:'No section' };
/* The circle for work whose plot matched no payroll section at all. It only
   ever appears when there IS such work: without it that work is invisible
   under every circle, which is a claim quietly going short. */
const NO_SECTION = '__none';

/* Does this row belong under the chosen circle? */
const inSection = (sec, v) => sec === NO_SECTION ? !(v || '') : (v || '') === sec;

function renderClaimPills(wrapId, selId, extras, onPick) {
  const wrap = $(wrapId), sel = $(selId);
  if (!wrap || !sel) return;
  const codes = CLAIM_NURSERIES.concat(
    (extras || []).filter((c, i, a) => c && !CLAIM_NURSERIES.includes(c) && a.indexOf(c) === i));
  /* Keep what was chosen where it still exists — the field read lands after
     the first paint, and a redraw must not quietly move somebody to another
     nursery mid-check. */
  const want = codes.includes(sel.value) ? sel.value : codes[0];
  sel.innerHTML = codes.map(c =>
    `<option value="${esc(c)}">${esc(c === NO_SECTION ? 'No section'
                                   : c + ' — ' + (NURSERY_FULL[c] || c))}</option>`).join('');
  sel.value = want;
  wrap.innerHTML = codes.map(c => `
    <button type="button" class="npill${c === want ? ' on' : ''}${c === NO_SECTION ? ' npill-odd' : ''}"
            data-code="${esc(c)}"
            title="${esc(c === NO_SECTION
                        ? 'Work whose plot matches no payroll section. Check the plot’s nursery in Facility Management.'
                        : (NURSERY_FULL[c] || c))}"
      >${esc(CLAIM_PILL_LABEL[c] || c)}</button>`).join('');
  wrap.querySelectorAll('.npill').forEach(b => b.onclick = () => {
    if (sel.value === b.dataset.code) return;
    sel.value = b.dataset.code;
    renderClaimPills(wrapId, selId, extras, onPick);
    try { onPick(); } catch (_) {}
  });
}

/* Nurseries outside the three that have a Work Maintenance claim this month —
   PN, whose P01–P52 are maintained like any other plot, and anything
   Facility Management has since added. */
function maintExtraNurseries() {
  const m = monthValue();
  return MAINT_NURSERIES.filter(c => {
    if (CLAIM_NURSERIES.includes(c)) return false;
    try { return maintWorkerNames(c, m).length > 0; } catch (_) { return false; }
  });
}

/* Sections outside the three with transplanting this month — the field's own
   rows and anything keyed by hand, including work that matched no section. */
function transplantExtraSections() {
  const seen = new Set();
  try { transplantFieldLines().forEach(l => seen.add(l.section || NO_SECTION)); } catch (_) {}
  try {
    entries.filter(e => e.category === 'transplanting')
           .forEach(e => seen.add(e.section || NO_SECTION));
  } catch (_) {}
  return [...seen].filter(c => c && !CLAIM_NURSERIES.includes(c));
}

/* Both pickers, redrawn. Called wherever the month or the data changes, so
   the extra circles follow what is actually filed rather than what was
   filed when the page opened. */
function renderClaimPickers() {
  renderClaimPills('maint-nursery-pills',   'maint-nursery',   maintExtraNurseries(),
                   () => renderMaint());
  renderClaimPills('transpl-section-pills', 'transpl-section', transplantExtraSections(),
                   () => renderEntries('transplanting'));
}

/* Kept as its own name because loadNurseryRegister calls it: the register
   read is what adds a nursery this module had never heard of. */
function fillMaintNurseries() { try { renderClaimPickers(); } catch (_) {} }

/* The roles a worker can hold. One list, offered in every section. */
const ROLES = [
  'Field Conductor',
  'Assistant Field Conductor',
  'Water Pump Operator',
  'General Worker',
  'Driver',
  'Gardener'
];
/* Of those, the ones the Work Maintenance tick sheets take. Anything else on
   the list is a known role and is simply not general nursery work — a Gardener
   or a Water Pump Operator who does spray a plot is handled by the per-worker
   switch, not by widening this. */
const MAINT_ROLE       = /^general\s*worker$|pekerja am|buruh am/i;
/* Only reached by rows keyed before the list existed, where the role is free
   text or blank. */
const NON_GENERAL_ROLE = /driver|pemandu|conductor|kondektor|konduktor|supervisor|penyelia|mandor|mandur|kepala|kerani|clerk|admin|manager|pengurus|executive|eksekutif|mekanik|mechanic|technician|juruteknik|security|pengawal|jaga|foreman|operator|storekeeper|storeman/i;

/* WHICH SHEET A REGISTER ROW BELONGS TO.
 
   Compared on letters and digits alone, and NOT as an exact string. The two
   sides have always spelt a nursery differently: the sheets key on UNN1, and
   the register is filled in by hand and says "UNN 1". An exact match therefore
   found BNN and PN — which have no space in them — and silently found NOBODY
   for UNN 1 or UNN 2, so those two nurseries priced an empty claim while
   looking perfectly normal.
 
   `nursery` answers when `section` has not been filled in: the register copies
   one into the other, but a row added since is only guaranteed to have the one
   whoever keyed it happened to use.
 
   SHARED RULE. The same comparison is _registerNurseryKey in
   nursery_ops/plot_maintenance_script.js, which resolves the very same list
   for the Worker Record these claims are priced from. Change one, change the
   other — two spellings of this rule is two different worker lists. */
function registerNurseryKey(w) {
  const key = (x) => String(x == null ? '' : x).replace(/[^a-z0-9]/gi, '').toUpperCase();
  return key(w && w.section) || key(w && w.nursery);
}

const roleOf = w => String(w.role || w.job_title || '').trim();
const isKnownRole = r => ROLES.some(x => x.toLowerCase() === String(r).trim().toLowerCase());

/* In order: the worker's own switch settles it; then the role, which since the
   list exists answers outright; and only for a role keyed before the list —
   free text or blank — the two older guesses. */
function isGeneralWorker(w, nurseryNamesTheRole) {
  if (w.active === false) return false;
  if (w.maint_general === true)  return true;
  if (w.maint_general === false) return false;
  const r = roleOf(w);
  if (MAINT_ROLE.test(r))  return true;    // General Worker
  if (isKnownRole(r))      return false;   // another role off the list
  if (nurseryNamesTheRole) return false;   // nursery labels its people; this one is not labelled
  return !NON_GENERAL_ROLE.test(r);
}
/* Does this nursery label its general workers by role? */
function nurseryNamesRole(n) {
  return workers.some(w => registerNurseryKey(w) === n &&
                           w.active !== false && MAINT_ROLE.test(roleOf(w)));
}
/* Is this worker on the Work Maintenance sheets? Used by the list and the
   worker form, so what is shown is what the sheets actually do. */
function onMaintSheet(w) {
  const n = registerNurseryKey(w);
  if (!MAINT_NURSERIES.includes(n)) return false;
  return isGeneralWorker(w, nurseryNamesRole(n));
}

/* WHO THE CLAIM PRICES, nursery by nursery, straight off the Worker System
   register: the people filed under that nursery who are on the Work
   Maintenance sheets. Same rules and same nursery-name comparison the
   schedule's own Worker Record uses (generalWorkersByNursery in
   nursery_ops/plot_maintenance_script.js), so the two always list the same
   names — a name the claim does not hold is a worker whose ticks nobody
   prices.

   maint.rows[n] keeps their register rows, not just their names, because
   whether somebody belongs on THIS month's claim depends on when they left —
   see maintWorkerNames() below. maint.workers[n] stays as the plain name
   list for anything that wants every name the nursery has. */
function resolveMaintWorkers() {
  maint.workers = {};
  maint.rows    = {};
  maint.linked  = {};
  MAINT_NURSERIES.forEach(n => {
    const named = nurseryNamesRole(n);
    const mine = workers
      .filter(w => registerNurseryKey(w) === n)   // UNE, Driver excluded
      /* Asked as if they were still here. isGeneralWorker() says no to
         anybody Inactive, which is the right answer to "is this person on the
         sheets today" and the wrong one to "were they on them in September" —
         and September is what a September claim pays. Whether a leaver
         belongs on THIS month is maintWorkerNames()'s question, below. */
      .filter(w => isGeneralWorker({ ...w, active: true }, named))
      .filter(w => String(w.full_name || '').trim());
    // One row per name — a register with the same person twice must not give
    // the claim two lines to pay.
    const seen = new Set();
    const rows = mine.filter(w => {
      const k = String(w.full_name).trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));

    maint.linked[n] = rows.length > 0;
    maint.rows[n]   = rows;
    // The plain list is who is on the sheets TODAY — the leavers live in
    // maint.rows and are put back a month at a time.
    maint.workers[n] = rows.length
      ? rows.filter(w => w.active !== false).map(w => String(w.full_name).trim())
      /* Only when the register has nobody at all for this nursery. The
         maintenance module's own old list (nops_maint_workers) is the same
         fallback the schedule falls back to, so the two still agree — but the
         claim says which list it is showing rather than letting an unmanaged
         one pass for the register. */
      : (maint.localWorkers[n] || []);
  });
}

/* THE NAMES ON ONE MONTH'S CLAIM.

   A worker who left in September worked in September, and a claim for
   September has to pay them. Marking them Inactive used to take them off
   every month at once, including the ones they were here for — so a last day,
   now that the register keeps one, is what decides:

     still active          on every month's claim
     left, last day known  on every month up to and including the one they
                           left in, and off it after
     left, no last day     off, as before — "inactive" is all the register
                           says and there is no date to reason from

   The registered date is deliberately NOT used to take anybody off an earlier
   month. It was backfilled from when the row was written for every worker
   already on the register, which for anybody typed up from an older paper
   list is years after they actually started — dropping them off those months
   on the strength of a guess is worse than carrying them. */
function maintWorkerNames(nursery, ym) {
  const rows = maint.rows && maint.rows[nursery];
  if (!rows || !rows.length) return maint.workers[nursery] || [];
  const monthStart = `${ym}-01`;
  return rows.filter(w => {
    if (w.active !== false) return true;
    const last = w.last_day ? String(w.last_day).slice(0, 10) : '';
    return !!last && last >= monthStart;
  }).map(w => String(w.full_name).trim());
}

const money = v => 'RM ' + (Number(v) || 0).toFixed(2);
/* A rate may carry more than two decimals (0.015). Printing it as "0.01"
   next to money worked out from 0.015 makes the sheet look wrong. */
function rateTxt(v) {
  if (v == null) return '—';
  const n = Number(v) || 0;
  for (let d = 2; d <= 4; d++) if (Math.abs(n - Number(n.toFixed(d))) < 1e-9) return 'RM ' + n.toFixed(d);
  return 'RM ' + n.toFixed(4);
}
const num   = v => (Number(v) || 0).toLocaleString();
function monthValue() { return $('global-month').value || todayMonth(); }
function todayMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function monthLabel(m) { const [y, mo] = String(m).split('-'); return `${MONTHS_SHORT[+mo-1] || mo} ${y}`; }
/* The maintenance module stores its month as "Apr 2026". */
function maintMonthLabel(m) { return monthLabel(m); }

/* ════════════ TABS ════════════ */
/* Can this user open a tab or use a function on it? Set on this module's
   own User Access page; unset means the module level decides, as before. */
function may(page, action) {
  // Fail OPEN if the helper is an older cached copy without canDo: this
  // module has always been governed by the module level, and a stale script
  // must not lock everybody out of a payroll they are entitled to.
  if (typeof MJMAccess === 'undefined' || typeof MJMAccess.canDo !== 'function') return true;
  return MJMAccess.canDo('npayroll', page, action || 'view');
}
/* Guard a write. Allows it when the helper is too old to know about it,
   matching `may` above. */
function mayDo(page, action, message) {
  if (typeof MJMAccess === 'undefined' || typeof MJMAccess.requireAction !== 'function') return true;
  return MJMAccess.requireAction('npayroll', page, action, message);
}
/* Hide every tab and sub-tab this user may not open, and land them on one
   they can. */
function applyPageAccess() {
  document.querySelectorAll('.subtab[data-sub]').forEach(b => {
    if (!may(b.dataset.sub)) b.style.display = 'none';
  });
  // System Setting is hidden rather than shown disabled: it is one screen with
  // one job, and an empty one would only invite the question.
  const lk = $('tab-btn-locks');
  if (lk) lk.classList.toggle('hidden', !may('locks'));
  const tabPages = { workers: 'workers', rates: 'rates', locks: 'locks' };
  Object.entries(tabPages).forEach(([tab, page]) => {
    if (!may(page)) {
      const b = document.querySelector(`.tab[data-tab="${tab}"]`);
      if (b) b.style.display = 'none';
    }
  });
  const payrollSubs = ['maint', 'transpl', 'seedling', 'other', 'monthly'];
  if (!payrollSubs.some(may)) {
    const b = document.querySelector('.tab[data-tab="payroll"]');
    if (b) b.style.display = 'none';
  }
}
/* The first tab or sub-tab this user can actually open. */
function firstOpen(candidates) { return candidates.find(may) || null; }

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  $('tab-' + name).classList.add('active');
  try { localStorage.setItem('npayroll_tab', name); } catch (_) {}
  if (name === 'rates')   renderRates();
  if (name === 'payroll') refreshPayrollTab();
  if (name === 'locks')   renderLockCalendar();
}
function switchSub(name) {
  document.querySelectorAll('.subtab').forEach(b => b.classList.toggle('active', b.dataset.sub === name));
  document.querySelectorAll('.subpanel').forEach(p => p.classList.remove('active'));
  $('sub-' + name).classList.add('active');
  try { localStorage.setItem('npayroll_sub', name); } catch (_) {}
  refreshPayrollTab();
}
function activeSub() {
  const b = document.querySelector('.subtab.active');
  return b ? b.dataset.sub : 'maint';
}
function refreshPayrollTab() {
  const s = activeSub();
  /* Before anything reads a picker: the extra circles depend on the month's
     own data, so a month change has to redraw them before the sheet under
     them is drawn. */
  try { renderClaimPickers(); } catch (_) {}
  /* Every strip, not only the visible one. They are cheap, the month picker
     changes all five at once, and a stale strip on the sub-tab somebody
     switches to is exactly the thing that invites them to start keying into
     a month that is shut. */
  try { Object.keys(LOCK_SHEETS).forEach(renderVerifyBar); } catch (_) {}
  if (s === 'maint')    renderMaint();
  if (s === 'transpl')  renderEntries('transplanting');
  if (s === 'seedling') renderEntries('seedlings');
  if (s === 'other')    renderEntries('other');
  if (s === 'monthly')  renderMonthly();
}

function closeModal(id) { $(id).classList.remove('open'); }

/* The section picker on this module's own entry forms. It lived in the Worker
   System block and moved out with it, which broke every form that fills one —
   so it stays here, where the forms that need it are. The Worker System page
   carries its own copy for the same reason: the two pages cannot see each
   other's scripts. */
function fillSectionSelect(el, includeAll, selected) {
  if (!el) return;
  el.innerHTML = (includeAll ? '<option value="">All sections</option>' : '')
    + SECTIONS.map(s => `<option value="${s.code}">${esc(s.name)}</option>`).join('');
  if (selected != null) el.value = selected;
}

/* ════════════ WORKER SYSTEM ════════════ */
/* Moved to the 555 FC Portal's Manage page — scan/scan_workers.html.
   Same screen and the same table; only where you reach it from changed.

   `workers` is still loaded here and still needed here: the salary claim
   prices names off it, the entry forms pick from it, and the Work
   Maintenance tick sheets take their columns from it. What left is the
   editing screen, not the register. */

/* ════════════ PIECE RATE ════════════ */
const CAT_LABEL = { transplanting:'Transplanting', seedlings:'Seedlings Collection',
                    maintenance:'Work Maintenance', other:'Other', '':'Any sheet' };

/* The three groups a job is filed under. A separate question from `category`
   above, which says which sheet offers the job — a Main Nursery job can be a
   transplanting job, so both are kept. */
const RATE_GROUPS = [
  { code:'MN',        name:'MN — Main Nursery' },
  { code:'PN',        name:'PN — Pre Nursery'  },
  { code:'Machinery', name:'Machinery'         }
];
const RATE_GROUP_NAME = Object.fromEntries(RATE_GROUPS.map(g => [g.code, g.name]));
/* False until the group_code column exists — see loadRates. */
let _rateGroupCol = true;

function renderRates() {
  const codes = RATE_GROUPS.map(g => g.code);
  const ungrouped = rates.filter(r => !codes.includes(r.group_code));
  // "Not grouped yet" is shown only when something is actually sitting in it,
  // so a tidy list never carries an empty fourth block.
  const blocks = RATE_GROUPS.concat(
    ungrouped.length ? [{ code:'', name:'Not grouped yet' }] : []);

  $('rate-groups').innerHTML = blocks.map(g => {
    const list = g.code ? rates.filter(r => r.group_code === g.code) : ungrouped;
    const rows = list.length ? list.map((r, i) => `
      <tr>
        <td style="color:var(--text-faint);width:44px;">${i + 1}</td>
        <td class="l" style="font-weight:700;color:var(--text-head);">${esc(r.job_desc)}</td>
        <td>${esc(r.unit || '—')}</td>
        <td class="money">${rateTxt(r.rate)}</td>
        <td>${esc(CAT_LABEL[r.category || ''] || r.category)}</td>
        <td><span class="pill ${r.active === false ? 'pill-off' : 'pill-on'}">${r.active === false ? 'Inactive' : 'Active'}</span></td>
        <td class="r" style="white-space:nowrap;">
          <button class="btn btn-sm" onclick="openRate(${r.id})">Edit</button>
          ${may('rates','remove') ? `<button class="btn btn-sm btn-danger" onclick="removeRate(${r.id})">Remove</button>` : ''}
        </td>
      </tr>`).join('')
      : `<tr><td colspan="7" class="empty">No job in this group yet.${
          g.code ? ` <button class="btn btn-sm wsec-add-inline" onclick="openRate(null,'${g.code}')"
                            >+ Add to ${esc(g.code)}</button>` : ''}</td></tr>`;

    return `
      <div class="wsec">
        <div class="wsec-head">
          <span class="wsec-name">${esc(g.name)}</span>
          <span class="wsec-count">${list.length} job${list.length === 1 ? '' : 's'}</span>
          ${g.code ? `<button class="btn btn-sm wsec-add" onclick="openRate(null,'${g.code}')"
                              title="Add a job to ${esc(g.name)}">+ Add Job</button>` : ''}
        </div>
        <div class="wsec-body"><div class="tbl-wrap"><table>
          <thead><tr>
            <th style="width:44px;">No.</th><th class="l">Job Description</th><th style="width:110px;">Unit</th>
            <th style="width:130px;">Piece Rate</th><th style="width:170px;">Used For</th>
            <th style="width:100px;">Status</th><th style="width:150px;"></th>
          </tr></thead><tbody>${rows}</tbody>
        </table></div></div>
      </div>`;
  }).join('');
}

let editRateId  = null;
let rateGroup   = 'MN';
/* `group` is the group whose Add Job button was pressed, so the group is
   settled before the form opens — same as a worker's section. */
function openRate(id, group) {
  if (!mayDo('rates', 'manage',
      'You do not have permission to set piece rates. Ask an admin to grant it in User Access.')) return;
  if (!_tablesOk) { alert('Set the database up first — see the notice at the top.'); return; }
  const r = id ? rates.find(x => x.id === id) : null;
  editRateId = r ? r.id : null;
  rateGroup  = (r && r.group_code) || group || RATE_GROUPS[0].code;
  const label = RATE_GROUP_NAME[rateGroup] || rateGroup;
  $('rate-modal-title').textContent = `${r ? 'Edit' : 'Add'} Job — ${label}`;
  $('rf-group-hint').textContent = _rateGroupCol
    ? `Filed under ${label}.`
    : `Grouping is off until shared/fix_npayroll_rate_groups.sql is run.`;
  $('rf-group-row').classList.add('hidden');
  $('rf-move-btn').classList.toggle('hidden', !r || !_rateGroupCol);
  $('rf-group').innerHTML = RATE_GROUPS.map(g => `<option value="${g.code}">${esc(g.name)}</option>`).join('');
  $('rf-group').value  = rateGroup;
  $('rf-job').value    = r?.job_desc || '';
  $('rf-unit').value   = r?.unit || '';
  $('rf-rate').value   = (r && r.rate != null) ? r.rate : '';
  $('rf-cat').value    = r?.category || '';
  $('rf-active').value = (r && r.active === false) ? '0' : '1';
  $('rate-modal').classList.add('open');
  $('rf-job').focus();
}

function onRateGroupChange() {
  rateGroup = $('rf-group').value;
  const label = RATE_GROUP_NAME[rateGroup] || rateGroup;
  $('rate-modal-title').textContent = `${editRateId ? 'Edit' : 'Add'} Job — ${label}`;
  $('rf-group-hint').textContent = `Filed under ${label}.`;
}
function showRateGroupSelect() {
  $('rf-group-row').classList.remove('hidden');
  $('rf-move-btn').classList.add('hidden');
  $('rf-group').focus();
}

async function saveRate() {
  const job = $('rf-job').value.trim();
  if (!job) { alert('Enter the job description.'); return; }
  const raw = ($('rf-rate').value ?? '').trim();
  if (raw === '') { alert('Enter the piece rate.'); return; }
  const row = {
    job_desc: job,
    unit:     $('rf-unit').value.trim() || null,
    rate:     Math.max(0, parseFloat(raw) || 0),
    category: $('rf-cat').value || null,
    active:   $('rf-active').value === '1',
    updated_at: new Date().toISOString(),
    updated_by: userEmail || null
  };
  // Writing a column the table does not have fails the whole save, so hold
  // the group back until the migration has been run.
  if (_rateGroupCol) row.group_code = rateGroup;
  $('rf-save').disabled = true;
  try {
    let error;
    if (editRateId) ({ error } = await _supabase.from('mjmnpayroll_piece_rates').update(row).eq('id', editRateId));
    else { row.created_by = userEmail || null; ({ error } = await _supabase.from('mjmnpayroll_piece_rates').insert(row)); }
    if (error) throw error;
    closeModal('rate-modal');
    await loadRates();
    renderRates();
  } catch (e) {
    alert('Could not save the job.\n\n' + (e.message || e));
  } finally { $('rf-save').disabled = false; }
}

async function removeRate(id) {
  const r = rates.find(x => x.id === id);
  if (!r) return;
  if (!mayDo('rates', 'remove',
      'You do not have permission to remove a job. Ask an admin to grant it in User Access.')) return;
  // Entries keep their own copy of the rate, so removing the job here cannot
  // change a month that has already been keyed.
  if (!confirm(`Remove "${r.job_desc}"?\n\nWork already keyed against it keeps its own rate and stays correct.`)) return;
  const { error } = await _supabase.from('mjmnpayroll_piece_rates').delete().eq('id', id);
  if (error) { alert('Could not remove: ' + error.message); return; }
  await loadRates();
  renderRates();
}

/* ════════════ ADJUSTING WHAT A JOB EARNED ════════════
   The claims work the money out — capacity from the field, rate from Piece
   Rate, one times the other — and usually that is the answer. Sometimes it
   is not: a plot half done, a rate that was wrong all month, something
   agreed with a worker on the day. The office has to be able to pay a
   different figure WITHOUT going back and falsifying what was done.

   So an adjustment overrides the money and touches nothing else. The
   capacity, the rate and the figure they come to all stay on the sheet, with
   the new number over them and the reason beside — a month reads back as
   "this is what it came to, this is what we paid, this is why they differ".

   Storage is mjmnpayroll_earn_adjustments; see
   shared/RUN_ME_earn_adjustments.sql in this repository. */
let earnAdj = [];            // this month's overrides, both sheets

/* Its own tick on User Access, per sheet — 'maint' or 'transpl'. Reading what
   a month pays and changing it are different jobs, so holding the sheet is
   not holding this.

   This one does NOT fail open, and that is a deliberate exception to the rule
   above it. `may()` answers yes for a user nobody has configured, because the
   thing it is asked about existed before per-function access did and taking it
   away on a deploy would be the bug. Typing over what a month pays has never
   existed, so there is no earlier behaviour to fall back to — falling open
   here would hand a power to everybody on the day it shipped. Where nobody has
   been asked, the answer is the module admin, which is where it would sit if
   the tick were never used at all. */
function mayAdjust(page) {
  if (!may(page)) return false;              // sheet closed to them → so is this
  let acts = null;
  try { acts = (MJMAccess.permissions() || {}).npayroll_actions; } catch (_) {}
  const set = acts && acts[page];
  return set ? !!set.adjust : !!isAdmin;
}

const _adjKey = (sheet, section, name, code) =>
  [sheet, section || '', name, code].join('\u0001');

async function loadEarnAdj() {
  const res = await _supabase.from('mjmnpayroll_earn_adjustments')
    .select('*').eq('month', monthValue())
    .then(r => r, () => ({ data: [] }));
  // A database without the table is not an error: the payroll ran before
  // this existed and must go on running.
  earnAdj = (res && !res.error && res.data) ? res.data : [];
}

function adjOf(sheet, section, name, code) {
  return earnAdj.find(a => _adjKey(a.sheet, a.section, a.worker_name, a.work_code)
                        === _adjKey(sheet, section, name, code)) || null;
}

/* One Earned cell, with whatever has been decided about it.
   `worked` is what the sheet worked out. Where an adjustment exists it is
   the figure shown, the worked-out one is kept underneath, and the reason is
   on hover — nothing is hidden by paying something else. */
function earnedCell(sheet, page, section, name, code, jobLabel, worked) {
  const a = adjOf(sheet, section, name, code);
  const shown = a ? Number(a.amount || 0) : worked;
  /* A closed month offers no pencil. The click refuses anyway, but a cell
     that invites an edit it will not take is worse than one that does not
     invite it. */
  const canEdit = mayAdjust(page) && !sheetLocked(page);
  const open  = canEdit
    ? ` onclick="openAdjust('${sheet}','${page}','${_esc1(section)}','${_esc1(name)}','${_esc1(code)}','${_esc1(jobLabel)}',${worked})"`
      + ' style="cursor:pointer;" title="Adjust what this job earned"'
    : '';
  if (!a && !worked) return `<td${open}>—</td>`;
  return `<td class="money"${open}>${money(shown)}`
       + (a ? `<div style="font-size:.7rem;font-weight:600;color:var(--danger,#c0392b);white-space:nowrap;"
                title="${esc(a.reason || '')}${a.adjusted_by ? ' — ' + esc(a.adjusted_by) : ''}"
                >adjusted · was ${money(worked)}</div>` : '')
       + (canEdit && !a ? '<span style="color:var(--text-faint);font-size:.7rem;"> \u270e</span>' : '')
       + '</td>';
}
/* A value going into a JS string inside an HTML attribute crosses TWO
   quotings, and needs both. The four transplanting jobs are literally named
   `15" X 18"` — one round of escaping puts a bare double quote inside
   onclick="…", which ends the attribute and hands the rest of the call to the
   HTML parser. Backslash-escape for the string, then HTML-escape for the
   attribute; the browser undoes them in that same order. */
const _esc1 = v => esc(String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));

/* What a worker earned on one sheet, after any adjustment — the figure the
   monthly claim has to use, or the claim would pay the sheet's arithmetic
   and the office would pay something else. */
function earnedAfterAdj(sheet, section, name, codes, workedOf) {
  return codes.reduce((s, c) => {
    const a = adjOf(sheet, section, name, c);
    return s + (a ? Number(a.amount || 0) : workedOf(c));
  }, 0);
}

let _adj = null;     // the cell the modal is open on
function openAdjust(sheet, page, section, name, code, jobLabel, worked) {
  /* The same question the cell asked before it drew itself, asked again at
     the click — the two must not be able to disagree. */
  if (!mayAdjust(page)) {
    alert('You do not have permission to change what a job earned.\n\n'
        + 'Ask an admin to grant Adjust Pay in User Access.');
    return;
  }
  /* An adjustment is money on a sheet, so a closed month refuses it the same
     way it refuses a keyed entry. */
  if (!lockAllows(page)) return;
  const a = adjOf(sheet, section, name, code);
  _adj = { sheet, page, section, name, code, worked: Number(worked || 0) };
  $('adj-title').textContent  = a ? 'Change this adjustment' : 'Adjust Earned';
  $('adj-who').value    = name;
  $('adj-job').value    = jobLabel;
  $('adj-was').value    = money(worked);
  $('adj-amount').value = a ? a.amount : '';
  $('adj-reason').value = a ? (a.reason || '') : '';
  $('adj-meta').textContent = a && a.adjusted_by
    ? `Last changed by ${a.adjusted_by}${a.adjusted_at ? ' on ' + String(a.adjusted_at).slice(0, 10) : ''}`
    : '';
  $('adj-clear').style.display = a ? '' : 'none';
  $('adjust-modal').classList.add('open');
}

async function saveAdjust() {
  if (!_adj) return;
  // Again at the save: a month can close while the form is open.
  if (!lockAllows(_adj.page)) return;
  const amt = parseFloat($('adj-amount').value);
  if (!isFinite(amt) || amt < 0) { alert('Enter what this job should pay, in RM.'); return; }
  const reason = $('adj-reason').value.trim();
  // Required, not merely asked for: an adjustment nobody explained is one
  // nobody can defend three months later.
  if (!reason) { alert('Say why. The reason is kept with the figure.'); return; }
  $('adj-save').disabled = true;
  try {
    const { error } = await _supabase.from('mjmnpayroll_earn_adjustments').upsert({
      month: monthValue(), sheet: _adj.sheet, section: _adj.section || '',
      worker_name: _adj.name, work_code: _adj.code,
      amount: Math.round(amt * 100) / 100, reason,
      adjusted_by: userEmail || null, adjusted_at: new Date().toISOString()
    }, { onConflict: 'month,sheet,section,worker_name,work_code' });
    if (error) throw error;
    closeModal('adjust-modal');
    await loadEarnAdj();
    refreshPayrollTab();
  } catch (e) {
    alert('Could not save the adjustment.\n\n' + (e.message || e));
  } finally { $('adj-save').disabled = false; }
}

async function clearAdjust() {
  if (!_adj) return;
  if (!lockAllows(_adj.page)) return;
  if (!confirm('Put this back to what the sheet worked out?')) return;
  const { error } = await _supabase.from('mjmnpayroll_earn_adjustments')
    .delete()
    .eq('month', monthValue()).eq('sheet', _adj.sheet).eq('section', _adj.section || '')
    .eq('worker_name', _adj.name).eq('work_code', _adj.code);
  if (error) { alert('Could not put it back: ' + error.message); return; }
  closeModal('adjust-modal');
  await loadEarnAdj();
  refreshPayrollTab();
}

/* Capacity, to two places where it has them.
   A plot's quantity divided among the people who worked it rarely comes out
   whole — 2,200 across three is 733.33 — and rounding each share to a whole
   number made three of them add up to 2,199 against a plot of 2,200.
   `cap2` is what is BOTH shown and priced, so the row on screen multiplies
   out to the money beside it and this page agrees with the Work Maintenance
   Worker Record it reads. Same rule in
   nursery_ops/plot_maintenance_script.js — change one, change the other. */
const cap2   = v => Math.round(Number(v || 0) * 100) / 100;
const capFmt = v => {
  const n = cap2(v);
  if (!n) return '—';
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/* ════════════ TRANSPLANTING, AS THE FIELD RECORDED IT ════════════
   The FC Portal's Transplanting Job button writes one row per plot per job
   per month — who did the blanket spray, the lining, the polybag filling and
   the transplanting itself — with the quantity taken from the Transplanting
   Report rather than typed. Those rows are priced here, so the office does
   not key a second time what the field has already said.

   They are shown READ-ONLY beside the keyed entries and counted in the same
   total. Editing one would mean the payroll and the field record disagreeing
   about the same morning with nothing on either screen to say which is
   right; the fix for a wrong record is to correct it in the FC Portal, where
   it was made. Anything the field cannot express is still keyed with + Add
   Entry, exactly as before.

   The four jobs, and the office's own wording for each. Mirrors
   TRANSPLANT_JOBS in FC-Portal/src/modules/maintenance/transplantData.js —
   change one, change the other. `jenis` is what a Piece Rate row is matched
   on, which is why it is stored on the record rather than derived here. */
/* `mark` is the WORD that tells this job apart from the other three, in both
   languages, and it is how a Piece Rate is found when its description is not
   one of the spellings above.

   Exact wording has now drifted three times. The office types the job into
   Piece Rate in its own words — "Blanket Spraying", "Lining and Arranging
   Polybag" — and every one of those is one letter or one "and" away from a
   name listed here, so an exact match found nothing and four columns of real
   work priced at zero with the capacity sitting right there beside them.

   The marks are chosen so that no rate for one job can contain another's:
   "polybag" appears in three of these four descriptions and is not a mark;
   "lining", "filling", "blanket" and "transplant" appear in exactly one each.
   A mark that ever matches two rate rows prices NEITHER — see transplantRate. */
const TRANSPLANT_JOBS = [
  { key:'blanket_spray', jenis:'Menyembur rumput secara rata',
    label:'Blanket Spray',                        aka:['Blanket Spray'],
    mark:['blanket', 'menyembur'] },
  { key:'lining',        jenis:'Menyusun dan mengatur polibeg 15" X 18"',
    label:'Lining & Arranging Polybag 15" x 18"', aka:['Menyusun polibeg'],
    mark:['lining', 'arranging', 'menyusun', 'mengatur'] },
  { key:'polybag_fill',  jenis:'Mengisi polibeg 15" X 18"', split:true,
    label:'Polybag Filling 15" x 18"',            aka:['Mengisi polibeg'],
    mark:['filling', 'mengisi'] },
  { key:'transplanting', jenis:'Memindah anak sawit ke polibeg besar',
    label:'Transplanting (Hy Plug to big polybag)', aka:['Menanam anak benih'],
    mark:['transplant', 'hyplug', 'memindah', 'menanam'] }
];
const TRANSPLANT_JOB = Object.fromEntries(TRANSPLANT_JOBS.map(j => [j.key, j]));

let transplantField = [];      // the FC Portal's rows for the month on screen

/* NOT filtered on a verification column, unlike loadMaint's field records.
   Those can be recorded by a WORKER from the Worker Portal, so a conductor's
   signature is what makes them payable — nobody signs for their own work.
   A transplanting row is written by the conductor himself, from his own
   portal: keying it IS the signature, and there is no second person to wait
   for. If that ever changes, this is the line that has to change with it. */
async function loadTransplantField() {
  const res = await _supabase.from('nops_transplant_field_records')
    .select('work_date, nursery_name, plot_name, batch_name, work_type, jenis, schedule_month, source_qty, workers, total_qty')
    .eq('schedule_month', monthLabel(monthValue()))
    .then(r => r, () => ({ data: [] }));
  // A database without the table is not an error here: the office ran the
  // payroll module before this button existed and must go on running it.
  transplantField = (res && !res.error && res.data) ? res.data : [];
}

/* "UNN 1" and "UNN1" are one nursery. shared_plots spells it with a space,
   the payroll sections without one. Same question shared_access.js's
   nurseryKey asks — kept local because this file imports nothing from it. */
const _tpKey = v => String(v == null ? '' : v).replace(/[^a-z0-9]/gi, '').toUpperCase();

/* A Piece Rate for one of the four jobs, within the transplanting category
   (or a rate nobody has filed under a sheet yet).

   EVERY name the job has ever gone by is tried, not just the record's own:
   the wording on a record is whatever the FC Portal used the day it was
   saved, and the wording on a Piece Rate is whatever the office typed. Those
   two dates are not the same. Matching on one string would mean that
   renaming a job — which the office did, to the nursery's real Malay names —
   silently stopped last month's work pricing, with the sheet showing "no
   rate" and nobody able to say why.

   Returns null when nothing matches. The row is then shown with no rate
   rather than priced at zero, because a zero that looks like a price is
   worse than a blank that asks a question. */
/* Jobs whose mark matched more than one Piece Rate, so nothing was priced.
   Filled by transplantRate, read by the claim's notes — guessing between two
   rates is how somebody gets paid the wrong one and nobody ever finds out. */
let transplantRateClash = {};

function transplantRate(rec) {
  const job = TRANSPLANT_JOB[rec.work_type];
  const pool = rates.filter(r => r.active !== false
    && (!r.category || r.category === 'transplanting'));

  // The spellings we know, first. An exact match is never ambiguous.
  const want = [rec.jenis, job && job.jenis, job && job.label]
    .concat((job && job.aka) || [])
    .filter(Boolean).map(_tpNorm);
  const exact = pool.find(r => want.includes(_tpNorm(r.job_desc)));
  if (exact) return exact;

  // Then the job's own word, wherever the office put it in the description.
  const marks = (job && job.mark) || [];
  if (!marks.length) return null;
  const hits = pool.filter(r => {
    const d = _tpNorm(r.job_desc);
    return marks.some(m => d.includes(m));
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1 && job) {
    transplantRateClash[job.key] = hits.map(r => r.job_desc);
  }
  return null;
}
const _tpNorm = v => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The field's rows, as payroll lines — one per worker per record.
 *
 * THE SHARE. Polybag filling carries its own split: the conductor keyed how
 * many bags each person filled and the total was made to agree with the
 * report before it would save, so those numbers are used as they stand.
 *
 * The other three carry names and no numbers, and are divided EQUALLY among
 * the workers credited. That is not a choice made here — it is the rule the
 * maintenance module already pays by ("every ticked row hands its plot
 * capacity out equally among the workers ticked on it", payrollTotalsFor in
 * plot_maintenance_script.js). Two sheets on one claim must not divide the
 * same kind of work two different ways.
 */
function transplantFieldLines() {
  const out = [];
  transplantRateClash = {};
  transplantField.forEach(rec => {
    const job = TRANSPLANT_JOB[rec.work_type];
    const crew = Array.isArray(rec.workers) ? rec.workers.filter(w => w && w.name) : [];
    if (!crew.length) return;
    const rate = transplantRate(rec);
    const cap  = Number(rec.source_qty || 0);
    crew.forEach(w => {
      const qty = job && job.split
        ? Number(w.qty || 0)
        : (crew.length ? cap / crew.length : 0);
      const known = workers.find(x => (x.full_name || '').trim().toLowerCase()
                                   === String(w.name).trim().toLowerCase());
      out.push({
        fc: true,
        // Which of the four jobs, so the claim can put the figure in the
        // right column without matching on a label somebody may translate.
        key: rec.work_type,
        work_date: rec.work_date,
        worker_name: w.name,
        known,
        // The worker's own section where the register knows them; the plot's
        // nursery otherwise, so an unmatched name still lands in the right
        // block rather than in none.
        section: (known && known.section) || _tpSection(rec.nursery_name),
        job_desc: (job && job.label) || rec.jenis || rec.work_type,
        plot: rec.plot_name,
        qty,
        unit: rate ? rate.unit : '',
        rate: rate ? Number(rate.rate || 0) : null,
        amount: rate ? qty * Number(rate.rate || 0) : 0
      });
    });
  });
  return out.sort((a, b) => String(a.work_date || '').localeCompare(String(b.work_date || ''))
                         || String(a.worker_name).localeCompare(String(b.worker_name)));
}

/* WHAT THE FC SAVED, per job, for one nursery — the transplanting report's
   own totals rather than the per-worker shares this claim divides them into.

   The figure is the record's own: the workers' keyed quantities where the job
   splits (polybag filling, where the app makes them agree with the report
   before it will save) and the source figure otherwise. Not the sum of the
   claim's lines, which is a different number in two cases that matter — a
   record whose crew was left empty produces no lines at all, and a name the
   register does not know produces a line that cannot be paid. Both are work
   that was done and reported, and this row is where they show.

   Keyed on the PLOT's nursery, which is what the transplanting report is
   organised by. A claim line is keyed on the worker's own section where the
   register knows them, so the two can differ — somebody registered in UNN 1
   credited on a BNN plot. That difference is real, and showing it as a gap
   is better than asking the same question two different ways to hide it. */
function transplantWorkdone(sec) {
  const out = {};
  TRANSPLANT_JOBS.forEach(j => { out[j.key] = 0; });
  transplantField.forEach(rec => {
    const job = TRANSPLANT_JOB[rec.work_type];
    if (!job) return;
    if (sec && !inSection(sec, _tpSection(rec.nursery_name))) return;
    out[job.key] += (job.split && rec.total_qty != null)
      ? (Number(rec.total_qty) || 0)
      : (Number(rec.source_qty) || 0);
  });
  return out;
}

/* The plot's nursery as a payroll section code, where one matches. */
function _tpSection(nursery) {
  const k = _tpKey(nursery);
  const hit = SECTIONS.find(s => _tpKey(s.code) === k);
  return hit ? hit.code : '';
}

/* ════════════ TRANSPLANTING / SEEDLINGS ════════════ */
const SHEET = {
  transplanting: { table:'transpl-table',  section:'transpl-section',  title:'Transplanting' },
  seedlings:     { table:'seedling-table', section:'seedling-section', title:'Seedlings Collection' },
  /* Piece work that is none of the other three. The category value is `other`,
     which is what the Piece Rate screen's "Used For" has always offered — so a
     rate keyed against Other now has a sheet to price. */
  other:         { table:'other-table',    section:'other-section',    title:'Others' }
};

/**
 * The Transplanting claim: workers down the left, the four jobs across the
 * top, capacity and money under each, total earned on the right.
 *
 * The same shape as Work Maintenance's claim (renderMaint) on purpose — one
 * office reads both, and a sheet that answers the same question in a
 * different layout is a sheet somebody has to learn twice.
 *
 * Every figure is the FC Portal's, priced here. What each worker did is
 * theirs; what it comes to is this page's.
 */
function renderTransplantClaim() {
  const secFilter = $('transpl-section').value || '';
  const lines = transplantFieldLines()
    .filter(l => !secFilter || inSection(secFilter, l.section));

  const secName = s => s === NO_SECTION ? 'No section' : (SECTION_NAME[s] || s);
  const sub = $('transpl-sub');
  if (sub) sub.textContent = `From the FC Portal${secFilter ? ' \u00b7 ' + secName(secFilter) : ''}`
                           + ` \u00b7 ${monthLabel(monthValue())}`;

  if (!lines.length) {
    $('transpl-table').innerHTML = `<tbody><tr><td class="empty">
      No transplanting recorded in the FC Portal for ${esc(monthLabel(monthValue()))}${
      secFilter ? ' in ' + esc(secName(secFilter)) : ''}.
      A conductor records it under Maintenance &rarr; Transplanting Job.
    </td></tr></tbody>`;
    $('transpl-note').textContent = '';
    return;
  }

  /* One row per person credited, not the whole register. Work Maintenance
     lists everybody because it has a tick sheet to fill in; this sheet has
     nothing to key, so a worker with no transplanting this month is a row of
     dashes nobody needs. */
  const names = [...new Set(lines.map(l => l.worker_name))]
    .sort((a, b) => a.localeCompare(b));
  const knownOf = n => (lines.find(l => l.worker_name === n) || {}).known;
  /* A rate the lines cannot supply is still looked up directly: a nursery can
     have records the claim shows no line for — nobody was credited on them —
     and the Total Workdone row still has to price that work. */
  const rateRowOf = key => {
    const l = lines.find(x => x.key === key && x.rate != null);
    if (l) return { rate: l.rate, unit: l.unit || '' };
    const r = transplantRate({ work_type: key, jenis: (TRANSPLANT_JOB[key] || {}).jenis });
    return r ? { rate: Number(r.rate || 0), unit: r.unit || '' } : null;
  };
  const rateOf = key => { const r = rateRowOf(key); return r ? r.rate : null; };
  /* "RM 0.38 / Bag" — the unit is the Piece Rate screen's own, carried down
     the line with the rate. A rate with no unit is half a rate: nobody can
     check RM 0.38 without knowing what it is 0.38 of. */
  const rateCell = key => {
    const r = rateRowOf(key);
    return r ? rateTxt(r.rate) + (r.unit ? ' / ' + r.unit : '') : '\u2014';
  };
  /* Capacity to two places first, then priced — the same order renderMaint
     uses, so the row on screen multiplies out to the money beside it. */
  const capOf = (n, key) => cap2(lines
    .filter(l => l.worker_name === n && l.key === key)
    .reduce((s, l) => s + Number(l.qty || 0), 0));
  const rmOf = (n, key) => {
    const r = rateOf(key);
    if (r == null) return 0;
    return Math.round(capOf(n, key) * Math.round(r * 100000) / 1000) / 100;
  };
  /* The worker's section, which is where an adjustment against them is filed
     — the same key the Monthly Payroll reads it back under. It is the
     register's section where the register knows them, so it does not move
     when somebody changes the section filter above. */
  const secOf  = n => (lines.find(l => l.worker_name === n) || {}).section || '';
  const payOf  = (n, key) => {
    const a = adjOf('transplanting', secOf(n), n, key);
    return a ? Number(a.amount || 0) : rmOf(n, key);
  };
  const earned = n => TRANSPLANT_JOBS.reduce((s, j) => s + payOf(n, j.key), 0);

  const capSum = key => names.reduce((s, n) => s + capOf(n, key), 0);
  const rmSum  = key => names.reduce((s, n) => s + payOf(n, key), 0);
  const grand  = names.reduce((s, n) => s + earned(n), 0);
  const workdone = transplantWorkdone(secFilter);

  // The office's claim form, same four rows as Work Maintenance: the job, the
  // rate it pays, what the whole of it comes to, then Capacity and Total.
  const head = `
    <thead>
      <tr>
        <th rowspan="4" style="width:44px;">No.</th>
        <th rowspan="4" class="l">Worker</th>
        ${TRANSPLANT_JOBS.map(j => `<th colspan="2">${esc(j.label)}</th>`).join('')}
        <th rowspan="4" style="width:120px;">Subtotal (RM)</th>
      </tr>
      <tr>${TRANSPLANT_JOBS.map(j =>
        `<th colspan="2" style="font-weight:600;font-size:12px;">${esc(rateCell(j.key))}</th>`).join('')}</tr>
      <tr>${TRANSPLANT_JOBS.map(j =>
        workdoneCell(workdone[j.key] || 0, rateOf(j.key), rmSum(j.key))).join('')}</tr>
      <tr>${TRANSPLANT_JOBS.map(() =>
        '<th style="width:90px;">Capacity</th><th style="width:110px;">Total (RM)</th>').join('')}</tr>
    </thead>`;

  const body = names.map((n, i) => `
    <tr>
      <td style="color:var(--text-faint);">${i + 1}</td>
      <td class="l" style="font-weight:700;color:var(--text-head);">${esc(n)}${
        knownOf(n) ? '' : '<span title="Not on the worker register — add them in Worker System, or the claim cannot pay this" style="color:var(--danger,#c0392b);"> &#9888;</span>'}</td>
      ${TRANSPLANT_JOBS.map(j => {
        const c = capOf(n, j.key);
        return `<td>${capFmt(c)}</td>` + earnedCell('transplanting', 'transpl', secOf(n), n, j.key,
                                                    j.label, c ? rmOf(n, j.key) : 0);
      }).join('')}
      <td class="money">${money(earned(n))}</td>
    </tr>`).join('');

  const foot = `
    <tfoot><tr>
      <td colspan="2">Grand Total</td>
      ${TRANSPLANT_JOBS.map(j => `<td>${capFmt(capSum(j.key))}</td><td>${money(rmSum(j.key))}</td>`).join('')}
      <td>${money(grand)}</td>
    </tr></tfoot>`;

  $('transpl-table').innerHTML = head + `<tbody>${body}</tbody>` + foot;

  /* Anything that would make the claim short is said FIRST, because a claim
     missing work looks exactly like a quiet month. */
  const notes = [];
  const unknown = names.filter(n => !knownOf(n));
  if (unknown.length) {
    const held = unknown.reduce((s, n) => s + earned(n), 0);
    notes.push(`${money(held)} of this is NOT in the salary claim — ${unknown.map(esc).join(', ')} `
             + `${unknown.length === 1 ? 'is' : 'are'} not on the worker register. `
             + 'Add them in Worker System, or correct the spelling there.');
  }
  /* Two rates the job's word cannot choose between. Named, because the
     alternative is paying one of them and never knowing which. */
  Object.entries(transplantRateClash).forEach(([key, descs]) => {
    const j = TRANSPLANT_JOBS.find(x => x.key === key);
    if (!j || !capSum(key)) return;
    notes.push(`${esc(j.label)} matches more than one piece rate — ${descs.map(esc).join(' and ')} `
             + '— so it prices at nothing. Retire the one you do not use, or rename it.');
  });
  const clashed = new Set(Object.keys(transplantRateClash));
  const unpriced = TRANSPLANT_JOBS.filter(j =>
    capSum(j.key) > 0 && rateOf(j.key) == null && !clashed.has(j.key));
  if (unpriced.length) {
    notes.push(`No piece rate set for ${joinAnd(unpriced.map(j => esc(j.label)))} — add it under `
             + 'Piece Rate, used for Transplanting. Until then that work prices at nothing.');
  }
  /* Every note left here is a fault, so every one is red. The last used to be
     a paragraph explaining the arithmetic, and it was the one printed plain —
     which meant the styling said "this last one is just for information" about
     whatever note happened to end up last once that paragraph went. */
  $('transpl-note').innerHTML = notes.map(t =>
    `<div style="color:var(--danger,#c0392b);font-weight:600;margin-bottom:.25rem;">${t}</div>`
  ).join('');
}

function renderEntries(category) {
  const cfg = SHEET[category];
  const sheet = { transplanting: 'transpl', seedlings: 'seedling', other: 'other' }[category];
  // The section picker changes which scope is being asked about, and this is
  // where a change to it lands.
  try { renderVerifyBar(sheet); } catch (_) {}
  const locked = sheetLocked(sheet);
  /* By its own mark, not by being the first primary button on the bar:
     Transplanting now has the claim-form download beside Add Entry, and the
     first-primary rule would have greyed the download in a closed month and
     left Add Entry live. */
  const addBtn = document.querySelector(`#sub-${sheet} .bar-actions [data-add]`);
  if (addBtn) { addBtn.disabled = locked; addBtn.title = locked ? 'This month is closed.' : ''; }
  const secFilter = $(cfg.section).value || '';
  const list = entries
    .filter(e => e.category === category)
    .filter(e => !secFilter || inSection(secFilter, e.section))
    .sort((a, b) => String(a.work_date || '').localeCompare(String(b.work_date || '')) || a.id - b.id);

  /* Transplanting's own claim is the matrix above; this table is only what
     somebody keyed by hand, and it stays out of the way when there is none. */
  if (category === 'transplanting') {
    renderTransplantClaim();
    const wrap = $('transpl-keyed-wrap');
    if (wrap) wrap.classList.toggle('hidden', !list.length);
    if (!list.length) { $('transpl-keyed-table').innerHTML = ''; return; }
  }

  const tableId = category === 'transplanting' ? 'transpl-keyed-table' : cfg.table;
  const wName = id => (workers.find(w => w.id === id) || {}).full_name || '—';
  const rows = list.length ? list.map((e, i) => `
    <tr>
      <td style="color:var(--text-faint);width:44px;">${i + 1}</td>
      <td>${e.work_date ? fmtDay(e.work_date) : '—'}</td>
      <td class="l" style="font-weight:700;color:var(--text-head);">${esc(wName(e.worker_id))}</td>
      <td>${esc(e.section || '—')}</td>
      <td class="l">${esc(e.job_desc || '—')}</td>
      <td>${num(e.qty)}${e.unit ? ' ' + esc(e.unit) : ''}</td>
      <td>${rateTxt(e.rate)}</td>
      <td class="money">${money(e.amount)}</td>
      <td class="r" style="white-space:nowrap;">
        ${locked ? '<span style="color:var(--text-faint);font-size:11px;font-weight:800;">🔒 Closed</span>' : `
        <button class="btn btn-sm" onclick="openEntry('${category}',${e.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="removeEntry(${e.id})">Del</button>`}
      </td>
    </tr>`).join('')
    : `<tr><td colspan="9" class="empty">Nothing keyed for ${monthLabel(monthValue())} yet.</td></tr>`;

  const total = list.reduce((s, e) => s + Number(e.amount || 0), 0);
  $(tableId).innerHTML = `
    <thead><tr>
      <th style="width:44px;">No.</th><th style="width:110px;">Date</th><th class="l">Worker</th>
      <th style="width:90px;">Section</th><th class="l">Job</th><th style="width:130px;">Quantity</th>
      <th style="width:110px;">Rate</th><th style="width:120px;">Amount</th><th style="width:140px;"></th>
    </tr></thead>
    <tbody>${rows}</tbody>
    ${list.length ? `<tfoot><tr><td class="l" colspan="7">TOTAL — ${esc(monthLabel(monthValue()))}</td>
       <td>${money(total)}</td><td></td></tr></tfoot>` : ''}`;
}

const fmtDay = d => {
  const t = String(d || '');
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]} ${MONTHS_SHORT[+m[2]-1]}` : t;
};

let editEntryId = null, entryCategory = null;
function openEntry(category, id) {
  /* Which User Access page decides whether this may be keyed. One per sheet;
     a sheet answering to another sheet's tick would grant access nobody
     granted. */
  const page = { transplanting: 'transpl', seedlings: 'seedling', other: 'other' }[category]
            || 'seedling';
  if (!mayDo(page, 'manage',
      'You do not have permission to key in this work. Ask an admin to grant it in User Access.')) return;
  /* A closed month refuses here as well as hiding its buttons: the buttons are
     what somebody sees, this is what actually stops the write. */
  if (!lockAllows(page)) return;
  if (!_tablesOk) { alert('Set the database up first — see the notice at the top.'); return; }
  const e = id ? entries.find(x => x.id === id) : null;
  editEntryId = e ? e.id : null;
  entryCategory = category;
  $('entry-modal-title').textContent = (e ? 'Edit ' : 'Add ') + SHEET[category].title + ' Entry';

  fillSectionSelect($('ef-section'), false, e?.section || $(SHEET[category].section).value || 'BNN');
  $('ef-section').onchange = fillEntryWorkers;
  fillEntryWorkers(e?.worker_id);

  // Jobs for this sheet: its own category plus any left unassigned.
  const pool = rates.filter(r => r.active !== false && (!r.category || r.category === category));
  $('ef-rate').innerHTML = pool.length
    ? pool.map(r => `<option value="${r.id}">${esc(r.job_desc)}${r.unit ? ' (' + esc(r.unit) + ')' : ''} — ${rateTxt(r.rate)}</option>`).join('')
    : '<option value="">— no job set up under Piece Rate —</option>';
  if (e && e.rate_id) $('ef-rate').value = e.rate_id;

  $('ef-date').value   = e?.work_date || new Date().toISOString().slice(0, 10);
  $('ef-qty').value    = (e && e.qty != null) ? e.qty : '';
  $('ef-remark').value = e?.remark || '';
  onEntryQtyChange();
  $('entry-modal').classList.add('open');
}

function fillEntryWorkers(selectedId) {
  const sec = $('ef-section').value;
  const pool = workers.filter(w => w.active !== false && (w.section || '') === sec);
  $('ef-worker').innerHTML = pool.length
    ? pool.map(w => `<option value="${w.id}">${esc(w.full_name)}${w.role ? ' — ' + esc(w.role) : ''}</option>`).join('')
    : '<option value="">— no active worker in this section —</option>';
  if (selectedId) $('ef-worker').value = selectedId;
}

function currentEntryRate() { return rates.find(r => String(r.id) === String($('ef-rate').value)) || null; }
function onEntryJobChange() { onEntryQtyChange(); }
function onEntryQtyChange() {
  const r = currentEntryRate();
  const qty = parseFloat($('ef-qty').value) || 0;
  $('ef-amount').value = r ? (qty * Number(r.rate || 0)).toFixed(2) : '0.00';
}

async function saveEntry() {
  /* Asked again at the save, not only when the form opened: a month can close
     while somebody has the form up, and the last word has to be here. */
  const page = { transplanting: 'transpl', seedlings: 'seedling', other: 'other' }[entryCategory]
            || 'seedling';
  if (!lockAllows(page)) return;
  const workerId = $('ef-worker').value;
  const r = currentEntryRate();
  if (!workerId) { alert('Pick a worker. Add one under Worker System if the section is empty.'); return; }
  if (!r) { alert('Pick a job. Add one under Piece Rate first.'); return; }
  const qtyRaw = ($('ef-qty').value ?? '').trim();
  if (qtyRaw === '') { alert('Enter the quantity.'); return; }
  const qty = Math.max(0, parseFloat(qtyRaw) || 0);

  const row = {
    month:     monthValue(),
    category:  entryCategory,
    section:   $('ef-section').value,
    worker_id: Number(workerId),
    rate_id:   r.id,
    job_desc:  r.job_desc,          // snapshot — the job may be renamed later
    unit:      r.unit || null,
    work_date: $('ef-date').value || null,
    qty,
    rate:      Number(r.rate || 0), // snapshot — the rate may change later
    amount:    Math.round(qty * Number(r.rate || 0) * 100) / 100,
    remark:    $('ef-remark').value.trim() || null
  };
  $('ef-save').disabled = true;
  try {
    let error;
    if (editEntryId) ({ error } = await _supabase.from('mjmnpayroll_work_entries').update(row).eq('id', editEntryId));
    else { row.created_by = userEmail || null; ({ error } = await _supabase.from('mjmnpayroll_work_entries').insert(row)); }
    if (error) throw error;
    closeModal('entry-modal');
    await loadEntries();
    refreshPayrollTab();
  } catch (e) {
    alert('Could not save the entry.\n\n' + (e.message || e));
  } finally { $('ef-save').disabled = false; }
}

async function removeEntry(id) {
  const e = entries.find(x => x.id === id);
  const page = { transplanting: 'transpl', seedlings: 'seedling', other: 'other' }[e && e.category]
            || 'seedling';
  if (!lockAllows(page)) return;
  if (!confirm('Delete this entry?')) return;
  const { error } = await _supabase.from('mjmnpayroll_work_entries').delete().eq('id', id);
  if (error) { alert('Could not delete: ' + error.message); return; }
  await loadEntries();
  refreshPayrollTab();
}

/* ════════════ WORK MAINTENANCE (mirrored from Nursery Operation) ════════════
   The maintenance module divides a plot's quantity among the workers ticked
   on that row, then pays it at that work type's piece rate. Repeat that here
   so the two always show the same figures. */
/* `unit` is what the rate is PER, printed under the work's name on the claim
   form — "RM 0.01 / Bag". The maintenance module's rate table is
   (nursery, work_type, rate) and carries no unit, and all four of these are
   paid per polybag, so it is named here rather than invented at the point of
   printing. A work paid by something else gets its own word here. */
const MAINT_TYPES = [
  { code:'pd',       label:'P & D Spraying', unit:'Bag', jenis:'Penyemburan racun kulat dan serangga' },
  { code:'manuring', label:'Manuring',       unit:'Bag', jenis:'Membaja' },
  { code:'weeding',  label:'Weeding',        unit:'Bag', jenis:'Merumput' },
  { code:'interrow', label:'Interrow Spray', unit:'Bag', jenis:'Meracun rumput secara selingan' }
];

/* The rate as the claim form writes it: "RM 0.01 / Bag", or a dash where no
   rate has been set. */
function maintRateTxt(t, rate) {
  if (rate == null) return '\u2014';
  return rateTxt(rate) + (t.unit ? ' / ' + t.unit : '');
}

/* WHY A COLUMN IS EMPTY.

   A column of dashes on this claim looks exactly like a month nobody worked,
   and it is reached five different ways — the work records for that job not
   arriving, their plots not resolving to this nursery, the Worker Record's
   ticks not being there, the ticks naming somebody the claim has no row for,
   or the batch-report ledger not having loaded so every row with no keyed
   quantity reads nought. Four of those are faults and one is a quiet month,
   and until this they all printed the same dash.

   So every column is counted as it is built, and renderMaint() says which of
   the five it is. This runs inside maintTotals rather than beside it because
   a second pass over the same records is a second chance to disagree with the
   figure it is explaining. */
function maintTotals(nursery, month, ym) {
  const wk = maintWorkerNames(nursery, ym || monthValue());
  const per = {};                       // worker → { code: capacity }
  wk.forEach(w => { per[w] = {}; MAINT_TYPES.forEach(t => per[w][t.code] = 0); });
  const why = {};
  maint.why = why;
  /* The field's own answer, paired here. Used where the Worker Record has
     saved no tick for a row — a tick made or corrected in the office ALWAYS
     wins, the same order of precedence the office itself applies, so a
     conductor's correction is never undone by the record it corrected. */
  const fld = maintFieldCredits(nursery, month, wk);
  maint.fieldUnmatched = fld.unmatched;
  let fromField = 0;

  MAINT_TYPES.forEach(t => {
    const store = maint.ticks[`${nursery}_${month}_${t.code}`] || {};
    const d = why[t.code] = {
      label: t.label,
      rows: 0,          // work records for this job in this nursery
      ticked: 0,        // of those, rows with a tick this claim can use
      paid: 0,          // of those, rows that carried a capacity
      /* Every record's capacity, ticked or not — the whole of the work done
         on this job in this nursery, which is what "Total Workdone" prices.
         Deliberately NOT the sum of the workers' columns: those are shares
         of the rows somebody was ticked on, and a row with nobody ticked
         still happened. The gap between the two is work nobody is being
         paid for, and the claim says so under the total. */
      capAll: 0,
      noCap: 0,         // ticked, but the quantity came to nothing
      stray: new Set(), // tick names with no row on this claim
      orphanTicks: 0,   // ticks against a record id this month's list has not got
      fromField: 0,     // rows priced from the field because nothing was saved
      noTaker: new Set(),// the field answered, and nobody it named has a row here
      tickRows: Object.keys(store).length
    };
    const seen = new Set();
    maint.records
      .filter(r => r.jenis === t.jenis && (r.__nursery === nursery))
      .forEach(r => {
        d.rows++;
        const cells = store[r.id] || {};
        seen.add(String(r.id));
        let ticked = wk.filter(w => cells[w]);
        /* Nothing saved against this row — fall back to what the field said.
           Only when the office has said NOTHING: an empty cell is a question
           nobody has answered, while a cell with anything in it has been
           answered and stands. */
        if (!ticked.length && !Object.keys(cells).length && (fld.credits[r.id] || []).length) {
          ticked = fld.credits[r.id].filter(w => wk.includes(w));
          if (ticked.length) { d.fromField++; fromField++; }
        }
        (fld.noTaker[r.id] || []).forEach(nm => d.noTaker.add(nm));
        // Somebody ticked on the Worker Record who has no row here — their
        // share of the plot goes missing, quietly, unless it is said.
        Object.keys(cells).forEach(name => {
          if (cells[name] && !wk.includes(name)) d.stray.add(name);
        });
        /* Same quantity the Work Maintenance record list shows: whatever was
           keyed on the row, and when nothing was keyed, the batch report's
           closing balance for that plot, batch and work date. Reading r.qty
           alone left every FC-saved record at nought, so a plot with four
           workers ticked still paid RM 0.00.

           Read BEFORE the tick test, because Total Workdone counts the work,
           and whether anybody was ticked on it is a separate question. */
        const cap = PlotMovement.recQty(r).value || 0;
        d.capAll += cap;
        if (!ticked.length) return;
        d.ticked++;
        if (!cap) { d.noCap++; return; }
        d.paid++;
        const share = cap / ticked.length;
        ticked.forEach(w => { per[w][t.code] += share; });
      });
    // Ticks filed against a record this month's list does not hold — the
    // Worker Record shows them, and nothing here can price them.
    Object.keys(store).forEach(id => {
      if (!seen.has(String(id)) && Object.values(store[id] || {}).some(Boolean)) d.orphanTicks++;
    });
  });
  maint.fromField = fromField;
  return per;
}

/* The five, in the order they break the chain: no records, no ticks, ticks on
   records this list has not got, ticks on names this claim has no row for, and
   a quantity that came to nothing. Said per work type, and only about the ones
   that actually came to nought — a column that paid needs no explanation. */
/* "a, b and c" — a list read out loud, not a machine's comma run. */
function joinAnd(list) {
  if (list.length <= 1) return list[0] || '';
  return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
}

/* Returns WHY, without naming the work — renderMaint puts the names on,
   because four columns empty for the same reason is one sentence, not four
   that differ only in the word at the front. */
function maintWhyEmpty(code) {
  const d = (maint.why || {})[code];
  if (!d) return '';
  if (d.paid) return '';
  if (!d.rows) {
    return `no work record for this job in this nursery this month.`;
  }
  if (!d.ticked && d.noTaker.size) {
    return `recorded in the field, but credited only to ${[...d.noTaker].join(', ')}, `
         + `who ${d.noTaker.size === 1 ? 'has' : 'have'} no row on this claim — so there is nobody `
         + 'to pay it to.';
  }
  if (!d.ticked && !d.tickRows) {
    return `${d.rows} work record${d.rows === 1 ? '' : 's'}, nobody ticked on the Worker `
         + 'Record and nothing recorded in the field against them — tick who did the work in Work '
         + 'Maintenance and it prices here.';
  }
  if (!d.ticked && d.orphanTicks) {
    return `${d.orphanTicks} tick${d.orphanTicks === 1 ? ' sits' : 's sit'} on the Worker `
         + 'Record against work records this month no longer has — open Work Maintenance\u2019s Worker '
         + 'Record for this month and tick them again.';
  }
  if (!d.ticked && d.stray.size) {
    return `the only names ticked are ${[...d.stray].join(', ')}, who have no row on this `
         + 'claim — file them under this nursery in Worker System, or correct the spelling.';
  }
  if (!d.ticked) {
    return `${d.rows} work record${d.rows === 1 ? '' : 's'}, none of them ticked for `
         + 'anybody on this claim.';
  }
  // Ticked, but every one came to no quantity.
  return `${d.ticked} row${d.ticked === 1 ? '' : 's'} ticked, but none of them has a `
       + 'quantity — nothing keyed on the work record, and the batch report shows nothing standing on '
       + 'that plot and batch at the work date'
       + (PlotMovement.ready() ? '.' : ', and the batch report has not loaded (reload the page).');
}

/* ── TOTAL WORKDONE ────────────────────────────────────────────────────────

   The whole of a job's capacity for this nursery and month, priced at its
   rate. It sits in the header, under the rate, exactly where the office's own
   claim form has it.

   It is NOT the Grand Total below. That adds up the workers' columns, which
   are shares of the rows somebody was ticked on. This adds up the WORK — a
   plot nobody was ticked on, a record whose crew was left empty, a name the
   register does not know — and prices all of it. The two agreeing means
   every hour of work found a worker to pay. The two differing is the thing
   worth seeing: the difference is work being done and nobody being paid for
   it, which otherwise only shows up as a line of red text under the table
   that is easy to read past.

   Shown to the cent both ways, so the gap can be read off rather than
   worked out. */
function workdoneCell(cap, rate, claimed) {
  const span = 'colspan="2" style="font-weight:700;font-size:11px;"';
  if (rate == null) {
    return `<th ${span} title="No piece rate for this job, so its work cannot be priced."
             >Total Workdone (RM) : &mdash;</th>`;
  }
  const total = Math.round(cap2(cap) * Math.round(rate * 100000) / 1000) / 100;
  const short = Math.round((total - (claimed || 0)) * 100) / 100;
  /* A claim that pays MORE than the work is an adjustment somebody typed in
     on purpose, so it is not called a shortfall — but it is still a
     difference, and a difference between two totals on one form has to be
     accounted for or somebody will spend the afternoon on it. */
  const gap = Math.abs(short) < 0.005 ? '' :
    `<span style="color:var(--danger,#c0392b);font-weight:800;"> &middot; ${
      short > 0 ? money(short) + ' not claimed' : money(-short) + ' over'}</span>`;
  return `<th ${span} title="${esc(capFmt(cap2(cap)))} at ${esc(rateTxt(rate))}"
           >Total Workdone (RM) : ${money(total)}${gap}</th>`;
}

function renderMaint() {
  const n = $('maint-nursery').value;
  const ym = monthValue();
  const monthTxt = maintMonthLabel(ym);               // "Apr 2026"
  const wk = maintWorkerNames(n, ym);
  const rateOf = c => (maint.rates[n] || {})[c];
  const per = maintTotals(n, monthTxt, ym);

  // The two things a claim form has to say about itself, and no preamble.
  $('maint-sub').textContent = `${NURSERY_FULL[n] || n} · ${monthTxt}`;
  // The nursery picker changes which claim is being asked about.
  try { renderVerifyBar('maint'); } catch (_) {}

  if (!wk.length) {
    $('maint-table').innerHTML = `<tbody><tr><td class="empty">
      No general worker for ${esc(NURSERY_FULL[n] || n)} on the Worker System register.
      Add them under Worker System and they appear on the Work Maintenance sheet too.
    </td></tr></tbody>`;
    $('maint-note').textContent = '';
    return;
  }

  // Money from the capacity AS SHOWN, so the printed row multiplies out.
  const capOf = (w, c) => cap2(per[w] ? per[w][c] : 0);
  const rmOf  = (w, c) => {
    const r = rateOf(c);
    if (r == null) return 0;
    return Math.round(capOf(w, c) * Math.round(r * 100000) / 1000) / 100;
  };
  /* What the cell PAYS — the worked-out figure, or the one somebody typed
     over it. Every total on this sheet is built from payOf rather than rmOf,
     so an adjusted cell carries through to the row, the column and the grand
     total. A sheet whose parts were adjusted and whose total was not is the
     one thing worse than no adjustment at all. The adjustment is filed under
     the NURSERY, which is what this sheet is scoped by and what the Monthly
     Payroll re-reads it under. */
  const payOf  = (w, c) => { const a = adjOf('maint', n, w, c); return a ? Number(a.amount || 0) : rmOf(w, c); };
  const earned = w => MAINT_TYPES.reduce((s, t) => s + payOf(w, t.code), 0);

  const capSum = c => wk.reduce((s, w) => s + capOf(w, c), 0);
  const rmSum  = c => wk.reduce((s, w) => s + payOf(w, c), 0);
  const grand  = wk.reduce((s, w) => s + earned(w), 0);
  /* The whole job's capacity off the Worker Record — every work record for
     this job in this nursery, ticked or not. maintTotals counts it while it
     is already walking those records. */
  const capAll = c => ((maint.why || {})[c] || {}).capAll || 0;

  /* The office's own claim form, four header rows: the work, the rate it
     pays, what the whole of it comes to, then Capacity and Total under it.
     The rate sits INSIDE the work's column group rather than on a row of its
     own across the sheet, which is what makes it read as "P & D Spraying, at
     RM 0.01 a bag" instead of as a fourth kind of row. */
  const head = `
    <thead>
      <tr>
        <th rowspan="4" style="width:44px;">No.</th>
        <th rowspan="4" class="l">Worker</th>
        ${MAINT_TYPES.map(t => `<th colspan="2">${esc(t.label)}</th>`).join('')}
        <th rowspan="4" style="width:120px;">Subtotal (RM)</th>
      </tr>
      <tr>${MAINT_TYPES.map(t =>
        `<th colspan="2" style="font-weight:600;font-size:12px;">${maintRateTxt(t, rateOf(t.code))}</th>`).join('')}</tr>
      <tr>${MAINT_TYPES.map(t =>
        workdoneCell(capAll(t.code), rateOf(t.code), rmSum(t.code))).join('')}</tr>
      <tr>${MAINT_TYPES.map(() =>
        `<th style="width:90px;">Capacity</th><th style="width:110px;">Total (RM)</th>`).join('')}</tr>
    </thead>`;

  const body = wk.map((w, i) => `
    <tr>
      <td style="color:var(--text-faint);">${i + 1}</td>
      <td class="l" style="font-weight:700;color:var(--text-head);">${esc(w)}</td>
      ${MAINT_TYPES.map(t => {
        const c = capOf(w, t.code);
        return `<td>${capFmt(c)}</td>` + earnedCell('maint', 'maint', n, w, t.code, t.label,
                                                    c ? rmOf(w, t.code) : 0);
      }).join('')}
      <td class="money">${money(earned(w))}</td>
    </tr>`).join('');

  const foot = `
    <tfoot><tr>
      <td colspan="2">Grand Total</td>
      ${MAINT_TYPES.map(t => `<td>${capFmt(capSum(t.code))}</td><td>${money(rmSum(t.code))}</td>`).join('')}
      <td>${money(grand)}</td>
    </tr></tfoot>`;

  $('maint-table').innerHTML = head + `<tbody>${body}</tbody>` + foot;

  /* ONLY WHAT IS WRONG.
     This used to carry a paragraph explaining where the names and the capacity
     are read from. True, and nobody holding a claim form needs it — it is the
     module's own workings, and printing it under every sheet buried the notes
     that matter in the middle of an essay. What is left is the short list of
     things that would make this claim SHORT, because a claim missing work
     looks exactly like a quiet month. Nothing wrong, nothing printed. */
  const notes = [];
  /* Why any column came to nothing, first — it is the question somebody is
     holding the sheet to ask. */
  /* Grouped by reason. A month where nobody has opened the Worker Record yet
     has the same thing wrong with all four columns, and saying it four times
     over reads as four separate problems. */
  const whyGroups = new Map();
  MAINT_TYPES.forEach(t => {
    const w = maintWhyEmpty(t.code);
    if (!w) return;
    if (!whyGroups.has(w)) whyGroups.set(w, []);
    whyGroups.get(w).push(t.label);
  });
  whyGroups.forEach((labels, why) => notes.push(joinAnd(labels) + ': ' + why));
  /* Work priced straight from the field. Said out loud because it is the one
     figure on this sheet that nobody has been asked to confirm: the office's
     Worker Record has no tick saved against those rows, and what is being paid
     is the worker's own record of their morning, verified in the field. */
  if (maint.fromField) {
    notes.push(`${maint.fromField} row${maint.fromField === 1 ? '' : 's'} priced from the field’s own `
             + 'record, with no tick against them on the Worker Record.');
  }
  /* A name ticked on the Worker Record with no row here loses that worker's
     share of the plot, and the row still looks complete on both screens. */
  const stray = [...new Set(
    MAINT_TYPES.flatMap(t => [...(((maint.why || {})[t.code] || {}).stray || [])])
      .concat(maint.fieldUnmatched || []))];
  if (stray.length) {
    notes.push(`Credited for work but with no row here, so their share is not priced: `
             + `${stray.join(', ')}. File them under this nursery in Worker System as a general worker.`);
  }
  if (!PlotMovement.ready()) {
    notes.push('The batch report has not loaded, so any work record with no quantity keyed on it '
             + 'reads as nothing. Reload the page.');
  }
  const missing = MAINT_TYPES.filter(t => rateOf(t.code) == null).map(t => t.label);
  if (missing.length) {
    notes.push(`No piece rate set for ${missing.join(', ')} — set it under `
             + 'Nursery Operation → Work Maintenance → Setting → Piece Rate.');
  }
  if (!maint.linked[n]) {
    notes.push(`No general worker is filed under ${NURSERY_FULL[n] || n} in Worker System, so this is `
             + 'Work Maintenance\u2019s own older list.');
  }
  if ((maint.orphanPlots || []).length) {
    notes.push(`${maint.orphanPlots.length} plot${maint.orphanPlots.length === 1 ? '' : 's'} `
             + `on the work records belong to no nursery and are not priced anywhere: `
             + `${maint.orphanPlots.slice(0, 8).join(', ')}`
             + `${maint.orphanPlots.length > 8 ? ', …' : ''}. `
             + 'Add the row to its schedule in Work Maintenance.');
  }
  const gone = (maint.rows[n] || []).filter(w => w.active !== false ? false
    : (w.last_day && String(w.last_day).slice(0, 10) >= `${ym}-01`));
  if (gone.length) {
    notes.push(`On this month because they were still here: `
             + gone.map(w => `${w.full_name} (last day ${String(w.last_day).slice(0, 10)})`).join(', ') + '.');
  }
  $('maint-note').textContent = notes.join(' ');
}

/* ════════════ WHEN A PAYROLL MONTH STOPS BEING EDITABLE ════════════

   Two ways, and they answer different questions.

   VERIFICATION is per sheet. Somebody with the Verify tick on that sheet says
   "this one is checked and right", and it locks the moment they do, with
   their name and the time against it. It is the normal way a month closes:
   sheet by sheet, by the person who checked it.

   THE MONTH LOCK is the whole module at once, on the calendar under System
   Setting. It auto-locks on the Nth of the following month and can be forced
   either way by somebody with Lock Controls — the backstop, and the only
   thing that can re-open a month whose sheets have been verified.

   The rules themselves are in shared/shared_npayroll_lock.js. What is here is
   what the screens do with them: which sheet a tab is, whose permission is
   asked, and how a shut sheet says so.
   ════════════════════════════════════════════════════════════════════════ */

/* A payroll sub-tab, and the thing it is showing. Work Maintenance is
   verified one NURSERY at a time — a claim checked for BNN says nothing about
   UNN 1 — and the three keyed sheets one SECTION at a time, which is the
   picker each of them already carries. Monthly Payroll has a section picker
   too, but it is a roll-up of the other sheets rather than a sheet of its
   own, so it is verified whole. */
const LOCK_SHEETS = {
  maint:    { label: 'Work Maintenance',     scope: () => $('maint-nursery').value || '' },
  transpl:  { label: 'Transplanting',        scope: () => $('transpl-section').value || '' },
  seedling: { label: 'Seedlings Collection', scope: () => $('seedling-section').value || '' },
  other:    { label: 'Others',               scope: () => $('other-section').value || '' },
  monthly:  { label: 'Monthly Payroll',      scope: () => '' }
};
const lockScope = (sheet) => (LOCK_SHEETS[sheet] ? LOCK_SHEETS[sheet].scope() : '');
/* What the picker is currently showing, in words. Left on "All sections" it
   is every section of that sheet — which is what verifying then closes, so
   the strip has to say so rather than name nothing. */
function scopeLabel(sheet, scope) {
  /* NO_SECTION is a circle, not a nursery, so it has no register name to
     fall back on — without this the strip reads "__none". */
  if (scope === NO_SECTION) return 'work with no section';
  if (scope) return NURSERY_FULL[scope] || scope;
  if (sheet === 'monthly') return 'the whole month';
  if (sheet === 'maint')   return 'every nursery';
  return 'all sections';
}

/* Is the sheet on screen shut, and why. Everything that writes asks this. */
function sheetLocked(sheet) {
  if (typeof MJMPayrollLock === 'undefined') return false;
  return MJMPayrollLock.isSheetLocked(monthValue(), sheet, lockScope(sheet));
}
function sheetLockReason(sheet) {
  if (typeof MJMPayrollLock === 'undefined') return null;
  return MJMPayrollLock.lockReason(monthValue(), sheet, lockScope(sheet));
}

/* Refuse a write, saying which of the two is holding it — a message that only
   says "locked" leaves somebody hunting for a switch that may not be the one
   in their way. */
function lockAllows(sheet) {
  const why = sheetLockReason(sheet);
  if (!why) return true;
  const m = monthLabel(monthValue());
  alert(why.kind === 'month'
    ? `${m} is locked, so nothing on any payroll sheet for that month can be changed.\n\n`
      + 'Somebody with Lock Controls can re-open it under System Setting.'
    : `${LOCK_SHEETS[sheet].label} for ${scopeLabel(sheet, lockScope(sheet))} was verified by `
      + `${why.by || 'somebody'} on ${fmtStamp(why.at)}, so it is closed.\n\n`
      + 'Re-opening the month under System Setting takes that verification back.');
  return false;
}

function fmtStamp(t) {
  if (!t) return '—';
  const d = new Date(t);
  if (isNaN(d)) return String(t).slice(0, 10);
  return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
       + ', ' + d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
}

/* ── The strip above each sheet ──────────────────────────────────────────
   Drawn on every render, because the month picker and the nursery/section
   picker both change what it is answering about. */
function renderVerifyBar(sheet) {
  const el = $('vb-' + sheet);
  if (!el) return;
  if (typeof MJMPayrollLock === 'undefined' || !MJMPayrollLock.ready()) { el.className = 'verify-bar'; el.innerHTML = ''; return; }
  const ym    = monthValue();
  const scope = lockScope(sheet);
  const why   = sheetLockReason(sheet);
  const mayVerify = may(sheet, 'verify');
  const what  = `${LOCK_SHEETS[sheet].label} · ${scopeLabel(sheet, scope)} · ${monthLabel(ym)}`;

  if (why && why.kind === 'month') {
    el.className = 'verify-bar verify-locked';
    el.innerHTML = `<span>🔒 ${esc(monthLabel(ym))} is locked — every payroll sheet for this month is closed.</span>`
                 + `<span class="vb-spacer"></span>`
                 + `<span>Re-open it under System Setting.</span>`;
    return;
  }
  if (why) {
    el.className = 'verify-bar verify-done';
    el.innerHTML = `<span>✔ Verified — ${esc(what)}</span>`
                 + `<span class="vb-spacer"></span>`
                 + `<span class="vb-who">${esc(why.by || 'somebody')}</span>`
                 + `<span>${esc(fmtStamp(why.at))}</span>`;
    return;
  }
  el.className = 'verify-bar verify-open';
  el.innerHTML = `<span>Open — ${esc(what)}</span>`
               + `<span class="vb-spacer"></span>`
               + (mayVerify
                   ? `<button class="btn btn-primary btn-sm" onclick="verifySheet('${sheet}')">✔ Verify &amp; lock</button>`
                   : `<span>Verifying needs the Verify tick on this sheet in User Access.</span>`);
}

/* Verifying is the act that closes a sheet, so it asks plainly first: it
   cannot be taken back from this screen, only by re-opening the month. */
async function verifySheet(sheet) {
  if (!mayDo(sheet, 'verify',
      'You do not have permission to verify this sheet. Ask an admin to grant it in User Access.')) return;
  if (!MJMPayrollLock.ready()) {
    alert('Lock Controls are not set up yet — run shared/RUN_ME_npayroll_locks.sql first.');
    return;
  }
  const ym = monthValue(), scope = lockScope(sheet);
  if (!confirm(`Verify ${LOCK_SHEETS[sheet].label} for ${scopeLabel(sheet, scope)}, ${monthLabel(ym)}?\n\n`
             + 'It locks straight away and cannot be changed after this. Only somebody with Lock '
             + 'Controls can re-open the month.')) return;
  const error = await MJMPayrollLock.verify(_supabase, ym, sheet, scope, userEmail || null);
  if (error) { alert('Could not verify: ' + error.message); return; }
  refreshPayrollTab();
  if (typeof renderLockCalendar === 'function' && $('tab-locks')) renderLockCalendar();
}

/* ── Lock Controls ──────────────────────────────────────────────────── */

const LOCK_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
let _lockYear = new Date().getFullYear();

function initLockControls() {
  const y = $('lk-year');
  if (!y) return;
  const now = new Date().getFullYear();
  const years = [];
  for (let i = now - 5; i <= now + 1; i++) years.push(i);
  y.innerHTML = years.map(v => `<option value="${v}">${v}</option>`).join('');
  y.value = String(_lockYear);
  const setup = $('lock-setup');
  if (setup) setup.classList.toggle('hidden', MJMPayrollLock.ready());
  $('lk-day').value = MJMPayrollLock.currentLockDay();
  renderLockCalendar();
}

function renderLockCalendar() {
  const box = $('lk-months');
  if (!box) return;
  _lockYear = Number($('lk-year').value) || _lockYear;
  const mayLock = may('locks', 'manage');
  const ready = MJMPayrollLock.ready();

  box.innerHTML = LOCK_MONTHS.map((name, i) => {
    const month  = i + 1;
    const locked = ready && MJMPayrollLock.isMonthLocked(_lockYear, month);
    const row    = MJMPayrollLock.lockRow(_lockYear, month);
    const manual = !!(row && row.manual_override !== null && row.manual_override !== undefined);
    const when   = MJMPayrollLock.autoLockDateFor(_lockYear, month);
    const ym     = `${_lockYear}-${String(month).padStart(2, '0')}`;
    const nVer   = MJMPayrollLock.verificationsFor(ym).length;
    return `<button type="button" class="lock-month ${locked ? 'lock-shut' : 'lock-open'}"
              ${mayLock && ready ? '' : 'disabled'}
              onclick="toggleLockMonth(${month})"
              title="${locked ? 'Locked' : 'Open'}${manual ? ' by hand' : ' by the calendar'}${
                nVer ? ` · ${nVer} sheet${nVer === 1 ? '' : 's'} verified` : ''}">
              <span class="lm-icon">${locked ? '🔒' : '🔓'}</span>
              <span class="lm-name">${name}</span>
              <span class="lm-how">${manual ? 'By hand' : 'Auto'}</span>
              <span class="lm-date">${when.toISOString().slice(0, 10)}</span>
              ${nVer ? `<span class="lm-date">${nVer} verified</span>` : ''}
            </button>`;
  }).join('');

  const allOpen = LOCK_MONTHS.every((_, i) => !MJMPayrollLock.isMonthLocked(_lockYear, i + 1));
  const t = $('lk-toggle-all');
  t.textContent = allOpen ? `🔒 Lock all ${_lockYear}` : `🔓 Unlock all ${_lockYear}`;
  t.disabled = !mayLock || !ready;
  $('lk-day').disabled = !mayLock || !ready;
  $('lk-day-save').disabled = !mayLock || !ready;

  $('lk-note').textContent = !ready
    ? 'Lock Controls are not set up yet — nothing locks and nothing can be verified.'
    : mayLock
      ? 'Re-opening a month also takes back every verification on it, so the sheets go back to '
      + 'being editable and whoever checked them has to check them again.'
      : 'You can see this calendar, but changing it needs Lock Controls in User Access.';
}

/* Forcing one month either way. Re-opening takes its verifications with it:
   leaving them would put a sheet back on screen as editable while still
   showing somebody's name against it as checked, which is the worst of both. */
async function toggleLockMonth(month) {
  if (!mayDo('locks', 'manage',
      'You do not have permission to change the lock calendar. Ask an admin to grant it in User Access.')) return;
  const locked = MJMPayrollLock.isMonthLocked(_lockYear, month);
  const ym = `${_lockYear}-${String(month).padStart(2, '0')}`;
  const vers = MJMPayrollLock.verificationsFor(ym);
  if (locked) {
    if (!confirm(`Re-open ${LOCK_MONTHS[month - 1]} ${_lockYear} for editing?`
      + (vers.length
          ? `\n\nThis also takes back ${vers.length} verification${vers.length === 1 ? '' : 's'} on that `
            + 'month. Those sheets become editable again and have to be checked again.'
          : ''))) return;
  } else if (!confirm(`Lock ${LOCK_MONTHS[month - 1]} ${_lockYear}?\n\n`
                    + 'Every payroll sheet for that month stops being editable.')) return;

  const error = await MJMPayrollLock.setManualOverride(_supabase, _lockYear, month, !locked, userEmail || null);
  if (error) { alert('Could not change the lock: ' + error.message); return; }
  if (locked) {
    for (const v of vers) {
      const e = await MJMPayrollLock.unverify(_supabase, v.month, v.sheet, v.scope);
      if (e) { alert('Re-opened, but a verification could not be taken back: ' + e.message); break; }
    }
  }
  renderLockCalendar();
  refreshPayrollTab();
}

/* "Lock all" does NOT force twelve months shut — that would freeze months
   whose own auto-lock date has not arrived. It clears the overrides back to
   the computed default, which already means "locked if its date has passed".
   Same reasoning as the Delivery Order calendar's own button. */
async function toggleLockYear() {
  if (!mayDo('locks', 'manage',
      'You do not have permission to change the lock calendar. Ask an admin to grant it in User Access.')) return;
  const allOpen = LOCK_MONTHS.every((_, i) => !MJMPayrollLock.isMonthLocked(_lockYear, i + 1));
  if (!confirm(allOpen
      ? `Lock ${_lockYear} back to the calendar?\n\nEvery month whose lock day has passed closes; the rest stay open.`
      : `Unlock every month of ${_lockYear}?\n\nVerifications are kept — a verified sheet stays closed until its own month is re-opened.`)) return;
  const error = allOpen
    ? await MJMPayrollLock.clearManualOverrideForYear(_supabase, _lockYear, userEmail || null)
    : await MJMPayrollLock.setManualOverrideForYear(_supabase, _lockYear, false, userEmail || null);
  if (error) { alert('Could not change the year: ' + error.message); return; }
  renderLockCalendar();
  refreshPayrollTab();
}

async function saveLockDay() {
  if (!mayDo('locks', 'manage',
      'You do not have permission to change the lock day. Ask an admin to grant it in User Access.')) return;
  const day = parseInt($('lk-day').value, 10);
  if (!(day >= 1 && day <= 28)) { alert('Pick a day between 1 and 28.'); return; }
  const error = await MJMPayrollLock.setLockDay(_supabase, day, userEmail || null);
  if (error) { alert('Could not save the lock day: ' + error.message); return; }
  renderLockCalendar();
}

/* ════════════ MONTHLY PAYROLL ════════════ */
function monthlyRows() {
  const secFilter = $('monthly-section').value || '';
  const month = monthValue();
  const monthTxt = maintMonthLabel(month);

  // Start from the payroll's own worker list.
  const rows = new Map();      // key → { name, section, maint, transpl, seedling, other }
  const keyFor = (name, section) => `${section}${name.toLowerCase()}`;
  const touch = (name, section) => {
    const k = keyFor(name, section);
    if (!rows.has(k)) rows.set(k, { name, section, maint: 0, transpl: 0, seedling: 0, other: 0 });
    return rows.get(k);
  };

  workers.filter(w => w.active !== false && (!secFilter || (w.section || '') === secFilter))
         .forEach(w => touch(w.full_name, w.section || ''));

  // Work Maintenance — matched by name against the maintenance module's list.
  //
  // That module keeps its own per-nursery worker lists, which need not agree
  // with the section a worker is filed under here. The Worker System is the
  // register of record, so resolve the name to it and use ITS section; without
  // that the same person shows up twice, once per filing.
  const byName = new Map();
  workers.forEach(w => { if (w.full_name) byName.set(w.full_name.trim().toLowerCase(), w); });

  ['PN','BNN','UNN1','UNN2'].forEach(n => {
    const wk = maintWorkerNames(n, month);
    if (!wk.length) return;
    const per = maintTotals(n, monthTxt, month);
    const rateOf = c => (maint.rates[n] || {})[c];
    wk.forEach(w => {
      const known = byName.get(String(w).trim().toLowerCase());
      const section = known ? (known.section || '') : n;
      if (secFilter && section !== secFilter) return;
      /* Adjusted where somebody adjusted it — the claim has to pay what the
         Work Maintenance sheet shows, not what it worked out. Filed under the
         nursery, which is how that sheet is scoped. */
      const amt = earnedAfterAdj('maint', n, w, MAINT_TYPES.map(t => t.code), code => {
        const r = rateOf(code);
        if (r == null) return 0;
        const cap = cap2(per[w] ? per[w][code] : 0);
        return Math.round(cap * Math.round(r * 100000) / 1000) / 100;
      });
      if (amt) touch(known ? known.full_name : w, section).maint += amt;
    });
  });

  /* The FC Portal's transplanting, priced the same way the sheet above
     prices it. A name the register does not know is skipped and said out
     loud on the sheet — the claim pays a worker row, and there is no row to
     pay. */
  /* Gathered per worker per job before it is priced, the way the
     Transplanting sheet does it: capacity to two places first, THEN the rate.
     Priced line by line the shares of one plot round separately and the claim
     comes to a few sen away from the sheet it is read against. */
  {
    const tl = transplantFieldLines().filter(l => l.known);
    const rateOfKey = key => {
      const hit = tl.find(x => x.key === key && x.rate != null);
      return hit ? hit.rate : null;
    };
    const who = new Map();          // full_name -> { section, caps: {key: qty} }
    tl.forEach(l => {
      const name = l.known.full_name;
      if (!who.has(name)) who.set(name, { section: l.known.section || '', caps: {} });
      const e = who.get(name);
      e.caps[l.key] = (e.caps[l.key] || 0) + Number(l.qty || 0);
    });
    who.forEach((e, name) => {
      if (secFilter && e.section !== secFilter) return;
      const amt = earnedAfterAdj('transplanting', e.section, name,
        Object.keys(e.caps), key => {
          const r = rateOfKey(key);
          if (r == null) return 0;
          return Math.round(cap2(e.caps[key]) * Math.round(r * 100000) / 1000) / 100;
        });
      if (amt) touch(name, e.section).transpl += amt;
    });
  }

  // Keyed sheets.
  entries.filter(e => e.month === month).forEach(e => {
    const w = workers.find(x => x.id === e.worker_id);
    if (!w) return;
    if (secFilter && (w.section || '') !== secFilter) return;
    const row = touch(w.full_name, w.section || '');
    if (e.category === 'transplanting') row.transpl  += Number(e.amount || 0);
    if (e.category === 'seedlings')     row.seedling += Number(e.amount || 0);
    /* Counted like any other sheet. Leaving it out of the total would be the
       worst kind of wrong: the Others sheet would show the work priced and the
       month's pay would quietly not include it. */
    if (e.category === 'other')         row.other    += Number(e.amount || 0);
  });

  return [...rows.values()]
    .map(r => ({ ...r, total: r.maint + r.transpl + r.seedling + r.other }))
    .filter(r => r.total > 0 || !secFilter)
    .sort((a, b) => (a.section || '').localeCompare(b.section || '') || a.name.localeCompare(b.name));
}

function renderMonthly() {
  try { renderVerifyBar('monthly'); } catch (_) {}
  const list = monthlyRows();
  const rows = list.length ? list.map((r, i) => `
    <tr>
      <td style="color:var(--text-faint);width:44px;">${i + 1}</td>
      <td class="l" style="font-weight:700;color:var(--text-head);">${esc(r.name)}</td>
      <td>${esc(r.section || '—')}</td>
      <td>${r.maint    ? money(r.maint)    : '—'}</td>
      <td>${r.transpl  ? money(r.transpl)  : '—'}</td>
      <td>${r.seedling ? money(r.seedling) : '—'}</td>
      <td>${r.other    ? money(r.other)    : '—'}</td>
      <td class="money">${money(r.total)}</td>
    </tr>`).join('')
    : `<tr><td colspan="8" class="empty">Nothing earned in ${esc(monthLabel(monthValue()))} yet.</td></tr>`;

  const sum = k => list.reduce((s, r) => s + r[k], 0);
  $('monthly-table').innerHTML = `
    <thead><tr>
      <th style="width:44px;">No.</th><th class="l">Worker</th><th style="width:90px;">Section</th>
      <th style="width:140px;">Work Maintenance</th><th style="width:130px;">Transplanting</th>
      <th style="width:150px;">Seedlings Collection</th><th style="width:110px;">Others</th>
      <th style="width:130px;">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    ${list.length ? `<tfoot><tr><td class="l" colspan="3">GRAND TOTAL — ${esc(monthLabel(monthValue()))}</td>
      <td>${money(sum('maint'))}</td><td>${money(sum('transpl'))}</td>
      <td>${money(sum('seedling'))}</td><td>${money(sum('other'))}</td>
      <td>${money(sum('total'))}</td></tr></tfoot>` : ''}`;

  $('monthly-note').textContent =
    'Work Maintenance is read from the Nursery Operation module and matched to a worker by name; Transplanting, Seedlings Collection and Others come from the sheets keyed here.';
}

/* ════════════ PDF ════════════ */
function pdfDoc() {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
}
/* Shared cell drawer — centred both ways, shrunk to fit, never wrapping a number. */
function pdfCell(doc, x, y, w, h, text, o) {
  o = Object.assign({ bold: false, size: 9, fill: null, nowrap: false }, o || {});
  if (o.fill) { doc.setFillColor(o.fill[0], o.fill[1], o.fill[2]); doc.rect(x, y, w, h, 'F'); }
  doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.2); doc.rect(x, y, w, h);
  const str = String(text ?? ''); if (!str) return;
  doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setTextColor(0, 0, 0);
  let size = o.size, lines;
  if (o.nowrap) {
    for (;;) { doc.setFontSize(size); if (doc.getTextWidth(str) <= w - 1.6 || size <= 4) break; size -= 0.25; }
    lines = [str];
  } else {
    for (;;) {
      doc.setFontSize(size); lines = doc.splitTextToSize(str, w - 3);
      if (lines.length * size * 0.3528 * 1.15 <= h - 1.5 || size <= 5) break;
      size -= 0.4;
    }
  }
  doc.setFontSize(size);
  const lh = size * 0.3528 * 1.15;
  let ty = y + (h - lines.length * lh) / 2 + lh * 0.78;
  lines.forEach(l => { doc.text(l, x + w / 2, ty, { align: 'center' }); ty += lh; });
}
function pdfTitle(doc, lines) {
  let y = 25;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('MEGA JUTAMAS SDN BHD', 105, y + 5, { align: 'center' });
  doc.setFontSize(12); doc.text(lines[0], 105, y + 12, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(lines[1], 105, y + 19, { align: 'center' });
  doc.text(lines[2], 105, y + 25.5, { align: 'center' });
  doc.setDrawColor(79, 70, 229); doc.setLineWidth(0.6);
  doc.line(25, y + 29, 185, y + 29); doc.setLineWidth(0.2);
  return y + 34;
}
function pdfFooterNote(doc, y) {
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(110, 110, 110);
  doc.text('This salary claim form is automatically generated by the MJM Nursery AI system.', 105, y + 12, { align: 'center' });
}

function downloadMaintPDF() {
  if (!mayDo('maint', 'export',
      'You do not have permission to download the salary claim form.')) return;
  const n = $('maint-nursery').value, month = monthValue(), monthTxt = maintMonthLabel(month);
  const wk = maintWorkerNames(n, month);
  if (!wk.length) { alert('No worker on the Work Maintenance list for this nursery.'); return; }
  const rateOf = c => (maint.rates[n] || {})[c];
  const per = maintTotals(n, monthTxt, month);
  const capOf = (w, c) => cap2(per[w] ? per[w][c] : 0);
  const rmOf  = (w, c) => { const r = rateOf(c); return r == null ? 0 : Math.round(capOf(w, c) * Math.round(r * 100000) / 1000) / 100; };
  /* The printed claim is what gets signed and paid, so it prints the ADJUSTED
     figure — the same one the screen shows. A PDF that disagreed with the
     screen would be found out at the counter. */
  const payOf  = (w, c) => { const a = adjOf('maint', n, w, c); return a ? Number(a.amount || 0) : rmOf(w, c); };
  const earned = w => MAINT_TYPES.reduce((s, t) => s + payOf(w, t.code), 0);

  const doc = pdfDoc();
  const COL = [7, 30, 11, 15, 11, 15, 11, 15, 11, 15, 19];
  const X = []; COL.reduce((x, w, i) => { X[i] = x; return x + w; }, 25);
  const PAIR = i => 2 + i * 2, I_TOTAL = COL.length - 1;
  const HF = [232, 236, 252], TF = [222, 228, 250];

  /* The printed form, laid out like the screen: the work, the rate it pays,
     then Capacity and Total under it. The rate is INSIDE the work's column
     group, not on a band of its own across the sheet — the same three rows
     the office's own claim form has. */
  /* The whole job's capacity off the Worker Record, priced — the same figure
     the screen puts under the rate, so the printed form and the screen agree
     on what the work came to as well as on what is being claimed. */
  const workdoneTxt = t => {
    const r = rateOf(t.code);
    if (r == null) return 'Total Workdone (RM) : —';
    const cap = ((maint.why || {})[t.code] || {}).capAll || 0;
    return 'Total Workdone (RM) : RM '
         + (Math.round(cap2(cap) * Math.round(r * 100000) / 1000) / 100).toFixed(2);
  };

  const drawHead = () => {
    let y = pdfTitle(doc, ['SALARY CLAIM FORM — WORK MAINTENANCE', `${NURSERY_FULL[n] || n} (${n})`, `Month ${monthTxt}`]);
    const H1 = 9, H2 = 7, HW = 7, H3 = 7, HT = H1 + H2 + HW + H3;
    pdfCell(doc, X[0], y, COL[0], HT, 'No.', { bold: true, size: 8, nowrap: true, fill: HF });
    pdfCell(doc, X[1], y, COL[1], HT, 'Worker', { bold: true, size: 8.5, fill: HF });
    MAINT_TYPES.forEach((t, i) => {
      const c = PAIR(i);
      pdfCell(doc, X[c], y, COL[c] + COL[c+1], H1, t.label, { bold: true, size: 7.5, fill: HF });
      pdfCell(doc, X[c], y + H1, COL[c] + COL[c+1], H2, maintRateTxt(t, rateOf(t.code)),
              { size: 7, nowrap: true, fill: HF });
      pdfCell(doc, X[c], y + H1 + H2, COL[c] + COL[c+1], HW, workdoneTxt(t),
              { bold: true, size: 6.5, nowrap: true, fill: HF });
      pdfCell(doc, X[c],   y + H1 + H2 + HW, COL[c],   H3, 'Capacity',  { bold: true, size: 6.5, nowrap: true, fill: HF });
      pdfCell(doc, X[c+1], y + H1 + H2 + HW, COL[c+1], H3, 'Total (RM)', { bold: true, size: 6.5, nowrap: true, fill: HF });
    });
    pdfCell(doc, X[I_TOTAL], y, COL[I_TOTAL], HT, 'Subtotal (RM)', { bold: true, size: 7.5, fill: HF });
    return y + HT;
  };

  let y = drawHead();
  const RH = 9;
  wk.forEach((w, i) => {
    if (y + RH > 297 - 25 - 40) { doc.addPage(); y = drawHead(); }
    const z = i % 2 ? [250, 250, 253] : null;
    pdfCell(doc, X[0], y, COL[0], RH, String(i + 1), { size: 8, nowrap: true, fill: z });
    pdfCell(doc, X[1], y, COL[1], RH, w, { size: 8.5, fill: z });
    MAINT_TYPES.forEach((t, k) => {
      const c = PAIR(k), cap = capOf(w, t.code);
      pdfCell(doc, X[c],   y, COL[c],   RH, capFmt(cap), { size: 8, nowrap: true, fill: z });
      pdfCell(doc, X[c+1], y, COL[c+1], RH, (cap || adjOf('maint', n, w, t.code))
              ? 'RM ' + payOf(w, t.code).toFixed(2) : '—', { size: 7.5, nowrap: true, fill: z });
    });
    pdfCell(doc, X[I_TOTAL], y, COL[I_TOTAL], RH, 'RM ' + earned(w).toFixed(2), { bold: true, size: 8.5, nowrap: true, fill: z });
    y += RH;
  });

  pdfCell(doc, X[0], y, COL[0] + COL[1], RH + 1, 'Grand Total', { bold: true, size: 8.5, fill: TF });
  MAINT_TYPES.forEach((t, k) => {
    const c = PAIR(k);
    const cs = wk.reduce((s, w) => s + capOf(w, t.code), 0);
    const rs = wk.reduce((s, w) => s + payOf(w, t.code), 0);
    pdfCell(doc, X[c],   y, COL[c],   RH + 1, capFmt(cs), { bold: true, size: 8, nowrap: true, fill: TF });
    pdfCell(doc, X[c+1], y, COL[c+1], RH + 1, 'RM ' + rs.toFixed(2), { bold: true, size: 7.5, nowrap: true, fill: TF });
  });
  pdfCell(doc, X[I_TOTAL], y, COL[I_TOTAL], RH + 1, 'RM ' + wk.reduce((s, w) => s + earned(w), 0).toFixed(2),
          { bold: true, size: 9, nowrap: true, fill: TF });
  y += RH + 1;
  pdfFooterNote(doc, y);
  doc.save(`Salary_Claim_Work_Maintenance_${n}_${monthTxt.replace(/\s+/g, '_')}.pdf`);
}

/* The Transplanting claim, on paper.

   Deliberately the same form as Work Maintenance's above — same title block,
   same three header rows (the job, the rate it pays, then Capacity and Total
   under it), same Grand Total, same footer. One office signs both, and a
   second layout for the same question is a form somebody has to learn twice.

   It prints what the SCREEN shows, adjustments included, for the reason
   downloadMaintPDF gives: a PDF that disagreed with the screen would be
   found out at the counter.

   Only workers the register knows are printed. A name the FC typed that
   matches nobody cannot be paid — the screen says so in red above the
   table — and a claim form that carried it would be a claim form for a
   person the payroll has no row for. */
function downloadTransplantPDF() {
  if (!mayDo('transpl', 'export',
      'You do not have permission to download the salary claim form.')) return;
  const sec = $('transpl-section').value || '';
  const monthTxt = monthLabel(monthValue());
  const secTxt = sec === NO_SECTION ? 'No section'
               : (NURSERY_FULL[sec] ? `${NURSERY_FULL[sec]} (${sec})` : (SECTION_NAME[sec] || sec));

  const lines = transplantFieldLines().filter(l => !sec || inSection(sec, l.section));
  const names = [...new Set(lines.filter(l => l.known).map(l => l.worker_name))]
    .sort((a, b) => a.localeCompare(b));
  if (!names.length) { alert('Nothing to claim for this nursery this month.'); return; }

  /* Same fallback the screen uses: a nursery can have records this form shows
     no line for, and Total Workdone still has to price them. */
  const rateRowOf = key => {
    const l = lines.find(x => x.key === key && x.rate != null);
    if (l) return { rate: l.rate, unit: l.unit || '' };
    const r = transplantRate({ work_type: key, jenis: (TRANSPLANT_JOB[key] || {}).jenis });
    return r ? { rate: Number(r.rate || 0), unit: r.unit || '' } : null;
  };
  const rateOf = key => { const r = rateRowOf(key); return r ? r.rate : null; };
  const rateTxtOf = key => {
    const r = rateRowOf(key);
    return r ? rateTxt(r.rate) + (r.unit ? ' / ' + r.unit : '') : '—';
  };
  const capOf = (n, key) => cap2(lines
    .filter(l => l.worker_name === n && l.key === key)
    .reduce((s, l) => s + Number(l.qty || 0), 0));
  const rmOf = (n, key) => {
    const r = rateOf(key);
    return r == null ? 0 : Math.round(capOf(n, key) * Math.round(r * 100000) / 1000) / 100;
  };
  const secOf = n => (lines.find(l => l.worker_name === n) || {}).section || '';
  const payOf = (n, key) => {
    const a = adjOf('transplanting', secOf(n), n, key);
    return a ? Number(a.amount || 0) : rmOf(n, key);
  };
  const earned = n => TRANSPLANT_JOBS.reduce((s, j) => s + payOf(n, j.key), 0);

  const doc = pdfDoc();
  const COL = [7, 30, 11, 15, 11, 15, 11, 15, 11, 15, 19];
  const X = []; COL.reduce((x, w, i) => { X[i] = x; return x + w; }, 25);
  const PAIR = i => 2 + i * 2, I_TOTAL = COL.length - 1;
  const HF = [232, 236, 252], TF = [222, 228, 250];

  /* The FC's own totals for this nursery, priced — the same figure the screen
     puts under the rate. */
  const workdone = transplantWorkdone(sec);
  const workdoneTxt = key => {
    const r = rateOf(key);
    if (r == null) return 'Total Workdone (RM) : —';
    return 'Total Workdone (RM) : RM '
         + (Math.round(cap2(workdone[key] || 0) * Math.round(r * 100000) / 1000) / 100).toFixed(2);
  };

  const drawHead = () => {
    let y = pdfTitle(doc, ['SALARY CLAIM FORM — TRANSPLANTING', secTxt, `Month ${monthTxt}`]);
    const H1 = 9, H2 = 7, HW = 7, H3 = 7, HT = H1 + H2 + HW + H3;
    pdfCell(doc, X[0], y, COL[0], HT, 'No.', { bold: true, size: 8, nowrap: true, fill: HF });
    pdfCell(doc, X[1], y, COL[1], HT, 'Worker', { bold: true, size: 8.5, fill: HF });
    TRANSPLANT_JOBS.forEach((j, i) => {
      const c = PAIR(i);
      pdfCell(doc, X[c], y, COL[c] + COL[c+1], H1, j.label, { bold: true, size: 7.5, fill: HF });
      pdfCell(doc, X[c], y + H1, COL[c] + COL[c+1], H2, rateTxtOf(j.key), { size: 7, nowrap: true, fill: HF });
      pdfCell(doc, X[c], y + H1 + H2, COL[c] + COL[c+1], HW, workdoneTxt(j.key),
              { bold: true, size: 6.5, nowrap: true, fill: HF });
      pdfCell(doc, X[c],   y + H1 + H2 + HW, COL[c],   H3, 'Capacity',   { bold: true, size: 6.5, nowrap: true, fill: HF });
      pdfCell(doc, X[c+1], y + H1 + H2 + HW, COL[c+1], H3, 'Total (RM)', { bold: true, size: 6.5, nowrap: true, fill: HF });
    });
    pdfCell(doc, X[I_TOTAL], y, COL[I_TOTAL], HT, 'Subtotal (RM)', { bold: true, size: 7.5, fill: HF });
    return y + HT;
  };

  let y = drawHead();
  const RH = 9;
  names.forEach((n, i) => {
    if (y + RH > 297 - 25 - 40) { doc.addPage(); y = drawHead(); }
    const z = i % 2 ? [250, 250, 253] : null;
    pdfCell(doc, X[0], y, COL[0], RH, String(i + 1), { size: 8, nowrap: true, fill: z });
    pdfCell(doc, X[1], y, COL[1], RH, n, { size: 8.5, fill: z });
    TRANSPLANT_JOBS.forEach((j, k) => {
      const c = PAIR(k), cap = capOf(n, j.key);
      pdfCell(doc, X[c],   y, COL[c],   RH, capFmt(cap), { size: 8, nowrap: true, fill: z });
      pdfCell(doc, X[c+1], y, COL[c+1], RH, (cap || adjOf('transplanting', secOf(n), n, j.key))
              ? 'RM ' + payOf(n, j.key).toFixed(2) : '—', { size: 7.5, nowrap: true, fill: z });
    });
    pdfCell(doc, X[I_TOTAL], y, COL[I_TOTAL], RH, 'RM ' + earned(n).toFixed(2),
            { bold: true, size: 8.5, nowrap: true, fill: z });
    y += RH;
  });

  pdfCell(doc, X[0], y, COL[0] + COL[1], RH + 1, 'Grand Total', { bold: true, size: 8.5, fill: TF });
  TRANSPLANT_JOBS.forEach((j, k) => {
    const c = PAIR(k);
    const cs = names.reduce((s, n) => s + capOf(n, j.key), 0);
    const rs = names.reduce((s, n) => s + payOf(n, j.key), 0);
    pdfCell(doc, X[c],   y, COL[c],   RH + 1, capFmt(cs), { bold: true, size: 8, nowrap: true, fill: TF });
    pdfCell(doc, X[c+1], y, COL[c+1], RH + 1, 'RM ' + rs.toFixed(2), { bold: true, size: 7.5, nowrap: true, fill: TF });
  });
  pdfCell(doc, X[I_TOTAL], y, COL[I_TOTAL], RH + 1,
          'RM ' + names.reduce((s, n) => s + earned(n), 0).toFixed(2),
          { bold: true, size: 9, nowrap: true, fill: TF });
  y += RH + 1;

  /* Anybody the field credited who is not on the register is named UNDER the
     total rather than left off it in silence — the form is what goes for
     payment, and "this much is missing, and why" has to travel with it. */
  const lost = [...new Set(lines.filter(l => !l.known).map(l => l.worker_name))].sort();
  if (lost.length) {
    const held = lost.reduce((s, n) => {
      const cap = k => cap2(lines.filter(l => l.worker_name === n && l.key === k)
                                 .reduce((a, l) => a + Number(l.qty || 0), 0));
      return s + TRANSPLANT_JOBS.reduce((a, j) => {
        const r = rateOf(j.key);
        return a + (r == null ? 0 : Math.round(cap(j.key) * Math.round(r * 100000) / 1000) / 100);
      }, 0);
    }, 0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(150, 30, 30);
    doc.text(`NOT CLAIMED — not on the worker register: ${lost.join(', ')} (RM ${held.toFixed(2)})`,
             25, y + 6, { maxWidth: 160 });
    y += 8;
  }

  pdfFooterNote(doc, y);
  doc.save(`Salary_Claim_Transplanting_${sec === NO_SECTION ? 'No_Section' : (sec || 'All')}_${monthTxt.replace(/\s+/g, '_')}.pdf`);
}

function downloadMonthlyPDF() {
  if (!mayDo('monthly', 'export',
      'You do not have permission to download the monthly payroll.')) return;
  const list = monthlyRows().filter(r => r.total > 0);
  if (!list.length) { alert('Nothing earned this month yet.'); return; }
  const sec = $('monthly-section').value;
  const doc = pdfDoc();
  /* Eight columns now: Others sits between Seedlings Collection and Total.
     The widths are proportions — they are scaled to 160mm below — so the room
     for it comes out of the others rather than off the edge of the page. */
  const COL = [8, 42, 16, 23, 21, 23, 19, 24];   // 176 → fits 160 after trim
  const total = COL.reduce((a, b) => a + b, 0);
  const scale = 160 / total;
  const C = COL.map(w => w * scale);
  const X = []; C.reduce((x, w, i) => { X[i] = x; return x + w; }, 25);
  const HF = [232, 236, 252], TF = [222, 228, 250];

  const drawHead = () => {
    let y = pdfTitle(doc, ['MONTHLY PAYROLL', sec ? (SECTION_NAME[sec] || sec) : 'All Sections', `Month ${monthLabel(monthValue())}`]);
    const H = 13;
    ['No.', 'Worker Name', 'Section', 'Work Maintenance', 'Transplanting', 'Seedlings Collection', 'Others', 'Total (RM)']
      .forEach((t, i) => pdfCell(doc, X[i], y, C[i], H, t, { bold: true, size: 7.5, fill: HF }));
    return y + H;
  };

  let y = drawHead();
  const RH = 9;
  list.forEach((r, i) => {
    if (y + RH > 297 - 25 - 40) { doc.addPage(); y = drawHead(); }
    const z = i % 2 ? [250, 250, 253] : null;
    const cells = [String(i + 1), r.name, r.section || '—',
                   r.maint ? 'RM ' + r.maint.toFixed(2) : '—',
                   r.transpl ? 'RM ' + r.transpl.toFixed(2) : '—',
                   r.seedling ? 'RM ' + r.seedling.toFixed(2) : '—',
                   r.other ? 'RM ' + r.other.toFixed(2) : '—',
                   'RM ' + r.total.toFixed(2)];
    cells.forEach((t, k) => pdfCell(doc, X[k], y, C[k], RH, t,
      { size: k === 1 ? 8.5 : 8, bold: k === cells.length - 1, nowrap: k !== 1, fill: z }));
    y += RH;
  });

  const sum = k => list.reduce((s, r) => s + r[k], 0);
  const foot = ['', 'GRAND TOTAL', '', 'RM ' + sum('maint').toFixed(2), 'RM ' + sum('transpl').toFixed(2),
                'RM ' + sum('seedling').toFixed(2), 'RM ' + sum('other').toFixed(2),
                'RM ' + sum('total').toFixed(2)];
  foot.forEach((t, k) => pdfCell(doc, X[k], y, C[k], RH + 1, t, { bold: true, size: 8, nowrap: k !== 1, fill: TF }));
  y += RH + 1;
  pdfFooterNote(doc, y);
  doc.save(`Monthly_Payroll_${sec || 'All'}_${monthLabel(monthValue()).replace(/\s+/g, '_')}.pdf`);
}

/* ════════════ LOAD ════════════ */
let _maintGeneralCol = true;
let _pinCol = true;
async function loadWorkers() {
  const { data, error } = await _supabase.from('mjmnpayroll_workers').select('*').order('full_name');
  if (error) { flagSetup(error.message); return; }
  workers = data || [];
  // On an empty table there is no row to read the column names off, so ask.
  const probe = await _supabase.from('mjmnpayroll_workers').select('maint_general').limit(1);
  _maintGeneralCol = !probe.error;
  const w = $('worker-setup');
  if (w) w.classList.toggle('hidden', _maintGeneralCol);
  // Same question for the PIN column, added later again.
  const pinProbe = await _supabase.from('mjmnpayroll_workers').select('pin').limit(1);
  _pinCol = !pinProbe.error;
  const pw = $('pin-setup');
  if (pw) pw.classList.toggle('hidden', _pinCol);
}
async function loadRates() {
  const { data, error } = await _supabase.from('mjmnpayroll_piece_rates')
    .select('*').order('sort_order').order('job_desc');
  if (error) { flagSetup(error.message); return; }
  rates = data || [];

  /* MN / PN / Machinery live in group_code, added after the module shipped.
     Ask the database rather than guessing: on an empty table there is no row
     to read the column names off, and a save that names a column the table
     does not have fails outright. */
  const probe = await _supabase.from('mjmnpayroll_piece_rates').select('group_code').limit(1);
  _rateGroupCol = !probe.error;
  $('rate-setup').classList.toggle('hidden', _rateGroupCol);
}
async function loadEntries() {
  const { data, error } = await _supabase.from('mjmnpayroll_work_entries')
    .select('*').eq('month', monthValue()).order('work_date');
  if (error) { flagSetup(error.message); return; }
  entries = data || [];
}
function flagSetup(msg) {
  _tablesOk = false;
  $('setup').classList.remove('hidden');
  $('setup-err').textContent = msg || '';
}

/* Work Maintenance lives in the Nursery Operation module; read it as-is. */
async function loadMaint() {
  const [recRes, tickRes, rateRes, wkRes, fieldRes] = await Promise.all([
    _supabase.from('nops_maint_records').select('records').eq('id', 1).maybeSingle().then(r => r, () => ({ data: null })),
    _supabase.from('nops_maint_payroll').select('nursery, month, work_type, data').then(r => r, () => ({ data: [] })),
    _supabase.from('nops_maint_piece_rates').select('nursery, work_type, rate').then(r => r, () => ({ data: [] })),
    _supabase.from('nops_maint_workers').select('nursery, name').then(r => r, () => ({ data: [] })),
    /* What the field actually recorded. Verified only — a record nobody has
       checked is not payable — and read here so the claim can pair the work
       to a schedule row ITSELF. It used to price only the ticks the Work
       Maintenance Worker Record had saved, which meant field work paid
       nothing until somebody opened that screen for the month, and nothing at
       all when the saving failed. Soft: a database without the table leaves
       the saved ticks as the only source, exactly as before. */
    PlotMovement.fetchAll(() => _supabase.from('nops_maint_field_records')
      .select('id, work_date, plot_name, work_type, jenis, chemical, qty, batch_name, week_no, schedule_month, worked_by, reported_by')
      .not('verified_at', 'is', null)
      .order('id', { ascending: true })).then(r => r, () => ({ data: [] }))
  ]);

  // The maintenance module's own old list — only the fallback now.
  maint.localWorkers = {};
  ((wkRes && wkRes.data) || []).forEach(r => {
    (maint.localWorkers[r.nursery] ||= []).push(r.name);
  });
  maint.rates = {};
  ((rateRes && rateRes.data) || []).forEach(r => {
    const targets = r.nursery ? [r.nursery] : ['PN','BNN','UNN1','UNN2'];
    targets.forEach(n => { (maint.rates[n] ||= {})[r.work_type] = r.rate; });
  });
  maint.ticks = {};
  ((tickRes && tickRes.data) || []).forEach(r => {
    maint.ticks[`${r.nursery}_${r.month}_${r.work_type}`] = r.data || {};
  });

  /* A record names its plot and nothing else, so the plot is what puts it
     back under a nursery. The list comes from shared/shared_maint_plots.js —
     the same one the Work Maintenance schedule draws its rows from — plus
     whatever has been added by hand with "Add Row" on a schedule.

     This page used to keep its own copy of that list, and it had drifted: it
     had UNN 2 as V1-V40 where the schedule has always drawn N1-N20, so every
     UNN 2 work record matched no nursery, its capacity was dropped, and the
     claim showed a page of dashes indistinguishable from a quiet month. Hand-
     added plots were unknown to it entirely, so work on one paid nothing. */
  const customPlots = await MJMMaintPlots.loadCustom(_supabase);
  maint.plotIndex = MJMMaintPlots.index(customPlots);

  const recs = (recRes && recRes.data && Array.isArray(recRes.data.records)) ? recRes.data.records : [];
  maint.records = recs.map(r => ({ ...r, __nursery: MJMMaintPlots.nurseryOfPlot(r.plot, maint.plotIndex) }));
  /* Records whose plot is on no schedule. Counted rather than dropped in
     silence: this is the shape the UNN 2 bug came in, and a claim that is
     short should say so on the sheet instead of looking like a quiet month. */
  maint.orphanPlots = [...new Set(recs.filter(r => !MJMMaintPlots.nurseryOfPlot(r.plot, maint.plotIndex))
                                      .map(r => String(r.plot || '').trim())
                                      .filter(Boolean))].sort();
  maint.field = ((fieldRes && fieldRes.data) || []);
}

/* WHO THE FIELD CREDITED, record by record, worked out here rather than read
   off the Worker Record's saved ticks.

   The pairing is shared/shared_maint_field.js's — the same one the Worker
   Record uses, so the two screens cannot land a morning's work on different
   rows. A name is resolved against the workers this claim holds by letters and
   digits, the way names are compared everywhere else here, and anything that
   resolves to nobody is collected so the sheet can say whose share went
   missing rather than quietly paying less. */
function maintFieldCredits(nursery, monthLbl, wk) {
  // Every shape this can return has all three keys — a caller reading
  // noTaker on the empty one took the whole claim down.
  const out = { credits: {}, unmatched: [], noTaker: {} };
  if (!maint.field || !maint.field.length || !window.MJMMaintField) return out;
  const idx  = MJMMaintField.index(maint.field, monthLbl);
  const mine = maint.records.filter(r => r.__nursery === nursery);
  return MJMMaintField.creditsByRecord(mine, idx, MJMMaintField.nameResolver(wk));
}

/* ════════════ BOOT ════════════ */
$('global-month').addEventListener('change', async () => {
  try { localStorage.setItem('npayroll_month', monthValue()); } catch (_) {}
  await Promise.all([loadEntries(), loadTransplantField(), loadEarnAdj()]);
  refreshPayrollTab();
  if ($('tab-locks')) { try { renderLockCalendar(); } catch (_) {} }
});

/* Click the backdrop to close. Guarded rather than assumed: worker-modal used
   to be on this list and left with the Worker System, and a missing element
   here would have thrown before the page finished setting itself up — taking
   the whole payroll screen down over a dialog nobody had opened. */
['rate-modal','entry-modal','adjust-modal'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(id); });
});

(async () => {
  try {
    await MJMAccess.load(_supabase);
    if (!MJMAccess.user()) { window.location.href = '../index.html'; return; }
    if (!MJMAccess.canAccess('npayroll')) {
      alert('You do not have access to the Nursery Payroll System.');
      window.location.href = '../index.html';
      return;
    }
    const u = MJMAccess.user();
    userEmail = u.email || '';
    isAdmin   = MJMAccess.isAdminOf('npayroll');
    // One missing helper must not take the whole module down with it.
    try { if (MJMAccess.canManageUsers()) $('user-access-tab').classList.remove('hidden'); } catch (_) {}

    let savedMonth = null;
    try { savedMonth = localStorage.getItem('npayroll_month'); } catch (_) {}
    $('global-month').value = savedMonth || todayMonth();

    /* transpl-section is NOT filled here — renderClaimPills owns it, and the
       circles offer nurseries rather than every section this module files
       under. */
    fillSectionSelect($('seedling-section'), true, '');
    fillSectionSelect($('other-section'),    true, '');
    fillSectionSelect($('monthly-section'),  true, '');

    /* The register first: the dropdown, the headings and which sheets exist
       all read it, so everything after this should see the real list. */
    await loadNurseryRegister();
    await Promise.all([loadWorkers(), loadRates(), loadEntries(), loadMaint(),
                       loadTransplantField(), loadEarnAdj()]);
    resolveMaintWorkers();

    /* The batch-report ledger is a much larger read than anything above, and
       only the maintenance capacity needs it — so let the page open first and
       repaint once it lands. */
    PlotMovement.load(_supabase).then(() => {
      if (!PlotMovement.ready()) return;
      try { refreshPayrollTab(); } catch (_) {}
    });

    /* Whether a month is closed has to be known before the first paint —
       a sheet that draws as open and then turns out to be shut has already
       invited somebody to start keying. */
    await MJMPayrollLock.load(_supabase);
    initLockControls();

    applyPageAccess();

    let tab = 'payroll', sub = 'maint';
    try { tab = localStorage.getItem('npayroll_tab') || tab; sub = localStorage.getItem('npayroll_sub') || sub; } catch (_) {}
    // A remembered tab this user may no longer open would leave them on a
    // blank screen, so fall back to the first one they can.
    if (!may(sub)) sub = firstOpen(['maint', 'transpl', 'seedling', 'other', 'monthly']) || sub;
    const tabOpen = { payroll: !!firstOpen(['maint','transpl','seedling','other','monthly']),
                      workers: may('workers'), rates: may('rates'), locks: may('locks') };
    if (!tabOpen[tab]) tab = ['payroll','workers','rates','locks'].find(t => tabOpen[t]) || tab;
    if ($('sub-' + sub)) switchSub(sub);
    if ($('tab-' + tab)) switchTab(tab);

    renderRates();
    $('loading').classList.add('hidden');
    $('main').classList.remove('hidden');
  } catch (e) {
    if (e && e.message === 'NO_OPS_ACCESS') return;
    console.warn(e);
    window.location.href = '../index.html';
  }
})();
