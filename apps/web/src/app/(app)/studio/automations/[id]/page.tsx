"use client";

// Designer NO-CODE da automação (React Flow + nós customizados com controles
// inline). Tela cheia, paleta por categoria, CRUD de nó, Validar/Testar/Salvar/Ativar.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Play } from "lucide-react";
import { NODE_CATEGORY, NODE_TYPES, type NodeType } from "@lsm/shared/automation";
import { apiFetch } from "@/lib/api";
import { defaultConfig } from "@/lib/automation-fields";
import { EditorProvider, LsmNode, type EditorData, type LsmNodeData } from "@/components/automation/automation-node";
import { Banner, Button } from "@/components/ui";

type FlowNode = Node<LsmNodeData, "lsm">;

interface Workflow {
  id: string;
  name: string;
  status: "draft" | "active" | "paused";
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
}
interface GraphNode { id: string; type: string; position?: { x: number; y: number }; config?: Record<string, unknown>; label?: string }
interface GraphEdge { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }
interface Run { id: string; status: string; slot: string; created_at: string }

const CAT_LABEL: Record<string, string> = {
  trigger: "Gatilho / Fontes",
  flow: "Fluxo",
  ai: "Agentes IA",
  media: "Mídia",
  data: "Dados",
  output: "Saída",
};

type RunStatus = "pending" | "running" | "done" | "failed";

// fases de execução do motor mapeadas a TIPOS de nó (animação nó-a-nó)
const PHASES: NodeType[][] = [
  ["Schedule", "GetNichePack", "GetCharacter", "GetAccounts", "LoopAccounts"],
  ["DirectorAgent", "HookSelector", "CaptionAgent", "SafetyFilter"],
  ["SceneImage", "VideoGen"],
  ["Stitch", "AddMusic", "AddCaptions", "Trim"],
  ["PublishTikTok", "SaveLibrary", "Notify"],
];

function phaseFromRun(
  status: string,
  steps: Array<{ step: string }>,
): { phase: number; finished: boolean; failed: boolean } {
  if (status === "done" || status === "partial") return { phase: PHASES.length, finished: true, failed: false };
  if (status === "failed" || status === "skipped") return { phase: PHASES.length, finished: true, failed: true };
  if (status === "queued" || status === "planning") return { phase: 0, finished: false, failed: false };
  // running: infere pela etapa mais avançada já vista
  const kinds = new Set(steps.map((s) => s.step.split(":")[0]));
  let phase = 1; // running ⇒ plan concluído
  if (kinds.has("scene")) phase = 2;
  if (kinds.has("stitch")) phase = 3;
  return { phase, finished: false, failed: false };
}

function statusMap(info: { phase: number; finished: boolean; failed: boolean }): Record<string, RunStatus> {
  const m: Record<string, RunStatus> = {};
  PHASES.forEach((types, i) => {
    for (const t of types) {
      if (info.finished) m[t] = info.failed ? "failed" : "done";
      else if (i < info.phase) m[t] = "done";
      else if (i === info.phase) m[t] = "running";
      else m[t] = "pending";
    }
  });
  return m;
}

export default function AutomationEditor() {
  const { id } = useParams<{ id: string }>();
  const nodeTypes = useMemo(() => ({ lsm: LsmNode }), []);

  const [wf, setWf] = useState<Workflow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [editorData, setEditorData] = useState<{ packs: EditorData["packs"]; characters: EditorData["characters"] }>({ packs: [], characters: [] });
  const [nodeStatus, setNodeStatus] = useState<Record<string, RunStatus>>({});
  const [runId, setRunId] = useState<string | null>(null);
  const [execOpen, setExecOpen] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [showRuns, setShowRuns] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRuns = useCallback(() => {
    apiFetch<{ runs: Run[] }>(`/workflows/${id}/runs`).then((r) => setRuns(r.runs)).catch(() => setRuns([]));
  }, [id]);

  useEffect(() => {
    apiFetch<{ workflow: Workflow }>(`/workflows/${id}`)
      .then((r) => {
        setWf(r.workflow);
        setNodes(
          (r.workflow.graph?.nodes ?? []).map((n) => ({
            id: n.id,
            type: "lsm" as const,
            position: n.position ?? { x: 120, y: 120 },
            data: { nodeType: n.type as NodeType, config: n.config ?? {} },
          })),
        );
        setEdges((r.workflow.graph?.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, animated: true })));
      })
      .catch((e: Error) => setMsg({ kind: "error", text: e.message }));

    Promise.all([
      apiFetch<{ niche_packs: Array<{ id: string; name: string }> }>("/niche-packs").catch(() => ({ niche_packs: [] })),
      apiFetch<{ characters: Array<{ id: string; name: string }> }>("/characters").catch(() => ({ characters: [] })),
    ]).then(([p, c]) => setEditorData({ packs: p.niche_packs, characters: c.characters }));
    loadRuns();
  }, [id, setNodes, setEdges, loadRuns]);

  // polling do run ativo → anima os nós por fase (estilo n8n)
  useEffect(() => {
    if (!runId) {
      setNodeStatus({});
      return;
    }
    let active = true;
    const iv = setInterval(tick, 2000);
    void tick();
    async function tick() {
      try {
        const r = await apiFetch<{ run: { status: string }; steps: Array<{ step: string }> }>(`/runs/${runId}`);
        if (!active) return;
        const info = phaseFromRun(r.run.status, r.steps ?? []);
        setNodeStatus(statusMap(info));
        if (info.finished) {
          clearInterval(iv);
          loadRuns();
          setTimeout(() => active && setRunId(null), 4500); // mantém o highlight final
        }
      } catch {
        /* mantém o último estado */
      }
    }
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [runId, loadRuns]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge({ ...c, id: crypto.randomUUID(), animated: true }, eds)), [setEdges]);

  function addNode(type: NodeType) {
    setNodes((ns) => [
      ...ns,
      { id: crypto.randomUUID(), type: "lsm", position: { x: 160 + Math.random() * 320, y: 100 + Math.random() * 320 }, data: { nodeType: type, config: defaultConfig(type) } },
    ]);
  }

  function serialize() {
    return {
      nodes: nodes.map((n) => ({ id: n.id, type: n.data.nodeType, position: n.position, config: n.data.config })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined })),
    };
  }

  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const save = () => action(async () => {
    await apiFetch(`/workflows/${id}`, { method: "PATCH", body: { graph: serialize() } });
    setMsg({ kind: "success", text: "Salvo." });
  });
  const validate = () => action(async () => {
    const r = await apiFetch<{ ok: boolean; errors?: string[] }>(`/workflows/${id}/validate`, { method: "POST", body: { graph: serialize() } });
    setMsg(r.ok ? { kind: "success", text: "Grafo válido — pronto para ativar." } : { kind: "error", text: `Inválido: ${r.errors?.join(" | ")}` });
  });
  const startRun = () =>
    action(async () => {
      setExecOpen(false);
      await apiFetch(`/workflows/${id}`, { method: "PATCH", body: { graph: serialize() } });
      const r = await apiFetch<{ run_id: string }>(`/workflows/${id}/test`, { method: "POST" });
      setMsg({ kind: "info", text: "Execução iniciada — acompanhe os nós." });
      setShowRuns(true);
      setNodeStatus(statusMap({ phase: 0, finished: false, failed: false }));
      setRunId(r.run_id);
    });

  const triggers = useMemo(() => {
    const sched = nodes
      .filter((n) => n.data.nodeType === "Schedule")
      .map((n) => {
        const times = (n.data.config?.post_times as string[] | undefined) ?? [];
        return `Agendamento${times.length ? ` (${times.join(", ")})` : ""}`;
      });
    return [...sched, "Manual (agora)"];
  }, [nodes]);

  // animação simulada (sem backend) — só para visualizar o fluxo nó-a-nó
  function runDemo() {
    setExecOpen(false);
    setRunId(null);
    let i = 0;
    setNodeStatus(statusMap({ phase: 0, finished: false, failed: false }));
    setMsg({ kind: "info", text: "Demo: simulando a execução nó-a-nó." });
    const iv = setInterval(() => {
      i += 1;
      if (i >= PHASES.length) {
        clearInterval(iv);
        setNodeStatus(statusMap({ phase: PHASES.length, finished: true, failed: false }));
        setTimeout(() => setNodeStatus({}), 3000);
      } else {
        setNodeStatus(statusMap({ phase: i, finished: false, failed: false }));
      }
    }, 1100);
  }
  const setStatus = (status: "active" | "paused") => action(async () => {
    await apiFetch(`/workflows/${id}`, { method: "PATCH", body: { graph: serialize(), status } });
    setWf((w) => (w ? { ...w, status } : w));
    setMsg({ kind: "success", text: status === "active" ? "Automação ativada." : "Pausada." });
  });

  const grouped = useMemo(() => {
    const g: Record<string, NodeType[]> = {};
    for (const t of NODE_TYPES) (g[NODE_CATEGORY[t]] ??= []).push(t);
    return g;
  }, []);

  if (!wf) return <p className="text-sm text-ink-dim">Carregando…</p>;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/studio/automations" className="text-sm text-ink-dim hover:text-ink">← Automações</Link>
          <h1 className="text-lg font-bold">{wf.name}</h1>
          <span className={`rounded px-2 py-0.5 text-xs ${wf.status === "active" ? "bg-emerald-600/15 text-emerald-300" : wf.status === "paused" ? "bg-amber-600/15 text-amber-300" : "bg-surface-overlay text-ink-faint"}`}>
            {wf.status === "active" ? "Ativa" : wf.status === "paused" ? "Pausada" : "Rascunho"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => { setShowRuns((s) => !s); loadRuns(); }}>Runs</Button>
          <Button variant="secondary" onClick={validate} disabled={busy}>Validar</Button>
          <div className="relative">
            <Button variant="secondary" onClick={() => setExecOpen((o) => !o)} disabled={busy}>
              <Play className="size-3.5" /> Executar
            </Button>
            {execOpen && (
              <div className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-border-subtle bg-surface-raised p-1 shadow-2xl">
                <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-ink-faint">Executar a partir de</p>
                {triggers.map((t, i) => (
                  <button
                    key={i}
                    onClick={startRun}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink-dim transition-colors hover:bg-surface-overlay hover:text-ink"
                  >
                    <Play className="size-3 text-lumix-purple" /> {t}
                  </button>
                ))}
                <div className="my-1 border-t border-border-subtle" />
                <button
                  onClick={runDemo}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink-faint transition-colors hover:bg-surface-overlay hover:text-ink"
                >
                  <Play className="size-3 text-lumix-blue" /> Demo (simular animação)
                </button>
              </div>
            )}
          </div>
          <Button onClick={save} disabled={busy}>Salvar</Button>
          {wf.status === "active" ? (
            <Button variant="danger" onClick={() => setStatus("paused")} disabled={busy}>Pausar</Button>
          ) : (
            <Button onClick={() => setStatus("active")} disabled={busy}>Ativar</Button>
          )}
        </div>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {/* área principal — tela cheia */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* paleta */}
        <div className="w-48 shrink-0 space-y-3 overflow-y-auto rounded-xl border border-border-subtle bg-surface-raised p-3">
          {Object.entries(grouped).map(([cat, types]) => (
            <div key={cat}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{CAT_LABEL[cat] ?? cat}</p>
              <div className="space-y-1">
                {types.map((t) => (
                  <button key={t} onClick={() => addNode(t)} className="block w-full rounded-md border border-border-subtle px-2 py-1 text-left text-xs text-ink-dim hover:border-lumix-purple hover:text-ink">
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* canvas */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-border-subtle">
          <EditorProvider value={{ ...editorData, nodeStatus }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              fitView
              colorMode="dark"
              defaultEdgeOptions={{ animated: true, style: { stroke: "#8b5cf6" } }}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} color="#26263a" />
              <Controls />
              <MiniMap pannable zoomable className="!bg-surface-raised" nodeColor="#8b5cf6" maskColor="rgba(10,10,15,0.7)" />
            </ReactFlow>
          </EditorProvider>

          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-ink-faint">Clique nos nós da paleta para montar a automação →</p>
            </div>
          )}
        </div>

        {/* drawer de runs */}
        {showRuns && (
          <div className="w-64 shrink-0 space-y-2 overflow-y-auto rounded-xl border border-border-subtle bg-surface-raised p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-ink-faint">Runs recentes</p>
              <button onClick={loadRuns} className="text-xs text-lumix-blue hover:underline">↻</button>
            </div>
            {runs.length === 0 ? (
              <p className="text-xs text-ink-faint">Nenhum run ainda.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {runs.slice(0, 20).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded border border-border-subtle px-2 py-1">
                    <span className="truncate text-ink-dim">{r.slot}</span>
                    <span className={r.status === "done" ? "text-emerald-300" : r.status === "failed" ? "text-red-400" : "text-ink-faint"}>{r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
