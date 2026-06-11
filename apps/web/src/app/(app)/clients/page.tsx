"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { Client } from "@/lib/types";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  Spinner,
  Textarea,
} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ clients: Client[] }>("/clients")
      .then((r) => setClients(r.clients))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/clients", { method: "POST", body: { name, notes: notes || undefined } });
      setModalOpen(false);
      setName("");
      setNotes("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button onClick={() => setModalOpen(true)}>+ Novo cliente</Button>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {!clients ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          title="Nenhum cliente cadastrado"
          hint="Crie um cliente e conecte a conta TikTok dele."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`}>
              <Card className="h-full transition-colors hover:border-lumix-purple/50">
                <h2 className="font-semibold">{c.name}</h2>
                {c.notes && <p className="mt-1 line-clamp-2 text-sm text-ink-faint">{c.notes}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {(c.accounts ?? []).length === 0 ? (
                    <span className="text-xs text-ink-faint">Sem contas conectadas</span>
                  ) : (
                    c.accounts!.map((a) => (
                      <span key={a.id} className="flex items-center gap-1.5">
                        <span className="text-xs text-ink-dim">
                          {a.display_name ?? "TikTok"}
                        </span>
                        <StatusBadge status={a.status} />
                      </span>
                    ))
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo cliente">
        <form onSubmit={createClient} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Restaurante da Ana"
            />
          </div>
          <div>
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contato, briefing, observações…"
            />
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? <Spinner /> : "Criar cliente"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
