-- ================================================================
-- PROJECT MONITORING SYSTEM: REMOVE EVERY TASK
--
-- One paste. It empties the task list of the Project Monitoring
-- System and nothing else. THIS CANNOT BE UNDONE, there is no copy
-- kept, so run it only when the whole list is meant to go.
--
-- WHAT IT REMOVES
--   every row of pms_tasks
--
-- WHAT IT LEAVES ALONE
--   pms_settings        the projects, the priority and type lists, the
--                       savings figures and who may open which tab
--   pms_task_requests   every request, whatever its status. A request
--                       approved earlier still reads Approved, and
--                       simply no longer has a task to open
--   who holds the module on the portal User Access page
--
-- Safe to run twice. A second run finds nothing to remove and says 0.
--
-- THE CHECK. One result, four lines, and what a good one reads:
--   1  tasks removed by this run   54 the first time, 0 on a second
--   2  tasks left                  0
--   3  task requests               whatever was there, untouched
--   4  settings row                present
-- ================================================================

DO $do$
DECLARE n bigint;
BEGIN
  DELETE FROM public.pms_tasks;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('pms.cleared', COALESCE(n, 0)::text, false);
END
$do$;

SELECT n AS "#", item, result FROM (
  SELECT 1 AS n, 'tasks removed by this run' AS item,
         COALESCE(NULLIF(current_setting('pms.cleared', true), ''), '0') AS result
  UNION ALL
  SELECT 2, 'tasks left', (SELECT count(*) FROM public.pms_tasks)::text
  UNION ALL
  SELECT 3, 'task requests', (SELECT count(*) FROM public.pms_task_requests)::text || ' untouched'
  UNION ALL
  SELECT 4, 'settings row',
         CASE WHEN EXISTS (SELECT 1 FROM public.pms_settings WHERE id = 'config') THEN 'present' ELSE 'not saved yet' END
) x
ORDER BY n;
