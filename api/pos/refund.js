import { authenticate, readBody, sendJson, fail } from '../../server/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { client } = await authenticate(req, ['manager', 'admin']);
    const body = await readBody(req);
    const amountCents = Math.round(Number(body.amount) * 100);
    if (typeof body.saleId !== 'string' || !Number.isSafeInteger(amountCents) || amountCents <= 0
      || typeof body.reason !== 'string' || body.reason.trim().length < 3
      || !Array.isArray(body.returnItems)) {
      return sendJson(res, 400, { error: 'Refund amount, reason, sale, and returned crate quantities are required.' });
    }
    if (body.returnItems.some(item => typeof item.productId !== 'string'
      || !Number.isSafeInteger(item.crates) || item.crates <= 0)
      || new Set(body.returnItems.map(item => item.productId)).size !== body.returnItems.length) {
      return sendJson(res, 400, { error: 'Returned stock must use a single positive whole-crate quantity per product.' });
    }
    const { error } = await client.rpc('refund_pos_sale', {
      p_sale_id: body.saleId,
      p_amount_cents: amountCents,
      p_reason: body.reason.trim(),
      p_return_items: body.returnItems.map(item => ({ productId: item.productId, crates: item.crates })),
      p_void: body.void === true
    });
    if (error) throw error;
    sendJson(res, 200, { ok: true });
  } catch (error) {
    fail(res, error);
  }
}
