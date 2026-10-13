import { authenticate, readBody, sendJson, fail } from '../../server/backend.js';
import { randomUUID } from 'node:crypto';

export default async function handler(req, res) {
  if (!['POST', 'PATCH'].includes(req.method)) return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { client } = await authenticate(req, ['manager', 'admin']);
    const body = await readBody(req);
    const id = String(body.id || `prod-${randomUUID()}`).slice(0, 80);
    const retailCents = Math.round(Number(body.retailPrice) * 100);
    const wholesaleCents = Math.round(Number(body.wholesalePrice) * 100);
    const lowStock = Number(body.lowStockLevel);
    const initialStock = req.method === 'POST' ? Number(body.stock || 0) : 0;
    if (typeof body.name !== 'string' || typeof body.sizeLabel !== 'string'
      || !Number.isSafeInteger(retailCents) || retailCents < 0
      || !Number.isSafeInteger(wholesaleCents) || wholesaleCents < 0
      || !Number.isSafeInteger(lowStock) || lowStock < 0
      || !Number.isSafeInteger(initialStock) || initialStock < 0) {
      return sendJson(res, 400, { error: 'Product details and whole-crate stock values are invalid.' });
    }
    const { error } = await client.rpc('save_pos_product', {
      p_id: id,
      p_name: body.name.trim(),
      p_size_label: body.sizeLabel.trim(),
      p_description: String(body.description || '').trim(),
      p_retail_price_cents: retailCents,
      p_wholesale_price_cents: wholesaleCents,
      p_low_stock_level: lowStock,
      p_active: body.active !== false,
      p_initial_crates: initialStock
    });
    if (error) throw error;
    sendJson(res, 200, { ok: true, id });
  } catch (error) {
    fail(res, error);
  }
}
