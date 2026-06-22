// Sonda quais modelos de vídeo o plano da Magic Hour aceita (só create, sem render).
//   node scripts/mh-probe.mjs            → tenta sem model (default do plano)
//   node scripts/mh-probe.mjs kling-2.5  → tenta um model específico
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { mhCreateVideo, mhGetVideo, MagicHourError } from "@lsm/shared/magichour";

loadDotenv({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] });
const key = process.env.MAGICHOUR_API_KEY;
if (!key) { console.error("MAGICHOUR_API_KEY ausente"); process.exit(1); }

// modo status: node mh-probe.mjs status <id>  → faz polling até concluir
if (process.argv[2] === "status") {
  const id = process.argv[3];
  for (let i = 0; i < 120; i++) {
    const r = await mhGetVideo(key, id);
    process.stdout.write(`\r[${i}] status=${r.status}            `);
    if (r.status === "done" || r.status === "failed") {
      console.log(`\nstatus=${r.status}\nurl=${r.resultUrl}\nerro=${r.error}`);
      process.exit(r.status === "done" ? 0 : 2);
    }
    await new Promise((res) => setTimeout(res, 6000));
  }
  console.log("\ntimeout");
  process.exit(2);
}

const model = process.argv[2];
const res = process.argv[3]; // "none" => omite resolution
const params = {
  prompt: "a cat astronaut dancing on mars, cinematic, vertical",
  endSeconds: 5,
  aspectRatio: "9:16",
};
if (model && model !== "none") params.model = model;
if (res && res !== "none") params.resolution = res;

try {
  const r = await mhCreateVideo(key, params);
  console.log(`OK  model=${model ?? "(default)"}  id=${r.id}  credits=${r.creditsCharged}`);
} catch (e) {
  const code = e instanceof MagicHourError ? e.status : "?";
  console.log(`ERRO model=${model ?? "(default)"}  [${code}] ${e.message}`);
}
process.exit(0);
