import { handle, send } from '../_lib/http.js';
import { requireUser, TEAM } from '../_lib/auth.js';

// Pipeline counts and revenue, limited to leads the caller can see under RLS.
export default handle(['GET'], async (req, res) => {
  const { db } = await requireUser(req, TEAM);
  const { data, error } = await db.from('leads').select('status, deal_value_cents');
  if (error) throw error;
  const pipeline = {}; let wonCents = 0, openCents = 0;
  for (const l of data) {
    pipeline[l.status] = (pipeline[l.status] || 0) + 1;
    if (l.status === 'won') wonCents += Number(l.deal_value_cents);
    else if (l.status !== 'lost') openCents += Number(l.deal_value_cents);
  }
  send(res, 200, { pipeline, won_cents: wonCents, open_cents: openCents, total: data.length });
});
