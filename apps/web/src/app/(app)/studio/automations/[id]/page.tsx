"use client";

// Designer visual da automação (React Flow). Paleta → canvas → painel de config
// (JSON por nó) → Validar (compila) / Testar (run) / Salvar / Ativar.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NODE_CATEGORY, NODE_TYPES } from "@lsm/shared/automation";
import { apiFetch } from "@/lib/api";
import { Banner, Button, Card, Label, Spinner, Textarea } from "@/components/ui";

type NodeData = { label: string; nodeType: string; config: Record<string, unknown> };
type FlowNode = Node<NodeData>;

interface Workflow {
  id: string;
  name: string;
  status: "draft" | "active" | "paused";
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
}
interface GraphNode {
  id: string;
  type: string;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
  label?: string;
}
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}
interface Run {
  id: string;
  status: string;
  slot: string;
  created_at: string;
}

const CAT_COLOR: Record<string, string> = {
  trigger: "#3b82f6",
  flow: "#9ca3af",
  ai: "#8b5cf6",
  media: "#d946ef",
  data: "#10b981",
  output: "#f59e0b",
};

export default function AutomationEditor() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [wf, setWf] = useState<Workflow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRuns = useCallback(() => {
    apiFetch<{ runs: Run[] }>(`/workflows/${id}/runs`)
      .then((r) => setRuns(r.runs))
      .catch(() => setRuns([]));
  }, [id]);

  useEffect(() => {
    apiFetch<{ workflow: Workflow }>(`/workflows/${id}`)
      .then((r) => {
        setWf(r.workflow);
        setNodes(
          (r.workflow.graph?.nodes ?? []).map((n) => ({
            id: n.id,
            position: n.position ?? { x: 80, y: 80 },
            data: { label: n.label ?? n.type, nodeType: n.type, config: n.config ?? {} },
            style: {
              border: `2px solid ${CAT_COLOR[NODE_CATEGORY[n.type as keyof typeof NODE_CATEGORY] ?? "flow"]}`,
              borderRadius: 8,
              padding: 6,
              background: "#13131a",
              color: "#e5e7eb",
              fontSize: 12,
            },
          })),
        );
        setEdges(
          (r.workflow.graph?.edges ?? []).map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })),
        );
      })
      .catch((e: Error) => setMsg({ kind: "error", text: e.message }));
    loadRuns();
  }, [id, setNodes, setEdges, loadRuns]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: crypto.randomUUID() }, eds)),
    [setEdges],
  );

  function addNode(type: string) {
    const nid = crypto.randomUUID();
    setNodes((ns) => [
      ...ns,
      {
        id: nid,
        position: { x: 120 + Math.random() * 240, y: 80 + Math.random() * 240 },
        data: { label: type, nodeType: type, config: {} },
        style: {
          border: `2px solid ${CAT_COLOR[NODE_CATEGORY[type as keyof typeof NODE_CATEGORY] ?? "flow"]}`,
          borderRadius: 8,
          padding: 6,
          background: "#13131a",
          color: "#e5e7eb",
          fontSize: 12,
        },
      },
    ]);
  }

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selected) ?? null, [nodes, selected]);

  function updateConfig(raw: string) {
    try {
      const config = JSON.parse(raw || "{}") as Record<string, unknown>;
      setNodes((ns) => ns.map((n) => (n.id === selected ? { ...n, data: { ...n.data, config } } : n)));
      setMsg(null);
    } catch {
      setMsg({ kind: "error", text: "JSON inválido na config do nó." });
    }
  }

  function serialize() {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.nodeType,
        position: n.position,
        config: n.data.config,
        label: n.data.label,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })),
    };
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/workflows/${id}`, { method: "PATCH", body: { graph: serialize() } });
      setMsg({ kind: "success", text: "Salvo." });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiFetch<{ ok: boolean; errors?: string[] }>(`/workflows/${id}/validate`, {
        method: "POST",
        body: { graph: serialize() },
      });
      setMsg(
        r.ok
          ? { kind: "success", text: "Grafo válido — compilado e pronto para ativar." }
          : { kind: "error", text: `Inválido: ${r.errors?.join(" | ")}` },
      );
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/workflows/${id}`, { method: "PATCH", body: { graph: serialize() } });
      const r = await apiFetch<{ run_id: string }>(`/workflows/${id}/test`, { method: "POST" });
      setMsg({ kind: "info", text: `Run de teste disparado: ${r.run_id}` });
      setTimeout(loadRuns, 1500);
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "active" | "paused") {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/workflows/${id}`, { method: "PATCH", body: { graph: serialize(), status } });
      setWf((w) => (w ? { ...w, status } : w));
      setMsg({ kind: "success", text: status === "active" ? "Automação ativada." : "Pausada." });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!wf) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/studio/automations" className="text-sm text-ink-dim hover:text-ink">
            ← Automações
          </Link>
          <h1 className="mt-1 text-xl font-bold">{wf.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={validate} disabled={busy}>
            Validar
          </Button>
          <Button variant="secondary" onClick={test} disabled={busy}>
            Testar
          </Button>
          <Button onClick={save} disabled={busy}>
            Salvar
          </Button>
          {wf.status === "active" ? (
            <Button variant="danger" onClick={() => setStatus("paused")} disabled={busy}>
              Pausar
            </Button>
          ) : (
            <Button onClick={() => setStatus("active")} disabled={busy}>
              Ativar
            </Button>
          )}
        </div>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <div className="grid gap-4 lg:grid-cols-[200px_1fr_280px]">
        {/* paleta */}
        <Card className="max-h-[560px] space-y-2 overflow-y-auto p-3">
          <p className="text-xs font-semibold uppercase text-ink-faint">Nós</p>
          {NODE_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => addNode(t)}
              className="block w-full rounded border border-border-subtle px-2 py-1 text-left text-xs text-ink-dim hover:border-lumix-purple hover:text-ink"
              style={{ borderLeft: `3px solid ${CAT_COLOR[NODE_CATEGORY[t]] ?? "#9ca3af"}` }}
            >
              {t}
            </button>
          ))}
        </Card>

        {/* canvas */}
        <div className="h-[560px] overflow-hidden rounded-xl border border-border-subtle">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n.id)}
            fitView
            colorMode="dark"
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* painel de config + histórico */}
        <div className="space-y-4">
          <Card className="space-y-2 p-3">
            <p className="text-xs font-semibold uppercase text-ink-faint">Config do nó</p>
            {selectedNode ? (
              <>
                <p className="text-sm font-medium">{selectedNode.data.nodeType}</p>
                <Label htmlFor="cfg">JSON</Label>
                <Textarea
                  id="cfg"
                  rows={10}
                  defaultValue={JSON.stringify(selectedNode.data.config, null, 2)}
                  onBlur={(e) => updateConfig(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-ink-faint">Edite e clique fora p/ aplicar.</p>
              </>
            ) : (
              <p className="text-xs text-ink-faint">Clique num nó para editar.</p>
            )}
          </Card>

          <Card className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-ink-faint">Runs recentes</p>
              <button onClick={loadRuns} className="text-xs text-lumix-blue hover:underline">
                atualizar
              </button>
            </div>
            {runs.length === 0 ? (
              <p className="text-xs text-ink-faint">Nenhum run ainda.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {runs.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="truncate text-ink-dim">{r.slot}</span>
                    <span className="text-ink-faint">{r.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
