import { admin, asUser } from './supabase.js';
import { httpError } from './http.js';

export async function requireUser(req, roles) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw httpError(401, 'missing_token');
  const db = asUser(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw httpError(401, 'invalid_token');
  const { data: profile } = await db.from('profiles').select('role, client_id').eq('id', data.user.id).single();
  if (!profile) throw httpError(403, 'no_profile');
  if (roles && !roles.includes(profile.role)) throw httpError(403, 'forbidden');
  return { user: data.user, role: profile.role, clientId: profile.client_id, db };
}
export const TEAM = ['admin', 'closer', 'setter'];
