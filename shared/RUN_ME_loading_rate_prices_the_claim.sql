-- RUN_ME_loading_rate_prices_the_claim.sql
--
-- Loading Seedlings flows to the payroll by itself now: the DO records and
-- the workers ticked on Worker Activity reach the Work Maintenance claim,
-- its own Loading Seedlings tab and the Monthly Payroll. The claim prices
-- that work off the Piece Rate row whose Used For reads Work Maintenance.
--
-- The office keyed the rate before that existed, filed under Seedlings
-- Collection -- the older manual sheet -- so the quantities reached the
-- claim and the money read a dash. This re-files that ONE row onto the
-- Used For the claim reads. The wording, the unit, the figure and the
-- group are kept. Nothing is inserted and nothing is removed. The row
-- leaves the manual Add Entry list as it moves, which is right: the job
-- is priced automatically now, and keying it by hand as well would pay
-- the same loading twice.
--
-- A row is moved only when it is the ONE candidate. Two candidates are
-- named in the result and neither is touched, because picking one would
-- file a job belonging to somebody else under this rate. A loading rate
-- already filed under Work Maintenance means there is nothing to move,
-- and a second candidate beside it is named rather than moved -- two
-- Work Maintenance loading rates in one group would unlink both.
--
-- Safe to run twice: the second run finds nothing left to move.

DO $$
DECLARE
  cand_count integer;
  cand_id bigint;
  cand_desc text;
  already_count integer;
BEGIN
  SELECT COUNT(*), MIN(id) INTO cand_count, cand_id
  FROM mjmnpayroll_piece_rates
  WHERE active IS DISTINCT FROM false
    AND COALESCE(category, '') <> 'maintenance'
    AND ( replace(lower(job_desc), ' ', '') LIKE '%loadingseedling%'
       OR replace(lower(job_desc), ' ', '') LIKE '%pemunggahan%'
       OR replace(lower(job_desc), ' ', '') LIKE '%muatanakbenih%'
       OR replace(lower(job_desc), ' ', '') LIKE '%memunggahanakbenih%' );

  SELECT COUNT(*) INTO already_count
  FROM mjmnpayroll_piece_rates
  WHERE active IS DISTINCT FROM false
    AND category = 'maintenance'
    AND ( replace(lower(job_desc), ' ', '') LIKE '%loadingseedling%'
       OR replace(lower(job_desc), ' ', '') LIKE '%pemunggahan%'
       OR replace(lower(job_desc), ' ', '') LIKE '%muatanakbenih%'
       OR replace(lower(job_desc), ' ', '') LIKE '%memunggahanakbenih%' );

  IF already_count > 0 THEN
    PERFORM set_config('mjm.loading_moved',
      'nothing moved - a loading rate is already filed under Work Maintenance'
      || CASE WHEN cand_count > 0
              THEN ', and ' || cand_count::text
                || ' more under another Used For was left alone'
              ELSE '' END, false);
  ELSIF cand_count = 1 THEN
    SELECT job_desc INTO cand_desc FROM mjmnpayroll_piece_rates WHERE id = cand_id;
    UPDATE mjmnpayroll_piece_rates
       SET category = 'maintenance', updated_at = now()
     WHERE id = cand_id;
    PERFORM set_config('mjm.loading_moved',
      'moved row ' || cand_id::text || ' (' || COALESCE(cand_desc, '') ||
      ') onto Used For Work Maintenance', false);
  ELSIF cand_count > 1 THEN
    PERFORM set_config('mjm.loading_moved',
      cand_count::text || ' candidates - moved none. Pick the right one on '
      || 'Payroll, Settings, Piece Rate and set its Used For to Work '
      || 'Maintenance by hand', false);
  ELSE
    PERFORM set_config('mjm.loading_moved',
      'no loading rate found anywhere - add one on Payroll, Settings, '
      || 'Piece Rate with Used For = Work Maintenance', false);
  END IF;
END $$;

-- What to look for: the first line says what this run did -- a good first
-- run reads "moved row N onto Used For Work Maintenance", and a second
-- run reads "nothing moved". Under it, every rate row naming loading
-- seedlings, with whether the claim now reads it: exactly one row should
-- read PRICES THE CLAIM. The group must be MN or PN for the claim to use
-- it, and that is part of the verdict.
SELECT * FROM (
  SELECT 0 AS ord,
         'this run' AS the_row,
         COALESCE(current_setting('mjm.loading_moved', true), '(no answer)') AS verdict,
         '' AS rate,
         '' AS used_for,
         '' AS grp
  UNION ALL
  SELECT 1,
         'rate row ' || r.id::text || ' - ' || r.job_desc,
         CASE
           WHEN r.active = false THEN 'NOT read - inactive'
           WHEN COALESCE(r.category, '') <> 'maintenance'
             THEN 'NOT read - Used For is ' || COALESCE(NULLIF(r.category, ''), 'not set')
           WHEN COALESCE(r.group_code, '') NOT IN ('MN', 'PN')
             THEN 'NOT read - group must be MN or PN'
           WHEN (SELECT COUNT(*) FROM mjmnpayroll_piece_rates x
                  WHERE x.active IS DISTINCT FROM false
                    AND x.category = 'maintenance'
                    AND COALESCE(x.group_code, '') = COALESCE(r.group_code, '')
                    AND ( replace(lower(x.job_desc), ' ', '') LIKE '%loadingseedling%'
                       OR replace(lower(x.job_desc), ' ', '') LIKE '%pemunggahan%'
                       OR replace(lower(x.job_desc), ' ', '') LIKE '%muatanakbenih%'
                       OR replace(lower(x.job_desc), ' ', '') LIKE '%memunggahanakbenih%' )) > 1
             THEN 'DUPLICATE - two Work Maintenance loading rates in one group, neither is read'
           ELSE 'PRICES THE CLAIM'
         END,
         'RM ' || r.rate::text || ' / ' || COALESCE(r.unit, ''),
         COALESCE(NULLIF(r.category, ''), '(not set)'),
         COALESCE(NULLIF(r.group_code, ''), '(not set)')
  FROM mjmnpayroll_piece_rates r
  WHERE replace(lower(r.job_desc), ' ', '') LIKE '%loadingseedling%'
     OR replace(lower(r.job_desc), ' ', '') LIKE '%pemunggahan%'
     OR replace(lower(r.job_desc), ' ', '') LIKE '%muatanakbenih%'
     OR replace(lower(r.job_desc), ' ', '') LIKE '%memunggahanakbenih%'
) t
ORDER BY ord, the_row;
