-- ================================================================
-- MJM System — Batch × Customer Allocations
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
--
-- Purpose: lets one matured-batch row be reserved across multiple
-- customers (e.g. plot 5A's 2,000 seedlings split between Customer A
-- 800, Customer B 600, Customer C 400). Replaces the single-customer
-- shared_plot_allocations.reserved_for / reserved_qty model with a
-- many-to-many table.
--
-- The page handles a missing table gracefully — running this enables
-- persistence of drag-and-drop allocations made in the maturity panel.
-- ================================================================

CREATE TABLE IF NOT EXISTS shared_batch_customer_allocations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_name      text        NOT NULL,
    plot_name       text        NOT NULL,
    order_id        uuid,
    order_number    text,
    customer_name   text        NOT NULL,
    allocated_qty   integer     NOT NULL CHECK (allocated_qty > 0),
    remark          text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bca_batch_plot
    ON shared_batch_customer_allocations(batch_name, plot_name);

CREATE INDEX IF NOT EXISTS idx_bca_order
    ON shared_batch_customer_allocations(order_id);

CREATE INDEX IF NOT EXISTS idx_bca_order_number
    ON shared_batch_customer_allocations(order_number);

-- Enable RLS (mirrors other shared_* tables)
ALTER TABLE shared_batch_customer_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_bca"  ON shared_batch_customer_allocations;
DROP POLICY IF EXISTS "auth_write_bca" ON shared_batch_customer_allocations;

CREATE POLICY "auth_read_bca"  ON shared_batch_customer_allocations
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_write_bca" ON shared_batch_customer_allocations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
