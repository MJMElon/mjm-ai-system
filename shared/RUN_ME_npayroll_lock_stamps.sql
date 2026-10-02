-- ════════════════════════════════════════════════════════════════════════
-- THE DATABASE STAMPS WHEN A SHEET WAS VERIFIED, NOT THE BROWSER
--
-- mjmnpayroll_verifications.verified_at says when somebody pressed
-- "Verify & lock", and mjmnpayroll_month_locks.updated_at says when a month
-- was held open or shut on the Lock Controls calendar. Both were being sent
-- from the BROWSER's clock, which is only as right as that device is: a
-- phone or a laptop an hour out stamps a payroll sign-off an hour out, and
-- nothing downstream can tell it happened.
--
-- These are the dates a payroll month is closed on. They should come from
-- one clock, and that clock is the database's.
--
-- A COLUMN DEFAULT IS NOT ENOUGH. The tables already carry DEFAULT now(),
-- and the screen now sends no timestamp at all - but both writes are
-- UPSERTS, and a default only fires on the INSERT half. Verifying a sheet
-- that was verified before would have kept the first date for ever. A
-- trigger fires on both halves, which is why this is a trigger.
--
-- Nothing already stored is altered: every existing row keeps the date it
-- has. Only writes from here on are stamped by the database.
--
-- Safe to run twice: CREATE OR REPLACE, and each trigger is dropped before
-- it is created.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION mjm_stamp_verified_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.verified_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION mjm_stamp_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_verified_at ON public.mjmnpayroll_verifications;
CREATE TRIGGER trg_stamp_verified_at
  BEFORE INSERT OR UPDATE ON public.mjmnpayroll_verifications
  FOR EACH ROW EXECUTE FUNCTION mjm_stamp_verified_at();

DROP TRIGGER IF EXISTS trg_stamp_month_locks ON public.mjmnpayroll_month_locks;
CREATE TRIGGER trg_stamp_month_locks
  BEFORE INSERT OR UPDATE ON public.mjmnpayroll_month_locks
  FOR EACH ROW EXECUTE FUNCTION mjm_stamp_updated_at();

DROP TRIGGER IF EXISTS trg_stamp_lock_days ON public.mjmnpayroll_lock_days;
CREATE TRIGGER trg_stamp_lock_days
  BEFORE INSERT OR UPDATE ON public.mjmnpayroll_lock_days
  FOR EACH ROW EXECUTE FUNCTION mjm_stamp_updated_at();

NOTIFY pgrst, 'reload schema';

-- ── Prove it, on a throwaway row ────────────────────────────────────────
-- A sheet nobody has, verified twice, with a date from 2020 sent BOTH times
-- the way a wrong device clock would send it. The second write is the one
-- that matters: it lands on an existing row, which is where a column
-- DEFAULT does nothing and only a trigger can help.
INSERT INTO public.mjmnpayroll_verifications (month, sheet, scope, verified_at, verified_by)
VALUES ('1900-01', 'stamp_probe', 'probe', '2020-01-01 00:00:00+00', 'stamp probe')
ON CONFLICT (month, sheet, scope) DO UPDATE SET verified_at = '2020-01-01 00:00:00+00';

INSERT INTO public.mjmnpayroll_verifications (month, sheet, scope, verified_at, verified_by)
VALUES ('1900-01', 'stamp_probe', 'probe', '2020-01-01 00:00:00+00', 'stamp probe')
ON CONFLICT (month, sheet, scope) DO UPDATE SET verified_at = '2020-01-01 00:00:00+00';

-- A GOOD RESULT is four rows, every one reading "yes". The last one is the
-- point of the file: the stored date is today, not 2020, even though 2020
-- was sent. The throwaway row is removed by this same statement, so nothing
-- is left behind whichever way it reads.
WITH gone AS (
  DELETE FROM public.mjmnpayroll_verifications
  WHERE  month = '1900-01' AND sheet = 'stamp_probe' AND scope = 'probe'
  RETURNING verified_at
)
SELECT 'verification stamp trigger' AS check,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgname = 'trg_stamp_verified_at' AND NOT tgisinternal)
            THEN 'yes' ELSE 'NO' END AS result
UNION ALL
SELECT 'month lock stamp trigger',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgname = 'trg_stamp_month_locks' AND NOT tgisinternal)
            THEN 'yes' ELSE 'NO' END
UNION ALL
SELECT 'lock day stamp trigger',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                         WHERE tgname = 'trg_stamp_lock_days' AND NOT tgisinternal)
            THEN 'yes' ELSE 'NO' END
UNION ALL
SELECT 'a wrong clock is overruled on re-verify',
       CASE WHEN (SELECT verified_at FROM gone) > now() - interval '1 minute'
            THEN 'yes' ELSE 'NO - the 2020 date was kept' END;
