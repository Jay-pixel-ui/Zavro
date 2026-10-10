import { createClient } from '@supabase/supabase-js';
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

// Service role: bypasses RLS. Only use for trusted server work (public lead capture, AI logs).
export const admin = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);

// Acts as the signed-in user, so Row Level Security applies.
export const asUser = (token) => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  ...opts, global: { headers: { Authorization: `Bearer ${token}` } },
});
