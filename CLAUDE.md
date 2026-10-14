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

## The papan tanda is the report row, drawn

The board that gets nailed up at the plot when the seedlings arrive. The
office was making these by hand, one per plot, off the Transplanting Report
on the screen beside them — so it is drawn FROM that row, and **the figure
on the board is the figure on the report by construction**.

**ONE BOARD PER ROW, which is one per plot.** That is the whole reason it
lives on the report and not on the ledger: batch 270's B4 took **1,931 out
of P32 and 378 out of P33** on the same day, and the board says **2,309**,
because what goes up at the plot is how many are standing in it. The report
already merges a plot's rows for that day; this follows that rather than
adding a second rule.

Every field is the Batch Report's own answer. The one worth naming is
**TARIKH TANAM**: it is the batch's `Seeds_Received` **`transaction_date`**,
which is exactly what the Batch Record list shows as Planted Date — the date
keyed on Tab 1, never the row's insert time. Newest reception row wins, the
same rule the Seeds In form and the batch list already follow, because a
batch is meant to have one and some have ninety-five.

Three things about drawing it, each of which went wrong first:

- **The font has to be loaded before the first stroke.** A canvas asked for
  a font it does not have yet does not wait — it draws the fallback, and the
  board comes out in Times, which nobody would notice until it was on a post
  in a field. `document.fonts.load` is awaited for every weight used, and
  the test asks about the ORDER (nothing drawn while a load is pending)
  rather than about the glyphs, because a harness with no network for Google
  Fonts would otherwise only prove the sandbox has no Outfit.
- **The logo used to leave the fill white.** `_ptLogo` painted its own text,
  so ink set before it drew a white board on white. It is an image now and
  does not, and the ink is still set AFTER it, because the ink belongs with
  the type it is for.
- **A long name is shrunk, never wrapped or clipped.** The board is read
  from a distance and the end of a breed name is the part that tells two
  breeds apart. The PLOT line shrinks too, so a transfer plot does not run
  under the mark.
- **ONE WEIGHT for the whole block, and ONE CASE.** The breed was set at
  Outfit 700 where everything beside it was 900, and in its own mixed case
  where every other field — the dates included — is upper. At that size
  that does not read as one typeface in two weights, it reads as two fonts,
  which is exactly what the office saw and said. The test asks it of the
  weights the board asks for AND of the font on every stroke, because a
  weight drawn in without being preloaded is the same mistake twice. The
  ROW keeps the real spelling; it is only the board that shouts.

**The mark is the office's own file, and it is INLINED.** It was a drawn
imitation at first, for the reason below; the office then handed over the
real logo. The board carries **MJM NURSERY**, which is not the MJM GROUP
tile that was on it for a day — same house, different mark, and the office
asked for it the way they ask for everything here, by handing over a board
with it on. `shared/mjm_nursery_logo.png` is the canonical copy and
`_PT_LOGO_SRC` in the page is that file byte for byte as a data URI —
`tests/papan_tanda.cjs` decodes the one and compares it against the other,
so two copies of an image cannot quietly become two different images.
`shared/mjm_logo.png` is still there and is the GROUP mark; nothing draws
it now.

Inlining keeps every property the drawn mark had, which is why it is not
simply fetched: **no fetch, so nothing to 404** at the moment somebody
presses the button; no cross-origin, so the canvas is not tainted and
`toBlob` still works; and nothing to go stale in a cache.

**The nursery file is TRIMMED to the mark**, so the board draws the whole
of it and there is no crop. The GROUP tile needed one — it was a square
with a broad flat margin of green, and `_PT_LOGO_CROP` trimmed it in
fractions of the file. What survives that is the rule underneath it: **ONE
width is given and the height comes off the IMAGE**, so the mark cannot be
stretched, and the test compares the shape on the canvas against the
shape of the file rather than carrying a number that would go stale the
day the logo is re-exported.

**The nursery mark was lifted out of the board the office drew**, because
that is the only copy of it there has been — cropped to its own ink at
598 × 315, which is exactly the size the board draws it, so there is no
resolution to spare. Ask for the original file before anything wants it
bigger.

**And the office drew the board, so its numbers are the specification.**
The margins, the type sizes, where each line sits and where the mark goes
were measured off the board they handed over and are named constants at
the top of `_ptDraw`. `_PT_LINE_STEP` is the one the office asked for by
name: it used to be worked out from whatever room was left under the logo,
so a change to the mark quietly changed the spacing of the lines. The test
reads all of it back off the canvas — the rule lands on the pixel, the
mark within four (its outermost row is an antialiased serif edge that is
no longer either office green, so a colour test finds the box just inside
the one `drawImage` was given), and the line spacing within four because
the top of a type band carries a little of the font's own business (BATCH
sets digits where TARIKH sets capitals).

**THE LABELS ARE THE OFFICE'S OWN, spaces included.** They are not spaced
evenly and the colons do not line up — `BATCH    :` and `TARIKH TANAM  :`
are padded and `JENAMA:` is not — and that is how the board they drew
reads. A sign that is one word different from the one the office nails up
is a sign somebody has to ask about, so the strings are copied and not
tidied. **PLOT carries no colon** and **JUMLAH TANAM carries no POKOK**;
both were there and both went.

`tests/papan_tanda.cjs` drives the real page and batch 270's own figures,
down to the pixels on the canvas and the download that comes out of it.

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

## An unverified figure does NOT float, and it is a dash and never a nought

Life of Seedlings is seventeen columns of live sums of the batch ledger, and
the ledger is filled in BEFORE anybody checks it. A figure keyed this morning
and one signed off last week looked exactly alike.

That was first fixed by SHOWING the unverified figure with a ⧗ beside it and
counting it in the totals, on the argument that hiding it leaves the report
answering a question nobody asked. **The office overruled that**, and batch
246 is why: its 3rd Culling tab read **0 of 4 Done** with every Culled Qty
box empty, and the report was showing **10,142 third culled** and a Balance
of **minus 7,659** off the back of it. *"If the batch report not yet filled
in the data, dont float the data to life of seedling"*, then *"make it only
verified data will float to life of seedling."* They are the ones who
reconcile against it; that is their call to make.

**What was right about the old rule is still right, and it is why a withheld
figure is a DASH.** Zeroing an unverified stage is a wrong number wearing a
right number's clothes — a batch with Seed Received in and Actual Planted
silently at nought reports a Variance of minus the whole delivery. So the
cell reads **—**, which is "nobody has signed this" and cannot be mistaken
for a count.

Five things follow, and each is a way this goes quietly wrong:

- **A DERIVED figure is withheld whenever ANY part of it is**, rather than
  being computed from the parts that survived. That is the same trap one
  level up. It falls out of each figure carrying every group it is made of —
  `LOS_BALANCE_GROUPS`, `LOS_CULLTOTAL_GROUPS` and the rest.
- **A withheld figure is OUT of its column total.** A column of dashes
  adding up to a number is the one shape of wrong that cannot be spotted:
  the total looks fine and no row disagrees with it. `LOS_GROUPS_OF_FIELD`
  is what the reducer asks, and it is the same answer `LOS_GROUPS_OF_KIND`
  gives per column — a field missing from it totals figures the rows are not
  showing.
- **The foot says which columns are short, and by how many rows.** "3
  batches are unverified" does not tell a reader which TOTAL is light, since
  a batch can be signed on its seed in and waiting on its 3rd culling.
- **A stage with no lines at all is not withheld.** There is nothing to
  verify about a stage a batch has not reached, so a true nought reads 0. A
  nought on an unsigned tab is still withheld, because "0 damaged" and "0 so
  far as anybody has keyed" are different claims.
- **It still fails OPEN.** If the sign-off tables cannot be READ, nothing is
  withheld and the report says so. A check that cannot run must not empty a
  report — same reason access fails open.

The figure is not hidden, only kept off the report: the dash carries it in
its hover, names what is waiting, and is still a button, because the records
behind it are exactly what somebody needs in order to go and sign it off.

Three things to know before touching `LOS_GROUP_OF_TYPE` in
`operation/operation_reports.html`:

- **The unit is the COLUMN, not the tab.** 3rd Culling and Transfer are both
  signed on Tab 6; Transplant Qty (both halves of its split) and premium
  care are figures on Tab 3, and 1st Culled is Tab 4. A tally kept per tab
  withholds figures somebody HAS signed. `LOS_STAGE_OF_GROUP` is the
  column→tab map that keeps the two apart.
- **A sign-off comes two ways** and either counts: one signature over a whole
  tab in `operation_batch_verifications`, or — on a tab verified row by row —
  a `Row_Verification` log per row, keyed `<stage>::<rowKey>`. The rowKey
  starts with the plot and only that part is matched, except a transfer card,
  which keeps its `|transfer`. `rowsAllSigned()` in
  `operation_batch_detail.html` draws the tab's tick by the same rule and
  `CHECK_which_batches_completed.sql` asks it of the record. Change one,
  change all three.
- **PART verified is not verified.** One of two transplant rows signed means
  the figure includes an unsigned row, so it is withheld like any other.

The As At date cuts the LINES off and never the signatures: a line dated
after it is in no figure on screen, while "has anybody checked this" is a
question about now.

`shared/CHECK_what_life_of_seedlings_holds_back.sql` is the size of it —
every batch with anything unsigned, which stages, and how many of each
stage's rows are signed. Hand it over with any change to this rule: the
figure that decides whether a rule like this is right is "what does it
actually move", and that is the only thing that answers it.

**The Status and Nursery filters still read the REAL figures**, not the
withheld ones. Whether a batch is standing in the main nursery is a question
about the batch, not about the paperwork, and a batch that vanished off
every filter the day somebody forgot to sign a tab would be a worse report
than the one this replaced. Completed is not a figure of this report's at
all any more — see the section on the one completion rule.

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

### And a proof of ONE table is not a proof

It came back. The phone now reads

    Not allowed to save to audit_plot_audits. Your login lacks database
    permission (RLS)

and `RUN_ME_auditor_can_save.sql` — the file written to settle exactly
this — answers **six green lines while it is happening**. Its proof ends by
inserting a row as each auditor and rolling it back, which is the right
idea; it inserts into ONE table, `audit_maintenance_audits`, the one that
was broken the day it was written. Reproduced on the scratch Postgres with
Plot Condition refusing every save, it prints *auditors who could actually
save just now: 4 of 4 -- OK*.

**A probe is only a proof of the table it probes.** That is the same
mistake the file itself was written to correct, moved one table along:
*"a previous file reported four green lines over a database that refused
every save."* `shared/RUN_ME_audit_save_every_table.sql` probes **all five
writable audit tables, as every non-customer account**, and a failure names
the auditor, the table and the SQLSTATE.

Two things bring this back, and neither is visible to a check of the
policies:

- **An auditor who signed up after the last repair.** The gate reads
  `shared_profiles`, so an account with no row there fails it — there is
  nothing to read. Backfilling is a repair of today and the fault returns
  the next time somebody is hired. The **signup trigger** is what closes
  it, so section 1 installs `on_auth_user_created` rather than only filling
  the gap it left.
- **A policy added by hand in the dashboard.** A RESTRICTIVE one narrows
  what every other policy allows, so one of them refuses every auditor
  whatever else is right. The old file drops a LIST OF NAMES IT KNOWS,
  which is how one survives every repair. The new one drops every policy on
  these tables that is not one of the four this system owns — and **names
  what it dropped** in the result, because a repair that quietly removes
  somebody's decision is a worse thing than the fault.

**And a fault no policy check can see at all** is a column added NOT NULL
that no form writes: 23502, every save refused, every gate correct. Only a
real insert finds it, which is the whole argument for probing rather than
inspecting.

One more thing, found while testing: the old file's last query names
`storage.buckets` inside a `CASE`, and a database without the storage
schema fails to **parse** it however well the branch is guarded. The answer
is worked out in a `DO` block into a session setting instead, so the final
query names no table that might not be there.

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

## Three numbers wear the name Double Tone, and only one is a column

**`Transplanted` out of the DOUBLE-TONE tray** is the Life of Seedlings
column. It is the batch report's **Main Plot (D-Tone)** card: a main-plot
transplant whose SOURCE tray was the d-tone one, so a seedling that had the
treatment on its way out. Read off the `from tray [...]` in the remark, which
is where the save writes it.

**`DTone_Nursery_Qty`** is the box on the Transplanting tab headed *"Double
Tone Quantity in Nursery"*: an admin counts the double-tone seedlings
STANDING in the nursery and keys the number, and Tabs 3 and 4 add it to the
planted total to get their allocation base. One row per batch, newest wins
(`loadDtoneNurseryQty`). It is still read, still verified under its own row
key, and it is **not** a column.

**`Transplanted_DoubleTone`** is the batch pushing its own seedlings INTO the
d-tone tray. They leave it again later as ordinary `Transplanted` rows, which
is why counting it would count them twice.

The column has now been wrong twice, in opposite directions, and both are
worth keeping:

- It showed `Transplanted_DoubleTone`, so it read **0** against batches that
  had double tone standing in the field — the transplant into the tray is
  nought once everything has been forwarded out of it. The batch detail page
  had already hit exactly this on its own tile and says so in its comment:
  *"Without this the tile only saw qty routed INTO the D-Tone holding tray
  and stayed at 0 once everything was forwarded out."*
- It was then pointed at the KEYED box, which reads what is standing rather
  than what moved — so **batch 276 showed a Total Transplant Qty of 3** with
  nothing transplanted and its own batch report reading 100% pending.

It also has a share of the **1st culling**, because a 1st culling happens in
a tray and the d-tone tray is one of them —
`shared/CHECK_transplant_details.sql` puts every one of these numbers side by
side on each batch and counts the ones that were overstated.

## A total is READ off the split, never summed from two different things

This has now shaped two groups of columns, and it is one rule.

**Transplant Qty** and **1st Culled** are each ONE column carrying a split:
the total on top, and under a rule the two halves it is made of — *Normal*
out of an ordinary pre-nursery tray, *DT* out of the DOUBLE-TONE tray.
749 = 600 + 149 on batch 123.

They are the allocation engine's own cards, and the rule that makes them
coherent is that the last two are **DISJOINT halves of the first**, split by
the tray each main-plot transplant came out of — not two different things
stacked together. `calcTransplanting` in `operation_batch_detail.html` is the
original and says it in its own words: the two tiles are disjoint *"so the two
tiles add up to the total main-plot population (totalMain)"*.

That is why the total can be READ rather than ADDED. A total worked out by
summing two columns that are not halves of one thing is the fault batch 276
showed: a report claiming three seedlings transplanted out of a batch that had
transplanted none.

Three things that follow:

- **All three columns are one group for verification** (`transplanting`), and
  all three drilldowns are ONE list filtered by the same tray test. A nought
  is still marked when the stage is unsigned: "0 out of the D-Tone tray" and
  "0 so far as anybody has keyed" are different claims.
- **The Balance uses the TOTAL.** It is every main-plot transplant, which is
  what is standing in the field; one half of a split is not.
- **The tray is matched on letters and digits** (`_losTrayKey`), same rule as
  `nurseryKey`/`plotKey`, so a dash or a space cannot drop a row out of the
  half it belongs in. It is kept to ONE LINE on purpose — the test harnesses
  lift a named const by reading to the end of its line, so a one-liner is the
  real function under test rather than a copy that can drift. The SQL check
  cannot take a regular expression, so it matches three spellings instead,
  and the gap is not silent: a fourth spelling stops the halves adding up and
  the check counts it.

**The 1st culling splits by the tray it happened IN.** A 1st culling is done
in a tray, and the row is keyed against that tray — `plot_name` IS the tray,
and the DOUBLE-TONE tray is one of them (`saveCullingTab` draws a row for
every tray in `preNurseryTrayData` and gives the d-tone one its own icon).
Same question as the transplant one, asked of a different column, answered by
the same `_losTrayKey`.

**A SPLIT LIVES INSIDE ITS COLUMN.** Both of these were drawn as three
columns each to begin with, which took the table from seventeen columns to
**twenty-one** — and at twenty-one every figure in the report was reading in
a column too narrow for it. The detail had been bought with the legibility
of everything beside it. A split is not three adjacent figures, it is ONE
figure with its composition shown: the total keeps the column's size and
weight so a reader going across a row still lands on it, and the halves sit
small and muted underneath for the reader who stops. All three stay
clickable and open their own records. `_losSplitCell` is the one helper and
`_losSplitFoot` is its twin in the total row.

Two things in it worth keeping:

- **A split with nothing in one half is not drawn at all.** On a batch that
  has never used the d-tone tray the sub-line would say "all of it" and
  "none of it" — two lines of type for no information. Such a column reads
  as a plain figure.
- **The width the four columns gave back went to the ones that carry text.**
  Batch/breed, supplier and the received figure, which are what actually
  wrap.

**What must NOT move when a column is split is the arithmetic underneath it.**
Total Culled (1st + 3rd) goes on taking the WHOLE 1st culling, d-tone tray
included, and the Balance goes on taking the WHOLE transplant. Splitting a
column for the reader is not the same as changing what is counted, and the
tests assert the totals did not move as well as that the halves add up.

**And the headings say Culled, not Culling** — Culled Detail, 1st Culled, 2nd
Culled, 3rd Culled, Total Culled (1st + 3rd). The office asked for one word across the group, and the
test counts heading TEXT inside the Life of Seedlings thead so the
Transplanting Report further down the same file keeps its own name.

`tests/los_transplant_details.cjs` holds the transplant split, batch 276
included; `tests/los_second_culling_never_deducts.cjs` holds the culling one
with 123's own 749 / 600 / 149. `shared/CHECK_transplant_details.sql` prints
both splits on every batch and counts any row where the halves fail to add
up.

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
- **But only the PLOT-side ones** — see the section below. A calibration
  reported against Seeds Received, Planting or a Seed Audit corrects the
  SEED count, and those seedlings never reached a field plot.
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

**And Transplant is three columns now**, grouped under *Transplant Details* —
see the section above for what each one is. The **Balance uses the TOTAL**,
which is every main-plot transplant: the two columns beside it are disjoint
halves of that total, and half of what is standing is not what is standing.

The office asked for the word **transplant**, not *transplanting*, on these
headings. It is the headings of THIS table only — the Transplanting Report
further down the same file is a different report and keeps its name, and so
does the batch detail page's Transplanting tab, which the Double Tone hover
still points at. The test checks the heading TEXT inside the Life of
Seedlings thead and nothing else, which is what lets both be true.

`tests/los_balance_is_what_is_standing.cjs` drives the real derived block
with the office's five batches and holds all of it, the header-span
arithmetic included — a thead that does not add up to seventeen draws every
column after the mistake in the wrong width.

## Is this batch finished? ONE rule, and both lists ask it

It used to be two, and they disagreed.

The **Batch Record** list asked whether every plot the batch used had been
3rd culled, proofed against its drone map and **signed off**. **Life of
Seedlings** asked whether its own arithmetic came to nought. Those are
different questions, so a batch could sit in Completed on one screen and
Active on the other with nothing saying which was wrong.

The office asked for them to agree, and the **Batch Record's rule wins**: it
is the question the nursery actually asks, it is what the 3rd Culling tab's
own ring is drawn from, and it does not move when a sale or a calibration is
keyed months later. `shared/shared_batch_completed.js` is the rule, written
out with the batches that taught us each part of it, and there is
deliberately nowhere else to change it.

Two things about the way Life of Seedlings asks it:

- **As at the report's date.** The LINES are cut at the As At and the
  SIGNATURES are not — the same split every other As At rule there follows,
  and what lets September go on reading as September did.
- **Not gated on verification** the way the figures are. A batch cannot be
  Completed without its 3rd culling being signed in the first place, so the
  question answers itself; and a withheld figure must not also take the
  batch off the Status filter.

**What moved, and in which direction.** A batch sold entirely out of the
tray, or culled entirely in it, reached no plot — so the Batch Record has
nothing to call finished, where Life of Seedlings used to say Completed.
That difference is the point of the change, not a casualty of it.

**A shared rule called with the wrong rows is two answers again**, and
nothing in either page says so. `tests/batch_completed_one_rule.cjs` holds
the RULE to its cases and checks both pages still call it;
`tests/both_lists_agree_on_completed.cjs` drives BOTH REAL PAGES against one
ledger in a real browser and compares what they show. Only the second one
could have caught what it did catch: Life of Seedlings was taking its row
sign-offs out of `logsRes`, the ledger query, which asks for the transaction
types the report draws FIGURES from — and `Row_Verification` is not one of
them. The list was always empty, so no batch could ever be completed by the
row-by-row route. Nothing on either page would have said a word.

## A calibration against the SEED count is not a loss from the field

The Balance is what is standing in the FIELD, so the calibration in it is
the **plot-side** ones only.

Batch 230 is why. Its calibration is **minus 1,000 reported against
Planting** — *"Sold out 1,000 Pre nursery seedlings (DO: 01605)"*, keyed
against tray P30. Those seedlings never reached a field plot. Taking them
off what is standing in one subtracts a loss from a figure that never
contained it: 230 balanced to **nought** on its own three terms
(11,619 − 2,452 − 9,167) and the report read **minus 1,000**.

**The side is the REPORT**, and the list is
`ADJUST_INITIAL_REPORTS` / `ADJUST_SIDE_OF` in
`operation_batch_detail.html`: *seeds received, planting, seed audit* are
the seed side, everything else is the plot side. `_LOS_CAL_SEED_REPORTS` is
the second copy and `tests/los_seed_side_calibration.cjs` asserts the two
have not drifted — a list that grows on one side only puts a correction
into the field balance that the batch report says belongs to the seed count.

Three things about it:

- **Never the "Side:" written in the remark.** The batch detail page says
  why in its own comment: rows written while the form still asked carry one,
  and a row somebody filed on the wrong side has to correct itself. It is
  derived, so it is one rule and not two.
- **Never the plot the row names either.** Where the plot is and which
  count was wrong are different questions. `calibrationPre` asks the first
  (and keeps carrying 230's row, because P30 is where those seedlings
  were); `calibrationSeed` asks the second.
- **`calibrationField` is counted on its own, not worked out by
  subtraction.** 230's row is BOTH seed-side and pre-nursery, so taking
  each off in turn would take it off twice.

The **Stock Calibration column still shows every approved one**, and the
drilldown still lists it. It is a real correction; it is only the field
Balance it does not belong in.

`shared/CHECK_seed_side_calibrations.sql` splits every batch's calibrations
three ways and says how much each Balance moves. It also counts rows filed
under a report wording that is on NEITHER list — those land on the plot side
by default, so a new wording quietly joins the Balance, and the count is
what says so.

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

## Two lists, two people: what to DO and what to CHECK

The red list was called Amendment Needed and held one thing: a report tab HQ
sent back. It is the **To Do List** now, and it holds everything a batch is
waiting on somebody for — a rejected tab, and a question the report asked
ITSELF. Batch 241's 3rd Culling counted 500 against a drone map of 540, and
that gap already wrote its own `Review_Rejection` row on save; what it did
not do was take anybody to it.

**A list that names the report and does not open it has told somebody where
to go without taking them.** On a batch with one thing outstanding out of
eight tabs, finding it is most of the work. So each chip in the cell carries
the stage into the address — `?id=241&stage=cull_3` — and
`openRequestedStage()` on the batch page switches to that tab and scrolls to
the panel the answer goes in, with a two-second ring round it. The row's own
click goes to the first thing outstanding, so the cell is not a field of
small targets on a phone. `TAB_OF_STAGE` is `STAGE_BY_TAB` read the other
way round, plus Adjustments, which has no review banner and so is not in it.

**And the two lists hand work to each other.** Answer what the To Do List is
asking and the batch moves to the To Check List, because an answer is a new
claim nobody has checked yet. 3rd Culling reaches To Check by **that route
and no other**: a plot with a map mismatch AND a `MismatchNote:` against it.
A plot whose figures tally asked nothing; one still unexplained is on the To
Do List where it belongs. The ordinary rule — filled in and unsigned — is
still the five, and 2nd Culling is still out.

**The To Check List is the CHECKER'S.** It answers "what is waiting for me to
sign", which is a question only somebody who may sign has; for everybody else
it is a list of other people's work with nothing on it they can do. Gated on
`batch` / `review`, the same tick as Approve and Edit on Adjustments, hidden
rather than disabled, and a session left on the tab is moved off it. Access
fails OPEN as everywhere else, so an unconfigured login still sees it.

**One step failing must not take the ones after it down.** The bootstrap runs
`initDetail` → `syncBatchHeader` → `MJMReview.boot` → `openRequestedStage`
in an async callback with nothing catching it, so a throw anywhere in it is
an unhandled rejection: the page stops part-built and the console is the only
place that says so. That is exactly how the new link came to land on Tab 1 in
its first test — the banners threw and the step after them never ran. Each
trailing step carries its own try/catch now.

**And a gap is settled by an ADJUSTMENT, never by re-keying the cull.** The
office accepts the answer, raises a calibration for the difference, approves
it — and the 3rd Culling row in the ledger does not move: it still reads 500
against a MapQty of 540, for ever. Anything comparing those two alone goes on
calling it a gap, so the batch would never leave either list. The comparison
is culled **plus what has been approved against that plot**, and which
adjustments reach the 3rd Culling is `ADJUST_APPLIES_TO`'s rule — one filed
on the 3rd Culling, and one filed on Transplanting, because both measure what
is standing there. An unapproved one settles nothing, here as everywhere.

**A flag written by a save has to be readable without one.** `saveTab6`
writes the drone-map `Review_Rejection` row and clears it on the next save,
so an approval that settles the gap leaves it behind and the batch sits on
the To Do List over a question answered days ago. It is ignored once the
plots it names tally — only the automatic one, matched the same way the save
matches it. **A rejection a PERSON sent back stands until a person clears
it**, whatever the figures say.

`tests/todo_list_takes_you_there.cjs` and `tests/tocheck_list.cjs` hold both
halves, including a stage nobody recognises changing nothing, an adjustment
nobody has approved settling nothing, and the stale flag.

## An overdue round is cleared by the work, never by the calendar

A to-do row on the auditor portal asked one question: was this plot
audited INSIDE the window? For a window still open that is right. For one
that has CLOSED it is unanswerable for ever — *"audit B01 between 1 and 5
August"* cannot be satisfied in October.

So an auditor who walked the plot **had done the work and the row stayed**,
listing every plot, reading "lewat 68 hari", and nothing they could do
would ever clear it. Every overdue row on the board was in that state, and
the office found it the way anybody would: by auditing the plots and
watching the list not move.

**A CLOSED window takes the batch's LATEST audit, whenever it was done** —
the range opens at the beginning of time and runs to today.

The lower bound used to stay on the window, on the argument that an audit
from before it opened belonged to the round before this one and must not
close two. **The office overruled that**, and N02 is what the old bound
looked like on screen: batch 244 walked 30 Sep, inside September round 3,
cleared; batch 253 walked **22 Sep** — round 2's slot — so round 3 stayed
red over a plot somebody had walked eight days earlier, and nothing 253
could ever be given would close a window that shut on 30 September. Their
words: *"latest audit clears every overdue round (if is not audit on time).
but as long as not yet audit, it will still showing there."*

Three things hold it together, and the first two are the price of the third:

- **An OPEN window is unchanged**, and must stay so. Letting an old audit
  answer a round nobody has walked yet would mark work done before anybody
  had the chance, which is the one direction this board must never be wrong
  in. `tests/late_work_clears_the_backlog.cjs` asks `missedRounds()` of
  **next month** to tell the two apart: widen the lower bound everywhere and
  it reports three missed rounds before the month has begun.
- **A batch with NO audit at all is untouched** and stays on the board. That
  is the second half of the office's sentence, and it is the only thing the
  rule still refuses.
- **What this costs.** A batch audited once and never again now clears every
  overdue round it accrues, so it shows on the board only while a round is
  actually OPEN — one day a month on the MN plot schedule. What keeps it
  visible is the missed-round record: every one of those rounds is filed in
  Audit History under the month that owed it, so a plot nobody walks does not
  go quiet, it accumulates a missed round every round. That is the trade the
  office chose with the consequence in front of them.

**The board and the plot page no longer answer the same question, and that
is now deliberate.** They were put in step on purpose — a green card and a
quiet to-do row saying one thing — and this rule separates them: the board
asks *"is anything on my list"*, where an overdue round cleared late is off
it, while the card asks *"has this batch been walked in the round now due"*,
which an audit from last month does not answer. So N02 can be absent from
the board and still read **⟳ Round 1 due · last audited 22 Sep**. The card
keeps the safe direction — it shows the auditor the last reading before they
take the next one — and `currentWindow()` is untouched.

The office's rule for the rest of it, in their own words — *"if auditor was
late and do the latest one, then the old records will be clear too but
recorded as missed audit. As it is no meaningful to audit back also."* So:

- **The row goes.** A list of work nobody can do is a list nobody reads.
- **The fact stays.** `missedRounds()` runs the two tests side by side —
  strict, the real window, and the extended one that clears the row — and a
  nursery that passes only the second is a missed round. It is filed in
  **Audit History under the month that OWED it**, never under the month the
  late work happened: a missed August round is a fact about August. A month
  whose only entry is a missed round still opens on the arrows, or the one
  month somebody needs to see would be the one they cannot reach.

Three things to know before touching this:

- **Three callers, one range.** `nurseryState` (does the row stay),
  `_plotsHtml` (which circles under it) and `plotsOwed` (the count and the
  progress bar) each worked the two dates out for themselves. They all go
  through `winRange(o, y, m, strict)` now — a row that clears while its
  circles remain, or a count that disagrees with the list under it, is
  worse than the bug was.
- **The date-loop fallback had to move too.** It runs when the batch roster
  cannot be read — offline, or an RLS refusal — and leaving it on the
  window alone meant the one screen least able to explain itself showed a
  backlog nothing could clear.
- **Maintenance is not in it.** A maintenance row exists because a deadline
  has pending work on it, so there is no window to be outside of.

`tests/late_work_clears_the_backlog.cjs` drives the real page in a real
browser and holds all of it — a plot walked late drops off, a plot nobody
walked stays on, an audit from before the window opened clears it and is
recorded as missed, and nothing clears a window that has not closed yet.

## A batch is not audited for ever because it was audited once

The other half of the backlog, and the one the office actually saw: N02
sat on the to-do list owing Plot Condition round 3, and the plot page
showed three cards — batch 244 green, 253 green, 230 Not Required. Every
one looked finished. *"I saw got audit done but still show in the to do
list. You see is done."*

**The to-do list was right.** 253 had last been audited in round 2. The
plot page was the one not saying enough:

    const audit = records.find(... batch matches ...);
    const done  = !!audit;

ANY audit, EVER. So a batch audited once was green in every round after
it, for ever — and the only screen that knew otherwise was the board,
which names a PLOT and not a batch. An auditor who opens the plot, sees
green and walks away is how a round stays open for months.

The grid above the cards asked the same way, so `isBatchAudited` /
`isPlotAudited`, the corner badge, the plot cell and the "N / M audited"
count were all saying done as well.

Both ask about the round that is currently owed now —
`MJMAuditSettings.currentWindow(scope, mod, todayISO)`, the latest window
whose first day has arrived, extended to today once it closes. **Same
range the board asks on**, which is what makes a green card and a quiet
to-do row the same statement.

Four things in it:

- **The record is not hidden.** A lapsed batch keeps its card, its photo,
  its chips and its edit button, and reads *"⟳ Round 3 due · last audited
  22 Sep"*. It is the auditor's work and the last reading is what they
  want before taking the next one; it has simply stopped being an answer
  to the question this round is asking. Tapping it opens a NEW audit —
  editing September does not answer October.
- **The card shows `date`, not `created_at`.** It printed the insert
  timestamp, while every list that decides anything reads `date`. Two
  screens quoting different days about one record is how somebody comes
  to trust the wrong one.
- **It fails back to the old question.** No settings module, or a module
  with no rounds, and `done` is "ever audited" again. Showing too much is
  the safe direction: re-walking a done batch costs an hour, a batch
  silently marked done costs a month.
- **`_localISO()`, not `todayISO()`.** `toISOString()` is the day before
  in Malaysia for the whole of the early morning — harmless for stamping
  a save, an off-by-one round on the day a window opens.

Plot Condition and Seedling Height are two copies of this card and two
copies of the grid test. Change one, change the other. Papan is not in it:
it audits the batch most recently placed on a plot this month, so its own
rule is already round-shaped.

`shared/CHECK_which_batch_still_owes_the_round.sql` names every batch
behind its own plot, on every plot and both modules — the plot was
audited more recently on a different batch, so somebody walked it and
this one was not done. It also counts audits filed against a plot the
ledger has nothing standing on, which are invisible to every list in the
system.

**And the grid count has to SAY which round it is counting.** The first
thing the office asked after this shipped was why the work was done and
the outside said not yet: B01 read *"0 / 7 Diaudit"* over seven cards
each showing an audit from the 1st. Both screens were right — those
audits closed the round they fell in, and October round 1 had opened on
the 10th since — but a bare `0 / 7` reads as *the work has vanished*. It
now reads **"0 / 7 audited · Round 1 · due 10 Oct 2026"**, deadline
included, because "Round 1" alone does not tell anybody whether they are
late. `_roundSuffix()`, one in each of the two module scripts.

**A record dated 1 October is not an October audit.** The round open on
the 1st was September round 3 — still open, because an overdue round is
cleared by the work and not by the calendar. The office said it in one
line: *"it should be 30th Sep audit, just the auditor late audit."* So
the record is saved under its own date, it answers the 30 Sep round, and
the plot reopens for the next one — three facts that were all true and
none of which the card said. It reads

    ⟳ Round 1 due · last audited 01 Oct 2026 · late for the 30 Sep round

`MJMAuditSettings.roundOf(scope, mod, dateISO)` is `currentWindow` asked
on the DAY OF THE AUDIT rather than on today, so there is one rule and
not two, and `late` is the audit landing after that window closed. Said
only where it WAS late: on a record inside its own window the date
already says everything, and a tag on every row is a tag nobody reads.
Audit History carries the same line, because that is where somebody goes
to see what was done and when it was owed.

`tests/a_round_is_not_audited_for_ever.cjs` drives the real plot page
with the office's own three batches and the 1 Oct record; five of its
sixteen checks fail on the previous code.

## Closing a plot nobody is ever going to audit, and never by deleting

A maintenance deadline overdue by two months is not work anybody is
going to do. The job it was raised against was finished in August, there
is nothing left in the plot to look at, and the row sits on the board
for ever — because the ONE thing that retires a maintenance row is an
audit against its `task_id`.

So an admin may close one from the board: an **×** on each plot chip,
**and one on each work-type section header**, and the office's own words
for what it means — *"it's long overdue and missed audit closed by
admin."*

**The section is the unit the decision is actually made in.** Closing
eighteen cold weeding plots one cross at a time is eighteen confirms for
one decision, and the decision was never per-plot: the job finished in
August and there is nothing left in ANY of those plots to look at. So
*"i close maintenance weeding, then it help me close all cases plot
under this section"* — one confirm naming the job and the count, and the
rows go up in **ONE insert**. Eighteen round trips on a nursery signal is
eighteen chances to half-finish, and a section half closed is worse than
one not closed at all.

**The reason is no longer asked for — it is written.** The second step
used to be a `prompt`, and the office's answer to it was *"no need
this"*: an admin closing a cold plot types the same sentence every time,
and a prompt somebody dismisses out of habit is a cancel that looks like
a save. So the remark is composed — the job, the day the work was done,
and *long overdue* — and where a whole section went at once it says so
and how many plots were in it.

**What it writes is a record, not a deletion.** An ordinary
`audit_maintenance_audits` row against the same task, with `result` =
**`Closed by admin`** and the reason in `remarks`. So it goes through the
one door everything else goes through, it leaves the board for the one
reason anything leaves it, and it lands in Audit History with a name and
a date on it like any other record. **The work record in
`nops_maint_field_records` is untouched** — the field did that work and
said so, and no audit decision gets to unsay it. The test asserts no
DELETE and no PATCH is ever sent.

Nine things in it:

- **The id has to ride on the item.** A chip knew which plot it was and
  not which record. `bucket.items` carries `id` now, and so does
  `pushLoose` — which is a second list feeding the same chips, and
  missing it showed up as the × appearing on the overdue row and not on
  the one beside it.
- **`isAuditAdmin()` decides, and it is asked AGAIN at the write.** A
  button drawn before a permission changed is still sitting on the
  screen. A plain auditor sees the chips exactly as they always were, and
  no section × at all.
- **ONE writer, two buttons.** `_closePlots(items, confirmText)` takes a
  list — the chip hands it one item, the header hands it the whole group,
  and nothing else differs: same row shape, same confirm, same rebuild.
  Two code paths writing the same record two ways is how they come to
  disagree, and the per-chip path had already drifted into writing a
  remark the section one did not.
- **The section closes the group as it was DRAWN**, out of
  `_closeGroups`, not re-derived when the button is pressed. Somebody
  pressing it has just read a count beside the job name, and the plots
  they close must be the plots that count was of — a second walk of the
  data could quietly have one more in it.
- **The confirm names what it is about to do.** The chip's names the
  nursery, the plot, the job and the day the work was done; the section's
  names the job, the row and **how many plots**. Cancelling writes
  nothing.
- **The × is OUTSIDE the anchor.** Inside it, every tap on the cross
  would also follow the link to the audit form. The section's is outside
  `.tl-wt-head` for the harder version of the same reason: that header IS
  a `<button>`, and a button inside a button is not a thing a browser
  will draw. It sits beside it in a `.tl-wt-bar`, and the test counts
  `.tl-wt-head .tl-wt-close` to make sure it stays there.
- **It rebuilds from the database, not from the screen.** The board is
  what somebody is about to act on, and a screen that agrees with itself
  and not with the table is worse than one that takes a second.
- **`MAINT_CLOSED_RESULT` is spelled in two files** —
  `audit_home.html` writes it, `audit_maintenance_script.js` colours it
  grey so a closed task does not read as the amber that means *waiting*.
  Change one, change the other, and never change the string itself: a
  row written before would keep the old wording. In `audit_home.html` it
  sits at **script scope and not inside `loadAuditTodo`**, because both
  halves of that page need it — the board writes the row and Audit
  History has to recognise it.
- **`audit_id` is NOT NULL and has no default**, and leaving it out is
  not an empty column, it is a refused insert — *23502, null value in
  column audit_id violates not-null constraint*, which is what the first
  version of this close got back and the office read off an alert box.
  Every row in that table carries a readable id the FORM writes itself.
  The closure writes `MTA-CL<task_id>` rather than copying the module's
  `nextAuditID()`: that one is `audits.length + 1`, which two people
  saving at once both answer the same way (`audit_script.js` says so in
  its own comment) and a section close writes a dozen rows in one go.
  Keyed on the task it is unique by construction, and it says at a
  glance which rows in the table are closures rather than audits.
- **The test stub is STRICT about what the table will take**, for the
  same reason the jsPDF stub had to be: one that accepts anything signs
  off a write the database refuses. Every check in
  `admin_can_close_a_dead_plot.cjs` passed on the version that could not
  insert a single row. `NOT_NULL` there is the column set
  `saveAudit()` supplies — the one proof of the real table's shape
  available from an environment that cannot reach Supabase — and a row
  missing one comes back 400 the way PostgREST sends it. Fifteen checks
  fail on the broken version now.
- **Audit History says which rows are closures.** A closure is an
  ordinary record, which is the point of it; but a row sitting in this
  month's list with nothing on it to say otherwise reads as work that was
  DONE. So the history row carries an amber **Closed by admin** tag and
  the job it closed, and a section closed at once is a run of them on one
  day. Where the thin PLAIN fallback is used the tag is simply absent,
  which is the safe direction.
- **And it says what the task was DUE, not only when it was closed.**
  The date on the right of a history row is the day somebody pressed the
  button, so a run of closures reads as this month's work and the whole
  justification for them — that they were old and nobody was ever going
  to walk them — is nowhere on screen. The office put it exactly:
  *"it feels like closing that month case but not the old and unaudited
  case."* The line now ends **was due 8 Aug 2026 · 65 days overdue**, in
  red beside the amber tag.

  Where that comes from is the part to keep. **The deadline is nowhere in
  `audit_maintenance_audits`** and cannot be recomputed from a closure
  row. The one thing that knows it is `push()` inside
  `loadMaintTimeline` — work date plus `MJMAuditSettings.maintDays(wt)` —
  and it used to throw the answer away for any task already audited,
  which is every task by the time it reaches the history. So `push()`
  now records `MAINT_DUE[task_id] = { due, on }` for **every** task it
  walks, BEFORE the audited test, and the history reads that. One rule,
  not a second copy, and no schema change. Two things follow:

  - **The deadline is read before the audited test**, so a row with no
    work date now counts as `skippedNoDate` in the diagnostics where it
    used to count as `skippedAudited`. That is the only visible effect.
  - **`loadMaintTimeline` redraws the history when it finishes**, in the
    finally position. The two load in parallel, so whichever lands first
    has to tell the other; without it the deadline appears on a closure
    only the second time the page is opened.

  It is written into the **remark** as well — `Due 2026-08-08, 65 days
  overdue. Closed without an audit, work done 2026-08-05.` — because the
  remark is the only part of the row that travels into an export. And
  `remarks` is now in the maint summary spec and shown as a field: it had
  always been written and was on no screen anywhere, so the one field
  saying WHY a task was unsatisfied, or closed without an audit, could
  only be read out of the database.

`shared/CHECK_audits_closed_by_admin.sql` is the register — who closed
what, when, and how many days it had been waiting. A long list under one
name, or a lot on one day, is the thing to look at: closing is the
exception for work that has gone cold, not a way of clearing a board.

`tests/admin_can_close_a_dead_plot.cjs` drives the real board in a real
browser, as an admin and as a plain auditor, closing one chip and closing
a whole section — and it asserts the section went up as **one** insert
carrying **both** task ids, that every NOT NULL column is filled, and
that no `prompt` is ever raised. **It blocks the service
worker** (`serviceWorkers: 'block'`), because `page.route` does not reach
a fetch the WORKER makes: once it activates it answers its own synthetic
503 and the board reloads empty, which is the worker doing its offline
job correctly against a network that is not there. An hour went into
that before it was the obvious thing.

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

## A search takes you to the batch

Batch Info splits its list in two: Active, and Completed. The search box sat
INSIDE that split, so typing 235 on the Active tab answered **"No batches
matching 235"** while 235 sat one tab over, finished, the whole time.

Typing a batch number is not asking "is 235 on this tab". It is asking WHERE
235 is, and the answer must not depend on which tab happened to be open when
it was typed. **A batch that cannot be found is a batch somebody keys again.**

The first version of this showed the Completed batch on the Active tab with a
line explaining itself, which answers the question and leaves somebody on a
tab that is lying about what it holds. **So the page GOES THERE**: it opens
the tab the batch is on, shows it, and the line says it moved and where from.

**It moves only off an EMPTY answer.** A query that matches something on this
tab stays put — being carried off a screen with the thing you were looking at
on it is worse than not being carried at all — and the line then says how
many more are in the other half, so the rest is one click away. A query that
matches nothing anywhere stays put too, and says *in Active or in Completed*,
so a miss reads as a miss rather than as the wrong tab.

**The To Do List and To Check do NOT move, and that is the half worth
remembering.** Those tabs are not halves of the batch list, they are
questions — which report to go and fix, which one to go and check — and a row
with nothing to fix is not an answer to either of them. Tray Status is a
different shape again and searches trays. `splitTab` in `renderLedgerTable`
is the one place that decides, and only Active and Completed are in it.

`switchListTab` calls straight back into `renderLedgerTable`, so the move is
behind a `_jumpingTabs` flag. The tab it lands on has the matches, so it
cannot bounce — the flag says so rather than trusting it to.

The tab is called **Completed**. It said "Completed / In-Active", which named
the same thing twice.

`tests/search_finds_a_batch_in_either_tab.cjs` holds all of it, through the
real page.

**The red tab is called To Do List**, which was landing on `main` from
another branch while this was being written. It looked for an hour like
evidence that the office page was being served stale — a tab name that was
nowhere in the git log — and it was not: the branch simply had not been
merged yet. Worth remembering before reaching for the cache explanation
again. A name that is not in YOUR history may just be in somebody else.

The page still has no no-cache metas, and it carries every line of its own
code inline, so the PAGE is the deploy. That is a real exposure, and it is
not an emergency: deploys to it demonstrably arrive. Add the three the day
somebody needs a fix there in a hurry.

## `select.className = '...'` is how a row grows a second dropdown

`shared/shared_cf_select.js` skins every `<select>` in the system: it draws a
button, and hides the browser's own dropdown. It used to hide it with a CLASS,
`cf-native-hidden`.

An assignment to `.className` REPLACES the class list. So a page that colours a
select by its state the blunt way —

    sel.className = 'lvl-select lvl-admin';            // User Access drawer
    select.className = 'input-style t3-dest-plot';     // Tab 3 destination

threw that class away, the native dropdown came back BESIDE the button, and
Module Access showed a green ADMIN pill with a plain "Admin" box under it.
**Both were live and nothing said which one the save reads** — it reads the
select, so the pill was the real one and the thing most people would press was
not.

The hide is an inline `display:none` now, which a className assignment cannot
reach, plus one observer on `class` and `style` that puts it back if a page
rewrites those wholesale. **A page should not have to know this skin exists** —
that was the whole bargain of rolling it out as one script tag.

Two things that follow:

- **Colour the BUTTON, not the select.** The select is invisible, so a rule on
  it paints nothing. `user_access.html` hangs its three level colours off
  `.cf-wrap:has(> select.lvl-admin) > .cf-btn` — the select keeps `lvl-*` as
  the state it always was, and the CSS follows it out to what is on screen.
  Any page with a colour-by-state select has the same thing to do; only this
  one has had it done.
- **The script is loaded with no `?v=` on all 53 pages**, so a browser holding
  yesterday's copy keeps it. One hard reload per machine.

`tests/cf_select_hides_the_native_one.cjs` holds it, proves the previous
version fails the same check, and prints every page that writes a whole
className onto a select. It needs `npm install jsdom` and says so if it is
missing.

## Two repositories, one system

- `mjm-ai-system` — the office, ai.mjmnursery.com. Static; served from the
  repository as-is, no build.
- `Barcode_Counter` — the phones, scan.mjmnursery.com. Vite; CI builds and
  commits the output back to the repository root.

Rules that live in both — the general-worker filter, the maintenance function
keys, nursery-name matching — carry a comment in each copy saying so. Change
one, change the other.
