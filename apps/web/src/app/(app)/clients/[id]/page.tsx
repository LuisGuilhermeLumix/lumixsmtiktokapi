"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Client, SocialAccount } from "@/lib/types";
import { Banner, Button, Card, EmptyState, Spinner } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const tiktokResult = search.get("tiktok"); // connected | denied | error (vindo do callback)

  const [client, setClient] = useState<Client | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(() => {
    apiFetch<{ clients: Client[] }>("/clients")
      .then((r) => setClient(r.clients.find((c) => c.id === id) ?? null))
      .catch((e: Error) => setError(e.message));
    apiFetch<{ accounts: SocialAccount[] }>(`/clients/${id}/accounts`)
      .then((r) => setAccounts(r.accounts))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  async function connectTikTok() {
    setConnecting(true);
    try {
      // a API gera a URL de autorização (state CSRF no Redis) e o browser segue
      const { url } = await apiFetch<{ url: string }>(
        `/auth/tiktok/start?client_id=${id}`,
      );
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clients" className="text-sm text-ink-dim hover:text-ink">
          ← Clientes
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">{client?.name ?? "…"}</h1>
          <Button onClick={connectTikTok} disabled={connecting}>
            {connecting ? <Spinner /> : "Conectar TikTok"}
          </Button>
        </div>
        {client?.notes && <p className="mt-1 text-sm text-ink-faint">{client.notes}</p>}
      </div>

      {tiktokResult === "connected" && (
        <Banner kind="success">Conta TikTok conectada com sucesso.</Banner>
      )}
      {tiktokResult === "denied" && (
        <Banner kind="info">Autorização cancelada pelo usuário no TikTok.</Banner>
      )}
      {tiktokResult === "error" && (
        <Banner kind="error">
          Falha ao conectar a conta. Tente novamente — se persistir, verifique o app TikTok.
        </Banner>
      )}
      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        <h2 className="mb-4 font-semibold">Contas conectadas</h2>
        {!accounts ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : accounts.length === 0 ? (
          <EmptyState
            title="Nenhuma conta TikTok conectada"
            hint='Clique em "Conectar TikTok" e faça login com a conta do cliente.'
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-4 py-3">
                {a.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.avatar_url}
                    alt=""
                    className="size-10 rounded-full border border-border-subtle object-cover"
                  />
                ) : (
                  <span className="flex size-10 items-center justify-center rounded-full bg-surface-overlay text-ink-faint">
                    ♪
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.display_name ?? "Conta TikTok"}</p>
                  <p className="text-xs text-ink-faint">
                    conectada em {formatDateTime(a.connected_at)}
                  </p>
                </div>
                <StatusBadge status={a.status} />
                {a.status !== "connected" && (
                  <Button variant="secondary" onClick={connectTikTok}>
                    Reconectar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
