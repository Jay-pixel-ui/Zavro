import { z } from 'zod';
import { handle, send, httpError } from '../_lib/http.js';
import { requireUser } from '../_lib/auth.js';
import { claude } from '../_lib/ai.js';
import { admin } from '../_lib/supabase.js';

const schema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).min(1).max(20),
});

// Signed-in users only, so the Anthropic key cannot be used anonymously.
export default handle(['POST'], async (req, res) => {
  const { user } = await requireUser(req);
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'invalid_input');
  const reply = await claude({
    system: 'You are the Zavro Solutions assistant. Help with questions about Zavro services and projects. Be concise.',
    messages: parsed.data.messages,
  });
  if (reply === null) throw httpError(503, 'ai_not_configured');
  await admin().from('ai_logs').insert({ endpoint: 'chat', user_id: user.id, input: { n: parsed.data.messages.length }, output: { chars: reply.length } });
  send(res, 200, { reply });
});
