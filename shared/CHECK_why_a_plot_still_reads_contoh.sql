-- ============================================================================
-- CHECK_why_a_plot_still_reads_contoh.sql
--
-- The office, over a PALMS board row reading
--     B3 | Membesar | 18 Aug 2026 | 91D OVER | 17 Aug 2026 - Contoh
--
--     为什么这个还是contoh？
--
-- CONTOH IS NOT A WORD THE BOARD INVENTS. It is the real recorded_by of a
-- real row, and that row was GENERATED rather than keyed: a fresh install of
-- the 555 FC Portal seeds itself with a made-up plot log so there is
-- something on screen before anybody has recorded a day, and every seeded
-- entry is stamped Contoh. For such a row the honest answer to who last
-- updated this plot is NOBODY.
--
-- The app cannot send one any more. src/modules/palms/data.js marks every
-- seeded entry and every seeded daily report demo, and sync.js refuses both
--   entries:  if (e.uid and not e.demo)
--   reports:  filter h not h.demo
-- The flag was added AFTER the first version that synced, so a device that
-- pushed before it carries its sample log on the server to this day.
--
-- WHERE THE BOARD READS THE CELL FROM, which is what this check answers.
-- plotLine in shared_palms.js builds Last update out of TWO tables and shows
-- whichever happened LATER, a tie going to the daily report:
--     fcportal_palms_history     one row per unit per day, the daily report
--     fcportal_palms_plot_logs   the newest log entry start date, the fallback
-- So a plot reads Contoh because of a sample LOG ENTRY, or because of a
-- sample DAILY REPORT, or both -- and the first case is the worse one,
-- because then the stage, the due date and the days-over on that line were
-- generated too. B3 is Membesar due the DAY AFTER it started, which is not
-- what a 270 day stage looks like.
--
-- Read only. Nothing is changed. Needs the PALMS tables.
--
-- WHAT THE RESULT LOOKS LIKE, one result set:
--   section 1  whether a delete would be PERMANENT. migration_palms_no_takebacks
--              .sql puts an AFTER DELETE trigger on the plot log that leaves a
--              tombstone, and a tombstoned row can never be inserted again by
--              any phone, old build included. Without it, deleting is a repair
--              of today and the phones put their copies back within hours.
--              READ THIS ROW FIRST.
--   section 2  how many sample rows there are, on each table, over how many plots
--   section 3  one row per plot: where its Contoh comes from, which sample
--              stages are still OPEN on it, what the board reads today, and
--              what it would read once the sample rows went. OFF THE BOARD
--              means that plot has no real log entry at all, so it leaves the
--              board entirely -- which is the truth, nobody ever keyed it.
--   section 4  when the sample rows LANDED. A created_at from the last few
--              weeks means a phone is still pushing them and the tombstone
--              guard in section 1 is what has to go in first.
--   section 5  every recorded_by on the plot log with a count. Anything that
--              is not Contoh is real work.
--   Sections 2 to 4 saying nothing to report means no sample row survives and
--   the board cannot be showing Contoh anywhere.
-- ============================================================================

WITH stage AS (
  SELECT s.sort_order::int AS n, s.name, s.ideal_days
    FROM public.nops_plot_status_stages s
),
demo_log AS (
  SELECT * FROM public.fcportal_palms_plot_logs WHERE recorded_by = 'Contoh'
),
demo_hist AS (
  SELECT * FROM public.fcportal_palms_history WHERE recorded_by = 'Contoh'
),
units AS (
  SELECT plot_name AS k FROM demo_log
  UNION
  SELECT unit_key  AS k FROM demo_hist
),
-- The newest log entry per plot, sample rows included: what the board reads
-- today. Newest start, then the highest seq_no, which is logsFromRows own sort.
now_log AS (
  SELECT l.plot_name AS k, l.start_date, l.recorded_by,
         row_number() OVER (PARTITION BY l.plot_name
                            ORDER BY l.start_date DESC, COALESCE(l.seq_no, 0) DESC) AS rn
    FROM public.fcportal_palms_plot_logs l
),
now_hist AS (
  SELECT h.unit_key AS k, h.at_date, h.recorded_by,
         row_number() OVER (PARTITION BY h.unit_key ORDER BY h.at_date DESC) AS rn
    FROM public.fcportal_palms_history h
),
-- And the same two reads with the sample rows gone: what it would read after.
aft_log AS (
  SELECT l.plot_name AS k, l.start_date, l.recorded_by,
         row_number() OVER (PARTITION BY l.plot_name
                            ORDER BY l.start_date DESC, COALESCE(l.seq_no, 0) DESC) AS rn
    FROM public.fcportal_palms_plot_logs l
   WHERE l.recorded_by IS DISTINCT FROM 'Contoh'
),
aft_hist AS (
  SELECT h.unit_key AS k, h.at_date, h.recorded_by,
         row_number() OVER (PARTITION BY h.unit_key ORDER BY h.at_date DESC) AS rn
    FROM public.fcportal_palms_history h
   WHERE h.recorded_by IS DISTINCT FROM 'Contoh'
),
line AS (
  SELECT u.k,
         nl.start_date AS l_at,  nl.recorded_by AS l_by,
         nh.at_date    AS h_at,  nh.recorded_by AS h_by,
         al.start_date AS al_at, al.recorded_by AS al_by,
         ah.at_date    AS ah_at, ah.recorded_by AS ah_by
    FROM units u
    LEFT JOIN now_log  nl ON nl.k = u.k AND nl.rn = 1
    LEFT JOIN now_hist nh ON nh.k = u.k AND nh.rn = 1
    LEFT JOIN aft_log  al ON al.k = u.k AND al.rn = 1
    LEFT JOIN aft_hist ah ON ah.k = u.k AND ah.rn = 1
)

SELECT 1 AS section, '-' AS plot,
       'is a delete permanent' AS what,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'palms_log_bury'
                            AND tgrelid = to_regclass('public.fcportal_palms_plot_logs'))
            THEN 'YES -- the tombstone trigger is installed, so a deleted entry can never be inserted again by any phone'
            ELSE 'NO -- migration_palms_no_takebacks.sql has NOT been run. Run that FIRST or the phones will put every sample row back'
       END AS detail,
       CASE WHEN to_regclass('public.fcportal_palms_tombstones') IS NOT NULL
            THEN 'tombstone table: present'
            ELSE 'tombstone table: MISSING' END AS reads_now,
       'the daily report table carries no tombstone, so section 4 is how you tell a phone is still pushing one' AS reads_after

UNION ALL
SELECT 2, '-', 'sample rows on the server',
       (SELECT count(*) FROM demo_log)::text || ' log entries on '
         || (SELECT count(DISTINCT plot_name) FROM demo_log)::text || ' plots, '
         || (SELECT count(*) FROM demo_log WHERE end_date IS NULL)::text || ' of them still OPEN',
       (SELECT count(*) FROM demo_hist)::text || ' daily reports on '
         || (SELECT count(DISTINCT unit_key) FROM demo_hist)::text || ' units',
       (SELECT count(*) FROM units)::text || ' plots read Contoh somewhere'
 WHERE EXISTS (SELECT 1 FROM units)

UNION ALL
SELECT 2, '-', 'sample rows on the server', 'nothing to report',
       'no row on either table is recorded_by Contoh', 'the board cannot be showing it anywhere'
 WHERE NOT EXISTS (SELECT 1 FROM units)

UNION ALL
SELECT 3, ln.k, 'where the Contoh comes from',
       CASE WHEN EXISTS (SELECT 1 FROM demo_log d WHERE d.plot_name = ln.k)
             AND EXISTS (SELECT 1 FROM demo_hist d WHERE d.unit_key  = ln.k)
            THEN 'the log AND the daily report'
            WHEN EXISTS (SELECT 1 FROM demo_log d WHERE d.plot_name = ln.k)
            THEN 'the log only -- so the stage, the due date and the days over were generated too'
            ELSE 'the daily report only -- the stage on the line is real work'
       END
       || COALESCE('. Sample stages still open: ' || (
            SELECT string_agg(COALESCE(st.name, 'stage ' || d.act_n::text)
                     || ' since ' || to_char(d.start_date, 'DD Mon YYYY')
                     || ', ideal ' || COALESCE(d.ideal_days::text, '-') || ' days'
                     || COALESCE(' (the stage list says ' || st.ideal_days::text || ')', ''),
                   '; ' ORDER BY d.start_date)
              FROM demo_log d
              LEFT JOIN stage st ON st.n = d.act_n
             WHERE d.plot_name = ln.k AND d.end_date IS NULL), ''),
       CASE WHEN ln.l_at IS NULL THEN 'not on the board (no log entry)'
            WHEN ln.h_at IS NOT NULL AND ln.h_at >= ln.l_at
            THEN to_char(ln.h_at, 'DD Mon YYYY') || ' - ' || COALESCE(ln.h_by, COALESCE(ln.l_by, '?'))
            ELSE to_char(ln.l_at, 'DD Mon YYYY') || ' - ' || COALESCE(ln.l_by, COALESCE(ln.h_by, '?'))
       END,
       CASE WHEN ln.al_at IS NULL
            THEN 'OFF THE BOARD -- no real log entry left on this plot'
            WHEN ln.ah_at IS NOT NULL AND ln.ah_at >= ln.al_at
            THEN to_char(ln.ah_at, 'DD Mon YYYY') || ' - ' || COALESCE(ln.ah_by, COALESCE(ln.al_by, '?'))
            ELSE to_char(ln.al_at, 'DD Mon YYYY') || ' - ' || COALESCE(ln.al_by, COALESCE(ln.ah_by, '?'))
       END
  FROM line ln

UNION ALL
SELECT 4, '-', 'when the sample rows landed',
       'plot log: ' || COALESCE(to_char((SELECT min(created_at) FROM demo_log), 'DD Mon YYYY'), '-')
         || ' to ' || COALESCE(to_char((SELECT max(created_at) FROM demo_log), 'DD Mon YYYY'), '-'),
       'daily report: ' || COALESCE(to_char((SELECT min(created_at) FROM demo_hist), 'DD Mon YYYY'), '-')
         || ' to ' || COALESCE(to_char((SELECT max(created_at) FROM demo_hist), 'DD Mon YYYY'), '-'),
       CASE WHEN GREATEST(COALESCE((SELECT max(created_at) FROM demo_log),  '-infinity'::timestamptz),
                          COALESCE((SELECT max(created_at) FROM demo_hist), '-infinity'::timestamptz))
                 > now() - interval '60 days'
            THEN 'A SAMPLE ROW LANDED IN THE LAST 60 DAYS -- a phone is still pushing them'
            ELSE 'nothing new in the last 60 days -- these are old rows nobody is resending'
       END
 WHERE EXISTS (SELECT 1 FROM units)

UNION ALL
SELECT 5, COALESCE(l.recorded_by, 'nobody named'), 'keyed by',
       count(*)::text || ' log entries on ' || count(DISTINCT l.plot_name)::text || ' plots',
       CASE WHEN l.recorded_by = 'Contoh' THEN 'GENERATED -- not a person' ELSE 'real work' END,
       to_char(min(l.start_date), 'DD Mon YYYY') || ' to ' || to_char(max(l.start_date), 'DD Mon YYYY')
  FROM public.fcportal_palms_plot_logs l
 GROUP BY l.recorded_by

ORDER BY 1, 2;
