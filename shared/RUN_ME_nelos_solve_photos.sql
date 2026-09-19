-- =====================================================================
--  MORE THAN ONE PHOTO OF THE FIX
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice — ADD COLUMN IF NOT EXISTS, and the check at the
--  end prints the same answer either way.
--
--  WHAT IT ADDS
--  Solving a case has taken one photo. One is rarely the job: the gap
--  before and the planting after, three trays that needed the same fix,
--  a wide shot and the close-up that shows what it actually was.
--
--      nelos_cases.resolution_photo_urls   jsonb, an array of URLs
--
--  resolution_photo_url STAYS, and the first photo is still written to
--  it. Everything that reads a single photo of the fix goes on finding
--  one — this file adds a place for the rest rather than moving them.
--
--  No new bucket: they go into nelos-photos beside the first, which is
--  where a photo of the fix has always gone.
--
--  UNTIL THIS IS RUN nothing changes for anybody: the solve form takes
--  one photo as before, because the pages ask the database whether it
--  has this column and quietly do without it when it has not.
-- =====================================================================

ALTER TABLE nelos_cases ADD COLUMN IF NOT EXISTS resolution_photo_urls jsonb;

COMMENT ON COLUMN nelos_cases.resolution_photo_urls IS
  'Every photo of the fix, as a JSON array of public URLs in the nelos-photos '
  'bucket. The FIRST of them is also in resolution_photo_url, which stays for '
  'every reader that wants one photo.';

-- PostgREST caches the table shape; without this it goes on serving the
-- old picture and the new column looks as though it was never added.
NOTIFY pgrst, 'reload schema';

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nelos_cases'
      AND column_name = 'resolution_photo_urls')                  AS column_present,
  (SELECT count(*) FROM nelos_cases
    WHERE resolution_photo_url IS NOT NULL)                       AS cases_solved_with_a_photo,
  (SELECT count(*) FROM nelos_cases
    WHERE jsonb_array_length(COALESCE(resolution_photo_urls, '[]'::jsonb)) > 1) AS cases_with_several,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'nelos_cases'
                       AND column_name = 'resolution_photo_urls')
       THEN 'Ready. Solve a case and the photo box takes as many as you like — '
            || 'the solved card shows them all.'
       ELSE 'BLOCKED: the column was not added. Send back whatever error the '
            || 'ALTER TABLE line above printed.'
  END                                                             AS result;

-- WHAT A GOOD RESULT LOOKS LIKE
--   One row. column_present is 1 and result says "Ready."
--
--   cases_solved_with_a_photo is whatever it was — this file touches no
--   rows, and every case already solved keeps the photo it was solved
--   with.
--
--   cases_with_several is 0 the first time. It grows as people solve
--   cases with more than one photo from now on.
