-- ════════════════════════════════════════════════════════════════════════
-- PAYROLL MONTH LOCKS AND SHEET VERIFICATION
--
-- Two ways a payroll month stops being editable, and they answer different
-- questions:
--
--   VERIFICATION is per sheet. Somebody with the Verify tick on a sheet
--   says "this one is checked and right" — Work Maintenance for BNN,
--   Transplanting for UNN 1 — and that sheet locks the moment they do.
--   It is the normal way a month is closed, sheet by sheet, by the person
--   who checked it.
--
--   THE MONTH LOCK is the whole module at once, on a calendar: every sheet
--   of that month, verified or not. It auto-locks on the Nth of the
--   following month and can be forced open or shut by hand. It is the
--   backstop, and the only thing that can re-open a month once its sheets
--   are verified.
--
-- ITS OWN TABLES, NOT shared_month_locks. That calendar governs Delivery
-- Orders, Approval Letters and the Batch Record, and the two must be able
-- to move separately: closing September's payroll cannot be allowed to
-- close September's delivery orders, and re-opening a delivery order in
-- October cannot re-open a payroll that has already been paid.
--
-- Nothing here decides WHO may verify or unlock. That is the Payroll
-- module's own User Access page (verify per sheet, Lock Controls for
-- unlocking), read by the browser the same way every other permission in
-- this module is.
--
-- Safe to run twice: creates nothing that already exists.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. The month calendar ───────────────────────────────────────────────
-- manual_override NULL means "use the computed default" — locked once its
-- own auto-lock date has passed. Same rule as shared_month_locks: nobody
-- has to visit the screen for a month to behave as its default says.
CREATE TABLE IF NOT EXISTS public.mjmnpayroll_month_locks (
  id               BIGSERIAL PRIMARY KEY,
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  manual_override  BOOLEAN,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       TEXT,
  UNIQUE (year, month)
);


-- ── 2. The lock day, and when it changed ────────────────────────────────
-- Each row says "from this year and month onward, the lock day is this",
-- and the most recent row at or before a given month wins. Changing the
-- day today must not rewrite how an already-elapsed month got locked.
CREATE TABLE IF NOT EXISTS public.mjmnpayroll_lock_days (
  id               BIGSERIAL PRIMARY KEY,
  effective_year   INTEGER NOT NULL,
  effective_month  INTEGER NOT NULL CHECK (effective_month BETWEEN 1 AND 12),
  lock_day         INTEGER NOT NULL CHECK (lock_day BETWEEN 1 AND 28),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       TEXT,
  UNIQUE (effective_year, effective_month)
);


-- ── 3. Who verified which sheet ─────────────────────────────────────────
-- `sheet` is the payroll sub-tab: maint, transpl, seedling, other, monthly.
-- `scope` is the nursery or section that sheet was showing — Work
-- Maintenance is verified one nursery at a time, and a claim verified for
-- BNN says nothing about UNN 1. Empty string for a sheet with no such
-- picker, so the unique index has something to hold.
CREATE TABLE IF NOT EXISTS public.mjmnpayroll_verifications (
  id           BIGSERIAL PRIMARY KEY,
  month        TEXT NOT NULL,             -- 'YYYY-MM'
  sheet        TEXT NOT NULL,
  scope        TEXT NOT NULL DEFAULT '',
  verified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by  TEXT,
  UNIQUE (month, sheet, scope)
);


-- ── 4. Reading and writing ──────────────────────────────────────────────
-- Signed-in office users, the same as every other table this module reads.
-- Who may actually verify or unlock is decided in User Access, in the
-- browser, exactly as it is for the rest of the payroll module.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mjmnpayroll_month_locks',
                           'mjmnpayroll_lock_days',
                           'mjmnpayroll_verifications'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = t
                      AND policyname = 'Authenticated read ' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
                     'Authenticated read ' || t, t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = t
                      AND policyname = 'Authenticated write ' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
                     'Authenticated write ' || t, t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

GRANT USAGE, SELECT ON SEQUENCE public.mjmnpayroll_month_locks_id_seq   TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mjmnpayroll_lock_days_id_seq     TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mjmnpayroll_verifications_id_seq TO authenticated;


-- ── 5. PostgREST has to be told the shape changed ───────────────────────
NOTIFY pgrst, 'reload schema';


-- ── 6. What should have happened ────────────────────────────────────────
-- One result set, because the SQL Editor only shows the last statement's.
--
-- A GOOD RESULT is four rows, every one reading "yes":
--   month lock calendar        yes
--   lock day history           yes
--   sheet verifications        yes
--   all three readable         yes
SELECT 'month lock calendar' AS check,
       CASE WHEN to_regclass('public.mjmnpayroll_month_locks')   IS NULL THEN 'NO' ELSE 'yes' END AS result
UNION ALL
SELECT 'lock day history',
       CASE WHEN to_regclass('public.mjmnpayroll_lock_days')     IS NULL THEN 'NO' ELSE 'yes' END
UNION ALL
SELECT 'sheet verifications',
       CASE WHEN to_regclass('public.mjmnpayroll_verifications') IS NULL THEN 'NO' ELSE 'yes' END
UNION ALL
SELECT 'all three readable',
       CASE WHEN (SELECT count(*) FROM pg_policies
                   WHERE schemaname = 'public'
                     AND tablename IN ('mjmnpayroll_month_locks','mjmnpayroll_lock_days',
                                       'mjmnpayroll_verifications')) >= 6
            THEN 'yes' ELSE 'NO - policies missing' END;
