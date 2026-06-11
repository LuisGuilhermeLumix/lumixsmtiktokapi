-- ═══════════════════════════════════════════════════════════════
-- Lumix Social Manager — 0001: schema inicial
-- Aplicar no Supabase via SQL Editor ou `supabase db push`
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── enums ────────────────────────────────────────────────────────
create type public.user_role as enum ('owner', 'admin', 'operator');
create type public.platform as enum ('tiktok');
create type public.social_account_status as enum ('connected', 'expired', 'revoked');
create type public.post_status as enum
  ('draft', 'scheduled', 'queued', 'publishing', 'published', 'failed');
create type public.post_target_status as enum
  ('pending', 'queued', 'publishing', 'published', 'failed');
-- valores literais da Content Posting API do TikTok
create type public.privacy_level as enum
  ('PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY');

-- ── trigger genérico de updated_at ──────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── organizações e usuários ─────────────────────────────────────
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- 1:1 com auth.users; criado por trigger/API no signup
create table public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  email      text not null unique,
  role       public.user_role not null default 'operator',
  created_at timestamptz not null default now()
);
create index users_org_id_idx on public.users (org_id);

-- ── clientes da agência ──────────────────────────────────────────
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null,
  notes      text,
  created_at timestamptz not null default now()
);
create index clients_org_id_idx on public.clients (org_id);

-- operators só enxergam clients atribuídos
create table public.client_assignments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index client_assignments_client_id_idx on public.client_assignments (client_id);

-- ── contas sociais conectadas ────────────────────────────────────
create table public.social_accounts (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients (id) on delete cascade,
  platform       public.platform not null default 'tiktok',
  tiktok_open_id text not null,
  display_name   text,
  avatar_url     text,
  status         public.social_account_status not null default 'connected',
  connected_at   timestamptz not null default now(),
  unique (client_id, platform, tiktok_open_id)
);
create index social_accounts_client_id_idx on public.social_accounts (client_id);

-- tokens criptografados (AES-256-GCM na aplicação) — acesso só via service role
create table public.oauth_tokens (
  id                 uuid primary key default gen_random_uuid(),
  social_account_id  uuid not null unique references public.social_accounts (id) on delete cascade,
  access_token_enc   text not null,
  refresh_token_enc  text not null,
  access_expires_at  timestamptz not null,
  refresh_expires_at timestamptz not null,
  scope              text not null,
  updated_at         timestamptz not null default now()
);
create trigger oauth_tokens_updated_at
  before update on public.oauth_tokens
  for each row execute function public.set_updated_at();

-- ── posts e alvos de publicação ──────────────────────────────────
create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  created_by    uuid not null references public.users (id) on delete restrict,
  caption       text not null default '',
  privacy_level public.privacy_level not null default 'SELF_ONLY',
  status        public.post_status not null default 'draft',
  media_path    text,                -- caminho no Supabase Storage (bucket post-media)
  schedule_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index posts_org_id_idx on public.posts (org_id);
create index posts_client_id_idx on public.posts (client_id);
create index posts_status_idx on public.posts (status);
create index posts_schedule_at_idx on public.posts (schedule_at)
  where status = 'scheduled';

-- um alvo por conta/plataforma; social_account_id define ONDE publicar
create table public.post_targets (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.posts (id) on delete cascade,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  platform          public.platform not null default 'tiktok',
  status            public.post_target_status not null default 'pending',
  publish_id        text,            -- publish_id retornado pelo TikTok no init
  tiktok_video_id   text,            -- id público do vídeo (PUBLISH_COMPLETE) — chave p/ video_metrics
  post_url          text,
  error             text,
  published_mode    text,            -- 'direct_post' | 'upload_draft' (fallback unaudited)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (post_id, social_account_id)
);
create index post_targets_post_id_idx on public.post_targets (post_id);
create index post_targets_status_idx on public.post_targets (status);
create trigger post_targets_updated_at
  before update on public.post_targets
  for each row execute function public.set_updated_at();

-- ── analytics ────────────────────────────────────────────────────
create table public.analytics_snapshots (
  id                uuid primary key default gen_random_uuid(),
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  captured_at       timestamptz not null default now(),
  followers         bigint not null default 0,
  following         bigint not null default 0,
  likes             bigint not null default 0,
  video_count       bigint not null default 0,
  raw               jsonb not null default '{}'::jsonb
);
create index analytics_snapshots_account_idx
  on public.analytics_snapshots (social_account_id, captured_at desc);

create table public.video_metrics (
  id             uuid primary key default gen_random_uuid(),
  post_target_id uuid not null references public.post_targets (id) on delete cascade,
  captured_at    timestamptz not null default now(),
  views          bigint not null default 0,
  likes          bigint not null default 0,
  comments       bigint not null default 0,
  shares         bigint not null default 0
);
create index video_metrics_target_idx
  on public.video_metrics (post_target_id, captured_at desc);

-- ── quotas e auditoria ───────────────────────────────────────────
create table public.usage_quota (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  client_id     uuid references public.clients (id) on delete cascade,
  period        text not null,       -- 'YYYY-MM'
  uploads_used  integer not null default 0,
  uploads_limit integer,             -- null = ilimitado
  unique nulls not distinct (org_id, client_id, period)
);
create index usage_quota_org_idx on public.usage_quota (org_id, period);

create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid references public.users (id) on delete set null,
  action     text not null,          -- ex.: post.publish, account.connect, client.delete
  entity     text not null,          -- ex.: post:<uuid>, social_account:<uuid>
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (org_id, created_at desc);

-- ── API keys (auth estilo upload-post p/ n8n e curl) ─────────────
create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null,
  key_prefix   text not null,        -- primeiros chars, exibição no painel
  key_hash     text not null unique, -- sha-256 da key; plaintext nunca é gravado
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index api_keys_org_id_idx on public.api_keys (org_id);
