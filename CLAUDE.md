# Working on MJM Nursery's systems

Notes for whoever picks this up next, human or otherwise.

## Hand over the SQL. Every time.

**The environment cannot reach Supabase.** Not "should not" — the firewall
blocks it, so no schema or data change can be applied from here, ever.

So any change that needs something run in the database is not finished when
the code is pushed. It is finished when the person has a block of SQL they can
paste into the Supabase SQL Editor and run. Give it to them without being
asked, in the same reply as the change.

What that SQL should be:

- **One file, one paste.** Not "re-run these three files" — assemble the parts
  that actually changed into a single block. `shared/RUN_ME_*.sql` are examples.
- **Safe to run twice.** `IF NOT EXISTS`, `CREATE OR REPLACE`, `ADD COLUMN IF
  NOT EXISTS`. Somebody will run it twice.
- **Ending in a check** that prints what should have happened, so they can see
  it worked rather than hoping. Say what a good result looks like.
- **One result set.** The SQL Editor shows only the LAST statement's result, so
  a file of nine queries answers eight questions into the void. UNION ALL them.
- **Survives a paste.** The editor is not psql: it has choked on a regular
  expression, on a backslash, and on `ERROR: 42601: syntax error at end of
  input` with nothing to point at. So: no regex and no backslashes (`split_part`,
  `position()`, `left()`, `LIKE` with no escapes do the same work); the file
  ENDS at its last semicolon, with the explanation of what to look for ABOVE the
  query rather than trailing after it; and no semicolon inside a comment. A
  trailing comment block is a statement with no statement in it, which is what
  that error reads like.
- **Tested first.** There is a scratch Postgres 16 for this — see below. Run
  the SQL against a stubbed copy of the real tables before handing it over, and
  test it against the state the database is ACTUALLY in, not a fresh one.

If a change needs no SQL, say so plainly. "Nothing to run" is an answer they
need as much as the SQL is.

## One batch is the example, never the scope

Bugs arrive as a screenshot of one batch, because that is the one somebody
was looking at. **The fix belongs to every batch**, and so does the answer:
if batch 232's Premium Care is missing from 1st Culling, so is every other
batch's, and a fix that names 232 has fixed nothing.

The page code is shared, so a change there is global by construction. The
trap is the SQL handed over with it: a file with one batch number on line 1
puts the person back where they started, opening batches one at a time to
find the rest. **Write the repair to sweep every batch**, with a rule
precise enough that the batches which are fine are left alone, and have it
print which ones it touched. `shared/RUN_ME_clear_stale_tab_signoff.sql` is
the shape: what counts as needing the repair, what was deliberately kept,
and a second run that finds nothing.

A per-batch query still earns its place as the drill-down once the
batch-wide one has named a batch — `CHECK_which_batches_completed.sql` and
`CHECK_batch_not_completed.sql` are that pair. The batch-wide one comes
first.

## Interrow spraying counts what was there BEFORE the 2nd culling

Every other maintenance job is done TO the seedlings — P & D spraying,
manuring, weeding — so a batch 2nd culled last week is that many fewer to
treat, and the linked quantity takes the culling off.

**Interrow spraying is the ground BETWEEN the rows.** A 2nd culling takes the
dead seedling out of a polybag that is still sitting exactly where it was:
same rows, same gaps, same walk, same spray. So an interrow row is worth the
figure *before* the culling comes off — B5 in Sep 2026 reads 6,515 on the
other three jobs and **6,788** on interrow, the difference being its 273 2nd
culled.

**A batch keyed on the row still decides, interrow included.** Interrow is
usually the whole plot — the worker walks the lot in one go — and leaving the
batch cell empty is how that is said, because an empty batch cell has always
meant every batch standing there. Somebody who writes a batch on the row has
answered the question, and this rule does not overrule them: it is about the
2nd culling and nothing else.

It is the quantity, so it is the piece-rate money: the Work Maintenance list,
the Worker Record capacity totals and the payroll salary claim all quote it.
The rule therefore lives in `PlotMovement.isInterrow` / `qtyOpts(record)` /
`liveCount(evs, {keepCull2})` in `shared/shared_plot_movement.js`, and
`recQty(record)` / `recBatches(record)` read the work type off the record and
apply it — so a new caller gets it without knowing it exists. Do not
re-implement it in a page.

**The job is the `jenis`, never the chemical.** The chemical changes round to
round — Monex one round, something else the next — and says nothing about
which job it is.

A quantity KEYED BY HAND still wins over all of this, which is the one way an
interrow row can go on showing the old smaller number;
`shared/CHECK_interrow_qty_keyed.sql` names those rows on every plot.

The Nursery Movement Report and the phone's batch list still subtract the 2nd
culling, because they answer "what is standing", which is a different
question. That difference is deliberate and is written out in that file.

## A permission that is saved but not obeyed is worse than no permission

It has happened three times in this codebase. A screen writes a setting, the
thing it governs never reads it, and the screen goes on showing it as set. It
looks configured. Nobody finds out until somebody trusts it.

Two rules that would have caught all three:

1. **`normalize()` in `shared/shared_access.js` drops every key it does not
   name.** If you add a permission key, add it there, or it will not survive
   the trip into any office page. Keys ending `_pages`, `_actions`, `_areas`
   and `_nurseries` are carried by pattern; anything else needs naming.
2. **Test the whole path, not the two ends.** Comparing the screen's rule to
   the gate's rule proves nothing if the thing between them throws the data
   away. Send a saved row through it.

## Access fails OPEN, and that is deliberate

`canScan()` and `canScanArea()` answer "yes" for anybody nobody has configured,
falling back to whatever governed that door before the tick existed. It is what
stops a deploy taking access away from people who never asked for a change.

Which means: **an absent answer is not "no", it is "nobody has been asked"** —
and code that writes today's default into somebody's row turns an unasked
question into a decision. Do not seed defaults into saved rows.

## The three layers of a Maintenance permission

Getting these confused is the single easiest mistake here.

| Where | Question | Rule |
|---|---|---|
| System Setting → Portal View & Function | does the company do this at all | off vetoes everyone; on raises the default |
| Setting → a person → Edit Access | may this person do it | their answer beats the company's |
| Worker Portal → Settings → a worker | may this worker do it | same |

Off beats on. A company switch decides for the people nobody has decided
about, and never overrules the ones somebody has.

## `RETURN QUERY` compares types exactly, and will not convert

A `RETURNS TABLE` function whose select list has INTEGER where the promise
says NUMERIC does not convert it. It raises

    structure of query does not match function result type

the first time somebody opens the screen, and takes the WHOLE call down —
which in the worker portal means the whole board, over one column. It cost a
day: `nops_maint_field_records.qty` is INTEGER, `week_no` is SMALLINT,
`shared_plot_batch_balance.qty` is BIGINT, and all three were promised as
something else.

So **cast every column in a `RETURN QUERY` to the type the `RETURNS TABLE`
list names** — `r.qty::NUMERIC`, `wk.full_name::TEXT`. Do not instead change
the promise to match today's column; the cast keeps working when somebody
widens the column later.

Two more things about these functions:

- **Postgres will not `CREATE OR REPLACE` a function whose OUT columns
  changed.** `DROP FUNCTION IF EXISTS` first — and the drop takes the grants
  with it, so re-`GRANT EXECUTE ... TO anon, authenticated` after, or the
  portal is shut.
- `NOTIFY pgrst, 'reload schema';` at the end, or PostgREST goes on serving
  the old picture.

## Testing without the database

There is a scratch PostgreSQL 16 for exactly this:

```
su postgres -c 'export PATH=/usr/lib/postgresql/16/bin:$PATH; \
  pg_ctl -D /var/lib/postgresql/wp -o "-p 5599 -k /tmp" -l /tmp/pg.log start'
psql -h /tmp -p 5599 -U postgres -d postgres
```

Stub the tables the SQL touches, install the PREVIOUS version of whatever you
are changing, then run the new file over it. That is the state production is
actually in, and it is where the interesting failures are.

For the phone app, Playwright and Chromium are at `/opt/pw-browsers/chromium`.
Two things that will cost an hour each if nobody tells you:

- **Routes match in REVERSE registration order.** Register the catch-all FIRST.
- **`page.goto()` with an identical hash is a no-op.** Use `reload()`.
- **`innerText` returns CSS-transformed text**, so `includes('This Week')`
  fails against `THIS WEEK`.

## Two repositories, one system

- `mjm-ai-system` — the office, ai.mjmnursery.com. Static; served from the
  repository as-is, no build.
- `Barcode_Counter` — the phones, scan.mjmnursery.com. Vite; CI builds and
  commits the output back to the repository root.

Rules that live in both — the general-worker filter, the maintenance function
keys, nursery-name matching — carry a comment in each copy saying so. Change
one, change the other.
