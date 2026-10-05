-- =====================================================================
--  PUT UNN 2's SEPTEMBER DATES AND CAPACITIES BACK, FROM THE PRINTED SHEET
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: it writes absolute figures, so the second run leaves
--  the same thing and prints the same table.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHERE THE FIGURES COME FROM
--  Worker_Record_UNN2_Sep_2026.pdf -- the sheet the office printed before
--  the dates were overwritten. All four jobs, 193 rows, read off the paper's
--  Date and Capacity columns.
--
--  It is the right "before": the printed sheet still has the seven plot-and-
--  job groups whose dates do not climb (N7, N9, N18 and N19's P & D, N2's
--  weeding, N6's and N15's interrow), which is the order rows were drawn in
--  before the sorting changed. Nothing on that sheet has been re-ordered.
--
--  WHAT IT TOUCHES, AND WHAT IT DOES NOT
--    · the DATE and the CAPACITY of each row            <- restored
--    · the worker ticks                                 <- NOT TOUCHED.
--      They are in nops_maint_payroll, which this file never names.
--    · the chemical, the plot, the batch, Checked       <- not touched
--    · any nursery but UNN 2, any month but September   <- not touched
--
--  The restored figures are marked as KEYED BY HAND, so the field records
--  cannot write over them again.
--
--  HOW A ROW IS FOUND
--  By plot, job, and its position among that plot's rows for that job --
--  which is the order the sheet printed them in and the order they are saved
--  in. A plot-and-job whose number of rows no longer matches the sheet is
--  LEFT ALONE and named in the result, because lining up 5 dates against 4
--  rows would put a date on the wrong job.
--
--  WHAT TO LOOK FOR
--  The table at the end is every row this wrote, with its date and capacity,
--  and then any group it skipped. Good means the skipped list is empty and
--  the dates read like the paper. Run it again: same table, nothing changes.
-- =====================================================================
WITH paper (job, plot, seq, dt, cap) AS (VALUES
  ('pd', 'N1', 1, '2026-09-03', 5690),
  ('pd', 'N1', 2, '2026-09-03', 5690),
  ('pd', 'N1', 3, '2026-09-11', 5676),
  ('pd', 'N1', 4, '2026-09-19', 5676),
  ('pd', 'N1', 5, '2026-09-27', 5676),
  ('pd', 'N2', 1, '2026-09-03', 4962),
  ('pd', 'N2', 2, '2026-09-03', 4962),
  ('pd', 'N2', 3, '2026-09-11', 4962),
  ('pd', 'N2', 4, '2026-09-19', 4962),
  ('pd', 'N2', 5, '2026-09-27', 4962),
  ('pd', 'N3', 1, '2026-09-27', 6685),
  ('pd', 'N4', 1, '2026-09-03', 6149),
  ('pd', 'N4', 2, '2026-09-03', 6149),
  ('pd', 'N4', 3, '2026-09-11', 6149),
  ('pd', 'N4', 4, '2026-09-19', 6149),
  ('pd', 'N4', 5, '2026-09-27', 6149),
  ('pd', 'N5', 1, '2026-09-03', 4296),
  ('pd', 'N5', 2, '2026-09-03', 4296),
  ('pd', 'N5', 3, '2026-09-11', 4276),
  ('pd', 'N5', 4, '2026-09-19', 4276),
  ('pd', 'N5', 5, '2026-09-27', 4276),
  ('pd', 'N5-R', 1, '2026-09-11', 3),
  ('pd', 'N5-R', 2, '2026-09-28', 21),
  ('pd', 'N6', 1, '2026-09-03', 4983),
  ('pd', 'N6', 2, '2026-09-03', 4983),
  ('pd', 'N6', 3, '2026-09-11', 4983),
  ('pd', 'N6', 4, '2026-09-19', 4983),
  ('pd', 'N6', 5, '2026-09-27', 4983),
  ('pd', 'N7', 1, '2026-09-03', 7504),
  ('pd', 'N7', 2, '2026-09-03', 7504),
  ('pd', 'N7', 3, '2026-09-11', 7504),
  ('pd', 'N7', 4, '2026-09-28', 1551),
  ('pd', 'N7', 5, '2026-09-19', 6590),
  ('pd', 'N8', 1, '2026-09-03', 7602),
  ('pd', 'N8', 2, '2026-09-03', 7602),
  ('pd', 'N8', 3, '2026-09-11', 7602),
  ('pd', 'N8', 4, '2026-09-19', 7602),
  ('pd', 'N8', 5, '2026-09-27', 7602),
  ('pd', 'N9', 1, '2026-09-03', 5428),
  ('pd', 'N9', 2, '2026-09-03', 5428),
  ('pd', 'N9', 3, '2026-09-11', 5423),
  ('pd', 'N9', 4, '2026-09-27', 5423),
  ('pd', 'N9', 5, '2026-09-19', 5423),
  ('pd', 'N10', 1, '2026-09-03', 4696),
  ('pd', 'N10', 2, '2026-09-03', 4696),
  ('pd', 'N10', 3, '2026-09-11', 4696),
  ('pd', 'N10', 4, '2026-09-19', 4696),
  ('pd', 'N10', 5, '2026-09-27', 4696),
  ('pd', 'N11', 1, '2026-09-03', 4071),
  ('pd', 'N11', 2, '2026-09-03', 4071),
  ('pd', 'N11', 3, '2026-09-11', 4071),
  ('pd', 'N11', 4, '2026-09-19', 4071),
  ('pd', 'N11', 5, '2026-09-27', 4071),
  ('pd', 'N12', 1, '2026-09-03', 3695),
  ('pd', 'N12', 2, '2026-09-03', 3695),
  ('pd', 'N12', 3, '2026-09-11', 3695),
  ('pd', 'N12', 4, '2026-09-19', 3695),
  ('pd', 'N12', 5, '2026-09-27', 3695),
  ('pd', 'N14', 1, '2026-09-03', 5248),
  ('pd', 'N14', 2, '2026-09-03', 5248),
  ('pd', 'N14', 3, '2026-09-11', 5248),
  ('pd', 'N14', 4, '2026-09-19', 5248),
  ('pd', 'N14', 5, '2026-09-27', 5248),
  ('pd', 'N15', 1, '2026-09-03', 2999),
  ('pd', 'N15', 2, '2026-09-03', 2999),
  ('pd', 'N15', 3, '2026-09-11', 1548),
  ('pd', 'N15', 4, '2026-09-19', 657),
  ('pd', 'N16', 1, '2026-09-03', 5440),
  ('pd', 'N16', 2, '2026-09-03', 5440),
  ('pd', 'N16', 3, '2026-09-11', 5440),
  ('pd', 'N16', 4, '2026-09-19', 4631),
  ('pd', 'N16', 5, '2026-09-27', 4631),
  ('pd', 'N17', 1, '2026-09-03', 4816),
  ('pd', 'N17', 2, '2026-09-03', 4816),
  ('pd', 'N17', 3, '2026-09-11', 4816),
  ('pd', 'N17', 4, '2026-09-19', 4816),
  ('pd', 'N17', 5, '2026-09-27', 4816),
  ('pd', 'N18', 1, '2026-09-03', 2517),
  ('pd', 'N18', 2, '2026-09-03', 2517),
  ('pd', 'N18', 3, '2026-09-11', 2517),
  ('pd', 'N18', 4, '2026-09-27', 2517),
  ('pd', 'N18', 5, '2026-09-19', 2517),
  ('pd', 'N19', 1, '2026-09-03', 6564),
  ('pd', 'N19', 2, '2026-09-27', 6564),
  ('pd', 'N19', 3, '2026-09-11', 6564),
  ('pd', 'N19', 4, '2026-09-19', 6564),
  ('pd', 'N19', 5, '2026-09-19', 6564),
  ('pd', 'N20', 1, '2026-09-03', 2441),
  ('pd', 'N20', 2, '2026-09-03', 2441),
  ('pd', 'N20', 3, '2026-09-11', 2441),
  ('pd', 'N20', 4, '2026-09-18', 2441),
  ('pd', 'N20', 5, '2026-09-27', 2441),
  ('manuring', 'N1', 1, '2026-09-05', 5690),
  ('manuring', 'N2', 1, '2026-09-05', 4962),
  ('manuring', 'N2', 2, '2026-09-18', 4962),
  ('manuring', 'N4', 1, '2026-09-05', 6149),
  ('manuring', 'N5', 1, '2026-09-05', 4296),
  ('manuring', 'N6', 1, '2026-09-06', 4983),
  ('manuring', 'N7', 1, '2026-09-05', 7504),
  ('manuring', 'N7', 2, '2026-09-18', 6740),
  ('manuring', 'N8', 1, '2026-09-06', 7602),
  ('manuring', 'N9', 1, '2026-09-07', 5428),
  ('manuring', 'N10', 1, '2026-09-06', 4696),
  ('manuring', 'N11', 1, '2026-09-06', 4071),
  ('manuring', 'N11', 2, '2026-09-18', 4071),
  ('manuring', 'N12', 1, '2026-09-05', 3695),
  ('manuring', 'N12', 2, '2026-09-17', 3695),
  ('manuring', 'N14', 1, '2026-09-06', 5248),
  ('manuring', 'N14', 2, '2026-09-18', 5248),
  ('manuring', 'N15', 1, '2026-09-06', 2346),
  ('manuring', 'N15', 2, '2026-09-17', 657),
  ('manuring', 'N16', 1, '2026-09-06', 5440),
  ('manuring', 'N16', 2, '2026-09-18', 4631),
  ('manuring', 'N17', 1, '2026-09-06', 4816),
  ('manuring', 'N17', 2, '2026-09-18', 4816),
  ('manuring', 'N18', 1, '2026-09-06', 2517),
  ('manuring', 'N18', 2, '2026-09-17', 2517),
  ('manuring', 'N19', 1, '2026-09-06', 6564),
  ('manuring', 'N19', 2, '2026-09-18', 6564),
  ('manuring', 'N20', 1, '2026-09-05', 2441),
  ('manuring', 'N20', 2, '2026-09-17', 2441),
  ('weeding', 'N1', 1, '2026-09-04', 5690),
  ('weeding', 'N1', 2, '2026-09-16', 5676),
  ('weeding', 'N2', 1, '2026-09-16', 4962),
  ('weeding', 'N2', 2, '2026-09-04', 4962),
  ('weeding', 'N4', 1, '2026-09-04', 6149),
  ('weeding', 'N4', 2, '2026-09-17', 6149),
  ('weeding', 'N5', 1, '2026-09-05', 4296),
  ('weeding', 'N5', 2, '2026-09-16', 4276),
  ('weeding', 'N6', 1, '2026-09-04', 4983),
  ('weeding', 'N6', 2, '2026-09-16', 4983),
  ('weeding', 'N7', 1, '2026-09-05', 7504),
  ('weeding', 'N7', 2, '2026-09-17', 7404),
  ('weeding', 'N8', 1, '2026-09-04', 7602),
  ('weeding', 'N8', 2, '2026-09-16', 7602),
  ('weeding', 'N9', 1, '2026-09-07', 5428),
  ('weeding', 'N9', 2, '2026-09-16', 5423),
  ('weeding', 'N10', 1, '2026-09-05', 4696),
  ('weeding', 'N10', 2, '2026-09-16', 4696),
  ('weeding', 'N11', 1, '2026-09-05', 4071),
  ('weeding', 'N11', 2, '2026-09-16', 4071),
  ('weeding', 'N12', 1, '2026-09-05', 3695),
  ('weeding', 'N12', 2, '2026-09-16', 3695),
  ('weeding', 'N14', 1, '2026-09-05', 5248),
  ('weeding', 'N14', 2, '2026-09-16', 5248),
  ('weeding', 'N15', 1, '2026-09-05', 2346),
  ('weeding', 'N15', 2, '2026-09-17', 657),
  ('weeding', 'N16', 1, '2026-09-06', 5440),
  ('weeding', 'N16', 2, '2026-09-17', 4631),
  ('weeding', 'N17', 1, '2026-09-04', 4816),
  ('weeding', 'N17', 2, '2026-09-16', 4816),
  ('weeding', 'N18', 1, '2026-09-04', 2517),
  ('weeding', 'N18', 2, '2026-09-16', 2517),
  ('weeding', 'N19', 1, '2026-09-04', 6564),
  ('weeding', 'N19', 2, '2026-09-16', 6564),
  ('weeding', 'N20', 1, '2026-09-04', 2441),
  ('weeding', 'N20', 2, '2026-09-16', 2441),
  ('interrow', 'N1', 1, '2026-09-10', 5690),
  ('interrow', 'N1', 2, '2026-09-25', 5690),
  ('interrow', 'N2', 1, '2026-09-10', 4985),
  ('interrow', 'N2', 2, '2026-09-25', 4985),
  ('interrow', 'N3', 1, '2026-09-24', 6685),
  ('interrow', 'N4', 1, '2026-09-10', 6149),
  ('interrow', 'N4', 2, '2026-09-26', 6149),
  ('interrow', 'N5', 1, '2026-09-10', 4296),
  ('interrow', 'N5', 2, '2026-09-26', 4296),
  ('interrow', 'N6', 1, '2026-09-10', 4983),
  ('interrow', 'N6', 2, '2026-08-30', 4983),
  ('interrow', 'N7', 1, '2026-09-09', 7518),
  ('interrow', 'N8', 1, '2026-09-10', 7602),
  ('interrow', 'N8', 2, '2026-09-23', 7602),
  ('interrow', 'N9', 1, '2026-09-10', 5428),
  ('interrow', 'N9', 2, '2026-09-23', 5428),
  ('interrow', 'N10', 1, '2026-09-09', 4696),
  ('interrow', 'N10', 2, '2026-09-25', 4696),
  ('interrow', 'N11', 1, '2026-09-10', 4072),
  ('interrow', 'N11', 2, '2026-09-23', 4072),
  ('interrow', 'N12', 1, '2026-09-10', 3708),
  ('interrow', 'N12', 2, '2026-09-25', 3708),
  ('interrow', 'N14', 1, '2026-09-10', 5271),
  ('interrow', 'N14', 2, '2026-09-24', 5271),
  ('interrow', 'N15', 1, '2026-09-24', 549),
  ('interrow', 'N15', 2, '2026-09-10', 1630),
  ('interrow', 'N16', 1, '2026-09-09', 5445),
  ('interrow', 'N16', 2, '2026-09-23', 4636),
  ('interrow', 'N17', 1, '2026-09-10', 4834),
  ('interrow', 'N17', 2, '2026-09-26', 4834),
  ('interrow', 'N18', 1, '2026-09-09', 2534),
  ('interrow', 'N18', 2, '2026-09-23', 2534),
  ('interrow', 'N19', 1, '2026-09-10', 6590),
  ('interrow', 'N19', 2, '2026-09-24', 6590),
  ('interrow', 'N20', 1, '2026-09-10', 2443),
  ('interrow', 'N20', 2, '2026-09-25', 2443)
),
src AS (
  SELECT t.ord, t.rec
    FROM nops_maint_records m,
         jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
           WITH ORDINALITY AS t(rec, ord)
   WHERE m.id = 1
),
k AS (
  SELECT ord, rec,
         upper(replace(trim(COALESCE(rec ->> 'plot', '')), ' ', '')) AS plot,
         CASE WHEN position('Penyemburan' IN COALESCE(rec ->> 'jenis', '')) > 0 THEN 'pd'
              WHEN position('rumput secara' IN COALESCE(rec ->> 'jenis', '')) > 0 THEN 'interrow'
              WHEN position('Merumput' IN COALESCE(rec ->> 'jenis', '')) > 0 THEN 'weeding'
              WHEN position('Membaja' IN COALESCE(rec ->> 'jenis', '')) > 0 THEN 'manuring'
              ELSE '(other)' END AS job
    FROM src
),
n AS (
  SELECT ord, rec, plot, job,
         row_number() OVER (PARTITION BY plot, job ORDER BY ord) AS seq,
         count(*)     OVER (PARTITION BY plot, job)              AS have
    FROM k
),
sheet AS (
  SELECT job, plot, count(*) AS want FROM paper GROUP BY job, plot
),
ok AS (
  SELECT s.job, s.plot
    FROM sheet s
    JOIN (SELECT job, plot, max(have) AS have FROM n GROUP BY job, plot) h
      ON h.job = s.job AND h.plot = s.plot
   WHERE h.have = s.want
),
j AS (
  SELECT n.ord,
         CASE WHEN p.dt IS NULL THEN n.rec
              ELSE (n.rec
                     || jsonb_build_object('tarikh', p.dt,
                                           'qty', p.cap,
                                           '_tarikhByHand', 1,
                                           '_qtyByHand', 1))
                   - '_fromFieldDate' - '_fromFieldQty' - '_fieldDates'
         END AS rec
    FROM n
    LEFT JOIN ok ON ok.job = n.job AND ok.plot = n.plot
    LEFT JOIN paper p ON ok.plot IS NOT NULL
                     AND p.job = n.job AND p.plot = n.plot AND p.seq = n.seq
)
UPDATE nops_maint_records
   SET records = (SELECT jsonb_agg(rec ORDER BY ord) FROM j),
       updated_at = now()
 WHERE id = 1;

WITH paper (job, plot, seq, dt, cap) AS (VALUES
  ('pd', 'N1', 1, '2026-09-03', 5690),
  ('pd', 'N1', 2, '2026-09-03', 5690),
  ('pd', 'N1', 3, '2026-09-11', 5676),
  ('pd', 'N1', 4, '2026-09-19', 5676),
  ('pd', 'N1', 5, '2026-09-27', 5676),
  ('pd', 'N2', 1, '2026-09-03', 4962),
  ('pd', 'N2', 2, '2026-09-03', 4962),
  ('pd', 'N2', 3, '2026-09-11', 4962),
  ('pd', 'N2', 4, '2026-09-19', 4962),
  ('pd', 'N2', 5, '2026-09-27', 4962),
  ('pd', 'N3', 1, '2026-09-27', 6685),
  ('pd', 'N4', 1, '2026-09-03', 6149),
  ('pd', 'N4', 2, '2026-09-03', 6149),
  ('pd', 'N4', 3, '2026-09-11', 6149),
  ('pd', 'N4', 4, '2026-09-19', 6149),
  ('pd', 'N4', 5, '2026-09-27', 6149),
  ('pd', 'N5', 1, '2026-09-03', 4296),
  ('pd', 'N5', 2, '2026-09-03', 4296),
  ('pd', 'N5', 3, '2026-09-11', 4276),
  ('pd', 'N5', 4, '2026-09-19', 4276),
  ('pd', 'N5', 5, '2026-09-27', 4276),
  ('pd', 'N5-R', 1, '2026-09-11', 3),
  ('pd', 'N5-R', 2, '2026-09-28', 21),
  ('pd', 'N6', 1, '2026-09-03', 4983),
  ('pd', 'N6', 2, '2026-09-03', 4983),
  ('pd', 'N6', 3, '2026-09-11', 4983),
  ('pd', 'N6', 4, '2026-09-19', 4983),
  ('pd', 'N6', 5, '2026-09-27', 4983),
  ('pd', 'N7', 1, '2026-09-03', 7504),
  ('pd', 'N7', 2, '2026-09-03', 7504),
  ('pd', 'N7', 3, '2026-09-11', 7504),
  ('pd', 'N7', 4, '2026-09-28', 1551),
  ('pd', 'N7', 5, '2026-09-19', 6590),
  ('pd', 'N8', 1, '2026-09-03', 7602),
  ('pd', 'N8', 2, '2026-09-03', 7602),
  ('pd', 'N8', 3, '2026-09-11', 7602),
  ('pd', 'N8', 4, '2026-09-19', 7602),
  ('pd', 'N8', 5, '2026-09-27', 7602),
  ('pd', 'N9', 1, '2026-09-03', 5428),
  ('pd', 'N9', 2, '2026-09-03', 5428),
  ('pd', 'N9', 3, '2026-09-11', 5423),
  ('pd', 'N9', 4, '2026-09-27', 5423),
  ('pd', 'N9', 5, '2026-09-19', 5423),
  ('pd', 'N10', 1, '2026-09-03', 4696),
  ('pd', 'N10', 2, '2026-09-03', 4696),
  ('pd', 'N10', 3, '2026-09-11', 4696),
  ('pd', 'N10', 4, '2026-09-19', 4696),
  ('pd', 'N10', 5, '2026-09-27', 4696),
  ('pd', 'N11', 1, '2026-09-03', 4071),
  ('pd', 'N11', 2, '2026-09-03', 4071),
  ('pd', 'N11', 3, '2026-09-11', 4071),
  ('pd', 'N11', 4, '2026-09-19', 4071),
  ('pd', 'N11', 5, '2026-09-27', 4071),
  ('pd', 'N12', 1, '2026-09-03', 3695),
  ('pd', 'N12', 2, '2026-09-03', 3695),
  ('pd', 'N12', 3, '2026-09-11', 3695),
  ('pd', 'N12', 4, '2026-09-19', 3695),
  ('pd', 'N12', 5, '2026-09-27', 3695),
  ('pd', 'N14', 1, '2026-09-03', 5248),
  ('pd', 'N14', 2, '2026-09-03', 5248),
  ('pd', 'N14', 3, '2026-09-11', 5248),
  ('pd', 'N14', 4, '2026-09-19', 5248),
  ('pd', 'N14', 5, '2026-09-27', 5248),
  ('pd', 'N15', 1, '2026-09-03', 2999),
  ('pd', 'N15', 2, '2026-09-03', 2999),
  ('pd', 'N15', 3, '2026-09-11', 1548),
  ('pd', 'N15', 4, '2026-09-19', 657),
  ('pd', 'N16', 1, '2026-09-03', 5440),
  ('pd', 'N16', 2, '2026-09-03', 5440),
  ('pd', 'N16', 3, '2026-09-11', 5440),
  ('pd', 'N16', 4, '2026-09-19', 4631),
  ('pd', 'N16', 5, '2026-09-27', 4631),
  ('pd', 'N17', 1, '2026-09-03', 4816),
  ('pd', 'N17', 2, '2026-09-03', 4816),
  ('pd', 'N17', 3, '2026-09-11', 4816),
  ('pd', 'N17', 4, '2026-09-19', 4816),
  ('pd', 'N17', 5, '2026-09-27', 4816),
  ('pd', 'N18', 1, '2026-09-03', 2517),
  ('pd', 'N18', 2, '2026-09-03', 2517),
  ('pd', 'N18', 3, '2026-09-11', 2517),
  ('pd', 'N18', 4, '2026-09-27', 2517),
  ('pd', 'N18', 5, '2026-09-19', 2517),
  ('pd', 'N19', 1, '2026-09-03', 6564),
  ('pd', 'N19', 2, '2026-09-27', 6564),
  ('pd', 'N19', 3, '2026-09-11', 6564),
  ('pd', 'N19', 4, '2026-09-19', 6564),
  ('pd', 'N19', 5, '2026-09-19', 6564),
  ('pd', 'N20', 1, '2026-09-03', 2441),
  ('pd', 'N20', 2, '2026-09-03', 2441),
  ('pd', 'N20', 3, '2026-09-11', 2441),
  ('pd', 'N20', 4, '2026-09-18', 2441),
  ('pd', 'N20', 5, '2026-09-27', 2441),
  ('manuring', 'N1', 1, '2026-09-05', 5690),
  ('manuring', 'N2', 1, '2026-09-05', 4962),
  ('manuring', 'N2', 2, '2026-09-18', 4962),
  ('manuring', 'N4', 1, '2026-09-05', 6149),
  ('manuring', 'N5', 1, '2026-09-05', 4296),
  ('manuring', 'N6', 1, '2026-09-06', 4983),
  ('manuring', 'N7', 1, '2026-09-05', 7504),
  ('manuring', 'N7', 2, '2026-09-18', 6740),
  ('manuring', 'N8', 1, '2026-09-06', 7602),
  ('manuring', 'N9', 1, '2026-09-07', 5428),
  ('manuring', 'N10', 1, '2026-09-06', 4696),
  ('manuring', 'N11', 1, '2026-09-06', 4071),
  ('manuring', 'N11', 2, '2026-09-18', 4071),
  ('manuring', 'N12', 1, '2026-09-05', 3695),
  ('manuring', 'N12', 2, '2026-09-17', 3695),
  ('manuring', 'N14', 1, '2026-09-06', 5248),
  ('manuring', 'N14', 2, '2026-09-18', 5248),
  ('manuring', 'N15', 1, '2026-09-06', 2346),
  ('manuring', 'N15', 2, '2026-09-17', 657),
  ('manuring', 'N16', 1, '2026-09-06', 5440),
  ('manuring', 'N16', 2, '2026-09-18', 4631),
  ('manuring', 'N17', 1, '2026-09-06', 4816),
  ('manuring', 'N17', 2, '2026-09-18', 4816),
  ('manuring', 'N18', 1, '2026-09-06', 2517),
  ('manuring', 'N18', 2, '2026-09-17', 2517),
  ('manuring', 'N19', 1, '2026-09-06', 6564),
  ('manuring', 'N19', 2, '2026-09-18', 6564),
  ('manuring', 'N20', 1, '2026-09-05', 2441),
  ('manuring', 'N20', 2, '2026-09-17', 2441),
  ('weeding', 'N1', 1, '2026-09-04', 5690),
  ('weeding', 'N1', 2, '2026-09-16', 5676),
  ('weeding', 'N2', 1, '2026-09-16', 4962),
  ('weeding', 'N2', 2, '2026-09-04', 4962),
  ('weeding', 'N4', 1, '2026-09-04', 6149),
  ('weeding', 'N4', 2, '2026-09-17', 6149),
  ('weeding', 'N5', 1, '2026-09-05', 4296),
  ('weeding', 'N5', 2, '2026-09-16', 4276),
  ('weeding', 'N6', 1, '2026-09-04', 4983),
  ('weeding', 'N6', 2, '2026-09-16', 4983),
  ('weeding', 'N7', 1, '2026-09-05', 7504),
  ('weeding', 'N7', 2, '2026-09-17', 7404),
  ('weeding', 'N8', 1, '2026-09-04', 7602),
  ('weeding', 'N8', 2, '2026-09-16', 7602),
  ('weeding', 'N9', 1, '2026-09-07', 5428),
  ('weeding', 'N9', 2, '2026-09-16', 5423),
  ('weeding', 'N10', 1, '2026-09-05', 4696),
  ('weeding', 'N10', 2, '2026-09-16', 4696),
  ('weeding', 'N11', 1, '2026-09-05', 4071),
  ('weeding', 'N11', 2, '2026-09-16', 4071),
  ('weeding', 'N12', 1, '2026-09-05', 3695),
  ('weeding', 'N12', 2, '2026-09-16', 3695),
  ('weeding', 'N14', 1, '2026-09-05', 5248),
  ('weeding', 'N14', 2, '2026-09-16', 5248),
  ('weeding', 'N15', 1, '2026-09-05', 2346),
  ('weeding', 'N15', 2, '2026-09-17', 657),
  ('weeding', 'N16', 1, '2026-09-06', 5440),
  ('weeding', 'N16', 2, '2026-09-17', 4631),
  ('weeding', 'N17', 1, '2026-09-04', 4816),
  ('weeding', 'N17', 2, '2026-09-16', 4816),
  ('weeding', 'N18', 1, '2026-09-04', 2517),
  ('weeding', 'N18', 2, '2026-09-16', 2517),
  ('weeding', 'N19', 1, '2026-09-04', 6564),
  ('weeding', 'N19', 2, '2026-09-16', 6564),
  ('weeding', 'N20', 1, '2026-09-04', 2441),
  ('weeding', 'N20', 2, '2026-09-16', 2441),
  ('interrow', 'N1', 1, '2026-09-10', 5690),
  ('interrow', 'N1', 2, '2026-09-25', 5690),
  ('interrow', 'N2', 1, '2026-09-10', 4985),
  ('interrow', 'N2', 2, '2026-09-25', 4985),
  ('interrow', 'N3', 1, '2026-09-24', 6685),
  ('interrow', 'N4', 1, '2026-09-10', 6149),
  ('interrow', 'N4', 2, '2026-09-26', 6149),
  ('interrow', 'N5', 1, '2026-09-10', 4296),
  ('interrow', 'N5', 2, '2026-09-26', 4296),
  ('interrow', 'N6', 1, '2026-09-10', 4983),
  ('interrow', 'N6', 2, '2026-08-30', 4983),
  ('interrow', 'N7', 1, '2026-09-09', 7518),
  ('interrow', 'N8', 1, '2026-09-10', 7602),
  ('interrow', 'N8', 2, '2026-09-23', 7602),
  ('interrow', 'N9', 1, '2026-09-10', 5428),
  ('interrow', 'N9', 2, '2026-09-23', 5428),
  ('interrow', 'N10', 1, '2026-09-09', 4696),
  ('interrow', 'N10', 2, '2026-09-25', 4696),
  ('interrow', 'N11', 1, '2026-09-10', 4072),
  ('interrow', 'N11', 2, '2026-09-23', 4072),
  ('interrow', 'N12', 1, '2026-09-10', 3708),
  ('interrow', 'N12', 2, '2026-09-25', 3708),
  ('interrow', 'N14', 1, '2026-09-10', 5271),
  ('interrow', 'N14', 2, '2026-09-24', 5271),
  ('interrow', 'N15', 1, '2026-09-24', 549),
  ('interrow', 'N15', 2, '2026-09-10', 1630),
  ('interrow', 'N16', 1, '2026-09-09', 5445),
  ('interrow', 'N16', 2, '2026-09-23', 4636),
  ('interrow', 'N17', 1, '2026-09-10', 4834),
  ('interrow', 'N17', 2, '2026-09-26', 4834),
  ('interrow', 'N18', 1, '2026-09-09', 2534),
  ('interrow', 'N18', 2, '2026-09-23', 2534),
  ('interrow', 'N19', 1, '2026-09-10', 6590),
  ('interrow', 'N19', 2, '2026-09-24', 6590),
  ('interrow', 'N20', 1, '2026-09-10', 2443),
  ('interrow', 'N20', 2, '2026-09-25', 2443)
),
src AS (
  SELECT t.ord, t.rec
    FROM nops_maint_records m,
         jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
           WITH ORDINALITY AS t(rec, ord)
   WHERE m.id = 1
),
k AS (
  SELECT ord, rec,
         upper(replace(trim(COALESCE(rec ->> 'plot', '')), ' ', '')) AS plot,
         CASE WHEN position('Penyemburan' IN COALESCE(rec ->> 'jenis', '')) > 0 THEN 'pd'
              WHEN position('rumput secara' IN COALESCE(rec ->> 'jenis', '')) > 0 THEN 'interrow'
              WHEN position('Merumput' IN COALESCE(rec ->> 'jenis', '')) > 0 THEN 'weeding'
              WHEN position('Membaja' IN COALESCE(rec ->> 'jenis', '')) > 0 THEN 'manuring'
              ELSE '(other)' END AS job
    FROM src
),
n AS (
  SELECT ord, rec, plot, job,
         row_number() OVER (PARTITION BY plot, job ORDER BY ord) AS seq,
         count(*)     OVER (PARTITION BY plot, job)              AS have
    FROM k
),
sheet AS (SELECT job, plot, count(*) AS want FROM paper GROUP BY job, plot),
hav   AS (SELECT job, plot, max(have) AS have FROM n GROUP BY job, plot)
SELECT * FROM (
  SELECT 1 AS ord, 'restored' AS what, n.plot, n.job,
         (n.rec ->> 'tarikh') AS date,
         COALESCE(n.rec ->> 'qty', '(none)') AS capacity
    FROM n JOIN sheet s ON s.job = n.job AND s.plot = n.plot
           JOIN hav h   ON h.job = n.job AND h.plot = n.plot AND h.have = s.want
  UNION ALL
  SELECT 2, 'SKIPPED - row count differs', s.plot, s.job,
         'sheet has ' || s.want::text, 'the list has ' || COALESCE(h.have, 0)::text
    FROM sheet s LEFT JOIN hav h ON h.job = s.job AND h.plot = s.plot
   WHERE COALESCE(h.have, 0) <> s.want
) y
ORDER BY ord, job, length(plot), plot, date;
