-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Cash / Credit customer payment terms (May 2026)
-- ----------------------------------------------------------------------------
-- Adds a payment_terms tag to every customer profile. Default is 'cash'
-- (pay-before-collection). Admins can switch a customer to 'credit' which:
--   • Allows order placement to skip Billplz payment
--   • Reserves stock immediately (already happens on order create today)
--   • Routes the order into the monthly-billing workflow
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Tag column on customer profile -----------------------------------------
ALTER TABLE shared_profiles
    ADD COLUMN IF NOT EXISTS payment_terms TEXT NOT NULL DEFAULT 'cash';

ALTER TABLE shared_profiles
    DROP CONSTRAINT IF EXISTS shared_profiles_payment_terms_check;
ALTER TABLE shared_profiles
    ADD CONSTRAINT shared_profiles_payment_terms_check
    CHECK (payment_terms IN ('cash','credit'));

-- Optional: monthly credit limit (RM). NULL = no enforced limit.
ALTER TABLE shared_profiles
    ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2);

-- 2. Order-level snapshot of the terms used at checkout ----------------------
-- We snapshot on the order so changing a customer's terms later doesn't
-- retroactively change historical orders.
ALTER TABLE salesweb_customer_orders
    ADD COLUMN IF NOT EXISTS payment_terms TEXT NOT NULL DEFAULT 'cash';

ALTER TABLE salesweb_customer_orders
    DROP CONSTRAINT IF EXISTS salesweb_customer_orders_payment_terms_check;
ALTER TABLE salesweb_customer_orders
    ADD CONSTRAINT salesweb_customer_orders_payment_terms_check
    CHECK (payment_terms IN ('cash','credit'));

ALTER TABLE salesweb_customer_orders
    ADD COLUMN IF NOT EXISTS credit_billing_period TEXT;  -- 'YYYY-MM' bucket
ALTER TABLE salesweb_customer_orders
    ADD COLUMN IF NOT EXISTS credit_billed_at TIMESTAMPTZ;
ALTER TABLE salesweb_customer_orders
    ADD COLUMN IF NOT EXISTS credit_invoice_id UUID;

-- 3. Self-update guard --------------------------------------------------------
-- Customers can update their own profile but MUST NOT flip themselves to
-- 'credit'. Only admins (handled by admin-side write policy) can change terms.
-- The RLS hardening migration already enforces "role + permissions unchanged"
-- on self-update; we extend it to also pin payment_terms + credit_limit.
DO $$
DECLARE
    pol_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'shared_profiles'
          AND policyname = 'shared_profiles_self_update'
    ) INTO pol_exists;

    IF pol_exists THEN
        DROP POLICY shared_profiles_self_update ON shared_profiles;
    END IF;
END$$;

CREATE POLICY shared_profiles_self_update ON shared_profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        -- Customer cannot escalate role / permissions / payment_terms / credit_limit
        AND role           IS NOT DISTINCT FROM (SELECT role           FROM shared_profiles WHERE id = auth.uid())
        AND permissions    IS NOT DISTINCT FROM (SELECT permissions    FROM shared_profiles WHERE id = auth.uid())
        AND payment_terms  IS NOT DISTINCT FROM (SELECT payment_terms  FROM shared_profiles WHERE id = auth.uid())
        AND credit_limit   IS NOT DISTINCT FROM (SELECT credit_limit   FROM shared_profiles WHERE id = auth.uid())
    );

-- 4. Index for monthly-bill aggregation --------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_credit_period
    ON salesweb_customer_orders (credit_billing_period)
    WHERE payment_terms = 'credit';

-- 5. Helpful view: outstanding credit orders ---------------------------------
CREATE OR REPLACE VIEW v_credit_outstanding AS
SELECT
    o.customer_id,
    p.full_name        AS customer_name,
    p.email            AS customer_email,
    p.credit_limit,
    o.credit_billing_period,
    COUNT(*)           AS order_count,
    SUM(o.total)::NUMERIC(12,2) AS amount_outstanding
FROM salesweb_customer_orders o
LEFT JOIN shared_profiles p ON p.id = o.customer_id
WHERE o.payment_terms = 'credit'
  AND o.credit_billed_at IS NULL
  AND COALESCE(o.order_status,'') NOT IN ('Cancelled')
GROUP BY o.customer_id, p.full_name, p.email, p.credit_limit, o.credit_billing_period;
