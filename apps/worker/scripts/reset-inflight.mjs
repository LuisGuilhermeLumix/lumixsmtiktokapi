// Reseta o contador de fairness "inflight:{org}" no Redis (destrava runs presos
// em "org no limite de fairness"). Uso: node scripts/reset-inflight.mjs
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { Redis } from "ioredis";

loadDotenv({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] });
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

const keys = await redis.keys("inflight:*");
if (!keys.length) {
  console.log("Nenhuma chave inflight:* — nada a resetar.");
} else {
  for (const k of keys) {
    const v = await redis.get(k);
    console.log(`  ${k} = ${v} → removendo`);
  }
  await redis.del(...keys);
  console.log(`OK — ${keys.length} chave(s) de inflight resetada(s).`);
}
await redis.quit();
process.exit(0);
