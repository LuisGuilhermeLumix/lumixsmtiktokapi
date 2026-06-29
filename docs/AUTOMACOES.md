# 🤖 Motor de Automações de Conteúdo IA — Documentação Completa

> Sistema inspirado no **n8n** para gerar e publicar vídeos de TikTok automaticamente,
> ponta a ponta: agenda → roteiro (LLM) → cenas (imagem→vídeo) → montagem (FFmpeg) →
> publicação. Multi-tenant, com créditos, retry/erros e observabilidade.

Este documento explica **toda a lógica e o código** — arquitetura, modelo de dados,
nós, compilador, runtime (fila a fila), créditos, tratamento de erros, expressões
`{{ }}`, o designer no-code e a API.

---

## 1. Visão geral da arquitetura

```
┌──────────────────────── apps/web (Next.js) ────────────────────────┐
│  Designer no-code (React Flow)  ·  Inspetor de execução  ·  Runs    │
└───────────────┬───────────────────────────────────────────────────┘
                │ REST (apiFetch)
┌───────────────▼──────────── apps/api (Fastify) ────────────────────┐
│  /workflows  /workflows/:id/{validate,test,runs}  /runs/:id{,cancel,│
│  retry}  — valida/compila grafo, dispara runs, lê execução          │
└───────────────┬───────────────────────────────────────────────────┘
        Postgres │ (Supabase, RLS por org)        Redis │ (BullMQ)
┌───────────────▼───────────────────────────────────────▼────────────┐
│                       apps/worker (BullMQ)                          │
│  auto-scan → auto-plan → script-generate → scene-video ⇄ scene-poll │
│                              → video-stitch → (publish)             │
└────────────────────────────────────────────────────────────────────┘
```

| Camada | Pacote | Papel |
|---|---|---|
| UI | `apps/web` | Designer visual, inspetor, painéis |
| API | `apps/api` | CRUD de workflow, compilar grafo, disparar/ler runs |
| Worker | `apps/worker` | Executa o pipeline em filas BullMQ |
| Contratos | `packages/shared/src/automation` | Tipos, schemas, compilador, expressões |
| Banco | `packages/db` | Migrations SQL + client tipado |

**Princípios herdados do n8n** (ver `docs/` do guia): workflow é **grafo (JSON)**;
o runtime **nunca interpreta grafo cru** — executa um **plano compilado** validado;
credenciais **sempre criptografadas**; erros são tratados por nó; normalizar cedo.

---

## 2. Modelo de dados (migration `0005_automation_engine.sql`)

| Tabela | Conteúdo | Observações |
|---|---|---|
| `niche_packs` | hooks, termos banidos, substituições, estilo | `org_id NULL` = pack global |
| `characters` | personagens fictícios (nome, descrição, traços) | por org |
| `automation_workflows` | `graph` (autoria) + `compiled_plan` (execução) | desnormaliza `post_times`, `timezone`, `lead_time_min` p/ o scan |
| `automation_runs` | 1 execução (status, créditos, erro) | **PK textual determinística** |
| `automation_videos` | 1 vídeo por conta/run | caption, `final_url`, `post_id`, status |
| `automation_scenes` | cenas de um vídeo | beat, prompt, `image_url`, `video_url`, `provider_task_id`, `credits_charged` |
| `automation_run_steps` | observabilidade por etapa | `step`, `status` (started/done/failed), `meta` jsonb |

Tudo com **RLS por `org_id`** (`current_org_id()`), exceto `niche_packs` que também
lê globais (`org_id is null`).

### 2.1 IDs determinísticos = idempotência (`packages/shared/src/queues.ts`)

```
run   = auto:{workflowId}:{YYYY-MM-DD}:{slot}      automationRunId()
video = {run}:acct:{accountId}:{n}                 automationVideoId()
scene = {video}:scene:{i}                          automationSceneId()
```

O próprio **PK garante idempotência**: reprocessar o mesmo slot tenta inserir o mesmo
id → conflito `23505` ignorado. Como BullMQ **não aceita `:` em jobId**, todo id passa
por `toBullJobId()` (troca `:` por `__`) antes de virar `jobId`.

---

## 3. Estados (máquina de status)

```
run:    queued → planning → running → (partial | done | failed | skipped)
video:  queued → scripting → rendering_scenes → stitching → publishing → published | failed
scene:  queued → image → video → done | failed
```

Definidos em `packages/shared/src/automation/types.ts` (`RUN_STATUSES`,
`VIDEO_STATUSES`, `SCENE_STATUSES`).

---

## 4. Tipos de nó (`types.ts` → `NODE_TYPES` / `NODE_CATEGORY`)

26 nós em 6 categorias (a paleta do designer agrupa por categoria):

| Categoria | Nós |
|---|---|
| **trigger** | Schedule, GetAccounts, GetCharacter, GetNichePack |
| **flow** | LoopAccounts, If, Switch, Wait, Merge |
| **ai** | DirectorAgent, HookSelector, CaptionAgent, SafetyFilter |
| **media** | SceneImage, VideoGen, Stitch, AddMusic, AddCaptions, Trim |
| **data** | SupabaseGet, SupabaseCreate, SupabaseUpdate, SetCode |
| **output** | PublishTikTok, SaveLibrary, Notify |

Cada nó tem:
- um **schema zod** de config em `schemas.ts` (`NODE_CONFIG_SCHEMAS`) — valida na compilação;
- um **form inline** em `apps/web/src/lib/automation-fields.ts` (`NODE_FIELDS`) — o no-code.

> ⚠️ O runtime atual executa um **pipeline fixo** (plan→script→scene→stitch→publish)
> extraído da config dos nós-chave; não percorre o grafo aresta por aresta. Os nós de
> fluxo (If/Switch/Merge) existem na autoria, mas a execução hoje é linear.

---

## 5. Compilador: grafo → plano (`compile.ts`)

`compileWorkflow(workflowId, graph)`:

1. Exige ≥1 nó e **exatamente um** `Schedule`.
2. Valida a config de **cada nó** com seu schema zod → erros claros (`Nó 'X' inválido: …`).
3. Verifica que as arestas referenciam nós existentes.
4. Monta `steps[id].next[handle]` a partir das arestas (para futura execução por grafo).
5. **Extrai a `AutomationRunConfig`** (a config que o runtime lê) dos nós-chave:
   `Schedule`, `GetAccounts`, `DirectorAgent`, `CaptionAgent`, `SceneImage`, `VideoGen`,
   `Stitch`, `PublishTikTok`, `GetCharacter`, `GetNichePack`.

Resultado salvo em `automation_workflows.compiled_plan`. A `RunConfig` inclui (ver
`schemas.ts` → `runConfigSchema`): nicho/personagem, contas, `videos_per_account`,
`num_scenes`, `duration_per_scene`, modelos (`image_model`, `video_model`, `llm_model`),
prompts (`director_prompt`, `caption_prompt`), `stitch_mode`, `privacy_level`,
`credits_per_scene` e o bloco de **erros** (`on_error`, `max_tries`, `retry_wait_s`).

---

## 6. Runtime — o pipeline em filas (BullMQ)

Filas (constantes em `queues.ts`, processors em `apps/worker/src/processors/`):

### 6.1 `auto-scan` (cron 1 min) — `auto-scan.ts`
Varre workflows **ativos** e, para cada `post_time` cujo horário (menos `lead_time_min`)
chegou, calcula o `runId` do slot e enfileira **`auto-plan`**. Idempotente pelo `jobId`.

### 6.2 `auto-plan` — `auto-plan.ts`
Pré-check + **reserva de créditos** + criação das linhas:
- resolve as contas-alvo (config ou todas as conectadas do client/org);
- cria `automation_runs` (status `planning`→`running`), e um `automation_videos` por conta;
- **reserva créditos** atômico via RPC `charge_credits` (grava `credits_reserved`);
- enfileira **`script-generate`** por vídeo.

### 6.3 `script-generate` — `script-generate.ts`
O **agente diretor**:
- resolve **expressões `{{ }}`** nos prompts (ver §8) com contexto da conta/personagem/nicho;
- chama o LLM (`kieLLM`) com **retry/backoff** (`withRetry`, §7) → roteiro;
- gera a **legenda** (com fallback para o hook do niche pack);
- quebra o roteiro em **N beats** (`splitBeats`) e cria `automation_scenes`;
- enfileira **`scene-video`** por cena.

### 6.4 `scene-video` — `scene-video.ts`
Gera **uma cena**: cria a task no provider (`kieCreateTask`) com **callback** (principal)
e agenda **`scene-poll`** como fallback. Erros respeitam `on_error`:
- `stop` → derruba o vídeo;
- `continue` → segue best-effort (junta as cenas que deram certo).

### 6.5 `scene-poll` — `scene-poll.ts`
Fallback de **polling** do provider caso o callback não chegue; atualiza a cena com a URL
do vídeo e, quando todas terminam, chama `maybeEnqueueStitch`.

### 6.6 `video-stitch` — `video-stitch.ts`
**FFmpeg**: concatena/xfade/trim/música das cenas → vídeo final → sobe no Storage
(bucket `post-media`) → grava `final_url` → publica no TikTok (ou marca `published`).
`finalizeRunIfDone` fecha o run e **liquida créditos**.

### 6.7 Webhook do provider
`POST /webhooks/kie` (protegido por `KIE_CALLBACK_SECRET`) recebe o fim da task e
atualiza a cena — caminho **principal**; o `scene-poll` é só rede de segurança.

---

## 7. Tratamento de erros (estilo n8n)

Config por run (vinda do nó **DirectorAgent**, vale para o pipeline):
`on_error` (`stop`|`continue`), `max_tries` (1–5), `retry_wait_s` (0–120).

`apps/worker/src/lib/retry.ts` — `withRetry(fn, { tries, waitMs, onAttempt })`:
backoff **exponencial** (`waitMs * 2^(n-1)`). Aplicado nas chamadas de provider
(LLM do roteiro e criação da cena). Cada tentativa falha é logada em `run_steps`.

Outras camadas:
- **idempotência** pelos ids determinísticos (não duplica run/video/scene);
- **transição atômica** de fim de run via RPC `finalize_run` (só um "vencedor" liquida
  créditos / libera inflight) — evita corrida;
- **cancelar** (`POST /runs/:id/cancel`) estorna o reservado-não-usado (`refund_credits`);
- **re-executar** (`POST /runs/:id/retry`) cria um run novo a partir do mesmo workflow.

---

## 8. Sistema de expressões `{{ }}` (`expressions.ts`)

Substituição **segura** (sem `eval` de JS — diferente do n8n, melhor p/ multi-tenant):

```ts
resolveExpressions("Olá {{ $account.display_name }} em {{ $today }}", ctx)
```

Variáveis (`EXPRESSION_VARS`): `$now`, `$today`, `$niche`, `$account.display_name`,
`$character.name`, `$character.description`, `$video.idx`. Tokens desconhecidos ou
objetos viram string vazia. O worker resolve `director_prompt` e `caption_prompt`
antes de chamar o LLM, com o contexto real do vídeo.

No designer, o campo de texto tem **toggle Fixo·Expressão** e um botão **ƒx** que abre o
**Editor de expressão** (variáveis clicáveis + **pré-visualização do resultado** com dados
de exemplo) — `apps/web/src/components/automation/automation-node.tsx`
(`ExprField`, `ExpressionEditor`).

---

## 9. Créditos (`apps/worker/src/lib/auto-credits.ts` + RPCs `0007`)

- **Reserva** no `auto-plan`: `charge_credits` (atômico) → `credits_reserved`.
- **Cobrança por cena** concluída → `automation_scenes.credits_charged`.
- **Liquidação** no fim do run (`settleRun` + `finalize_run`): estorna o reservado não
  usado (`refund_credits`) e grava `credits_settled`.
- Markup oculto: `credits_per_scene = custo_bruto_provider × CREDIT_MARKUP`.

Todas as operações usam **RPCs Postgres atômicas** (migration `0007_hardening.sql`):
`charge_credits`, `refund_credits`, `consume_upload_quota`, `finalize_run`,
`latest_account_snapshots` — eliminam corridas de read-modify-write.

---

## 10. O Designer no-code (`apps/web`)

| Arquivo | Papel |
|---|---|
| `app/(app)/studio/automations/[id]/page.tsx` | Editor React Flow: paleta, canvas, toolbar, runs, **botão Executar flutuante**, animação nó-a-nó |
| `components/automation/automation-node.tsx` | Nó customizado: ícone por categoria, controles inline, **ƒx/expressões**, estado de execução |
| `components/automation/run-inspector.tsx` | **Inspetor de execução**: etapas (JSON), artefatos (legenda, vídeo, cenas), abas, retry/cancel |
| `lib/automation-fields.ts` | `NODE_FIELDS` (form de cada nó) + listas de modelos + cores/ícones por categoria |

Funcionalidades estilo n8n já implementadas:
- **animação nó-a-nó** na execução (polling do run → fases → `running/done/failed`);
- **Executar com trigger** (dropdown) + **Demo** (animação simulada sem backend);
- **dropdowns com busca** (combobox) p/ modelos longos;
- **cancelar / re-executar** runs;
- **inspetor** com timeline + JSON + mídia;
- **expressões `{{ }}`** com editor e preview.

### 10.1 Animação nó-a-nó (mapeamento de fases)
`page.tsx` → `PHASES` agrupa tipos de nó em 5 fases; `phaseFromRun(status, steps)`
infere a fase atual pelas etapas vistas; `statusMap` marca cada tipo como
`done/running/pending/failed`. O `EditorProvider` injeta `nodeStatus` e cada nó
(`automation-node.tsx`) renderiza pulso/spinner/check/X.

---

## 11. API (`apps/api/src/routes/workflows.ts`)

| Método/rota | Função |
|---|---|
| `POST /workflows` / `from-template` | cria workflow (em branco ou de template) |
| `GET/PATCH/DELETE /workflows/:id` | CRUD + ativar/pausar |
| `POST /workflows/:id/validate` | compila o grafo e persiste `compiled_plan` |
| `POST /workflows/:id/test` | dispara um run manual |
| `GET /workflows/:id/runs` | histórico de runs |
| `GET /runs/:id` | detalhe: run + **videos + scenes + steps** |
| `POST /runs/:id/cancel` | cancela e estorna créditos reservados |
| `POST /runs/:id/retry` | re-executa (novo run) |

Todas autenticadas e **escopadas por `org_id`** (RLS + checagem na query). Mutations
relevantes gravam **auditoria** (`logAudit`).

---

## 12. Variáveis de ambiente (worker/api)

```
KIE_API_KEY            # provider de geração (LLM/imagem/vídeo)
KIE_LLM_MODEL          # modelo LLM default (fallback do nó)
API_PUBLIC_URL         # base p/ o callBackUrl do provider
KIE_CALLBACK_SECRET    # segredo do webhook /webhooks/kie
CREDIT_MARKUP          # markup oculto dos créditos (default 1.3)
ENCRYPTION_KEY         # AES-256-GCM p/ tokens/segredos
REDIS_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

---

## 13. Como estender

- **Novo nó**: adicione o tipo em `types.ts` (`NODE_TYPES` + `NODE_CATEGORY`), o schema em
  `schemas.ts` (`NODE_CONFIG_SCHEMAS`) e o form em `automation-fields.ts` (`NODE_FIELDS`).
  Se afetar a execução, leia a config no `compile.ts` (`runConfig`) e use no worker.
- **Nova variável de expressão**: adicione em `EXPRESSION_VARS` e popule no contexto do
  `script-generate.ts` (e em `sampleCtx` do editor p/ preview).
- **Novo passo de pipeline**: crie a fila em `queues.ts`, o processor em
  `apps/worker/src/processors/` e registre no `main.ts`.

---

## 14. Limitações conhecidas / próximos passos

- Execução é **pipeline fixo** (não percorre o grafo); If/Switch/Merge são só autoria.
- Sem **testes automatizados** ainda (só typecheck/build).
- Sem **rastreamento de erros** (Sentry) nem **idempotency-keys** nas rotas que mutam.
- **Validação ponta-a-ponta** depende de worker rodando + `KIE_API_KEY` válida.
- Expressões: substituição de variáveis (sem JS arbitrário) — por design (segurança).

---

*Gerado para o Lumix Social Manager — Motor de Automações de Conteúdo IA.*
