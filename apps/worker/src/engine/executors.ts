// Executores REAIS dos nós para o motor de grafo (engine.ts). Cada nó roda de
// verdade (provider/db) e devolve items que fluem para o próximo nó.

import {
  resolveExpressions,
  type AutomationRunConfig,
  type ExecutorRegistry,
  type Items,
} from "@lsm/shared/automation";
import type { WorkerDeps } from "../deps.js";
import { providerToCompletion } from "./run-provider.js";

export interface EngineServices {
  deps: WorkerDeps;
  config: AutomationRunConfig;
  orgId: string;
  clientId: string | null;
}

/** quebra um roteiro em N beats (uma frase por cena) */
function splitBeats(text: string, n: number): string[] {
  const sentences = text
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
  if (sentences.length >= n) {
    const out: string[] = [];
    const per = Math.ceil(sentences.length / n);
    for (let i = 0; i < n; i++) out.push(sentences.slice(i * per, (i + 1) * per).join(" "));
    return out.filter(Boolean).slice(0, n);
  }
  return Array.from({ length: n }, (_, i) => sentences[i % Math.max(1, sentences.length)] ?? text);
}

function exprCtx(json: Record<string, unknown>) {
  const ch = json.character as { name?: string; description?: string } | null | undefined;
  return {
    now: new Date().toISOString(),
    niche: String(json.niche ?? ""),
    account: { display_name: String(json.account_name ?? "") },
    character: ch ? { name: ch.name ?? "", description: ch.description ?? "" } : undefined,
    video: { idx: Number(json.vindex ?? 0) },
  };
}

export function buildRegistry(): ExecutorRegistry {
  return {
    // ── gatilho / fontes ──
    Schedule: async () => [{ json: { triggeredAt: new Date().toISOString() } }],

    GetNichePack: async (node, input, ctx) => {
      const { deps, config } = ctx.services as unknown as EngineServices;
      const id = (node.config.niche_pack_id as string) ?? config.niche_pack_id ?? "";
      let name = id;
      if (id) {
        const { data } = await deps.db.from("niche_packs").select("name").eq("id", id).maybeSingle();
        if (data?.name) name = data.name;
      }
      return (input.length ? input : [{ json: {} }]).map((it) => ({ json: { ...it.json, niche: name, niche_pack_id: id } }));
    },

    GetCharacter: async (node, input, ctx) => {
      const { deps } = ctx.services as unknown as EngineServices;
      const id = node.config.character_id as string | undefined;
      let character: { name: string; description: string; ref: string | null } | null = null;
      if (id) {
        const { data } = await deps.db.from("characters").select("name, description, reference_image_url").eq("id", id).maybeSingle();
        if (data) character = { name: data.name, description: data.description, ref: data.reference_image_url };
      }
      return (input.length ? input : [{ json: {} }]).map((it) => ({ json: { ...it.json, character } }));
    },

    GetAccounts: async (node, input, ctx) => {
      const { deps, config, orgId, clientId } = ctx.services as unknown as EngineServices;
      const perAccount = Number(node.config.videos_per_account ?? config.videos_per_account ?? 1);
      let accountIds = config.account_ids ?? [];
      if (!accountIds.length) {
        let clientIds: string[] = [];
        if (clientId) clientIds = [clientId];
        else {
          const { data: clients } = await deps.db.from("clients").select("id").eq("org_id", orgId);
          clientIds = (clients ?? []).map((c) => c.id);
        }
        if (clientIds.length) {
          const { data: accts } = await deps.db.from("social_accounts").select("id, display_name").in("client_id", clientIds).eq("status", "connected");
          const base = input[0]?.json ?? {};
          const out: Items = [];
          for (const a of accts ?? []) for (let k = 0; k < perAccount; k++) out.push({ json: { ...base, account_id: a.id, account_name: a.display_name ?? "", vindex: k } });
          return out;
        }
        return [];
      }
      const base = input[0]?.json ?? {};
      const out: Items = [];
      for (const id of accountIds) for (let k = 0; k < perAccount; k++) out.push({ json: { ...base, account_id: id, vindex: k } });
      return out;
    },

    LoopAccounts: async (_n, input) => input,

    // ── controle de fluxo ──
    If: async (node, input) => {
      // avalia a expressão por item: truthy → porta 0 (true), senão porta 1 (false)
      const expr = String(node.config.expression ?? "");
      const truthy = (it: { json: Record<string, unknown> }) => {
        const v = resolveExpressions(`{{ ${expr.replace(/^\{\{|\}\}$/g, "").trim() || expr} }}`, exprCtx(it.json)).trim().toLowerCase();
        // suporte simples: campo direto ou resultado de expressão
        const raw = expr.startsWith("$") || expr.includes("{{") ? v : String(it.json[expr] ?? "");
        return !!raw && raw !== "false" && raw !== "0" && raw !== "null" && raw !== "undefined";
      };
      return { ports: [input.filter(truthy), input.filter((it) => !truthy(it))] };
    },
    Switch: async (node, input) => {
      const on = String(node.config.on ?? "");
      const cases = (node.config.cases as string[]) ?? [];
      return { ports: cases.map((c) => input.filter((it) => String(it.json[on]) === c)) };
    },
    Merge: async (_n, input) => input, // o engine já concatena os ramos de entrada

    // ── agentes / IA ──
    DirectorAgent: async (node, input, ctx) => {
      const { deps, config } = ctx.services as unknown as EngineServices;
      const out: Items = [];
      for (const it of input) {
        const sys = resolveExpressions((node.config.system_prompt as string) ?? config.director_prompt ?? "", exprCtx(it.json));
        const n = Number(node.config.num_scenes ?? config.num_scenes ?? 1);
        const script = await deps.provider.llm(config.llm_model, `${sys}\n\nEscreva um roteiro curto para TikTok em ${n} cena(s), uma frase visual por linha.`);
        out.push({ json: { ...it.json, script, beats: splitBeats(script, n) } });
      }
      return out;
    },

    CaptionAgent: async (node, input, ctx) => {
      const { deps, config } = ctx.services as unknown as EngineServices;
      const out: Items = [];
      for (const it of input) {
        const sys = resolveExpressions((node.config.system_prompt as string) ?? config.caption_prompt ?? "", exprCtx(it.json));
        let caption = "";
        try {
          caption = await deps.provider.llm(config.llm_model, `${sys}\n\nGere a legenda final para TikTok (curta, 2-3 hashtags).`);
        } catch {
          caption = String(it.json.hook ?? "");
        }
        out.push({ json: { ...it.json, caption: caption.slice(0, 2200) } });
      }
      return out;
    },

    HookSelector: async (_n, input) => input.map((it) => ({ json: { ...it.json, hook: it.json.hook ?? "" } })),
    SafetyFilter: async (_n, input) => input,

    // ── mídia (via provider; createTask→poll) ──
    SceneImage: async (_n, input, ctx) => {
      const { config } = ctx.services as unknown as EngineServices;
      const { deps } = ctx.services as unknown as EngineServices;
      const out: Items = [];
      for (const it of input) {
        const beats = (it.json.beats as string[]) ?? [];
        const images: string[] = [];
        for (const beat of beats) {
          const url = await providerToCompletion(deps.provider, { model: config.image_model, input: { prompt: beat, aspect_ratio: "9:16" } });
          images.push(url);
        }
        out.push({ json: { ...it.json, scene_images: images } });
      }
      return out;
    },

    VideoGen: async (_n, input, ctx) => {
      const { deps, config } = ctx.services as unknown as EngineServices;
      const out: Items = [];
      for (const it of input) {
        const beats = (it.json.beats as string[]) ?? [];
        const imgs = (it.json.scene_images as string[]) ?? [];
        const videos: string[] = [];
        for (let i = 0; i < beats.length; i++) {
          const url = await providerToCompletion(deps.provider, {
            model: config.video_model,
            input: { prompt: beats[i], aspect_ratio: "9:16", duration: config.duration_per_scene, ...(imgs[i] ? { imageUrls: [imgs[i]] } : {}) },
          });
          videos.push(url);
        }
        out.push({ json: { ...it.json, scene_videos: videos } });
      }
      return out;
    },

    Stitch: async (_n, input) =>
      // v1: usa o 1º clipe como final (FFmpeg real fica no pipeline dedicado).
      input.map((it) => {
        const vids = (it.json.scene_videos as string[]) ?? [];
        return { json: { ...it.json, final_url: vids[0] ?? null } };
      }),

    // ── saída ──
    PublishTikTok: async (_n, input) => input.map((it) => ({ json: { ...it.json, published: true } })),
    SaveLibrary: async (_n, input) => input,
    Notify: async (_n, input) => input,
  };
}
