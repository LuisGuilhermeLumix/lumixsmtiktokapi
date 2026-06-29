"use client";

// Nó no-code do designer: renderiza os controles inline (cor, rádio, slider,
// selects, listas) a partir de NODE_FIELDS e oferece CRUD do nó (duplicar/excluir).

import { createContext, memo, useContext, useState } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Check, ChevronDown, Clapperboard, Clock, Copy, Database, GitBranch, Loader2, Search, Send, Sparkles, X } from "lucide-react";
import type { NodeType } from "@lsm/shared/automation";
import { NODE_CATEGORY } from "@lsm/shared/automation";
import { CAT_COLOR, NODE_FIELDS, defaultConfig, type FieldSpec } from "@/lib/automation-fields";

export type RunStatus = "pending" | "running" | "done" | "failed";

export interface EditorData {
  packs: Array<{ id: string; name: string }>;
  characters: Array<{ id: string; name: string }>;
  /** status de execução por TIPO de nó (para a animação nó-a-nó) */
  nodeStatus: Record<string, RunStatus>;
}
const EditorContext = createContext<EditorData>({ packs: [], characters: [], nodeStatus: {} });
export const EditorProvider = EditorContext.Provider;

const CAT_LUCIDE = {
  trigger: Clock,
  flow: GitBranch,
  ai: Sparkles,
  media: Clapperboard,
  data: Database,
  output: Send,
} as const;

type Cfg = Record<string, unknown>;
export interface LsmNodeData extends Record<string, unknown> {
  nodeType: NodeType;
  config: Cfg;
}

/** combobox com busca (estilo n8n "From list") para listas longas */
function SearchSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = options.find((o) => o.value === value);
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="nodrag flex w-full items-center justify-between rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-ink"
      >
        <span className="truncate">{current?.label ?? value ?? placeholder ?? "Selecione…"}</span>
        <ChevronDown className="size-3 shrink-0 text-ink-faint" />
      </button>
      {open && (
        <div className="nodrag nowheel absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border border-border-subtle bg-surface-raised p-1 shadow-2xl">
          <div className="sticky top-0 mb-1 flex items-center gap-1 rounded bg-surface px-1.5">
            <Search className="size-3 text-ink-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="w-full bg-transparent py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
                setQ("");
              }}
              className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${o.value === value ? "bg-lumix-purple/25 text-ink" : "text-ink-dim hover:bg-surface-overlay"}`}
            >
              {o.label}
            </button>
          ))}
          {filtered.length === 0 && <p className="px-2 py-1 text-xs text-ink-faint">Nada encontrado</p>}
        </div>
      )}
    </div>
  );
}

function Field({
  spec,
  value,
  onChange,
}: {
  spec: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { packs, characters } = useContext(EditorContext);
  const base =
    "nodrag w-full rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-ink focus:border-lumix-purple focus:outline-none";

  switch (spec.type) {
    case "text":
      return <input className={base} value={String(value ?? "")} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "textarea":
      return <textarea className={`${base} nowheel`} rows={3} value={String(value ?? "")} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "color":
      return (
        <div className="flex items-center gap-2">
          <input type="color" className="nodrag h-7 w-9 rounded border border-border-subtle bg-surface" value={String(value ?? "#8b5cf6")} onChange={(e) => onChange(e.target.value)} />
          <span className="text-xs text-ink-dim">{String(value ?? "")}</span>
        </div>
      );
    case "number":
      return <input type="number" className={base} min={spec.min} max={spec.max} value={Number(value ?? spec.default ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />;
    case "slider":
      return (
        <div className="flex items-center gap-2">
          <input type="range" className="nodrag flex-1 accent-lumix-purple" min={spec.min} max={spec.max} step={spec.step ?? 1} value={Number(value ?? spec.default ?? spec.min)} onChange={(e) => onChange(Number(e.target.value))} />
          <span className="w-8 text-right text-xs text-ink-dim">{Number(value ?? spec.default ?? spec.min)}</span>
        </div>
      );
    case "boolean":
      return (
        <button type="button" onClick={() => onChange(!value)} className={`nodrag rounded-full px-3 py-1 text-xs ${value ? "bg-lumix-purple/25 text-ink" : "bg-surface-overlay text-ink-faint"}`}>
          {value ? "Sim" : "Não"}
        </button>
      );
    case "select":
      // listas longas → combobox com busca (n8n style); curtas → select nativo
      if (spec.options.length >= 6) {
        return <SearchSelect value={String(value ?? spec.default ?? "")} options={spec.options} onChange={onChange} />;
      }
      return (
        <select className={base} value={String(value ?? spec.default ?? "")} onChange={(e) => onChange(e.target.value)}>
          {spec.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "radio":
      return (
        <div className="flex flex-wrap gap-1">
          {spec.options.map((o) => (
            <button key={o.value} type="button" onClick={() => onChange(o.value)} className={`nodrag rounded-md px-2 py-1 text-xs ${String(value ?? spec.default) === o.value ? "bg-lumix-purple/25 text-ink" : "bg-surface-overlay text-ink-faint hover:text-ink"}`}>
              {o.label}
            </button>
          ))}
        </div>
      );
    case "packSelect":
    case "characterSelect": {
      const opts = (spec.type === "packSelect" ? packs : characters).map((o) => ({ value: o.id, label: o.name }));
      return <SearchSelect value={String(value ?? spec.default ?? "")} options={opts} onChange={onChange} placeholder="Selecione…" />;
    }
    case "timeList": {
      const list = Array.isArray(value) ? (value as string[]) : (spec.default ?? []);
      return (
        <div className="space-y-1">
          {list.map((t, i) => (
            <div key={i} className="flex items-center gap-1">
              <input type="time" className={base} value={t} onChange={(e) => onChange(list.map((x, idx) => (idx === i ? e.target.value : x)))} />
              <button type="button" className="nodrag text-xs text-red-400" onClick={() => onChange(list.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="nodrag text-xs text-lumix-blue hover:underline" onClick={() => onChange([...list, "12:00"])}>+ horário</button>
        </div>
      );
    }
    case "stringList": {
      const list = Array.isArray(value) ? (value as string[]) : (spec.default ?? []);
      return <input className={base} value={list.join(", ")} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />;
    }
    case "json":
      return <textarea className={`${base} nowheel font-mono`} rows={3} defaultValue={JSON.stringify(value ?? spec.default ?? {}, null, 2)} onBlur={(e) => { try { onChange(JSON.parse(e.target.value || "{}")); } catch { /* ignora */ } }} />;
  }
}

function LsmNodeImpl({ id, data, selected }: NodeProps) {
  const rf = useReactFlow();
  const { nodeStatus } = useContext(EditorContext);
  const d = data as LsmNodeData;
  const cat = NODE_CATEGORY[d.nodeType] ?? "flow";
  const color = CAT_COLOR[cat] ?? "#6b7280";
  const fields = NODE_FIELDS[d.nodeType] ?? [];
  const Icon = CAT_LUCIDE[cat];

  // estado de execução (animação nó-a-nó)
  const rs = nodeStatus[d.nodeType];
  const runActive = Object.keys(nodeStatus).length > 0;
  const ringColor = rs === "done" ? "#10b981" : rs === "failed" ? "#ef4444" : color;
  const boxShadow = rs
    ? `0 0 0 2px ${ringColor}, 0 0 18px ${ringColor}55`
    : selected
      ? `0 0 0 2px ${color}55`
      : undefined;
  const dim = runActive && !rs;

  function set(key: string, v: unknown) {
    rf.updateNodeData(id, { config: { ...d.config, [key]: v } });
  }
  function duplicate() {
    const nid = crypto.randomUUID();
    const node = rf.getNode(id);
    rf.addNodes({
      id: nid,
      type: "lsm",
      position: { x: (node?.position.x ?? 0) + 40, y: (node?.position.y ?? 0) + 40 },
      data: { nodeType: d.nodeType, config: { ...d.config } } satisfies LsmNodeData,
    });
  }
  function remove() {
    rf.deleteElements({ nodes: [{ id }] });
  }

  return (
    <div
      className={`w-60 rounded-xl border bg-surface-raised shadow-xl transition-opacity duration-300 ${rs === "running" ? "animate-pulse" : ""} ${dim ? "opacity-40" : "opacity-100"}`}
      style={{ borderColor: ringColor, boxShadow }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color, width: 9, height: 9 }} />
      <div className="flex items-center justify-between rounded-t-xl px-3 py-2" style={{ background: `${color}22` }}>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Icon className="size-3.5" style={{ color }} /> {d.nodeType}
        </span>
        <span className="flex items-center gap-1">
          {rs === "running" && <Loader2 className="size-3.5 animate-spin" style={{ color }} />}
          {rs === "done" && <Check className="size-3.5 text-emerald-400" />}
          {rs === "failed" && <X className="size-3.5 text-red-400" />}
          <button onClick={duplicate} title="Duplicar" className="nodrag text-ink-faint hover:text-ink">
            <Copy className="size-3.5" />
          </button>
          <button onClick={remove} title="Excluir" className="nodrag text-ink-faint hover:text-red-400">
            <X className="size-3.5" />
          </button>
        </span>
      </div>
      {fields.length > 0 ? (
        <div className="space-y-2 px-3 py-2">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-faint">{f.label}</span>
              <Field spec={f} value={d.config[f.key]} onChange={(v) => set(f.key, v)} />
            </label>
          ))}
        </div>
      ) : (
        <p className="px-3 py-2 text-xs text-ink-faint">Sem configuração.</p>
      )}
      <Handle type="source" position={Position.Right} style={{ background: color, width: 9, height: 9 }} />
    </div>
  );
}

export const LsmNode = memo(LsmNodeImpl);
export { defaultConfig };
