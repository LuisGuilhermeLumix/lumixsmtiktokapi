"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import type { Overview, Snapshot } from "@/lib/types";
import { Banner, Card, EmptyState, Select, Spinner, StatCard } from "@/components/ui";

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [accountId, setAccountId] = useState("");
  const [days, setDays] = useState("30");
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Overview>("/analytics/overview")
      .then((ov) => {
        setOverview(ov);
        if (ov.accounts.length > 0 && !accountId) setAccountId(ov.accounts[0]!.id);
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accountId) return;
    setSnapshots(null);
    apiFetch<{ snapshots: Snapshot[] }>(`/analytics/accounts/${accountId}?days=${days}`)
      .then((r) => setSnapshots(r.snapshots))
      .catch((e: Error) => setError(e.message));
  }, [accountId, days]);

  const chartData = useMemo(
    () =>
      (snapshots ?? []).map((s) => ({
        date: formatDate(s.captured_at),
        followers: s.followers,
        likes: s.likes,
      })),
    [snapshots],
  );

  if (error) return <Banner kind="error">{error}</Banner>;
  if (!overview)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );

  const t = overview.totals;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Followers" value={formatNumber(t.followers)} hint="soma das contas" />
        <StatCard label="Likes" value={formatNumber(t.likes)} hint="soma das contas" />
        <StatCard label="Vídeos" value={formatNumber(t.videos)} />
        <StatCard label="Contas" value={String(t.accounts)} />
      </div>

      {overview.accounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta conectada"
          hint="Conecte uma conta TikTok para começar a coletar métricas."
        />
      ) : (
        <>
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Followers ao longo do tempo</h2>
              <div className="flex gap-2">
                <Select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="!w-56"
                  aria-label="Conta"
                >
                  {overview.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.display_name ?? "Conta TikTok"}
                    </option>
                  ))}
                </Select>
                <Select
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="!w-32"
                  aria-label="Período"
                >
                  <option value="7">7 dias</option>
                  <option value="30">30 dias</option>
                  <option value="90">90 dias</option>
                </Select>
              </div>
            </div>
            {!snapshots ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : chartData.length < 2 ? (
              <EmptyState
                title="Ainda não há histórico suficiente"
                hint="As métricas são coletadas a cada 6 horas — volte em breve."
              />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="followersFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#26263a" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} width={48} />
                  <Tooltip
                    contentStyle={{
                      background: "#13131a",
                      border: "1px solid #26263a",
                      borderRadius: 8,
                      color: "#e5e7eb",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="followers"
                    stroke="#8b5cf6"
                    fill="url(#followersFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 font-semibold">Top vídeos (views)</h2>
            {overview.top_videos.length === 0 ? (
              <EmptyState
                title="Sem métricas de vídeo ainda"
                hint="Após publicar, as métricas chegam na próxima coleta (6/6h)."
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-ink-faint">
                    <th className="py-2 pr-4 font-medium">Vídeo</th>
                    <th className="py-2 pr-4 font-medium">Views</th>
                    <th className="py-2 pr-4 font-medium">Likes</th>
                    <th className="hidden py-2 pr-4 font-medium sm:table-cell">Comments</th>
                    <th className="hidden py-2 font-medium sm:table-cell">Shares</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {overview.top_videos.map((v) => (
                    <tr key={v.post_target_id}>
                      <td className="py-2 pr-4">
                        {v.post_url ? (
                          <a
                            href={v.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-lumix-blue hover:underline"
                          >
                            Abrir no TikTok ↗
                          </a>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{formatNumber(v.views)}</td>
                      <td className="py-2 pr-4">{formatNumber(v.likes)}</td>
                      <td className="hidden py-2 pr-4 sm:table-cell">{formatNumber(v.comments)}</td>
                      <td className="hidden py-2 sm:table-cell">{formatNumber(v.shares)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
