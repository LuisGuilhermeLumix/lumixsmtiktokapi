# Deploy no EasyPanel — Lumix Social Manager

Guia completo: do zero ao sistema 100% no ar. Cada serviço (web, api,
worker) vira um **app** no EasyPanel + um serviço **Redis**.

## Arquitetura em produção

```
lumixagencia.com           → web    (Next.js, porta 3000)
api.lumixagencia.com       → api    (Fastify, porta 3001)  ← redirect URI do TikTok
(sem domínio)              → worker (BullMQ,  healthcheck na 3002)
(interno)                  → redis  (porta 6379, só rede interna)
Supabase (cloud)           → Postgres + Auth + Storage (já configurado)
```

> O domínio da API **precisa** ser `api.lumixagencia.com` — é o que está
> cadastrado como redirect URI no portal TikTok (match exato obrigatório).

---

## 0. Pré-requisitos (uma vez)

- [x] Projeto Supabase com as migrations 0001→0003 aplicadas
- [x] Org + usuário owner criados (bootstrap SQL — ver packages/db/README.md)
- [ ] Repositório GitHub com este código (o EasyPanel puxa de lá)
- [ ] DNS dos domínios apontando para o IP da VPS (registros A):
  - `lumixagencia.com` (ou `app.`) → IP da VPS
  - `api.lumixagencia.com` → IP da VPS

## 1. Criar o projeto no EasyPanel

1. EasyPanel → **Projects → Create Project** → nome: `lsm`.

## 2. Redis

1. Dentro do projeto: **+ Service → Redis** (template oficial).
2. Nome: `redis`. Defina uma senha forte.
3. Anote a URL interna: `redis://default:<SENHA>@lsm_redis:6379`
   (formato: `<projeto>_<serviço>` como hostname interno).

## 3. API

1. **+ Service → App** → nome: `api`.
2. **Source**: GitHub → selecione o repositório e branch `main`.
3. **Build**: tipo **Dockerfile** →
   - Build context: `/` (raiz)
   - Dockerfile path: `apps/api/Dockerfile`
4. **Environment** (cole e preencha):

```env
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://api.lumixagencia.com/auth/tiktok/callback
REDIS_URL=redis://default:<SENHA>@lsm_redis:6379
ENCRYPTION_KEY=<64 chars hex — openssl rand -hex 32>
N8N_WEBHOOK_SECRET=<segredo forte — compartilhado com o n8n>
APP_URL=https://lumixagencia.com
```

> ⚠️ Gere `ENCRYPTION_KEY` NOVA para produção (não reutilize a de dev).
> Trocá-la depois invalida todos os tokens salvos (todas as contas
> precisariam reconectar) — guarde-a com cuidado.

5. **Domains**: adicione `api.lumixagencia.com` → porta `3001` → HTTPS on
   (Let's Encrypt automático).
6. **Deploy**. Verifique: `https://api.lumixagencia.com/health` → `{"status":"ok"}`
   e `https://api.lumixagencia.com/docs` (Swagger).

## 4. Worker

1. **+ Service → App** → nome: `worker`.
2. Source: mesmo repositório/branch.
3. Build: Dockerfile → context `/` → path `apps/worker/Dockerfile`.
4. Environment (subset da API — sem APP_URL/N8N/PORT):

```env
NODE_ENV=production
HEALTH_PORT=3002
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://api.lumixagencia.com/auth/tiktok/callback
REDIS_URL=redis://default:<SENHA>@lsm_redis:6379
ENCRYPTION_KEY=<A MESMA da API — obrigatório>
```

5. Sem domínio (serviço interno). Deploy.
6. Logs devem mostrar: `[lsm-worker] rodando — filas: publish, status, ...`

## 5. Web

1. **+ Service → App** → nome: `web`.
2. Source: mesmo repositório/branch.
3. Build: Dockerfile → context `/` → path `apps/web/Dockerfile`.
4. **Environment** — no EasyPanel as variáveis ficam disponíveis no build,
   e o Dockerfile as captura como ARG (necessário: `NEXT_PUBLIC_*` são
   embutidas no bundle em build time):

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=https://api.lumixagencia.com
NEXT_PUBLIC_SITE_URL=https://lumixagencia.com
NEXT_PUBLIC_GA4_ID=
NEXT_PUBLIC_META_PIXEL_ID=
```

5. Domains: `lumixagencia.com` → porta `3000` → HTTPS on.
6. Deploy. Verifique a landing e `https://lumixagencia.com/login`.

> Se mudar qualquer `NEXT_PUBLIC_*`, é preciso **rebuildar** o web
> (Redeploy com build), não basta restart.

## 6. Verificação fim-a-fim (checklist)

- [ ] `https://api.lumixagencia.com/health` → ok
- [ ] `https://lumixagencia.com` → landing com SSL
- [ ] Login no painel funciona
- [ ] Criar cliente → **Conectar TikTok** → autorizar → volta com
      "Conta TikTok conectada" (agora funciona: o redirect URI bate!)
- [ ] Criar post "Publicar agora" com `SELF_ONLY` → status vira
      Publicando → Publicado (ou rascunho na conta, se app sem audit —
      ver `post_targets.published_mode`)
- [ ] `analytics_snapshots` ganha linhas após o próximo ciclo de 6h
      (ou rode manualmente — ver Troubleshooting)
- [ ] Webhook n8n: configurar o fluxo com header `x-lsm-signature`
      (HMAC-SHA256 hex do corpo com `N8N_WEBHOOK_SECRET`)

## 7. n8n (operation.lumixagency.online)

No fluxo do n8n, nó **HTTP Request**:
- URL: `https://api.lumixagencia.com/webhooks/n8n`
- Method: POST · Body: JSON
- Header `x-lsm-signature`: use um nó **Crypto** (HMAC-SHA256, hex) sobre
  o corpo EXATO enviado, com o `N8N_WEBHOOK_SECRET`.
- Alternativa sem assinatura: usar API key (`Authorization: Apikey lsm_...`)
  nos endpoints normais (`POST /posts` etc.) — crie a key em /settings.

## Troubleshooting

| Sintoma | Causa provável / ação |
|---|---|
| `Token inválido ou expirado` no painel | `SUPABASE_*` da API ≠ projeto do web; confira as duas envs |
| Conectar TikTok → erro `redirect_uri` | Domínio da API ≠ `api.lumixagencia.com` ou URI divergente no portal |
| Post preso em "Na fila" | Worker parado ou `REDIS_URL` diferente entre api e worker |
| Post falha com `unaudited_client...` | Esperado sem audit: vira rascunho (published_mode=upload_draft). Para Direct Post público, conclua o audit no portal TikTok |
| `Quota de uploads esgotada` | Linha em `usage_quota` com `uploads_limit` atingido — aumente ou apague |
| Forçar coleta de analytics agora | No Redis: não precisa — crie um job: `docker exec <worker> node -e "..."` ou aguarde o cron de 6h; alternativa: reinicie o worker (re-registra schedulers) |
| Web buildou com URL errada | `NEXT_PUBLIC_*` mudou → Redeploy com build |

## Atualizações (CI manual)

`git push` na branch `main` → EasyPanel → app → **Deploy** (ou habilite
auto-deploy por webhook do GitHub nas configurações de cada app).
