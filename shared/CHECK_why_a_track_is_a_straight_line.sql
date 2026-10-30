-- WHY A GPS TRACK CAME OUT AS ONE STRAIGHT LINE
--
-- The office put two pictures side by side: another app covering the whole
-- plot in hundreds of zigzags, and ours, one straight red line corner to
-- corner, 33 m. Then they said the thing that settles what this is -- B10 is
-- fine. B10 reads 1.63 km, 2.59 km, 2.07 km, 2.40 km, hundreds of fixes each,
-- off the SAME code on the SAME app. So the app records.
--
-- What a web page cannot do is record while the phone is asleep. A browser
-- STOPS handing out positions the moment the page is not on screen -- not
-- throttles, stops -- so a walk made with the phone in a pocket is one fix at
-- the start, one when it comes back out, and a straight line between them.
-- Only a native app can walk a track with the screen dark.
--
-- A SHORT WALK AND A SLEEPING PHONE ARE THE SAME PICTURE, so the question is
-- never the distance, it is HOW LONG the walk ran for how few fixes. The phone
-- gives a position every second or two in the open. 2 fixes over 7 minutes is
-- not a short walk.
--
-- The arithmetic is exact rather than a feeling: n fixes leave n-1 gaps
-- covering the whole walk, so where the walk divided by those gaps is already
-- 45 seconds, at least one gap IS that long. It cannot be otherwise.
--
-- WHAT A GOOD RESULT LOOKS LIKE: row 1 counts the lot. Rows reading
-- "PHONE WAS ASLEEP" are the walks that were not recorded -- the conductor
-- walked the plot and the phone was not listening. Rows reading "recorded"
-- are the B10 shape and are fine. "too short to say" is a walk of under
-- 45 seconds, where there is nothing to prove either way.
--
-- The fix is not in the app and no SQL repairs it: the walk has to be made
-- with the screen ON and the map IN FRONT, which is what the phone now says
-- on the map and on the row once a walk comes out with a hole in it.
--
-- Read-only. It creates nothing and changes nothing.

WITH w AS (
  SELECT
    r.id,
    COALESCE(r.nursery_name, '')                          AS nursery,
    COALESCE(r.plot_name, '(no plot)')                    AS plot,
    COALESCE(r.work_type, '')                             AS work_type,
    r.work_date::text                                     AS day,
    COALESCE(r.reported_by, '')                           AS by_who,
    COALESCE(r.gps_points, 0)                             AS fixes,
    COALESCE(r.gps_distance_m, 0)                         AS metres,
    GREATEST(0, COALESCE(
      EXTRACT(EPOCH FROM (r.gps_ended_at - r.gps_started_at))::int, 0)) AS secs
  FROM nops_maint_field_records r
  WHERE COALESCE(r.gps_points, 0) > 0
),
judged AS (
  SELECT w.*,
         -- The worst gap that is CERTAIN, in whole seconds. One fix leaves the
         -- whole walk uncovered, which is why the divisor has a floor of 1.
         CASE WHEN secs >= 45
              THEN secs / GREATEST(1, fixes - 1)
              ELSE 0 END AS worst_gap
  FROM w
),
said AS (
  SELECT judged.*,
         CASE WHEN secs < 45        THEN 'too short to say'
              WHEN worst_gap >= 45  THEN 'PHONE WAS ASLEEP'
              ELSE 'recorded' END AS verdict
  FROM judged
)
SELECT 0 AS block, '' AS sort_key,
       'ALL RECORDS WITH A TRACK' AS plot,
       '' AS nursery, '' AS work, '' AS day, '' AS walked, '' AS fixes,
       'tracks: ' || COUNT(*)::text
         || '   PHONE WAS ASLEEP: ' || COUNT(*) FILTER (WHERE verdict = 'PHONE WAS ASLEEP')::text
         || '   recorded: ' || COUNT(*) FILTER (WHERE verdict = 'recorded')::text
         || '   too short to say: ' || COUNT(*) FILTER (WHERE verdict = 'too short to say')::text
         AS verdict
FROM said
UNION ALL
SELECT 1,
       -- The sleeping ones first: those are the walks somebody did for nothing.
       CASE WHEN verdict = 'PHONE WAS ASLEEP' THEN '1'
            WHEN verdict = 'recorded'         THEN '3'
            ELSE '2' END
         || to_char(99999999 - worst_gap, 'FM00000000')
         || COALESCE(day, ''),
       plot,
       nursery,
       work_type,
       COALESCE(day, ''),
       metres::text || ' m over ' || (secs / 60)::text || 'm ' || (secs % 60)::text || 's',
       fixes::text || ' fixes',
       verdict
         || CASE WHEN worst_gap >= 45
                 THEN ' -- at least ' || (worst_gap / 60)::text || 'm ' || (worst_gap % 60)::text
                      || 's with no position, by ' || COALESCE(by_who, 'somebody')
                 ELSE '' END
FROM said
ORDER BY block, sort_key;
