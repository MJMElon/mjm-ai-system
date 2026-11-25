-- NELOS FOR SEALS STARTS AT 050001.
--
-- The office: the cases raised for seal 050000 or before are to be removed,
-- and the seal checks are to raise nothing for those numbers from now on.
--
-- Two parts:
--   1. seal_settings.nelos_from_no, 50001 by default, and a BEFORE INSERT
--      trigger on seal_problems (b_seal_nelos_from, sorted after a_seal_six
--      so the codes are already six digits) that drops a problem whose
--      HIGHEST seal is under that number. Every check in every file files
--      its problem through an insert into seal_problems, so this one trigger
--      covers all of them, the gap check that runs on every DO save included.
--      A problem whose range reaches 050001 or above is kept WHOLE, because
--      it is about seals that count. A problem naming no seal at all (a
--      delivery that does not match, a range that could not be read) is kept.
--   2. The problems already filed under that number are DELETED, and every
--      NELOS case that held nothing else is DELETED with its comments. A case
--      that also holds a problem from 050001 up is kept. The seals themselves,
--      the consents, the scans and the DOs are not touched.
--
-- Safe to run twice: the second run deletes 0.
--
-- WHAT A GOOD RESULT LOOKS LIKE (one table, read top to bottom):
--   1  NELOS starts at seal            050001
--   2  floor trigger installed         yes
--   3  problems deleted this run       the number, then 0 on a second run
--   4  NELOS cases deleted this run    the number, then 0 on a second run
--   5  problems left under the floor   0
--   6  a new problem under the floor   dropped
--   7  a new problem at the floor      kept

ALTER TABLE public.seal_settings ADD COLUMN IF NOT EXISTS nelos_from_no BIGINT NOT NULL DEFAULT 50001;

CREATE OR REPLACE FUNCTION public.seal_nelos_from()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_floor BIGINT;
  v_top   BIGINT;
BEGIN
  SELECT s.nelos_from_no INTO v_floor FROM public.seal_settings s WHERE s.id = 1;
  IF v_floor IS NULL THEN RETURN NEW; END IF;
  v_top := GREATEST(public.seal_no(NULLIF(NEW.seal_from, '')), public.seal_no(NULLIF(NEW.seal_to, '')));
  IF v_top IS NOT NULL AND v_top < v_floor THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS b_seal_nelos_from ON public.seal_problems;
CREATE TRIGGER b_seal_nelos_from BEFORE INSERT ON public.seal_problems
  FOR EACH ROW EXECUTE FUNCTION public.seal_nelos_from();

DO $$
DECLARE
  v_floor  BIGINT;
  v_cases  BIGINT[];
  n_prob   INT := 0;
  n_case   INT := 0;
  v_probe  BIGINT;
  r_low    TEXT := 'not tried';
  r_high   TEXT := 'not tried';
BEGIN
  SELECT nelos_from_no INTO v_floor FROM public.seal_settings WHERE id = 1;

  -- The cases holding ONLY problems under the floor.
  SELECT COALESCE(array_agg(DISTINCT p.nelos_case_id), '{}') INTO v_cases
    FROM public.seal_problems p
   WHERE p.nelos_case_id IS NOT NULL
     AND GREATEST(public.seal_no(NULLIF(p.seal_from, '')), public.seal_no(NULLIF(p.seal_to, ''))) < v_floor
     AND NOT EXISTS (SELECT 1 FROM public.seal_problems q
                      WHERE q.nelos_case_id = p.nelos_case_id
                        AND COALESCE(GREATEST(public.seal_no(NULLIF(q.seal_from, '')),
                                              public.seal_no(NULLIF(q.seal_to, ''))), v_floor) >= v_floor);

  DELETE FROM public.seal_problems p
   WHERE GREATEST(public.seal_no(NULLIF(p.seal_from, '')), public.seal_no(NULLIF(p.seal_to, ''))) < v_floor;
  GET DIAGNOSTICS n_prob = ROW_COUNT;

  IF to_regclass('public.nelos_cases') IS NOT NULL AND cardinality(v_cases) > 0 THEN
    DELETE FROM public.nelos_cases c WHERE c.id = ANY (v_cases);
    GET DIAGNOSTICS n_case = ROW_COUNT;
  END IF;

  -- The proof, rolled back: one problem under the floor, one at it.
  BEGIN
    INSERT INTO public.seal_problems (kind, seal_from, seal_to, qty, detail)
    VALUES ('missed_scan', '049999', '050000', 2, 'probe, rolled back')
    RETURNING id INTO v_probe;
    r_low := CASE WHEN v_probe IS NULL THEN 'dropped' ELSE 'NO, it was kept' END;
    v_probe := NULL;
    INSERT INTO public.seal_problems (kind, seal_from, seal_to, qty, detail)
    VALUES ('missed_scan', '050001', '050001', 1, 'probe, rolled back')
    RETURNING id INTO v_probe;
    r_high := CASE WHEN v_probe IS NOT NULL THEN 'kept' ELSE 'NO, it was dropped' END;
    RAISE EXCEPTION 'seal_floor_probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'seal_floor_probe_rollback' THEN
      r_high := 'could not try it, ' || SQLERRM;
    END IF;
  END;

  PERFORM set_config('seal_floor.prob', n_prob::TEXT, false);
  PERFORM set_config('seal_floor.case', n_case::TEXT, false);
  PERFORM set_config('seal_floor.low', r_low, false);
  PERFORM set_config('seal_floor.high', r_high, false);
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 1 AS n, 'NELOS starts at seal' AS what,
       (SELECT public.seal_code(nelos_from_no, 6) FROM public.seal_settings WHERE id = 1) AS detail
UNION ALL
SELECT 2, 'floor trigger installed',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'b_seal_nelos_from' AND NOT tgisinternal) THEN 'yes' ELSE 'NO' END
UNION ALL
SELECT 3, 'problems deleted this run', current_setting('seal_floor.prob', true)
UNION ALL
SELECT 4, 'NELOS cases deleted this run', current_setting('seal_floor.case', true)
UNION ALL
SELECT 5, 'problems left under the floor',
       (SELECT count(*) FROM public.seal_problems p
         WHERE GREATEST(public.seal_no(NULLIF(p.seal_from, '')), public.seal_no(NULLIF(p.seal_to, '')))
               < (SELECT nelos_from_no FROM public.seal_settings WHERE id = 1))::TEXT
UNION ALL
SELECT 6, 'a new problem under the floor', current_setting('seal_floor.low', true)
UNION ALL
SELECT 7, 'a new problem at the floor', current_setting('seal_floor.high', true)
ORDER BY 1;
