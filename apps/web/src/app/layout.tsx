import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TikTok multi-cliente para agências — Lumix Social Manager",
    template: "%s — Lumix Social Manager",
  },
  description:
    "Gerencie o TikTok de todos os seus clientes num painel só: conexão oficial sem senha, agendamento, retry automático e métricas a cada 6h. Integra com n8n, Make e Zapier.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: SITE_URL,
    siteName: "Lumix Social Manager",
    title: "TikTok multi-cliente para agências — Lumix Social Manager",
    description:
      "Conecte, publique, agende e meça o TikTok de vários clientes num painel só — sem pedir senha a ninguém e sem deixar post cair.",
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
