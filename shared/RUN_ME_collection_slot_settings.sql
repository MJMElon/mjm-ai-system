-- ════════════════════════════════════════════════════════════════════════
-- COLLECTION TIME SLOT SETTING
--
-- Seedling Stock Management, System Settings, Collection Time Slot.
-- One row, the hours a collection can be booked in and how much one hour
-- can take. Every booking screen reads it through
-- shared/shared_collection_slots.js, so a change there is the slots on
-- Collection Time Slot Booking.
--
-- The row is seeded with EXACTLY the hours the pages had written into
-- them before this existed, so running this file moves nothing on screen:
--   Monday to Friday 8 AM to 5 PM, Saturday 8 AM to 12 PM, Sunday closed,
--   350 seedlings an hour for one booking, 600 for one hour slot.
-- A row already saved is left alone.
--
-- Anyone may READ it, the same as shared_date_overrides, because the
-- customer booking reads it too. Only operations staff may WRITE it.
--
-- Safe to run twice.
--
-- LUNCH is one break for every open day, two hours that are both empty
-- until somebody sets them, so adding the columns moves nothing. This
-- file adds them to a table made by the first version of it as well.
--
-- WHAT A GOOD RESULT LOOKS LIKE: one row. Read across it, the hours and
-- the two figures are what the settings page shows, slots reads 9 and 4
-- on a fresh install (a lunch hour inside the day takes one off), lunch
-- reads none until one is saved, and policies reads 2.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shared_collection_slot_settings (
  id                 INTEGER PRIMARY KEY DEFAULT 1,
  weekday_open       INTEGER NOT NULL DEFAULT 8,
  weekday_close      INTEGER NOT NULL DEFAULT 17,
  sat_open           INTEGER NOT NULL DEFAULT 8,
  sat_close          INTEGER NOT NULL DEFAULT 12,
  rate_per_hour      INTEGER NOT NULL DEFAULT 350,
  max_load_per_hour  INTEGER NOT NULL DEFAULT 600,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         TEXT,
  CONSTRAINT shared_collection_slot_settings_singleton CHECK (id = 1),
  CONSTRAINT shared_collection_slot_settings_weekday CHECK (weekday_open >= 0 AND weekday_close <= 24 AND weekday_close > weekday_open),
  CONSTRAINT shared_collection_slot_settings_sat CHECK (sat_open >= 0 AND sat_close <= 24 AND sat_close > sat_open),
  CONSTRAINT shared_collection_slot_settings_load CHECK (rate_per_hour > 0 AND max_load_per_hour > 0)
);

ALTER TABLE public.shared_collection_slot_settings ADD COLUMN IF NOT EXISTS lunch_start INTEGER;
ALTER TABLE public.shared_collection_slot_settings ADD COLUMN IF NOT EXISTS lunch_end INTEGER;

DO $$
BEGIN
  -- Both hours or neither, and the break ends after it starts. Both NOT NULL
  -- tests are spelled out, because a CHECK lets an unknown answer through.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'shared_collection_slot_settings_lunch') THEN
    ALTER TABLE public.shared_collection_slot_settings
      ADD CONSTRAINT shared_collection_slot_settings_lunch CHECK (
        (lunch_start IS NULL AND lunch_end IS NULL)
        OR (lunch_start IS NOT NULL AND lunch_end IS NOT NULL
            AND lunch_start >= 0 AND lunch_end <= 24 AND lunch_end > lunch_start));
  END IF;
END $$;

ALTER TABLE public.shared_collection_slot_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.shared_collection_slot_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.shared_collection_slot_settings TO authenticated;

DO $$
DECLARE
  staff_test TEXT;
BEGIN
  -- The staff test the date overrides already use, where it exists.
  IF to_regproc('public._mjm_ops_staff') IS NOT NULL THEN
    staff_test := '(SELECT public._mjm_ops_staff())';
  ELSE
    staff_test := 'true';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'shared_collection_slot_settings'
                   AND policyname = 'Anyone can read collection slots') THEN
    CREATE POLICY "Anyone can read collection slots"
      ON public.shared_collection_slot_settings FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'shared_collection_slot_settings'
                   AND policyname = 'Staff write collection slots') THEN
    EXECUTE 'CREATE POLICY "Staff write collection slots" '
         || 'ON public.shared_collection_slot_settings FOR ALL TO authenticated '
         || 'USING (' || staff_test || ') WITH CHECK (' || staff_test || ')';
  END IF;
END $$;

INSERT INTO public.shared_collection_slot_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

SELECT
  to_char(make_time(s.weekday_open, 0, 0), 'HH12 AM') || ' to ' ||
    CASE WHEN s.weekday_close = 24 THEN '12 AM' ELSE to_char(make_time(s.weekday_close, 0, 0), 'HH12 AM') END AS monday_to_friday,
  to_char(make_time(s.sat_open, 0, 0), 'HH12 AM') || ' to ' ||
    CASE WHEN s.sat_close = 24 THEN '12 AM' ELSE to_char(make_time(s.sat_close, 0, 0), 'HH12 AM') END AS saturday,
  'closed' AS sunday,
  CASE WHEN s.lunch_start IS NULL THEN 'none'
       ELSE to_char(make_time(s.lunch_start, 0, 0), 'HH12 AM') || ' to ' ||
            CASE WHEN s.lunch_end = 24 THEN '12 AM' ELSE to_char(make_time(s.lunch_end, 0, 0), 'HH12 AM') END
  END AS lunch,
  ((s.weekday_close - s.weekday_open)
     - coalesce(greatest(0, least(s.weekday_close, s.lunch_end) - greatest(s.weekday_open, s.lunch_start)), 0))
   || ' weekday, ' ||
  ((s.sat_close - s.sat_open)
     - coalesce(greatest(0, least(s.sat_close, s.lunch_end) - greatest(s.sat_open, s.lunch_start)), 0))
   || ' Saturday' AS slots,
  s.rate_per_hour AS seedlings_per_hour_one_booking,
  s.max_load_per_hour AS max_seedlings_per_slot,
  s.updated_at,
  s.updated_by,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
     AND tablename = 'shared_collection_slot_settings') AS policies
FROM public.shared_collection_slot_settings s
WHERE s.id = 1;
