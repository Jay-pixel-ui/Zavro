-- Zavro backend schema. Apply with: supabase db push  (or paste into the SQL editor)

create schema if not exists private;

create type public.app_role as enum ('admin','closer','setter','client');
create type public.lead_status as enum ('new','contacted','qualified','proposal','won','lost');
create type public.project_status as enum ('planning','in_progress','review','delivered','on_hold');
create type public.invoice_status as enum ('draft','sent','paid','overdue','void');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'client',
  full_name text,
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  company text,
  message text,
  source text not null default 'website',
  status public.lead_status not null default 'new',
  assigned_setter uuid references public.profiles(id) on delete set null,
  assigned_closer uuid references public.profiles(id) on delete set null,
  deal_value_cents bigint not null default 0 check (deal_value_cents >= 0),
  ai_score int check (ai_score between 0 and 100),
  ai_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_status_idx on public.leads(status);
create index leads_setter_idx on public.leads(assigned_setter);
create index leads_closer_idx on public.leads(assigned_closer);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  author uuid references public.profiles(id) on delete set null,
  kind text not null default 'note',
  note text not null,
  created_at timestamptz not null default now()
);
create index lead_activities_lead_idx on public.lead_activities(lead_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  status public.project_status not null default 'planning',
  progress int not null default 0 check (progress between 0 and 100),
  notes text,
  created_at timestamptz not null default now()
);
create index projects_client_idx on public.projects(client_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  number text not null unique,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'USD',
  status public.invoice_status not null default 'draft',
  due_date date,
  created_at timestamptz not null default now()
);
create index invoices_client_idx on public.invoices(client_id);

create table public.client_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  storage_path text not null unique,  -- "<client_id>/<filename>" in bucket client-files
  created_at timestamptz not null default now()
);
create index client_files_client_idx on public.client_files(client_id);

create table public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  user_id uuid,
  input jsonb,
  output jsonb,
  created_at timestamptz not null default now()
);

-- helpers (private schema so they are not exposed through the API)
create function private.my_role() returns public.app_role
  language sql stable security definer set search_path = '' as
  $$ select role from public.profiles where id = (select auth.uid()) $$;

create function private.my_client_id() returns uuid
  language sql stable security definer set search_path = '' as
  $$ select client_id from public.profiles where id = (select auth.uid()) $$;

create function private.is_team() returns boolean
  language sql stable security definer set search_path = '' as
  $$ select coalesce(private.my_role() in ('admin','closer','setter'), false) $$;

create function private.is_admin() returns boolean
  language sql stable security definer set search_path = '' as
  $$ select coalesce(private.my_role() = 'admin', false) $$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

create function public.touch_updated_at() returns trigger
  language plpgsql set search_path = '' as
  $$ begin new.updated_at = now(); return new; end $$;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- new auth users get a client-level profile; admins promote team members manually
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ begin
       insert into public.profiles(id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
       return new;
     end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- RLS
alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.projects enable row level security;
alter table public.invoices enable row level security;
alter table public.client_files enable row level security;
alter table public.ai_logs enable row level security;

-- profiles: see yourself; admins see/edit all. Users cannot change their own role.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_admin());
create policy profiles_admin_write on public.profiles for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- leads: public inserts go through the API (service role). Team access below.
create policy leads_select on public.leads for select to authenticated using (
  private.is_admin()
  or (private.is_team() and (assigned_setter = (select auth.uid())
       or assigned_closer = (select auth.uid())
       or (assigned_setter is null and assigned_closer is null))));
create policy leads_update on public.leads for update to authenticated using (
  private.is_admin()
  or (private.is_team() and (assigned_setter = (select auth.uid()) or assigned_closer = (select auth.uid()))))
  with check (
  private.is_admin()
  or (private.is_team() and (assigned_setter = (select auth.uid()) or assigned_closer = (select auth.uid()))));
create policy leads_admin_delete on public.leads for delete to authenticated using (private.is_admin());

create policy activities_select on public.lead_activities for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));
create policy activities_insert on public.lead_activities for insert to authenticated
  with check (author = (select auth.uid()) and exists (select 1 from public.leads l where l.id = lead_id));

-- clients / projects / invoices / files: team (admin only writes), clients read their own
create policy clients_select on public.clients for select to authenticated
  using (private.is_team() or id = private.my_client_id());
create policy clients_admin_write on public.clients for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy projects_select on public.projects for select to authenticated
  using (private.is_team() or client_id = private.my_client_id());
create policy projects_admin_write on public.projects for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy invoices_select on public.invoices for select to authenticated
  using (private.is_admin() or client_id = private.my_client_id());
create policy invoices_admin_write on public.invoices for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy files_select on public.client_files for select to authenticated
  using (private.is_team() or client_id = private.my_client_id());
create policy files_admin_write on public.client_files for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy ai_logs_admin on public.ai_logs for select to authenticated using (private.is_admin());

-- private storage bucket for client files; path must start with the client's id
insert into storage.buckets(id, name, public) values ('client-files','client-files', false)
  on conflict (id) do nothing;
create policy client_files_read on storage.objects for select to authenticated using (
  bucket_id = 'client-files'
  and (private.is_team() or (storage.foldername(name))[1] = private.my_client_id()::text));
create policy client_files_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'client-files' and private.is_admin())
  with check (bucket_id = 'client-files' and private.is_admin());
