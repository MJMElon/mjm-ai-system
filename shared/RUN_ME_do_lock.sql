-- ════════════════════════════════════════════════════════════════════════
-- DO ENTRY LOCK — a cutoff date past which shared_do_records can no longer
-- be edited or deleted from operation_delivery.html. New DOs can still be
-- keyed in regardless; only editing/deleting an EXISTING DO dated before
-- the cutoff is blocked. Set from System Settings → Delivery Order
-- Controls → DO Entry Lock.
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
-- fails open" rule this system already follows everywhere else.
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
    WHEN cutoff_date IS NULL THEN 'No lock — every DO is editable'
    ELSE 'DOs delivered before ' || to_char(cutoff_date, 'DD Mon YYYY') ||
         ' are locked; ' || to_char(cutoff_date, 'DD Mon YYYY') ||
         ' onward stays editable'
  END AS meaning
FROM public.shared_do_lock_settings
WHERE id = 1;
