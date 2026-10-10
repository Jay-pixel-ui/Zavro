import { z } from 'zod';
import { handle, send, httpError } from '../_lib/http.js';
import { requireUser, TEAM } from '../_lib/auth.js';

const patch = z.object({
  id: z.string().uuid(),
  status: z.enum(['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']).optional(),
  assigned_setter: z.string().uuid().nullable().optional(),
  assigned_closer: z.string().uuid().nullable().optional(),
  deal_value_cents: z.number().int().min(0).optional(),
}).strict();

// RLS decides which leads each team member can see or change.
export default handle(['GET', 'PATCH'], async (req, res) => {
  const { db, role } = await requireUser(req, TEAM);
  if (req.method === 'GET') {
    let q = db.from('leads').select('*').order('created_at', { ascending: false }).limit(200);
    if (req.query.status) q = q.eq('status', String(req.query.status));
    const { data, error } = await q;
    if (error) throw error;
    return send(res, 200, { leads: data });
  }
  const parsed = patch.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'invalid_input', parsed.error.flatten().fieldErrors);
  const { id, ...changes } = parsed.data;
  // only admins may reassign or set deal value
  if (role !== 'admin' && ('assigned_setter' in changes || 'assigned_closer' in changes || 'deal_value_cents' in changes))
    throw httpError(403, 'admin_only_fields');
  const { data, error } = await db.from('leads').update(changes).eq('id', id).select().single();
  if (error || !data) throw httpError(404, 'not_found_or_forbidden');
  send(res, 200, { lead: data });
});
