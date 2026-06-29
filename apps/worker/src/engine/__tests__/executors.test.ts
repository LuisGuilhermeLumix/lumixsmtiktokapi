import { describe, it, expect } from "vitest";
import { executeGraph, type CompiledPlan, type NodeRunContext } from "@lsm/shared/automation";
import { buildRegistry } from "../executors";
import { MockProvider } from "../../providers/mock";

// config de run mínima (markup já embutido, account_ids → sem DB)
const config = {
  account_ids: ["a1", "a2"],
  videos_per_account: 1,
  num_scenes: 2,
  duration_per_scene: 8,
  scene_provider: "kie",
  image_model: "google/nano-banana",
  video_model: "veo3_fast",
  director_prompt: "Você é um roteirista",
  caption_prompt: "Gere a legenda",
  llm_model: "gpt-4.1",
  stitch_mode: "montage",
  best_effort_stitch: true,
  privacy_level: "PUBLIC_TO_EVERYONE",
  credits_per_scene: 0,
  on_error: "stop",
  max_tries: 1,
  retry_wait_s: 0,
} as never;

const deps = { provider: new MockProvider() } as never;
const ctx: NodeRunContext = {
  config,
  services: { deps, config, orgId: "org", clientId: null },
  log: async () => {},
};

const plan: CompiledPlan = {
  version: 1,
  workflowId: "wf",
  entry: "s",
  steps: {
    s: { id: "s", type: "Schedule", config: {}, next: { default: ["acc"] } },
    acc: { id: "acc", type: "GetAccounts", config: {}, next: { default: ["dir"] } },
    dir: { id: "dir", type: "DirectorAgent", config: {}, next: { default: ["img"] } },
    img: { id: "img", type: "SceneImage", config: {}, next: { default: ["vid"] } },
    vid: { id: "vid", type: "VideoGen", config: {}, next: { default: ["st"] } },
    st: { id: "st", type: "Stitch", config: {}, next: { default: ["pub"] } },
    pub: { id: "pub", type: "PublishTikTok", config: {}, next: {} },
  },
};

describe("motor real ponta a ponta (MockProvider)", () => {
  it("roteiro → cenas → vídeo → montagem → publicação, fan-out por conta", async () => {
    const { itemsByNode, order } = await executeGraph(plan, buildRegistry(), ctx);

    expect(order).toEqual(["s", "acc", "dir", "img", "vid", "st", "pub"]);

    const pub = itemsByNode.pub!;
    expect(pub).toHaveLength(2); // 2 contas

    const v0 = pub[0]!.json;
    expect(v0.account_id).toBe("a1");
    expect(typeof v0.script).toBe("string");
    expect((v0.beats as string[]).length).toBe(2);
    expect((v0.scene_images as string[]).length).toBe(2);
    expect((v0.scene_videos as string[]).length).toBe(2);
    expect(v0.final_url).toBeTruthy();
    expect(v0.published).toBe(true);
  });
});
