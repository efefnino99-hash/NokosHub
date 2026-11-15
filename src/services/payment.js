import { randomUUID } from 'node:crypto';
import { supabase } from '../config/supabase.js';

const apiVersion = '2024-11-11';

export async function createTopup(telegramId, amount) {
  const min = Number(process.env.TOPUP_MIN || 10000);
  const max = Number(process.env.TOPUP_MAX || 1000000);
  if (!Number.isSafeInteger(amount) || amount < min || amount > max) {
    throw new Error(`Nominal topup harus Rp${min.toLocaleString('id-ID')}–Rp${max.toLocaleString('id-ID')}`);
  }

  const referenceId = `NRH-${randomUUID()}`;
  const { error: insertError } = await supabase.from('topups').insert({
    reference_id: referenceId, telegram_id: String(telegramId), amount, status: 'creating'
  });
  if (insertError) throw insertError;

  try {
    const response = await fetch('https://api.xendit.co/v3/payment_requests', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.XENDIT_SECRET_KEY}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        'api-version': apiVersion,
        'idempotency-key': referenceId
      },
      body: JSON.stringify({
        reference_id: referenceId,
        type: 'PAY',
        country: 'ID',
        currency: 'IDR',
        request_amount: amount,
        capture_method: 'AUTOMATIC',
        channel_code: 'QRIS',
        channel_properties: {
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          qr_string_type: 'DYNAMIC'
        },
        description: `Top up ${process.env.STORE_NAME || 'NokosRayHub'} ${referenceId}`
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || JSON.stringify(data));

    const qr = (data.actions || []).find(a => a.descriptor === 'QR_STRING')?.value;
    if (!qr || !data.payment_request_id) throw new Error('Respons Xendit tidak berisi QR_STRING / payment_request_id');

    const { error: updateError } = await supabase.from('topups').update({
      status: 'pending', xendit_payment_request_id: data.payment_request_id,
      qr_string: qr, expires_at: data.channel_properties?.expires_at || null
    }).eq('reference_id', referenceId);
    if (updateError) throw updateError;
    return { referenceId, amount, qrString: qr };
  } catch (err) {
    await supabase.from('topups').update({ status: 'failed' }).eq('reference_id', referenceId);
    throw err;
  }
}
