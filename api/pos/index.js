import { authenticate, sendJson, fail, mapProduct, mapSale } from '../../server/backend.js';

async function fetchAll(client, table, columns, orderColumn) {
  const rows = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await client.from(table).select(columns)
      .order(orderColumn, { ascending: false }).range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { client, profile } = await authenticate(req);
    const [settings, products, sales, movements] = await Promise.all([
      client.from('pos_settings').select('data').eq('id', 1).maybeSingle(),
      client.from('products').select('*, inventory(crates)').order('name'),
      fetchAll(client, 'sales', '*, cashier:profiles!sales_cashier_id_fkey(display_name), sale_items(*), sale_adjustments(*)', 'sold_at'),
      fetchAll(client, 'stock_movements', '*, product:products(name), actor:profiles!stock_movements_actor_id_fkey(display_name)', 'created_at')
    ]);
    const result = [settings, products].find(item => item.error);
    if (result) throw result.error;

    const mappedSales = sales.map(row => mapSale(row, row.sale_items, row.sale_adjustments));
    const mappedMovements = movements.map(row => ({
      id: row.id,
      timestamp: row.created_at,
      productId: row.product_id,
      productName: row.product?.name || '',
      type: row.movement_type.toUpperCase(),
      cratesChanged: row.crates_delta,
      previousStock: row.previous_crates,
      newStock: row.new_crates,
      reason: row.reason,
      refId: row.reference,
      cashier: row.actor?.display_name || ''
    }));
    sendJson(res, 200, {
      user: { id: profile.id, name: profile.display_name, role: profile.role },
      settings: settings.data?.data || {
        businessName: 'Sylcat Farms', phone: '0244606689', address: '', currency: 'GHS',
        currencySymbol: 'GH₵', crateSize: 30, bulkDiscountThreshold: 10, bulkDiscountPercent: 10,
        cashierName: profile.display_name
      },
      products: products.data.map(mapProduct),
      sales: mappedSales,
      stockLogs: mappedMovements
    });
  } catch (error) {
    fail(res, error);
  }
}
