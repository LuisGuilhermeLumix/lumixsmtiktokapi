"use client";

// Estúdio de Conteúdo IA — geração avulsa (imagem/vídeo via kie.ai),
// configuração de automação (nicho → cenas → vídeo → publicação no cron) e
// biblioteca dos itens gerados. Backend: rotas /generations, /automations,
// /credits (degradam graciosamente enquanto não estiverem no ar).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { Client, SocialAccount } from "@/lib/types";
import {
  AI_MODELS,
  IMAGE_MODELS,
  VIDEO_MODELS,
  estimateCredits,
  getModel,
  type AiKind,
} from "@/lib/ai-models";
import { Banner, Button, Card, Input, Label, Select, Spinner, Textarea } from "@/components/ui";

type Tab = "avulsa" | "automacao" | "biblioteca";

interface Generation {
  id: string;
  kind: AiKind;
  model: string;
  prompt: string;
  status: "queued" | "processing" | "done" | "failed";
  result_url: string | null;
  credits_charged: number | null;
  error: string | null;
  created_at: string;
}

const TABS: Array<[Tab, string]> = [
  ["avulsa", "Geração avulsa"],
  ["automacao", "Automação"],
  ["biblioteca", "Biblioteca"],
];

export default function StudioPage() {
  const [tab, setTab] = useState<Tab>("avulsa");
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<{ balance: number }>("/credits")
      .then((r) => setCredits(r.balance))
      .catch(() => setCredits(null));
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Estúdio de <span className="text-gradient">Conteúdo IA</span>
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            Gere imagens e vídeos com IA, monte uma esteira automática e publique no TikTok.
          </p>
        </div>
        <div className="glass rounded-lg px-4 py-2 text-right">
          <p className="text-xs uppercase tracking-wide text-ink-faint">Créditos</p>
          <p className="text-lg font-bold text-gradient">{credits ?? "—"}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border-subtle">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === value
                ? "border-lumix-purple font-medium text-ink"
                : "border-transparent text-ink-dim hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "avulsa" && <AvulsaTab />}
      {tab === "automacao" && <AutomacaoTab />}
      {tab === "biblioteca" && <BibliotecaTab />}
    </div>
  );
}

/* ───────────────────────── Geração avulsa ───────────────────────── */

function AvulsaTab() {
  const [kind, setKind] = useState<AiKind>("video");
  const models = kind === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const [modelId, setModelId] = useState(models[0].id);
  const model = getModel(modelId) ?? models[0];

  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState(model.aspectRatios?.[0] ?? "9:16");
  const [duration, setDuration] = useState(model.durations?.[0] ?? 8);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Generation | null>(null);

  const cost = estimateCredits(model, kind === "video" ? duration : undefined);

  function switchKind(k: AiKind) {
    setKind(k);
    const first = (k === "image" ? IMAGE_MODELS : VIDEO_MODELS)[0];
    setModelId(first.id);
    setAspect(first.aspectRatios?.[0] ?? "9:16");
    setDuration(first.durations?.[0] ?? 8);
    setResult(null);
  }

  async function generate() {
    setError(null);
    setResult(null);
    if (!prompt.trim()) return setError("Escreva um prompt.");
    setBusy(true);
    try {
      const created = await apiFetch<Generation>("/generations", {
        method: "POST",
        body: {
          kind,
          provider: model.backend ?? "kie",
          model: model.kieModel,
          model_id: model.id,
          prompt,
          aspect_ratio: aspect,
          ...(kind === "video" ? { duration } : {}),
        },
      });
      // poll até concluir
      let cur = created;
      for (let i = 0; i < 60 && (cur.status === "queued" || cur.status === "processing"); i++) {
        await new Promise((r) => setTimeout(r, 3000));
        cur = await apiFetch<Generation>(`/generations/${created.id}`);
      }
      if (cur.status === "failed") setError(cur.error ?? "Falha na geração.");
      setResult(cur);
    } catch (e) {
      setError(
        (e as Error).message +
          " — verifique se a API está no ar e a KIE_API_KEY configurada.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <div>
          <Label>Tipo</Label>
          <div className="flex gap-2">
            {(["image", "video"] as AiKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => switchKind(k)}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm transition-colors ${
                  kind === k
                    ? "border-lumix-purple bg-lumix-purple/15 text-ink"
                    : "border-border-subtle text-ink-dim hover:border-ink-faint"
                }`}
              >
                {k === "image" ? "🖼️ Imagem" : "🎬 Vídeo"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="model">Modelo</Label>
          <Select
            id="model"
            value={modelId}
            onChange={(e) => {
              setModelId(e.target.value);
              const m = getModel(e.target.value)!;
              setAspect(m.aspectRatios?.[0] ?? "9:16");
              setDuration(m.durations?.[0] ?? 8);
            }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.credits} créd.
              </option>
            ))}
          </Select>
          {model.note && <p className="mt-1 text-xs text-ink-faint">{model.note}</p>}
        </div>

        <div>
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea
            id="prompt"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              kind === "image"
                ? "Descreva a cena/imagem que quer gerar…"
                : "Descreva o vídeo (movimento, ambiente, ação)…"
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {model.aspectRatios && (
            <div>
              <Label htmlFor="aspect">Proporção</Label>
              <Select id="aspect" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                {model.aspectRatios.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {kind === "video" && model.durations && (
            <div>
              <Label htmlFor="duration">Duração (s)</Label>
              <Select
                id="duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {model.durations.map((d) => (
                  <option key={d} value={d}>
                    {d}s
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        <Button onClick={generate} disabled={busy} className="w-full">
          {busy ? (
            <>
              <Spinner /> Gerando…
            </>
          ) : (
            `Gerar (${cost} créditos)`
          )}
        </Button>
      </Card>

      <Card className="flex min-h-[320px] flex-col items-center justify-center">
        {busy ? (
          <div className="text-center text-ink-dim">
            <Spinner />
            <p className="mt-3 text-sm">
              A IA está {kind === "image" ? "desenhando" : "renderizando"}… isso pode levar de
              alguns segundos a minutos.
            </p>
          </div>
        ) : result?.result_url ? (
          <div className="w-full space-y-3">
            {result.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.result_url}
                alt="Resultado"
                className="mx-auto max-h-96 rounded-lg border border-border-subtle"
              />
            ) : (
              <video
                src={result.result_url}
                controls
                className="mx-auto max-h-96 rounded-lg border border-border-subtle"
              />
            )}
            <a
              href={result.result_url}
              download
              target="_blank"
              rel="noreferrer"
              className="btn-gradient block rounded-lg px-4 py-2 text-center text-sm font-semibold text-white"
            >
              ⬇ Baixar
            </a>
          </div>
        ) : (
          <p className="px-6 text-center text-sm text-ink-faint">
            O resultado aparece aqui. Cada geração entra também na sua Biblioteca.
          </p>
        )}
      </Card>
    </div>
  );
}

/* ───────────────────────── Automação ───────────────────────── */

function AutomacaoTab() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [accountId, setAccountId] = useState("");

  const [niche, setNiche] = useState("");
  const [perDay, setPerDay] = useState(2);
  const [duration, setDuration] = useState(8);
  const [imageModelId, setImageModelId] = useState(IMAGE_MODELS[0].id);
  const [videoModelId, setVideoModelId] = useState(VIDEO_MODELS[0].id);
  const [scenePrompt, setScenePrompt] = useState(
    "Você é um diretor de arte. Gere prompts visuais detalhados (em inglês) para cada cena do roteiro, mantendo consistência de personagem, iluminação e estilo do nicho.",
  );
  const [videoPrompt, setVideoPrompt] = useState(
    "Você é um roteirista de vídeos curtos para TikTok. A partir do nicho, crie um roteiro envolvente com gancho nos 2 primeiros segundos e descreva o movimento de câmera de cada cena.",
  );
  const [times, setTimes] = useState<string[]>(["08:00", "17:00"]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ clients: Client[] }>("/clients")
      .then((r) => setClients(r.clients))
      .catch(() => setClients([]));
  }, []);

  useEffect(() => {
    setAccounts([]);
    setAccountId("");
    if (!clientId) return;
    apiFetch<{ accounts: SocialAccount[] }>(`/clients/${clientId}/accounts`)
      .then((r) => setAccounts(r.accounts.filter((a) => a.status === "connected")))
      .catch(() => setAccounts([]));
  }, [clientId]);

  // mantém a qtd de horários alinhada aos vídeos/dia
  useEffect(() => {
    setTimes((prev) => {
      if (perDay === prev.length) return prev;
      if (perDay < prev.length) return prev.slice(0, perDay);
      return [...prev, ...Array(perDay - prev.length).fill("12:00")];
    });
  }, [perDay]);

  const imgModel = getModel(imageModelId)!;
  const vidModel = getModel(videoModelId)!;
  const scenesPerVideo = Math.max(1, Math.round(duration / 4));
  const creditsPerVideo =
    imgModel.credits * scenesPerVideo + estimateCredits(vidModel, duration);
  const creditsPerDay = creditsPerVideo * perDay;

  async function save() {
    setError(null);
    if (!niche.trim()) return setError("Defina o nicho do perfil.");
    if (!accountId) return setError("Escolha a conta de publicação.");
    setBusy(true);
    try {
      await apiFetch("/automations", {
        method: "POST",
        body: {
          client_id: clientId,
          social_account_id: accountId,
          niche,
          videos_per_day: perDay,
          video_duration: duration,
          image_model: imgModel.kieModel,
          video_model: vidModel.kieModel,
          scene_agent_prompt: scenePrompt,
          video_agent_prompt: videoPrompt,
          post_times: times,
        },
      });
      setSaved(true);
    } catch (e) {
      setError(
        (e as Error).message + " — a automação será ativada quando o backend estiver no ar.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Banner kind="info">
        Configure a esteira: a IA cria roteiro → prompts das cenas → imagens → vídeo e o sistema
        publica nos horários definidos, todo dia, sozinho.
      </Banner>

      <Card className="space-y-4">
        <h2 className="font-semibold">1. Perfil e conta</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="niche">Nicho do perfil</Label>
            <Input
              id="niche"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="Ex.: receitas fit, motivação, pets…"
            />
          </div>
          <div>
            <Label htmlFor="client">Cliente</Label>
            <Select id="client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Selecione…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {clientId && (
          <div>
            <Label htmlFor="account">Conta de publicação</Label>
            <Select id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Selecione a conta TikTok…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name ?? "Conta TikTok"}
                </option>
              ))}
            </Select>
            {accounts.length === 0 && (
              <p className="mt-1 text-xs text-ink-faint">
                Nenhuma conta conectada.{" "}
                <Link href={`/clients/${clientId}`} className="text-lumix-blue underline">
                  Conectar
                </Link>
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">2. Volume e formato</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="perday">Vídeos por dia</Label>
            <Input
              id="perday"
              type="number"
              min={1}
              max={12}
              value={perDay}
              onChange={(e) => setPerDay(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div>
            <Label htmlFor="dur">Duração do vídeo (s)</Label>
            <Input
              id="dur"
              type="number"
              min={4}
              max={60}
              value={duration}
              onChange={(e) => setDuration(Math.max(4, Number(e.target.value)))}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="imodel">Modelo de imagem (cenas)</Label>
            <Select
              id="imodel"
              value={imageModelId}
              onChange={(e) => setImageModelId(e.target.value)}
            >
              {IMAGE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.credits} créd.
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="vmodel">Modelo de vídeo</Label>
            <Select
              id="vmodel"
              value={videoModelId}
              onChange={(e) => setVideoModelId(e.target.value)}
            >
              {VIDEO_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.credits} créd.
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">3. Agentes de IA</h2>
        <div>
          <Label htmlFor="scenep">Prompt do agente de cenas (gera os prompts das imagens)</Label>
          <Textarea
            id="scenep"
            rows={3}
            value={scenePrompt}
            onChange={(e) => setScenePrompt(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="videop">Prompt do agente de vídeo (gera o roteiro/vídeo)</Label>
          <Textarea
            id="videop"
            rows={3}
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">4. Horários de publicação</h2>
        <p className="text-sm text-ink-dim">
          Um horário por vídeo/dia. O cron publica exatamente nesses horários.
        </p>
        <div className="flex flex-wrap gap-3">
          {times.map((t, i) => (
            <Input
              key={i}
              type="time"
              value={t}
              onChange={(e) =>
                setTimes((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))
              }
              className="w-32"
            />
          ))}
        </div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-ink-dim">Estimativa de consumo</p>
          <p className="text-lg font-bold">
            <span className="text-gradient">{creditsPerVideo}</span> créditos/vídeo ·{" "}
            <span className="text-gradient">{creditsPerDay}</span> créditos/dia
          </p>
          <p className="text-xs text-ink-faint">
            ~{scenesPerVideo} cena(s) por vídeo. Valor final conforme tabela da kie.ai.
          </p>
        </div>
        <Button onClick={save} disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Salvando…
            </>
          ) : (
            "Ativar automação"
          )}
        </Button>
      </Card>

      {error && <Banner kind="error">{error}</Banner>}
      {saved && <Banner kind="success">Automação ativada! Ela roda nos horários definidos.</Banner>}
    </div>
  );
}

/* ───────────────────────── Biblioteca ───────────────────────── */

function BibliotecaTab() {
  const [items, setItems] = useState<Generation[] | null>(null);

  useEffect(() => {
    apiFetch<{ generations: Generation[] }>("/generations")
      .then((r) => setItems(r.generations))
      .catch(() => setItems([]));
  }, []);

  if (items === null) return <Spinner />;
  if (items.length === 0) {
    return (
      <Card className="text-center text-sm text-ink-faint">
        Nada gerado ainda. Crie sua primeira imagem ou vídeo na aba “Geração avulsa”.
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((g) => (
        <Card key={g.id} className="space-y-2 p-3">
          {g.result_url ? (
            g.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={g.result_url}
                alt={g.prompt}
                className="aspect-[9/16] w-full rounded-lg object-cover"
              />
            ) : (
              <video
                src={g.result_url}
                controls
                className="aspect-[9/16] w-full rounded-lg object-cover"
              />
            )
          ) : (
            <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg bg-surface-overlay text-xs text-ink-faint">
              {g.status === "failed" ? "Falhou" : "Processando…"}
            </div>
          )}
          <p className="line-clamp-2 text-xs text-ink-dim">{g.prompt}</p>
          {g.result_url && (
            <a
              href={g.result_url}
              download
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-lumix-blue underline"
            >
              ⬇ Baixar
            </a>
          )}
        </Card>
      ))}
    </div>
  );
}
