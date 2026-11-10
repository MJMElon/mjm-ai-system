-- ============================================================================
-- MJM AI POWERED SYSTEM -- CHECK_duplicate_audits.sql
--
-- ONE AUDIT, SAVED SEVERAL TIMES. Read-only: this file changes nothing.
--
-- The office opened U03 on 04 Nov and found the same maintenance audit
-- listed again and again -- same plot, same day, same task, same result,
-- the same remark, and a DIFFERENT photo file each time:
--
--     audit_maintenance_audits_photo_url_1793750892246_...jpeg
--     audit_maintenance_audits_photo_url_1793750950196_...jpeg
--     ... seven of them, about a minute apart
--
-- WHAT A DUPLICATE IS HERE. Every audit table is written through one
-- function on the phone, so the shape is the same in all four: a row is a
-- duplicate of an earlier one when everything a person keyed matches and
-- only the row id, the day it landed, the photo file and the running
-- number differ. Those four are exactly what a second save of the same
-- work changes by itself, so they are the four left out of the
-- comparison.
--
-- THE FINGERPRINT IS THE WHOLE ROW, never a list of column names. A
-- column added later is compared too, instead of being quietly ignored --
-- the same reason the Seeds In de-duplication compares through to_jsonb.
--
-- WHAT A GOOD RESULT LOOKS LIKE, line by line:
--
--   1. TABLE    one line per audit table: how many rows it holds, how many
--               of them are second or later copies, and how many separate
--               audits those copies belong to. All zeroes is a clean
--               database.
--   2. WORST    the audits copied the most, newest first, with the plot,
--               the day, who saved it and how many copies there are. The
--               office U03 row should be at the top of this list.
--   3. SPACING  for the worst one: how far apart the copies landed. Under
--               a minute between every copy is the phone sending the same
--               record again, not a person keying it again -- which is
--               what shared/RUN_ME_one_audit_per_save.sql is for.
--   4. PHOTOS   how many DIFFERENT photo files those copies point at. One
--               file for all of them is a row sent again by the sync
--               sweep. A file EACH is the online save queuing the record
--               for a second try without the picture it had already
--               uploaded, which is the fault being fixed.
--
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf).
-- Read-only and safe to run as often as you like.
-- ============================================================================

WITH tables AS (
  SELECT unnest(ARRAY['audit_maintenance_audits',
                      'audit_plot_audits',
                      'audit_height_records',
                      'audit_papan_audits']) AS t
),
rows_all AS (
  SELECT 'audit_maintenance_audits' AS tbl, a.id, a.created_at,
         a.photo_url, a.plot, a.nursery, a.date::TEXT AS on_day, a.auditor_name,
         to_jsonb(a) - 'id' - 'created_at' - 'photo_url' - 'audit_id' AS mark
    FROM audit_maintenance_audits a
   WHERE to_regclass('public.audit_maintenance_audits') IS NOT NULL
),
grp AS (
  SELECT mark, count(*) AS copies, min(id) AS keep_id,
         max(plot) AS plot, max(nursery) AS nursery,
         max(on_day) AS on_day, max(auditor_name) AS auditor_name,
         count(DISTINCT COALESCE(photo_url, 'none')) AS photo_files,
         min(created_at) AS first_at, max(created_at) AS last_at
    FROM rows_all
   GROUP BY mark
),
worst AS (
  SELECT * FROM grp WHERE copies > 1 ORDER BY copies DESC, last_at DESC LIMIT 1
)

SELECT 1 AS ord, 'TABLE' AS part,
       t.t AS detail,
       CASE WHEN to_regclass('public.' || t.t) IS NULL
              THEN 'no such table here'
            WHEN t.t <> 'audit_maintenance_audits'
              THEN 'counted below only for maintenance -- the other tables share '
                   || 'the same phone code, so run the repair to see their counts'
            ELSE (SELECT (SELECT count(*) FROM rows_all)::TEXT || ' row(s), of which '
                       || COALESCE(sum(copies - 1), 0)::TEXT || ' are extra copies across '
                       || count(*) FILTER (WHERE copies > 1)::TEXT || ' audit(s)'
                    FROM grp)
       END AS reads
  FROM tables t

UNION ALL
SELECT 2, 'WORST',
       COALESCE(g.nursery, '?') || ' ' || COALESCE(g.plot, '?')
         || ' on ' || COALESCE(g.on_day, '?'),
       g.copies::TEXT || ' copies by ' || COALESCE(g.auditor_name, 'somebody unnamed')
  FROM grp g
 WHERE g.copies > 1

UNION ALL
SELECT 3, 'SPACING',
       'the most-copied audit',
       'first at ' || to_char(w.first_at, 'DD Mon HH24:MI:SS')
       || ', last at ' || to_char(w.last_at, 'DD Mon HH24:MI:SS')
       || ' -- ' || round(extract(epoch FROM (w.last_at - w.first_at))
                          / GREATEST(w.copies - 1, 1))::TEXT
       || ' seconds between copies on average'
  FROM worst w

UNION ALL
SELECT 4, 'PHOTOS',
       'the most-copied audit',
       w.photo_files::TEXT || ' different photo file(s) behind ' || w.copies::TEXT
       || ' copies -- '
       || CASE WHEN w.photo_files = 1 THEN 'one upload, sent again by the sync sweep'
               WHEN w.photo_files = w.copies THEN 'one upload EACH, which is the online save '
                                                  || 'queuing a record whose picture was already up'
               ELSE 'a mixture of both' END
  FROM worst w

 ORDER BY ord, detail;
