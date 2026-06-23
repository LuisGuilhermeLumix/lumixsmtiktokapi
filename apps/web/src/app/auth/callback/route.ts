// Callback do Supabase Auth (confirmação de e-mail / magic link / OAuth).
// Troca o `code` por uma sessão (PKCE) e redireciona para o painel.

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (toSet: Array<{ name: string; value: string; options?: CookieOptions }>) => {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          },
        },
      },
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // sem code ou falhou → manda pro login
  return NextResponse.redirect(`${origin}/login`);
}
