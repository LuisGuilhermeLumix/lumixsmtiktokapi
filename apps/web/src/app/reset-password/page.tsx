"use client";

// Define a nova senha. O usuário chega aqui já com sessão de recuperação
// (estabelecida pelo /auth/callback após clicar no link do e-mail).

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Banner, Button, Input, Label, Spinner } from "@/components/ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("A senha precisa de pelo menos 8 caracteres.");
    setLoading(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(
        /Auth session missing|not authenticated/i.test(err.message)
          ? "Link inválido ou expirado. Solicite a recuperação novamente."
          : err.message,
      );
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/dashboard"), 1200);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-xl font-bold">
          <span className="text-gradient">Lumix</span> Social Manager
        </Link>
        <div className="rounded-xl border border-border-subtle bg-surface-raised p-6">
          <h1 className="mb-1 text-lg font-semibold">Nova senha</h1>
          {done ? (
            <Banner kind="success">Senha atualizada! Redirecionando…</Banner>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && <Banner kind="error">{error}</Banner>}
              <div>
                <Label htmlFor="password">Nova senha</Label>
                <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 8 caracteres" />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <Spinner /> : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
