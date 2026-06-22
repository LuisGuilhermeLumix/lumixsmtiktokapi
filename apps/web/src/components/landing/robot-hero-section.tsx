"use client";

// Hero da landing: texto/CTAs à esquerda e robô 3D interativo (Spline) ao lado.
// O Spline carrega lazy só no client; cada coluna é independente.

import { motion } from "framer-motion";
import { InteractiveRobotSpline } from "@/components/ui/interactive-3d-robot";
import { CtaButton } from "@/components/landing/cta-button";

const ROBOT_SCENE_URL =
  "https://prod.spline.design/PyzDhpQ9E5f1E3MT/scene.splinecode";

export function RobotHeroSection() {
  return (
    <section className="relative overflow-hidden px-6 py-16 lg:py-24">
      <div
        className="glow-orb left-1/2 top-0 h-96 w-96 -translate-x-1/2 bg-lumix-purple"
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
        {/* coluna do texto */}
        <div className="text-center lg:text-left">
          <motion.span
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-dim"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-lumix-blue" />
            Painel de TikTok para agências
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl"
          >
            O TikTok de todos os seus clientes,{" "}
            <span className="text-gradient">sem caos e sem pedir senha</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-ink-dim lg:mx-0"
          >
            Conecte as contas pelo login oficial do TikTok, publique e agende em escala e acompanhe
            as métricas de cada cliente — num painel multi-cliente com fila e retry automático que
            não deixam post nenhum cair.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start"
          >
            <CtaButton href="/login" location="hero">
              Entrar no painel
            </CtaButton>
            <CtaButton href="#como-funciona" variant="secondary" location="hero">
              Ver como funciona
            </CtaButton>
          </motion.div>

          <p className="mt-4 text-sm text-ink-faint">
            Operado pela Lumix Agency — a mesma ferramenta que usamos nos nossos clientes, agora
            aberta para a sua agência.
          </p>
        </div>

        {/* coluna do robô interativo (arrastável com o mouse).
            A máscara radial faz só o robô aparecer: as bordas da cena (a "caixa"
            de fundo embutida no Spline) e o selo "Built with Spline" no canto
            desvanecem para transparente, blendando com a página. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.2 }}
          className="relative h-[420px] w-full sm:h-[520px] lg:h-[640px]"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at 50% 46%, #000 0%, #000 50%, transparent 74%)",
            maskImage:
              "radial-gradient(circle at 50% 46%, #000 0%, #000 50%, transparent 74%)",
          }}
        >
          <InteractiveRobotSpline
            scene={ROBOT_SCENE_URL}
            className="absolute inset-0 z-0 h-full w-full"
          />
        </motion.div>
      </div>
    </section>
  );
}
