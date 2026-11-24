-- ================================================================
-- ONE ORDER, SCANNED AT TWO PLACES, AND A RESET THAT CLEARS ONE PHONE
--
-- 1. fcportal_scan_records gets scan_point (which phone took the seal)
--    and scan_point_name (what that phone is called on screen). Rows
--    already in the table carry neither, and show as Earlier scans.
--    Nothing is backfilled: nothing recorded which phone took them.
-- 2. fcportal_reset_scans() is the ONE way a scan row is deleted. It
--    takes the order (its consent ids) and the phone, and deletes only
--    that phone rows, plus the rows naming no phone when asked. A seal
--    already on a DO is never deleted, that is a real collection.
--    Every reset is written to fcportal_scan_resets, who and when.
-- 3. The DO press id (client_uid) and its unique index, the same as
--    RUN_ME_do_number_never_repeats.sql, put in again here so a second
--    save of one press can never be a second DO. The index is made only
--    when no two rows already share a press id.
--
-- Safe to run twice.
--
-- WHAT A GOOD RESULT LOOKS LIKE: every check reads OK and the Imbok line 0. The two DO
-- lines at the foot are counts to read, not faults: suspected twin
-- DOs are rows with the same order, day, quantity and first line,
-- made within ten minutes of each other in the last 60 days.
-- ================================================================

ALTER TABLE public.fcportal_scan_records ADD COLUMN IF NOT EXISTS scan_point TEXT;
ALTER TABLE public.fcportal_scan_records ADD COLUMN IF NOT EXISTS scan_point_name TEXT;
ALTER TABLE public.fcportal_scan_records ADD COLUMN IF NOT EXISTS do_number TEXT;
CREATE INDEX IF NOT EXISTS fcportal_scan_records_point_idx
  ON public.fcportal_scan_records (consent_id, scan_point);

CREATE TABLE IF NOT EXISTS public.fcportal_scan_resets (
  id            BIGSERIAL PRIMARY KEY,
  consent_ids   TEXT[]      NOT NULL,
  scan_point    TEXT,
  unassigned    BOOLEAN     NOT NULL DEFAULT false,
  rows_deleted  INTEGER     NOT NULL DEFAULT 0,
  barcodes      TEXT[],
  reset_by      TEXT,
  reset_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fcportal_scan_resets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fcportal_scan_resets_read ON public.fcportal_scan_resets;
CREATE POLICY fcportal_scan_resets_read ON public.fcportal_scan_resets
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.fcportal_reset_scans(
  p_consent_ids TEXT[],
  p_scan_point  TEXT,
  p_unassigned  BOOLEAN DEFAULT false
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codes TEXT[];
  v_n     INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in first';
  END IF;
  IF coalesce(array_length(p_consent_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;
  IF coalesce(p_scan_point, '') = '' AND NOT coalesce(p_unassigned, false) THEN
    RETURN 0;
  END IF;

  WITH gone AS (
    DELETE FROM public.fcportal_scan_records r
     WHERE r.consent_id::text = ANY (p_consent_ids)
       AND r.do_number IS NULL
       AND (
             (coalesce(p_scan_point, '') <> '' AND r.scan_point = p_scan_point)
          OR (coalesce(p_unassigned, false) AND (r.scan_point IS NULL OR r.scan_point = ''))
           )
    RETURNING r.barcode
  )
  SELECT array_agg(barcode), count(*) INTO v_codes, v_n FROM gone;

  INSERT INTO public.fcportal_scan_resets
    (consent_ids, scan_point, unassigned, rows_deleted, barcodes, reset_by)
  VALUES
    (p_consent_ids, nullif(p_scan_point, ''), coalesce(p_unassigned, false), coalesce(v_n, 0), v_codes,
     coalesce(auth.jwt() ->> 'email', auth.uid()::text));

  RETURN coalesce(v_n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.fcportal_reset_scans(TEXT[], TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fcportal_reset_scans(TEXT[], TEXT, BOOLEAN) TO authenticated;

ALTER TABLE public.shared_do_records ADD COLUMN IF NOT EXISTS client_uid TEXT;
DO $$
BEGIN
  IF to_regclass('public.shared_do_records_one_per_press') IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.shared_do_records
        WHERE client_uid IS NOT NULL
        GROUP BY client_uid HAVING count(*) > 1
     ) THEN
    CREATE UNIQUE INDEX shared_do_records_one_per_press
      ON public.shared_do_records (client_uid) WHERE client_uid IS NOT NULL;
  END IF;
END $$;

-- 4. ONE ORDER, NEVER MORE SEALS THAN ITS CONSENTS ALLOW, counted over every
--    scan point. Two phones can take the last seal in the same second, and only
--    the database sees both, so the insert is refused here. The cap is per AL:
--    every consent signed on that AL added together, against every seal scanned
--    on any of them. A merged card files its scans against any member consent,
--    so a cap per consent would refuse a seal the order still has room for.
--    The phone reads the words MJM_ORDER_FULL and takes the seal back.
CREATE OR REPLACE FUNCTION public.fcportal_scan_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_al   TEXT;
  v_cap  BIGINT;
  v_have BIGINT;
BEGIN
  SELECT m.al_number INTO v_al FROM public.mobile_consent_records m WHERE m.id::text = NEW.consent_id::text;
  IF v_al IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('fcportal_scan_cap:' || v_al));
  SELECT coalesce(sum(m.consent_qty), 0) INTO v_cap FROM public.mobile_consent_records m WHERE m.al_number = v_al;
  IF v_cap <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_have
    FROM public.fcportal_scan_records r
   WHERE r.consent_id::text IN (SELECT m.id::text FROM public.mobile_consent_records m WHERE m.al_number = v_al);
  IF v_have >= v_cap THEN
    RAISE EXCEPTION 'MJM_ORDER_FULL: order % already holds % of % seals', v_al, v_have, v_cap;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fcportal_scan_cap ON public.fcportal_scan_records;
CREATE TRIGGER fcportal_scan_cap BEFORE INSERT ON public.fcportal_scan_records
  FOR EACH ROW EXECUTE FUNCTION public.fcportal_scan_cap();

-- 5. IMBOK ENTERPRISE, AL BB0RS8: 1,231 scans held against a consent of 1,000,
--    none of them on a DO, every one from before scan points existed, so no
--    phone may clear them. Only the scans on that one consent that name no
--    scan point and are on no DO are taken off. A second run finds none.
DELETE FROM public.fcportal_scan_records r
 WHERE r.consent_id::text = '3bdc6612-d75c-49d9-a879-1305ff22aa1b'
   AND r.do_number IS NULL
   AND (r.scan_point IS NULL OR r.scan_point = '');

NOTIFY pgrst, 'reload schema';

SELECT 1 AS n, 'scan_point column' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'fcportal_scan_records'
                            AND column_name = 'scan_point') THEN 'OK' ELSE 'MISSING' END AS result
UNION ALL
SELECT 2, 'fcportal_reset_scans function',
       CASE WHEN to_regprocedure('public.fcportal_reset_scans(text[],text,boolean)') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 3, 'order cap trigger',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fcportal_scan_cap') THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 31, 'Imbok BB0RS8 scans left (should read 0)',
       (SELECT count(*)::text FROM public.fcportal_scan_records WHERE consent_id::text = '3bdc6612-d75c-49d9-a879-1305ff22aa1b')
UNION ALL
SELECT 32, 'scan rows naming no scan point (shown as Earlier scans)',
       (SELECT count(*)::text FROM public.fcportal_scan_records WHERE scan_point IS NULL)
UNION ALL
SELECT 4, 'DO press id unique index',
       CASE WHEN to_regclass('public.shared_do_records_one_per_press') IS NOT NULL THEN 'OK'
            ELSE 'NOT MADE, two DO rows share a press id, see line 5' END
UNION ALL
SELECT 5, 'DO press ids used more than once',
       (SELECT count(*)::text FROM (SELECT client_uid FROM public.shared_do_records
                                     WHERE client_uid IS NOT NULL
                                     GROUP BY client_uid HAVING count(*) > 1) x)
UNION ALL
SELECT 6, 'suspected twin DOs in the last 60 days',
       (SELECT count(*)::text FROM public.shared_do_records a
          JOIN public.shared_do_records b
            ON b.al_number = a.al_number
           AND b.delivery_date IS NOT DISTINCT FROM a.delivery_date
           AND b.total_qty IS NOT DISTINCT FROM a.total_qty
           AND b.plot_1 IS NOT DISTINCT FROM a.plot_1
           AND b.id > a.id
           AND abs(extract(epoch FROM (b.created_at - a.created_at))) < 600
         WHERE a.created_at > now() - interval '60 days'
           AND coalesce(a.status, '') <> 'Cancelled'
           AND coalesce(b.status, '') <> 'Cancelled')
UNION ALL
SELECT 7, 'suspected twins, named (newest 20)',
       coalesce((SELECT string_agg(t.pair, ' / ') FROM (
                   SELECT a.do_number || ' and ' || b.do_number || ' (' || a.al_number || ', ' || coalesce(a.total_qty::text, '') || ')' AS pair
                     FROM public.shared_do_records a
                     JOIN public.shared_do_records b
                       ON b.al_number = a.al_number
                      AND b.delivery_date IS NOT DISTINCT FROM a.delivery_date
                      AND b.total_qty IS NOT DISTINCT FROM a.total_qty
                      AND b.plot_1 IS NOT DISTINCT FROM a.plot_1
                      AND b.id > a.id
                      AND abs(extract(epoch FROM (b.created_at - a.created_at))) < 600
                    WHERE a.created_at > now() - interval '60 days'
                      AND coalesce(a.status, '') <> 'Cancelled'
                      AND coalesce(b.status, '') <> 'Cancelled'
                    ORDER BY a.created_at DESC LIMIT 20) t), 'none')
ORDER BY 1;
