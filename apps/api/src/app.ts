import { createHash } from "node:crypto";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { TikTokApiError } from "@lsm/tiktok";
import { closeDeps, type ApiDeps } from "./deps.js";
import { createAuthHooks } from "./lib/auth.js";
import { HttpError } from "./lib/errors.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerApiKeyRoutes } from "./routes/apikeys.js";
import { registerAutomationRoutes } from "./routes/automation.js";
import { registerAuthTikTokRoutes } from "./routes/auth-tiktok.js";
import { registerClientRoutes } from "./routes/clients.js";
import { registerContentRoutes } from "./routes/content.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerWorkflowRoutes } from "./routes/workflows.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export async function buildApp(deps: ApiDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: deps.config.NODE_ENV === "production" ? "info" : "debug",
      // nunca logar tokens/secrets
      redact: ["req.headers.authorization", "req.headers['x-lsm-signature']"],
    },
    trustProxy: true,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin:
      deps.config.NODE_ENV === "production"
        ? [deps.config.APP_URL]
        : [deps.config.APP_URL, /localhost(:\d+)?$/],
    credentials: true,
  });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    redis: deps.redis,
    // por ator (hash do Authorization) — anônimos caem no IP
    keyGenerator: (req) => {
      const authHeader = req.headers.authorization;
      if (authHeader) return createHash("sha256").update(authHeader).digest("hex").slice(0, 24);
      return req.ip;
    },
    allowList: (req) => req.url === "/health" || req.url.startsWith("/docs"),
  });

  await app.register(multipart, {
    limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Lumix Social Manager API",
        description:
          "REST da LSM. Auth: `Authorization: Bearer <jwt supabase>` (dashboard) " +
          "ou `Authorization: Apikey <lsm_...>` (n8n/automação).",
        version: "0.1.0",
      },
      tags: [
        { name: "account", description: "Conta, organização e plano" },
        { name: "auth", description: "OAuth TikTok" },
        { name: "clients", description: "Clientes da agência" },
        { name: "posts", description: "Publicações" },
        { name: "analytics", description: "Métricas" },
        { name: "studio", description: "Estúdio de Conteúdo IA (kie.ai)" },
        { name: "automation", description: "Motor de automações (niche packs, personagens)" },
        { name: "settings", description: "API keys e configurações" },
        { name: "webhooks", description: "Integração n8n e kie.ai" },
        { name: "infra", description: "Healthcheck" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.decorateRequest("auth", null);

  app.setErrorHandler((err: FastifyError | HttpError | TikTokApiError, req, reply) => {
    if (err instanceof HttpError) {
      // 5xx não vaza a mensagem interna (pode conter detalhe de DB)
      if (err.statusCode >= 500) {
        req.log.error({ err }, "erro 5xx");
        return reply.code(err.statusCode).send({ error: "Erro interno" });
      }
      return reply.code(err.statusCode).send({ error: err.message });
    }
    if (err instanceof TikTokApiError) {
      const status =
        err.kind === "rate_limit" ? 429
        : err.kind === "token_expired" || err.kind === "auth_revoked" ? 401
        : 502;
      return reply.code(status).send({ error: err.toDbError() });
    }
    const fastifyErr = err as FastifyError;
    if (fastifyErr.validation) {
      // não ecoa o output bruto do validador (estrutura interna); só os campos
      const fields = fastifyErr.validation
        .map((v) => v.instancePath?.replace(/^\//, "") || v.params?.missingProperty)
        .filter(Boolean)
        .join(", ");
      return reply.code(400).send({ error: fields ? `Campos inválidos: ${fields}` : "Validação falhou" });
    }
    const status =
      typeof fastifyErr.statusCode === "number" && fastifyErr.statusCode >= 400
        ? fastifyErr.statusCode
        : 500;
    if (status >= 500) req.log.error({ err }, "erro não tratado");
    return reply
      .code(status)
      .send({ error: status >= 500 ? "Erro interno" : fastifyErr.message });
  });

  const auth = createAuthHooks(deps);
  registerHealthRoutes(app);
  registerMeRoutes(app, deps, auth);
  registerAuthTikTokRoutes(app, deps, auth);
  registerClientRoutes(app, deps, auth);
  registerPostRoutes(app, deps, auth);
  registerAnalyticsRoutes(app, deps, auth);
  registerApiKeyRoutes(app, deps, auth);
  registerAutomationRoutes(app, deps, auth);
  registerWorkflowRoutes(app, deps, auth);
  registerContentRoutes(app, deps, auth);
  registerWebhookRoutes(app, deps);

  app.addHook("onClose", async () => {
    await closeDeps(deps);
  });

  return app;
}
