/* COLLECTION TIME SLOTS — the ONE place that says which hours a collection
   can be booked in, and how much one hour can take.

   Set on Seedling Stock Management -> System Settings -> Collection Time
   Slot, stored as the single row of shared_collection_slot_settings
   (shared/RUN_ME_collection_slot_settings.sql), and read by every booking
   screen through this file — so changing it there changes the slots here.

   Two rules, both the house ones:

   - AN ABSENT OR UNREADABLE ROW IS NOBODY HAVING BEEN ASKED. The defaults
     below are EXACTLY what was written into the pages before this setting
     existed (8 AM - 5 PM weekdays, 8 AM - 12 PM Saturday, Sunday closed,
     350 seedlings an hour, 600 a slot), so a database without the table
     books exactly as it always has.
   - A DATE OVERRIDE STILL WINS. shared_date_overrides opens, closes or
     re-hours ONE day; this is the default for every day nobody overrode.

   A slot is one hour, labelled by its start: hours(dow) for 8 to 17 is
   [8 .. 16], the 8-9 slot through the 4-5 slot. */
(function (g) {
  'use strict';

  var TABLE = 'shared_collection_slot_settings';
  var DEFAULTS = Object.freeze({
    weekday_open: 8, weekday_close: 17,
    sat_open: 8, sat_close: 12,
    rate_per_hour: 350,       // seedlings one booking loads in an hour
    max_load_per_hour: 600    // seedlings all bookings together may load in one hour
  });

  var cur = Object.assign({}, DEFAULTS);
  var state = { source: 'default', error: null, row: null };

  function intIn(v, lo, hi) {
    var n = Number(v);
    return (isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi) ? n : null;
  }

  /* What is wrong with a candidate setting, in words, or '' when nothing
     is. The settings page refuses to save while this says anything, and
     a stored row that fails it is not applied — a weekday that opens at
     the hour it closes is a week nobody can book. */
  function problem(s) {
    s = s || {};
    var wo = intIn(s.weekday_open, 0, 23), wc = intIn(s.weekday_close, 1, 24);
    var so = intIn(s.sat_open, 0, 23),     sc = intIn(s.sat_close, 1, 24);
    if (wo === null || wc === null) return 'Monday to Friday needs an opening and a closing hour.';
    if (wc <= wo) return 'Monday to Friday must close after it opens.';
    if (so === null || sc === null) return 'Saturday needs an opening and a closing hour.';
    if (sc <= so) return 'Saturday must close after it opens.';
    if (!(Number(s.rate_per_hour) > 0)) return 'Seedlings loaded per hour must be more than 0.';
    if (!(Number(s.max_load_per_hour) > 0)) return 'Maximum seedlings per hour slot must be more than 0.';
    return '';
  }

  function apply(row) {
    if (!row || problem(row)) return false;
    Object.keys(DEFAULTS).forEach(function (k) { cur[k] = Number(row[k]); });
    return true;
  }

  async function load(supa) {
    state.error = null;
    try {
      var r = await supa.from(TABLE).select('*').eq('id', 1).maybeSingle();
      if (r.error) { state.error = r.error; return get(); }
      state.row = r.data || null;
      state.source = apply(r.data) ? 'saved' : 'default';
    } catch (e) { state.error = e; }
    return get();
  }

  async function save(supa, s, who) {
    var why = problem(s);
    if (why) return { error: { message: why } };
    var row = { id: 1, updated_at: new Date().toISOString(), updated_by: who || null };
    Object.keys(DEFAULTS).forEach(function (k) { row[k] = Number(s[k]); });
    var r = await supa.from(TABLE).upsert(row, { onConflict: 'id' }).select().maybeSingle();
    if (!r.error) { state.row = r.data || row; state.source = 'saved'; apply(row); }
    return r;
  }

  function range(a, b) { var out = []; for (var h = a; h < b; h++) out.push(h); return out; }

  /* The slots of a day of the week (0 Sunday .. 6 Saturday). Sunday is
     closed, as it has always been. */
  function hours(dow) {
    if (dow === 0) return [];
    return dow === 6 ? range(cur.sat_open, cur.sat_close) : range(cur.weekday_open, cur.weekday_close);
  }
  function closing(dow) {
    if (dow === 0) return 0;
    return dow === 6 ? cur.sat_close : cur.weekday_close;
  }
  function opening(dow) {
    if (dow === 0) return 0;
    return dow === 6 ? cur.sat_open : cur.weekday_open;
  }

  function get() { return Object.assign({}, cur); }

  g.MJMCollectionSlots = {
    TABLE: TABLE, DEFAULTS: DEFAULTS,
    load: load, save: save, get: get, problem: problem,
    hours: hours, opening: opening, closing: closing,
    source: function () { return state.source; },
    error: function () { return state.error; },
    row: function () { return state.row; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
