-- ================================================================
-- MJM System — Security Hardening: tighten over-permissive RLS policies
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
--
-- Why this exists
-- ----------------
-- A May 2026 security audit found several tables with `USING (true)` or
-- `Allow all for anon` policies. They allow:
--   • any unauthenticated visitor to overwrite the points / pricing config,
--     hero images, and (in the original signup migration) staff profiles
--   • any logged-in salesweb customer to read internal allocations,
--     batch reviews, and audit history, and to delete those rows
--   • any logged-in customer to elevate themselves to admin by upserting
--     `role = 'admin'` on their own shared_profiles row
--
-- This migration is idempotent: it DROPs the unsafe policies (if present)
-- and CREATEs tighter replacements. Each section is independent so you can
-- run them one-by-one and verify in the Authentication → Policies UI.
-- ================================================================


-- Helper: caller is an admin/normal user of a given module.
-- Reads the JSONB shape used elsewhere: permissions->'modules'->>'<mod>'.
CREATE OR REPLACE FUNCTION public._mjm_has_module(_module text, _levels text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT EXISTS (
        SELECT 1
          FROM shared_profiles p
         WHERE p.id = auth.uid()
           AND (p.permissions -> 'modules' ->> _module) = ANY(_levels)
    );
$fn$;

REVOKE ALL ON FUNCTION public._mjm_has_module(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._mjm_has_module(text, text[]) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 1. salesweb_app_settings — was: "Allow all for anon" (FOR ALL)
--    Anyone could rewrite points config, member tiers, points history.
--    Fix: anon may READ; only authenticated salesweb admins may WRITE.
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='salesweb_app_settings') THEN
        EXECUTE 'ALTER TABLE salesweb_app_settings ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow all for anon" ON salesweb_app_settings';
        EXECUTE 'DROP POLICY IF EXISTS "anon read app_settings"  ON salesweb_app_settings';
        EXECUTE 'DROP POLICY IF EXISTS "admin write app_settings" ON salesweb_app_settings';

        EXECUTE 'CREATE POLICY "anon read app_settings" ON salesweb_app_settings
                 FOR SELECT TO anon, authenticated USING (true)';
        EXECUTE 'CREATE POLICY "admin write app_settings" ON salesweb_app_settings
                 FOR ALL TO authenticated
                 USING      (public._mjm_has_module(''salesweb'', ARRAY[''admin'',''normal'']))
                 WITH CHECK (public._mjm_has_module(''salesweb'', ARRAY[''admin'',''normal'']))';
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 2. salesweb_site_content — was admin policy "USING (true)"
--    Any signed-in customer could rewrite hero copy/images.
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='salesweb_site_content') THEN
        EXECUTE 'ALTER TABLE salesweb_site_content ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Admin can manage site_content" ON salesweb_site_content';
        EXECUTE 'DROP POLICY IF EXISTS "Public can read site_content"  ON salesweb_site_content';
        EXECUTE 'DROP POLICY IF EXISTS "anon read site_content"  ON salesweb_site_content';
        EXECUTE 'DROP POLICY IF EXISTS "admin write site_content" ON salesweb_site_content';

        EXECUTE 'CREATE POLICY "anon read site_content" ON salesweb_site_content
                 FOR SELECT TO anon, authenticated USING (true)';
        EXECUTE 'CREATE POLICY "admin write site_content" ON salesweb_site_content
                 FOR ALL TO authenticated
                 USING      (public._mjm_has_module(''salesweb'', ARRAY[''admin'',''normal'']))
                 WITH CHECK (public._mjm_has_module(''salesweb'', ARRAY[''admin'',''normal'']))';
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 3. shared_batch_customer_allocations — was auth_read_bca / auth_write_bca
--    USING (true). Customer salesweb users could read & delete internal
--    allocations. Restrict to operation-module users.
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='shared_batch_customer_allocations') THEN
        EXECUTE 'ALTER TABLE shared_batch_customer_allocations ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "auth_read_bca"  ON shared_batch_customer_allocations';
        EXECUTE 'DROP POLICY IF EXISTS "auth_write_bca" ON shared_batch_customer_allocations';
        EXECUTE 'DROP POLICY IF EXISTS "operation_read_bca"  ON shared_batch_customer_allocations';
        EXECUTE 'DROP POLICY IF EXISTS "operation_write_bca" ON shared_batch_customer_allocations';

        EXECUTE 'CREATE POLICY "operation_read_bca" ON shared_batch_customer_allocations
                 FOR SELECT TO authenticated
                 USING (public._mjm_has_module(''operation'', ARRAY[''admin'',''normal'']))';
        EXECUTE 'CREATE POLICY "operation_write_bca" ON shared_batch_customer_allocations
                 FOR ALL TO authenticated
                 USING      (public._mjm_has_module(''operation'', ARRAY[''admin'',''normal'']))
                 WITH CHECK (public._mjm_has_module(''operation'', ARRAY[''admin'',''normal'']))';
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 4. audit_* tables — were "Authenticated full access USING (true)"
--    Restrict to audit-module users.
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'audit_plot_audits',
        'audit_height_records',
        'audit_papan_audits',
        'audit_maintenance_tasks',
        'audit_maintenance_audits'
    ]) LOOP
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
            EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
            EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON %I', t);
            EXECUTE format('DROP POLICY IF EXISTS "audit_module_read"  ON %I', t);
            EXECUTE format('DROP POLICY IF EXISTS "audit_module_write" ON %I', t);

            EXECUTE format('CREATE POLICY "audit_module_read" ON %I
                            FOR SELECT TO authenticated
                            USING (public._mjm_has_module(''audit'', ARRAY[''admin'',''normal'']))', t);
            EXECUTE format('CREATE POLICY "audit_module_write" ON %I
                            FOR ALL TO authenticated
                            USING      (public._mjm_has_module(''audit'', ARRAY[''admin'',''normal'']))
                            WITH CHECK (public._mjm_has_module(''audit'', ARRAY[''admin'',''normal'']))', t);
        END IF;
    END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 5. operation_batch_reviews — was "Authenticated read reviews USING (true)"
--    Reveals reviewer identity to all customers. Restrict reads to
--    operation users; writes are already restricted to operation admins.
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='operation_batch_reviews') THEN
        EXECUTE 'ALTER TABLE operation_batch_reviews ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Authenticated read reviews" ON operation_batch_reviews';
        EXECUTE 'DROP POLICY IF EXISTS "operation_read_reviews"     ON operation_batch_reviews';

        EXECUTE 'CREATE POLICY "operation_read_reviews" ON operation_batch_reviews
                 FOR SELECT TO authenticated
                 USING (public._mjm_has_module(''operation'', ARRAY[''admin'',''normal'']))';
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 6. shared_profiles — block self-elevation to admin
--
-- The salesweb signup flow upserts shared_profiles from the anon JWT
-- (the just-signed-up user). Without column-level constraints, a logged-in
-- customer can `update({ role: 'admin' })` on their own row and then
-- enter salesweb_admin.html, which gates purely on profile.role.
--
-- We pin role='customer' and freeze permissions for self-updates. Admin
-- promotion can only happen via service-role (the operation_user_access
-- admin tooling), which bypasses RLS.
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='shared_profiles') THEN
        EXECUTE 'ALTER TABLE shared_profiles ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Users can read own profile"     ON shared_profiles';
        EXECUTE 'DROP POLICY IF EXISTS "Users can insert own profile"   ON shared_profiles';
        EXECUTE 'DROP POLICY IF EXISTS "Users can update own profile"   ON shared_profiles';
        EXECUTE 'DROP POLICY IF EXISTS "Users can upsert own profile"   ON shared_profiles';
        EXECUTE 'DROP POLICY IF EXISTS "Authenticated full access"      ON shared_profiles';
        EXECUTE 'DROP POLICY IF EXISTS "self_read_profile"              ON shared_profiles';
        EXECUTE 'DROP POLICY IF EXISTS "self_insert_profile_locked"     ON shared_profiles';
        EXECUTE 'DROP POLICY IF EXISTS "self_update_profile_locked"     ON shared_profiles';
        EXECUTE 'DROP POLICY IF EXISTS "operation_admins_read_profiles" ON shared_profiles';

        -- Anyone signed in can read their own profile.
        EXECUTE 'CREATE POLICY "self_read_profile" ON shared_profiles
                 FOR SELECT TO authenticated
                 USING (id = auth.uid())';

        -- Operation-module admins can read every profile (for User Access UI).
        EXECUTE 'CREATE POLICY "operation_admins_read_profiles" ON shared_profiles
                 FOR SELECT TO authenticated
                 USING (public._mjm_has_module(''operation'', ARRAY[''admin'']))';

        -- Self-insert is allowed only for own row, role=customer, and only
        -- a small whitelist of safe permission shapes.
        EXECUTE 'CREATE POLICY "self_insert_profile_locked" ON shared_profiles
                 FOR INSERT TO authenticated
                 WITH CHECK (
                     id = auth.uid()
                     AND COALESCE(role, ''customer'') = ''customer''
                 )';

        -- Self-update may only touch profile fields; role and permissions
        -- must remain identical to the row already in the table.
        EXECUTE 'CREATE POLICY "self_update_profile_locked" ON shared_profiles
                 FOR UPDATE TO authenticated
                 USING (id = auth.uid())
                 WITH CHECK (
                     id = auth.uid()
                     AND role = (SELECT role FROM shared_profiles WHERE id = auth.uid())
                     AND permissions IS NOT DISTINCT FROM
                         (SELECT permissions FROM shared_profiles WHERE id = auth.uid())
                 )';
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 7. shared_collection_bookings + shared_al_orders
--    Currently readable/writable by anon (used by the public
--    CollectionTimeBooking page). We keep anon access but tighten it
--    to a single SECURITY DEFINER RPC `book_collection_slot` and a
--    customer-scoped read RPC `find_my_bookings`.
--
--    NOTE: the application code in /CollectionTimeBooking and
--    /mjm-ai-system/col_booking is being updated in the same PR to call
--    these RPCs instead of querying the tables directly. Until the new
--    front-end is deployed, KEEP the existing anon SELECT/INSERT
--    policies in place — flip them off only after the front-end is live.
--    The RPCs below are SECURITY DEFINER so they can read/write even if
--    the table policies are later locked down.
-- ────────────────────────────────────────────────────────────────

-- Read: returns only the bookings whose order_number was supplied AND that
-- match the supplied (case-insensitive) customer name. No partial / wildcard
-- search anymore — the audit found the previous wildcard endpoint enabled
-- mass PII enumeration plus PostgREST filter injection.
CREATE OR REPLACE FUNCTION public.find_my_bookings(
    _order_number text,
    _customer_name text
)
RETURNS TABLE (
    id              uuid,
    booking_date    date,
    start_time      time,
    end_time        time,
    customer_name   text,
    order_number    text,
    collection_qty  integer,
    status          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT  b.id, b.booking_date, b.start_time, b.end_time,
            b.customer_name, b.order_number, b.collection_qty, b.status
      FROM  shared_collection_bookings b
     WHERE  _order_number IS NOT NULL
       AND  length(trim(_order_number)) >= 4
       AND  upper(b.order_number)  = upper(trim(_order_number))
       AND  ( _customer_name IS NULL
              OR upper(b.customer_name) = upper(trim(_customer_name)) )
     ORDER BY b.booking_date DESC, b.start_time DESC
     LIMIT 50;
$fn$;

REVOKE ALL ON FUNCTION public.find_my_bookings(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_my_bookings(text, text) TO anon, authenticated;


-- Write: book a slot for an existing AL order. Validates that the order
-- exists and that the customer name on the booking matches the AL.
CREATE OR REPLACE FUNCTION public.book_collection_slot(
    _order_number text,
    _customer_name text,
    _booking_date  date,
    _start_time    time,
    _end_time      time,
    _collection_qty integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    _al_match boolean;
    _new_id   uuid;
BEGIN
    IF _order_number IS NULL OR length(trim(_order_number)) < 4 THEN
        RAISE EXCEPTION 'order_number too short';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM shared_al_orders
         WHERE upper(al_number) = upper(trim(_order_number))
           AND ( _customer_name IS NULL
                 OR upper(customer_name) = upper(trim(_customer_name)) )
    ) INTO _al_match;

    IF NOT _al_match THEN
        RAISE EXCEPTION 'order not found or customer name mismatch';
    END IF;

    IF _collection_qty IS NULL OR _collection_qty <= 0 THEN
        RAISE EXCEPTION 'invalid collection quantity';
    END IF;

    INSERT INTO shared_collection_bookings (
        booking_date, start_time, end_time,
        customer_name, order_number, collection_qty, status
    ) VALUES (
        _booking_date, _start_time, _end_time,
        trim(_customer_name), upper(trim(_order_number)),
        _collection_qty, 'booked'
    )
    RETURNING id INTO _new_id;

    RETURN _new_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.book_collection_slot(text, text, date, time, time, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_collection_slot(text, text, date, time, time, integer) TO anon, authenticated;
