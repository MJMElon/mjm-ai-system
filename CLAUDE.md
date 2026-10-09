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
- **No apostrophe in a comment, ever.** Same error, same empty caret, and it
  cost a paste after everything else on this list was already obeyed. psql
  strips a `--` comment BEFORE parsing, so the file runs fine on the scratch
  Postgres; the editor counts quotes FIRST, so one apostrophe — the possessive
  of a month, a "doesn't" — opens a string literal that never closes, swallows
  the rest of the file, and leaves a statement with no statement in it. An
  EVEN number survives by luck, which is worse than failing, because it makes
  the rule look like it does not exist: 95 files in `shared/` carried an odd
  count the day this was found. Write "the September row" and "does not".
  **All 219 files in `shared/` have now been swept** — 183 of them changed —
  and `tests/sql_pastes_into_the_editor.cjs` holds every one of them to it.
  `tools/sweep_sql_comment_apostrophes.py` is what did it, and the care is all
  in finding a comment: a line beginning `--` INSIDE a string literal is DATA,
  block comments count the same way, and a `$$ … $$` body is CODE with its own
  comments and strings. A `startswith('--')` gets all three wrong. It was
  proved by deleting every comment from the old and the new copy of each file
  independently and comparing what was left: **0 files differed outside a
  comment.**

  Three paste rules are still owed across the older files, each its own
  sweep, and the test prints the count every run: **144 carry a semicolon in a
  comment**, 30 contain a backslash, and 46 do not end at a semicolon.
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

It then happened a fourth time, in the other repository folder: the salary
claim's `maintTotals` in `npayroll/npayroll_script.js` filtered on `jenis` and
nursery and nothing else, so it summed every month at once. UNN 1 weeding read
**191,515** on the claim card against **183,996** on its own Worker Record —
one U18 row stamped `Aug 2026` that September has no business counting. It was
invisible for as long as no other month held a CHECKED row, and the moment one
did it walked onto the claim and was priced. `_maintInMonth` is that file's
copy of the test, EXACT for the same reason, and the rows it turns away are
counted: another month is normal and says nothing, while a row with **no**
month is on no claim at all and is named under the total.
`tests/claim_asks_the_month.cjs` holds it.

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

## A batch's height is a join, because the form never asked for the batch

Seedling Height in the Pre-Nursery is audited **plot by plot** — the form has
no batch box on it at all, deliberately (`audit_script.js` says why: a PN plot
holds one lot, so the batch layer was a second tap for nothing). So "how tall
is batch 268" cannot be read off the height records. It is the ledger that
answers the first half.

`buildBatchHeight()` in `audit/audit_report.html` is that join, and three
things in it are easy to get wrong:

- **The batch tests are the Batch Record page's own**, not new ones. Age is
  anchored on the KEYED `transaction_date` of `Seeds_Received` and never on
  the row's insert time, and any of the three Transplanted types means the
  batch has gone out. Two pages answering "is this batch still in the
  Pre-Nursery" differently is how a batch ends up on one list and not the
  other. `operation_batch_record.html`'s `processBatchLogic` is the original.
- **Three plain means, one per level** — a plot is its readings on its LAST
  audit day, a batch is the mean of its plots, an age group is the mean of its
  batches. A batch standing in three plots is ONE batch in its group's figure.
  Averaging every reading instead quietly weights the group by how many plots
  each batch happens to sit in.
- **As at the month, not as at today.** A batch is however old it was at the
  end of the month being reported, and one transplanted afterwards was still
  standing in it — so September reads the same in December as it did in
  September. Same rule the As At date follows on Life of Seedlings.

`shared_plot_batch_balance` is no help here and must not be reached for: it is
the MAIN nursery movement, and its own file says Planted takes no part in it.
The PN plots come from the `Planted` logs.

A batch with no `Planted` log, or a plot nobody measured, is **shown saying
so** rather than dropped — a batch missing from the ledger is the thing
somebody needs to see, and the section counts how many have no reading
underneath the four averages. `tests/batch_height_by_age.cjs` holds all of it.

## A stock adjustment counts once it is APPROVED, and that was tried the other way

The approval step was taken out and put back inside one afternoon, and the
reason it came back is worth more than the rule itself.

Taking it out looked right: the person keying the correction is the person who
went and counted, so holding their answer behind a second signature only meant
a report known to be wrong went on being shown as right. All four readers
dropped the gate together — `syncAdjustmentBars` and `paintT3Adjustments` in
`operation_batch_detail.html`, `shared/shared_plot_movement.js` (the piece-rate
quantity), and `operation_reports.html` three times over.

Then the check that went with it came back: **206 of the ledger's 218
adjustments have no approval at all**, and between them they come to
**−196,777 seedlings**. They had been inert for as long as the gate stood.
Dropping it moved the Movement Report, Life of Seedlings and the piece-rate
quantity by that much, in one afternoon, with nothing on any screen saying so.
The office's answer, once they could see the size of it, was to put the gate
back.

So: **a figure moves when somebody approves it.** Four readers, one rule, and
they have to stay in step — a gate left out of one of them makes that reader
the only place in the system where an unapproved figure counts.

Two things from the attempt are worth keeping in mind before anyone tries
again:

- **The check is what made it decidable.** The rule change took an hour; the
  question "what does this actually move" took one query, and the answer
  reversed the decision. Hand over the check with the change, every time.
- **206 rows carry no `Report:` either**, and for an hour that was read as
  "not an adjustment anybody raised" and used to gate them. It is not true —
  the office confirmed them as real corrections. A `Stock_Calibration` row is
  an adjustment because of what it IS, not because of how its remark is
  worded. The label decides WHERE a figure lands on the batch tabs
  (`ADJUST_APPLIES_TO`), never whether it is real. Do not gate on it.

`shared/CHECK_adjustments_waiting_for_approval.sql` is the query that answered
it, and `shared/CHECK_what_wrote_these_adjustments.sql` groups those rows by
the wording of their remark.

## Naming the tray on a Transplanting adjustment says WHERE the seedlings are

Two corrections wear the same name. Both say the plot does not hold what the
transplant record claims; they differ in where the seedlings are NOW, and
only the person raising it knows:

- **It names a tray** — the count of what LEFT the tray was wrong. The batch
  still has them. The allocation BASE does not move; what is standing in the
  main plots does, and Pending closes by that much.
- **It names no tray** — they reached the plot and then went: stolen, dead,
  miscounted on the ground. The base moves too, both sides drop by the same
  amount, and Pending is unchanged. That is the batch 234 / 242 rule from
  before and it is still right.

`calcTransplanting` splits them: `plotLossT3` is all of them and goes on
`mainStanding`, `trayLossT3` is the tray-named subset, and only
`goneLossT3 = plotLossT3 − trayLossT3` reaches `allocBase`. The old sum put
every adjustment on BOTH sides, so a tray-named one cancelled itself out.

Batch 234 is what that looked like: Pending read **6** with a **+6**
adjustment sitting on the same screen. Six more had gone out of the tray than
the row said, the base carried the +6 as well, and the tab went on looking
for six seedlings that were already standing in the plot — so its ring could
never leave 99% and the stage could never be ticked off.

**`ADJUST_APPLIES_TO` does not change.** The 2nd and 3rd Culling still take
every Transplanting adjustment, tray-named or not: both are measuring what is
standing in the plot, and six more that arrived are six more to cull.

**And the form now says this out loud** (`_t7TrayTableHtml`), because naming a
tray stopped being record-keeping and started changing a figure. A rule
nobody is told about is a rule somebody trips over — and the tray column
became optional on the same day, so both answers are one click apart.

`tests/tray_named_adjustment_closes_pending.cjs` drives 234's own figures
through the real page: ten of its assertions fail on the previous code.

## An amendment is dated by the amendment, and it lands in the TOTAL

The Transplanting Report lists one line per transplant record. An approved
Stock Calibration against that report used to reach it only as a **dotted
underline on the row of the plot it corrected** — hoverable, and worth
nothing to the figure on screen.

Two things were wrong with that, and the second is the one worth keeping.

**A mark is not a figure.** Nobody hovers; the number on screen is the number
that gets written down.

**And it was dated by the wrong event.** The mark sat on the TRANSPLANT row,
so it lived in the month the seedlings went out. Batch 225 went out in March
and was amended in **December**, and a December range therefore showed one
record of 6,362 and no sign of the amendment at all — while the office
knew December had moved by 1. **The correction happened in December whatever
month the seedlings went out in**, so an amendment belongs to the range that
covers the CALIBRATION date, never the transplant date.

Where it lands was decided after two wrong answers, and both are instructive:

- **Added into the row** — then the row no longer says what was keyed on
  the day, and a record that reads differently from the paper it was keyed
  off is not a record.
- **A line of its own** — then an amendment looks like a transplant, and
  the record count on a report headed "1 RECORD" starts counting corrections.

So: **the rows are untouched, and the amendment goes into the TOTAL** —
the one figure on the page that claims to be how many went out. Where the
total carries one it is **dotted**, and the hover names the calibration date,
the batch, the plot and the amount of each. A total that is more than the rows
above it add up to is exactly the kind of figure that has to say why.

Two things fall out of it:

- **The same filters apply.** An amendment on a UNN 1 plot is out of a UNN 2
  report, and one of nought is not shown at all.
- **A range with an amendment and no transplant still prints a Total.** Only
  the rows were empty; the month really did move.

`tests/transplanting_report_qty.cjs` holds all of it, both office figures
included, and drives the real build rather than a copy.

`shared/CHECK_transplanting_report_qty.sql` names any amendment whose `Plot:`
text matches no transplant row — the report compares that text against
the plot on the transplant row **letter for letter**, with none of the key
normalising used everywhere else, so a stray space is enough to make an
approved amendment invisible. It was 0 of 8 the day this was written.

## Transplanting is not over-allocated by exactly its own adjustment

The other side of the same coin, and it reads worse on screen because the
engine says ERROR.

A report that balanced to the seedling BEFORE a tray-named adjustment reads
Over Allocated by exactly that adjustment after it, because the adjustment
moves what is standing in the plot and deliberately leaves the batch total
alone. Batch 225: 9,658 into its main plot, 815 first-culled, a base of
10,473 — and a **+1** on N19, "found 1 more seedling when processing the 2nd
culling", keyed against the tray it came out of. **Over Allocated by 1, ring
stuck at 99%**, with the +1 sitting in the Adjustment column of the same
screen. The one figure that accounted for the difference was the one being
called an error.

`rawPending` is the sum LESS the tray-named net, so **`rawPending ===
−trayLossT3` is the same statement as "it balances on its own figures"** —
there is nothing to compare, the test falls out of the arithmetic.
`calcTransplanting` floats a note when it holds, the match box reads
Satisfied, and `updateTransplantCompletion` takes `explained` so the ring may
reach 100 (the drone-map condition is untouched — a missing map still holds
it at 99 unless HQ has signed).

Exactly, never nearly, for the reason below. And a difference that is NOT the
adjustment still reads as an error: 51 out with a +1 adjustment is an
over-allocation of 51.

`tests/over_allocated_by_the_adjustment.cjs` holds it, including that the
same +1 naming NO tray needs no note at all — that one moves both sides of
the sum and the allocation never stopped balancing.

## 1st Culling is not wrong when Transplanting was adjusted after it

A plot can be over-allocated: the transplant record counts 1,053 into U3 and
only 1,000 went in. A Transplanting adjustment of −53 settles Transplanting.
**1st Culling does not settle, and must not** — a 1st culling happens in the
TRAY, before any of these seedlings go out, so taking the plot's loss off it
as well subtracts one loss twice. That is `ADJUST_APPLIES_TO`, and it is
right.

What it leaves is a report whose arithmetic is correct and whose status line
reads "Over Allocated by 53" for ever: the ring never fills, no tick can be
given, and a stage that can never be finished is one people stop looking at.

So where the difference is **EXACTLY** the batch's Transplanting adjustments,
`calcCulling` floats a note saying so and `updateCullCompletion` lets the ring
reach 100. Exactly, never nearly: a near-match is a coincidence, and a note
that guessed at one would teach people to wave real mistakes through — the
same reason the drone-map panel demanded an exact match.

`tests/cull1_explained_by_transplanting.cjs` holds both halves, including that
a difference which is NOT the adjustment still reads as over-allocated.

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

## The only thing that asked "can this login save" was the save

Twice in one week an auditor filled in a day of work and found out
afterwards that the database would not take it. The first time the audit
tables were gated on a module check the app had stopped asking for; the
second the sweep that empties the queue stalled on a photo. Both are
fixed. **Neither was found by the system** — both were found by an
auditor, days later, with seventy finished audits stranded on a phone and
nothing in the office saying a word.

That is the part that would have come back. A permission is checked at the
moment of the save, which is the moment AFTER the work, and a phone with
no answer looks exactly like a phone with a yes.

So the phone asks at sign in. `public.audit_can_i_save()`
(`shared/RUN_ME_audit_save_check.sql`) answers per table, and
`checkCanSave()` puts a red bar up before the first form is opened:
*"This login cannot save maintenance audits — tell the office BEFORE you
start."*

Four things in it:

- **It reads the REAL policy out of `pg_policy` rather than keeping a
  second copy of the rule.** A hand-written mirror of a policy is a thing
  that drifts, and the drift is invisible until somebody trusts it.
  Permissive policies are OR-ed and restrictive ones AND-ed, the way
  Postgres does it, and the GRANT and the table being there are asked
  separately — all three have failed on their own here, and the answer
  says which.
- **It was proved against a real insert, not against itself.** The scratch
  Postgres runs every login against every table twice — once through the
  function, once by actually inserting and rolling back — and compares.
  It agrees on all eighteen pairs on a healthy database, with a grant
  revoked, with a policy dropped, and with the module gate that caused the
  original incident put back.
- **It fails OPEN.** No answer is the function not being installed, or no
  signal, or a timeout — never a refusal. A check that cannot run must not
  take the module away from somebody who was working fine a minute ago,
  and it must not clear a warning it cannot disprove either. Only an
  explicit `ok=false` from the database raises the bar.
- **Its own check does not ask as the owner.** The SQL Editor runs as the
  database owner with no login attached, so every policy that asks who you
  are answers no — six red lines on a database where every auditor is
  fine. Row 1 asks as each auditor in turn and rows 3 onward count the
  logins per table. The file beside this one had already made that mistake
  once, reading "7 of 6 -- NOT OK" on a healthy database.

Diagnostics section 7 shows the same answer per table, and the red bar
taps through to it.

## An outbox is half of recording with no line. The LIST is the other half.

The queue has always worked: an audit saved with no signal goes into
IndexedDB and is sent when the line comes back. What nobody checked is
whether there is anything on screen to record AGAINST.

Plot Condition, Seedling Height and Papan Tanda each keep the PROCESSED
list in localStorage and serve it when `navigator.onLine` is false, so
with no signal the auditor still sees yesterday's plots and can work.
**Maintenance had none of that.** Its `loadAll` fires three reads and the
middle one, `audit_maintenance_audits`, carries no `.catch`, so one
failure throws past the whole function: `tasks` is never set,
`renderLists` never runs, and the screen reads "Failed to load" over an
empty list. With no line that is every single time. The auditor is
standing in the plot with the work in front of them and the app has
nothing to offer — and the outbox underneath it, working perfectly, has
nothing to put in it.

So Maintenance now carries `_saveOfflineCache` / `_loadOfflineCache` and
the same offline short-circuit, copied from `audit_script.js` rather than
invented: **Plot Condition is the one to copy, it is the steadiest of the
four.** Two things about the shape:

- **Cache the PROCESSED state**, the same shape the renderer already
  reads. Caching raw rows means re-deriving the plot placement on restore,
  which is a second copy of the rule and a second thing to get wrong.
- **A failed load WITH a line falls back to the cache too.** A flaky
  tower or a refusal used to leave the same empty screen as no signal at
  all. Yesterday's list is a better answer than nothing, and the toast
  says which day it is from, so nobody mistakes it for live.

`tests/every_audit_records_with_no_line.cjs` holds all four modules to the
three things the office actually asked for — it can record the work, it
can record with no line, it syncs when the line comes back — and reads the
SHIPPED files, because the whole fault was one of four drifting out of
step with the others and nothing saying so.

## A sweep with no timeout is a queue that stops for ever

Seventy finished maintenance audits sat on an auditor phone. The first round
was real: the audit tables were gated on a module check the app had stopped
asking for, so the database refused every row. That was repaired and PROVED —
the repair ends by inserting as each auditor and rolling it back, and it came
back 46 of 46.

The phone still would not empty. The banner read **69 pending (1 stuck)** and
did not move while it was watched, and the Sync pill said the last clean
sweep had been a minute earlier. Those two facts together say it: the sweep
is not FAILING, it is not FINISHING.

`smartSave` had always wrapped its photo upload and its insert in a timeout.
`syncNow` wrapped NEITHER. One stalled upload on a nursery signal held the
for-loop on item one for ever; `_syncing` stayed true, so the 30-second timer
and every tap after it answered "already syncing" and did nothing, and a
reload started the same stall again. The tell is in the data and nowhere else:
**none of the sixty-nine had been retried even once**, which is why none of
them had reached the five-try park.

Four rules, each the shape of a way a queue wedges:

- **Every call inside a sweep gets a timeout.** A call that never answers must
  end that ITEM, not the sweep. The item retries next time; the sweep carries
  on to the sixty-eight behind it.
- **The in-flight flag is released in a `finally`,** and a flag older than any
  sweep can be is taken over. Without the takeover, a phone holding the
  previous version of the file stays frozen until somebody clears site data —
  nothing on the phone can clear a flag set by code that never came back.
  Taking over is safe because an item is marked done only after the server has
  taken it, and a second insert of a row already there comes back 23505, which
  the loop already retires quietly.
- **A photo url is written into the QUEUE ROW the moment it exists,** before
  the photo is deleted from the phone and before the insert that may still
  refuse. It used to live only in a local variable: upload succeeded, photo
  deleted, insert refused, and the row went back to the queue still saying
  `__IMG__`. The next sweep found no photo, read null, and saved the audit
  photo-less — on a form that makes the photo compulsory.
- **A count that does not move is, on a phone, the same thing as a stop.**
  Sixty-nine audits with a photo each is minutes of work, so the badge counts
  "Sending 12 of 69" through the sweep. The previous version refreshed the
  badge once at each end and said the same number for the whole of it.

And the instrument, which matters more than any of them. The only thing on
screen about those seventy audits was a number in a green bar, so the question
"refused, or waiting, or going up right now and slow?" could only be answered
by sending a video of a number not moving. **`audit/audit_diagnostics.html`
now reads the outbox straight out of IndexedDB** — how many wait, how many the
server refused and the reason against each, which table, how old the oldest
is, and how many tries the waiting ones have had. All on nought is the
signature of a sweep that is not finishing, and the verdict says so in those
words. It reads with plain `indexedDB`, never through
`audit_dexie_offline.js`, for the same reason as the rest of that page: it has
to answer when the file it is reporting on is the broken one. Nothing had ever
linked to it, so the Administration row on `audit_admin.html` does, and the
stuck-badge dialog offers it before it offers the delete.

`tests/sync_cannot_wedge.cjs` holds all of it, through the real file in a real
browser — six of its checks fail on the previous code.

The audit module also joined `npayroll/` in carrying the three no-cache metas,
because this was the second fix in a week that had to actually reach a phone.
That is the condition the rule names: a module somebody wants current, not the
whole site.

## Two numbers wear the name Double Tone

**`DTone_Nursery_Qty`** is the box on the Transplanting tab headed *"Double
Tone Quantity in Nursery"*: an admin counts the double-tone seedlings standing
in the nursery and keys the number, and Tabs 3 and 4 add it to the planted
total to get their allocation base. One row per batch, newest wins
(`loadDtoneNurseryQty`).

**`Transplanted_DoubleTone`** is the batch pushing its own seedlings into the
d-tone tray. A different number, nought on most batches, and it takes no part
in the Balance because those seedlings leave the tray again later as ordinary
`Transplanted` rows.

Life of Seedlings' **Double Tone column showed the second one**, so it read 0
against every batch the office had keyed a figure for. It now shows the keyed
Quantity in Nursery, newest-wins, like the form — and the tray transplant
keeps its own group (`dtone_tray`), which has no column but is still named in
the row's verdict, exactly as premium care is.

The box has its own sign-off on Tab 3 under the row key
**`DTONE-NURSERY-QTY`** rather than a plot, so `_losApplyVerification`
special-cases it the way it special-cases a transfer card.

`shared/CHECK_double_tone_quantity.sql` puts the two numbers side by side on
every batch and counts the ones that were reading nought.
`tests/los_double_tone_is_the_keyed_figure.cjs` keeps a batch that has BOTH.

## The 2nd culling never deducts. Not even while no 3rd exists.

Three readers, and Life of Seedlings was the odd one out again — this time on
the column headed **"Total Culling (1st + 3rd)"**, which it was computing as
1st + **2nd** whenever no 3rd culling had been keyed yet. The heading said one
thing and the code did another.

The two it has to agree with both say so in their own words:

- `netOfRow()` — *"2nd Culled never deducts here, B/F included — 2nd Culling is
  Tab 6's own live snapshot as a batch works through 3rd Culling, not a
  separate loss on top of it."*
- the Batch Report's culling rate — `(cull1 + cull3) / (transplanted + cull1)`,
  with cull2 *"carried for reference only — it is inside cull3"*.

LOS's own comment claimed to be "the same rule as the Movement Report's
netOfRow()". It was not, and a comment asserting agreement is not agreement —
the test now compares the two formulas rather than restating either.

So every batch 2nd culled and not yet 3rd culled had its **Total Culling
overstated** and its **Balance understated**, by exactly its 2nd culling, on
the one report the office reconciles against.

The 2nd Culled **column stays**. It is worth seeing; it is simply not a loss
to add on top of the 3rd. `shared/CHECK_second_culling_in_total.sql` names
every batch that moves and by how much, and
`tests/los_second_culling_never_deducts.cjs` holds the rule against the Batch
Report's real formula, lifted out of its own file.

## The Balance is what is STANDING, and the 1st culling is already inside it

The office asked for one line: **Balance = transplant qty − 3rd culling −
total sales + approved stock calibration.** It is worth writing down why that
reads better than what was there, because the old formula was not wrong — it
was answering a different question.

    OLD   actual planted − total culling (1st + 3rd) − total sales
          + approved stock calibration

That is everything the batch has ANYWHERE, the tray included. The new one is
what is standing in the FIELD. On a batch allocated exactly, the two are the
same number, because `planted − 1st culling` IS the transplanting quantity.
On one that was over- or under-allocated they differ by the allocation gap —
and **the gap never closes**, so 224 read −416 and 226 read −560 with nothing
standing in either, for ever, on the one report the office reconciles
against.

**The 1st culling is not taken off, and that is the point.** It happens in
the TRAY, before any of those seedlings go out, so the transplant quantity
is ALREADY net of it; subtracting it again takes the same seedlings off
twice. Starting from planted was right for the old question and is
double-counting for this one. Same reason `ADJUST_APPLIES_TO` keeps a
Transplanting adjustment off 1st Culling.

Three things fall out of it, and each one is a place the figure could have
gone quietly wrong:

- **The approved stock calibration closes the last seedling.** It was left
  out of the first version, on three terms alone, and 224, 225 and 226 then
  read 1, −1 and 13 against calibrations of −1, +1 and −13 — so adding it
  takes all three to **exactly nought**. That is the argument for it: a
  correction somebody has approved is a correction, and a batch that is
  finished should not read as though a seedling were missing. An
  **unapproved** one still counts for nothing, same as everywhere else.
  `shared/CHECK_balance_is_what_is_standing.sql` shows old against new on
  every batch and says which settle.
- **`mainBalance` does not inherit it.** The Balance takes TOTAL sales off,
  so a sale out of the TRAY is inside it: a batch sold 400 out of the tray
  and never transplanted reads minus 400. That is right for every batch the
  office reconciles, which all sell out of the field. It is not right for
  the Pre / Main filter, which would then list such a batch under a nursery
  it never reached — **a fault this report has already had once**. So the
  field side is counted on its own terms (field sales, field calibration),
  and `los_balance_split.cjs` checks the gap between the two is exactly the
  tray sales less the tray calibration instead of checking they are equal.
- **`completed` asks both halves.** The old Balance started from planted, so
  a batch with stock in the tray could not reach nought and the guard came
  free. Now it can, so the test is `mainBalance <= 0 && preBalance <= 0`.
  Nothing is finished while something of it is standing anywhere.

**And Transplant is three columns now**, grouped under *Transplant Details*:
**Total Transplant Qty | Transplant Qty | Double Tone**, the first being the
other two added. The Double Tone in it is the admin-keyed Quantity in
Nursery, never the transplant into the d-tone tray — see the two numbers
above. The **Balance uses Transplant Qty alone**, never the total: the double
tone is counted where it already stands, and folding it in would put it into
the field balance a second time.

The office asked for the word **transplant**, not *transplanting*, on these
headings. It is the headings of THIS table only — the Transplanting Report
further down the same file is a different report and keeps its name, and so
does the batch detail page's Transplanting tab, which the Double Tone hover
still points at. The test checks the heading TEXT inside the Life of
Seedlings thead and nothing else, which is what lets both be true.

`tests/los_balance_is_what_is_standing.cjs` drives the real derived block
with the office's five batches and holds all of it, the header-span
arithmetic included — a thead that does not add up to nineteen draws every
column after the mistake in the wrong width.

## One batch, one reception — the newest row wins

A batch is meant to have exactly one `Seeds_Received` row. **Batch 224 had
ninety-five** — every one identical, same quantity, same remark, same
`created_at` to the microsecond. That is one bulk insert that ran ninety-five
times, not an edit somebody made twice. The other two known sources are the
Seeds In form saving twice before its duplicate guard existed (261 went in
seven times, 260 twice) and an update keyed on `created_at` rather than on the
row id, which damaged the **224-241** range; both are written up beside that
form's save in `operation_batch_detail.html`.

**Three readers of one ledger, and two of them already agreed.** The Seeds In
form loads the newest row with `.limit(1)`; the batch list de-dupes to the
newest per `batch_name`. Life of Seedlings **added them all up** — so batch
224 showed 997,500 seeds received against 9,920 planted, a Variance of minus
987,580, and dragged the report's own total down with it, while the form it
was keyed on read 10,500.

So the newest row now supplies LOS's figures, supplier, licence and date too.
What it does **not** do is hide the extra: `srRows` counts them, the Seed
Received cell says **⚠ 2 reception rows**, and the drilldown lists every one —
because a figure that silently drops a ledger row is how the row stays there
for ever. `shared/CHECK_duplicate_seeds_in.sql` names them on every batch and
says which one is being kept.

**The check gives ONE ROW PER BATCH, and that was learned the hard way:** the
first version printed one row per LEDGER ROW, so batch 224 alone answered with
ninety-five identical lines and the list could not be read at all. The
batch-wide one comes first and
`CHECK_duplicate_seeds_in_rows.sql` is the drill-down, for the only case that
needs one — a batch whose rows genuinely DIFFER, where somebody has to say
which is the real delivery.

`shared/RUN_ME_dedupe_seeds_in.sql` is the repair, and it only ever deletes a
row that is a COPY: two rows count as the same when every column matches
except the id, the `created_at` and the last-edited stamps — compared off the
whole row through `to_jsonb(l) - 'id' - …`, so a column added later is
compared too instead of being quietly ignored. A batch whose rows differ is
left alone and NAMED, counted off the same snapshot the DELETE runs against —
sound precisely because those are the rows it does not touch.

**It is ONE statement and creates nothing.** The first version built a TEMP
table, and the SQL Editor warned that a table was being created without Row
Level Security. That is a false alarm — a temp table lives in the session and
no anon or authenticated key can reach it — but a warning somebody has to
click past is a bad thing to hand over, and the table was never needed: the
count comes back from the DELETE through `RETURNING`.

`tests/los_one_reception_per_batch.cjs` is batch 224 and batch 225 side by
side: the one with a stale row and the one without.

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

**And Checked locks the Worker Record's ticks on that row, not just the Work
Maintenance row.** A row's capacity is SHARED between the workers ticked on
it, so adding or removing one tick changes what everybody else on that row is
paid while the row's own figure does not move a seedling. Locking the figure
and leaving the split open would settle half of it.

There are two ways a tick is written and a lock on one of them is decoration:
`togglePayrollTick` when somebody presses the cell, and `syncTicks` inside
`applyFieldRecords`, which runs on every page load. The second is the one that
matters — without it the next load would quietly move the ticks under a row
the office has agreed. Both are gated on `_recLocked(rec)`, read off the
RECORD rather than off what the cell was drawn as, because a cell drawn before
the row was checked still carries its old handler.

A locked row still SHOWS its ticks — who did the work is what the sheet is for
— and pressing one says why rather than doing nothing.
`tests/payroll_ticks_locked_when_checked.cjs` sends a saved row through both
paths.

## A worker is the register ROW, not the name on it

The Worker Record keys its ticks by NAME, because a column header is a name:
`nops_maint_payroll.data` is `{ recordId: { "Andi Rosmini": 1 } }`. Correct a
name on the payroll register and every tick ever made under the old spelling
is orphaned — no column on the sheet, the capacity out of the totals, the
salary claim no longer paying it. Nothing is deleted and nothing says a word.

It has happened: **"Fauzan" was registered first and later corrected to
"Muhamad Fauzan"** — the same person, the same row, the same id, because the
office EDITED the row rather than making a second one. Every month before the
correction read as a worker who does not exist.

`mjmnpayroll_workers.id` is a BIGSERIAL and an edit keeps it, whatever is done
to the name, the PIN, the bank account or the role. **So the row remembers
what it has been called** — `previous_names`, appended by a database TRIGGER
rather than by a screen, because the register is edited from the office
module, the Worker Portal Manage page and by hand in Supabase, and a rule
living in one screen is a rule the other two do not obey.

`shared/shared_maint_workers.js` is the one resolver, read by the Work
Maintenance page AND by the claim that prices it — two copies disagreeing is
one plot divided among different numbers of people on the sheet and on the
claim. Four things in it:

- **Matching is on letters and digits, uppercase**, the same rule as
  `nurseryKey`/`plotKey`. It cannot merge two people: two names differing by a
  letter or digit give different keys.
- **A name claimed by two different ROWS resolves to neither.** Two people
  really can be "Ahmad" and "Ahmad Bin Ali", and picking one moves somebody's
  money to somebody else. It stays unresolved and shows as a name with no
  column, which is the thing the office needs to see.
- **A row ticked under BOTH names is ONE tick**, not two — two would divide
  the plot among one more worker than did the work and cut everybody else's
  share. Where a hand tick meets a field tick, the hand one wins.
- **It resolves on READ and writes nothing back**, so a register that failed
  to load cannot rewrite anything. The data heals the next time somebody ticks
  that sheet.

The trigger cannot know about renames from before it existed, because nothing
recorded them. `shared/CHECK_worker_names_with_no_column.sql` finds those —
every tick name the register cannot place, with the capacity that is not being
paid — and suggests a match only where exactly one register name carries the
orphan as a whole word. **That suggestion is never applied by anything.** The
office confirms, and `shared/RUN_ME_worker_name_was.sql` names its pairs.

`tests/worker_is_the_register_row.cjs` holds all of it.

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

## A month is a LABEL on one screen and a KEY on the next

`monthLabel()` gives "Sep 2026" and `monthLabelFull()` gives "September
2026", and the difference is not a matter of taste. The maintenance module
**stores** its month in the short shape — `nops_transplant_field_records.
schedule_month`, and `loadTransplantField` looks a record up with
`.eq('schedule_month', monthLabel(...))`. So the short one is a KEY.

The office asked for the month to be written out on the printed forms, which
is right: a month on something somebody signs is "September 2026", and the
short form is for a column heading with no room. Every DISPLAY now takes the
full one — the Transplanting claim, the Monthly Payroll, the by-plot table,
the keyed table, the empty-sheet message. **`monthLabel()` itself does not
move**, and a reader that compares against a stored month must go on asking
for the short one.

The fixture in `tests/transplant_claim_empty.cjs` had ONE constant doing both
jobs, and changing it broke twenty-one assertions at once — which is the
cheap version of what the same mistake does in the page. It carries
`MONTH_KEY` and `MONTH_LABEL` now, and says why.

## A printed form is read by somebody adding up

Seven things were wrong with the payroll PDFs at once, and every one of them
was invisible on screen. Four of them are rules rather than fixes:

- **Money is turned into text in ONE place.** `money()` has grouped the
  digits since it was written; the PDFs were building `'RM ' + x.toFixed(2)`
  of their own, so a claim read **RM2117.74** on paper and RM 2,117.74 on the
  screen it was produced from. `tests/payroll_pdf_layout.cjs` fails on any
  `"RM " +` … `toFixed(` left in the file, because the next one will be
  written the same way.
- **A figure on the screen belongs on the paper.** The four cards the
  Transplanting sheet opens with — the whole job's capacity and what it
  prices at — were nowhere on the form; the figure was stamped inside each
  column's header instead, among the column labels. Work Maintenance already
  had the band (`drawCapRibbon`), and taking the line out of the headers paid
  for the band's own height.
- **`doc.addPage()` inherits the document's orientation.** The drone maps
  followed the claim onto a landscape page for that reason alone. A map is a
  picture of a plot and is read standing in it, so it wants the tall page;
  the claim is a wide table and keeps the wide one. A page that wants its own
  shape has to **name** it.
- **Reserve what the foot actually needs, never a round number.** The
  Transplanting claim kept a flat 40mm on top of a 25mm margin, so rows
  stopped 65mm above the foot of a page 210 tall: eight workers broke onto a
  second page with a third of the first one blank under them, and the plot
  summary then took a third. The total row, the signature and the footer note
  are a sum — `downloadMaintPDF` already worked it out that way. Three pages
  became two.

And the one that is about reading rather than fitting: **a plot is not broken
across two pages.** Worker Record rows are sorted by plot then by day, so a
plot is a RUN; a break inside one leaves half of N15 at the foot of a page
and the rest overleaf, for somebody carrying a running total across the turn
— which is the adding up a printed sheet exists to save. The break is taken
BEFORE a run. A run too tall for any page still splits at the page edge,
which is the only honest place and also what stops it looking for ever for a
page it would fit on. `payrollPlotPages` is pure — rows in, page numbers out
— so the rule is driven directly instead of being inferred from a PDF.

## A column list typed out in a row is a list that will be wrong

The Work Maintenance claim form laid itself out with eleven numbers:

    const COL = [11, 47, 17, 23, 17, 23, 17, 23, 17, 23, 29];

No, Worker, **four** pairs of Capacity and Total, Subtotal — correct for
exactly as long as there were four jobs. **Loading Seedlings made five.** The
fifth pair asked for `COL[11]` on a list of eleven, `X[11]` came back
undefined, and jsPDF answered *Invalid arguments passed to jsPDF.rect*.

So the download button did **nothing at all**, and had done nothing since the
day that job was added. Everything else about the sheet worked — the screen,
the totals, the verification — and the one thing that produced the paper
somebody signs was dead, silently, for however long it took the office to
need a printout.

Three things, each the shape of why it lasted:

- **Count the columns off the list.** The fixed columns keep their widths and
  the jobs divide what is left, in the 17:23 the pair has always been drawn
  in — which gives the old eleven numbers back exactly when there are four
  of them, so the fix is a fix and not a redesign. `MAINT_TYPES.length` and
  `TRANSPLANT_JOBS.length` decide, and the bands above them divide by the
  same count.
- **An onclick that throws does nothing and says nothing.** Every builder is
  wrapped now (`pdfGuard`): the console still gets the stack, the person gets
  a message they can read down the phone. That message — copied out of the
  dialog by the office — is what found this in one round instead of five.
  `pdfDoc` also says its own piece when jsPDF has not loaded, which otherwise
  reads as a broken form rather than a file that did not arrive.
- **A stub that accepts anything will sign off a form that cannot be drawn.**
  The harness jsPDF took every argument without looking, so every test passed
  on a claim form that threw the moment a real one saw it. It is strict now:
  a co-ordinate that is not a finite number is refused the way the real
  library refuses it. `tests/claim_form_fits_its_jobs.cjs` drives both claim
  forms with the office's five jobs, adds a sixth at run time, and on the old
  code fails with the office's own words — *argument 3 is NaN*.

**And a snapshot is whatever shape the version that verified it wrote.**
`maintViewFromSnapshot` guarded `s.capAll` but read `s.cap[w]` bare, so a
claim signed off before a field existed takes the whole form down over a
month that is never going to be re-verified. Guard every field, not just the
ones added last.

## A page that caches cannot deliver a fix

Every script on an office page is cache-busted with a `?v=` that lives **in
that page**. So the page is the one thing that must never be served from
cache: a stale copy goes on asking for the OLD script for ever, and a deploy
reaches nobody.

That is not theory. A PDF fix was written, tested, committed and pushed, and
`origin/main` had it — and the office still downloaded the old form. The code
was never the problem. `index.html` has carried

    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"/>
    <meta http-equiv="Pragma" content="no-cache"/>
    <meta http-equiv="Expires" content="0"/>

since it was written. **The module pages had not**, and that was the whole of
it — 13 of the 19 pages that version a script were missing them.

The site is GitHub Pages with a CNAME and no build step, so there is nowhere
to set a real HTTP header — these metas are the only lever, and bumping a
`?v=` is useless without them.

**Only the payroll module carries them**, because that is the module somebody
asked to be current. The other 12 pages do not, and that is a decision rather
than an oversight: these metas change how a live page is fetched on every
load, so they go on a module when somebody wants a fix in that module to
arrive — not across the site because a test would be tidier.
`nursery_ops_maintenance.html` is the one to remember: the Work Maintenance
changes are sitting behind its cache, so it needs the three metas on the day
somebody wants them.

**Any new page that loads a script with `?v=` needs all three** to be
deliverable. `tests/pages_do_not_go_stale.cjs` fails if a payroll page is
missing one, catches a `?v=` left without a number, and PRINTS THE UNGUARDED
PAGES every run so the next person sees the same trap still set.

**And the metas were never the whole lever.** They make the PAGE fresh
enough to ask for a new number; somebody still has to put a new number
there. It has now happened a second time, with the metas in place the whole
while: seven changes to `npayroll_script.js` went up behind `?v=68`, the
office opened the claim form and got the old one, and nothing anywhere said
so — the page was being re-read on every load and faithfully asking for the
file the browser already had.

So the number is now tied to the file. `tests/asset_version_bumped.cjs`
hashes every versioned asset and records the hash beside the version it was
published under; an asset whose contents moved while its `?v=` stood still
fails, and the failure names the page to edit and the number to write. The
manifest is updated by a separate `--write` run on purpose, so the check
cannot be silenced by the same keystroke that broke it.

**Bump the `?v=` in the same commit as the script.** A commit that changes a
versioned file and not its number is a commit that reaches nobody.

Still worth knowing: a browser that already holds a stale copy needs one hard
reload (Ctrl/Cmd + Shift + R) to pick up the metas in the first place. After
that it stays fresh by itself.

## Two repositories, one system

- `mjm-ai-system` — the office, ai.mjmnursery.com. Static; served from the
  repository as-is, no build.
- `Barcode_Counter` — the phones, scan.mjmnursery.com. Vite; CI builds and
  commits the output back to the repository root.

Rules that live in both — the general-worker filter, the maintenance function
keys, nursery-name matching — carry a comment in each copy saying so. Change
one, change the other.
