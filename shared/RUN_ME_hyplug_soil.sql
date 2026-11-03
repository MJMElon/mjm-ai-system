-- ============================================================================
-- RUN_ME_hyplug_soil.sql
--
-- A SECOND JOB IN THE PRE NURSERY. The office asked for it in one line:
-- "这个工作是tanam biji benih 现在我要加多一个工作是Mengisi tanah ke hyplug
-- RM0.027 per biji" -- filling the hyplug trays with soil, which happens
-- BEFORE the seeds go in and is paid by the same unit, a biji.
--
-- Work Maintenance, Worker Activity, Pre Nursery now has TWO sheets: Seed
-- Planting as it was, and Mengisi Tanah ke Hyplug beside it. Same batch
-- rows, same month moves, the same list of worker names. What differs is
-- the figures, the Check and the rate.
--
-- THE JOB IS A COLUMN, NOT A SECOND TABLE. One reader, one writer, one
-- trigger, one set of policies. A table of the same shape beside the first
-- is two copies of one rule, and they drift.
--
-- What this file does:
--   1  adds `job` to nops_seed_planting_batch_workers, defaulting to `seed`
--      -- which is what every row already in it is, that having been the
--      only job there was. Nothing is backfilled because nothing needs to be.
--   2  moves the key from (batch_name) to (batch_name, job), so one batch
--      can carry a record for each job.
--   3  files the Mengisi Tanah ke Hyplug piece rate under its own Used For.
--      The office had already keyed Hy Plug Soil Filling at RM 0.027 a Hole
--      under Other, so that row is MOVED rather than a second one added --
--      two rows saying the same thing is the very thing they asked about.
--
-- The trigger that clears a stale tick is untouched and already covers both:
-- it watches the figures on the row, whichever job the row is for.
--
-- Safe to run twice. Every step is guarded on what is already there.
--
-- WHAT A GOOD RESULT LOOKS LIKE -- five rows:
--   1  the job column ...................... present, default seed -- OK
--   2  the key .............................. batch_name, job -- OK
--   3  records by job ....................... a count for each, read below
--   4  the Mengisi Tanah ke Hyplug rate ..... what the office keyed, and what this did
--   5  every Pre Nursery piece rate ........ the list, read it for duplicates
--   6  office logins that can save both ..... N of N -- OK
-- Row 3 is every record that was already there reading as `seed`, which is
-- correct, and nought `hyplug` until somebody keys the first figure.
--
-- ROW 5 IS WORTH READING. It lists every Pre Nursery piece rate with the
-- Used For each is filed under, and marks the one the claim actually prices
-- off. A job showing twice is a row somebody keyed by hand before the Used
-- For existed: the one marked PRICES THIS JOB is the one to keep, and the
-- other is safe to Remove once nobody is keying that job on the Other sheet
-- by hand. Nothing here removes it -- that is the office decision.
--
-- Row 6 is the proof: as every login holding Nursery Operation it writes a
-- record for EACH job against one batch, which is the thing the old key
-- refused, and rolls the lot back.
-- ============================================================================

ALTER TABLE public.nops_seed_planting_batch_workers
  ADD COLUMN IF NOT EXISTS job TEXT NOT NULL DEFAULT 'seed';

-- The key. Dropped and remade only while it is still the old one, so a
-- second run finds it already right and does nothing.
DO $$
DECLARE
  kname text;
  cols  text;
BEGIN
  SELECT c.conname,
         (SELECT string_agg(a.attname, ',' ORDER BY a.attname)
            FROM unnest(c.conkey) k
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k)
    INTO kname, cols
    FROM pg_constraint c
   WHERE c.conrelid = 'public.nops_seed_planting_batch_workers'::regclass
     AND c.contype = 'p';

  IF kname IS NOT NULL AND cols = 'batch_name' THEN
    EXECUTE format('ALTER TABLE public.nops_seed_planting_batch_workers DROP CONSTRAINT %I', kname);
    ALTER TABLE public.nops_seed_planting_batch_workers
      ADD CONSTRAINT nops_seed_planting_batch_workers_pkey PRIMARY KEY (batch_name, job);
  ELSIF kname IS NULL THEN
    ALTER TABLE public.nops_seed_planting_batch_workers
      ADD CONSTRAINT nops_seed_planting_batch_workers_pkey PRIMARY KEY (batch_name, job);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS nops_seed_planting_batch_workers_job
  ON public.nops_seed_planting_batch_workers (month, job);

-- THE RATE THE OFFICE ALREADY KEYED IS RE-FILED, NEVER DUPLICATED.
--
-- The Piece Rate list already carries Hy Plug Soil Filling at RM 0.027 a
-- Hole, keyed by hand and filed under Other. Inserting a second row under
-- the new Used For would leave two rows saying the same thing, which is
-- exactly the question the office asked about Seed Planting: "为什么有两个
-- seed planting 我要remove哪一个".
--
-- So: a row already filed under hyplug_soil is left alone. Otherwise the
-- one the office keyed is MOVED onto the new Used For, keeping their own
-- wording, their own unit and their own figure. Only where there is no
-- such row at all is one made.
--
-- MATCHING IS NOT "MENTIONS HYPLUG", and the office list is why. It also
-- carries *Transplanting (from Hy Plug to polybag 15 x 18)* at RM 0.25,
-- which mentions the tray and is the opposite job -- seedlings coming OUT
-- of it. A looser rule picked that row up and would have priced the soil
-- filling at RM 0.25 a Bag. It was filed under transplanting rather than
-- Other, so their own run was never at risk, but that is luck and not a
-- rule.
--
-- So a candidate has to name the tray AND the filling, and must not be a
-- transplanting job. No regular expression: the SQL Editor has choked on
-- one. The spaces come out and the case drops, so Hy Plug Soil Filling and
-- Mengisi Tanah ke Hyplug both answer.
--
-- AND TWO CANDIDATES MOVE NEITHER. Picking one of them would file somebody
-- elsewhere job under this rate, so the file names them both and leaves the
-- choice where it belongs. Same rule as a tick name claimed by two rows of
-- the worker register.
-- ONE QUERY ANSWERS ALL THREE -- how many could be it, which one, and what
-- they are called. No TEMP table: the SQL Editor warns that one is made
-- without row level security, and a warning somebody has to click past is a
-- bad thing to hand over.
DO $$
DECLARE
  many    int;
  pick_id bigint;
  names   text;
BEGIN
  IF to_regclass('public.mjmnpayroll_piece_rates') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.mjmnpayroll_piece_rates WHERE category = 'hyplug_soil') THEN
    PERFORM set_config('mjm.hy_rate', 'already filed, left alone', false);
    RETURN;
  END IF;

  SELECT count(*), min(id), string_agg(job_desc, ', ' ORDER BY job_desc)
    INTO many, pick_id, names
    FROM public.mjmnpayroll_piece_rates
   WHERE COALESCE(category, '') IN ('', 'other')
     AND position('hyplug' in replace(lower(COALESCE(job_desc, '')), ' ', '')) > 0
     AND (position('soil'  in replace(lower(COALESCE(job_desc, '')), ' ', '')) > 0
       OR position('tanah' in replace(lower(COALESCE(job_desc, '')), ' ', '')) > 0
       OR position('fill'  in replace(lower(COALESCE(job_desc, '')), ' ', '')) > 0
       OR position('isi'   in replace(lower(COALESCE(job_desc, '')), ' ', '')) > 0)
     AND position('transplant' in replace(lower(COALESCE(job_desc, '')), ' ', '')) = 0
     AND position('pindah'     in replace(lower(COALESCE(job_desc, '')), ' ', '')) = 0;

  IF many > 1 THEN
    PERFORM set_config('mjm.hy_rate',
      'MOVED NOTHING -- more than one row could be it, so the office decides: ' || names, false);
  ELSIF many = 1 THEN
    UPDATE public.mjmnpayroll_piece_rates
       SET category = 'hyplug_soil',
           updated_by = 'RUN_ME_hyplug_soil'
     WHERE id = pick_id;
    PERFORM set_config('mjm.hy_rate', 'moved the row the office keyed: ' || names, false);
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'mjmnpayroll_piece_rates'
                   AND column_name = 'group_code') THEN
    INSERT INTO public.mjmnpayroll_piece_rates (job_desc, unit, rate, category, group_code, active, created_by, updated_by)
      VALUES ('Mengisi Tanah ke Hyplug', 'biji', 0.027, 'hyplug_soil', 'PN', true, 'RUN_ME_hyplug_soil', 'RUN_ME_hyplug_soil');
    PERFORM set_config('mjm.hy_rate', 'added a new row at RM 0.027 a biji', false);
  ELSE
    INSERT INTO public.mjmnpayroll_piece_rates (job_desc, unit, rate, category, active, created_by, updated_by)
      VALUES ('Mengisi Tanah ke Hyplug', 'biji', 0.027, 'hyplug_soil', true, 'RUN_ME_hyplug_soil', 'RUN_ME_hyplug_soil');
    PERFORM set_config('mjm.hy_rate', 'added a new row at RM 0.027 a biji', false);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- The proof: as each office login, write BOTH jobs against one batch and
-- roll it back. Two records on one batch is exactly what the old key
-- refused, so this is the step that says the change took.
SELECT set_config('mjm.hy_pass', '0', false),
       set_config('mjm.hy_total', '0', false),
       set_config('mjm.hy_bad', '', false);

DO $$
DECLARE
  p    record;
  good boolean;
  why  text;
  who  text;
  n    bigint;
BEGIN
  FOR p IN SELECT id, email FROM public.shared_profiles
            WHERE COALESCE(permissions->'modules'->>'nursery_ops', 'none') <> 'none'
            ORDER BY email LOOP
    who  := COALESCE(NULLIF(p.email, ''), 'account ' || COALESCE(p.id::text, '?'));
    good := false;
    why  := '';
    BEGIN
      PERFORM set_config('request.jwt.claims',
                         json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;

      INSERT INTO public.nops_seed_planting_batch_workers
             (batch_name, job, month, planted_date, qty_planted, workers, updated_by)
        VALUES ('PROBE', 'seed', 'PROBE', DATE '1900-01-01', 1, '{"probe": 1}'::jsonb, 'probe')
        ON CONFLICT (batch_name, job) DO UPDATE SET workers = EXCLUDED.workers, updated_at = now();
      INSERT INTO public.nops_seed_planting_batch_workers
             (batch_name, job, month, planted_date, qty_planted, workers, updated_by)
        VALUES ('PROBE', 'hyplug', 'PROBE', DATE '1900-01-01', 1, '{"probe": 2}'::jsonb, 'probe')
        ON CONFLICT (batch_name, job) DO UPDATE SET workers = EXCLUDED.workers, updated_at = now();

      SELECT count(*) INTO n FROM public.nops_seed_planting_batch_workers WHERE batch_name = 'PROBE';
      IF n <> 2 THEN RAISE EXCEPTION 'mjm_probe_saw_% _not_2', n; END IF;

      DELETE FROM public.nops_seed_planting_batch_workers WHERE batch_name = 'PROBE';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 2 THEN RAISE EXCEPTION 'mjm_probe_delete_saw_%', n; END IF;

      RAISE EXCEPTION 'mjm_probe_rollback';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'mjm_probe_rollback' THEN
        good := true;
      ELSE
        why := SQLSTATE || ' ' || left(SQLERRM, 70);
      END IF;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('mjm.hy_total', (current_setting('mjm.hy_total')::int + 1)::text, false);
    IF good THEN
      PERFORM set_config('mjm.hy_pass', (current_setting('mjm.hy_pass')::int + 1)::text, false);
    ELSIF length(COALESCE(current_setting('mjm.hy_bad', true), '')) < 400 THEN
      PERFORM set_config('mjm.hy_bad',
               COALESCE(current_setting('mjm.hy_bad', true), '')
               || CASE WHEN COALESCE(current_setting('mjm.hy_bad', true), '') = ''
                       THEN '' ELSE '; ' END
               || who || ' (' || COALESCE(NULLIF(why, ''), 'no reason given') || ')', false);
    END IF;
  END LOOP;
END $$;

SELECT 1 AS n, 'the job column' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public'
                            AND table_name = 'nops_seed_planting_batch_workers'
                            AND column_name = 'job')
            THEN 'present, default ' ||
                 COALESCE((SELECT replace(replace(column_default, '''::text', ''), '''', '')
                             FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'nops_seed_planting_batch_workers'
                              AND column_name = 'job'), 'none')
                 || ' -- OK'
            ELSE 'MISSING -- NOT OK' END AS result
UNION ALL
SELECT 2, 'the key',
       COALESCE((SELECT string_agg(a.attname, ', ' ORDER BY a.attname)
                   FROM pg_constraint c
                   CROSS JOIN LATERAL unnest(c.conkey) k
                   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
                  WHERE c.conrelid = 'public.nops_seed_planting_batch_workers'::regclass
                    AND c.contype = 'p'), 'none')
       || CASE WHEN (SELECT count(*) FROM pg_constraint c
                     CROSS JOIN LATERAL unnest(c.conkey) k
                     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
                    WHERE c.conrelid = 'public.nops_seed_planting_batch_workers'::regclass
                      AND c.contype = 'p' AND a.attname IN ('batch_name', 'job')) = 2
               THEN ' -- OK' ELSE ' -- NOT OK' END
UNION ALL
SELECT 3, 'records by job',
       COALESCE((SELECT string_agg(job || ': ' || cnt::text, ', ' ORDER BY job)
                   FROM (SELECT job, count(*) AS cnt
                           FROM public.nops_seed_planting_batch_workers
                          GROUP BY job) q), 'none keyed yet')
UNION ALL
SELECT 4, 'the Mengisi Tanah ke Hyplug piece rate',
       COALESCE((SELECT 'RM ' || trim_scale(rate)::text || ' a ' || COALESCE(unit, 'biji')
                        || ' (' || COALESCE(job_desc, 'no name') || ')'
                        || CASE WHEN active THEN '' ELSE ' -- INACTIVE, so the tab uses RM 0.027' END
                   FROM public.mjmnpayroll_piece_rates
                  WHERE category = 'hyplug_soil'
                  ORDER BY active DESC, sort_order, id LIMIT 1),
                'none -- the tab uses RM 0.027')
       || ' -- ' || COALESCE(NULLIF(current_setting('mjm.hy_rate', true), ''), 'already filed, left alone')
UNION ALL
SELECT 5, 'every Pre Nursery piece rate, and which one the claim prices off',
       COALESCE((SELECT string_agg(line, '  |  ' ORDER BY line)
                   FROM (SELECT COALESCE(job_desc, 'no name')
                                || ' RM ' || trim_scale(rate)::text
                                || ' [' || COALESCE(NULLIF(category, ''), 'Other') || ']'
                                || CASE WHEN category IN ('seed_planting', 'hyplug_soil')
                                        THEN ' <-- PRICES THIS JOB' ELSE '' END AS line
                           FROM public.mjmnpayroll_piece_rates
                          WHERE active
                            AND (COALESCE(group_code, '') = 'PN'
                                 OR category IN ('seed_planting', 'hyplug_soil')
                                 OR position('hyplug' in replace(lower(COALESCE(job_desc, '')), ' ', '')) > 0
                                 OR position('seedplanting' in replace(lower(COALESCE(job_desc, '')), ' ', '')) > 0)) q),
                'none')
UNION ALL
SELECT 6, 'office logins that can save both jobs on one batch',
       current_setting('mjm.hy_pass') || ' of ' || current_setting('mjm.hy_total')
       || CASE WHEN current_setting('mjm.hy_pass') = current_setting('mjm.hy_total')
               THEN ' -- OK'
               ELSE ' -- NOT OK: ' || COALESCE(current_setting('mjm.hy_bad', true), '') END
ORDER BY n;
