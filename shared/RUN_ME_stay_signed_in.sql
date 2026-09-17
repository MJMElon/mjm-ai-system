/* ═══════════════════════════════════════════════════════════════════════
   A WORKER STAYS SIGNED IN WHILE THEY GO ON USING THE PORTAL

   A worker's session is stamped with an expiry sixty days after the PIN was
   keyed, and that stamp never moves. So a worker who opens the portal every
   morning for two months is signed out on the sixty-first — mid-season, in a
   plot, by a clock rather than by anybody's decision. Keying the PIN again
   needs a signal, and the whole reason the phone caches its identity is that
   there often is none.

   The expiry now SLIDES. Every call the phone makes already touches the
   session row to record last_seen_at; the same touch pushes the expiry out
   another sixty days. Somebody using the portal is never signed out by it.

   ── What this deliberately does NOT change ──

   The sixty days still bite on a phone that STOPS being used — a handset
   lost in a nursery, or a worker who has left. That is what the window is
   for, and it is the one thing keeping a forgotten phone from being a
   permanent key. Sliding it only means the clock measures idleness instead
   of measuring how long ago somebody signed in.

   And the three things that end a session immediately are untouched, because
   they are the office's and not a clock's:

     · the session row is deleted            (Sign Out)
     · the worker is marked not Active       (Payroll register)
     · the worker's PIN is cleared           (Payroll register)

   Taking the PIN off somebody's row is still how you take the portal away
   from them, and it still works within one call.

   Safe to run twice. No data is changed and nothing is dropped — this
   replaces one function body.
═══════════════════════════════════════════════════════════════════════ */

CREATE OR REPLACE FUNCTION public.worker_from_token(p_token UUID)
RETURNS mjmnpayroll_workers
LANGUAGE plpgsql
/* NO volatility keyword, exactly as create_worker_portal.sql declares it —
   so VOLATILE, the default. It writes: marking the session seen, and now
   moving its expiry. Declaring it STABLE makes Postgres refuse the UPDATE at
   RUN time with "UPDATE is not allowed in a non-volatile function", which is
   every worker's every call — the whole portal, down, on a keyword. */
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  w mjmnpayroll_workers;
BEGIN
  -- Three things keep a session alive, and all three are things the office
  -- can take away from the Payroll register without touching this portal:
  -- the session has not expired, the worker is still Active, and they still
  -- have a PIN. That last one matters — without it, clearing somebody's PIN
  -- stops them signing in TOMORROW while the phone in their pocket carries on
  -- working for the next sixty days. Taking the PIN off a worker's row is
  -- meant to be how you take the portal away from them, so it is.
  SELECT wk.* INTO w
    FROM mjmnpayroll_worker_sessions s
    JOIN mjmnpayroll_workers wk ON wk.id = s.worker_id
   WHERE s.token = p_token
     AND s.expires_at > now()
     AND wk.active
     AND wk.pin IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '28000';
  END IF;

  /* Used today, so good for another sixty days.
     The touch was already here for last_seen_at; moving the expiry with it
     turns a fixed sixty days since SIGNING IN into sixty days since LAST
     USE. A worker who opens the portal every morning is never signed out by
     the clock; a phone nobody has touched since the dry season still is. */
  UPDATE mjmnpayroll_worker_sessions
     SET last_seen_at = now(),
         expires_at   = now() + INTERVAL '60 days'
   WHERE token = p_token;
  RETURN w;
END;
$fn$;

/* The grants are NOT re-stated, and must not be.
   anon is deliberately REVOKED from this function — it is the gate the other
   worker_* functions go through, not one a phone may call. Handing it to anon
   would let anybody with the public key turn a guessed token into a worker
   row directly. CREATE OR REPLACE keeps the existing grants anyway; this note
   is here because the reflex after replacing a function is to re-grant, and
   here that reflex is a hole. See section 10 of create_worker_portal.sql. */
REVOKE ALL ON FUNCTION public.worker_from_token(UUID) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';


/* ── Check ─────────────────────────────────────────────────────────────
   ONE result set, three rows, every Result reading OK.

   1  the function     it is there, it is VOLATILE (it writes), and anon is
                       still shut out of it — that one is a gate, not a door
   2  it slides        the body pushes expires_at on every use — this is the
                       change itself, and row 1 can be OK while this is not
   3  sessions         how many live sessions there are, and the soonest one
                       to expire. After a day's use every active worker's
                       session should be sixty days out; anything expiring
                       within a week is a phone nobody has opened in a while.

   Row 3 is a reading, not a pass mark — it is there so the number can be
   looked at again tomorrow and seen to have moved.                       */
SELECT * FROM (
  SELECT 1 AS n, 'the function' AS what,
         CASE WHEN to_regprocedure('public.worker_from_token(uuid)') IS NULL
                THEN 'MISSING'
              /* anon must NOT hold this one — see the note above the REVOKE.
                 A yes here is the hole, not the pass. */
              WHEN has_function_privilege('anon',
                     'public.worker_from_token(uuid)', 'EXECUTE')
                THEN 'CHECK IT — anon can call the gate directly'
              WHEN (SELECT provolatile FROM pg_proc
                     WHERE oid = to_regprocedure('public.worker_from_token(uuid)')) <> 'v'
                THEN 'BROKEN — not VOLATILE, so its UPDATE will be refused'
              ELSE 'OK' END AS result
  UNION ALL
  SELECT 2, 'it slides',
         CASE WHEN to_regprocedure('public.worker_from_token(uuid)') IS NULL
                THEN 'no function'
              WHEN pg_get_functiondef(to_regprocedure('public.worker_from_token(uuid)')::oid)
                   ~* 'expires_at\s*=\s*now\(\)\s*\+'
                THEN 'OK'
              ELSE 'NOT YET — the expiry is still fixed at sign-in' END
  UNION ALL
  SELECT 3, 'sessions',
         CASE WHEN to_regclass('public.mjmnpayroll_worker_sessions') IS NULL
                THEN 'no sessions table'
              ELSE COALESCE((
                SELECT count(*) FILTER (WHERE expires_at > now())::text
                       || ' live · soonest expiry '
                       || COALESCE(to_char(min(expires_at) FILTER (WHERE expires_at > now()),
                                           'DD Mon YYYY'), '—')
                  FROM public.mjmnpayroll_worker_sessions), 'none') END
) x ORDER BY n;
