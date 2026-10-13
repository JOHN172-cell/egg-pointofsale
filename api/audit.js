import { authenticate, sendJson, fail } from '../server/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { client } = await authenticate(req, ['manager', 'admin']);
    const { data, error } = await client.from('audit_log')
      .select('id,action,entity_type,entity_id,before_data,after_data,created_at,actor:profiles!audit_log_actor_id_fkey(display_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    sendJson(res, 200, { entries: data });
  } catch (error) {
    fail(res, error);
  }
}
