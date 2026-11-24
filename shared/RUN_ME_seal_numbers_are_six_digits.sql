-- A SEAL NUMBER IS SIX DIGITS, in every record.
--
-- The office: whatever is keyed (the consent form on the Admin Portal, the
-- FC Portal Add, Seal Manage in HQ) must be exactly six digits or it is not
-- saved, and every seal number in the system is stored as six digits. The
-- screens refuse anything else from now on. This file does the database
-- half, and it does two things.
--
-- 1. FROM NOW ON. A BEFORE trigger on every table that holds a seal number
--    writes it as six digits on the way in: 4187 becomes 004187, and
--    0035190 becomes 035190. It never refuses a row -- a consent the
--    customer signed must not be lost over the width of a number, and a
--    phone on an older build may still send 4187. A code with more than six
--    significant digits (a 13 digit product barcode the camera read) is not
--    a seal number and is left exactly as it is, so the check below can
--    name it. The trigger is named a_seal_six so it runs before every other
--    BEFORE trigger on the table, which then all see the six digit code.
--
-- 2. WHAT IS ALREADY THERE. Every stored code that is a seal number but not
--    six digits is rewritten as six. The sync triggers that rebuild the
--    range tables and raise NELOS cases are switched off for the length of
--    the rewrite and back on at the end of the same statement, so the
--    rewrite raises no case and moves no seal -- the number does not change,
--    only how it is written. A scan whose six digit form is already on the
--    same consent is left alone and counted, because the table holds one
--    row per seal per consent.
--
-- Safe to run twice: the second run rewrites nothing.
--
-- WHAT A GOOD RESULT LOOKS LIKE: one row per table and column.
--   six_digits   how many codes are six digits now
--   rewritten    how many this run rewrote (0 on a second run)
--   not_six      should be 0 on every line, except where not_a_seal says why
--   not_a_seal   codes with more than six significant digits, or letters,
--                left as they were: other barcodes, not seal numbers
--   On fcportal_scan_records a not_six above 0 is a seal scanned TWICE on
--   one consent, once short and once in six digits. The short copy is left
--   as it was and counted here, rather than deleted by this file.
-- The last row says whether every trigger is installed and switched on.

CREATE OR REPLACE FUNCTION public.seal_six(t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN t IS NULL OR t = '' THEN t
    WHEN translate(t, '0123456789', '') <> '' THEN t
    WHEN length(ltrim(t, '0')) > 6 THEN t
    ELSE lpad(ltrim(t, '0'), 6, '0')
  END
$$;

CREATE OR REPLACE FUNCTION public.seal_six_ranges(j JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN j IS NULL OR jsonb_typeof(j) <> 'array' THEN j
    ELSE COALESCE((
      SELECT jsonb_agg(
               CASE WHEN jsonb_typeof(e) = 'object'
                    THEN e || jsonb_strip_nulls(jsonb_build_object(
                           'start', public.seal_six(e ->> 'start'),
                           'end',   public.seal_six(e ->> 'end')))
                    ELSE e END
               ORDER BY o)
        FROM jsonb_array_elements(j) WITH ORDINALITY AS x(e, o)), '[]'::jsonb)
  END
$$;

CREATE OR REPLACE FUNCTION public.seal_six_codes() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.start_code := public.seal_six(NEW.start_code);
  NEW.end_code   := public.seal_six(NEW.end_code);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.seal_six_problem() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.seal_from := public.seal_six(NEW.seal_from);
  NEW.seal_to   := public.seal_six(NEW.seal_to);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.seal_six_scan() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.barcode := public.seal_six(NEW.barcode);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.seal_six_seal_ranges() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.seal_ranges := public.seal_six_ranges(NEW.seal_ranges);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.seal_six_ranges_col() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.ranges := public.seal_six_ranges(NEW.ranges);
  RETURN NEW;
END $$;

-- The triggers, and the rewrite, in one block, each table only if it exists.
DO $$
DECLARE
  t TEXT;
  sync TEXT[][] := ARRAY[
    ARRAY['mobile_consent_records', 'seal_sync_consent'],
    ARRAY['shared_do_records', 'seal_sync_do'],
    ARRAY['shared_do_records', 'seal_sync_do_missed'],
    ARRAY['seal_receipts', 'seal_sync_receipt'],
    ARRAY['seal_receipts', 'seal_confirm_delivery'],
    ARRAY['seal_deliveries', 'seal_sync_delivery'],
    ARRAY['seal_hq_receipts', 'seal_sync_hq_receipt'],
    ARRAY['fcportal_scan_records', 'seal_check_scan']];
  i INT;
  n BIGINT;
  report TEXT := '';
BEGIN
  PERFORM set_config('client_min_messages', 'warning', true);
  -- 1. the triggers
  FOREACH t IN ARRAY ARRAY['seal_orders', 'seal_allocations', 'seal_receipt_ranges', 'seal_hq_ranges', 'seal_delivery_ranges', 'seal_settled_scans'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS a_seal_six ON public.%I', t);
      EXECUTE format('CREATE TRIGGER a_seal_six BEFORE INSERT OR UPDATE OF start_code, end_code ON public.%I FOR EACH ROW EXECUTE FUNCTION public.seal_six_codes()', t);
    END IF;
  END LOOP;
  IF to_regclass('public.seal_problems') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS a_seal_six ON public.seal_problems;
    CREATE TRIGGER a_seal_six BEFORE INSERT OR UPDATE OF seal_from, seal_to ON public.seal_problems
      FOR EACH ROW EXECUTE FUNCTION public.seal_six_problem();
  END IF;
  IF to_regclass('public.fcportal_scan_records') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS a_seal_six ON public.fcportal_scan_records;
    CREATE TRIGGER a_seal_six BEFORE INSERT OR UPDATE OF barcode ON public.fcportal_scan_records
      FOR EACH ROW EXECUTE FUNCTION public.seal_six_scan();
  END IF;
  FOREACH t IN ARRAY ARRAY['mobile_consent_records', 'shared_do_records'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS a_seal_six ON public.%I', t);
      EXECUTE format('CREATE TRIGGER a_seal_six BEFORE INSERT OR UPDATE OF seal_ranges ON public.%I FOR EACH ROW EXECUTE FUNCTION public.seal_six_seal_ranges()', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['seal_receipts', 'seal_deliveries', 'seal_hq_receipts'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS a_seal_six ON public.%I', t);
      EXECUTE format('CREATE TRIGGER a_seal_six BEFORE INSERT OR UPDATE OF ranges ON public.%I FOR EACH ROW EXECUTE FUNCTION public.seal_six_ranges_col()', t);
    END IF;
  END LOOP;

  -- 2. the rewrite, with the sync triggers off so no case is raised
  FOR i IN 1 .. array_length(sync, 1) LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
                WHERE c.relname = sync[i][1] AND g.tgname = sync[i][2] AND NOT g.tgisinternal) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', sync[i][1], sync[i][2]);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['seal_orders', 'seal_allocations', 'seal_receipt_ranges', 'seal_hq_ranges', 'seal_delivery_ranges', 'seal_settled_scans'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET start_code = public.seal_six(start_code), end_code = public.seal_six(end_code)
                       WHERE start_code IS DISTINCT FROM public.seal_six(start_code) OR end_code IS DISTINCT FROM public.seal_six(end_code)', t);
      GET DIAGNOSTICS n = ROW_COUNT;
      report := report || t || '=' || n || ',';
    END IF;
  END LOOP;
  IF to_regclass('public.seal_problems') IS NOT NULL THEN
    UPDATE public.seal_problems SET seal_from = public.seal_six(seal_from), seal_to = public.seal_six(seal_to)
     WHERE seal_from IS DISTINCT FROM public.seal_six(seal_from) OR seal_to IS DISTINCT FROM public.seal_six(seal_to);
    GET DIAGNOSTICS n = ROW_COUNT;
    report := report || 'seal_problems=' || n || ',';
  END IF;
  IF to_regclass('public.fcportal_scan_records') IS NOT NULL THEN
    -- one row per seal per consent: the earliest short row of each seal is
    -- rewritten, and only where the six digit form is not already there
    UPDATE public.fcportal_scan_records s SET barcode = public.seal_six(s.barcode)
     WHERE s.id IN (
       SELECT DISTINCT ON (r.consent_id, public.seal_six(r.barcode)) r.id
         FROM public.fcportal_scan_records r
        WHERE r.barcode IS DISTINCT FROM public.seal_six(r.barcode)
          AND NOT EXISTS (SELECT 1 FROM public.fcportal_scan_records q
                           WHERE q.consent_id = r.consent_id AND q.barcode = public.seal_six(r.barcode))
        ORDER BY r.consent_id, public.seal_six(r.barcode), r.scanned_at, r.id);
    GET DIAGNOSTICS n = ROW_COUNT;
    report := report || 'fcportal_scan_records=' || n || ',';
  END IF;
  FOREACH t IN ARRAY ARRAY['mobile_consent_records', 'shared_do_records'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET seal_ranges = public.seal_six_ranges(seal_ranges)
                       WHERE seal_ranges IS DISTINCT FROM public.seal_six_ranges(seal_ranges)', t);
      GET DIAGNOSTICS n = ROW_COUNT;
      report := report || t || '=' || n || ',';
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['seal_receipts', 'seal_deliveries', 'seal_hq_receipts'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET ranges = public.seal_six_ranges(ranges)
                       WHERE ranges IS DISTINCT FROM public.seal_six_ranges(ranges)', t);
      GET DIAGNOSTICS n = ROW_COUNT;
      report := report || t || '=' || n || ',';
    END IF;
  END LOOP;

  FOR i IN 1 .. array_length(sync, 1) LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
                WHERE c.relname = sync[i][1] AND g.tgname = sync[i][2] AND NOT g.tgisinternal) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', sync[i][1], sync[i][2]);
    END IF;
  END LOOP;

  PERFORM set_config('seal_six.rewritten', report, false);
END $$;

-- The check. Every seal number in every table, one row per table and column.
WITH codes AS (
  SELECT 'fcportal_scan_records.barcode' AS src, barcode AS c FROM public.fcportal_scan_records
  UNION ALL SELECT 'seal_allocations', start_code FROM public.seal_allocations
  UNION ALL SELECT 'seal_allocations', end_code FROM public.seal_allocations
  UNION ALL SELECT 'seal_orders', start_code FROM public.seal_orders
  UNION ALL SELECT 'seal_orders', end_code FROM public.seal_orders
  UNION ALL SELECT 'seal_receipt_ranges', start_code FROM public.seal_receipt_ranges
  UNION ALL SELECT 'seal_receipt_ranges', end_code FROM public.seal_receipt_ranges
  UNION ALL SELECT 'seal_hq_ranges', start_code FROM public.seal_hq_ranges
  UNION ALL SELECT 'seal_hq_ranges', end_code FROM public.seal_hq_ranges
  UNION ALL SELECT 'seal_delivery_ranges', start_code FROM public.seal_delivery_ranges
  UNION ALL SELECT 'seal_delivery_ranges', end_code FROM public.seal_delivery_ranges
  UNION ALL SELECT 'seal_settled_scans', start_code FROM public.seal_settled_scans
  UNION ALL SELECT 'seal_settled_scans', end_code FROM public.seal_settled_scans
  UNION ALL SELECT 'seal_problems', seal_from FROM public.seal_problems
  UNION ALL SELECT 'seal_problems', seal_to FROM public.seal_problems
  UNION ALL SELECT 'mobile_consent_records.seal_ranges', e ->> k FROM public.mobile_consent_records,
    jsonb_array_elements(CASE WHEN jsonb_typeof(seal_ranges) = 'array' THEN seal_ranges ELSE '[]'::jsonb END) e, unnest(ARRAY['start', 'end']) k
  UNION ALL SELECT 'shared_do_records.seal_ranges', e ->> k FROM public.shared_do_records,
    jsonb_array_elements(CASE WHEN jsonb_typeof(seal_ranges) = 'array' THEN seal_ranges ELSE '[]'::jsonb END) e, unnest(ARRAY['start', 'end']) k
  UNION ALL SELECT 'seal_receipts.ranges', e ->> k FROM public.seal_receipts,
    jsonb_array_elements(CASE WHEN jsonb_typeof(ranges) = 'array' THEN ranges ELSE '[]'::jsonb END) e, unnest(ARRAY['start', 'end']) k
  UNION ALL SELECT 'seal_deliveries.ranges', e ->> k FROM public.seal_deliveries,
    jsonb_array_elements(CASE WHEN jsonb_typeof(ranges) = 'array' THEN ranges ELSE '[]'::jsonb END) e, unnest(ARRAY['start', 'end']) k
  UNION ALL SELECT 'seal_hq_receipts.ranges', e ->> k FROM public.seal_hq_receipts,
    jsonb_array_elements(CASE WHEN jsonb_typeof(ranges) = 'array' THEN ranges ELSE '[]'::jsonb END) e, unnest(ARRAY['start', 'end']) k
), graded AS (
  SELECT src, c,
         (length(c) = 6 AND translate(c, '0123456789', '') = '') AS six,
         (translate(c, '0123456789', '') <> '' OR length(ltrim(c, '0')) > 6) AS not_seal
    FROM codes WHERE c IS NOT NULL AND c <> ''
)
SELECT src AS what,
       count(*) FILTER (WHERE six) AS six_digits,
       count(*) FILTER (WHERE NOT six AND NOT not_seal) AS not_six,
       count(*) FILTER (WHERE not_seal) AS not_a_seal,
       COALESCE(string_agg(DISTINCT c, ' ') FILTER (WHERE not_seal), '') AS examples
  FROM graded GROUP BY src
UNION ALL
SELECT 'rewritten this run: ' || COALESCE(NULLIF(current_setting('seal_six.rewritten', true), ''), 'nothing'), NULL, NULL, NULL,
       'triggers on: ' || (SELECT count(*) FROM pg_trigger g WHERE g.tgname = 'a_seal_six' AND g.tgenabled = 'O')::text
       || ' of 13, sync triggers off: ' || (SELECT count(*) FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
            WHERE g.tgname LIKE 'seal_%' AND NOT g.tgisinternal AND g.tgenabled = 'D')::text
ORDER BY 1;
