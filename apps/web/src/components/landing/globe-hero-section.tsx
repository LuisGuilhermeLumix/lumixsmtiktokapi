"use client";

// Hero da landing com globo wireframe 3D (react-three-fiber) + identidade Lumix.
// Client component: o Canvas do r3f só renderiza no browser.

import { motion } from "framer-motion";
import { DotGlobeHero } from "@/components/ui/globe-hero";
import { CtaButton } from "@/components/landing/cta-button";

export function GlobeHeroSection() {
  return (
    <DotGlobeHero
      rotationSpeed={0.004}
      color="#8b5cf6"
      className="min-h-[88vh] px-6 py-20"
    >
      {/* glow orbs da marca, atrás do conteúdo */}
      <div
        className="glow-orb left-1/2 top-8 h-96 w-96 -translate-x-1/2 bg-lumix-purple"
        aria-hidden
      />
      <div
        className="glow-orb bottom-10 right-1/5 h-72 w-72 bg-lumix-magenta opacity-20"
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-dim"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-lumix-blue" />
          TikTok multi-cliente
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl"
        >
          O TikTok de todos os seus clientes{" "}
          <span className="text-gradient">em um só painel</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-ink-dim"
        >
          Conecte contas via OAuth oficial, publique, agende e acompanhe métricas — sem pedir
          senha a ninguém e sem trocar de aba a cada cliente.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <CtaButton href="/login" location="hero">
            Entrar no painel
          </CtaButton>
          <CtaButton href="#como-funciona" variant="secondary" location="hero">
            Ver como funciona
          </CtaButton>
        </motion.div>

        <p className="mt-4 text-sm text-ink-faint">
          Operado pela Lumix Agency — a mesma plataforma que usamos nos nossos clientes.
        </p>
      </div>
    </DotGlobeHero>
  );
}
