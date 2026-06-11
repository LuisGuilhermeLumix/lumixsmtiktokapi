# Lumix Social Manager (LSM)

SaaS multi-tenant para agências gerenciarem contas TikTok de clientes:
conexão via OAuth, publicação/agendamento de vídeos, analytics e
integração com n8n. MVP focado em TikTok, arquitetura preparada para
Instagram/YouTube.

## Estrutura do monorepo (pnpm workspaces)

```
apps/
  web/      → Next.js 15 — dashboard + landing pública (Tailwind v4)
  api/      → Fastify — REST + OAuth TikTok + OpenAPI
  worker/   → BullMQ — publish, status polling, analytics, token-refresh
packages/
  db/       → migrations Supabase + RLS + client tipado
  shared/   → tipos, validações zod, constantes, cripto AES-256-GCM
  tiktok/   → SDK interno TikTok (OAuth, Content Posting API v2, Display API)
```

## Stack

Next.js 15 · Fastify · BullMQ + Redis · Supabase (Postgres/Auth/Storage) ·
TypeScript · pnpm · Deploy via EasyPanel (Docker).

## Desenvolvimento local

```bash
pnpm install
cp .env.example .env   # preencha as variáveis
pnpm dev               # todos os apps em paralelo
# ou individualmente:
pnpm dev:web    # http://localhost:3000
pnpm dev:api    # http://localhost:3001
pnpm dev:worker
```

Requisitos: Node >= 20, pnpm 9, Redis local (ou via Docker) e um projeto
Supabase.

## Deploy

Passo-a-passo completo do EasyPanel em [docs/DEPLOY.md](docs/DEPLOY.md).
Resumo: cada app tem seu `Dockerfile` (build context = raiz do monorepo),
`docker-compose.yml` na raiz serve de referência de portas/envs, e o
Redis roda como serviço do EasyPanel.

```bash
# testar os builds de produção localmente
docker compose up --build
```

### Bootstrap do banco (uma vez)

1. Aplicar migrations no Supabase: `packages/db/migrations/0001..0003`
   (SQL Editor, em ordem).
2. Criar usuário em Authentication → Users e rodar:

```sql
insert into organizations (name) values ('Lumix Agency');
insert into users (id, org_id, email, role)
values ('<uuid-do-auth-user>',
        (select id from organizations where name = 'Lumix Agency'),
        'seu@email.com', 'owner');
```
