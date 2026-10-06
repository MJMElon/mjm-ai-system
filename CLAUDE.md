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

## A tab's sync must never run twice at once

The batch detail tabs all have one shape: clear the tab's array, `await` two
database reads, then push the rows in. `switchTab` fires that sync **without
awaiting it**, and `prewarmAllTabs` runs the same syncs at page load. Click a
tab while the page is still warming up and the two runs interleave — the
second pushes its rows onto the array the first has already merged, and
`_t5MergeByPlot` **sums** the saved figures of rows it merges.

Every figure on 2nd Culling came out **double**, and nothing said so: the row
arithmetic still agreed with itself (5,949 − 486 = 5,463). Then Save writes
what is on screen, so one open-and-save wrote the doubled figure into the
ledger and the next open doubled that — 10 → 20 → 40, over weeks, with a
person's name against every save.

So every call goes through `syncOnce(tab, fn)`, which chains them, and a sync
builds its rows in a list of its own and assigns at the end. Two rules for
anything of this shape:

1. **Never fire an async rebuild without serialising it.** A function that
   clears shared state, awaits, and then writes to it is a race with itself.
2. **A merge that SUMS is a loaded gun.** If the same row can arrive twice it
   will, and summing hides it behind arithmetic that still adds up.

`tests/cull2_not_doubled.cjs` reproduces it — on the previous code two
overlapping runs give 486 / 34 / 6 and five give ×5.

What was already saved is found by its own fingerprint: the doubling summed
the TRANSPLANTED quantity too, and `saveTab5` writes that into the remark,
while the real total is the sum of the plot's `Transplanted` rows — which
that tab cannot touch. `shared/CHECK_cull2_doubled_sweep.sql` and
`shared/RUN_ME_undouble_cull2.sql` are that pair. Two limits worth knowing:
a Dead somebody TYPED in the doubled session was saved as typed and must not
be divided (the division not coming out whole is how it is told apart), and
a later clean save writes the remark's Transplanted back correct while
leaving the doubled Dead — wiping the fingerprint but not the fault.

**And the fingerprint undercounts.** Save rewrites that Transplanted every
time, so it only ever records the multiple of the LAST save, while the Dead
compounds across them: 252's U10 went 2 → 4 → 8 with the remark saying
"times 2" each time. Dividing once left it at 4. There is nothing in the data
that says how many saves a row went through, so the second division has to
come from the office or the paper — `RUN_ME_undouble_cull2_252_again.sql`
names its two rows rather than guessing a rule.

## A plot the salary claim does not know pays nobody

A work record names its PLOT and nothing else, so the plot is what puts it
back under a nursery. `shared/shared_maint_plots.js` is the one list both the
schedule and the salary claim read, and a plot missing from it is capacity
dropped on the floor — the claim shows dashes, which look exactly like a
quiet month.

It has now happened twice. First UNN 2 drawn as V1-V40 on one side and N1-N20
on the other. Then the **transfer plots**: a "-R" plot is made by a
3rd-culling transfer and is in no hardcoded list anywhere. The schedule grew
ways to draw one (a capacity keyed against it, rows of its own); the claim
never did, so every maintenance record on B3-R fell onto the orphan list.

`loadAll()` reads both `nops_maint_custom_plots` and **`shared_plots`** —
Seedling Stock, where the office says which nursery a plot is in, and the
same table the Setting page's capacity grid is built from. It spells the
nursery its own way ("UNN 1"), so the match is on letters and digits.

**When a new kind of plot appears, this file is the second place to change.**
The orphan list on the claim is what says it has not been.

## A month keeps its own work records

The schedule has always been stored per (nursery, month) in `nops_maint_state`.
The work RECORDS were not: ONE JSONB list for the whole system, and a
generated row's slot — `pd|W1|P|N15` — is the same string in every month. So
stepping to October and syncing matched October's round 1 against SEPTEMBER's
row and reused it. Nothing was deleted; **September was relabelled as
October**, which is why a month that has gone by could not be printed again,
and why a printed sheet was the only copy of it.

It was invisible while the field refilled the date and quantity every month.
The moment a full cell stopped being overwritten, September's hand-keyed
figures rode into October — the opposite of what a new month is.

So every row carries `_month`, the sync rebuilds only that month and leaves
the rest of the list alone, and the three places that READ the list —
`renderRecords`, `payrollRowsFor` (the Worker Record and its PDF) and
`applyFieldRecords` — ask for the month too. `_recInMonth(r, m)` is the one
test, and it is EXACT.

Letting a row with no month answer yes to any month looked like the safe way
to carry the old data over. It was not: every old row then appeared in every
month, so October opened full of September — and the next sync would have
stamped them all October and lost September for good.
`stampRecordMonths()` runs before the first draw. **A row knows its own
month: the day the work was done.** A nursery whose rows are stamped one
month while a CLEAR MAJORITY of its dated rows fall in another is stamped
wrong, and the dates win — which also repairs the first version of this,
which stamped inside the sync and so turned September into October the moment
somebody opened October. A clear majority, not any majority, so one job done
late cannot drag a month with it; undated rows ride with their nursery. Once
the stamps agree with the dates nothing moves again.

**Anything new that reads `records` must ask the month.** A reader that does
not will quietly mix every month together.

## The field fills an empty cell. It never writes over a full one.

A verified field record fills a row's date, batch and quantity. It used to
keep OWNERSHIP of what it had filled — `_fromFieldDate` on the row meant
"mine, I may write it again" — and the same mark let a sync BLANK the cell
when the record stopped pairing. Both of those changed figures nobody had
touched:

- the office corrected a worker's wrong date, and the next page load put the
  worker's back, every load, for ever;
- the round numbering changed, pairing moved, and rows the record left were
  emptied and then filled from whatever else matched.

So `applyFieldRecords` now fills only a cell that is EMPTY, and when a record
stops pairing it drops the LINKS (`_fieldIds`, `_fieldDates`, `_fieldTracks`,
the ticks) and leaves the VALUES alone. A worker's answer is the first
answer, not the last word.

The `_tarikhByHand` / `_batchByHand` / `_qtyByHand` marks stay, for the other
direction: a cell the office deliberately CLEARED is their answer too, and an
empty cell with the mark on it is not a question.

To take a corrected field record's date, clear the cell — then it is a
question again and the field answers it.

## An unverified figure is shown, and says it is unverified

Life of Seedlings is eighteen live sums of the batch ledger, and the ledger
is filled in BEFORE anybody checks it. A figure keyed this morning and one
signed off last week looked exactly alike.

Both ways of fixing that are wrong. Hiding the unverified batch leaves the
report answering a question nobody asked. **Zeroing an unverified stage is
worse**: a batch with Seed Received in and Actual Planted silently at nought
reports a Variance of minus the whole delivery — a wrong number wearing a
right number's clothes. So the figure is shown, and it carries a ⧗ saying
nobody has signed it, and the derived figures above it (Variance, Total
Culling, Balance) carry whichever of their parts is unsigned.

Three things to know before touching `LOS_GROUP_OF_TYPE` in
`operation/operation_reports.html`:

- **The unit is the COLUMN, not the tab.** 3rd Culling and Transfer are both
  signed on Tab 6; Transplanting Qty, Double Tone and premium care are three
  figures on Tab 3. A tally kept per tab puts a warning on figures somebody
  HAS signed, and a marker that cries over fine figures is one nobody reads.
  `LOS_STAGE_OF_GROUP` is the column→tab map that keeps the two apart.
- **A sign-off comes two ways** and either counts: one signature over a whole
  tab in `operation_batch_verifications`, or — on a tab verified row by row —
  a `Row_Verification` log per row, keyed `<stage>::<rowKey>`. The rowKey
  starts with the plot and only that part is matched, except a transfer card,
  which keeps its `|transfer`. `rowsAllSigned()` in
  `operation_batch_detail.html` draws the tab's tick by the same rule and
  `CHECK_which_batches_completed.sql` asks it of the record. Change one,
  change all three.
- **If the sign-off tables cannot be read, nothing is marked** and the report
  says so. Marking everything is not the cautious answer, it is a
  systematically wrong one — the same reason access fails open.

The As At date cuts the LINES off and never the signatures: a line dated
after it is in no figure on screen, while "has anybody checked this" is a
question about now.

## A row count is not a window

"Recent work is all a Field Conductor needs on a phone" was implemented as
`.limit(500)`. At a hundred records a day that is **five days**, and in a
quiet month it is two — nobody can tell which they are looking at, and
nothing on screen says the list has been cut. Worse, the cut MOVES: every
job saved pushes one off the end, so a record on the phone at breakfast is
gone by lunch, and the day it falls in the middle of is a different day each
morning. The office could see a job and the phone's History could not.

It could not simply be raised, because the read was `select('*')` and that
carries `gps_track` — every point walked, hundreds to a record. **That is
what the cap was really protecting.** The worker portal had already worked
this out: `worker_maint_records` lists its columns and says the track is
deliberately not among them, and `worker_maint_track` fetches the line for
the one record somebody opens.

So both doors now do the same thing: the list carries the GPS **summary**
(`gps_points`, `gps_distance_m`, start and end — stored beside the track for
exactly this), the window is **92 days** rather than a row count, and the
walk is fetched through `source.loadTrack(id)` when a map is opened. The row
cap that remains is a seatbelt, far above what three months comes to.

Two things that follow:

- **A card asks `gps_points`, never `gps_track`, whether a walk exists.** A
  record still in the outbox carries its own track and no id, so that one is
  used as it stands.
- **The offline cache has to hold the same window** (`MAX_RECORDS` in
  `offline.js`), or a conductor with no signal is back where he started. It
  strips the tracks, which is what makes a row small enough to.

`tests/history_is_a_window_not_a_count.cjs` guards all of it.

## Which nursery a record is in: the PLOT decides

The plot is the thing that is somewhere. A maintenance record is wherever its
plot is, whatever the record's own `nursery_name` happens to say — which may
be empty, or spelt the way the office types it rather than the way
`shared_plots` does.

The office has always read it that way (`_rejNursery`). The phone's History
did not: it compared the record's stored `nursery_name` against the nursery
picked at the top, letter for letter. So a job the office could see — signed
off, with the walk drawn beside it — was not in History at all, and a job
that cannot be found is a job somebody does twice.

Every nursery comparison in either repository goes through
`nurseryKey`/`plotKey` (strip everything but letters and digits, uppercase).
That includes the User Access tick list: it is typed by hand and says "UNN1"
where `shared_plots` says "UNN 1". It cannot widen access — two names with
different letters or digits give different keys.

`Barcode_Counter`'s `recordNurseryKey` and this file's `_rejNursery` are the
two copies. `shared/CHECK_why_not_in_phone_history.sql` names any record
whose stored nursery disagrees with its plot's, on every plot.

## Checked stops a figure being a formula

A linked quantity on the Work Maintenance list is a live sum of the batch
ledger — a sale, a 3rd culling, a stock adjustment on that plot all move it,
and they move it on rows settled months ago. A culling keyed a week late but
DATED before the work is the ordinary case, so a settled row's figure moves
after it was agreed.

So ticking Checked writes down what the row was reading (`qtyFrozen`, and
`batchFrozen` for the batch names the same ledger supplies), and unticking
throws it away and the link comes back. The order `recQty` answers in is:
a figure the office KEYED, then the frozen one, then the link.

It lives in `shared_plot_movement.js` because it is the piece-rate money as
well as the screen — the Worker Record capacity totals and the payroll salary
claim read the same function. A row checked before this existed is frozen
once, on the next load, at what it reads then: nothing recorded what it read
on the day, and that is the figure the office last saw.

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
