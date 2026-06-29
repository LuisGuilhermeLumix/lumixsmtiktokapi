// Diagnóstico: mostra o ÚLTIMO run de automação (status, etapas, vídeos, cenas,
// erros) — pra responder "tá funcionando?". Uso: node scripts/diag-run.mjs
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadDotenv({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: runs } = await db
  .from("automation_runs")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(1);
const run = runs?.[0];
if (!run) {
  console.log("Nenhum run encontrado. Clique em Executar no designer primeiro.");
  process.exit(0);
}

console.log(`\n=== RUN ${run.id}`);
console.log(`status: ${run.status}${run.error ? `  | erro: ${run.error}` : ""}`);
console.log(`créditos: reservado=${run.credits_reserved} liquidado=${run.credits_settled}`);
console.log(`criado: ${run.created_at}`);

const { data: steps } = await db
  .from("automation_run_steps")
  .select("step, status, meta, created_at")
  .eq("run_id", run.id)
  .order("created_at", { ascending: true });
console.log(`\n--- ETAPAS (${steps?.length ?? 0})`);
for (const s of steps ?? []) {
  console.log(`  [${s.status}] ${s.step} ${s.meta && Object.keys(s.meta).length ? JSON.stringify(s.meta) : ""}`);
}

const { data: videos } = await db.from("automation_videos").select("*").eq("run_id", run.id);
console.log(`\n--- VÍDEOS (${videos?.length ?? 0})`);
for (const v of videos ?? []) {
  console.log(`  vídeo ${v.id.slice(-12)} status=${v.status}${v.error ? ` erro=${v.error}` : ""} final=${v.final_url ?? "—"}`);
  const { data: scenes } = await db.from("automation_scenes").select("*").eq("video_id", v.id).order("idx");
  for (const sc of scenes ?? []) {
    console.log(`     cena ${sc.idx} status=${sc.status}${sc.error ? ` erro=${sc.error}` : ""} img=${sc.image_url ? "ok" : "—"} vid=${sc.video_url ? "ok" : "—"}`);
  }
}

// dicas de diagnóstico
console.log("\n--- DIAGNÓSTICO");
if (run.status === "queued" || run.status === "planning") {
  console.log("  ⚠ Run parado em queued/planning → o WORKER provavelmente NÃO está rodando (ou sem Redis).");
} else if (run.status === "skipped") {
  console.log(`  ⚠ Run pulado: ${run.error} (ex.: sem contas conectadas / sem créditos / limite de fairness).`);
} else if (run.status === "failed") {
  console.log(`  ⚠ Run falhou: ${run.error ?? "ver erros das cenas acima"}.`);
} else if (run.status === "running") {
  console.log("  ⏳ Em execução — rode de novo em alguns segundos pra ver avançar.");
} else if (run.status === "done" || run.status === "partial") {
  console.log("  ✅ Pipeline concluiu! (done = tudo publicou; partial = parte falhou)");
}
process.exit(0);
