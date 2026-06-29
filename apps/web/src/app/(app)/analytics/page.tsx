"use client";

// Métricas por conta: seleciona a conta + período, KPIs animados (count-up +
// delta), gráficos de followers/likes no tempo e views por vídeo. Glassmorphism
// + framer-motion. Dados: /analytics/overview e /analytics/accounts/:id.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Eye, Heart, MessageCircle, Users, Video } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Overview, Snapshot } from "@/lib/types";
import { Banner, EmptyState, Spinner } from "@/components/ui";
import { CountUp, GlassCard, KpiCard, Segmented, compact, full } from "@/components/analytics/ui";

const PERIODS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
] as const;

const tooltipStyle = {
  background: "#13131a",
  border: "1px solid #26263a",
  borderRadius: 10,
  color: "#e5e7eb",
  fontSize: 12,
};

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [accountId, setAccountId] = useState("");
  const [days, setDays] = useState<(typeof PERIODS)[number]["value"]>("30");
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Overview>("/analytics/overview")
      .then((ov) => {
        setOverview(ov);
        if (ov.accounts.length > 0) setAccountId((a) => a || ov.accounts[0]!.id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!accountId) return;
    setSnapshots(null);
    apiFetch<{ snapshots: Snapshot[] }>(`/analytics/accounts/${accountId}?days=${days}`)
      .then((r) => setSnapshots(r.snapshots))
      .catch((e: Error) => setError(e.message));
  }, [accountId, days]);

  const account = overview?.accounts.find((a) => a.id === accountId) ?? null;

  // KPIs + deltas a partir dos snapshots do período
  const kpi = useMemo(() => {
    const snaps = snapshots ?? [];
    const first = snaps[0];
    const last = snaps[snaps.length - 1];
    const latest = account?.latest;
    const vids = (overview?.top_videos ?? []).filter((v) => v.social_account_id === accountId);
    return {
      followers: latest?.followers ?? last?.followers ?? 0,
      followersDelta: first && last ? last.followers - first.followers : 0,
      likes: latest?.likes ?? last?.likes ?? 0,
      likesDelta: first && last ? last.likes - first.likes : 0,
      videos: latest?.video_count ?? 0,
      views: vids.reduce((s, v) => s + v.views, 0),
      comments: vids.reduce((s, v) => s + v.comments, 0),
    };
  }, [snapshots, account, overview, accountId]);

  const chartData = useMemo(
    () => (snapshots ?? []).map((s) => ({ date: formatDate(s.captured_at), followers: s.followers, likes: s.likes })),
    [snapshots],
  );
  const videoBars = useMemo(
    () =>
      (overview?.top_videos ?? [])
        .filter((v) => v.social_account_id === accountId)
        .slice(0, 8)
        .map((v, i) => ({ name: `#${i + 1}`, views: v.views, likes: v.likes, url: v.post_url })),
    [overview, accountId],
  );

  if (error) return <Banner kind="error">{error}</Banner>;
  if (!overview)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Métricas <span className="text-gradient">por conta</span>
          </h1>
          <p className="mt-1 text-sm text-ink-dim">Coletadas automaticamente a cada 6 horas.</p>
        </div>
        {account && <Segmented options={PERIODS} value={days} onChange={setDays} />}
      </div>

      {overview.accounts.length === 0 ? (
        <EmptyState title="Nenhuma conta conectada" hint="Conecte uma conta TikTok para começar a coletar métricas." />
      ) : (
        <>
          {/* seletor de conta (pills com avatar) */}
          <div className="flex flex-wrap gap-2">
            {overview.accounts.map((a) => {
              const active = a.id === accountId;
              return (
                <button
                  key={a.id}
                  onClick={() => setAccountId(a.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "border-lumix-purple bg-lumix-purple/15 text-ink"
                      : "border-border-subtle text-ink-dim hover:border-ink-faint hover:text-ink"
                  }`}
                >
                  {a.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatar_url} alt="" className="size-5 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-5 items-center justify-center rounded-full bg-surface-overlay text-[10px]">♪</span>
                  )}
                  {a.display_name ?? "Conta TikTok"}
                </button>
              );
            })}
          </div>

          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard icon={Users} label="Seguidores" value={kpi.followers} delta={kpi.followersDelta} accent="#3b82f6" index={0} />
            <KpiCard icon={Heart} label="Curtidas (conta)" value={kpi.likes} delta={kpi.likesDelta} accent="#d946ef" index={1} />
            <KpiCard icon={Video} label="Vídeos" value={kpi.videos} accent="#8b5cf6" index={2} />
            <KpiCard icon={Eye} label="Views (vídeos)" value={kpi.views} accent="#22d3ee" index={3} />
            <KpiCard icon={MessageCircle} label="Comentários" value={kpi.comments} accent="#f59e0b" index={4} />
          </div>

          {/* gráficos de série temporal */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Seguidores no tempo" color="#3b82f6" gradId="g-fol" data={chartData} dataKey="followers" loading={!snapshots} delay={0.1} />
            <ChartCard title="Curtidas no tempo" color="#d946ef" gradId="g-lik" data={chartData} dataKey="likes" loading={!snapshots} delay={0.16} />
          </div>

          {/* views por vídeo */}
          <GlassCard className="p-5" delay={0.2}>
            <h2 className="mb-4 font-semibold">Views por vídeo (top da conta)</h2>
            {videoBars.length === 0 ? (
              <EmptyState title="Sem métricas de vídeo ainda" hint="Após publicar, as métricas chegam na próxima coleta (6/6h)." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={videoBars}>
                  <CartesianGrid stroke="#26263a" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} width={48} tickFormatter={compact} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => full(v)} cursor={{ fill: "#8b5cf615" }} />
                  <Bar dataKey="views" radius={[6, 6, 0, 0]} fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}

function ChartCard({
  title,
  color,
  gradId,
  data,
  dataKey,
  loading,
  delay,
}: {
  title: string;
  color: string;
  gradId: string;
  data: Array<{ date: string; followers: number; likes: number }>;
  dataKey: "followers" | "likes";
  loading: boolean;
  delay: number;
}) {
  return (
    <GlassCard className="p-5" delay={delay}>
      <h2 className="mb-4 font-semibold">{title}</h2>
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-[240px] items-center justify-center">
            <Spinner />
          </motion.div>
        ) : data.length < 2 ? (
          <div className="flex h-[240px] items-center justify-center px-6 text-center text-sm text-ink-faint">
            Ainda não há histórico suficiente — as métricas são coletadas a cada 6 horas.
          </div>
        ) : (
          <motion.div key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#26263a" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={12} minTickGap={24} />
                <YAxis stroke="#6b7280" fontSize={12} width={48} tickFormatter={compact} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => full(v)} />
                <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${gradId})`} strokeWidth={2} animationDuration={700} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
