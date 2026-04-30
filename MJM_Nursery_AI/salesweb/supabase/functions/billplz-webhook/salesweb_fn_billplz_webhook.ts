// Supabase Edge Function: Billplz Webhook
// Receives payment confirmation from Billplz and updates order status
// Deploy: supabase functions deploy billplz-webhook
// Set the webhook URL in Billplz dashboard to:
//   https://kibqjztozokohqmhqqqf.supabase.co/functions/v1/billplz-webhook

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    // Billplz sends POST with form-urlencoded body
    const formData = await req.formData()
    const billId = formData.get('id') as string
    const paid = formData.get('paid') === 'true'
    const paidAt = formData.get('paid_at') as string
    const orderId = formData.get('reference_1') as string // We stored order_id here

    console.log('Billplz webhook:', { billId, paid, paidAt, orderId })

    if (!orderId) {
      return new Response('No order reference', { status: 400 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const sb = createClient(supabaseUrl, supabaseKey)

    if (paid) {
      // Update order status to paid
      await sb.from('salesweb_customer_orders')
        .update({ status: 'Order Confirmed' })
        .eq('id', orderId)

      // Add timeline entry
      await sb.from('salesweb_order_timeline').insert([{
        order_id: orderId,
        status: 'Payment Confirmed',
        note: `Online payment confirmed via Billplz (Bill: ${billId}, Paid at: ${paidAt})`,
        changed_by: 'billplz'
      }])
    } else {
      // Payment failed or pending
      await sb.from('salesweb_order_timeline').insert([{
        order_id: orderId,
        status: 'Payment Failed',
        note: `Billplz payment not completed (Bill: ${billId})`,
        changed_by: 'billplz'
      }])
    }

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('Error', { status: 500 })
  }
})
