import { describe, it, expect } from "vitest";
import { executeGraph, type ExecutorRegistry, type NodeRunContext } from "../engine";
import type { CompiledPlan, CompiledStep, NodeType } from "../types";

function step(id: string, type: NodeType, next: Record<string, string[]>, config: Record<string, unknown> = {}): CompiledStep {
  return { id, type, config, next };
}
function makePlan(entry: string, steps: CompiledStep[]): CompiledPlan {
  return { version: 1, workflowId: "wf", entry, steps: Object.fromEntries(steps.map((s) => [s.id, s])) };
}
const ctx: NodeRunContext = { config: {}, services: {}, log: async () => {} };

const registry: ExecutorRegistry = {
  Schedule: async () => [{ json: { start: true } }],
  GetAccounts: async (n) => Array.from({ length: (n.config.count as number) ?? 1 }, (_, i) => ({ json: { acct: i } })),
  DirectorAgent: async (_n, input) => input.map((it) => ({ json: { ...it.json, script: "roteiro" } })),
  If: async (n, input) => {
    const f = n.config.field as string;
    return { ports: [input.filter((it) => !!it.json[f]), input.filter((it) => !it.json[f])] };
  },
  Switch: async (n, input) => {
    const cases = (n.config.cases as string[]) ?? [];
    const field = n.config.on as string;
    return { ports: cases.map((c) => input.filter((it) => String(it.json[field]) === c)) };
  },
  Merge: async (_n, input) => input,
};

describe("engine — travessia real (dados passam de nó em nó)", () => {
  it("linear: a saída de um nó vira a entrada do próximo", async () => {
    const plan = makePlan("s", [
      step("s", "Schedule", { default: ["d"] }),
      step("d", "DirectorAgent", {}),
    ]);
    const { itemsByNode, order } = await executeGraph(plan, registry, ctx);
    expect(order).toEqual(["s", "d"]);
    expect(itemsByNode.d?.[0]?.json.script).toBe("roteiro");
    expect(itemsByNode.d?.[0]?.json.start).toBe(true); // dado do nó anterior preservado
  });

  it("fan-out: N items fluem juntos para o próximo nó", async () => {
    const plan = makePlan("s", [
      step("s", "Schedule", { default: ["a"] }),
      step("a", "GetAccounts", { default: ["d"] }, { count: 3 }),
      step("d", "DirectorAgent", {}),
    ]);
    const { itemsByNode } = await executeGraph(plan, registry, ctx);
    expect(itemsByNode.d).toHaveLength(3);
    expect(itemsByNode.d?.every((it) => it.json.script === "roteiro")).toBe(true);
  });

  it("If: roteia true/false e só o ramo com items roda", async () => {
    const plan = makePlan("s", [
      step("s", "Schedule", { default: ["a"] }),
      step("a", "GetAccounts", { default: ["if"] }, { count: 2 }), // acct 0 (falsy) e 1 (truthy)
      step("if", "If", { true: ["t"], false: ["f"] }, { field: "acct" }),
      step("t", "DirectorAgent", {}),
      step("f", "DirectorAgent", {}),
    ]);
    const { itemsByNode, order } = await executeGraph(plan, registry, ctx);
    expect(itemsByNode.t).toHaveLength(1); // acct=1
    expect(itemsByNode.f).toHaveLength(1); // acct=0
    expect(order).toContain("t");
    expect(order).toContain("f");
  });

  it("Switch: roteia por caso", async () => {
    const plan = makePlan("s", [
      step("s", "Schedule", { default: ["a"] }),
      step("a", "GetAccounts", { default: ["sw"] }, { count: 3 }),
      step("sw", "Switch", { "0": ["c0"], "1": ["c1"] }, { on: "acct", cases: ["0", "1"] }),
      step("c0", "DirectorAgent", {}),
      step("c1", "DirectorAgent", {}),
    ]);
    const { itemsByNode } = await executeGraph(plan, registry, ctx);
    expect(itemsByNode.c0?.[0]?.json.acct).toBe(0);
    expect(itemsByNode.c1?.[0]?.json.acct).toBe(1);
  });

  it("Merge: junta dois ramos (indegree 2) numa execução só", async () => {
    const plan = makePlan("s", [
      step("s", "Schedule", { default: ["a", "b"] }),
      step("a", "DirectorAgent", { default: ["m"] }),
      step("b", "DirectorAgent", { default: ["m"] }),
      step("m", "Merge", {}),
    ]);
    const { itemsByNode, order } = await executeGraph(plan, registry, ctx);
    expect(itemsByNode.m).toHaveLength(2); // 1 de A + 1 de B
    expect(order.filter((id) => id === "m")).toHaveLength(1); // rodou só 1x
  });

  it("Merge não trava quando um ramo do If fica vazio (poda)", async () => {
    const plan = makePlan("s", [
      step("s", "Schedule", { default: ["if"] }), // 1 item com start=true
      step("if", "If", { true: ["t"], false: ["f"] }, { field: "start" }), // tudo vai p/ true
      step("t", "DirectorAgent", { default: ["m"] }),
      step("f", "DirectorAgent", { default: ["m"] }), // ramo false vazio → podado
      step("m", "Merge", {}),
    ]);
    const { itemsByNode, order } = await executeGraph(plan, registry, ctx);
    expect(order).toContain("m"); // não travou
    expect(itemsByNode.m).toHaveLength(1);
    expect(order).not.toContain("f"); // ramo vazio não rodou
  });
});
