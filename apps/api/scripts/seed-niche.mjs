// Seed do niche pack GLOBAL "fazenda-ugc" (org_id null) via service role.
// Idempotente (upsert por id). Rodar uma vez após aplicar a migration 0005.
//   node scripts/seed-niche.mjs
// ⚠️ Hooks são PLACEHOLDERS representativos (BR/UK/DE) — troque pelos reais.
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadDotenv({ path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")] });
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const data = {
  hooks: [
    // PT-BR (placeholders)
    { lang: "pt-BR", text: "Você não vai acreditar no que acontece nessa fazenda às 5 da manhã." },
    { lang: "pt-BR", text: "Ninguém te conta a verdade sobre a vida no campo — até agora." },
    { lang: "pt-BR", text: "3 coisas que todo mundo erra ao começar na roça." },
    // EN-GB (placeholders)
    { lang: "en-GB", text: "Nobody tells you what really happens on a farm at sunrise." },
    { lang: "en-GB", text: "This tiny farm trick changed everything for us." },
    { lang: "en-GB", text: "Here's the truth about country life no one shows you." },
    // DE (placeholders)
    { lang: "de", text: "Das passiert wirklich um 5 Uhr morgens auf dem Bauernhof." },
    { lang: "de", text: "Diesen Fehler machen fast alle Anfänger auf dem Land." },
    { lang: "de", text: "Die Wahrheit über das Landleben, die dir niemand zeigt." },
  ],
  banned_terms: ["celebrity", "public figure", "real person"],
  replacements: { celebrity: "person", "public figure": "person" },
  style: {
    look: "UGC autêntico, luz natural, vertical 9:16",
    character: "personagem fictício e anônimo, adulto",
  },
};

const { data: row, error } = await db
  .from("niche_packs")
  .upsert({ id: "fazenda-ugc", org_id: null, name: "Fazenda UGC", data }, { onConflict: "id" })
  .select("id, name")
  .single();

if (error) { console.error("Erro no seed:", error.message); process.exit(1); }
console.log("Seed OK:", row, `· ${data.hooks.length} hooks`);
process.exit(0);
