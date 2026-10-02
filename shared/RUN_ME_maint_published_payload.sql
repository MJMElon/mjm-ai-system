-- ════════════════════════════════════════════════════════════════════════
-- nops_maint_published gets its own `payload` column, and worker_schedules()
-- is pointed at that table instead of the live nops_maint_state — so a tick
-- made in the office's Work Editor only reaches the FC Portal / 555 Worker
-- Portal once "Sync" is actually pressed, not the moment the tick is made.
--
-- Before this: the office wrote every tick straight to nops_maint_state,
-- live, and worker_schedules() (the function the FC Portal and the 555
-- Worker Portal both read the maintenance board from) read that same live
-- table — so "Sync" published a flat task list nothing consumed, while the
-- real schedule was already visible to the field before anyone pressed it.
--
-- After this: saveSchedule()/publishSchedule() (nursery_ops/
-- plot_maintenance_script.js, pushed alongside this file) copy the exact
-- same payload nops_maint_state carries into nops_maint_published.payload
-- at the moment Sync is pressed. worker_schedules() now reads from there,
-- and only rows with a payload — i.e. a nursery/month that has actually
-- been synced at least once.
--
-- Safe to run twice. Ends in one check: every nursery/month currently in
-- nops_maint_published, and whether it has a payload yet — a row reading
-- "f" here shows NOTHING to the field until somebody opens that nursery's
-- Work Editor and presses Sync. That includes whatever is sitting there for
-- October 2026 right now, from before this fix — this migration does not
-- backfill payload, on purpose.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE nops_maint_published ADD COLUMN IF NOT EXISTS payload JSONB;

DROP FUNCTION IF EXISTS public.worker_schedules(UUID);
CREATE FUNCTION public.worker_schedules(p_token UUID)
RETURNS TABLE (nursery TEXT, month TEXT, payload JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.worker_from_token(p_token);

  -- Not created yet on this database: the board copes with an empty plan,
  -- so an absent table is nothing to raise about.
  IF to_regclass('public.nops_maint_published') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE $q$
    SELECT s.nursery::TEXT, s.month::TEXT, s.payload::JSONB
      FROM nops_maint_published s
     WHERE s.payload IS NOT NULL
       AND EXISTS (
             SELECT 1 FROM public.worker_plots($1) wp
              WHERE public.worker_key(wp.nursery_name) = public.worker_key(s.nursery))
  $q$ USING p_token;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.worker_schedules(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- Check — a "f" under synced is correct and expected for anything nobody
-- has pressed Sync on since this migration ran, October 2026 included.
SELECT nursery, month, (payload IS NOT NULL) AS synced, updated_at
  FROM nops_maint_published
 ORDER BY month DESC, nursery;
