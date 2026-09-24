-- =====================================================================
--  RENAME "Pre Nursery Auditor" -> "Pre Nursery Auditor + Drone Operator"
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run finds nothing left to rename and
--  says so in as many words.
--
--  No regular expressions and no backslashes anywhere in this file, so
--  it survives being copied out of a browser and pasted back in.
--
--  WHY THIS IS SQL AND NOT A CODE CHANGE
--  That title is not written anywhere in the app -- it is a row somebody
--  keyed, so it lives in the database and only the database can change
--  it. Which table it is in depends on where it was keyed: a person's
--  role, a seat's label, a job title. Rather than guess, this looks in
--  every label-ish column of this system's own tables, renames the ones
--  that say exactly "Pre Nursery Auditor", and prints what it touched.
--
--  MATCHED EXACTLY, ignoring case and outer spaces. A row that says
--  something else -- "Pre Nursery Auditor (PN)", "Auditor" -- is left
--  alone: it is not the title that was asked about, and a sweep that
--  guessed at near misses would rename things nobody mentioned.
--
--  Views are skipped (renaming through one would write to the table
--  underneath twice), and so is every table that is not this system's.
-- =====================================================================

-- A scratch table for what was changed, so the last statement can print
-- it. Dropped and rebuilt each run; you may drop it afterwards.
DROP TABLE IF EXISTS _mjm_rename_log;
CREATE TABLE _mjm_rename_log (
  table_name      text,
  column_name     text,
  rows_renamed    int,
  rows_now_named  int
);

DO $$
DECLARE
  old_title CONSTANT text := 'Pre Nursery Auditor';
  new_title CONSTANT text := 'Pre Nursery Auditor + Drone Operator';
  r     record;
  n     int;
  have  int;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name   = c.table_name
     AND t.table_type   = 'BASE TABLE'          -- never a view
    WHERE c.table_schema = 'public'
      -- This system's own tables only. left() rather than LIKE so there
      -- is no underscore to escape and no backslash in the file.
      AND (left(c.table_name,  6) = 'nelos_'
        OR left(c.table_name,  6) = 'audit_'
        OR left(c.table_name,  7) = 'shared_'
        OR left(c.table_name, 10) = 'operation_'
        OR left(c.table_name,  5) = 'nops_'
        OR left(c.table_name,  9) = 'npayroll_')
      -- Columns that hold a name for something, not free text or ids.
      AND c.column_name IN ('role', 'roles', 'title', 'job_title', 'label',
                            'name', 'full_name', 'position', 'designation',
                            'category', 'seat_title')
      AND c.data_type IN ('text', 'character varying')
    ORDER BY c.table_name, c.column_name
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = $1 WHERE lower(btrim(%I)) = lower($2)',
      r.table_name, r.column_name, r.column_name)
      USING new_title, old_title;
    GET DIAGNOSTICS n = ROW_COUNT;

    -- How many rows carry the new title now. On a second run this is
    -- what tells you it is already done rather than never found.
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE lower(btrim(%I)) = lower($1)',
      r.table_name, r.column_name)
      INTO have USING new_title;

    IF n > 0 OR have > 0 THEN
      INSERT INTO _mjm_rename_log VALUES (r.table_name, r.column_name, n, have);
    END IF;
  END LOOP;
END $$;

-- ONE result set -- the SQL Editor only shows the last statement's.
SELECT 0                                              AS sort,
       'ALL PLACES THIS TITLE IS STORED'::text        AS place,
       (SELECT COALESCE(sum(rows_renamed),   0) FROM _mjm_rename_log)::int AS rows_renamed,
       (SELECT COALESCE(sum(rows_now_named), 0) FROM _mjm_rename_log)::int AS rows_with_new_title,
       CASE
         WHEN (SELECT COALESCE(sum(rows_renamed), 0) FROM _mjm_rename_log) > 0
           THEN 'Done. Reload the page that shows the title and it reads '
                || '"Pre Nursery Auditor + Drone Operator". The places it was '
                || 'stored are listed below.'
         WHEN (SELECT COALESCE(sum(rows_now_named), 0) FROM _mjm_rename_log) > 0
           THEN 'Already renamed -- nothing left to change. This is the right '
                || 'answer on a second run.'
         ELSE 'NOTHING FOUND. No row anywhere says exactly "Pre Nursery Auditor". '
              || 'Send back what the screen shows, character for character, and '
              || 'this can be pointed at it.'
       END                                            AS result
UNION ALL
SELECT 1,
       table_name || ' . ' || column_name,
       rows_renamed,
       rows_now_named,
       CASE WHEN rows_renamed > 0
            THEN 'renamed here'
            ELSE 'already carried the new title -- left as it is'
       END
FROM _mjm_rename_log
ORDER BY sort, place;

-- WHAT A GOOD RESULT LOOKS LIKE
--   A first row saying "Done.", with rows_renamed being how many rows
--   changed -- usually 1, sometimes 2 if the title is kept in a person's
--   row and on a seat as well.
--
--   Under it, one row per place it is stored, naming the table and the
--   column, each saying "renamed here".
--
--   A SECOND run says "Already renamed", rows_renamed 0, and the same
--   list underneath saying "already carried the new title". That is the
--   correct answer, not a failure.
--
--   NOTHING FOUND on the FIRST run means the title on the screen is not
--   exactly "Pre Nursery Auditor" -- a bracket, an extra word, a
--   different spelling. Send the exact text back.
--
--   Afterwards, DROP TABLE _mjm_rename_log; tidies the scratch table
--   away. Leaving it costs nothing.
