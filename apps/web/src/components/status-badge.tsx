const STYLES: Record<string, { label: string; cls: string }> = {
  // posts / targets
  draft: { label: "Rascunho", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  scheduled: { label: "Agendado", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  pending: { label: "Pendente", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  queued: { label: "Na fila", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  publishing: { label: "Publicando", cls: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  published: { label: "Publicado", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  failed: { label: "Falhou", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  // contas
  connected: { label: "Conectada", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  expired: { label: "Expirada", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  revoked: { label: "Revogada", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? { label: status, cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}
