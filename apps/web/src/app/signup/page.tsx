"use client";

// Cadastro self-service. O Supabase Auth cria o usuário; o trigger
// handle_new_user provisiona automaticamente a organização (workspace), o owner
// e um cliente padrão. Plano inicial: Free.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Banner, Button, Input, Label, Spinner } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("A senha precisa de pelo menos 8 caracteres.");
    setLoading(true);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { workspace: workspace.trim() || email.split("@")[0] },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    // se a sessão já veio (confirmação de e-mail desligada), entra direto
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setConfirm(true); // precisa confirmar o e-mail
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-xl font-bold">
          <span className="text-gradient">Lumix</span> Social Manager
        </Link>
        <div className="rounded-xl border border-border-subtle bg-surface-raised p-6">
          <h1 className="mb-1 text-lg font-semibold">Criar conta</h1>
          <p className="mb-5 text-xs text-ink-faint">
            Crie seu workspace grátis. Conecte suas contas TikTok e comece a publicar.
          </p>

          {confirm ? (
            <Banner kind="success">
              Conta criada! Confirme seu e-mail clicando no link que enviamos para <b>{email}</b> e
              depois faça login.
            </Banner>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              {error && <Banner kind="error">{error}</Banner>}
              <div>
                <Label htmlFor="workspace">Nome do workspace</Label>
                <Input
                  id="workspace"
                  required
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  placeholder="Ex.: Minha Agência"
                />
              </div>
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
              </div>
              <div>
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 8 caracteres" />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <Spinner /> : "Criar conta grátis"}
              </Button>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-ink-faint">
          Já tem conta?{" "}
          <Link href="/login" className="text-lumix-blue hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
