import { authenticate, readBody, sendJson, fail } from '../../server/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { client } = await authenticate(req, ['manager', 'admin']);
    const body = await readBody(req);
    if (typeof body.productId !== 'string' || !Number.isSafeInteger(body.delta) || body.delta === 0
        || typeof body.reason !== 'string' || !body.reason.trim()) {
      return sendJson(res, 400, { error: 'A product, non-zero whole-crate change, and reason are required.' });
    }
    const type = body.type === 'DELIVERY' ? 'delivery' : 'adjustment';
    const { error } = await client.rpc('adjust_pos_stock', {
      p_product_id: body.productId,
      p_delta: body.delta,
      p_reason: body.reason.trim().slice(0, 500),
      p_movement_type: type
    });
    if (error) throw error;
    sendJson(res, 200, { ok: true });
  } catch (error) {
    fail(res, error);
  }
}
