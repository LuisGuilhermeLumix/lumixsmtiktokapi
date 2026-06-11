-- ═══════════════════════════════════════════════════════════════
-- Lumix Social Manager — 0002: Row Level Security
--
-- Modelo de acesso:
--   • usuário só acessa dados da própria org
--   • owner/admin: tudo da org | operator: só clients atribuídos
--     (via client_assignments)
--   • oauth_tokens e api_keys (escrita): SOMENTE service role
--     (API/worker) — nenhuma policy = deny all p/ authenticated
--   • escritas operacionais (post_targets, analytics, quotas,
--     audit) são feitas pela API/worker com service role, que
--     bypassa RLS; as policies abaixo cobrem o acesso direto do
--     dashboard com JWT do usuário
-- ═══════════════════════════════════════════════════════════════

-- ── funções helper (security definer evita recursão de RLS) ─────
create or replace function public.current_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select org_id from public.users where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

-- true se o usuário logado pode acessar o client:
-- mesmo org E (owner/admin OU operator atribuído)
create or replace function public.has_client_access(p_client_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.clients c on c.id = p_client_id and c.org_id = u.org_id
    where u.id = auth.uid()
      and (
        u.role in ('owner', 'admin')
        or exists (
          select 1 from public.client_assignments ca
          where ca.user_id = u.id and ca.client_id = p_client_id
        )
      )
  );
$$;

-- ── habilita RLS em todas as tabelas ─────────────────────────────
alter table public.organizations      enable row level security;
alter table public.users              enable row level security;
alter table public.clients            enable row level security;
alter table public.client_assignments enable row level security;
alter table public.social_accounts    enable row level security;
alter table public.oauth_tokens       enable row level security;
alter table public.posts              enable row level security;
alter table public.post_targets       enable row level security;
alter table public.analytics_snapshots enable row level security;
alter table public.video_metrics      enable row level security;
alter table public.usage_quota        enable row level security;
alter table public.audit_log          enable row level security;
alter table public.api_keys           enable row level security;

-- ── organizations ────────────────────────────────────────────────
create policy org_select on public.organizations
  for select to authenticated
  using (id = public.current_org_id());

create policy org_update on public.organizations
  for update to authenticated
  using (id = public.current_org_id() and public.current_user_role() = 'owner');

-- ── users (escrita de membros só via API/service role) ──────────
create policy users_select on public.users
  for select to authenticated
  using (org_id = public.current_org_id());

-- ── clients ──────────────────────────────────────────────────────
create policy clients_select on public.clients
  for select to authenticated
  using (public.has_client_access(id));

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_user_role() in ('owner', 'admin')
  );

create policy clients_update on public.clients
  for update to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_user_role() in ('owner', 'admin')
  );

create policy clients_delete on public.clients
  for delete to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_user_role() in ('owner', 'admin')
  );

-- ── client_assignments ───────────────────────────────────────────
create policy assignments_select on public.client_assignments
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.current_user_role() in ('owner', 'admin')
      and exists (
        select 1 from public.clients c
        where c.id = client_id and c.org_id = public.current_org_id()
      )
    )
  );

create policy assignments_manage on public.client_assignments
  for all to authenticated
  using (
    public.current_user_role() in ('owner', 'admin')
    and exists (
      select 1 from public.clients c
      where c.id = client_id and c.org_id = public.current_org_id()
    )
  )
  with check (
    public.current_user_role() in ('owner', 'admin')
    and exists (
      select 1 from public.clients c
      where c.id = client_id and c.org_id = public.current_org_id()
    )
  );

-- ── social_accounts (conexão OAuth grava via service role) ──────
create policy social_accounts_select on public.social_accounts
  for select to authenticated
  using (public.has_client_access(client_id));

create policy social_accounts_delete on public.social_accounts
  for delete to authenticated
  using (
    public.has_client_access(client_id)
    and public.current_user_role() in ('owner', 'admin')
  );

-- ── oauth_tokens: NENHUMA policy → deny all (service role only) ─

-- ── posts ────────────────────────────────────────────────────────
create policy posts_select on public.posts
  for select to authenticated
  using (public.has_client_access(client_id));

create policy posts_insert on public.posts
  for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and public.has_client_access(client_id)
    and created_by = auth.uid()
  );

create policy posts_update on public.posts
  for update to authenticated
  using (
    public.has_client_access(client_id)
    and (created_by = auth.uid() or public.current_user_role() in ('owner', 'admin'))
  );

create policy posts_delete on public.posts
  for delete to authenticated
  using (
    public.has_client_access(client_id)
    and (created_by = auth.uid() or public.current_user_role() in ('owner', 'admin'))
    and status in ('draft', 'scheduled', 'failed')
  );

-- ── post_targets (escrita só pelo worker/API) ────────────────────
create policy post_targets_select on public.post_targets
  for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and public.has_client_access(p.client_id)
    )
  );

-- ── analytics (escrita só pelo worker) ───────────────────────────
create policy analytics_snapshots_select on public.analytics_snapshots
  for select to authenticated
  using (
    exists (
      select 1 from public.social_accounts sa
      where sa.id = social_account_id and public.has_client_access(sa.client_id)
    )
  );

create policy video_metrics_select on public.video_metrics
  for select to authenticated
  using (
    exists (
      select 1
      from public.post_targets pt
      join public.posts p on p.id = pt.post_id
      where pt.id = post_target_id and public.has_client_access(p.client_id)
    )
  );

-- ── usage_quota (escrita só pela API/worker) ─────────────────────
create policy usage_quota_select on public.usage_quota
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and (client_id is null or public.has_client_access(client_id))
  );

-- ── audit_log (insert só pela API; leitura p/ owner/admin) ───────
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_user_role() in ('owner', 'admin')
  );

-- ── api_keys (criação via API/service role; painel lê metadados) ─
create policy api_keys_select on public.api_keys
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_user_role() in ('owner', 'admin')
  );

create policy api_keys_delete on public.api_keys
  for delete to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_user_role() in ('owner', 'admin')
  );
