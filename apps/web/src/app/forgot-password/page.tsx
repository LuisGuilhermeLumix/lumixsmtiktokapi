"use client";

// "Esqueci minha senha" — envia o e-mail de recuperação. O link volta via
// /auth/callback?next=/reset-password (sessão de recuperação) → define nova senha.

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Banner, Button, Input, Label, Spinner } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (err) return setError(err.message);
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-xl font-bold">
          <span className="text-gradient">Lumix</span> Social Manager
        </Link>
        <div className="rounded-xl border border-border-subtle bg-surface-raised p-6">
          <h1 className="mb-1 text-lg font-semibold">Recuperar senha</h1>
          {sent ? (
            <Banner kind="success">
              Se houver uma conta com <b>{email}</b>, enviamos um link para redefinir a senha.
            </Banner>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <p className="text-xs text-ink-faint">Enviaremos um link para você criar uma nova senha.</p>
              {error && <Banner kind="error">{error}</Banner>}
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <Spinner /> : "Enviar link"}
              </Button>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-ink-faint">
          <Link href="/login" className="text-lumix-blue hover:underline">
            Voltar ao login
          </Link>
        </p>
      </div>
    </main>
  );
}
