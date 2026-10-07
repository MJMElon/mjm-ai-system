-- =====================================================================
--  A JOB THE OFFICE CAN SEE AND THE PHONES HISTORY CANNOT
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  The two screens read the same table and ask different questions of
--  it, and that is where a record goes missing from one of them.
--
--    The OFFICES Work Maintenance List decides which nursery a job
--    belongs to by looking at its PLOT. A record keyed against N14 is
--    UNN 2s because N14 is UNN 2s, whatever the record itself says.
--
--    The PHONES History compares the nursery WRITTEN ON THE RECORD
--    with the nursery picked at the top of the screen, spelling for
--    spelling. A record whose nursery_name is empty, or spelt any other
--    way than shared_plots spells it, can never match that pick — so it
--    is on the office list and nowhere on the phone.
--
--  It also catches the two other ways a record drops out of History:
--  the phone keeps only the newest 500 records, and a record with no
--  work date at all sorts to the front of that list and eats the room.
--
--  EVERY RECORD OF THE LAST 90 DAYS is examined, not the three somebody
--  noticed — a nursery name written one way once is written that way
--  every time, so the rest are there too. Change the 90 if you want to
--  look further back.
--
--  WHAT A GOOD RESULT LOOKS LIKE
--    Every row reading "the phone should show this" in the verdict
--    column, and nothing above them. The rows are ordered worst first,
--    so anything that needs attention is at the top.
--
--    "record says X, the plot is in Y"  the record carries a nursery
--        name the plot does not have. Pick X on the phone and it
--        appears, and it will never appear under Y. This is the usual
--        answer, and the repair is to set the records nursery_name to
--        the plots own.
--
--    "no nursery on the record"  nursery_name is empty. The phone can
--        match no pick at all, so History never shows it anywhere.
--
--    "shared_plots has no such plot"  nothing in the nursery list
--        claims this plot, so neither screen can place it. Usually a
--        plot keyed with a different spelling.
--
--    "outside the newest 500 the phone loads"  there are more than 500
--        records newer than this one. Nothing is wrong with the record — the
--        phone simply stops there.
--
--    not_verified = yes means the office list shows no tick, no batch
--        link and no walk against it — the record is on the phone and
--        has not been checked. That is the opposite complaint and is
--        listed so the two are not confused.
-- =====================================================================
WITH plots AS (
  SELECT upper(btrim(plot_name)) AS pkey,
         min(nursery_name)       AS plot_nursery
  FROM shared_plots
  WHERE coalesce(btrim(plot_name), '') <> ''
  GROUP BY 1
),
recent AS (
  SELECT r.id, r.work_date, r.plot_name, r.nursery_name, r.jenis,
         r.reported_by, r.worked_by, r.verified_at, r.rejected_at,
         -- Where this record sits in the list the phone loads: newest
         -- work date first, and a record with no date at the very front.
         row_number() OVER (ORDER BY r.work_date DESC NULLS FIRST, r.id DESC) AS newest_rank
  FROM nops_maint_field_records r
  WHERE r.work_date IS NULL
     OR r.work_date >= current_date - 90
),
judged AS (
  SELECT f.*,
         p.plot_nursery,
         -- The loose comparison, for telling "spelt differently" from
         -- "a different nursery altogether". No regex: the editor has
         -- choked on one before, and two replaces do the same work.
         replace(replace(upper(btrim(coalesce(f.nursery_name, ''))), ' ', ''), '-', '') AS rec_key,
         replace(replace(upper(btrim(coalesce(p.plot_nursery, ''))), ' ', ''), '-', '') AS plot_key
  FROM recent f
  LEFT JOIN plots p ON p.pkey = upper(btrim(f.plot_name))
)
SELECT
  CASE
    WHEN coalesce(btrim(nursery_name), '') = ''
      THEN 'no nursery on the record'
    WHEN plot_nursery IS NULL
      THEN 'shared_plots has no such plot'
    WHEN nursery_name <> plot_nursery
      THEN 'record says ' || nursery_name || ', the plot is in ' || plot_nursery
    WHEN newest_rank > 500
      THEN 'outside the newest 500 the phone loads'
    ELSE 'the phone should show this'
  END                                                           AS verdict,
  CASE
    WHEN coalesce(btrim(nursery_name), '') <> ''
     AND plot_nursery IS NOT NULL
     AND nursery_name <> plot_nursery
     AND rec_key = plot_key
      THEN 'yes — same nursery, spelt differently'
    ELSE ''
  END                                                           AS same_nursery_other_spelling,
  work_date,
  plot_name,
  coalesce(nursery_name, '')                                    AS nursery_on_record,
  coalesce(plot_nursery, '')                                    AS nursery_of_the_plot,
  coalesce(jenis, '')                                           AS job,
  coalesce(worked_by, reported_by, '')                          AS credited_to,
  CASE WHEN verified_at IS NULL THEN 'yes' ELSE '' END          AS not_verified,
  CASE WHEN rejected_at IS NULL THEN '' ELSE 'yes' END          AS sent_back,
  newest_rank,
  id
FROM judged
ORDER BY
  CASE
    WHEN coalesce(btrim(nursery_name), '') = ''   THEN 1
    WHEN plot_nursery IS NULL                     THEN 2
    WHEN nursery_name <> plot_nursery             THEN 3
    WHEN newest_rank > 500                        THEN 4
    ELSE 9
  END,
  work_date DESC NULLS FIRST,
  plot_name,
  id;
