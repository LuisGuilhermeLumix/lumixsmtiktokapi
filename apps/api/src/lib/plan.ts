// Planos & limites por organização. Centraliza as checagens de limite (clientes,
// contas sociais, etc.) — pronto para virar gating de billing no futuro.
// Limite null = ilimitado.

import type { Tables } from "@lsm/db";
import type { ApiDeps } from "../deps.js";
import { httpError } from "./errors.js";

export interface PlanUsage {
  clients: number;
  social_accounts: number;
}

export interface PlanContext {
  plan: Tables<"plans">;
  usage: PlanUsage;
}

const FREE_FALLBACK: Tables<"plans"> = {
  id: "free",
  name: "Free",
  max_clients: 1,
  max_social_accounts: 2,
  monthly_credits: 100,
  price_cents: 0,
  features: {},
  sort: 0,
  active: true,
  created_at: new Date(0).toISOString(),
};

/** carrega o plano da org + uso atual (clientes e contas conectadas) */
export async function getPlanContext(deps: ApiDeps, orgId: string): Promise<PlanContext> {
  const { data: org } = await deps.db
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();
  const planId = org?.plan ?? "free";
  const { data: plan } = await deps.db.from("plans").select("*").eq("id", planId).maybeSingle();

  const { count: clients } = await deps.db
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  const { data: clientRows } = await deps.db.from("clients").select("id").eq("org_id", orgId);
  const ids = (clientRows ?? []).map((c) => c.id);
  let social = 0;
  if (ids.length) {
    const { count } = await deps.db
      .from("social_accounts")
      .select("id", { count: "exact", head: true })
      .in("client_id", ids)
      .eq("status", "connected");
    social = count ?? 0;
  }

  return {
    plan: plan ?? FREE_FALLBACK,
    usage: { clients: clients ?? 0, social_accounts: social },
  };
}

function limitMsg(resource: string, planName: string): string {
  return `Limite de ${resource} do plano ${planName} atingido. Faça upgrade para continuar.`;
}

/** bloqueia se a org já atingiu o limite de clientes do plano */
export async function assertCanAddClient(deps: ApiDeps, orgId: string): Promise<void> {
  const { plan, usage } = await getPlanContext(deps, orgId);
  if (plan.max_clients != null && usage.clients >= plan.max_clients) {
    throw httpError(403, limitMsg("clientes", plan.name));
  }
}

/** bloqueia se a org já atingiu o limite de contas sociais do plano */
export async function assertCanAddSocialAccount(deps: ApiDeps, orgId: string): Promise<void> {
  const { plan, usage } = await getPlanContext(deps, orgId);
  if (plan.max_social_accounts != null && usage.social_accounts >= plan.max_social_accounts) {
    throw httpError(403, limitMsg("contas conectadas", plan.name));
  }
}
