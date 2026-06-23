// Conta atual: organização, plano, uso e papel. Base do onboarding e da
// futura tela de billing.

import type { FastifyInstance } from "fastify";
import type { ApiDeps } from "../deps.js";
import type { AuthHooks } from "../lib/auth.js";
import { getPlanContext } from "../lib/plan.js";

export function registerMeRoutes(app: FastifyInstance, deps: ApiDeps, auth: AuthHooks): void {
  app.get(
    "/me",
    {
      preHandler: [auth.authenticate],
      schema: { tags: ["account"], description: "Org, plano, uso e papel do usuário atual" },
    },
    async (req) => {
      const orgId = req.auth!.orgId;
      const [{ data: org }, { data: sub }, ctx, { data: planList }] = await Promise.all([
        deps.db.from("organizations").select("id, name, plan, credits_balance, trial_ends_at").eq("id", orgId).maybeSingle(),
        deps.db.from("subscriptions").select("status, current_period_end").eq("org_id", orgId).maybeSingle(),
        getPlanContext(deps, orgId),
        deps.db.from("plans").select("*").eq("active", true).order("sort", { ascending: true }),
      ]);

      return {
        user: { id: req.auth!.userId, role: req.auth!.role },
        org,
        plan: ctx.plan,
        usage: ctx.usage,
        subscription: sub ?? null,
        available_plans: planList ?? [],
      };
    },
  );
}
