import { z } from 'zod';
import { handle, send, httpError } from '../_lib/http.js';
import { requireUser, TEAM } from '../_lib/auth.js';
import { qualifyLead } from '../_lib/ai.js';

export default handle(['POST'], async (req, res) => {
  const { db, user } = await requireUser(req, TEAM);
  const id = z.string().uuid().safeParse(req.body?.lead_id);
  if (!id.success) throw httpError(400, 'lead_id_required');
  const { data: lead } = await db.from('leads').select('*').eq('id', id.data).single(); // RLS check
  if (!lead) throw httpError(404, 'not_found_or_forbidden');
  const result = await qualifyLead(lead, user.id);
  if (!result) throw httpError(503, 'ai_not_configured');
  send(res, 200, result);
});
