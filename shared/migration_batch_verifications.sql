-- ============================================================================
-- MJM AI POWERED SYSTEM — migration_batch_verifications.sql
--
-- Adds a two-step gate on each Operation Batch tab:
--   1. A dedicated **Verifier** (non-admin) clicks "Verify" on a tab.
--   2. Only after a verification record exists may an **Admin** click
--      "Mark as Reviewed" and lock that tab.
--
-- Run this AFTER migration_access_and_reviews.sql.
-- ----------------------------------------------------------------------------

-- ────────────────────────────────────────────────────────────────
-- PART 1: New permission flag in shared_profiles.permissions JSONB
--          { "can_verify_operation": true | false }
--
-- No DDL needed (JSONB is schemaless). The user-access UI surfaces this
-- toggle; the verify button reads it via MJMAccess.canVerifyOperation().
-- ────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────
-- PART 2: operation_batch_verifications — verifier signs off a tab
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operation_batch_verifications (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_name       TEXT NOT NULL,
  stage            TEXT NOT NULL
                   CHECK (stage IN (
                     'seeds_in', 'planting', 'transplanting',
                     'cull_1', 'cull_2', 'cull_3'
                   )),
  verified_by      UUID REFERENCES auth.users(id),
  verifier_email   TEXT,
  verifier_name    TEXT,
  verified_at      TIMESTAMPTZ DEFAULT now(),
  note             TEXT,
  UNIQUE (batch_name, stage)
);

CREATE INDEX IF NOT EXISTS operation_batch_verifications_batch_idx
  ON operation_batch_verifications (batch_name);

ALTER TABLE operation_batch_verifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Anyone authenticated may read (so admins can see verify status).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'operation_batch_verifications'
       AND policyname = 'Authenticated read verifications'
  ) THEN
    CREATE POLICY "Authenticated read verifications" ON operation_batch_verifications
      FOR SELECT TO authenticated USING (true);
  END IF;

  -- Verifiers (or admins) may insert/update/delete verification rows.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'operation_batch_verifications'
       AND policyname = 'Verifiers and operation admins write verifications'
  ) THEN
    CREATE POLICY "Verifiers and operation admins write verifications" ON operation_batch_verifications
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM shared_profiles me
           WHERE me.id = auth.uid()
             AND (
                  me.permissions #>> '{modules,operation}' = 'admin'
               OR (me.permissions ->> 'can_verify_operation')::boolean = true
             )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM shared_profiles me
           WHERE me.id = auth.uid()
             AND (
                  me.permissions #>> '{modules,operation}' = 'admin'
               OR (me.permissions ->> 'can_verify_operation')::boolean = true
             )
        )
      );
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- PART 3: Tighten review writes so admins cannot mark a tab as
-- "Reviewed" unless a matching verification row exists.
--
-- We replace the existing write policy on operation_batch_reviews.
-- ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'operation_batch_reviews'
       AND policyname = 'Operation admins write reviews'
  ) THEN
    DROP POLICY "Operation admins write reviews" ON operation_batch_reviews;
  END IF;
END $$;

CREATE POLICY "Operation admins write verified reviews" ON operation_batch_reviews
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_profiles me
       WHERE me.id = auth.uid()
         AND me.permissions #>> '{modules,operation}' = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shared_profiles me
       WHERE me.id = auth.uid()
         AND me.permissions #>> '{modules,operation}' = 'admin'
    )
    AND EXISTS (
      SELECT 1 FROM operation_batch_verifications v
       WHERE v.batch_name = operation_batch_reviews.batch_name
         AND v.stage      = operation_batch_reviews.stage
    )
  );
