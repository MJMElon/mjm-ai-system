-- Points Ledger — single source of truth for customer loyalty points.
-- Run this once in Supabase SQL Editor.
--
-- Design notes:
--   * Append-only ledger of every point movement (+ earn, − redeem, ± adjust).
--   * Balance for a customer = SUM(change) WHERE user_id = X, minus any points
--     reserved on orders still in 'Pending Payment' (see view below).
--   * No cached balance column → no drift between two sources of truth.
--   * Volume is small; SUM-on-read is fine. Add a cached column later if needed.
--   * Earn is recorded when an order flips to Paid (webhook or admin).
--   * Redeem is recorded at the SAME moment (only after Paid) — so cancelled
--     orders never consume points. The order row carries the redemption
--     snapshot (points_redeemed / points_discount_rm) until Paid, and the
--     balance view treats that snapshot as a hold against the customer's
--     spendable balance so the same points cannot be redeemed twice across
--     overlapping unpaid orders.

-- 1) The ledger table
CREATE TABLE IF NOT EXISTS salesweb_points_ledger (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change      INTEGER     NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('Earned','Redeemed','Adjusted')),
  order_id    UUID                 REFERENCES salesweb_customer_orders(id) ON DELETE SET NULL,
  rm_value    NUMERIC(10,2),                  -- order total (Earned) or discount given (Redeemed)
  note        TEXT,
  created_by  TEXT,                           -- 'billplz' | 'admin' | admin email | 'system'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_points_ledger_user  ON salesweb_points_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_ledger_order ON salesweb_points_ledger (order_id);

-- Hard guarantee that the same order can't produce two Earned or two Redeemed
-- ledger rows even if a status transition handler is invoked twice. 'Adjusted'
-- rows are not tied to an order (order_id NULL) so the partial WHERE keeps
-- them out of the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_points_ledger_order_type
  ON salesweb_points_ledger (order_id, type)
  WHERE order_id IS NOT NULL;

-- 2) Snapshot fields on the order (redemption captured at checkout, ledger row
--    only written when the order flips to Paid)
ALTER TABLE salesweb_customer_orders
  ADD COLUMN IF NOT EXISTS points_redeemed    INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_discount_rm NUMERIC(10,2) DEFAULT 0;

-- 3) Convenience view: spendable balance + lifetime totals per customer.
--    `balance` is the customer's ledger sum minus any points snapshotted on
--    orders still in 'Pending Payment'. The redemption is only written to
--    the ledger when the order flips to Paid, so without this hold a
--    customer could place a second order and redeem the same points again
--    while the first order is still awaiting payment confirmation.
--    `lifetime_earned` / `lifetime_redeemed` stay ledger-only — they track
--    actually-settled movements, not reservations.
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
SELECT COALESCE(l.user_id, p.user_id)                                            AS user_id,
       (COALESCE(l.ledger_balance, 0) - COALESCE(p.pending_redeemed, 0))::INTEGER AS balance,
       COALESCE(l.lifetime_earned, 0)::INTEGER                                   AS lifetime_earned,
       COALESCE(l.lifetime_redeemed, 0)::INTEGER                                 AS lifetime_redeemed,
       COALESCE(p.pending_redeemed, 0)::INTEGER                                  AS pending_redeemed,
       l.last_activity                                                           AS last_activity
FROM ledger_totals l
FULL OUTER JOIN pending_holds p ON p.user_id = l.user_id;

-- 4) RLS — customer reads own; admin reads all; service role inserts.
ALTER TABLE salesweb_points_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer reads own ledger" ON salesweb_points_ledger;
CREATE POLICY "customer reads own ledger" ON salesweb_points_ledger
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin reads all ledger" ON salesweb_points_ledger;
CREATE POLICY "admin reads all ledger" ON salesweb_points_ledger
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM shared_profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- (No INSERT/UPDATE/DELETE policies — only service role writes the ledger.)

-- 5) Backfill from existing Paid orders so customer portals aren't empty on launch.
--    Idempotent: only inserts rows that don't already exist for (order_id, type).
INSERT INTO salesweb_points_ledger (user_id, change, type, order_id, rm_value, note, created_by, created_at)
SELECT o.customer_id,
       o.points_issued,
       'Earned',
       o.id,
       o.total,
       'Backfilled from order ' || COALESCE(o.order_number, o.id::text),
       'system',
       COALESCE(o.updated_at, o.created_at)
FROM salesweb_customer_orders o
WHERE o.status = 'Paid'
  AND o.points_issued > 0
  AND o.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM salesweb_points_ledger l
    WHERE l.order_id = o.id AND l.type = 'Earned'
  );
