import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TikTok dos seus clientes em um só painel — Lumix Social Manager",
    template: "%s — Lumix Social Manager",
  },
  description:
    "Conecte contas TikTok via OAuth oficial, publique, agende e acompanhe métricas de todos os seus clientes. Feito para agências. Integra com n8n e API.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: SITE_URL,
    siteName: "Lumix Social Manager",
    title: "TikTok dos seus clientes em um só painel — Lumix Social Manager",
    description:
      "Conectar, publicar, agendar e medir contas TikTok de vários clientes — sem pedir senha a ninguém.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
