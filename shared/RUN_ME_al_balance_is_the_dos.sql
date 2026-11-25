-- THE AL BALANCE IS WORKED OUT BY THE DATABASE, FROM THE DOs, ON EVERY WRITE.
--
-- shared_al_orders.balance_quantity was written by six different screens,
-- each as the old stored figure minus this DO, or as ordered minus whatever
-- that page had loaded. Any stale read won, so 82 of 429 ALs carried a
-- wrong balance on 25 Nov 2026, 81 of them too HIGH, and the phone Consent
-- and DO Signing pages read that wrong figure.
--
-- The rule is the office Booking page own rule, word for word:
--
--   balance = quantity_ordered
--             minus the total_qty of every DO on that AL number
--             that is not Cancelled and carries no [CANCELLED] in its remark
--
-- Two triggers hold it:
--   1. BEFORE INSERT OR UPDATE on shared_al_orders replaces whatever
--      balance_quantity a screen sent with the figure worked out here.
--      So a stale write from any app, any version, lands as the right figure.
--   2. AFTER a DO is added, edited, cancelled or deleted, its AL is
--      worked out again (and the old AL too, when a DO moves to another AL).
--
-- Then every AL is worked out once, which repairs the ones already wrong.
--
-- Safe to run twice: the second run repairs 0.
--
-- WHAT A GOOD RESULT LOOKS LIKE (one table, read top to bottom):
--   1  triggers installed          2 of 2
--   2  ALs repaired this run       the number repaired, with the worst named
--   3  ALs still disagreeing       0
--   4  a stale write is ignored    yes
--   5  a new DO moves the balance  yes

CREATE OR REPLACE FUNCTION public.al_delivered_qty(p_al text)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(COALESCE(d.total_qty, 0)), 0)::bigint
    FROM public.shared_do_records d
   WHERE d.al_number = p_al
     AND COALESCE(d.status, '') <> 'Cancelled'
     AND position('[CANCELLED]' in COALESCE(d.remark, '')) = 0
$$;

CREATE OR REPLACE FUNCTION public.al_balance_from_dos()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.balance_quantity := COALESCE(NEW.quantity_ordered, 0) - public.al_delivered_qty(NEW.al_number);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS al_balance_from_dos ON public.shared_al_orders;
CREATE TRIGGER al_balance_from_dos
  BEFORE INSERT OR UPDATE ON public.shared_al_orders
  FOR EACH ROW EXECUTE FUNCTION public.al_balance_from_dos();

CREATE OR REPLACE FUNCTION public.al_balance_follow_do()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.al_number IS NOT NULL THEN
    UPDATE public.shared_al_orders SET balance_quantity = balance_quantity
     WHERE al_number = OLD.al_number;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.al_number IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.al_number IS DISTINCT FROM OLD.al_number) THEN
    UPDATE public.shared_al_orders SET balance_quantity = balance_quantity
     WHERE al_number = NEW.al_number;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS al_balance_follow_do ON public.shared_do_records;
CREATE TRIGGER al_balance_follow_do
  AFTER INSERT OR DELETE OR UPDATE OF al_number, total_qty, status, remark
  ON public.shared_do_records
  FOR EACH ROW EXECUTE FUNCTION public.al_balance_follow_do();

DO $$
DECLARE
  fixed int := 0;
  worst text := '';
  probe record;
  got bigint;
  stale_ok text := 'no AL to try it on';
  do_ok text := 'no AL to try it on';
BEGIN
  SELECT count(*),
         COALESCE(string_agg(al_number || ' ' || balance_quantity || ' to ' || calc, ', ' ORDER BY abs(balance_quantity - calc) DESC), '')
    INTO fixed, worst
    FROM (SELECT al_number, COALESCE(balance_quantity, 0) AS balance_quantity,
                 COALESCE(quantity_ordered, 0) - public.al_delivered_qty(al_number) AS calc
            FROM public.shared_al_orders) x
   WHERE balance_quantity IS DISTINCT FROM calc;

  UPDATE public.shared_al_orders SET balance_quantity = balance_quantity
   WHERE balance_quantity IS DISTINCT FROM COALESCE(quantity_ordered, 0) - public.al_delivered_qty(al_number);

  PERFORM set_config('al_bal.fixed', fixed::text, false);
  PERFORM set_config('al_bal.worst', left(COALESCE(worst, ''), 600), false);

  SELECT id, al_number, balance_quantity INTO probe
    FROM public.shared_al_orders WHERE al_number IS NOT NULL ORDER BY id LIMIT 1;

  IF probe.id IS NOT NULL THEN
    BEGIN
      UPDATE public.shared_al_orders SET balance_quantity = 999999 WHERE id = probe.id;
      SELECT balance_quantity INTO got FROM public.shared_al_orders WHERE id = probe.id;
      stale_ok := CASE WHEN got = probe.balance_quantity THEN 'yes' ELSE 'NO, it stored ' || got END;

      INSERT INTO public.shared_do_records (do_number, al_number, total_qty, status, remark)
      VALUES ('ALBAL-PROBE', probe.al_number, 7, 'Issued', 'probe, rolled back');
      SELECT balance_quantity INTO got FROM public.shared_al_orders WHERE id = probe.id;
      do_ok := CASE WHEN got = probe.balance_quantity - 7 THEN 'yes' ELSE 'NO, it reads ' || got END;

      RAISE EXCEPTION 'al_bal_probe_rollback';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'al_bal_probe_rollback' THEN
        do_ok := 'could not try it, ' || SQLERRM;
      END IF;
    END;
  END IF;

  PERFORM set_config('al_bal.stale', stale_ok, false);
  PERFORM set_config('al_bal.do', do_ok, false);
END $$;

SELECT 1 AS n, 'triggers installed' AS what,
       (SELECT count(*) FROM pg_trigger
         WHERE NOT tgisinternal AND tgname IN ('al_balance_from_dos', 'al_balance_follow_do'))::text || ' of 2' AS detail
UNION ALL
SELECT 2, 'ALs repaired this run',
       current_setting('al_bal.fixed', true)
       || CASE WHEN current_setting('al_bal.worst', true) <> '' THEN ' -- ' || current_setting('al_bal.worst', true) ELSE '' END
UNION ALL
SELECT 3, 'ALs still disagreeing with their DOs',
       (SELECT count(*) FROM public.shared_al_orders
         WHERE balance_quantity IS DISTINCT FROM COALESCE(quantity_ordered, 0) - public.al_delivered_qty(al_number))::text
UNION ALL
SELECT 4, 'a stale balance written by a screen is ignored', current_setting('al_bal.stale', true)
UNION ALL
SELECT 5, 'a new DO moves its AL balance', current_setting('al_bal.do', true)
ORDER BY 1;
