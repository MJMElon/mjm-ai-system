-- ============================================================================
-- A NELOS CASE CAN CARRY A LOCATION, AS A COORDINATE
--
-- Paste the WHOLE file into the Supabase SQL Editor and press Run.
-- Safe to run twice. It adds two columns and one rule, changes no case that
-- exists, and the check at the foot prints the same answer either way.
--
-- WHAT IT ADDS
--
--     nelos_cases.location_lat    latitude,  -90 to 90
--     nelos_cases.location_lng    longitude, -180 to 180
--
-- Both are OPTIONAL. A case raised with no location has neither, which is
-- every case raised before today and most cases raised after it.
--
-- The rule beside them says a case carries BOTH numbers or NEITHER, and that
-- both are in range. The forms already refuse anything else before they
-- save. The rule is here as well because the forms are not the only writer:
-- a phone holding an older build, or a hand edit in the dashboard, goes
-- through the database and not through a form.
--
-- UNTIL THIS IS RUN every raise form is exactly as it was: the Location box
-- does not appear, because each form asks the database for these columns
-- first and does without them when they are not there.
--
-- WHAT A GOOD RESULT LOOKS LIKE, in the order it prints:
--
--   1  COLUMNS   both there
--   2  RULE      installed
--   3  CASES     how many cases there are and how many carry a location.
--                "0 carry a location" is correct on the first run. Nothing
--                is backfilled, because a location nobody keyed is not one.
-- ============================================================================

ALTER TABLE public.nelos_cases ADD COLUMN IF NOT EXISTS location_lat double precision;
ALTER TABLE public.nelos_cases ADD COLUMN IF NOT EXISTS location_lng double precision;

COMMENT ON COLUMN public.nelos_cases.location_lat IS
  'Latitude of where the case is, keyed or detected on the raise form. Optional.';
COMMENT ON COLUMN public.nelos_cases.location_lng IS
  'Longitude of where the case is, keyed or detected on the raise form. Optional.';

-- Guarded by name, so a second run adds nothing and raises no notice.
-- Both NOT NULL tests are spelled out on purpose: a comparison against an
-- empty value answers unknown, and a rule lets unknown through, so a case
-- with a latitude and no longitude would otherwise be accepted.
DO $rule$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'nelos_cases_location_whole'
                    AND conrelid = 'public.nelos_cases'::regclass) THEN
    ALTER TABLE public.nelos_cases
      ADD CONSTRAINT nelos_cases_location_whole CHECK (
        (location_lat IS NULL AND location_lng IS NULL)
        OR (location_lat IS NOT NULL AND location_lng IS NOT NULL
            AND location_lat BETWEEN -90 AND 90 AND location_lng BETWEEN -180 AND 180)
      );
  END IF;
END
$rule$;

-- PostgREST keeps its own picture of the table. Without this the forms go on
-- being told the columns are not there until it next reloads by itself.
NOTIFY pgrst, 'reload schema';

SELECT 1 AS sort, 'COLUMNS' AS section,
       CASE WHEN count(*) = 2 THEN 'both there' ELSE 'MISSING -- run this file again' END AS answer,
       coalesce(string_agg(column_name, ', ' ORDER BY column_name), 'none') AS detail
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'nelos_cases'
   AND column_name IN ('location_lat', 'location_lng')

UNION ALL
SELECT 2, 'RULE',
       CASE WHEN count(*) = 1 THEN 'installed' ELSE 'NOT INSTALLED' END,
       'a case carries both numbers or neither, and both in range'
  FROM pg_constraint
 WHERE conname = 'nelos_cases_location_whole'
   AND conrelid = 'public.nelos_cases'::regclass

UNION ALL
SELECT 3, 'CASES',
       count(*)::text || ' cases',
       count(location_lat)::text || ' carry a location'
  FROM public.nelos_cases

 ORDER BY 1;
