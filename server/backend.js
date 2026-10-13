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

export function cookieValue(req, name) {
  const cookie = req.headers.cookie || '';
  const value = cookie.split(';').map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
  return value ? decodeURIComponent(value) : '';
}

export function setSessionCookies(res, session) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const accessAge = Math.max(60, Number(session.expires_in) || 1800);
  res.setHeader('Set-Cookie', [
    `sylcat_access=${encodeURIComponent(session.access_token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${accessAge}${secure}`,
    `sylcat_refresh=${encodeURIComponent(session.refresh_token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`
  ]);
}

export function clearSessionCookies(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `sylcat_access=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
    `sylcat_refresh=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`
  ]);
}

export function assertSameOrigin(req) {
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  let originHost = '';
  try { originHost = new URL(origin).host; } catch { /* invalid and missing origins are rejected below */ }
  if (!host || !originHost || originHost.toLowerCase() !== host.toLowerCase()) {
    throw Object.assign(new Error('Cross-origin request blocked.'), { statusCode: 403 });
  }
}

export async function authenticate(req, allowedRoles = ['cashier', 'manager', 'admin']) {
  requireConfiguration();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) assertSameOrigin(req);
  const token = cookieValue(req, 'sylcat_access');
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
    .filter(adjustment => ['refund', 'void'].includes(adjustment.adjustment_type))
    .reduce((sum, adjustment) => sum + Number(adjustment.amount_cents), 0);
  const returnedByProduct = new Map();
  for (const adjustment of adjustments) {
    for (const returned of adjustment.returned_items || []) {
      returnedByProduct.set(returned.productId,
        (returnedByProduct.get(returned.productId) || 0) + Number(returned.crates || 0));
    }
  }
  const mappedItems = items.map(item => {
    const remainingReturned = returnedByProduct.get(item.product_id) || 0;
    const cratesReturned = Math.min(item.crates, remainingReturned);
    returnedByProduct.set(item.product_id, remainingReturned - cratesReturned);
    return {
      productId: item.product_id,
      name: item.product_name,
      sizeLabel: item.size_label,
      crates: item.crates,
      cratesReturned,
      netCrates: item.crates - cratesReturned,
      unitPrice: toMoney(item.unit_price_cents),
      lineTotal: toMoney(item.line_total_cents)
    };
  });
  const balanceDue = row.status === 'voided' ? 0 : Math.max(0, row.balance_due_cents - refundedCents);
  const amountPaid = row.status === 'voided' ? 0
    : Math.max(0, row.amount_paid_cents - Math.max(0, refundedCents - row.balance_due_cents));
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
    netCrates: mappedItems.reduce((sum, item) => sum + item.netCrates, 0),
    items: mappedItems,
    paymentMethod: row.payment_method,
    paymentDetails: {
      ...row.payment_details,
      amountPaid: toMoney(amountPaid),
      balanceDue: toMoney(balanceDue)
    },
    refundedAmount: toMoney(refundedCents),
    netTotal: row.status === 'voided' ? 0 : Math.max(0, toMoney(row.total_cents) - toMoney(refundedCents)),
    status: row.status.toUpperCase()
  };
}
