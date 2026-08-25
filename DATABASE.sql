-- POST BOT — Supabase schema
-- Apply in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint unique not null,
  username text,
  first_name text,
  last_name text,
  language_code text,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users add column if not exists settings jsonb not null default '{}'::jsonb;

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null references public.users(telegram_user_id) on delete cascade,
  content_type text not null check (content_type in ('text','photo','video','animation')),
  body text,
  caption text,
  telegram_file_id text,
  telegram_file_unique_id text,
  buttons jsonb not null default '[]'::jsonb,
  state text not null default 'creating',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drafts_user_idx
  on public.drafts(telegram_user_id);

create table if not exists public.buttons (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null references public.users(telegram_user_id) on delete cascade,
  label text not null,
  url text not null,
  row_index integer not null default 0,
  position_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null references public.users(telegram_user_id) on delete cascade,
  name text not null,
  content_type text not null default 'text',
  body text,
  caption text,
  buttons jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_user_idx
  on public.templates(telegram_user_id);

create table if not exists public.publish_targets (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null references public.users(telegram_user_id) on delete cascade,
  chat_id bigint not null,
  chat_title text,
  chat_username text,
  chat_type text,
  can_post boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(telegram_user_id, chat_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null references public.users(telegram_user_id) on delete cascade,
  content_type text not null,
  body text,
  caption text,
  telegram_file_id text,
  buttons jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Apply this constraint when upgrading an existing database created by V1.
alter table public.drafts drop constraint if exists drafts_content_type_check;
alter table public.drafts add constraint drafts_content_type_check
  check (content_type in ('text','photo','video','animation'));

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  telegram_user_id bigint not null references public.users(telegram_user_id) on delete cascade,
  chat_id bigint not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  telegram_message_id bigint,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_posts_due_idx
  on public.scheduled_posts(scheduled_for)
  where status = 'pending';

create unique index if not exists scheduled_posts_active_post_target_idx
  on public.scheduled_posts(post_id, chat_id)
  where status in ('pending', 'processing', 'published');

create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  telegram_user_id bigint not null references public.users(telegram_user_id) on delete cascade,
  chat_id bigint not null,
  telegram_message_id bigint,
  status text not null,
  error_code text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.processed_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);

-- A draft uses its own UUID as the post UUID. This makes concurrent publish
-- clicks converge on one post, while each target still gets its own publication.
create unique index if not exists publications_active_post_target_idx
  on public.publications(post_id, chat_id)
  where status in ('publishing', 'published');

-- For production, use RLS carefully. Server-side service-role access
-- should be kept exclusively in trusted backend code.
