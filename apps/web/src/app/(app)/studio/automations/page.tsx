"use client";

// Lista de automações (workflows) + criação. O editor visual fica em [id].

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Banner, Button, Card, Input, Label, Spinner } from "@/components/ui";

interface Workflow {
  id: string;
  name: string;
  status: "draft" | "active" | "paused";
  post_times: string[];
}

const STATUS_LABEL: Record<Workflow["status"], string> = {
  draft: "Rascunho",
  active: "Ativa",
  paused: "Pausada",
};

export default function AutomationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Workflow[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [templates, setTemplates] = useState<Array<{ id: string; name: string; description: string }>>([]);

  useEffect(() => {
    apiFetch<{ workflows: Workflow[] }>("/workflows")
      .then((r) => setItems(r.workflows))
      .catch((e: Error) => setError(e.message));
    apiFetch<{ templates: Array<{ id: string; name: string; description: string }> }>("/workflow-templates")
      .then((r) => setTemplates(r.templates))
      .catch(() => setTemplates([]));
  }, []);

  async function remove(id: string, name: string) {
    if (!confirm(`Excluir a automação "${name}"?`)) return;
    try {
      await apiFetch(`/workflows/${id}`, { method: "DELETE" });
      setItems((prev) => (prev ? prev.filter((w) => w.id !== id) : prev));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createFromTemplate(templateId: string, templateName: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ workflow: Workflow }>("/workflows/from-template", {
        method: "POST",
        body: { template: templateId, name: templateName },
      });
      router.push(`/studio/automations/${r.workflow.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Dê um nome.");
    setBusy(true);
    try {
      const r = await apiFetch<{ workflow: Workflow }>("/workflows", {
        method: "POST",
        body: { name },
      });
      router.push(`/studio/automations/${r.workflow.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/studio" className="text-sm text-ink-dim hover:text-ink">
          ← Estúdio IA
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Automações</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Esteiras visuais: nicho → cenas → vídeo → publicação, rodando sozinhas nos horários.
        </p>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        <form onSubmit={create} className="flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="name">Nova automação</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Fazenda UGC — 2 vídeos/dia"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner /> : "Criar"}
          </Button>
        </form>
      </Card>

      {templates.length > 0 && (
        <Card className="space-y-3">
          <p className="text-sm font-semibold">Começar por um template</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => createFromTemplate(t.id, t.name)}
                disabled={busy}
                className="rounded-lg border border-border-subtle p-3 text-left transition-colors hover:border-lumix-purple disabled:opacity-50"
              >
                <p className="text-sm font-medium">{t.name}</p>
                <p className="mt-1 text-xs text-ink-faint">{t.description}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Card className="text-sm text-ink-faint">Nenhuma automação ainda.</Card>
      ) : (
        <div className="space-y-3">
          {items.map((w) => (
            <Card key={w.id} className="flex items-center justify-between gap-3 transition-colors hover:border-lumix-purple/50">
              <Link href={`/studio/automations/${w.id}`} className="min-w-0 flex-1">
                <p className="font-medium">{w.name}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {w.post_times?.length ? w.post_times.join(", ") : "sem horários"}
                </p>
              </Link>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  w.status === "active"
                    ? "bg-emerald-600/15 text-emerald-300"
                    : w.status === "paused"
                      ? "bg-amber-600/15 text-amber-300"
                      : "bg-surface-overlay text-ink-faint"
                }`}
              >
                {STATUS_LABEL[w.status]}
              </span>
              <button
                onClick={() => remove(w.id, w.name)}
                className="text-xs text-ink-faint hover:text-red-400"
                title="Excluir"
              >
                ✕
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
