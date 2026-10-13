import { authenticate, adminClient, sendJson, fail } from '../server/backend.js';

async function readRows(client, table) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from(table).select('data').range(offset, offset + 999);
    if (error) throw new Error(`Could not read legacy ${table}: ${error.message}`);
    result.push(...data.map(row => row.data));
    if (data.length < 1000) return result;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { client } = await authenticate(req, ['admin']);
    const admin = adminClient();
    const [settingsResult, products, sales, stockLogs] = await Promise.all([
      admin.from('pos_settings').select('data').eq('id', 1).maybeSingle(),
      readRows(admin, 'pos_products'),
      readRows(admin, 'pos_sales'),
      readRows(admin, 'pos_stock_logs')
    ]);
    if (settingsResult.error) throw settingsResult.error;
    if (!Array.isArray(products) || !Array.isArray(sales) || !Array.isArray(stockLogs)) {
      throw new Error('Legacy database data could not be read.');
    }
    const { data, error } = await client.rpc('migrate_local_pos', {
      p_settings: settingsResult.data?.data || {},
      p_products: products,
      p_sales: sales,
      p_stock_logs: stockLogs
    });
    if (error) throw error;
    sendJson(res, 200, {
      importedRecords: data,
      message: 'Legacy shared data was migrated. The old JSON tables were not deleted.'
    });
  } catch (error) {
    fail(res, error);
  }
}
