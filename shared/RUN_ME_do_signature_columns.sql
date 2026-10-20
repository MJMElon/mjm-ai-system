-- A delivery order print used to carry no signature at all, even when
-- the 555 FC Portal own signature pad had captured one -- the pad image
-- lived only inside a one-off PDF generated at the moment the DO was
-- issued, never as a column on the shared_do_records row itself, so a
-- REPRINT from the office own Review DO Details screen always had
-- nothing to show.
--
-- signature_url carries that capture through, same shape as the existing
-- image_url (the collection photo). The other three columns are for a DO
-- amended and re-signed on paper after it left the FC Portal, which the
-- app has no way to capture on its own -- the office own upload of a
-- photo of that signed copy, and who put it there and when.
--
-- Safe to run twice: every ADD COLUMN is IF NOT EXISTS.
ALTER TABLE public.shared_do_records ADD COLUMN IF NOT EXISTS signature_url TEXT;
ALTER TABLE public.shared_do_records ADD COLUMN IF NOT EXISTS manual_signed_url TEXT;
ALTER TABLE public.shared_do_records ADD COLUMN IF NOT EXISTS manual_signed_uploaded_by TEXT;
ALTER TABLE public.shared_do_records ADD COLUMN IF NOT EXISTS manual_signed_uploaded_at TIMESTAMPTZ;

-- Good result: four rows, one per column named above.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'shared_do_records'
   AND column_name IN ('signature_url', 'manual_signed_url', 'manual_signed_uploaded_by', 'manual_signed_uploaded_at')
 ORDER BY column_name;
