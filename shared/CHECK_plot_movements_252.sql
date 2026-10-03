SELECT transaction_type,
       '[' || plot_name || ']'                                      AS plot_as_stored,
       quantity_change                                              AS qty,
       COALESCE(transaction_date::text, left(created_at::text, 10))  AS dated,
       left(COALESCE(remark, ''), 70)                               AS remark_start
  FROM shared_inventory_logs
 WHERE trim(batch_name) = '252'
   AND upper(replace(replace(trim(plot_name), ' ', ''), '-', '')) IN ('U10', 'U3')
 ORDER BY upper(replace(replace(trim(plot_name), ' ', ''), '-', '')),
          transaction_type, created_at;
