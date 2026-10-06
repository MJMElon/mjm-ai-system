-- ════════════════════════════════════════════════════════════════════════
-- TICKS SAVED UNDER A NAME THE REGISTER CANNOT PLACE
-- shared/CHECK_worker_names_with_no_column.sql
--
-- Read-only. Nothing is created, changed or deleted. Run the whole file.
-- It sweeps EVERY nursery and EVERY month at once.
--
-- WHY
--
-- The Worker Record keys its ticks by NAME. Correct a name on the register
-- and every tick made under the old spelling is orphaned: no column on the
-- sheet, the capacity out of the totals, and the salary claim no longer
-- paying it. Nothing is deleted and nothing says a word.
--
-- shared/RUN_ME_worker_previous_names.sql stops this happening again, by
-- having the row remember what it was called. It cannot know about renames
-- from BEFORE it was installed, because nothing recorded them. This file
-- finds those, so they can be named rather than guessed at.
--
-- WHAT EACH SECTION SAYS
--
-- 1 ORPHAN   one line per name with no register row, with how many ticks
--            carry it, how much capacity those rows are worth, and which
--            months. The capacity is what is NOT being paid.
-- 2 MAYBE    a register name that contains the orphan as a whole word and is
--            the ONLY one that does -- Fauzan inside Muhamad Fauzan. This is
--            a SUGGESTION and nothing more. It is never applied by anything:
--            two people really can be Ahmad and Ahmad Bin Ali, and picking
--            one would move money to the wrong person. The office says which
--            are the same person, and RUN_ME_worker_name_was.sql names them.
-- 3 TOTAL    how many orphan names and how much capacity in all.
--
-- A GOOD RESULT IS SECTION 1 EMPTY. Anything there is work somebody did that
-- the claim is not paying for.
-- ════════════════════════════════════════════════════════════════════════

WITH tick AS (
  SELECT p.nursery, p.month, p.work_type,
         e.rec_id, w.name AS worker
    FROM nops_maint_payroll p
    CROSS JOIN LATERAL jsonb_each(COALESCE(p.data, '{}'::jsonb)) AS e(rec_id, cells)
    CROSS JOIN LATERAL jsonb_object_keys(COALESCE(e.cells, '{}'::jsonb)) AS w(name)
),

reg AS (
  SELECT id, btrim(full_name) AS full_name,
         upper(translate(btrim(full_name),
               ' .,-_/()0123456789', '                  ')) AS spaced
    FROM mjmnpayroll_workers
),

-- Letters and digits, uppercase: the same key every crossing of this
-- boundary uses, so a difference of punctuation is not a second person.
regkey AS (
  SELECT id, full_name,
         upper(translate(full_name, ' .,-_/()', '        ')) AS loose,
         upper(replace(replace(replace(replace(replace(replace(replace(
           full_name, ' ', ''), '.', ''), ',', ''), '-', ''), '_', ''), '/', ''), '(', '')) AS k
    FROM reg
),

-- Current names AND every name the rows remember, where that column exists.
known AS (
  SELECT k FROM regkey
  UNION
  SELECT upper(replace(replace(replace(replace(replace(replace(replace(
           btrim(x #>> '{}'), ' ', ''), '.', ''), ',', ''), '-', ''), '_', ''), '/', ''), '(', ''))
    FROM mjmnpayroll_workers w
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.previous_names, '[]'::jsonb)) AS e(x)
),

orphan AS (
  SELECT t.*,
         upper(replace(replace(replace(replace(replace(replace(replace(
           btrim(t.worker), ' ', ''), '.', ''), ',', ''), '-', ''), '_', ''), '/', ''), '(', '')) AS k
    FROM tick t
   WHERE btrim(t.worker) <> ''
),
orphan_only AS (
  SELECT o.* FROM orphan o WHERE o.k NOT IN (SELECT k FROM known WHERE k IS NOT NULL)
),

-- What those rows are worth, so the figure is the money and not a row count.
recqty AS (
  SELECT btrim(COALESCE(e.rec->>'id', '')) AS rec_id,
         CASE WHEN btrim(COALESCE(e.rec->>'qty', '')) <> ''
                   AND translate(btrim(COALESCE(e.rec->>'qty', '')), '0123456789', '') = ''
                THEN btrim(e.rec->>'qty')::numeric
              WHEN btrim(COALESCE(e.rec->>'qtyFrozen', '')) <> ''
                   AND translate(btrim(COALESCE(e.rec->>'qtyFrozen', '')), '0123456789', '') = ''
                THEN btrim(e.rec->>'qtyFrozen')::numeric
              ELSE 0 END AS cap
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) AS e(rec)
   WHERE m.id = 1
),

summary AS (
  SELECT o.worker,
         count(*) AS ticks,
         COALESCE(sum(q.cap), 0) AS cap,
         string_agg(DISTINCT o.nursery, ', ' ORDER BY o.nursery) AS nurseries,
         string_agg(DISTINCT o.month, ', ' ORDER BY o.month) AS months
    FROM orphan_only o
    LEFT JOIN recqty q ON q.rec_id = o.rec_id
   GROUP BY o.worker
),

-- A register name that carries the orphan as a WHOLE WORD, and only one.
maybe AS (
  SELECT s.worker,
         (SELECT string_agg(r.full_name, ' OR ') FROM regkey r
           WHERE ' ' || r.loose || ' ' LIKE '% ' || upper(btrim(s.worker)) || ' %') AS fits,
         (SELECT count(*) FROM regkey r
           WHERE ' ' || r.loose || ' ' LIKE '% ' || upper(btrim(s.worker)) || ' %') AS n
    FROM summary s
)

SELECT * FROM (
  SELECT 1 AS ord, '1 ORPHAN'::text AS section, s.worker::text AS item,
         s.ticks::text AS n,
         (to_char(s.cap, 'FM999G999G999') || ' capacity, in ' || s.nurseries
          || ', months ' || s.months)::text AS detail
    FROM summary s

  UNION ALL
  SELECT 2, '2 MAYBE', s.worker::text, m.n::text,
         (CASE WHEN m.n = 1 THEN 'the only register name carrying it as a whole word is '
                                 || m.fits || ' -- SUGGESTION, confirm before using'
               WHEN m.n > 1 THEN 'more than one register name carries it: ' || m.fits
                                 || ' -- the office must say which'
               ELSE 'no register name carries it, so this is not a rename' END)::text
    FROM summary s JOIN maybe m ON m.worker = s.worker

  UNION ALL
  SELECT 9, '9 TOTAL', 'names with no column',
         (SELECT count(*)::text FROM summary),
         ('capacity not being paid: '
          || to_char(COALESCE((SELECT sum(cap) FROM summary), 0), 'FM999G999G999'))::text
) z
ORDER BY ord, item, detail;
