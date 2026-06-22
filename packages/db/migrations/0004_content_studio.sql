-- Estúdio de Conteúdo IA: gerações (imagem/vídeo via kie.ai), automações
-- (esteira nicho→cenas→vídeo→publicação) e razão de créditos.

-- saldo de créditos por organização (cobrança = custo kie + markup oculto)
alter table public.organizations
  add column if not exists credits_balance integer not null default 0;

-- ───────────── gerações avulsas / de automação ─────────────
create table public.generations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  client_id       uuid references public.clients (id) on delete set null,
  created_by      uuid references public.users (id) on delete set null,
  automation_id   uuid,                         -- preenchido quando vem da esteira
  kind            text not null check (kind in ('image', 'video')),
  model           text not null,                -- model enviado ao /jobs/createTask
  prompt          text not null default '',
  input           jsonb not null default '{}'::jsonb,
  status          text not null default 'queued'
                    check (status in ('queued', 'processing', 'done', 'failed')),
  kie_task_id     text,
  result_url      text,
  storage_path    text,                         -- cópia no bucket (opcional)
  credits_charged integer not null default 0,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index generations_org_id_idx on public.generations (org_id, created_at desc);
create index generations_status_idx on public.generations (status);
create index generations_task_idx on public.generations (kie_task_id);
create index generations_automation_idx on public.generations (automation_id);
create trigger generations_updated_at
  before update on public.generations
  for each row execute function public.set_updated_at();

-- ───────────── automações (esteira de conteúdo) ─────────────
create table public.content_automations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  client_id          uuid references public.clients (id) on delete set null,
  social_account_id  uuid not null references public.social_accounts (id) on delete cascade,
  created_by         uuid references public.users (id) on delete set null,
  niche              text not null,
  videos_per_day     integer not null default 1 check (videos_per_day between 1 and 12),
  video_duration     integer not null default 8,
  image_model        text not null,
  video_model        text not null,
  scene_agent_prompt text not null default '',
  video_agent_prompt text not null default '',
  post_times         text[] not null default '{}',   -- ['08:00','17:00'] (timezone da org)
  status             text not null default 'active'
                       check (status in ('active', 'paused')),
  last_run_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index content_automations_org_idx on public.content_automations (org_id);
create index content_automations_status_idx on public.content_automations (status);
create trigger content_automations_updated_at
  before update on public.content_automations
  for each row execute function public.set_updated_at();

alter table public.generations
  add constraint generations_automation_fk
  foreign key (automation_id) references public.content_automations (id) on delete set null;

-- ───────────── razão de créditos (auditável) ─────────────
create table public.credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  delta         integer not null,              -- negativo = cobrança, positivo = recarga
  reason        text not null,                 -- 'generation' | 'topup' | 'refund' | ...
  generation_id uuid references public.generations (id) on delete set null,
  balance_after integer not null,
  created_at    timestamptz not null default now()
);
create index credit_ledger_org_idx on public.credit_ledger (org_id, created_at desc);

-- ───────────── RLS (espelha o padrão das demais tabelas por org) ─────────────
alter table public.generations enable row level security;
alter table public.content_automations enable row level security;
alter table public.credit_ledger enable row level security;

create policy generations_org on public.generations
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy content_automations_org on public.content_automations
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());
create policy credit_ledger_org on public.credit_ledger
  for select using (org_id = public.current_org_id());
