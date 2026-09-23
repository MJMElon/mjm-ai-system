-- ════════════════════════════════════════════════════════════════════════
-- MONTH LOCKS — replaces the single-cutoff-date DO Entry Lock with a
-- per-month lock calendar covering three areas: Delivery Orders, Approval
-- Letters, and Batch Record. Set from System Settings → Delivery Order,
-- AL & Batch Record Lock.
--
-- Each (year, month) auto-locks on its own auto-lock date — the 2nd of
-- the following month by default, but that date is itself editable per
-- month. A manual override (the round Jan-Dec buttons) beats the
-- auto-lock computation entirely: click to force a month open past its
-- auto-lock date, or force one locked early. See shared/shared_month_lock.js
-- for the actual logic — this file is schema only.
--
-- This SUPERSEDES shared_do_lock_settings from RUN_ME_do_lock.sql — that
-- table is left in place (harmless, nothing reads it after this change)
-- rather than dropped, in case anything still needs the old single cutoff
-- for reference.
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

NOTIFY pgrst, 'reload schema';

-- ── Check: every month lock row saved so far, and what it means ────────
-- Empty is a valid, expected result the first time this runs — it means
-- every month is on its default (2nd-of-next-month auto-lock, no
-- override), which is exactly how the calendar behaved before anyone
-- touched it.
SELECT
  year,
  month,
  auto_lock_date,
  manual_override,
  updated_at,
  updated_by,
  CASE
    WHEN manual_override IS TRUE  THEN 'Manually locked'
    WHEN manual_override IS FALSE THEN 'Manually unlocked (kept open past its auto-lock date)'
    WHEN auto_lock_date IS NOT NULL THEN 'Auto-locks on ' || to_char(auto_lock_date, 'DD Mon YYYY') || ' (custom date)'
    ELSE 'Auto-locks on the 2nd of the month after (default)'
  END AS meaning
FROM public.shared_month_locks
ORDER BY year, month;
