import { publicClient, adminClient, readBody, sendJson, fail, setSessionCookies, assertSameOrigin } from '../../server/backend.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  try {
    assertSameOrigin(req);
    const { email, password } = await readBody(req);
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return sendJson(res, 400, { error: 'Enter your email and password.' });
    }
    const client = publicClient();
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) return sendJson(res, 401, { error: 'Email or password was not accepted.' });

    const admin = adminClient();
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('id, display_name, role, active').eq('id', data.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.active) {
      await client.auth.signOut({ scope: 'local' });
      return sendJson(res, 403, { error: 'This staff account is not active. Contact an administrator.' });
    }
    setSessionCookies(res, data.session);
    sendJson(res, 200, { user: { id: profile.id, name: profile.display_name, role: profile.role } });
  } catch (error) {
    fail(res, error);
  }
}
