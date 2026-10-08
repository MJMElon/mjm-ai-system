-- A TRAY THAT GAVE OUT MORE THAN WAS EVER PUT IN IT
--
-- A pre-nursery tray holds what was planted into it, and loses seedlings two
-- ways: they are transplanted out, or they are first-culled. What is left
-- cannot be less than nought, so a tray reading below nought means one of
-- these is wrong on this batch:
--
--   the PLANTED figure is too low      -- more went in than the row says
--   a TRANSPLANT quantity is too high  -- fewer went out than the row says
--   a transplant NAMES THE WRONG TRAY  -- it came out of a different one
--   the 1st CULLING is too high        -- fewer were culled than the row says
--
-- TWO KINDS OF TRAY ARE NOT PLANTED INTO AT ALL. Premium Care and
-- Double-Tone are holding trays: seedlings ARRIVE in them from a planting
-- tray and leave later for a main plot, and the Double-Tone one can also be
-- stocked by the keyed Double Tone Quantity in Nursery. Counting only
-- plantings as what goes in made every one of them read below nought, which
-- was this file being wrong rather than the ledger. They are counted
-- properly now: an arrival is what goes in, and where the quantity has been
-- keyed by hand that figure is what the tray holds, exactly as the
-- Transplanting tab reads it.
--
-- A SOURCE TRAY IS FREE TEXT and sometimes names several trays at once --
-- "P1, P2" or "P28-P30" or "P32, P33. P34". Nothing can balance those
-- against the plantings, which name one tray each, so they are listed on
-- their own at the end rather than counted as over-drawn.
--
-- Every batch is swept. A tray over-drawn on one batch is over-drawn the
-- same way on the others, and a file naming one batch would have found that
-- batch and nothing else.
--
-- Nothing is changed by running it.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- SUMMARY first: how many tray-and-batch pairs read below nought. If it says
-- 0, every tray adds up.
--
-- Then one TRAY line per over-drawn tray: what went in, what went out, what
-- was culled, and what that leaves. The last figure is how many seedlings
-- the ledger says came out of nowhere.
--
-- Then every LINE of those trays in date order, so the wrong one can be
-- picked out by reading down.
--
-- Last, the SOURCE NAMES THAT HOLD SEVERAL TRAYS. Those cannot be checked
-- at all, by this or by the tray panel on the Transplanting tab, which keys
-- its balances by one tray name as well. Each is worth re-keying to the one
-- tray the seedlings actually came out of.
--
-- A tray is reused by other batches, so only the rows of the batch being
-- looked at are counted.

WITH tx AS (
  SELECT coalesce(batch_name, '-') AS batch,
         transaction_type AS t,
         coalesce(plot_name, '-')  AS plot,
         coalesce(quantity_change, 0) AS qty,
         coalesce(remark, '') AS remark,
         coalesce(transaction_date, created_at::date) AS happened
  FROM   shared_inventory_logs
),
-- Every movement of a tray, as one list: what went in, what came out.
tray_lines AS (
  SELECT batch, plot AS tray, happened,
         'planted in' AS kind,
         qty AS delta
  FROM   tx
  WHERE  t = 'Planted'
  UNION ALL
  -- Arrivals into a holding tray. The destination is the tray itself.
  SELECT batch, plot, happened, 'arrived from a planting tray', qty
  FROM   tx
  WHERE  t IN ('Transplanted_Premium', 'Transplanted_DoubleTone')
  UNION ALL
  SELECT batch,
         btrim(split_part(split_part(remark, 'from tray [', 2), ']', 1)) AS tray,
         happened,
         'went out to ' || plot,
         -qty
  FROM   tx
  WHERE  t IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
    AND  position('from tray [' in remark) > 0
  UNION ALL
  SELECT batch, plot, happened, '1st culled', -qty
  FROM   tx
  WHERE  t = '1st_Culling'
),
-- The keyed Double Tone Quantity in Nursery. Where it exists it is what the
-- tray holds, so it REPLACES the arrivals rather than adding to them -- the
-- same rule calcTransplanting follows.
dtone_keyed AS (
  SELECT batch, sum(qty) AS keyed
  FROM   tx
  WHERE  t = 'DTone_Nursery_Qty'
  GROUP  BY batch
),
-- A source name holding more than one tray. Nothing can balance it.
-- DOUBLE-TONE carries a hyphen in its own name and is one tray, so the two
-- holding trays are named out rather than caught by the punctuation.
many AS (
  SELECT DISTINCT batch, tray
  FROM   tray_lines
  WHERE  tray <> ''
    AND  tray NOT IN ('DOUBLE-TONE', 'PREMIUM CARE')
    AND  (position(',' in tray) > 0 OR position('-' in tray) > 0)
),
bal AS (
  SELECT l.batch, l.tray,
         CASE WHEN l.tray = 'DOUBLE-TONE' AND d.keyed IS NOT NULL
                THEN d.keyed
              ELSE sum(CASE WHEN l.kind IN ('planted in', 'arrived from a planting tray')
                            THEN l.delta ELSE 0 END)
         END AS went_in,
         sum(CASE WHEN l.kind = '1st culled' THEN l.delta ELSE 0 END) AS culled_out,
         sum(CASE WHEN l.kind NOT IN ('planted in', 'arrived from a planting tray', '1st culled')
                  THEN l.delta ELSE 0 END) AS moved_out
  FROM   tray_lines l
  LEFT   JOIN dtone_keyed d ON d.batch = l.batch
  WHERE  l.tray <> ''
    AND  NOT EXISTS (SELECT 1 FROM many m WHERE m.batch = l.batch AND m.tray = l.tray)
  GROUP  BY l.batch, l.tray, d.keyed
),
bad AS (
  SELECT batch, tray, went_in, culled_out, moved_out,
         went_in + culled_out + moved_out AS left_in_tray
  FROM   bal
  WHERE  went_in + culled_out + moved_out < 0
)
SELECT 0 AS sort_key,
       'SUMMARY'                                                   AS batch,
       (SELECT count(*) FROM bad)::text || ' trays below nought'    AS a,
       coalesce((SELECT sum(left_in_tray) FROM bad), 0)::text
         || ' seedlings out of nowhere'                            AS b,
       (SELECT count(DISTINCT batch) FROM bad)::text || ' batches'  AS c,
       'tray lines next, then every movement of those trays'        AS note
UNION ALL
SELECT 1,
       batch,
       'tray ' || tray,
       'in ' || went_in::text,
       'out ' || abs(moved_out)::text || ', culled ' || abs(culled_out)::text,
       'leaves ' || left_in_tray::text || ' -- that many came from nowhere'
FROM   bad
UNION ALL
SELECT 2,
       l.batch,
       '   tray ' || l.tray,
       l.happened::text,
       CASE WHEN l.delta > 0 THEN '+' || l.delta::text ELSE l.delta::text END,
       l.kind
FROM   tray_lines l
JOIN   bad b ON b.batch = l.batch AND b.tray = l.tray
UNION ALL
SELECT 3,
       batch,
       'SOURCE NAME HOLDS SEVERAL TRAYS',
       tray,
       '-',
       'cannot be balanced against the plantings -- re-key it to one tray'
FROM   many
-- The movement lines carry the date in b, so ordering on it puts a tray in
-- the order it actually happened rather than in the order of its figures.
ORDER  BY sort_key, batch, a, b, c;
