-- Checks whether a saved month is carrying another months ticks forward --
-- the shape of a bug just fixed in nursery_ops. A month opened for the
-- first time used to inherit the PREVIOUS months whole schedule, ticks
-- included, not just its weeks and its chemicals: so a plot could read as
-- already P and D sprayed, manured, weeded and interrow sprayed before
-- anybody had been near it this month, the moment that month was first
-- saved.
--
-- Every row below is a saved month whose four tick fields --
-- pd, manuring, weeding, interrow -- are byte identical to the closest
-- earlier saved month for the same nursery. A person keying the exact
-- same pattern across every plot and every job two months running is not
-- something that happens by coincidence, so each one named here is a
-- candidate for the bug and needs a look before its ticks are cleared.
--
-- A GOOD RESULT is zero rows, or only rows the office recognises as a
-- month genuinely repeating the one before it. This file only looks; it
-- changes nothing.
with ordered as (
  select
    nursery,
    month,
    to_date(month, 'Mon YYYY') as month_date,
    payload -> 'pd' as pd,
    payload -> 'manuring' as manuring,
    payload -> 'weeding' as weeding,
    payload -> 'interrow' as interrow,
    updated_at
  from nops_maint_state
),
with_prev as (
  select
    o.*,
    lag(pd) over w as prev_pd,
    lag(manuring) over w as prev_manuring,
    lag(weeding) over w as prev_weeding,
    lag(interrow) over w as prev_interrow,
    lag(month) over w as prev_month
  from ordered o
  window w as (partition by nursery order by month_date)
)
select
  nursery,
  month as suspect_month,
  prev_month as identical_to,
  updated_at as suspect_month_saved_at
from with_prev
where prev_month is not null
  and pd is not null and pd = prev_pd
  and manuring is not null and manuring = prev_manuring
  and weeding is not null and weeding = prev_weeding
  and interrow is not null and interrow = prev_interrow
order by nursery, month_date;
