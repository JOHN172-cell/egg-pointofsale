import { adminClient, authenticate, sendJson } from '../../server/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token) {
    try {
      await authenticate(req);
      const { error } = await adminClient().auth.admin.signOut(token, 'global');
      if (error) throw error;
    } catch { /* The browser clears its session even if the token already expired. */ }
  }
  sendJson(res, 200, { ok: true });
}
