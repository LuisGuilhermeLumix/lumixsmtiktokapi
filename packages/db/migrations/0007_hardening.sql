-- Hardening (auditoria): operações atômicas de crédito/quota (corrigem race de
-- read-modify-write), índices faltantes, e cap no nome de workspace do signup.

-- ───────────── créditos atômicos (corrige double-spend) ─────────────
-- Debita com guarda atômica; retorna o novo saldo, ou -1 se insuficiente.
create or replace function public.charge_credits(
  p_org uuid, p_amount integer, p_reason text, p_generation_id uuid default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if p_amount <= 0 then
    select credits_balance into v_balance from organizations where id = p_org;
    return coalesce(v_balance, 0);
  end if;
  update organizations
     set credits_balance = credits_balance - p_amount
   where id = p_org and credits_balance >= p_amount
   returning credits_balance into v_balance;
  if not found then
    return -1; -- saldo insuficiente (nada debitado)
  end if;
  insert into credit_ledger (org_id, delta, reason, generation_id, balance_after)
    values (p_org, -p_amount, p_reason, p_generation_id, v_balance);
  return v_balance;
end; $$;

create or replace function public.refund_credits(
  p_org uuid, p_amount integer, p_reason text, p_generation_id uuid default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if p_amount <= 0 then
    select credits_balance into v_balance from organizations where id = p_org;
    return coalesce(v_balance, 0);
  end if;
  update organizations set credits_balance = credits_balance + p_amount
   where id = p_org returning credits_balance into v_balance;
  if not found then return -1; end if;
  insert into credit_ledger (org_id, delta, reason, generation_id, balance_after)
    values (p_org, p_amount, p_reason, p_generation_id, v_balance);
  return v_balance;
end; $$;

-- ───────────── quota de upload atômica (lock + check + incr) ─────────────
create or replace function public.consume_upload_quota(
  p_org uuid, p_client uuid, p_period text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_cli_used int; v_cli_limit int; v_org_used int; v_org_limit int;
begin
  select uploads_used, uploads_limit into v_cli_used, v_cli_limit
    from usage_quota where org_id = p_org and client_id = p_client and period = p_period for update;
  select uploads_used, uploads_limit into v_org_used, v_org_limit
    from usage_quota where org_id = p_org and client_id is null and period = p_period for update;

  if v_cli_limit is not null and coalesce(v_cli_used, 0) >= v_cli_limit then return false; end if;
  if v_org_limit is not null and coalesce(v_org_used, 0) >= v_org_limit then return false; end if;

  insert into usage_quota (org_id, client_id, period, uploads_used)
    values (p_org, p_client, p_period, 1)
    on conflict (org_id, client_id, period) do update
      set uploads_used = usage_quota.uploads_used + 1;
  if v_org_used is not null then
    update usage_quota set uploads_used = uploads_used + 1
      where org_id = p_org and client_id is null and period = p_period;
  end if;
  return true;
end; $$;

-- ───────────── último snapshot por conta (corrige heurística limit n*4) ─────────────
create or replace function public.latest_account_snapshots(p_account_ids uuid[])
returns table (social_account_id uuid, followers integer, likes integer, video_count integer)
language sql stable security definer set search_path = public as $$
  select distinct on (social_account_id) social_account_id, followers, likes, video_count
    from analytics_snapshots
   where social_account_id = any(p_account_ids)
   order by social_account_id, captured_at desc;
$$;

-- ───────────── transição atômica de status de run (corrige finalize duplo) ─────────────
-- Retorna true só para QUEM transicionou o run para o estado terminal.
create or replace function public.finalize_run(p_run_id text, p_status text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  update automation_runs set status = p_status
   where id = p_run_id and status not in ('done', 'failed', 'partial')
   returning id into v_id;
  return v_id is not null;
end; $$;

-- ───────────── índices faltantes (escala) ─────────────
create index if not exists posts_org_created_idx on public.posts (org_id, created_at desc);
create index if not exists posts_created_by_idx on public.posts (created_by);
create index if not exists audit_log_user_idx on public.audit_log (user_id);
create index if not exists automation_videos_post_idx on public.automation_videos (post_id);
create index if not exists content_automations_account_idx on public.content_automations (social_account_id);

-- ───────────── cap no nome de workspace vindo do signup (anti-junk/XSS) ─────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org_id uuid; v_org_name text;
begin
  v_org_name := left(
    regexp_replace(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'workspace'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'company'), ''),
        split_part(new.email, '@', 1)
      ),
      '[[:cntrl:]]', '', 'g'
    ), 120
  );
  insert into public.organizations (name, plan) values (v_org_name, 'free') returning id into v_org_id;
  insert into public.users (id, org_id, email, role) values (new.id, v_org_id, new.email, 'owner');
  insert into public.subscriptions (org_id, plan, status) values (v_org_id, 'free', 'active');
  insert into public.clients (org_id, name) values (v_org_id, 'Minha conta');
  return new;
end; $$;
