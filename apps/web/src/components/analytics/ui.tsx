"use client";

// Primitives animados do painel de métricas (glassmorphism + framer-motion).
// Respeita prefers-reduced-motion. Ícones via lucide (sem emoji).

import { useEffect, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

const nf = new Intl.NumberFormat("pt-BR");
const cf = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
export const compact = (n: number) => cf.format(n);
export const full = (n: number) => nf.format(n);

/** número que anima de 0 até o valor (count-up) */
export function CountUp({ value, format = compact }: { value: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(Math.round(v)));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.9, ease: "easeOut" });
    return controls.stop;
  }, [value, mv, reduce]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

/** badge de variação (delta) com seta e cor */
export function Delta({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (!Number.isFinite(value) || value === 0) {
    return <span className="text-xs text-ink-faint">—</span>;
  }
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
        up ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
      }`}
    >
      <Icon className="size-3" />
      {up ? "+" : ""}
      {full(value)}
      {suffix}
    </span>
  );
}

/** cartão glass com leve entrada animada */
export function GlassCard({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={`glass rounded-2xl ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** KPI animado: ícone em gradiente, valor count-up, delta */
export function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  accent,
  index = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  delta?: number;
  accent: string;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: "easeOut" }}
      whileHover={{ y: -3 }}
      className="glass group relative overflow-hidden rounded-2xl p-5"
    >
      {/* glow de fundo no hover */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-40"
        style={{ background: accent }}
        aria-hidden
      />
      <div className="flex items-center justify-between">
        <span
          className="flex size-9 items-center justify-center rounded-xl"
          style={{ background: `${accent}26`, color: accent }}
        >
          <Icon className="size-5" />
        </span>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-ink">
        <CountUp value={value} />
      </p>
      <p className="mt-0.5 text-xs text-ink-dim">{label}</p>
    </motion.div>
  );
}

/** controle segmentado (período) com indicador deslizante */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border-subtle bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="relative cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          >
            {active && (
              <motion.span
                layoutId="seg-active"
                className="absolute inset-0 rounded-md bg-lumix-purple/25"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`relative z-10 ${active ? "text-ink" : "text-ink-faint hover:text-ink"}`}>
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
