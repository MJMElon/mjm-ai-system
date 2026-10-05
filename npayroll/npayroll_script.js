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
/* Full names, for the one place a short month reads wrong: the printed
   claim's own title block. Everywhere else — tabs, keys, the "Sep 2026" on
   screen — stays MONTHS_SHORT; this is additive, not a replacement. */
const MONTHS_FULL = ['January','February','March','April','May','June','July',
                      'August','September','October','November','December'];
function monthLabelFull(m) {
  const [y, mo] = String(m).split('-');
  return `${MONTHS_FULL[+mo - 1] || mo} ${y}`;
}

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

/* "RM 1,000.00", not "RM 1000.00". A payroll sheet is read down a column at
   speed and four digits with no break in them is where a 1,000 and a 10,000
   start looking alike. Two decimals always — money with a ragged number of
   them does not line up. moneyFig is the same figure without the prefix, for
   the PDF, so the printed form and the screen group their digits the same. */
const moneyFig = v => (Number(v) || 0).toLocaleString('en-MY',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = v => 'RM ' + moneyFig(v);
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
  /* What the sheet worked out, where it is not what is being paid. It used to
     be a red line under the figure, and on a sheet where every row carries a
     cent of calibration that is eight red lines saying the same thing — the
     line under the WORKER's name already says how much, which is the question
     somebody asks. So it moved to the tooltip: still there, no longer in the
     way of reading the column. */
  const tip = a
    ? `Sheet worked out ${money(worked)} — ${a.reason || 'adjusted'}`
      + (a.adjusted_by ? ' (' + a.adjusted_by + ')' : '')
    : 'Adjust what this job earned';
  const open  = canEdit
    ? ` onclick="openAdjust('${sheet}','${page}','${_esc1(section)}','${_esc1(name)}','${_esc1(code)}','${_esc1(jobLabel)}',${worked})"`
      + ` style="cursor:pointer;" title="${esc(tip)}"`
    : (a ? ` title="${esc(tip)}"` : '');
  if (!a && !worked) return `<td${open}>—</td>`;
  /* THE PENNY STEPPER.
     A capacity divided among seven people does not land on a whole cent, so
     a cell comes out a cent or two from the field's own total. Nudging it
     meant opening a form, typing a figure and writing a reason for ONE CENT,
     which is why the cent never got nudged and the two totals never agreed.
     So the cell carries minus and plus, and each press is RM 0.01.

     The AMOUNT is still the way to the full form: an adjustment that is a
     real decision still wants its own figure and its own reason. That has
     not moved; it has only stopped being the only way in. Which is why the
     buttons stop the click rather than letting it reach the cell. */
  /* No stepper here. The cents are nudged on the CAPACITY, where a share of
     a plot divided among eight people actually lands on a hundredth — the
     money then follows the capacity it is worked out from. A second stepper
     on the money would be two ways to move the same figure, disagreeing. */
  return `<td class="money"${open}>${money(shown)}`
       + (canEdit && !a ? '<span style="color:var(--text-faint);font-size:.7rem;"> \u270e</span>' : '')
       + '</td>';
}

function calStepHtml(sheet, page, section, name, code, worked) {
  const go = (dir) => `calibrateStep('${sheet}','${page}','${_esc1(section)}','${_esc1(name)}',`
                    + `'${_esc1(code)}',${Number(worked || 0)},${dir})`;
  return '<span class="cal-step">'
    + `<button type="button" class="cal-btn" title="Take RM 0.01 off"`
    + ` onclick="event.stopPropagation();${go(-1)}">\u2212</button>`
    + `<button type="button" class="cal-btn" title="Add RM 0.01"`
    + ` onclick="event.stopPropagation();${go(1)}">+</button>`
    + '</span>';
}

/* ════════════ CALIBRATING BY THE CENT ════════════
   One press is one cent on one job. Applied HERE first and written to the
   database a moment later, because the office presses it four or five times
   in a row to close a gap, and a round trip per press is a sheet that limps.

   What gets written is an ordinary earn adjustment — the same row in the same
   table as the form writes — so a calibrated cent reads back exactly like any
   other adjustment and the monthly claim picks it up without having to know
   the difference. Its reason says what it is, because the reason is required
   and that IS the reason.

   Stepping back onto the figure the sheet worked out REMOVES the override
   rather than storing an adjustment to the same number. */
const _round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const _calTimers = {};

function calibrateStep(sheet, page, section, name, code, worked, dir) {
  /* The same two questions the cell asked before it drew the buttons, asked
     again at the press — the two must not be able to disagree. */
  if (!mayAdjust(page)) {
    alert('You do not have permission to change what a job earned.\n\n'
        + 'Ask an admin to grant Adjust Pay in User Access.');
    return;
  }
  if (!lockAllows(page)) return;

  const a = adjOf(sheet, section, name, code);
  const back = _round2(worked);
  const from = a ? Number(a.amount || 0) : back;
  const next = _round2(from + dir * 0.01);
  // Nothing is paid below nothing: a stepper that walks past zero into a
  // negative wage is a keystroke nobody meant.
  if (next < 0) return;

  const key = _adjKey(sheet, section, name, code);
  earnAdj = earnAdj.filter(x =>
    _adjKey(x.sheet, x.section, x.worker_name, x.work_code) !== key);
  if (next !== back) {
    earnAdj.push({
      month: monthValue(), sheet, section: section || '', worker_name: name, work_code: code,
      amount: next, reason: calReason(back, code),
      adjusted_by: userEmail || null, adjusted_at: new Date().toISOString()
    });
  }
  redrawClaim(page);

  /* Written once the pressing stops. Five presses are one row either way —
     it is keyed on (month, sheet, section, worker, job), so every press would
     upsert the same one. */
  clearTimeout(_calTimers[key]);
  _calTimers[key] = setTimeout(function () {
    _calSave(sheet, page, section, name, code, next, back);
  }, 500);
}

const calReason = (worked, code) => isCapCode(code)
  ? `Calibrated (the field divided out ${capFmt(worked)})`
  : `Calibrated to the cent (sheet worked out ${money(worked)})`;

async function _calSave(sheet, page, section, name, code, amount, worked) {
  try {
    let error;
    if (amount === worked) {
      ({ error } = await _supabase.from('mjmnpayroll_earn_adjustments').delete()
        .eq('month', monthValue()).eq('sheet', sheet).eq('section', section || '')
        .eq('worker_name', name).eq('work_code', code));
    } else {
      ({ error } = await _supabase.from('mjmnpayroll_earn_adjustments').upsert({
        month: monthValue(), sheet, section: section || '', worker_name: name, work_code: code,
        amount, reason: calReason(worked, code),
        adjusted_by: userEmail || null, adjusted_at: new Date().toISOString()
      }, { onConflict: 'month,sheet,section,worker_name,work_code' }));
    }
    if (error) throw error;
  } catch (e) {
    /* The screen is showing a figure the database does not hold. Put it back
       to what IS held rather than leaving one nobody will be paid. */
    alert('That calibration did not save, so it has been put back.\n\n' + (e.message || e));
    await loadEarnAdj();
    redrawClaim(page);
  }
}

/* Redraw one claim without losing where it was scrolled to. These tables are
   wider than the screen and the cent being nudged is usually off to the
   right — a redraw that jumps back to the left takes the cell with it. */
function redrawClaim(page) {
  const wrap = document.querySelector(`#sub-${page} .tbl-wrap`);
  const x = wrap ? wrap.scrollLeft : 0;
  if (page === 'maint') renderMaint(); else renderTransplantClaim();
  const after = document.querySelector(`#sub-${page} .tbl-wrap`);
  if (after) after.scrollLeft = x;
}

/* ── A WORKER'S CAPACITY, CALIBRATED ───────────────────────────────────
   A plot's capacity divided among eight workers lands on 696.63 each and
   adds back to 5,573.04 where the field reported 5,573. The hundredths are
   arithmetic, not work, and the claim form carries a total somebody is asked
   to agree with — so a worker's share can be nudged by a hundredth until the
   column agrees with the field.

   ON THE CAPACITY AND NOWHERE ELSE. The money is capacity times rate, so it
   follows: nudge the share, the ringgit beside it and the column total and
   the grand total all move with it, and the sheet goes on multiplying out.
   A second stepper on the money would be two ways to move one figure, able
   to disagree.

   Stored in the same table as the money overrides the adjustment form
   writes, under a job code that cannot be a real one (`cap:` and the job).
   The row is keyed on (month, sheet, section, worker, job), the lookup is
   exact, and nothing walks that array without a key — so there is nothing
   new to run. */
const capCode   = (code) => 'cap:' + code;
const isCapCode = (code) => String(code == null ? '' : code).slice(0, 4) === 'cap:';

/* The capacity to use: the calibrated one where there is one. */
function capPaid(sheet, section, name, code, worked) {
  const a = adjOf(sheet, section, name, capCode(code));
  return a ? Number(a.amount || 0) : Number(worked || 0);
}
/* …and by how much, for the line under the name. */
function capDelta(sheet, section, name, code, worked) {
  const a = adjOf(sheet, section, name, capCode(code));
  return a ? _round2(Number(a.amount || 0) - Number(worked || 0)) : 0;
}
/* What a worker's hundredths come to across this sheet. */
function capCalibrationOf(sheet, section, name, codes, workedOf) {
  return _round2(codes.reduce((t, c) => t + capDelta(sheet, section, name, c, workedOf(c)), 0));
}

/* One capacity cell, with its stepper. `worked` is the share the field
   divided out; `shown` is what is being paid on. */
function capCell(sheet, page, section, name, code, worked) {
  const shown = capPaid(sheet, section, name, code, worked);
  const canEdit = mayAdjust(page) && !sheetLocked(page) && !!worked;
  const d = capDelta(sheet, section, name, code, worked);
  const tip = d ? `The field divided out ${capFmt(worked)}` : '';
  /* The stepper goes UNDER the figure, not beside it. Beside it, the number
     moved left as the buttons appeared on hover and the column stopped
     lining up down the sheet; under it, the figure holds its place and the
     buttons are a bigger target for a thumb. */
  return `<td${tip ? ` title="${esc(tip)}"` : ''}>${capFmt(shown)}`
       + (canEdit ? calStepHtml(sheet, page, section, name, capCode(code), worked) : '')
       + '</td>';
}

/* What this worker's cents come to on this sheet: everything paid, less
   everything the sheet worked out. */
function calibrationOf(sheet, section, name, codes, workedOf) {
  return _round2(codes.reduce((s, c) => {
    const a = adjOf(sheet, section, name, c);
    return s + (a ? Number(a.amount || 0) - Number(workedOf(c) || 0) : 0);
  }, 0));
}

/* …and that figure as the line under the worker's name, which is where
   somebody checking a payslip looks for "why is this not what I worked out".
   Nothing where nothing has been changed: a column of "calibrate RM0.00" is
   a column of noise. */
function calibrationLine(d, kind) {
  if (!d) return '';
  const colour = d > 0 ? '#0d7a47' : 'var(--danger,#c0392b)';
  const sign = d > 0 ? '' : '-';
  const txt = kind === 'cap' ? sign + Math.abs(d).toFixed(2)
                             : sign + 'RM' + Math.abs(d).toFixed(2);
  const tip = kind === 'cap'
    ? "The hundredths added to or taken off this worker's capacity on this sheet"
    : "The cents added to or taken off this worker's jobs on this sheet";
  return `<div class="cal-line" style="color:${colour};" title="${esc(tip)}"
            >calibrate ${txt}</div>`;
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
        /* Where the WORK was, as against where the worker is registered.
           Kept beside it because the two differ often enough to be the
           reason a nursery's sheet looks empty, and a sheet that cannot say
           "they are filed under UNN 1" can only say "nothing happened". */
        plotSection: _tpSection(rec.nursery_name),
        nursery: rec.nursery_name || '',
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

/* ══════════════════════════════════════════════════════════════
   WHY A NURSERY'S TRANSPLANTING SHEET IS EMPTY

   "No transplanting recorded in the FC Portal" is one answer out of five,
   and it was being printed for all five. A conductor who has spent the
   month keying records reads it as the office losing his work, and there
   was nothing on the screen to tell him which of these it was:

     · nothing was recorded anywhere this month
     · records were recorded, but on another nursery's plots
     · records are on this nursery's plots and NOBODY IS NAMED on them —
       a crew of nobody divides into no lines, so the whole record is
       silent even though the work and its quantity are in the database
     · the plot's nursery name matches no payroll section at all, so the
       work is filed under "No section"
     · the lines exist but are filed under the section the REGISTER puts
       those workers in, which is deliberate and documented on
       transplantWorkdone — but invisible from the circle they are missing
       from

   So the empty cell says which. Nothing here changes what is paid; it
   changes what the screen admits to knowing.
   ══════════════════════════════════════════════════════════════ */
const _tpCrew = (rec) => (Array.isArray(rec.workers) ? rec.workers.filter(w => w && w.name) : []);
const _plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

/* This section's records that name nobody, and the lines whose work was here
   but whose money is filed elsewhere. Both are faults the claim should say
   out loud whether or not it has rows to show. */
function transplantSectionNotes(secFilter) {
  const notes = [];
  const secName = s => s === NO_SECTION ? 'No section' : (SECTION_NAME[s] || s);

  const mine = transplantField.filter(r => inSection(secFilter, _tpSection(r.nursery_name)));
  const noCrew = mine.filter(r => !_tpCrew(r).length);
  if (noCrew.length) {
    const where = [...new Set(noCrew.map(r => r.plot_name).filter(Boolean))];
    notes.push(`${_plural(noCrew.length, 'record')} on ${esc(secName(secFilter))}’s plots `
      + `name nobody${where.length ? ' — ' + where.map(esc).join(', ') : ''}. `
      + `A record with no crew cannot be paid to anyone, so it produces no line here at all. `
      + `Open it in the FC Portal under Maintenance → Transplanting Job and add who did the work.`);
  }

  /* Work done on this nursery's plots whose lines went to another circle,
     because the register has those workers there. Named rather than left as
     a gap: the gap is the thing that reads as lost work. */
  const away = {};
  transplantFieldLines().forEach(l => {
    if (!inSection(secFilter, l.plotSection)) return;
    if (l.section === secFilter) return;
    const k = l.section || NO_SECTION;
    (away[k] || (away[k] = new Set())).add(l.worker_name);
  });
  Object.keys(away).forEach(k => {
    const who = [...away[k]].sort();
    notes.push(`Work on ${esc(secName(secFilter))}’s plots by ${who.map(esc).join(', ')} `
      + `is filed under ${esc(secName(k))}, because that is where the worker register has `
      + `${who.length === 1 ? 'them' : 'them'}. The money is on that circle, not this one.`);
  });
  return notes;
}

/* The lead sentence of an empty sheet — what the office actually knows. */
function transplantEmptyLead(secFilter) {
  const month = esc(monthLabel(monthValue()));
  const secName = s => s === NO_SECTION ? 'No section' : (SECTION_NAME[s] || s);
  const here = esc(secName(secFilter));

  if (!transplantField.length) {
    return `No transplanting was recorded in the FC Portal for ${month} — in any nursery. `
         + `A conductor records it under Maintenance &rarr; Transplanting Job.`;
  }
  const mine = transplantField.filter(r => inSection(secFilter, _tpSection(r.nursery_name)));
  if (!mine.length) {
    /* Where they ARE. A nursery name the payroll sections do not know is
       shown as itself, because that is the thing somebody has to go and fix
       in Facility Management rather than a code they can look up. */
    const where = [...new Set(transplantField.map(r =>
      _tpSection(r.nursery_name) ? secName(_tpSection(r.nursery_name))
                                 : `“${r.nursery_name || '(no nursery)'}”, which matches no payroll section`))];
    return `${_plural(transplantField.length, 'transplanting record')} reached the office for `
         + `${month}, but none on ${here}’s plots — they are on ${where.map(esc).join('; ')}.`;
  }
  return `${_plural(mine.length, 'transplanting record')} on ${here}’s plots for ${month}, `
       + `but ${mine.length === 1 ? 'it produces' : 'none of them produces'} a line on this claim.`;
}

/* ══════════════════════════════════════════════════════════════
   THE DRONE MAP OF EACH PLOT

   Every transplanting row in the ledger carries the map that was flown for
   it, as `MapUrl:` on its remark — written by the Seedling Stock batch
   report when the plot was filled, and the only evidence of what actually
   went in. The claim beside it is paying for that work, so the map belongs
   where the work is being signed off, not two systems away.

   READ ON ITS OWN, not off PlotMovement: that module keeps the ledger's
   arithmetic — plot, batch, quantity, date — and drops the remark, which is
   where the map is. One narrow read of the transplanting rows is cheaper
   than widening what every page holds.
   ══════════════════════════════════════════════════════════════ */
let transplantMaps = {};     // plotKey → [{ url, batch, date }], newest first

async function loadTransplantMaps() {
  try {
    const res = await PlotMovement.fetchAll(() => _supabase.from('shared_inventory_logs')
      .select('plot_name, batch_name, remark, transaction_date, created_at')
      .in('transaction_type',
          ['Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone'])
      .order('id', { ascending: true }));
    if (res.error) throw res.error;
    const by = {};
    (res.data || []).forEach(l => {
      const m = String(l.remark || '').match(/MapUrl:(\S+)/i);
      if (!m) return;
      const k = _tpKey(l.plot_name);
      if (!k) return;
      (by[k] || (by[k] = [])).push({
        url: m[1],
        batch: (l.batch_name || '').trim(),
        date: String(l.transaction_date || l.created_at || '').slice(0, 10)
      });
    });
    // Newest first, and one line per map however many rows name it.
    Object.keys(by).forEach(k => {
      const seen = new Set();
      by[k] = by[k].sort((a, b) => String(b.date).localeCompare(String(a.date)))
                   .filter(x => (seen.has(x.url) ? false : (seen.add(x.url), true)));
    });
    transplantMaps = by;
  } catch (e) {
    /* No maps is not no work. The table draws without the column rather than
       not at all, and says nothing it cannot answer. */
    console.warn('[payroll] drone maps could not be read:', (e && e.message) || e);
    transplantMaps = {};
  }
}

/* The maps for one plot — this month's batches where they match, and the
   plot's own newest otherwise. A plot is re-used across batches over the
   years, so the batch is what tells one flight from another. */
function mapsForPlot(plot, batches) {
  const all = transplantMaps[_tpKey(plot)] || [];
  if (!all.length) return [];
  const want = (batches || []).map(b => String(b).trim()).filter(Boolean);
  if (!want.length) return all.slice(0, 1);
  const hit = all.filter(m => want.some(b => _tpKey(b) === _tpKey(m.batch)));
  return hit.length ? hit : all.slice(0, 1);
}

const _isPdfUrl = (u) => /\.pdf(\?|$)/i.test(String(u || ''));

/* ONE BATCH, ONE MAP. A plot filled from two batches was flown twice and has
   two maps, and which is which is the batch — so the row carries one
   thumbnail per batch, each labelled with it.

   A batch with no map keeps its place, greyed, saying so. The gap is the
   useful part: it names the batch whose flight is missing, which an absent
   thumbnail cannot. */
function mapsByBatch(plot, batches) {
  const all = transplantMaps[_tpKey(plot)] || [];
  const want = (batches || []).map(b => String(b).trim()).filter(Boolean);
  const out = [];
  if (want.length) {
    want.forEach(b => {
      const m = all.find(x => _tpKey(x.batch) === _tpKey(b));
      out.push({ batch: b, url: m ? m.url : '', date: m ? m.date : '' });
    });
    /* One per batch the record names, and NOTHING ELSE. A plot is re-used
       over the years and carries every map ever flown over it; the ones
       belonging to other batches are other months' work, and putting them
       here is the table answering a question nobody asked of it. */
    return out;
  }
  // No batch on the record: whatever the plot has, newest first.
  return all.slice();
}

/* One plot's maps, as something to open. A new tab rather than a box on this
   page: that is what prints, which is half of what the map is wanted for. */
function mapCellHtml(plot, batches) {
  const maps = mapsByBatch(plot, batches);
  if (!maps.length) return '<span style="color:var(--text-faint);">—</span>';
  return `<span class="tp-maps">` + maps.map(m => {
    const label = m.batch ? esc(m.batch) : '—';
    if (!m.url) {
      return `<span class="tp-map-w"><span class="tp-map is-none"
        title="No drone map on this batch\u2019s transplanting record">\u2014</span>
        <span class="tp-map-b">${label}</span></span>`;
    }
    const pdf = _isPdfUrl(m.url);
    const tip = ['Drone map', plot, m.batch ? 'batch ' + m.batch : '', m.date]
      .filter(Boolean).join(' \u00b7 ');
    return `<span class="tp-map-w"><a class="tp-map${pdf ? ' is-pdf' : ''}" href="${esc(m.url)}"
      target="_blank" rel="noopener" title="${esc(tip)} — opens in a new tab, where it prints"
      ${pdf ? '' : `style="background-image:url('${esc(m.url)}')"`}>${pdf ? '\u{1F4C4}' : ''}</a>
      <span class="tp-map-b">${label}</span></span>`;
  }).join('') + `</span>`;
}

/* ── THE MAPS, ON THE CLAIM FORM ────────────────────────────────────────
   One button and one file. The maps used to open in a print window of their
   own beside the claim's download, which is two things to press and two
   things to file for one month's work — so they go on the end of the claim
   form, where the form itself says what they are evidence of.

   ONE CARD PER BATCH, not per plot. The map is flown for a batch: the office
   puts the same picture on every plot row that batch filled, so a batch
   across six plots used to be six identical sheets of paper. One card, with
   every plot it covers named on it.

   THIS NURSERY'S MAPS AND NO OTHER. The claim form is one nursery's — the
   circle on the bar decides it — so the evidence stapled to it is that
   nursery's too. It carried all three for a while, which made BNN's claim a
   folder with UNN 1's and UNN 2's plots in the back of it.

   TWO TO A PAGE, because half an A4 is the smallest a drone map is worth
   printing at — the reason to print one is to stand in the plot and compare
   it with what is there. */

/* The cards for one nursery: one per batch that was flown, naming the plots
   that batch filled. */
function mapCardsFor(code) {
  const byBatch = new Map();
  transplantPlotRows(code).forEach((r) => {
    mapsByBatch(r.plot, r.batches).forEach((m) => {
      if (!m.url) return;                       // a batch nobody flew
      /* Keyed on the PICTURE. A batch normally has one, and then this is one
         card per batch — which is the point. Where a batch somehow carries
         two different maps they stay two cards, because folding them would
         throw one away; and where two plots or two batches share a picture
         they fold into one, which is the repeat being deleted. */
      let c = byBatch.get(m.url);
      if (!c) { c = { batch: m.batch, url: m.url, plots: [], batches: [], dates: [] };
                byBatch.set(m.url, c); }
      if (!c.plots.includes(r.plot)) c.plots.push(r.plot);
      if (m.batch && !c.batches.includes(m.batch)) c.batches.push(m.batch);
      if (m.date && !c.dates.includes(m.date)) c.dates.push(m.date);
    });
  });
  return [...byBatch.values()];
}

/* A map, fetched so it can be drawn into the PDF.

   crossOrigin, because a canvas that has been given an image without it is
   tainted and the whole file fails at the last step. Storage answers with
   the header; anything that does not simply comes back null and is listed on
   the page as missing, which is better than a download that produces
   nothing. */
function loadMapImage(url) {
  return new Promise((done) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    const t = setTimeout(() => { im.onload = im.onerror = null; done(null); }, 15000);
    im.onload  = () => { clearTimeout(t); done(im.naturalWidth ? im : null); };
    im.onerror = () => { clearTimeout(t); done(null); };
    im.src = url;
  });
}

const _pdfImgFormat = (u) => (/\.png(\?|$)/i.test(String(u)) ? 'PNG' : 'JPEG');

/* Draws every nursery's maps onto the end of the claim form. Returns what it
   could not draw, so the caller can say so rather than leaving a gap. */
async function drawDroneMaps(doc, monthTxt, sec) {
  const secName = (c) => (NURSERY_FULL[c] ? `${c} — ${NURSERY_FULL[c]}` : c);
  const missed = [];

  for (const code of (sec ? [sec] : CLAIM_NURSERIES)) {
    const cards = mapCardsFor(code);
    if (!cards.length) continue;

    /* THE GEOMETRY IS WORKED OUT, NOT GUESSED. The first pass fixed two
       cards at 117mm each under a title that leaves 59mm gone, which came to
       305 on a page 297 tall — the second map ran off the bottom. Then it
       was one page per TWO cards, so a nursery with five maps printed on
       three pages, split in the middle of nowhere in particular. A nursery
       is one page now, however many maps it has: the page says how much
       room there is, and all of that nursery's cards divide it between
       them, the same way two of them used to.
       The claim this travels with went landscape (see downloadTransplantPDF)
       and these pages follow it — doc.addPage() with no format of its own
       inherits the document's, so they already print landscape; X/W/BOTTOM
       just have to say so too, or the page would be the right shape with a
       160mm-wide card stranded in the left half of it. */
    const X = 25, W = 247;                    // the same column the claim uses
    const BOTTOM = 210 - 12;                  // the foot of the page
    const GAP = 6, CAP = 9;                   // between the cards, and the name strip

    // One page, this nursery's own.
    doc.addPage();
    const TOP = pdfTitle(doc, ['DRONE MAPS — TRANSPLANTING', secName(code), `Month ${monthTxt}`],
                          { centerX: 148.5, lineLeft: 25, lineRight: 272 });
    const N = cards.length;
    const CARD = (BOTTOM - TOP - GAP * (N - 1)) / N;  // all of them, whatever the title left
    const BOX = CARD - CAP;

    for (let j = 0; j < N; j++) {
      const c = cards[j];
      let y = TOP + j * (CARD + GAP);

      pdfCell(doc, X, y, W, CAP, '', { fill: [232, 236, 252] });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0, 0, 0);
      doc.text(c.plots.join('  ·  '), X + 3, y + CAP - 2.8, { maxWidth: W * 0.55 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70, 70, 70);
      doc.text([c.batches.length ? 'Batch ' + c.batches.join(', ') : '',
                c.dates.slice().sort().map(fmtDay).join(', ')]
                 .filter(Boolean).join('   ·   '),
               X + W - 3, y + CAP - 2.8, { align: 'right', maxWidth: W * 0.42 });
      doc.setTextColor(0, 0, 0);
      y += CAP;

      doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.2);
      doc.rect(X, y, W, BOX);

      const im = _isPdfUrl(c.url) ? null : await loadMapImage(c.url);
      if (im) {
        /* Fitted INSIDE the box, whole, whatever shape it was flown in —
           the smaller of the two scales, so neither edge can pass the
           frame however wide or tall the picture is. */
        const k = Math.min((W - 4) / im.naturalWidth, (BOX - 4) / im.naturalHeight);
        const w = im.naturalWidth * k, h = im.naturalHeight * k;
        doc.addImage(im, _pdfImgFormat(c.url), X + (W - w) / 2, y + (BOX - h) / 2, w, h);
      } else {
        missed.push(c.plots.join(', ')
          + (c.batches.length ? ' (batch ' + c.batches.join(', ') + ')' : ''));
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(150, 30, 30);
        doc.text(_isPdfUrl(c.url)
          ? 'This map is a PDF and cannot be printed with the others.'
          : 'This map could not be read. Open it from the Transplanting sheet.',
          X + W / 2, y + BOX / 2, { align: 'center', maxWidth: W - 10 });
        doc.setFontSize(7); doc.setTextColor(90, 90, 90);
        doc.text(String(c.url), X + W / 2, y + BOX / 2 + 6,
                 { align: 'center', maxWidth: W - 10 });
        doc.setTextColor(0, 0, 0);
      }
    }
  }
  return missed;
}

/* ══════════════════════════════════════════════════════════════
   WHAT WAS TRANSPLANTED, PLOT BY PLOT

   The claim says what each worker is owed. This says what the work was: one
   line per plot, and the nursery's total for the month at the foot.

   COUNTED ONCE PER PLOT, and that is the whole care of it. A plot carries
   four jobs — blanket spray, lining, polybag filling, transplanting — and
   every one of them records the SAME figure, the number the operation report
   says went into that plot. Adding the four, or adding the claim's lines,
   reports the nursery at four times its size. So the plot's own figure is
   taken once, from its newest record, which is the rule summarise() in
   shared_maint_field.js already pays by for the same reason.

   Where the four disagree — the report moved between one job being keyed and
   the next — the newest wins and the disagreement is said out loud, because
   the records that are left are paying on the old number.

   A plot with no crew on it still appears here. It produces no claim line at
   all, so this is the only place the work shows.
   ══════════════════════════════════════════════════════════════ */
function transplantPlotRows(secFilter) {
  const by = new Map();
  transplantField.forEach(rec => {
    if (secFilter && !inSection(secFilter, _tpSection(rec.nursery_name))) return;
    const key = _tpKey(rec.plot_name);
    if (!by.has(key)) {
      by.set(key, { plot: rec.plot_name || '—', batches: new Set(), dates: [],
                    jobs: new Set(), seen: new Set(), newest: null, crew: 0 });
    }
    const p = by.get(key);
    String(rec.batch_name || '').split(',').map(s => s.trim()).filter(Boolean)
      .forEach(b => p.batches.add(b));
    if (rec.work_date) p.dates.push(String(rec.work_date).slice(0, 10));
    if (rec.work_type) p.jobs.add(rec.work_type);
    if (rec.source_qty != null && rec.source_qty !== '') p.seen.add(Number(rec.source_qty));
    p.crew += (Array.isArray(rec.workers) ? rec.workers.filter(w => w && w.name).length : 0);
    // The newest record decides the figure: same record, same rule, as the
    // group quantity everywhere else in this system.
    const a = String(rec.work_date || '');
    const b = String((p.newest || {}).work_date || '');
    if (!p.newest || a > b) p.newest = rec;
  });

  return [...by.values()].map(p => ({
    plot:    p.plot,
    batches: [...p.batches],
    from:    p.dates.length ? p.dates.slice().sort()[0] : '',
    jobs:    p.jobs.size,
    crew:    p.crew,
    qty:     p.newest && p.newest.source_qty != null && p.newest.source_qty !== ''
               ? Number(p.newest.source_qty) : null,
    // More than one figure across this plot's four jobs.
    disagrees: p.seen.size > 1 ? [...p.seen].sort((x, y) => x - y) : null
  })).sort((a, b) => String(a.plot).localeCompare(String(b.plot),
                       undefined, { numeric: true, sensitivity: 'base' }));
}

function renderTransplantByPlot(secFilter) {
  const table = $('transpl-plots-table');
  if (!table) return;
  const secName = s => s === NO_SECTION ? 'No section' : (SECTION_NAME[s] || s);
  const rows = transplantPlotRows(secFilter);
  const head = $('transpl-plots-head');
  if (head) {
    head.textContent = `Transplanting by plot — ${secName(secFilter)} · ${monthLabel(monthValue())}`;
  }

  if (!rows.length) {
    table.innerHTML = `<tbody><tr><td class="empty" colspan="4">
      Nothing transplanted in ${esc(secName(secFilter))} for ${esc(monthLabel(monthValue()))}.
    </td></tr></tbody>`;
    $('transpl-plots-note').textContent = '';
    return;
  }

  const total = rows.reduce((s, r) => s + (r.qty || 0), 0);
  /* TWO ANSWERS PER LINE: which plot, and how many went into it. The batch,
     the day it was first worked and how many of its four jobs are recorded
     were all on this table and all came off again — they are on the FC
     Portal's own screen, and what this one is read for is the column on the
     right and the total under it. */
  const body = rows.map((r, i) => `
    <tr>
      <td style="color:var(--text-faint);width:44px;">${i + 1}</td>
      <td class="l" style="font-weight:800;color:var(--text-head);">${esc(r.plot)}</td>
      <td style="white-space:nowrap;">${mapCellHtml(r.plot, r.batches)}</td>
      <td style="font-weight:800;${r.qty == null ? 'color:var(--text-faint);' : ''}">${
        r.qty == null ? '—' : num(r.qty)}${
        r.disagrees ? ' <span title="This plot’s jobs were keyed against different figures"'
                    + ' style="color:#c0392b;">&#9888;</span>' : ''}</td>
    </tr>`).join('');

  table.innerHTML = `
    <thead><tr>
      <th style="width:44px;">No.</th>
      <th class="l">Plot</th>
      <!-- What was flown over the plot when it was filled, one picture per
           batch with the batch written under it. No Batch column of its own:
           the label under each thumbnail already says which batch that map
           is, and a column repeating it is the same answer twice. -->
      <th style="width:170px;">Drone Map</th>
      <th style="width:180px;">Transplanted</th>
    </tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr>
      <td class="l" colspan="3">TOTAL — ${esc(secName(secFilter))} · ${esc(monthLabel(monthValue()))}</td>
      <td>${num(total)}</td>
    </tr></tfoot>`;

  /* Anything that makes the total wrong, or looks wrong and is not. */
  const notes = [];
  const moved = rows.filter(r => r.disagrees);
  if (moved.length) {
    notes.push(`${moved.map(r => `${esc(r.plot)} (${r.disagrees.map(n => num(n)).join(' and ')})`).join(', ')
      } ${moved.length === 1 ? 'was' : 'were'} keyed against more than one figure — the report `
      + `moved between one job being recorded and the next. The newest is counted here; `
      + `the jobs keyed on the old one are still paying it.`);
  }
  const noQty = rows.filter(r => r.qty == null);
  if (noQty.length) {
    notes.push(`${noQty.map(r => esc(r.plot)).join(', ')} ${noQty.length === 1 ? 'has' : 'have'} `
      + `no quantity on the record, so ${noQty.length === 1 ? 'it adds' : 'they add'} nothing to the total.`);
  }
  const noCrew = rows.filter(r => !r.crew);
  if (noCrew.length) {
    notes.push(`${noCrew.map(r => esc(r.plot)).join(', ')} ${noCrew.length === 1 ? 'names' : 'name'} `
      + `nobody, so ${noCrew.length === 1 ? 'it is' : 'they are'} on this table but on no claim line.`);
  }
  $('transpl-plots-note').innerHTML = notes.map(t =>
    `<div style="color:var(--danger,#c0392b);font-weight:600;margin-bottom:.25rem;">${t}</div>`).join('');
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
/* Transplanting's own ribbon — same shape as Work Maintenance's
   renderMaintGlance(), reading transplantWorkdone() instead of
   maint.why[code].capAll: that function already works out each of the four
   jobs' whole capacity (ticked or not) for whichever section is picked,
   which is the same figure workdoneCell used to price in the column header
   before that header went compact. */
function renderTransplGlance(secFilter) {
  const box = document.getElementById('transpl-glance');
  if (!box) return;
  const workdone = transplantWorkdone(secFilter);
  const rateOf = key => {
    const l = transplantFieldLines().find(x => x.key === key && x.rate != null);
    if (l) return l.rate;
    const r = transplantRate({ work_type: key, jenis: (TRANSPLANT_JOB[key] || {}).jenis });
    return r ? Number(r.rate || 0) : null;
  };
  box.innerHTML = TRANSPLANT_JOBS.map(j => {
    const cap = workdone[j.key] || 0;
    const rate = rateOf(j.key);
    const wd = rate == null ? null
      : Math.round(cap2(cap) * Math.round(rate * 100000) / 1000) / 100;
    return `<div class="pt-card">
        <div class="pt-label">${esc(j.label)}</div>
        <div class="pt-val">${capFmt(cap)}</div>
        <div class="pt-wd">Total Workdone (RM) : ${wd == null ? '&mdash;' : money(wd)}</div>
      </div>`;
  }).join('');
}

function renderTransplantClaim() {
  const secFilter = $('transpl-section').value || '';
  renderTransplGlance(secFilter);

  /* What was transplanted, plot by plot — drawn from here so it is drawn
     whatever the claim does, including the early return below. A month whose
     records name nobody has no claim lines at all, and that is precisely the
     month somebody needs to see the plots. */
  try { renderTransplantByPlot(secFilter); }
  catch (e) { console.warn('[payroll] the by-plot table could not be drawn:', e); }

  const lines = transplantFieldLines()
    .filter(l => !secFilter || inSection(secFilter, l.section));

  const secName = s => s === NO_SECTION ? 'No section' : (SECTION_NAME[s] || s);
  const sub = $('transpl-sub');
  if (sub) sub.textContent = `From the FC Portal${secFilter ? ' \u00b7 ' + secName(secFilter) : ''}`
                           + ` \u00b7 ${monthLabel(monthValue())}`;

  if (!lines.length) {
    /* Which of the five reasons it is — see transplantEmptyLead. An empty
       sheet that asserts nothing was recorded, when the records are sitting
       in the database with no crew on them, is the office telling a
       conductor his month's work never arrived. */
    const why = transplantSectionNotes(secFilter);
    $('transpl-table').innerHTML = `<tbody><tr><td class="empty">
      ${transplantEmptyLead(secFilter)}
      ${why.map(n => `<div style="color:var(--danger,#c0392b);font-weight:600;
        margin-top:.6rem;text-align:left;">${n}</div>`).join('')}
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
  /* The share the field divided out… */
  const capWorked = (n, key) => cap2(lines
    .filter(l => l.worker_name === n && l.key === key)
    .reduce((s, l) => s + Number(l.qty || 0), 0));
  /* …and the share being paid on, which is that one unless it has been
     calibrated. Everything downstream — the money, the column total, the
     grand total — is built from THIS, so the sheet goes on multiplying out. */
  const capOf = (n, key) => capPaid('transplanting', secOf(n), n, key, capWorked(n, key));
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
        <th rowspan="4" class="l" style="width:165px;">Worker</th>
        ${TRANSPLANT_JOBS.map(j => `<th colspan="2">${esc(j.label)}</th>`).join('')}
        <th rowspan="4" style="width:120px;">Subtotal (RM)</th>
      </tr>
      <tr>${TRANSPLANT_JOBS.map(j =>
        `<th colspan="2" style="font-weight:600;font-size:12px;">${esc(rateCell(j.key))}</th>`).join('')}</tr>
      <tr>${TRANSPLANT_JOBS.map(j =>
        workdoneCell(workdone[j.key] || 0, rateOf(j.key), rmSum(j.key), { compact: true })).join('')}</tr>
      <!-- Worker is bounded (above) so the job columns sit beside it instead
           of at the far end of whatever space Worker didn't use, and each
           group's Capacity column beyond the first is a bit wider than it
           needs — centred text-align spends that extra width as space on
           both sides, which is what reads as a gap before the NEXT group
           starts. Same fix, same reasoning, as Work Maintenance's own
           table. -->
      <tr>${TRANSPLANT_JOBS.map((j, i) =>
        `<th style="width:${i ? 112 : 90}px;">Capacity</th><th style="width:110px;">Total (RM)</th>`).join('')}</tr>
    </thead>`;

  const body = names.map((n, i) => `
    <tr>
      <td style="color:var(--text-faint);">${i + 1}</td>
      <td class="l" style="font-weight:700;color:var(--text-head);">${esc(n)}${
        knownOf(n) ? '' : '<span title="Not on the worker register — add them in Worker System, or the claim cannot pay this" style="color:var(--danger,#c0392b);"> &#9888;</span>'}${
        calibrationLine(capCalibrationOf('transplanting', secOf(n), n,
                                         TRANSPLANT_JOBS.map(j => j.key), (k) => capWorked(n, k)), 'cap')}${
        calibrationLine(calibrationOf('transplanting', secOf(n), n,
                                      TRANSPLANT_JOBS.map(j => j.key), (k) => rmOf(n, k)))}</td>
      ${TRANSPLANT_JOBS.map(j => {
        const c = capOf(n, j.key);
        return capCell('transplanting', 'transpl', secOf(n), n, j.key, capWorked(n, j.key))
             + earnedCell('transplanting', 'transpl', secOf(n), n, j.key,
                          j.label, c ? rmOf(n, j.key) : 0);
      }).join('')}
      <td class="money">${money(earned(n))}</td>
    </tr>`).join('');

  const foot = `
    <tfoot><tr>
      <td colspan="2">Grand Total</td>
      ${TRANSPLANT_JOBS.map(j =>
        `<td>${capFmt(capSum(j.key))}</td><td>${money(rmSum(j.key))}</td>`).join('')}
      <td>${money(grand)}</td>
    </tr></tfoot>`;

  $('transpl-table').innerHTML = head + `<tbody>${body}</tbody>` + foot;

  /* Anything that would make the claim short is said FIRST, because a claim
     missing work looks exactly like a quiet month. */
  const notes = [];
  /* A record with nobody on it, and work whose money is filed under another
     circle. Both make THIS sheet short, and both are just as true when there
     are rows as when there are none — see transplantSectionNotes. */
  transplantSectionNotes(secFilter).forEach(n => notes.push(n));
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

/* All four jobs' whole-of-job capacity, and what that capacity prices out
   to, together — for this nursery and month. Reads whichever view
   renderMaint() is showing (live or frozen — see maintLiveView /
   maintViewFromSnapshot) rather than maint.why directly, so a verified
   claim's ribbon freezes with everything else on it instead of going on
   reading Worker Record on its own. */
function renderMaintGlance(view) {
  const box = document.getElementById('maint-glance');
  if (!box) return;
  box.innerHTML = MAINT_TYPES.map(t => {
    const capAll = view.capAll(t.code);
    const rate = view.rateOf(t.code);
    const wd = rate == null ? null
      : Math.round(cap2(capAll) * Math.round(rate * 100000) / 1000) / 100;
    return `<div class="pt-card">
        <div class="pt-label">${esc(t.label)}</div>
        <div class="pt-val">${capFmt(capAll)}</div>
        <div class="pt-wd">Total Workdone (RM) : ${wd == null ? '&mdash;' : money(wd)}</div>
      </div>`;
  }).join('');
}

/* ════════════ A VERIFIED CLAIM STOPS READING WORKER RECORD ════════════

   Everything below answers one question: once somebody has verified Work
   Maintenance for a nursery and month, does ticking a different worker on
   Worker Record afterward change what the claim shows? It used to — the
   "lock" only ever stopped edits made ON the payroll screen itself
   (calibration, Sync); the figures were always read live off Worker
   Record's own records and ticks, with no check against the lock at all.
   A claim marked "✔ Verified" could still move under the signature.

   maintLiveView() and maintViewFromSnapshot() return the same shape — wk,
   rateOf, capWorked, capOf, rmOf, payOf, earned, capSum, rmSum, grand,
   capAll — so renderMaint(), renderMaintGlance() and downloadMaintPDF() do
   not need to know or care which one they were handed; only the three
   functions here know that one reads live and the other reads a frozen
   snapshot. buildMaintSnapshot() is what "Verify & lock" calls, once, on
   the live view, to make that snapshot in the first place. Worker Record
   stays exactly as editable as it always was — this is the claim choosing
   to stop listening to it, not Worker Record being shut. */

function maintSnapshotFor(n, ym) {
  if (typeof MJMPayrollLock === 'undefined' || !MJMPayrollLock.ready()) return null;
  const v = MJMPayrollLock.verificationOf(ym, 'maint', n);
  return (v && v.snapshot) ? v.snapshot : null;
}

function maintViewFromSnapshot(s) {
  return {
    wk: s.workers || [],
    rateOf:    c => (s.rate   || {})[c],
    capWorked: (w, c) => ((s.cap[w] || {})[c]) || 0,
    capOf:     (w, c) => ((s.cap[w] || {})[c]) || 0,
    rmOf:      (w, c) => ((s.rm[w]  || {})[c]) || 0,
    payOf:     (w, c) => ((s.rm[w]  || {})[c]) || 0,
    earned:    w => (s.earned || {})[w] || 0,
    capSum:    c => (s.capSum || {})[c] || 0,
    rmSum:     c => (s.rmSum  || {})[c] || 0,
    grand:     s.grand || 0,
    capAll:    c => (s.capAll || {})[c] || 0
  };
}

function maintLiveView(n, ym, monthTxt) {
  const wk = maintWorkerNames(n, ym);
  const rateOf = c => (maint.rates[n] || {})[c];
  const per = maintTotals(n, monthTxt, ym);
  // Money from the capacity AS SHOWN, so the printed row multiplies out.
  const capWorked = (w, c) => cap2(per[w] ? per[w][c] : 0);
  const capOf = (w, c) => capPaid('maint', n, w, c, capWorked(w, c));
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
  return { wk, rateOf, capWorked, capOf, rmOf, payOf, earned, capSum, rmSum, grand, capAll };
}

/* Read off the live view at the moment "Verify & lock" is pressed — every
   figure the claim needs to redraw itself without touching Worker Record
   again, in the exact shape maintViewFromSnapshot() hands back out. */
function buildMaintSnapshot(view) {
  const cap = {}, rm = {}, earned = {};
  view.wk.forEach(w => {
    cap[w] = {}; rm[w] = {};
    MAINT_TYPES.forEach(t => { cap[w][t.code] = view.capOf(w, t.code); rm[w][t.code] = view.payOf(w, t.code); });
    earned[w] = view.earned(w);
  });
  const capAll = {}, rate = {}, capSum = {}, rmSum = {};
  MAINT_TYPES.forEach(t => {
    capAll[t.code] = view.capAll(t.code);
    rate[t.code]   = view.rateOf(t.code);
    capSum[t.code] = view.capSum(t.code);
    rmSum[t.code]  = view.rmSum(t.code);
  });
  return { workers: view.wk.slice(), cap, rm, earned, capAll, rate, capSum, rmSum, grand: view.grand };
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
/* opts.compact drops the Total Capacity / Total Workdone lines, leaving only
   the shortfall ("not claimed"/"over") line when there is one — for Work
   Maintenance, where those two now sit in the glance ribbon above the table
   instead (renderMaintGlance) and repeating them here would just be the same
   two figures twice. Transplanting/Seedlings still call this plain, with no
   ribbon of their own, so they keep the full header unchanged. */
function workdoneCell(cap, rate, claimed, opts) {
  const compact = !!(opts && opts.compact);
  const span = 'colspan="2" style="font-weight:700;font-size:11px;"';
  /* The capacity itself, printed rather than left in the title tooltip —
     it used to only be readable by hovering, which on a form meant for
     printing (and for a worker checking a figure, not a mouse) was nowhere
     at all. Same cap2()/capFmt() the hover text and the per-worker columns
     already use, so it can't disagree with either. */
  const capLine = compact ? '' : `<div style="font-weight:600;color:var(--text-muted);">`
    + `Total Capacity : ${esc(capFmt(cap2(cap)))}</div>`;
  if (rate == null) {
    return `<th ${span} title="No piece rate for this job, so its work cannot be priced."
             >${capLine}${compact ? '' : '<div>Total Workdone (RM) : &mdash;</div>'}</th>`;
  }
  const total = Math.round(cap2(cap) * Math.round(rate * 100000) / 1000) / 100;
  const short = Math.round((total - (claimed || 0)) * 100) / 100;
  /* A claim that pays MORE than the work is an adjustment somebody typed in
     on purpose, so it is not called a shortfall — but it is still a
     difference, and a difference between two totals on one form has to be
     accounted for or somebody will spend the afternoon on it. */
  /* On its own line UNDER the total, not trailing after it. The two are
     different figures — what the work came to, and what is missing from the
     claim for it — and on one line the second reads as part of the first. */
  const gap = Math.abs(short) < 0.005 ? '' :
    `<div style="color:var(--danger,#c0392b);font-weight:800;margin-top:2px;">${
      short > 0 ? money(short) + ' not claimed' : money(-short) + ' over'}</div>`;
  const wdLine = compact ? '' : `<div>Total Workdone (RM) : ${money(total)}</div>`;
  return `<th ${span} title="${esc(capFmt(cap2(cap)))} at ${esc(rateTxt(rate))}"
           >${capLine}${wdLine}${gap}</th>`;
}

function renderMaint() {
  const n = $('maint-nursery').value;
  const ym = monthValue();
  const monthTxt = maintMonthLabel(ym);               // "Apr 2026"

  /* A claim verified for this nursery and month reads its own frozen
     snapshot instead of Worker Record from here on — see the block above
     renderMaintGlance. Live and frozen hand back the same shape, so nothing
     past this line needs to ask which one it got. */
  const frozen = maintSnapshotFor(n, ym);
  const view = frozen ? maintViewFromSnapshot(frozen) : maintLiveView(n, ym, monthTxt);
  renderMaintGlance(view);
  const { wk, rateOf, capWorked, capOf, rmOf, payOf, earned, capSum, rmSum, grand, capAll } = view;

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

  /* The office's own claim form, four header rows: the work, the rate it
     pays, what the whole of it comes to, then Capacity and Total under it.
     The rate sits INSIDE the work's column group rather than on a row of its
     own across the sheet, which is what makes it read as "P & D Spraying, at
     RM 0.01 a bag" instead of as a fourth kind of row. */
  const head = `
    <thead>
      <tr>
        <th rowspan="4" style="width:44px;">No.</th>
        <th rowspan="4" class="l" style="width:165px;">Worker</th>
        ${MAINT_TYPES.map(t => `<th colspan="2">${esc(t.label)}</th>`).join('')}
        <th rowspan="4" style="width:120px;">Subtotal (RM)</th>
      </tr>
      <tr>${MAINT_TYPES.map(t =>
        `<th colspan="2" style="font-weight:600;font-size:12px;">${maintRateTxt(t, rateOf(t.code))}</th>`).join('')}</tr>
      <tr>${MAINT_TYPES.map(t =>
        workdoneCell(capAll(t.code), rateOf(t.code), rmSum(t.code), { compact: true })).join('')}</tr>
      <!-- Worker is now bounded (above) so the job columns sit beside it
           instead of at the far end of whatever space Worker didn't use, and
           each group's Capacity column is a bit wider than it needs for its
           own number — centred text-align spends that extra width as space
           on both sides, which is what reads as a gap before the NEXT group
           starts. The first group needs none: there is nothing to its left
           but Worker, already bounded. -->
      <tr>${MAINT_TYPES.map((t, i) =>
        `<th style="width:${i ? 112 : 90}px;">Capacity</th><th style="width:110px;">Total (RM)</th>`).join('')}</tr>
    </thead>`;

  const body = wk.map((w, i) => `
    <tr>
      <td style="color:var(--text-faint);">${i + 1}</td>
      <td class="l" style="font-weight:700;color:var(--text-head);">${esc(w)}${
        calibrationLine(capCalibrationOf('maint', n, w, MAINT_TYPES.map(t => t.code),
                                         (c) => capWorked(w, c)), 'cap')}${
        calibrationLine(calibrationOf('maint', n, w, MAINT_TYPES.map(t => t.code),
                                      (c) => rmOf(w, c)))}</td>
      ${MAINT_TYPES.map(t => {
        const c = capOf(w, t.code);
        return capCell('maint', 'maint', n, w, t.code, capWorked(w, t.code))
             + earnedCell('maint', 'maint', n, w, t.code, t.label,
                          c ? rmOf(w, t.code) : 0);
      }).join('')}
      <td class="money">${money(earned(w))}</td>
    </tr>`).join('');

  const foot = `
    <tfoot><tr>
      <td colspan="2">Grand Total</td>
      ${MAINT_TYPES.map(t =>
        `<td>${capFmt(capSum(t.code))}</td><td>${money(rmSum(t.code))}</td>`).join('')}
      <td>${money(grand)}</td>
    </tr></tfoot>`;

  $('maint-table').innerHTML = head + `<tbody>${body}</tbody>` + foot;

  /* A frozen claim's notes would be about whatever Worker Record looks like
     NOW — missing rates, stray names, a batch report still loading — none
     of which this screen is reading any more. renderVerifyBar already says
     who verified it and when; repeating live diagnostics under a claim that
     has stopped listening to them would just be confusing. */
  if (frozen) { $('maint-note').textContent = ''; return; }

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
      + `${whoName(why.by)} on ${fmtStamp(why.at)}, so it is closed.\n\n`
      + 'Unlock it on the strip above the sheet, or re-open the whole month under '
      + 'System Setting.');
  return false;
}

/* Who, as a name. MJMPeople is loaded at boot; if it is not there — an old
   cached copy of the page — the email still shows, which is the thing it was
   before and not a failure. */
function whoName(v) {
  if (!v) return 'somebody';
  try { return (typeof MJMPeople !== 'undefined' ? MJMPeople.name(v) : v) || v; }
  catch (_) { return v; }
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
                 + `<span class="vb-who">${esc(whoName(why.by))}</span>`
                 + `<span>${esc(fmtStamp(why.at))}</span>`
                 /* ── 2. Taking it back ──
                    A sheet verified by mistake used to need somebody with
                    Lock Controls to re-open the WHOLE month — every other
                    sheet of it with it — which is a sledgehammer for one
                    wrong press. This undoes the one sheet and nothing else.
                    Its own permission, because it is not the same question
                    as being allowed to verify: the person who signs a sheet
                    is not automatically the person who may unsign it. */
                 + (may(sheet, 'unverify')
                     ? `<button class="btn btn-sm" style="margin-left:10px;"
                          onclick="unverifySheet('${sheet}')">\u21ba Unlock</button>`
                     : '');
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
             + 'It locks straight away and nothing on it can be changed after that. Somebody with '
             + 'the Unlock tick can take it back; otherwise it needs Lock Controls and the whole '
             + 'month.')) return;
  /* Work Maintenance is priced off Worker Record, a screen this lock does
     not reach — so verifying it also freezes what the claim shows (see the
     block above renderMaintGlance), not only what can be edited here.
     Worker Record stays exactly as live and editable as always; this is the
     claim choosing to stop reading it. */
  const snapshot = sheet === 'maint'
    ? buildMaintSnapshot(maintLiveView(scope, ym, maintMonthLabel(ym)))
    : null;
  const error = await MJMPayrollLock.verify(_supabase, ym, sheet, scope, userEmail || null, snapshot);
  if (error) { alert('Could not verify: ' + error.message); return; }
  refreshPayrollTab();
  if (typeof renderLockCalendar === 'function' && $('tab-locks')) renderLockCalendar();
}

/* Taking one sheet's verification back, and nothing else with it.

   Separate from Lock Controls on purpose. That re-opens the whole MONTH —
   every sheet of it, every nursery — which is the right tool for a month
   that has to be re-run and much too big for one sheet signed in error.

   Its own permission for the same reason verifying has one: being trusted
   to say a sheet is right is not the same as being trusted to unsay it. */
async function unverifySheet(sheet) {
  if (!mayDo(sheet, 'unverify',
      'You do not have permission to unlock this sheet. Ask an admin to grant it in User Access.')) return;
  if (typeof MJMPayrollLock === 'undefined' || !MJMPayrollLock.ready()) {
    alert('Lock Controls are not set up yet — run shared/RUN_ME_npayroll_locks.sql first.');
    return;
  }
  const ym = monthValue(), scope = lockScope(sheet);
  const v  = MJMPayrollLock.verificationOf(ym, sheet, scope);
  if (!v) { refreshPayrollTab(); return; }
  /* The verification that closes this sheet may have been filed with NO
     scope — somebody verifying with the picker on "All sections" closes
     every section at once. Taking it off re-opens all of them, so say so
     rather than letting one nursery's unlock quietly open three. */
  const wide = !String(v.scope || '').trim();
  if (!confirm(`Unlock ${LOCK_SHEETS[sheet].label} for ${scopeLabel(sheet, scope)}, ${monthLabel(ym)}?\n\n`
             + `It was verified by ${whoName(v.verified_by)} on ${fmtStamp(v.verified_at)}.`
             + (wide ? '\n\nThat verification covers EVERY section of this sheet, so this re-opens '
                     + 'all of them, not only the one on screen.' : '')
             + '\n\nThe sheet becomes editable again and will have to be verified a second time.')) return;
  const error = await MJMPayrollLock.unverify(_supabase, ym, sheet, v.scope || '');
  if (error) { alert('Could not unlock: ' + error.message); return; }
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
function pdfDoc(orientation) {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ orientation: orientation || 'portrait', unit: 'mm', format: 'a4' });
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
/* opts lets a landscape page keep the title centred on ITS page and the
   rule under it spanning ITS content width — portrait's 105/25/185 stay the
   default so every other caller (Transplanting, Monthly Payroll, the drone
   map pages) is unaffected. */
function pdfTitle(doc, lines, opts) {
  const o = Object.assign({ centerX: 105, lineLeft: 25, lineRight: 185 }, opts || {});
  let y = 25;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('MEGA JUTAMAS SDN BHD', o.centerX, y + 5, { align: 'center' });
  doc.setFontSize(12); doc.text(lines[0], o.centerX, y + 12, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(lines[1], o.centerX, y + 19, { align: 'center' });
  doc.text(lines[2], o.centerX, y + 25.5, { align: 'center' });
  doc.setDrawColor(79, 70, 229); doc.setLineWidth(0.6);
  doc.line(o.lineLeft, y + 29, o.lineRight, y + 29); doc.setLineWidth(0.2);
  return y + 34;
}
/* A worker's cell on a claim form, with what their cents came to under the
   name.

   ON THE PAPER AND NOT ON THE SCREEN, which is deliberate. The screen is
   where the cents are being pressed, and a red line under every one of eight
   names while somebody is still pressing is eight lines of working out. The
   PAPER is what gets signed and filed: whoever reads it is not adjusting
   anything and does need to know that RM 6.96 is not RM 6.97 by arithmetic.

   One box, not two stacked: the name is placed in the upper part of the cell
   and the line in a band at its foot, so the row keeps the single rule round
   it that every other cell has. */
function pdfWorkerCell(doc, x, y, w, h, name, cal, o) {
  const opts = Object.assign({ size: 8.5, bold: false, fill: null }, o || {});
  if (!cal) { pdfCell(doc, x, y, w, h, name, opts); return; }
  pdfCell(doc, x, y, w, h, '', opts);          // the box and its fill, nothing in it
  const BAND = 2.9;
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setTextColor(0, 0, 0);
  let size = opts.size, lines;
  for (;;) {
    doc.setFontSize(size);
    lines = doc.splitTextToSize(String(name == null ? '' : name), w - 3);
    if (lines.length * size * 0.3528 * 1.15 <= h - BAND - 1 || size <= 5) break;
    size -= 0.4;
  }
  doc.setFontSize(size);
  const lh = size * 0.3528 * 1.15;
  let ty = y + (h - BAND - lines.length * lh) / 2 + lh * 0.78;
  lines.forEach(l => { doc.text(l, x + w / 2, ty, { align: 'center' }); ty += lh; });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8);
  doc.setTextColor(150, 30, 30);
  doc.text(cal, x + w / 2, y + h - 1.1, { align: 'center' });
  doc.setTextColor(0, 0, 0);
}

/* What a worker was calibrated by, for the band under their name on the
   printed form: the hundredths on their capacity, and the cents the
   adjustment form put on their money. Usually one or neither; on one line
   because the band is one line deep. */
function calibrationText(capD, rmD) {
  const sign = (d) => (d > 0 ? '' : '-');
  return [
    capD ? `calibrate ${sign(capD)}${Math.abs(capD).toFixed(2)}` : '',
    rmD  ? `calibrate ${sign(rmD)}RM${Math.abs(rmD).toFixed(2)}` : ''
  ].filter(Boolean).join('  \u00b7  ');
}

/* Who signed this sheet off, printed under the total.

   The form is what goes for payment, so the signature belongs ON it rather
   than only on the screen it was produced from. A sheet not yet verified
   says so plainly — a printed claim with no line here would look the same
   as one where the line simply did not fit. */
function pdfVerifiedNote(doc, y, sheet, scope) {
  let line = 'Not yet verified.';
  try {
    if (typeof MJMPayrollLock !== 'undefined' && MJMPayrollLock.ready()) {
      const v = MJMPayrollLock.verificationOf(monthValue(), sheet, scope);
      if (v) line = `Verified by ${whoName(v.verified_by)} on ${fmtStamp(v.verified_at)}`;
    }
  } catch (_) {}
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  doc.text(line, 25, y + 6);
  return y + 6;
}

function pdfFooterNote(doc, y, centerX) {
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(110, 110, 110);
  doc.text('This salary claim form is automatically generated by the MJM Nursery AI system.',
           centerX || 105, y + 12, { align: 'center' });
}

function downloadMaintPDF() {
  if (!mayDo('maint', 'export',
      'You do not have permission to download the salary claim form.')) return;
  const n = $('maint-nursery').value, month = monthValue(), monthTxt = maintMonthLabel(month);
  /* The printed claim is what gets signed and paid, so it reads whichever
     view the screen is showing — live, or a verified claim's frozen
     snapshot (see the block above renderMaintGlance) — rather than
     recomputing its own, slightly different, copy of the same question. A
     PDF that disagreed with the screen would be found out at the counter,
     and a verified claim's PDF drifting from what was actually signed would
     be worse. */
  const view = maintSnapshotFor(n, month)
    ? maintViewFromSnapshot(maintSnapshotFor(n, month))
    : maintLiveView(n, month, monthTxt);
  const { wk, rateOf, capWorked, capOf, rmOf, payOf, earned, capSum, rmSum, grand, capAll } = view;
  if (!wk.length) { alert('No worker on the Work Maintenance list for this nursery.'); return; }

  /* Landscape, and the same 25mm margin on both sides as the portrait forms
     used — A4 landscape is 297mm wide, so that leaves 247mm of content
     instead of 160mm, and every column below is the old one scaled up by
     247/160 (rounded, the one millimetre that rounding lost put back onto
     Worker) rather than redrawn from nothing, so the sheet is wider, not a
     different shape. */
  const doc = pdfDoc('landscape');
  const PAGE_W = 297, PAGE_H = 210, MARGIN = 25;
  const COL = [11, 47, 17, 23, 17, 23, 17, 23, 17, 23, 29];
  const X = []; COL.reduce((x, w, i) => { X[i] = x; return x + w; }, MARGIN);
  const PAIR = i => 2 + i * 2, I_TOTAL = COL.length - 1;
  const HF = [232, 236, 252], TF = [222, 228, 250];
  const CONTENT_R = MARGIN + COL.reduce((s, w) => s + w, 0), CENTER_X = PAGE_W / 2;

  /* The printed form, laid out like the screen: the work, the rate it pays,
     then Capacity under it. The rate is INSIDE the work's column group, not
     on a band of its own across the sheet — the same two rows the office's
     own claim form has.

     Total Capacity and Total Workdone (RM) — the whole job's capacity off
     the Worker Record, priced, same as the screen's ribbon puts under it —
     used to be a line stamped inside each column's own header instead,
     which repeated on paper the same clutter the screen was carrying before
     renderMaintGlance() moved it up into its own band. drawCapRibbon() is
     that band's paper equivalent: four cards, same figures, same formula
     (cap2/rate rounding), drawn once under the title rather than once per
     column. */
  /* Shrinks to fit inside maxW, the same rule pdfCell's own nowrap branch
     uses — a label or figure too wide for its card is a card with its own
     numbers spilling past its border, which is worse than one a little
     smaller but still inside it. */
  const fitLine = (str, maxW, size, minSize) => {
    for (;;) { doc.setFontSize(size); if (doc.getTextWidth(str) <= maxW || size <= minSize) break; size -= 0.25; }
    return size;
  };
  const drawCapRibbon = (y) => {
    const W = COL.reduce((s, w) => s + w, 0), GAP = 3;
    const cardW = (W - GAP * 3) / 4, cardH = 20, padX = 3, maxW = cardW - padX * 2;
    MAINT_TYPES.forEach((t, i) => {
      const x = X[0] + i * (cardW + GAP);
      doc.setDrawColor(190, 195, 230); doc.setLineWidth(0.25);
      doc.setFillColor(255, 255, 255); doc.rect(x, y, cardW, cardH, 'FD');
      const cap = capAll(t.code);
      const r = rateOf(t.code);
      const wd = r == null ? null : Math.round(cap2(cap) * Math.round(r * 100000) / 1000) / 100;
      doc.setFont('helvetica', 'bold'); doc.setTextColor(110, 110, 130);
      fitLine(t.label.toUpperCase(), maxW, 6.5, 4.5);
      doc.text(t.label.toUpperCase(), x + padX, y + 5.5);
      doc.setTextColor(67, 56, 202);
      fitLine(capFmt(cap), maxW, 11.5, 7);
      doc.text(capFmt(cap), x + padX, y + 13);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(49, 46, 129);
      const wdTxt = `Total Workdone (RM) : ${wd == null ? '—' : money(wd)}`;
      fitLine(wdTxt, maxW, 6.5, 4);
      doc.text(wdTxt, x + padX, y + 17.5);
    });
    return y + cardH + 4;
  };

  const drawHead = () => {
    let y = pdfTitle(doc, ['SALARY CLAIM FORM — WORK MAINTENANCE', `${NURSERY_FULL[n] || n} (${n})`,
                            `Month ${monthLabelFull(month)}`],
                      { centerX: CENTER_X, lineLeft: MARGIN, lineRight: CONTENT_R });
    y = drawCapRibbon(y);
    const H1 = 9, H2 = 7, H3 = 7, HT = H1 + H2 + H3;
    pdfCell(doc, X[0], y, COL[0], HT, 'No.', { bold: true, size: 8, nowrap: true, fill: HF });
    pdfCell(doc, X[1], y, COL[1], HT, 'Worker', { bold: true, size: 8.5, fill: HF });
    MAINT_TYPES.forEach((t, i) => {
      const c = PAIR(i);
      pdfCell(doc, X[c], y, COL[c] + COL[c+1], H1, t.label, { bold: true, size: 7.5, fill: HF });
      pdfCell(doc, X[c], y + H1, COL[c] + COL[c+1], H2, maintRateTxt(t, rateOf(t.code)),
              { size: 7, nowrap: true, fill: HF });
      pdfCell(doc, X[c],   y + H1 + H2, COL[c],   H3, 'Capacity',  { bold: true, size: 6.5, nowrap: true, fill: HF });
      pdfCell(doc, X[c+1], y + H1 + H2, COL[c+1], H3, 'Total (RM)', { bold: true, size: 6.5, nowrap: true, fill: HF });
    });
    pdfCell(doc, X[I_TOTAL], y, COL[I_TOTAL], HT, 'Subtotal (RM)', { bold: true, size: 7.5, fill: HF });
    return y + HT;
  };

  let y = drawHead();
  const CODES = MAINT_TYPES.map(t => t.code);
  const calTxtOf = (w) => calibrationText(
    capCalibrationOf('maint', n, w, CODES, (c) => capWorked(w, c)),
    calibrationOf('maint', n, w, CODES, (c) => rmOf(w, c)));
  /* A little taller where any row carries a calibration, so the band under
     the name does not squeeze the name itself. */
  const RH = wk.some(w => calTxtOf(w)) ? 11 : 9;
  wk.forEach((w, i) => {
    if (y + RH > PAGE_H - MARGIN - 40) { doc.addPage(); y = drawHead(); }
    const z = i % 2 ? [250, 250, 253] : null;
    pdfCell(doc, X[0], y, COL[0], RH, String(i + 1), { size: 8, nowrap: true, fill: z });
    pdfWorkerCell(doc, X[1], y, COL[1], RH, w, calTxtOf(w), { size: 8.5, fill: z });
    MAINT_TYPES.forEach((t, k) => {
      const c = PAIR(k), cap = capOf(w, t.code);
      pdfCell(doc, X[c],   y, COL[c],   RH, capFmt(cap), { size: 8, nowrap: true, fill: z });
      pdfCell(doc, X[c+1], y, COL[c+1], RH, (cap || adjOf('maint', n, w, t.code))
              ? money(payOf(w, t.code)) : '—', { size: 7.5, nowrap: true, fill: z });
    });
    pdfCell(doc, X[I_TOTAL], y, COL[I_TOTAL], RH, money(earned(w)), { bold: true, size: 8.5, nowrap: true, fill: z });
    y += RH;
  });

  pdfCell(doc, X[0], y, COL[0] + COL[1], RH + 1, 'Grand Total', { bold: true, size: 8.5, fill: TF });
  MAINT_TYPES.forEach((t, k) => {
    const c = PAIR(k);
    pdfCell(doc, X[c],   y, COL[c],   RH + 1, capFmt(capSum(t.code)), { bold: true, size: 8, nowrap: true, fill: TF });
    pdfCell(doc, X[c+1], y, COL[c+1], RH + 1, money(rmSum(t.code)), { bold: true, size: 7.5, nowrap: true, fill: TF });
  });
  pdfCell(doc, X[I_TOTAL], y, COL[I_TOTAL], RH + 1, money(grand),
          { bold: true, size: 9, nowrap: true, fill: TF });
  y += RH + 1;
  y = pdfVerifiedNote(doc, y, 'maint', n);
  pdfFooterNote(doc, y, CENTER_X);
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
async function downloadTransplantPDF() {
  if (!mayDo('transpl', 'export',
      'You do not have permission to download the salary claim form.')) return;
  const sec = $('transpl-section').value || '';
  const monthTxt = monthLabel(monthValue());
  const secTxt = sec === NO_SECTION ? 'No section'
               : (NURSERY_FULL[sec] ? `${NURSERY_FULL[sec]} (${sec})` : (SECTION_NAME[sec] || sec));

  const lines = transplantFieldLines().filter(l => !sec || inSection(sec, l.section));
  const names = [...new Set(lines.filter(l => l.known).map(l => l.worker_name))]
    .sort((a, b) => a.localeCompare(b));
  /* The same table the screen opens with: what was transplanted, plot by
     plot, and the nursery's total. It travels with the claim because the
     claim cannot answer it — a plot carries the same figure on all four of
     its jobs, so adding the claim's lines reports the nursery at four times
     its size. */
  const plotRows = transplantPlotRows(sec);
  /* Nothing to claim AND nothing recorded is nothing to print. Records with
     nobody credited still print: the plot summary is the only page they ever
     appear on, and it is exactly the month somebody is looking for them. */
  if (!names.length && !plotRows.length) {
    alert('Nothing recorded for this nursery this month.'); return;
  }

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
  /* The share the field divided out… */
  const capWorked = (n, key) => cap2(lines
    .filter(l => l.worker_name === n && l.key === key)
    .reduce((s, l) => s + Number(l.qty || 0), 0));
  /* …and the share being paid on, which is that one unless it has been
     calibrated. Everything downstream — the money, the column total, the
     grand total — is built from THIS, so the sheet goes on multiplying out. */
  const capOf = (n, key) => capPaid('transplanting', secOf(n), n, key, capWorked(n, key));
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

  /* Landscape, same shape as Work Maintenance's own claim form — same
     25mm margin both sides, same columns scaled up by 247/160. See
     downloadMaintPDF for the reasoning; this is deliberately the same
     geometry, not a second one to keep in step with it by hand. */
  const doc = pdfDoc('landscape');
  const PAGE_W = 297, PAGE_H = 210, MARGIN = 25;
  const COL = [11, 47, 17, 23, 17, 23, 17, 23, 17, 23, 29];
  const X = []; COL.reduce((x, w, i) => { X[i] = x; return x + w; }, MARGIN);
  const PAIR = i => 2 + i * 2, I_TOTAL = COL.length - 1;
  const HF = [232, 236, 252], TF = [222, 228, 250];
  const CONTENT_R = MARGIN + COL.reduce((s, w) => s + w, 0), CENTER_X = PAGE_W / 2;

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
    let y = pdfTitle(doc, ['SALARY CLAIM FORM — TRANSPLANTING', secTxt, `Month ${monthTxt}`],
                      { centerX: CENTER_X, lineLeft: MARGIN, lineRight: CONTENT_R });
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
  const KEYS = TRANSPLANT_JOBS.map(j => j.key);
  const calTxtOf = (n) => calibrationText(
    capCalibrationOf('transplanting', secOf(n), n, KEYS, (k) => capWorked(n, k)),
    calibrationOf('transplanting', secOf(n), n, KEYS, (k) => rmOf(n, k)));
  const RH = names.some(n => calTxtOf(n)) ? 11 : 9;
  names.forEach((n, i) => {
    if (y + RH > PAGE_H - MARGIN - 40) { doc.addPage(); y = drawHead(); }
    const z = i % 2 ? [250, 250, 253] : null;
    pdfCell(doc, X[0], y, COL[0], RH, String(i + 1), { size: 8, nowrap: true, fill: z });
    pdfWorkerCell(doc, X[1], y, COL[1], RH, n, calTxtOf(n), { size: 8.5, fill: z });
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
             MARGIN, y + 6, { maxWidth: CONTENT_R - MARGIN });
    y += 8;
  }
  /* A claim with no names on it is not a quiet month — it is work recorded
     with nobody credited, and the form has to say which it is or it reads as
     a nursery that did nothing. */
  if (!names.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(150, 30, 30);
    doc.text('NOTHING TO CLAIM — the records for this nursery name nobody. '
           + 'The work is on the plot summary overleaf; add who did it in the FC Portal.',
             MARGIN, y + 6, { maxWidth: CONTENT_R - MARGIN });
    y += 10;
  }

  y = drawTransplantPlots(doc, y, plotRows, secTxt, monthTxt);

  y = pdfVerifiedNote(doc, y, 'transpl', sec);
  pdfFooterNote(doc, y, CENTER_X);

  /* …and every nursery's drone maps on the end of it. Fetching them takes a
     moment — the button says so rather than appearing to have ignored the
     press, and is shut while it does so two presses cannot make two files. */
  const btn = document.querySelector('#sub-transpl .bar-actions .btn-primary');
  const was = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = 'Fetching the drone maps…'; }
  let missed = [];
  try {
    missed = await drawDroneMaps(doc, monthTxt, sec);
  } catch (e) {
    console.warn('[payroll] the drone maps could not be drawn:', e);
    missed = ['every map — ' + ((e && e.message) || e)];
  }
  if (btn) { btn.disabled = false; btn.innerHTML = was; }
  /* Said out loud: a claim form that quietly came out short of the evidence
     it was supposed to carry is worse than one that says which is missing. */
  if (missed.length) {
    alert(`The claim form is ready, but ${missed.length} drone map${
      missed.length === 1 ? '' : 's'} could not be put on it:\n\n  `
      + missed.join('\n  ')
      + '\n\nThey are still on the Transplanting sheet — open them from the '
      + 'Drone Map column and print them from there.');
  }

  doc.save(`Salary_Claim_Transplanting_${sec === NO_SECTION ? 'No_Section' : (sec || 'All')}_${monthTxt.replace(/\s+/g, '_')}.pdf`);
}

/* THE PLOT SUMMARY, ON THE CLAIM FORM.

   One line per plot and the nursery's total, printed under the claim — or on
   a page of its own where the claim has filled this one. Same figures and
   same rule as the table on screen: each plot counted ONCE, from its newest
   record, because its four jobs all carry the one figure.

   Returns the y it finished at, so the footer note goes under it. */
function drawTransplantPlots(doc, y, rows, secTxt, monthTxt) {
  if (!rows || !rows.length) return y;

  // No. · Plot · Transplanted — 247mm across, the same landscape width as
  // the claim above it (see downloadTransplantPDF). The same three columns
  // the screen shows, the old 14/106/40 scaled up the same way.
  const COL = [22, 163, 62];
  const X = []; COL.reduce((x, w, i) => { X[i] = x; return x + w; }, 25);
  const HF = [232, 236, 252], TF = [222, 228, 250];
  const BOTTOM = 210 - 25 - 30;
  const RH = 8;

  const heading = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
    doc.text(`TRANSPLANTING BY PLOT — ${secTxt} · ${monthTxt}`, 25, y + 6);
    y += 9;
    const H = 9;
    ['No.', 'Plot', 'Transplanted'].forEach((t, i) => {
      pdfCell(doc, X[i], y, COL[i], H, t, { bold: true, size: 7.5, nowrap: true, fill: HF });
    });
    y += H;
  };

  // Started on this page where a few lines fit, on the next where they do not.
  if (y + 9 + 9 + RH * 2 > BOTTOM) { doc.addPage(); y = 25; }
  else y += 4;
  heading();

  rows.forEach((r, i) => {
    if (y + RH > BOTTOM) { doc.addPage(); y = 25; heading(); }
    const z = i % 2 ? [250, 250, 253] : null;
    const cells = [
      String(i + 1),
      r.plot,
      (r.qty == null ? '—' : num(r.qty)) + (r.disagrees ? ' *' : '')
    ];
    cells.forEach((t, c) => pdfCell(doc, X[c], y, COL[c], RH, t,
      { size: 8.5, nowrap: true, bold: c > 0, fill: z }));
    y += RH;
  });

  const total = rows.reduce((s, r) => s + (r.qty || 0), 0);
  pdfCell(doc, X[0], y, COL[0] + COL[1], RH + 1,
          `TOTAL — ${secTxt} · ${monthTxt}`, { bold: true, size: 8.5, fill: TF });
  pdfCell(doc, X[2], y, COL[2], RH + 1, num(total), { bold: true, size: 9, nowrap: true, fill: TF });
  y += RH + 1;

  /* The same three things the screen says, printed — the form is what goes
     for payment, and a figure somebody has to trust must carry what is
     doubtful about it. */
  const say = (txt) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(150, 30, 30);
    doc.text(txt, 25, y + 5, { maxWidth: 247 });
    y += 4 + Math.ceil(doc.getTextWidth(txt) / 247) * 4;
  };
  const moved = rows.filter(r => r.disagrees);
  if (moved.length) {
    say('* ' + moved.map(r => `${r.plot} (${r.disagrees.map(n => num(n)).join(' and ')})`).join(', ')
      + ' — keyed against more than one figure. The newest is counted here; '
      + 'the jobs keyed on the old one are still paying it.');
  }
  const noQty = rows.filter(r => r.qty == null);
  if (noQty.length) {
    say(noQty.map(r => r.plot).join(', ') + ' — no quantity on the record, so '
      + 'nothing is added to the total.');
  }
  const noCrew = rows.filter(r => !r.crew);
  if (noCrew.length) {
    say(noCrew.map(r => r.plot).join(', ') + ' — names nobody, so on this summary '
      + 'but on no claim line above.');
  }
  doc.setTextColor(0, 0, 0);
  return y;
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
  /* loadAll, not loadCustom: a transfer plot ("-R") is in no hardcoded list
     and nobody adds it by hand -- it is made by a 3rd-culling transfer and
     Seedling Stock is where it says which nursery it is in. Without it every
     maintenance record on one resolved to no nursery and paid nobody. */
  const extraPlots = await MJMMaintPlots.loadAll(_supabase);
  maint.plotIndex = MJMMaintPlots.index(extraPlots);

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
                       loadTransplantField(), loadEarnAdj(), loadTransplantMaps()]);
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
    /* Names for every "verified by" on the page. Not awaited: a sheet that
       has to wait on a lookup table before it will draw is a sheet that does
       not draw when the table is missing. The strips repaint when it lands. */
    try {
      if (typeof MJMPeople !== 'undefined') {
        MJMPeople.load(_supabase).then(() => { try { refreshPayrollTab(); } catch (_) {} });
      }
    } catch (_) {}

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
