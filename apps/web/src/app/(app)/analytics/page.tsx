"use client";

// Métricas por conta: período (7/30/90 + custom por datas), KPIs animados,
// gráficos, export CSV/PDF e comparativo entre contas. Glass + framer-motion.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Eye, GitCompare, Heart, MessageCircle, Printer, Users, Video } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Overview, Snapshot } from "@/lib/types";
import { Banner, EmptyState, Spinner } from "@/components/ui";
import { CountUp, GlassCard, KpiCard, Segmented, compact, full } from "@/components/analytics/ui";

type Period = "7" | "30" | "90" | "custom";
const PERIODS = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "custom", label: "Custom" },
] as const;

const COMPARE_COLORS = ["#3b82f6", "#d946ef", "#8b5cf6", "#22d3ee", "#f59e0b", "#10b981"];
const tooltipStyle = { background: "#13131a", border: "1px solid #26263a", borderRadius: 10, color: "#e5e7eb", fontSize: 12 };

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [accountId, setAccountId] = useState("");
  const [period, setPeriod] = useState<Period>("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareSnaps, setCompareSnaps] = useState<Record<string, Snapshot[]>>({});
  const [error, setError] = useState<string | null>(null);

  const rangeQuery = useCallback(() => {
    if (period === "custom" && from && to) {
      const f = new Date(`${from}T00:00:00`).toISOString();
      const t = new Date(`${to}T23:59:59`).toISOString();
      return `from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`;
    }
    return `days=${period === "custom" ? "30" : period}`;
  }, [period, from, to]);

  useEffect(() => {
    apiFetch<Overview>("/analytics/overview")
      .then((ov) => {
        setOverview(ov);
        if (ov.accounts.length > 0) setAccountId((a) => a || ov.accounts[0]!.id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // série da conta única
  useEffect(() => {
    if (!accountId || compareMode) return;
    if (period === "custom" && (!from || !to)) return;
    setSnapshots(null);
    apiFetch<{ snapshots: Snapshot[] }>(`/analytics/accounts/${accountId}?${rangeQuery()}`)
      .then((r) => setSnapshots(r.snapshots))
      .catch((e: Error) => setError(e.message));
  }, [accountId, compareMode, period, from, to, rangeQuery]);

  // séries das contas em comparação
  useEffect(() => {
    if (!compareMode || compareIds.length === 0) return;
    if (period === "custom" && (!from || !to)) return;
    Promise.all(
      compareIds.map((id) =>
        apiFetch<{ snapshots: Snapshot[] }>(`/analytics/accounts/${id}?${rangeQuery()}`)
          .then((r) => [id, r.snapshots] as const)
          .catch(() => [id, [] as Snapshot[]] as const),
      ),
    ).then((pairs) => setCompareSnaps(Object.fromEntries(pairs)));
  }, [compareMode, compareIds, period, from, to, rangeQuery]);

  const account = overview?.accounts.find((a) => a.id === accountId) ?? null;
  const nameOf = (id: string) => overview?.accounts.find((a) => a.id === id)?.display_name ?? id.slice(0, 6);

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
        .map((v, i) => ({ name: `#${i + 1}`, views: v.views, likes: v.likes })),
    [overview, accountId],
  );

  // dataset combinado p/ comparativo (followers por data, 1 série por conta)
  const compareChart = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const id of compareIds) {
      const key = nameOf(id);
      for (const s of compareSnaps[id] ?? []) {
        const d = formatDate(s.captured_at);
        const row = byDate.get(d) ?? { date: d };
        row[key] = s.followers;
        byDate.set(d, row);
      }
    }
    return [...byDate.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareSnaps, compareIds]);

  function exportCsv() {
    const rows = [["data", "seguidores", "curtidas"], ...(snapshots ?? []).map((s) => [formatDate(s.captured_at), String(s.followers), String(s.likes)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `metricas-${account?.display_name ?? "conta"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleCompare(id: string) {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (error) return <Banner kind="error">{error}</Banner>;
  if (!overview)
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">
            Métricas <span className="text-gradient">por conta</span>
          </h1>
          <p className="mt-1 text-sm text-ink-dim">Coletadas automaticamente a cada 6 horas.</p>
        </div>
        {overview.accounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented options={PERIODS} value={period} onChange={setPeriod} />
            {period === "custom" && (
              <div className="flex items-center gap-1">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-ink" aria-label="Data início" />
                <span className="text-ink-faint">–</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-ink" aria-label="Data fim" />
              </div>
            )}
            <button
              onClick={() => setCompareMode((c) => !c)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${compareMode ? "border-lumix-purple bg-lumix-purple/15 text-ink" : "border-border-subtle text-ink-dim hover:text-ink"}`}
            >
              <GitCompare className="size-3.5" /> Comparar
            </button>
            {!compareMode && (
              <>
                <button onClick={exportCsv} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-ink-dim transition-colors hover:text-ink">
                  <Download className="size-3.5" /> CSV
                </button>
                <button onClick={() => window.print()} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-ink-dim transition-colors hover:text-ink">
                  <Printer className="size-3.5" /> PDF
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {overview.accounts.length === 0 ? (
        <EmptyState title="Nenhuma conta conectada" hint="Conecte uma conta TikTok para começar a coletar métricas." />
      ) : compareMode ? (
        <CompareView
          accounts={overview.accounts}
          selected={compareIds}
          onToggle={toggleCompare}
          chart={compareChart}
          compareSnaps={compareSnaps}
          nameOf={nameOf}
        />
      ) : (
        <>
          {/* seletor de conta */}
          <div className="flex flex-wrap gap-2 print:hidden">
            {overview.accounts.map((a) => {
              const active = a.id === accountId;
              return (
                <button
                  key={a.id}
                  onClick={() => setAccountId(a.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-lumix-purple bg-lumix-purple/15 text-ink" : "border-border-subtle text-ink-dim hover:border-ink-faint hover:text-ink"}`}
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard icon={Users} label="Seguidores" value={kpi.followers} delta={kpi.followersDelta} accent="#3b82f6" index={0} />
            <KpiCard icon={Heart} label="Curtidas (conta)" value={kpi.likes} delta={kpi.likesDelta} accent="#d946ef" index={1} />
            <KpiCard icon={Video} label="Vídeos" value={kpi.videos} accent="#8b5cf6" index={2} />
            <KpiCard icon={Eye} label="Views (vídeos)" value={kpi.views} accent="#22d3ee" index={3} />
            <KpiCard icon={MessageCircle} label="Comentários" value={kpi.comments} accent="#f59e0b" index={4} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Seguidores no tempo" color="#3b82f6" gradId="g-fol" data={chartData} dataKey="followers" loading={!snapshots} delay={0.1} />
            <ChartCard title="Curtidas no tempo" color="#d946ef" gradId="g-lik" data={chartData} dataKey="likes" loading={!snapshots} delay={0.16} />
          </div>

          <GlassCard className="p-5" delay={0.2}>
            <h2 className="mb-4 font-semibold">Views por vídeo (top da conta)</h2>
            {videoBars.length === 0 || videoBars.every((v) => v.views === 0) ? (
              <EmptyState
                title="Sem métricas de vídeo ainda"
                hint="As views aparecem para posts públicos (Direct Post) após a coleta automática (6/6h). Posts entregues como rascunho ou privados (SELF_ONLY) não retornam métricas de vídeo do TikTok."
              />
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

/* ───────── comparativo entre contas ───────── */
function CompareView({
  accounts,
  selected,
  onToggle,
  chart,
  compareSnaps,
  nameOf,
}: {
  accounts: Overview["accounts"];
  selected: string[];
  onToggle: (id: string) => void;
  chart: Array<Record<string, number | string>>;
  compareSnaps: Record<string, Snapshot[]>;
  nameOf: (id: string) => string;
}) {
  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase text-ink-faint">Selecione contas para comparar</p>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => {
            const i = selected.indexOf(a.id);
            const on = i >= 0;
            return (
              <button
                key={a.id}
                onClick={() => onToggle(a.id)}
                className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors"
                style={{ borderColor: on ? COMPARE_COLORS[i % COMPARE_COLORS.length] : "#26263a", color: on ? "#e5e7eb" : "#9ca3af", background: on ? `${COMPARE_COLORS[i % COMPARE_COLORS.length]}1f` : "transparent" }}
              >
                <span className="size-2.5 rounded-full" style={{ background: on ? COMPARE_COLORS[i % COMPARE_COLORS.length] : "#3a3a4a" }} />
                {a.display_name ?? "Conta TikTok"}
              </button>
            );
          })}
        </div>
      </GlassCard>

      {selected.length === 0 ? (
        <EmptyState title="Escolha pelo menos uma conta" hint="Selecione 2 ou mais para comparar lado a lado." />
      ) : (
        <>
          {/* KPI por conta */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {selected.map((id, i) => {
              const snaps = compareSnaps[id] ?? [];
              const first = snaps[0];
              const last = snaps[snaps.length - 1];
              const color = COMPARE_COLORS[i % COMPARE_COLORS.length]!;
              return (
                <GlassCard key={id} className="p-5" delay={i * 0.05}>
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full" style={{ background: color }} />
                    <p className="truncate text-sm font-medium">{nameOf(id)}</p>
                  </div>
                  <p className="mt-3 text-2xl font-bold tracking-tight">
                    <CountUp value={last?.followers ?? 0} />
                  </p>
                  <p className="text-xs text-ink-dim">
                    seguidores ·{" "}
                    <span className={first && last && last.followers - first.followers >= 0 ? "text-emerald-300" : "text-red-300"}>
                      {first && last ? (last.followers - first.followers >= 0 ? "+" : "") + full(last.followers - first.followers) : "—"}
                    </span>{" "}
                    no período
                  </p>
                </GlassCard>
              );
            })}
          </div>

          {/* gráfico sobreposto */}
          <GlassCard className="p-5" delay={0.1}>
            <h2 className="mb-4 font-semibold">Seguidores — comparativo</h2>
            {chart.length < 2 ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-ink-faint">Histórico insuficiente para comparar.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chart}>
                  <CartesianGrid stroke="#26263a" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={12} minTickGap={24} />
                  <YAxis stroke="#6b7280" fontSize={12} width={48} tickFormatter={compact} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => full(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {selected.map((id, i) => (
                    <Line key={id} type="monotone" dataKey={nameOf(id)} stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]} strokeWidth={2} dot={false} animationDuration={700} />
                  ))}
                </LineChart>
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
