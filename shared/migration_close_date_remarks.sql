-- Add external + internal remark columns to shared_date_overrides
--
-- external_note: shown to customers on the public CollectionTimeBooking page
--                so they understand why a day is closed (e.g. "Annual stock-take",
--                "Staff training — collections resume tomorrow").
-- internal_note: visible only inside the operations module for back-office context
--                (e.g. "Closed by request from Boss, reopen Mon").

ALTER TABLE shared_date_overrides
  ADD COLUMN IF NOT EXISTS external_note text,
  ADD COLUMN IF NOT EXISTS internal_note text;
