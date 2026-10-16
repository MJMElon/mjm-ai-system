-- Customer-facing RPC to change an existing collection booking.
--
-- Why: the public CollectionTimeBooking page runs as the anon role. Direct
--      UPDATE against shared_collection_bookings is silently dropped by RLS,
--      so the "Change" flow in the customer view appeared to succeed but
--      never persisted the new quantity / date / time. This SECURITY DEFINER
--      RPC bypasses RLS while still validating that the caller knows the
--      order_number tied to the booking (matching the security model used
--      by find_my_bookings + book_collection_slot in migration_rls_hardening.sql).
--
-- Guard rails inside the function:
--   • booking must exist and not be cancelled
--   • supplied _order_number must match the bookings order_number (case-insensitive)
--   • _new_qty must be > 0
--   • _new_end_time must be after _new_start_time
--
-- A CONFIRMED booking that the customer reschedules to a different date or
-- time is no longer confirmed FOR that slot -- the office allocated a
-- nursery and a plot against the old slot, and that allocation says
-- nothing about whether the new one is coverable. So a reschedule that
-- actually moves the date or time drops a booked row back to pending, and
-- the office re-confirms it by dragging it onto a nursery again on the
-- Day View, the same action that confirmed it the first time. A
-- reschedule that only changes the quantity leaves status alone -- the
-- office asked for this to react to date/time only, and an allocation
-- already holds a plot regardless of exactly how many seedlings are
-- being collected on it.
--
-- Returns the updated row so the client can refresh its local cache.

CREATE OR REPLACE FUNCTION public.change_my_booking(
    _booking_id    uuid,
    _order_number  text,
    _new_date      date,
    _new_start     time,
    _new_end       time,
    _new_qty       integer
)
RETURNS TABLE (
    id              uuid,
    booking_date    date,
    start_time      time,
    end_time        time,
    customer_name   text,
    order_number    text,
    collection_qty  integer,
    status          text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    _exists boolean;
BEGIN
    IF _booking_id IS NULL THEN
        RAISE EXCEPTION 'booking_id is required';
    END IF;
    IF _order_number IS NULL OR length(trim(_order_number)) < 2 THEN
        RAISE EXCEPTION 'order_number is required';
    END IF;
    IF _new_qty IS NULL OR _new_qty <= 0 THEN
        RAISE EXCEPTION 'invalid quantity';
    END IF;
    IF _new_end <= _new_start THEN
        RAISE EXCEPTION 'end_time must be after start_time';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM shared_collection_bookings b
         WHERE b.id = _booking_id
           AND b.status <> 'cancelled'
           AND upper(b.order_number) = upper(trim(_order_number))
    ) INTO _exists;

    IF NOT _exists THEN
        RAISE EXCEPTION 'booking not found or order number does not match';
    END IF;

    RETURN QUERY
    UPDATE shared_collection_bookings b
       SET booking_date   = _new_date,
           start_time     = _new_start,
           end_time       = _new_end,
           collection_qty = _new_qty,
           status = CASE
                      WHEN b.status = 'booked'
                           AND (b.booking_date IS DISTINCT FROM _new_date
                                OR b.start_time IS DISTINCT FROM _new_start)
                      THEN 'pending'
                      ELSE b.status
                    END
     WHERE b.id = _booking_id
       AND b.status <> 'cancelled'
       AND upper(b.order_number) = upper(trim(_order_number))
    RETURNING
        b.id, b.booking_date, b.start_time, b.end_time,
        b.customer_name, b.order_number, b.collection_qty, b.status;
END;
$fn$;

REVOKE ALL ON FUNCTION public.change_my_booking(uuid, text, date, time, time, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_my_booking(uuid, text, date, time, time, integer) TO anon, authenticated;

-- What a good result looks like: ONE row, OK, with the function source
-- carrying the status-reset case the fix just added. NOT OK is the
-- function missing entirely, or installed without the new logic.
-- Matched on IS DISTINCT FROM _new_date, a marker unique to the new
-- CASE and quote-free, so the check needs no escaped quotes of its own.
SELECT
    CASE WHEN pg_get_functiondef(p.oid) LIKE '%IS DISTINCT FROM _new_date%'
         THEN 'change_my_booking now resets a confirmed booking to pending on reschedule -- OK'
         ELSE 'change_my_booking is missing the status-reset logic -- NOT OK'
    END AS result
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'change_my_booking'
UNION ALL
SELECT 'change_my_booking is not installed at all -- NOT OK'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'change_my_booking'
);
