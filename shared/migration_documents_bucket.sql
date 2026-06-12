-- ================================================================
-- MJM System — Create the `documents` Storage bucket + RLS policies
-- Run in Supabase SQL Editor (main project)
-- ================================================================
--
-- Why:
--   The web app uploads photos and PDFs (Tab 2 planting evidence,
--   Tab 3/5/6 drone maps, Tab 6 cull docs, Tab 8 seed-audit photos,
--   mobile consent + D/O signatures) to a single Storage bucket
--   named `documents`. Without this bucket, every upload returns
--   "Bucket not found" and the file silently disappears on refresh.
--
--   Running this script is idempotent — re-running is safe.
-- ----------------------------------------------------------------

-- ── 1. Create the bucket as PUBLIC ───────────────────────────────
-- Public so the public URLs returned by getPublicUrl() can be
-- rendered in <img>/<iframe> tags without per-request signed URLs.
-- Anyone with the URL can read; writes still require an RLS policy
-- (added below) so anonymous users can't dump junk into the bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ── 2. RLS policies on storage.objects ───────────────────────────
-- storage.objects already has RLS enabled by Supabase. We add four
-- policies scoped to bucket_id = 'documents':
--   • SELECT for everyone (anon + authenticated) so public URLs work.
--   • INSERT for authenticated users so logged-in admins can upload.
--   • UPDATE for authenticated users so upsert: true works.
--   • DELETE for authenticated users so the app can clean up.
-- Drop-then-create makes this idempotent.

DROP POLICY IF EXISTS "documents bucket — public read"   ON storage.objects;
DROP POLICY IF EXISTS "documents bucket — auth insert"   ON storage.objects;
DROP POLICY IF EXISTS "documents bucket — auth update"   ON storage.objects;
DROP POLICY IF EXISTS "documents bucket — auth delete"   ON storage.objects;

CREATE POLICY "documents bucket — public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');

CREATE POLICY "documents bucket — auth insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "documents bucket — auth update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "documents bucket — auth delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents');

-- ── 3. Sanity check ──────────────────────────────────────────────
-- After running, this should return one row showing the bucket and
-- four policies in place.
SELECT b.id AS bucket, b.public,
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'storage'
           AND tablename  = 'objects'
           AND policyname LIKE 'documents bucket %') AS policy_count
FROM storage.buckets b
WHERE b.id = 'documents';
