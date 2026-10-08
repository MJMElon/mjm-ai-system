-- ════════════════════════════════════════════════════════════════════════
-- THE AUDIT MODULE GRANT DECIDES WHO MAY SAVE AN AUDIT
--
-- Settings, User Access, Edit Access is where the office says who may open
-- the auditor portal, and it writes permissions modules audit. That is the
-- answer somebody deliberately gave, and it is the one the database has to
-- obey.
--
-- The previous repair replaced that gate with a test on user_type, because
-- at the time almost no account carried the module grant and every save was
-- being refused. It fixed the office accounts and broke the auditors: an
-- auditor login is marked the same way a buyer is, so the two cannot be
-- told apart by user_type, and the one thing that DOES tell them apart --
-- the grant the office made on User Access -- had just been taken out of
-- the gate.
--
-- So both count, OR ed:
--
--   the audit module is granted      -- what User Access writes. This is
--                                       the auditor accounts.
--   or the login is office staff     -- a profile not marked customer.
--                                       This is who the last repair let in,
--                                       and taking it away now would refuse
--                                       everybody it just fixed.
--
-- A customer account with no grant is refused, which is correct and is the
-- whole point of the User Access page.
--
-- Safe to run twice.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public._mjm_audit_tables AS
SELECT unnest(ARRAY['audit_plot_audits',
                    'audit_height_records',
                    'audit_papan_audits',
                    'audit_batches',
                    'audit_maintenance_tasks',
                    'audit_maintenance_audits']) AS name;

CREATE OR REPLACE FUNCTION public._mjm_has_module(m text, lv text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM shared_profiles p
     WHERE p.id = auth.uid()
       AND (p.permissions -> 'modules' ->> m) = ANY(lv)
  );
$fn$;

CREATE OR REPLACE FUNCTION public._mjm_is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM shared_profiles p
     WHERE p.id = auth.uid()
       AND COALESCE(p.user_type, 'system') <> 'customer'
  );
$fn$;

CREATE OR REPLACE FUNCTION public._mjm_is_audit_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM shared_profiles p
     WHERE p.id = auth.uid()
       AND ( lower(COALESCE(p.role, '')) IN ('admin', 'administrator')
          OR (p.permissions -> 'modules' ->> 'audit') = 'admin' )
  );
$fn$;

-- The one gate the audit policies ask. Named so the next person can see
-- there is exactly one, rather than finding the rule copied into
-- twenty four policies and two of them out of step.
CREATE OR REPLACE FUNCTION public._mjm_can_audit()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT public._mjm_has_module('audit', ARRAY['admin','normal'])
      OR public._mjm_is_staff();
$fn$;

REVOKE ALL ON FUNCTION public._mjm_has_module(text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._mjm_is_staff()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public._mjm_is_audit_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._mjm_can_audit()      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._mjm_has_module(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public._mjm_is_staff()       TO authenticated;
GRANT EXECUTE ON FUNCTION public._mjm_is_audit_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public._mjm_can_audit()      TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT name FROM public._mjm_audit_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    -- Every policy name this table has carried through three repairs,
    -- dropped before the new ones go on. A leftover from an older round
    -- sitting beside the new one is how a gate ends up disagreeing with
    -- itself.
    EXECUTE format('DROP POLICY IF EXISTS "audit_module_read"   ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "audit_module_write"  ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "audit_staff_read"    ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "audit_staff_insert"  ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "audit_staff_update"  ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "audit_admin_delete"  ON public.%I', t);

    EXECUTE format($p$CREATE POLICY "audit_staff_read" ON public.%I
                        FOR SELECT TO authenticated
                        USING (public._mjm_can_audit())$p$, t);
    EXECUTE format($p$CREATE POLICY "audit_staff_insert" ON public.%I
                        FOR INSERT TO authenticated
                        WITH CHECK (public._mjm_can_audit())$p$, t);
    EXECUTE format($p$CREATE POLICY "audit_staff_update" ON public.%I
                        FOR UPDATE TO authenticated
                        USING (public._mjm_can_audit())
                        WITH CHECK (public._mjm_can_audit())$p$, t);
    EXECUTE format($p$CREATE POLICY "audit_admin_delete" ON public.%I
                        FOR DELETE TO authenticated
                        USING (public._mjm_is_audit_admin())$p$, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── THE CHECK ───────────────────────────────────────────────────────────
-- Row 1 is the one that matters: it REALLY INSERTS a row as each account
-- that User Access has granted the audit module to, and rolls it back. Not
-- an inspection of the gate -- an inspection reported green twice while the
-- field was being refused.
--
-- Row 2 is the office accounts, same test. Row 3 proves the gate still
-- turns somebody away, so a green row 1 means something.
--
-- A good result:
--   1 | logins GRANTED the audit module that really saved: 2 of 2 -- OK
--   2 | office logins that really saved: 46 of 46 -- OK
--   3 | logins with neither grant nor staff, correctly refused: 229 -- OK
SELECT set_config('mjm.g_ok','0',false), set_config('mjm.g_n','0',false),
       set_config('mjm.s_ok','0',false), set_config('mjm.s_n','0',false),
       set_config('mjm.no','0',false),   set_config('mjm.bad','',false);

DO $$
DECLARE
  u      RECORD;
  good   BOOLEAN;
  why    TEXT;
  granted BOOLEAN;
  staff   BOOLEAN;
BEGIN
  FOR u IN SELECT au.id, au.email,
                  (p.permissions -> 'modules' ->> 'audit') IN ('admin','normal') AS has_grant,
                  p.id IS NOT NULL
                    AND COALESCE(p.user_type,'system') <> 'customer'            AS is_staff
             FROM auth.users au
             LEFT JOIN public.shared_profiles p ON p.id = au.id
            ORDER BY au.email LOOP

    granted := COALESCE(u.has_grant, false);
    staff   := COALESCE(u.is_staff, false);

    IF NOT granted AND NOT staff THEN
      PERFORM set_config('mjm.no', (current_setting('mjm.no')::int + 1)::text, false);
      CONTINUE;
    END IF;

    good := false; why := '';
    BEGIN
      PERFORM set_config('request.jwt.claims',
              json_build_object('sub', u.id::text, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.audit_maintenance_audits (id) VALUES (DEFAULT);
      good := true;
      RAISE EXCEPTION 'mjm_probe_rollback';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'mjm_probe_rollback' THEN good := false; why := left(SQLERRM, 70); END IF;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    IF granted THEN
      PERFORM set_config('mjm.g_n', (current_setting('mjm.g_n')::int + 1)::text, false);
      IF good THEN PERFORM set_config('mjm.g_ok', (current_setting('mjm.g_ok')::int + 1)::text, false); END IF;
    ELSE
      PERFORM set_config('mjm.s_n', (current_setting('mjm.s_n')::int + 1)::text, false);
      IF good THEN PERFORM set_config('mjm.s_ok', (current_setting('mjm.s_ok')::int + 1)::text, false); END IF;
    END IF;

    IF NOT good THEN
      PERFORM set_config('mjm.bad',
              CASE WHEN COALESCE(current_setting('mjm.bad'),'') = ''
                   THEN '' ELSE current_setting('mjm.bad') || '; ' END
              || COALESCE(u.email, u.id::text) || ' (' || why || ')', false);
    END IF;
  END LOOP;
END $$;

SELECT 1 AS n, 'logins GRANTED the audit module that really saved: ' ||
       current_setting('mjm.g_ok') || ' of ' || current_setting('mjm.g_n') ||
       CASE WHEN current_setting('mjm.g_ok') = current_setting('mjm.g_n')
            THEN ' -- OK' ELSE ' -- NOT OK' END AS result
UNION ALL
SELECT 2, 'office logins that really saved: ' ||
       current_setting('mjm.s_ok') || ' of ' || current_setting('mjm.s_n') ||
       CASE WHEN current_setting('mjm.s_ok') = current_setting('mjm.s_n')
            THEN ' -- OK' ELSE ' -- NOT OK' END
UNION ALL
SELECT 3, 'logins with neither the grant nor staff, correctly refused: ' ||
       current_setting('mjm.no') ||
       CASE WHEN current_setting('mjm.no')::int > 0
            THEN ' -- OK, the gate still turns somebody away'
            ELSE ' -- NOT OK, nothing is being refused so row 1 proves nothing' END
UNION ALL
SELECT 4, CASE WHEN COALESCE(current_setting('mjm.bad'),'') = ''
               THEN 'nobody who should have saved was refused -- OK'
               ELSE 'REFUSED: ' || left(current_setting('mjm.bad'), 400) END
 ORDER BY 1;
