-- ============================================================================
-- MJM AI POWERED SYSTEM -- RUN_ME_one_audit_per_save.sql
--
-- ONE PRESS OF SAVE IS ONE AUDIT, and the database is what says so.
--
-- The office opened U03 on 04 Nov and found the same audit over and over:
-- same plot, same day, same task, same result, the same remark, a
-- DIFFERENT photo file each time, about a minute apart.
--
-- WHY IT COULD HAPPEN. The phone saves an audit online like this: upload
-- the photo, then insert the row with an eight second limit. On a nursery
-- signal that insert can take longer than eight seconds AND STILL LAND.
-- The phone reads the timeout as a failure and puts the record in its
-- outbox to try again, so the sweep sends it a second time -- and the
-- copy it queued still carried the picture as raw data rather than the
-- link it had just uploaded, so the second try uploaded the same photo
-- again under a new name. A slow answer therefore cost two rows and two
-- photo files, and nothing anywhere could tell that the second row was
-- the first one arriving twice.
--
-- The phone half is fixed in audit/audit_dexie_offline.js, which now
-- queues the record WITH the photo it had already uploaded, and stamps
-- every save with an id of its own.
--
-- THIS FILE IS THE HALF THAT PROTECTS EVERY PHONE, including the ones
-- still running the old build and the ones with a week of work in the
-- outbox. client_uid is that stamp: one per press of Save, carried on
-- every retry of that same press. A unique index on it means the second
-- arrival is refused with 23505, and the sweep has retired a 23505 as
-- "already present" since the day it was written -- that path simply had
-- nothing to fire on, because nothing in these tables was ever unique.
--
-- WHY NOT audit_id. It looks like the natural key and it is not: it is
-- worked out on the phone as the number of audits it can see plus one, so
-- two auditors saving at the same moment both answer the same, and a
-- unique index on it would refuse the second person their work.
-- audit_script.js says so in its own comment. client_uid is random and
-- cannot collide.
--
-- WHAT IS REMOVED, and the rule is deliberately narrow: a row is an extra
-- copy only when EVERYTHING a person keyed matches a row already there --
-- the whole row compared through to_jsonb, less the id, the day it
-- landed, the photo file and the running number, which are the four a
-- second save changes by itself. The earliest row of each set is kept.
-- Two audits of one plot on two different days differ on the date and are
-- both kept. The same plot audited twice in one day with a different
-- result or a different remark differs too, and both are kept.
--
-- THE PHOTOS ARE LEFT IN STORAGE. This takes a row off the record, which
-- is the decision being made. A blob costs nothing where it sits, and a
-- deletion nobody can undo over a row somebody may want back is the worse
-- failure. Run shared/CHECK_duplicate_audits.sql first to see what will
-- go.
--
-- MAINTENANCE IS DELIBERATELY NOT DE-DUPLICATED HERE.
-- shared/RUN_ME_remove_duplicate_audits.sql already did that, and did it
-- better: it was written against the real table and chose which verdict
-- survives out of 188 disagreeing pairs, which is a judgement no rule in
-- this file could make. Two repairs for one fault is how they come to
-- disagree, so this one cleans only the three tables that file does not
-- touch -- and they need it, because all four are written by the same
-- function on the phone.
--
-- THAT FILE ALSO PUT A UNIQUE INDEX ON task_id, which is a STRONGER key
-- than the stamp below and fires first on maintenance. It is also a
-- blunter one: it means one audit per task FOR EVER, so a second audit of
-- the same task -- the Re-audit button on the detail screen -- is refused
-- by the database. That is worth knowing and is the office decision, not
-- this file. The stamp is added to all four tables all the same, so the
-- other three are guarded and so that the day task_id is reconsidered
-- there is something underneath it.
--
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf).
-- Safe to re-run: the second run finds nothing to remove.
-- ============================================================================

-- ── PREFLIGHT ───────────────────────────────────────────────────
DO $preflight$
BEGIN
  IF to_regclass('public.audit_maintenance_audits') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'The audit tables do not exist in this database.',
      HINT    = 'Run shared/RUN_ME_maintenance_audit_save.sql first.';
  END IF;
END $preflight$;

-- ────────────────────────────────────────────────────────────────
-- PART 1: The stamp, and the index that makes it mean something
--
-- PARTIAL, on purpose. Every row already in these tables has no stamp,
-- and a plain unique index would read all of them as one value and refuse
-- the lot. Only the rows a new build writes are held to it.
-- ────────────────────────────────────────────────────────────────
DO $cols$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_maintenance_audits',
                           'audit_plot_audits',
                           'audit_height_records',
                           'audit_papan_audits'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'no table %, skipping it', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS client_uid TEXT', t);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (client_uid) '
      || 'WHERE client_uid IS NOT NULL', t || '_client_uid_uniq', t);
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.client_uid IS %L', t,
      'One id per press of Save on the phone, carried on every retry of '
      || 'that same press. The unique index on it is what turns a record '
      || 'arriving twice into a 23505 the sync sweep retires quietly.');
  END LOOP;
END $cols$;

-- ────────────────────────────────────────────────────────────────
-- PART 2: Take the extra copies off the record
-- ────────────────────────────────────────────────────────────────
DO $dedupe$
DECLARE t TEXT;
        gone INT;
        said TEXT := '';
BEGIN
  /* Maintenance is not in this list on purpose -- see the head of the
     file. RUN_ME_remove_duplicate_audits.sql owns that table. */
  FOREACH t IN ARRAY ARRAY['audit_plot_audits',
                           'audit_height_records',
                           'audit_papan_audits'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format($q$
      WITH marked AS (
        SELECT id,
               to_jsonb(x) - 'id' - 'created_at' - 'photo_url'
                           - 'audit_id' - 'client_uid' AS mark
          FROM public.%I x
      ),
      keep AS (
        SELECT mark, min(id) AS keep_id FROM marked GROUP BY mark
      )
      DELETE FROM public.%I d
       USING marked m, keep k
       WHERE d.id = m.id AND m.mark = k.mark AND d.id <> k.keep_id
    $q$, t, t);
    GET DIAGNOSTICS gone = ROW_COUNT;

    said := said || CASE WHEN said = '' THEN '' ELSE ', ' END
                 || t || ': ' || gone::TEXT;
  END LOOP;

  PERFORM set_config('mjm.audit_dedupe', COALESCE(NULLIF(said, ''), 'nothing'), false);
END $dedupe$;

NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────
-- PART 3: Check it landed
--
-- WHAT A GOOD RESULT LOOKS LIKE, line by line:
--
--   1. REMOVED  how many extra copies came off each table on this run.
--               Maintenance is not listed: its copies were taken off by
--               RUN_ME_remove_duplicate_audits.sql. Every run after the
--               first should read 0, which is how you know it is safe to
--               run twice.
--   2. GUARD    one line per table, and all four must read READY. A line
--               reading NO INDEX is a table where a record arriving twice
--               is still two rows.
--   3. LEFT     maintenance audits still holding more than one copy. Must
--               be none ONCE RUN_ME_remove_duplicate_audits.sql has been
--               run -- this file deliberately leaves that table to it.
--               Anything still listed goes to that file, not this one.
--   4. STAMPED  how many rows carry a stamp. NOUGHT IS THE RIGHT ANSWER
--               TODAY and is not a fault: no phone has sent one yet, and
--               nothing is backfilled -- a stamp invented here would be
--               this file claiming two old rows were one press, which it
--               cannot know. The figure starts climbing as phones pick up
--               the new build, and it is the guard working.
-- ────────────────────────────────────────────────────────────────
SELECT 1 AS ord, 'REMOVED' AS part,
       'extra copies taken off on this run' AS detail,
       current_setting('mjm.audit_dedupe', true) AS reads

UNION ALL
SELECT 2, 'GUARD', c.relname::TEXT,
       CASE WHEN i.indexrelid IS NULL
              THEN 'NO INDEX -- a record arriving twice is still two rows'
            ELSE 'READY -- a repeat of one press is refused as 23505' END
  FROM pg_class c
  LEFT JOIN pg_index i
         ON i.indrelid = c.oid
        AND i.indisunique
        AND pg_get_indexdef(i.indexrelid) LIKE '%client_uid%'
 WHERE c.relname IN ('audit_maintenance_audits', 'audit_plot_audits',
                     'audit_height_records', 'audit_papan_audits')
   AND c.relkind = 'r'

UNION ALL
SELECT 3, 'LEFT',
       COALESCE(g.nursery, '?') || ' ' || COALESCE(g.plot, '?')
         || ' on ' || COALESCE(g.on_day, '?'),
       g.copies::TEXT || ' copies still there -- this file does not touch maintenance, '
       || 'so run shared/RUN_ME_remove_duplicate_audits.sql for these'
  FROM (SELECT count(*) AS copies, max(nursery) AS nursery, max(plot) AS plot,
               max(date::TEXT) AS on_day
          FROM (SELECT a.nursery, a.plot, a.date,
                       to_jsonb(a) - 'id' - 'created_at' - 'photo_url'
                                   - 'audit_id' - 'client_uid' AS mark
                  FROM audit_maintenance_audits a) m
         GROUP BY mark HAVING count(*) > 1) g

UNION ALL
SELECT 4, 'STAMPED', 'maintenance audits carrying a stamp',
       count(*) FILTER (WHERE client_uid IS NOT NULL)::TEXT || ' of '
       || count(*)::TEXT || ' -- nought today is correct, nothing is backfilled'
  FROM audit_maintenance_audits

 ORDER BY ord, detail;
