// Teste direto dos providers (sem API/Redis): submit → polling → URL.
//   node scripts/gen-test.mjs fal <modelId> "<prompt>" [duration]
//   node scripts/gen-test.mjs kie <modelId> "<prompt>" [duration]
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { falRunToCompletion } from "@lsm/shared/fal";
import { kieRunToCompletion } from "@lsm/shared/kie";

loadDotenv({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] });

const [provider, model, prompt, durationArg] = process.argv.slice(2);
if (!provider || !model || !prompt) {
  console.error('uso: node scripts/gen-test.mjs <fal|kie> <modelId> "<prompt>" [duration]');
  process.exit(1);
}
const input = { prompt };
if (durationArg) input.duration = Number(durationArg);

const t0 = Date.now();
console.log(`[${provider}] ${model}\n  prompt: ${prompt}\n  aguardando...`);

try {
  let rec;
  if (provider === "fal") {
    const key = process.env.FAL_KEY;
    if (!key) throw new Error("FAL_KEY ausente no .env");
    input.aspect_ratio = "9:16";
    rec = await falRunToCompletion(key, model, input, { timeoutMs: 9 * 60_000 });
  } else {
    const key = process.env.KIE_API_KEY;
    if (!key) throw new Error("KIE_API_KEY ausente no .env");
    input.aspect_ratio = "9:16";
    rec = await kieRunToCompletion(key, { model, input }, { timeoutMs: 9 * 60_000 });
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n=== RESULTADO (${secs}s) ===`);
  console.log("status:", rec.status);
  console.log("url:", rec.resultUrl);
  if (rec.error) console.log("erro:", rec.error);
  process.exit(rec.status === "done" ? 0 : 2);
} catch (e) {
  console.error("\nFALHOU:", e?.message ?? e);
  process.exit(1);
}
