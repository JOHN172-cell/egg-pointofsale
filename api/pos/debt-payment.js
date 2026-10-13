import { authenticate, readBody, sendJson, fail } from '../../server/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { client } = await authenticate(req, ['manager', 'admin']);
    const body = await readBody(req);
    const amountCents = Math.round(Number(body.amount) * 100);
    if (typeof body.saleId !== 'string' || !Number.isSafeInteger(amountCents) || amountCents <= 0
      || !['cash', 'mobile_money', 'card'].includes(body.method)) {
      return sendJson(res, 400, { error: 'Debt payment details are invalid.' });
    }
    const { error } = await client.rpc('collect_pos_debt', {
      p_sale_id: body.saleId,
      p_amount_cents: amountCents,
      p_method: body.method,
      p_reference: String(body.reference || '')
    });
    if (error) throw error;
    sendJson(res, 200, { ok: true });
  } catch (error) {
    fail(res, error);
  }
}
