import { adminClient, cookieValue, sendJson, clearSessionCookies, assertSameOrigin } from '../../server/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    assertSameOrigin(req);
    const token = cookieValue(req, 'sylcat_access');
    if (token) await adminClient().auth.admin.signOut(token, 'global');
  } catch (error) {
    if (error.statusCode === 403) return sendJson(res, 403, { error: error.message });
    console.error('Unable to revoke POS session:', error.message);
  } finally {
    clearSessionCookies(res);
  }
  sendJson(res, 200, { ok: true });
}
