"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/clients", label: "Clientes", icon: "◈" },
  { href: "/posts", label: "Posts", icon: "▶" },
  { href: "/analytics", label: "Analytics", icon: "↗" },
  { href: "/settings", label: "Configurações", icon: "⚙" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Painel">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMenuOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-surface-overlay font-medium text-ink"
                : "text-ink-dim hover:bg-surface-overlay hover:text-ink"
            }`}
          >
            <span aria-hidden className={active ? "text-gradient" : ""}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-surface-raised/50 p-4 lg:flex">
        <Link href="/dashboard" className="mb-8 block px-3 text-base font-bold">
          <span className="text-gradient">Lumix</span> SM
        </Link>
        {nav}
        <div className="mt-auto border-t border-border-subtle pt-4">
          <p className="truncate px-3 text-xs text-ink-faint" title={email ?? ""}>
            {email ?? "…"}
          </p>
          <button
            onClick={logout}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-ink-dim hover:bg-surface-overlay hover:text-ink"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* topbar mobile */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border-subtle px-4 py-3 lg:hidden">
          <Link href="/dashboard" className="font-bold">
            <span className="text-gradient">Lumix</span> SM
          </Link>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm"
          >
            ☰
          </button>
        </header>
        {menuOpen && (
          <div className="border-b border-border-subtle p-4 lg:hidden">
            {nav}
            <button
              onClick={logout}
              className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-ink-dim hover:bg-surface-overlay"
            >
              Sair
            </button>
          </div>
        )}
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
