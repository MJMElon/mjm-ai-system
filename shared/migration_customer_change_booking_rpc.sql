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
--   • supplied _order_number must match the booking's order_number (case-insensitive)
--   • _new_qty must be > 0
--   • _new_end_time must be after _new_start_time
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
           collection_qty = _new_qty
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
