-- =====================================================================
--  A CASE CAN CARRY A DOCUMENT
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice — every part is IF NOT EXISTS or ON CONFLICT, and
--  the check at the end prints the same answer either way.
--
--  WHAT IT ADDS
--  Add New Case has taken a photo for a while. A photo is not always the
--  thing to attach: a delivery order, a lab result, a supplier's letter,
--  a spreadsheet of counts. So a case now also carries ONE DOCUMENT,
--  alongside its photo rather than instead of it.
--
--      nelos_cases.doc_url    where the file is, in the nelos-docs bucket
--      nelos_cases.doc_name   what to call it on screen
--
--  and a nelos-docs bucket to put them in. A separate bucket from
--  nelos-photos on purpose: a photo bucket that also holds PDFs is a
--  photo bucket nobody can set an image-only rule on later, and the two
--  are read differently — one is shown, the other is opened.
--
--  UNTIL THIS IS RUN the app is unchanged: the picker does not appear,
--  because the page asks the database for these columns and quietly does
--  without them when they are not there. Nothing breaks either way.
-- =====================================================================

-- ── The columns ──────────────────────────────────────────────────
ALTER TABLE nelos_cases ADD COLUMN IF NOT EXISTS doc_url  text;
ALTER TABLE nelos_cases ADD COLUMN IF NOT EXISTS doc_name text;

COMMENT ON COLUMN nelos_cases.doc_url IS
  'Public URL of the one document attached to this case, in the nelos-docs bucket.';
COMMENT ON COLUMN nelos_cases.doc_name IS
  'The file name as the person who attached it saw it — what to call the link.';

-- ── The bucket ───────────────────────────────────────────────────
-- Guarded, so this file also runs on a plain PostgreSQL with no Supabase
-- storage schema — which is where it gets tested. The outcome is written
-- to a scratch table because the check at the end cannot NAME
-- storage.buckets: a query mentioning a table that does not exist fails
-- to parse, whatever the CASE around it says.
DROP TABLE IF EXISTS _mjm_doc_check;
CREATE TABLE _mjm_doc_check (bucket_ready text);

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'No storage schema here — skipping the nelos-docs bucket.';
    INSERT INTO _mjm_doc_check VALUES ('n/a here');
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public)
  VALUES ('nelos-docs', 'nelos-docs', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

  /* Public read (the link is opened straight from the case), upload by
     anybody signed in, delete by nobody through the API — the same shape
     as the nelos-photos bucket in migration_nelos_all.sql. */
  DROP POLICY IF EXISTS "nelos docs read"   ON storage.objects;
  DROP POLICY IF EXISTS "nelos docs upload" ON storage.objects;

  CREATE POLICY "nelos docs read" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'nelos-docs');

  CREATE POLICY "nelos docs upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'nelos-docs');

  INSERT INTO _mjm_doc_check
  SELECT CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'nelos-docs')
              THEN 'yes' ELSE 'NO' END;

  RAISE NOTICE 'nelos-docs bucket ready.';
END $$;

-- PostgREST caches the table shape; without this it goes on serving the
-- old picture and the new columns look as though they were never added.
NOTIFY pgrst, 'reload schema';

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nelos_cases'
      AND column_name IN ('doc_url', 'doc_name'))               AS columns_present,
  (SELECT COALESCE(max(bucket_ready), 'NO') FROM _mjm_doc_check)  AS bucket_ready,
  (SELECT count(*) FROM nelos_cases WHERE doc_url IS NOT NULL)  AS cases_with_a_document,
  CASE WHEN (SELECT count(*) FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'nelos_cases'
                 AND column_name IN ('doc_url', 'doc_name')) = 2
       THEN 'Ready. Open Add New Case — there is an Attach document box under '
            || 'Attach photo. Pick a PDF, a spreadsheet, anything, and it is a '
            || 'link on the case.'
       ELSE 'BLOCKED: the columns were not added. Send back whatever error the '
            || 'ALTER TABLE lines above printed.'
  END                                                           AS result;

-- WHAT A GOOD RESULT LOOKS LIKE
--   One row. columns_present is 2 and bucket_ready says yes, and result
--   says "Ready."
--
--   cases_with_a_document is 0 the first time — nothing has been attached
--   yet. After somebody attaches one it is the number of cases carrying a
--   document.
--
--   _mjm_doc_check is a scratch table this file leaves behind;
--   `DROP TABLE _mjm_doc_check;` tidies it away and costs nothing to keep.
--
--   bucket_ready NO with the columns present means the SQL ran but the
--   bucket did not take: check Storage in the Supabase dashboard for a
--   bucket called nelos-docs and create it as PUBLIC if it is missing.
