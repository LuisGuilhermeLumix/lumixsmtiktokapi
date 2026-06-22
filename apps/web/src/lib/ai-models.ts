// Catálogo de modelos de IA expostos no Estúdio de Conteúdo.
// Providers: fal.ai (PRINCIPAL) e kie.ai (secundário — uso em produção).
// `kieModel` = identificador enviado em POST /generations (campo `model`).
// `backend`  = provider que processa (default kie). `credits` = custo JÁ EM
//   CRÉDITOS LSM (custo do provider + markup). ⚠️ números PLACEHOLDER.

export type AiKind = "image" | "video";
/** backend de geração: kie.ai ou fal.ai */
export type AiProvider = "kie" | "fal";

export interface AiModel {
  id: string;
  /** id do modelo no provider (enviado no POST /generations como `model`) */
  kieModel: string;
  /** provider que processa a geração (default kie) */
  backend?: AiProvider;
  label: string;
  provider: string;
  kind: AiKind;
  /** custo base em créditos LSM por geração (vídeo: já considerando a duração base) */
  credits: number;
  /** vídeo: créditos por segundo adicional acima da duração base */
  creditsPerExtraSecond?: number;
  durations?: number[];
  aspectRatios?: string[];
  supportsImageInput?: boolean;
  note?: string;
}

const ASPECTS = ["9:16", "1:1", "16:9"];

export const AI_MODELS: AiModel[] = [
  // ═════════ IMAGEM ═════════
  // ── fal.ai (principal) ──
  {
    id: "fal-flux-schnell",
    kieModel: "fal-ai/flux/schnell",
    backend: "fal",
    label: "Flux Schnell (fal)",
    provider: "fal.ai · BFL",
    kind: "image",
    credits: 3,
    aspectRatios: ASPECTS,
    note: "Rápido e barato — ideal p/ cenas em lote.",
  },
  {
    id: "fal-flux-dev",
    kieModel: "fal-ai/flux/dev",
    backend: "fal",
    label: "Flux Dev (fal)",
    provider: "fal.ai · BFL",
    kind: "image",
    credits: 5,
    aspectRatios: ASPECTS,
  },
  // ── kie.ai (secundário / produção) ──
  {
    id: "nano-banana",
    kieModel: "google/nano-banana",
    label: "Nano Banana (kie)",
    provider: "kie.ai · Google",
    kind: "image",
    credits: 4,
    aspectRatios: ASPECTS,
    supportsImageInput: true,
  },
  {
    id: "imagen-4",
    kieModel: "google/imagen-4",
    label: "Imagen 4 (kie)",
    provider: "kie.ai · Google",
    kind: "image",
    credits: 8,
    aspectRatios: ASPECTS,
  },
  {
    id: "ideogram-v3",
    kieModel: "ideogram/v3",
    label: "Ideogram v3 (kie)",
    provider: "kie.ai · Ideogram",
    kind: "image",
    credits: 7,
    aspectRatios: ASPECTS,
    note: "Forte com texto dentro da imagem.",
  },

  // ═════════ VÍDEO ═════════
  // ── fal.ai (principal) ──
  {
    id: "fal-kling-21",
    kieModel: "fal-ai/kling-video/v2.1/standard/text-to-video",
    backend: "fal",
    label: "Kling 2.1 Std (fal)",
    provider: "fal.ai · Kuaishou",
    kind: "video",
    credits: 52,
    durations: [5, 10],
    aspectRatios: ["9:16", "1:1", "16:9"],
    supportsImageInput: true,
    note: "Bom custo-benefício.",
  },
  {
    id: "fal-kling-21-pro",
    kieModel: "fal-ai/kling-video/v2.1/pro/text-to-video",
    backend: "fal",
    label: "Kling 2.1 Pro (fal)",
    provider: "fal.ai · Kuaishou",
    kind: "video",
    credits: 104,
    durations: [5, 10],
    aspectRatios: ["9:16", "1:1", "16:9"],
    supportsImageInput: true,
  },
  {
    id: "fal-veo3-fast",
    kieModel: "fal-ai/veo3/fast",
    backend: "fal",
    label: "Veo 3 Fast (fal)",
    provider: "fal.ai · Google",
    kind: "video",
    credits: 91,
    durations: [4, 6, 8],
    aspectRatios: ["9:16", "16:9"],
    supportsImageInput: true,
    note: "Qualidade com áudio.",
  },
  {
    id: "fal-hailuo",
    kieModel: "fal-ai/minimax/hailuo-02/standard/text-to-video",
    backend: "fal",
    label: "Hailuo 02 (fal)",
    provider: "fal.ai · MiniMax",
    kind: "video",
    credits: 59,
    durations: [6, 10],
    aspectRatios: ["9:16", "16:9"],
    supportsImageInput: true,
  },
  // ── kie.ai (secundário / produção) ──
  {
    id: "veo3-fast",
    kieModel: "veo3_fast",
    label: "Veo 3 Fast (kie)",
    provider: "kie.ai · Google",
    kind: "video",
    credits: 90,
    creditsPerExtraSecond: 10,
    durations: [4, 6, 8],
    aspectRatios: ["9:16", "16:9"],
    supportsImageInput: true,
  },
  {
    id: "veo3",
    kieModel: "veo3",
    label: "Veo 3 (kie)",
    provider: "kie.ai · Google",
    kind: "video",
    credits: 160,
    creditsPerExtraSecond: 18,
    durations: [4, 6, 8],
    aspectRatios: ["9:16", "16:9"],
    supportsImageInput: true,
  },
  {
    id: "sora2",
    kieModel: "sora2",
    label: "Sora 2 (kie)",
    provider: "kie.ai · OpenAI",
    kind: "video",
    credits: 140,
    durations: [4, 8, 12],
    aspectRatios: ["9:16", "16:9"],
    supportsImageInput: true,
  },
];

export const IMAGE_MODELS = AI_MODELS.filter((m) => m.kind === "image");
export const VIDEO_MODELS = AI_MODELS.filter((m) => m.kind === "video");

export function getModel(id: string): AiModel | undefined {
  return AI_MODELS.find((m) => m.id === id);
}

/** estimativa de créditos para uma geração (considera duração no vídeo) */
export function estimateCredits(model: AiModel, durationSec?: number): number {
  if (model.kind === "image" || !durationSec || !model.creditsPerExtraSecond) {
    return model.credits;
  }
  const base = model.durations?.[0] ?? durationSec;
  const extra = Math.max(0, durationSec - base);
  return model.credits + extra * model.creditsPerExtraSecond;
}
