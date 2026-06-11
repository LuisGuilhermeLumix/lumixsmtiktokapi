"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Client, Post } from "@/lib/types";
import { Banner, Button, Card, EmptyState, Select, Spinner } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";

const STATUS_FILTERS = [
  ["", "Todos os status"],
  ["draft", "Rascunho"],
  ["scheduled", "Agendado"],
  ["queued", "Na fila"],
  ["publishing", "Publicando"],
  ["published", "Publicado"],
  ["failed", "Falhou"],
] as const;

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [status, setStatus] = useState("");
  const [clientId, setClientId] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: "100" });
    if (status) params.set("status", status);
    if (clientId) params.set("client_id", clientId);
    apiFetch<{ posts: Post[] }>(`/posts?${params}`)
      .then((r) => setPosts(r.posts))
      .catch((e: Error) => setError(e.message));
  }, [status, clientId]);

  useEffect(load, [load]);
  useEffect(() => {
    apiFetch<{ clients: Client[] }>("/clients").then((r) => setClients(r.clients)).catch(() => {});
  }, []);

  const clientName = useCallback(
    (id: string) => clients.find((c) => c.id === id)?.name ?? "—",
    [clients],
  );

  async function publishNow(id: string) {
    setBusy(id);
    try {
      await apiFetch(`/posts/${id}/publish-now`, { method: "POST" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Cancelar este post? A mídia será removida.")) return;
    setBusy(id);
    try {
      await apiFetch(`/posts/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // ── calendário do mês ───────────────────────────────────────────
  const calendar = useMemo(() => {
    const byDay = new Map<number, Post[]>();
    for (const p of posts ?? []) {
      const when = new Date(p.schedule_at ?? p.created_at);
      if (when.getFullYear() === month.getFullYear() && when.getMonth() === month.getMonth()) {
        const day = when.getDate();
        byDay.set(day, [...(byDay.get(day) ?? []), p]);
      }
    }
    const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return { byDay, firstWeekday, daysInMonth };
  }, [posts, month]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Posts</h1>
        <Link href="/posts/new">
          <Button>+ Novo post</Button>
        </Link>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-44">
          {STATUS_FILTERS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className="!w-52">
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex rounded-lg border border-border-subtle p-0.5">
          {(["list", "calendar"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                view === v ? "bg-surface-overlay text-ink" : "text-ink-dim"
              }`}
            >
              {v === "list" ? "Lista" : "Calendário"}
            </button>
          ))}
        </div>
      </div>

      {!posts ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : view === "list" ? (
        posts.length === 0 ? (
          <EmptyState title="Nenhum post encontrado" hint="Ajuste os filtros ou crie um post." />
        ) : (
          <Card className="!p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-ink-faint">
                  <th className="px-4 py-3 font-medium">Legenda</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Cliente</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Quando</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {posts.map((p) => (
                  <tr key={p.id}>
                    <td className="max-w-[16rem] truncate px-4 py-3">
                      {p.caption || "(sem legenda)"}
                      {(p.targets ?? []).some((t) => t.error) && (
                        <p className="mt-0.5 truncate text-xs text-red-400">
                          {p.targets!.find((t) => t.error)?.error}
                        </p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-ink-dim sm:table-cell">
                      {clientName(p.client_id)}
                    </td>
                    <td className="hidden px-4 py-3 text-ink-dim md:table-cell">
                      {p.schedule_at ? formatDateTime(p.schedule_at) : formatDateTime(p.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {(p.status === "draft" ||
                          p.status === "scheduled" ||
                          p.status === "failed") && (
                          <Button
                            variant="secondary"
                            onClick={() => publishNow(p.id)}
                            disabled={busy === p.id}
                          >
                            Publicar
                          </Button>
                        )}
                        {p.status !== "published" && p.status !== "publishing" && (
                          <Button
                            variant="danger"
                            onClick={() => remove(p.id)}
                            disabled={busy === p.id}
                          >
                            Cancelar
                          </Button>
                        )}
                        {(p.targets ?? []).find((t) => t.post_url) && (
                          <a
                            href={p.targets!.find((t) => t.post_url)!.post_url!}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-border-subtle px-3 py-2 text-xs text-ink-dim hover:text-ink"
                          >
                            Ver ↗
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="rounded px-2 py-1 text-ink-dim hover:bg-surface-overlay"
              aria-label="Mês anterior"
            >
              ←
            </button>
            <p className="font-medium capitalize">
              {month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </p>
            <button
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="rounded px-2 py-1 text-ink-dim hover:bg-surface-overlay"
              aria-label="Próximo mês"
            >
              →
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-faint">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <div key={i} className="py-1">
                {d}
              </div>
            ))}
            {Array.from({ length: calendar.firstWeekday }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {Array.from({ length: calendar.daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayPosts = calendar.byDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  className={`min-h-16 rounded-lg border p-1 text-left ${
                    dayPosts.length > 0 ? "border-lumix-purple/40" : "border-border-subtle/50"
                  }`}
                >
                  <span className="text-ink-faint">{day}</span>
                  {dayPosts.slice(0, 2).map((p) => (
                    <p
                      key={p.id}
                      title={p.caption}
                      className="mt-0.5 truncate rounded bg-lumix-purple/20 px-1 text-[10px] text-ink"
                    >
                      {p.caption || "(post)"}
                    </p>
                  ))}
                  {dayPosts.length > 2 && (
                    <p className="text-[10px] text-ink-faint">+{dayPosts.length - 2}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
