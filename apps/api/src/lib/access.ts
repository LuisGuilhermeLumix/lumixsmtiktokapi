// Regras de acesso multi-tenant (espelham o RLS, aplicadas aqui porque
// a API opera com service role): org própria; operator só clients atribuídos.

import type { Tables } from "@lsm/db";
import type { ApiDeps } from "../deps.js";
import type { AuthContext } from "./auth.js";
import { httpError } from "./errors.js";

/** ids de clients que um operator pode acessar */
export async function getAssignedClientIds(deps: ApiDeps, userId: string): Promise<string[]> {
  const { data, error } = await deps.db
    .from("client_assignments")
    .select("client_id")
    .eq("user_id", userId);
  if (error) throw httpError(500, `Falha ao carregar atribuições: ${error.message}`);
  return (data ?? []).map((r) => r.client_id);
}

/** garante que o client existe, é da org e que o ator pode acessá-lo */
export async function assertClientAccess(
  deps: ApiDeps,
  auth: AuthContext,
  clientId: string,
): Promise<Tables<"clients">> {
  const { data: client, error } = await deps.db
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw httpError(500, `Falha ao carregar cliente: ${error.message}`);
  if (!client || client.org_id !== auth.orgId) throw httpError(404, "Cliente não encontrado");

  if (auth.role === "operator") {
    if (!auth.userId) throw httpError(403, "Sem acesso a este cliente");
    const assigned = await getAssignedClientIds(deps, auth.userId);
    if (!assigned.includes(clientId)) throw httpError(403, "Sem acesso a este cliente");
  }
  return client;
}

/** acesso a uma conta social (via client dono dela) */
export async function assertAccountAccess(
  deps: ApiDeps,
  auth: AuthContext,
  socialAccountId: string,
): Promise<{ account: Tables<"social_accounts">; client: Tables<"clients"> }> {
  const { data: account, error } = await deps.db
    .from("social_accounts")
    .select("*")
    .eq("id", socialAccountId)
    .maybeSingle();
  if (error) throw httpError(500, `Falha ao carregar conta: ${error.message}`);
  if (!account) throw httpError(404, "Conta não encontrada");
  const client = await assertClientAccess(deps, auth, account.client_id);
  return { account, client };
}

/** lista de client_ids visíveis ao ator (undefined = todos da org) */
export async function visibleClientIds(
  deps: ApiDeps,
  auth: AuthContext,
): Promise<string[] | undefined> {
  if (auth.role !== "operator") return undefined;
  if (!auth.userId) return [];
  return getAssignedClientIds(deps, auth.userId);
}
