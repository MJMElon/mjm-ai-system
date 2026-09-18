-- =====================================================================
--  RENAME "Pre Nursery Auditor" → "Pre Nursery Auditor + Drone Operator"
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run finds nothing left to rename and
--  says so.
--
--  WHY THIS IS SQL AND NOT A CODE CHANGE
--  That title is not written anywhere in the app — it is a row somebody
--  keyed, so it lives in the database and only the database can change
--  it. Which table it is in depends on where it was keyed: a person's
--  role, a system's label, a case title. Rather than guess, this looks
--  in every label-ish column of this system's own tables, renames the
--  ones that say exactly "Pre Nursery Auditor", and prints what it
--  touched.
--
--  MATCHED EXACTLY, ignoring case and outer spaces. A row that says
--  something else — "Pre Nursery Auditor (PN)", "Auditor" — is left
--  alone: it is not the title that was asked about, and a sweep that
--  guessed at near misses would rename things nobody mentioned.
-- =====================================================================

-- A scratch table for what was changed, so the last statement can print
-- it. Dropped and rebuilt each run; you may drop it afterwards.
DROP TABLE IF EXISTS _mjm_rename_log;
CREATE TABLE _mjm_rename_log (
  table_name text,
  column_name text,
  rows_renamed int
);

DO $$
DECLARE
  old_title CONSTANT text := 'Pre Nursery Auditor';
  new_title CONSTANT text := 'Pre Nursery Auditor + Drone Operator';
  r   record;
  n   int;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name   = c.table_name
     AND t.table_type   = 'BASE TABLE'          -- never a view
    WHERE c.table_schema = 'public'
      -- This system's own tables only.
      AND (c.table_name LIKE 'nelos\_%'   OR c.table_name LIKE 'audit\_%'
        OR c.table_name LIKE 'shared\_%'  OR c.table_name LIKE 'operation\_%'
        OR c.table_name LIKE 'nops\_%'    OR c.table_name LIKE 'npayroll\_%')
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
    IF n > 0 THEN
      INSERT INTO _mjm_rename_log VALUES (r.table_name, r.column_name, n);
    END IF;
  END LOOP;
END $$;

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT COALESCE(l.table_name, '—')   AS table_name,
       COALESCE(l.column_name, '—')  AS column_name,
       COALESCE(l.rows_renamed, 0)   AS rows_renamed,
       CASE
         WHEN l.table_name IS NOT NULL
           THEN 'renamed to "Pre Nursery Auditor + Drone Operator" — reload the '
                || 'page that shows it and the new title is there'
         ELSE 'NOTHING FOUND. Either it has already been renamed (run this twice '
              || 'and the second run says exactly this), or the title is keyed '
              || 'slightly differently — send back what the screen shows, '
              || 'character for character, and it can be matched.'
       END                            AS result
FROM (SELECT 1) one
LEFT JOIN _mjm_rename_log l ON TRUE;

-- WHAT A GOOD RESULT LOOKS LIKE
--   One row per place the title was stored, naming the table, the column
--   and how many rows changed — usually a single row, one rename.
--
--   NOTHING FOUND on the FIRST run means the title on the screen is not
--   exactly "Pre Nursery Auditor". Send the exact text back and this can
--   be pointed at it.
--
--   NOTHING FOUND on a SECOND run is the correct answer: it is already
--   renamed.
--
--   Afterwards, `DROP TABLE _mjm_rename_log;` tidies the scratch table
--   away. Leaving it costs nothing.
