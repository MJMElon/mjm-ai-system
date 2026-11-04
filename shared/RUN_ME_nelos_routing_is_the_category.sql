-- ============================================================================
-- MJM AI POWERED SYSTEM -- RUN_ME_nelos_routing_is_the_category.sql
--
-- NELOS -- CASE ROUTING TURNS OVER. A case category now names the system
-- that SOLVES it, and carries the list of systems that may RAISE it.
--
-- WHAT THE SCREEN USED TO SAY
--
--     FC Portal                      <- the system that RAISES
--       # | Case Category | System | PIC
--       1 | Request Transplanting Signboard | Admin Portal | Admin 2
--
-- WHAT IT SAYS NOW
--
--     Admin Portal                   <- the system that SOLVES
--       # | Case Category | From System | PIC
--       1 | Request Transplanting Signboard | FC Portal | Admin 2
--
-- The categories listed under a portal are that portal work: what its PIC
-- has to solve. From System says which systems may raise it, and that list
-- is what each raise form offers as its Work list.
--
-- WHY IT IS BETTER, in one line: the page somebody is standing on stops
-- deciding anything. A rule used to be keyed on (source_module, category)
-- and the source is the PAGE, so the same title raised from a page that is
-- not its own system matched no rule and the case stayed where it was
-- raised. The solver now rides on the title, so it lands in the right queue
-- wherever it was raised from.
--
-- NOTHING HAS TO BE RE-DECIDED. The flip reads off the rules already set:
-- the new block is the old Solve by system, the From System is the old
-- block, and the PIC does not move. A title with no rule stays where it is.
--
-- WHAT raise_modules MEANS -- three states, and all three are used:
--     NULL          nobody has been asked. Only possible before this file
--                   runs, and it is what this file looks for, so a second
--                   run moves nothing.
--     {*}           ANY system may raise it. What a newly added title gets,
--                   because a title nobody can raise is invisible and reads
--                   as broken.
--     {}            nobody raises it by hand. What an automatic title wants.
--     {scan,audit}  those systems, and no others.
--
-- Requires the earlier nelos migrations -- run migration_nelos_all.sql and
-- migration_nelos_auto_conditions.sql first.
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf).
-- Safe to re-run: the flip is guarded on raise_modules IS NULL and every
-- other statement is idempotent.
-- ============================================================================

-- ── PREFLIGHT ───────────────────────────────────────────────────
DO $preflight$
BEGIN
  IF to_regclass('public.nelos_categories') IS NULL
     OR to_regclass('public.nelos_routes') IS NULL
     OR to_regclass('public.nelos_modules') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Nelos tables do not exist yet.',
      HINT    = 'Run migration_nelos_all.sql first, then this file.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'nelos_routes'
                    AND column_name = 'to_user_id') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'nelos_routes.to_user_id is missing.',
      HINT    = 'Run migration_nelos_auto_conditions.sql first, then this file.';
  END IF;
END $preflight$;

-- ────────────────────────────────────────────────────────────────
-- PART 1: The three things a case category now carries
-- ────────────────────────────────────────────────────────────────
ALTER TABLE nelos_categories
  ADD COLUMN IF NOT EXISTS raise_modules TEXT[];

ALTER TABLE nelos_categories
  ADD COLUMN IF NOT EXISTS pic_seat_no   INT;

ALTER TABLE nelos_categories
  ADD COLUMN IF NOT EXISTS pic_user_id   UUID
    REFERENCES shared_profiles(id) ON DELETE SET NULL;

ALTER TABLE nelos_categories
  ADD COLUMN IF NOT EXISTS pic_user_name TEXT;

COMMENT ON COLUMN nelos_categories.module_key IS
  'The system that SOLVES this title -- its block on Case Routing. It used '
  'to mean the system that raises it, and RUN_ME_nelos_routing_is_the_category.sql '
  'turned it over.';

COMMENT ON COLUMN nelos_categories.raise_modules IS
  'Which systems may raise this title by hand, and so which Work lists it '
  'appears in. NULL means nobody has been asked, a single star means any '
  'system, and an empty array means nobody by hand.';

COMMENT ON COLUMN nelos_categories.pic_seat_no IS
  'The seat in module_key that solves this title. NULL means the whole queue.';

-- ────────────────────────────────────────────────────────────────
-- PART 2: Turn every existing title over
--
-- The unique index is dropped for the length of the flip on purpose. Two
-- titles spelled the same under two different raising systems and routed to
-- one solver collide the moment they are both moved, and Postgres checks a
-- unique index row by row -- so there is no order of updates that avoids it.
-- They are merged in PART 3 and the index goes straight back on.
-- ────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS nelos_categories_uniq;

UPDATE nelos_categories c
   SET module_key    = r.solver,
       pic_seat_no   = COALESCE(c.pic_seat_no,   r.seat),
       pic_user_id   = COALESCE(c.pic_user_id,   r.pic_id),
       pic_user_name = COALESCE(c.pic_user_name, r.pic_name),
       raise_modules = ARRAY[r.raiser]
  FROM (
        SELECT c2.id,
               c2.module_key                                       AS raiser,
               COALESCE(ex.to_module,    df.to_module, c2.module_key) AS solver,
               COALESCE(ex.to_seat_no,   df.to_seat_no)            AS seat,
               COALESCE(ex.to_user_id,   df.to_user_id)            AS pic_id,
               COALESCE(ex.to_user_name, df.to_user_name)          AS pic_name
          FROM nelos_categories c2
          LEFT JOIN nelos_routes ex
                 ON ex.source_module = c2.module_key
                AND ex.category      = c2.name
          LEFT JOIN nelos_routes df
                 ON df.source_module = c2.module_key
                AND df.category IS NULL
         WHERE c2.raise_modules IS NULL
           AND c2.module_key IS NOT NULL
       ) r
 WHERE r.id = c.id;

-- A title that never had a system at all cannot be flipped and must not be
-- left reading as unraisable. Any system may raise it until somebody says
-- otherwise, which is what an unanswered question means everywhere here.
UPDATE nelos_categories
   SET raise_modules = ARRAY['*']
 WHERE raise_modules IS NULL;

-- ────────────────────────────────────────────────────────────────
-- PART 3: Merge the titles that landed on top of each other
--
-- "Repair Maintenance Work" raised from the FC Portal and from Seedling
-- Stock, both solved by the Admin Portal, is ONE title with two doors in.
-- The keeper takes both doors, and fills any blank from the copies before
-- they go. A case carries its category as TEXT, so no case is touched.
-- ────────────────────────────────────────────────────────────────
DO $merge$
DECLARE merged INT := 0;
        names  TEXT := '';
BEGIN
  SELECT COALESCE(string_agg(DISTINCT lname, ', ' ORDER BY lname), ''),
         COALESCE(sum(n) - count(*), 0)
    INTO names, merged
    FROM (SELECT lower(name) AS lname, count(*) AS n
            FROM nelos_categories
           WHERE module_key IS NOT NULL
           GROUP BY module_key, lower(name)
          HAVING count(*) > 1) d;

  -- Every door in, on the keeper.
  UPDATE nelos_categories k
     SET raise_modules = u.raisers
    FROM (
          SELECT g.keep_id,
                 array_agg(DISTINCT x ORDER BY x) AS raisers
            FROM (SELECT module_key AS mk, lower(name) AS lname, min(id) AS keep_id
                    FROM nelos_categories
                   WHERE module_key IS NOT NULL
                   GROUP BY module_key, lower(name)
                  HAVING count(*) > 1) g
            JOIN nelos_categories c
              ON c.module_key = g.mk AND lower(c.name) = g.lname
           CROSS JOIN LATERAL unnest(COALESCE(c.raise_modules, ARRAY[]::TEXT[])) AS x
           GROUP BY g.keep_id
         ) u
   WHERE k.id = u.keep_id;

  -- Anything the keeper has no answer for, taken from the copies.
  UPDATE nelos_categories k
     SET auto_condition   = COALESCE(k.auto_condition,   f.auto_condition),
         pic_seat_no      = COALESCE(k.pic_seat_no,      f.pic_seat_no),
         pic_user_id      = COALESCE(k.pic_user_id,      f.pic_user_id),
         pic_user_name    = COALESCE(k.pic_user_name,    f.pic_user_name),
         default_priority = COALESCE(k.default_priority, f.default_priority),
         default_days     = COALESCE(k.default_days,     f.default_days)
    FROM (
          SELECT g.keep_id,
                 min(c.auto_condition)   AS auto_condition,
                 min(c.pic_seat_no)      AS pic_seat_no,
                 -- There is no min() over a uuid, so it is compared as text.
                 -- Which copy wins does not matter: the keeper only takes
                 -- this where it has no PIC of its own.
                 min(c.pic_user_id::TEXT)::UUID AS pic_user_id,
                 min(c.pic_user_name)    AS pic_user_name,
                 min(c.default_priority) AS default_priority,
                 min(c.default_days)     AS default_days
            FROM (SELECT module_key AS mk, lower(name) AS lname, min(id) AS keep_id
                    FROM nelos_categories
                   WHERE module_key IS NOT NULL
                   GROUP BY module_key, lower(name)
                  HAVING count(*) > 1) g
            JOIN nelos_categories c
              ON c.module_key = g.mk AND lower(c.name) = g.lname
             AND c.id <> g.keep_id
           GROUP BY g.keep_id
         ) f
   WHERE k.id = f.keep_id;

  DELETE FROM nelos_categories c
   USING (SELECT module_key AS mk, lower(name) AS lname, min(id) AS keep_id
            FROM nelos_categories
           WHERE module_key IS NOT NULL
           GROUP BY module_key, lower(name)
          HAVING count(*) > 1) g
   WHERE c.module_key = g.mk AND lower(c.name) = g.lname
     AND c.id <> g.keep_id;

  PERFORM set_config('mjm.merged', COALESCE(merged::TEXT, '0'), false);
  PERFORM set_config('mjm.merged_names', COALESCE(NULLIF(names, ''), 'none'), false);
END $merge$;

CREATE UNIQUE INDEX IF NOT EXISTS nelos_categories_uniq
  ON nelos_categories (module_key, lower(name));

CREATE INDEX IF NOT EXISTS nelos_categories_raise_idx
  ON nelos_categories USING GIN (raise_modules);

-- ────────────────────────────────────────────────────────────────
-- PART 4: Route a new case off the title
--
-- First match wins, and the first three are the whole of it:
--     1. an assigned_module the caller set -- routing is the default, not
--        a rule, and that has always been true
--     2. THE TITLE ITSELF: the system that solves it, and its PIC
--     3. the raising section own default rule in nelos_routes, for a title
--        this screen has never heard of
--     4. it stays with the system it was raised in
--
-- The per-category rows left in nelos_routes are now inert: step 2 answers
-- before step 3 is reached. They are deliberately NOT deleted -- they are
-- the record of what was set, and the check at the foot of this file reads
-- them back to prove the flip landed on the same answers.
--
-- A title spelled the same under two solvers is the one thing that makes
-- step 2 ambiguous. PART 3 merges the ones this flip created, and the check
-- names any that a later hand edit creates. Until then the tie is broken in
-- the order below, so it is at least the same answer every time: a title
-- the raising system may actually raise, then an active one, then the one
-- the office put first.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nelos_route_case()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE c RECORD;
        d RECORD;
BEGIN
  IF NEW.assigned_module IS NOT NULL AND NEW.assigned_module <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.category IS NOT NULL AND NEW.category <> '' THEN
    SELECT nc.module_key, nc.pic_seat_no, nc.pic_user_id, nc.pic_user_name
      INTO c
      FROM nelos_categories nc
     WHERE lower(nc.name) = lower(NEW.category)
       AND nc.module_key IS NOT NULL
     ORDER BY (nc.raise_modules IS NOT NULL
               AND (NEW.source_module = ANY (nc.raise_modules)
                    OR '*' = ANY (nc.raise_modules))) DESC,
              nc.active DESC,
              nc.sort_order ASC NULLS LAST,
              nc.id ASC
     LIMIT 1;

    IF FOUND THEN
      NEW.assigned_module := c.module_key;
      IF NEW.assigned_seat_no IS NULL THEN
        NEW.assigned_seat_no := c.pic_seat_no;
      END IF;
      IF NEW.assignee_id IS NULL AND c.pic_user_id IS NOT NULL THEN
        NEW.assignee_id   := c.pic_user_id;
        NEW.assignee_name := c.pic_user_name;
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  SELECT nr.to_module, nr.to_seat_no, nr.to_user_id, nr.to_user_name
    INTO d
    FROM nelos_routes nr
   WHERE nr.source_module = NEW.source_module
     AND nr.category IS NULL
   LIMIT 1;

  IF FOUND THEN
    NEW.assigned_module := d.to_module;
    IF NEW.assigned_seat_no IS NULL THEN
      NEW.assigned_seat_no := d.to_seat_no;
    END IF;
    IF NEW.assignee_id IS NULL AND d.to_user_id IS NOT NULL THEN
      NEW.assignee_id   := d.to_user_id;
      NEW.assignee_name := d.to_user_name;
    END IF;
  ELSE
    NEW.assigned_module := NEW.source_module;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS nelos_cases_route ON nelos_cases;
CREATE TRIGGER nelos_cases_route
  BEFORE INSERT ON nelos_cases
  FOR EACH ROW EXECUTE FUNCTION public.nelos_route_case();

NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────
-- PART 5: Check it landed
--
-- WHAT A GOOD RESULT LOOKS LIKE, line by line:
--
--   1. SCREEN   one line per system, naming the titles its PIC now solves
--               and where each may be raised from. This is the new Case
--               Routing screen, read back out of the database. Compare it
--               against what the old screen said: the same pairs, read the
--               other way round.
--   2. MERGED   how many duplicate titles were folded together, and which.
--               Zero and "none" is the ordinary answer.
--   3. SAME     every old per-category rule, and whether the title now
--               agrees with it. Every line should read AGREES. A line
--               reading MOVED is a rule the flip did not carry over, and it
--               names the title to put right on the screen.
--   4. AMBIG    titles spelled the same under more than one system. Must be
--               none -- that is the one thing that makes routing a guess.
--   5. NOBODY   titles no system may raise by hand. An automatic title
--               belongs here. Anything else on this line is a title that
--               has fallen off every Work list.
--   6. CASES    cases already filed, and the queue each one sits in. These
--               must not have moved: this file routes new cases only.
-- ────────────────────────────────────────────────────────────────
SELECT 1 AS ord, 'SCREEN' AS part,
       m.label AS detail,
       COALESCE(string_agg(c.name
                  || ' [from ' || array_to_string(c.raise_modules, ' + ') || ']'
                  || COALESCE(' PIC seat ' || c.pic_seat_no::TEXT, ' PIC anyone')
                , ' | ' ORDER BY c.sort_order, c.name),
                '-- solves nothing --') AS reads
  FROM nelos_modules m
  LEFT JOIN nelos_categories c ON c.module_key = m.key AND c.active
 GROUP BY m.label, m.sort_order

UNION ALL
SELECT 2, 'MERGED',
       current_setting('mjm.merged', true) || ' duplicate titles folded together',
       current_setting('mjm.merged_names', true)

UNION ALL
SELECT 3, 'SAME',
       r.source_module || ' / ' || r.category,
       CASE WHEN c.id IS NULL
              THEN 'MOVED -- no title of that name anywhere now'
            WHEN c.module_key = r.to_module
             AND COALESCE(c.pic_seat_no, -1) = COALESCE(r.to_seat_no, -1)
              THEN 'AGREES -- solved by ' || c.module_key
                   || COALESCE(' seat ' || c.pic_seat_no::TEXT, ' anyone')
            ELSE 'MOVED -- the rule said ' || r.to_module
                 || COALESCE(' seat ' || r.to_seat_no::TEXT, ' anyone')
                 || ' and the title now says ' || c.module_key
                 || COALESCE(' seat ' || c.pic_seat_no::TEXT, ' anyone')
       END
  FROM nelos_routes r
  LEFT JOIN nelos_categories c ON lower(c.name) = lower(r.category)
 WHERE r.category IS NOT NULL

UNION ALL
SELECT 4, 'AMBIG', c.name,
       'solved by ' || string_agg(c.module_key, ' and ' ORDER BY c.module_key)
       || ' -- routing this title is a guess, give one of them another name'
  FROM nelos_categories c
 WHERE c.module_key IS NOT NULL
 GROUP BY c.name
HAVING count(DISTINCT c.module_key) > 1

UNION ALL
SELECT 5, 'NOBODY', c.name,
       'solved by ' || c.module_key || ' and no system may raise it by hand'
       || COALESCE(' -- opened by itself when ' || c.auto_condition, '')
  FROM nelos_categories c
 WHERE c.active AND c.raise_modules IS NOT NULL AND cardinality(c.raise_modules) = 0

UNION ALL
SELECT 6, 'CASES',
       COALESCE(k.category, '-- no category --'),
       count(*)::TEXT || ' case(s) raised in ' || COALESCE(k.source_module, '?')
       || ' sitting with ' || COALESCE(k.assigned_module, '-- nobody --')
       || COALESCE(' seat ' || k.assigned_seat_no::TEXT, '')
  FROM nelos_cases k
 GROUP BY k.category, k.source_module, k.assigned_module, k.assigned_seat_no

 ORDER BY ord, detail;
