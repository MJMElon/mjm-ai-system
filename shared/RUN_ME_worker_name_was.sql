-- ════════════════════════════════════════════════════════════════════════
-- TELL A REGISTER ROW WHAT IT USED TO BE CALLED
-- shared/RUN_ME_worker_name_was.sql
--
-- Paste the WHOLE file into the Supabase SQL Editor and press Run.
-- Safe to run twice: a name already remembered is not added again.
-- No regular expressions, no backslashes, no apostrophe in any comment.
--
-- Run shared/RUN_ME_worker_previous_names.sql FIRST -- it makes the column
-- this writes into and the trigger that keeps it filled from now on.
--
-- WHAT THIS IS FOR
--
-- The trigger records a rename from the moment it is installed. It cannot
-- know about renames from before that, because nothing recorded them. This
-- file names those, one pair per line, so the ticks saved under the old
-- spelling find their column again.
--
-- THIS FILE NAMES ITS PAIRS ON PURPOSE. shared/CHECK_worker_names_with_no_column.sql
-- suggests a match where exactly one register name carries the orphan as a
-- whole word, and that suggestion is never applied by anything. Two people
-- really can be Ahmad and Ahmad Bin Ali, and a rule that merged them would
-- move one workers money to another. The office decides, and writes the pair
-- here.
--
-- HOW TO ADD A PAIR
--   add a line to the VALUES list below: the old name exactly as the tick
--   has it, then the current full_name, both in quotes
-- The current name must match a register row on letters and digits. A pair
-- naming a row that does not exist is reported and changes nothing.
--
-- WHAT IT DOES NOT DO
--
-- It does not touch a single tick. The ticks go on saying the old name and
-- are READ through the register, which is what makes this safe to run and
-- safe to undo -- take the pair out and the old behaviour is back.
--
-- WHAT TO LOOK FOR
--   1 ADDED     pairs written on this run -- 0 on a second run
--   2 UNKNOWN   pairs whose current name matches no register row -- should be 0
--   3 NOW       every row that remembers an older name. This is the count
--               BEFORE this run, because a CTE reads the snapshot its
--               statement began with -- so the proof is RUNNING IT AGAIN:
--               1 ADDED then reads 0 and the pair shows up here.
-- ════════════════════════════════════════════════════════════════════════

WITH pair(was, now_called) AS (VALUES
  ('Fauzan', 'Muhamad Fauzan')
),

k AS (
  SELECT p.was, p.now_called,
         upper(replace(replace(replace(replace(replace(replace(
           p.now_called, ' ', ''), '.', ''), ',', ''), '-', ''), '_', ''), '/', '')) AS nowk,
         upper(replace(replace(replace(replace(replace(replace(
           p.was, ' ', ''), '.', ''), ',', ''), '-', ''), '_', ''), '/', '')) AS wask
    FROM pair p
),

target AS (
  SELECT k.*, w.id
    FROM k
    LEFT JOIN mjmnpayroll_workers w
      ON upper(replace(replace(replace(replace(replace(replace(
           w.full_name, ' ', ''), '.', ''), ',', ''), '-', ''), '_', ''), '/', '')) = k.nowk
),

-- Only a pair that names a real row, and only a name the row does not
-- already remember and is not currently called.
todo AS (
  SELECT t.id, t.was
    FROM target t
    JOIN mjmnpayroll_workers w ON w.id = t.id
   WHERE t.id IS NOT NULL
     AND NOT (COALESCE(w.previous_names, '[]'::jsonb) @> to_jsonb(btrim(t.was)))
     AND upper(replace(replace(replace(replace(replace(replace(
           w.full_name, ' ', ''), '.', ''), ',', ''), '-', ''), '_', ''), '/', '')) <> t.wask
),

done AS (
  UPDATE mjmnpayroll_workers w
     SET previous_names = COALESCE(w.previous_names, '[]'::jsonb)
                          || jsonb_build_array(btrim(d.was)),
         updated_at = now()
    FROM todo d
   WHERE w.id = d.id
  RETURNING w.id
)

SELECT * FROM (
  SELECT 1 AS ord, '1 ADDED'::text AS section,
         (SELECT count(*)::text FROM done) AS n,
         COALESCE((SELECT string_agg(t.now_called || ' was also ' || t.was, '; ')
                     FROM todo d JOIN target t ON t.id = d.id AND t.was = d.was),
                  'nothing to add -- already remembered')::text AS detail
  UNION ALL
  SELECT 2, '2 UNKNOWN',
         (SELECT count(*)::text FROM target WHERE id IS NULL),
         COALESCE((SELECT string_agg(now_called, '; ') FROM target WHERE id IS NULL),
                  'none -- every pair named a real register row')
  UNION ALL
  SELECT 3, '3 NOW (before this run)',
         (SELECT count(*)::text FROM mjmnpayroll_workers
           WHERE jsonb_array_length(COALESCE(previous_names, '[]'::jsonb)) > 0),
         COALESCE((SELECT string_agg(full_name || ' <- ' || (previous_names #>> '{0}'), '; ')
                     FROM mjmnpayroll_workers
                    WHERE jsonb_array_length(COALESCE(previous_names, '[]'::jsonb)) > 0),
                  'none yet -- run it again and the pair appears here')
) z
ORDER BY ord;
