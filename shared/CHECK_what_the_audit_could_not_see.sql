-- ============================================================================
-- WHAT THE TWO AUDIT MODULES COULD NOT SEE, AND NOW CAN
--
-- The office: "for the nursery audit plot condition audit and seedling height
-- audit plot and batch link to the summary report (main nursery movement
-- report). So if the plot shown in the report, it will shown for audit too."
--
-- Both modules built their batch roster from the LIFE-STAGE LOGS and nothing
-- else -- Planted for a pre-nursery tray, Transplanted for a main plot -- and
-- then used shared_plot_batch_balance only as a GATE, to grey out a batch
-- that had since gone.
--
-- That view IS the Main Nursery Movement Report. So the gate was the report
-- and the roster was not, and the two do not cover the same ground: A BATCH
-- THAT ARRIVED BY TRANSFER HAS NO Transplanted LOG AT ALL. It arrives as a
-- Cull3_Transfer, which is the reports own Transfer In column, so it sat in
-- the report with a perfectly good balance row and was on NO audit grid.
--
-- That is every "-R" plot in the company, because a replant plot is made by a
-- 3rd-culling transfer and is populated by nothing else.
--
-- THIS FILE IS THE SIZE OF IT. Nothing to run and nothing changes -- the view
-- already carries the transfers whichever version of it you have, so the fix
-- is entirely in the two modules.
--
-- WHAT TO LOOK FOR, in the order the result prints it:
--
--   1  whether the view is there at all, and how many plot and batch pairs it
--      says are STANDING. Every line under this means nothing without it.
--   2  one line per nursery: how many standing pairs the audit could already
--      see, and how many it COULD NOT. The second figure is what this change
--      adds to that nursery grid.
--   3  every pair the audit could not see, named, with what is standing.
--      "nothing to report" is a real answer and means every standing batch
--      already had a life-stage log, so the two were agreeing all along.
--   4  of those, the ones whose PLOT is under no nursery -- not in the four
--      ranges and not in Seedling Stock. These are still on no grid, because
--      a grid with four tabs has nowhere to draw them. Expect NOUGHT. A row
--      here is a plot to add on Seedling Stock, System Settings, Add Plot.
--
-- Safe to run twice, creates nothing, changes nothing.
-- ============================================================================

-- Everything is collected in a DO block and parked in session settings, so
-- the query at the foot names no table. A query naming a table that is not on
-- the database fails to PARSE however well the branch is guarded.
DO $collect$
DECLARE
  js    jsonb := '[]'::jsonb;
  /* Seedling Stock is OPTIONAL here, the same as the view. It is what places
     a "-R" plot -- no range holds one -- so without it those rows read as on
     no nursery list, which is the truth on such a database. Swapped in as
     text because a query naming a table that is not there fails to PARSE,
     guarded branch or no guarded branch. */
  stock_sql text := CASE
    WHEN to_regclass('public.shared_plots') IS NULL
    THEN 'SELECT NULL::text AS nursery, NULL::text AS pkey WHERE false'
    ELSE 'SELECT (SELECT rr.code FROM ranges rr
                   WHERE rr.code = translate(upper(btrim(coalesce(p.nursery_name, ''''))),
                                             '' -_./()'', '''')) AS nursery,
                 translate(upper(btrim(coalesce(p.plot_name, ''''))), '' -_./()'', '''') AS pkey
            FROM public.shared_plots p'
  END;
BEGIN
  PERFORM set_config('mjm.has_view',
    CASE WHEN to_regclass('public.shared_plot_batch_balance') IS NULL
         THEN 'no' ELSE 'yes' END, false);

  IF to_regclass('public.shared_plot_batch_balance') IS NOT NULL THEN
    EXECUTE $stock$
      WITH

      /* THE REPORT, standing only. A pair closed at nought is the months
         history and not a task -- the audit has always read it that way and
         this change does not move it. */
      standing AS (
        SELECT translate(upper(btrim(coalesce(plot_name, ''))),  ' -_./()', '') AS pkey,
               translate(upper(btrim(coalesce(batch_name, ''))), ' -_./()', '') AS bkey,
               btrim(coalesce(plot_name, ''))  AS plot,
               btrim(coalesce(batch_name, '')) AS batch,
               qty
          FROM public.shared_plot_batch_balance
         WHERE coalesce(qty, 0) > 0
      ),

      /* THE AUDIT ROSTER AS IT WAS -- the four life stages both modules read,
         and nothing else. This is the whole of what they could see. */
      seen AS (
        SELECT DISTINCT
               translate(upper(btrim(coalesce(plot_name, ''))),  ' -_./()', '') AS pkey,
               translate(upper(btrim(coalesce(batch_name, ''))), ' -_./()', '') AS bkey
          FROM public.shared_inventory_logs
         WHERE transaction_type IN ('Planted', 'Transplanted',
                                    'Transplanted_Premium', 'Transplanted_DoubleTone')
      ),

      /* WHICH NURSERY A PLOT IS UNDER, by the audit modules own rule: the
         four fixed ranges, and whatever Seedling Stock has keyed on top. A
         plot under neither is on no grid whatever the report says. */
      ranges(code, letter, n) AS (
                  SELECT 'PN',   'P', 52
        UNION ALL SELECT 'BNN',  'B', 14
        UNION ALL SELECT 'UNN1', 'U', 18
        UNION ALL SELECT 'UNN2', 'N', 20
      ),
      fixed AS (
        SELECT r.code AS nursery,
               translate(upper(r.letter || g::text), ' -_./()', '') AS pkey
          FROM ranges r, generate_series(1, r.n) AS g
        UNION
        SELECT r.code,
               translate(upper(r.letter || lpad(g::text, 2, '0')), ' -_./()', '')
          FROM ranges r, generate_series(1, r.n) AS g
      ),
      stock AS ( $stock$ || stock_sql || $stock$ ),
      placed AS (
        SELECT pkey, min(nursery) AS nursery FROM (
          SELECT pkey, nursery FROM fixed
          UNION ALL
          SELECT pkey, nursery FROM stock WHERE nursery IS NOT NULL
        ) z GROUP BY pkey
      ),

      /* The two halves of every standing pair. */
      split AS (
        SELECT s.*, pl.nursery,
               EXISTS (SELECT 1 FROM seen q
                        WHERE q.pkey = s.pkey AND q.bkey = s.bkey) AS had_log
          FROM standing s
          LEFT JOIN placed pl ON pl.pkey = s.pkey
      )

      SELECT jsonb_build_object(
               'total',   (SELECT count(*) FROM standing),
               'missed',  (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                    'nursery', coalesce(nursery, ''),
                                    'plot', plot, 'batch', batch, 'qty', qty)
                                  ORDER BY coalesce(nursery, 'ZZ'), plot, batch), '[]'::jsonb)
                             FROM split WHERE NOT had_log),
               'by_nurs', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
                             SELECT jsonb_build_object(
                                      'nursery', coalesce(nursery, 'on no nursery list'),
                                      'saw',  sum(CASE WHEN had_log THEN 1 ELSE 0 END),
                                      'blind', sum(CASE WHEN had_log THEN 0 ELSE 1 END)) AS x
                               FROM split GROUP BY coalesce(nursery, 'on no nursery list')
                               ORDER BY coalesce(nursery, 'on no nursery list')) y))
    $stock$ INTO js;
  END IF;

  -- Every piece COALESCEd: set_config with a NULL value BLANKS the setting,
  -- which would read as a database with nothing standing anywhere.
  PERFORM set_config('mjm.audit_gap', coalesce(js::text, '{}'), false);
END
$collect$;


-- ONE result set. The SQL Editor shows only the last statement, so every
-- section is UNION ALLed and `sort` is what keeps them in order.
WITH g AS (
  SELECT coalesce(current_setting('mjm.audit_gap', true), '{}')::jsonb AS j
),
missed AS (
  SELECT r.value ->> 'nursery' AS nursery,
         r.value ->> 'plot'    AS plot,
         r.value ->> 'batch'   AS batch,
         (r.value ->> 'qty')   AS qty
    FROM g, jsonb_array_elements(coalesce(g.j -> 'missed', '[]'::jsonb)) AS r
),
by_nurs AS (
  SELECT r.value ->> 'nursery'          AS nursery,
         (r.value ->> 'saw')::bigint    AS saw,
         (r.value ->> 'blind')::bigint  AS blind
    FROM g, jsonb_array_elements(coalesce(g.j -> 'by_nurs', '[]'::jsonb)) AS r
)

SELECT 1 AS sort, 'THE REPORT' AS section,
       CASE WHEN coalesce(current_setting('mjm.has_view', true), 'no') = 'no'
            THEN 'shared_plot_batch_balance is NOT on this database'
            ELSE 'shared_plot_batch_balance read' END AS nursery,
       coalesce((SELECT (j ->> 'total') FROM g), '0')
         || ' plot and batch pairs standing' AS plot,
       (SELECT count(*)::text FROM missed) || ' of them the audit could not see' AS batch,
       CASE WHEN coalesce(current_setting('mjm.has_view', true), 'no') = 'no'
            THEN 'nothing below means anything until the view is there'
            WHEN (SELECT count(*) FROM missed) = 0
            THEN 'the roster and the report already agreed -- this change moves nothing'
            ELSE 'every one of these is a task the two audit grids now offer'
            END AS note

UNION ALL
SELECT 2, 'BY NURSERY', n.nursery,
       n.saw::text   || ' the audit already saw',
       n.blind::text || ' it could NOT',
       CASE WHEN n.blind = 0 THEN 'nothing to add on this grid'
            ELSE 'these arrived by transfer, so they had no life-stage log'
            END
  FROM by_nurs n

UNION ALL
SELECT 3, 'COULD NOT SEE',
       CASE WHEN m.nursery = '' THEN 'on no nursery list' ELSE m.nursery END,
       m.plot, 'batch ' || m.batch,
       m.qty || ' standing, per the Movement Report'
  FROM missed m

UNION ALL
SELECT 3, 'COULD NOT SEE', 'none', '-', '-',
       'nothing to report -- every standing batch already had a life-stage log'
 WHERE NOT EXISTS (SELECT 1 FROM missed)

UNION ALL
SELECT 4, 'STILL ON NO GRID',
       'on no nursery list', m.plot, 'batch ' || m.batch,
       'its plot is in no range and not in Seedling Stock, so no grid can draw it'
  FROM missed m
 WHERE m.nursery = ''

UNION ALL
SELECT 4, 'STILL ON NO GRID', 'none', '-', '-',
       'nothing to report -- every one of them places under one of the four'
 WHERE NOT EXISTS (SELECT 1 FROM missed WHERE nursery = '')

 ORDER BY 1, 3, 4;
