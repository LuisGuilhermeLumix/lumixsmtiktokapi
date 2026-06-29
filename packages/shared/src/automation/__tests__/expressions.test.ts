import { describe, it, expect } from "vitest";
import { resolveExpressions } from "../expressions";

const ctx = {
  now: "2026-06-29T12:00:00.000Z",
  niche: "fazenda-ugc",
  account: { display_name: "Minha Fazenda", name: "Minha Fazenda" },
  character: { name: "Bia", description: "carismática" },
  video: { idx: 0 },
};

describe("expressões {{ }}", () => {
  it("substitui variáveis simples", () => {
    expect(resolveExpressions("Olá {{ $account.display_name }}", ctx)).toBe("Olá Minha Fazenda");
  });
  it("resolve $today a partir de $now", () => {
    expect(resolveExpressions("{{ $today }}", ctx)).toBe("2026-06-29");
  });
  it("token desconhecido vira vazio", () => {
    expect(resolveExpressions("[{{ $nada.aqui }}]", ctx)).toBe("[]");
  });
  it("texto sem expressão passa intacto", () => {
    expect(resolveExpressions("texto fixo", ctx)).toBe("texto fixo");
  });
  it("aplica pipes (upper/slug)", () => {
    expect(resolveExpressions("{{ $niche | upper }}", ctx)).toBe("FAZENDA-UGC");
    expect(resolveExpressions("{{ $account.display_name | slug }}", ctx)).toBe("minha-fazenda");
  });
  it("encadeia pipes", () => {
    expect(resolveExpressions("{{ $character.name | upper | lower }}", ctx)).toBe("bia");
  });
});
