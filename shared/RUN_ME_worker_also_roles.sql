-- ALSO WORKS AS, on the Worker Namelist
--
-- A worker keeps ONE role (pay, the tick sheets and Mata Malam read it).
-- also_roles is the list of other jobs the same person does, for example a
-- General Worker who is also the Night Watchman. The Worker System chart
-- draws the person in those rows too, marked also.
--
-- Nothing else reads this column, so adding it moves no pay and no access.
-- Empty for everybody until somebody ticks one. Safe to run twice.
--
-- What a good result looks like: one line, column also_roles present, and
-- workers_with_other_jobs 0 the first time.

ALTER TABLE public.mjmnpayroll_workers
  ADD COLUMN IF NOT EXISTS also_roles TEXT[];

NOTIFY pgrst, 'reload schema';

SELECT 'also_roles' AS column_name,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'mjmnpayroll_workers'
           AND column_name = 'also_roles') = 1 AS present,
       (SELECT count(*) FROM public.mjmnpayroll_workers
         WHERE also_roles IS NOT NULL AND cardinality(also_roles) > 0) AS workers_with_other_jobs;
