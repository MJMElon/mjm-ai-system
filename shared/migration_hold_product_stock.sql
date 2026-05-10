-- ================================================================
-- MJM System — hold_product_stock RPC
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
--
-- This function is called from salesweb_payment.html / payment.html when
-- a customer submits payment proof, to atomically deduct the purchased
-- quantity from salesweb_products.stock_qty. The salesweb pages currently
-- fall back to a direct UPDATE if the RPC is missing — that fallback is
-- subject to a race condition between two concurrent buyers, which can
-- oversell stock. Installing this RPC closes that race.
--
-- The function is SECURITY DEFINER so the customer (anon JWT) doesn't
-- need direct UPDATE access to salesweb_products. It validates inputs
-- and only decrements when there is enough stock; otherwise it raises.
-- ================================================================

CREATE OR REPLACE FUNCTION public.hold_product_stock(
    p_product_id uuid,
    p_qty        integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    _affected integer;
BEGIN
    IF p_product_id IS NULL THEN
        RAISE EXCEPTION 'product_id required';
    END IF;
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RAISE EXCEPTION 'qty must be a positive integer';
    END IF;

    UPDATE salesweb_products
       SET stock_qty  = stock_qty - p_qty,
           updated_at = now()
     WHERE id = p_product_id
       AND stock_qty >= p_qty;

    GET DIAGNOSTICS _affected = ROW_COUNT;
    IF _affected = 0 THEN
        RAISE EXCEPTION 'insufficient stock for product %', p_product_id
            USING ERRCODE = '23514';   -- check_violation
    END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.hold_product_stock(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hold_product_stock(uuid, integer) TO anon, authenticated;
