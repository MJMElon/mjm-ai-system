-- Fix double-redemption of loyalty points across overlapping unpaid orders.
--
-- Before this migration, salesweb_customer_points_balance only summed the
-- ledger. The redemption ledger row is written when an order flips to Paid,
-- so a customer who placed an order in 'Pending Payment' (e.g. cash on
-- collection, awaiting admin confirmation) could go back to checkout and
-- redeem the same points on a second order — the balance view still showed
-- the pre-redemption total. When both orders later flipped to Paid, two
-- negative ledger rows posted for the same points.
--
-- This migration:
--   1. Rebuilds the balance view to treat points_redeemed on any
--      'Pending Payment' order as a hold against the spendable balance.
--   2. Adds a partial unique index on (order_id, type) so even a buggy
--      status-transition handler can't insert duplicate Earned/Redeemed
--      rows for the same order.
--
-- Run once in Supabase SQL Editor. Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_points_ledger_order_type
  ON salesweb_points_ledger (order_id, type)
  WHERE order_id IS NOT NULL;

CREATE OR REPLACE VIEW salesweb_customer_points_balance AS
WITH ledger_totals AS (
  SELECT user_id,
         SUM(change)::INTEGER                                            AS ledger_balance,
         SUM(CASE WHEN change > 0 THEN change  ELSE 0 END)::INTEGER      AS lifetime_earned,
         SUM(CASE WHEN change < 0 THEN -change ELSE 0 END)::INTEGER      AS lifetime_redeemed,
         MAX(created_at)                                                 AS last_activity
  FROM salesweb_points_ledger
  GROUP BY user_id
),
pending_holds AS (
  SELECT customer_id                                       AS user_id,
         SUM(COALESCE(points_redeemed, 0))::INTEGER        AS pending_redeemed
  FROM salesweb_customer_orders
  WHERE customer_id IS NOT NULL
    AND status = 'Pending Payment'
    AND COALESCE(points_redeemed, 0) > 0
  GROUP BY customer_id
)
-- Column order matters: PostgreSQL's CREATE OR REPLACE VIEW only allows
-- appending new columns to the end of an existing view, so pending_redeemed
-- goes after last_activity to keep the prior column positions intact.
SELECT COALESCE(l.user_id, p.user_id)                                            AS user_id,
       (COALESCE(l.ledger_balance, 0) - COALESCE(p.pending_redeemed, 0))::INTEGER AS balance,
       COALESCE(l.lifetime_earned, 0)::INTEGER                                   AS lifetime_earned,
       COALESCE(l.lifetime_redeemed, 0)::INTEGER                                 AS lifetime_redeemed,
       l.last_activity                                                           AS last_activity,
       COALESCE(p.pending_redeemed, 0)::INTEGER                                  AS pending_redeemed
FROM ledger_totals l
FULL OUTER JOIN pending_holds p ON p.user_id = l.user_id;
