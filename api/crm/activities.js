import { z } from 'zod';
import { handle, send, httpError } from '../_lib/http.js';
import { requireUser, TEAM } from '../_lib/auth.js';

const schema = z.object({ lead_id: z.string().uuid(), kind: z.string().max(30).default('note'), note: z.string().trim().min(1).max(4000) });

export default handle(['GET', 'POST'], async (req, res) => {
  const { db, user } = await requireUser(req, TEAM);
  if (req.method === 'GET') {
    const id = z.string().uuid().safeParse(req.query.lead_id);
    if (!id.success) throw httpError(400, 'lead_id_required');
    const { data, error } = await db.from('lead_activities').select('*').eq('lead_id', id.data).order('created_at', { ascending: false });
    if (error) throw error;
    return send(res, 200, { activities: data });
  }
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'invalid_input', parsed.error.flatten().fieldErrors);
  const { data, error } = await db.from('lead_activities').insert({ ...parsed.data, author: user.id }).select().single();
  if (error) throw httpError(403, 'forbidden_or_unknown_lead');
  send(res, 201, { activity: data });
});
