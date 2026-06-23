// Landing pública — copy baseada em product-marketing-context.md.
// Server component (SEO); interatividade fica nos CTAs (client).

import { CtaButton } from "@/components/landing/cta-button";
import { RobotHeroSection } from "@/components/landing/robot-hero-section";
import { Tracking } from "@/components/tracking";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const FEATURES = [
  {
    title: "Conexão sem senha, sem risco",
    text: "O cliente autoriza pelo login oficial do TikTok em dois cliques e revoga quando quiser. Acabou a senha trocada no WhatsApp — e o perrengue de guardar acesso dos outros.",
  },
  {
    title: "Cada operador no seu quadrado",
    text: "Defina quem é owner, admin ou operator. O operador enxerga só os clientes que você atribuiu — sem acesso indevido e sem bagunça na equipe.",
  },
  {
    title: "Post que não cai",
    text: "Se a publicação direta falhar, o vídeo entra como rascunho na conta do cliente automaticamente. Nada se perde, e você acompanha cada tentativa no painel.",
  },
  {
    title: "Agende e esqueça",
    text: "A fila roda no servidor: o vídeo sai no horário marcado mesmo com o computador desligado e nenhuma aba aberta.",
  },
  {
    title: "Relatório que se atualiza sozinho",
    text: "Followers, views, likes e comments coletados a cada 6 horas, com histórico por conta e por vídeo. Pare de printar métrica na mão.",
  },
  {
    title: "Publica até sem abrir o painel",
    text: "API própria e webhooks prontos: seu n8n, Make ou Zapier gera o conteúdo e dispara a publicação sozinho, no seu fluxo de sempre.",
  },
];

const STEPS = [
  { n: "1", title: "Crie o cliente", text: "Cadastre o cliente no painel em menos de um minuto." },
  {
    n: "2",
    title: "Mande o link de conexão",
    text: "O cliente clica, autoriza pelo TikTok oficial e pronto — sem senha e sem você no meio.",
  },
  {
    n: "3",
    title: "Suba o vídeo",
    text: "Escolha as contas, escreva a legenda e o horário. Publique na hora ou deixe agendado.",
  },
  {
    n: "4",
    title: "Veja os números",
    text: "As métricas de cada conta e vídeo aparecem atualizadas sozinhas. Sem planilha, sem print.",
  },
];

const FAQS = [
  {
    q: "Preciso da senha do TikTok dos meus clientes?",
    a: "Não — e isso é de propósito. A conexão usa o login oficial do TikTok (OAuth): o cliente autoriza o acesso na conta dele e pode revogar quando quiser. Você nunca vê, digita ou guarda a senha de ninguém.",
  },
  {
    q: "Os dados e os acessos dos meus clientes ficam seguros?",
    a: "Ficam. Os tokens de acesso são criptografados em repouso (AES-256-GCM), cada organização tem os dados isolados das demais e toda ação sensível fica registrada em auditoria. Quem é operator só enxerga os clientes atribuídos a ele.",
  },
  {
    q: "E se o TikTok recusar uma publicação?",
    a: "A fila tenta de novo automaticamente, com intervalo crescente. Se mesmo assim não publicar direto, o vídeo é entregue como rascunho na conta do cliente — nada se perde e você vê o status de cada tentativa no painel.",
  },
  {
    q: "Tem limite de clientes ou de contas?",
    a: "Não há limite estrutural de clientes nem de contas conectadas por organização. Se quiser controlar volume, dá para configurar quotas de upload por cliente — mas a régua é sua.",
  },
  {
    q: "Quem mantém a ferramenta e me dá suporte?",
    a: "O LSM é a mesma plataforma que a Lumix Agency usa para operar o TikTok dos próprios clientes, então quem cuida do produto vive a sua rotina. O acesso hoje é para equipes da Lumix e agências parceiras, com suporte direto de quem construiu e usa a ferramenta todos os dias.",
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
        {/* 1 — hero com robô 3D interativo (Spline) */}
        <RobotHeroSection />

        {/* 2 — prova/números */}
        <section className="border-y border-border-subtle bg-surface-raised/50 px-6 py-10">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 text-center sm:grid-cols-4">
            {[
              ["Clientes sem limite", "cresça sem trocar de ferramenta"],
              ["Métricas sozinhas", "atualizadas a cada 6 horas"],
              ["Nenhum post perdido", "a fila tenta de novo por você"],
              ["Zero senha trocada", "conexão oficial do TikTok"],
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
              Tudo que a operação da sua agência precisa
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-ink-dim">
              Da conexão ao relatório — o fluxo completo de TikTok multi-cliente, sem gambiarra.
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
                Deixe a publicação <span className="text-gradient">rodar sozinha</span>
              </h2>
              <p className="mt-4 text-ink-dim">
                Já usa n8n, Make ou Zapier? Gere a chave de API da sua agência e conecte. A partir
                daí, seu robô de conteúdo cria o vídeo, dispara a publicação e o LSM cuida do resto —
                fila, retry, fallback e métricas. Sua equipe só acompanha o resultado.
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
              Centralize o TikTok da sua agência ainda esta semana
            </h2>
            <p className="mt-4 text-ink-dim">
              Painel multi-cliente, publicação que não deixa post cair e métricas que se atualizam
              sozinhas — operado pela própria Lumix e aberto a um grupo selecionado de agências
              parceiras.
            </p>
            <div className="mt-8">
              <CtaButton href="/signup" location="cta-final">
                Criar conta grátis
              </CtaButton>
            </div>
            <p className="mt-3 text-sm text-ink-faint">
              Acesso atual para equipes da Lumix e agências parceiras.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle px-6 py-8 text-center text-sm text-ink-faint">
        © {new Date().getFullYear()} Lumix Agency · Lumix Social Manager
      </footer>
    </>
  );
}
