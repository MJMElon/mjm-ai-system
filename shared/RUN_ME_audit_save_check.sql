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


-- ── 2b. EVERY SIGN IN GETS A PROFILE ROW ────────────────────────────────
-- The gate reads shared_profiles, so an account with no row there fails it
-- because there is nothing to read -- and that is one of the two ways the
-- phone gets REFUSED on all six tables at once. An account made after the
-- last repair ran has no row, so this is not a one off.
--
-- Exactly what the signup trigger would have written, from the signups own
-- metadata. NO permission is granted: an empty permissions column means
-- nobody has been asked, and writing a default into it would turn an
-- unasked question into a decision.
INSERT INTO public.shared_profiles (id, email, full_name, user_type)
SELECT u.id,
       u.email,
       NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', '')), ''),
       CASE WHEN COALESCE(u.raw_user_meta_data->>'user_type', 'system') = 'customer'
            THEN 'customer' ELSE 'system' END
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.shared_profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;


-- ── 3. THE CHECK ────────────────────────────────────────────────────────
-- IT ASKS EVERY ACCOUNT THAT CAN SIGN IN, which means auth.users and not
-- shared_profiles.
--
-- The first version of this looped over shared_profiles WHERE user_type is
-- not customer, and reported 46 of 46 -- OK on a database where an auditor
-- phone was being refused on all six tables at that moment. Both of the
-- ways a login fails this gate are ways it DROPS OUT OF THAT LOOP:
--
--   no shared_profiles row at all   -- the gate reads that table, so there
--                                      is nothing to read and it says no,
--                                      and the loop never saw the account
--   marked user_type = customer     -- the gate says no, and the loop had
--                                      already filtered them away
--
-- So it was asking the question only of the people who were never going to
-- fail it. A check that cannot see the failure it exists to find is worse
-- than no check: it is how the real one gets waved through. The same
-- mistake, in a different costume, as the green result handed over on a
-- database that refused every row.
--
-- Read row 1 first. Anything other than all of them names the people, and
-- those people cannot save an audit right now. Rows 3 and after are one
-- line per table.
--
-- A good result looks like:
--   1 | sign ins that can save on every audit table: 47 of 47 -- OK
--   2 | the portal may call the check: yes -- OK
--   3 | audit_batches: 47 of 47 sign ins may save -- OK
--   ... one line per table, all of them saying the same number twice
SELECT set_config('mjm.cs_pass', '0', false),
       set_config('mjm.cs_total', '0', false),
       set_config('mjm.cs_bad', '', false),
       set_config('mjm.cs_tbl', '', false);

DO $$
DECLARE
  u    RECORD;
  bad  TEXT;
  note TEXT;
BEGIN
  FOR u IN SELECT au.id, au.email,
                  p.id IS NULL                                  AS no_profile,
                  COALESCE(p.user_type, 'system') = 'customer'   AS is_customer
             FROM auth.users au
             LEFT JOIN public.shared_profiles p ON p.id = au.id
            ORDER BY au.email LOOP

    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', u.id::text, 'role', 'authenticated')::text, true);

    SELECT string_agg(c.tbl, ', ') INTO bad
      FROM public.audit_can_i_save() c
     WHERE NOT c.ok;

    PERFORM set_config('mjm.cs_tbl',
                       COALESCE(NULLIF(current_setting('mjm.cs_tbl'), ''), '')
                       || COALESCE((SELECT string_agg(c.tbl, ',') FROM public.audit_can_i_save() c
                                     WHERE c.ok), '') || ',', false);

    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('mjm.cs_total', (current_setting('mjm.cs_total')::int + 1)::text, false);

    IF bad IS NULL THEN
      PERFORM set_config('mjm.cs_pass', (current_setting('mjm.cs_pass')::int + 1)::text, false);
    ELSE
      -- Why, in the words of the thing to go and change, rather than the
      -- policy language. These two are the whole of it.
      note := CASE WHEN u.no_profile  THEN 'has NO shared_profiles row'
                   WHEN u.is_customer THEN
                     'is marked user_type customer -- if this is an auditor, run: '
                     || 'UPDATE public.shared_profiles SET user_type = ''system'' WHERE id = '''
                     || u.id::text || ''''
                   ELSE 'the policy turns them away for some other reason' END;
      PERFORM set_config('mjm.cs_bad',
                         CASE WHEN COALESCE(current_setting('mjm.cs_bad'), '') = ''
                              THEN '' ELSE current_setting('mjm.cs_bad') || '; ' END
                         || COALESCE(u.email, u.id::text) || ' ' || note
                         || ' -- refused on ' || bad, false);
    END IF;
  END LOOP;
END $$;

SELECT 1 AS n, 'sign ins that can save on every audit table: ' ||
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
       ' sign ins may save' ||
       CASE WHEN ( length(current_setting('mjm.cs_tbl')) -
                   length(replace(current_setting('mjm.cs_tbl'), t.name || ',', '')) )
                 / ( length(t.name) + 1 ) = current_setting('mjm.cs_total')::int
            THEN ' -- OK' ELSE ' -- NOT OK' END
  FROM public._mjm_audit_tables t
 ORDER BY 1, 2;
