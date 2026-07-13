-- ================================================================
-- MJM System — Training Center practical proof logs
-- Run in Supabase SQL Editor (main project). Idempotent.
-- ================================================================
--
-- Why:
--   The Training Center's Practical Record page now captures a photo,
--   GPS location, and timestamp every time a trainee taps "+" on an
--   activity — proof that the practical work was really done.
--   Photos are uploaded to the existing public `documents` bucket
--   under training_proofs/<user_id>/…; this table stores one row per
--   logged task so the proof can be reviewed later from any device.
--
--   Requires: the `documents` bucket (migration_documents_bucket.sql)
--   and current_user_can_manage_users() (migration_fix_access_rls.sql).
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS training_practical_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email       text,
    full_name   text,
    activity    text NOT NULL,          -- MJM.ACTIVITIES key, e.g. 'watering'
    taken_at    timestamptz NOT NULL DEFAULT now(),
    lat         double precision,       -- null when GPS unavailable/denied
    lng         double precision,
    accuracy_m  double precision,
    photo_path  text,                   -- storage path in `documents` bucket
    photo_url   text,                   -- public URL for quick rendering
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_practical_logs_user_idx
    ON training_practical_logs (user_id, activity, taken_at DESC);

ALTER TABLE training_practical_logs ENABLE ROW LEVEL SECURITY;

-- Trainees write their own rows; the row must belong to them.
DROP POLICY IF EXISTS "training logs — insert own" ON training_practical_logs;
CREATE POLICY "training logs — insert own"
ON training_practical_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Trainees read their own history; Manage Users admins read everyone's
-- (for reviewing proof before certifying).
DROP POLICY IF EXISTS "training logs — read own or admin" ON training_practical_logs;
CREATE POLICY "training logs — read own or admin"
ON training_practical_logs FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.current_user_can_manage_users());

-- No UPDATE/DELETE policies on purpose: proof rows are immutable from
-- the app. (The "-" button only adjusts the local counter.)

-- Sanity check — should return the table with rls_enabled = true and 2 policies.
SELECT c.relname, c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies
         WHERE tablename = 'training_practical_logs') AS policy_count
FROM pg_class c WHERE c.relname = 'training_practical_logs';
