import { authenticate, readBody, sendJson, fail, mapSale } from '../../server/backend.js';
import { randomUUID } from 'node:crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { client, user } = await authenticate(req);
    const body = await readBody(req);
    if (!body || Array.isArray(body) || !['retail', 'wholesale'].includes(body.priceType)
      || (body.customerName !== undefined && typeof body.customerName !== 'string')
      || (body.customerPhone !== undefined && typeof body.customerPhone !== 'string')
      || !body.paymentDetails || typeof body.paymentDetails !== 'object' || Array.isArray(body.paymentDetails)) {
      return sendJson(res, 400, { error: 'Sale details are invalid.' });
    }
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
      return sendJson(res, 400, { error: 'A sale must include between 1 and 100 products.' });
    }
    const normalizedItems = body.items.map(item => ({
      productId: String(item.productId || ''),
      crates: Number(item.crates)
    }));
    if (normalizedItems.some(item => !item.productId || !Number.isSafeInteger(item.crates) || item.crates <= 0)) {
      return sendJson(res, 400, { error: 'Sale quantities must be positive whole crates.' });
    }
    if (new Set(normalizedItems.map(item => item.productId)).size !== normalizedItems.length) {
      return sendJson(res, 400, { error: 'Each product can appear only once on a sale.' });
    }
    const method = body.paymentMethod;
    if (!['cash', 'momo', 'card', 'credit', 'split'].includes(method)) {
      return sendJson(res, 400, { error: 'Choose a supported payment method.' });
    }

    const payment = body.paymentDetails || {};
    const unsafeCardFields = Object.keys(payment).some(key => /^(pan|cardnumber|cvv|cvc)$/i.test(key));
    if (unsafeCardFields) return sendJson(res, 400, { error: 'Do not enter or send card numbers or security codes.' });
    for (const field of ['reference', 'network', 'phone', 'notes', 'dueDate']) {
      if (payment[field] !== undefined && (typeof payment[field] !== 'string' || payment[field].length > 200)) {
        return sendJson(res, 400, { error: `Payment ${field} is invalid.` });
      }
    }
    const amountPaidCents = method === 'cash'
      ? Math.max(0, Math.round(Number(payment.amountTendered) * 100))
      : method === 'credit' ? 0 : undefined;
    if (method === 'cash' && (!Number.isSafeInteger(amountPaidCents) || amountPaidCents < 0)) {
      return sendJson(res, 400, { error: 'Enter a valid cash amount tendered.' });
    }
    const details = Object.fromEntries(
      ['method', 'network', 'phone', 'reference', 'dueDate', 'notes', 'amountTendered', 'change']
        .filter(key => payment[key] !== undefined)
        .map(key => [key, payment[key]])
    );
    if (method === 'split') {
      const splits = [payment.split1, payment.split2].filter(Boolean).map(split => ({
        method: split.method,
        amountCents: Math.round(Number(split.amount) * 100)
      }));
      if (splits.length !== 2 || splits.some(split => !['cash', 'momo', 'card', 'credit'].includes(split.method)
        || !Number.isSafeInteger(split.amountCents) || split.amountCents < 0)) {
        return sendJson(res, 400, { error: 'Enter valid amounts for both payment methods.' });
      }
      details.splitAmounts = splits;
    }
    const idempotencyKey = body.idempotencyKey;
    if (typeof idempotencyKey !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      return sendJson(res, 400, { error: 'Invalid sale request identifier.' });
    }
    const { data, error } = await client.rpc('create_pos_sale', {
      p_idempotency_key: idempotencyKey,
      p_customer_name: String(body.customerName || '').slice(0, 200),
      p_customer_phone: String(body.customerPhone || '').slice(0, 40),
      p_price_type: body.priceType,
      p_items: normalizedItems,
      p_payment_method: method,
      p_amount_paid_cents: amountPaidCents ?? 0,
      p_payment_details: details
    });
    if (error) throw error;

    const { data: row, error: saleError } = await client.from('sales')
      .select('*, cashier:profiles!sales_cashier_id_fkey(display_name), sale_items(*), sale_adjustments(*)')
      .eq('id', data.sale_id).single();
    if (saleError) throw saleError;
    sendJson(res, 201, { sale: mapSale(row, row.sale_items, row.sale_adjustments), actor: user.id });
  } catch (error) {
    fail(res, error);
  }
}
