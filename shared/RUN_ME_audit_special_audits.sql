-- ════════════════════════════════════════════════════════════════════════
-- SPECIAL AUDITS -- a one-off audit round, raised when it is needed
--
-- The ordinary schedule is a monthly pattern: Plot Condition runs on the
-- 10th, the 20th and the 30th in the main nursery, every month, for ever.
-- A SPECIAL audit is the same question asked once -- "walk these plots in
-- BNN by the 20th" -- raised from Settings to System Setting when
-- something happens, and not expected again for months.
--
-- One row per request. It reaches the auditor the moment it is saved and
-- stays on the To-Do list until every plot it names has been audited, so
-- it is a deadline and never a window: an audit from BEFORE it was raised
-- cannot answer it, and no round rule clears it.
--
-- WHAT EACH COLUMN IS
--   module      plot, height or papan -- which audit is being asked for
--   nursery     BNN, UNN1, UNN2 or PN -- one nursery per request
--   due_date    the day it should be done by. Shown on the row, and what
--               makes it read overdue once it has gone by
--   raised_on   the day it was asked for. An audit must be dated on or
--               after this to count, which is what stops an old audit
--               answering a brand new request
--   all_plots   true asks for every plot the nursery has work on, worked
--               out live, so a plot added afterwards is included
--   plots       the named plots when all_plots is false
--   note        why it was raised, shown to the auditor
--   completed_at  stamped by the BOARD the first time it sees every plot
--               walked. Without it a finished request sits on the System
--               Setting card reading outstanding for ever, and the only
--               way off is Withdraw, which means cancelled and not done
--   cancelled_at  set rather than deleting the row, so a request that was
--               raised and withdrawn still has a record
--
-- Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_special_audits (
  id            BIGSERIAL PRIMARY KEY,
  module        TEXT        NOT NULL,
  nursery       TEXT        NOT NULL,
  due_date      DATE        NOT NULL,
  raised_on     DATE        NOT NULL DEFAULT CURRENT_DATE,
  all_plots     BOOLEAN     NOT NULL DEFAULT false,
  plots         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  note          TEXT,
  created_by    TEXT,
  -- Every audit_* table carries created_at, and not for its own sake: the
  -- portals reader appends "order=created_at.desc" to every request, and a
  -- table without it makes PostgREST reject the whole read.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  cancelled_by  TEXT,
  CONSTRAINT audit_special_audits_module
    CHECK (module IN ('plot', 'height', 'papan')),
  CONSTRAINT audit_special_audits_nursery
    CHECK (nursery IN ('BNN', 'UNN1', 'UNN2', 'PN'))
);

-- For a database that already has the table from an earlier run.
ALTER TABLE public.audit_special_audits
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.audit_special_audits
  ADD COLUMN IF NOT EXISTS raised_on    DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.audit_special_audits
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.audit_special_audits
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE public.audit_special_audits
  ADD COLUMN IF NOT EXISTS note         TEXT;
ALTER TABLE public.audit_special_audits
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- The board reads the open ones on every load, per module and nursery.
-- Dropped first rather than CREATE IF NOT EXISTS: an earlier run of this
-- file made the same index with a narrower WHERE, and IF NOT EXISTS would
-- keep that one and quietly leave the predicate wrong.
DROP INDEX IF EXISTS public.audit_special_audits_open_idx;
CREATE INDEX audit_special_audits_open_idx
  ON public.audit_special_audits (module, nursery, due_date)
  WHERE cancelled_at IS NULL AND completed_at IS NULL;

ALTER TABLE public.audit_special_audits ENABLE ROW LEVEL SECURITY;

-- Everyone signed in reads it: it decides what is on an auditors to-do
-- list, so the phone in the field needs it.
DROP POLICY IF EXISTS audit_special_read   ON public.audit_special_audits;
DROP POLICY IF EXISTS audit_special_insert ON public.audit_special_audits;
DROP POLICY IF EXISTS audit_special_update ON public.audit_special_audits;

CREATE POLICY audit_special_read ON public.audit_special_audits
  FOR SELECT TO authenticated
  USING (true);

-- Raised and withdrawn by whoever holds Manage Users -- the same flag that
-- opens the System Setting screen it is raised on, so the page cannot
-- promise a save the database would refuse. current_user_can_manage_users()
-- is from shared/migration_fix_access_rls.sql, and audit_settings beside
-- this one already depends on it.
CREATE POLICY audit_special_insert ON public.audit_special_audits
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_manage_users());

CREATE POLICY audit_special_update ON public.audit_special_audits
  FOR UPDATE TO authenticated
  USING (public.current_user_can_manage_users())
  WITH CHECK (public.current_user_can_manage_users());

GRANT SELECT ON public.audit_special_audits TO authenticated;
GRANT INSERT, UPDATE ON public.audit_special_audits TO authenticated;

-- ── CLOSING ONE OFF, FROM THE BOARD ────────────────────────────────────
-- The only thing that knows a request is finished is the auditors board:
-- it holds the roster and the audits, and it already works out which
-- plots are still owed in order to draw the circles. The office screen
-- cannot answer it without a second copy of that rule.
--
-- But an AUDITOR may only read this table -- raising and withdrawing is
-- for Manage Users -- so the board cannot stamp the row itself. This
-- function is the one narrow door: it sets completed_at and nothing
-- else, only on a row that is still open, so the worst a caller can do
-- is close a request that was already finished.
CREATE OR REPLACE FUNCTION public.audit_special_mark_done(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE n INT;
BEGIN
  UPDATE public.audit_special_audits
     SET completed_at = now()
   WHERE id = p_id
     AND completed_at IS NULL
     AND cancelled_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.audit_special_mark_done(BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- WHAT A GOOD RESULT LOOKS LIKE
-- One row reading "audit_special_audits ready", the column count at 13,
-- the policies at 3, closer at 1 (the function that retires a finished
-- request), and open_requests at however many are outstanding -- 0 on a
-- database that has never raised one.
SELECT 'audit_special_audits ready' AS status,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'audit_special_audits')::INT AS columns,
       (SELECT count(*) FROM pg_policy p
          JOIN pg_class c ON c.oid = p.polrelid
         WHERE c.relname = 'audit_special_audits')::INT AS policies,
       (SELECT count(*) FROM pg_proc
         WHERE proname = 'audit_special_mark_done')::INT AS closer,
       (SELECT count(*) FROM public.audit_special_audits
         WHERE cancelled_at IS NULL AND completed_at IS NULL)::INT AS open_requests;
