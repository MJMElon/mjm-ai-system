-- ================================================================
-- Loading Seedlings, October 2026: the ticks put right to the office
-- Loading Seedling Payroll PDF (Borang Tuntutan Gaji, Oct26).
--
-- 53 delivery orders, each named by its row id, with the workers the PDF
-- ticks for that nursery. Only the nursery the PDF names is written, and a
-- DO is changed ONLY while it still holds exactly what it held on 12 Nov
-- 2026 when this was compared, so a tick somebody changed since is left
-- alone and named. The DO lock is left as it is.
--
-- Safe to run twice: the second run changes nothing.
--
-- WHAT A GOOD RESULT LOOKS LIKE: every DO line reads
-- "ticked as the PDF" on the first run and "already as the PDF" on the
-- second, and no line reads NOT ON THE REGISTER. A line reading
-- CHANGED SINCE was edited after the comparison and was not touched.
-- ================================================================
WITH v(id, do_number, nkey, want, was) AS (VALUES
  (640, '03744', 'BNN', '["Faiz", "Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb, '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (650, '03745', 'BNN', '["Faiz", "Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb, '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (646, '03746', 'BNN', '["Faiz", "Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb, '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (647, '03747', 'BNN', '["Faiz", "Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb, '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (649, '03748', 'BNN', '["Faiz", "Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb, '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (663, '03851', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb, '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (732, 'DO-CJFU8301', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb, '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Nurbiah Sido", "Wira Wijaya"]'::jsonb),
  (738, 'DO-VY6BA901', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb, '["Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (750, 'DO-JAN42004', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb, '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (809, 'DO-DTY2M601', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb, '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya"]'::jsonb),
  (810, 'DO-KKRE6701', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb, '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya"]'::jsonb),
  (811, 'DO-7Z1DK801', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb, '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya"]'::jsonb),
  (652, '03662', 'UNN1', '["Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb, '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (653, '03663', 'UNN1', '["Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb, '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (686, '03668', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb, '["Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (697, '03671', 'UNN1', '["Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb, '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (716, 'DO-X7WRS401', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb, '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi"]'::jsonb),
  (722, 'DO-X4KX6401', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb, '["Mahnum", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (802, 'DO-QUM79604', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb, '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi"]'::jsonb),
  (676, '03811', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '[]'::jsonb),
  (679, '03812', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '[]'::jsonb),
  (677, '03813', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '[]'::jsonb),
  (681, '03814', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '[]'::jsonb),
  (683, '03816', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '[]'::jsonb),
  (688, '03817', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '[]'::jsonb),
  (690, '03818', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '[]'::jsonb),
  (694, '03819', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '[]'::jsonb),
  (727, 'DO-9QUQR201', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (728, 'DO-Z4BR9505', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (740, 'DO-9TV5C601', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (741, 'DO-3K7QH001', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (751, 'DO-KBKP7301', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (755, 'DO-SPTNM901', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "Awaludin", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (756, 'DO-Z4BR9506', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (757, 'DO-Z4BR9507', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (759, 'DO-DG20P401', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "Awaludin", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (758, 'DO-AV2UE601', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (760, 'DO-A7DUK201', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (762, 'DO-CJFU8304', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (765, 'DO-N8KHT301', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (768, 'DO-DFWMD001', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA"]'::jsonb),
  (770, 'DO-KLW0X101', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (771, 'DO-H7AGM703', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (772, 'DO-AV2QC201', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (777, 'DO-AV2QC202', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (780, 'DO-0XRWZ201', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (785, 'DO-KQ172001', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (786, 'DO-KQ172002', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (787, 'DO-WSALS201', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (788, 'DO-WSALS202', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (789, 'DO-WSALS203', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (790, 'DO-WSALS204', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (791, 'DO-KQ172003', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb, '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb)
),
up AS (
  UPDATE public.shared_do_records d
     SET worked_by_by_nursery = COALESCE(d.worked_by_by_nursery, '{}'::jsonb) || jsonb_build_object(v.nkey, v.want)
    FROM v
   WHERE d.id = v.id
     AND COALESCE(d.worked_by_by_nursery -> v.nkey, '[]'::jsonb) @> v.was
     AND v.was @> COALESCE(d.worked_by_by_nursery -> v.nkey, '[]'::jsonb)
     AND jsonb_array_length(COALESCE(d.worked_by_by_nursery -> v.nkey, '[]'::jsonb)) = jsonb_array_length(v.was)
  RETURNING d.id
),
names(n) AS (SELECT DISTINCT jsonb_array_elements_text(want) FROM v)
SELECT 1 AS part, v.do_number AS what, v.nkey AS nursery,
       CASE WHEN d.id IS NULL THEN 'NO SUCH DO ROW'
            WHEN EXISTS (SELECT 1 FROM up WHERE up.id = v.id) THEN 'ticked as the PDF'
            WHEN COALESCE(d.worked_by_by_nursery -> v.nkey, '[]'::jsonb) @> v.want
             AND v.want @> COALESCE(d.worked_by_by_nursery -> v.nkey, '[]'::jsonb) THEN 'already as the PDF'
            ELSE 'CHANGED SINCE -- not touched, now ' || COALESCE((d.worked_by_by_nursery -> v.nkey)::text, 'nobody') END AS result,
       v.want::text AS workers
  FROM v LEFT JOIN public.shared_do_records d ON d.id = v.id
UNION ALL
SELECT 2, n, '', 'NOT ON THE REGISTER -- this tick will show no column', ''
  FROM names
 WHERE NOT EXISTS (SELECT 1 FROM public.mjmnpayroll_workers w WHERE trim(w.full_name) = names.n)
ORDER BY 1, 2;
