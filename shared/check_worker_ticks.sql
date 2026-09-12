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
                   …or, when those two disagree, the CHEMICAL, which is what
                      the job IS rather than what the office calls it

   Pair them and the record fills the row's date, batch and quantity, and
   ticks every worker it credits. Fail to pair and NOTHING happens — no date,
   no tick — and until now the page said nothing about it either.

   So a tick that is missing is almost never a problem with the tick. It is
   the pairing, and this says which of the two sides disagrees.

   ── Reading the result ──

   One row per verified field record in the month, with the office row it
   would pair with beside it. `verdict` says what happened:

     PAIRED ON ROUND          both agreed. If the tick is still missing, the
                              worker's NAME is the problem, not the pairing;
                              compare `credited` against the Worker Record's
                              column headings
     PAIRED ON CHEMICAL       the rounds disagreed, but the office has this
                              exact spray on this exact plot, so it pairs on
                              that instead. Nothing is lost.
     NO OFFICE ROW            the office has no row for that job on that plot
                              at all — the month was never synced from the
                              schedule, or the job was never scheduled. THIS
                              ONE NEEDS A DECISION: either sync the schedule,
                              or accept that the work was unscheduled and will
                              not appear.
     CHEMICAL NOT SCHEDULED   the office has rows for the job on that plot but
                              none with this chemical, so there is nothing it
                              can honestly attach to
     AMBIGUOUS                two office rows on that plot carry the same
                              chemical, so the chemical cannot say which. Give
                              them different rounds and it resolves.

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
         /* The same normalising _chemKey does in the page: the round label
            off the front, then letters and digits only. */
         upper(regexp_replace(regexp_replace(COALESCE(r->>'racun',''),
               '^\s*Round\s+\d+\s*:', '', 'i'), '[^a-zA-Z0-9]', '', 'g')) AS chem_key,
         NULLIF((regexp_match(COALESCE(r->>'racun',''),
                 '^\s*Round\s+(\d+)\s*:', 'i'))[1], '')::int AS round
    FROM public.nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(m.records) AS r
   WHERE m.id = 1
),

/* What the phone sent, verified only — the office reads nothing else. */
field AS (
  SELECT f.id, f.plot_name, f.jenis, f.work_type, f.batch_name, f.chemical,
         f.work_date, f.week_no, f.schedule_month,
         upper(regexp_replace(regexp_replace(COALESCE(f.chemical,''),
               '^\s*Round\s+\d+\s*:', '', 'i'), '[^a-zA-Z0-9]', '', 'g')) AS chem_key,
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
       f.chemical           AS "chemical recorded",
       f.batch_name         AS batch,
       f.credited,
       f.round_used         AS "phone round",
       COALESCE(o_same.racun, o_chem.racun) AS "office row it pairs with",
       o_any.racuns         AS "what the office has for this job/plot",
       CASE
         WHEN o_same.racun IS NOT NULL  THEN 'PAIRED ON ROUND'
         WHEN o_chem.n = 1              THEN 'PAIRED ON CHEMICAL'
         WHEN o_chem.n > 1              THEN 'AMBIGUOUS'
         WHEN o_any.racuns IS NULL      THEN 'NO OFFICE ROW'
         ELSE 'CHEMICAL NOT SCHEDULED'
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
  /* Failing that, the office row carrying the SAME CHEMICAL — and how many
     of them there are, because two is no answer at all. */
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS n, min(o.racun) AS racun
      FROM office o
     WHERE o.jenis = f.jenis
       AND o.plot  = upper(btrim(f.plot_name))
       AND o.chem_key = f.chem_key
       AND f.chem_key <> ''
  ) o_chem ON true
  /* And everything the office has for that job on that plot, so a record that
     pairs with nothing shows what it was up against. */
  LEFT JOIN LATERAL (
    SELECT array_agg(o.racun ORDER BY o.racun) AS racuns
      FROM office o
     WHERE o.jenis = f.jenis
       AND o.plot  = upper(btrim(f.plot_name))
    HAVING count(*) > 0
  ) o_any ON true
 ORDER BY verdict, f.work_date, f.plot_name;
