-- ================================================================
-- MJM System — Allow 'no_status' as a plot_status value
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
-- ================================================================
--
-- Background:
--   The Maturity Allocation table now defaults a plot's status to
--   'No Status' until an admin opens it for collection. The existing
--   shared_plot_allocations.plot_status CHECK constraint may only
--   allow 'open' | 'sisa' | 'finished', which would reject upserts
--   when the user picks 'No Status' from the dropdown.
--
--   This migration:
--     1. Drops the old CHECK constraint (if any).
--     2. Re-adds it with 'no_status' included.
--     3. Sets the column default to 'no_status' so freshly-inserted
--        rows match what the UI shows.
--
--   It's idempotent: rerunning is safe.
-- ----------------------------------------------------------------

-- Make sure the table exists with the right shape; create it if not.
CREATE TABLE IF NOT EXISTS public.shared_plot_allocations (
  batch_name    TEXT NOT NULL,
  plot_name     TEXT NOT NULL,
  plot_status   TEXT NOT NULL DEFAULT 'no_status',
  reserved_for  TEXT,
  reserved_qty  INTEGER NOT NULL DEFAULT 0,
  premium       BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_name, plot_name)
);

-- Drop and recreate the plot_status CHECK so 'no_status' is accepted.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.shared_plot_allocations'::regclass
       AND contype  = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.shared_plot_allocations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.shared_plot_allocations
  ADD CONSTRAINT shared_plot_allocations_plot_status_check
  CHECK (plot_status IN ('no_status', 'open', 'sisa', 'finished'));

ALTER TABLE public.shared_plot_allocations
  ALTER COLUMN plot_status SET DEFAULT 'no_status';
