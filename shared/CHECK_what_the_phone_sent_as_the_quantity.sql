/* ═══════════════════════════════════════════════════════════════════════
   WHERE A QUANTITY NOBODY KEYED CAME FROM

   The office opened a P and D Spraying row on N12, batch 248, and asked:
   nobody keyed an amount, so why does it have one, and what does "from a
   phone record" mean when the phone has no capacity box on it.

   THE PHONE HAS NO QUANTITY BOX, AND IT SENDS A QUANTITY ALL THE SAME.
   What the Field Conductor does on the phone is TICK WHICH BATCHES are
   standing in the plot. The figure beside them is not typed, it is added
   up: the Main Nursery Movement Report balance of exactly the batches he
   ticked, which is what shared_plot_batch_balance holds. The phone labels
   it "Quantity (seedlings), from the batches ticked" and it is read-only.
   That number rides on the record, and once a Field Conductor VERIFIES the
   record the office page fills an EMPTY quantity cell from it.

   SO THE TWO FIGURES ARE WORKED OUT BY DIFFERENT RULES, and that is the
   thing to look at:

     the PHONE sent   the Movement Report balance of the batches ticked, as
                      it stood on the day the record was SAVED. The 1st and
                      2nd cullings take no part in that report at all.
     the OFFICE links the same balance, LESS the 2nd culling on those
                      batches -- for every job but Interrow Spraying, where
                      the culling is deliberately left standing because the
                      ground between the rows is the same walk either way.

   So on a plot with a 2nd culling the two read differently by exactly that
   culling, and neither is wrong.

   WHAT A GOOD RESULT LOOKS LIKE: one row per phone record that carries a
   quantity. Three figures and what each gap is:

     "phone sent" against "standing now"  -- the same number means the
        ledger has not moved since the record was saved. A gap means a
        sale, a 3rd culling, a transfer or an approved adjustment has
        landed since, and the figure sitting in the office cell is the
        one the phone sent, not the one standing today.
     "office link would read" -- standing now, less the 2nd culling,
        unless the job is Interrow. That is the number the office cell
        falls back to when nobody keyed one and no phone record filled it.

   ONE THING THIS CANNOT REPRODUCE: the office link is cut off AT THE WORK
   DATE, and this column is not. A 2nd culling dated AFTER the work day is
   correctly left out of the office figure, and it IS in the column here,
   so those two rows will differ by it. The office row says so itself, in
   amber, naming the day the culling is dated.

   Safe to run as many times as you like. It reads and changes nothing.
═══════════════════════════════════════════════════════════════════════ */

WITH rec AS (
  SELECT r.id,
         r.work_date,
         r.plot_name,
         coalesce(r.jenis, r.work_type)  AS job,
         r.batch_name,
         r.qty                           AS phone_qty,
         r.reported_by,
         r.verified_at
  FROM   public.nops_maint_field_records r
  WHERE  r.qty IS NOT NULL
),
/* One row per batch the record ticked. The phone joins them with a comma,
   so they are split back apart and trimmed. No regex: the editor has
   choked on one before. */
part AS (
  SELECT rec.id,
         trim(b) AS batch_one
  FROM   rec
  CROSS  JOIN LATERAL unnest(string_to_array(coalesce(rec.batch_name, ''), ',')) AS b
  WHERE  trim(b) <> ''
),
/* What those same batches stand at NOW, off the view the phone itself
   reads. mjm_plot_key and mjm_batch_key come with that view. */
standing AS (
  SELECT p.id,
         sum(v.qty)::bigint AS standing_now
  FROM   part p
  JOIN   rec  ON rec.id = p.id
  JOIN   public.shared_plot_batch_balance v
         ON v.plot_key  = public.mjm_plot_key(rec.plot_name)
        AND v.batch_key = public.mjm_batch_key(p.batch_one)
  GROUP  BY p.id
),
/* The 2nd culling on the same plot and batches, whenever it was dated.
   This is what the office takes off and the phone never counted. */
cull2 AS (
  SELECT p.id,
         sum(abs(coalesce(l.quantity_change, 0)))::bigint AS cull2_qty
  FROM   part p
  JOIN   rec ON rec.id = p.id
  JOIN   public.shared_inventory_logs l
         ON l.transaction_type = '2nd_Culling'
        AND public.mjm_plot_key(l.plot_name)   = public.mjm_plot_key(rec.plot_name)
        AND public.mjm_batch_key(l.batch_name) = public.mjm_batch_key(p.batch_one)
  GROUP  BY p.id
)
SELECT rec.work_date                                   AS "work day",
       rec.plot_name                                   AS "plot",
       rec.job                                         AS "job",
       coalesce(rec.batch_name, '(no batch ticked)')   AS "batches ticked",
       rec.phone_qty                                   AS "phone sent",
       s.standing_now                                  AS "standing now",
       coalesce(c.cull2_qty, 0)                        AS "2nd culled",
       /* Interrow keeps the culling standing. Every other job takes it off.
          Read off the JENIS and never off the chemical, which is what
          isInterrow does in shared_plot_movement.js */
       CASE WHEN s.standing_now IS NULL THEN NULL
            WHEN position('rumput secara selingan' in lower(coalesce(rec.job, ''))) > 0
              OR position('interrow' in lower(coalesce(rec.job, ''))) > 0
              THEN s.standing_now
            ELSE s.standing_now - coalesce(c.cull2_qty, 0)
       END                                             AS "office link would read",
       CASE
         WHEN s.standing_now IS NULL
           THEN 'no movement for these batches -- the phone figure is all there is'
         WHEN rec.phone_qty = s.standing_now
           THEN 'ledger has not moved since this was saved'
         ELSE 'the ledger moved since this was saved -- the cell holds the phone figure'
       END                                             AS "what the gap is",
       coalesce(rec.reported_by, '(nobody named)')     AS "saved on the phone by",
       CASE WHEN rec.verified_at IS NULL
            THEN 'NOT verified -- this one reaches no office cell'
            ELSE 'verified' END                        AS "verified"
FROM   rec
LEFT   JOIN standing s ON s.id = rec.id
LEFT   JOIN cull2    c ON c.id = rec.id
ORDER  BY rec.work_date DESC, rec.plot_name, rec.id;
