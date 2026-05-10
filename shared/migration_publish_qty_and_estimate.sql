-- ================================================================
-- MJM System — Publish-qty workflow + monthly estimate collection
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
-- ================================================================
--
-- Adds the data Sales Web admin needs to drive the new "Publish
-- Product" popup, and the field the operation/seedling stock sales
-- module needs for the new Monthly Sales Analysis section.
--
-- Three logical changes:
--   1. New table salesweb_monthly_estimate_collection — admin keys
--      in (and edits) an estimate collection qty per sell-month.
--      Used by both the analysis dashboard and the publish popup.
--   2. New columns on salesweb_products to record what was actually
--      pushed to the storefront, separately from the auto-computed
--      stock_qty:
--        published_qty       — qty visible on storefront
--        publish_strategy    — which option was chosen
--        published_at / by   — audit trail
--   3. RLS policies for the new table so authenticated users can
--      read, but only sales-web admins can write.
--
-- Safe to re-run (IF NOT EXISTS / IF NOT EXISTS guards).
-- Run AFTER migration_rename_and_new_tables.sql.
-- ----------------------------------------------------------------


-- ────────────────────────────────────────────────────────────────
-- PART 1: salesweb_monthly_estimate_collection
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS salesweb_monthly_estimate_collection (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sell_year   INT  NOT NULL,
  sell_month  TEXT NOT NULL,           -- 'January' .. 'December' to match salesweb_products.sell_month
  qty         INT  NOT NULL DEFAULT 0,
  note        TEXT,
  updated_by  TEXT,                    -- email of the admin who last edited
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sell_year, sell_month)
);

CREATE INDEX IF NOT EXISTS salesweb_monthly_estimate_collection_year_idx
  ON salesweb_monthly_estimate_collection (sell_year, sell_month);

ALTER TABLE salesweb_monthly_estimate_collection ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Anyone authenticated can read (analysis section is read by both
  -- operation and salesweb modules).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='salesweb_monthly_estimate_collection'
       AND policyname='Authenticated read estimate collection'
  ) THEN
    CREATE POLICY "Authenticated read estimate collection"
      ON salesweb_monthly_estimate_collection
      FOR SELECT TO authenticated USING (true);
  END IF;

  -- Only users with salesweb access (admin OR normal) can write.
  -- Mirrors the gate used by auth.html / admin.html.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='salesweb_monthly_estimate_collection'
       AND policyname='Salesweb staff write estimate collection'
  ) THEN
    CREATE POLICY "Salesweb staff write estimate collection"
      ON salesweb_monthly_estimate_collection
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM shared_profiles me
           WHERE me.id = auth.uid()
             AND (
                  me.permissions #>> '{modules,salesweb}' IN ('admin','normal')
               OR me.role = 'admin'
             )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM shared_profiles me
           WHERE me.id = auth.uid()
             AND (
                  me.permissions #>> '{modules,salesweb}' IN ('admin','normal')
               OR me.role = 'admin'
             )
        )
      );
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- PART 2: Publish-qty columns on salesweb_products
-- ────────────────────────────────────────────────────────────────

ALTER TABLE salesweb_products
  ADD COLUMN IF NOT EXISTS published_qty     INT,
  ADD COLUMN IF NOT EXISTS publish_strategy  TEXT,
  ADD COLUMN IF NOT EXISTS published_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by      TEXT;

-- publish_strategy must be one of the four supported options when set.
-- Implemented as a CHECK rather than ENUM so future strategies can be
-- added by re-running this migration with an updated CHECK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'salesweb_products_publish_strategy_chk'
  ) THEN
    ALTER TABLE salesweb_products
      ADD CONSTRAINT salesweb_products_publish_strategy_chk
      CHECK (
        publish_strategy IS NULL
        OR publish_strategy IN ('raw','minus_alloc','maturity_plus_suitable_minus_estimate','manual')
      );
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────
-- PART 3: Backfill — make existing published products self-consistent
-- ────────────────────────────────────────────────────────────────

UPDATE salesweb_products
   SET published_qty    = COALESCE(published_qty, stock_qty),
       publish_strategy = COALESCE(publish_strategy, 'raw'),
       published_at     = COALESCE(published_at, NOW())
 WHERE is_published = TRUE
   AND published_qty IS NULL;
