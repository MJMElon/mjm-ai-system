-- ════════════════════════════════════════════════════════════════════════
-- MATA MALAM READS ITS LOCATIONS FROM THE NURSERY LIST
--
-- Mata Malam (the night check-in app) has a Location tab in its Settings.
-- The locations on it are the nurseries of this system, operation_nurseries,
-- which is the list kept on Operation - Settings. Each one then carries its
-- own check-in times inside Mata Malam.
--
-- Mata Malam has no sign in, so it asks as anon, and operation_nurseries
-- answers only to signed in staff. This function hands over the NAMES and
-- nothing else. It cannot write, and it opens no other column or table.
--
-- Safe to run twice. Nothing is changed in operation_nurseries.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--   one row per nursery, each reading   anon can read this
--   for example  BNN / PN / UNE / UNN 1 / UNN 2
--   Mata Malam switches on BNN and UNN by default and leaves the rest off.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mata_malam_locations()
RETURNS TABLE (name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.name::TEXT
    FROM public.operation_nurseries n
   WHERE n.name IS NOT NULL
     AND btrim(n.name::TEXT) <> ''
   ORDER BY n.name::TEXT
$$;

REVOKE ALL ON FUNCTION public.mata_malam_locations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mata_malam_locations() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

SELECT l.name AS location,
       CASE WHEN has_function_privilege('anon', 'public.mata_malam_locations()', 'EXECUTE')
            THEN 'anon can read this'
            ELSE 'NOT OK -- anon cannot call the function'
       END AS mata_malam
  FROM public.mata_malam_locations() l
 ORDER BY l.name;
