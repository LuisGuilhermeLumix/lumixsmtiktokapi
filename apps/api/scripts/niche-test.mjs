// Teste unitário das funções puras do Niche Pack (sem framework — node:assert).
//   node scripts/niche-test.mjs
import assert from "node:assert/strict";
import { parseNichePack, selectHook, sanitizeText, hasBannedTerm } from "@lsm/shared/niche";

const pack = parseNichePack({
  hooks: [
    { lang: "pt-BR", text: "A" },
    { lang: "pt-BR", text: "B" },
    { lang: "en-GB", text: "C" },
  ],
  banned_terms: ["celebrity", "public figure"],
  replacements: { celebrity: "person" },
});

// rotação determinística count % len
assert.equal(selectHook(pack, 0)?.text, "A");
assert.equal(selectHook(pack, 1)?.text, "B");
assert.equal(selectHook(pack, 3)?.text, "A"); // 3 % 3 = 0
assert.equal(selectHook(pack, -1)?.text, "C"); // seguro p/ negativo

// filtro por lang + fallback p/ todos quando lang não existe
assert.equal(selectHook(pack, 0, "en-GB")?.text, "C");
assert.equal(selectHook(pack, 0, "fr")?.lang, "pt-BR"); // sem fr → usa todos

// pack vazio → null
assert.equal(selectHook(parseNichePack({}), 0), null);

// sanitização: replacement + remoção de banned + agressivo limpa espaços
assert.equal(sanitizeText(pack, "a celebrity here"), "a person here");
assert.equal(sanitizeText(pack, "a public figure here", 1), "a here");
assert.equal(hasBannedTerm(pack, "a celebrity"), true);
assert.equal(hasBannedTerm(pack, "nada demais"), false);

console.log("✓ niche: todos os asserts passaram");
