-- ================================================================
-- MJM System — Audit Trail (who edited what)
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
-- ================================================================
--
-- Goal:
--   Capture every INSERT / UPDATE / DELETE on public tables along with
--   the user who made the change. Stored in a dedicated "audit" schema
--   so it can be cleared independently (TRUNCATE audit.changes; or
--   DROP SCHEMA audit CASCADE;) without affecting real data.
--
--   The trigger is SECURITY DEFINER so writes bypass RLS, but reads on
--   the table are still gated through RLS (only audit_trail admins/
--   normal users can SELECT).
-- ----------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS audit;

-- ── 1. Storage table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit.changes (
  id              BIGSERIAL    PRIMARY KEY,
  occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  user_id         UUID,
  user_email      TEXT,
  schema_name     TEXT         NOT NULL,
  table_name      TEXT         NOT NULL,
  operation       TEXT         NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  row_id          TEXT,
  old_data        JSONB,
  new_data        JSONB,
  changed_fields  TEXT[]
);

CREATE INDEX IF NOT EXISTS audit_changes_occurred_at_idx
  ON audit.changes (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_changes_table_idx
  ON audit.changes (table_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_changes_user_idx
  ON audit.changes (user_id, occurred_at DESC);

-- ── 2. Helper to read the caller's audit_trail level (RLS-friendly) ─
CREATE OR REPLACE FUNCTION public.current_user_audit_trail_level()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(permissions #>> ARRAY['modules','audit_trail'], 'none')
    FROM public.shared_profiles
   WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_user_audit_trail_level() TO authenticated;

-- ── 3. RLS so only authorized users can read ──────────────────────
ALTER TABLE audit.changes ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA audit TO authenticated;
GRANT SELECT, DELETE ON audit.changes TO authenticated;

DROP POLICY IF EXISTS "Audit trail readers can read" ON audit.changes;
CREATE POLICY "Audit trail readers can read" ON audit.changes
  FOR SELECT TO authenticated
  USING (public.current_user_audit_trail_level() <> 'none');

DROP POLICY IF EXISTS "Audit trail admins can clear" ON audit.changes;
CREATE POLICY "Audit trail admins can clear" ON audit.changes
  FOR DELETE TO authenticated
  USING (public.current_user_audit_trail_level() = 'admin');

-- ── 4. Trigger function that records the change ────────────────────
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email   TEXT;
  v_old     JSONB := NULL;
  v_new     JSONB := NULL;
  v_id      TEXT  := NULL;
  v_changed TEXT[] := NULL;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    SELECT ARRAY_AGG(k) INTO v_changed
      FROM (
        SELECT key AS k
          FROM jsonb_each(v_new)
         WHERE COALESCE(v_old->key, 'null'::jsonb) IS DISTINCT FROM value
      ) t;
  END IF;

  v_id := COALESCE(
    v_new->>'id',          v_old->>'id',
    v_new->>'name',        v_old->>'name',
    v_new->>'record_id',   v_old->>'record_id',
    v_new->>'order_number',v_old->>'order_number',
    v_new->>'batch_name',  v_old->>'batch_name'
  );

  IF v_user_id IS NOT NULL THEN
    BEGIN
      SELECT email INTO v_email FROM public.shared_profiles WHERE id = v_user_id;
    EXCEPTION WHEN OTHERS THEN
      v_email := NULL;
    END;
  END IF;

  INSERT INTO audit.changes (
    user_id, user_email, schema_name, table_name, operation, row_id,
    old_data, new_data, changed_fields
  ) VALUES (
    v_user_id, v_email, TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, v_id,
    v_old, v_new, v_changed
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Never let an audit failure block the underlying transaction.
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 5. Attach the trigger to every public BASE TABLE ──────────────
-- Skip log-style tables that would explode the audit volume.
DO $$
DECLARE
  t record;
  skip_list TEXT[] := ARRAY[
    'shared_inventory_logs'    -- already an append-only log
  ];
BEGIN
  FOR t IN
    SELECT table_schema, table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type   = 'BASE TABLE'
       AND table_name <> ALL (skip_list)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_log_trg ON %I.%I',
                   t.table_schema, t.table_name);
    EXECUTE format(
      'CREATE TRIGGER audit_log_trg
         AFTER INSERT OR UPDATE OR DELETE ON %I.%I
         FOR EACH ROW EXECUTE FUNCTION audit.log_change()',
      t.table_schema, t.table_name);
  END LOOP;
END $$;

-- ── 6. Add audit_trail to existing permissions JSONBs ─────────────
UPDATE public.shared_profiles
   SET permissions = jsonb_set(
         permissions,
         '{modules,audit_trail}',
         '"none"'::jsonb,
         true
       )
 WHERE permissions IS NOT NULL
   AND NOT (permissions #> '{modules}' ? 'audit_trail');

ALTER TABLE public.shared_profiles
  ALTER COLUMN permissions SET DEFAULT '{
    "modules": {
      "operation":   "none",
      "reports":     "none",
      "audit_trail": "none",
      "salesweb":    "none",
      "audit":       "none",
      "mobile":      "none"
    },
    "manage_users": false
  }'::jsonb;

-- ── 7. Helper to clear old logs (admins only via RLS) ─────────────
-- Usage example from the UI / SQL editor:
--   DELETE FROM audit.changes WHERE occurred_at < now() - interval '30 days';
