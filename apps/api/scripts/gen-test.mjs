// Teste direto dos providers (sem API/Redis): create → polling → URL.
//   node scripts/gen-test.mjs magichour <model> "<prompt>" [seconds]
//   node scripts/gen-test.mjs kie <modelId> "<prompt>" [duration]
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { mhRunToCompletion } from "@lsm/shared/magichour";
import { kieRunToCompletion } from "@lsm/shared/kie";

loadDotenv({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] });

const [provider, model, prompt, durationArg] = process.argv.slice(2);
if (!provider || !model || !prompt) {
  console.error('uso: node scripts/gen-test.mjs <magichour|kie> <model> "<prompt>" [seconds]');
  process.exit(1);
}

const t0 = Date.now();
console.log(`[${provider}] ${model}\n  prompt: ${prompt}\n  aguardando...`);

try {
  let rec;
  if (provider === "magichour") {
    const key = process.env.MAGICHOUR_API_KEY;
    if (!key) throw new Error("MAGICHOUR_API_KEY ausente no .env");
    rec = await mhRunToCompletion(
      key,
      {
        model,
        prompt,
        endSeconds: durationArg ? Number(durationArg) : 5,
        aspectRatio: "9:16",
        resolution: "720p",
      },
      { timeoutMs: 12 * 60_000 },
    );
  } else {
    const key = process.env.KIE_API_KEY;
    if (!key) throw new Error("KIE_API_KEY ausente no .env");
    const input = { prompt, aspect_ratio: "9:16" };
    if (durationArg) input.duration = Number(durationArg);
    rec = await kieRunToCompletion(key, { model, input }, { timeoutMs: 12 * 60_000 });
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
