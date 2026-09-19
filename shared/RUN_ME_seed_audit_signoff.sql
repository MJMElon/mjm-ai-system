-- =====================================================================
--  SEED AUDIT CAN BE VERIFIED
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run finds the constraint already right
--  and says so.
--
--  THE FAULT
--  Pressing Verify on the Seed Audit tab answers:
--
--      new row for relation "operation_batch_verifications" violates
--      check constraint "operation_batch_verifications_stage_check"
--
--  The two sign-off tables were created when the batch report had six
--  tabs, and their stage column carries a CHECK listing exactly those
--  six — seeds_in, planting, transplanting, cull_1, cull_2, cull_3.
--  Seed Audit came later and signs off as 'seed_audit', which is not in
--  the list, so the database refuses the row. Nothing is wrong with the
--  page: it is asking for something the table has never been told to
--  accept.
--
--  WHAT THIS DOES
--  Widens the list on BOTH tables to include seed_audit. Rejecting a tab
--  writes to operation_batch_reviews with the same stage key, so a fix
--  to one without the other would move the wall rather than remove it.
--
--  Nothing else changes: every stage that was allowed still is, and no
--  row is touched.
-- =====================================================================

DO $$
DECLARE
  allowed CONSTANT text :=
    '''seeds_in'', ''planting'', ''transplanting'', ''cull_1'', ''cull_2'', ''cull_3'', ''seed_audit''';
  t   text;
  c   record;
BEGIN
  FOREACH t IN ARRAY ARRAY['operation_batch_verifications', 'operation_batch_reviews'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'No % table here — skipping.', t;
      CONTINUE;
    END IF;

    /* Drop whatever CHECK is on the stage column, whatever it was named.
       The auto-named one is <table>_stage_check, but a table rebuilt by
       hand can carry a differently named constraint saying the same
       thing, and leaving that behind would leave the wall standing. */
    FOR c IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      WHERE cl.relname = t
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%stage%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, c.conname);
      RAISE NOTICE 'dropped % on %', c.conname, t;
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (stage IN (%s))',
      t, t || '_stage_check', allowed);
    RAISE NOTICE '% now accepts seed_audit.', t;
  END LOOP;
END $$;

-- PostgREST does not cache constraints, but it does cache the table
-- shape, and this costs nothing.
NOTIFY pgrst, 'reload schema';

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT cl.relname                                            AS table_name,
       con.conname                                           AS constraint_name,
       (pg_get_constraintdef(con.oid) ILIKE '%seed_audit%')  AS seed_audit_allowed,
       CASE WHEN pg_get_constraintdef(con.oid) ILIKE '%seed_audit%'
            THEN 'Ready. Open the batch, go to Seed Audit and press Verify — it signs off '
                 || 'like every other tab now.'
            ELSE 'NOT DONE: this constraint still does not list seed_audit. Send back the '
                 || 'line below.'
       END                                                   AS result,
       LEFT(pg_get_constraintdef(con.oid), 200)              AS the_rule
FROM pg_constraint con
JOIN pg_class cl ON cl.oid = con.conrelid
WHERE cl.relname IN ('operation_batch_verifications', 'operation_batch_reviews')
  AND con.contype = 'c'
  AND pg_get_constraintdef(con.oid) ILIKE '%stage%'
ORDER BY cl.relname;

-- WHAT A GOOD RESULT LOOKS LIKE
--   Two rows — one per table — with seed_audit_allowed true and the
--   result column saying "Ready."
--
--   the_rule prints the whole list, so you can see the six old stages are
--   still there and seed_audit has joined them.
--
--   ONE row means only one of the two tables exists on this database,
--   which is fine: the one that is there is fixed.
--
--   Sign-offs already made are untouched. Nothing needs re-verifying.
