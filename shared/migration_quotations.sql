-- shared_quotations: quotations created in the Operations module.
--
-- Visible to all authenticated operations staff. Line items are stored
-- as JSONB so the form can keep free-text descriptions plus qty / unit /
-- unit_price / line_total without needing a separate items table.

CREATE TABLE IF NOT EXISTS shared_quotations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_number    text NOT NULL UNIQUE,
    quote_date      date NOT NULL DEFAULT CURRENT_DATE,
    valid_until     date,

    customer_name    text NOT NULL,
    customer_company text,
    customer_address text,
    customer_contact text,
    customer_email   text,

    items            jsonb NOT NULL DEFAULT '[]'::jsonb,

    subtotal         numeric(12,2) NOT NULL DEFAULT 0,
    tax_rate         numeric(5,2)  NOT NULL DEFAULT 0,
    tax_amount       numeric(12,2) NOT NULL DEFAULT 0,
    discount         numeric(12,2) NOT NULL DEFAULT 0,
    total            numeric(12,2) NOT NULL DEFAULT 0,

    notes            text,
    terms            text,
    status           text NOT NULL DEFAULT 'draft',  -- draft | sent | accepted | rejected | expired

    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name  text,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_quotations_quote_date ON shared_quotations(quote_date DESC);
CREATE INDEX IF NOT EXISTS idx_shared_quotations_customer  ON shared_quotations(customer_name);
CREATE INDEX IF NOT EXISTS idx_shared_quotations_status    ON shared_quotations(status);

-- Auto-bump updated_at on row updates.
CREATE OR REPLACE FUNCTION shared_quotations_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shared_quotations_updated_at ON shared_quotations;
CREATE TRIGGER trg_shared_quotations_updated_at
    BEFORE UPDATE ON shared_quotations
    FOR EACH ROW EXECUTE FUNCTION shared_quotations_touch_updated_at();

-- RLS: any authenticated operations user can read and write.
ALTER TABLE shared_quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shared_quotations_auth_select ON shared_quotations;
CREATE POLICY shared_quotations_auth_select
    ON shared_quotations FOR SELECT
    TO authenticated USING (true);

DROP POLICY IF EXISTS shared_quotations_auth_insert ON shared_quotations;
CREATE POLICY shared_quotations_auth_insert
    ON shared_quotations FOR INSERT
    TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS shared_quotations_auth_update ON shared_quotations;
CREATE POLICY shared_quotations_auth_update
    ON shared_quotations FOR UPDATE
    TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS shared_quotations_auth_delete ON shared_quotations;
CREATE POLICY shared_quotations_auth_delete
    ON shared_quotations FOR DELETE
    TO authenticated USING (true);
