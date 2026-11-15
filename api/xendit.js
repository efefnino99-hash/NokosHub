import { supabase } from '../src/config/supabase.js';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && aa.length > 0 && (awaitImportTimingSafeEqual(aa, bb));
}
function awaitImportTimingSafeEqual(a, b) {
  // Fixed-length comparison; token should be a long random secret.
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!safeEqual(req.headers['x-callback-token'], process.env.XENDIT_WEBHOOK_TOKEN || '')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const event = req.body;
    const payment = event?.data;
    if (event?.event !== 'payment.capture' || payment?.status !== 'SUCCEEDED') {
      return res.status(200).json({ received: true, processed: false });
    }
    if (payment.currency !== 'IDR' || payment.country !== 'ID') return res.status(400).json({ error: 'Invalid currency/country' });
    const { data, error } = await supabase.rpc('credit_topup', {
      p_reference_id: payment.reference_id,
      p_payment_id: payment.payment_id,
      p_amount: payment.request_amount
    });
    if (error) throw error;
    return res.status(200).json({ success: true, result: data });
  } catch (e) {
    console.error('Xendit webhook error:', e);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
