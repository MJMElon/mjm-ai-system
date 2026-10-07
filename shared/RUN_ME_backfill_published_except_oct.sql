-- ════════════════════════════════════════════════════════════════════════
-- Backfills nops_maint_published.payload from the live nops_maint_state for
-- every month EXCEPT October 2026 — so the field keeps seeing what it was
-- already seeing for every past month (Sep 2026, Jul 2026, Jun 2026, …),
-- and only October 2026 stays held back until somebody actually presses
-- Sync for it.
--
-- Follows RUN_ME_maint_published_payload.sql, which added the payload
-- column but deliberately left every row unsynced (payload NULL) — correct
-- for October, which had not been Synced under the old behaviour either, but
-- too wide a net for months the field has already been working off for
-- weeks. This narrows it back down to "only October 2026 is new".
--
-- Safe to run twice (ON CONFLICT DO UPDATE — a second run just re-copies
-- the same current state). Does not touch October 2026 at all: no row for
-- that month is inserted, and nothing already there is updated. Ends in
-- one check: every nursery/month, synced or not.
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO nops_maint_published (nursery, month, payload, updated_at)
SELECT nursery, month, payload, updated_at
  FROM nops_maint_state
 WHERE month <> 'Oct 2026'
ON CONFLICT (nursery, month) DO UPDATE
  SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at;

-- Check — every month but October should now read "t"; October stays "f"
-- until its own Work Editor is opened and Sync is pressed.
SELECT nursery, month, (payload IS NOT NULL) AS synced, updated_at
  FROM nops_maint_published
 ORDER BY month DESC, nursery;
