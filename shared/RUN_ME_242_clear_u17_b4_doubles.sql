-- =====================================================================
--  BATCH 242 — CLEAR THE DOUBLE KEY-IN ON U17 AND B4
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run finds nothing left and says so.
--
--  This is the drill-down. shared/RUN_ME_clear_duplicate_transfers.sql
--  does the same job for EVERY batch and every plot — run that when you
--  want the rest of them; this one touches batch 242's U17 and B4 only,
--  and nothing else on that batch either.
--
--  WHAT COUNTS AS A DOUBLE
--  Two or more movements that are identical in all four things: the same
--  sending plot, the same destination, the same quantity, the same day.
--  The FIRST one written is kept, the rest are deleted.
--
--  Anything short of all four is two real movements and is left alone —
--  two lorries on one day carrying different quantities, or the same
--  quantity on two different days. A movement with no twin is never
--  touched, so a lone U17 or B4 transfer cannot be lost by running this.
--
--  U17 and B4 are matched on EITHER END: a movement that LEFT them, and
--  a movement that ARRIVED at them (U17-R, B4-R). Whichever way round the
--  double is, it is found.
-- =====================================================================

-- ── What is there before, so the change can be read against it ───────
DROP TABLE IF EXISTS _mjm_242_before;
CREATE TEMP TABLE _mjm_242_before AS
SELECT count(*) AS movements FROM shared_inventory_logs
 WHERE batch_name = '242' AND transaction_type = 'Cull3_Transfer';

WITH scoped AS (
  SELECT l.id,
         COALESCE(SUBSTRING(l.remark FROM 'From:\s*\[([^\]|]+)\|'), '') AS left_from,
         REGEXP_REPLACE(UPPER(TRIM(COALESCE(l.plot_name, ''))), '\s+', ' ', 'g') AS went_to,
         l.quantity_change,
         COALESCE(l.transaction_date::text,
                  SUBSTRING(l.remark FROM 'Date:\s*(\d{4}-\d{2}-\d{2})'), '') AS moved_on,
         l.created_at
  FROM shared_inventory_logs l
  WHERE l.batch_name = '242'
    AND l.transaction_type = 'Cull3_Transfer'
    /* U17 and B4, at either end. "U17" matches U17 and U17-R; it does not
       match U170, because the character after the number has to be the
       end of the name or the "-R". */
    AND (
         REGEXP_REPLACE(UPPER(TRIM(COALESCE(SUBSTRING(l.remark FROM 'From:\s*\[([^\]|]+)\|'), ''))), '\s+', ' ', 'g')
           ~ '^(U17|B4)(-R)?$'
      OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(l.plot_name, ''))), '\s+', ' ', 'g')
           ~ '^(U17|B4)(-R)?$'
    )
),
ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY left_from, went_to, quantity_change, moved_on
           ORDER BY created_at, id
         ) AS copy_no
  FROM scoped
)
DELETE FROM shared_inventory_logs
 WHERE id IN (SELECT id FROM ranked WHERE copy_no > 1);

/* ONE result set — the SQL Editor only shows the last statement's. Every
   movement left on batch 242's U17 and B4, so you can read the answer
   rather than trust it. */
WITH left_over AS (
  SELECT COALESCE(SUBSTRING(l.remark FROM 'From:\s*\[([^\]|]+)\|'), '— not recorded —') AS left_from,
         TRIM(COALESCE(l.plot_name, ''))                                                AS went_to,
         l.quantity_change                                                              AS qty,
         COALESCE(l.transaction_date::text,
                  SUBSTRING(l.remark FROM 'Date:\s*(\d{4}-\d{2}-\d{2})'), 'no date')    AS moved_on,
         count(*) OVER (PARTITION BY
             COALESCE(SUBSTRING(l.remark FROM 'From:\s*\[([^\]|]+)\|'), ''),
             REGEXP_REPLACE(UPPER(TRIM(COALESCE(l.plot_name, ''))), '\s+', ' ', 'g'),
             l.quantity_change,
             COALESCE(l.transaction_date::text,
                      SUBSTRING(l.remark FROM 'Date:\s*(\d{4}-\d{2}-\d{2})'), ''))      AS copies
  FROM shared_inventory_logs l
  WHERE l.batch_name = '242'
    AND l.transaction_type = 'Cull3_Transfer'
    AND (
         REGEXP_REPLACE(UPPER(TRIM(COALESCE(SUBSTRING(l.remark FROM 'From:\s*\[([^\]|]+)\|'), ''))), '\s+', ' ', 'g')
           ~ '^(U17|B4)(-R)?$'
      OR REGEXP_REPLACE(UPPER(TRIM(COALESCE(l.plot_name, ''))), '\s+', ' ', 'g')
           ~ '^(U17|B4)(-R)?$'
    )
)
SELECT 0                                                      AS sort,
       '— BATCH 242 · U17 AND B4 —'                           AS movement,
       NULL::bigint                                           AS qty,
       NULL::text                                             AS moved_on,
       (SELECT movements FROM _mjm_242_before)
         - (SELECT count(*) FROM shared_inventory_logs
             WHERE batch_name = '242' AND transaction_type = 'Cull3_Transfer')
                                                              AS copies_removed,
       CASE WHEN (SELECT count(*) FROM left_over WHERE copies > 1) = 0
            THEN 'Done. Nothing on U17 or B4 is recorded twice any more. Every movement still '
                 || 'there is listed below — open batch 242''s Transfer Data and the lines '
                 || 'should match it, with Total Transferred back to what actually moved.'
            ELSE 'NOT DONE: something is still doubled below. Send the list back.'
       END                                                    AS note
UNION ALL
SELECT 1,
       left_from || ' → ' || went_to,
       qty,
       moved_on,
       copies,
       CASE WHEN copies > 1 THEN 'STILL DOUBLED' ELSE 'kept — this one is on its own' END
FROM left_over
ORDER BY sort, movement, moved_on;

-- WHAT A GOOD RESULT LOOKS LIKE
--   The first row says "Done." and copies_removed is how many extra rows
--   went — 1 if U17 and B4 had one double each and one of them was already
--   clean, 2 if both were doubled.
--
--   Under it, one row per movement that SURVIVED on U17 and B4, each
--   saying "kept — this one is on its own". Read them against the batch's
--   Transfer Data tab: they should be the same lines.
--
--   copies_removed 0 with "Done." means they were already clean — either
--   somebody removed them, or you have run this before.
--
--   A second run removes 0 and prints the same list.
--
--   IF THEY COME BACK IN A WEEK, the copies were not the problem. Run
--   shared/CHECK_duplicate_transfers.sql: a verdict of SEPARATE SAVES
--   means a delete is being refused, and that needs fixing rather than
--   clearing the copies again.
