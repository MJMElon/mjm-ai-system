-- ============================================================================
-- MJM AI POWERED SYSTEM — RUN_ME_culling_inang_draft.sql
--
-- THE SELECTION IS SAVED AS IT IS KEYED, SO A DRAFT HAS TO BE TOLD FROM A
-- ROUND.
--
-- The calculator used to write the pokok inang selection only when one of
-- the three buttons was pressed. A count walked in a plot and typed on a
-- phone is work that has been done, so it is written within the second of
-- the last keystroke now -- a phone that dies, a screen closed or a plot
-- changed used to mean the walk had to be walked again.
--
-- That breaks two things in the table as it stands, and this file is both.
--
--   attempt counted the ROUNDS, and was NOT NULL with a floor of 1. A draft
--   is not a round: written as 1 it would light the HQ verification button
--   over a number nobody has sent anywhere. The floor moves to 0, which is
--   what a figure keyed and not yet sent is.
--
--   sent_qty is NEW, and is the figure AS IT STOOD WHEN THE LAST ROUND WENT.
--   Without it there is no way to tell the next PERSON from the next ROUND:
--   the live figure is saved continuously, so comparing against it would
--   answer "nothing has changed" every time and the HQ button could never
--   light. Still over the line with the same number is somebody looking at
--   it again. Still over with a different one is a second selection, which
--   is what HQ is for.
--
-- Run AFTER shared/RUN_ME_culling_inang.sql, in the Supabase SQL Editor.
-- Safe to run twice. It adds a column and relaxes a check -- no row is
-- changed, nothing is deleted.
-- ============================================================================

ALTER TABLE public.fcportal_culling_inang
  ADD COLUMN IF NOT EXISTS sent_qty INT;

ALTER TABLE public.fcportal_culling_inang
  ALTER COLUMN attempt SET DEFAULT 0;

-- The old floor was 1. Dropped by NAME rather than rewritten, because a
-- constraint created by the CHECK syntax in the first file carries the name
-- Postgres gave it, and a second ADD with the same name is what fails on a
-- re-run.
ALTER TABLE public.fcportal_culling_inang
  DROP CONSTRAINT IF EXISTS fcportal_culling_inang_attempt_check;

ALTER TABLE public.fcportal_culling_inang
  ADD CONSTRAINT fcportal_culling_inang_attempt_check CHECK (attempt >= 0);

-- A row written before this file existed was a ROUND, so it keeps the round
-- it had and its sent figure is the one it was sent with. Only rows that
-- have never been through this are touched, and nothing is guessed: a row
-- with no round has no sent figure either.
UPDATE public.fcportal_culling_inang
   SET sent_qty = qty
 WHERE sent_qty IS NULL
   AND attempt >= 1;

NOTIFY pgrst, 'reload schema';


-- ── WHAT A GOOD RESULT LOOKS LIKE ───────────────────────────────
--
-- Three rows, every one OK.
--
--   1 sent_qty   the column is there
--   2 attempt    a draft may be nought, and the default is nought
--   3 stored     what is held right now. Nought on a quiet day, and that is
--                OK -- it means no plot has a selection keyed against it.
--
-- Run it again and it says the same thing, which is the other half of safe
-- to run twice.

SELECT 1 AS ord,
       'sent_qty' AS part,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public'
                            AND table_name='fcportal_culling_inang'
                            AND column_name='sent_qty')
            THEN 'OK' ELSE 'NOT OK' END AS verdict,
       'the figure the last round was sent with, kept beside the live one' AS detail
UNION ALL
SELECT 2, 'attempt',
       CASE WHEN COALESCE((SELECT column_default FROM information_schema.columns
                            WHERE table_schema='public'
                              AND table_name='fcportal_culling_inang'
                              AND column_name='attempt'), '') LIKE '0%'
             AND NOT EXISTS (SELECT 1 FROM pg_constraint
                              WHERE conname='fcportal_culling_inang_attempt_check'
                                AND pg_get_constraintdef(oid) LIKE '%>= 1%')
            THEN 'OK' ELSE 'NOT OK' END,
       'a keyed draft may sit at round nought until a button sends it'
UNION ALL
SELECT 3, 'stored',
       'OK',
       COALESCE((SELECT count(*)::text FROM public.fcportal_culling_inang), '0')
       || ' selection row(s), '
       || COALESCE((SELECT count(*)::text FROM public.fcportal_culling_inang
                     WHERE attempt = 0), '0')
       || ' keyed and not yet sent, highest round '
       || COALESCE((SELECT max(attempt)::text FROM public.fcportal_culling_inang), '0')
 ORDER BY ord;
