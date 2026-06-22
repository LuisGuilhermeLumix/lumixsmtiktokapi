import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// dev local: lê .env do cwd ou da raiz do monorepo (no Docker vêm do ambiente)
loadDotenv({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  TIKTOK_CLIENT_KEY: z.string().min(1),
  TIKTOK_CLIENT_SECRET: z.string().min(1),
  TIKTOK_REDIRECT_URI: z.string().url(),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "esperado 64 chars hex (32 bytes) — gere com: openssl rand -hex 32"),
  N8N_WEBHOOK_SECRET: z.string().min(16, "use um segredo com pelo menos 16 chars"),

  // Estúdio de Conteúdo IA (kie.ai). Opcionais: sem KIE_API_KEY o estúdio
  // fica desativado e as rotas /generations respondem 503.
  KIE_API_KEY: z.string().optional(),
  KIE_CALLBACK_SECRET: z.string().optional(),
  API_PUBLIC_URL: z.string().url().optional(),
  // Magic Hour — provider principal (vídeo). Opcional; sem ela dá 503.
  MAGICHOUR_API_KEY: z.string().optional(),
  // taxa de markup oculta sobre o custo do provider (1.3 = +30%)
  CREDIT_MARKUP: z.coerce.number().positive().default(1.3),

  APP_URL: z.string().url().default("http://localhost:3000"),
});

export type ApiConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas/ausentes:\n${issues}`);
  }
  return parsed.data;
}
