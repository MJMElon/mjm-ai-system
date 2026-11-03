-- ============================================================================
-- RUN_ME_cull_monitoring_rule.sql
--
-- WHO CULLING MONITORING PAYS, AND HOW MUCH, MOVES OUT OF THE CODE.
--
-- Until now the rule was fixed in shared/shared_cull_incentive.js: RM 20 a
-- plot to two people on every nursery, RM 50 a plot to one Field Conductor
-- per nursery, and the five names written out. Nothing on any screen said so
-- and nobody but a programmer could change it.
--
-- The office asked for it on Settings, keyed: add and remove the admins,
-- change either price, change a Field Conductor, and more than one Field
-- Conductor for a nursery where there is more than one.
--
-- TWO TABLES, because the price belongs to the BLOCK and not to the person.
-- That is how the office drew it -- admin RM 20 over its list of names, FC
-- RM 50 over its own -- and it is what stops two people on one block drifting
-- onto two different rates.
--
--   nops_cull_monitoring_rate    one row per kind: admin, fc.
--   nops_cull_monitoring_people  one row per person. nursery is empty for an
--                                admin and names the nursery for an FC.
--
-- SEEDED WITH WHAT IS IN FORCE TODAY, which is the opposite of the usual
-- rule here about not seeding defaults. A tick nobody made is not a
-- signature, and this is not a tick. The rule already exists and is already
-- being paid, so a table that started empty would take every one of these
-- five people to nought on the next claim.
--
-- Each block is seeded only while it is EMPTY, so a second run cannot put
-- back somebody the office took off.
--
-- REMOVE REALLY REMOVES THE ROW, which the office asked for and is right
-- here: *"Remove直接删除就可以了 错的话 我可以add回来"*. The usual rule in
-- this system is a record and never a deletion, and it is about DECISIONS
-- and EVENTS -- a rejected signup, a plot an admin closed, work somebody
-- did. This is a settings list. Nothing happened that a removed row is the
-- evidence of, and putting somebody back is one pick of a dropdown.
--
-- What the office does have to know is on the card where it is edited: a
-- price or a name changed here MOVES WHAT AN ALREADY-CHECKED MONTH COMES
-- TO. Checked freezes WHICH PLOTS a month pays and the days they took, and
-- it does NOT freeze the names or the price.
--
-- Nothing in PALMS, the ledger, the Checks or the by-hand records is changed
-- by running this.
--
-- Safe to run twice: IF NOT EXISTS throughout, the policies are dropped by
-- name and made again, and both seeds are guarded on the block being empty.
--
-- WHAT A GOOD RESULT LOOKS LIKE -- five rows:
--   1  the price table ................. present -- OK
--   2  the people table ................ present -- OK
--   3  the two prices .................. admin RM 20.00, fc RM 50.00
--   4  who is on the rule .............. 2 admin, 3 FC -- OK
--   5  office logins that can edit it .. N of N -- OK
-- Row 3 and row 4 are what the rule now says, and on a first run they are
-- exactly what the code said before it. Row 5 is the proof: as every login
-- holding Work Maintenance it writes a person and a price, then rolls the
-- lot back, so nothing is left behind. Anything short of N of N names the
-- login and the reason.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nops_cull_monitoring_rate (
  kind        TEXT PRIMARY KEY CHECK (kind IN ('admin', 'fc')),
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
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nops_cull_mon_people_live
  ON public.nops_cull_monitoring_people (kind, nursery);

-- An earlier version of this file marked a removal instead of making one,
-- so a database that ran THAT one may be carrying rows nothing reads and
-- two columns nothing writes. Taking the marked rows out is what the office
-- asked for; the columns go with them. Guarded, so this does nothing at all
-- on a database that never saw the old shape.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'nops_cull_monitoring_people'
                AND column_name = 'active') THEN
    DELETE FROM public.nops_cull_monitoring_people WHERE active IS FALSE;
    ALTER TABLE public.nops_cull_monitoring_people DROP COLUMN IF EXISTS active;
    ALTER TABLE public.nops_cull_monitoring_people DROP COLUMN IF EXISTS removed_by;
    ALTER TABLE public.nops_cull_monitoring_people DROP COLUMN IF EXISTS removed_at;
  END IF;
END $$;

-- The rule as it stands in the code today, so running this changes nothing.
-- Guarded on the table being EMPTY and not on each row, or a second run
-- would put back whoever the office has taken off.
INSERT INTO public.nops_cull_monitoring_rate (kind, rm)
SELECT 'admin', 20
WHERE NOT EXISTS (SELECT 1 FROM public.nops_cull_monitoring_rate WHERE kind = 'admin');

INSERT INTO public.nops_cull_monitoring_rate (kind, rm)
SELECT 'fc', 50
WHERE NOT EXISTS (SELECT 1 FROM public.nops_cull_monitoring_rate WHERE kind = 'fc');

INSERT INTO public.nops_cull_monitoring_people (kind, nursery, worker_name, created_by)
SELECT v.kind, v.nursery, v.worker_name, 'RUN_ME_cull_monitoring_rule.sql'
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

NOTIFY pgrst, 'reload schema';

-- The proof: as each office login, add a person and change a price, then put
-- both back. Nothing is left behind.
SELECT set_config('mjm.cm_pass', '0', false),
       set_config('mjm.cm_total', '0', false),
       set_config('mjm.cm_bad', '', false);

DO $$
DECLARE
  p      record;
  good   boolean;
  why    text;
  who    text;
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

      INSERT INTO public.nops_cull_monitoring_people (kind, nursery, worker_name, created_by)
      VALUES ('admin', '', 'MJM probe row', who);
      DELETE FROM public.nops_cull_monitoring_people WHERE worker_name = 'MJM probe row';

      UPDATE public.nops_cull_monitoring_rate SET rm = rm WHERE kind = 'admin';

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

-- Five rows. Row 3 and row 4 are what the rule now says, and on a first run
-- they are exactly what the code said before it. Row 5 is the proof, and OK
-- means the count matched -- nothing else.
SELECT 1 AS n, 'the price table' AS what,
       CASE WHEN to_regclass('public.nops_cull_monitoring_rate') IS NULL
            THEN 'MISSING -- NOT OK' ELSE 'present -- OK' END AS answer
UNION ALL
SELECT 2, 'the people table',
       CASE WHEN to_regclass('public.nops_cull_monitoring_people') IS NULL
            THEN 'MISSING -- NOT OK' ELSE 'present -- OK' END
UNION ALL
SELECT 3, 'the two prices',
       COALESCE((SELECT string_agg(kind || ' RM ' || to_char(rm, 'FM999990.00'), ', '
                                   ORDER BY kind)
                 FROM public.nops_cull_monitoring_rate), 'none -- NOT OK')
UNION ALL
SELECT 4, 'who is on the rule',
       COALESCE((SELECT count(*) FILTER (WHERE kind = 'admin')::text || ' admin, '
                      || count(*) FILTER (WHERE kind = 'fc')::text || ' FC'
                 FROM public.nops_cull_monitoring_people), 'none -- NOT OK')
UNION ALL
SELECT 5, 'office logins that can edit it',
       COALESCE(current_setting('mjm.cm_pass', true), '0') || ' of '
       || COALESCE(current_setting('mjm.cm_total', true), '0')
       || CASE WHEN COALESCE(current_setting('mjm.cm_pass', true), '0')
                  = COALESCE(current_setting('mjm.cm_total', true), '0')
               THEN ' -- OK'
               ELSE ' -- NOT OK: ' || COALESCE(current_setting('mjm.cm_bad', true), '') END
ORDER BY 1;
