"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Banner, Button, Input, Label, Spinner } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(
        err.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos"
          : err.message,
      );
      return;
    }
    router.push(search.get("next") ?? "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Banner kind="error">{error}</Banner>}
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@lumixagency.com"
        />
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Spinner /> : "Entrar"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-xl font-bold">
          <span className="text-gradient">Lumix</span> Social Manager
        </Link>
        <div className="rounded-xl border border-border-subtle bg-surface-raised p-6">
          <h1 className="mb-5 text-lg font-semibold">Entrar no painel</h1>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-xs text-ink-faint">
          <Link href="/forgot-password" className="text-lumix-blue hover:underline">
            Esqueci minha senha
          </Link>
        </p>
        <p className="mt-1 text-center text-xs text-ink-faint">
          Não tem conta?{" "}
          <Link href="/signup" className="text-lumix-blue hover:underline">
            Criar conta grátis
          </Link>
        </p>
      </div>
    </main>
  );
}
