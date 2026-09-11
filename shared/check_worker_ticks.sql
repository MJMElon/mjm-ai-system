/* ═══════════════════════════════════════════════════════════════════════
   WHY A VERIFIED JOB DID NOT TICK A WORKER ON THE WORKER RECORD

   Read only. It changes nothing and is safe to run as often as you like.

   ── How a tick actually gets there ──

   The office's Work Record row and the phone's field record are two separate
   things that have to be PAIRED before anything can flow between them. They
   pair on three facts, all three of which must agree:

       the job        Membaja, Merumput, P & D, Interrow
       the plot       U1
       the ROUND      the office reads it off the front of its own chemical
                      ("Round 2: Manzate 50gm + Bond 15mL" → 2)
                      the phone sends the week its board was showing

   Pair them and the record fills the row's date, batch and quantity, and
   ticks every worker it credits. Fail to pair and NOTHING happens — no date,
   no tick — and until now the page said nothing about it either.

   So a tick that is missing is almost never a problem with the tick. It is
   the pairing, and this says which of the two sides disagrees.

   ── Reading the result ──

   One row per verified field record in the month, with the office row it
   would pair with beside it. `verdict` says what happened:

     PAIRED                   it matched — if the tick is still missing, the
                              worker's NAME is the problem, not the pairing;
                              compare `credited` against the Worker Record's
                              column headings
     ROUND MISMATCH           the office has this job on a different round
                              than the phone recorded it under. This is the
                              common one.
     NO OFFICE ROW            the office has no row for that job on that plot
                              at all — the month was never synced from the
                              schedule, or the plot is not on it
     OFFICE ROW HAS NO ROUND  the office chemical does not start "Round N:",
                              so nothing can pair with it

   Change the two values at the top to the month and nursery you are looking
   at, and run.
═══════════════════════════════════════════════════════════════════════ */

WITH ask AS (
  SELECT 'Sep 2026'::text AS month_label,       -- the month on screen
         ARRAY['U1','U2','U3','U4','U5','U6','U7','U8','U9','U10',
               'U11','U12','U13','U14','U15','U16','U17','U18'] AS plots
         -- BNN:  B1 … B14      UNN2: N1 … N20      PN: its own list
),

/* The office's own rows, out of the JSON blob the Work Record saves. */
office AS (
  SELECT r->>'jenis'                        AS jenis,
         upper(btrim(r->>'plot'))           AS plot,
         r->>'racun'                        AS racun,
         NULLIF((regexp_match(COALESCE(r->>'racun',''),
                 '^\s*Round\s+(\d+)\s*:', 'i'))[1], '')::int AS round
    FROM public.nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(m.records) AS r
   WHERE m.id = 1
),

/* What the phone sent, verified only — the office reads nothing else. */
field AS (
  SELECT f.id, f.plot_name, f.jenis, f.work_type, f.batch_name,
         f.work_date, f.week_no, f.schedule_month,
         COALESCE(NULLIF(btrim(f.worked_by), ''), btrim(f.reported_by)) AS credited,
         /* The same fallback the page uses: no week_no means work it out from
            the date, in seven-day blocks with the 29th on counted as the 4th. */
         COALESCE(f.week_no, LEAST(4, GREATEST(1,
           CEIL(EXTRACT(DAY FROM f.work_date) / 7.0)::int))) AS round_used
    FROM public.nops_maint_field_records f, ask
   WHERE f.verified_at IS NOT NULL
     AND upper(btrim(f.plot_name)) = ANY (ask.plots)
     AND COALESCE(f.schedule_month,
                  to_char(f.work_date, 'Mon YYYY')) = ask.month_label
)

SELECT f.work_date,
       f.plot_name          AS plot,
       f.jenis              AS job,
       f.batch_name         AS batch,
       f.credited,
       f.round_used         AS "phone round",
       o_same.racun         AS "office row it paired with",
       o_any.rounds         AS "rounds the office has for this job/plot",
       CASE
         WHEN o_same.racun IS NOT NULL              THEN 'PAIRED'
         WHEN o_any.rounds IS NULL                  THEN 'NO OFFICE ROW'
         WHEN o_any.rounds = '{}'                   THEN 'OFFICE ROW HAS NO ROUND'
         ELSE 'ROUND MISMATCH'
       END                  AS verdict
  FROM field f
  /* The office row it DID pair with, if any. */
  LEFT JOIN LATERAL (
    SELECT o.racun FROM office o
     WHERE o.jenis = f.jenis
       AND o.plot  = upper(btrim(f.plot_name))
       AND o.round = f.round_used
     LIMIT 1
  ) o_same ON true
  /* And every round the office has for that job on that plot, so a mismatch
     shows what it SHOULD have been recorded under. */
  LEFT JOIN LATERAL (
    SELECT array_remove(array_agg(o.round ORDER BY o.round), NULL) AS rounds
      FROM office o
     WHERE o.jenis = f.jenis
       AND o.plot  = upper(btrim(f.plot_name))
    HAVING count(*) > 0
  ) o_any ON true
 ORDER BY verdict, f.work_date, f.plot_name;
