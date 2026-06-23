-- SaaS multi-tenant: planos + limites, assinatura (pronta p/ billing) e
-- provisionamento automático de workspace no cadastro (signup self-service).
-- Cada usuário do Supabase Auth vira owner de uma organização própria; todo o
-- isolamento já é por org_id + RLS (migrations anteriores).

-- ───────────── planos (limites por tier) ─────────────
-- limite NULL = ilimitado.
create table public.plans (
  id                   text primary key,       -- 'free' | 'starter' | 'pro' | 'agency'
  name                 text not null,
  max_clients          integer,
  max_social_accounts  integer,
  monthly_credits      integer not null default 0,
  price_cents          integer not null default 0,
  features             jsonb not null default '{}'::jsonb,
  sort                 integer not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

insert into public.plans (id, name, max_clients, max_social_accounts, monthly_credits, price_cents, sort) values
  ('free',    'Free',       1,    2,    100,      0, 0),
  ('starter', 'Starter',    3,    10,   1000,  4900, 1),
  ('pro',     'Pro',        10,   50,   5000, 14900, 2),
  ('agency',  'Agency',     null, null, 50000,49900, 3);

-- ───────────── plano da organização ─────────────
alter table public.organizations
  add column if not exists plan text not null default 'free' references public.plans (id),
  add column if not exists trial_ends_at timestamptz;

-- ───────────── assinatura (futuro: Stripe/etc.) ─────────────
create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null unique references public.organizations (id) on delete cascade,
  plan                     text not null default 'free' references public.plans (id),
  status                   text not null default 'active'
                             check (status in ('active', 'trialing', 'past_due', 'canceled')),
  provider                 text,                 -- 'stripe' | ...
  provider_customer_id     text,
  provider_subscription_id text,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ───────────── provisionamento automático no signup ─────────────
-- Roda como SECURITY DEFINER (bypassa RLS) ao inserir em auth.users.
-- Cria a organização, o usuário (owner) e um cliente padrão — tudo atômico.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_org_name text;
begin
  v_org_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'workspace'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'company'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.organizations (name, plan)
  values (v_org_name, 'free')
  returning id into v_org_id;

  insert into public.users (id, org_id, email, role)
  values (new.id, v_org_id, new.email, 'owner');

  insert into public.subscriptions (org_id, plan, status)
  values (v_org_id, 'free', 'active');

  -- cliente padrão p/ o usuário já conectar contas (camada "clientes" opcional)
  insert into public.clients (org_id, name)
  values (v_org_id, 'Minha conta');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── RLS ─────────────
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

-- planos são públicos (catálogo de preços/limites)
create policy plans_read on public.plans for select using (true);

-- assinatura: a org lê a sua
create policy subscriptions_read on public.subscriptions
  for select using (org_id = public.current_org_id());
