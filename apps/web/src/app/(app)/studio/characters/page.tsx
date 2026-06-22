"use client";

// Personagens — CRUD simples (Fase 2). Personagem é fictício e anônimo (adulto).

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Banner, Button, Card, Input, Label, Spinner, Textarea } from "@/components/ui";

interface Character {
  id: string;
  name: string;
  description: string;
  reference_image_url: string | null;
}

export default function CharactersPage() {
  const [items, setItems] = useState<Character[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  function load() {
    apiFetch<{ characters: Character[] }>("/characters")
      .then((r) => setItems(r.characters))
      .catch((e: Error) => setError(e.message));
  }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name) return setError("Dê um nome ao personagem.");
    setBusy(true);
    try {
      await apiFetch("/characters", {
        method: "POST",
        body: {
          name,
          description,
          ...(imageUrl ? { reference_image_url: imageUrl } : {}),
          traits: {},
        },
      });
      setName("");
      setDescription("");
      setImageUrl("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remover este personagem?")) return;
    try {
      await apiFetch(`/characters/${id}`, { method: "DELETE" });
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
        <h1 className="mt-2 text-2xl font-bold">Personagens</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Personagens fictícios e anônimos (adultos) usados como referência nas cenas.
        </p>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <Card className="space-y-4">
        <h2 className="font-semibold">Novo personagem</h2>
        <form onSubmit={create} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="desc">Descrição</Label>
            <Textarea
              id="desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Aparência, personalidade, tom de voz…"
            />
          </div>
          <div>
            <Label htmlFor="img">Imagem de referência (URL, opcional)</Label>
            <Input
              id="img"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <>
                <Spinner /> Salvando…
              </>
            ) : (
              "Criar personagem"
            )}
          </Button>
        </form>
      </Card>

      <div>
        <h2 className="mb-3 font-semibold">Seus personagens</h2>
        {items === null ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Card className="text-sm text-ink-faint">Nenhum personagem ainda.</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((c) => (
              <Card key={c.id} className="flex gap-3">
                {c.reference_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.reference_image_url}
                    alt={c.name}
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-surface-overlay text-xl">
                    🎭
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name}</p>
                  <p className="line-clamp-2 text-xs text-ink-dim">{c.description}</p>
                  <button
                    onClick={() => remove(c.id)}
                    className="mt-1 text-xs text-red-400 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
