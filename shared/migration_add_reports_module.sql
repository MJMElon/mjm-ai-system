-- ================================================================
-- MJM System — Add 'reports' to shared_profiles.permissions.modules
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
-- ================================================================
--
-- Background:
--   The User Access page now exposes Reports as its own module
--   (separate from Operation). For users whose permissions JSONB was
--   created before this change, the modules object only has four keys
--   (operation/salesweb/audit/mobile) — reports is missing entirely.
--
--   With the JSONB key missing, the Reports card on the operation
--   dashboard would never show because canAccess('reports') reads
--   undefined → 'none'. This migration adds 'reports' = 'none' to any
--   row that doesn't already have it.
--
--   It's idempotent: rerunning it does nothing for rows that already
--   have a 'reports' key (regardless of its value).
-- ----------------------------------------------------------------

UPDATE public.shared_profiles
   SET permissions = jsonb_set(
         permissions,
         '{modules,reports}',
         '"none"'::jsonb,
         true
       )
 WHERE permissions IS NOT NULL
   AND NOT (permissions #> '{modules}' ? 'reports');

-- Update the column default for any future rows.
ALTER TABLE public.shared_profiles
  ALTER COLUMN permissions SET DEFAULT '{
    "modules": {
      "operation": "none",
      "reports":   "none",
      "salesweb":  "none",
      "audit":     "none",
      "mobile":    "none"
    },
    "manage_users": false
  }'::jsonb;
