-- ════════════════════════════════════════════════════════════════════════
-- PUT SEPTEMBER 2026 BACK THE WAY THE SIGNED SHEET HAS IT
-- shared/RUN_ME_restore_sep_2026_from_sheet.sql
--
-- Paste the WHOLE file into the Supabase SQL Editor and press Run.
-- ONE statement. Safe to run twice: the second run changes 0 rows.
-- No regular expressions and no backslashes.
--
-- WHERE THE FIGURES COME FROM
--
-- The Worker Record printout verified by Joyce Yii on 05 Oct 2026, 03:10 pm
-- -- all three nurseries, all four jobs, 539 rows. Every section of it was
-- reconciled against its own per-worker footer AND against the Salary Claim
-- form on the front of the same printout before a line of this was written:
--
--   BNN   P & D 292,919   Manuring  78,669   Weeding 118,492   Interrow 174,571
--   UNN 1 P & D 476,958   Manuring 122,161   Weeding 183,996   Interrow 184,885
--   UNN 2 P & D 436,820   Manuring 134,790   Weeding 174,259   Interrow 173,025
--
-- WHAT IT SETS, per row: the date, the capacity as the FROZEN figure, and
-- Checked. It also rewrites the worker ticks for the month from the sheet.
--
-- WHY THE FROZEN FIGURE. A ticked row is meant to stop being a live sum --
-- that is what Checked does -- so the sheets capacity is written to
-- qtyFrozen and any hand-keyed qty that disagreed with the sheet is cleared,
-- because a hand-keyed figure beats the frozen one and would hide it.
--
-- HOW A ROW IS MATCHED
--
-- Within one job and one plot, the Nth row of the sheet is the Nth row of
-- September in day order -- which is the order the Worker Record itself
-- prints, so the two lists are the same list.
--
-- AND IT REFUSES TO GUESS. If a plot has a different NUMBER of rows on the
-- sheet than in the month, the Nth of one is not the Nth of the other, so
-- that plot is LEFT ALONE and named in the report. Those are the plots that
-- lost a row to another month -- fix those with
-- shared/RUN_ME_put_dragged_rows_back.sql first, then run this again.
--
-- WHAT IT DOES NOT TOUCH: any month but Sep 2026, any plot the sheet does
-- not name, the batch, the remark, the chemical, and any plot whose counts
-- disagree.
--
-- WHAT TO LOOK FOR
--   1 CHANGED  how many rows were actually different, and in what way
--   2 SKIPPED  plots left alone because the counts disagree -- should be none
--   3 TOTAL    what each nursery and job should now add up to
--   Then RUN IT AGAIN: 1 CHANGED must read 0 and 2 SKIPPED must stay empty.
-- ════════════════════════════════════════════════════════════════════════

WITH sheet(nursery, wt, plot, seq, tarikh, qty, workers) AS (VALUES
('BNN','pd','B1',1,'2026-09-04',2353,'Andi Rosmini'),
  ('BNN','pd','B1',2,'2026-09-04',2353,'Andi Rosmini'),
  ('BNN','pd','B1',3,'2026-09-13',2353,'Andi Rosmini'),
  ('BNN','pd','B1',4,'2026-09-18',2353,'Andi Rosmini'),
  ('BNN','pd','B1',5,'2026-09-26',2353,'Andi Rosmini'),
  ('BNN','pd','B2',1,'2026-09-04',3077,'Andi Rosmini'),
  ('BNN','pd','B2',2,'2026-09-04',3077,'Andi Rosmini'),
  ('BNN','pd','B2',3,'2026-09-13',3077,'Andi Rosmini'),
  ('BNN','pd','B2',4,'2026-09-18',3077,'Andi Rosmini'),
  ('BNN','pd','B2',5,'2026-09-27',3077,'Andi Rosmini'),
  ('BNN','pd','B3',1,'2026-09-04',5170,'Andi Rosmini'),
  ('BNN','pd','B3',2,'2026-09-04',5170,'Andi Rosmini'),
  ('BNN','pd','B3',3,'2026-09-13',5196,'Andi Rosmini'),
  ('BNN','pd','B3',4,'2026-09-18',5196,'Andi Rosmini'),
  ('BNN','pd','B3',5,'2026-09-26',5196,'Andi Rosmini'),
  ('BNN','pd','B4',1,'2026-09-04',862,'Muhamad Irsan'),
  ('BNN','pd','B4',2,'2026-09-04',862,'Muhamad Irsan'),
  ('BNN','pd','B4',3,'2026-09-13',625,'Muhamad Irsan'),
  ('BNN','pd','B4',4,'2026-09-18',625,'Muhamad Irsan'),
  ('BNN','pd','B4',5,'2026-09-26',3030,'Muhamad Irsan'),
  ('BNN','pd','B5',1,'2026-09-04',6515,'Muhamad Irsan'),
  ('BNN','pd','B5',2,'2026-09-04',6515,'Muhamad Irsan'),
  ('BNN','pd','B5',3,'2026-09-13',6515,'Muhamad Irsan'),
  ('BNN','pd','B5',4,'2026-09-18',6515,'Muhamad Irsan'),
  ('BNN','pd','B5',5,'2026-09-26',6515,'Muhamad Irsan'),
  ('BNN','pd','B6',1,'2026-09-04',6721,'Irwan Rano Kasno'),
  ('BNN','pd','B6',2,'2026-09-04',6721,'Irwan Rano Kasno'),
  ('BNN','pd','B6',3,'2026-09-13',6721,'Irwan Rano Kasno'),
  ('BNN','pd','B6',4,'2026-09-18',6721,'Irwan Rano Kasno'),
  ('BNN','pd','B6',5,'2026-09-26',6721,'Irwan Rano Kasno'),
  ('BNN','pd','B7',1,'2026-09-04',2916,'Wira Wijaya'),
  ('BNN','pd','B7',2,'2026-09-04',2916,'Wira Wijaya'),
  ('BNN','pd','B7',3,'2026-09-13',2916,'Wira Wijaya'),
  ('BNN','pd','B7',4,'2026-09-18',2916,'Wira Wijaya'),
  ('BNN','pd','B7',5,'2026-09-26',2916,'Wira Wijaya'),
  ('BNN','pd','B8',1,'2026-09-04',5286,'Yuyak'),
  ('BNN','pd','B8',2,'2026-09-04',5286,'Yuyak'),
  ('BNN','pd','B8',3,'2026-09-13',5286,'Yuyak'),
  ('BNN','pd','B8',4,'2026-09-18',5286,'Yuyak'),
  ('BNN','pd','B8',5,'2026-09-26',4484,'Yuyak'),
  ('BNN','pd','B9',1,'2026-09-03',2699,'Wira Wijaya'),
  ('BNN','pd','B9',2,'2026-09-03',2699,'Wira Wijaya'),
  ('BNN','pd','B9',3,'2026-09-13',2699,'Wira Wijaya'),
  ('BNN','pd','B9',4,'2026-09-18',2699,'Wira Wijaya'),
  ('BNN','pd','B9',5,'2026-09-26',2699,'Wira Wijaya'),
  ('BNN','pd','B10',1,'2026-09-03',7146,'Nurbiah Sido'),
  ('BNN','pd','B10',2,'2026-09-03',7146,'Nurbiah Sido'),
  ('BNN','pd','B10',3,'2026-09-13',7033,'Nurbiah Sido'),
  ('BNN','pd','B10',4,'2026-09-18',7033,'Nurbiah Sido'),
  ('BNN','pd','B10',5,'2026-09-27',7033,'Nurbiah Sido'),
  ('BNN','pd','B11',1,'2026-09-04',8972,'Muhammad Choirul'),
  ('BNN','pd','B11',2,'2026-09-04',8972,'Muhammad Choirul'),
  ('BNN','pd','B11',3,'2026-09-13',8972,'Muhammad Choirul'),
  ('BNN','pd','B11',4,'2026-09-18',8972,'Muhammad Choirul'),
  ('BNN','pd','B11',5,'2026-09-26',12140,'Muhammad Choirul'),
  ('BNN','pd','B12',1,'2026-09-04',2566,'Ayub Kamarudin'),
  ('BNN','pd','B12',2,'2026-09-04',2566,'Ayub Kamarudin'),
  ('BNN','pd','B12',3,'2026-09-13',2566,'Ayub Kamarudin'),
  ('BNN','pd','B12',4,'2026-09-18',2566,'Ayub Kamarudin'),
  ('BNN','pd','B12',5,'2026-09-26',2566,'Ayub Kamarudin'),
  ('BNN','pd','B14',1,'2026-09-04',3541,'Ayub Kamarudin'),
  ('BNN','pd','B14',2,'2026-09-04',3541,'Ayub Kamarudin'),
  ('BNN','pd','B14',3,'2026-09-13',3541,'Ayub Kamarudin'),
  ('BNN','pd','B14',4,'2026-09-18',3541,'Ayub Kamarudin'),
  ('BNN','pd','B14',5,'2026-09-26',3541,'Ayub Kamarudin'),
  ('BNN','manuring','B1',1,'2026-09-06',599,'Andi Rosmini'),
  ('BNN','manuring','B1',2,'2026-09-06',1754,'Andi Rosmini'),
  ('BNN','manuring','B2',1,'2026-09-07',3077,'Andi Rosmini'),
  ('BNN','manuring','B2',2,'2026-09-15',3077,'Andi Rosmini'),
  ('BNN','manuring','B3',1,'2026-09-07',5136,'Andi Rosmini'),
  ('BNN','manuring','B3-R',1,'2026-09-07',34,'Andi Rosmini'),
  ('BNN','manuring','B4',1,'2026-09-07',625,'Muhamad Irsan'),
  ('BNN','manuring','B4-R',1,'2026-09-07',26,'Muhamad Irsan'),
  ('BNN','manuring','B5',1,'2026-09-07',6515,'Muhamad Irsan'),
  ('BNN','manuring','B5',2,'2026-09-15',6515,'Muhamad Irsan'),
  ('BNN','manuring','B6',1,'2026-09-07',6158,'Irwan Rano Kasno'),
  ('BNN','manuring','B6',2,'2026-09-07',563,'Irwan Rano Kasno'),
  ('BNN','manuring','B6',3,'2026-09-15',563,'Irwan Rano Kasno'),
  ('BNN','manuring','B7',1,'2026-09-07',2916,'Wira Wijaya'),
  ('BNN','manuring','B7',2,'2026-09-15',2916,'Wira Wijaya'),
  ('BNN','manuring','B8',1,'2026-09-07',5286,'Yuyak'),
  ('BNN','manuring','B8',2,'2026-09-15',5286,'Yuyak'),
  ('BNN','manuring','B9',1,'2026-09-03',2699,'Wira Wijaya'),
  ('BNN','manuring','B9',2,'2026-09-15',2699,'Wira Wijaya'),
  ('BNN','manuring','B10',1,'2026-09-07',7146,'Nurbiah Sido'),
  ('BNN','manuring','B11',1,'2026-09-15',8972,'Muhammad Choirul'),
  ('BNN','manuring','B12',1,'2026-09-07',2566,'Ayub Kamarudin'),
  ('BNN','manuring','B14',1,'2026-09-07',3541,'Ayub Kamarudin'),
  ('BNN','weeding','B1',1,'2026-09-06',2353,'Andi Rosmini'),
  ('BNN','weeding','B1',2,'2026-09-19',2353,'Andi Rosmini'),
  ('BNN','weeding','B2',1,'2026-09-06',3077,'Andi Rosmini'),
  ('BNN','weeding','B2',2,'2026-09-19',3077,'Andi Rosmini'),
  ('BNN','weeding','B3',1,'2026-09-06',5170,'Andi Rosmini'),
  ('BNN','weeding','B3',2,'2026-09-19',5196,'Andi Rosmini'),
  ('BNN','weeding','B4',1,'2026-09-06',862,'Muhamad Irsan'),
  ('BNN','weeding','B4',2,'2026-09-19',625,'Muhamad Irsan'),
  ('BNN','weeding','B5',1,'2026-09-06',6515,'Muhamad Irsan'),
  ('BNN','weeding','B5',2,'2026-09-19',6515,'Muhamad Irsan'),
  ('BNN','weeding','B6',1,'2026-09-06',6721,'Irwan Rano Kasno'),
  ('BNN','weeding','B6',2,'2026-09-20',6721,'Irwan Rano Kasno'),
  ('BNN','weeding','B7',1,'2026-09-05',2916,'Wira Wijaya'),
  ('BNN','weeding','B7',2,'2026-09-19',2916,'Wira Wijaya'),
  ('BNN','weeding','B8',1,'2026-09-05',5286,'Yuyak'),
  ('BNN','weeding','B8',2,'2026-09-19',5286,'Yuyak'),
  ('BNN','weeding','B9',1,'2026-09-03',2699,'Wira Wijaya'),
  ('BNN','weeding','B9',2,'2026-09-19',2699,'Wira Wijaya'),
  ('BNN','weeding','B10',1,'2026-09-06',7146,'Nurbiah Sido'),
  ('BNN','weeding','B10',2,'2026-09-19',7033,'Nurbiah Sido'),
  ('BNN','weeding','B11',1,'2026-09-07',8972,'Muhammad Choirul'),
  ('BNN','weeding','B11',2,'2026-09-21',12140,'Muhammad Choirul'),
  ('BNN','weeding','B12',1,'2026-09-05',2566,'Ayub Kamarudin'),
  ('BNN','weeding','B12',2,'2026-09-19',2566,'Ayub Kamarudin'),
  ('BNN','weeding','B14',1,'2026-09-06',3541,'Ayub Kamarudin'),
  ('BNN','weeding','B14',2,'2026-09-19',3541,'Ayub Kamarudin'),
  ('BNN','interrow','B1',1,'2026-09-05',2353,'Andi Rosmini'),
  ('BNN','interrow','B1',2,'2026-09-17',2353,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B1',3,'2026-09-24',2353,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B2',1,'2026-09-09',3151,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B2',2,'2026-09-17',3151,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B3',1,'2026-09-08',5170,'Andi Rosmini'),
  ('BNN','interrow','B3',2,'2026-09-17',5196,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B3',3,'2026-09-24',5196,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B4',1,'2026-09-09',625,'Muhamad Irsan'),
  ('BNN','interrow','B4',2,'2026-09-17',625,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B4',3,'2026-09-24',3030,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B5',1,'2026-09-09',6788,'Muhamad Irsan'),
  ('BNN','interrow','B5',2,'2026-09-17',6788,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B5',3,'2026-09-24',6788,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan'),
  ('BNN','interrow','B6',1,'2026-09-09',6747,'Irwan Rano Kasno'),
  ('BNN','interrow','B6',2,'2026-09-17',6747,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B6',3,'2026-09-24',6747,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B7',1,'2026-09-09',3000,'Wira Wijaya'),
  ('BNN','interrow','B7',2,'2026-09-18',3000,'Ayub Kamarudin;Muhammad Choirul;Nurbiah Sido;Wira Wijaya'),
  ('BNN','interrow','B7',3,'2026-09-24',3000,'Ayub Kamarudin;Muhammad Choirul;Nurbiah Sido;Wira Wijaya'),
  ('BNN','interrow','B8',1,'2026-09-09',5302,'Yuyak'),
  ('BNN','interrow','B8',2,'2026-09-17',5302,'Andi Rosmini;Irwan Rano Kasno;Muhamad Irsan;Yuyak'),
  ('BNN','interrow','B9',1,'2026-09-08',2716,'Wira Wijaya'),
  ('BNN','interrow','B9',2,'2026-09-18',2716,'Ayub Kamarudin;Muhammad Choirul;Nurbiah Sido;Wira Wijaya'),
  ('BNN','interrow','B9',3,'2026-09-24',2716,'Ayub Kamarudin;Muhammad Choirul;Nurbiah Sido;Wira Wijaya'),
  ('BNN','interrow','B10',1,'2026-09-08',7146,'Nurbiah Sido'),
  ('BNN','interrow','B10',2,'2026-09-17',7146,'Ayub Kamarudin;Muhammad Choirul;Nurbiah Sido;Wira Wijaya'),
  ('BNN','interrow','B10',3,'2026-09-24',7146,'Ayub Kamarudin;Nurbiah Sido;Wira Wijaya'),
  ('BNN','interrow','B11',1,'2026-09-08',8972,'Muhammad Choirul'),
  ('BNN','interrow','B11',2,'2026-09-17',12140,'Ayub Kamarudin;Muhammad Choirul;Nurbiah Sido;Wira Wijaya'),
  ('BNN','interrow','B11',3,'2026-09-29',12140,'Muhammad Choirul'),
  ('BNN','interrow','B12',1,'2026-09-08',2566,'Ayub Kamarudin'),
  ('BNN','interrow','B12',2,'2026-09-17',2566,'Ayub Kamarudin;Muhammad Choirul;Nurbiah Sido;Wira Wijaya'),
  ('BNN','interrow','B12',3,'2026-09-24',2566,'Ayub Kamarudin;Nurbiah Sido;Wira Wijaya'),
  ('BNN','interrow','B14',1,'2026-09-08',3541,'Ayub Kamarudin'),
  ('BNN','interrow','B14',2,'2026-09-18',3541,'Ayub Kamarudin;Muhammad Choirul;Nurbiah Sido;Wira Wijaya'),
  ('BNN','interrow','B14',3,'2026-09-24',3541,'Ayub Kamarudin;Nurbiah Sido;Wira Wijaya'),
  ('UNN1','pd','U1',1,'2026-09-06',4636,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U1',2,'2026-09-06',4636,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U1',3,'2026-09-13',4636,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U1',4,'2026-09-20',4636,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U1',5,'2026-09-26',4636,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U2',1,'2026-09-06',5064,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U2',2,'2026-09-06',5064,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U2',3,'2026-09-12',5064,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U2',4,'2026-09-19',5064,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U2',5,'2026-09-26',5064,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U3',1,'2026-09-06',5847,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U3',2,'2026-09-06',5847,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U3',3,'2026-09-12',5824,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U3',4,'2026-09-19',5824,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U3',5,'2026-09-26',5824,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U4',1,'2026-09-06',4040,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U4',2,'2026-09-06',4040,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U4',3,'2026-09-13',4040,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U4',4,'2026-09-20',4040,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U4',5,'2026-09-27',4040,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U5',1,'2026-09-06',3335,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U5',2,'2026-09-06',3335,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U5',3,'2026-09-13',3335,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U5',4,'2026-09-20',3335,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U5',5,'2026-09-27',3335,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U6',1,'2026-09-06',8050,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U6',2,'2026-09-06',8050,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U6',3,'2026-09-13',7557,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U6',4,'2026-09-20',6414,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U6',5,'2026-09-27',5194,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U7',1,'2026-09-06',6787,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U7',2,'2026-09-06',6787,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Repi;Wina'),
  ('UNN1','pd','U7',3,'2026-09-13',6787,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U7',4,'2026-09-20',6787,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U7',5,'2026-09-27',6787,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U8',1,'2026-09-06',6693,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U8',2,'2026-09-06',6693,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U8',3,'2026-09-13',6693,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U8',4,'2026-09-20',4957,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U8',5,'2026-09-27',4946,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U9',1,'2026-09-06',3746,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U9',2,'2026-09-06',3746,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U9',3,'2026-09-13',3746,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U9',4,'2026-09-20',3746,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U9',5,'2026-09-27',3746,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U10',1,'2026-09-06',3344,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U10',2,'2026-09-06',3344,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U10',3,'2026-09-13',3344,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U10',4,'2026-09-20',3344,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U10',5,'2026-09-27',3344,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U11',1,'2026-09-06',5935,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U11',2,'2026-09-06',5935,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U11',3,'2026-09-13',5935,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U11',4,'2026-09-20',5935,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U11',5,'2026-09-27',5935,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U12',1,'2026-09-06',6140,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U12',2,'2026-09-06',6140,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U12',3,'2026-09-13',6140,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U12',4,'2026-09-19',6140,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U12',5,'2026-09-26',6140,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U12-R',1,'2026-09-06',88,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U12-R',2,'2026-09-06',88,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U12-R',3,'2026-09-13',88,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U12-R',4,'2026-09-20',88,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U12-R',5,'2026-09-26',53,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U13',1,'2026-09-06',6309,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U13',2,'2026-09-06',6309,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U13',3,'2026-09-13',6309,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U13',4,'2026-09-20',6309,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U13',5,'2026-09-26',6309,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U14',1,'2026-09-06',5704,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U14',2,'2026-09-06',5704,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U14',3,'2026-09-13',5704,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U14',4,'2026-09-19',5704,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U14',5,'2026-09-26',5704,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U15',1,'2026-09-06',4971,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U15',2,'2026-09-06',4971,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U15',3,'2026-09-13',4971,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U15',4,'2026-09-19',4971,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U15',5,'2026-09-26',4971,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U16',1,'2026-09-06',2795,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U16',2,'2026-09-06',2795,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U16',3,'2026-09-13',2795,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U16',4,'2026-09-19',2795,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U16',5,'2026-09-27',2795,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U17',1,'2026-09-06',6883,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U17',2,'2026-09-06',6883,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U17',3,'2026-09-13',5583,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U17',4,'2026-09-20',5583,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U17',5,'2026-09-27',5583,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U18',1,'2026-09-06',7519,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U18',2,'2026-09-06',7519,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U18',3,'2026-09-13',7519,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U18',4,'2026-09-20',7519,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','pd','U18',5,'2026-09-27',7519,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U1',1,'2026-09-05',4636,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U1',2,'2026-09-17',4636,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U2',1,'2026-09-06',5064,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U2',2,'2026-09-18',5064,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U3',1,'2026-09-06',5847,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U4',1,'2026-09-06',4040,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U5',1,'2026-09-06',3335,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U6',1,'2026-09-06',8050,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U7',1,'2026-09-06',6787,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U7',2,'2026-09-19',6787,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U8',1,'2026-09-06',6693,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U8',2,'2026-09-19',4957,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U9',1,'2026-09-06',3746,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U9',2,'2026-09-19',3746,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U10',1,'2026-09-06',3344,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U10',2,'2026-09-19',3344,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U11',1,'2026-09-05',5935,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U12',1,'2026-09-05',6140,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U13',1,'2026-09-05',6309,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U14',1,'2026-09-07',5704,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U15',1,'2026-09-07',4971,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U16',1,'2026-09-07',2795,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U17',1,'2026-09-06',2006,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U17',2,'2026-09-19',706,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','manuring','U18',1,'2026-09-07',7519,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U1',1,'2026-09-04',4636,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U1',2,'2026-09-16',4636,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U2',1,'2026-09-04',5064,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U2',2,'2026-09-16',5064,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U3',1,'2026-09-04',5847,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U3',2,'2026-09-18',5824,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U4',1,'2026-09-18',4040,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U5',1,'2026-09-05',3335,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U5',2,'2026-09-18',3335,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U6',1,'2026-09-05',8050,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U6',2,'2026-09-18',6914,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U7',1,'2026-09-05',6787,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U7',2,'2026-09-16',6787,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U8',1,'2026-09-03',6693,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U8',2,'2026-09-16',6293,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U9',1,'2026-09-03',3746,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U9',2,'2026-09-16',3746,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U10',1,'2026-09-03',3344,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U10',2,'2026-09-16',3344,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U11',1,'2026-09-03',5935,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U11',2,'2026-09-17',5935,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U12',1,'2026-09-04',6140,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U12',2,'2026-09-19',6140,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U12-R',1,'2026-09-04',88,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U12-R',2,'2026-09-16',88,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U13',1,'2026-09-04',6309,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U13',2,'2026-09-16',6309,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U14',1,'2026-09-05',5704,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U14',2,'2026-09-18',5704,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U15',1,'2026-09-05',4971,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U15',2,'2026-09-18',4971,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U16',1,'2026-09-04',2795,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U16',2,'2026-09-18',2795,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U17',1,'2026-09-04',2006,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U17',2,'2026-09-18',5583,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U18',1,'2026-08-04',7519,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','weeding','U18',2,'2026-09-18',7519,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U1',1,'2026-09-10',4648,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U1',2,'2026-09-22',4648,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U2',1,'2026-09-10',5088,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U2',2,'2026-09-22',5088,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U3',1,'2026-09-10',5847,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U3',2,'2026-09-22',5847,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U4',1,'2026-09-09',4040,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U4',2,'2026-09-22',4040,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U5',1,'2026-09-09',3335,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U5',2,'2026-09-22',3335,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U6',1,'2026-09-09',8062,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U6',2,'2026-09-22',6206,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U7',1,'2026-09-09',6827,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U7',2,'2026-09-22',6827,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U8',1,'2026-09-09',6701,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U8',2,'2026-09-21',4954,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U9',1,'2026-09-09',3753,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U9',2,'2026-09-21',3753,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U10',1,'2026-09-08',3355,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U10',2,'2026-09-21',3355,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U11',1,'2026-09-08',5935,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U11',2,'2026-09-20',5935,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U12',1,'2026-09-10',6140,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U12',2,'2026-09-21',6140,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U12-R',1,'2026-09-10',88,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U12-R',2,'2026-09-22',53,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U13',1,'2026-09-10',6309,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U13',2,'2026-09-21',6309,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U14',1,'2026-09-10',5704,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U14',2,'2026-09-22',5704,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U15',1,'2026-09-10',4971,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U15',2,'2026-09-22',4971,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U16',1,'2026-09-10',2795,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U16',2,'2026-09-22',2795,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U17',1,'2026-09-10',706,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U17',2,'2026-09-22',5583,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U18',1,'2026-09-10',7519,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN1','interrow','U18',2,'2026-09-22',7519,'Asriawan;Fauzan;Haerul;Hamzan Wadi;Mahnum;Mahsiruddin;Muazzin;Repi;Wina'),
  ('UNN2','pd','N1',1,'2026-09-03',5690,'Muhamad Azhar'),
  ('UNN2','pd','N1',2,'2026-09-03',5690,'Muhamad Azhar'),
  ('UNN2','pd','N1',3,'2026-09-11',5676,'Muhamad Azhar'),
  ('UNN2','pd','N1',4,'2026-09-19',5676,'Muhamad Azhar'),
  ('UNN2','pd','N1',5,'2026-09-27',5676,'Muhamad Azhar'),
  ('UNN2','pd','N2',1,'2026-09-03',4962,'Awaludin'),
  ('UNN2','pd','N2',2,'2026-09-03',4962,'Awaludin'),
  ('UNN2','pd','N2',3,'2026-09-11',4962,'Awaludin'),
  ('UNN2','pd','N2',4,'2026-09-19',4962,'Awaludin'),
  ('UNN2','pd','N2',5,'2026-09-27',4962,'Awaludin'),
  ('UNN2','pd','N3',1,'2026-09-27',6685,'Awaludin'),
  ('UNN2','pd','N4',1,'2026-09-03',6149,'Anton'),
  ('UNN2','pd','N4',2,'2026-09-03',6149,'Anton'),
  ('UNN2','pd','N4',3,'2026-09-11',6149,'Anton'),
  ('UNN2','pd','N4',4,'2026-09-19',6149,'Anton'),
  ('UNN2','pd','N4',5,'2026-09-27',6149,'Anton'),
  ('UNN2','pd','N5',1,'2026-09-03',4296,'Muhamad Azhar'),
  ('UNN2','pd','N5',2,'2026-09-03',4296,'Muhamad Azhar'),
  ('UNN2','pd','N5',3,'2026-09-11',4276,'Muhamad Azhar'),
  ('UNN2','pd','N5',4,'2026-09-19',4276,'Muhamad Azhar'),
  ('UNN2','pd','N5',5,'2026-09-27',4276,'Muhamad Azhar'),
  ('UNN2','pd','N5-R',1,'2026-09-11',3,'Muhamad Azhar'),
  ('UNN2','pd','N5-R',2,'2026-09-28',21,'Muhamad Azhar'),
  ('UNN2','pd','N6',1,'2026-09-03',4983,'Awaludin'),
  ('UNN2','pd','N6',2,'2026-09-03',4983,'Awaludin'),
  ('UNN2','pd','N6',3,'2026-09-11',4983,'Awaludin'),
  ('UNN2','pd','N6',4,'2026-09-19',4983,'Awaludin'),
  ('UNN2','pd','N6',5,'2026-09-27',4983,'Awaludin'),
  ('UNN2','pd','N7',1,'2026-09-03',7504,'Suhaedi'),
  ('UNN2','pd','N7',2,'2026-09-03',7504,'Suhaedi'),
  ('UNN2','pd','N7',3,'2026-09-11',7504,'Suhaedi'),
  ('UNN2','pd','N7',4,'2026-09-19',6590,'Suhaedi'),
  ('UNN2','pd','N7',5,'2026-09-28',1551,'Suhaedi'),
  ('UNN2','pd','N8',1,'2026-09-03',7602,'MARWAN HAKIM'),
  ('UNN2','pd','N8',2,'2026-09-03',7602,'MARWAN HAKIM'),
  ('UNN2','pd','N8',3,'2026-09-11',7602,'MARWAN HAKIM'),
  ('UNN2','pd','N8',4,'2026-09-19',7602,'MARWAN HAKIM'),
  ('UNN2','pd','N8',5,'2026-09-27',7602,'MARWAN HAKIM'),
  ('UNN2','pd','N9',1,'2026-09-03',5428,'Suhaedi'),
  ('UNN2','pd','N9',2,'2026-09-03',5428,'Suhaedi'),
  ('UNN2','pd','N9',3,'2026-09-11',5423,'Suhaedi'),
  ('UNN2','pd','N9',4,'2026-09-19',5423,'Suhaedi'),
  ('UNN2','pd','N9',5,'2026-09-27',5423,'Suhaedi'),
  ('UNN2','pd','N10',1,'2026-09-03',4696,'LUKMAN SIREGAR'),
  ('UNN2','pd','N10',2,'2026-09-03',4696,'LUKMAN SIREGAR'),
  ('UNN2','pd','N10',3,'2026-09-11',4696,'LUKMAN SIREGAR'),
  ('UNN2','pd','N10',4,'2026-09-19',4696,'LUKMAN SIREGAR'),
  ('UNN2','pd','N10',5,'2026-09-27',4696,'LUKMAN SIREGAR'),
  ('UNN2','pd','N11',1,'2026-09-03',4071,'Suhaedi'),
  ('UNN2','pd','N11',2,'2026-09-03',4071,'Suhaedi'),
  ('UNN2','pd','N11',3,'2026-09-11',4071,'Suhaedi'),
  ('UNN2','pd','N11',4,'2026-09-19',4071,'Suhaedi'),
  ('UNN2','pd','N11',5,'2026-09-27',4071,'Suhaedi'),
  ('UNN2','pd','N12',1,'2026-09-03',3695,'LUKMAN SIREGAR'),
  ('UNN2','pd','N12',2,'2026-09-03',3695,'LUKMAN SIREGAR'),
  ('UNN2','pd','N12',3,'2026-09-11',3695,'LUKMAN SIREGAR'),
  ('UNN2','pd','N12',4,'2026-09-19',3695,'LUKMAN SIREGAR'),
  ('UNN2','pd','N12',5,'2026-09-27',3695,'LUKMAN SIREGAR'),
  ('UNN2','pd','N14',1,'2026-09-03',5248,'MUSTAFA'),
  ('UNN2','pd','N14',2,'2026-09-03',5248,'MUSTAFA'),
  ('UNN2','pd','N14',3,'2026-09-11',5248,'MUSTAFA'),
  ('UNN2','pd','N14',4,'2026-09-19',5248,'MUSTAFA'),
  ('UNN2','pd','N14',5,'2026-09-27',5248,'MUSTAFA'),
  ('UNN2','pd','N15',1,'2026-09-03',2999,'Suhaedi'),
  ('UNN2','pd','N15',2,'2026-09-03',2999,'Suhaedi'),
  ('UNN2','pd','N15',3,'2026-09-11',1548,'Suhaedi'),
  ('UNN2','pd','N15',4,'2026-09-19',657,'Suhaedi'),
  ('UNN2','pd','N16',1,'2026-09-03',5440,'Muhamad Azhar'),
  ('UNN2','pd','N16',2,'2026-09-03',5440,'Muhamad Azhar'),
  ('UNN2','pd','N16',3,'2026-09-11',5440,'Muhamad Azhar'),
  ('UNN2','pd','N16',4,'2026-09-19',4631,'Muhamad Azhar'),
  ('UNN2','pd','N16',5,'2026-09-27',4631,'Muhamad Azhar'),
  ('UNN2','pd','N17',1,'2026-09-03',4816,'MARWAN HAKIM'),
  ('UNN2','pd','N17',2,'2026-09-03',4816,'MARWAN HAKIM'),
  ('UNN2','pd','N17',3,'2026-09-11',4816,'MARWAN HAKIM'),
  ('UNN2','pd','N17',4,'2026-09-19',4816,'MARWAN HAKIM'),
  ('UNN2','pd','N17',5,'2026-09-27',4816,'MARWAN HAKIM'),
  ('UNN2','pd','N18',1,'2026-09-03',2517,'Anton'),
  ('UNN2','pd','N18',2,'2026-09-03',2517,'Anton'),
  ('UNN2','pd','N18',3,'2026-09-11',2517,'Anton'),
  ('UNN2','pd','N18',4,'2026-09-19',2517,'Anton'),
  ('UNN2','pd','N18',5,'2026-09-27',2517,'Anton'),
  ('UNN2','pd','N19',1,'2026-09-03',6564,'Anton'),
  ('UNN2','pd','N19',2,'2026-09-03',6564,'Anton'),
  ('UNN2','pd','N19',3,'2026-09-11',6564,'Anton'),
  ('UNN2','pd','N19',4,'2026-09-19',6564,'Anton'),
  ('UNN2','pd','N19',5,'2026-09-27',6564,'Anton'),
  ('UNN2','pd','N20',1,'2026-09-03',2441,'MARWAN HAKIM'),
  ('UNN2','pd','N20',2,'2026-09-03',2441,'MARWAN HAKIM'),
  ('UNN2','pd','N20',3,'2026-09-11',2441,'MARWAN HAKIM'),
  ('UNN2','pd','N20',4,'2026-09-18',2441,'MARWAN HAKIM'),
  ('UNN2','pd','N20',5,'2026-09-27',2441,'MARWAN HAKIM'),
  ('UNN2','manuring','N1',1,'2026-09-05',5690,'Muhamad Azhar'),
  ('UNN2','manuring','N2',1,'2026-09-05',4962,'Awaludin'),
  ('UNN2','manuring','N2',2,'2026-09-18',4962,'Awaludin'),
  ('UNN2','manuring','N4',1,'2026-09-05',6149,'Anton'),
  ('UNN2','manuring','N5',1,'2026-09-05',4296,'Muhamad Azhar'),
  ('UNN2','manuring','N6',1,'2026-09-06',4983,'Awaludin'),
  ('UNN2','manuring','N7',1,'2026-09-05',7504,'Suhaedi'),
  ('UNN2','manuring','N7',2,'2026-09-18',6740,'Suhaedi'),
  ('UNN2','manuring','N8',1,'2026-09-06',7602,'MARWAN HAKIM'),
  ('UNN2','manuring','N9',1,'2026-09-07',5428,'Suhaedi'),
  ('UNN2','manuring','N10',1,'2026-09-06',4696,'LUKMAN SIREGAR'),
  ('UNN2','manuring','N11',1,'2026-09-06',4071,'Suhaedi'),
  ('UNN2','manuring','N11',2,'2026-09-18',4071,'Suhaedi'),
  ('UNN2','manuring','N12',1,'2026-09-05',3695,'LUKMAN SIREGAR'),
  ('UNN2','manuring','N12',2,'2026-09-17',3695,'LUKMAN SIREGAR'),
  ('UNN2','manuring','N14',1,'2026-09-06',5248,'Muhamad Azhar'),
  ('UNN2','manuring','N14',2,'2026-09-18',5248,'Muhamad Azhar'),
  ('UNN2','manuring','N15',1,'2026-09-06',2346,'MUSTAFA'),
  ('UNN2','manuring','N15',2,'2026-09-17',657,'Suhaedi'),
  ('UNN2','manuring','N16',1,'2026-09-06',5440,'Muhamad Azhar'),
  ('UNN2','manuring','N16',2,'2026-09-18',4631,'Muhamad Azhar'),
  ('UNN2','manuring','N17',1,'2026-09-06',4816,'MARWAN HAKIM'),
  ('UNN2','manuring','N17',2,'2026-09-18',4816,'MARWAN HAKIM'),
  ('UNN2','manuring','N18',1,'2026-09-06',2517,'Anton'),
  ('UNN2','manuring','N18',2,'2026-09-17',2517,'Anton'),
  ('UNN2','manuring','N19',1,'2026-09-06',6564,'Anton'),
  ('UNN2','manuring','N19',2,'2026-09-18',6564,'Anton'),
  ('UNN2','manuring','N20',1,'2026-09-05',2441,'MARWAN HAKIM'),
  ('UNN2','manuring','N20',2,'2026-09-17',2441,'MARWAN HAKIM'),
  ('UNN2','weeding','N1',1,'2026-09-04',5690,'Muhamad Azhar'),
  ('UNN2','weeding','N1',2,'2026-09-16',5676,'Muhamad Azhar'),
  ('UNN2','weeding','N2',1,'2026-09-04',4962,'Awaludin'),
  ('UNN2','weeding','N2',2,'2026-09-16',4962,'Awaludin'),
  ('UNN2','weeding','N4',1,'2026-09-04',6149,'Anton'),
  ('UNN2','weeding','N4',2,'2026-09-17',6149,'Anton'),
  ('UNN2','weeding','N5',1,'2026-09-05',4296,'Muhamad Azhar'),
  ('UNN2','weeding','N5',2,'2026-09-16',4276,'Muhamad Azhar'),
  ('UNN2','weeding','N6',1,'2026-09-04',4983,'Awaludin'),
  ('UNN2','weeding','N6',2,'2026-09-16',4983,'Awaludin'),
  ('UNN2','weeding','N7',1,'2026-09-05',7504,'Suhaedi'),
  ('UNN2','weeding','N7',2,'2026-09-17',7404,'Suhaedi'),
  ('UNN2','weeding','N8',1,'2026-09-04',7602,'MARWAN HAKIM'),
  ('UNN2','weeding','N8',2,'2026-09-16',7602,'MARWAN HAKIM'),
  ('UNN2','weeding','N9',1,'2026-09-07',5428,'Suhaedi'),
  ('UNN2','weeding','N9',2,'2026-09-16',5423,'Suhaedi'),
  ('UNN2','weeding','N10',1,'2026-09-05',4696,'LUKMAN SIREGAR'),
  ('UNN2','weeding','N10',2,'2026-09-16',4696,'LUKMAN SIREGAR'),
  ('UNN2','weeding','N11',1,'2026-09-05',4071,'Suhaedi'),
  ('UNN2','weeding','N11',2,'2026-09-16',4071,'Suhaedi'),
  ('UNN2','weeding','N12',1,'2026-09-05',3695,'LUKMAN SIREGAR'),
  ('UNN2','weeding','N12',2,'2026-09-16',3695,'LUKMAN SIREGAR'),
  ('UNN2','weeding','N14',1,'2026-09-05',5248,'MUSTAFA'),
  ('UNN2','weeding','N14',2,'2026-09-16',5248,'MUSTAFA'),
  ('UNN2','weeding','N15',1,'2026-09-05',2346,'Suhaedi'),
  ('UNN2','weeding','N15',2,'2026-09-17',657,'Suhaedi'),
  ('UNN2','weeding','N16',1,'2026-09-06',5440,'Muhamad Azhar'),
  ('UNN2','weeding','N16',2,'2026-09-17',4631,'Muhamad Azhar'),
  ('UNN2','weeding','N17',1,'2026-09-04',4816,'MARWAN HAKIM'),
  ('UNN2','weeding','N17',2,'2026-09-16',4816,'MARWAN HAKIM'),
  ('UNN2','weeding','N18',1,'2026-09-04',2517,'Anton'),
  ('UNN2','weeding','N18',2,'2026-09-16',2517,'Anton'),
  ('UNN2','weeding','N19',1,'2026-09-04',6564,'Anton'),
  ('UNN2','weeding','N19',2,'2026-09-16',6564,'Anton'),
  ('UNN2','weeding','N20',1,'2026-09-04',2441,'MARWAN HAKIM'),
  ('UNN2','weeding','N20',2,'2026-09-16',2441,'MARWAN HAKIM'),
  ('UNN2','interrow','N1',1,'2026-09-10',5690,'Muhamad Azhar'),
  ('UNN2','interrow','N1',2,'2026-09-25',5690,'Muhamad Azhar'),
  ('UNN2','interrow','N2',1,'2026-09-10',4985,'Awaludin'),
  ('UNN2','interrow','N2',2,'2026-09-25',4985,'Awaludin'),
  ('UNN2','interrow','N3',1,'2026-09-24',6685,'Awaludin'),
  ('UNN2','interrow','N4',1,'2026-09-10',6149,'Anton'),
  ('UNN2','interrow','N4',2,'2026-09-26',6149,'Anton'),
  ('UNN2','interrow','N5',1,'2026-09-10',4296,'Muhamad Azhar'),
  ('UNN2','interrow','N5',2,'2026-09-26',4296,'Muhamad Azhar'),
  ('UNN2','interrow','N6',1,'2026-09-10',4983,'Awaludin'),
  ('UNN2','interrow','N6',2,'2026-09-30',4983,'Awaludin'),
  ('UNN2','interrow','N7',1,'2026-09-09',7518,'Suhaedi'),
  ('UNN2','interrow','N8',1,'2026-09-10',7602,'MARWAN HAKIM'),
  ('UNN2','interrow','N8',2,'2026-09-23',7602,'MARWAN HAKIM'),
  ('UNN2','interrow','N9',1,'2026-09-10',5428,'Suhaedi'),
  ('UNN2','interrow','N9',2,'2026-09-23',5428,'Suhaedi'),
  ('UNN2','interrow','N10',1,'2026-09-09',4696,'LUKMAN SIREGAR'),
  ('UNN2','interrow','N10',2,'2026-09-25',4696,'LUKMAN SIREGAR'),
  ('UNN2','interrow','N11',1,'2026-09-10',4072,'Suhaedi'),
  ('UNN2','interrow','N11',2,'2026-09-23',4072,'Suhaedi'),
  ('UNN2','interrow','N12',1,'2026-09-10',3708,'LUKMAN SIREGAR'),
  ('UNN2','interrow','N12',2,'2026-09-25',3708,'LUKMAN SIREGAR'),
  ('UNN2','interrow','N14',1,'2026-09-10',5271,'MUSTAFA'),
  ('UNN2','interrow','N14',2,'2026-09-24',5271,'MUSTAFA'),
  ('UNN2','interrow','N15',1,'2026-09-10',1630,'Suhaedi'),
  ('UNN2','interrow','N15',2,'2026-09-24',549,'Suhaedi'),
  ('UNN2','interrow','N16',1,'2026-09-09',5445,'Muhamad Azhar'),
  ('UNN2','interrow','N16',2,'2026-09-23',4636,'Muhamad Azhar'),
  ('UNN2','interrow','N17',1,'2026-09-10',4834,'MARWAN HAKIM'),
  ('UNN2','interrow','N17',2,'2026-09-26',4834,'MARWAN HAKIM'),
  ('UNN2','interrow','N18',1,'2026-09-09',2534,'Anton'),
  ('UNN2','interrow','N18',2,'2026-09-23',2534,'Anton'),
  ('UNN2','interrow','N19',1,'2026-09-10',6590,'Anton'),
  ('UNN2','interrow','N19',2,'2026-09-24',6590,'Anton'),
  ('UNN2','interrow','N20',1,'2026-09-10',2443,'MARWAN HAKIM'),
  ('UNN2','interrow','N20',2,'2026-09-25',2443,'MARWAN HAKIM')),
jen(wt, jenis) AS (VALUES
  ('pd',       'Penyemburan racun kulat dan serangga'),
  ('manuring', 'Membaja'),
  ('weeding',  'Merumput'),
  ('interrow', 'Meracun rumput secara selingan')
),
sheet_j AS (SELECT s.*, j.jenis FROM sheet s JOIN jen j ON j.wt = s.wt),

raw AS (
  SELECT e.ord, e.rec
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
         WITH ORDINALITY AS e(rec, ord)
   WHERE m.id = 1
),

-- September only, ranked within its plot by the day the work was done -- the
-- Worker Records own order. A row with no date sorts last, the way the page
-- sorts it.
sep AS (
  SELECT r.ord, r.rec,
         btrim(COALESCE(r.rec->>'jenis', ''))  AS jenis,
         btrim(COALESCE(r.rec->>'plot', ''))   AS plot,
         btrim(COALESCE(r.rec->>'tarikh', '')) AS tarikh
    FROM raw r
   WHERE btrim(COALESCE(r.rec->>'_month', '')) = 'Sep 2026'
),
sep_rank AS (
  SELECT s.*,
         row_number() OVER (PARTITION BY s.jenis, s.plot
                            ORDER BY CASE WHEN s.tarikh = '' OR s.tarikh = '-'
                                          THEN '9999-99-99' ELSE s.tarikh END,
                                     s.ord) AS seq
    FROM sep s
),

cnt_sheet AS (SELECT jenis, plot, count(*) AS n FROM sheet_j  GROUP BY 1, 2),
cnt_db    AS (SELECT jenis, plot, count(*) AS n FROM sep_rank GROUP BY 1, 2),
ok AS (
  SELECT c.jenis, c.plot
    FROM cnt_sheet c JOIN cnt_db d ON d.jenis = c.jenis AND d.plot = c.plot
   WHERE c.n = d.n
),
skipped AS (
  SELECT c.jenis, c.plot, c.n AS on_sheet, COALESCE(d.n, 0) AS in_month
    FROM cnt_sheet c LEFT JOIN cnt_db d ON d.jenis = c.jenis AND d.plot = c.plot
   WHERE COALESCE(d.n, -1) <> c.n
),

pair AS (
  SELECT d.ord, s.nursery, s.wt, s.plot, s.jenis,
         s.tarikh AS want_date, s.qty AS want_qty, s.workers,
         COALESCE(d.rec->>'id', '')                 AS rec_id,
         btrim(COALESCE(d.rec->>'tarikh', ''))      AS had_date,
         btrim(COALESCE(d.rec->>'qty', ''))         AS had_keyed,
         btrim(COALESCE(d.rec->>'qtyFrozen', ''))   AS had_frozen,
         CASE WHEN COALESCE(d.rec->>'checked', '0') IN ('1', 'true') THEN 1 ELSE 0 END AS had_checked
    FROM sep_rank d
    JOIN ok o       ON o.jenis = d.jenis AND o.plot = d.plot
    JOIN sheet_j s  ON s.jenis = d.jenis AND s.plot = d.plot AND s.seq = d.seq
),

changed AS (
  SELECT * FROM pair
   WHERE had_date <> want_date
      OR had_frozen <> want_qty::text
      OR had_keyed <> ''
      OR had_checked = 0
),

rebuilt AS (
  SELECT jsonb_agg(
           CASE WHEN p.ord IS NULL THEN r.rec
                ELSE jsonb_set(jsonb_set(jsonb_set(jsonb_set(
                       r.rec,
                       '{tarikh}',    to_jsonb(p.want_date)),
                       '{qtyFrozen}', to_jsonb(p.want_qty::text)),
                       '{qty}',       to_jsonb(''::text)),
                       '{checked}',   to_jsonb('1'::text))
           END ORDER BY r.ord) AS arr
    FROM raw r LEFT JOIN pair p ON p.ord = r.ord
),
wrote_rows AS (
  UPDATE nops_maint_records
     SET records = COALESCE((SELECT arr FROM rebuilt), records), updated_at = now()
   WHERE id = 1 AND (SELECT count(*) FROM pair) > 0
  RETURNING 1
),

tick AS (
  SELECT p.nursery, p.wt, p.rec_id, btrim(t.worker) AS worker
    FROM pair p, unnest(string_to_array(p.workers, ';')) AS t(worker)
   WHERE p.rec_id <> '' AND btrim(t.worker) <> ''
),
tick_by_rec AS (
  SELECT nursery, wt, rec_id, jsonb_object_agg(worker, 1) AS w
    FROM tick GROUP BY nursery, wt, rec_id
),
tick_by_sheet AS (
  SELECT nursery, wt, jsonb_object_agg(rec_id, w) AS data
    FROM tick_by_rec GROUP BY nursery, wt
),
wrote_ticks AS (
  INSERT INTO nops_maint_payroll (nursery, month, work_type, data, updated_at)
  SELECT nursery, 'Sep 2026', wt, data, now() FROM tick_by_sheet
  ON CONFLICT (nursery, month, work_type)
  DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  RETURNING 1
)

SELECT * FROM (
  SELECT 1 AS ord, '1 CHANGED'::text AS section,
         'rows the month had differently'::text AS item,
         (SELECT count(*)::text FROM changed) AS n,
         ((SELECT count(*)::text FROM changed WHERE had_date <> want_date) || ' wrong or missing date, '
       || (SELECT count(*)::text FROM changed WHERE had_frozen <> want_qty::text) || ' wrong capacity, '
       || (SELECT count(*)::text FROM changed WHERE had_checked = 0) || ' not ticked')::text AS detail

  UNION ALL
  SELECT 1, '1 CHANGED', 'rows matched and confirmed',
         (SELECT count(*)::text FROM pair),
         'every row of a plot whose counts agree'

  UNION ALL
  SELECT 2, '2 SKIPPED', (s.plot || '  ' || s.jenis)::text, s.in_month::text,
         ('the sheet has ' || s.on_sheet::text || ' rows here, the month has '
          || s.in_month::text || ' -- left alone')::text
    FROM skipped s

  UNION ALL
  SELECT 3, '3 TOTAL', (x.nursery || '  ' || x.wt)::text,
         to_char(sum(x.qty), 'FM999G999G999'),
         'what this nursery and job should now add up to'
    FROM sheet x GROUP BY x.nursery, x.wt

  UNION ALL
  SELECT 9, '9 VERDICT', 'rows changed', (SELECT count(*)::text FROM changed),
         CASE WHEN (SELECT count(*) FROM skipped) > 0
              THEN 'some plots were skipped -- see 2 SKIPPED above'
              ELSE 'run it again and this should read 0' END
) z
ORDER BY ord, item, detail;
