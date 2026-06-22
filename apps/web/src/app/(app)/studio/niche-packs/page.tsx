"use client";

// Niche Packs — CRUD simples (Fase 2). Pack = dado (hooks/banned_terms) que
// alimenta a esteira. Globais (sem org) são só-leitura.

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Banner, Button, Card, Input, Label, Spinner, Textarea } from "@/components/ui";

interface NichePack {
  id: string;
  org_id: string | null;
  name: string;
  data: { hooks?: Array<{ lang: string; text: string }>; banned_terms?: string[] };
}

/** "pt-BR | texto" por linha → [{lang,text}] */
function parseHooks(raw: string): Array<{ lang: string; text: string }> {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("|");
      if (i === -1) return { lang: "pt-BR", text: l };
      return { lang: l.slice(0, i).trim() || "pt-BR", text: l.slice(i + 1).trim() };
    })
    .filter((h) => h.text);
}

export default function NichePacksPage() {
  const [packs, setPacks] = useState<NichePack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [hooks, setHooks] = useState("pt-BR | Você não vai acreditar no que acontece aqui…");
  const [banned, setBanned] = useState("celebrity, public figure, real person");

  function load() {
    apiFetch<{ niche_packs: NichePack[] }>("/niche-packs")
      .then((r) => setPacks(r.niche_packs))
      .catch((e: Error) => setError(e.message));
  }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = parseHooks(hooks);
    if (!id || !name) return setError("Preencha id e nome.");
    if (parsed.length === 0) return setError("Adicione ao menos um hook.");
    setBusy(true);
    try {
      await apiFetch("/niche-packs", {
        method: "POST",
        body: {
          id,
          name,
          data: {
            hooks: parsed,
            banned_terms: banned.split(",").map((s) => s.trim()).filter(Boolean),
            replacements: {},
            style: {},
          },
        },
      });
      setId("");
      setName("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(packId: string) {
    if (!confirm(`Remover o pack "${packId}"?`)) return;
    try {
      await apiFetch(`/niche-packs/${packId}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/studio" className="text-sm text-ink-dim hover:text-ink">
          ← Estúdio IA
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Niche Packs</h1>
        <p className="mt-1 text-sm text-ink-dim">
          O nicho é dado: hooks (com rotação automática), termos banidos e substituições.
        </p>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <Card className="space-y-4">
        <h2 className="font-semibold">Novo pack</h2>
        <form onSubmit={create} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="id">ID (slug)</Label>
              <Input
                id="id"
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase())}
                placeholder="ex.: fazenda-ugc"
              />
            </div>
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="hooks">Hooks (um por linha — formato: lang | texto)</Label>
            <Textarea id="hooks" rows={5} value={hooks} onChange={(e) => setHooks(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="banned">Termos banidos (separados por vírgula)</Label>
            <Input id="banned" value={banned} onChange={(e) => setBanned(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Salvando…
              </>
            ) : (
              "Criar pack"
            )}
          </Button>
        </form>
      </Card>

      <div>
        <h2 className="mb-3 font-semibold">Packs disponíveis</h2>
        {packs === null ? (
          <Spinner />
        ) : packs.length === 0 ? (
          <Card className="text-sm text-ink-faint">Nenhum pack ainda.</Card>
        ) : (
          <div className="space-y-3">
            {packs.map((p) => (
              <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {p.name}{" "}
                    <span className="text-xs text-ink-faint">({p.id})</span>
                    {p.org_id === null && (
                      <span className="ml-2 rounded bg-lumix-blue/15 px-2 py-0.5 text-xs text-lumix-blue">
                        global
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-ink-dim">
                    {p.data?.hooks?.length ?? 0} hooks · {p.data?.banned_terms?.length ?? 0} termos
                    banidos
                  </p>
                </div>
                {p.org_id !== null && (
                  <Button variant="danger" onClick={() => remove(p.id)}>
                    Remover
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
