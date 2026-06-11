// Autenticação: Supabase JWT (dashboard) ou API key (n8n/curl).
//   Authorization: Bearer <jwt supabase>
//   Authorization: Apikey <lsm_...>

import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import type { UserRole } from "@lsm/shared";
import type { ApiDeps } from "../deps.js";
import { httpError } from "./errors.js";

export interface AuthContext {
  orgId: string;
  /** null quando a API key não tem created_by */
  userId: string | null;
  role: UserRole;
  via: "jwt" | "apikey";
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface AuthHooks {
  /** preHandler: exige autenticação e popula request.auth */
  authenticate: preHandlerHookHandler;
  /** preHandler adicional: exige um dos papéis (usar APÓS authenticate) */
  requireRole: (...roles: UserRole[]) => preHandlerHookHandler;
}

export function createAuthHooks(deps: ApiDeps): AuthHooks {
  async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = req.headers.authorization;
    if (!header) throw httpError(401, "Header Authorization ausente");

    if (header.startsWith("Bearer ")) {
      const jwt = header.slice("Bearer ".length).trim();
      const { data, error } = await deps.db.auth.getUser(jwt);
      if (error || !data.user) throw httpError(401, "Token inválido ou expirado");

      const { data: member } = await deps.db
        .from("users")
        .select("org_id, role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!member) throw httpError(403, "Usuário não pertence a nenhuma organização");

      req.auth = { orgId: member.org_id, userId: data.user.id, role: member.role, via: "jwt" };
      return;
    }

    if (header.toLowerCase().startsWith("apikey ")) {
      const key = header.slice("apikey ".length).trim();
      const { data: row } = await deps.db
        .from("api_keys")
        .select("id, org_id, created_by, revoked_at")
        .eq("key_hash", hashApiKey(key))
        .maybeSingle();
      if (!row || row.revoked_at) throw httpError(401, "API key inválida ou revogada");

      // marca uso sem bloquear a request
      Promise.resolve(
        deps.db
          .from("api_keys")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", row.id),
      ).catch(() => {});

      // API key opera com poderes de admin da org
      req.auth = { orgId: row.org_id, userId: row.created_by, role: "admin", via: "apikey" };
      return;
    }

    throw httpError(401, "Esquema não suportado — use Bearer <jwt> ou Apikey <key>");
  }

  function requireRole(...roles: UserRole[]): preHandlerHookHandler {
    return async (req: FastifyRequest) => {
      if (!req.auth) throw httpError(401, "Não autenticado");
      if (!roles.includes(req.auth.role)) {
        throw httpError(403, `Requer papel: ${roles.join(" ou ")}`);
      }
    };
  }

  return { authenticate, requireRole };
}
