import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDeps } from "./deps.js";

async function main() {
  const config = loadConfig();
  const deps = createDeps(config);
  const app = await buildApp(deps);

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, "encerrando...");
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`docs em http://localhost:${config.PORT}/docs`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
