-- ============================================================================
-- CHECK_every_table.sql
--
-- Every table in the database, and whether anything in the seven apps uses it.
-- Reads only, changes nothing, creates nothing.
--
-- The list of tables the apps use was taken from the code of all seven
-- repositories on 14 Oct 2026: office (mjm-ai-system), fc-portal, mobile,
-- sales-web, audit-app, maint-app and booking. A table nobody here uses is
-- not proof it is unused -- a report, a Make or Zapier flow, or somebody
-- typing in the dashboard can use a table without any code -- so the
-- verdicts below are a list to LOOK at, never a list to drop.
--
-- One result set, two sections.
--
--   TABLE    one row per table, with its exact row count, its size on disk,
--            which apps read or write it, and a verdict. Sorted so the ones
--            worth a question come first:
--              1 LEFTOVER        a tmp_ / backup / underscore table, made for a
--                                one-off repair and never cleaned up
--              2 NOT USED        no app, no database function, no view uses it
--              3 SQL ONLY        made by one of our RUN_ME files, nothing uses
--                                it now
--              4 DB ONLY         used inside a database function or trigger
--              5 USED            read or written by an app
--   LIST     a column holding a list (JSON array or Postgres array), or a set
--            of numbered columns like plot_1 .. plot_5. Those are the ones
--            that might be better as a table of their own. max_items is the
--            longest list found in that column.
--
-- A good result is very few rows at 1 and 2, and every one of them a table
-- you recognise. Send a screenshot of sections 1 to 3 and of LIST and I will
-- go through them with you.
-- ============================================================================

WITH app(tbl, kind, repos) AS (VALUES
  ('_mjm_adjrow_before','sql','office'),
  ('_mjm_doc_check','sql','office'),
  ('_mjm_old_title_log','sql','office'),
  ('_mjm_rename_log','sql','office'),
  ('app_settings','sql','sales-web'),
  ('audit','sql','office'),
  ('audit_batches','sql','office'),
  ('audit_height_records','app','sales-web audit-app office'),
  ('audit_maintenance_audits','app','audit-app office'),
  ('audit_maintenance_tasks','sql','office'),
  ('audit_papan_audits','app','audit-app office'),
  ('audit_plot_audits','app','audit-app office'),
  ('audit_settings','app','audit-app office'),
  ('bookings','app','office'),
  ('changes','app','office'),
  ('documents','app','fc-portal mobile office'),
  ('fcportal_palms_culling','sql','office'),
  ('fcportal_palms_history','app','audit-app office'),
  ('fcportal_palms_plot_logs','app','fc-portal audit-app office'),
  ('fcportal_palms_requests','sql','office'),
  ('fcportal_palms_settings','sql','office'),
  ('fcportal_palms_tombstones','sql','office'),
  ('fcportal_scan_records','app','fc-portal mobile'),
  ('mjmnpayroll_earn_adjustments','app','office'),
  ('mjmnpayroll_lines','sql','office'),
  ('mjmnpayroll_lock_days','app','audit-app office'),
  ('mjmnpayroll_month_locks','app','audit-app office'),
  ('mjmnpayroll_periods','sql','office'),
  ('mjmnpayroll_piece_rates','app','office'),
  ('mjmnpayroll_settings','sql','office'),
  ('mjmnpayroll_verifications','app','audit-app office'),
  ('mjmnpayroll_work_entries','app','office'),
  ('mjmnpayroll_worker_photo_tickets','sql','office'),
  ('mjmnpayroll_worker_sessions','sql','office'),
  ('mjmnpayroll_worker_signin_fails','sql','office'),
  ('mjmnpayroll_workers','app','fc-portal mobile office'),
  ('mobile_consent_records','app','fc-portal mobile office'),
  ('nelos_automations','app','office'),
  ('nelos_case_comments','app','fc-portal audit-app mobile office'),
  ('nelos_cases','app','fc-portal audit-app mobile office'),
  ('nelos_categories','app','fc-portal mobile office'),
  ('nelos_handlers','app','fc-portal mobile office'),
  ('nelos_module_members','sql','office'),
  ('nelos_modules','app','fc-portal mobile office'),
  ('nelos_roles','sql','office'),
  ('nelos_routes','app','office'),
  ('nelos_work_types','app','office'),
  ('nops_maint_chemicals','app','fc-portal office'),
  ('nops_maint_config','app','fc-portal office'),
  ('nops_maint_custom_plots','app','audit-app office'),
  ('nops_maint_fertilisers','app','office'),
  ('nops_maint_field_records','app','fc-portal office'),
  ('nops_maint_payroll','app','office'),
  ('nops_maint_piece_rates','app','office'),
  ('nops_maint_plot_qty','app','fc-portal office'),
  ('nops_maint_published','app','fc-portal office'),
  ('nops_maint_rate_lock','app','office'),
  ('nops_maint_records','app','office'),
  ('nops_maint_state','app','office'),
  ('nops_maint_tray_size','app','fc-portal office'),
  ('nops_maint_workers','app','office'),
  ('nops_plot_areas','app','audit-app office'),
  ('nops_plot_rounds','app','office'),
  ('nops_plot_status_actions','app','office'),
  ('nops_plot_status_entries','sql','office'),
  ('nops_plot_status_stages','app','fc-portal audit-app office'),
  ('nops_plot_works','app','office'),
  ('nops_seed_receipts','app','office'),
  ('nops_seed_schedules','app','office'),
  ('nops_transplant_field_records','app','office'),
  ('nops_work_types','app','office'),
  ('operation_batch_reviews','app','office'),
  ('operation_batch_verifications','app','office'),
  ('operation_batches','app','office'),
  ('operation_nurseries','app','fc-portal audit-app office'),
  ('operation_trays','app','office'),
  ('palms_log_backup_20260826','sql','office'),
  ('palms_log_backup_20260831','sql','office'),
  ('salesweb_app_settings','app','sales-web'),
  ('salesweb_billing_info','app','sales-web'),
  ('salesweb_coupon_redemptions','app','sales-web'),
  ('salesweb_coupons','app','sales-web'),
  ('salesweb_credit_bills','app','sales-web'),
  ('salesweb_credit_invoices','app','sales-web office'),
  ('salesweb_customer_group_members','app','sales-web'),
  ('salesweb_customer_groups','app','sales-web'),
  ('salesweb_customer_orders','app','sales-web office'),
  ('salesweb_customer_points_balance','app','sales-web'),
  ('salesweb_inventory_history','app','sales-web'),
  ('salesweb_message_events','app','sales-web'),
  ('salesweb_message_handlers','sql','sales-web'),
  ('salesweb_message_notify_emails','app','sales-web'),
  ('salesweb_message_staff_phone','app','sales-web'),
  ('salesweb_messages','app','sales-web'),
  ('salesweb_monthly_estimate_collection','app','sales-web office'),
  ('salesweb_order_adjustments','app','sales-web'),
  ('salesweb_order_attachments','app','sales-web office'),
  ('salesweb_order_collections','app','sales-web office'),
  ('salesweb_order_counters','sql','sales-web'),
  ('salesweb_order_items','app','sales-web office'),
  ('salesweb_order_payments','app','sales-web'),
  ('salesweb_order_timeline','app','sales-web office'),
  ('salesweb_points_ledger','app','sales-web'),
  ('salesweb_products','app','sales-web office'),
  ('salesweb_promotion_drafts','sql','sales-web'),
  ('salesweb_promotions','app','sales-web'),
  ('salesweb_quotation_items','app','sales-web'),
  ('salesweb_quotations','app','sales-web'),
  ('salesweb_site_content','app','sales-web'),
  ('salesweb_stock_transfers','app','sales-web'),
  ('salesweb_user_tab_access','app','sales-web'),
  ('schedule_state','app','maint-app'),
  ('seal_allocations','app','fc-portal'),
  ('seal_orders','app','mobile office'),
  ('seal_problems','app','office'),
  ('seal_receipt_ranges','sql','office'),
  ('seal_receipts','app','mobile office'),
  ('seal_settings','app','office'),
  ('shared_al_orders','app','booking fc-portal sales-web mobile office'),
  ('shared_batch_customer_allocations','app','office'),
  ('shared_breeds','app','fc-portal mobile office'),
  ('shared_collection_bookings','app','booking fc-portal sales-web mobile office'),
  ('shared_date_overrides','app','booking sales-web office'),
  ('shared_do_lock_settings','sql','office'),
  ('shared_do_records','app','fc-portal sales-web audit-app mobile office'),
  ('shared_inventory_logs','app','fc-portal sales-web audit-app office'),
  ('shared_month_lock_day_settings','app','audit-app office'),
  ('shared_month_locks','app','audit-app office'),
  ('shared_plot_allocations','app','sales-web office'),
  ('shared_plot_batch_balance','app','fc-portal audit-app office'),
  ('shared_plots','app','fc-portal audit-app mobile office'),
  ('shared_portal_settings','app','fc-portal office'),
  ('shared_profiles','app','fc-portal sales-web audit-app mobile office'),
  ('shared_quotations','app','office'),
  ('shared_site_boundary','app','fc-portal office'),
  ('site_content','sql','sales-web'),
  ('tmp_c3_batch','sql','office'),
  ('tmp_c3_calc','sql','office'),
  ('tmp_c3_import','sql','office'),
  ('tmp_c3_issues','sql','office'),
  ('tmp_c3_sales','sql','office'),
  ('tmp_c3_sheet','sql','office'),
  ('tmp_c3_write','sql','office'),
  ('tmp_transfer_batch','sql','office'),
  ('tmp_transfer_import','sql','office'),
  ('training_assessments','sql','office'),
  ('training_certifications','app','office'),
  ('training_practical_logs','app','office')
),
t AS (
  SELECT c.oid, n.nspname AS sch, c.relname AS tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('r', 'p') AND n.nspname = 'public'
),
src AS (
  SELECT string_agg(lower(p.prosrc), ' ') AS body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
),
vw AS (
  SELECT string_agg(lower(pg_get_viewdef(c.oid)), ' ') AS body
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('v', 'm') AND n.nspname = 'public'
),
tab AS (
  SELECT t.tbl,
         (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', t.sch, t.tbl), false, true, '')))[1]::text::BIGINT AS n,
         pg_size_pretty(pg_total_relation_size(t.oid)) AS size,
         a.kind, a.repos,
         ( position(('public.' || t.tbl) IN COALESCE(s.body, '')) > 0
        OR position((' ' || t.tbl || ' ') IN COALESCE(s.body, '')) > 0
        OR position((' ' || t.tbl || chr(10)) IN COALESCE(s.body, '')) > 0
        OR position(('public.' || t.tbl) IN COALESCE(v.body, '')) > 0
        OR position((' ' || t.tbl || ' ') IN COALESCE(v.body, '')) > 0 ) AS in_db
    FROM t
    LEFT JOIN app a ON a.tbl = t.tbl
    CROSS JOIN src s CROSS JOIN vw v
),
tabv AS (
  SELECT tbl, n, size, repos, in_db,
         CASE
           WHEN tbl LIKE 'tmp%' OR tbl LIKE '%backup%' OR tbl LIKE '%bak%' OR left(tbl, 1) = '_' OR tbl LIKE '%old%' OR tbl LIKE '%copy%' THEN 1
           WHEN kind = 'app' THEN 5
           WHEN in_db THEN 4
           WHEN kind = 'sql' THEN 3
           ELSE 2
         END AS rank
    FROM tab
),
cols AS (
  SELECT c.table_name AS tbl, c.column_name AS col, c.data_type, c.udt_name
    FROM information_schema.columns c
    JOIN t ON t.tbl = c.table_name AND t.sch = c.table_schema
),
listcols AS (
  SELECT tbl, col, data_type,
         CASE WHEN data_type = 'ARRAY' THEN
           query_to_xml(format('SELECT count(%I) AS f, COALESCE(max(cardinality(%I)), 0) AS m FROM public.%I', col, col, tbl), false, true, '')
         ELSE
           query_to_xml(format('SELECT count(%I) AS f, COALESCE(max(CASE WHEN jsonb_typeof(%I::jsonb) = ''array'' THEN jsonb_array_length(%I::jsonb) END), 0) AS m, count(*) FILTER (WHERE jsonb_typeof(%I::jsonb) = ''object'') AS o FROM public.%I', col, col, col, col, tbl), false, true, '')
         END AS x
    FROM cols
   WHERE data_type IN ('jsonb', 'json', 'ARRAY')
),
numbered AS (
  SELECT tbl, left(col, length(col) - 2) AS prefix, count(*) AS k,
         string_agg(col, ', ' ORDER BY col) AS cols
    FROM cols
   WHERE length(col) > 2
     AND substr(col, length(col) - 1, 1) = '_'
     AND right(col, 1) BETWEEN '0' AND '9'
   GROUP BY tbl, left(col, length(col) - 2)
  HAVING count(*) >= 3
)
SELECT 'TABLE' AS section,
       rank,
       CASE rank WHEN 1 THEN 'LEFTOVER' WHEN 2 THEN 'NOT USED' WHEN 3 THEN 'SQL ONLY' WHEN 4 THEN 'DB ONLY' ELSE 'USED' END AS verdict,
       tbl AS table_name,
       '' AS column_name,
       n AS row_count,
       size,
       COALESCE(repos, CASE WHEN in_db THEN 'database functions' ELSE '' END) AS used_by,
       0::BIGINT AS max_items
  FROM tabv
UNION ALL
SELECT 'LIST', 6,
       CASE WHEN m.max_items > 1 THEN 'list in a column' WHEN m.objects > 0 THEN 'object, not a list' ELSE 'one item or empty' END,
       l.tbl, l.col, m.filled, l.data_type, '', m.max_items
  FROM listcols l
  CROSS JOIN LATERAL (SELECT (xpath('/row/f/text()', l.x))[1]::text::BIGINT AS filled,
                             (xpath('/row/m/text()', l.x))[1]::text::BIGINT AS max_items,
                             COALESCE((xpath('/row/o/text()', l.x))[1]::text::BIGINT, 0) AS objects) m
UNION ALL
SELECT 'LIST', 6, 'numbered columns', tbl, cols, NULL::BIGINT, 'repeated ' || k || ' times', '', k
  FROM numbered
 ORDER BY 2, 1, 4, 5;
