import { z } from 'zod';
import { handle, send, httpError } from '../_lib/http.js';

const schema = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });

// Password sign-in for the /admin page. Passes credentials straight to Supabase Auth and
// returns the session; nothing is stored here. Supabase rate-limits repeated attempts.
export default handle(['POST'], async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'invalid_input');
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter((k) => !process.env[k]);
  if (missing.length) throw httpError(503, 'not_configured', { missing }); // names only, never values
  let r;
  try {
    r = await fetch(`${process.env.SUPABASE_URL.trim()}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_ANON_KEY.trim(), 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    console.error('auth upstream error', e?.cause?.code || e?.message);
    throw httpError(502, 'auth_unreachable', { reason: String(e?.cause?.code || e?.message).slice(0, 80) });
  }
  if (!r.ok) throw httpError(401, 'invalid_credentials');
  const s = await r.json();
  send(res, 200, { access_token: s.access_token, expires_in: s.expires_in });
});
