// Diagnóstico do Estúdio IA: usa a service role p/ checar se a migration 0004
// foi aplicada e listar orgs/créditos. Opcional: semear créditos.
//   node scripts/studio-check.mjs                 → checa
//   node scripts/studio-check.mjs seed <orgId> 1000  → dá créditos a uma org
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadDotenv({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function tableExists(name) {
  const { error } = await db.from(name).select("*", { head: true, count: "exact" }).limit(1);
  if (error && /does not exist|schema cache|relation/i.test(error.message)) return false;
  if (error) return { error: error.message };
  return true;
}

const [cmd, orgArg, amtArg] = process.argv.slice(2);

if (cmd === "seed") {
  const amount = Number(amtArg ?? 1000);
  const { data, error } = await db
    .from("organizations")
    .update({ credits_balance: amount })
    .eq("id", orgArg)
    .select("id, name, credits_balance");
  if (error) { console.error("Erro ao semear:", error.message); process.exit(1); }
  console.log("Créditos atualizados:", data);
  process.exit(0);
}

if (cmd === "apikey") {
  const plaintext = `lsm_${randomBytes(24).toString("hex")}`;
  const { data, error } = await db
    .from("api_keys")
    .insert({
      org_id: orgArg,
      name: amtArg ?? "studio-test",
      key_prefix: plaintext.slice(0, 12),
      key_hash: createHash("sha256").update(plaintext).digest("hex"),
    })
    .select("id, name")
    .single();
  if (error) { console.error("Erro ao criar API key:", error.message); process.exit(1); }
  console.log("API key criada:", data.name);
  console.log("KEY (use em Authorization: Apikey <key>):\n" + plaintext);
  process.exit(0);
}

console.log("=== Migration 0004 (tabelas do Estúdio) ===");
for (const t of ["generations", "content_automations", "credit_ledger"]) {
  console.log(`  ${t}:`, await tableExists(t));
}

console.log("\n=== organizations.credits_balance ===");
const orgs = await db.from("organizations").select("id, name, credits_balance");
if (orgs.error) console.log("  erro/coluna ausente:", orgs.error.message);
else console.table(orgs.data);

console.log("\n=== contas TikTok conectadas (p/ esteira) ===");
const accts = await db
  .from("social_accounts")
  .select("id, display_name, status, client_id")
  .eq("status", "connected");
if (accts.error) console.log("  erro:", accts.error.message);
else console.table(accts.data);
