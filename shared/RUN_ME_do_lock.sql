-- ════════════════════════════════════════════════════════════════════════
-- DO & AL ENTRY LOCK — one cutoff date, and everything dated ON OR BEFORE
-- it (the cutoff date itself included) can no longer be changed:
--   - shared_do_records: can't be edited or deleted (operation_delivery.html).
--     New DOs can still be keyed in regardless of the cutoff.
--   - shared_al_orders: can't be edited, cancelled or restored
--     (operation_booking.html). A NEW AL dated on/before the cutoff is
--     blocked too — an AL is the order intake record, so a backdated new
--     one would sneak a "historical" order into a closed period the same
--     way a backdated edit would.
-- Set from System Settings → Delivery Order & AL Controls → DO & AL Entry
-- Lock.
--
-- Paste the whole thing into the Supabase SQL Editor and run it once.
-- Safe to run twice — creates nothing that already exists, and the seed
-- row insert is a no-op once the row is there.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shared_do_lock_settings (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  cutoff_date  DATE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   TEXT,
  CONSTRAINT shared_do_lock_settings_singleton CHECK (id = 1)
);

ALTER TABLE public.shared_do_lock_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='shared_do_lock_settings'
       AND policyname='Authenticated read DO lock setting') THEN
    CREATE POLICY "Authenticated read DO lock setting"
      ON public.shared_do_lock_settings FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='shared_do_lock_settings'
       AND policyname='Authenticated write DO lock setting') THEN
    CREATE POLICY "Authenticated write DO lock setting"
      ON public.shared_do_lock_settings FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- No cutoff by default — absent means nothing is locked, same "access
-- fails open" rule this system already follows everywhere else. (If this
-- table already exists from an earlier run, this INSERT is skipped and
-- whatever cutoff is already saved is left untouched.)
INSERT INTO public.shared_do_lock_settings (id, cutoff_date)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ── Check: one row, and what it means ──────────────────────────────────
SELECT
  cutoff_date,
  updated_at,
  updated_by,
  CASE
    WHEN cutoff_date IS NULL THEN 'No lock — every DO and AL is editable'
    ELSE 'DOs and ALs dated on or before ' || to_char(cutoff_date, 'DD Mon YYYY') ||
         ' are locked (that date itself included); the day after stays editable'
  END AS meaning
FROM public.shared_do_lock_settings
WHERE id = 1;
