# @lsm/db

Schema do Supabase (migrations SQL + RLS) e client tipado.

## Migrations

Arquivos em [migrations/](migrations/), em ordem:

| Arquivo | Conteúdo |
|---|---|
| `0001_schema.sql` | extensões, enums, 13 tabelas, índices, triggers |
| `0002_rls.sql` | funções helper (`current_org_id`, `has_client_access`) + policies |
| `0003_storage.sql` | bucket privado `post-media` + policies por org |

### Como aplicar

**Opção A — SQL Editor (Supabase Dashboard):** cole e execute cada
arquivo na ordem (0001 → 0002 → 0003).

**Opção B — Supabase CLI:**

```bash
supabase link --project-ref SEU_PROJECT_REF
# copie os arquivos para supabase/migrations/ com prefixo timestamp, ou:
supabase db push
```

## Modelo de acesso (RLS)

- Usuário autenticado só enxerga dados da **própria org**.
- `owner`/`admin` acessam todos os clients; `operator` só os
  atribuídos em `client_assignments`.
- `oauth_tokens`: **nenhuma policy** → inacessível com JWT de usuário;
  apenas a service role (API/worker) lê/escreve.
- Escritas operacionais (`post_targets`, `analytics_*`, `usage_quota`,
  `audit_log`, `api_keys`) são feitas pela API/worker com service role.

## Client tipado

```ts
import { createServiceClient, type Tables } from "@lsm/db";

const db = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await db.from("posts").select("*").eq("status", "scheduled");
type Post = Tables<"posts">;
```

## Storage

Bucket privado `post-media` (500 MB/arquivo, apenas vídeo).
Convenção de path obrigatória: `{org_id}/{client_id}/{post_id}/{arquivo}`
— o 1º segmento é validado pelas policies. Use o helper `postMediaPath()`.
