-- ============================================================================
-- MJM AI POWERED SYSTEM -- RUN_ME_2nd_cull_status.sql
--
-- 2ND CULL STATUS, PER NURSERY, PER MONTH.
--
-- Each nursery FC marks its 2nd cull done on the FC Portal. When all three
-- nurseries have marked it done, the FC Portal opens ONE Nelos case for the
-- month, routed to Audit Portal seat 2 (Pre Nursery Auditor + Drone Operator).
-- The Batch Record page reads a status off this, and it moves to Done when
-- that case is solved in Nelos.
--
-- The three statuses the page shows:
--     pending workdone        a nursery has not marked its 2nd cull done yet
--     pending drone flight    all three are done, the Nelos case is still open
--     done                    the Nelos case has been solved
--
-- WHAT THIS FILE ADDS
--     1. the Nelos category  Request Drone Terbang (2nd cull)
--        module_key audit (the Audit Portal solves it), pic_seat_no 2,
--        raise_modules empty so nobody raises it by hand, and an
--        auto_condition so it shows on Automate Cases
--     2. nops_2nd_cull_nursery   one row per nursery per month, when the FC
--                                pressed done
--     3. nops_2nd_cull_case      one row per month, the Nelos case the
--                                system opened for it
--     4. nops_2nd_cull_status(month)  the function the Batch Record page reads
--
-- THE LIST OF PLOTS AND BATCHES is not stored here. It is worked out from the
-- ledger on each screen, the same way the culling calculator works its
-- figures, so nothing here can go stale against the ledger.
--
-- Requires the Nelos routing migration: run RUN_ME_nelos_routing_is_the_category.sql
-- first (it adds raise_modules and pic_seat_no to nelos_categories).
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf).
-- Safe to run twice: every statement is idempotent.
-- ============================================================================

-- ── PREFLIGHT ───────────────────────────────────────────────────
DO $preflight$
BEGIN
  IF to_regclass('public.nelos_categories') IS NULL
     OR to_regclass('public.nelos_cases') IS NULL
     OR to_regclass('public.nelos_modules') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Nelos tables do not exist yet.',
      HINT    = 'Run migration_nelos_all.sql first, then the later Nelos files, then this one.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'nelos_categories'
                    AND column_name = 'pic_seat_no') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'nelos_categories.pic_seat_no is missing.',
      HINT    = 'Run RUN_ME_nelos_routing_is_the_category.sql first, then this file.';
  END IF;
END $preflight$;

-- ────────────────────────────────────────────────────────────────
-- PART 1: The Nelos category
-- ────────────────────────────────────────────────────────────────
INSERT INTO nelos_categories
  (name, module_key, auto_condition, default_priority, sort_order, active, raise_modules, pic_seat_no)
SELECT 'Request Drone Terbang (2nd cull)', 'audit',
       'All three nurseries have marked their 2nd cull done for the month',
       'normal', 900, true, ARRAY[]::TEXT[], 2
 WHERE NOT EXISTS (
         SELECT 1 FROM nelos_categories
          WHERE module_key = 'audit'
            AND lower(name) = lower('Request Drone Terbang (2nd cull)'));

-- Put it back the way this file wants it on a second run, in case somebody
-- has since changed the seat or the raisers by hand.
UPDATE nelos_categories
   SET active         = true,
       pic_seat_no    = 2,
       raise_modules  = ARRAY[]::TEXT[],
       auto_condition = 'All three nurseries have marked their 2nd cull done for the month'
 WHERE module_key = 'audit'
   AND lower(name) = lower('Request Drone Terbang (2nd cull)');

-- ────────────────────────────────────────────────────────────────
-- PART 2: The two tables
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nops_2nd_cull_nursery (
  month       TEXT        NOT NULL,            -- YYYY-MM
  nursery     TEXT        NOT NULL,            -- BNN, UNN1 or UNN2
  done_by     TEXT,                            -- the name of the FC, as on the portal
  done_by_id  UUID,
  done_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month, nursery)
);

CREATE TABLE IF NOT EXISTS nops_2nd_cull_case (
  month          TEXT        PRIMARY KEY,      -- YYYY-MM
  nelos_case_id  BIGINT,                       -- the case the system opened
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE nops_2nd_cull_nursery ENABLE ROW LEVEL SECURITY;
ALTER TABLE nops_2nd_cull_case    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nops_2nd_cull_nursery_all ON nops_2nd_cull_nursery;
CREATE POLICY nops_2nd_cull_nursery_all ON nops_2nd_cull_nursery
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS nops_2nd_cull_case_all ON nops_2nd_cull_case;
CREATE POLICY nops_2nd_cull_case_all ON nops_2nd_cull_case
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- PART 3: The status the Batch Record page reads
--
-- One row per nursery. The state is the same for all three nurseries once
-- the month has moved past the nursery step, because the drone flight is
-- one request for the whole month.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nops_2nd_cull_status(p_month TEXT)
RETURNS TABLE (
  nursery        TEXT,
  nursery_done   BOOLEAN,
  done_by        TEXT,
  done_at        TIMESTAMPTZ,
  nelos_case_id  BIGINT,
  case_status    TEXT,
  state          TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT x.nursery,
         (d.nursery IS NOT NULL)                       AS nursery_done,
         d.done_by,
         d.done_at,
         c.nelos_case_id,
         k.status                                      AS case_status,
         CASE
           WHEN k.status = 'resolved' THEN 'done'
           WHEN c.nelos_case_id IS NOT NULL THEN 'pending drone flight'
           WHEN (SELECT count(*) FROM nops_2nd_cull_nursery z
                  WHERE z.month = p_month) >= 3 THEN 'pending drone flight'
           ELSE 'pending workdone'
         END                                           AS state
    FROM (VALUES ('BNN'), ('UNN1'), ('UNN2')) AS x(nursery)
    LEFT JOIN nops_2nd_cull_nursery d
           ON d.month = p_month AND d.nursery = x.nursery
    LEFT JOIN nops_2nd_cull_case c
           ON c.month = p_month
    LEFT JOIN nelos_cases k
           ON k.id = c.nelos_case_id
   ORDER BY x.nursery;
$$;

GRANT EXECUTE ON FUNCTION nops_2nd_cull_status(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────
-- CHECK -- one result set, one row per thing that must be true.
-- Every line should read OK. The month line shows what the page will read
-- for the current month, which is empty until the first FC presses done.
-- ────────────────────────────────────────────────────────────────
SELECT 'category: Request Drone Terbang (2nd cull), Audit Portal seat 2' AS check_name,
       CASE WHEN EXISTS (SELECT 1 FROM nelos_categories
                          WHERE module_key = 'audit'
                            AND lower(name) = lower('Request Drone Terbang (2nd cull)')
                            AND pic_seat_no = 2 AND active)
            THEN 'OK' ELSE 'MISSING' END AS result
UNION ALL
SELECT 'table: nops_2nd_cull_nursery',
       CASE WHEN to_regclass('public.nops_2nd_cull_nursery') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'table: nops_2nd_cull_case',
       CASE WHEN to_regclass('public.nops_2nd_cull_case') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'function: nops_2nd_cull_status',
       CASE WHEN to_regprocedure('public.nops_2nd_cull_status(text)') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'month ' || to_char(now(), 'YYYY-MM') || ': nurseries done so far',
       (SELECT count(*)::text FROM nops_2nd_cull_nursery
         WHERE month = to_char(now(), 'YYYY-MM'));
