# Lumix Social Manager (LSM) — Arquitetura & Funcionamento

Documento de referência do projeto: o que é, como está organizado e **como cada parte funciona**.

> SaaS multi-tenant da **Lumix Agency** para gerenciar contas de **TikTok** de vários clientes:
> conexão por OAuth oficial, publicação, agendamento, analytics e um **Estúdio de Conteúdo IA**
> (geração de imagem/vídeo + esteira automática nicho → cenas → vídeo → publicação).

---

## Índice
1. [Visão geral](#1-visão-geral)
2. [Stack e infraestrutura](#2-stack-e-infraestrutura)
3. [Monorepo: apps e pacotes](#3-monorepo-apps-e-pacotes)
4. [Banco de dados](#4-banco-de-dados)
5. [Autenticação e permissões](#5-autenticação-e-permissões)
6. [Filas (BullMQ) e jobs](#6-filas-bullmq-e-jobs)
7. [Fluxos principais](#7-fluxos-principais)
8. [Estúdio de Conteúdo IA](#8-estúdio-de-conteúdo-ia)
9. [Sistema de créditos](#9-sistema-de-créditos)
10. [Landing page](#10-landing-page)
11. [Variáveis de ambiente](#11-variáveis-de-ambiente)
12. [Rodando local](#12-rodando-local)
13. [Deploy (EasyPanel)](#13-deploy-easypanel)
14. [Mapa de pastas](#14-mapa-de-pastas)

---

## 1. Visão geral

O LSM resolve a dor de uma agência que opera o TikTok de **muitos clientes**: conectar contas sem
pedir senha, publicar/agendar vídeos em escala, medir resultados e — com o Estúdio IA — **gerar o
conteúdo** e **publicar sozinho** todos os dias.

Três serviços + bancos:

```
                          ┌─────────────────────────────┐
   Navegador  ──────────▶ │  apps/web (Next.js 15)       │  painel + landing
   (agência)              └──────────────┬──────────────┘
                                         │ HTTPS (JWT Supabase)
                                         ▼
   n8n / curl ──Apikey──▶ ┌─────────────────────────────┐
                          │  apps/api (Fastify)          │  REST + webhooks
                          └───┬──────────────┬──────────-┘
                              │              │ enfileira jobs
                  Supabase ◀──┤              ▼
            (Postgres/Auth/   │     ┌──────────────────┐     ┌──────────────┐
             Storage)        │      │  Redis (BullMQ)  │ ◀── │ apps/worker  │
                              │     └──────────────────┘     │  (consumers) │
                              └──────────────────────────────┴──────┬───────┘
                                                                    │ APIs externas
                                            TikTok · kie.ai · Magic Hour
```

- **web** — UI do painel (privado) + landing pública.
- **api** — toda a lógica de negócio exposta como REST; valida, autoriza, grava no Supabase e
  **enfileira** trabalho pesado.
- **worker** — consome as filas e fala com as APIs externas (TikTok, kie.ai, Magic Hour); roda os
  **crons** (analytics, refresh de token, esteira de automação).

---

## 2. Stack e infraestrutura

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS v4, three.js + Spline (hero 3D) |
| API | Fastify + `fastify-type-provider-zod`, Swagger em `/docs` |
| Worker | BullMQ (filas e schedulers cron) |
| Banco | Supabase (Postgres + Auth + Storage) |
| Fila/cache | Redis (ioredis 5.10.1, pinado) |
| Linguagem | TypeScript (ESM) em todo o monorepo |
| Gerenciador | pnpm workspaces |
| Deploy | Docker + EasyPanel |

**Domínios de produção:** `lumixagencia.com` (web) e `api.lumixagencia.com` (API — é o
`redirect_uri` cadastrado no TikTok, precisa ser exatamente esse).

---

## 3. Monorepo: apps e pacotes

```
apps/
  web/      Next.js  (painel + landing)
  api/      Fastify  (REST + webhooks)
  worker/   BullMQ   (jobs + crons)
packages/
  db/       client Supabase tipado + tipos do banco + helpers de Storage
  shared/   tipos/constantes/validações + clientes de IA (kie, Magic Hour) + cripto
  tiktok/   SDK do TikTok (OAuth, publish, display, api)
```

### `packages/shared`
Código isomórfico compartilhado. Exporta por **subpaths**:
- `@lsm/shared` — constantes/tipos (`USER_ROLES`, `POST_STATUSES`, `GENERATION_KINDS`,
  nomes de fila, `publishJobId()`, etc.).
- `@lsm/shared/crypto` — AES-256-GCM (server-only) para cifrar tokens.
- `@lsm/shared/kie` — cliente da **kie.ai** + tabela de custo (`creditsForModel`).
- `@lsm/shared/magichour` — cliente da **Magic Hour**.

> Os pacotes são consumidos **compilados** (`dist/`). Ao mudar algo em `packages/*`, rode o `build`
> do pacote antes do `typecheck` dos apps (no Docker isso é automático).

### `packages/db`
- `createServiceClient()` — service role (API/worker), **bypassa RLS**. Nunca vai ao browser.
- `createUserClient()` — anon key + JWT do usuário, **RLS aplicado**.
- `POST_MEDIA_BUCKET` e `postMediaPath(org, client, post, file)` — convenção do Storage
  (`{org_id}/{client_id}/{post_id}/{arquivo}`), exigida pelas policies.
- `types.ts` — o tipo `Database` (mantido à mão, espelha as migrations). **Tem que ser `type`**
  (não `interface`), senão o supabase-js infere tudo como `never`.

### `packages/tiktok`
SDK do TikTok: `oauth` (start/exchange/refresh/revoke), `publish` (Content Posting API: init →
upload → status), `display`/`api` (perfil e métricas), `errors` (classifica erros: token
expirado, revogado, rate limit, etc.).

---

## 4. Banco de dados

Migrations em `packages/db/migrations/`:

| Migration | Conteúdo |
|---|---|
| `0001_schema.sql` | tabelas núcleo + enums + triggers `updated_at` |
| `0002_rls.sql` | Row-Level Security por organização |
| `0003_storage.sql` | bucket `post-media` + policies |
| `0004_content_studio.sql` | Estúdio IA: `generations`, `content_automations`, `credit_ledger`, `organizations.credits_balance` |

**Tabelas:**

- `organizations` — a agência (tenant). Tem `credits_balance` (créditos do Estúdio IA).
- `users` — membros da org, com `role` (`owner` | `admin` | `operator`).
- `clients` — os clientes da agência.
- `client_assignments` — quais clientes um `operator` enxerga.
- `social_accounts` — contas TikTok conectadas a um cliente (`status`: connected/expired/revoked).
- `oauth_tokens` — access/refresh **cifrados** (AES-256-GCM). Só service role acessa.
- `posts` — uma publicação (caption, privacy, status, `media_path`, `schedule_at`).
- `post_targets` — um alvo por conta/post (onde publicar). Guarda `publish_id`,
  `tiktok_video_id`, `post_url`, `status`, `published_mode` (`direct_post` ou `upload_draft`).
- `analytics_snapshots` — métricas da conta a cada 6h (followers, likes…).
- `video_metrics` — métricas por vídeo (views, likes, comments, shares).
- `usage_quota` — quotas de upload por org/cliente.
- `audit_log` — toda ação sensível.
- `api_keys` — chaves `lsm_…` (guarda só o `sha256`; plaintext aparece 1x).
- `generations` — cada geração de imagem/vídeo (provider, modelo, prompt, status, `result_url`,
  `credits_charged`, `kie_task_id`).
- `content_automations` — config das esteiras (nicho, vídeos/dia, modelos, prompts dos agentes,
  `post_times`).
- `credit_ledger` — razão auditável de créditos (cobranças e estornos).

Segurança: **RLS por organização** em quase tudo (`org_id = current_org_id()`). A API usa service
role e filtra por `org_id` manualmente; o painel usa anon key + JWT só onde a RLS protege.

---

## 5. Autenticação e permissões

Dois esquemas, no header `Authorization`:

1. **`Bearer <jwt supabase>`** — usuário logado no painel. A API valida via `auth.getUser()`,
   busca o membro em `users` e popula `req.auth = { orgId, userId, role, via: "jwt" }`.
2. **`Apikey <lsm_…>`** — automação (n8n/curl). A API faz `sha256` da chave, acha em `api_keys`,
   e opera com poderes de **admin** da org (`req.auth = { orgId, userId: created_by, role: "admin",
   via: "apikey" }`).

**Papéis:** `owner` > `admin` > `operator`. O `operator` só vê os clientes atribuídos
(`client_assignments`); `assertClientAccess()` valida acesso em cada rota.

Geração de API key: painel → **Configurações → API keys → + Nova key** (o texto aparece só uma vez).

---

## 6. Filas (BullMQ) e jobs

A API **produz** jobs; o worker **consome**. No Redis as chaves são `bull:<fila>:*`.

| Fila | O que faz | Disparo |
|---|---|---|
| `publish` | publica um `post_target` no TikTok (init → upload → status) | ao publicar/agendar |
| `status` | polling do status do publish até estado final | re-agendado por si mesmo |
| `analytics` | coleta snapshots + métricas por vídeo | **cron** `0 */6 * * *` |
| `token-refresh` | renova access tokens perto do expiry | **cron** `15 * * * *` |
| `automation` | esteira de conteúdo IA (scan + pipeline) | **cron** `* * * * *` |

**Padrão fan-out:** um job **sem id** (ex.: `automation` tick, `analytics`) varre o banco e
enfileira jobs específicos. **jobId determinístico** (`publishJobId`, `generationJobId`,
`auto-<id>-<data>-<hora>`) garante dedupe/idempotência.

`upsertJobScheduler` registra os crons (idempotente — um scheduler por id).

---

## 7. Fluxos principais

### 7.1 Conectar conta TikTok (OAuth)
1. Painel chama `GET /auth/tiktok/start` (XHR autenticado) → a API gera um `state` (CSRF) no Redis
   (TTL 600s) e retorna `{ url }`.
2. Browser redireciona para o TikTok; usuário autoriza.
3. TikTok chama `GET /auth/tiktok/callback` (rota pública). A API troca `code` por tokens,
   **cifra** e grava em `oauth_tokens`, cria/atualiza `social_accounts`, e redireciona pro painel.

> O `redirect_uri` tem que bater **exatamente** com o cadastrado no portal do TikTok
> (`https://api.lumixagencia.com/auth/tiktok/callback`).

### 7.2 Desconectar conta
`DELETE /clients/:clientId/accounts/:accountId` (owner/admin): revoga no TikTok (best-effort,
`revokeToken()` → `POST /v2/oauth/revoke/`), apaga `oauth_tokens` e marca a conta como `revoked`
(a linha **não** é deletada, pra preservar histórico de `post_targets`/`video_metrics`). Gera
audit `account.disconnect`.

### 7.3 Publicar / agendar
1. `POST /posts` (multipart): arquivo `video` + `client_id`, `social_account_ids`, `caption`,
   `privacy_level`, e `publish_now` **ou** `schedule_at`.
2. A API sobe a mídia no Storage, cria `posts` + um `post_targets` por conta, e:
   - `publish_now` → enfileira na fila `publish` imediatamente;
   - `schedule_at` → enfileira como job **delayed**.
3. Worker (`publish`): baixa a mídia, faz init → upload em chunks no TikTok, recebe `publish_id`,
   e dispara a fila `status`.
4. Worker (`status`): faz polling de `publish/status/fetch`. Estados:
   - `PUBLISH_COMPLETE` → `published` (+ `tiktok_video_id`, `post_url`);
   - `SEND_TO_USER_INBOX` → entregue como **rascunho** (fallback de app sem audit);
   - `FAILED` → `failed` com motivo.
5. **Fallback inteligente:** se o post direto não está disponível, o vídeo vira rascunho na conta —
   nada se perde, tudo registrado.

### 7.4 Analytics e refresh (crons)
- `analytics` (6/6h): para cada conta conectada, grava `analytics_snapshots`; e cruza
  `tiktok_video_id` para gravar `video_metrics`.
- `token-refresh` (1/1h): renova tokens próximos do expiry (o refresh do TikTok **rotaciona** o
  refresh_token — sempre persistir o novo).

### 7.5 Webhook n8n
Rota pública assinada por **HMAC-SHA256** (header `x-lsm-signature`, segredo `N8N_WEBHOOK_SECRET`).
Permite que o n8n crie/publique posts sem abrir o painel.

---

## 8. Estúdio de Conteúdo IA

A tela `/studio` (item **✦ Estúdio IA** no menu) tem 3 abas: **Geração avulsa**, **Automação** e
**Biblioteca**.

### 8.1 Providers
Geração é **provider-aware**. O catálogo (`apps/web/src/lib/ai-models.ts`) marca cada modelo com
`backend: "magichour" | "kie"`:

- **Magic Hour** — *provider principal* de **vídeo**. API de fila: `POST /v1/text-to-video` →
  `{ id }`; status `GET /v1/video-projects/{id}` → `{ status, downloads:[{url}] }`. Auth
  `Bearer mhk_live_…`. Cliente: `@lsm/shared/magichour`.
  - ⚠️ O modelo/resolução depende do **plano**. O modelo `default` é sempre liberado; tiers baixos
    **não** liberam `kling-3.0` nem `720p`. Por isso a API **não força resolução** (opcional via
    `MAGICHOUR_RESOLUTION`).
- **kie.ai** — *secundário* (produção) para **imagem** e vídeo. API unificada: `POST
  /jobs/createTask` → `{ taskId }`; status `GET /jobs/recordInfo`. Auth `Bearer`. Suporta webhook
  (`/webhooks/kie`). Cliente: `@lsm/shared/kie`.

### 8.2 Geração avulsa
1. `POST /generations` `{ kind, provider, model, prompt, aspect_ratio, duration, client_id? }`.
2. A API calcula o custo (`creditsForModel`), **debita créditos** (`credit_ledger`), e cria a task
   no provider (Magic Hour ou kie). Salva em `generations` (`status: processing`, `kie_task_id`,
   `input.provider`).
3. O status vem por:
   - **polling lazy**: `GET /generations/:id` consulta o provider e atualiza a linha;
   - **webhook** (kie): `/webhooks/kie` finaliza quando a kie avisa.
4. Concluído → `result_url` (imagem/vídeo) com botão de download. Falha → **estorna** os créditos.

### 8.3 Esteira de automação (100% automática)
Configurada na aba **Automação** (e salva em `content_automations`): nicho, vídeos/dia, duração,
modelo de imagem, modelo de vídeo, **prompt do agente de cenas**, **prompt do agente de vídeo**,
conta de publicação e **horários**.

O worker roda o cron `automation` a cada minuto:
1. **scan** (job sem id): acha automações ativas cujo `post_times` bate com o horário atual
   (no `AUTOMATION_TZ`) e enfileira um pipeline por automação (jobId por slot = idempotente).
2. **pipeline** (`runAutomation`, em `apps/worker/src/lib/automation-pipeline.ts`):
   1. cobra os créditos do dia adiantado (job sem retry → sem cobrança dupla);
   2. **agente de cenas** (LLM via kie, `KIE_LLM_MODEL`) gera N prompts de imagem;
   3. **agente de vídeo** (LLM) gera a legenda/roteiro;
   4. gera as N **imagens** das cenas;
   5. gera o **vídeo** (usa a 1ª imagem como referência);
   6. baixa o vídeo, sobe no Storage, cria `posts`+`post_targets` e **enfileira na fila
      `publish`** (reaproveita todo o fluxo de publicação do TikTok).

> Hoje a esteira roda nos modelos **kie** (produção). A geração avulsa é que usa a Magic Hour como
> principal para teste/comparação.

---

## 9. Sistema de créditos

- Cada org tem `organizations.credits_balance`.
- O custo de cada modelo está em `MODEL_CREDITS` (`packages/shared/src/kie.ts`), com um **markup
  oculto**: `creditsForModel(model, duração, markup)` = `ceil(custo_bruto × CREDIT_MARKUP)`.
  `CREDIT_MARKUP` default `1.3` (= +30%, ex.: custo 1 → cobra 1,30) — configurável por env.
- Toda cobrança/estorno entra em `credit_ledger` (auditável), com `balance_after`.
- Falha de geração → **estorno automático**.
- ⚠️ Os números de custo são **placeholders** — ajuste conforme a planilha real dos providers.
  O catálogo do web (`ai-models.ts`) exibe uma estimativa; a cobrança **autoritativa** é a do
  servidor.

---

## 10. Landing page

`/` (pública, SEO-first). Hero com **robô 3D interativo (Spline)** ao lado da headline (carregado
lazy via `Suspense`, não bloqueia o LCP). Seções: hero, prova/números, features, como funciona,
API/automação (com exemplo `curl`), FAQ (gera rich snippet via JSON-LD) e CTA final. SEO completo
(metadata, sitemap, robots, opengraph-image). Tracking GA4/Pixel condicionado a env.

> Há também um hero alternativo com **globo wireframe** (three.js/r3f) em
> `components/ui/globe-hero.tsx` — basta trocar uma linha em `page.tsx` para usá-lo.

---

## 11. Variáveis de ambiente

> No EasyPanel, **não use comentário inline** (`CHAVE=valor # nota`): o `#` vira parte do valor e
> pode derrubar o serviço (ex.: `API_PUBLIC_URL` ou `CREDIT_MARKUP` inválidos).

### API (`apps/api`)
| Obrigatórias | Opcionais (Estúdio IA) |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `MAGICHOUR_API_KEY` |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` | `MAGICHOUR_RESOLUTION` (deixe vazio em planos baixos) |
| `REDIS_URL` | `KIE_API_KEY`, `KIE_CALLBACK_SECRET` |
| `ENCRYPTION_KEY` (64 hex), `N8N_WEBHOOK_SECRET` (≥16) | `API_PUBLIC_URL` (p/ webhooks) |
| `APP_URL`, `PORT` (3001) | `CREDIT_MARKUP` (default 1.3) |

### Worker (`apps/worker`)
Obrigatórias: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TIKTOK_*`, `REDIS_URL`,
`ENCRYPTION_KEY`. Opcionais: `MAGICHOUR_API_KEY`, `KIE_API_KEY`, `KIE_LLM_MODEL`
(default `google/gemini-2.5-flash`), `CREDIT_MARKUP`, `AUTOMATION_TZ`
(default `America/Sao_Paulo`), `HEALTH_PORT` (3002).

> `ENCRYPTION_KEY` e `REDIS_URL` **idênticos** em api e worker.

### Web (`apps/web`) — "assadas" no build (NEXT_PUBLIC_*)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_SITE_URL`. (Mudou alguma? Precisa **rebuild** do web.)

---

## 12. Rodando local

```bash
# 1. dependências
npm i -g pnpm        # corepack falha com EPERM nesta máquina
pnpm install

# 2. Redis (Docker Desktop precisa estar aberto)
docker run -d --name lsm-redis -p 6379:6379 redis

# 3. .env na raiz (copie de .env.example e preencha)

# 4. cada serviço (terminais separados)
pnpm --filter @lsm/web dev      # http://localhost:3000
pnpm --filter @lsm/api dev      # http://localhost:3001  (Swagger em /docs)
pnpm --filter @lsm/worker dev   # health em :3002

# validações
pnpm --filter @lsm/api typecheck
pnpm --filter @lsm/web build
```

**Scripts úteis** (`apps/api/scripts/`, rodar de dentro de `apps/api`):
- `node scripts/studio-check.mjs` — checa migration, lista orgs/créditos/contas.
- `node scripts/studio-check.mjs seed <orgId> 5000` — semeia créditos.
- `node scripts/studio-check.mjs apikey <orgId> nome` — cria uma API key `lsm_…`.
- `node scripts/gen-test.mjs magichour default "<prompt>" 5` — testa geração real no provider.
- `node scripts/mh-probe.mjs [model] [res]` / `mh-probe.mjs status <id>` — sonda modelos/plano.

> Quirks Windows: `output: standalone` do Next falha (symlink EPERM) — só no Docker via
> `NEXT_OUTPUT=standalone`; `pnpm install` pode dar EBUSY (rode de novo); o ruído
> `Assertion failed ... UV_HANDLE` no fim de scripts é só teardown do Node 24 (inofensivo).

---

## 13. Deploy (EasyPanel)

Cada serviço tem seu `Dockerfile` (build a partir da **raiz** do monorepo). Detalhes em
[`docs/DEPLOY.md`](./DEPLOY.md). Pontos-chave:

- **web**: build standalone; as `NEXT_PUBLIC_*` são **ARGs de build** (rebuild se mudarem).
  Healthcheck bate em `/`. Dê **memória ≥1–2GB** (o build com three/Spline é pesado) e
  **1 réplica** (evita "Failed to find Server Action" por instâncias inconsistentes).
- **api**/**worker**: `pnpm deploy --prod`. Precisam do **mesmo Redis** e `ENCRYPTION_KEY`.
- Aplicar migrations no Supabase (SQL Editor). A `0004` adiciona o Estúdio IA.
- Repo: `github.com/LuisGuilhermeLumix/lumixsmtiktokapi` (privado, branch `main`). O deploy
  acompanha a `main` — feature em branch só sobe **após o merge do PR**.

---

## 14. Mapa de pastas

```
apps/
  web/src/
    app/
      page.tsx                 landing pública
      (app)/                   painel (layout com menu)
        dashboard|clients|posts|analytics|settings|studio/
      login/ layout.tsx (SEO/metadata) middleware.ts (protege rotas)
    components/ landing|ui|...  (ui.tsx = primitives; robot/globe hero)
    lib/ api.ts supabase.ts ai-models.ts utils.ts types.ts
  api/src/
    app.ts                     registra plugins + rotas + error handler
    config.ts deps.ts server.ts
    routes/ auth-tiktok clients posts analytics apikeys content webhooks health
    lib/ auth access posts tokens quota audit errors
    scripts/ studio-check gen-test mh-probe (utilitários de dev)
  worker/src/
    main.ts                    sobe workers + crons
    processors/ publish status analytics token-refresh automation
    lib/ automation-pipeline post-status tokens
packages/
  db/      src/{index,types}.ts  migrations/*.sql
  shared/  src/{index,queues,crypto,kie,magichour}.ts
  tiktok/  src/{oauth,publish,display,api,http,errors,constants}.ts
docs/      ARQUITETURA.md (este) · DEPLOY.md
```

---

### Resumo em uma frase
A **api** orquestra (autoriza, grava no Supabase, enfileira), o **worker** executa o pesado (TikTok,
kie.ai, Magic Hour, crons) e o **web** é a cara — tudo girando em torno de **organizações** com
publicação resiliente de TikTok e um **Estúdio de Conteúdo IA** que gera e posta sozinho.
