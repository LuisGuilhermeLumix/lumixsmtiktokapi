import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone exige symlinks (falha no Windows sem modo dev);
  // ativado apenas no build Docker via NEXT_OUTPUT=standalone
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
