-- =====================================================================
--  ONE PLOTS DATES, FROM BOTH SIDES
--
--  Change the plot on the TWO lines marked PLOT below, paste the WHOLE file
--  into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  A date on the Work Record gets there one of three ways:
--
--    BY HAND    the office typed it in the Edit box. It is marked, and the
--               sync is not allowed to write over a marked cell.
--    FIELD      a verified field record filled it. It stays live: if the
--               field record changes, or pairs to a different row, the date
--               follows it.
--    SCHEDULE   nobody has answered it yet, so it reads "-".
--
--  If a date was typed and has gone back to what the field says, then either
--  the mark was never put on -- the date was changed somewhere other than the
--  Edit box -- or something took it off. This says which, by printing the
--  mark itself beside the date.
--
--  The second half is what the FIELD actually holds for that plot, so the two
--  numbers can be read side by side: the office row saying 19, and the field
--  record that put the 19 there.
--
--  WHAT TO LOOK FOR
--
--    ord 1, office row
--      -> source = BY HAND  : the office typed it and it is protected. If
--         this says 19 and you typed 27, tell me -- that is a real fault and
--         a different one.
--      -> source = FIELD    : the offices 27 never reached this row as a
--         typed date. Either it was changed somewhere other than the Edit
--         box, or it was typed and saved while the row was being rebuilt.
--      -> source = SCHEDULE : never answered.
--
--    ord 2, field record
--      -> every verified record the phone holds for that plot, with the day
--         the worker recorded and the round it was filed under. The office
--         row takes the EARLIEST day of the group it pairs with.
-- =====================================================================
WITH o AS (
  SELECT t.ord,
         trim(COALESCE(t.rec ->> 'plot', ''))   AS plot,
         COALESCE(t.rec ->> 'jenis', '')        AS jenis,
         COALESCE(t.rec ->> 'racun', '')        AS racun,
         trim(COALESCE(t.rec ->> 'tarikh', '-')) AS tarikh,
         t.rec ->> '_tarikhByHand'              AS d_hand,
         t.rec ->> '_fromFieldDate'             AS d_field,
         t.rec ->> '_src'                       AS src
    FROM nops_maint_records m,
         jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
           WITH ORDINALITY AS t(rec, ord)
   WHERE m.id = 1
)
SELECT * FROM (
  SELECT 1 AS ord,
         'office row'                              AS what,
         tarikh                                    AS dated,
         CASE WHEN d_hand IS NOT NULL THEN 'BY HAND'
              WHEN d_field IS NOT NULL THEN 'FIELD'
              ELSE 'SCHEDULE' END                  AS source,
         racun                                     AS detail_1,
         CASE WHEN position('Penyemburan' IN jenis) > 0 THEN 'P & D'
              WHEN position('rumput secara' IN jenis) > 0 THEN 'Interrow'
              WHEN position('Merumput' IN jenis) > 0 THEN 'Weeding'
              WHEN position('Membaja' IN jenis) > 0 THEN 'Manuring'
              ELSE jenis END                       AS detail_2,
         COALESCE(src, '(added by hand)')          AS detail_3
    FROM o
   -- PLOT (1 of 2)
   WHERE upper(replace(plot, ' ', '')) = 'N15'

  UNION ALL

  SELECT 2, 'field record',
         COALESCE(work_date::text, '(no date)'),
         CASE WHEN verified_at IS NULL THEN 'not verified' ELSE 'verified' END,
         COALESCE(chemical, COALESCE(jenis, work_type)),
         'round ' || COALESCE(week_no::text, '?'),
         COALESCE(NULLIF(trim(COALESCE(worked_by, '')), ''),
                  COALESCE(reported_by, '(nobody)'))
    FROM nops_maint_field_records
   -- PLOT (2 of 2)
   WHERE upper(replace(COALESCE(plot_name, ''), ' ', '')) = 'N15'
) y
ORDER BY ord, dated, detail_1;
