"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { formatDateTime } from "@/lib/format";
import type { ApiKeyMeta, Member } from "@/lib/types";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  Spinner,
} from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  operator: "Operator",
};

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKeyMeta[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(() => {
    apiFetch<{ api_keys: ApiKeyMeta[] }>("/api-keys")
      .then((r) => setKeys(r.api_keys))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    loadKeys();
    // membros via RLS: usuário só enxerga a própria org
    createClient()
      .from("users")
      .select("id, email, role, created_at")
      .order("created_at")
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setMembers((data ?? []) as Member[]);
      });
  }, [loadKeys]);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await apiFetch<{ key: string }>("/api-keys", {
        method: "POST",
        body: { name: keyName },
      });
      setCreatedKey(r.key);
      setKeyName("");
      loadKeys();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revogar esta API key? Integrações que a usam vão parar.")) return;
    try {
      await apiFetch(`/api-keys/${id}`, { method: "DELETE" });
      loadKeys();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setCreatedKey(null);
    setCopied(false);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Configurações</h1>
      {error && <Banner kind="error">{error}</Banner>}

      {/* ── API keys ─────────────────────────────────────────────── */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">API keys</h2>
            <p className="text-sm text-ink-faint">
              Para n8n/automação: header{" "}
              <code className="rounded bg-surface-overlay px-1">
                Authorization: Apikey &lt;key&gt;
              </code>
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>+ Nova key</Button>
        </div>
        {!keys ? (
          <Spinner />
        ) : keys.length === 0 ? (
          <EmptyState title="Nenhuma API key" hint="Crie uma para integrar n8n ou scripts." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {k.name}{" "}
                    <code className="ml-1 rounded bg-surface-overlay px-1.5 py-0.5 text-xs text-ink-faint">
                      {k.key_prefix}…
                    </code>
                  </p>
                  <p className="text-xs text-ink-faint">
                    criada {formatDateTime(k.created_at)} · último uso{" "}
                    {k.last_used_at ? formatDateTime(k.last_used_at) : "nunca"}
                  </p>
                </div>
                {k.revoked_at ? (
                  <span className="text-xs text-red-400">revogada</span>
                ) : (
                  <Button variant="danger" onClick={() => revoke(k.id)}>
                    Revogar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── membros ──────────────────────────────────────────────── */}
      <Card>
        <h2 className="mb-1 font-semibold">Membros da organização</h2>
        <p className="mb-4 text-sm text-ink-faint">
          Papéis: Owner (tudo) · Admin (gestão) · Operator (só clientes atribuídos). Convites são
          criados pelo administrador via Supabase.
        </p>
        {!members ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3">
                <span className="text-sm">{m.email}</span>
                <span className="rounded-full border border-border-subtle px-2.5 py-0.5 text-xs text-ink-dim">
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── webhook n8n ──────────────────────────────────────────── */}
      <Card>
        <h2 className="mb-1 font-semibold">Webhook n8n</h2>
        <p className="text-sm text-ink-faint">
          Envie um POST assinado para criar/publicar posts a partir dos seus fluxos:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-surface p-4 text-xs leading-relaxed text-ink-dim">{`POST ${API_URL}/webhooks/n8n
Content-Type: application/json
x-lsm-signature: HMAC-SHA256(corpo, N8N_WEBHOOK_SECRET) em hex

{ "action": "create_post", "client_id": "...", "social_account_ids": ["..."],
  "caption": "...", "media_url": "https://...", "publish_now": true }`}</pre>
        <p className="mt-2 text-xs text-ink-faint">
          O segredo fica na env <code>N8N_WEBHOOK_SECRET</code> da API — nunca é exibido aqui.
        </p>
      </Card>

      <Modal open={modalOpen} onClose={closeModal} title="Nova API key">
        {createdKey ? (
          <div className="space-y-4">
            <Banner kind="success">
              Key criada. <strong>Copie agora</strong> — ela não será exibida de novo.
            </Banner>
            <code className="block break-all rounded-lg bg-surface p-3 text-sm">{createdKey}</code>
            <Button
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(createdKey).then(() => setCopied(true));
              }}
            >
              {copied ? "Copiado ✓" : "Copiar key"}
            </Button>
          </div>
        ) : (
          <form onSubmit={createKey} className="space-y-4">
            <div>
              <Label htmlFor="keyname">Nome (para identificar o uso)</Label>
              <Input
                id="keyname"
                required
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="Ex.: n8n produção"
              />
            </div>
            <Button type="submit" disabled={creating} className="w-full">
              {creating ? <Spinner /> : "Criar key"}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
