-- Índices de performance do motor de automações.
-- Corrigidos ao schema REAL: automation_runs usa `created_at` (não started_at);
-- automation_workflows usa `status` (não uma coluna booleana `active`).
-- Os índices simples já existentes na 0005 (…_status_idx, …_video_idx) seguem;
-- aqui adicionamos os COMPOSTOS/PARCIAIS que faltavam.

-- scene-poll / maybeEnqueueStitch: cenas de um vídeo por status
create index if not exists automation_scenes_video_status_idx
  on public.automation_scenes (video_id, status);

-- finalize/stitch: cenas ainda pendentes de um vídeo (índice parcial enxuto)
create index if not exists automation_scenes_pending_idx
  on public.automation_scenes (video_id)
  where status not in ('done', 'failed');

-- finalizeRunIfDone: vídeos de um run por status
create index if not exists automation_videos_run_status_idx
  on public.automation_videos (run_id, status);

-- histórico de runs por workflow (dashboard / inspetor)
create index if not exists automation_runs_workflow_created_idx
  on public.automation_runs (workflow_id, created_at desc);

-- auto-scan: varre apenas workflows ATIVOS (índice parcial)
create index if not exists automation_workflows_active_idx
  on public.automation_workflows (updated_at)
  where status = 'active';
