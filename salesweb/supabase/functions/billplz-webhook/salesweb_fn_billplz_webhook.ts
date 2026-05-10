// Supabase Edge Function: Billplz Webhook
// Receives payment confirmation from Billplz and updates order status
// Deploy: supabase functions deploy billplz-webhook
// Set the webhook URL in Billplz dashboard to:
//   https://kibqjztozokohqmhqqqf.supabase.co/functions/v1/billplz-webhook
//
// Required secrets:
//   supabase secrets set BILLPLZ_X_SIGNATURE_KEY=<copy-from-Billplz-dashboard>
//
// Without BILLPLZ_X_SIGNATURE_KEY any caller could POST `paid=true` and forge
// payment confirmations. We refuse to run if the secret is missing.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// ── Billplz X-Signature verification ───────────────────────────────────────
// Billplz signs the webhook body with HMAC-SHA256 using the X-Signature Key.
// Source string = sort form fields by key (excluding `x_signature`), then
// concatenate `${key}${value}` and join pairs with `|`.
async function verifyBillplzSignature(
  formData: FormData,
  xSignatureKey: string,
): Promise<boolean> {
  const sigFromBody = (formData.get('x_signature') as string) || ''
  if (!sigFromBody) return false

  const entries: Array<[string, string]> = []
  for (const [k, v] of formData.entries()) {
    if (k === 'x_signature') continue
    entries.push([k, typeof v === 'string' ? v : ''])
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const base = entries.map(([k, v]) => `${k}${v}`).join('|')

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(xSignatureKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(base))
  const expected = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time comparison
  if (expected.length !== sigFromBody.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sigFromBody.charCodeAt(i)
  }
  return diff === 0
}

serve(async (req) => {
  try {
    const xSigKey = Deno.env.get('BILLPLZ_X_SIGNATURE_KEY') || ''
    if (!xSigKey) {
      // Refuse to run without the secret — otherwise webhook is forgeable.
      console.error('BILLPLZ_X_SIGNATURE_KEY not set; refusing to process webhook')
      return new Response('Server misconfigured: signature key missing', { status: 500 })
    }

    // Billplz sends POST with form-urlencoded body
    const formData = await req.formData()

    const sigOk = await verifyBillplzSignature(formData, xSigKey)
    if (!sigOk) {
      console.warn('Billplz webhook signature mismatch — rejecting request')
      return new Response('Invalid signature', { status: 401 })
    }

    const billId = formData.get('id') as string
    const paid = formData.get('paid') === 'true'
    const paidAt = formData.get('paid_at') as string
    const orderId = formData.get('reference_1') as string // We stored order_id here

    console.log('Billplz webhook (verified):', { billId, paid, paidAt, orderId })

    if (!orderId) {
      return new Response('No order reference', { status: 400 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase service-role env not configured')
      return new Response('Server misconfigured', { status: 500 })
    }
    const sb = createClient(supabaseUrl, supabaseKey)

    if (paid) {
      // Idempotency: if already confirmed, skip duplicate timeline entries
      const { data: existing } = await sb
        .from('salesweb_customer_orders')
        .select('status')
        .eq('id', orderId)
        .maybeSingle()
      if (existing?.status === 'Order Confirmed') {
        return new Response('OK (already confirmed)', { status: 200 })
      }

      await sb.from('salesweb_customer_orders')
        .update({ status: 'Order Confirmed' })
        .eq('id', orderId)

      await sb.from('salesweb_order_timeline').insert([{
        order_id: orderId,
        status: 'Payment Confirmed',
        note: `Online payment confirmed via Billplz (Bill: ${billId}, Paid at: ${paidAt})`,
        changed_by: 'billplz',
      }])
    } else {
      await sb.from('salesweb_order_timeline').insert([{
        order_id: orderId,
        status: 'Payment Failed',
        note: `Billplz payment not completed (Bill: ${billId})`,
        changed_by: 'billplz',
      }])
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('Internal error', { status: 500 })
  }
})
