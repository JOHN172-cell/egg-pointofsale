import { authenticate, readBody, sendJson, fail } from '../server/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { client } = await authenticate(req, ['manager', 'admin']);
    const backup = await readBody(req);
    if (!backup.settings || !Array.isArray(backup.products) || backup.products.length > 500
      || !Array.isArray(backup.sales) || backup.sales.length > 10000
      || !Array.isArray(backup.stockLogs) || backup.stockLogs.length > 50000) {
      return sendJson(res, 400, { error: 'Local POS data is invalid or exceeds the migration limits.' });
    }
    const { data, error } = await client.rpc('migrate_local_pos', {
      p_settings: backup.settings,
      p_products: backup.products,
      p_sales: backup.sales,
      p_stock_logs: backup.stockLogs
    });
    if (error) throw error;
    sendJson(res, 200, { importedRecords: data, message: 'Local data imported. The original browser data was kept unchanged.' });
  } catch (error) {
    fail(res, error);
  }
}
