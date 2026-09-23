// shared_month_lock.js — one lock calendar for Delivery Orders, Approval
// Letters and Batch Record. Change one copy of this file, every page that
// includes it (<script src="../shared/shared_month_lock.js">) picks it up.
//
// A month auto-locks on its own auto-lock date — the 2nd of the following
// month by default, but that date is itself editable per month (System
// Settings → Delivery Order, AL & Batch Record Lock). A manual override
// beats the auto-lock computation entirely, in either direction: an admin
// can force a month open past its auto-lock date, or force one locked
// early. null/absent means "use the computed default" — same "access
// fails open" rule this system follows elsewhere: nobody has to visit
// this screen for a month to behave exactly as its default says.
(function (global) {
    let rows = [];

    // month is 1-based (Jan=1). JS Date's 0-based month index for the
    // NEXT calendar month equals this month's own 1-based number, so
    // `new Date(year, month, 2)` (month left as the 1-based value) lands
    // on the 2nd of the month after it — no +1/-1 juggling needed.
    function defaultAutoLockDate(year, month) {
        return new Date(year, month, 2);
    }

    async function load(supabase) {
        try {
            const { data, error } = await supabase.from('shared_month_locks').select('*');
            if (error) throw error;
            rows = data || [];
        } catch (e) {
            // Table not created yet, or a load error — same as no rows:
            // every month falls back to its computed default.
            rows = [];
        }
    }

    function rowFor(year, month) {
        return rows.find(r => r.year === year && r.month === month) || null;
    }

    function autoLockDateFor(year, month) {
        const row = rowFor(year, month);
        return (row && row.auto_lock_date) ? new Date(row.auto_lock_date) : defaultAutoLockDate(year, month);
    }

    function isMonthLocked(year, month) {
        const row = rowFor(year, month);
        if (row && row.manual_override !== null && row.manual_override !== undefined) return row.manual_override;
        return new Date() >= autoLockDateFor(year, month);
    }

    // The one function DO/AL/Batch Record actually call: is the record
    // dated `dateStr` (any parseable date/timestamp string) locked right
    // now? No date at all is never locked — there's nothing to place on
    // the calendar.
    function isDateLocked(dateStr) {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d)) return false;
        return isMonthLocked(d.getFullYear(), d.getMonth() + 1);
    }

    async function setManualOverride(supabase, year, month, locked, updatedBy) {
        const { error } = await supabase.from('shared_month_locks')
            .upsert({ year, month, manual_override: locked, updated_at: new Date().toISOString(), updated_by: updatedBy || null }, { onConflict: 'year,month' });
        if (!error) await load(supabase);
        return error;
    }

    async function setAutoLockDate(supabase, year, month, dateStr, updatedBy) {
        const { error } = await supabase.from('shared_month_locks')
            .upsert({ year, month, auto_lock_date: dateStr || null, updated_at: new Date().toISOString(), updated_by: updatedBy || null }, { onConflict: 'year,month' });
        if (!error) await load(supabase);
        return error;
    }

    global.MJMMonthLock = {
        load, isMonthLocked, isDateLocked, rowFor, autoLockDateFor, defaultAutoLockDate,
        setManualOverride, setAutoLockDate
    };
})(window);
