import { authenticate, adminClient, readBody, sendJson, fail } from '../../server/backend.js';

export default async function handler(req, res) {
  try {
    const { user, profile } = await authenticate(req, ['manager', 'admin']);
    const admin = adminClient();
    if (req.method === 'GET') {
      const { data, error } = await admin.from('profiles')
        .select('id,display_name,role,active,created_at').order('created_at');
      if (error) throw error;
      return sendJson(res, 200, { users: data });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
        || typeof body.password !== 'string' || body.password.length < 12
        || typeof body.displayName !== 'string' || !body.displayName.trim()
        || !['cashier', ...(profile.role === 'admin' ? ['manager'] : [])].includes(body.role)) {
        return sendJson(res, 400, { error: 'Provide a valid email, name, staff role, and password with at least 12 characters.' });
      }
      const { data, error } = await admin.auth.admin.createUser({
        email: body.email.trim(),
        password: body.password,
        email_confirm: true
      });
      if (error) throw error;
      const { error: profileError } = await client.rpc('create_pos_profile', {
        p_user_id: data.user.id,
        p_display_name: body.displayName.trim().slice(0, 120),
        p_role: body.role
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }
      return sendJson(res, 201, { id: data.user.id });
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      if (typeof body.id !== 'string' || body.id === user.id
        || (body.role !== undefined && !['cashier', 'manager'].includes(body.role))
        || (body.active !== undefined && typeof body.active !== 'boolean')) {
        return sendJson(res, 400, { error: 'Staff changes are invalid; administrators cannot edit their own account here.' });
      }
      const { error } = await client.rpc('update_pos_profile', {
        p_target_id: body.id,
        p_role: body.role ?? null,
        p_active: body.active ?? null
      });
      if (error) throw error;
      return sendJson(res, 200, { ok: true });
    }
    sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    fail(res, error);
  }
}
