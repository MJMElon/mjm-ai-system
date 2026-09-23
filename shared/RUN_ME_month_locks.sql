-- ════════════════════════════════════════════════════════════════════════
-- MONTH LOCKS — a per-month lock calendar covering three areas: Delivery
-- Orders, Approval Letters, and Batch Record. Set from System Settings →
-- Delivery Order, AL & Batch Record Lock.
--
-- Each month auto-locks on the Nth of the month after it, N being the
-- "lock day" set beside the Year dropdown — day 2 until anyone changes
-- it. Changing the lock day only steers the current month onward; months
-- already elapsed keep whichever day was in force for them at the time,
-- which is what shared_month_lock_day_settings is for: each row says
-- "from this year/month onward, the lock day is this," and the most
-- recent row at or before a given month wins. A manual override (the
-- round Jan-Dec buttons, in shared_month_locks) beats the auto-lock
-- computation entirely: click to force a month open past its auto-lock
-- date, or force one locked early. See shared/shared_month_lock.js for
-- the actual logic — this file is schema only.
--
-- This SUPERSEDES shared_do_lock_settings from RUN_ME_do_lock.sql — that
-- table is left in place (harmless, nothing reads it after this change)
-- rather than dropped, in case anything still needs the old single cutoff
-- for reference. shared_month_locks.auto_lock_date (a since-removed
-- per-month custom date) is likewise left in place, unused, rather than
-- dropped — nothing sets or reads it once this runs.
--
-- Paste the whole thing into the Supabase SQL Editor and run it once.
-- Safe to run twice — creates nothing that already exists.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shared_month_locks (
  id               BIGSERIAL PRIMARY KEY,
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  auto_lock_date   DATE,
  manual_override  BOOLEAN,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       TEXT,
  UNIQUE (year, month)
);

ALTER TABLE public.shared_month_locks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='shared_month_locks'
       AND policyname='Authenticated read month locks') THEN
    CREATE POLICY "Authenticated read month locks"
      ON public.shared_month_locks FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='shared_month_locks'
       AND policyname='Authenticated write month locks') THEN
    CREATE POLICY "Authenticated write month locks"
      ON public.shared_month_locks FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.shared_month_lock_day_settings (
  id               BIGSERIAL PRIMARY KEY,
  effective_year   INTEGER NOT NULL,
  effective_month  INTEGER NOT NULL CHECK (effective_month BETWEEN 1 AND 12),
  lock_day         INTEGER NOT NULL CHECK (lock_day BETWEEN 1 AND 31),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       TEXT,
  UNIQUE (effective_year, effective_month)
);

ALTER TABLE public.shared_month_lock_day_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='shared_month_lock_day_settings'
       AND policyname='Authenticated read month lock day settings') THEN
    CREATE POLICY "Authenticated read month lock day settings"
      ON public.shared_month_lock_day_settings FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='shared_month_lock_day_settings'
       AND policyname='Authenticated write month lock day settings') THEN
    CREATE POLICY "Authenticated write month lock day settings"
      ON public.shared_month_lock_day_settings FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── Check: every manual override saved so far, and the lock-day history ─
-- Empty manual overrides is expected and fine — it means every month is
-- on its computed default. Empty lock-day history is also expected the
-- first time this runs — it means the lock day has always been the
-- system default (2) and nobody has changed it yet.
SELECT 'override' AS kind, year::TEXT, month::TEXT, NULL AS lock_day, updated_at, updated_by,
  CASE
    WHEN manual_override IS TRUE  THEN 'Manually locked'
    WHEN manual_override IS FALSE THEN 'Manually unlocked (kept open past its auto-lock date)'
    ELSE 'No override (on its computed default)'
  END AS meaning
FROM public.shared_month_locks
UNION ALL
SELECT 'lock day change', effective_year::TEXT, effective_month::TEXT, lock_day::TEXT, updated_at, updated_by,
  'From ' || effective_year || '-' || lpad(effective_month::TEXT, 2, '0') || ' onward, locks on day ' || lock_day || ' of the following month'
FROM public.shared_month_lock_day_settings
ORDER BY 1, 2, 3;
