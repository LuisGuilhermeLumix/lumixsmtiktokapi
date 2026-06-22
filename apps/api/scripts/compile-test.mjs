// Teste unitário do compilador de workflows (node:assert).
//   node scripts/compile-test.mjs
import assert from "node:assert/strict";
import { compileWorkflow, AUTOMATION_TEMPLATES, getTemplate } from "@lsm/shared/automation";

// template válido compila e extrai config + schedule
const g = getTemplate("medium").build("fazenda-ugc");
const ok = compileWorkflow("wf1", g);
assert.equal(ok.ok, true);
if (ok.ok) {
  assert.equal(ok.schedule.post_times.length, 3);
  assert.equal(ok.plan.config?.num_scenes, 3);
  assert.equal(ok.plan.entry, "schedule");
}

// grafo vazio → erro (sem Schedule)
const empty = compileWorkflow("wf2", { nodes: [], edges: [] });
assert.equal(empty.ok, false);
if (!empty.ok) assert.ok(empty.errors.some((e) => /Schedule|vazio/i.test(e)));

// config inválida (Schedule sem post_times) → erro
const bad = compileWorkflow("wf3", {
  nodes: [{ id: "s", type: "Schedule", position: { x: 0, y: 0 }, config: {} }],
  edges: [],
});
assert.equal(bad.ok, false);

// aresta apontando p/ nó inexistente → erro
const dangling = compileWorkflow("wf4", {
  nodes: [{ id: "s", type: "Schedule", position: { x: 0, y: 0 }, config: { post_times: ["08:00"] } }],
  edges: [{ id: "e", source: "s", target: "ghost" }],
});
assert.equal(dangling.ok, false);

assert.equal(AUTOMATION_TEMPLATES.length, 3);
console.log("✓ compile: todos os asserts passaram");
