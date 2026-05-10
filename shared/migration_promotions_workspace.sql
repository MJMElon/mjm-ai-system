-- ================================================================
-- MJM System — Promotion Workspace fields
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
-- ================================================================
--
-- Adds the columns the new Promotions Designer needs:
--   scope             — 'line' (per matching item) or 'cart' (whole order)
--   min_order_rm      — minimum order RM to qualify
--   min_qty           — minimum qty in cart to qualify
--   max_uses          — total redemption cap (NULL = unlimited)
--   uses_count        — running counter; bumped at checkout
--   published_at      — first time the promo was switched ON
--   conversation_log  — full chat transcript used to design the promo
--   updated_at        — last edit timestamp
--   scope, min_order_rm and min_qty default to safe values
-- ----------------------------------------------------------------

ALTER TABLE public.salesweb_promotions
  ADD COLUMN IF NOT EXISTS scope            TEXT     DEFAULT 'cart',
  ADD COLUMN IF NOT EXISTS min_order_rm     NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_qty          INTEGER  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_uses         INTEGER,
  ADD COLUMN IF NOT EXISTS uses_count       INTEGER  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conversation_log JSONB    DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT now();

-- Drop any old CHECK on scope (if you've run this before with a stricter rule)
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.salesweb_promotions'::regclass
       AND contype  = 'c'
       AND conname LIKE '%scope%'
  LOOP
    EXECUTE format('ALTER TABLE public.salesweb_promotions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.salesweb_promotions
  ADD CONSTRAINT salesweb_promotions_scope_check
  CHECK (scope IN ('line','cart'));

-- Make sure existing rows have a scope value.
UPDATE public.salesweb_promotions SET scope = 'cart' WHERE scope IS NULL;

-- Touch updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION public.touch_salesweb_promotions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS salesweb_promotions_touch_updated ON public.salesweb_promotions;
CREATE TRIGGER salesweb_promotions_touch_updated
  BEFORE UPDATE ON public.salesweb_promotions
  FOR EACH ROW EXECUTE FUNCTION public.touch_salesweb_promotions_updated_at();
