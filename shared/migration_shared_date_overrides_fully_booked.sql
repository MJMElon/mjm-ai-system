-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Add is_fully_booked column to shared_date_overrides
-- ----------------------------------------------------------------------------
-- Lets the operations team mark a day as "fully booked" without closing it
-- entirely. Closed days are visually red and read as "we're not operating
-- that day"; fully-booked days show as amber and read as "we're operating,
-- but every slot is taken". Both states block customer self-booking and
-- both surface the existing external_note remark to customers.
--
-- Combinations:
--   is_open = true,  is_fully_booked = false  → normal open day
--   is_open = true,  is_fully_booked = true   → open hours stand, but no
--                                                 customer slots bookable
--                                                 (calendar shows "Fully
--                                                 Booked" + remark)
--   is_open = false                            → closed (is_fully_booked
--                                                 is ignored)
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE shared_date_overrides
    ADD COLUMN IF NOT EXISTS is_fully_booked boolean NOT NULL DEFAULT false;

-- Existing rows default to NOT fully booked, which preserves all current
-- behaviour. No backfill or RLS changes needed — the column is read by the
-- same SELECT-all policy the table already has, and the operations team's
-- session already has write access via the existing override policy.
