"use client";

// Inspetor de execução (estilo n8n): mostra a timeline de etapas com input/output
// (JSON), os artefatos gerados (roteiro, legenda, cenas com imagem/vídeo, vídeo
// final) e ações de erro (re-executar, cancelar). Faz polling enquanto roda.

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  Film,
  ImageIcon,
  Loader2,
  RefreshCw,
  RotateCw,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Step { id: string; step: string; status: string; meta: Record<string, unknown>; created_at: string }
interface Scene {
  id: string; video_id: string; idx: number; status: string; beat: string | null; prompt: string | null;
  image_url: string | null; video_url: string | null; provider: string | null; credits_charged: number; error: string | null;
}
interface Video {
  id: string; idx: number; status: string; social_account_id: string | null; caption: string | null;
  num_scenes: number | null; final_url: string | null; post_id: string | null; error: string | null;
}
interface RunData {
  run: { id: string; status: string; slot: string; run_date: string; credits_reserved: number; credits_settled: number; error: string | null; created_at: string; updated_at: string };
  videos: Video[];
  scenes: Scene[];
  steps: Step[];
}

const TERMINAL = ["done", "failed", "partial", "skipped"];

function statusTone(s: string): string {
  if (["done", "published", "success"].includes(s)) return "text-emerald-300 bg-emerald-500/15 border-emerald-500/30";
  if (["failed", "error"].includes(s)) return "text-red-300 bg-red-500/15 border-red-500/30";
  if (TERMINAL.includes(s)) return "text-amber-300 bg-amber-500/15 border-amber-500/30";
  return "text-lumix-blue bg-lumix-blue/15 border-lumix-blue/30";
}

function StatusChip({ status }: { status: string }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone(status)}`}>{status}</span>;
}

function StepIcon({ status }: { status: string }) {
  if (status === "done") return <Check className="size-4 text-emerald-400" />;
  if (status === "failed") return <AlertTriangle className="size-4 text-red-400" />;
  return <Loader2 className="size-4 animate-spin text-lumix-blue" />;
}

const STEP_LABEL: Record<string, string> = {
  plan: "Planejamento (contas + cenas)",
  script: "Roteiro + legenda (agente diretor)",
  scene: "Geração de cena (imagem/vídeo)",
  stitch: "Montagem do vídeo final",
  publish: "Publicação no TikTok",
};
function stepLabel(step: string): string {
  const kind = step.split(":")[0] ?? step;
  return STEP_LABEL[kind] ?? step;
}

/** bloco JSON colapsável (n8n "JSON view") */
function JsonBlock({ data, label = "Dados" }: { data: unknown; label?: string }) {
  const [open, setOpen] = useState(false);
  if (data == null || (typeof data === "object" && Object.keys(data as object).length === 0)) return null;
  return (
    <div className="mt-1">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[11px] text-ink-faint hover:text-ink">
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} /> {label}
      </button>
      {open && (
        <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-border-subtle bg-surface p-2 font-mono text-[11px] leading-relaxed text-ink-dim">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Expandable({ text, max = 140 }: { text: string; max?: number }) {
  const [open, setOpen] = useState(false);
  if (text.length <= max) return <span>{text}</span>;
  return (
    <span>
      {open ? text : `${text.slice(0, max)}… `}
      <button onClick={() => setOpen((o) => !o)} className="text-lumix-blue hover:underline">{open ? "menos" : "mais"}</button>
    </span>
  );
}

export function RunInspector({ runId, onClose, onChanged }: { runId: string; onClose: () => void; onChanged?: () => void }) {
  const [data, setData] = useState<RunData | null>(null);
  const [tab, setTab] = useState<"steps" | "media" | "json">("steps");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<RunData>(`/runs/${runId}`);
      setData(d);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  // polling enquanto o run não terminou
  useEffect(() => {
    if (!data || TERMINAL.includes(data.run.status)) return;
    const iv = setInterval(load, 2500);
    return () => clearInterval(iv);
  }, [data, load]);

  async function act(path: string) {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/runs/${runId}/${path}`, { method: "POST" });
      await load();
      onChanged?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const run = data?.run;
  const running = run ? !TERMINAL.includes(run.status) : false;
  const scenesOf = (vid: string) => (data?.scenes ?? []).filter((s) => s.video_id === vid);
  const doneScenes = (data?.scenes ?? []).filter((s) => s.status === "done").length;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="flex h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised shadow-2xl"
          initial={{ scale: 0.96, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 12 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* header */}
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-ink">Execução · {run?.slot ?? runId}</h2>
                {run && <StatusChip status={run.status} />}
              </div>
              <p className="truncate text-[11px] text-ink-faint">{runId}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={load} title="Atualizar" className="rounded-md p-1.5 text-ink-faint hover:bg-surface-overlay hover:text-ink"><RefreshCw className="size-4" /></button>
              {running && (
                <button onClick={() => act("cancel")} disabled={busy} title="Cancelar" className="rounded-md p-1.5 text-ink-faint hover:bg-red-500/15 hover:text-red-300"><Ban className="size-4" /></button>
              )}
              <button onClick={() => act("retry")} disabled={busy} className="flex items-center gap-1 rounded-md bg-lumix-purple/20 px-2 py-1.5 text-xs text-ink hover:bg-lumix-purple/30">
                <RotateCw className="size-3.5" /> Re-executar
              </button>
              <button onClick={onClose} aria-label="Fechar" className="rounded-md p-1.5 text-ink-faint hover:bg-surface-overlay hover:text-ink"><X className="size-4" /></button>
            </div>
          </div>

          {/* kpis + erro */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border-subtle px-5 py-2 text-xs text-ink-dim">
            <span>Vídeos: <b className="text-ink">{data?.videos.length ?? 0}</b></span>
            <span>Cenas: <b className="text-ink">{doneScenes}/{data?.scenes.length ?? 0}</b></span>
            <span>Créditos: <b className="text-ink">{run?.credits_settled ?? 0}</b>/{run?.credits_reserved ?? 0}</span>
            <span className="text-ink-faint">{run ? new Date(run.created_at).toLocaleString("pt-BR") : ""}</span>
          </div>
          {run?.error && (
            <div className="mx-5 mt-2 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{run.error}</span>
            </div>
          )}
          {err && <p className="mx-5 mt-2 text-xs text-red-300">{err}</p>}

          {/* tabs */}
          <div className="flex gap-1 px-5 pt-3">
            {([["steps", "Etapas"], ["media", "Vídeos & cenas"], ["json", "JSON"]] as const).map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-t-md px-3 py-1.5 text-xs font-medium ${tab === k ? "bg-surface text-ink" : "text-ink-faint hover:text-ink"}`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* body */}
          <div className="flex-1 overflow-auto bg-surface px-5 py-4">
            {tab === "steps" && (
              <ol className="space-y-2">
                {(data?.steps ?? []).length === 0 && <p className="text-xs text-ink-faint">Sem etapas registradas ainda.</p>}
                {(data?.steps ?? []).map((s) => (
                  <li key={s.id} className="rounded-lg border border-border-subtle bg-surface-raised p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-medium text-ink">
                        <StepIcon status={s.status} /> {stepLabel(s.step)}
                      </span>
                      <span className="text-[10px] text-ink-faint">{new Date(s.created_at).toLocaleTimeString("pt-BR")}</span>
                    </div>
                    <p className="mt-0.5 pl-6 font-mono text-[10px] text-ink-faint">{s.step}</p>
                    <div className="pl-6"><JsonBlock data={s.meta} label="meta" /></div>
                  </li>
                ))}
              </ol>
            )}

            {tab === "media" && (
              <div className="space-y-4">
                {(data?.videos ?? []).length === 0 && <p className="text-xs text-ink-faint">Nenhum vídeo gerado ainda.</p>}
                {(data?.videos ?? []).map((v) => (
                  <div key={v.id} className="rounded-xl border border-border-subtle bg-surface-raised p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-ink"><Film className="size-4 text-lumix-magenta" /> Vídeo #{v.idx + 1}</span>
                      <StatusChip status={v.status} />
                    </div>
                    {v.caption && <p className="mb-2 rounded-md bg-surface p-2 text-xs text-ink-dim"><b className="text-ink-faint">Legenda:</b> <Expandable text={v.caption} /></p>}
                    {v.error && <p className="mb-2 text-xs text-red-300">⚠ {v.error}</p>}
                    {v.final_url && (
                      <video src={v.final_url} controls className="mb-2 max-h-72 rounded-lg border border-border-subtle" />
                    )}
                    {/* cenas */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {scenesOf(v.id).map((sc) => (
                        <div key={sc.id} className="rounded-lg border border-border-subtle bg-surface p-2">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[11px] font-medium text-ink-dim">Cena {sc.idx + 1}</span>
                            <StatusChip status={sc.status} />
                          </div>
                          {sc.video_url ? (
                            <video src={sc.video_url} controls className="mb-1 aspect-[9/16] w-full rounded object-cover" />
                          ) : sc.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={sc.image_url} alt={`Cena ${sc.idx + 1}`} loading="lazy" className="mb-1 aspect-[9/16] w-full rounded object-cover" />
                          ) : (
                            <div className="mb-1 flex aspect-[9/16] w-full items-center justify-center rounded bg-surface-overlay text-ink-faint">
                              <ImageIcon className="size-5" />
                            </div>
                          )}
                          {sc.beat && <p className="text-[10px] text-ink-faint"><Expandable text={sc.beat} max={70} /></p>}
                          {sc.error && <p className="text-[10px] text-red-300">⚠ {sc.error}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "json" && (
              <pre className="overflow-auto rounded-lg border border-border-subtle bg-surface-raised p-3 font-mono text-[11px] leading-relaxed text-ink-dim">
                {JSON.stringify(data, null, 2)}
              </pre>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
