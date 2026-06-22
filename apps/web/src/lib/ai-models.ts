// Catálogo de modelos de IA expostos no Estúdio de Conteúdo.
// Providers: Magic Hour (PRINCIPAL — vídeo) e kie.ai (secundário — produção).
// `kieModel` = identificador enviado em POST /generations (campo `model`).
// `backend`  = provider que processa (default kie). `credits` = custo JÁ EM
//   CRÉDITOS LSM (custo do provider + markup). ⚠️ números PLACEHOLDER.

export type AiKind = "image" | "video";
/** backend de geração: Magic Hour (vídeo) ou kie.ai */
export type AiProvider = "kie" | "magichour";

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
  // ═════════ IMAGEM (kie.ai) ═════════
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
  // ── Magic Hour (principal) ──
  {
    id: "mh-kling-3",
    kieModel: "kling-3.0",
    backend: "magichour",
    label: "Kling 3.0 (Magic Hour)",
    provider: "Magic Hour · Kuaishou",
    kind: "video",
    credits: 50,
    durations: [5, 10],
    aspectRatios: ["9:16", "1:1", "16:9"],
    supportsImageInput: true,
    note: "Provider principal — vídeo com áudio.",
  },
  {
    id: "mh-kling-25",
    kieModel: "kling-2.5",
    backend: "magichour",
    label: "Kling 2.5 (Magic Hour)",
    provider: "Magic Hour · Kuaishou",
    kind: "video",
    credits: 40,
    durations: [5, 10],
    aspectRatios: ["9:16", "1:1", "16:9"],
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
