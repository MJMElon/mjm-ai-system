-- =====================================================================
--  WHICH SAVED PLOT CAPACITIES NOBODY ACTUALLY CHOSE
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  Setting -> Plot Capacity used to write EVERY plot of EVERY nursery on
--  every Save, and its boxes are filled from a figure hardcoded in the page
--  for any plot nothing is saved for. So one Save on one plot wrote the
--  built-in figures for all the others as well, and they have looked like
--  decisions somebody made ever since. The page now writes only the box that
--  changed, but it cannot tell which of the rows already saved were chosen.
--
--  This can: a saved capacity that is EXACTLY the built-in figure was almost
--  certainly never keyed by anyone.
--
--  WHAT TO LOOK FOR
--
--    ord 1, 'summary'
--      -> how many capacities are saved, and how many of them match the
--         built-in figure to the digit.
--
--    ord 2, 'same as the built-in figure'
--      -> nobody chose these. The figure is whatever was hardcoded when the
--         page was written, which for most plots is years old. Go through them
--         in Setting -> Plot Capacity and key the real number. They are not
--         wrong to leave as they are -- the dosages have been worked out from
--         these figures all along -- but they are not measurements either.
--
--    ord 3, 'keyed by somebody'
--      -> differs from the built-in figure, so a person typed it. These are
--         the ones to trust. If one of them is NOT what you remember typing,
--         say so and say which plot: that is a different fault from this one.
--
--    ord 4, 'no built-in figure'
--      -> a plot the page never had a default for, which is every transfer
--         plot (-R) and anything added since. Saved means keyed.
-- =====================================================================
WITH d (nkey, plot, qty) AS (
  VALUES
    ('BNN','B1',2352),  ('BNN','B2',3152),  ('BNN','B3',5655),
    ('BNN','B4',2933),  ('BNN','B5',6924),  ('BNN','B6',7408),
    ('BNN','B7',3018),  ('BNN','B8',5302),  ('BNN','B9',2716),
    ('BNN','B10',7146), ('BNN','B11',12121),('BNN','B12',2398),
    ('BNN','B13',3662), ('BNN','B14',3536),
    ('UNN1','U1',4647), ('UNN1','U2',5088), ('UNN1','U3',6429),
    ('UNN1','U4',4374), ('UNN1','U5',3378), ('UNN1','U6',8062),
    ('UNN1','U7',6984), ('UNN1','U8',6689), ('UNN1','U9',3970),
    ('UNN1','U10',3808),('UNN1','U11',6159),('UNN1','U12',7503),
    ('UNN1','U13',5931),('UNN1','U14',5857),('UNN1','U15',5601),
    ('UNN1','U16',2902),('UNN1','U17',6885),('UNN1','U18',7794),
    ('UNN2','N1',5844), ('UNN2','N2',5634), ('UNN2','N3',6492),
    ('UNN2','N4',6066), ('UNN2','N5',4764), ('UNN2','N6',4876),
    ('UNN2','N7',7518), ('UNN2','N8',7409), ('UNN2','N9',5692),
    ('UNN2','N10',5324),('UNN2','N11',4940),('UNN2','N12',3855),
    ('UNN2','N13',1680),('UNN2','N14',5271),('UNN2','N15',3860),
    ('UNN2','N16',5767),('UNN2','N17',4834),('UNN2','N18',2897),
    ('UNN2','N19',6590),('UNN2','N20',2491)
),
-- The schedules are keyed UNN1, Seedling Stock writes "UNN 1". Letters and
-- digits only, upper case, which is the rule everything else uses to cross
-- that boundary.
s AS (
  SELECT trim(nursery) AS nursery,
         replace(replace(replace(upper(trim(nursery)), ' ', ''), '-', ''), '_', '') AS nkey,
         trim(plot) AS plot,
         qty
    FROM nops_maint_plot_qty
),
j AS (
  SELECT s.nursery, s.plot, s.qty, d.qty AS built_in
    FROM s LEFT JOIN d ON d.nkey = s.nkey AND d.plot = s.plot
)
SELECT * FROM (
  SELECT 1 AS ord,
         'summary'                                      AS what,
         '(all nurseries)'                              AS nursery,
         ''                                             AS plot,
         (SELECT count(*)::text FROM j) || ' saved, '
           || (SELECT count(*)::text FROM j WHERE built_in IS NOT NULL AND qty = built_in)
           || ' the same as the built-in figure'         AS detail

  UNION ALL

  SELECT 2, 'same as the built-in figure', nursery, plot,
         'capacity ' || COALESCE(qty::text, '(none)') || ' - nobody chose this'
    FROM j WHERE built_in IS NOT NULL AND qty = built_in

  UNION ALL

  SELECT 3, 'keyed by somebody', nursery, plot,
         'capacity ' || COALESCE(qty::text, '(none)')
           || ' - the built-in figure is ' || built_in::text
    FROM j WHERE built_in IS NOT NULL AND (qty IS DISTINCT FROM built_in)

  UNION ALL

  SELECT 4, 'no built-in figure', nursery, plot,
         'capacity ' || COALESCE(qty::text, '(none)') || ' - saved means keyed'
    FROM j WHERE built_in IS NULL
) y
ORDER BY ord, nursery, length(plot), plot;
