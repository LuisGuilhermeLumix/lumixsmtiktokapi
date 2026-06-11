import { ImageResponse } from "next/og";

export const alt = "Lumix Social Manager — TikTok dos seus clientes em um só painel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0a0a0f",
          color: "#e5e7eb",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            background: "linear-gradient(90deg,#3b82f6,#8b5cf6,#d946ef)",
            backgroundClip: "text",
            color: "transparent",
            marginBottom: 24,
          }}
        >
          Lumix Social Manager
        </div>
        <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1, maxWidth: 980 }}>
          O TikTok de todos os seus clientes em um só painel
        </div>
        <div style={{ fontSize: 30, color: "#9ca3af", marginTop: 28 }}>
          Conectar · Publicar · Agendar · Medir — sem pedir senha a ninguém
        </div>
      </div>
    ),
    size,
  );
}
