# Zavro backend

Supabase (Postgres + Auth + Storage) with Vercel serverless routes in `api/`.

## Setup
1. Create a Supabase project, then run `supabase/migrations/0001_zavro_schema.sql` (SQL editor or `supabase db push`).
2. Copy `.env.example` values into Vercel environment variables (Settings > Environment Variables). Never commit real keys.
3. `npm install`, then deploy. First admin: sign up, then in SQL: `update public.profiles set role='admin' where id='<user id>';`
4. Create team users the same way and set `role` to `setter` or `closer`. For a client: insert a row in `clients`, then set the user's `profiles.client_id` to it.

## Routes
| Route | Who | Purpose |
|---|---|---|
| `POST /api/leads` | public | Save website enquiry, email notification + confirmation, AI score |
| `GET/PATCH /api/crm/leads` | team | List / update leads (RLS-scoped) |
| `GET/POST /api/crm/activities` | team | Lead notes |
| `GET /api/crm/stats` | team | Pipeline counts and revenue |
| `GET /api/portal/me` | client | Own projects, invoices, files (signed URLs) |
| `POST /api/ai/qualify` | team | Re-score a lead |
| `POST /api/ai/chat` | signed in | AI chat |

Auth: send the Supabase access token as `Authorization: Bearer <token>`.
Website form: POST JSON `{name,email,phone?,company?,message?}` to `/api/leads`; keep a hidden field `website` empty (spam honeypot).
