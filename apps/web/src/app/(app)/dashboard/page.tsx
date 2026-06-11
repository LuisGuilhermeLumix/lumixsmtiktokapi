"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { Overview, Post } from "@/lib/types";
import { Banner, Button, Card, EmptyState, Spinner, StatCard } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recent, setRecent] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Overview>("/analytics/overview"),
      apiFetch<{ posts: Post[] }>("/posts?limit=8"),
    ])
      .then(([ov, ps]) => {
        setOverview(ov);
        setRecent(ps.posts);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <Banner kind="error">{error}</Banner>;
  if (!overview || !recent)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );

  const t = overview.totals;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/posts/new">
          <Button>+ Novo post</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Posts agendados" value={String(t.posts_scheduled)} />
        <StatCard label="Publicados no mês" value={String(t.posts_published_month)} />
        <StatCard label="Contas conectadas" value={String(t.accounts)} />
        <StatCard label="Followers (total)" value={formatNumber(t.followers)} />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Posts recentes</h2>
          <Link href="/posts" className="text-sm text-ink-dim hover:text-ink">
            Ver todos →
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            title="Nenhum post ainda"
            hint="Crie o primeiro post para uma conta conectada."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{p.caption || "(sem legenda)"}</p>
                  <p className="text-xs text-ink-faint">
                    {p.schedule_at
                      ? `agendado p/ ${formatDateTime(p.schedule_at)}`
                      : formatDateTime(p.created_at)}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
