-- ================================================================
-- CHECK: Loading Seedlings, October 2026, against the office PDF
-- (Borang Tuntutan Gaji BNN, UNN1 and UNN2, Loading Seedling Payroll Oct26)
--
-- Every DO on the PDF, with the workers the PDF ticks, beside the workers
-- the system has ticked on that DO for the same gang. Names are compared
-- as a SET, so the order they were ticked in does not matter. The PDF
-- short names are matched to the register spelling (Wira Wijayadi is
-- Wira Wijaya, Anton Rosidi is Anton, Faiz Sapriansah is Faiz, and so on).
--
-- The gang is the nursery of the workers ticked, which is not always the
-- nursery of the plot: DO-NPGCE401 and DO-0HVUL302 are N16 (UNN2) DOs the
-- UNN1 gang loaded, and they are checked under UNN1.
--
-- The last lines name any October DO in the system that is NOT on the PDF
-- (CAL- and cancelled DOs are left out, as the sheet leaves them out).
--
-- Reads only. Changes nothing. Safe to run any number of times.
--
-- WHAT A GOOD RESULT LOOKS LIKE: the first line reads
-- "SAME -- every PDF DO matches" and every DO line reads SAME.
-- A line reading DIFFERENT names who the PDF has and the system has not
-- (pdf_only) and who the system has and the PDF has not (system_only).
-- ================================================================
WITH pdf(id, do_date, pdf_section, pdf_do, gang, pdf_workers) AS (VALUES
  (597, '2026-10-01', 'BNN', '03716', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (606, '2026-10-02', 'UNN1', '03658', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (607, '2026-10-02', 'UNN1', '03658', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (608, '2026-10-02', 'UNN1', '03658', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (645, '2026-10-02', 'UNN1', '03659', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (611, '2026-10-02', 'BNN', '03717', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (605, '2026-10-02', 'BNN', '03718', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (644, '2026-10-02', 'BNN', '03721', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (604, '2026-10-02', 'BNN', '03722', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (609, '2026-10-02', 'BNN', '03722', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (610, '2026-10-02', 'BNN', '03723', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (617, '2026-10-03', 'BNN', '03719', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (613, '2026-10-03', 'BNN', '03724', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (614, '2026-10-03', 'BNN', '03724', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (615, '2026-10-03', 'BNN', '03725', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (612, '2026-10-03', 'BNN', '03726', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (616, '2026-10-03', 'BNN', '03727', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (624, '2026-10-03', 'BNN', '03728', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (618, '2026-10-03', 'BNN', '03729', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (619, '2026-10-03', 'BNN', '03730', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (621, '2026-10-05', 'UNN1', '03660', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (622, '2026-10-05', 'UNN1', '03661', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (623, '2026-10-05', 'BNN', '03731', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (620, '2026-10-05', 'BNN', '03732', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (625, '2026-10-05', 'BNN', '03733', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (626, '2026-10-05', 'BNN', '03734', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (652, '2026-10-06', 'UNN1', '03662', 'UNN1', '["Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (653, '2026-10-06', 'UNN1', '03663', 'UNN1', '["Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (627, '2026-10-06', 'BNN', '03735', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (628, '2026-10-06', 'BNN', '03735', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (631, '2026-10-06', 'BNN', '03736', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (632, '2026-10-06', 'BNN', '03737', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (633, '2026-10-06', 'BNN', '03738', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (634, '2026-10-06', 'BNN', '03739', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (629, '2026-10-06', 'BNN', '03740', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (651, '2026-10-06', 'BNN', '03741', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (636, '2026-10-06', 'BNN', '03742', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (637, '2026-10-06', 'BNN', '03743', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (635, '2026-10-06', 'BNN', '03749', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (630, '2026-10-06', 'UNN2', '03799', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (639, '2026-10-06', 'UNN2', '03800', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (641, '2026-10-07', 'UNN1', '03664', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (642, '2026-10-07', 'UNN1', '03665', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (640, '2026-10-07', 'BNN', '03744', 'BNN', '["Faiz", "Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (650, '2026-10-07', 'BNN', '03745', 'BNN', '["Faiz", "Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (646, '2026-10-07', 'BNN', '03746', 'BNN', '["Faiz", "Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (647, '2026-10-07', 'BNN', '03747', 'BNN', '["Faiz", "Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (649, '2026-10-07', 'BNN', '03748', 'BNN', '["Faiz", "Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (643, '2026-10-07', 'UNN2', '03801', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (648, '2026-10-07', 'UNN2', '03802', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (657, '2026-10-08', 'UNN1', '03666', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (658, '2026-10-08', 'UNN1', '03667', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (661, '2026-10-08', 'BNN', '03750', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (654, '2026-10-08', 'UNN2', '03803', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (655, '2026-10-08', 'UNN2', '03804', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (656, '2026-10-08', 'UNN2', '03806', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (684, '2026-10-08', 'BNN', '03807', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (664, '2026-10-08', 'UNN2', '03808', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (666, '2026-10-08', 'UNN2', '03809', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (669, '2026-10-08', 'UNN2', '03810', 'UNN2', '["Awaludin", "LUKMAN SIREGAR", "Muhamad Azhar"]'::jsonb),
  (663, '2026-10-08', 'BNN', '03851', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (665, '2026-10-08', 'BNN', '03852', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (686, '2026-10-09', 'UNN1', '03668', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (687, '2026-10-09', 'UNN1', '03669', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (680, '2026-10-09', 'BNN', '03805', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (676, '2026-10-09', 'UNN2', '03811', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (679, '2026-10-09', 'UNN2', '03812', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (677, '2026-10-09', 'UNN2', '03813', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (681, '2026-10-09', 'UNN2', '03814', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (685, '2026-10-09', 'UNN2', '03815', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (683, '2026-10-09', 'UNN2', '03816', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (678, '2026-10-09', 'BNN', '03853', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (682, '2026-10-09', 'BNN', '03854', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (695, '2026-10-12', 'UNN1', '03670', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (697, '2026-10-12', 'UNN1', '03671', 'UNN1', '["Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (698, '2026-10-12', 'UNN1', '03672', 'UNN1', '["Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (689, '2026-10-12', 'UNN1', '03673', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (696, '2026-10-12', 'UNN1', '03674', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (691, '2026-10-12', 'UNN1', '03675', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (692, '2026-10-12', 'UNN1', '03676', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (693, '2026-10-12', 'UNN1', '03677', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (699, '2026-10-12', 'UNN1', '03678', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (703, '2026-10-12', 'UNN1', '03679', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (702, '2026-10-12', 'UNN1', '03680', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (688, '2026-10-12', 'UNN2', '03817', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (690, '2026-10-12', 'UNN2', '03818', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (694, '2026-10-12', 'UNN2', '03819', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (705, '2026-10-13', 'UNN1', '03681', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (709, '2026-10-13', 'UNN1', '03682', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (714, '2026-10-13', 'UNN1', '03683', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (712, '2026-10-13', 'UNN1', '5CKEN30FFMV6DS373', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (708, '2026-10-13', 'UNN1', 'B1XWP501', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (710, '2026-10-13', 'UNN1', 'CZPAH601', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (711, '2026-10-13', 'UNN1', 'H7AGM701', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (706, '2026-10-13', 'UNN1', 'R4S0M601', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (713, '2026-10-13', 'UNN1', 'SBTX31', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (736, '2026-10-14', 'UNN2', '03687', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (725, '2026-10-14', 'UNN2', '0HVUL301', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (719, '2026-10-14', 'UNN2', 'GAG1Z601', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (723, '2026-10-14', 'UNN2', 'GAG1Z602', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (724, '2026-10-14', 'UNN2', 'L4QE7501', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (722, '2026-10-14', 'UNN1', 'X4KX6401', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (716, '2026-10-14', 'UNN1', 'X7WRS401', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (717, '2026-10-14', 'UNN2', 'Z4BR9501', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (720, '2026-10-14', 'UNN2', 'Z4BR9502', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (721, '2026-10-14', 'UNN2', 'Z4BR9503', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (733, '2026-10-15', 'UNN2', '03820', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (737, '2026-10-15', 'UNN2', '0HVUL302', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (741, '2026-10-15', 'UNN2', '3K7QH001', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (729, '2026-10-15', 'UNN2', '6HAH8701', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (727, '2026-10-15', 'UNN2', '9QUQR201', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (740, '2026-10-15', 'UNN2', '9TV5C601', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (732, '2026-10-15', 'BNN', 'CJFU8301', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (731, '2026-10-15', 'UNN1', 'JAN42001', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (742, '2026-10-15', 'BNN', 'JAN42002', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (734, '2026-10-15', 'UNN2', 'NPGCE401', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (730, '2026-10-15', 'UNN2', 'PGN55701', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (735, '2026-10-15', 'UNN2', 'Q31U7901', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (738, '2026-10-15', 'BNN', 'VY6BA901', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (743, '2026-10-15', 'BNN', 'VY6BA902', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (726, '2026-10-15', 'UNN2', 'Z4BR9504', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (728, '2026-10-15', 'UNN2', 'Z4BR9505', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (748, '2026-10-16', 'BNN', '41PX5101', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (747, '2026-10-16', 'UNN2', 'CJFU8302', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (752, '2026-10-16', 'UNN2', 'CJFU8303', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (744, '2026-10-16', 'UNN2', 'DYLPV001', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (745, '2026-10-16', 'UNN2', 'DYLPV002', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (746, '2026-10-16', 'BNN', 'JAN42003', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (750, '2026-10-16', 'BNN', 'JAN42004', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (751, '2026-10-16', 'UNN2', 'KBKP7301', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (749, '2026-10-16', 'UNN2', 'QJ6DU901', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (754, '2026-10-17', 'UNN2', '9HSSM801', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (753, '2026-10-17', 'UNN1', 'J3Y5F101', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (755, '2026-10-17', 'UNN2', 'SPTNM901', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (760, '2026-10-19', 'UNN2', 'A7DUK201', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (758, '2026-10-19', 'UNN2', 'AV2UE601', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (761, '2026-10-19', 'UNN1', '(long DO)', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (759, '2026-10-19', 'UNN2', 'DG20P401', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (756, '2026-10-19', 'UNN2', 'Z4BR9506', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (757, '2026-10-19', 'UNN2', 'Z4BR9507', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (767, '2026-10-20', 'UNN1', 'AV2UE602', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (762, '2026-10-20', 'UNN2', 'CJFU8304', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (768, '2026-10-20', 'UNN2', 'DFWMD001 + DFWMD002', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (769, '2026-10-20', 'UNN1', 'DFWMD002', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (766, '2026-10-20', 'UNN2', 'DG20P402', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (763, '2026-10-20', 'UNN1', 'H7AGM702', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (765, '2026-10-20', 'UNN2', 'N8KHT301', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (774, '2026-10-20', 'UNN2', 'QUM79601', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (772, '2026-10-21', 'UNN2', 'AV2QC201', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (777, '2026-10-21', 'UNN2', 'AV2QC202', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (779, '2026-10-21', 'UNN1', 'AV2UE603', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (771, '2026-10-21', 'UNN2', 'H7AGM703', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (776, '2026-10-21', 'UNN2', 'KBKP7302', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (770, '2026-10-21', 'UNN2', 'KLW0X101', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (775, '2026-10-21', 'UNN2', 'KLW0X102', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar"]'::jsonb),
  (773, '2026-10-21', 'UNN2', 'QUM79602', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (780, '2026-10-22', 'UNN2', '0XRWZ201', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (783, '2026-10-22', 'UNN1', '(long DO)', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (782, '2026-10-22', 'UNN2', 'RM7BZ701', 'UNN2', '["Awaludin"]'::jsonb),
  (781, '2026-10-22', 'UNN2', 'ZE9ZW801', 'UNN2', '["Awaludin"]'::jsonb),
  (784, '2026-10-23', 'UNN2', '586F8201', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (785, '2026-10-23', 'UNN2', 'KQ172001', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (786, '2026-10-23', 'UNN2', 'KQ172002', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (791, '2026-10-23', 'UNN2', 'KQ172003', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (787, '2026-10-23', 'UNN2', 'WSALS201', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (788, '2026-10-23', 'UNN2', 'WSALS202', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (789, '2026-10-23', 'UNN2', 'WSALS203', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (790, '2026-10-23', 'UNN2', 'WSALS204', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (797, '2026-10-26', 'BNN', '3YCSW901', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (799, '2026-10-26', 'BNN', 'CXLH4501', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (793, '2026-10-26', 'BNN', 'JAN42005', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (798, '2026-10-26', 'BNN', 'JAN42006', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (796, '2026-10-26', 'BNN', 'L6NSA701', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (794, '2026-10-26', 'BNN', 'PX6XH701', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (795, '2026-10-26', 'BNN', 'QSE0J801', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (792, '2026-10-26', 'BNN', 'SLEQQ601', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (800, '2026-10-26', 'BNN', 'YQ09P501', 'BNN', '["Wira Wijaya"]'::jsonb),
  (803, '2026-10-27', 'BNN', 'H0SGN301', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (801, '2026-10-27', 'UNN2', 'QUM79603', 'UNN2', '["Anton", "Awaludin", "LUKMAN SIREGAR", "MARWAN HAKIM", "MUSTAFA", "Muhamad Azhar", "Suhaedi"]'::jsonb),
  (802, '2026-10-27', 'UNN1', 'QUM79604', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (804, '2026-10-28', 'BNN', 'QZD2W8', 'BNN', '["Irwan Rano Kasno", "Yuyak"]'::jsonb),
  (805, '2026-10-29', 'BNN', 'BR6H8201', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (806, '2026-10-29', 'BNN', 'DMMKZ401', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Wira Wijaya", "Yuyak"]'::jsonb),
  (811, '2026-10-30', 'BNN', '7Z1DK801', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (807, '2026-10-30', 'UNN1', 'BR6H8202', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (808, '2026-10-30', 'UNN1', 'BR6H8203', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb),
  (809, '2026-10-30', 'BNN', 'DTY2M601', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (810, '2026-10-30', 'BNN', 'KKRE6701', 'BNN', '["Irwan Rano Kasno", "Muhamad Irsan", "Muhammad Choirul", "Wira Wijaya", "Yuyak"]'::jsonb),
  (812, '2026-10-31', 'UNN1', 'BR6H8204', 'UNN1', '["Haerul", "Hamzan Wadi", "Mahnum", "Mahsiruddin", "Muazzin", "Muhamad Fauzan", "Repi", "Wina"]'::jsonb)
),
cmp AS (
  SELECT p.*, d.do_number,
         COALESCE(d.worked_by_by_nursery -> p.gang, '[]'::jsonb) AS sys_workers,
         d.id IS NULL AS missing
    FROM pdf p LEFT JOIN public.shared_do_records d ON d.id = p.id
),
res AS (
  SELECT c.*,
         (NOT c.missing AND c.sys_workers @> c.pdf_workers AND c.pdf_workers @> c.sys_workers) AS same,
         (SELECT string_agg(x, ', ' ORDER BY x) FROM jsonb_array_elements_text(c.pdf_workers) x
           WHERE NOT c.sys_workers ? x) AS pdf_only,
         (SELECT string_agg(x, ', ' ORDER BY x) FROM jsonb_array_elements_text(c.sys_workers) x
           WHERE NOT c.pdf_workers ? x) AS system_only
    FROM cmp c
),
extra AS (
  SELECT d.id, d.do_number, d.delivery_date
    FROM public.shared_do_records d
   WHERE d.delivery_date BETWEEN '2026-10-01' AND '2026-10-31'
     AND COALESCE(d.status, '') <> 'Cancelled'
     AND position('[CANCELLED]' in COALESCE(d.remark, '')) = 0
     AND upper(left(COALESCE(d.do_number, ''), 4)) <> 'CAL-'
     AND d.id NOT IN (SELECT id FROM pdf)
)
SELECT 0 AS part, '' AS do_date, '' AS pdf_section, '' AS do_number, '' AS gang,
       CASE WHEN (SELECT count(*) FROM res WHERE NOT same) = 0 AND (SELECT count(*) FROM extra) = 0
            THEN 'SAME -- every PDF DO matches'
            ELSE 'NOT THE SAME -- ' || (SELECT count(*) FROM res WHERE NOT same) || ' PDF DO lines differ, '
                 || (SELECT count(*) FROM extra) || ' system DOs are not on the PDF' END AS result,
       (SELECT count(*) FROM res WHERE same) || ' of ' || (SELECT count(*) FROM res) || ' DO lines the same' AS pdf_only,
       '' AS system_only
UNION ALL
SELECT CASE WHEN same THEN 2 ELSE 1 END, do_date, pdf_section, COALESCE(do_number, pdf_do), gang,
       CASE WHEN missing THEN 'NO SUCH DO ROW' WHEN same THEN 'SAME' ELSE 'DIFFERENT' END,
       COALESCE(pdf_only, ''), COALESCE(system_only, '')
  FROM res
UNION ALL
SELECT 3, delivery_date::text, '', do_number, '', 'IN THE SYSTEM, NOT ON THE PDF', '', ''
  FROM extra
ORDER BY 1, 2, 4;
