-- ================================================================
-- MJM System — Database Migration
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- PART 1: Rename all existing tables to new prefixed names
-- Run these ONE BY ONE and confirm each before next
-- ────────────────────────────────────────────────────────────────

-- Shared tables
ALTER TABLE IF EXISTS profiles             RENAME TO shared_profiles;
ALTER TABLE IF EXISTS al_orders            RENAME TO shared_al_orders;
ALTER TABLE IF EXISTS do_records           RENAME TO shared_do_records;
ALTER TABLE IF EXISTS inventory_logs       RENAME TO shared_inventory_logs;
ALTER TABLE IF EXISTS collection_bookings  RENAME TO shared_collection_bookings;
ALTER TABLE IF EXISTS breeds               RENAME TO shared_breeds;
ALTER TABLE IF EXISTS plots                RENAME TO shared_plots;

-- Operation tables
ALTER TABLE IF EXISTS batches              RENAME TO operation_batches;
ALTER TABLE IF EXISTS nurseries            RENAME TO operation_nurseries;
ALTER TABLE IF EXISTS trays                RENAME TO operation_trays;
ALTER TABLE IF EXISTS follow_up_cases      RENAME TO operation_follow_up_cases;

-- Salesweb tables
ALTER TABLE IF EXISTS products             RENAME TO salesweb_products;
ALTER TABLE IF EXISTS customer_orders      RENAME TO salesweb_customer_orders;
ALTER TABLE IF EXISTS order_items          RENAME TO salesweb_order_items;
ALTER TABLE IF EXISTS order_timeline       RENAME TO salesweb_order_timeline;
ALTER TABLE IF EXISTS order_attachments    RENAME TO salesweb_order_attachments;
ALTER TABLE IF EXISTS coupons              RENAME TO salesweb_coupons;
ALTER TABLE IF EXISTS promotions           RENAME TO salesweb_promotions;
ALTER TABLE IF EXISTS billing_info         RENAME TO salesweb_billing_info;
ALTER TABLE IF EXISTS customer_points      RENAME TO salesweb_customer_points;
ALTER TABLE IF EXISTS stock_transfers      RENAME TO salesweb_stock_transfers;
ALTER TABLE IF EXISTS app_settings         RENAME TO salesweb_app_settings;
ALTER TABLE IF EXISTS site_content         RENAME TO salesweb_site_content;

-- Mobile tables
ALTER TABLE IF EXISTS consent_records      RENAME TO mobile_consent_records;

-- Drop old undeveloped bookings table
DROP TABLE IF EXISTS bookings;


-- ────────────────────────────────────────────────────────────────
-- PART 2: Add proper columns to shared_inventory_logs
-- (replaces data previously jammed into the remark column)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE shared_inventory_logs
  ADD COLUMN IF NOT EXISTS transaction_date   DATE,
  ADD COLUMN IF NOT EXISTS source_tray        TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name      TEXT,
  ADD COLUMN IF NOT EXISTS supplier_do_number TEXT,
  ADD COLUMN IF NOT EXISTS supplier_do_qty    INTEGER,
  ADD COLUMN IF NOT EXISTS foc_percent        NUMERIC,
  ADD COLUMN IF NOT EXISTS workers            TEXT,
  ADD COLUMN IF NOT EXISTS alive_qty          INTEGER,
  ADD COLUMN IF NOT EXISTS dead_qty           INTEGER,
  ADD COLUMN IF NOT EXISTS cull_rate          TEXT,
  ADD COLUMN IF NOT EXISTS transplanted_qty   INTEGER,
  ADD COLUMN IF NOT EXISTS balance_qty        INTEGER;


-- ────────────────────────────────────────────────────────────────
-- PART 3: Create 5 new audit tables in main project
-- (previously existed only in the old audit Supabase project)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_plot_audits (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nursery     TEXT,
  plot        TEXT,
  batch       TEXT,
  auditor_name TEXT,
  pest        TEXT,
  tikus       TEXT,
  disease     TEXT,
  warna_daun  TEXT,
  date        DATE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_height_records (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nursery     TEXT,
  plot        TEXT,
  batch       TEXT,
  auditor_name TEXT,
  sample_1    NUMERIC,
  sample_2    NUMERIC,
  sample_3    NUMERIC,
  avg_height  NUMERIC,
  date        DATE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_papan_audits (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nursery      TEXT,
  plot         TEXT,
  batch_no     TEXT,
  auditor_name TEXT,
  presence     TEXT,
  info_correct TEXT,
  condition    TEXT,
  date         DATE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_maintenance_tasks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_type   TEXT,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_maintenance_audits (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nursery     TEXT,
  plot        TEXT,
  task_type   TEXT,
  result      TEXT,
  auditor_name TEXT,
  date        DATE,
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- ────────────────────────────────────────────────────────────────
-- PART 4: Enable RLS on new audit tables (match existing pattern)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE audit_plot_audits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_height_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_papan_audits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_maintenance_tasks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_maintenance_audits ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (adjust as needed)
CREATE POLICY "Authenticated full access" ON audit_plot_audits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON audit_height_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON audit_papan_audits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON audit_maintenance_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON audit_maintenance_audits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
