import { authenticate, sendJson, fail } from '../../server/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { profile } = await authenticate(req);
    sendJson(res, 200, { user: { id: profile.id, name: profile.display_name, role: profile.role } });
  } catch (error) {
    fail(res, error);
  }
}
