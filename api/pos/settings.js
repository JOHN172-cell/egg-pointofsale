import { authenticate, readBody, sendJson, fail } from '../../server/backend.js';

const allowedSettings = [
  'businessName', 'phone', 'address', 'currency', 'currencySymbol', 'crateSize',
  'bulkDiscountThreshold', 'bulkDiscountPercent', 'cashierName'
];

export default async function handler(req, res) {
  if (req.method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { client } = await authenticate(req, ['manager', 'admin']);
    const body = await readBody(req);
    const settings = Object.fromEntries(allowedSettings
      .filter(key => Object.hasOwn(body, key))
      .map(key => [key, body[key]]));
    if (!settings.businessName || typeof settings.phone !== 'string'
      || !Number.isInteger(settings.bulkDiscountThreshold) || settings.bulkDiscountThreshold < 1
      || !Number.isFinite(settings.bulkDiscountPercent) || settings.bulkDiscountPercent < 0 || settings.bulkDiscountPercent > 100) {
      return sendJson(res, 400, { error: 'Business settings contain invalid values.' });
    }
    const { data: oldRow, error: readError } = await client.from('pos_settings').select('data').eq('id', 1).maybeSingle();
    if (readError) throw readError;
    const merged = { ...(oldRow?.data || {}), ...settings };
    const { error } = await client.rpc('save_pos_settings', { p_data: merged });
    if (error) throw error;
    sendJson(res, 200, { settings: merged });
  } catch (error) {
    fail(res, error);
  }
}
