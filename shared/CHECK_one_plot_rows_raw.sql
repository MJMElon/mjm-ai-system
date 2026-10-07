-- =====================================================================
--  ONE PLOTS ROWS, EXACTLY AS THEY ARE SAVED
--
--  Change the plot on the line marked PLOT below, paste the WHOLE file into
--  the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  A figure on the Work Record is one of three things, and they look alike:
--
--    · KEYED      somebody typed it. Saved as "qty".
--    · HELD       the row was Checked, so what it read then was written down.
--                 Saved as "qtyFrozen", drawn with a padlock.
--    · LINKED     nothing is saved at all. The batch report is summed live
--                 every time the page draws, and drawn with a link.
--
--  A LINKED figure is not floored at nought. If a plots batches net below
--  zero in the ledger -- more sold, culled or transferred out than went in --
--  the figure reads negative, and that is the batch report saying so rather
--  than this page inventing a number. The same goes for the DATE: a date with
--  "fromFieldDate" beside it was filled in from a verified field record, not
--  keyed in the office.
--
--  This prints which is which for every row of one plot, so a figure that
--  looks wrong can be traced to whoever actually put it there.
--
--  WHAT TO LOOK FOR
--
--    qty = (not keyed)   and   frozen = (not held)
--      -> the figure on screen is LINKED. Nothing about it is saved. If it
--         reads wrong, the batch report for that plot and those batches is
--         what is wrong -- not this row. Run CHECK_plot_ledger.sql on it.
--
--    qty = a number
--      -> somebody typed that. It overrides everything.
--
--    frozen = a number
--      -> the row was Checked and that is what it read at the time.
--
--    date source
--      -> "field" means a verified field record filled it; "by hand" means
--         the office typed it; "schedule" means it has never been answered.
-- =====================================================================
WITH r AS (
  SELECT t.ord,
         trim(COALESCE(t.rec ->> 'plot', ''))   AS plot,
         COALESCE(t.rec ->> 'jenis', '')        AS jenis,
         COALESCE(t.rec ->> 'racun', '')        AS racun,
         COALESCE(t.rec ->> 'tarikh', '-')      AS tarikh,
         t.rec ->> 'qty'                        AS qty,
         t.rec ->> 'qtyFrozen'                  AS frozen,
         COALESCE(t.rec ->> 'batch', '')        AS batch,
         t.rec ->> 'batchFrozen'                AS batch_frozen,
         COALESCE(t.rec ->> 'checked', '0')     AS checked,
         t.rec ->> '_fromFieldDate'             AS d_field,
         t.rec ->> '_tarikhByHand'              AS d_hand,
         t.rec ->> '_fromFieldQty'              AS q_field,
         t.rec ->> '_qtyByHand'                 AS q_hand,
         t.rec ->> '_src'                       AS src
    FROM nops_maint_records m,
         jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
           WITH ORDINALITY AS t(rec, ord)
   WHERE m.id = 1
)
SELECT trim(tarikh)                                  AS date,
       CASE WHEN d_hand IS NOT NULL THEN 'by hand'
            WHEN d_field IS NOT NULL THEN 'field'
            ELSE 'schedule' END                      AS date_source,
       racun                                         AS chemical,
       CASE WHEN position('Penyemburan' IN jenis) > 0 THEN 'P & D Spraying'
            WHEN position('rumput secara' IN jenis) > 0 THEN 'Interrow Spraying'
            WHEN position('Merumput' IN jenis) > 0 THEN 'Weeding'
            WHEN position('Membaja' IN jenis) > 0 THEN 'Manuring'
            ELSE COALESCE(NULLIF(jenis, ''), '(no job)') END AS job,
       COALESCE(qty, '(not keyed)')                  AS qty_keyed,
       COALESCE(frozen, '(not held)')                AS qty_held,
       CASE WHEN qty IS NOT NULL THEN 'KEYED'
            WHEN frozen IS NOT NULL THEN 'HELD'
            ELSE 'LINKED - nothing saved, summed live' END AS figure_is,
       CASE WHEN q_hand IS NOT NULL THEN 'by hand'
            WHEN q_field IS NOT NULL THEN 'field'
            ELSE '' END                              AS qty_source,
       CASE WHEN COALESCE(batch, '') <> '' THEN batch
            WHEN batch_frozen IS NOT NULL THEN batch_frozen || ' (held)'
            ELSE '(empty - every batch)' END         AS batch,
       CASE WHEN checked IN ('1', 'true') THEN 'yes' ELSE '' END AS checked,
       COALESCE(src, '(added by hand)')              AS from_schedule_slot
  FROM r
 -- PLOT: change this to the plot you are looking at.
 WHERE upper(replace(plot, ' ', '')) = 'N15'
 ORDER BY ord;
