import { describe, it, expect } from "vitest";
import { MockProvider, KieProvider, createProvider } from "../index";

describe("MockProvider", () => {
  it("createTask devolve ids sequenciais e registra o body", async () => {
    const p = new MockProvider();
    const t1 = await p.createTask({ model: "veo3_fast", input: { prompt: "a" } });
    const t2 = await p.createTask({ model: "veo3_fast", input: { prompt: "b" } });
    expect(t1).not.toBe(t2);
    expect(p.created).toHaveLength(2);
    expect(p.created[0]?.model).toBe("veo3_fast");
  });

  it("recordInfo devolve done + url por padrão", async () => {
    const rec = await new MockProvider().recordInfo("mock-task-1");
    expect(rec.status).toBe("done");
    expect(rec.resultUrl).toContain("mock-task-1");
  });

  it("recordInfo respeita status forçado (failed)", async () => {
    const rec = await new MockProvider({ recordStatus: "failed" }).recordInfo("x");
    expect(rec.status).toBe("failed");
    expect(rec.resultUrl).toBeNull();
    expect(rec.error).toBeTruthy();
  });

  it("llm devolve múltiplas linhas (vira N cenas no splitBeats)", async () => {
    const text = await new MockProvider().llm("gpt-4.1", "roteiro");
    expect(text.split("\n").length).toBeGreaterThanOrEqual(2);
  });
});

describe("createProvider (factory)", () => {
  it("em NODE_ENV=test usa o MockProvider", () => {
    expect(createProvider("qualquer-chave").name).toBe("mock");
  });

  it("KieProvider expõe o nome 'kie'", () => {
    expect(new KieProvider("k").name).toBe("kie");
  });
});
