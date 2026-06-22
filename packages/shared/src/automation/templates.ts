// Templates prontos (Fase 7): o cliente cria uma automação funcional sem abrir
// o canvas. Geram um grafo linear válido (Schedule → … → PublishTikTok) que o
// power user pode editar depois.

import type { AutomationGraph, GraphNode } from "./types.js";

interface TemplateOpts {
  post_times: string[];
  videos_per_account: number;
  num_scenes: number;
  duration_per_scene: number;
  niche_pack_id: string;
}

function buildGraph(o: TemplateOpts): AutomationGraph {
  const n = (id: string, type: GraphNode["type"], x: number, config: Record<string, unknown>): GraphNode => ({
    id,
    type,
    position: { x, y: 120 },
    config,
    label: type,
  });
  const nodes: GraphNode[] = [
    n("schedule", "Schedule", 0, { post_times: o.post_times, lead_time_min: 20 }),
    n("niche", "GetNichePack", 160, { niche_pack_id: o.niche_pack_id }),
    n("accounts", "GetAccounts", 320, { videos_per_account: o.videos_per_account, only_connected: true }),
    n("director", "DirectorAgent", 480, {
      system_prompt:
        "Você é um roteirista de vídeos curtos para TikTok. Crie um roteiro envolvente, com gancho nos 2 primeiros segundos.",
      num_scenes: o.num_scenes,
    }),
    n("caption", "CaptionAgent", 640, {
      system_prompt: "Escreva a legenda final do vídeo para TikTok, curta e com 2-3 hashtags.",
    }),
    n("sceneimg", "SceneImage", 800, { provider: "kie", model: "google/nano-banana", aspect_ratio: "9:16" }),
    n("video", "VideoGen", 960, {
      provider: "kie",
      model: "veo3_fast",
      duration_per_scene: o.duration_per_scene,
      aspect_ratio: "9:16",
    }),
    n("stitch", "Stitch", 1120, { mode: "montage", best_effort: true }),
    n("publish", "PublishTikTok", 1280, { privacy_level: "PUBLIC_TO_EVERYONE" }),
  ];
  const order = ["schedule", "niche", "accounts", "director", "caption", "sceneimg", "video", "stitch", "publish"];
  const edges = order.slice(0, -1).map((src, i) => ({
    id: `e-${src}-${order[i + 1]}`,
    source: src,
    target: order[i + 1]!,
  }));
  return { nodes, edges };
}

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  build(nichePackId: string): AutomationGraph;
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "small",
    name: "Pequeno — 2 vídeos/dia de 8s",
    description: "2 horários, 1 cena por vídeo. Ideal para começar.",
    build: (niche) =>
      buildGraph({ post_times: ["09:00", "18:00"], videos_per_account: 1, num_scenes: 1, duration_per_scene: 8, niche_pack_id: niche }),
  },
  {
    id: "medium",
    name: "Médio — 3 vídeos/dia de 24s",
    description: "3 horários, 3 cenas por vídeo (montagem).",
    build: (niche) =>
      buildGraph({ post_times: ["08:00", "13:00", "19:00"], videos_per_account: 1, num_scenes: 3, duration_per_scene: 8, niche_pack_id: niche }),
  },
  {
    id: "agency",
    name: "Agência — volume alto, 50s",
    description: "5 horários, 4 vídeos por conta, 5 cenas de 10s.",
    build: (niche) =>
      buildGraph({ post_times: ["07:00", "10:00", "13:00", "16:00", "20:00"], videos_per_account: 4, num_scenes: 5, duration_per_scene: 10, niche_pack_id: niche }),
  },
];

export function getTemplate(id: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((t) => t.id === id);
}
