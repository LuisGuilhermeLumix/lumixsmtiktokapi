import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get(
    "/health",
    { schema: { tags: ["infra"], description: "Healthcheck p/ EasyPanel" } },
    async () => ({
      status: "ok",
      service: "lsm-api",
      uptime: Math.round(process.uptime()),
    }),
  );
}
