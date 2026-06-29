// Sistema de expressões {{ }} (estilo n8n) — substituição SEGURA por variáveis
// de contexto (sem eval de JS arbitrário). Suporta caminhos com ponto e alguns
// atalhos: {{ $now }}, {{ $today }}, {{ $niche }}, {{ $account.display_name }},
// {{ $character.name }}, {{ $video.idx }}, {{ $scene.beat }}.

export interface ExprContext {
  /** ISO string ou Date — base p/ $now/$today */
  now?: string | Date;
  niche?: string | { id?: string; name?: string };
  account?: { display_name?: string | null; name?: string | null };
  character?: { name?: string | null; description?: string | null };
  video?: { idx?: number };
  scene?: { idx?: number; beat?: string | null };
  [k: string]: unknown;
}

function lookup(expr: string, ctx: ExprContext): unknown {
  const now = ctx.now ? new Date(ctx.now) : null;
  if (expr === "$now") return now ? now.toISOString() : "";
  if (expr === "$today" || expr === "$date") return now ? now.toISOString().slice(0, 10) : "";

  const path = expr.replace(/^\$/, "").split(".").filter(Boolean);
  let cur: unknown = ctx;
  for (const key of path) {
    if (cur == null) return undefined;
    if (typeof cur === "string") return undefined; // ex.: $niche.name quando niche é string
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** resolve todas as expressões {{ }} de um template no contexto dado */
export function resolveExpressions(template: string, ctx: ExprContext): string {
  if (!template || !template.includes("{{")) return template;
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, raw: string) => {
    const val = lookup(raw.trim(), ctx);
    if (val == null || typeof val === "object") return "";
    return String(val);
  });
}

/** variáveis disponíveis (para dicas na UI) */
export const EXPRESSION_VARS = [
  "$now",
  "$today",
  "$niche",
  "$account.display_name",
  "$character.name",
  "$character.description",
  "$video.idx",
] as const;
