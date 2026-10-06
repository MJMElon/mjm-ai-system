-- ════════════════════════════════════════════════════════════════════════
-- THE WORKER RECORD AGAINST WHAT THE FC PORTAL ACTUALLY RECORDED
-- shared/CHECK_worker_record_vs_fc_history.sql
--
-- Read-only. Nothing is created, changed or deleted.
--
-- Set the nursery and the month on the two lines marked below, then run the
-- whole file.
--
-- TWO ANSWERS TO ONE QUESTION
--
-- The offices Worker Record says who it has TICKED on a row, and that tick
-- is what the salary claim divides the plots capacity among. The FC Portals
-- history says who actually DID the work, out of the conductors own record:
-- worked_by where he named the crew, and the person who reported it when he
-- did not.
--
-- They are meant to be the same people. Where they are not, the claim is
-- paying the wrong list or paying nobody, and neither screen says so on its
-- own — which is why this asks both at once.
--
-- WHAT EACH VERDICT MEANS
--
--   agree                both sides name the same people, on the SAME DAY
--   NOT ON THE CLAIM     the field recorded who did it and the office has
--                        ticked nobody, so the plots capacity is paid to
--                        nobody at all. This is the one that costs money
--   office only          ticked here, nothing in the FC Portal for it — an
--                        office record of work the phone never carried
--   DIFFERENT NAMES      both sides answered and the lists do not match
--   nobody either side   no tick and no field record
--
-- The last line counts them. Good is everything on "agree" or "office only".
-- ════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 'BNN'::text      AS nursery,     -- the nursery, as shared_plots spells it
         '2026-09'::text  AS ym,          -- the month the work was done in
         'Sep 2026'::text AS month_label  -- the same month, as the ticks key it
),

jobs (code, jenis) AS (VALUES
  ('pd',       'Penyemburan racun kulat dan serangga'),
  ('manuring', 'Membaja'),
  ('weeding',  'Merumput'),
  ('interrow', 'Meracun rumput secara selingan')
),

plots AS (
  SELECT upper(replace(replace(replace(btrim(p.plot_name), ' ', ''), '-', ''), '_', '')) AS pk
    FROM shared_plots p, params pa
   WHERE upper(replace(replace(replace(COALESCE(p.nursery_name, ''), ' ', ''), '-', ''), '_', ''))
       = upper(replace(replace(replace(pa.nursery, ' ', ''), '-', ''), '_', ''))
),

-- The work-record rows of this nursery and month.
recs AS (
  SELECT COALESCE(e.rec->>'id', '')                    AS rec_id,
         btrim(COALESCE(e.rec->>'plot', ''))           AS plot,
         btrim(COALESCE(e.rec->>'jenis', ''))          AS jenis,
         btrim(COALESCE(e.rec->>'tarikh', ''))         AS tarikh,
         CASE WHEN COALESCE(e.rec->>'checked', '0') IN ('1', 'true')
              THEN 'checked' ELSE 'not checked' END    AS checked
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) AS e(rec)
    JOIN plots pl
      ON pl.pk = upper(replace(replace(replace(btrim(COALESCE(e.rec->>'plot', '')), ' ', ''), '-', ''), '_', ''))
   WHERE m.id = 1
     AND btrim(COALESCE(e.rec->>'_month', '')) = (SELECT month_label FROM params)
),

-- Who the office ticked, per record. data is { recordId: { name: 1 } }.
ticks AS (
  SELECT k.key AS rec_id, btrim(w.key) AS worker
    FROM nops_maint_payroll p, params pa
    CROSS JOIN LATERAL jsonb_each(COALESCE(p.data, '{}'::jsonb)) AS k(key, val)
    CROSS JOIN LATERAL jsonb_each_text(CASE WHEN jsonb_typeof(k.val) = 'object'
                                            THEN k.val ELSE '{}'::jsonb END) AS w(key, val)
   WHERE upper(replace(replace(replace(COALESCE(p.nursery, ''), ' ', ''), '-', ''), '_', ''))
       = upper(replace(replace(replace(pa.nursery, ' ', ''), '-', ''), '_', ''))
     AND p.month = pa.month_label
     AND w.val <> '0'
),

office AS (
  SELECT rec_id, string_agg(DISTINCT worker, ', ' ORDER BY worker) AS names
    FROM ticks GROUP BY rec_id
),

-- Who the FC Portal says did it: worked_by, or whoever reported it.
field_raw AS (
  SELECT upper(replace(replace(replace(btrim(f.plot_name), ' ', ''), '-', ''), '_', '')) AS pk,
         lower(btrim(COALESCE(f.jenis, '')))  AS jenis_l,
         to_char(f.work_date, 'YYYY-MM-DD') AS whn,
         btrim(unnest(string_to_array(
           CASE WHEN btrim(COALESCE(f.worked_by, '')) <> '' THEN f.worked_by
                ELSE COALESCE(f.reported_by, '') END, ','))) AS worker
    FROM nops_maint_field_records f, params pa
   WHERE f.verified_at IS NOT NULL
     AND f.work_date IS NOT NULL
     AND to_char(f.work_date, 'YYYY-MM') = pa.ym
),

/* BY THE DAY, not by the month.
   This used to group the field's names per plot and job for the whole month,
   so a plot sprayed five times showed the union of everybody who did ANY of
   the five against EVERY one of them — and five rounds each ticked to one man
   all read DIFFERENT NAMES against a crew of three. A round is compared with
   the round that was worked that day. */
field_day AS (
  SELECT pk, jenis_l, whn, string_agg(DISTINCT worker, ', ' ORDER BY worker) AS names
    FROM field_raw WHERE worker <> '' GROUP BY pk, jenis_l, whn
),
/* Only for a row with NO date, which cannot be matched to a day. The whole
   month is the best that can be said, and the verdict says so. */
field_month AS (
  SELECT pk, jenis_l, string_agg(DISTINCT worker, ', ' ORDER BY worker) AS names
    FROM field_raw WHERE worker <> '' GROUP BY pk, jenis_l
),

joined AS (
  SELECT r.plot, r.jenis, r.tarikh, r.checked,
         COALESCE(o.names, '') AS office_names,
         COALESCE(CASE WHEN r.tarikh = '' THEN fm.names ELSE fd.names END, '') AS field_names,
         (r.tarikh = '') AS undated,
         (r.tarikh <> '' AND fd.names IS NULL AND fm.names IS NOT NULL) AS day_missed
    FROM recs r
    LEFT JOIN office o ON o.rec_id = r.rec_id
    LEFT JOIN field_day fd
      ON fd.pk = upper(replace(replace(replace(r.plot, ' ', ''), '-', ''), '_', ''))
     AND fd.jenis_l = lower(r.jenis)
     AND fd.whn = left(r.tarikh, 10)
    LEFT JOIN field_month fm
      ON fm.pk = upper(replace(replace(replace(r.plot, ' ', ''), '-', ''), '_', ''))
     AND fm.jenis_l = lower(r.jenis)
),

verdicted AS (
  SELECT j.*,
         CASE
           WHEN j.office_names = '' AND j.field_names = '' THEN 'nobody either side'
           WHEN j.office_names = '' AND j.undated
             THEN 'NOT ON THE CLAIM — undated, so the names are the whole month'
           WHEN j.office_names = '' THEN 'NOT ON THE CLAIM — the field knows who, the office has ticked nobody'
           WHEN j.day_missed THEN 'office only — the FC Portal has nothing on that DAY'
           WHEN j.field_names  = '' THEN 'office only — nothing in the FC Portal for it'
           WHEN j.office_names = j.field_names AND j.undated
             THEN 'agree, but undated — matched on the month'
           WHEN j.office_names = j.field_names THEN 'agree'
           WHEN j.undated THEN 'DIFFERENT NAMES — undated, so the names are the whole month'
           ELSE 'DIFFERENT NAMES'
         END AS verdict
    FROM joined j
)

SELECT * FROM (
  SELECT 1 AS ord,
         (v.plot || '  ' || v.jenis)::text AS what,
         (CASE WHEN v.tarikh = '' THEN 'no date' ELSE v.tarikh END || '  ' || v.checked)::text AS whn,
         (CASE WHEN v.office_names = '' THEN '(nobody)' ELSE v.office_names END)::text AS worker_record,
         (CASE WHEN v.field_names  = '' THEN '(nothing)' ELSE v.field_names END)::text AS fc_portal,
         v.verdict::text AS verdict
    FROM verdicted v

  UNION ALL
  SELECT 9, 'VERDICT', '-',
         (SELECT count(*)::text FROM verdicted WHERE verdict LIKE 'agree%') || ' agree',
         (SELECT count(*)::text FROM verdicted
           WHERE verdict LIKE 'NOT ON THE CLAIM%') || ' paid to nobody',
         ((SELECT count(*)::text FROM verdicted WHERE verdict LIKE 'DIFFERENT NAMES%')
          || ' with different names, '
          || (SELECT count(*)::text FROM verdicted WHERE verdict = 'nobody either side')
          || ' with nothing on either side')::text
) x
ORDER BY ord, what, whn;
