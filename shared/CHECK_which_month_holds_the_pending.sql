-- CHECK_which_month_holds_the_pending.sql
--
-- WHICH MONTH AND NURSERY THE PENDING ROWS ARE IN.
--
-- Work Records draws ONE month of ONE nursery, and the two tab figures are
-- worked out from that slice alone:
--
--     Approved = a scheduled row carrying a verified phone record
--                (_fieldIds), or the old gaia tick, or Checked
--     Pending  = every other scheduled row of that month and nursery,
--                plus any phone submission nobody has approved that no
--                scheduled row claims
--
-- So a month that reads 2 and a month that reads 100 are two different
-- questions, and the header on the screen says which one is being asked.
-- This answers it for EVERY month and nursery at once, off the data, so
-- nobody has to step the month arrow hunting for a figure.
--
-- READ IT LIKE THIS: find the line whose PENDING matches the number you
-- remember. That is the month and the nursery that list was drawn for.
--
-- Nothing is written. It is safe to run as often as you like.

WITH blob AS (
  SELECT e
  FROM nops_maint_records,
       LATERAL jsonb_array_elements(records) AS e
  WHERE id = 1
    AND jsonb_typeof(records) = 'array'
),
rows_ AS (
  SELECT
    COALESCE(NULLIF(TRIM(e ->> '_month'), ''), 'no month on the row') AS mon,
    UPPER(TRIM(COALESCE(e ->> 'plot', ''))) AS plot,
    CASE
      WHEN (e ->> 'checked') IN ('1', 'true') THEN 1
      WHEN (e ->> 'gaia') IN ('1', 'true') THEN 1
      WHEN jsonb_typeof(e -> '_fieldIds') = 'array'
           AND jsonb_array_length(e -> '_fieldIds') > 0 THEN 1
      ELSE 0
    END AS approved
  FROM blob
),
placed AS (
  SELECT
    r.mon,
    r.plot,
    r.approved,
    COALESCE(
      (SELECT UPPER(TRANSLATE(c.nursery, ' -_', ''))
         FROM nops_maint_custom_plots c
        WHERE UPPER(TRANSLATE(c.plot_name, ' -_', '')) = TRANSLATE(r.plot, ' -_', '')
        LIMIT 1),
      CASE LEFT(r.plot, 1)
        WHEN 'P' THEN 'PN'
        WHEN 'B' THEN 'BNN'
        WHEN 'U' THEN 'UNN1'
        WHEN 'N' THEN 'UNN2'
        ELSE 'places nowhere'
      END
    ) AS nursery
  FROM rows_ r
),
sched AS (
  SELECT
    nursery,
    mon,
    COUNT(*) FILTER (WHERE approved = 0) AS pend,
    COUNT(*) FILTER (WHERE approved = 1) AS appr
  FROM placed
  GROUP BY nursery, mon
),
phone AS (
  SELECT
    COALESCE(
      NULLIF(TRIM(f.schedule_month), ''),
      CASE WHEN f.work_date IS NULL THEN 'no month on the record'
           ELSE TO_CHAR(f.work_date, 'Mon YYYY') END
    ) AS mon,
    COALESCE(
      (SELECT UPPER(TRANSLATE(c.nursery, ' -_', ''))
         FROM nops_maint_custom_plots c
        WHERE UPPER(TRANSLATE(c.plot_name, ' -_', ''))
              = UPPER(TRANSLATE(COALESCE(f.plot_name, ''), ' -_', ''))
        LIMIT 1),
      CASE LEFT(UPPER(TRIM(COALESCE(f.plot_name, ''))), 1)
        WHEN 'P' THEN 'PN'
        WHEN 'B' THEN 'BNN'
        WHEN 'U' THEN 'UNN1'
        WHEN 'N' THEN 'UNN2'
        ELSE 'places nowhere'
      END
    ) AS nursery
  FROM nops_maint_field_records f
  WHERE f.verified_at IS NULL
    AND f.rejected_at IS NULL
),
waiting AS (
  SELECT nursery, mon, COUNT(*) AS waits
  FROM phone
  GROUP BY nursery, mon
),
joined AS (
  SELECT
    COALESCE(s.nursery, w.nursery) AS nursery,
    COALESCE(s.mon, w.mon) AS mon,
    COALESCE(s.pend, 0) AS pend,
    COALESCE(s.appr, 0) AS appr,
    COALESCE(w.waits, 0) AS waits
  FROM sched s
  FULL JOIN waiting w
    ON w.nursery = s.nursery AND w.mon = s.mon
)
SELECT
  nursery AS "Nursery",
  mon AS "Month on the screen",
  pend AS "Scheduled rows PENDING",
  waits AS "Phone records waiting",
  pend + waits AS "What the Pending tab reads at most",
  appr AS "What the Approved tab reads"
FROM joined
WHERE pend + waits + appr > 0
ORDER BY (pend + waits) DESC, nursery, mon;
