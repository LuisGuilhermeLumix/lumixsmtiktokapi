-- Motor de Automações de Conteúdo IA: niche packs, personagens, workflows
-- (grafo + plano compilado) e runtime (runs → videos → scenes) + observabilidade.
-- IDs canônicos de run/video/scene são TEXT (formato auto:{wf}:{data}:{slot}…),
-- determinísticos → o próprio PK garante idempotência.
-- Vídeos finais reusam o bucket post-media (mesma convenção de path).

-- ───────────── niche packs (dado, não código) ─────────────
-- org_id NULL = pack global (legível por todas as orgs).
create table public.niche_packs (
  id          text primary key,            -- slug, ex.: 'fazenda-ugc'
  org_id      uuid references public.organizations (id) on delete cascade,
  name        text not null,
  data        jsonb not null default '{}'::jsonb,  -- hooks[], banned_terms[], replacements{}, style…
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index niche_packs_org_idx on public.niche_packs (org_id);
create trigger niche_packs_updated_at
  before update on public.niche_packs
  for each row execute function public.set_updated_at();

-- ───────────── personagens (fictícios/anônimos) ─────────────
create table public.characters (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  name                text not null,
  description         text not null default '',
  reference_image_url text,
  traits              jsonb not null default '{}'::jsonb,
  created_by          uuid references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index characters_org_idx on public.characters (org_id);
create trigger characters_updated_at
  before update on public.characters
  for each row execute function public.set_updated_at();

-- ───────────── workflows (autoria + execução) ─────────────
create table public.automation_workflows (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  client_id     uuid references public.clients (id) on delete set null,
  name          text not null,
  status        text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  graph         jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,  -- AutomationGraph
  compiled_plan jsonb,                                                    -- CompiledPlan validado
  graph_hash    text,
  -- desnormalizado do nó Schedule p/ o scan varrer rápido:
  timezone      text not null default 'America/Sao_Paulo',
  post_times    text[] not null default '{}',
  lead_time_min integer not null default 20,
  created_by    uuid references public.users (id) on delete set null,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index automation_workflows_org_idx on public.automation_workflows (org_id);
create index automation_workflows_status_idx on public.automation_workflows (status);
create trigger automation_workflows_updated_at
  before update on public.automation_workflows
  for each row execute function public.set_updated_at();

-- ───────────── runs (id determinístico) ─────────────
create table public.automation_runs (
  id               text primary key,        -- auto:{wf}:{YYYY-MM-DD}:{slot}
  org_id           uuid not null references public.organizations (id) on delete cascade,
  workflow_id      uuid not null references public.automation_workflows (id) on delete cascade,
  run_date         date not null,
  slot             text not null,           -- ex.: '08:00'
  status           text not null default 'queued'
                     check (status in ('queued','planning','running','partial','done','failed','skipped')),
  credits_reserved integer not null default 0,
  credits_settled  integer not null default 0,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index automation_runs_workflow_idx on public.automation_runs (workflow_id);
create index automation_runs_date_slot_idx on public.automation_runs (run_date, slot);
create index automation_runs_status_idx on public.automation_runs (status);
create trigger automation_runs_updated_at
  before update on public.automation_runs
  for each row execute function public.set_updated_at();

-- ───────────── videos (1 por conta/run) ─────────────
create table public.automation_videos (
  id                text primary key,       -- {run}:acct:{accountId}:{n}
  run_id            text not null references public.automation_runs (id) on delete cascade,
  org_id            uuid not null references public.organizations (id) on delete cascade,
  social_account_id uuid references public.social_accounts (id) on delete set null,
  idx               integer not null default 0,
  status            text not null default 'queued'
                      check (status in ('queued','scripting','rendering_scenes','stitching','publishing','published','failed')),
  caption           text,
  num_scenes        integer,
  final_url         text,
  storage_path      text,
  post_id           uuid references public.posts (id) on delete set null,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index automation_videos_run_idx on public.automation_videos (run_id);
create index automation_videos_account_idx on public.automation_videos (social_account_id);
create index automation_videos_status_idx on public.automation_videos (status);
create trigger automation_videos_updated_at
  before update on public.automation_videos
  for each row execute function public.set_updated_at();

-- ───────────── scenes (cenas de um video) ─────────────
create table public.automation_scenes (
  id              text primary key,         -- {video}:scene:{i}
  video_id        text not null references public.automation_videos (id) on delete cascade,
  org_id          uuid not null references public.organizations (id) on delete cascade,
  idx             integer not null default 0,
  status          text not null default 'queued'
                    check (status in ('queued','image','video','done','failed')),
  beat            text,                      -- trecho do roteiro
  prompt          text,                      -- prompt de imagem da cena
  image_url       text,
  video_url       text,
  provider        text,                      -- 'magichour' | 'kie'
  provider_task_id text,
  credits_charged integer not null default 0,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index automation_scenes_video_idx on public.automation_scenes (video_id);
create index automation_scenes_status_idx on public.automation_scenes (status);
create index automation_scenes_task_idx on public.automation_scenes (provider_task_id);
create trigger automation_scenes_updated_at
  before update on public.automation_scenes
  for each row execute function public.set_updated_at();

-- ───────────── observabilidade por etapa ─────────────
create table public.automation_run_steps (
  id         uuid primary key default gen_random_uuid(),
  run_id     text not null references public.automation_runs (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  step       text not null,                 -- id do nó / nome do passo
  status     text not null check (status in ('started','done','failed')),
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index automation_run_steps_run_idx on public.automation_run_steps (run_id, created_at);

-- ───────────── RLS (por organização) ─────────────
alter table public.niche_packs          enable row level security;
alter table public.characters           enable row level security;
alter table public.automation_workflows enable row level security;
alter table public.automation_runs      enable row level security;
alter table public.automation_videos    enable row level security;
alter table public.automation_scenes    enable row level security;
alter table public.automation_run_steps enable row level security;

-- niche packs: leem globais (org_id null) + os da própria org; escrevem só os próprios
create policy niche_packs_read on public.niche_packs
  for select using (org_id is null or org_id = public.current_org_id());
create policy niche_packs_write on public.niche_packs
  for all using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

create policy characters_org on public.characters
  for all using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy automation_workflows_org on public.automation_workflows
  for all using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy automation_runs_org on public.automation_runs
  for all using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy automation_videos_org on public.automation_videos
  for all using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy automation_scenes_org on public.automation_scenes
  for all using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy automation_run_steps_org on public.automation_run_steps
  for select using (org_id = public.current_org_id());
