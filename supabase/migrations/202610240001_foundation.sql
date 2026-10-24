-- Tenvoria foundation schema
-- Run in Supabase SQL Editor. RLS is enabled on all user-owned tables.
create extension if not exists pgcrypto;

create table if not exists public.company_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_key text not null,
  title text not null check (char_length(title) between 1 and 180),
  department text not null check (department in ('Research','Development','Media Studio','Growth & Sales','Finance','Quality')),
  description text not null default '',
  status text not null default 'Needs approval' check (status in ('Needs approval','Approved','In progress','Completed','Rejected','Failed')),
  estimated_cost_eur numeric(12,2) not null default 0 check (estimated_cost_eur >= 0),
  approved_cost_eur numeric(12,2) not null default 0 check (approved_cost_eur >= 0),
  output text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, task_key)
);

create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider_key text not null,
  display_name text not null,
  provider_type text not null check (provider_type in ('LLM','Agent','Image','Video','Speech')),
  capabilities text[] not null default '{}',
  billing_mode text not null default 'Free tier' check (billing_mode in ('Free tier','Paid','Self-hosted')),
  enabled boolean not null default false,
  endpoint_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(owner_id, provider_key)
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.company_tasks(id) on delete set null,
  event_type text not null,
  actor text not null default 'user',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.budget_policies (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  allow_paid_calls boolean not null default false,
  max_single_call_eur numeric(12,2) not null default 0 check (max_single_call_eur >= 0),
  daily_limit_eur numeric(12,2) not null default 0 check (daily_limit_eur >= 0),
  updated_at timestamptz not null default now()
);

alter table public.company_tasks enable row level security;
alter table public.ai_providers enable row level security;
alter table public.audit_events enable row level security;
alter table public.budget_policies enable row level security;

drop policy if exists "owners manage own tasks" on public.company_tasks;
create policy "owners manage own tasks" on public.company_tasks for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owners manage own providers" on public.ai_providers;
create policy "owners manage own providers" on public.ai_providers for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owners read own audit" on public.audit_events;
create policy "owners read own audit" on public.audit_events for select to authenticated
  using (owner_id = auth.uid());
drop policy if exists "owners read own budget" on public.budget_policies;
create policy "owners read own budget" on public.budget_policies for select to authenticated
  using (owner_id = auth.uid());
drop policy if exists "owners update own budget" on public.budget_policies;
create policy "owners update own budget" on public.budget_policies for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owners create own budget" on public.budget_policies;
create policy "owners create own budget" on public.budget_policies for insert to authenticated
  with check (owner_id = auth.uid());

create index if not exists company_tasks_owner_status_idx on public.company_tasks(owner_id, status, created_at desc);
create index if not exists audit_events_owner_created_idx on public.audit_events(owner_id, created_at desc);

-- Default policy: no paid usage until the founder explicitly changes it.
create or replace function public.create_default_budget_policy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.budget_policies(owner_id, allow_paid_calls, max_single_call_eur, daily_limit_eur)
  values (new.id, false, 0, 0) on conflict (owner_id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_create_budget on auth.users;
create trigger on_auth_user_create_budget after insert on auth.users
for each row execute procedure public.create_default_budget_policy();
