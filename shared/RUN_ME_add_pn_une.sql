/* ═══════════════════════════════════════════════════════════════════════
   PRE NURSERY AND THE ESTATE, ON THE NURSERY REGISTER

   Facility Management → Manage Nurseries & Base Maps holds three: BNN,
   UNN 1 and UNN 2. Pre Nursery and the Estate are real places the system
   already files people and work under — PN has fifty-two plots, UNE is a
   section on the payroll register and a location on System Setting — but
   neither has ever been ON the register.

   That gap shows up wherever something reads the register rather than a
   hardcoded list: the Location card marks them "Not in the nursery list",
   and the payroll's nursery dropdown now reads the register too. So they go
   on it.

   ── The licence is left empty, deliberately ──

   A licence number is a fact about the company that this file does not know,
   and inventing one would put a wrong number on a claim form. The rows go in
   without one; fill them in on Facility Management, which has a pencil on
   every card for exactly that.

   The names are the codes, spelt the way the register spells the others:
   uppercase, and the space where the existing rows have one. Every screen
   keys a nursery on its letters and digits alone, so "UNN 1" and UNN1 are
   one nursery — but matching the register's own style keeps the card list
   looking like a list.

   Safe to run twice: neither row is added if a nursery of that name is
   already there, whatever case or spacing it was keyed in.
═══════════════════════════════════════════════════════════════════════ */

DO $add$
DECLARE
  n INT;
  /* The licence column is NOT NULL on some copies of this table and not on
     others, depending on when it was created. Try the honest empty answer
     first and fall back to a blank string rather than failing the file. */
  blank TEXT;
BEGIN
  IF to_regclass('public.operation_nurseries') IS NULL THEN
    RAISE NOTICE 'SKIPPED — there is no operation_nurseries table on this '
                 'database, so there is no register to add to.';
    RETURN;
  END IF;

  SELECT CASE WHEN is_nullable = 'YES' THEN NULL ELSE '' END INTO blank
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'operation_nurseries'
     AND column_name = 'license';

  EXECUTE $q$
    INSERT INTO public.operation_nurseries (name, license)
    SELECT v.name, $1
      FROM (VALUES ('PN'), ('UNE')) AS v(name)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.operation_nurseries o
        /* Letters and digits only, so a row already keyed as "P N" or "une"
           counts as there and is not duplicated. */
        WHERE upper(regexp_replace(COALESCE(o.name, ''), '[^a-zA-Z0-9]', '', 'g'))
            = upper(regexp_replace(v.name, '[^a-zA-Z0-9]', '', 'g')))
  $q$ USING blank;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'added to the register: % (2 in the file)', n;
END
$add$;


/* ── Check ─────────────────────────────────────────────────────────────
   ONE result set, one row per nursery on the register, in the order the
   cards are drawn.

   Expect five: BNN, PN, UNE, UNN 1, UNN 2. `licence` reads NEEDS KEYING for
   the two just added — that is not a failure, it is the one thing this file
   deliberately did not invent. Fill them in on Facility Management.

   `code` is what every other screen will call it: the name with the spaces
   taken out. That is what a worker's section is matched against, so it is
   worth reading once — a nursery whose code is not what its people are filed
   under will show an empty sheet.                                        */
SELECT name                                             AS "on the register",
       upper(regexp_replace(COALESCE(name, ''), '[^a-zA-Z0-9]', '', 'g'))
                                                        AS code,
       COALESCE(NULLIF(btrim(COALESCE(license, '')), ''), 'NEEDS KEYING')
                                                        AS licence
  FROM public.operation_nurseries
 ORDER BY name;
