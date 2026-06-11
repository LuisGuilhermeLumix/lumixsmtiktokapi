"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { Client, SocialAccount } from "@/lib/types";
import { Banner, Button, Card, Input, Label, Select, Spinner, Textarea } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";

const PRIVACY_OPTIONS = [
  { value: "SELF_ONLY", label: "Somente eu (seguro p/ app sem audit)" },
  { value: "PUBLIC_TO_EVERYONE", label: "Público" },
  { value: "MUTUAL_FOLLOW_FRIENDS", label: "Amigos (follow mútuo)" },
  { value: "FOLLOWER_OF_CREATOR", label: "Seguidores" },
] as const;

type Mode = "draft" | "now" | "schedule";

export default function NewPostPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState("");
  const [privacy, setPrivacy] = useState<string>("SELF_ONLY");
  const [mode, setMode] = useState<Mode>("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  useEffect(() => {
    apiFetch<{ clients: Client[] }>("/clients")
      .then((r) => setClients(r.clients))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    setAccounts(null);
    setSelectedAccounts(new Set());
    if (!clientId) return;
    apiFetch<{ accounts: SocialAccount[] }>(`/clients/${clientId}/accounts`)
      .then((r) => setAccounts(r.accounts.filter((a) => a.status === "connected")))
      .catch((e: Error) => setError(e.message));
  }, [clientId]);

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Selecione um vídeo.");
    if (selectedAccounts.size === 0) return setError("Selecione ao menos uma conta-alvo.");
    if (mode === "schedule" && !scheduleAt) return setError("Defina a data/hora do agendamento.");

    const form = new FormData();
    form.append("video", file);
    form.append("client_id", clientId);
    form.append("social_account_ids", [...selectedAccounts].join(","));
    form.append("caption", caption);
    form.append("privacy_level", privacy);
    if (mode === "now") form.append("publish_now", "true");
    if (mode === "schedule") {
      form.append("schedule_at", new Date(scheduleAt).toISOString());
    }

    setSubmitting(true);
    try {
      await apiFetch("/posts", { method: "POST", formData: form });
      router.push("/posts");
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/posts" className="text-sm text-ink-dim hover:text-ink">
          ← Posts
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Novo post</h1>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      <form onSubmit={onSubmit} className="space-y-6">
        <Card className="space-y-4">
          <div>
            <Label htmlFor="client">Cliente</Label>
            <Select
              id="client"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          {clientId && (
            <div>
              <Label>Contas-alvo</Label>
              {!accounts ? (
                <Spinner />
              ) : accounts.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  Este cliente não tem conta conectada.{" "}
                  <Link href={`/clients/${clientId}`} className="text-lumix-blue underline">
                    Conectar agora
                  </Link>
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {accounts.map((a) => {
                    const selected = selectedAccounts.has(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleAccount(a.id)}
                        aria-pressed={selected}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          selected
                            ? "border-lumix-purple bg-lumix-purple/15 text-ink"
                            : "border-border-subtle text-ink-dim hover:border-ink-faint"
                        }`}
                      >
                        {a.display_name ?? "Conta TikTok"}
                        <StatusBadge status={a.status} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <div>
            <Label htmlFor="video">Vídeo (mp4/mov/webm, até 500 MB)</Label>
            <Input
              id="video"
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {previewUrl && (
              <video
                src={previewUrl}
                controls
                className="mt-3 max-h-80 rounded-lg border border-border-subtle"
              />
            )}
          </div>
          <div>
            <Label htmlFor="caption">Legenda ({caption.length}/2200)</Label>
            <Textarea
              id="caption"
              rows={3}
              maxLength={2200}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Escreva a legenda do vídeo…"
            />
          </div>
          <div>
            <Label htmlFor="privacy">Privacidade</Label>
            <Select id="privacy" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
              {PRIVACY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-ink-faint">
              Apps sem audit aprovado do TikTok só publicam como &quot;Somente eu&quot;; níveis
              públicos exigem audit.
            </p>
          </div>
        </Card>

        <Card className="space-y-4">
          <Label>Quando publicar</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quando publicar">
            {(
              [
                ["now", "Publicar agora"],
                ["schedule", "Agendar"],
                ["draft", "Salvar rascunho"],
              ] as Array<[Mode, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                  mode === value
                    ? "border-lumix-purple bg-lumix-purple/15"
                    : "border-border-subtle text-ink-dim hover:border-ink-faint"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "schedule" && (
            <div>
              <Label htmlFor="schedule_at">Data e hora</Label>
              <Input
                id="schedule_at"
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
              />
            </div>
          )}
        </Card>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? (
            <>
              <Spinner /> Enviando vídeo…
            </>
          ) : mode === "now" ? (
            "Publicar agora"
          ) : mode === "schedule" ? (
            "Agendar post"
          ) : (
            "Salvar rascunho"
          )}
        </Button>
      </form>
    </div>
  );
}
