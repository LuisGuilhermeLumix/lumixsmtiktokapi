import { describe, it, expect } from "vitest";
import { estimateRunCost, calcReservation, calcSettled, calcRefund } from "../credits";

describe("créditos — estimativa de custo", () => {
  it("máximo = contas × vídeos/conta × cenas × créditos/cena", () => {
    const r = estimateRunCost({ accounts: 3, videosPerAccount: 2, numScenes: 5, creditsPerScene: 10 });
    expect(r.videos).toBe(6);
    expect(r.scenes).toBe(30);
    expect(r.maxCredits).toBe(300);
  });

  it("zera quando não há contas", () => {
    expect(estimateRunCost({ accounts: 0, videosPerAccount: 2, numScenes: 5, creditsPerScene: 10 }).maxCredits).toBe(0);
  });

  it("arredonda para cima (markup fracionário)", () => {
    expect(estimateRunCost({ accounts: 1, videosPerAccount: 1, numScenes: 3, creditsPerScene: 3.4 }).maxCredits).toBe(11);
  });
});

describe("créditos — reserva", () => {
  it("reserva = vídeos × cenas × créditos/cena", () => {
    expect(calcReservation(6, 5, 10)).toBe(300);
  });
  it("nunca negativa", () => {
    expect(calcReservation(-3, 5, 10)).toBe(0);
  });
});

describe("créditos — liquidação", () => {
  it("soma só os créditos cobrados (cena que falhou tem 0)", () => {
    const scenes = [
      { status: "done", credits_charged: 10 },
      { status: "failed", credits_charged: 0 },
      { status: "done", credits_charged: 10 },
    ];
    expect(calcSettled(scenes)).toBe(20);
  });
  it("trata credits_charged null/ausente como 0", () => {
    expect(calcSettled([{ status: "done" }, { status: "done", credits_charged: null }])).toBe(0);
  });
});

describe("créditos — estorno", () => {
  it("estorno = reservado − liquidado", () => {
    expect(calcRefund(300, 20)).toBe(280);
  });
  it("cancelado antes de gerar: estorno total", () => {
    expect(calcRefund(300, 0)).toBe(300);
  });
  it("nunca negativo (liquidado > reservado por algum motivo)", () => {
    expect(calcRefund(20, 50)).toBe(0);
  });
});
