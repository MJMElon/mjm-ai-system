-- ============================================================
-- SECURITY FIXES BEFORE HANDOVER (audit items 1 to 9, not 10)
--
--   C3   payroll admin rows        archive schema closed to logins
--   H11  keys in database code     watering hook reads its key from Vault,
--                                  create_billplz_bill deleted
--   H12  contact message claim     phone must match, 5 failures an hour,
--                                  new references carry a random suffix
--   H9   product photos            only Sales Web staff may write
--   H8   stock restored twice      an order returns its stock once only,
--                                  customers cancel through one function
--   H10  other apps buckets        writes only for that app, no anonymous
--                                  watering upload, documents not listable
--   M8   order attachments         customers write only into their own
--                                  order folder, images and PDF only
--   M10  points spent twice        one checkout per customer at a time,
--                                  the fallback balance is gone
--   H2   is a GitHub Pages setting and is not in this file.
--
-- Safe to run twice. Every step is guarded and the result at the end
-- says what each one found. A good result reads OK on every line, with
-- the two NOTE lines telling you what to do by hand afterwards.
-- ============================================================


-- ------------------------------------------------------------
-- C3. The old payroll tables live in schema archive. Nobody signed in
-- through the website may reach that schema or any table in it.
-- ------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA archive FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA archive FROM anon, authenticated;
REVOKE ALL ON SCHEMA archive FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA archive REVOKE ALL ON TABLES FROM anon, authenticated;


-- ------------------------------------------------------------
-- H11a. The watering photo hook. The old trigger carried the service
-- key in its own arguments. The key moves into Vault (copied from the
-- old trigger the first time, so nothing stops working), the old
-- trigger is dropped and a new one reads the key from Vault.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_args text;
  v_rest text;
  v_key  text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'watering_photo_hook_key') THEN
    SELECT encode(t.tgargs, 'escape') INTO v_args
      FROM pg_trigger t
     WHERE t.tgname = 'watering_logs_delete_photos'
       AND t.tgrelid = 'public.watering_logs'::regclass;
    IF v_args IS NOT NULL AND position('Bearer ' IN v_args) > 0 THEN
      v_rest := substr(v_args, position('Bearer ' IN v_args) + 7);
      v_key  := split_part(v_rest, '"', 1);
      IF length(v_key) > 20 THEN
        PERFORM vault.create_secret(v_key, 'watering_photo_hook_key',
                'Key the watering_logs delete hook sends to the delete-watering-photos function');
      END IF;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.watering_logs_photo_hook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_key text;
BEGIN
  SELECT s.decrypted_secret INTO v_key
    FROM vault.decrypted_secrets s
   WHERE s.name = 'watering_photo_hook_key'
   LIMIT 1;
  IF v_key IS NULL OR v_key = '' THEN
    RAISE WARNING 'watering_logs_photo_hook: no key in Vault, photos of this row were not deleted';
    RETURN OLD;
  END IF;
  PERFORM net.http_post(
    url     := 'https://kibqjztozokohqmhqqqf.supabase.co/functions/v1/delete-watering-photos',
    body    := jsonb_build_object('type', 'DELETE', 'table', TG_TABLE_NAME,
                                  'schema', TG_TABLE_SCHEMA, 'record', NULL,
                                  'old_record', to_jsonb(OLD)),
    params  := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_key),
    timeout_milliseconds := 5000);
  RETURN OLD;
END $fn$;

REVOKE ALL ON FUNCTION public.watering_logs_photo_hook() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'watering_photo_hook_key') THEN
    DROP TRIGGER IF EXISTS watering_logs_delete_photos ON public.watering_logs;
    DROP TRIGGER IF EXISTS watering_logs_photo_hook ON public.watering_logs;
    CREATE TRIGGER watering_logs_photo_hook
      AFTER DELETE ON public.watering_logs
      FOR EACH ROW EXECUTE FUNCTION public.watering_logs_photo_hook();
  END IF;
END $$;


-- ------------------------------------------------------------
-- H11b. The unused Billplz function and the API key typed inside it.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_billplz_bill(uuid, integer, text, text, text, text, text);


-- ------------------------------------------------------------
-- H12. Claiming a Contact Us message.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salesweb_message_claim_attempts (
  id      bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  ref     text,
  ok      boolean NOT NULL DEFAULT false,
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS salesweb_message_claim_attempts_user_at
  ON public.salesweb_message_claim_attempts (user_id, at);
ALTER TABLE public.salesweb_message_claim_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.salesweb_message_claim_attempts FROM anon, authenticated;

-- Four characters nobody can count up to. No 0, O, 1, I or L.
CREATE OR REPLACE FUNCTION public.salesweb_ref_suffix()
RETURNS text
LANGUAGE sql
VOLATILE
AS $fn$
  SELECT string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                           1 + floor(random() * 31)::int, 1), '')
    FROM generate_series(1, 4)
$fn$;

DO $$
DECLARE
  v_def text;
  v_old text := 'v_ref := ''MSG-'' || lpad(nextval(''public.salesweb_message_ref_seq'')::TEXT, 5, ''0'');';
  v_new text := 'v_ref := ''MSG-'' || lpad(nextval(''public.salesweb_message_ref_seq'')::TEXT, 5, ''0'') || ''-'' || public.salesweb_ref_suffix();';
BEGIN
  v_def := pg_get_functiondef('public.salesweb_submit_message(text,text,text,text,text,text,text)'::regprocedure);
  IF position('salesweb_ref_suffix' IN v_def) = 0 AND position(v_old IN v_def) > 0 THEN
    EXECUTE replace(v_def, v_old, v_new);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.salesweb_claim_message(p_ref text, p_phone text DEFAULT NULL::text)
RETURNS TABLE(result text, message_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_in     text := upper(replace(btrim(COALESCE(p_ref, '')), ' ', ''));
  v_num    text;
  v_sfx    text;
  v_ref    text;
  v_given  text := translate(COALESCE(p_phone, ''), translate(COALESCE(p_phone, ''), '0123456789', ''), '');
  v_held   text;
  v_fails  int;
  v_found  boolean;
  v_row    public.salesweb_messages%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in first.';
  END IF;

  SELECT count(*) INTO v_fails
    FROM public.salesweb_message_claim_attempts a
   WHERE a.user_id = v_uid AND NOT a.ok AND a.at > now() - interval '1 hour';
  IF v_fails >= 5 THEN
    RAISE EXCEPTION 'Too many attempts. Please try again in an hour, or WhatsApp us.';
  END IF;

  IF left(v_in, 3) = 'MSG' THEN v_in := substr(v_in, 4); END IF;
  v_in  := ltrim(v_in, '-');
  v_num := split_part(v_in, '-', 1);
  v_sfx := split_part(v_in, '-', 2);
  IF v_num = '' OR translate(v_num, '0123456789', '') <> '' OR length(v_num) > 9 THEN
    RAISE EXCEPTION 'Please enter the reference number, e.g. MSG-00001-AB2C.';
  END IF;
  IF length(v_given) < 9 THEN
    RAISE EXCEPTION 'Please enter the phone number you gave when you sent the message.';
  END IF;
  v_ref := 'MSG-' || lpad((v_num::bigint)::text, 5, '0') || CASE WHEN v_sfx <> '' THEN '-' || v_sfx ELSE '' END;

  SELECT * INTO v_row FROM public.salesweb_messages m WHERE m.ref = v_ref;
  v_found := FOUND;
  IF v_found THEN
    v_held := translate(COALESCE(v_row.phone, ''), translate(COALESCE(v_row.phone, ''), '0123456789', ''), '');
  END IF;

  -- Not found and wrong phone give the same answer, so a guess learns nothing.
  IF NOT v_found OR length(v_held) < 9 OR right(v_held, 9) <> right(v_given, 9) THEN
    INSERT INTO public.salesweb_message_claim_attempts (user_id, ref, ok) VALUES (v_uid, v_ref, false);
    RAISE EXCEPTION 'That reference and phone number do not match a message. Please check both and try again.';
  END IF;

  IF v_row.user_id = v_uid THEN
    RETURN QUERY SELECT 'already_yours'::text, v_ref::text;
    RETURN;
  END IF;
  IF v_row.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'This message is already linked to another account. Please contact us on WhatsApp.';
  END IF;

  INSERT INTO public.salesweb_message_claim_attempts (user_id, ref, ok) VALUES (v_uid, v_ref, true);
  UPDATE public.salesweb_messages SET user_id = v_uid WHERE salesweb_messages.id = v_row.id;
  INSERT INTO public.salesweb_message_events (message_id, kind, body, actor_id, actor_name)
  VALUES (v_row.id, 'linked', 'Customer added this case to their account', v_uid,
          COALESCE(public.salesweb_actor_name(v_uid), 'Customer'));

  RETURN QUERY SELECT 'linked'::text, v_ref::text;
END $fn$;

REVOKE ALL ON FUNCTION public.salesweb_claim_message(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salesweb_claim_message(text, text) TO authenticated;


-- ------------------------------------------------------------
-- H8. An order returns its stock once. A column records when, every
-- path that returns stock sets it, and the customer cancels through one
-- function that does the cancel and the return together.
-- ------------------------------------------------------------
ALTER TABLE public.salesweb_customer_orders ADD COLUMN IF NOT EXISTS stock_restored_at timestamptz;

-- Every order already cancelled has had its chance. Marking it is the
-- safe direction: nothing can be added back to stock for it again.
UPDATE public.salesweb_customer_orders
   SET stock_restored_at = COALESCE(updated_at, now())
 WHERE status ILIKE '%cancel%' AND stock_restored_at IS NULL;

CREATE OR REPLACE FUNCTION public.restore_order_stock(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_order    record;
  v_restored integer := 0;
  v_item     record;
  v_actor    text;
  v_new      integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM shared_profiles sp WHERE sp.id = auth.uid()
      AND (sp.role = 'admin' OR COALESCE(sp.permissions->'modules'->>'salesweb', 'none') IN ('admin', 'normal'))
  ) THEN
    RAISE EXCEPTION 'Only Sales Web staff may return stock. Customers cancel through salesweb_cancel_my_order.';
  END IF;

  SELECT id, status, order_number, stock_restored_at INTO v_order
    FROM salesweb_customer_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF v_order.status <> 'Cancelled' THEN
    RAISE EXCEPTION 'Order is % and stock can only be restored on cancelled orders.', v_order.status;
  END IF;
  IF v_order.stock_restored_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  BEGIN SELECT email INTO v_actor FROM auth.users WHERE id = auth.uid();
  EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;

  FOR v_item IN SELECT product_id, quantity FROM salesweb_order_items
                 WHERE order_id = p_order_id AND product_id IS NOT NULL AND quantity > 0
  LOOP
    PERFORM set_config('mjm.stock_logged', '1', true);
    UPDATE salesweb_products SET stock_qty = COALESCE(stock_qty, 0) + v_item.quantity, updated_at = now()
     WHERE id = v_item.product_id RETURNING stock_qty INTO v_new;
    INSERT INTO salesweb_inventory_history (product_id, delta, balance_after, action, ref_id, ref_number, created_by)
    VALUES (v_item.product_id, v_item.quantity, COALESCE(v_new, 0),
            'Order restored', p_order_id, v_order.order_number, COALESCE(v_actor, 'system'));
    v_restored := v_restored + v_item.quantity;
  END LOOP;

  UPDATE salesweb_customer_orders SET stock_restored_at = now() WHERE id = p_order_id;
  RETURN v_restored;
END $fn$;

REVOKE ALL ON FUNCTION public.restore_order_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_order_stock(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.salesweb_cancel_my_order(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_order    record;
  v_restored integer := 0;
  v_item     record;
  v_actor    text;
  v_new      integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;

  SELECT id, customer_id, status, order_number, stock_restored_at INTO v_order
    FROM salesweb_customer_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.customer_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;
  IF v_order.status <> 'Pending Payment' THEN
    RAISE EXCEPTION 'Order is now "%". Please contact us to cancel.', v_order.status;
  END IF;

  BEGIN SELECT email INTO v_actor FROM auth.users WHERE id = v_uid;
  EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;

  UPDATE salesweb_customer_orders
     SET status = 'Cancelled', stock_restored_at = now(), updated_at = now()
   WHERE id = p_order_id;

  IF v_order.stock_restored_at IS NULL THEN
    FOR v_item IN SELECT product_id, quantity FROM salesweb_order_items
                   WHERE order_id = p_order_id AND product_id IS NOT NULL AND quantity > 0
    LOOP
      PERFORM set_config('mjm.stock_logged', '1', true);
      UPDATE salesweb_products SET stock_qty = COALESCE(stock_qty, 0) + v_item.quantity, updated_at = now()
       WHERE id = v_item.product_id RETURNING stock_qty INTO v_new;
      INSERT INTO salesweb_inventory_history (product_id, delta, balance_after, action, ref_id, ref_number, created_by)
      VALUES (v_item.product_id, v_item.quantity, COALESCE(v_new, 0),
              'Order restored', p_order_id, v_order.order_number, COALESCE(v_actor, 'customer'));
      v_restored := v_restored + v_item.quantity;
    END LOOP;
  END IF;

  INSERT INTO salesweb_order_timeline (order_id, status, note, changed_by)
  VALUES (p_order_id, 'Cancelled', 'Order cancelled by customer via portal, stock returned',
          COALESCE(v_actor, 'customer'));
  RETURN v_restored;
END $fn$;

REVOKE ALL ON FUNCTION public.salesweb_cancel_my_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salesweb_cancel_my_order(uuid) TO authenticated;

-- The automatic release of unpaid orders returns stock too, so it marks the order.
DO $$
DECLARE
  v_def text;
  v_old text := 'UPDATE salesweb_customer_orders SET status = ''Cancelled'', updated_at = now() WHERE id = r.id;';
  v_new text := 'UPDATE salesweb_customer_orders SET status = ''Cancelled'', stock_restored_at = now(), updated_at = now() WHERE id = r.id;';
BEGIN
  IF to_regprocedure('public.release_abandoned_cash_orders()') IS NOT NULL THEN
    v_def := pg_get_functiondef('public.release_abandoned_cash_orders()'::regprocedure);
    IF position('stock_restored_at' IN v_def) = 0 AND position(v_old IN v_def) > 0 THEN
      EXECUTE replace(v_def, v_old, v_new);
    END IF;
  END IF;
END $$;


-- ------------------------------------------------------------
-- M10. Points. A second checkout by the same customer waits for the
-- first to finish, and the looser second balance is switched off, so
-- there is one balance and it already counts unpaid orders.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_def  text;
  v_lock text := 'IF pts > 0 THEN';
  v_lockn text := 'IF pts > 0 THEN PERFORM pg_advisory_xact_lock(hashtextextended(''salesweb_points:'' || uid::text, 0));';
  v_fb   text := 'IF COALESCE(avail, 0) <= 0 THEN';
  v_fbn  text := 'IF false AND COALESCE(avail, 0) <= 0 THEN';
BEGIN
  v_def := pg_get_functiondef('public.place_order(jsonb,text,integer,jsonb)'::regprocedure);
  IF position('pg_advisory_xact_lock' IN v_def) = 0 AND position(v_lock IN v_def) > 0 THEN
    v_def := replace(v_def, v_lock, v_lockn);
  END IF;
  IF position(v_fbn IN v_def) = 0 AND position(v_fb IN v_def) > 0 THEN
    v_def := replace(v_def, v_fb, v_fbn);
  END IF;
  EXECUTE v_def;
END $$;


-- ------------------------------------------------------------
-- H9, H10, M8. Storage. Each bucket may be written only by the people
-- of the app that owns it. Viewing by link is unchanged.
-- ------------------------------------------------------------

-- product-images: Sales Web staff only
DROP POLICY IF EXISTS "Authenticated can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete product images" ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_product_images_insert ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_product_images_update ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_product_images_delete ON storage.objects;
CREATE POLICY mjm_sec_product_images_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public._mjm_is_trusted_staff() AND public.is_salesweb_admin());
CREATE POLICY mjm_sec_product_images_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public._mjm_is_trusted_staff() AND public.is_salesweb_admin())
  WITH CHECK (bucket_id = 'product-images' AND public._mjm_is_trusted_staff() AND public.is_salesweb_admin());
CREATE POLICY mjm_sec_product_images_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public._mjm_is_trusted_staff() AND public.is_salesweb_admin());

-- watering-photos: the watering team, signed in. No anonymous upload.
DROP POLICY IF EXISTS "Allow All Uploads to watering-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow Authenticated Delete of watering-photos" ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_watering_insert ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_watering_update ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_watering_delete ON storage.objects;
CREATE POLICY mjm_sec_watering_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'watering-photos' AND (public._mjm_ops_staff() OR public._watering_member()));
CREATE POLICY mjm_sec_watering_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'watering-photos' AND (public._mjm_ops_staff() OR public._watering_member()))
  WITH CHECK (bucket_id = 'watering-photos' AND (public._mjm_ops_staff() OR public._watering_member()));
CREATE POLICY mjm_sec_watering_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'watering-photos' AND (public._mjm_ops_staff() OR public._watering_member()));

-- audit-photos: the same staff test the audit tables use
DROP POLICY IF EXISTS "audit photos writable" ON storage.objects;
DROP POLICY IF EXISTS "audit photos replaceable" ON storage.objects;
DROP POLICY IF EXISTS audit_photos_insert ON storage.objects;
DROP POLICY IF EXISTS audit_photos_update ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_audit_insert ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_audit_update ON storage.objects;
CREATE POLICY mjm_sec_audit_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audit-photos' AND public._mjm_is_trusted_staff());
CREATE POLICY mjm_sec_audit_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'audit-photos' AND public._mjm_is_trusted_staff())
  WITH CHECK (bucket_id = 'audit-photos' AND public._mjm_is_trusted_staff());

-- records: office and field staff
DROP POLICY IF EXISTS "authenticated upload records" ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_records_insert ON storage.objects;
CREATE POLICY mjm_sec_records_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'records' AND public._mjm_ops_staff());

-- nelos-docs and nelos-photos: whoever holds NELOS, as for the case tables
DROP POLICY IF EXISTS "nelos docs upload" ON storage.objects;
DROP POLICY IF EXISTS "nelos photos upload" ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_nelos_insert ON storage.objects;
CREATE POLICY mjm_sec_nelos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('nelos-docs', 'nelos-photos') AND public.nelos_has_access());

-- documents: staff write, the worker photo tickets stay as they are,
-- and the file list is no longer open to the public
DROP POLICY IF EXISTS "documents bucket — auth insert" ON storage.objects;
DROP POLICY IF EXISTS "documents bucket — auth update" ON storage.objects;
DROP POLICY IF EXISTS "documents bucket — auth delete" ON storage.objects;
DROP POLICY IF EXISTS "documents bucket — public read" ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_documents_insert ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_documents_update ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_documents_delete ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_documents_read ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_documents_ticket_read ON storage.objects;
CREATE POLICY mjm_sec_documents_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND public._mjm_ops_staff());
CREATE POLICY mjm_sec_documents_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND public._mjm_ops_staff())
  WITH CHECK (bucket_id = 'documents' AND public._mjm_ops_staff());
CREATE POLICY mjm_sec_documents_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND public._mjm_ops_staff());
CREATE POLICY mjm_sec_documents_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public._mjm_ops_staff());
-- a worker phone may see only the folder its own live ticket opened
CREATE POLICY mjm_sec_documents_ticket_read ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'documents' AND (
        ((storage.foldername(name))[1] = 'worker_photos'     AND public.worker_photo_ticket_live((storage.foldername(name))[2], 'work'))
     OR ((storage.foldername(name))[1] = 'worker_id_photos'  AND public.worker_photo_ticket_live((storage.foldername(name))[2], 'id'))
     OR ((storage.foldername(name))[1] = 'mata_malam_photos' AND public.worker_photo_ticket_live((storage.foldername(name))[2], 'mata_malam'))));

-- order-attachments: staff anywhere. A customer only into
-- payment-proofs/<their own order id>/, and only images or PDF.
DROP POLICY IF EXISTS "auth upload order attachments" ON storage.objects;
DROP POLICY IF EXISTS "order-attachments authenticated insert any" ON storage.objects;
DROP POLICY IF EXISTS "order-attachments customer insert payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "order-attachments authenticated update own" ON storage.objects;
DROP POLICY IF EXISTS "order-attachments authenticated delete own" ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_oa_staff_insert ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_oa_staff_update ON storage.objects;
DROP POLICY IF EXISTS mjm_sec_oa_customer_insert ON storage.objects;
CREATE POLICY mjm_sec_oa_staff_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-attachments' AND public._mjm_ops_staff());
CREATE POLICY mjm_sec_oa_staff_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'order-attachments' AND public._mjm_ops_staff())
  WITH CHECK (bucket_id = 'order-attachments' AND public._mjm_ops_staff());
CREATE POLICY mjm_sec_oa_customer_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'order-attachments'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = 'payment-proofs'
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf')
    AND EXISTS (SELECT 1 FROM public.salesweb_customer_orders o
                 WHERE o.id::text = (storage.foldername(name))[2]
                   AND o.customer_id = auth.uid()));


-- ------------------------------------------------------------
-- THE CHECK. One row per fix. OK means it is in place.
-- ------------------------------------------------------------
SELECT * FROM (
  SELECT 1 AS n, 'C3 archive closed to logins' AS fix,
         CASE WHEN NOT has_schema_privilege('authenticated', 'archive', 'USAGE')
               AND NOT has_schema_privilege('anon', 'archive', 'USAGE')
               AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                                WHERE table_schema = 'archive' AND grantee IN ('anon', 'authenticated'))
              THEN 'OK' ELSE 'NOT OK' END
      || CASE WHEN to_regclass('public.access_profiles') IS NULL THEN ''
              ELSE ' -- WARNING public.access_profiles exists again, ask before using it' END AS result
  UNION ALL
  SELECT 2, 'H11 no key left in a trigger or function',
         CASE WHEN NOT EXISTS (SELECT 1 FROM pg_trigger WHERE position('eyJ' IN encode(tgargs, 'escape')) > 0)
               AND to_regprocedure('public.create_billplz_bill(uuid,integer,text,text,text,text,text)') IS NULL
               AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'watering_logs_photo_hook')
               AND EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'watering_photo_hook_key')
              THEN 'OK' ELSE 'NOT OK' END
  UNION ALL
  SELECT 3, 'H12 claim checks the phone, new refs are random',
         CASE WHEN position('right(v_held, 9)' IN pg_get_functiondef('public.salesweb_claim_message(text,text)'::regprocedure)) > 0
               AND position('salesweb_ref_suffix' IN pg_get_functiondef('public.salesweb_submit_message(text,text,text,text,text,text,text)'::regprocedure)) > 0
              THEN 'OK' ELSE 'NOT OK' END
      || ', messages already claimed by a phone that does not match: '
      || (SELECT count(*) FROM public.salesweb_messages m
            JOIN public.shared_profiles p ON p.id = m.user_id
           WHERE right(translate(COALESCE(m.phone, ''), translate(COALESCE(m.phone, ''), '0123456789', ''), ''), 9)
              <> right(translate(COALESCE(p.phone, ''), translate(COALESCE(p.phone, ''), '0123456789', ''), ''), 9))::text
  UNION ALL
  SELECT 4, 'H8 stock returned once only',
         CASE WHEN position('stock_restored_at' IN pg_get_functiondef('public.restore_order_stock(uuid)'::regprocedure)) > 0
               AND to_regprocedure('public.salesweb_cancel_my_order(uuid)') IS NOT NULL
               AND position('stock_restored_at' IN pg_get_functiondef('public.release_abandoned_cash_orders()'::regprocedure)) > 0
              THEN 'OK' ELSE 'NOT OK' END
      || ', cancelled orders not marked: '
      || (SELECT count(*) FROM public.salesweb_customer_orders WHERE status ILIKE '%cancel%' AND stock_restored_at IS NULL)::text
      || ', orders whose stock was already returned twice in the past: '
      || (SELECT count(DISTINCT ref_id) FROM (SELECT ref_id FROM public.salesweb_inventory_history
                                             WHERE action = 'Order restored'
                                             GROUP BY ref_id, product_id HAVING count(*) > 1) x)::text
  UNION ALL
  SELECT 5, 'M10 one checkout at a time, no fallback balance',
         CASE WHEN position('pg_advisory_xact_lock' IN pg_get_functiondef('public.place_order(jsonb,text,integer,jsonb)'::regprocedure)) > 0
               AND position('IF false AND COALESCE(avail, 0) <= 0 THEN' IN pg_get_functiondef('public.place_order(jsonb,text,integer,jsonb)'::regprocedure)) > 0
              THEN 'OK' ELSE 'NOT OK' END
  UNION ALL
  SELECT 6, 'H9 H10 M8 storage writes',
         CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                     AND policyname LIKE 'mjm_sec_%') = 18
               AND NOT EXISTS (SELECT 1 FROM pg_policies
                                WHERE schemaname = 'storage' AND tablename = 'objects'
                                  AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
                                  AND COALESCE(with_check, qual) IN (
                                      '(bucket_id = ''product-images''::text)',
                                      '(bucket_id = ''watering-photos''::text)',
                                      '(bucket_id = ''audit-photos''::text)',
                                      '(bucket_id = ''documents''::text)',
                                      '(bucket_id = ''order-attachments''::text)',
                                      '(bucket_id = ''nelos-docs''::text)',
                                      '(bucket_id = ''nelos-photos''::text)'))
              THEN 'OK' ELSE 'NOT OK' END
      || ', policies now in place: '
      || (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND policyname LIKE 'mjm_sec_%')::text || ' of 18'
  UNION ALL
  SELECT 7, 'NOTE after rotating the project keys',
         'put the new service_role key in Vault: select vault.update_secret(id, new_key) from vault.secrets where name = watering_photo_hook_key'
  UNION ALL
  SELECT 8, 'NOTE Billplz',
         'generate a new Billplz API key, the old one was readable in database code'
) r
ORDER BY n;
