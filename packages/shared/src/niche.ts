// Niche Pack — nicho é DADO, não código (princípio #5). Lê o pack, seleciona
// hook por rotação (count % len) e sanitiza texto (replacements + banned_terms)
// com fallback progressivo. Funções puras → testáveis por unidade.

import { z } from "zod";

export const nichePackDataSchema = z.object({
  hooks: z
    .array(z.object({ lang: z.string().min(1), text: z.string().min(1) }))
    .default([]),
  banned_terms: z.array(z.string()).default([]),
  replacements: z.record(z.string(), z.string()).default({}),
  /** dicas de estilo visual / defaults (livre) */
  style: z.record(z.string(), z.unknown()).default({}),
});

export type NichePackData = z.infer<typeof nichePackDataSchema>;

/** valida/normaliza o jsonb `data` de um niche_pack (aplica defaults) */
export function parseNichePack(data: unknown): NichePackData {
  return nichePackDataSchema.parse(data ?? {});
}

/**
 * Seleciona um hook por ROTAÇÃO determinística (count % len).
 * Filtra por `lang` quando houver hooks daquele idioma; senão usa todos
 * (fallback progressivo). Retorna null se o pack não tem hooks.
 */
export function selectHook(
  pack: NichePackData,
  count: number,
  lang?: string,
): { text: string; lang: string } | null {
  const all = pack.hooks;
  if (all.length === 0) return null;
  const pool = lang ? all.filter((h) => h.lang.toLowerCase() === lang.toLowerCase()) : all;
  const list = pool.length > 0 ? pool : all;
  const n = list.length;
  const i = (((count % n) + n) % n); // seguro p/ count negativo
  const hook = list[i]!;
  return { text: hook.text, lang: hook.lang };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sanitiza um texto: aplica `replacements` (substituição literal, case-insensitive)
 * e depois trata os `banned_terms` (remove, ou troca pelo replacement se existir).
 * `aggressive` = nível de fallback progressivo (0 = só pack; ≥1 também colapsa
 * espaços/pontuação duplicada deixada pela remoção).
 */
export function sanitizeText(
  pack: NichePackData,
  text: string,
  aggressive = 0,
): string {
  let out = text ?? "";

  for (const [from, to] of Object.entries(pack.replacements)) {
    if (!from) continue;
    out = out.replace(new RegExp(escapeRegExp(from), "gi"), to);
  }

  for (const term of pack.banned_terms) {
    if (!term) continue;
    const repl = pack.replacements[term] ?? "";
    out = out.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi"), repl);
  }

  if (aggressive >= 1) {
    out = out
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/([,.!?;:]){2,}/g, "$1")
      .trim();
  }
  return out;
}

/** True se o texto ainda contém algum banned_term (após sanitizar) */
export function hasBannedTerm(pack: NichePackData, text: string): boolean {
  return pack.banned_terms.some(
    (t) => t && new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(text),
  );
}
