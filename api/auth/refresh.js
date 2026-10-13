import { publicClient, readBody, sendJson, fail } from '../../server/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    const { refresh_token: refreshToken } = await readBody(req);
    if (typeof refreshToken !== 'string' || !refreshToken) {
      return sendJson(res, 401, { error: 'Your session has expired. Sign in again.' });
    }
    const { data, error } = await publicClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) return sendJson(res, 401, { error: 'Your session has expired. Sign in again.' });
    sendJson(res, 200, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at
    });
  } catch (error) {
    fail(res, error);
  }
}
