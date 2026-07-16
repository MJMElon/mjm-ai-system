-- ================================================================
-- MJM System — Training Center certifications (Certified Board)
-- Run in Supabase SQL Editor (main project). Idempotent.
-- ================================================================
--
-- Why:
--   The Training Center's certificate page is now the "MJM Group
--   Certified Board" — a leaderboard every staff member can see.
--   When a trainee completes a course (all slides read + practical
--   record fulfilled) they claim the certificate, which inserts one
--   row here; the board lists everyone certified per title, e.g.
--   "MJM Certified Oil Palm Nursery Grower".
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS training_certifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email       text,
    full_name   text NOT NULL,        -- name as shown on the certificate/board
    cert_key    text NOT NULL,        -- e.g. 'nursery-grower'
    cert_title  text NOT NULL,        -- e.g. 'MJM Certified Oil Palm Nursery Grower'
    awarded_at  timestamptz NOT NULL DEFAULT now(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, cert_key)        -- one row per person per certification
);

CREATE INDEX IF NOT EXISTS training_certifications_cert_idx
    ON training_certifications (cert_key, awarded_at ASC);

ALTER TABLE training_certifications ENABLE ROW LEVEL SECURITY;

-- Any signed-in staff can view the board.
DROP POLICY IF EXISTS "certs — read all" ON training_certifications;
CREATE POLICY "certs — read all"
ON training_certifications FOR SELECT
TO authenticated
USING (true);

-- Trainees claim their own certificate only.
DROP POLICY IF EXISTS "certs — insert own" ON training_certifications;
CREATE POLICY "certs — insert own"
ON training_certifications FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Manage Users admins can remove a wrong entry from the board.
DROP POLICY IF EXISTS "certs — admin delete" ON training_certifications;
CREATE POLICY "certs — admin delete"
ON training_certifications FOR DELETE
TO authenticated
USING (public.current_user_can_manage_users());

-- Sanity check — table with rls_enabled = true and 3 policies.
SELECT c.relname, c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies
         WHERE tablename = 'training_certifications') AS policy_count
FROM pg_class c WHERE c.relname = 'training_certifications';
