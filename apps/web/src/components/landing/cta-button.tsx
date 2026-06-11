"use client";

import Link from "next/link";
import { trackEvent } from "../tracking";

export function CtaButton({
  href,
  children,
  variant = "primary",
  eventName = "ClickCTA",
  location,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  eventName?: string;
  location: string;
}) {
  const cls =
    variant === "primary"
      ? "btn-gradient text-white"
      : "border border-border-subtle bg-surface-raised text-ink hover:bg-surface-overlay";
  return (
    <Link
      href={href}
      onClick={() => trackEvent(eventName, { location })}
      className={`inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition-colors ${cls}`}
    >
      {children}
    </Link>
  );
}
