import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireConfiguration() {
  if (!url || !anonKey || !serviceRoleKey) throw new Error('Server database configuration is incomplete.');
}

export function publicClient() {
  requireConfiguration();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function adminClient() {
  requireConfiguration();
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authenticate(req, allowedRoles = ['cashier', 'manager', 'admin']) {
  requireConfiguration();
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw Object.assign(new Error('Sign in is required.'), { statusCode: 401 });
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('Your session has expired. Sign in again.'), { statusCode: 401 });
  const { data: profile, error: profileError } = await client.from('profiles')
    .select('id, display_name, role, active').eq('id', user.id).maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.active || !allowedRoles.includes(profile.role)) {
    throw Object.assign(new Error('You do not have permission to perform this action.'), { statusCode: 403 });
  }
  return { client, user, profile };
}

export function sendJson(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function fail(res, error) {
  const status = error.statusCode || (error.code === 'PGRST116' ? 404 : 400);
  sendJson(res, status, { error: error.message || 'The request could not be completed.' });
}

export function readBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) reject(Object.assign(new Error('Request is too large.'), { statusCode: 413 }));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

export function toMoney(amountCents) {
  return Number(amountCents) / 100;
}

export function mapProduct(row) {
  return {
    id: row.id,
    sizeKey: row.id.replace(/^prod-/, ''),
    name: row.name,
    sizeLabel: row.size_label,
    description: row.description,
    retailPrice: toMoney(row.retail_price_cents),
    wholesalePrice: toMoney(row.wholesale_price_cents),
    lowStockLevel: row.low_stock_level,
    active: row.active,
    stock: row.inventory?.[0]?.crates ?? row.inventory?.crates ?? 0
  };
}

export function mapSale(row, items = [], adjustments = []) {
  const refundedCents = adjustments
    .filter(adjustment => adjustment.adjustment_type === 'refund')
    .reduce((sum, adjustment) => sum + Number(adjustment.amount_cents), 0);
  return {
    id: row.id,
    saleNumber: row.sale_number,
    timestamp: row.sold_at,
    cashier: row.cashier?.display_name || '',
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    priceType: row.price_type,
    subtotal: toMoney(row.subtotal_cents),
    discountAmount: toMoney(row.discount_cents),
    discountPercent: row.subtotal_cents ? row.discount_cents / row.subtotal_cents * 100 : 0,
    grandTotal: toMoney(row.total_cents),
    totalCrates: items.reduce((sum, item) => sum + item.crates, 0),
    items: items.map(item => ({
      productId: item.product_id,
      name: item.product_name,
      sizeLabel: item.size_label,
      crates: item.crates,
      unitPrice: toMoney(item.unit_price_cents),
      lineTotal: toMoney(item.line_total_cents)
    })),
    paymentMethod: row.payment_method,
    paymentDetails: {
      ...row.payment_details,
      amountPaid: toMoney(Math.max(0, row.amount_paid_cents - Math.max(0, refundedCents - row.balance_due_cents))),
      balanceDue: toMoney(Math.max(0, row.balance_due_cents - refundedCents))
    },
    refundedAmount: toMoney(refundedCents),
    netTotal: row.status === 'voided' ? 0 : Math.max(0, toMoney(row.total_cents) - toMoney(refundedCents)),
    status: row.status.toUpperCase()
  };
}
