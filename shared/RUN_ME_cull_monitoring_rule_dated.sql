-- ============================================================================
-- RUN_ME_cull_monitoring_rule_dated.sql
--
-- A PRICE CHANGED TODAY MUST NOT MOVE WHAT LAST MONTH CAME TO.
--
-- The office put it in one line: *"我什么时候改的价钱 是不会影响以前的月份的
-- 例如我10月改RM50变40 9月份的还是RM50"*. So the rule is not one row saying
-- what it is NOW, it is a rule with a HISTORY, and a month is priced by the
-- rule that was in force FOR THAT MONTH.
--
-- This file follows RUN_ME_cull_monitoring_rule.sql and does what that one
-- did plus the dating. Run it whether or not the first one was ever run:
-- it makes the tables if they are not there, and brings the shape the first
-- file left up to this one if they are. Nothing anybody has keyed is lost.
--
-- HOW A MONTH IS PRICED, and it is the whole idea:
--
--   the price  the NEWEST rate row for that kind whose from_month is not
--              after the month being asked about.
--   the people every person row whose from_month is not after the month,
--              and whose until_month is empty or AFTER it.
--
-- So changing RM 50 to RM 40 in October writes a SECOND fc row, from
-- 2026-10. September goes on reading the first one and goes on paying
-- RM 50, for ever, however many times it is reopened.
--
-- REMOVE IS AN END DATE, NOT A DELETE, and that is the one place this file
-- does not do what the office literally asked for -- *"Remove直接删除就可以
-- 了"*. On screen it IS a delete: the row goes, and Add puts it back. But a
-- row deleted outright would take the person off SEPTEMBER too, which is
-- the very thing the sentence above forbids. So Remove ends them at the
-- month it was pressed in and they stay on every month before it.
--
-- The one case that really is deleted is somebody added and removed in the
-- SAME month: that row was never in force anywhere, so there is nothing to
-- keep and nothing to see.
--
-- MONTHS ARE KEYED YYYY-MM, which is what both screens already use and what
-- lets a plain text comparison answer which came first.
--
-- Safe to run twice: every change is IF NOT EXISTS or guarded on the shape
-- it is changing, and the seed is guarded on the table being empty.
--
-- WHAT A GOOD RESULT LOOKS LIKE -- six rows:
--   1  the price table ................. dated -- OK
--   2  the people table ................ dated -- OK
--   3  the price as at this month ...... admin RM 20.00, fc RM 50.00
--   4  who is on the rule this month ... 2 admin, 3 FC
--   5  rate rows in all, over all time . 2
--   6  office logins that can edit it .. N of N -- OK
-- Rows 3 and 4 are what the rule says for the month you run it in, and on a
-- database that has only ever had the first file they are exactly what it
-- said before. Row 5 is 2 until somebody changes a price. Row 6 is the
-- proof: as every office login it writes a price and a person and rolls the
-- lot back, so nothing is left behind.
-- ============================================================================

-- ── The tables, in the dated shape, for a database that has neither ────────
CREATE TABLE IF NOT EXISTS public.nops_cull_monitoring_rate (
  id          BIGSERIAL PRIMARY KEY,
  -- THREE KINDS, and the third one is not money. This table is a DATED
  -- NUMBER per kind: admin and fc are ringgit a plot, and target is the
  -- number of DAYS a run has to come in under to earn anything at all.
  -- The office asked for that keyed as well, and it is dated for the same
  -- reason the prices are -- a target changed in October must not move
  -- what September came to.
  kind        TEXT        NOT NULL CHECK (kind IN ('admin', 'fc', 'target')),
  -- The month this number starts applying, YYYY-MM. It applies to that
  -- month and every month after it until a later row takes over.
  from_month  TEXT        NOT NULL DEFAULT '2000-01',
  rm          NUMERIC     NOT NULL DEFAULT 0 CHECK (rm >= 0),
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nops_cull_monitoring_people (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT        NOT NULL CHECK (kind IN ('admin', 'fc')),
  -- Empty for an admin, who is paid on every nursery. BNN, UNN1 or UNN2 for
  -- a Field Conductor, who is paid on that one. More than one row may name
  -- the same nursery: the office asked for it, because a nursery can have
  -- more than one.
  nursery      TEXT        NOT NULL DEFAULT '',
  -- The register ROW is the worker and the name is what it was called when
  -- somebody picked it. Both are kept: the id survives a rename, and the
  -- name is what a page with no register loaded can still show.
  worker_id    BIGINT,
  worker_name  TEXT        NOT NULL,
  -- On the rule from this month, and off it from until_month. Empty
  -- until_month is still on it.
  from_month   TEXT        NOT NULL DEFAULT '2000-01',
  until_month  TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── Bringing the shape the FIRST file left up to this one ─────────────────────────
-- A database that ran RUN_ME_cull_monitoring_rule.sql has a rate table keyed
-- on kind alone, no dates on either table, and three columns from a removal
-- that was marked rather than made. All of that is guarded, so this block
-- does nothing at all on a database that starts here.
DO $$
DECLARE
  has_col boolean;
BEGIN
  -- The rate table was keyed on kind, which allows exactly one price per
  -- kind for all time. It needs an id and a date instead.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'nops_cull_monitoring_rate'
                    AND column_name = 'id') THEN
    ALTER TABLE public.nops_cull_monitoring_rate DROP CONSTRAINT IF EXISTS nops_cull_monitoring_rate_pkey;
    ALTER TABLE public.nops_cull_monitoring_rate ADD COLUMN id BIGSERIAL PRIMARY KEY;
  END IF;
  ALTER TABLE public.nops_cull_monitoring_rate
    ADD COLUMN IF NOT EXISTS from_month TEXT NOT NULL DEFAULT '2000-01';

  -- The first file allowed two kinds. The target is a third, so the old
  -- check has to go before a target row can be written at all.
  ALTER TABLE public.nops_cull_monitoring_rate
    DROP CONSTRAINT IF EXISTS nops_cull_monitoring_rate_kind_check;
  ALTER TABLE public.nops_cull_monitoring_rate
    ADD CONSTRAINT nops_cull_monitoring_rate_kind_check
    CHECK (kind IN ('admin', 'fc', 'target'));

  ALTER TABLE public.nops_cull_monitoring_people
    ADD COLUMN IF NOT EXISTS from_month  TEXT NOT NULL DEFAULT '2000-01';
  ALTER TABLE public.nops_cull_monitoring_people
    ADD COLUMN IF NOT EXISTS until_month TEXT;

  -- The first file marked a removal instead of making one. Anybody it marked
  -- is ended at the month they were marked in, so the months BEFORE it keep
  -- paying them -- which is what this whole file is about. Where there is no
  -- stamp to go on they are ended at the month the row was made.
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'nops_cull_monitoring_people'
                    AND column_name = 'active') INTO has_col;
  IF has_col THEN
    EXECUTE 'UPDATE public.nops_cull_monitoring_people
               SET until_month = COALESCE(until_month,
                     to_char(COALESCE(removed_at, created_at, now()), ''YYYY-MM''))
             WHERE active IS FALSE';
    ALTER TABLE public.nops_cull_monitoring_people DROP COLUMN IF EXISTS active;
    ALTER TABLE public.nops_cull_monitoring_people DROP COLUMN IF EXISTS removed_by;
    ALTER TABLE public.nops_cull_monitoring_people DROP COLUMN IF EXISTS removed_at;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS nops_cull_mon_rate_once
  ON public.nops_cull_monitoring_rate (kind, from_month);
CREATE INDEX IF NOT EXISTS nops_cull_mon_people_month
  ON public.nops_cull_monitoring_people (kind, from_month);

-- ── The rule as it stands today, for a database that has neither ───────────
-- Seeded from 2000-01 so it covers every month already recorded: the rule is
-- already being paid, and a table that started empty would take all five of
-- these people to nought on the next claim. Guarded on the table being EMPTY
-- and not on each row, so a second run cannot put back somebody taken off.
INSERT INTO public.nops_cull_monitoring_rate (kind, from_month, rm)
SELECT v.kind, '2000-01', v.rm
FROM (VALUES ('admin', 20), ('fc', 50)) AS v(kind, rm)
WHERE NOT EXISTS (SELECT 1 FROM public.nops_cull_monitoring_rate);

-- The target of 15 days, which is what shared_palms.js has always held and
-- what the Motion Study has always drawn. Seeded on its own test, because a
-- database that ran the first file already has the two prices and would
-- otherwise never get a target row at all.
INSERT INTO public.nops_cull_monitoring_rate (kind, from_month, rm)
SELECT 'target', '2000-01', 15
WHERE NOT EXISTS (SELECT 1 FROM public.nops_cull_monitoring_rate WHERE kind = 'target');

INSERT INTO public.nops_cull_monitoring_people (kind, nursery, worker_name, from_month, created_by)
SELECT v.kind, v.nursery, v.worker_name, '2000-01', 'RUN_ME_cull_monitoring_rule_dated.sql'
FROM (VALUES
  ('admin', '',     'Rousell Wayne'),
  ('admin', '',     'Florence'),
  ('fc',    'BNN',  'Lalu Aenal'),
  ('fc',    'UNN1', 'Akbar'),
  ('fc',    'UNN2', 'Azhar')
) AS v(kind, nursery, worker_name)
WHERE NOT EXISTS (SELECT 1 FROM public.nops_cull_monitoring_people);

ALTER TABLE public.nops_cull_monitoring_rate   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nops_cull_monitoring_people ENABLE ROW LEVEL SECURITY;

-- Staff only, the same gate every maintenance table carries. The payroll
-- READS this to price a claim, so both modules have to reach it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = '_mjm_close_table') THEN
    PERFORM public._mjm_close_table('nops_cull_monitoring_rate',   'maint');
    PERFORM public._mjm_close_table('nops_cull_monitoring_people', 'maint');
  ELSE
    DROP POLICY IF EXISTS "Authenticated read maint"  ON public.nops_cull_monitoring_rate;
    DROP POLICY IF EXISTS "Authenticated write maint" ON public.nops_cull_monitoring_rate;
    CREATE POLICY "Authenticated read maint"  ON public.nops_cull_monitoring_rate
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated write maint" ON public.nops_cull_monitoring_rate
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "Authenticated read maint"  ON public.nops_cull_monitoring_people;
    DROP POLICY IF EXISTS "Authenticated write maint" ON public.nops_cull_monitoring_people;
    CREATE POLICY "Authenticated read maint"  ON public.nops_cull_monitoring_people
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated write maint" ON public.nops_cull_monitoring_people
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nops_cull_monitoring_rate   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nops_cull_monitoring_people TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.nops_cull_monitoring_people_id_seq  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.nops_cull_monitoring_rate_id_seq    TO authenticated;

NOTIFY pgrst, 'reload schema';

-- The proof: as each office login, write a dated price and a dated person,
-- then put both back.
SELECT set_config('mjm.cm_pass', '0', false),
       set_config('mjm.cm_total', '0', false),
       set_config('mjm.cm_bad', '', false);

DO $$
DECLARE
  p     record;
  good  boolean;
  why   text;
  who   text;
BEGIN
  FOR p IN
    SELECT id, COALESCE(email, 'id ' || id::text) AS who
    FROM public.shared_profiles
    WHERE COALESCE(user_type, '') <> 'customer'
    ORDER BY 2
  LOOP
    good := true; why := NULL; who := COALESCE(p.who, 'unknown');
    BEGIN
      PERFORM set_config('request.jwt.claim.sub', p.id::text, true);
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', p.id::text, 'role', 'authenticated')::text, true);
      PERFORM set_config('role', 'authenticated', true);

      INSERT INTO public.nops_cull_monitoring_people
        (kind, nursery, worker_name, from_month, created_by)
      VALUES ('admin', '', 'MJM probe row', '9999-12', who);
      UPDATE public.nops_cull_monitoring_people
        SET until_month = '9999-12' WHERE worker_name = 'MJM probe row';
      DELETE FROM public.nops_cull_monitoring_people WHERE worker_name = 'MJM probe row';

      INSERT INTO public.nops_cull_monitoring_rate (kind, from_month, rm, updated_by)
      VALUES ('admin', '9999-12', 1, who);
      DELETE FROM public.nops_cull_monitoring_rate WHERE from_month = '9999-12';

      PERFORM set_config('role', 'postgres', true);
    EXCEPTION WHEN OTHERS THEN
      good := false;
      why  := COALESCE(SQLSTATE, '?') || ' ' || COALESCE(SQLERRM, '');
      PERFORM set_config('role', 'postgres', true);
    END;

    PERFORM set_config('mjm.cm_total',
      (COALESCE(current_setting('mjm.cm_total', true), '0')::int + 1)::text, false);
    IF good THEN
      PERFORM set_config('mjm.cm_pass',
        (COALESCE(current_setting('mjm.cm_pass', true), '0')::int + 1)::text, false);
    ELSE
      PERFORM set_config('mjm.cm_bad',
        left(COALESCE(current_setting('mjm.cm_bad', true), '') || who || ': '
             || COALESCE(why, '') || '; ', 900), false);
    END IF;
  END LOOP;
END $$;

-- Six rows. Rows 3 and 4 are what the rule says for the month you run this
-- in. Row 5 is 2 until somebody changes a price. Row 6 is the proof, and OK
-- means the count matched -- nothing else.
SELECT 1 AS n, 'the price table' AS what,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public'
                            AND table_name = 'nops_cull_monitoring_rate'
                            AND column_name = 'from_month')
            THEN 'dated -- OK' ELSE 'NOT DATED -- NOT OK' END AS answer
UNION ALL
SELECT 2, 'the people table',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public'
                            AND table_name = 'nops_cull_monitoring_people'
                            AND column_name = 'until_month')
            THEN 'dated -- OK' ELSE 'NOT DATED -- NOT OK' END
UNION ALL
SELECT 3, 'the prices and target as at this month',
       -- The target is DAYS and not ringgit, and a line that called it RM
       -- would be the one thing on this result somebody could act on wrongly.
       COALESCE((SELECT string_agg(k.kind || ' ' || CASE WHEN k.kind = 'target'
                     THEN to_char((SELECT r.rm FROM public.nops_cull_monitoring_rate r
                           WHERE r.kind = k.kind AND r.from_month <= to_char(now(), 'YYYY-MM')
                           ORDER BY r.from_month DESC LIMIT 1), 'FM999990') || ' days'
                     ELSE 'RM ' || to_char((SELECT r.rm FROM public.nops_cull_monitoring_rate r
                           WHERE r.kind = k.kind AND r.from_month <= to_char(now(), 'YYYY-MM')
                           ORDER BY r.from_month DESC LIMIT 1), 'FM999990.00') END,
                   ', ' ORDER BY k.kind)
                 FROM (SELECT DISTINCT kind FROM public.nops_cull_monitoring_rate) k),
                'none -- NOT OK')
UNION ALL
SELECT 4, 'who is on the rule this month',
       COALESCE((SELECT count(*) FILTER (WHERE kind = 'admin')::text || ' admin, '
                      || count(*) FILTER (WHERE kind = 'fc')::text || ' FC'
                 FROM public.nops_cull_monitoring_people
                 WHERE from_month <= to_char(now(), 'YYYY-MM')
                   AND (until_month IS NULL OR until_month > to_char(now(), 'YYYY-MM'))),
                'none -- NOT OK')
UNION ALL
SELECT 5, 'rate rows in all, over all time',
       COALESCE((SELECT count(*)::text FROM public.nops_cull_monitoring_rate), '0')
UNION ALL
SELECT 6, 'office logins that can edit it',
       COALESCE(current_setting('mjm.cm_pass', true), '0') || ' of '
       || COALESCE(current_setting('mjm.cm_total', true), '0')
       || CASE WHEN COALESCE(current_setting('mjm.cm_pass', true), '0')
                  = COALESCE(current_setting('mjm.cm_total', true), '0')
               THEN ' -- OK'
               ELSE ' -- NOT OK: ' || COALESCE(current_setting('mjm.cm_bad', true), '') END
ORDER BY 1;
