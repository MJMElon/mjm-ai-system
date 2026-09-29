-- ════════════════════════════════════════════════════════════════════════
-- WHY IS A WORKER NOT ON THE TRANSPLANTING CLAIM?
-- shared/CHECK_why_worker_missing.sql
--
-- Read-only. Nothing is created, changed or deleted, and it is safe to run
-- as many times as you like.
--
-- ── Set these two lines, then run the whole file ──
--   look_for   a piece of the name you are hunting, or '' for everybody
--   for_month  the month exactly as the payroll shows it, e.g. 'Sep 2026'
--
-- ── What it answers ──
--
-- A name reaches the Transplanting claim only by being TICKED on a record in
-- the FC Portal, and a conductor can only tick somebody the portal offers.
-- Four gates stand between the register and that list, and a name missing
-- from the claim has fallen at one of them:
--
--   1. on the register at all      mjmnpayroll_workers
--   2. still active                active is not false
--   3. filed under this nursery    section, or nursery where section is blank
--   4. counts as a general worker  the tick in Worker System, else the role
--
-- and then, past all four:
--
--   5. actually ticked on a transplanting record for that month
--
-- This reports every worker at once, not only the one you are looking for —
-- somebody missing for a reason usually has company.
-- ════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 'martini'::text AS look_for,          -- ← the name, or '' for all
         'Sep 2026'::text AS for_month         -- ← the month on the payroll
),

/* The register, read through the same two rules the pages use.
   Columns are read out of the row as JSON so that a database without
   `nursery` or without `maint_general` answers NULL instead of failing. */
reg AS (
  SELECT w.id,
         w.full_name,
         to_jsonb(w)->>'section'  AS section,
         to_jsonb(w)->>'nursery'  AS nursery,
         to_jsonb(w)->>'role'     AS role,
         (to_jsonb(w)->>'active')        AS active_txt,
         (to_jsonb(w)->>'maint_general') AS mg_txt,
         -- registerNurseryKey: letters and digits only, section before
         -- nursery. "UNN 1" and "UNN1" are the same nursery.
         COALESCE(
           NULLIF(upper(regexp_replace(COALESCE(to_jsonb(w)->>'section',''), '[^a-zA-Z0-9]', '', 'g')), ''),
           NULLIF(upper(regexp_replace(COALESCE(to_jsonb(w)->>'nursery',''), '[^a-zA-Z0-9]', '', 'g')), ''),
           '(none)'
         ) AS nkey
    FROM mjmnpayroll_workers w
),

/* Does this nursery label its general workers by role? If it does, a row
   with no role is taken as NOT a general worker — a half-filled register
   must not quietly include everybody. */
labelled AS (
  SELECT nkey,
         bool_or(active_txt IS DISTINCT FROM 'false'
                 AND role ~* '^general[[:space:]]*worker$|pekerja am|buruh am') AS any_named
    FROM reg GROUP BY nkey
),

gated AS (
  SELECT r.*, l.any_named,
         CASE
           WHEN r.active_txt = 'false'
             THEN 'not active on the register'
           WHEN r.mg_txt = 'true'  THEN ''
           WHEN r.mg_txt = 'false'
             THEN 'switched OFF as a general worker on their Worker System row'
           WHEN r.role ~* '^general[[:space:]]*worker$|pekerja am|buruh am' THEN ''
           WHEN lower(btrim(COALESCE(r.role,''))) IN
                ('field conductor','assistant field conductor','water pump operator','driver','gardener')
             THEN 'role is ' || r.role || ' — only General Worker is offered'
           WHEN l.any_named
             THEN 'no role set, and this nursery labels its general workers — so not offered'
           WHEN COALESCE(r.role,'') ~* 'driver|pemandu|conductor|kondektor|konduktor|supervisor|penyelia|mandor|mandur|kepala|kerani|clerk|admin|manager|pengurus|executive|eksekutif|mekanik|mechanic|technician|juruteknik|security|pengawal|jaga|foreman|operator|storekeeper|storeman'
             THEN 'role "' || r.role || '" reads as a non-worker'
           ELSE ''
         END AS blocked
    FROM reg r JOIN labelled l USING (nkey)
),

/* Who the FC Portal actually credited on transplanting, that month. */
credited AS (
  SELECT DISTINCT lower(btrim(w->>'name')) AS nm
    FROM nops_transplant_field_records r
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.workers, '[]'::jsonb)) w
   WHERE r.schedule_month = (SELECT for_month FROM params)
     AND COALESCE(w->>'name','') <> ''
)

SELECT * FROM (

  -- 1 ── Is the name on the register at all, and what does its row say?
  SELECT 1 AS ord, 'searched'::text AS what,
         g.full_name::text AS who,
         (COALESCE(NULLIF(g.nkey,'(none)'),'no nursery set')
          || ' · role ' || COALESCE(NULLIF(g.role,''),'(blank)')
          || ' · ' || CASE WHEN g.active_txt = 'false' THEN 'INACTIVE' ELSE 'active' END
          || CASE WHEN g.mg_txt IS NULL THEN '' ELSE ' · general-worker switch ' || g.mg_txt END)::text AS detail,
         (CASE WHEN g.blocked <> '' THEN 'NOT offered: ' || g.blocked
               WHEN c.nm IS NOT NULL THEN 'offered, and credited this month'
               ELSE 'offered on the tick list, but not ticked on any transplanting record this month'
          END)::text AS verdict
    FROM gated g LEFT JOIN credited c ON c.nm = lower(btrim(g.full_name))
   WHERE (SELECT look_for FROM params) <> ''
     AND g.full_name ILIKE '%' || (SELECT look_for FROM params) || '%'

  UNION ALL
  SELECT 2, 'searched', '(nobody of that name)',
         'nothing on mjmnpayroll_workers matches it',
         'add them under Worker System, then the conductor can tick them'
   WHERE (SELECT look_for FROM params) <> ''
     AND NOT EXISTS (SELECT 1 FROM reg
                      WHERE full_name ILIKE '%' || (SELECT look_for FROM params) || '%')

  -- 3 ── EVERYBODY the conductor is not offered, and why. The sweep.
  UNION ALL
  SELECT 3, 'not offered', g.full_name::text,
         (COALESCE(NULLIF(g.nkey,'(none)'),'no nursery set'))::text,
         g.blocked::text
    FROM gated g WHERE g.blocked <> ''

  -- 4 ── Offered, but nobody ticked them on transplanting this month.
  UNION ALL
  SELECT 4, 'not credited', g.full_name::text,
         (COALESCE(NULLIF(g.nkey,'(none)'),'no nursery set'))::text,
         'on the tick list, no transplanting record names them this month'
    FROM gated g LEFT JOIN credited c ON c.nm = lower(btrim(g.full_name))
   WHERE g.blocked = '' AND c.nm IS NULL

  -- 5 ── Credited, but the register does not know the name. These show on
  --      the claim with a ⚠ and are NOT in the salary claim.
  UNION ALL
  SELECT 5, 'unknown name', c.nm::text,
         'ticked in the FC Portal',
         'no row on mjmnpayroll_workers with this spelling — fix the spelling there'
    FROM credited c
   WHERE NOT EXISTS (SELECT 1 FROM reg WHERE lower(btrim(full_name)) = c.nm)

  -- 9 ── How many records there were to be ticked on in the first place.
  UNION ALL
  SELECT 9, 'this month', (SELECT for_month FROM params),
         (SELECT count(*)::text FROM nops_transplant_field_records
           WHERE schedule_month = (SELECT for_month FROM params)) || ' transplanting record(s)',
         CASE WHEN (SELECT count(*) FROM nops_transplant_field_records
                     WHERE schedule_month = (SELECT for_month FROM params)) = 0
              THEN 'NONE — nothing was saved under this month, so the claim is empty for everybody'
              ELSE 'the conductor records these under Maintenance → Transplanting Job'
         END
) x
ORDER BY ord, who;
