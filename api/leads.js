import { z } from 'zod';
import { handle, send, httpError } from './_lib/http.js';
import { admin } from './_lib/supabase.js';
import { sendLeadEmails } from './_lib/email.js';
import { qualifyLead } from './_lib/ai.js';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(160).optional(),
  message: z.string().trim().max(4000).optional(),
  source: z.string().trim().max(60).optional(),
  website: z.string().max(0).optional(), // honeypot: must stay empty
});

// Public endpoint: website enquiry/contact forms POST here.
export default handle(['POST'], async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw httpError(400, 'invalid_input', parsed.error.flatten().fieldErrors);
  const { website, ...input } = parsed.data;
  const { data: lead, error } = await admin().from('leads')
    .insert({ ...input, source: input.source || 'website' }).select().single();
  if (error) throw error;
  // Best effort: a failed email or AI call must not lose the lead.
  await Promise.allSettled([sendLeadEmails(lead), qualifyLead(lead)]);
  send(res, 201, { ok: true });
});
