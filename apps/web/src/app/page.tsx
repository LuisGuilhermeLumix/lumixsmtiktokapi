// Landing pública — copy baseada em product-marketing-context.md.
// Server component (SEO); interatividade fica nos CTAs (client).

import { CtaButton } from "@/components/landing/cta-button";
import { Tracking } from "@/components/tracking";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const FEATURES = [
  {
    title: "OAuth oficial do TikTok",
    text: "O cliente autoriza com 2 cliques e pode revogar quando quiser. Nenhuma senha trocada por WhatsApp.",
  },
  {
    title: "Multi-cliente com permissões",
    text: "Papéis de owner, admin e operator — cada operador enxerga somente os clientes atribuídos a ele.",
  },
  {
    title: "Publicação resiliente",
    text: "Fila com retry automático. Se o post direto não estiver disponível, o vídeo entra como rascunho na conta — nada se perde.",
  },
  {
    title: "Agendamento de verdade",
    text: "Fila persistente no servidor: o post sai no horário mesmo sem nenhuma aba aberta.",
  },
  {
    title: "Analytics automático",
    text: "Followers, views, likes e comments coletados a cada 6 horas, com histórico por conta e por vídeo.",
  },
  {
    title: "Feito para automação",
    text: "API REST com API key e webhooks para n8n: seu fluxo de conteúdo pode publicar sozinho.",
  },
];

const STEPS = [
  { n: "1", title: "Cadastre o cliente", text: "Crie o cliente no painel em segundos." },
  {
    n: "2",
    title: "Cliente autoriza o TikTok",
    text: "Envie o link de conexão — autorização OAuth oficial, sem senha.",
  },
  {
    n: "3",
    title: "Publique ou agende",
    text: "Suba o vídeo, escreva a legenda, escolha as contas e o horário.",
  },
  {
    n: "4",
    title: "Acompanhe os resultados",
    text: "Métricas por conta e por vídeo, atualizadas automaticamente.",
  },
];

const FAQS = [
  {
    q: "Preciso da senha do TikTok do cliente?",
    a: "Não. A conexão usa o OAuth oficial do TikTok: o cliente autoriza o acesso com a própria conta e pode revogar quando quiser.",
  },
  {
    q: "É seguro? Onde ficam os tokens de acesso?",
    a: "Os tokens são criptografados em repouso com AES-256-GCM, os dados são isolados por organização e toda ação sensível fica registrada em auditoria.",
  },
  {
    q: "E se o TikTok recusar uma publicação?",
    a: "A fila tenta de novo automaticamente com intervalo crescente. Em último caso o vídeo é entregue como rascunho na conta do cliente — tudo registrado e visível no painel.",
  },
  {
    q: "Funciona com meu fluxo de automação?",
    a: "Sim. A API REST aceita autenticação por API key e há webhooks prontos para n8n e Make — dá para criar e publicar posts sem abrir o painel.",
  },
  {
    q: "Quantos clientes posso gerenciar?",
    a: "Não há limite estrutural de clientes ou contas. Quotas de upload são configuráveis por cliente, se você quiser controlar volume.",
  },
];

function JsonLd() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Lumix Agency",
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
      },
      { "@type": "WebSite", name: "Lumix Social Manager", url: SITE_URL },
      {
        "@type": "SoftwareApplication",
        name: "Lumix Social Manager",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "SaaS para agências gerenciarem contas TikTok de clientes: conexão OAuth, publicação, agendamento e analytics.",
        provider: { "@type": "Organization", name: "Lumix Agency" },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />
  );
}

export default function LandingPage() {
  return (
    <>
      <Tracking />
      <JsonLd />

      {/* header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight">
          <span className="text-gradient">Lumix</span> Social Manager
        </span>
        <nav className="flex items-center gap-4" aria-label="Principal">
          <a href="#como-funciona" className="hidden text-sm text-ink-dim hover:text-ink sm:block">
            Como funciona
          </a>
          <a href="#faq" className="hidden text-sm text-ink-dim hover:text-ink sm:block">
            FAQ
          </a>
          <CtaButton href="/login" variant="secondary" location="header">
            Entrar
          </CtaButton>
        </nav>
      </header>

      <main>
        {/* 1 — hero */}
        <section className="relative overflow-hidden px-6 pb-24 pt-16 text-center">
          <div
            className="glow-orb left-1/2 top-0 h-96 w-96 -translate-x-1/2 bg-lumix-purple"
            aria-hidden
          />
          <div className="relative mx-auto max-w-3xl">
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
              O TikTok de todos os seus clientes{" "}
              <span className="text-gradient">em um só painel</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-dim">
              Conecte contas via OAuth oficial, publique, agende e acompanhe métricas — sem pedir
              senha a ninguém e sem trocar de aba a cada cliente.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <CtaButton href="/login" location="hero">
                Entrar no painel
              </CtaButton>
              <CtaButton href="#como-funciona" variant="secondary" location="hero">
                Ver como funciona
              </CtaButton>
            </div>
            <p className="mt-4 text-sm text-ink-faint">
              Operado pela Lumix Agency — a mesma plataforma que usamos nos nossos clientes.
            </p>
          </div>
        </section>

        {/* 2 — prova/números */}
        <section className="border-y border-border-subtle bg-surface-raised/50 px-6 py-10">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 text-center sm:grid-cols-4">
            {[
              ["Contas ilimitadas", "por organização"],
              ["Coleta 6/6h", "de métricas"],
              ["Retry automático", "em toda publicação"],
              ["OAuth oficial", "zero senhas trocadas"],
            ].map(([big, small]) => (
              <div key={big}>
                <p className="text-xl font-bold text-gradient sm:text-2xl">{big}</p>
                <p className="mt-1 text-sm text-ink-faint">{small}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 3 — features */}
        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-bold sm:text-4xl">
              Tudo que a operação de agência precisa
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-ink-dim">
              Do OAuth ao relatório — o fluxo completo de TikTok multi-cliente.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="glass rounded-xl p-6">
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-dim">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4 — como funciona */}
        <section id="como-funciona" className="border-y border-border-subtle bg-surface-raised/50 px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-3xl font-bold sm:text-4xl">Como funciona</h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <div key={s.n} className="relative">
                  <span className="text-gradient text-4xl font-extrabold">{s.n}</span>
                  <h3 className="mt-3 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-ink-dim">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5 — automação/integração (oferta técnica) */}
        <section className="px-6 py-24">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 lg:flex-row">
            <div className="flex-1">
              <h2 className="text-3xl font-bold sm:text-4xl">
                Publique <span className="text-gradient">sem abrir o painel</span>
              </h2>
              <p className="mt-4 text-ink-dim">
                Cada organização pode gerar API keys e conectar o n8n por webhook assinado. Seu
                fluxo gera o vídeo, chama a API e o LSM cuida do resto: fila, retry, fallback e
                métricas.
              </p>
            </div>
            <pre
              className="glass w-full flex-1 overflow-x-auto rounded-xl p-5 text-left text-xs leading-relaxed text-ink-dim"
              aria-label="Exemplo de uso da API"
            >{`curl -X POST $LSM_API/posts \\
  -H "Authorization: Apikey lsm_..." \\
  -F video=@video.mp4 \\
  -F client_id=... \\
  -F social_account_ids=... \\
  -F caption="novo vídeo 🚀" \\
  -F publish_now=true`}</pre>
          </div>
        </section>

        {/* 6 — FAQ */}
        <section id="faq" className="border-y border-border-subtle bg-surface-raised/50 px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-3xl font-bold sm:text-4xl">Perguntas frequentes</h2>
            <div className="mt-10 space-y-4">
              {FAQS.map((f) => (
                <details key={f.q} className="glass group rounded-xl p-5">
                  <summary className="cursor-pointer list-none font-medium marker:hidden">
                    {f.q}
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-ink-dim">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 7 — CTA final */}
        <section className="relative overflow-hidden px-6 py-24 text-center">
          <div
            className="glow-orb bottom-0 left-1/2 h-72 w-[36rem] -translate-x-1/2 bg-lumix-magenta"
            aria-hidden
          />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold sm:text-4xl">
              Centralize o TikTok da sua agência hoje
            </h2>
            <p className="mt-4 text-ink-dim">
              Painel multi-cliente, publicação resiliente e métricas automáticas — operado pela
              própria Lumix.
            </p>
            <div className="mt-8">
              <CtaButton href="/login" location="cta-final">
                Entrar no painel
              </CtaButton>
            </div>
            <p className="mt-3 text-sm text-ink-faint">Acesso para equipes da Lumix e parceiros.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle px-6 py-8 text-center text-sm text-ink-faint">
        © {new Date().getFullYear()} Lumix Agency · Lumix Social Manager
      </footer>
    </>
  );
}
