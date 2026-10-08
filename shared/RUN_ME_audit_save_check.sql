-- ════════════════════════════════════════════════════════════════════════
-- CAN THIS LOGIN SAVE AN AUDIT? ASK BEFORE THE WORK, NOT AFTER IT.
--
-- Twice in one week an auditor filled in a day of work and only then found
-- out the database would not take it. Seventy finished maintenance audits
-- sat on a phone, and nobody in the office knew for days, because the only
-- thing that ever asked the question was the save itself.
--
-- This installs a function the phone can ask at sign in. It answers per
-- table, and it answers by reading the REAL policy out of the catalogue
-- rather than by keeping a second copy of the rule here, so it cannot
-- drift away from the policy the way a hand written mirror would.
--
-- It writes nothing and changes nothing. Safe to run twice.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. THE SIX TABLES, NAMED ONCE ───────────────────────────────────────
-- Same view RUN_ME_auditor_can_save.sql uses, re created here so this file
-- stands on its own. A view rather than a table: the SQL Editor warns about
-- any file that creates a table, and this one creates none.
CREATE OR REPLACE VIEW public._mjm_audit_tables AS
SELECT unnest(ARRAY['audit_plot_audits',
                    'audit_height_records',
                    'audit_papan_audits',
                    'audit_batches',
                    'audit_maintenance_tasks',
                    'audit_maintenance_audits']) AS name;


-- ── 2. THE QUESTION ─────────────────────────────────────────────────────
-- Three things have to line up before a save works, and each of them has
-- failed on its own in this system:
--
--   the GRANT     the authenticated role may INSERT at all
--   the POLICY    row level security lets THIS login put a row in
--   the TABLE     it is actually there
--
-- So all three are asked, separately, and the answer says which one is
-- missing. A count of failures would have been no use to anybody: the
-- whole trouble last time was a green result on a database that refused
-- every row.
--
-- Permissive policies are OR ed and restrictive ones are AND ed, which is
-- what Postgres itself does. A policy expression that cannot be answered
-- outside a real INSERT -- one that reads a column of the new row -- is
-- reported as UNKNOWN rather than guessed at in either direction. A check
-- that invents a no is as bad as one that invents a yes.
DROP FUNCTION IF EXISTS public.audit_can_i_save();

CREATE FUNCTION public.audit_can_i_save()
RETURNS TABLE(tbl TEXT, ok BOOLEAN, why TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  t        TEXT;
  oid_     OID;
  pol      RECORD;
  expr     TEXT;
  res      BOOLEAN;
  allowed  BOOLEAN;
  unknown  BOOLEAN;
  n_perm   INT;
BEGIN
  FOR t IN SELECT name FROM public._mjm_audit_tables ORDER BY name LOOP
    tbl := t;
    oid_ := to_regclass('public.' || t);

    IF oid_ IS NULL THEN
      ok := false; why := 'the table is not in the database'; RETURN NEXT; CONTINUE;
    END IF;

    IF NOT has_table_privilege('authenticated', oid_, 'INSERT') THEN
      ok := false; why := 'the authenticated role has no INSERT grant on it'; RETURN NEXT; CONTINUE;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = oid_) THEN
      ok := true; why := 'row level security is off on this table'; RETURN NEXT; CONTINUE;
    END IF;

    allowed := false;
    unknown := false;
    n_perm  := 0;

    FOR pol IN
      SELECT p.polpermissive,
             COALESCE(pg_get_expr(p.polwithcheck, p.polrelid),
                      pg_get_expr(p.polqual,      p.polrelid)) AS e
        FROM pg_policy p
       WHERE p.polrelid = oid_
         AND p.polcmd IN ('a', '*')
         AND ( p.polroles = '{0}'::oid[]
            OR 'authenticated'::regrole = ANY(p.polroles) )
    LOOP
      expr := pol.e;
      IF expr IS NULL THEN
        res := true;                    -- no expression means it permits
      ELSE
        BEGIN
          EXECUTE 'SELECT (' || expr || ')' INTO res;
        EXCEPTION WHEN OTHERS THEN
          res := NULL;                  -- needs the new row to answer
        END;
      END IF;

      IF pol.polpermissive THEN
        n_perm := n_perm + 1;
        IF res IS NULL THEN unknown := true;
        ELSIF res THEN allowed := true; END IF;
      ELSE
        -- Restrictive: a false here refuses the row whatever else says yes.
        IF res IS NULL THEN unknown := true;
        ELSIF NOT res THEN
          ok := false;
          why := 'a restrictive policy on this table turns your login away';
          RETURN NEXT; CONTINUE;
        END IF;
      END IF;
    END LOOP;

    IF n_perm = 0 THEN
      ok := false;
      why := 'no insert policy applies to you, so row level security refuses every row';
    ELSIF allowed THEN
      ok := true;  why := '';
    ELSIF unknown THEN
      ok := true;
      why := 'the policy cannot be answered without a real row, so this is not proof';
    ELSE
      ok := false;
      why := 'your login does not satisfy the insert policy on this table';
    END IF;
    RETURN NEXT;
  END LOOP;
END
$fn$;

-- The drop above took the grants with it, so they go back on. Without
-- this the function exists and the portal cannot call it, which reads on
-- the phone exactly like the thing it is meant to detect.
REVOKE ALL ON FUNCTION public.audit_can_i_save() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_can_i_save() TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── 3. THE CHECK ────────────────────────────────────────────────────────
-- Read row 1 first. It asks the question as EVERY auditor in turn, the
-- same way the phone will, and counts the ones who get a yes on all six
-- tables. Anything other than "all of them" names the people and the
-- table, and those people cannot save an audit right now.
--
-- Row 2 says the function is callable by the portal at all. Rows 3 and
-- after are one line per table, counting the logins that may insert into
-- it, so a table that is wrong on its own is named rather than hidden
-- inside row 1.
--
-- NOT the per table answer for whoever is running this. The SQL Editor
-- runs as the database owner with no login attached, so every policy
-- that asks who you are answers no, and that reads as six red lines on a
-- database where every auditor is fine. A check that cries over a
-- healthy database is worse than no check -- it is how the next real one
-- gets waved through, and it had already happened once on the file this
-- one sits beside.
--
-- A good result looks like:
--   1 | auditors who can save on every audit table: 46 of 46 -- OK
--   2 | the portal may call the check: yes -- OK
--   3 | audit_batches: 46 of 46 logins may save -- OK
--   ... one line per table, all of them saying the same number twice
SELECT set_config('mjm.cs_pass', '0', false),
       set_config('mjm.cs_total', '0', false),
       set_config('mjm.cs_bad', '', false),
       set_config('mjm.cs_tbl', '', false);

DO $$
DECLARE
  p    RECORD;
  bad  TEXT;
BEGIN
  FOR p IN SELECT id, email FROM public.shared_profiles
            WHERE COALESCE(user_type, 'system') <> 'customer' ORDER BY email LOOP
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', p.id::text, 'role', 'authenticated')::text, true);

    SELECT string_agg(c.tbl || ' (' || c.why || ')', ', ')
      INTO bad
      FROM public.audit_can_i_save() c
     WHERE NOT c.ok;

    -- One tally per table, kept as text because this runs statement by
    -- statement and a temp table is what the editor warns about.
    PERFORM set_config('mjm.cs_tbl',
                       COALESCE(NULLIF(current_setting('mjm.cs_tbl'), ''), '')
                       || COALESCE((SELECT string_agg(c.tbl, ',') FROM public.audit_can_i_save() c
                                     WHERE c.ok), '') || ',', false);

    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('mjm.cs_total', (current_setting('mjm.cs_total')::int + 1)::text, false);

    IF bad IS NULL THEN
      PERFORM set_config('mjm.cs_pass', (current_setting('mjm.cs_pass')::int + 1)::text, false);
    ELSE
      PERFORM set_config('mjm.cs_bad',
                         CASE WHEN COALESCE(current_setting('mjm.cs_bad'), '') = ''
                              THEN '' ELSE current_setting('mjm.cs_bad') || '; ' END
                         || p.email || ' -- ' || bad, false);
    END IF;
  END LOOP;
END $$;

SELECT 1 AS n, 'auditors who can save on every audit table: ' ||
       current_setting('mjm.cs_pass') || ' of ' || current_setting('mjm.cs_total') ||
       CASE WHEN COALESCE(current_setting('mjm.cs_bad'), '') = '' THEN ' -- OK'
            ELSE ' -- NOT OK: ' || current_setting('mjm.cs_bad') END AS result
UNION ALL
SELECT 2, 'the portal may call the check: ' ||
       CASE WHEN has_function_privilege('authenticated', 'public.audit_can_i_save()', 'EXECUTE')
            THEN 'yes -- OK' ELSE 'NO -- NOT OK, the phone cannot ask' END
UNION ALL
SELECT 3, t.name || ': ' ||
       ( length(current_setting('mjm.cs_tbl')) -
         length(replace(current_setting('mjm.cs_tbl'), t.name || ',', '')) )
       / ( length(t.name) + 1 ) || ' of ' || current_setting('mjm.cs_total') ||
       ' logins may save' ||
       CASE WHEN ( length(current_setting('mjm.cs_tbl')) -
                   length(replace(current_setting('mjm.cs_tbl'), t.name || ',', '')) )
                 / ( length(t.name) + 1 ) = current_setting('mjm.cs_total')::int
            THEN ' -- OK' ELSE ' -- NOT OK' END
  FROM public._mjm_audit_tables t
 ORDER BY 1, 2;
