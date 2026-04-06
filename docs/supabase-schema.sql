create table if not exists public.attempts (
  attempt_id text primary key,
  learner_name text not null default '',
  learner_email text not null,
  started boolean not null default true,
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  completed_at timestamptz,
  minutes_spent integer not null default 0,
  responses jsonb not null default '{}'::jsonb,
  completion_email_sent_at timestamptz,
  admin_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attempts_learner_email_idx on public.attempts (learner_email);
create index if not exists attempts_updated_at_idx on public.attempts (updated_at desc);

create table if not exists public.email_dispatch_log (
  id bigint generated always as identity primary key,
  attempt_id text not null references public.attempts (attempt_id) on delete cascade,
  recipient text not null,
  template text not null,
  provider_id text,
  status text not null,
  error text not null default '',
  created_at timestamptz not null default now()
);

alter table public.attempts enable row level security;
alter table public.email_dispatch_log enable row level security;

-- RLS is enabled for safety. Server APIs should use SUPABASE_SERVICE_ROLE_KEY,
-- which bypasses RLS. Do not expose service role key to frontend.
