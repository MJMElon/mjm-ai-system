-- ════════════════════════════════════════════════════════════════════════
-- THE OFFICE STAFF MOVE OUT OF A SECTION CALLED ADMIN
-- shared/RUN_ME_worker_section_others.sql
--
-- Run this whole file in the Supabase SQL Editor. It touches the register
-- and nothing else, it moves only rows filed under ADMIN, and it is safe to
-- run twice: a second run finds none and says so.
--
-- ── What this is for ──
--
-- The Team Board draws a column per SECTION, and a section is a place:
-- PN, BNN, UNN 1, UNN 2, UNE. Two people were filed under a section called
-- ADMIN, which is in no nursery list and never will be, so the board headed
-- their column "ADMIN -- not in the nursery list". That reads as a fault
-- rather than as an answer.
--
-- Admin is a JOB, not a place. It is a role on the board now, beside Estate
-- Manager, Gardener and Driver, and the column those two stand in is simply
-- the one for people who work for the company rather than at a nursery:
-- OTHERS.
--
-- ── What it does NOT do ──
--
-- It does not touch anybody ROLE. Both of them are keyed as Field Conductor
-- and whether that is right is a question about those two people, which the
-- office answers on their own record -- open the chip on the board and
-- change Role to Admin. A file of SQL deciding somebody job title is the
-- one thing this repair must not do.
--
-- Nothing else in either system is keyed on the section ADMIN: it is not a
-- maintenance nursery, so neither the Work Maintenance sheets nor the salary
-- claim have ever counted it, and no page names it. The move is the board
-- and the register agreeing on a word.
-- ════════════════════════════════════════════════════════════════════════

UPDATE mjmnpayroll_workers
   SET section    = 'OTHERS',
       nursery    = 'OTHERS',
       updated_at = now(),
       -- Not a person. Naming one would put somebody signature on a change
       -- they did not make, and the board prints this line under the table.
       updated_by = 'RUN_ME_worker_section_others.sql'
 WHERE upper(btrim(coalesce(section, ''))) = 'ADMIN'
    OR upper(btrim(coalesce(nursery, ''))) = 'ADMIN';


-- ── What you should see ─────────────────────────────────────────────────
-- The SQL Editor shows only the LAST statements result, so this is one
-- query. On the first run:
--
--   moved      2    now in OTHERS, was ADMIN
--   worker     ROUSELL WAYNE     OTHERS -- Field Conductor
--   worker     Florence Indun    OTHERS -- Field Conductor
--   left       0    still filed under ADMIN
--   VERDICT    done
--
-- On a second run "moved" reads 2 as well -- it counts who is in OTHERS,
-- not who moved just now -- and "left" is still 0, which is the point.
-- A "left" that is not 0 means the update refused and is the thing to look
-- at. The role column says Field Conductor until somebody changes it on the
-- board, which is deliberate: see above.
-- ────────────────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS ord, 'moved'::text AS what,
         count(*)::text AS value,
         'now in OTHERS'::text AS detail
    FROM mjmnpayroll_workers
   WHERE upper(btrim(coalesce(section, ''))) = 'OTHERS'
  UNION ALL
  SELECT 2, 'worker', full_name::text,
         coalesce(section, '(none)') || ' -- ' || coalesce(role, '(no role)')
    FROM mjmnpayroll_workers
   WHERE upper(btrim(coalesce(section, ''))) = 'OTHERS'
  UNION ALL
  SELECT 3, 'left', count(*)::text, 'still filed under ADMIN'
    FROM mjmnpayroll_workers
   WHERE upper(btrim(coalesce(section, ''))) = 'ADMIN'
      OR upper(btrim(coalesce(nursery, ''))) = 'ADMIN'
  UNION ALL
  SELECT 9, 'VERDICT',
         CASE WHEN (SELECT count(*) FROM mjmnpayroll_workers
                     WHERE upper(btrim(coalesce(section, ''))) = 'ADMIN'
                        OR upper(btrim(coalesce(nursery, ''))) = 'ADMIN') = 0
              THEN 'done' ELSE 'somebody is still under ADMIN' END,
         'the board heads that column Others'
) x
ORDER BY ord, value;
