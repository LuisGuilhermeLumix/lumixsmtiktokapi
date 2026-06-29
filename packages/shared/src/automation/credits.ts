// Matemática de créditos do motor — funções PURAS (testáveis sem DB/Redis).
// Usadas por auto-plan (reserva) e auto-credits (liquidação/estorno) e pela
// estimativa de custo da API. O markup já vem embutido em `creditsPerScene`.

export interface RunCostInput {
  accounts: number;
  videosPerAccount: number;
  numScenes: number;
  /** créditos por cena, JÁ com markup aplicado */
  creditsPerScene: number;
}

/** estimativa de custo de um run: máximo (se todas as cenas gerarem) */
export function estimateRunCost(i: RunCostInput): { videos: number; scenes: number; maxCredits: number } {
  const videos = Math.max(0, Math.floor(i.accounts)) * Math.max(0, Math.floor(i.videosPerAccount));
  const scenes = videos * Math.max(0, Math.floor(i.numScenes));
  const maxCredits = Math.ceil(scenes * Math.max(0, i.creditsPerScene));
  return { videos, scenes, maxCredits };
}

/** reserva = nº de vídeos efetivamente criados × cenas × créditos por cena */
export function calcReservation(videos: number, numScenes: number, creditsPerScene: number): number {
  return Math.max(0, videos) * Math.max(0, numScenes) * Math.max(0, creditsPerScene);
}

/** liquidado = soma dos créditos cobrados das cenas (cenas que falharam têm 0) */
export function calcSettled(scenes: Array<{ status?: string; credits_charged?: number | null }>): number {
  return scenes.reduce((sum, sc) => sum + (sc.credits_charged ?? 0), 0);
}

/** estorno = reservado − liquidado (nunca negativo) */
export function calcRefund(reserved: number, settled: number): number {
  return Math.max(0, reserved - settled);
}
