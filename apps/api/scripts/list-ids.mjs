// Lista orgs, clientes e contas conectadas com seus UUIDs (p/ usar no n8n).
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadDotenv({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: orgs } = await db.from("organizations").select("id, name, plan");
for (const org of orgs ?? []) {
  console.log(`\n=== ORG: ${org.name} (${org.plan}) — ${org.id} ===`);
  const { data: clients } = await db.from("clients").select("id, name").eq("org_id", org.id);
  for (const c of clients ?? []) {
    console.log(`  CLIENTE "${c.name}"  client_id = ${c.id}`);
    const { data: accts } = await db
      .from("social_accounts")
      .select("id, display_name, status")
      .eq("client_id", c.id);
    for (const a of accts ?? []) {
      console.log(`      conta "${a.display_name ?? "TikTok"}" [${a.status}]  social_account_id = ${a.id}`);
    }
    if (!accts?.length) console.log("      (sem contas conectadas)");
  }
  const { data: keys } = await db
    .from("api_keys")
    .select("name, key_prefix, revoked_at")
    .eq("org_id", org.id);
  for (const k of keys ?? []) console.log(`  API KEY "${k.name}" ${k.key_prefix}… ${k.revoked_at ? "(revogada)" : ""}`);
}
process.exit(0);
