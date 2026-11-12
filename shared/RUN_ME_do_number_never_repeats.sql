-- ============================================================================
-- A DO NUMBER IS HANDED OUT BY THE DATABASE, SO IT CANNOT BE HANDED OUT TWICE
--
-- A customer collects in the morning and signs DO-MUGJB901. He comes back
-- for more the same day, a second DO is made, and it must be DO-MUGJB902.
-- On 5 Nov it came out DO-MUGJB901 again (qty 13 at 06:31, qty 47 at 06:33).
--
-- Every app works the next number out the same way: read the highest number
-- this order already has, add one, then insert. That is a read and a write
-- as two separate steps, so anything that lands between them, or a read
-- that comes back short, gives two DOs the same number. Four apps do this
-- (the FC Portal, the Admin Portal, and two office pages), plus any phone
-- still on an older version, so fixing one app would not be enough.
--
-- So the database decides, at the moment the row goes in:
--
--   1. A BEFORE INSERT trigger takes a lock on that order, then checks the
--      number. If it is already used, or is an offline placeholder (OFF),
--      the row is given the next free number of that order instead. Two DOs
--      saved at the same second queue on the lock, so the second one sees
--      the first.
--   2. Only the generated series is touched: DO- followed by the AL number,
--      then a running number. A number keyed off a paper DO book (03783) is
--      never changed, because it has to match the paper.
--   3. A client_uid column (one id per press of Save) with a unique index,
--      so a phone that retries after a timeout finds its own DO again
--      instead of making a second one under a new number.
--
-- The trigger is SECURITY DEFINER, so the check sees every DO row whatever
-- the person saving is allowed to read.
--
-- WHAT IS LEFT ALONE: the two DOs already sharing a number (DO-MUGJB901 and
-- 03783). The customer signed paper with that number on it, so renumbering
-- the record would make it disagree with the paper. They are listed below.
--
-- Safe to run twice.
--
-- WHAT A GOOD RESULT LOOKS LIKE, in the one result set at the end:
--   trigger installed            yes
--   one per press index          yes
--   proof: same number twice     DO-ZZPROOF01 then DO-ZZPROOF02 -- OK
--   proof: offline placeholder   DO-ZZPROOF-OFF... became DO-ZZPROOF03 -- OK
--   proof: paper number kept     99999 stays 99999 -- OK
--   proof could not run          it ran
--   proof rows left behind       0
--   already sharing a number     the DOs saved before this, named, left as they are
-- ============================================================================

ALTER TABLE public.shared_do_records ADD COLUMN IF NOT EXISTS client_uid text;

CREATE UNIQUE INDEX IF NOT EXISTS shared_do_records_one_per_press
  ON public.shared_do_records (client_uid)
  WHERE client_uid IS NOT NULL;

-- The next free number of one order. Same reading as the apps: the part
-- after the prefix must be all digits, placeholders are skipped.
CREATE OR REPLACE FUNCTION public.do_number_next(p_prefix text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT p_prefix || lpad((coalesce(max(substr(d.do_number, length(p_prefix) + 1)::bigint), 0) + 1)::text, 2, '0')
  FROM public.shared_do_records d
  WHERE left(d.do_number, length(p_prefix)) = p_prefix
    AND length(d.do_number) > length(p_prefix)
    AND length(d.do_number) <= length(p_prefix) + 12
    AND translate(substr(d.do_number, length(p_prefix) + 1), '0123456789', '') = '';
$fn$;

CREATE OR REPLACE FUNCTION public.do_number_never_repeats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  pfx  text;
  rest text;
BEGIN
  IF NEW.al_number IS NULL OR btrim(NEW.al_number) = '' THEN
    RETURN NEW;
  END IF;
  pfx := 'DO-' || btrim(NEW.al_number);

  -- A number from another series (a paper DO book) is the paper number.
  IF NEW.do_number IS NOT NULL AND btrim(NEW.do_number) <> ''
     AND left(NEW.do_number, length(pfx)) <> pfx THEN
    RETURN NEW;
  END IF;

  -- One order at a time. Held until the saving transaction ends.
  PERFORM pg_advisory_xact_lock(hashtext('shared_do_records.do_number:' || pfx));

  rest := substr(coalesce(NEW.do_number, ''), length(pfx) + 1);
  IF NEW.do_number IS NULL
     OR rest = ''
     OR translate(rest, '0123456789', '') <> ''
     OR EXISTS (SELECT 1 FROM public.shared_do_records d WHERE d.do_number = NEW.do_number) THEN
    NEW.do_number := public.do_number_next(pfx);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS do_number_never_repeats ON public.shared_do_records;
CREATE TRIGGER do_number_never_repeats
  BEFORE INSERT ON public.shared_do_records
  FOR EACH ROW EXECUTE FUNCTION public.do_number_never_repeats();

-- The proof. Real inserts through the real trigger, then rolled back, so
-- nothing is left in the table. The answers are kept in variables, which
-- survive the rollback, and written out after it.
DO $proof$
DECLARE
  a text := '';
  b text := '';
  c text := '';
  p text := '';
  e text := '';
BEGIN
  BEGIN
    INSERT INTO public.shared_do_records (do_number, al_number, total_qty, remark)
      VALUES ('DO-ZZPROOF01', 'ZZPROOF', 1, 'proof') RETURNING do_number INTO a;
    INSERT INTO public.shared_do_records (do_number, al_number, total_qty, remark)
      VALUES ('DO-ZZPROOF01', 'ZZPROOF', 1, 'proof') RETURNING do_number INTO b;
    INSERT INTO public.shared_do_records (do_number, al_number, total_qty, remark)
      VALUES ('DO-ZZPROOF-OFFXYZ', 'ZZPROOF', 1, 'proof') RETURNING do_number INTO c;
    INSERT INTO public.shared_do_records (do_number, al_number, total_qty, remark)
      VALUES ('99999', 'ZZPROOF', 1, 'proof') RETURNING do_number INTO p;
    RAISE EXCEPTION 'roll the proof back';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'roll the proof back' THEN e := SQLERRM; END IF;
  END;
  PERFORM set_config('mjm.do_proof_e', coalesce(e, ''), false);
  PERFORM set_config('mjm.do_proof_a', coalesce(a, ''), false);
  PERFORM set_config('mjm.do_proof_b', coalesce(b, ''), false);
  PERFORM set_config('mjm.do_proof_c', coalesce(c, ''), false);
  PERFORM set_config('mjm.do_proof_p', coalesce(p, ''), false);
END;
$proof$;

SELECT 1 AS n, 'trigger installed' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'do_number_never_repeats'
                         AND tgrelid = 'public.shared_do_records'::regclass) THEN 'yes' ELSE 'NO' END AS result
UNION ALL
SELECT 2, 'one per press index',
       CASE WHEN to_regclass('public.shared_do_records_one_per_press') IS NOT NULL THEN 'yes' ELSE 'NO' END
UNION ALL
SELECT 3, 'proof: same number twice',
       current_setting('mjm.do_proof_a', true) || ' then ' || current_setting('mjm.do_proof_b', true) ||
       CASE WHEN current_setting('mjm.do_proof_a', true) = 'DO-ZZPROOF01'
             AND current_setting('mjm.do_proof_b', true) = 'DO-ZZPROOF02' THEN ' -- OK' ELSE ' -- NOT OK' END
UNION ALL
SELECT 4, 'proof: offline placeholder',
       'DO-ZZPROOF-OFFXYZ became ' || current_setting('mjm.do_proof_c', true) ||
       CASE WHEN current_setting('mjm.do_proof_c', true) = 'DO-ZZPROOF03' THEN ' -- OK' ELSE ' -- NOT OK' END
UNION ALL
SELECT 5, 'proof: paper number kept',
       '99999 stays ' || current_setting('mjm.do_proof_p', true) ||
       CASE WHEN current_setting('mjm.do_proof_p', true) = '99999' THEN ' -- OK' ELSE ' -- NOT OK' END
UNION ALL
SELECT 6, 'proof could not run',
       CASE WHEN current_setting('mjm.do_proof_e', true) = '' THEN 'it ran' ELSE current_setting('mjm.do_proof_e', true) END
UNION ALL
SELECT 7, 'proof rows left behind',
       (SELECT count(*)::text FROM public.shared_do_records WHERE al_number = 'ZZPROOF')
UNION ALL
SELECT 8, 'already sharing a number (left as signed)',
       coalesce((SELECT string_agg(x.do_number || ' x' || x.n || ' (qty ' || x.q || ')', ', ' ORDER BY x.do_number)
                 FROM (SELECT do_number, count(*) AS n, string_agg(total_qty::text, ' + ' ORDER BY created_at) AS q
                       FROM public.shared_do_records
                       GROUP BY do_number HAVING count(*) > 1) x), 'none')
ORDER BY 1;
