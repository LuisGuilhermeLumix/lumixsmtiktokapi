import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (
          cookies: Array<{ name: string; value: string; options?: CookieOptions }>,
        ) => {
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of cookies) {
            res.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  if (path === "/login") {
    if (user) return NextResponse.redirect(new URL("/dashboard", req.url));
    return res;
  }
  if (!user) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  return res;
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/clients/:path*",
    "/posts/:path*",
    "/analytics/:path*",
    "/settings/:path*",
  ],
};
