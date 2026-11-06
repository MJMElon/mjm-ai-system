-- =====================================================================
--  WHAT THE LINKED QUANTITY READS NOW, AGAINST WHAT IT READ BEFORE
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  The office asked for the linked capacity to be the Summary Report and
--  for nothing else to move: "it should be exactly the same". This is the
--  only thing that answers that. It works out every record BOTH WAYS and
--  prints the ones that differ.
--
--  TWO THINGS CHANGED, and each moves a different set of rows.
--
--  1. A 2ND CULLING IS NOT TAKEN OFF TWICE.
--     The Summary Report deducts the 2nd culling only while the same plot
--     and batch carries no EVIDENCED 3rd culling, because a 3rd culling
--     already contains the seedlings 2nd culled on the way to it. The link
--     took both off, so a plot 2nd culled and then 3rd culled read LOW by
--     exactly its 2nd culling. Those rows read HIGHER now, and they read
--     what the Summary Report reads.
--
--     Nothing else moves. A plot with no 2nd culling, or one not yet 3rd
--     culled, or an interrow row (which keeps the whole 2nd culling
--     standing either way) reads exactly what it always read.
--
--  2. THE PHONE NO LONGER FILLS THE QUANTITY CELL.
--     A maintenance record saved on a handset carried a figure -- the
--     batches the conductor ticked, added up off a view that counts
--     neither culling, as at the day the record was SAVED -- and it filled
--     an empty cell here. Those rows now read the Summary Report like
--     every other row.
--
--  WHAT A GOOD RESULT LOOKS LIKE
--
--    ord 1, summary
--      -> how many records are on the link at all, and how many of them
--         move. "0 move" is the answer the office is expecting, and it is
--         a real possibility: it means no plot in the system is both 2nd
--         culled and 3rd culled on the same batch.
--
--    ord 2, the 2nd culling was taken off twice
--      -> one line per record, with what it read before, what it reads
--         now, and the gap. The gap is always the 2nd culling on the
--         batches that row covers, and it is always UPWARD.
--
--    ord 3, the phone had filled this cell
--      -> one line per record, with what the phone had put there and what
--         the report says instead. A row marked CHECKED is one the office
--         has already agreed: its figure is written down again at the
--         report figure, so it stays a number and stops being a formula.
--
--    ord 4, nothing to report
--      -> drawn in place of an empty section, so an empty section cannot
--         be mistaken for a query that did not run.
--
--  TWO LIMITS, both stated rather than left to be found
--    - A record whose Tarikh is not YYYY-MM-DD (the date picker own
--      format) is counted as having no date, which stands at the plot
--      current balance. That is what the page does with it too.
--    - An evidenced 3rd culling is one whose remark mentions MapQty.
--      The page asks for a NUMBER after it as well.
-- =====================================================================
WITH mv AS (
  SELECT l.transaction_type                             AS t,
         COALESCE(l.remark, '')                         AS remark,
         l.plot_name,
         l.batch_name,
         COALESCE(l.quantity_change, 0)                 AS q,
         -- transaction_date, else a date in the remark, else the day it
         -- was saved. CullDate is asked first because it CONTAINS Date.
         COALESCE(
           l.transaction_date::text,
           CASE WHEN position('CullDate: ' in COALESCE(l.remark, '')) > 0
                  AND translate(substr(l.remark,
                        position('CullDate: ' in l.remark) + 10, 10),
                        '0123456789', '0000000000') = '0000-00-00'
                THEN substr(l.remark, position('CullDate: ' in l.remark) + 10, 10)
                ELSE NULL END,
           CASE WHEN position('Date: ' in COALESCE(l.remark, '')) > 0
                  AND translate(substr(l.remark,
                        position('Date: ' in l.remark) + 6, 10),
                        '0123456789', '0000000000') = '0000-00-00'
                THEN substr(l.remark, position('Date: ' in l.remark) + 6, 10)
                ELSE NULL END,
           left(l.created_at::text, 10)
         )::date                                        AS d
    FROM public.shared_inventory_logs l
   WHERE l.transaction_type IN ('Transplanted', '2nd_Culling', '3rd_Culling',
                                'Cull3_Transfer', 'Stock_Calibration')
),
-- One row per movement, keyed and SIGNED the way the report signs its
-- columns. cull2 is carried as its own kind, because whether it counts is
-- the whole question this file is about.
ev AS (
      SELECT public.mjm_plot_key(plot_name)  AS pk,
             public.mjm_batch_key(batch_name) AS bk,
             'base'::text AS kind, abs(q) AS amt, d
        FROM mv WHERE t = 'Transplanted' AND d IS NOT NULL
  UNION ALL
      SELECT public.mjm_plot_key(plot_name), public.mjm_batch_key(batch_name),
             'base', abs(q), d
        FROM mv WHERE t = 'Cull3_Transfer' AND d IS NOT NULL
  UNION ALL
      -- The other side of a transfer: the remark says which plot it left.
      SELECT public.mjm_plot_key(split_part(split_part(remark, 'From: [', 2), '|', 1)),
             public.mjm_batch_key(batch_name),
             'base', -abs(q), d
        FROM mv
       WHERE t = 'Cull3_Transfer' AND d IS NOT NULL
         AND position('From: [' in remark) > 0
  UNION ALL
      -- Already signed when it is keyed, so it is taken as stored.
      SELECT public.mjm_plot_key(plot_name), public.mjm_batch_key(batch_name),
             'base', q, d
        FROM mv
       WHERE t = 'Stock_Calibration' AND d IS NOT NULL
         AND position('[APPROVED by ' in remark) > 0
  UNION ALL
      SELECT public.mjm_plot_key(plot_name), public.mjm_batch_key(batch_name),
             'cull3', abs(q), d
        FROM mv
       WHERE t = '3rd_Culling' AND d IS NOT NULL
         AND position('MapQty:' in remark) > 0
  UNION ALL
      SELECT public.mjm_plot_key(plot_name), public.mjm_batch_key(batch_name),
             'cull2', abs(q), d
        FROM mv WHERE t = '2nd_Culling' AND d IS NOT NULL
),
-- Which plot and batch pairs the ledger really has. A delivery order line
-- naming a batch the ledger does not have cannot subtract from a plot --
-- the report refuses it too.
real AS (SELECT DISTINCT pk, bk FROM ev WHERE pk <> '' AND bk <> ''),
sold AS (
  SELECT public.mjm_plot_key(x.p) AS pk,
         public.mjm_batch_key(x.b) AS bk,
         'base'::text AS kind,
         -abs(x.q) AS amt,
         d.delivery_date AS d
    FROM public.shared_do_records d
    CROSS JOIN LATERAL (VALUES
           (d.plot_1, d.batch_1, COALESCE(d.qty_1, 0)),
           (d.plot_2, d.batch_2, COALESCE(d.qty_2, 0)),
           (d.plot_3, d.batch_3, COALESCE(d.qty_3, 0)),
           (d.plot_4, d.batch_4, COALESCE(d.qty_4, 0)),
           (d.plot_5, d.batch_5, COALESCE(d.qty_5, 0))) AS x(p, b, q)
   WHERE x.q <> 0
     AND d.delivery_date IS NOT NULL
     AND COALESCE(d.status, '') <> 'Cancelled'
     AND position('[CANCELLED]' in COALESCE(d.remark, '')) = 0
),
allev AS (
  SELECT * FROM ev
  UNION ALL
  SELECT s.* FROM sold s JOIN real r ON r.pk = s.pk AND r.bk = s.bk
),
-- The office own rows, out of the one JSONB list.
rec AS (
  SELECT (row_number() OVER ())                       AS n,
         rec ->> 'plot'                               AS plot,
         rec ->> 'jenis'                              AS jenis,
         rec ->> 'tarikh'                             AS tarikh,
         rec ->> 'batch'                              AS batch,
         rec ->> '_month'                             AS mth,
         COALESCE(rec ->> 'qty', '')                  AS qty,
         COALESCE(rec ->> 'qtyFrozen', '')            AS qty_frozen,
         COALESCE(rec ->> 'checked', '')              AS checked,
         COALESCE(rec ->> '_fromFieldQty', '')        AS from_phone,
         lower(COALESCE(rec ->> 'jenis', '')) LIKE '%rumput secara selingan%'
           OR lower(COALESCE(rec ->> 'jenis', '')) LIKE '%interrow%'
                                                      AS interrow
    FROM public.nops_maint_records m,
         jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) rec
   WHERE m.id = 1
),
-- The cut-off. Anything the picker did not write reads as no date, which
-- stands at the plot current balance.
cut AS (
  SELECT r.*,
         CASE WHEN translate(COALESCE(r.tarikh, ''), '0123456789', '0000000000')
                   = '0000-00-00'
              THEN r.tarikh::date ELSE NULL END       AS asof
    FROM rec r
),
-- The batches a row covers. An empty batch cell is EVERY batch standing on
-- that plot, which is what leaving it blank has always meant.
want AS (
  SELECT c.n, public.mjm_batch_key(trim(b)) AS bk
    FROM cut c
    CROSS JOIN LATERAL unnest(string_to_array(COALESCE(c.batch, ''), ',')) AS b
   WHERE trim(b) <> ''
),
-- One bucket per record and batch, which is the bucket the Summary Report
-- asks its own condition of.
buc AS (
  SELECT c.n,
         e.bk,
         sum(CASE WHEN e.kind = 'base'  THEN e.amt ELSE 0 END)      AS base,
         sum(CASE WHEN e.kind = 'cull3' THEN e.amt ELSE 0 END)      AS c3,
         sum(CASE WHEN e.kind = 'cull2' THEN e.amt ELSE 0 END)      AS c2
    FROM cut c
    JOIN allev e
      ON e.pk = public.mjm_plot_key(c.plot)
     AND (c.asof IS NULL OR e.d <= c.asof)
     AND (NOT EXISTS (SELECT 1 FROM want w WHERE w.n = c.n)
          OR e.bk IN (SELECT w.bk FROM want w WHERE w.n = c.n))
   GROUP BY c.n, e.bk
),
-- Both answers, per record.
two AS (
  SELECT c.n, c.plot, c.jenis, c.tarikh, c.batch, c.mth, c.qty,
         c.qty_frozen, c.checked, c.from_phone, c.interrow,
         sum(b.base - CASE WHEN c.interrow THEN 0 ELSE b.c3 END)    AS nocull2,
         sum(b.c2)                                                  AS c2,
         sum(CASE WHEN c.interrow OR b.c3 > 0 THEN 0 ELSE b.c2 END) AS c2_new,
         sum(CASE WHEN c.interrow            THEN 0 ELSE b.c2 END)  AS c2_old
    FROM cut c
    JOIN buc b ON b.n = c.n
   GROUP BY c.n, c.plot, c.jenis, c.tarikh, c.batch, c.mth, c.qty,
            c.qty_frozen, c.checked, c.from_phone, c.interrow
),
fig AS (
  SELECT two.*,
         (nocull2 - c2_old)::bigint AS old_q,
         (nocull2 - c2_new)::bigint AS new_q
    FROM two
),
-- On the link at all: nothing keyed, nothing frozen. A keyed figure always
-- wins and a frozen one is a settled row, so neither moves.
onlink AS (
  SELECT * FROM fig
   WHERE qty        IN ('', 'null')
     AND qty_frozen IN ('', 'null')
),
moved AS (SELECT * FROM onlink WHERE new_q <> old_q),
phone AS (SELECT * FROM fig WHERE from_phone NOT IN ('', 'null', '0')
                              AND qty NOT IN ('', 'null'))
SELECT * FROM (
  SELECT 1 AS ord,
         'summary'                                    AS what,
         '(every nursery)'                            AS plot,
         ''                                           AS work_day,
         (SELECT count(*)::text FROM onlink) || ' records are on the link, '
           || (SELECT count(*)::text FROM moved) || ' of them move'
           || CASE WHEN (SELECT count(*) FROM moved) = 0
                   THEN ' -- the linked quantity is identical to before'
                   ELSE ' by ' || (SELECT COALESCE(sum(new_q - old_q), 0)::text
                                     FROM moved) || ' seedlings in total' END
           || '. ' || (SELECT count(*)::text FROM phone)
           || ' records still carry a quantity the phone filled.'
                                                      AS detail

  UNION ALL

  SELECT 2, 'the 2nd culling was taken off twice',
         COALESCE(plot, '(no plot)'),
         COALESCE(NULLIF(tarikh, '-'), 'no date'),
         'was ' || old_q::text || ', now ' || new_q::text
           || ' (+' || (new_q - old_q)::text || ', the 2nd culling that is '
           || 'inside the 3rd) -- ' || COALESCE(mth, 'no month') || ', '
           || COALESCE(NULLIF(jenis, ''), 'no job')
           || CASE WHEN COALESCE(batch, '') = ''
                   THEN ', every batch on the plot'
                   ELSE ', batch ' || batch END
    FROM moved

  UNION ALL

  SELECT 3, 'the phone had filled this cell',
         COALESCE(plot, '(no plot)'),
         COALESCE(NULLIF(tarikh, '-'), 'no date'),
         'phone sent ' || qty || ', the report reads ' || new_q::text
           || ' -- ' || COALESCE(mth, 'no month') || ', '
           || COALESCE(NULLIF(jenis, ''), 'no job')
           || CASE WHEN checked NOT IN ('', 'null', '0')
                   THEN ' -- CHECKED, so it is written down again at the '
                        || 'report figure'
                   ELSE ' -- not checked, so it goes straight on the link' END
    FROM phone

  UNION ALL

  SELECT 4, 'nothing to report', '(every nursery)', '',
         'no record on the link moves -- the 2nd culling is taken off exactly '
           || 'where it was before'
   WHERE NOT EXISTS (SELECT 1 FROM moved)

  UNION ALL

  SELECT 4, 'nothing to report', '(every nursery)', '',
         'no record carries a quantity the phone filled'
   WHERE NOT EXISTS (SELECT 1 FROM phone)
) y
ORDER BY ord, left(plot, 1), length(plot), plot, work_day;
