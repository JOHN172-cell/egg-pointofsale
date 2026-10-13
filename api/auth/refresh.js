import { publicClient, adminClient, cookieValue, sendJson, fail, setSessionCookies, clearSessionCookies, assertSameOrigin } from '../../server/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    assertSameOrigin(req);
    const refreshToken = cookieValue(req, 'sylcat_refresh');
    if (typeof refreshToken !== 'string' || !refreshToken) {
      return sendJson(res, 401, { error: 'Your session has expired. Sign in again.' });
    }
    const { data, error } = await publicClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) return sendJson(res, 401, { error: 'Your session has expired. Sign in again.' });
    const { data: profile, error: profileError } = await adminClient().from('profiles')
      .select('active').eq('id', data.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.active) {
      clearSessionCookies(res);
      return sendJson(res, 403, { error: 'This staff account is not active.' });
    }
    setSessionCookies(res, data.session);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    fail(res, error);
  }
}
