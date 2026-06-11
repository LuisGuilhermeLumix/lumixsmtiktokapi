# Contexto de Produto — Lumix Social Manager (LSM)

> Fonte única de verdade para copy, tom e argumentos da landing pública.

## Produto / Oferta

SaaS da Lumix Agency para **agências e gestores de social media** que
administram contas TikTok de vários clientes. Conecta contas via OAuth
oficial do TikTok, publica e agenda vídeos, coleta analytics e se integra
a automações (n8n / API REST com API key).

## Público-alvo

- Agências de marketing e social media (2–50 clientes ativos)
- Gestores de tráfego/conteúdo que postam TikTok em escala
- Times que já usam automação (n8n, Make) e querem publicar via API

## Promessa principal

**Todas as contas TikTok dos seus clientes em um só painel — conectar,
publicar, agendar e medir, sem pedir senha a ninguém.**

## Diferenciais

1. **OAuth oficial do TikTok** — o cliente autoriza com 2 cliques; nenhuma
   senha trocada por WhatsApp, tokens criptografados (AES-256-GCM).
2. **Multi-cliente com permissões** — owner/admin/operator; operador só
   enxerga os clientes atribuídos a ele.
3. **Publicação resiliente** — fila com retry automático; se o post direto
   não estiver disponível, o vídeo cai como rascunho na conta do cliente
   (nada se perde).
4. **Agendamento de verdade** — fila persistente (não depende de aba aberta).
5. **Analytics automático** — followers, views, likes e comments coletados
   a cada 6h, com histórico por conta e por vídeo.
6. **Feito para automação** — API REST com API key + webhooks n8n: o fluxo
   de conteúdo pode publicar sozinho.

## Tom de voz

Direto, profissional, pt-BR, sem hype vazio. Fala com quem opera agência
no dia a dia. Zero jargão corporativo genérico.

## Objeções reais (FAQ)

1. "Preciso da senha do TikTok do cliente?" → Não. OAuth oficial; o cliente
   autoriza e pode revogar quando quiser.
2. "É seguro? Onde ficam os tokens?" → Criptografados em repouso
   (AES-256-GCM), isolamento por organização (RLS), auditoria de ações.
3. "E se o TikTok recusar a publicação?" → Retry automático com backoff;
   em último caso o vídeo vai como rascunho para a conta — registrado e
   visível no painel.
4. "Funciona com meu fluxo de automação?" → Sim: API REST com API key e
   webhooks para n8n/Make.
5. "Quantos clientes posso gerenciar?" → Sem limite estrutural; quotas de
   upload configuráveis por cliente.

## CTA principal

"Entrar no painel" (login) · secundário: "Falar com a Lumix" (contato).

## Provas sociais / números

Produto operado pela própria Lumix Agency (dogfooding). Sem depoimentos
externos ainda — usar números de capacidade (contas ilimitadas, coleta 6/6h,
retry automático) no lugar de depoimentos até existirem casos públicos.

## Marca / Visual

Lumix: gradiente azul (#3b82f6) → roxo (#8b5cf6) → magenta (#d946ef)
sobre fundo escuro (#0a0a0f). Dark mode default. Visual premium:
glow orbs, glassmorphism sutil, microinterações discretas.
