import type { Json } from "@lsm/db";
import type { ApiDeps } from "../deps.js";

export interface AuditEntry {
  orgId: string;
  userId?: string | null;
  /** ex.: post.publish, account.connect, client.delete, api_key.create */
  action: string;
  /** ex.: post:<uuid>, social_account:<uuid> */
  entity: string;
  meta?: Json;
}

/** grava auditoria sem nunca derrubar a request (best-effort) */
export function logAudit(deps: ApiDeps, entry: AuditEntry): void {
  Promise.resolve(
    deps.db.from("audit_log").insert({
      org_id: entry.orgId,
      user_id: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      meta: entry.meta ?? {},
    }),
  ).catch(() => {});
}
