import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone exige symlinks (falha no Windows sem modo dev);
  // ativado apenas no build Docker via NEXT_OUTPUT=standalone
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // páginas legais verificadas pelo TikTok vivem em public/api/ e precisam
  // manter as URLs do hosting antigo; public/ não resolve index de diretório,
  // então /api → /api/index.html via rewrite (roda após estáticos)
  async rewrites() {
    return [{ source: "/api", destination: "/api/index.html" }];
  },
};

export default nextConfig;
