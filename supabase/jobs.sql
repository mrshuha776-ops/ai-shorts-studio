create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id uuid primary key,
  topic text not null,
  status text not null default 'queued' check (status in ('queued','running','ready','failed','cancelled')),
  current_step text not null default 'topic',
  options jsonb not null default '{}'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  result jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_status_updated_idx
  on public.jobs(status, updated_at desc);

alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;
grant all on public.jobs to service_role;
