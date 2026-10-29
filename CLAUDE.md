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
  sweep, and the test prints the count every run: **145 carry a semicolon in a
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

**And the same board goes up three months earlier, off the Seed In
Report.** A pre-nursery tray stands for three months with nothing on it
saying what is in it, so the office asked for one when the seeds go IN.
It is the SAME drawing — `_ptDraw`, one board, two reports — because two
boards on two posts in one nursery that do not look alike are two boards
somebody has to compare. One board per TRAY per DAY, off the `Planted`
log, merged the way the transplant board merges a plot's rows for a day.

The one field that differs is **TARIKH PINDAH, which is a MONTH**. The
transplant board knows the day the seedlings moved because it is drawn
after they did; the seed board does not, so a date there would be a
promise the board cannot keep. It reads **DEC 2026** — short, because
every line is set as large as it will go and a month spelled out shrinks
the line it is on.

**Three months is not a rule this report invents.**
`audit/audit_papan_script.js` has drawn the auditor's papan tanda off
planted-plus-three since it was written, shown as a month and a year, and
the sign in the field reads that way. A second rule here would be two
answers on two boards a few metres apart. `_PT_PN_MONTHS` is this file's
copy, and it works in LOCAL time for the same reason the audit one does —
`new Date('YYYY-MM-DD')` parses as UTC midnight and drifts a day, which on
the 1st of a month moves the ANSWER by a whole month.

**And it is the MONTH plus three, never the DAY plus three months** —
which is three months in twelve, not pedantry. Adding months to a DATE
overflows when the month it lands in is shorter: 30 November plus three is
30 February, which JavaScript rolls into 2 March, so a tray sown on the
30th had a board reading MAR over seedlings due out in FEBRUARY. 31 January
read MAY for April and 31 March read JUL for June. The office said it in
the words that avoid all of it — *"the seed planted month + 3 months"* — so
`_ptMonthPlus` reads the year and the month off the date and leaves the day
out of it, and the first of a month cannot overflow. All three days are in
the test.

`_ptSeedRows` is kept apart from `_ptRows` on purpose: a board drawn off
whichever list was filled last is how the Transplanting Report comes to
hand out seed boards. `tests/papan_tanam_seed_in.cjs` holds it with the
office's own 277 / P1 / 2,560 / 29 Sep → DEC 2026, the October tray that
crosses the year end, and a batch received and not yet sown, which is
offered no button at all rather than one that answers nothing.

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

## Only verified data is counted, and it is counted LINE BY LINE

The office has narrowed this rule three times, and the third is the one the
code now obeys:

1. *"make it only verified data will float to life of seedling"* — an
   unverified figure came off the report.
2. *"no need to show which item not yet verify"* — the row stopped carrying
   a label saying which stage it was waiting on.
3. *"it is only calculate what data is verified first ... just show the
   number which verified until new data verified then update the report
   there."*

**The third is the first, asked one level down.** It used to be asked of a
whole STAGE, so one unsigned row took the whole column away and everything
derived from it with it: a Balance could not be read at all until the 3rd
Culling tab was signed, which is what the office was looking at when they
asked for it to be calculated. Asked of the LINE, a tab signed four rows out
of five shows those four, and the fifth joins the figure the day somebody
signs it.

So `_losLineSigned` is the one test, and the FIGURES are built out of the
lines it says yes to — inside `_losBuildAllRows`, not in the cells. Five
things fall out of that, and the last is what it costs:

- **Every derived figure is right by construction.** Variance, Total Culled,
  the Balance and both splits are arithmetic over figures that are already
  verified-only, so none of them has to know this rule exists. That is the
  whole reason the test lives in the builder.
- **Nothing is a dash any more.** A stage nobody has signed is nought. The
  dash existed to say "nobody has signed this" when the figure was withheld;
  nothing is withheld now, and what the cell says instead is in its hover —
  which stage is outstanding, how many rows, and what signing them would
  add.
- **The TOTAL is the plain sum of the rows.** It used to leave rows out to
  match a column of dashes; there are no dashes, so it agrees with the
  column above it line for line. The foot still says which totals are
  waiting on rows, because a reader needs to know which way a figure is
  going to move.
- **The record lists are untouched.** Every line is still in the drilldown,
  signed or not — that is what somebody needs in order to go and sign the
  rest off.
- **What it costs: a VARIANCE whose seed in is signed and whose planting is
  not reads as minus the whole delivery**, because Actual Planted is
  genuinely nought so far as anybody has signed. That was the argument for
  the dash, and the office chose this with it in front of them. Batch 097 in
  `tests/los_only_verified_links.cjs` pins it so nobody is surprised by it
  twice.

**The tally that explains a figure is built with the same call.** Two copies
of the test would be a figure disagreeing with the note underneath it.

**Only Life of Seedlings asks for it** — `_losBuildAllRows(asAt, {
verifiedOnly: true })`. The Seed In Report shares that builder and reads the
ledger as keyed: what arrived from the supplier is a different question.

And it still **fails OPEN**: if neither sign-off table can be read, every
line counts and the report says it could not tell.

`shared/CHECK_only_verified_floats.sql` is the size of it — every batch whose
figures move, what is signed of its transplanting and its 3rd culling, and
the Balance on the ledger against the Balance on the signed lines. Hand it
over with any change here: the question that decides whether a rule like this
is right is "what does it actually move", and that is the only thing that
answers it.

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

**Everything above is the history of this rule, not its current shape** —
see the section above it. The withholding was per STAGE and left a dash; it
is per LINE now and leaves a figure. What is still exactly true of it is the
reason it exists, the fail-open, the column-not-tab unit, the two routes a
sign-off comes by, and that a derived figure is only as checked as its
parts.

**The ROW does not say which stage it is waiting on.** A line under the
batch name read "⧗ 2nd culling, 3rd culling unverified", on the argument
that the markers scattered across a row are lost if a reader has to collect
them by eye. The office asked for it to go — *"no need to show which item
not yet verify, as long as it is not verify, then the data wont appear here,
while verified, then it will show here based on the date."* And they are
right: once an unverified figure stopped being shown and became a dash, the
table was already saying it, in the one column it applies to, which is more
than a line could say in the space it had. What stays is everything that
answers a question a dash in a row CANNOT: the note above the table (is
anything missing at all), the column-by-column note in the foot (which total
is light), and the verification filter (a question somebody asks on
purpose). `verStages` / `verPending` are still computed for those three.

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

### The first version of the new file then did it a third time

It ran on the real database and printed

    9 | saves that went through just now: 196 of 245 -- OK

**196 of 245 is not OK.** Forty-nine saves — one table for every one of the
forty-nine accounts — were refused, and the row said OK, which is the exact
fault two files in a row have now been written to correct.

Two bugs, and the second is the one that matters:

- **A NULL wipes the line you are building up.** `shared_profiles.email` can
  be empty, concatenating NULL gives NULL, and `set_config(name, NULL,
  false)` BLANKS the setting. So the one account with no email erased every
  reason collected before it. Every piece of a `set_config` line is
  `COALESCE`d now, and an account with no email is named by its id.
- **OK was decided on whether a REASON had been collected**, not on the
  count. So wiping the reasons turned a failure into a pass. **OK is `pass =
  total` and nothing else.** A count that does not add up is the fault,
  whether or not anything managed to say why — and there is a per-table
  tally beside it, so the table that refuses is named even when the reasons
  are too long to print.

**And dropping every policy that is not ours was over-reach.** It took out
`nops_read_audit_verdicts`, which `RUN_ME_audit_column.sql` creates on
purpose so the Work Maintenance page can read the verdicts. A PERMISSIVE
policy cannot refuse anything — it is somebody opening a door — so only a
**RESTRICTIVE** one is dropped now, and the permissive ones are named and
LEFT ALONE. The file also puts `nops_read_audit_verdicts` back, so a run of
it cannot take that door away again.

### What it was, in the end — and a probe can accuse the wrong party

The second run answered it. `audit_plot_audits` read **49 of 49**: the
RESTRICTIVE policy the first run dropped was the whole of the fault the
phone was showing, and Plot Condition has saved ever since.

What was left read `audit_batches 0/49`, *23502 null value in column
`batch_id`* — and **that one was the probe being wrong, not the database.**
`audit_batches` takes a `batch_id` (`BTH-nursery-batch-plot`), the Papan
form writes it on both of its insert paths, and the probe row here did not,
because its column list was copied off the tail of that object literal
rather than the whole of it.

**A probe short of a column the FORM supplies accuses the database of the
probe's own mistake** — and it does it in a row headed NOT OK, which is
exactly how a real fault reads. So the result now carries **the columns
that MUST be filled** on every table it probes, read out of
`information_schema`: a 23502 names one of those, and that row is how you
tell "a column no form writes" from "a column this file forgot".

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

## A to-do list that hides what is coming is a diary

The audit home page opens with TODAY selected — `selDay = day` — so the day
scope was not something the auditor chose, it was the default view, and the
day filter was the default filter. A Plot Condition, Papan Tanda or Seedling
Height round whose window opens on the 20th was therefore not on the list on
the 14th. The only way to see it was to tap today's chip a SECOND time to
clear the selection, and nothing on the screen says that. Three of the four
modules answered "what is next" with nothing.

Maintenance was already exempt, because its deadline is set by somebody
else's work and a row that exists is a row with work pending on it. The
other three were not, and the asymmetry read as the schedule being empty.

So on today every undone row of the month on screen shows. Two things keep
it from becoming a free-for-all:

- **Picking any OTHER day still answers literally** — what falls on that
  date, maintenance included. A day somebody chose is a question; the day
  the page opened on is not.
- **A row whose window has not opened arrives greyed and does not
  navigate.** That was already the treatment for `soon` and `upcoming`, and
  it is the right one: the audit form would have nothing yet to record. The
  row is there to be seen, not to be opened.

A row carried from an earlier month (`fromY` set) rides on today only while
it is overdue, which is the only reason `carriedOverdue()` hands one over.

`tests/todo_shows_what_is_coming.cjs` lifts `occStatus` and the day filter
straight out of the shipped `audit_home.html` and drives real rows through
them — the three the office named fail on the previous code.
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

## A walk recorded with the screen off is not recorded at all

The same plot came back **2.63 km over 798 fixes** one day and **4 m over 2
fixes** the next, and the office could not tell what made the difference.

**A browser STOPS giving positions when the page is not on screen.** Not
throttles — stops. So a track walked from a web page lives or dies on whether
the screen stays awake, and the one lever for that is the screen wake lock.
There is no way round it; only a native app can walk a track with the screen
off.

**And the browser takes that lock back the moment the page is hidden, without
being asked and without saying so.** So `wakeLock.request()` called ONCE at
Start is a lock that is gone for good after the first notification, app switch
or glance away — and every metre after that moment is at the mercy of the
display timeout. The phone sleeps, the fixes stop, and the map goes on looking
exactly like a map that is recording.

The Worker Portal had the full treatment, including a comment saying in as
many words that asking once is asking for the first time only. **The FC
Portal's track map had the one-line version** — request, `.catch(() => {})`,
no reference, no listener. Two copies, one of them thinner, which is the shape
of nearly every fault in this file.

`src/lib/screenWake.js` is the one copy now and both call it. Two things in it
that were learned the hard way and must not be simplified back out:

- **The reference is forgotten on `hidden`**, not on the lock's own `release`
  event. Waiting for the event left the reference set, so the re-ask returned
  early and never asked at all.
- **Every part of it is best effort.** The API is not on every phone and it can
  refuse, and a walk must still record on one where it does.

**And the map now says when the line has stopped growing**, because none of
the above can make a fix arrive — what it can do is stop pretending one has.
`STALL_AFTER_S` is 45: the phone gives a position every second or two in the
open, so three quarters of a minute of nothing has never been the sky. The
band is red, above the figures, because the figures look perfectly healthy
while this is happening — they simply stop moving. The reason a fix was
DROPPED (too rough, too still, too far to believe) is shown the same way; the
Worker Portal has always shown it and the map never did.

`tests/the_screen_lock_is_asked_again.cjs` drives the real helper and holds
the previous version up beside it: asked once, never again after the first
time hidden, and nothing watching the page at all.

### Nothing keeps RECORDING through a locked phone. The metres already walked are a different question.

The office asked the obvious next thing: *"can make it able to record as long
as the browser did not close at the backend? like if they lock their phone,
glance at whatsapp but they didnt close the browser at backend."* **No, and no
amount of code changes that.** A browser STOPS calling back with positions
when the page is not on screen — there is no web API for background
geolocation, the wake lock only stops the screen turning ITSELF off, and a
service worker gets no positions either. Only a native app, or an Android
foreground service, can walk a track with the screen dark. `useWorkerTrack.js`
had already written that down.

What was being lost on top of that was avoidable, and it has been fixed. **The
FC Portal kept the walk in React state inside the map modal**, so closing the
map, a reload, or the browser reclaiming the tab — which a phone does the
moment it is locked for long enough — threw away every metre of it. The Worker
Portal had always parked its walk in `localStorage`; the map had nothing. Two
copies, one of them thinner, again.

`src/modules/maintenance/track/parked.js` is the one copy now and
`worker/taskTrack.js` reads through it. Four rules in it:

- **It comes back STOPPED, never running.** The phone was not being watched
  while the page was away, so those minutes have no fixes; carrying on
  silently draws a straight line across them and calls it walked. The person
  presses **Resume**, which keeps the SAME track and the original `startedAt`
  so `t` on every later point stays honest, and the gap in the line is the
  truth about what happened.
- **Resume is the button under the thumb, and Start again is the quiet one.**
  Start again throws the walk away; a red primary button that destroys what
  somebody just walked is a trap.
- **It is dropped after `PARKED_GOOD_FOR_H` — twelve hours.** A kill takes the
  FORM with it, so the walk comes back into a form that has to be keyed again
  and nothing in it says which job it was for. Within the shift that is
  obvious to the person standing there; a walk parked last Tuesday is not, and
  offering it against today's plot is how a line walked round N15 is filed
  against B04. Measured in BOTH directions, because a phone whose clock runs
  ahead parks in the future and a one-sided test drops the one walk the person
  is definitely still standing in.
- **Handing it to the record clears it.** A park left behind reappears on the
  NEXT job and reads as that one, which is worse than losing it.

Every read and write is wrapped: a phone with storage blocked must still be
able to walk a track, it just cannot survive being killed.

**What is still true and is not a bug:** the FC Portal records only while the
full-screen map is open. The walk is no longer lost when it is closed, but it
is not growing either. Running it from the record row the way the Worker
Portal does is worth doing the day somebody asks, and is a different change
from this one.

Section 7 and section 8 of `tests/the_screen_lock_is_asked_again.cjs` hold the
parking and the twelve hours.

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

## A plot has as many drone maps as it took to fly it

It had one. `t6_plotDocs[rowId] = {…}` — so a plot flown in two passes, or
re-flown because the first run was cloudy, had the second picture REPLACE the
first, and the rest lived in a folder the report knows nothing about.

Two halves, and the second is the one that makes the first useful: the maps
are a **list**, added to rather than replaced, and each one carries its own
**remark**. *"North half, flown 21 Feb"* is what tells two pictures of one
plot apart, and it is not in a file name.

**The format keeps every older remark readable.** `DocList:` carries all of
them with every field percent-encoded — so neither separator, nor a space,
can turn up inside one and split a map into three — and the FIRST map is
still written as `DocUrl:` / `DocName:` exactly as it always was. A remark
written before this has no `DocList`, so the single `DocUrl` stands in for a
list of one, which is what it always was.

Four things in it:

- **`t6DocsOf()` is the one way to read it**, and it copes with the single
  object a page half-loaded from cache might still be holding. Nothing else
  indexes `t6_plotDocs` directly.
- **Adding is adding.** The picker takes `multiple`, a drop takes every file,
  and both push. Replace is the deliberate one — it swaps ONE map, takes one
  file even if several are picked, and **keeps the remark**, because that
  describes the plot and swapping a cloudy picture has not changed where it
  was flown.
- **The chip shows the COUNT where there is more than one.** A plot with four
  maps showing one thumbnail reads as a plot with one map, which is the whole
  thing this had to stop saying. Pressing it opens the panel — a list, not a
  carousel, because a remark is something you type in.
- **Each upload stands on its own.** One failure costs that picture and not
  the rest; the one that failed stays on screen with its remark to be saved
  again, and only the ones that reached storage are written into the remark.
  The path carries the index, so two maps attached in the same millisecond
  cannot land on one file.

A **locked row opens the panel read-only** — no Add, no Replace, no Remove,
and the remarks are not editable. Same view-stays-open, edit-does-not rule as
everywhere else on that tab, and the remark boxes are part of it.

`tests/a_plot_has_many_drone_maps.cjs` drives the real codec and holds the
wiring, the awkward shapes included: a remark with a semicolon and a pipe in
it, a map with no name, a pdf that must not be taken for a picture.

### A box with no way IN is a box nobody fills

The remark existed from the day the maps became a list, and the office asked
for it again all the same — *3rd culling upload 的 drone map 要可以放 remark*.
They were right, and the box was not the thing missing: **the panel it lives
in only ever opened on the CHIP, and the chip only opened it with a map
already behind it.** So on the first upload the picker closed, the chip went
green, and nothing anywhere offered a remark. The one route to the box was
knowing to press the chip a SECOND time, which is not a thing a screen says.

So a map that ARRIVES opens the panel and puts the cursor in its remark. The
moment to write *"north half, flown 21 Feb"* is the moment somebody is
holding the picture in their head, not a press they have to discover.

Four things in it:

- **`processT6Doc` ANSWERS WITH WHERE THE MAP LANDED.** It read a file and
  told nobody, so the caller had nothing to point at. It returns a promise of
  the index now — and `null` for a map that never landed, which is a locked
  row or a file the reader refused. **Nothing is offered for a map that is
  not there**, or the screen would be saying an upload worked.
- **Several files open on the FIRST of them.** The panel lists every one
  underneath, so the rest are a tab away, and scrolling to the last is the
  one that is never what you want. The readers finish in whatever order they
  finish, so it is the lowest index and not the last to resolve.
- **A REPLACE asks nothing.** It keeps the remark already written —
  deliberately, that describes the plot — so putting the cursor in it would
  invite overwriting a sentence somebody meant to keep.
- **The box is focused and NOT selected.** There is nothing in it to replace.

`tests/the_drone_map_asks_for_its_remark.cjs` drives the real page and the
real picker; six of its checks fail on the previous code. And the three
source patterns in `a_plot_has_many_drone_maps.cjs` moved with the refactor —
a test that pins the exact SPELLING of a line is a test that fails on a
change which altered nothing it was about.

### A panel OUTSIDE the tab is work the close guard cannot see

The office typed a remark, closed, and nothing asked — *我刚留了 remark 不小心
关掉 结果就直接关了 没有问我确定要不要 save.*

`_markTabDirty` listens on `input` and `change` across the document and asks
`el.closest('.tab-content')` which tab the element is in. **The maps panel is
a full-screen overlay declared at the top of the body, outside every tab
pane**, so the remark box answered no tab at all: 3rd Culling never went
dirty, the X left without a word, and the sentence went with it — it lives in
`t6_plotDocs` and nothing but `saveTab6` writes it.

**The MAP is the same fault wearing a file input.** `_markTabDirty` skips
those on purpose, and the reason given was that picking one changes nothing
until the row is saved. That is not true here and was not true of the seed
counts either, which is exactly why Seed Audit has a flag of its own.

So `_t6DocsDirty` is the third answer in `_dirtyTabIndices`, set wherever
`t6_plotDocs` MOVES — attached, replaced, removed, or a remark typed — and
never by the load that restores them, which has changed nothing anybody
keyed. It is cleared in the three places `_seedAuditDirty` is: beside it in
`_trackTabSave`'s `done()`, in `_leaveBatchRecord`, and it is asked by the
`beforeunload` guard, because a reload or a typed address never reaches the
page's own dialog.

**The lesson is the shape, not the flag.** Anything keyed into a dialog,
drawer or overlay drawn outside `.tab-content` is invisible to the one
listener that decides whether a batch can be closed. The screen looks
identical either way, and the only thing that says so is the work being gone.

Section 5 of `the_drone_map_asks_for_its_remark.cjs` holds it, LAST in the
file because the three things it drives change what is on the plot and a
section that moves the screen belongs after the ones that count it.

## `error` means one thing: what you keyed is not in the database

The batch page's X closed a morning's counting without a word, so closing now
watches for an error toast while each tab's save runs and refuses to leave a
tab that reported one. That is the right test — it is how every save on the
page reports a refusal — and it was being handed warnings.

A 3rd Culling whose drone map does not tally is **saved** and then says so,
because the plot goes on the To Do List until somebody explains it. That
sentence went out as `'error'`, so **the tab was left dirty by its own
success**: the office pressed X on batch 241 and got

    Not closing — 3rd Culling did not save. Nothing has been lost.

over a report that was in the database. Saving again said the same thing, for
as long as one plot was unexplained, so the only way out was **Don't save** —
which reads as throwing the day away. Three more wore the same shape: a drone
map that failed to upload while the row itself stored (Tabs 3, 5 and 6), the
To Do flag failing after the report, and reasons saved against a plot with no
3rd Culling record yet.

So there is a third toast, `'warn'` — amber, ⚠️, and not a failure — and
`'error'` is kept for the one thing it has to mean. Two things follow:

- **A warning must not look like a failure either.** Red with a ❌ beside work
  that is safely stored is the same lie the dirty flag was telling, and it is
  the one somebody acts on: they key it again.
- **The next one will be written the same way**, so the test holds the SHAPE
  rather than the sentences — no `showToast(…, 'error')` anywhere in the page
  may say something was saved. It found two the three known ones had not
  accounted for. A toast saying nothing WAS saved is a refusal and says so.

`tests/a_warning_is_not_a_failed_save.cjs` drives the real page and the real
`saveTab6` with the office's own 500 against a drone map of 540: ten of its
checks fail on the previous code, "it leaves" among them. It holds the other
direction too — a refused write is still an error, still leaves the tab
dirty, and still stops the close.

## One stage logged twice is not a plot doing it twice

The PALMS board read **"2 running: Membesar"** and the office asked the
obvious thing: why is this plot doing the same job twice. It is not. It has
two log entries OPEN on the same `act_n` — a phone pushing an entry back that
the office had closed (`sync.js` describes that route in its own comment), or
the same day saved from two devices.

`openActivities` in `shared/shared_palms.js` has deduped that since it was
written, and its comment names this exact sentence: *"read back as 'Membesar
+ Membesar', which is not a plot doing anything twice; it is one activity
counted twice."* **Both pages that draw the cell were using it for half the
answer**, which is the shape of nearly every fault in this file:

- the **board** named the activities (`ln.status`, deduped) and counted the
  **rows**, so one job came out as two;
- **Plot Life** did neither, so it printed the sentence the comment warns
  about, word for word.

So the count counts what the name names — both go through `openActivities`,
and `many`, the current stage and the label all come off it. Three things
fall out:

- **A plot on ONE stage keeps its dropdown.** `many` taken off the rows cost
  it the selected stage and the colour tint as well, over a duplicate.
- **No mark says a stage is open twice.** It had an amber `×2 open` beside
  the cell, on the argument that the plot carrying a duplicate is the one
  somebody has to tidy; the office asked for it gone — *"2 open 我也不要看到"*.
  The cell names each stage once and says nothing more, and picking a stage
  still closes every open row underneath, which is the tidying.
- **The confirm panel counts rows and names stages.** Every open row really
  is closed, so the count has to carry the duplicates — and the name must
  not, because "Membesar + Membesar" describes nothing.

**The board's "This round" table folds them into ONE row**, and so does its
days-left — *"这种情况请combine"*. `MJMPalms.mergeSpells` is the rule: two
entries of the same stage are one spell when the later starts while the
earlier is still open (N14, Pengambilan open twice) or within a day of it
ending (Membesar closed 16 Oct, opened again 16 Oct). The row runs from the
first start, is running if any part is, and carries the name of whoever
keyed it FIRST (*"如果都一样 就显示第一个key的人的名字"*) — and does NOT say how
many entries it was (*"不用写2 entry"*). `spellStart` makes `computeStatus` time a running stage from the
same first day — timed from the second part, a plot 57 days into a 270-day
Membesar read 258 days left instead of 213. A real gap is two spells and stays
two. The log is untouched; `tests/one_stage_in_two_parts_is_one_row.cjs`.

**The detail views still list every ROW** — the motion study and the plot
history — because that is where a duplicate is actually seen and dated.

**And the phone had it too.** `savedActs` in `Barcode_Counter`'s
`EntryTab.jsx` mapped the rows straight across, and the draft it seeds is
what `MAX_CONCURRENT` counts: a plot with a duplicate read as already running
the maximum two with ONE stage ticked, so the Field Conductor could not start
the second real one and nothing said why. It reads a Set now, which is what
`applyDailySelection` has always written. Change one, change the other.

`shared/RUN_ME_upkeep_is_membersih.sql` closes the rows underneath: an exact
copy (same plot, same stage, same start day, both open) is **deleted**,
keeping the lowest id, because it is the same entry twice; two open entries
on one stage with **different** start days are two statements, so the older
is **closed on the day the newer began** rather than thrown away. A plot
genuinely running two different stages is left alone — PALMS allows two and
that is not this.

**That file also answers what Up-keep is: Membersih.** The plot status report
of 31-Aug-2026 carried a stage that was not one of the eleven, and
`seed_palms_from_report_2026_08_31.sql` invented a twelfth as a placeholder,
saying in as many words that it was a guess. The office has now named it. The
repair repoints every plot log, every day of history and every daily status
row, then removes the placeholder — which moves nothing else, because it was
added at the END of the list on purpose so no other stage's `sort_order`
changes and no history is silently re-read. Repointing can itself collide
with a Membersih already open on that plot, so the duplicate sweep runs
after it, in the same block.

**And it found nothing, because Up-keep had already been taken off the list
BY HAND.** The board then drew those entries as **"Stage 12"** — a stage is
shown by its number only when the list has no stage of that number — and
phones still on the old list went on keying 12 into October. The office ran
`shared/CHECK_palms_stage_with_no_name.sql`, which prints the list and every
number a plot log uses that the list has not got: **11 entries on 7 plots**.
`shared/RUN_ME_stage_12_is_membersih.sql` moves them by NUMBER, and only while
no stage has the number 12. **Delete a stage from the list only after its
entries have been moved**, or they are left on a number nothing answers to.

Two things keep it from coming back, one per repository:

- **The phones refresh the stage list EVERY time the docks open**, not only
  when nothing is cached (`FloatingDock.jsx`, `PalmsDock.jsx` in the FC
  Portal). Asked only with no cache, a phone that had ever opened PALMS kept
  its old list for good — which is how Up-keep went on being offered.
- **`shared/RUN_ME_stage_12_stays_membersih.sql` files a 12 as Membersih on
  the way in**, on the plot log and the history, whatever app or version
  sent it — a phone with no signal can hold an Up-keep day in its outbox for
  days. It steps aside by itself the day a real stage 12 exists.

`tests/one_stage_logged_twice_is_not_two.cjs` drives the shipped
`shared_palms.js` and holds both pages to it — 26 of its checks fail on the
previous code.

## The photo IS the seed count, so the bag that agreed keeps it too

A bag whose AI count tallied had its photo thrown away on the spot —
`if (match) st.photoBase64 = null` — and the save wrote no `PhotoUrl` for
it either. The office pressed Count Seeds, the row went green, and the
picture the AI had just counted was gone before anybody could look at it.

**"✓ Checked · AI counted 250" with nothing behind it is a claim, not a
record**, and the bag somebody queries months later is exactly the one that
agreed at the time. Every photo is kept and uploaded now, tally or not.

It also closed a hole nobody had noticed: a row that tallied and was LATER
edited — a corrected supplier figure, a re-keyed audit count — became a
mismatch **with no photo**, because the photo had been dropped while it
still agreed. The one state where the picture is most wanted was the one
state that could not have it.

**A matched row offers the BUTTON and not the picture.** This list is read
by running down it for the row that disagrees, and a thumbnail against
every bag is what stops that working. The mismatch keeps its picture open
because it is the row to look at.

### Recount asks WHICH, and it counts the CLEAN frame

The button opened the camera, every time. So an AI count that came back
wrong — 300 against a bag of 250, with a perfectly good photo of it on
screen — could only be answered by walking back to the bag and laying the
seeds out again. **The picture was never the problem; the count was.**

Recount now offers *Count this photo again* or *Take a new photo*, and with
no photo yet it goes straight to the camera, there being nothing to choose
between. It is a dialog and not a `confirm` — two real options and a
cancel cannot be an OK/Cancel box, and a prompt somebody dismisses out of
habit is a cancel that looks like a save.

**What is shown, and what is stored as `PhotoUrl`, carries a red dot on
every seed the AI found.** Feeding that back would have it counting its own
marks and agreeing with itself for ever. So the untouched frame is kept
beside it — `sourceBase64`, uploaded as **`SrcUrl:`** — and that is what a
recount is given. Without the upload the choice would work only until the
page was reloaded. A row written before `SrcUrl` existed has none, and that
row simply offers the camera the way it always did.

`_uploadBagPhotos` is the ONE writer of both pictures, so the two cannot
come to be uploaded by different rules; the save is still the fallback for
one that failed on the day.

`tests/seed_count_roundtrip.cjs` drives all of it through the real handler
— the only stubs are the AI itself and the two canvas steps — and the one
that matters asserts the AI was handed the clean frame and not the dotted
one. **`seedAuditPhotoState` is a `const` at script scope and so is not on
`window`**, which is as it should be: everything is read off the row the
office is actually looking at.

## The seed audit sheet prints, and it carries the damage

The office asked for a Print button: bag numbers, the supplier figure, the
audited figure, the totals and the variance — **and no photographs**, which
is right, a sheet of bag pictures is not what somebody adding up a delivery
wants in their hand.

A PDF already did almost all of it, so the one thing Print must not be is a
second drawing of the same report: two builders drift, and a printed sheet
that disagrees with the file beside it is a difference nobody can explain
afterwards. `_buildSeedAuditDoc()` is the document and the two buttons
differ only in what they do with it — Download saves it, Print calls
`autoPrint()` and loads the blob into a hidden iframe, because a popup
blocker eating a print is a button that does nothing.
`tests/the_seed_audit_sheet_prints.cjs` drives both and compares what each
one drew, line for line.

Three things that came out of it:

- **TWO variances, where there was one.** The Variance COLUMN adds up to
  audited − supplier; that figure was worked out and then never printed, so
  somebody adding the column down got a number appearing nowhere in the
  totals. It sits beside *vs expected*, which answers the other question.
- **Damage Control is Seed Planting's figure, on the Seed Audit sheet.**
  The audit says what arrived and the damage says how much of it was no
  good — same delivery, and reading them off two screens is how a count
  gets reconciled against the wrong thing. Every figure is `calcPlanting`'s
  own, off the same three inputs, so the sheet cannot say one thing while
  Tab 2 says another; the test asserts the two agree on the real numbers
  (327 of 10,500 is 3.11%, 65.40% of a 500-seed FOC).
- **The footer numbers EVERY page.** It was drawn once and said "Page 1 of
  1", true only while the report could not run over. The damage block can
  push it onto a second page, and a sheet whose second page has no footer
  while the first claims to be the only one is worse than no numbering.

**And the DAMAGED SEED PHOTOS are on it**, which the office asked for in the
same breath as "no photographs". There is no contradiction: a sheet of BAG
pictures is not what somebody adding up a delivery wants in their hand, and
the Operations Site Proof gallery is the evidence for the one figure on the
page that nothing else on it can check. Loading them made the builder
`async`, so both buttons await it. Two rules in the drawing: each photo is
sized from **its own shape**, never into a fixed box, because a damaged seed
count stretched out of proportion is a picture nobody can count anything in;
and one that will not load is **skipped and SAID**, because a sheet short of
a picture with nothing saying so reads as a count nobody photographed.
`_damagePhotosForPrint()` is the one accessor the sheet reads the gallery
through, rather than reaching into another tab's state.

**AND THE PICTURES FILL THE ROOM THEY ARE GIVEN.** Three across at a fixed
height meant two photos sat as thumbnails at the top of an otherwise empty
page while the page before them ended early — the office looked at it and
said *"不要一半一半 很丑"*. So the layout is CHOSEN rather than fixed: one,
two or three across, whichever fills the most of the room actually left.
A photo is only ever capped by the width of its column, so **fewer across
is a bigger picture**, and two photos on a page of their own come out a
half-page each instead of a pair of stamps.

Four things hold it together:

- **A layout taller than the room may be scaled down, but only to `MIN_K`.**
  Past that the grid is being bent to fill a page rather than laid out, and
  six photos would come back as one tall column of slivers.
- **The fallback scales the SHORTEST grid to the room**, never a taller one
  scaled further. The first version measured the fallback against ten times
  the room, which chose one-across and ran a 1,448pt block off the foot of
  an 842pt page.
- **The remark is measured BEFORE the pictures**, or filling the page with
  them pushes two lines of text onto a sheet of their own.
- **A row narrower than the page is centred**, so it reads as laid out
  rather than as pushed into the left margin.

**The test measures against the ROOM, never a pinned width.** A threshold on
the photo size passes or fails on how many bag rows the fixture happens to
carry, which is the one thing this layout exists to adapt to.

**And the heading goes with the pictures.** The break was measured for the
heading alone and then AGAIN, separately, for the first row of photos — so a
page with room for the words and not for a photo printed *DAMAGED SEED
PHOTOS* at the foot of one page and the pictures at the top of the next. **A
heading with nothing under it reads as a section somebody forgot to fill
in**, which on this sheet is the wrong thing to suggest. The rows are
measured BEFORE the heading is drawn and the break is taken ahead of the
pair — the same rule the Worker Record follows for a plot, where the break
goes before the run and never inside it. Which page they land on after that
is physics: a photo row is about 126pt tall, so a damage block ending within
that of the foot takes the whole section over. The lever is `MAX_H`.

### The footer owns the bottom of the page, and nothing above it knew

The office printed the sheet and said *"第一页的24被吃掉了"* — the 24 on page
one had been eaten. It is always the 24th, and that is the tell: everything
above the bag table is a fixed height, so the table always starts at 190 and
its rows are always 23.5 apart.

**`margin: { left, right }` leaves autoTable to pick the other two, and it
picks 40.** Which is `pageH - 40` — **the exact line the footer draws its
rule on**. So the table was entitled to fill page one down to 802, put its
24th row at 765.5–789, and the footer then drew its rule 12pt under it and
its line of type 23pt under that. On paper the tray trims that strip and the
row goes with it.

**The blocks AFTER the table were worse off, having no floor at all.** Only
the damage block ever checked. At 53 bags the totals box was drawn at 771 —
across the footer — and the analysis under it at **835 on an 842pt page**, so
the one figure on the sheet claiming to be the delivery and every percentage
beside it were simply not on it. Nothing said so, because the rows above
them were perfectly correct.

So there is **one floor** — `FOOT_H` is 60, `floorY` is `pageH - FOOT_H` —
and three things obey it:

- **The table is told all four margins**, `bottom: FOOT_H`. Page one now
  stops at 23 rows and the 24th opens page two.
- **`_need(h)` is asked before every block that follows**: the totals box,
  the analysis pair, the damage block (which had its own copy of this test
  and now shares the one) and the remark. It takes the next page WHOLE
  rather than drawing into the band, resuming at `margin + 20` — where the
  damage block has always resumed, so a continuation page starts in one
  place however it was reached.
- **The photo room is measured off `floorY`** instead of its own `pageH -
  60`, which was the same number written twice.

**A STUB THAT DOES NOT PAGINATE CANNOT SEE ANY OF THIS.** The test's
`autoTable` recorded the body and laid every row on one page, so a row in
the footer band — or a totals box off the foot of the sheet — passed without
comment. It paginates now, honouring the margin it is GIVEN and falling back
to 40 the way the real library does, at the real head and row heights (35
and 23.5, measured off jspdf-autotable 3.8.2). Six checks fail on the
previous code and the first of them names the office's own row:
`p1 #24 ends 789`.

And the measure is the **FLOOR, never the rule.** A check against the rule
at 802 passes over all of it — 789 is above 802 and still inside the band —
which is how the first version of this test came back green on the broken
code.

**The page now carries the three no-cache metas.** Every line of its code is
inline, so the PAGE is the deploy, and this was the second print fix in a row
that had to reach the office. One hard reload per machine.

### The panel and its pictures are ONE thing

*"这个移动去第三页 永远和照片在一起"* — the DAMAGE CONTROL panel printed on
one sheet and the trays it was counted off on the next.

The break was taken for the panel ALONE, and then the photos measured
themselves against whatever was left and moved if it was under `MIN_USEFUL`.
So a page with room for the panel and not for a picture split them: 3.11%
over here, and the evidence for it over the page. **That figure is the one
thing on the sheet nothing else on it can check** — which is why the
pictures are on the sheet at all — so the reader doing the joining up is the
whole value of the section gone.

So the ask carries the pair: `_need(DMG_H + 6 + HEAD_H + MIN_USEFUL + tailH)`,
and the photo section no longer moves itself. Same rule as the heading with
its pictures, and the Worker Record with a plot — **the break goes before the
run, never inside it**.

Two things it cost:

- **The photos are LOADED and measured before the panel is drawn**, because
  the panel cannot ask for room it does not yet know the size of. The
  `await`, the remark measurement and `_fitPhotos` all moved above it.
- **The photo room can no longer go under `MIN_USEFUL`** by construction, so
  the self-move is gone. A remark long enough to squeeze the pictures out
  gives its own space back instead and rides on its own `_need` — one line
  of text on a sheet by itself is a better fault than this one.

**THE FIXTURE IS 38 TO 43 BAGS AND NOTHING ELSE.** That is the only window
where the pair splits — few enough that the panel still fits at the foot of
page two, many enough that a picture does not. The first version of this
check used 44, which is one row past it, and passed over the broken page
exactly as green as over the fixed one. The test sweeps that window rather
than trusting the arithmetic.

## A lock in the stylesheet is a paint, not a gate

The office verified a Seed Audit report and said *"verified 了我还是可以
save and print"* — they could still save it.

A reviewed or verified tab takes `.mjm-locked`, and the CSS gives every
input and button on it `pointer-events:none`. That greys them, and that is
all it does. It does not stop the **keyboard** — a greyed button is still
focusable and still fires on Enter — and it cannot stop a **call**, which
is exactly what the close dialog makes: `confirmCloseBatchRecord` and
`saveOneUnsaved` reach `window[TAB_SAVE_FN[n]]()` directly. So verifying a
report, typing into it and pressing X then Leave **rewrote it**, with
nobody's signature moving.

**The refusal belongs where every route goes through**, which is
`_trackTabSave` — the one wrapper all seven tab saves already pass. Three
things in it:

- **The CLASS is the test, not a second reading of the banner.**
  `setTabLock` sets it for every reason a tab is not editable: reviewed,
  verified, and a login without the Fill in report tick. A second copy of
  that list is one more thing to get wrong.
- **It refuses as an ERROR**, which here means one thing — what you keyed
  is not in the database. So the close dialog goes on refusing to close and
  offers **Don't save**, which is the right answer for a change that must
  not be kept.
- **An explanation box is untouched.** It carries `.mjm-always-open` and
  its own Save, which is not one of the seven — the CSS above it says at
  length why that is deliberate.

**PRINT AND DOWNLOAD STAY LIVE, and that is the half the office may not
have meant.** They change nothing, and a verified sheet is the one most
worth having on paper: greying them means unverifying a report in order to
print it, which is the opposite of what the lock is for. They carry
`.mjm-review-allow` now so they work AND look like they work. If a printout
of a signed-off report is ever not wanted, that mark is the one line to
take off — but Save is the one that had to stop, and the stylesheet was
never going to be what stopped it.

`tests/unsaved_close_guard.cjs` drives the real dialog against a locked
tab: the save never runs, the tab stays unsaved, X and Leave does not
rewrite it, and both read-only buttons are still live.

## A tray empties every way the seedlings leave, not two of them

Tray Status read **P3 · 230 (81)** over a batch with nothing standing in P3,
and the office checked it before saying so.

`shared/shared_tray_stock.js` knew two ways out of a tray: the 1st culling
and the transplant. Life of Seedlings has known four since it was written —

    preBalance = planted - cull1 - trans - salesPre + calibrationPre

— and **the two missing ones are not rare.** A batch SOLD out of the tray,
and a batch whose pre-nursery count was corrected by an approved
calibration, both went on standing in a tray here. Its own arithmetic was
then too big, so the cap below it took nothing off, and the phantom was
parked on whichever tray happened to survive the trim.

Batch 230 is the batch this file already names for exactly that: an approved
**minus 1,000 against tray P30**, *"Sold out 1,000 Pre nursery seedlings (DO:
01605)"*. Its standing read a thousand too high and the remainder had to land
somewhere — P3, which was the only other tray it had ever been in.

Three things in the fix:

- **The tray the row NAMES is moved, not only the batch total.** The trim is
  a fallback for a movement nothing can place, and its "largest tray first"
  is a guess by construction — the file says so in its own words. A
  calibration keyed against P30 is not a guess, so P30 gives its holes back
  and nothing has to be apportioned.
- **An unapproved calibration moves nothing**, here as everywhere, and a
  calibration against a FIELD plot is not a tray's business — those
  seedlings left as a transplant and taking them off again is one loss
  twice. The same split `calibrationPre` makes.
- **`salesLinesOf()` flattens a delivery order once.** Five lines per order
  and a cancelled-order test (`'Cancelled'` with the capital, or
  `[CANCELLED]` in the remark) are two rules that must not be written per
  caller.

**Both screens pass all four**, and the test reads the two call sites to say
so: a caller short of an input is the thinner copy all over again.

`shared/CHECK_what_is_standing_in_each_tray.sql` is the size of it — every
batch that moves, term by term, with what each of its trays is left holding.
A batch whose gap is NOT its sold plus its calibration is the interesting
one, and the term columns say which of them is doing it.

`tests/a_tray_loses_every_way_they_leave.cjs` drives the shipped file with
230's own figures and holds the before and the after side by side.

## A typo must not lock the row that would fix it

A date box takes four digits for the year and somebody keyed two, so a 3rd
Culling came out dated **21/02/0026**. Every month of year 26 is two thousand
years past its auto-lock date, so `isDateLocked` said yes, the row took
`.mjm-locked` — and that disables every input on it, **including the date box
the wrong year is sitting in**.

There was no way out from the screen either. The Month Lock Calendar can
force a month open, but it lists real years and nobody is going to scroll to
year 26. The only route left was a hand-written UPDATE against the ledger,
for a slip of the keyboard.

**The calendar exists to stop somebody changing a month that has been settled
and paid.** Year 26 was never settled and never paid, so locking it protects
nothing and strands the error on screen for good. `isKeyedWrong()` in
`shared/shared_month_lock.js` is the escape: a date outside **2000–2100** is
not treated as a date at all, the row stays open, and the person who keyed it
puts it right.

The band is **deliberately wide**. This is not a validity check and must not
start refusing dates somebody meant — it is only the span outside which a
year is certainly a slip. A year INSIDE it is the calendar's business alone,
and the test says so by comparing against `isMonthLocked` rather than
restating it.

Two things beside it:

- **The boxes name the range they accept** (`min`/`max` on the culling date
  inputs), so the picker will not hand one back, and a row already carrying
  one says **⚠ Check the year** on its face rather than looking ordinary.
- **`shared_month_lock.js` was loaded with no `?v=` on all four pages.** It
  carries one now, so the next change to it is deliverable instead of
  depending on a hard reload per machine.

`shared/CHECK_dates_with_an_impossible_year.sql` sweeps every batch for the
rest of them — `transaction_date`, `CullDate:` and `Date:` each on their own
line, since a row can be wrong in one and right in another. It suggests the
obvious repair for a two-digit year and names anything else for a person to
decide; **nothing applies the suggestion**, because correcting it on the tab
is what rewrites the rest of the remark correctly at the same time.

`tests/a_typo_year_does_not_lock_itself.cjs` holds it.
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

## An alert is per BATCH, because a Plot Condition audit is

The back office alert board showed nothing but Papan Tanda, and the
office asked why Plot Condition had gone quiet. It was not a clean month.
Every reading but one was being thrown away before any filter ran.

`latestPerPlot()` keeps the newest row per thing, which is right — only
the latest reading of a thing is its current state. **The trap is what
"a thing" means, and it is not the same for both tables.**
`audit_script.js` says it in its own words: *"The main nursery tracks
work batch by batch: a plot holds several, each with its own age and its
own audit. Pre Nursery does not work that way."* So:

- **Papan Tanda** is one sign per PLOT. The plot is the unit.
- **Plot Condition** in the main nursery is one row per plot per BATCH.

Collapsing plot condition on the plot alone kept ONE row of the seven a
plot might carry, so a rat found on batch 253 in B01 vanished the moment
batch 268 was saved and came back clean. **And it was not even the latest
reading**: a plot's batches go up in ONE insert — the batch queue holds
them until the last one — so `created_at` differs by milliseconds and
whichever sorted highest is the one that survived. Which alert you got
was effectively arbitrary.

**Papan Tanda was unaffected, and that is exactly why it was the only
thing left on the board.** Pre Nursery's plot condition was unaffected
too, being audited plot by plot — it simply happened to be clean, which
is why the fault read as "only papan tanda works" rather than "only the
main nursery is broken".

Four things in the fix:

- **`keyOf` is PASSED, never guessed.** The next table to use this has to
  say what its unit is, rather than inheriting an assumption that was
  only ever true of one of them.
- **The query has to ask for what the key reads.** `batch` was not in the
  select at all, so keying on it without that would have made every key
  end in an empty string and changed nothing — the quietest possible way
  for this fix to look applied and do nothing.
- **The card counts PLOTS and the pill names the BATCH.** "2 plots
  affected" is what somebody walks to; the batch is what the reading was
  taken of, and a plot flagged on one batch and clean on the next is not
  a flagged plot.
- **The notification fingerprint carries the batch**, or a second flagged
  batch on an already-flagged plot raises nothing.

`tests/an_alert_is_per_batch.cjs` lifts the shipped `latestPerPlot` out
of the page and drives the office's own case — three batches on B01, the
rat on 253, all saved in one insert. Eight of its checks fail on the
previous code, and two of them drive the OLD behaviour directly to show
what it cost.

**`audit_sw.js` precaches `audit_admin.html`**, so `VER` is bumped in the
same commit or the board reaches nobody.

### And the thing the auditors were actually finding was on no test at all

The per-batch fix was right and changed nothing the office could see, so
they asked again. Three checks, in the order the house rule says: the
current month (`CHECK_why_no_plot_condition_alert.sql`) came back **107
readings, 0 flagged**; every month ever (`CHECK_the_alert_board_every_month
.sql`) came back **142 readings, 0 flagged, 0 hidden** — the board had
never raised a Plot Condition card in its life, so the collapse fault had
simply never bitten. Then the census
(`CHECK_has_a_plot_ever_read_anything_but_clean.sql`) answered it:
**140 of the 142 readings are not clean, and not one of them was on the
board.**

**The form asks four things and the board tested three.** The module card
above it has always promised *"Pest, animal damage, disease and leaf
colour"*, and `disease` was on no test and **not even in the select**. So
**76 readings of Banyak bintik and 40 of Sedikit** — 116 of 142 — were
walked to, tapped in, and shown to nobody. Rats and pests really are
`Tidak Ada` everywhere and leaf colour never reaches 4, so disease was the
*only* thing the auditors were finding, which is why an empty board looked
exactly like a clean nursery.

Three things in the fix:

- **BANYAK ONLY, the same threshold as its sibling pest**, and the count is
  the argument: Sedikit as well is 116 plots, which is the whole nursery,
  and a board listing every plot is a board nobody reads. Sedikit is one
  string away the day the office asks.
- **The exact equality is what keeps the sentinel out.** A declined audit
  stamps the whole `No Audit Required — Culling Plot` string into all four
  columns, and that is not a reading of a disease. An `indexOf`, a `LIKE`
  or a truthiness test would put five culling plots on the board as
  diseased. **The first version of the census had exactly that bug** and
  printed those five as the worst rows on the page — `declined` is counted
  on its own now.
- **The check and the board have to agree.** The census marks a value with
  what the board does about it, so a threshold changed in one and not the
  other is a check that lies about the screen. Section 6 of
  `tests/an_alert_is_per_batch.cjs` holds the select, the test and the
  sentinel.

**And the select is now asserted by the BATCH alone, not by the whole
column list.** Adding `disease` broke that check for the wrong reason —
a column list typed out in a test is a list that will be wrong, which this
file already says of a column list typed out in a row.

## A round that has passed is not carried. Only maintenance is.

The board used to rescue every overdue round from the last three months
onto today's list. For a plot somebody simply had not got to yet that is
right. For a plot nobody has EVER walked it stacks: N15 had never had a
Seedling Height audit, so the board drew **AUG R-1, AUG R-2 and SEP R-1**
one above the other, three rows asking the same question, above October's.
The office said it in one line — *"remove all aug and sep audit to do"* —
and the shape of that sentence is exactly what they had said of papan's
two rows before: *"this 2 already passed, no need to show."*

So `carriedOverdue()` carries **maintenance and nothing else**. Papan
already left for a reason of its own — a two-month roster asks about
September in October's row, so carrying September listed the same plots
twice — and Plot Condition and Seedling Height now follow it on the plain
judgement rather than on the window.

**MAINTENANCE IS NOT A ROUND**, which is why it stays and why that is not
an inconsistency. Its row exists because a deadline has pending work on
it, so there is no window to be outside of, and dropping one would hide a
task the maintenance module can still see. The one thing that retires it
is an audit against its `task_id`, or an admin closing it with the ×,
which writes a record carrying a name, a date and how overdue it was. An
automatic drop would take that record away. The office was asked and said
so: leave the × to do it. `MAINT_OCCURRENCES` also depends on this —
`loadMaintTimeline` appends past-month buckets precisely so
`carriedOverdue()` can bring an older deadline forward, and its own
comment says that.

**WHAT IT COSTS, and the office chose it with this in front of them.** A
round nobody walks shows only while its window is actually OPEN — one day
a month on the MN plot schedule. A plot never audited at all, N15 being
the live one, is on no row between rounds, where before it stacked. That
is the same trade already made for the late-work rule one section up, and
it rests on the same thing: **the FACT is not lost.** `missedRounds()`
walks the months itself and does not read `carriedOverdue()`, so every
missed round is still filed in Audit History under the month that owed
it. **That is now the only place a plot nobody walks accumulates**, which
makes the monthly report the thing to read rather than the board.

Two things to know before touching it:

- **It is ONE line** — `if (o.mod !== 'maint') return;` — and the test
  asserts that line, because a rule half-applied across three modules is
  how one of them quietly goes on stacking.
- **`audit_sw.js` precaches `audit_home.html`**, so a change to the board
  reaches nobody until `VER` is bumped. It is a date plus a counter
  (`mjm-26102301`); somebody may have bumped it already today, so take the
  next one above everything in use.

`tests/papan_list_spans_two_months.cjs` holds both halves: no round module
carries a past month, and `carriedOverdue` says so in one line.

## Papan tanda is two months wide, because a sign goes up after the plot does

The papan roster was the current calendar month: the plots the ledger
says were transplanted (or, in the Pre-Nursery, planted) since the 1st.
One month is too narrow for the walking. A plot transplanted on the
**28th** gets its sign nailed up days later, and on the **1st** it fell
out of the list entirely — audited or not, with nothing saying it had
gone. The office asked for both months on one screen: *"so i can see sep
transplanting plot and oct transplanting plot. So our auditor just based
on this to audit plot needed."*

So the window opens on the **first of the PREVIOUS month**, and it is
written twice:

- `_papanWindowStartISO()` in `audit_papan_script.js`, which is what the
  module page queries the ledger with (`transaction_date.gte.`);
- `_papanWindowStartISO()` in `audit_pending.js`, which is what the home
  board's to-do row and its plot chips are built from.

**Change one, change the other.** A plot inside one window and outside
the other is a to-do row with no card to open, or a card nothing ever
asked for. `tests/papan_sees_both_months.cjs` runs BOTH shipped copies
over the same days and compares, the January-reaches-into-December case
included.

**AND IT IS TWO MONTHS AS AT THE ROW, NOT AS AT TODAY.** The office
put the rule plainly: *"oct audit papan tanda then it will appear the
plot that transplant on Sep and Oct; nov audit papan tanda then it will
appear the plot that transplant on oct and nov."* The window therefore
has to be anchored on the month the row is ABOUT. The first version
anchored it on today, and the board carries an unfinished round forward,
so in October it drew **three** Papan Tanda rows — AUG 2026 overdue, SEP
2026 overdue and October due now — each listing the **same six plots**,
every one of them tagged SEP 26. A round that closed on 20 August cannot
be owed a sign that went up in September: that row was asking about
plots which did not exist when it was due, so nothing an auditor did
would ever clear it and it never left the board.

So `plots()` and `papanPlacedOn()` take an **`asOfISO`** — the row's own
month — and `_papanWindowStartISO` / `_papanWindowEndISO` move with it.
Two things in that:

- **The UPPER bound was missing altogether.** Without it a September row
  lists October's plots as well, which is the same fault pointing the
  other way.
- **Three callers, one month**, the same rule `winRange` already
  follows: `nurseryState` decides whether the row stays, `_plotsHtml`
  draws the circles under it and `plotsOwed` counts them. They share
  `_asOfMonthISO(y, m)`, because a row that clears while its circles
  remain is worse than the bug was.

A month that owed nothing now comes back empty and the row leaves the
board on its own. Only papan reads `asOfISO`; the other three modules'
rosters do not move with the calendar, and the module page omits it
because it only ever shows now.

**AND A PAPAN ROUND IS NOT CARRIED FORWARD.** Every other module's
round asks about ONE window, so a round nobody walked has to be carried
onto the current board or the work disappears. Papan's roster is two
months wide by itself, so October's row **already asks about every plot
transplanted in September** — carrying September's row asks the same
question twice, and August's a third time where the windows overlap. The
office saw B03, B06, N08 and U04 under an AUG 2026 row and again under a
SEP 2026 one, above October's, and said of both: *"this 2 already
passed, no need to show."* The two-month window IS the catching up,
which is what it was asked for.

`carriedOverdue()` skipped `papan` **and nothing else** when this was
written. It now carries MAINTENANCE and nothing else — see the section
below, where the office extended papan's outcome to the other two rounds
on a reason of their own. **What it costs:** a plot placed two months
back or more and never audited is on no row at all, because it is
outside the current window and there is nothing left on the board that
could ask for it. A round done LATE is still filed in Audit History as a
missed one: `missedRounds()` walks the months itself and does not read
that list.

**And the strip has to SAY which month.** Two months of plots drawn as
one run of identical circles answers a question nobody asked — the
office wanted to tell September's from October's. The circles are
ordered newest month first with a small tag above each run, and
`MJMAuditPending.papanPlacedOn(nursery, plot)` is what supplies the
date. It is an accessor of its own rather than a field on `plots()`: the
other three modules want a list of codes, and widening the one function
they share to carry something only papan reads is how a shared function
becomes four. A plot the roster cannot date is tagged as undated and put
LAST, never dropped and never filed under a month nobody checked.

**Which page the auditor is actually on matters here.** The papan module
has no landing list of its own — `init()` redirects to `audit_home.html`
unless the address names a plot — so the strip on the To Do card IS the
papan plot list. The module page's own grouped list is reached by
`?admin=1` or `?from=manage` and is kept in step with it rather than
being the thing people see.

**The window change is what forced papan into the round rule.** That
rule — "A batch is not audited for ever because it was audited once",
below — deliberately left papan out, and the note said why: its roster
was *this month's* placements, so the roster was already round-shaped
and "ever audited" could not disagree with "audited this round". Two
months breaks that. A plot transplanted and audited in September now
rides into October's roster, and the old test would have drawn it green
while the home board, which asks about the round's own dates, went on
listing it as owed. So `getAuditForBatch` asks
`MJMAuditSettings.currentWindow` like the other two, `_papanRoundFor` /
`_papanInRound` / `_papanRoundSuffix` are the third copies of
`_roundNow` / `_inRound` / `_roundSuffix`, and the count pill says which
round it is counting. `getLastAuditForBatch` is the other half: the card
and the chip still show the last reading, because an auditor wants it in
front of them before they take the next one, and Batch Info keeps the
EVER question because it is a register and not a to-do list.

`tests/papan_list_spans_two_months.cjs` drives the real board and the
real module page in a real browser — one plot per month, so a row
reaching outside its own window is caught by NAME rather than by a
count.

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
copies of the grid test. Change one, change the other. **Papan is in it
now too** — it was left out while its roster was one month, which made
its own rule round-shaped by accident; the two-month window took that
away. See the section above for what moved.

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

## Turning a signup down is a RECORD, and the cross is a SIBLING

The Worker System board opens with a yellow queue — Waiting to be allocated
— which is everybody on the register with no section. It was written so a
worker who had just signed up was on some screen rather than only in the
table. What it had no answer for was a name nobody is ever going to file:
the office does not want this person, and the one thing that empties the
queue is giving somebody a nursery. So four rejected applicants sat in a
queue of work to be done, for ever.

The ✕ on a chip rejects the registration, and it is the admin-close of a
dead plot again, which is where every rule in it comes from:

- **It is a record and never a deletion.** `removeWorker()` was taken off
  this screen on purpose — a worker row is what the work entries hang off,
  and the register is the one place that says a person ever applied. So the
  rejection marks them inactive and writes `rejected_at` / `rejected_by`,
  and nothing is removed. Tick Show inactive to find them again; setting
  them Active on their own record undoes it, which **clears both columns**,
  the same way Active clears the last day.
- **The two columns, never the remark.** The remark is free text the office
  edits, and a rejection that can be undone by somebody tidying a sentence
  is not a record of anything. `isRejected(w)` reads the column, and a table
  without it answers no for every row — which is the safe way round: the
  signup stays in the queue somebody is working through rather than
  disappearing out of it with nothing to say where it went.
- **The cross is a SIBLING of the chip and never a child.** The chip opens
  the worker on a click and carries a drag on a grab, so a cross inside it
  fires both — the office would reject somebody and get their record opened
  over the top of it. `.pend-item` holds the two side by side. Same rule the
  audit board's × follows, for the harder reason there (a button inside a
  button is not a thing a browser will draw).
- **The permission is asked AGAIN at the write.** A cross drawn before
  somebody's access changed is still sitting on the screen.
- **The confirm names the person**, because the crosses are a row of small
  identical targets and the one under the thumb is not necessarily the one
  that was aimed at. No `prompt` for a reason: the office said of the plot
  closures that an admin types the same sentence every time, and a prompt
  somebody dismisses out of habit is a cancel that looks like a save.
- **It rebuilds from the database, not from the screen.**
- **A rejected signup is drawn UNDER the queue, not in it**, so the count
  above is the work actually left to do. Both lists are cut from `shown`, so
  neither is on screen unless Show inactive is ticked — which is how a
  rejection leaves the board at all.

`shared/RUN_ME_worker_rejected.sql` adds the two columns and backfills
nothing: a worker already on the board is not a rejected signup, and a
backfill that guessed at one would be inventing a decision nobody made.
Until it is run the page shows its own orange warning, the ✕ still works,
and the write carries neither column — writing one the table has not got
fails the whole save, which is why `loadWorkers` probes for it the way it
already probes for the PIN, the photo and the two dates.

`tests/a_rejected_signup_leaves_the_queue.cjs` drives the real board in a
real browser, as an admin and as a plain auditor, and asserts no DELETE is
ever sent and that no `prompt` is ever raised.

**The page carries nearly every line of its own code inline**, so the PAGE
is mostly the deploy: the shared files it loads carry a `?v=`, and
everything else in it does not. It was written up here with no no-cache
metas and the note said to add the three the day somebody needed a fix in a
hurry — **that day came**, and it carries them now. One hard reload per
machine to pick them up, and it stays fresh by itself after that.

### A row for every role, and Others is the one column that is not a place

The board drew four rows — FC, Assistant FC, Water Pump Operator, Workers —
and swept everybody else into **Other**. Driver and Gardener were real roles
on the register the whole time, so four people sat under a heading that
means *a role nobody recognises* over roles the list names. And Other is the
one row that **cannot be added to** — adding there would have to invent a
role — so a Driver could not be put on the board at all, which is the
question the office actually asked.

So the rows are Estate Manager, Admin, FC, Assistant FC, Water Pump
Operator, Workers, Gardener, Driver, and then Other. Three things in it:

- **`ROLES` and `BOARD_ROLES` are one list in two shapes**, and the test
  asserts every board row is a role the form can set: a row nobody can be
  given is a row nobody can be added to.
- **The dropdown reads in the order the board draws its rows**, so somebody
  who has just read the board finds the role where they expect it.
- **Neither new role is general nursery work.** `isKnownRole` answers yes
  for them, which is what keeps them off the Work Maintenance tick sheets —
  and `ROLES` has a SECOND COPY in `FC-Portal/src/modules/maintenance/
  helpers.js` that the same rule reads. Change one, change the other.

**And the column they stand in is OTHERS, which was ADMIN for a day.** The
section below this one is the whole story of that column — a place with no
plots in it, `maint: false`, offered by the Location card, last on the
board. It shipped carrying the word **Admin**, and the rows above took that
word away from it: a column headed Admin beside a ROW headed Admin is one
word answering two questions, *where* and *what*. Admin is the job. The
place is simply not-a-nursery, so it is **Others**, and it is the only
column on the board that is not somewhere on the ground.

`shared/RUN_ME_worker_section_others.sql` moves the two people who were
filed under the old code, and is the only thing that puts a worker there.
It deliberately **does not touch anybody's role**: both are keyed Field
Conductor, and whether that is right is a question about those two people,
answered on their own record. A file of SQL deciding somebody's job title
is the one thing that repair must not do.

Nothing else in either system was keyed on the old code — it is not a
maintenance nursery, so neither the tick sheets nor the salary claim have
ever counted it.

**AN EMPTY ROW AND AN EMPTY ORPHAN COLUMN ARE NOT DRAWN**, and both follow
from the rows above rather than being a tidy-up. Once every role the list
offers has a row, **Other** holds one thing — a role typed before the list
existed — so on a register nobody has keyed free text into it is a row of
empty cells carrying a 0 under a heading that means *a role nobody
recognises*: a question about nothing. It comes back the day one turns up,
and it is still the row that offers no Add.

The same sentence about a COLUMN, one word different. `addOrphanSections`
draws one for a section the nursery list does not hold, and **nobody can
ever be added to one** — so an empty one is a heading reading *"ADMIN — not
in the nursery list"* over nothing at all, which is what the office was
looking at after the SQL moved the last two people out of it. The company's
own sections keep their column standing empty, because that is where
somebody IS added, and the orphans carry an `orphan: true` mark so the
board can tell the two apart without a second copy of the section list. A
worker hidden by Show inactive takes the column with them and brings it
back, because the one standing there is still somebody to be moved.

`tests/every_role_has_its_own_row.cjs` drives the real board; 12 of its 17
checks fail on the previous page.

## The Worker Record reads the conductor's transplanting, and writes ONE column

The Field Conductor records the four transplanting jobs on his own portal:
the plot, which job, the day, and the crew. They land in
`nops_transplant_field_records`, the salary claim prices them — and until
now the office had **no screen that showed them at all**. The one place the
work appeared was a figure on a claim.

So Worker Record has a fifth tab. It is DATE · PLOT · WORK · QTY and a
column per worker, the same shape as the four beside it.

**THE CREW IS READ-ONLY HERE, and that is not an omission.** The FC Portal
is the only writer of a transplanting CREW in either repository. A tick box
over a name here would be a second writer of somebody's pay with no rule
about who may move it — which is exactly what the sheet's own
`transplant_edit` permission exists to govern. The test asserts the renderer
puts no handler on a cell of its own.

**The one column the office does write is CHECKED** — see the section below.
It was read-only in full for exactly as long as the claim was paid straight
off the conductor's record.

**The share is the CLAIM's rule, and a test holds the two together.** One
worker's figure is the quantity keyed against their name where the job
splits (polybag filling), and the plot's `source_qty` divided equally among
the crew otherwise. `tpShare()` here and the two lines inside
`transplantFieldLines()` in `npayroll_script.js` are the two copies; change
one, change the other. A sheet that divides a plot one way and a claim that
divides it another is one worker paid for work the sheet credits to somebody
else, and this codebase has that fault often enough to have its own heading.
`tests/the_worker_record_shares_like_the_claim.cjs` lifts BOTH out of the
shipped files and drives them over the same records.

Three smaller things:

- **Asked by `schedule_month`**, the same key the claim asks on. The record's
  own month decides which claim pays it; a second rule here would put a row
  on this sheet that the claim does not pay.
- **The PLOT decides the nursery**, the house rule — the record's
  `nursery_name` is whatever the FC Portal had on screen, and the plot is the
  thing that is somewhere.
- **A name the register cannot place still gets a COLUMN**, after the
  register's own, and the sheet says so underneath (`pay.fieldNoColumn`).
  Every other tab here is a tick sheet where the office decides who may be
  ticked; this one is a record of a decision already made in the field, so a
  name with no column would be a worker's share leaving the sheet with
  nothing saying it had gone.

**THE DATE COLUMN IS THE BATCH REPORT DAY**, not the day the job was keyed
— *"这边的日期 要跟着batch report的日期"*. The conductor keys the four jobs
whenever he reaches the sheet, so a plot of rows all read 28/10. The column
shows the `transaction_date` of the plot `Transplanted` row (Tab 3), matched
on the plot and the record own batches as sets, the latest day where it
names several; a record nothing matches keeps its keyed date and the hover
says which. **Display only**: `schedule_month`, which decides the claim that
pays it, does not move. `tests/transplant_date_is_the_batch_report.cjs`.

`TP_JOBS` is the **third copy** of the job list — FC-Portal's
`transplantData.js` and `npayroll_script.js` have the other two. Only the key
and the label are needed here; the matching and the rates stay where they
are.

## The transplanting claim is paid on a row the OFFICE has checked

The four jobs are keyed by the Field Conductor and used to reach the salary
claim straight from there. `loadTransplantField` said why in its own words:
*keying it IS the signature, and there is no second person to wait for.*

What that left out is that the office has to AGREE a figure before it prices
it — a quantity the report is still moving, a crew somebody is about to
correct, a plot keyed against the wrong month. There was no way to hold one,
so **the first anybody saw of a figure was the money.** It is the same
Checked tick the other four Worker Record tabs have carried for months,
asked of the fifth, and the claim quotes the same sentence as the sheet:
*ONLY A CHECKED ROW REACHES THE CLAIM.*

Five things in it, and four of them are faults this file has had before:

- **Held work is COUNTED AND NAMED.** A claim short of work reads exactly
  like a quiet month, which is the thing this system is most careful about.
  The claim prints the money (`transplantHeldLines()` prices the held rows at
  their real piece rate), the rows, the plots and where the tick is; the
  Worker Record foot carries a **Held back** line under the total; and the
  by-plot table — which counts what the claim pays, so it agrees with the
  cards above it — says which plot it left out.
- **A month entirely held is NOT a month nothing was recorded in.** Both
  empty sentences had to learn the sixth answer. "No transplanting was
  recorded" over a month the conductor spent keying is the office telling him
  his work never arrived, which is the whole argument of
  `transplantEmptyLead`.
- **IT FAILS OPEN.** A database that has not had the SQL run refuses the
  whole select over a column it has not got — and the error it sends back
  ("could not find the column") is matched by the quiet branch that turns a
  missing TABLE into an empty list, so the sheet would have read EMPTY over a
  month of work. Both readers fall back to the columns that have always been
  there, every row is paid the way it was before the tick existed, and both
  SAY SO: red on the claim, orange on the tab. A gate that cannot be read
  must not take a month off a claim — same reason access fails open. And a
  gate that is missing is said LOUDER than being short, because a claim
  paying work nobody agreed while the office believes it is gated is worse
  than one that is light.
- **The tick is cleared by a TRIGGER, not by a screen.** Three things write
  that table — the FC Portal sheet, this page, and somebody in the Supabase
  dashboard — and a conductor who corrects a crew after the office agreed the
  row has changed what is being paid. A rule living in one screen is a rule
  the other two do not obey; same reasoning as `previous_names` on the worker
  register. Only the fields that decide the MONEY clear it (the day, the
  plot, the job, the month, the quantity, the crew) — a corrected remark or
  batch name leaves the agreement standing — and a write that corrects a
  figure AND agrees it in one go is left alone, or the tick could never be
  set.
- **Nothing is backfilled.** A tick nobody made is not a signature, and
  seeding one would be the SQL deciding a month the office has not looked at.
  So the first claim after it is run is NOUGHT and names everything it is
  holding. That is the office being asked the question for the first time,
  and `shared/CHECK_transplant_held_back.sql` is the size of it — every
  nursery-month, how many rows are agreed, and the capacity on no claim.
  Hand it over with any change here.

### Which of the six reasons an empty sheet is, and how to read it off the screen

The office asked why BNN and UNN1 had no transplanting in October, and the
answer is in the sentence the screen was already printing. **The by-plot
table has two empty sentences and they mean different things**, which is the
whole point of `renderTransplantByPlot` carrying both: *"N plots … are
waiting to be Checked"* is work recorded and not agreed, and the bare
*"Nothing transplanted in UNN1 for October 2026"* is drawn only when the
section has no row in `transplantField` **AND** none in `transplantHeld` —
which between them are every row the read returned. So that sentence means
exactly one thing: **no record came back for `schedule_month = 'Oct 2026'`
whose `nursery_name` normalises to `UNN1`.** Reading it the other way round
and going looking for an unticked row is an afternoon spent on the one
branch the screen had already ruled out.

What is left is four causes, and `shared/CHECK_transplant_not_on_claim.sql`
separates them in one paste. It was rewritten for this:

- **It answers for EVERY section**, not the one circle somebody edits into
  line 1 — the office asked about two nurseries and the old file would have
  been run twice. One batch is the example, never the scope.
- **It knows about the Checked gate**, which it predated. `checked_at` is
  read as `to_jsonb(t) ->> 'checked_at'` rather than named as a column, so
  the file still parses on a database that has not had
  `RUN_ME_transplant_checked.sql` run — the same trick as the `DO` block
  that keeps `storage.buckets` out of a `CASE`. An absent column and an
  unticked row both read NULL, so the **first row of the result says whether
  the gate is installed at all** and the held counts mean nothing until it
  does.
- **NOBODY NAMED is asked before the Checked test.** Both can be true of one
  section, and a record with an empty crew pays nothing even once somebody
  ticks it, so that is the answer somebody can act on.

**And the fifth cause is invisible to any query.** `loadTransplantField`
turns ANY read error into an empty list — the branch exists so a database
without the table goes on working — so an RLS refusal or a dropped
connection draws a month with nothing in it and nothing anywhere saying so.
Only the `checked_at` error is told apart and said in red. If the check
below says the work is there and on the claim, that is what is left.

**A MONTH THE OFFICE HAS VERIFIED IS ALREADY AGREED**, and more strongly
than a tick. The Transplanting sheet keeps no snapshot the way Work
Maintenance does — `verifyCurrentSheet` builds one for `maint` and `null`
for everything else — so it is always read live. Without this exception,
deploying the gate would take every settled month to NOUGHT, and the office
could not even put it right: ticking a row in a locked month is not a thing
this system lets anybody do. `_tpVerifiedMonth` asks `MJMPayrollLock` for
the row's own section, and `splitTransplantField` RE-SPLITS on every read
rather than once at load, because the lock module loads in parallel with the
rows and a verified month would otherwise look unverified for the first
draw.

The Worker Record tab **cannot** ask that question — `nursery_ops` loads no
payroll-lock module and has no business growing one — so its Held back line
states the rule and NAMES the exception in a clause rather than deciding it.
A second copy of a verification rule, in a page with none of the data, is
the thinner-copy fault this file is full of.

A pill is still offered for a nursery whose ONLY transplanting is held
(`transplantExtraSections` asks the held lines too), or the one sentence
saying it is being held could not be reached.

`shared/RUN_ME_transplant_checked.sql` is the two columns and the trigger.
`tests/the_transplant_claim_asks_the_office.cjs` drives the real loader
through all three cases, and `tests/transplant_claim_empty.cjs` holds the two
new empty sentences against the real page in a real browser.

### A job NOBODY DID is on neither list, and it is an answer

A blanket spray is not always needed, so the Field Conductor can answer a
job with *"nobody did this"* — `shared/RUN_ME_transplant_not_done.sql`, and
the FC Portal's own `CLAUDE.md` says why the plot needed a way to say it.
It is an ordinary record of the table with an **EMPTY CREW** and `not_done`
set, so `transplantFieldLines` has always dropped it: the money needed no
change at all. What needed changing is every screen that reads a crew of
nobody as a crew somebody FORGOT.

**IT IS NOT HELD WORK.** Held means the office has still to agree a figure,
and there is no figure here to agree. Left in `transplantHeld` the claim
would read *"RM 0.00 is NOT on this claim — 1 row has not been Checked"*
and send somebody to tick a row that can never pay anybody. So
`splitTransplantField` takes these rows out FIRST, before the tick is asked
about, and they are in NEITHER list — `transplantNotDone` is the third.

Five things follow, and four of them are sentences this file already has a
heading about:

- **A month whose records all say "not done" is not an empty month.** Both
  empty sentences and the by-plot table learned a seventh answer. "No
  transplanting was recorded" over a conductor who answered every question
  put to him is the same wrong sentence as telling him his work never
  arrived, which is the whole argument of `transplantEmptyLead`.
- **It is COUNTED AND NAMED**, with the plot and the job, in the claim's
  notes, in the by-plot note and under the Worker Record total — in SLATE
  rather than amber, because held work is a question waiting for the office
  and this is an answer already given.
- **The Worker Record offers no tick on one.** A Check button would offer a
  tick that moves no money, and a ticked row that pays nobody is what
  somebody later reads as a fault. Its Qty cell says *Nobody did it* rather
  than quoting the plot's figure — that figure is what the job WOULD have
  been, and printing it reads as capacity somebody worked.
- **TWO OPTIONAL COLUMNS, AND POSTGREST NAMES ONLY THE FIRST IT CANNOT
  FIND**, so both readers' fallbacks became LADDERS rather than two ifs:
  each refusal drops the column it names and asks again. A missing
  `not_done` needs no warning, unlike a missing `checked_at` — a not-done
  record cannot exist on a database without the column, so every row reads
  as an ordinary one, which is the truth.
- **The flag decides, not the crew left on the row.** `_tpNotDone` is
  asked in `transplantFieldLines` and in `tpShare` as well as in the split,
  because a row hand-edited in the Supabase dashboard could carry both.

**One trigger function in TWO files**, word for word: both
`RUN_ME_transplant_checked.sql` and `RUN_ME_transplant_not_done.sql` create
`nops_transplant_clear_check`, so whichever is run last is the one the
database keeps and a condition added to one and not the other is a tick
surviving a change it should not. `not_done` is compared THROUGH `to_jsonb`
in both — never named as a column — which is what makes the body parse on a
database where only one of the two has been run, so the order does not
matter. Section 10 of `tests/the_transplant_claim_asks_the_office.cjs`
compares the two bodies with their comments stripped.

`shared/CHECK_transplant_not_on_claim.sql` asks NOT DONE **before** NOBODY
NAMED, for the reason above: such a record has an empty crew as well, and
"go and add who did the work" is the wrong instruction for work nobody did.

## User Access is one block per PORTAL, and two of them were on no screen

The screen was five flat doors in no particular order — the back office, the
two phone apps, the worker register and the screen itself — with the FC
Portal the only one carrying anything inside it. The office asked for it to
read the way the company is arranged: a block per portal, and under each the
things that portal offers.

Two things fell out of that, and the second is what was actually broken.

**Worker System and User Access Setting are not siblings of the back office.
They live inside it.** Nothing about the ticks changed — the same two
`scan_areas` keys, the same fallback — only where they are drawn. Which is
exactly why the SEEDING had to learn about them: `openRow` walked the top
level and recorded what each door was drawing, so a nested door it no longer
walked would be saved as nothing and read as a no the next time. `ALL_AREAS`
is the flat list, and every rule about a tick — the fallback, the seeding,
the save — is about the TICK and not about where it sits.

**The Admin Portal and the Auditor Portal were on no access screen at all.**
`scan_areas.admin_portal` and `scan_areas.audit_portal` have gated their two
doors on the 555 MJM Team page since they moved there, and were written by
nothing — so the only way anybody held either was the fallback.
`scan_user_access.html`'s own copy of `canScanArea` had neither case, which
did not matter while they were ungrantable and mattered the moment they were
not: `default: false` read every Admin Portal person as holding nothing, so
their block drew closed and nothing inside it could be reached. **A screen
that keeps its own copy of a gate has to conclude exactly what the gate
concludes**, which that file already said in its own words about the other
five.

What is inside them is stored where each module ALREADY reads it, because
two screens writing one answer is fine and two answers is not:

- **Admin Portal** — `mobile_actions.<page>.view`, mirrored to
  `mobile_pages`, which is the shape `shared_module_access.js` has written
  for every module with its own User Access screen and the one
  `MJMAccess.canDo('mobile', page, 'view')` reads back.
- **Auditor Portal** — `audit_actions` / `audit_pages`, **the same keys
  `audit/audit_user_access.html` already writes**. Two doors onto one answer.
  `tests/user_access_reads_portal_by_portal.cjs` lifts that file's page keys
  out of it and compares, so the two cannot drift.

Four more things, each a way this goes quietly wrong:

- **LOOKING IS NOT DECIDING**, and the two new blocks could most easily have
  broken it. Writing today's effective answer into every row somebody merely
  OPENED turns "nobody has been asked" into a decision, and the module level
  stops answering for people it used to answer for. So a store is settled on
  FIRST TOUCH (`settleStore`) and not on open: press a tick in it and the
  whole block becomes explicit, the way that module's own screen writes it;
  press nothing and the row carries no entry at all.
- **Seal Management is the portal's OWN screen, and not the hub module of the
  same name.** The Admin Portal grew a `seal.html` of its own, so the tick is
  an ordinary `mobile` page like the three above it — the seals are received
  and scanned in the field, which is where that screen is.
  `seal/seal_dashboard.html` is a different screen at a desk with a module of
  its own (`modules.seal`), granted on the main User Access as it always was,
  and this row does not touch it. The test asserts that separation, because
  two screens sharing a name is exactly how one tick comes to close both.
- **The Worker Portal's Maintenance is a line, not a tick.** A worker signs in
  with a PIN, so the modules on their phone hang off THEIR row of the payroll
  register — nothing here could ever read a tick on an e-mail account. The
  row says where the answer lives (System Setting → Portal View & Function
  for the company, Worker Portal → Settings for the worker) and carries no
  checkbox.
- **The people list is three modules now, not one.** It filtered on
  `modules.scan`, from when this screen governed the FC Portal and the back
  office — so an Admin Portal person with no scan access of their own, which
  `scan_admin.html` says in its own words is an ordinary thing to be, was
  missing from the one screen that grants them anything.

**And the Admin Portal now OBEYS its ticks**, in the other repository.
`hasOpsAccess()` let anybody holding any staff-grade module into every one of
its screens, so the office could have ticked whatever it liked and the phone
would have opened the door anyway. `canOpenAdminPage()` in `Mobile`'s
`src/lib/auth.js` is the read, `AuthGate` takes a `page`, and the dashboard
filters its tiles on the same call — a tile drawn over a page that would
refuse is a trap, and a page open with no tile is access nobody can see.
Absent is a yes, as everywhere. A refused page goes back to the DASHBOARD and
not to `auth.html`, which is the Pending Access notice and means something
else entirely. `Mobile/tests/the_tiles_obey_the_office.cjs` holds it.

**`scan_user_access.html` now carries the three no-cache metas.** It keeps
every line of its own code inline, so the page IS the deploy — and a
permission screen is the worst place in the system for a browser to be
showing yesterday's rules while the office believes it has changed them.

### And then the Auditor Portal's two actions were read for the first time

Putting the block on the screen is what made it worth asking whether anything
obeyed it, and **Record a new audit and Edit & delete past audits were read by
nothing.** Unticking Edit saved cleanly, showed as set on both screens that
offer it, and that auditor went on editing and deleting. It is the same fault
the `view` half of `audit_supabase.js` was written to correct, one level down,
and that file says so in its own comment: *"audit_user_access.html has always
written `audit_actions.<page>` … but nothing in the audit module ever read
them."* The `view` half was fixed then. The actions were not.

`canAuditAction(action, page)` is the read and `requireAuditAction` is the
click-time guard. Four things in it:

- **IT IS ASKED BEFORE THE WORK, NOT AFTER IT.** A permission tested when
  Save is pressed is tested at the end of an audit somebody has walked a plot
  to fill in — the same mistake as the save that was the only thing asking
  whether a login could save at all. So the FORM refuses to open, and the
  save asks **again**, because a form opened before a permission changed is
  still sitting on the screen. `editMode` is what decides which of the two
  ticks a save needs.
- **Delete is its OWN tick**, and it was half of Edit for a day. Correcting a
  figure somebody keyed and removing the morning it was recorded for are
  different acts with different consequences — the same argument that gave
  `delete` its own box on the FC Portal's Maintenance — and the office asked
  for the two apart. It is asked **beside** the admin test rather than
  instead of it, in both the confirm and the modal's own Delete button, which
  is reachable on its own. On Papan Tanda, deleting a BATCH takes its linked
  audit with it, so that one asks `delete` too; editing a batch row asks
  nothing, because a batch record is not an audit.

  **A ROW SAVED BEFORE THE SPLIT ANSWERED THE OLD TICK.** It carries `edit`
  and no `delete`, and there are only three things that can mean: read the
  absent key as OFF and a deletion is taken from somebody nobody closed; read
  it as ON and one the office deliberately closed comes back; read the OLD
  key and you have what they actually answered. Only the third is true, and
  it holds until somebody saves that row again on either screen.
  `fallbackTo:'edit'` on the action is the declaration, and **three readers
  honour it** — `canAuditAction` on the phone, `modPage` in
  `scan_user_access.html`, and `effectiveActions` in
  `shared_module_access.js`, which is the audit module's own screen. A screen
  drawing `delete` unticked over a gate that allows it is the worst kind of
  wrong, because it looks configured; section 8 of the test drives two of
  the three against each other on the same saved rows and asserts the third
  still carries the line.
- **It fails open.** No entry for the page is nobody having been asked, an
  absent action key is the same, and only an explicit `false` is a no. A page
  the office has closed closes every action inside it, there being nothing
  left to do on it.
- **The refusal names the screen that would switch it back on**, in both
  languages — a button that does nothing is reported as a broken app.

Two traps found doing it, both worth keeping:

- **`openForm` and `saveAudit` in `audit_maintenance_script.js` declare
  `const t = tasks.find(…)`**, which SHADOWS the translation function `t()`
  for the whole of their scope — so a `t('…')` before that line is a
  `ReferenceError` and not a message. `_mtSay()` is said from file scope,
  where `t` means what it means everywhere else.
- **`audit.mjmnursery.com` is a machine-written MIRROR** of `audit/` and its
  own README says so: edit here, bump `VER` in `audit_sw.js`, and the mirror
  follows. Every page's `?v=` on the six changed files moved with it, or a
  gate written today reaches a phone next month.

`tests/the_audit_ticks_are_obeyed.cjs` drives the rule through the SHIPPED
`audit_supabase.js` and holds all four modules to the same five places.

**And the `?v=` on this module carries a revision LETTER** — `20261012e`,
`20261022a` — which a digits-only `(\d+)` reads as `20261012`, so two
different versions compare equal and a check passes over a page asking for
yesterday's file. The test matches `[0-9a-z]+`. Worth knowing before writing
any other check against these numbers: **somebody else may have bumped them
the same day**, so the next letter is the one above everything in use and
not simply `a`.

## The Work list belongs to the system RAISING the case

The office set "Request Transplanting Signboard" up under **FC Portal** on
Case Routing, with a rule reading *solved by Admin Portal · Admin 2*. Then
they opened the Nelos dock **on the FC Portal**, chose to give the case to
Admin — and the title was nowhere in the Work list.

Both raise forms filled Work from the **destination**: pick Admin and you
were offered ADMIN's own titles. So a title filed under the system that
raises it could not be raised from that system at all, and the one list that
did contain it was the list for the system it was being sent to. The screen
that files titles under the system that raises them, and a form that asked
it the other way round, were two answers to one question.

**And it was worse than a list in the wrong order.** Both forms write
`assigned_module` themselves, and `nelos_route_case()` returns early on a
case that already names its queue — so **every rule on Case Routing was dead
for anything raised from a form**, which is nearly everything. The rules only
ever reached the cases a module raises in code. A setting saved and not
obeyed, in the one screen whose whole job is to say where work goes.

So:

- **The list is the raising system's** (`workList()` / `mine` in the Mobile
  copy), falling back to the destination's only where the raising system has
  no titles of its own — which keeps the hub working, since a case raised
  from `index.html` has Nelos itself as its source.
- **The destination falls OUT of the work.** Choosing it reads the rule the
  way `nelos_route_case()` reads it — the category's own first, then the
  section default — and fills in the system and the PIC. Changing either
  afterwards still overrides it for that one case, which is the whole reason
  those two selects are still there and not a line of text.
- **WORK is asked first**, because the destination now follows from it.
  Asked after, the form would move an answer the person had just given.
- **The rule is applied on EVERY change of work**, not only the first:
  picking the work is the later act, so it wins, and picking a different one
  moves the destination again.

**TWO COPIES, ONE DECISION** — `shared/shared_nelos_dock.js` and the Admin
Portal's own `Mobile/src/components/NelosNewCase.jsx`. The dock already said
so in its own comment ("one form on every surface, so keep the two in step")
and the two had drifted into the same fault rather than apart, which is the
only reason this was one fix. `tests/the_work_list_is_the_raising_system.cjs`
lifts the real `routeFor` out of the shipped dock and holds both files to it.

**The dock is loaded with no `?v=` on 49 pages**, the same exposure
`shared_cf_select.js` has: a browser holding yesterday's copy keeps it until
one hard reload.

## A case category is retired, never deleted — and adding it back revives it

The office asked for a cross on each row of Case Routing: *"i want to delete
request transplanting signboard category, i click x then this case category
gone."* It is gone from everywhere it was offered — both raise forms ask
`active=true` — and the row is marked **inactive**, never removed.

**A case keeps its category as TEXT.** `nelos_cases.category` is the NAME and
not a key, so retiring a title cannot orphan or rewrite one case ever raised
under it. A DELETE would say the same thing to those cases and a different
thing to the register, which is the one place recording that the title
existed at all. Same rule as the rejected signup and the admin-closed plot.

Four things in it:

- **The confirm says what it MOVES.** It counts the cases already raised
  under the title and says they are kept. A count that cannot be read says
  so rather than reading as nought — "no case has ever been raised under it"
  over a category with forty is the one sentence that would make this the
  wrong decision.
- **A category the SYSTEM raises by itself cannot go from here.** The words
  on Automate Cases are the module code's and are read, never set, so taking
  the row off this screen would not stop the case arriving — it would hide
  the category it arrives under. The cross is disabled and its tooltip names
  the condition. `auto_condition` is what says so, and a database that has
  not run `migration_nelos_auto_conditions.sql` answers empty, which leaves
  every cross live: the safe way round for a page whose job is to be edited.
- **The routing rule is LEFT ALONE.** A rule for a category nobody can raise
  matches nothing, so it costs nothing where it sits — and the day the title
  comes back, its rule is still set the way the office left it.
- **The permission is asked AGAIN at the write**, because a cross drawn
  before somebody's access changed is still sitting on the screen.

**And ADDING the same title brings it back.** The unique index is
`(module_key, lower(name))` and takes no notice of `active`, so an insert
over a retired row comes back 23505 — and the page cannot see the clash
coming, because it only ever loads the ACTIVE ones. So the Add box looks for
a retired row first and switches it back on, which also returns its old
routing rule rather than leaving the office with a rule they cannot see and
did not set today. It comes back under the spelling it FIRST had, not the one
somebody happened to type the second time.

Two things the test had to learn, both of which make a stub lie:

- **`esc` on that page IS `MJMNelos.esc`.** A stub of `shared_nelos.js`
  without it takes the whole render down with *esc is not a function* —
  caught by the boot's own try, which then bounces to the portal, so the
  symptom is a blank page and not an error. A thinner stub than the thing it
  stands in for is the fault this file has a heading about.
- **The eqs arrive AFTER the patch.** The page writes
  `.update({…}).eq('name', …)`, so a stub that applies the write inside
  `update()` has no idea which row it is for. It applies at read time — and
  it has to apply at all, or a revive and a second insert read the same.

`tests/a_case_category_can_be_retired.cjs` drives the real page and asserts
no DELETE is ever sent. **`nelos_user_setting.html` now carries the three
no-cache metas**, for the reason every settings page that is being changed
needs them.

### The fourth time: Open Setting was written, shown as set, and read by nothing

A normal-level user was granted **Open Setting (piece rates, plots,
workers)** on the Nursery Maintenance module. It saved, it drew as ticked
on User Access afterwards, and she opened the page to find no Setting tab
at all. *"Why i allow this user to access the open setting but this user
still didnt see anything from her side?"*

Because the Setting tab asked ONE question — `isAdminOf('nursery_ops')`,
the module LEVEL — in all four of its gates: the tab button, `switchTab`,
and the two piece-rate writes. A tick that is not a module level could
never move any of them, so `nursery_ops_actions.maintenance.setting` was
written by the access screen and read by nothing at all.

`maySetting()` in `plot_maintenance_script.js` is the read now, and the
rule it obeys is the SCREEN's own — `effectiveActions()` in
`shared_module_access.js`:

- **A saved row is authoritative**, and for an admin too. An admin the
  office has deliberately unticked is a decision, not an oversight, and a
  screen drawing a tick off over a gate that allows it is the worst kind of
  wrong, because it looks configured.
- **No saved row is nobody having been asked**, so the module level decides
  — what governed this before the tick existed. **That is the case a plain
  `canDo()` gets wrong**: absent means yes to every action there, so
  switching the gate to it would have handed the piece rates to every
  normal user nobody has configured. `adminOnly:true` on the action in
  `nursery_ops_user_access.html` is the other half of that sentence.
- **It does NOT fail open.** Failing open is right for a door somebody
  already held; this is the money side of the module, and unreadable
  permissions fall back to the module level — which is false when the
  access load failed, the same safe default the tab has always had.

**`isNopsAdmin` answers two OTHER questions and both were left alone** —
overriding a locked DO, and handing out culling incentive. Widening the
flag instead of adding a function would have given those away to anybody
ticked for piece rates, which is not what the tick says.

`tests/the_open_setting_tick_is_obeyed.cjs` drives the same six saved rows
through BOTH readers, lifted out of the shipped files, and fails where they
disagree. On the previous code it says it in the office's own terms: *the
screen draws true and the page opens false*. It also runs against a version
that has no `maySetting` at all rather than throwing — what the previous
code DID is the whole argument for the change.

### And then the office opened the tab and said 我没看到

Obeying the tick is what made the LABEL worth reading, and the label was
wrong on two of its three words. It said *Open Setting (piece rates, plots,
workers)*, which is what the tab held when it was written. The tab holds
**three sections and nothing else** — Plot Capacity, the Chemical List and
the Fertiliser List — because:

- **the PIECE RATES moved to Payroll → Settings → Piece Rate**, on that
  screen's own `rates` permission, and
- **the WORKERS come off the payroll register** through the Worker System
  board; `_localWorkers` on this page is only a fallback and its remove
  button is on Worker Record.

So the office ticked it expecting rates, opened the tab, found capacity and
two chemical lists, and went looking for a fault that was not there. **A
label naming two screens a tab does not open is a permission that lies in
the other direction** — the gate obeys it perfectly and the person is still
sent to the wrong place. It now reads *Open Setting (plot capacity,
chemicals, fertilisers)* and its description says where the rates are.

**And two of the four gates repointed above are DEAD CODE.**
`renderRateActions` draws into `#setting-rate-actions`, which occurs
**nowhere** in `nursery_ops_maintenance.html`, and its only caller
`onRateInput` is called by nothing — so `savePieceRates` and
`unlockPieceRates` are unreachable from that page. The fix still worked,
because the tab button and `switchTab` are the live two. What it means for
the paragraph above is one correction: *"this is the money side of the
module"* is no longer the reason the gate fails CLOSED. The reason that
stands is that the tab sets the plot capacity and the chemical lists, which
is what every dosage on the schedule is worked out from — wrong in a way
nobody keyed.

Worth knowing before touching the test: its section 5 used to allow 900
characters between `key:'maintenance'` and `key:'setting'`, and the comment
explaining all of the above pushed them apart — **a check about the KEY
failed on a change that altered nothing it was about**, which is the
pin-the-spelling trap this file already names. It slices the page's own
block out and asks whether the key is inside it.

## Closing many Solved cases is ONE write, and only of what is still Solved

*"我要可以一次过close 多多case"*. On the Nelos **Solved** tab, for a login
that may close, each row carries a box in its Created cell (not a column of
its own, so the grid of the other tabs does not move), Select all takes
every case the filtered list shows across its pages, and one dialog —
never a `confirm()` — names the cases and takes ONE remark for them all.

- **One update, `.in('id', …).eq('status','resolved')`**, and the count is
  what came BACK. A case somebody reopened or closed since the list was
  drawn is theirs and is left alone, and the toast says how many.
- **A tick only stands for a row the list can show.** Leaving the tab, or a
  filter taking a row off, drops it, so Close cannot reach a case nobody
  can see ticked.
- Same `close_remark` fallback as closing one case.

`tests/close_many_cases_at_once.cjs`.

## A permission that is saved but not obeyed is worse than no permission

It has happened four times in this codebase now. A screen writes a setting, the
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

## A customer is never let in, and an unread profile is never full access

The owner, in one line: *"all staff system. customer only can see sales web
and customer portal."* A Sales Web customer is an ordinary Supabase login
whose `shared_profiles.user_type` is `'customer'` — same project, same
password box — so nothing stopped one signing in here, and several doors
then failed OPEN on top of it: the hub drew every tile for a profile it
could not read or that had no row, `shared_access.js` skipped its gate when
the read failed and nothing was cached, and the audit sign-in wrote
`mjm_user` for anybody the password box accepted.

`shared/shared_staff_gate.js` is the ONE rule, asked on sign-in and on every
load with a session, and every door calls it rather than keeping a copy:

- **customer** (read OK) → signed out, this device forgets them, and the
  page shows only the refusal. A sessionStorage flag carries the refusal
  across the redirects a sign out sets off.
- **no row, or no staff access** (read OK) → the door's own Pending
  behaviour. `hasStaffAccess(null)` is **false** now.
- **read failed** — a returned `{error}` counts exactly like a throw → the
  last profile THIS DEVICE was given for THIS USER ID; with none, "could not
  check" and a Retry, **session kept**. Offline use still works for anybody
  who has signed in on that device before.

This is different from "access fails open" above: that is about a STAFF
member nobody has configured a tick for. An unknown PERSON is not staff.

Every page that loads `shared_access.js` loads the gate file just before it;
the hub, `mobile/` and `audit/audit_index.html` load it themselves, and
`audit_login_guard.js` / `refreshAuditPermissions()` refuse a cached or
freshly-read customer. `tests/customers_cannot_enter_the_staff_system.cjs`
drives the real pages. Row-level security is still what actually protects
the data; this is the screen agreeing with it.

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

## A drone map POPS OUT, and the tab it printed from goes with it

The thumbnail on the Transplanting by-plot table used to open the picture as
a whole page of its own, and the office asked for the lighter thing: *"我按
的时候pop out就好 不用整页"*. They are right about what the press is for —
looking at a map there is a GLANCE (which plot is this, does it match the
record), and a page of its own turns a glance into somewhere to leave and
come back from.

**WHAT THE NEW TAB WAS REALLY FOR IS THE EASY HALF TO LOSE.** The tab was
never only a bigger view: it is where the browser PRINTS, and the reason to
want a drone map at all is to stand in the plot holding it. The old comment
in `mapCellHtml` said exactly that and it is still true, so:

- **The pop-out carries Open in a new tab**, which is the printing door.
- **The thumbnail is still a real `<a href>`** with its `target`. A
  ctrl-click or a middle-click opens the file as it always did, `openMapBox`
  steps aside for a modified click, and on a page where the script never ran
  the press itself still reaches the map. The pop-out is an enhancement over
  a link that works, not a replacement for one.

**A PDF MAP IS NOT POPPED OUT.** The browser has a reader for one, with its
own print and page controls, and a PDF handed to an `<img>` shows nothing at
all. It keeps the tab and wears the document glyph it always wore, so the
two do not look alike while behaving differently.

Three smaller things, each a way this goes quietly wrong:

- **It is sized to the WINDOW, not to `.modal`.** That class is 540px wide
  because it is a form width, and a map in a column of form controls is the
  thumbnail again only bigger. The picture is `contain` and never `cover`:
  the edge of a plot is the part somebody is comparing against what is in
  front of them, and a crop takes exactly that away.
- **The picture is dropped as it CLOSES, and that is done in `closeModal`**
  rather than in the handler — there are three ways out (the cross, the
  backdrop, Esc) and a picture left behind on one of them flashes up under
  the next plot somebody opens, for as long as the new one takes to arrive.
- **Esc closes the MAP and nothing else.** It is the one dialog on that page
  holding no keying, so shutting it costs a press to reopen; Esc over a half
  filled form is the work gone. The other four are deliberately not on that
  listener.

`tests/transplant_by_plot.cjs` drives the real page, and the check the
office actually asked for is **the absence of a tab**: it clicks the map and
WAITS on `popup` the way the PDF check does. The first version gave it 120ms
and passed over the previous page, which opens one every time — the PDF's
own tab takes up to a second and a half to arrive, so a short look proves
only that nothing was quick. Five of its checks fail on the previous page.

**And the fixture's `MAP_PNG` is 8 × 8**, which is right for a test about
attributes and wrong for looking at the thing: a screenshot taken against it
shows a dot in a collapsed band and reads as a broken layout. Swap it for a
real-sized picture before judging the sizing by eye — and remember the route
rule while doing it, because `files.test` is already routed further down
`boot` and **routes match in REVERSE registration order**, so a second one
added above it never fires.

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
**`nursery_ops_maintenance.html` now carries them**, and the day it was
written up as the one to remember is the day it needed them: the office asked
for the dosage box and the Save button on the Setting tab, and without the
metas that page would have gone on asking for the old `?v=` for ever.
**`nursery_ops_user_access.html` now carries them too**, for the same reason
one page along: the tick list lives in that page, so a cached copy goes on
offering yesterday's labels — and the label on *Open Setting* was the thing
being corrected. **Five pages are still unguarded** — the two PALMS pages,
Life of Plot, `operation_delivery.html` and `operation_settings.html` — and
the test prints them every run, so do not trust the list in this paragraph
over the one the test gives you.

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

## The audit module has two halves, and they were one door

`audit_home.html` is the **auditor portal**: a to-do list built for a phone
held in a nursery, overdue rounds on it and nothing else.

`audit_admin.html` is the **back office**: what is scheduled this month and
how far through it each nursery is, the cross-nursery alerts, the four module
cards, the monthly report and Settings. A desk screen.

One door led to both and **which one you got depended on who you were**. An
audit admin pressing *Audit Portal* on the 555 MJM Team page — a door whose
own label reads *"Plot audits & sign-off"* — landed on the desk screen, and
had to navigate out of it to reach their own list. Signing in at the auditor
login did the same thing. A door that means two things is a door half the
people who press it are wrong about.

So the back office **moved out** and became a hub module of its own,
**Nursery Audit System**, in the Nursery Sector. Each door means one thing
now:

| door | goes to |
|---|---|
| hub tile *Nursery Audit System* | `audit_admin.html` — the back office |
| 555 MJM Team → *Audit Portal* | `audit_home.html` — the to-do list |
| auditor sign-in (`audit_index.html`) | `audit_home.html`, for everybody |

Four things about the move, and the first is the only one that could have
hurt anybody:

- **Nobody lost a route.** The tile is gated on the SAME `audit` module the
  portal has always used, so everyone who used to be sent to the back office
  still reaches it. `audit_admin.html` asks only for a signed-in audit
  session — deliberately, its own comment says why: the four module cards
  live there and a plain auditor needs them — so the tile is a door and not
  a wall, and a plain auditor sees it too.
- **Hidden until granted.** No `data-module-open` on this card, because it
  opens a back office: an unset answer closes it, where an unset answer on a
  long-standing harmless tile would take it away from everybody. The
  `data-card` is **`auditsys`**, not `audit` — the old `555 Audit Portal`
  card was `audit` and `mjm_team_portal.cjs` asserts it has not come back.
  They are different halves of one module and must not be confused.
- **`auditLanding()` stopped reading the module level.** It used to send an
  admin to `audit_admin.html`; it returns `audit_home.html` for everybody
  now. `applyLandingScope()` still runs for everybody — that one is about
  WHICH NURSERY, not which page.
- **`scan_admin.html` had no no-cache metas** and carries every line of its
  own code inline, so the page IS the deploy and a cached copy is the old
  routing for ever. The routing was the first thing that changed in it. It
  has the three now. One hard reload per machine.
- **"Visit 555 Auditor Portal" came off the back office**, and the office
  asked for it in the same breath. It was the way ACROSS, from when this
  page was the back door OF the portal and an admin landed here by signing
  in; once the portal has doors of its own, a button pointing at it from the
  back office is the one thing still saying the two are one place. The note
  under the module cards lost its "…and can open the auditor portal" for the
  same reason, and `.portal-btn` / `.pb-home` / `.pb-out` went with it —
  a style nothing wears is a style the next person spends five minutes
  looking for a use of. The ribbon's **Portal** link stays: it reaches the
  hub, which is where both doors are, and a back office with no way out is
  a room and not a page.

`tests/the_audit_system_is_its_own_module.cjs` drives the real hub and the
real MJM Team page. Two things it had to learn, both of which make a gate
test pass for the wrong reason:

- **Tailwind comes from a CDN the harness refuses**, so every card measures
  0×0 and `isVisible()` answers false for all of them — a hidden-tile check
  that passes whatever the gate did. It reads the inline `display` the gate
  WRITES instead.
- **The hub reads its profile with `.maybeSingle()`** and gates inside the
  `onAuthStateChange` callback. A mock without `maybeSingle`, or one whose
  subscription never fires, leaves `perms` null — and the hub fails OPEN, so
  every tile shows and no gate assertion can fail. A login holding `none`
  everywhere is refused the hub altogether and never reaches the gating at
  all, so that fixture has to hold some other module.

And one more, about asserting a removal: **a page that explains what it
removed will contain the words.** The comment where the Visit button stood
names the button and the three rules, which is exactly what that comment is
for — and a plain text search read it as the button still being there. The
test strips the comments first and asks about the markup the browser gets.

### And then the portal gave up its door too

The back office lost its way across first. The portal kept its ribbon back
arrow — out to the MJM AI hub, or to `audit_admin.html` for an admin, aimed
at run time by `aimBack()` — and the office asked for that to go as well:
*"remove the back button in auditor portal. so the auditor portal will
become an individual webpage. It only link the data back to auditor portal
manage webpage."*

So **neither page now carries a door into the other**, and that is the whole
shape of it. What joins them is the DATA: every audit saved on the portal
lands in the back office — its history, its alert board, its monthly report
— and that is the half that matters. A link was only ever the thing still
saying the two are one place.

Three things in it:

- **THE LEFT CELL STAYS, as `.fcr-spacer`.** The ribbon is
  `grid-template-columns:1fr auto 1fr` with the brand `justify-self:center`
  in the middle cell, so the empty cell is what balances the right-hand
  cluster and keeps the wordmark on the bar's real centre line. Delete the
  anchor outright and the brand becomes the first grid item and slides
  left; `display:none` collapses the cell and does the same. **This was not
  invented** — `audit_admin.html` has carried exactly that span since it
  was written, with a comment saying why, and the mobile rule
  `.fcr-spacer{grid-area:1/1}` already existed. Copy the page that already
  solved it.
- **WHAT IT COSTS.** An admin standing on the portal reaches the manage
  page through the hub tile *Nursery Audit System*, not from here. One door
  per page is the point of it, and it is the same trade the back office
  already made.
- **`aimBack()` is now a no-op on everything that renders.** It guards on a
  missing anchor and returns, and the only markup left is on
  `audit_nursery_select.html`, which redirects in its own head and never
  draws. It stays because that forwarder could be un-cancelled — but its
  comment now SAYS it is dead, because a comment asserting a live rule over
  code that cannot run is how the next person spends an hour.

`tests/the_portal_is_a_page_of_its_own.cjs` holds all of it and strips the
comments first, for the reason the section above names — the comment where
the arrow stood quotes the office's own sentence, which a plain text search
reads as the arrow still being there. Four of its checks fail on the
previous code. It also asks that **no other anchor** on the page leaves for
the hub or the back office: an arrow removed while a pill elsewhere still
leaves is not a page of its own, which is the thinner-copy fault this file
is full of.

**`audit_sw.js` precaches `audit_home.html`** — `VER` moved to
`mjm-26102801` — and `audit_ribbon.js` changed, so its `?v=` moved on all
**four** pages that load it, not only the one being edited. Two of them
were still on `20260824b`, which would have gone on serving the old file.

## System Setting governs BOTH portals, and it was filed under one of them

Location, Portal View & Function and Boundary decide what the **555 FC
Portal and the 555 Worker Portal each offer** — the switch table has a
column for each, side by side, which is the whole point of it.

It sat two doors down all the same:

    555 MJM Team → Settings → FC Portal Setting → System Setting

so the page that decides what a WORKER sees was filed under the conductor's
own Setting, and nothing on either screen said why. The office handed over
the outline of it and asked for it on the MJM Team settings — *"actually is
previous fc portal and worker portal's system settings, moving out from
there"* — and then, seeing it as a section among four others, asked for the
presses in between to go as well: *"remove all this and remain the system
setting only. make it straight view the system setting webpage when i
clicked setting, no need click the button like this."*

**So the Settings tile opens the page itself**, and the two pages that stood
between them were deleted. **Neither held anything of its own**, which is
what made that safe and is the reason the stack existed at all —
`scan_settings_hub.html` was five sections of doors to doors:

| hub section | led to | already on the Team page |
|---|---|---|
| FC Portal Setting | `scan_setting.html`, whose only tile was User Access | **User Access**, its own tile |
| Worker Portal Setting | the phone app's own settings | the **Worker Portal** door |
| Admin Portal Setting | mobile.mjmnursery.com | the **Admin Portal** door |
| Auditor Portal Setting | `audit_admin.html` + `audit_user_access.html` | the **Nursery Audit System** hub tile, which reaches both |

**Check what a page holds before deleting it, and check who links IN.**
`scan_user_access.html` carried TWO Back links to `scan_setting.html` — one
on the page and one on its Access Denied card — so removing it without those
would have put a 404 on the way OUT, which is the worst place for one. They
go to `scan_admin.html` now, which is where User Access is opened from.

Four things in it:

- **The labels are the office's own**, off their outline: **Scan Barcode
  Counter** and **Issue Collection DO**, not Scan and Delivery Order. A row
  headed one word in the office and another on the screen that governs it is
  a row somebody has to ask about. `CANNOT_YET` carries the same two names,
  or the hover disagrees with the row it is on.
- **THE KEYS DID NOT MOVE.** `scan` and `do` are what is stored, and a label
  that took its key with it would read every tick the office has ever set as
  unset. The test asks for the key set by name and not only for the labels.
- **Settings is still in the Worker column**, though it is not on the
  outline — that outline is the FC PORTAL column, and absent from one column
  is not the same as gone.
- **The Settings TILE hides for a non-admin.** `scan_system_setting.html`
  asks for scan ADMIN and bounces anybody else to the phone app, so a login
  holding only the `setting` area saw a tile that threw it somewhere else. It
  hides on the same test its destination applies, asked one step earlier.
  That check first lived on the hub; the hub is gone, **the check is not**.
  Nobody gains anything: the page still decides.

**And the way out follows the way in**, every time one of these moves. The
back link on `scan_system_setting.html` has now been repointed twice — off
`scan_setting.html` when it moved to the hub, off the hub when the tile
started opening it directly. A back link left on the old parent drops
somebody on a page they did not come through, and once that parent is
deleted it drops them on a 404.

`tests/system_setting_is_not_the_fc_portals.cjs` drives the real pages. Three
things it had to learn:

- **`innerText` returns CSS-transformed text** — the trap this file already
  names — so `SYSTEM SETTING` came back where `System Setting` was written
  and four correct checks failed. It reads `textContent`.
- The function cell carries the stored KEY beside the label, so the list of
  names is read off `.pt-name` and not off the cell.
- **A hidden-tile check passes for free on a page that never drew.** The
  non-admin fixture was bounced off `scan_admin.html` entirely, so "the
  Settings tile is not shown" was true of a blank screen. The fixture holds
  `manage` to get IN and `scan: normal` to not be an admin, and the test
  asserts another tile IS drawn before asserting this one is not.

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

### And the skin is what sits in the row now, so it is what has to be SIZED

The second way that bargain comes due. A rule written for a bare `<select>`
goes on being read, matches the hidden element, and paints nothing — while
the thing the person is looking at is sized by something else entirely.

The Setting tab's **dosage cell** holds two controls in 112px: the number and
the unit it is in. That was right while the unit was a bare select about 50px
wide. The skin's wrapper carries **`width:100%` INLINE** — it says in its own
comment why it has to be inline — with an ordinary shrink factor, and the
number box is `flex:1`, which is **basis 0 and therefore never the one that
shrinks first**. So the wrapper took 86 of the 112 and **the number box was
left at 22px: its padding, its borders, and no room for a digit at all.** It
overflowed the cell as well and clipped the left edge of Covers beside it, so
the office screenshot showed a preset of 800 reading **300**.

Three things to take from it:

- **An inline width is beaten by `!important` and by nothing else.** The
  first attempt set `flex` alone, reasoning that a flex-basis overrides
  `width` inside a flex container. That is true, and the office looked at the
  same sliver afterwards and said *"still the same"* — so the reasoning is
  not worth the risk of being subtly wrong twice about which of two
  declarations wins. Both are pinned now
  (`flex:0 0 52px !important; width:52px !important`) and the row cannot be
  argued out of its shape. **The number box also carries its own
  `min-width`**, so it can never collapse again whatever shares the cell
  with it.
- **The office asked for it as a RELATIONSHIP** — bigger number, smaller
  unit — so the test holds it as one, beside the pixel floors. A rule phrased
  only in pixels invites the next person to shave the number column for
  something else with both numbers still passing.
- **`.lst-dose select { … }` is not dead, and must not be deleted.** It is
  what the row falls back to if the skin fails to load.
- **The skin's button is 39px where the inputs are 37.** Two pixels, in every
  row of both lists, which reads as one control out of line. `.lst-row
  .cf-btn` sizes it to its neighbours.

**Any page with a select sharing a cell with something else has this**, and
only this one has had it done.

### A disabled button that looks enabled is a button somebody presses again

The other half of the same report, and the more instructive one. The office
said *"the save button not functioning well. I need to click many times only
then it saved."*

It was not dropping clicks — one press has always called `saveChemEdit` once,
and the real page proves it. The fault was that **a press changed nothing on
screen.** Save disables itself and Cancel for the length of the write, and
there was **no `.btn:disabled` rule in the whole stylesheet**: same green,
same shadow, same pointer. Behind it the write was **one round trip per row**,
in a `for` loop with an `await` in it — eight chemicals is eight, end to end,
plus a delete, an insert, the preset and a read-back. Seconds of a screen that
looks exactly as it did before the press is indistinguishable from a dead
button, and the person does the only thing left: press it again.

Three parts to the fix, and the first is the one that matters:

- **Say it.** `.btn:disabled` greys and takes the pointer away, and
  `holdSaveButtons()` puts **Saving…** on the primary button, restoring the
  label when it lets go. A button that reports its own state cannot be
  mistaken for a broken one.
- **Send the rows together.** They are independent rows keyed by id with no
  order between them, so `Promise.all` turns eight round trips into one wave.
  That made `columnFallback`'s retry **concurrency-unsafe**: it kept ONE
  `dropped` set and read a column already in it as "I stripped that and it
  still failed", which is right in a queue and wrong the moment two calls
  meet the same missing column at once — the second would report an error
  over a database that is merely behind. What has been tried is now kept
  **per call**; `dropped` stays for the sentence at the end naming what the
  database would not take.
- **`try { … } finally { done() }`.** The body was unguarded, so a throw
  anywhere in it left Save AND Cancel dead with nothing saying why, and the
  only way out was a reload, which loses the edit.

`tests/the_dose_box_fits_a_number.cjs` drives the real page and holds all of
it — 12 of its checks fail on the previous code, and the dosage one fails
with the office's own number: **0 pixels of room for a digit.**

### A menu that opens past the foot of the window is a list with no bottom

The third way that bargain comes due, and the worst of them: the office
opened Source Tray on a draft card near the bottom of the screen and said
**看不到full** — four trays of thirteen, and nothing they did brought the
rest up.

**`.cf-menu` is `position:absolute` under its button, so every scroller
above it can cut it off — and a FIXED one cuts it off for good.**
`operation_batch_detail.html` scrolls inside `.modal-backdrop`, which is
`position:fixed; inset:0; overflow-y:auto`. So the tail of the menu hung
below the window and there was no way to reach it: **scrolling moves the
BUTTON by exactly the same amount**, so the menu rides down with it and
never comes up the screen, and at the end of the document it cannot move
at all. Measured on the real page, the menu ran to **1,335 on a window of
1,200**.

The flat `max-height:260px` could not help and was never the cause — **the
cut is below the window, not inside the menu.** It also meant a dropdown
on a 1,200px screen showed six rows while 900px of room sat under it.

So `placeMenu()` measures the room when the menu OPENS, and four things in
it are each the shape of a way this comes back:

- **The clip is every ancestor that clips, not just the window**
  (`clipBand`). A menu inside a scrolling panel is cut at the PANEL, and a
  height measured off the window alone would hang out of it exactly as
  before. **BODY and HTML are skipped**: a page whose scroller is a fixed
  overlay leaves the body at zero height, which would read as no room at
  all and collapse every menu on the page.
- **It opens UPWARDS where there is more room above** (`.cf-up`), which is
  the only answer for a row at the very bottom — there is no height that
  fits under it. Thirteen trays now draw in full, 490px of them, above the
  button.
- **It is re-measured while it is OPEN**, on a captured `scroll` and on
  `resize`. The menu moves with its button, so a height worked out once
  goes stale the moment anybody scrolls — and stale in the one direction
  that puts it back off the foot of the window.
- **A button scrolled out of sight CLOSES it.** The menu is anchored to
  that button, so it otherwise goes on hanging where the button now is:
  off the screen, or floating over a part of the page with nothing saying
  what it belongs to.

Two smaller things:

- **The 260px stays in the stylesheet as a fallback**, for a menu drawn
  before any of this runs. It is not a second copy of the rule.
- **`.cf-menu` sets its own `box-sizing:border-box`.** Tailwind's preflight
  was the only thing setting it, so on a page whose CDN had not answered
  the max-height meant the CONTENT box and the menu stood 10px taller than
  the room it was given — which is exactly the margin this rule is about.

`tests/the_tray_list_is_not_cut_off.cjs` drives the real page with the
office's own thirteen trays; **11 of its 26 checks fail on the previous
skin**, and section 2 drives the old flat 260px directly to show what it
cost.

**And this is the one page of the 53 where the skin carries a `?v=`.** It
is loaded bare everywhere else, so a browser holding yesterday's copy keeps
it until a hard reload — and this fix had to reach the office on the page
they were looking at. That page has the three no-cache metas, so asking for
a new number there is enough. Bump it in the same commit as the file.

## One card per plot per day, and two people fill it in

Tab 3 was one flat row per TRAY. Two trays into N15 on the 17th therefore
read as two unrelated records with the plot and the date repeated down the
side of both — and the one figure the screen never showed was the one the
office needed: *"一个 plot 只会有一个 drone map，里面的 drone count 是 total
要 check 对不对还要自己 manual 加起来 … N15 的 drone map 是 1057 但是我看不到
N15 总数."*

So a card is **one plot on one day**, the total is on it, and the drone count
sits beside that total.

**THE CARD IS A VIEW, NEVER A ROW.** Every tray keeps its own ledger row,
because the tray is what the D-Tone split, the tray stock and every
adjustment read. The office set the bar for the whole change in one sentence
— *"完全不要影响其他 link 者的东西如何去 read data"* — and the cards obey it
by construction: the grouping is in the renderer, and the form's tray lines
are still `.action-row.transplant-row` carrying `.t3-date`, `.t3-dest-type`,
`.t3-dest-plot`, `.t3-source-tray` and `.t3-qty`, mirrored in from the card's
head as hidden inputs. The save, the allocation engine, the over-draw check
and the silent rows a sync rebuilds all read exactly what they always read.

**The DRONE COUNT and the MAP are the checker's, on the card.** Two people
fill this in — *"一个负责填所有资料，一个负责算 drone count，和 system tally
了 upload 图并且 verify"* — so the form asks neither, and the card asks both.
The count lives in the REMARK of a `Transplant_Card` row with
`quantity_change` at nought: the column may be NOT NULL, so a card with no
count yet could not be written at all, and a figure in `quantity_change` is
a figure some future reader sums — this one is what a drone saw, not
seedlings that moved.

**VERIFY IS NEVER LOCKED.** A count that does not tally is shown, signed and
does NOT go on the To Do List — 可以签 不用丢 todo. Saying so is the point of
the card; refusing the signature would make the figure unsayable.

### A card from before the rule reads as tallying, and it is SHOWN, never stored

An old card has the drone PICTURE and no NUMBER — the count only ever lived
inside the map, and nobody ever typed it. Left alone every record the nursery
has ever made would read "not counted yet", which is a prompt nobody can act
on against work that was checked at the time. The office settled it: *旧卡的
DRONE CHECK 就 = total transplant 就好.*

**It is shown and never written.** A default written into a saved row turns a
question nobody was asked into an answer, and it would make a figure the page
invented indistinguishable, for ever, from one somebody read off a picture.
`T3_DRONE_FROM` is the line, and it is the INSERT time rather than the day
the work was done: the question is whether this record existed before the
rule.

### A card is signed when EVERY one of its trays is

A sign-off used to be keyed on the tray — `transplanting::N15|main|P24|2026-10-17`
— and a card is keyed `transplanting::N15|2026-10-17`. Life of Seedlings cuts
that key at its first bar and has always read one tray's signature as the
whole plot being signed, so reading it the same way here looked right.

**It is the right reading of the REPORT and the wrong one here, because it
moves a TICK.** Tab 3 was one row per tray and the tab tick only went green
when every one of them was signed. The ledger was swept rather than argued
about — `CHECK_does_a_card_turn_a_tick_green.sql` — and the answer was **ONE
card in 213**: batch 263, N4 on 22 July, five trays with four signed. The
office had set the bar in a sentence: *以前上面圈圈已经绿色打勾现在也要是绿色
的，如果你弄到变掉那就错了.*

So `_t3TraySig` asks for ALL of a card's trays and answers with the NEWEST,
which is the one the chip should name. `_rowSig` is the ONE way any reader
asks whether a row is signed, `rowsAllSigned` included — a card read as
signed by the tick and unsigned by the strip is worse than either. A
VERIFICATION is not aliased at load; a REJECTION is, because one tray sent
back is a question about the card and surfacing it is the safe direction.

### The census is the recorder's, and only for what is keyed from now on

*"填资料的人在 part 1 要 upload census，检查的人在外面鼠标滑到 total
transplanted 那里 census 就会浮现，按的话就会出现 census，这个 census 可以被
download."* So the census hangs off the TOTAL and nowhere else: the checker is
looking at that figure, comparing it against a drone count, and the census is
the paper behind it. Photo or PDF, more than one file.

**No census, no save** — *"c 一定要有才可以 save"* — and the refusal is the
only thing said about it: *"只是没 census 的话按 save 会 pop out 不能 save 因为
没 census."* No line on the form explaining the rule, no green tick saying it
is satisfied.

**IT REACHES ONLY WHAT IS KEYED NOW.** 以前填的就不需要 — every existing
record, any batch, 271's N15 included, and a card already on the list whether
or not anybody has verified it. The test is not a date and not a batch: it is
whether the tray line sits inside a **draft card**. A line a sync rebuilt from
the ledger is in no card, so the rule cannot reach back over it — and it
cannot be got round either, since the only way to key a new line is to open a
card. Zero backfill, by construction.

Five things in it:

- **Refused BEFORE anything is written.** A save that stored the rows and then
  complained would leave the record in the ledger with no census and nothing
  asking for one again.
- **Uploaded AFTER the rows are stored.** Uploading first leaves files in
  storage for a save that then refused, with nothing in the ledger naming
  them.
- **A failure at that point is a WARNING, never an error.** The report IS in
  the database by then, and `error` on this page means one thing — what you
  keyed is not in the database. Red over stored work is what leaves a tab
  dirty by its own success, and the office keys the morning again. The warning
  names the plot and the door: Add Census on that card.
- **The codec is tab 6's own.** `CensusList:` is written with `t6EncodeDocs`,
  so every field is percent-encoded and neither separator — nor a space, nor
  the colon out of `MapUrl:` — can turn up inside one and split a file into
  three. Two codecs for one job is two things to get subtly different.
- **A card with no census says so and offers one.** `uploadT3CardCensus` is
  the same door a record from before the rule uses, and the list is ADDED to,
  never replaced: a second day keyed against the same plot brings its own.

#### And a panel you can only READ is a record you cannot correct

The office attached the same page twice and found there was no way back:
*添加了的 census 无法被删除 要删除全部才重新 upload.* Two faults in one
sentence, and the second is the one that made the first unanswerable —
**Add Census was on the EMPTY panel only**, so a record whose census was
short of a page, or carried one too many, could be put right only by
clearing it and starting again.

So each file carries a **✕**, and a panel that already has files offers Add
as well. Four things in it, three of them rules this file already has:

- **The cross is a SIBLING of the file, never a child.** The file opens on a
  click, so a cross inside it fires both — the office would remove a census
  and get it opened over the top of the panel. Same rule the rejected signup
  and the audit board's × follow, and a button inside a button is not a thing
  a browser will draw anyway.
- **It is removed BY URL, never by position.** `censusDrop` names the file;
  `_t3WriteCard` re-reads the list before it writes, so an index taken off
  the screen a moment ago can point at a different file by the time it
  arrives — somebody else attaching one in between is all it takes.
- **THE FILE IS LEFT IN STORAGE.** This takes it off the RECORD, which is the
  decision somebody is making. The blob costs nothing where it is, and a
  delete that cannot be undone over a mis-press is the worse failure — the
  rejected signup and the admin-closed plot again.
- **A signed-off report refuses both, in JavaScript.** `.mjm-locked` greys a
  button and takes its pointer away; it does not stop the keyboard and it
  cannot stop a call, which is what an `onclick` is — the lock-in-the-
  stylesheet fault, one screen along. The census writers are not among the
  seven tab saves `_trackTabSave` guards, so `_t3CardLocked()` asks the CLASS,
  which `setTabLock` sets for every reason a tab is not editable. The cross
  deliberately carries no `.mjm-review-allow`, so the paint and the gate agree.

**The stub had to start APPLYING an update** before any of this could be
tested. It recorded them and left the row as it was, so a census removed
redrew exactly as it had before and every screen assertion would have passed
over a page that changed nothing.

**And the map rule had to learn about the card.** `updateTransplantCompletion`
asked each ROW for its map, which was the only place a map could be; it is the
plot's now and the checker attaches it to the card. Asking the row alone would
hold the ring under 100 for ever on everything keyed since, with the map on
screen. `t3CardMaps` is rebuilt by every sync and only ever ADDS — a row
carrying its own `MapUrl:` answered yes before and still does.

### A heading that moved INTO the card left the foot wordless

The office read the bottom of the tab and asked — *这三个是什么 - 1057 1057*.
It said

    TOTAL TRANSPLANTED   2 RECORDS   —   1,057   1,057

which is the Adjustment, the Qty and the Final Qty, in that order, with no
word on any of them. **None of them ever needed one**: while the saved list
was a grid they sat on its tracks, under the tab's own column headings, and
the comment in the markup says why they came off it — *"a total laid out on
their tracks would be lining up with nothing"*, which is right. What that
missed is that the headings went down INTO each card, so the one row still
laid out flat was left with the figures and nothing above them.

So each figure carries its own label, and two things about them:

- **The words are the card's, letter for letter** — Qty, Adjustment, Final
  Qty — because that is what each one totals. A foot that words a column
  differently from the column is a figure somebody has to place.
- **And in the card's ORDER**, which the old row was not: it printed the
  adjustment first, so the two green figures beside each other read as a
  pair and the red one read as a label for them.

The phone row was never in this — it has always said *Total Transplanted*
and *After adjustments* in words, having no columns to inherit.

Five checks at the end of `tests/t3_row_adjustments.cjs` hold it, and all
five fail on the previous markup.

### Three faults the cards left behind, and none was on a test

Each was found by running a test that had never covered the thing it broke,
which is the argument for running the neighbours rather than the ones you
wrote:

- **Fix Tray opened on the ADJUSTMENT.** It read `children[2]`, which was the
  tray while every row carried the plot and the day as well; the cards took
  those up onto the card head, so the third cell became the Adjustment and the
  picker offered **"+140"** as the answer to "which tray". It asks for
  `.t3-tray-cell` by name now, and the test forbids indexing a cell by
  position — after stripping the comments, because the function explains in
  prose what it used to read.
- **The MONTH LOCK on edit and delete answered no every time.** Both handlers
  asked `querySelectorAll('.t3-saved-row')[idx]` whether the record is in a
  locked month. That class is the CARD now and a card never wears
  `.mjm-locked`, so a settled month could be edited and deleted without a
  word. Both read the lock off the tray row the id names.
- **`addTransplantRow`'s drone-map handlers went dead with the field.** Four
  functions nothing called any more — the half-removal this file has a rule
  about. `rowMaps` STAYS and is not dead: a sync restores every existing row's
  `MapUrl:` into it and the save writes it back out, which is the only thing
  that stops a save dropping the map off every record keyed before the card
  had one.

`tests/one_card_per_plot_per_day.cjs` holds the grouping, the old-card tally,
the all-trays signature (batch 263's shape) and the month lock;
`tests/add_record_asks_for_the_census.cjs` holds the form, the census and the
map rule. Two things that make these tests lie if they are written the easy
way:

- **A stub that swallows a write signs off whatever the page sent it.** The
  card test's `insert` resolved silently, so "drawing the old cards wrote
  nothing" would have passed over a page writing on every load. Every write is
  recorded now.
- **`_uploadBatchDoc` hands a URL back unchanged and that is not an upload.**
  A save re-sends the drone map of every existing row, already a storage url,
  so a stub that re-uploads it counts three uploads for two census files and
  hands a plot a map it never had.

**Nothing to run in the database.** `Transplant_Card` is an ordinary
`shared_inventory_logs` row — there is no CHECK constraint on
`transaction_type`, which was measured and not assumed — and the census files
go into the `documents` bucket the drone maps already use, under
`transplant_census/`.

## A seal is checked in the database, never only on the phone

Seal stickers ("0009297") go through four states — **in stock** (received at
UNN 1 on the Mobile Seal page), **pending collection** (allocated by a
consent: the start and end of each range are scanned on Mobile Consent),
**scanned** (each seal scanned at collection in the FC Portal) and
**collected** (on a DO). `shared/RUN_ME_seal_management.sql` is all of it.

**The rules live in triggers**, because the phones work offline and a check
that only runs on a phone with signal is a check that sometimes does not run.
A phone WITH signal asks `seal_check_range()` and warns or blocks first; any
record that reaches the database, from any app or any old version, passes the
triggers on `mobile_consent_records`, `seal_receipts`, `fcportal_scan_records`
and `shared_do_records`. A problem is **never a refused row** — what the
customer signed is kept — it is a `seal_problems` row and a NELOS case put in
the HQ queue (`sees_all_cases`) with nobody assigned, so every HQ handler sees
it. One open case per AL and kind; a second problem is a comment on it.

Three things worth knowing:

- **Seals are compared as numbers and shown at their width.** 0009297 and 9297
  are one seal. `sealRanges.js` is the rule and lives in mobile, fc-portal and
  the Sales Web as the same file — change all of them. **The office page
  shows a seal at no fewer than six digits** (`SEAL_MIN_WIDTH`), so 1101 keyed
  without its zeros reads 001101; only the showing pads, the number decides.
  The phone copies of `sealRanges.js` do not pad yet.
- **A DO says which seals it carried** (`shared_do_records.seal_ranges`), the
  ones scanned on that card since its last DO, so a consent collected over
  three trips gives three DOs with three different lists.
- **`enforce_stock` is OFF** until the seals already at UNN 1 are keyed as
  opening stock. Turned on before that, every consent is a "never received"
  case.

**Seals come to HQ first** (`shared/RUN_ME_seal_hq_delivery.sql`): HQ
orders, HQ receives (`seal_hq_receipts`), HQ packs a delivery to site
(`seal_deliveries`: packed, then delivered to the site office), and site
keys the start and end AGAIN — on Receive Seals or on the office page —
which is an ordinary `seal_receipts` row naming the delivery. The trigger
closes the delivery and compares the two both ways round; a difference is a
problem and a case, never a refused receipt. The confirm is not filled in
from the delivery on purpose: the point is that somebody counted what
arrived. `seal_raise_case` is in BOTH SQL files, word for word, so running
either leaves the same titles — the test compares them.

The office page is two pages, **Seal at MJM Nursery** (first: in stock at
the nursery, then every customer order) and **Seal at HQ**, and the ribbon's
[← Portal] is the only way back — no User Access button either, Settings is
enough. Seal at HQ is three blocks, each opening a window: **Last seal
number** with a + that orders a RANGE (`seal_orders.start_code/end_code`,
the start filled in after the last seal anywhere, the qty worked out by a
trigger from the two codes); **Pending receive**, the orders opened up in
rows of 1,000 cut from each order's own first seal, each row received on its
own — so a box of 10,000 is checked a thousand at a time; and **Delivering to
site** with a + that packs a delivery. Below them is every seal at HQ, In HQ
or Delivering to site; a seal leaves it when site receives it.

The second and third are now **Seal pending receive** (one row per order:
date, range, by whom, `>`) and **Seals delivery to MJM Nursery** (+ New
delivery on the right). `>` opens the order's own *receiving check list*:
tick the first row and the last and every row between is ticked, and
Receive ticked writes ONE receipt with the running numbers joined. Neither
list carries a show-received tick — a **History** button switches the same
window to what HQ, or the nursery, has received, and a window opened from
another carries a Back to it.

**Then simpler again.** The tabs are tabs (Seal at MJM Nursery, Seal at HQ,
NELOS, and Settings as a small gear). On Seal at HQ the three blocks are
SELECTORS — Seal in HQ Cabinet (the last seal and where the next order
starts are a small line under it), Seal pending receive, Seals delivery to
MJM Nursery — and the list of whichever is pressed is shown in ONE view
under them, check list and History included. **Only a + opens a window**,
and the window is the form for adding: an order or a delivery.

**Problems became NELOS.** The tab lists every case the seal checks opened,
whoever it is assigned to, through `seal_nelos_cases()` — NELOS shows a case
only to somebody who holds NELOS, and the people on this page may not. And
a seal problem is settled where its case is: `seal_follow_case` on
`nelos_cases` resolves the problems filed on a case when HQ resolves or
closes it, and reopens them if the case is reopened, so the warning on a
customer cannot outlive the case it came from. A list joins
running numbers into one start and end wherever nothing breaks the run.

**A delivery can only take what is in the HQ cabinet.** The page checks
each keyed range against `seal_hq_stock` (received, on no other delivery)
and refuses one that is not in it or is keyed backwards. Save checks it
again, because the check waits for typing to stop and a quick Save can
arrive before it, or carry an answer about what was keyed before. Fill was
taken out: the office keys the first and last seal off the roll in hand. A
New Seal Order whose start is not the last order + 1 is WARNED and still
allowed, because a supplier may skip a run. `table.t .text-right` is set in
the page itself, because `table.t th` said left for every heading and beat
the Tailwind class, so Qty sat left over figures on the right.

**Seal at MJM Nursery is three blocks the same way**: Seal with Customer
(a consent signed and not yet on a DO -- pending or scanned), Seal in MJM
Nursery Cabinet (in stock), and Seal used (on a DO, with the customer, the
DO number and the DO date, which is read off `shared_do_records.
delivery_date` because the seal does not carry it). The block totals are
everything at the nursery; the search narrows only the list under them.
The blocks carry a title and a figure and nothing else, and nothing sits
beside the search bar -- the office asked for both lines to go. Every list
is ONE list in seal-number order whoever the seals went to, and the Seal
range heading turns it round. Seal with Customer joins a customer run
across pending and scanned, so a range part-scanned still reads as one
start and end, and its View consent opens the `mobile_consent_records`
row (`select *`, so a column a database lacks cannot refuse the read).

**Report is every number from the first to the latest**, each run with
where it is now, built in the page from what the other tabs already read.
A seal is where its LATEST step put it, so the layers are laid in that
order and each keeps only what no later one claimed: used, with a customer,
nursery cabinet, delivering, HQ cabinet, ordered and not received. A gap
between numbers is a **No record** row, never skipped -- a seal nobody has
a record of is the thing to look at. Nothing in the database was added for
it. **All** is the first chip and the default; From seal / To seal cut the
list to the numbers keyed, a range across either end cut at it, and the chip
figures count what is left after the cut. The Seal range heading sorts it.

**The Report filter is a tick list on the Status heading**, not a row of
chips: All, or any mix of statuses, each with its figure, and a line above
the table saying what is shown with a cross on each. It is drawn OUTSIDE the
table (`position:fixed` off the heading) because the table scrolls sideways
and would clip it.

### A seal that went out unscanned is SETTLED, never re-scanned

The FC Portal scans every seal as it goes out, and the DO names the scanned
ones. A seal that went out unscanned stays Pending collection for ever, with
the seals either side already on a DO -- which is how the office found them.
`shared/RUN_ME_seal_missed_scan.sql` is the whole of it:

- **Found by the database**: `seal_find_missed` is a pending run of one
  customer with a collected seal immediately before AND after it. A DO save
  runs `seal_flag_missed` (trigger `seal_sync_do_missed`, named to sort AFTER
  `seal_sync_do` so the scans already carry the DO), which raises a
  `missed_scan` problem and NELOS case per gap, once, and resolves the ones
  that stopped being a gap.
- **Settled by the office**, Key DO on the NELOS tab or on any Seal with
  Customer row -- the standard way, gap or not. `seal_settle_scan` checks
  everything (range, this customer, nothing scanned, nothing settled twice,
  a DO of THIS customer) and the page only says what it answers. It writes
  `seal_settled_scans` (read-only to everybody; the function is the one
  writer), adds the range to that DO `seal_ranges` marked `settled`, and
  resolves the problem and its case. **The problem is resolved BEFORE the DO
  is updated**: the DO update sets off the gap check, which would otherwise
  resolve it first in the system name.
- **Read everywhere for free**: `seal_segments` counts a delivered settled
  seal as scanned on its DO, so the nursery tab, the Report and the customer
  portal all say Used. Not delivered leaves the seals Pending and never a gap
  again.

`seal_raise_case` is in THREE files now and `seal_segments` in two, word for
word; the test compares them. With two different DOs either side, nothing is
chosen for the office -- both are offered, marked before and after.

`tests/seal_dashboard.cjs` holds the office page.

## Coming back to the portal is not signing in again

`index.html` shows the sign-in screen until `onAuthStateChange` has read the
profile, and that read goes over the network — so every module's [← Portal]
put the login up for a second or two over somebody signed in the whole time,
and the office read it as being thrown out. A device holding a session and
the last profile this account was given (`mjm_perm_last__`) now opens on the
hub straight away; the handler still reads the profile and redraws it, and
still shows the sign-in when the session has gone. A session with nothing
remembered shows neither screen rather than the login.
`tests/portal_back_is_not_a_sign_in.cjs` holds it against a database that
never answers.

## A category nothing raises is a feature somebody stopped halfway

Automate Cases lists exactly the `nelos_categories` rows carrying an
`auto_condition`. The office asked why **"From Culling Calculator - Request
HQ Verification"** was not on it, and the answer was that at that moment
**nothing raised it**: the category and its route to HQ Operation had been in
the database since `RUN_ME_culling_inang.sql` was run, the table that rule
needs was created with them, and the code had never been written. One case
had ever been filed under it, by hand, from the hub. The phone has the rule
now — see below — and the row carries what raises it.

`shared/CHECK_which_cases_the_system_raises.sql` is what answers this in one
paste — every title, which system raises it, by hand or by itself, where its
rule sends it, and how many cases carry that exact wording. **Run it before
adding a condition to anything**: a condition on a title nothing raises puts
a promise on that page the system does not keep, which is the same fault one
level along.

It found a second one in the same run. The **Seal** title read `(no system)`
— `RUN_ME_seal_management.sql` inserted it with neither a `module_key` nor an
`auto_condition`, so the busiest automatic title in the database was on
neither screen: both raise forms scope the Work list on the module, and
Automate Cases needs the condition. `seal_raise_case()` opens a case by
itself on six conditions. `RUN_ME_seal_case_category.sql` repairs it and that
file now sets both. **Where a seal case goes still needs no rule** — the
function names the queue on the case itself, so `nelos_route_case()` steps
aside, and the blank in the routing column is correct.

### Still over the limit after a SECOND selection is HQ, not the auditor again

The phone had already learned it by the time the condition went on the row,
and the shape of it is in `Barcode_Counter/src/modules/palms/cullingInang.js`
and `cullingActions.js`. Worth knowing from this side, because the SQL is
what makes any of it work:

**The round is a fact about the GROUND, not about the phone.** The second
round is usually keyed by somebody else, often on a different phone, so no
phone can answer how many a block has had. It is a row per block of ground in
`fcportal_culling_inang` — `attempt` is the round, one row updated each round
rather than one per round, because the figure that matters is the one standing
now. `shared/RUN_ME_culling_inang.sql` is the table and the route, and
**without its unique index on (plot, batch) every save after the first round
is a refused insert**, the upsert naming those two columns as its conflict
target.

Four things in the rule, each the shape of a way it goes quietly wrong:

- **HQ is NOT a band, so it is kept out of `CULLING_ACTIONS`.** The other two
  answers are decided by where the figure lands; this one is decided by how
  many times the plot has been round the loop. `HQ_ACTION` stands on its own
  and the screen offers it as its own button.
- **A figure loaded off the last round is not a new selection.** `sent_qty`
  records what the figure was WHEN THE LAST ROUND WENT, beside the live one —
  so still over with the SAME number is somebody looking at it again, and
  still over with a different one is a second selection. Compared against the
  live saved figure instead it would answer no every time, because the draft
  is written as it is keyed, and the HQ button would never light.
- **A DRAFT IS NOT A ROUND.** Every keystroke settles into the same row
  within the second, so a walk is not lost to a flat battery — and that write
  deliberately leaves `attempt` and `sent_qty` alone. Counting a draft as a
  round would light the HQ button over a number nobody has sent anywhere.
- **The clear only ever runs against a SERVER list.** A plot leaves the
  calculator when its collecting status closes, and its selection goes with
  it or next season starts at round two. Pruned against the list a phone
  serves with no signal it would wipe the selections of every plot opened
  since — the same rule `closeCollectingStatus` follows for the same reason.

**The category is spelled in three places** — the `nelos_categories` row, the
`nelos_routes` rule, and `cullingActions.js` — because a case carries its
category BY VALUE and the routing matches on that string. One letter out and
every HQ verification falls back to the Field Conductor who raised it.

`shared/RUN_ME_culling_hq_is_automatic.sql` is the condition, with the table
and the route re-asserted so it stands on its own, and it **seeds no
selection**: a round nobody counted is not a round, so every block starts
where it stands and the first to be counted twice after it is the first that
can reach HQ. `Barcode_Counter/tests/the_plot_decides_not_one_batch.cjs` holds
the phone half.

**And this was built twice, in two sessions, on the same afternoon.** The
second copy was thinner — one button changing wording instead of three, the
selection written only when the button was pressed, the round read as a
single number with no way to tell a second look from a second selection — and
it was dropped rather than merged beside the first. Two copies of one rule is
the fault this file has a heading about. What was genuinely missing was on the
office side and is above: the condition on the row.

## 4.4 kg on the office screen and 4,4 kg on the phone

The office read a dose off their own schedule and the Field Conductor read
the same dose off his phone, in the same week, and the two did not match.
Nothing was wrong with the arithmetic — `weekUsage` on the phone and
`calcMaxChem` in the office agree to the millilitre, which is why that file
is written twice and says so.

**`n.toLocaleString()` with no locale reads the DEVICE's.** On a desk in the
office that is English; on a handset set to a language that writes decimals
with a comma it is 4,4. So the figure was correct and the separator was the
reader's, and there is nothing on either screen that could say so.

**A dose is the harmless end of it, and that is the part worth keeping.**
The separator swaps BOTH ways: on that same phone a plot of 6,515 seedlings
prints **6.515**, which somebody running down a column reads as six and a
half. Every figure in the phone app went through that call — 51 of them.
The dose was simply the one with a decimal in it, so it was the only one
anybody could see was wrong.

So the pin is **`en-MY`**, in both repositories and under the same name,
because one rule in two repositories under two spellings is the drift this
file keeps finding. It was already the spelling `moneyFig` uses on the
salary claim — the one figure in this system that was always written
deliberately.

- **The phone has ONE formatter**, `src/lib/numberText.js`, and nothing else
  formats a figure: `numText(n, opts)`, with a value that is not a finite
  number coming back EMPTY rather than as `NaN`, because "NaN kg" on a dose
  line reads as an amount.
- **A DATE IS NOT A FIGURE** and must not be swept with them. A timestamp in
  a console table, or the Sync pill's "last synced", SHOULD read in the
  language of whoever is looking at it. The seven of those are deliberately
  left on the device locale, and the test asserts they are still there —
  a sweep that takes the dates with it is the easy way to do this wrong, and
  the first attempt here did exactly that (`new numText(Date(x), loc)`,
  which does not even parse).
- **Four office formatters carried the same fault**: `fmtUsage` and the
  fertiliser kg line in `plot_maintenance_script.js` (the dose itself),
  `fmtMoney` in `operation_reports.html` and `capFmt` in
  `npayroll_script.js`. Money was already safe, `moneyFig` having named its
  locale from the start.

**The office side is only half swept**, and the half that is left is the
bare integers: **584 `toLocaleString()` calls** across the office pages that
still read the machine's locale. They have never bitten, because the office
machines are English — but every one of them prints a plot of 6,515 as
6.515 on a phone, and these pages are opened on phones. That is its own
sweep and it is owed.

`Barcode_Counter/tests/a_figure_reads_the_same_on_every_phone.cjs` holds the
phone half, reading the SHIPPED files so a file added later is in the check
without anybody listing it: no figure left on the device locale, no second
pin anywhere, every caller importing the one formatter, and the dates
untouched. On the previous code it names all 51 sites.

## Others is a column on the Team Board, and a section is THREE files

The office asked for a column on the Worker System board for the people who
work for the company rather than at a nursery. A column is a SECTION, and a
section is not one thing in one file:

| | |
|---|---|
| `scan/scan_workers.html` | draws the column |
| `scan/scan_system_setting.html` | the Location card offers it |
| `npayroll/npayroll_script.js` | decides whether work is done there |

Two of those had their own copy of what a section is, and the copies are
the whole of what made this more than one line.

**The Location card kept the word UNE written down separately.** Both
screens get the nurseries from `operation_nurseries`; what is left is the
sections that are NOT nurseries, which the table will never hand over, so
each screen added its own. A section added to the board alone would have
drawn a column that the card reported as **"Not in a location"** — set up
on one screen and a fault on the next. `OFF_NURSERY` in
`shared/shared_worker_locations.js` is that list now, and both read it.

**And the payroll asked "is this location not the estate".** That was
right for exactly as long as the estate was the only place in the company
with no plots in it. This column is the second, and on that test the office
staff arrive as a nursery to be sprayed: a maintenance sheet, a column of
plots and a claim. A location carries **`maint: true/false`** now and
`isMaintSection()` asks the flag, so a third non-field location added next
year does not quietly become a nursery. Section 4 of the test drives the
old rule beside the new one, because a flag-versus-name argument is only
settled by what it actually moves.

Three smaller things:

- **A code in NO location still answers NO** to `isMaintSection`, which is
  what the payroll has always done and is deliberately kept: the claim
  offers a nursery to be ticked and signed, and one nothing can place is a
  sheet nobody can reconcile. It shows on the Location card under "Not in a
  location", where somebody can see it. The first version of the shared
  helper answered YES there and would have moved a claim nobody asked to
  move.
- **Others comes last**, after the nurseries and the estate — the board
  reads left to right from the seedlings outwards.
- **It is called OTHERS and not ADMIN**, and the rename is the rule, not a
  wording preference: the day the board grew a row per role, Admin became a
  JOB, and a place cannot wear the same word. See the section above.
- **It arrives as a LOCATION, not through the fallback.** `boardColumns()`
  gives any unrecognised section a column of its own, which would have
  drawn the heading too — but that fallback is a safety net for a nursery
  read that went wrong, and leaning on it for a section the company decided
  to have is how the board and the card come to disagree again. The test
  asserts the column count matches the locations.

**The shared file was loaded with no `?v=` on all four pages**, and two of
them had no no-cache metas either — so this change lived entirely in a file
every browser was entitled to keep. Both are fixed; one hard reload per
machine picks up the metas, and after that those pages stay fresh.

`tests/others_is_a_column_and_not_a_nursery.cjs` holds all of it and ends by
driving the REAL board in a REAL browser with somebody filed under OTHERS —
a column that is right in `boardColumns()` and missing on the board is the
exact shape this file exists to catch. Its band check compares the headings
as WRITTEN, because they are uppercased in CSS and `innerText` hands back
what the stylesheet did.

## Two repositories, one system

- `mjm-ai-system` — the office, ai.mjmnursery.com. Static; served from the
  repository as-is, no build.
- `Barcode_Counter` — the phones, scan.mjmnursery.com. Vite; CI builds and
  commits the output back to the repository root.

Rules that live in both — the general-worker filter, the maintenance function
keys, nursery-name matching — carry a comment in each copy saying so. Change
one, change the other.

## Culling Monitoring is timed by PALMS and asked by the ledger

**IT WAS CALLED THE CULLING INCENTIVE, AND THE KEYS DID NOT MOVE WITH THE
NAME** — *"culling incentive 的名字换成culling monitoring"*. Only what a
person READS changed: the tab in both languages (`Pemantauan Culling`), the
payroll heading, the claim form's `CULLING MONITORING`, every message and
every link that names the screen. What is STORED or ADDRESSED kept its
spelling, because a label that takes its key with it reads every tick the
office ever set as unset — the rule System Setting already follows:
`cull_incentive` (the sub-tab id and the `?view=`), `cullIncentive` (the
i18n KEY, its value is what moved), `MJMCullIncentive`, `cull-inc-*`,
`shared_cull_incentive.js`, `nops_cull_incentive_checks` and
`mjmnpayroll_cull_incentive_overrides`. **Nothing to run in the database.**

Two wordings deliberately did NOT move and are worth knowing before anybody
"finishes" the rename: the money column still reads **Incentive (RM)** and
the claim's foot still reads **TOTAL INCENTIVE**, because the section is
Culling Monitoring and what it pays is still an incentive. And the office's
own quotes in these notes keep their original words — a quote that is
edited is not a quote.

A plot whose LATEST Saringan Anak Bibit → Transplanting run in PALMS took
**15 days or fewer** earns **RM 20 a plot** to Rousell Wayne and to
Florence, whatever the nursery, and **RM 50 a plot** to that nursery's own
Field Conductor (Lalu Aenal BNN, Akbar UNN 1, Azhar UNN 2).

**It is gone through on Work Maintenance and PAID on the payroll.** The
office moved it: *"把culling incentive全部搬到这里 under worker activity，
这里只会显示plot，duration，日期，谁拿到 after check，然后payroll那边要link
这里 然后在payroll才会有钱"*. So:

- **Worker Activity → Culling Incentive** (`renderCullIncentivePayroll` in
  `nursery_ops/plot_maintenance_script.js`) shows the plot, the two dates,
  the duration and who earns it — **no RM**, on purpose — and carries
  **Check, Remove and Add by hand**. A plot PALMS does not qualify is listed
  under the ones that do, saying why, with **no button that pays it anyway**:
  *"count it 不用 只需要check / removed"*, and Count it stays off.
- **The payroll Transplanting sheet pays the CHECKED plots and nothing
  else**, links back (`?view=cull_incentive` opens the tab), and names the
  plots that qualify and are still waiting to be Checked. It writes nothing.
- **`shared/shared_cull_incentive.js` is the rule**, read by both pages —
  `RULE` is who earns what, `plots()` times them. The payroll's own copy was
  taken out the day this moved. Do not re-implement it in a page.

What the rule asks, and must keep asking:

- **Which plots** is the ledger's answer — `Transplanted` rows dated in the
  month, the Transplanting Report's date rule. **How long** is PALMS's, timed
  exactly as the Motion Study times its incentive runs (`cyclesOf`,
  `diffDays`, `TARGET_DAYS`). Two pages timing one run two ways is how a plot
  is fast on one and slow on the other.
- **The latest run whose Saringan began by the end of the month**, so a month
  already paid keeps its answer when the plot starts its next intake. A split
  plot is timed as one: its areas' earliest Saringan to their last
  Transplanting.
- A plot with no complete run is SHOWN and not paid, saying why.
- **Checked writes down what the row read** — the dates, the days, the
  nursery — into `nops_cull_incentive_checks`, one record per plot per month
  (`shared/RUN_ME_cull_incentive_checked.sql`). A PALMS correction after the
  office signed does not move money already agreed: same rule as `qtyFrozen`.
  Uncheck clears all of it and the live answer comes back.
- **A Checked plot cannot be added or removed by hand** until it is
  unchecked — changing what was agreed starts with taking the agreement back.
- **By hand is plot by plot**, never person by person, so one decision moves
  all five people's money together. `mjmnpayroll_cull_incentive_overrides`
  holds ONE record per plot per month: `remove` leaves one out and `add`
  counts one. Every one carries a reason, who and when, shown on the row.
  Gated on admin of Work Maintenance or Adjust Pay on Transplanting, asked
  again at the write. A dialog, never a `prompt`.
- **REMOVE IS ON EVERY ROW, earning it or not, and it is ONE PRESS** — no
  dialog, no reason. Two sentences from the office, a day apart: *"底下 B3
  B11 我可以remove"*, then *"我一按remove 就remove了 不要存在 也不用写
  remark"*. The first version kept the removed row in the NOT-earning list
  reading *"Taken out by hand"*, which is the row they had just said they
  did not want to see, behind a form asking why.

  **What makes one press safe is the Checked rule beside it.** Nothing is
  paid until a plot is Checked, and a Checked plot REFUSES Remove until
  somebody unchecks it — the one refusal left. So no press here can move
  anybody's money; the worst it can do is take a row off a list.

  **It is still a RECORD and never a deletion**, and that record IS the way
  back: one line under the table says *"2 taken off this month: B3 · Put
  back  B11 · Put back"*. That line is the house rule's last foothold here
  — the rows are gone because the office asked twice, but a mis-press must
  not need the Supabase dashboard to undo.
- **ADD RECORD SUPPLIES THE RUN; IT DOES NOT WAIVE THE RULE**, and that is
  the whole of what keeps it from being the Count it button the office took
  off a day earlier. PALMS is where a run is timed and a plot can be missing
  one for reasons that are nothing to do with the ground — a Saringan never
  opened, a Transplanting never closed, a phone pushing an entry back. So the
  button — **+ Add record**, the office named it — opens a dialog asking for
  the **two days**, times them with `MJMPalms.diffDays` (never a second day
  count), shows the duration as it is keyed, and **refuses a run over
  `TARGET_DAYS`, naming the figure**. A -R plot is refused outright, and the
  reason is optional like the Remove beside it. The row it makes is an
  ordinary one: marked *Added by hand*, and **paid only once somebody Checks
  it**, like every other plot.

  **NAMING THE PLOT FILLS THE TWO DAYS IN**, off the same `runOf` the list
  itself is timed with — asked of one plot, so what lands in the boxes is
  what the row would have read. The office could not key a date into a
  dd/mm/yyyy box without a fight (*"日期我怎么打不到21号"*), and the days
  were in PALMS the whole time; where PALMS has the Saringan and no closed
  Transplanting — most of why a plot needs this dialog at all — only the
  second day is left to key, and the line under the box says so. Three
  things that cost an hour between them:

  - **A day the dialog filled BELONGS TO THE PLOT IT WAS FILLED FOR.**
    Keying one plot and then changing your mind left the first plot's days
    under the second one's name — a record that reads perfectly and is about
    the wrong ground. Each box carries `dataset.auto`, dropped the moment
    the plot changes; a day somebody TYPED clears that mark and is never
    thrown away, because correcting PALMS is half the point.
  - **A LINE THAT APPEARS ON BLUR MOVES THE BUTTON OUT FROM UNDER THE
    POINTER.** Blur fires on mousedown, so the panel grew between the press
    and the release: the dialog shut on the click meant to open the date
    picker and everything keyed went with it. Both self-filling lines
    reserve their room (`min-height`) so the layout cannot move at all.
  - **The backdrop closes on a click that BEGAN on the backdrop**, which is
    the seatbelt for the same thing and for a drag out of a text selection.
- **THE CLAIM FORM IS ONE TABLE: the plot, the name, the money.** It was
  two — every plot with its Saringan, its Transplanting, the days and who
  checked it, then a second headed *"CULLING INCENTIVE — WHO IT PAYS"* with
  a No. and a Rule column — and the office read the printout and said
  *"我只要看到 CULLING INCENTIVE 其他废话都不用. 表格里面我只要看到人名
  plot 和价钱"*. The dates, the days and the checker are how the office
  DECIDED, and they are all on Worker Activity → Culling Incentive, which
  is where the deciding happens; a claim form is read by somebody adding up
  money and signing it. A name the register cannot place keeps its *(NOT ON
  REGISTER)* mark — that is money this claim does not pay, and it is the
  one fault the table can carry.

  **THE PLOT IS THE KEY, AND IT IS MERGED** — *"我要plot 在前面 merge起来
  中间人名 后面价钱"*. That is not a reordering of three columns, it is the
  right unit: the incentive is earned ONE PLOT AT A TIME, RM 20 to each of
  the two and RM 50 to that nursery's own Field Conductor, so the plot is
  the thing and the people are lines under it. Two things fall out, and
  both are better rather than merely different:

  - **The money column ADDS UP to the TOTAL.** Each figure is what that
    plot paid that person, so somebody running down it reaches the total —
    where a column of per-person sums over a list of plots never said what
    any one plot was worth. **BNN alone cannot prove this**, because a
    person with one plot has the same figure either way; the test drives
    All Sections, where Rousell's RM 40 over two nurseries has to read
    RM 20 on each line.
  - **A person with no plot is not a row.** It read *"none · RM 0.00"*
    before, which is a row of nothing on a form about money. The nought is
    still in the total, where it changes nothing.

  **The break goes BEFORE a run, never inside one** — the Worker Record's
  rule for a plot, and here a break inside a run would cut the merged cell
  in half. A run too tall for a page splits at the page edge and names the
  plot again; at three people to a plot it never comes up.

  **And the merge is asked of the GEOMETRY.** A list of the strings drawn
  cannot tell one cell three rows tall from three cells carrying the same
  word, so the harness records every `rect` and every `text` with its x, y
  and page. **Counted by WHERE they are, not by how many calls there
  were**: `pdfCell` draws a fill and then a border, so a striped block
  records the same cell twice and a plain count reads two plots.
- **AND THE SCREEN IS ONE TABLE TOO, the same six columns.** It was two
  stacked cards — the plots with their dates, then who they paid — and the
  office read them and asked for the same merge: *"这里合起来 不需要分两个
  plot, started date, ended date, days, person, RM"*. On the screen the
  plot's four facts (its two days and its duration) ride in the merged
  `rowspan` cell with it, which is what the second table could never show
  beside a name. `cull-inc-pay` is GONE from the markup, not left empty.

  Four columns came off, and each went somewhere rather than being lost:

  - **Rule** (*"Every nursery · RM 20.00 / plot"*) — the figure on the
    line IS that rate, one plot at a time, so it was the same answer in
    words.
  - **Checked plots** — that is the merged Plot cell now.
  - **Checked** (who agreed it, when) — the claim form had already settled
    this one: it is how the office DECIDED, and Worker Activity → Culling
    Incentive carries it, one button away at the top of this section.
  - **Nursery** — the heading names it whenever a nursery is picked, so a
    column would be the same answer twice. It comes back as a muted line
    under the plot for **All Sections** only, which is the one case the
    heading cannot answer.

  **A plot that paid NOBODY still keeps its row**, reading *"Nobody — on
  no claim line"*. It is Checked and on no claim, which is exactly the
  thing to see; dropping it would be the quiet month this file keeps
  guarding against.

  The screen half is asked of the **`rowspan`** for the same reason the
  paper half is asked of the geometry: four cells of three, and three body
  rows, is the only way to tell a merged cell from the plot written out
  three times.

  **AND THE WIDTHS ARE PER CENT, where every other table on this page uses
  pixels.** Left unpinned, the slack all went to the two DATES — auto
  layout hands the most room to the widest content, and their HEADINGS are
  the longest words on the row — so a 90px date sat in 400px beside a plot
  squeezed into 131, and the office said *"alignment 不对 有些太大有些太
  小"*. **Pinning only the dates MOVES the fault**: the surplus then lands
  on Person, 548px for a name, which is the same picture the other way
  round. Six short values cannot fill a table told to be 100% wide, so the
  surplus has to go somewhere, and per cent is what spreads it over all
  six. Measured at 1,450px and again at 1,100 before choosing — the shape
  holds at both, which neither pixel plan did.

  **Auto layout, never `table-layout:fixed`.** The headings are `nowrap`,
  so a fixed column narrower than its own heading runs the words out of
  the cell on a laptop; auto grows and `.tbl-wrap` scrolls.

  The test asks the RENDERED widths, and asks the office's own picture:
  **a date is never the widest column on the row** — the widest should be
  the one carrying the longest VALUE, never the longest heading. A looser
  form of that ("nothing takes a third of the table") passed over the
  broken layout at 28% and proved nothing.

  **A design note NEVER goes inside the template literal.** A comment
  there is shipped markup, and one backtick in it ends the literal — which
  is what happened writing the note above, and the page died with
  `renderCullIncentive` never defined and nothing on screen saying why.
- It goes into the Monthly Payroll's Transplanting column, under each
  person's register section, and onto the claim PDF — Checked plots only.

### The rule is the OFFICE'S, and it is DATED

Who is paid and how much moved out of the code into two tables keyed on
Settings (`shared/RUN_ME_cull_monitoring_rule_dated.sql`). The office drew
the shape: a price on the BLOCK, a list of names under it with a remove on
each, an Add, and the Field Conductor rows carrying a nursery — more than
one per nursery where there is more than one.

**A PRICE CHANGED TODAY DOES NOT MOVE LAST MONTH**, and that is the whole
design rather than a detail of it — *"我什么时候改的价钱 是不会影响以前的
月份的 例如我10月改RM50变40 9月份的还是RM50"*. So the rule is not one row
saying what it is NOW, it is a rule with a HISTORY:

- **the price** — the NEWEST rate row for that kind whose `from_month` is
  not after the month being asked about;
- **the people** — every row whose `from_month` is not after the month and
  whose `until_month` is empty or AFTER it.

`loadRule(supa, ym)` takes the month, and **both callers pass their own**:
the claim passes `monthValue()`, the tab passes its `ym`. A reader that
forgot would price September off October's rule.

**REMOVE IS AN END DATE, and this is the one place the code does not do
what the office literally asked for.** They said *"Remove直接删除就可以了
错的话 我可以add回来"*, and on screen it IS a delete — the row goes, and Add
puts it back. But a row deleted outright would take the person off
SEPTEMBER too, which is the very thing the sentence above forbids. The one
row that really is deleted is somebody added and removed in the SAME month:
that row was never in force anywhere, so there is nothing to keep.

**A NAME SWAPPED IS AN END AND A START**, for the same reason — editing it
in place would rewrite the months that already paid the old one. A row that
STARTED this month is corrected in place instead, having never been in
force earlier; `wasName` / `wasNursery` / `from` ride on the draft so the
save can tell which of the two it is looking at.

**Months are `YYYY-MM`**, which is what both screens already use and what
lets a plain text comparison answer which came first.

**The first version of this file was NOT dated and the office ran it**, so
the dated file is a MIGRATION as well as a create: it adds the columns, it
gives the rate table an id where it was keyed on `kind` alone, and it turns
the first version's marked removals into end dates at the month they were
marked in. All guarded, so it does nothing on a database that starts here.
Tested on the scratch Postgres against the shape the office actually had,
not a fresh one — then run twice more to prove an edit survives.

### What moves it is on SETTINGS, because none of it was on a screen

The office asked for it in one line — *"在setting里面讲可能影响culling
incentive的东西加进去"* — and the reason it is worth having is that **not one
of these was visible anywhere**: the target of 15 days, the two names paid
on every nursery, and the three Field Conductors paid on their own. The
office could not see that Florence is paid RM 20.

#### THE ONE SCREEN THE RULE IS KEYED ON WAS THE ONE SCREEN THAT NEVER READ IT

*"为什么改不到"*. They had run the SQL, the rule was in the database, and the
Settings card drew the list compiled into the FILE — the short names,
Florence and Akbar, not the register's own spelling — put a red banner over
it telling them to run a file they had already run, and offered **NO EDIT
BUTTON**.

`loadRule` was called in exactly one place: `_loadCullIncentive`, which runs
when the Culling Monitoring sub-tab of Worker Activity is opened. Somebody
who went straight to Settings had a card drawn over a rule nobody had
fetched, and `ruleSource()` answered `built-in` — **which is what that
answer means: nobody asked.** Not "there is nothing keyed".

So **the read belongs with the draw**. `renderCullMonitoringSetting` draws
at once off whatever is in hand, asks the database, and draws again — two
draws rather than a blank card while it waits, because a space where a rate
belongs reads as a rate of nothing. `_cmRuleAsked` is per month so it does
not ask on every tab switch, is cleared on a save (which re-reads anyway),
and **is NOT set by a failed read** — a card that gave up for good over one
refusal stays wrong until somebody reloads the page. The read is skipped
entirely while `cmDraft` is set: an answer landing under a half-keyed draft
would redraw the card and throw away what somebody had typed.

**EVERY CHECK IN THE FILE WAS BLIND TO IT, and that is the lesson.** They
all booted through `?view=cull_incentive`, which opens the tab that reads
the rule — so the fixture always had it in hand before the card was drawn.
**A test that always walks in through the other door cannot see a door that
does not open.** `tests/culling_incentive.cjs` now has a `'setting'`
landing that goes to the plain page and touches nothing else; eight of its
checks fail on the previous code, the first of them in the office's own
terms (`built-in`, and no Edit button).

**IT IS THE KEYING AND NOTHING ELSE, and the six rows that went are the
instructive part.** The card opened as a REFERENCE panel: under the two
blocks it carried a six-row table — which plots are asked about (the
ledger), which nursery a plot is in (Seedling Stock), how long it took
(PALMS), a -R plot, added or removed by hand, Checked — each saying where
it is decided. The office read it and said *"这里不用show"*, and they are
right twice over. **None of the six is a lever anybody keys**, so they were
six rows to read past sitting above the two boxes that ARE keyed; and every
one of them is a rule with a heading of its own in this file, which is
where an explanation belongs.

**The heading was cut back twice behind it**, and the second cut is the
one worth keeping. It read *"Culling Monitoring — what moves it"* over
the table; with the table gone it became *"— the rule"*, because a heading
promising a list the card no longer carries is a heading somebody has to
ask about. Then the office took that off as well (*"删掉"*), and they are
right: **a qualifier distinguishes this card from another one, and there
is no other one.** It tells a reader which of the two Culling Monitoring
cards they are looking at on a page that has one. The NAME is the heading.

**The DATED line is drawn only while EDITING.** It says what Save will
actually do, so it belongs beside the Save button; a paragraph that is only
true of an edit has no business on a screen with no edit on it. That is why
the test asks for it in BOTH directions — absent in the view, present once
`cmEdit()` has run — rather than only checking it is gone.

**THE PROSE WENT NEXT, AND THE TARGET HAD TO KEEP A HOME.** What was left
above the blocks was a sentence — *"A plot that went from Saringan Anak
Bibit to the end of Transplanting in [15] days or fewer earns this. Nothing
is paid until the plot is Checked on Worker Activity."* — and the office
asked for it off (*"删掉"*), along with the four-line banner and the corner
link. **The 15 was keyed inside that sentence**, so deleting it outright
would have taken the box with it and the target would have stopped being
keyable. It moves into the shape the card already had: a bar with the
heading on the left and the figure on the right, beside the two prices.
**Three bars, three things keyed, no prose.** The Motion Study line rides
in that bar in EDIT only — somebody about to change the target is the one
person who has to know it is the same number.

**The BANNER survives as one line and only where it is true**, which after
the read is fixed is almost never. It had been four lines naming
`RUN_ME_cull_monitoring_rule.sql` — the superseded undated half — over a
rule the office had already keyed, which is the whole reason it read as
废话. And **the two cases it covers are not the same**: a read that FAILED
is a database that could not answer, a read that came back EMPTY is a rule
nobody has keyed, and only the second names a file. `ruleError()` tells
them apart — `loadRule` leaves it set on the first and null on the second.

**The corner link is gone.** It read *"Open Culling Monitoring →"*: this
card is the RULE, the tab is the month's plots, and that is a different job
reached from Worker Activity where the rest of that work is. `.cm-set-open`
stays in the stylesheet as the pattern for a corner control on a centred
`.lst-top`.

**And the standing sentence on the TAB went with it** — *"A plot whose
Saringan Anak Bibit to Transplanting took 15 days or fewer earns the
incentive. Tick Checked once you have been through a plot…"*. The table
says both: the plots are listed BECAUSE they made the target, and the Check
button is on every row with the rule in its title. `#payroll-hint` is
CLEARED rather than left alone — it is shared with the four other sheets on
that tab, and a renderer that merely stopped writing would leave another
sheet's sentence sitting over these plots.

- **It reads the LIVE rule** (`MJMCullIncentive.RULE` / `TARGET_DAYS`),
  never a second copy. A card restating RM 20 and 15 days is a card that
  goes on saying so the day somebody changes them, and the test moves the
  rule at run time and asserts the card moved with it.
- **The TARGET is keyed here too, and it is ONE number.** It used to be a
  const in `shared_palms.js`, and this file read a COPY of it at load —
  `(global.MJMPalms && …TARGET_DAYS) || 15` — which quietly made the load
  ORDER decide the answer: a page that read the rule before PALMS timed
  every plot against a fallback 15 while the Motion Study beside it used
  whatever PALMS said. This card used to print a red line warning about
  exactly that.

  **PALMS owns it, everything reads it LIVE, and the warning is gone
  because nothing can drift any more.** `MJMPalms.TARGET_DAYS` is a GETTER
  on the export, `setTargetDays` is the one writer, and
  `MJMPalms.loadTarget(supa, ym)` brings in the office's. `loadRule` hands
  it straight to PALMS, and the Motion Study — which loads PALMS and
  nothing else — awaits `loadTarget` itself before it draws the label, or
  it would print one number and measure against another.

  It rides in the SAME dated table as the prices, as a third `kind`, so a
  target changed in October leaves September timing against the one it
  had. **Its unit is DAYS and not ringgit**, which the SQL says in as many
  words and the check at the end prints as `target 15 days` — a line that
  called it RM would be the one thing on that result somebody could act on
  wrongly. A target under a day is refused: it is every plot off the
  incentive at once, and nobody means to key it.

  `CULL_TARGET_DAYS` in `npayroll_script.js` was a capture of it at script
  load and was read by NOTHING — removed rather than made live.
- **A card that cannot read the rule SAYS SO** and keeps nothing stale.
  Stale rates on a card whose whole claim is that it shows the live ones is
  worse than an empty card, because it looks answered.
- **It cannot take Settings down with it.** It is a rule set once and the
  three blocks above it are the day's own work, so it renders inside its
  own try — the batch page's rule for its trailing steps.
- **The corner link uses `.cm-set-open`, not `.lst-edit`.** `.lst-top` is
  `position:relative` with its heading centred, so a control that does not
  take itself out of the flow drops onto a second line under the title —
  which is what this one did first. `.sched-dl` is the same pattern, and
  `.lst-edit` is left meaning the Edit button.

`tests/culling_incentive.cjs` drives BOTH pages: the Check on Work
Maintenance, then the payroll fed exactly what those writes left behind —
and the Settings card, including the rename and that the keys did not move.

## A -R plot is on no PALMS screen

A -R plot is a REPLANT plot — ground a 3rd-culling transfer moved seedlings
onto — and PALMS has nothing to say about one. The office: *"plot-R
不需要出现在palms 完全不需要"*.

`isReplantPlot` is the rule, written twice: `shared/shared_palms.js` here and
`src/modules/palms/data.js` in the FC Portal (the Culling Calculator imports
that one rather than keeping its own). Change one, change the other. B4-R and
B4-R2 both go; a split area is judged by its plot.

- **ONLY THE PALMS PAGES, never the shared log.** The first version dropped
  them in `logsFromRows`, which every reader of the log shares — so Life of
  Plot and the payroll culling incentive lost their -R plots too, and the
  office said it straight away: *"不要乱改 只有关系到palms而已的不用显示"*.
  The log stays whole; the Plot Status Map and the Motion Study each read it
  through `MJMPalms.withoutReplant(...)`, and the test asserts Life of Plot
  does NOT.
- **The culling incentive leaves them out as well** — *"culling incentive也
  不会有r plot"* — by asking `MJMPalms.isReplantPlot` on the ledger's plots
  and refusing one added by hand. It still reads the WHOLE log, because what
  it leaves out is a plot to pay, and that is decided where the plots are.
- **The board's map is OPT-IN** (`skipReplant` on `MJMPlotMap.load`), because
  Life of Plot shares that map and a -R plot is real ground with maintenance
  on it there.
- **The FC Portal filters in `plotsOf` as well as where the list is built**,
  because a phone can be holding a list cached before this.

`tests/no_replant_plot_on_palms.cjs` runs both copies over the same names.

## Worker Activity is two parts, and Seed Planting is the Pre Nursery one

The office asked for Worker Activity to read as two parts: **Main Nursery**
(the seven sheets that were there) and **Pre Nursery**, which has one,
**Seed Planting**. The two headings are `.pn-subgroup` lines inside the
existing `.pn-sub` list, and they are headings, not buttons.

**The rows are the batch report's, ONE PER BATCH.** Seed Planting on the
batch page writes one `Planted` row per tray, dated with the day keyed on
that tab. This sheet adds a batch's trays together and shows the TOTAL
planted, against the batch's planted date. The office was explicit:
*tray完全不用管 跟着batch 就可以了 直接show total planted qty*. The first
version had a row per tray per day, and its table (`nops_seed_planting_workers`)
is kept but no longer read. The date rule is the Transplanting Report's:
`transaction_date`, else a `Date:` in the remark, else `created_at`.
`seedPlantingRows()` is the rule and it is pure, so the test drives it
directly.

**A batch can be ADDED TO A LATER MONTH by hand.** Seedlings sown on the
last days of a month come too late for that month's payroll. 277 was sown on
28 Sep and is October's work. `nops_seed_planting_batch_month` holds one
month per batch, and `seedPlantingMonthOf` sends the batch there and ONLY
there: it leaves the month its date would have put it in, and that month
says where it went (*Moved out of this month: 277 → Oct 2026*). A batch on
two sheets would be counted twice. Figures are kept by BATCH, so whatever
was keyed goes with it. Taking the batch off deletes the move and nothing
else.

**The NAMES are one list per month**, in `nops_seed_planting_names`, picked
from a DROPDOWN (*add worker & add batch 用drop down的方式*): everybody active
on the payroll register, by section — the Pre Nursery crew is filed under
whichever nursery they belong to, so the PN section alone came back empty —
then last month's names the register cannot place, then an Other that opens
a box. Add batch is a dropdown of the batches planted in the two months
before this one, newest first. A month with no list offers last month's
in one press. A name with figures against it cannot be removed until those
figures are cleared, because its column would only come back as a name off
the list. A figure saved under a name that is no longer on the list still
gets a column, marked ⚠.

**Each worker keys their own figure**, as the office chose (*每人填自己种的数量*).
The figures go into `nops_seed_planting_batch_workers`, one record per
batch (`shared/RUN_ME_seed_planting_workers.sql`), with the ledger figure
saved beside them. The ledger is only read. The last column but one says
whether what was keyed adds up to the batch.

Three things in it:

- **It always reads the Pre Nursery**, whatever nursery is picked at the
  top. Seed planting is only done there.
- **CHECKED IS WHAT PAYS IT, and the money is on the PAYROLL only.** *"图一只
  show qty, after checked, 这份表格会flow 去图二, 新加一个tab - seed
  planting"*, then *"tab里面才会有价钱"*. Work Maintenance shows quantities
  and a Check per batch; a checked batch is shut (boxes disabled, and the
  save refuses too). The Nursery Payroll's **Seed Planting** tab
  (`renderSeedPlanting`, `seedPlantingClaim`) prices the CHECKED batches,
  each worker's own seeds times the rate, and NAMES the batches keyed and not
  checked. The rate is the Piece Rate row with Used For *Seed Planting*
  (`category = 'seed_planting'`), seeded at **RM 0.02 a seed** by the SQL only
  where none exists; with none at all the tab uses 0.02 and says it is the
  default. A trigger (`nops_seed_planting_clear_check`) takes the tick off a
  batch whose figures change after it was checked, from any screen.
  **It is not on the Monthly Payroll yet**: the names are hand-picked, not
  register rows, so nothing yet joins them to a person's month.
- **No "added by hand" tag** on a moved batch, nor the "Added by hand"
  line and remark on Culling Incentive: *"不用show added by hand,包括 culling
  incentive那里的remark"*. The records still carry them. **It took a second
  pass to finish**: the line came off the Work Maintenance tab and was left
  on the NURSERY PAYROLL's Culling Monitoring table, where the office found
  it and said 删掉 again. Same judgement in both places — that table is what
  is being PAID, a plot added by hand is paid exactly like every other, and
  how it came to be on the list is the DECIDING, which lives on Worker
  Activity with the record, the remark, who made it and the button that
  undoes it. The nursery line stays: that is which nursery the money comes
  out of, which is a question about the claim.
- **Before the SQL is run, the rows still show** with every box disabled,
  and the hint names the file to run. A sheet that went empty over a
  missing table would read as a month nobody planted.

`tests/seed_planting_is_pre_nursery.cjs` holds the sidebar, the date rule,
the sheet, the Check, the dropdowns, the PDF and the no-table state;
`tests/seed_planting_is_paid_when_checked.cjs` holds the payroll tab.
