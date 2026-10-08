-- ════════════════════════════════════════════════════════════════════════
-- RECORD A NEW AUDIT IS THE TICK THAT DECIDES
--
-- Settings, User Access, Edit Access is where the office says who may do
-- what in the auditor portal, and the tick called "Record a new audit" is
-- the one that means this. It writes
--
--     permissions audit_actions <page> record
--
-- with page being plot_audit, height, papan or maintenance. That is the
-- answer somebody deliberately gave, and it is the one the database has to
-- obey.
--
-- It has been got wrong twice, in opposite directions, and both times the
-- field could not record anything:
--
--   gate one   modules audit had to be admin or normal -- almost no
--              account carried it, so seventy finished audits piled up on
--              a phone with nowhere to go
--   gate two   user_type had to not be customer -- which cannot tell an
--              auditor from a buyer, and threw away the User Access
--              answer entirely
--
-- So the gate is now the two things the office actually sets, in the order
-- that page presents them:
--
--   MAY THEY OPEN THE MODULE AT ALL   the audit module is granted, or the
--                                     login is office staff. A customer
--                                     with neither is refused, which is
--                                     the point of the page.
--   MAY THEY RECORD ON THIS ONE       the Record a new audit tick for that
--                                     page. UNSET MEANS YES, the same way
--                                     canOpenAuditPage in audit_supabase.js
--                                     treats an unconfigured user -- access
--                                     fails open, and an auditor nobody has
--                                     restricted is not a question. Only an
--                                     explicit untick refuses.
--
-- Untick Record a new audit for Maintenance and that login stops being able
-- to save a maintenance audit, on the phone and in the database, while its
-- other audits carry on. That is what the tick is for.
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

-- The one gate every audit policy asks. One function, not the rule copied
-- into twenty four policies with two of them out of step.
--
-- page is the key audit_user_access.html uses -- plot_audit, height, papan,
-- maintenance -- or NULL for a table that is not one page, where any
-- Record tick will do.
CREATE OR REPLACE FUNCTION public._mjm_can_record_audit(page text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM shared_profiles p
     WHERE p.id = auth.uid()
       -- may they open the module at all
       AND ( COALESCE(p.user_type, 'system') <> 'customer'
          OR (p.permissions -> 'modules' ->> 'audit') IN ('admin', 'normal') )
       -- and may they record on this page. Unset means yes.
       AND ( page IS NULL
          OR COALESCE( (p.permissions -> 'audit_actions' -> page ->> 'record') <> 'false',
                       true ) )
  );
$fn$;

REVOKE ALL ON FUNCTION public._mjm_is_audit_admin()         FROM PUBLIC;
REVOKE ALL ON FUNCTION public._mjm_can_record_audit(text)   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._mjm_is_audit_admin()       TO authenticated;
GRANT EXECUTE ON FUNCTION public._mjm_can_record_audit(text) TO authenticated;

DO $$
DECLARE
  t    TEXT;
  pg   TEXT;
  arg  TEXT;
BEGIN
  FOR t IN SELECT name FROM public._mjm_audit_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    -- Which User Access page this table belongs to. audit_batches is not
    -- one page -- a height audit and a plot audit both lean on it -- so it
    -- asks the module question only.
    pg := CASE t
            WHEN 'audit_plot_audits'        THEN 'plot_audit'
            WHEN 'audit_height_records'     THEN 'height'
            WHEN 'audit_papan_audits'       THEN 'papan'
            WHEN 'audit_maintenance_audits' THEN 'maintenance'
            WHEN 'audit_maintenance_tasks'  THEN 'maintenance'
            ELSE NULL END;
    arg := CASE WHEN pg IS NULL THEN 'NULL' ELSE quote_literal(pg) END;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    -- Every policy name this table has carried through three repairs. A
    -- leftover sitting beside the new one is how a gate disagrees with
    -- itself.
    EXECUTE format('DROP POLICY IF EXISTS "audit_module_read"  ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "audit_module_write" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "audit_staff_read"   ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "audit_staff_insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "audit_staff_update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "audit_admin_delete" ON public.%I', t);

    -- Reading is the module question only. An auditor who may not RECORD a
    -- maintenance audit can still be shown the list, which is what the
    -- portal has always done.
    EXECUTE format($p$CREATE POLICY "audit_staff_read" ON public.%I
                        FOR SELECT TO authenticated
                        USING (public._mjm_can_record_audit(NULL))$p$, t);
    EXECUTE format($p$CREATE POLICY "audit_staff_insert" ON public.%I
                        FOR INSERT TO authenticated
                        WITH CHECK (public._mjm_can_record_audit(%s))$p$, t, arg);
    EXECUTE format($p$CREATE POLICY "audit_staff_update" ON public.%I
                        FOR UPDATE TO authenticated
                        USING (public._mjm_can_record_audit(%s))
                        WITH CHECK (public._mjm_can_record_audit(%s))$p$, t, arg, arg);
    EXECUTE format($p$CREATE POLICY "audit_admin_delete" ON public.%I
                        FOR DELETE TO authenticated
                        USING (public._mjm_is_audit_admin())$p$, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── THE CHECK ───────────────────────────────────────────────────────────
-- Every row below REALLY INSERTS a maintenance audit as that login and
-- rolls it back. Not an inspection of the gate: an inspection reported
-- green twice while the field was being refused.
--
-- A good result:
--   1 | logins allowed to record a maintenance audit that really saved: 48 of 48 -- OK
--   2 | logins NOT allowed, correctly refused: 229 -- OK
--   3 | nobody who should have saved was refused -- OK
--
-- Row 2 mattering is the whole point: if it is nought then row 1 proves
-- nothing, because a gate that refuses nobody passes everybody.
SELECT set_config('mjm.ok','0',false), set_config('mjm.n','0',false),
       set_config('mjm.no','0',false), set_config('mjm.bad','',false);

DO $$
DECLARE
  u     RECORD;
  may   BOOLEAN;
  good  BOOLEAN;
  why   TEXT;
BEGIN
  FOR u IN SELECT id, email FROM auth.users ORDER BY email LOOP
    PERFORM set_config('request.jwt.claims',
            json_build_object('sub', u.id::text, 'role', 'authenticated')::text, true);
    may := public._mjm_can_record_audit('maintenance');

    IF NOT may THEN
      PERFORM set_config('request.jwt.claims', '', true);
      PERFORM set_config('mjm.no', (current_setting('mjm.no')::int + 1)::text, false);
      CONTINUE;
    END IF;

    good := false; why := '';
    BEGIN
      SET LOCAL ROLE authenticated;
      INSERT INTO public.audit_maintenance_audits (id) VALUES (DEFAULT);
      good := true;
      RAISE EXCEPTION 'mjm_probe_rollback';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'mjm_probe_rollback' THEN good := false; why := left(SQLERRM, 70); END IF;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);

    PERFORM set_config('mjm.n', (current_setting('mjm.n')::int + 1)::text, false);
    IF good THEN
      PERFORM set_config('mjm.ok', (current_setting('mjm.ok')::int + 1)::text, false);
    ELSE
      PERFORM set_config('mjm.bad',
              CASE WHEN COALESCE(current_setting('mjm.bad'),'') = ''
                   THEN '' ELSE current_setting('mjm.bad') || '; ' END
              || COALESCE(u.email, u.id::text) || ' (' || why || ')', false);
    END IF;
  END LOOP;
END $$;

SELECT 1 AS n, 'logins allowed to record a maintenance audit that really saved: ' ||
       current_setting('mjm.ok') || ' of ' || current_setting('mjm.n') ||
       CASE WHEN current_setting('mjm.ok') = current_setting('mjm.n')
            THEN ' -- OK' ELSE ' -- NOT OK' END AS result
UNION ALL
SELECT 2, 'logins NOT allowed, correctly refused: ' || current_setting('mjm.no') ||
       CASE WHEN current_setting('mjm.no')::int > 0
            THEN ' -- OK, the gate still turns somebody away'
            ELSE ' -- NOT OK, nothing is refused so row 1 proves nothing' END
UNION ALL
SELECT 3, CASE WHEN COALESCE(current_setting('mjm.bad'),'') = ''
               THEN 'nobody who should have saved was refused -- OK'
               ELSE 'REFUSED: ' || left(current_setting('mjm.bad'), 400) END
 ORDER BY 1;
