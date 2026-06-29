// Diagnóstico de métricas: por que "Views por vídeo" está zerado?
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadDotenv({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { count: snaps } = await db.from("analytics_snapshots").select("id", { count: "exact", head: true });
const { count: vmetrics } = await db.from("video_metrics").select("id", { count: "exact", head: true });
console.log(`analytics_snapshots: ${snaps ?? 0} linhas`);
console.log(`video_metrics: ${vmetrics ?? 0} linhas`);

const { data: targets } = await db
  .from("post_targets")
  .select("id, status, tiktok_video_id, post_url, social_account_id")
  .eq("status", "published")
  .limit(50);
console.log(`\npost_targets published: ${targets?.length ?? 0}`);
const withId = (targets ?? []).filter((t) => t.tiktok_video_id);
console.log(`  com tiktok_video_id (necessário p/ coletar métricas): ${withId.length}`);
console.log(`  SEM tiktok_video_id: ${(targets?.length ?? 0) - withId.length}`);
for (const t of (targets ?? []).slice(0, 8)) {
  console.log(`   target ${t.id.slice(0, 8)} videoId=${t.tiktok_video_id ?? "—"} url=${t.post_url ?? "—"}`);
}
process.exit(0);
