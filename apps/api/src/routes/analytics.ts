import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";
import { assertAccountAccess, assertClientAccess, visibleClientIds } from "../lib/access.js";
import type { AuthHooks } from "../lib/auth.js";
import { httpError } from "../lib/errors.js";

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
  auth: AuthHooks,
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/analytics/accounts/:id",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["analytics"],
        description: "Série temporal de snapshots de uma conta (days OU from/to)",
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          days: z.coerce.number().int().min(1).max(365).default(30),
          from: z.string().datetime({ offset: true }).optional(),
          to: z.string().datetime({ offset: true }).optional(),
        }),
      },
    },
    async (req) => {
      const { account } = await assertAccountAccess(deps, req.auth!, req.params.id);
      // intervalo custom (from/to) tem prioridade sobre days
      const useRange = req.query.from && req.query.to;
      const since = useRange
        ? req.query.from!
        : new Date(Date.now() - req.query.days * 86_400_000).toISOString();

      let q = deps.db
        .from("analytics_snapshots")
        .select("captured_at, followers, following, likes, video_count")
        .eq("social_account_id", account.id)
        .gte("captured_at", since)
        .order("captured_at", { ascending: true });
      if (useRange) q = q.lte("captured_at", req.query.to!);
      const { data, error } = await q;
      if (error) throw httpError(500, error.message);

      return {
        account: {
          id: account.id,
          display_name: account.display_name,
          status: account.status,
        },
        snapshots: data ?? [],
      };
    },
  );

  r.get(
    "/analytics/overview",
    {
      preHandler: [auth.authenticate],
      schema: {
        tags: ["analytics"],
        description: "Agregado por org (ou por cliente via ?client_id=)",
        querystring: z.object({ client_id: z.string().uuid().optional() }),
      },
    },
    async (req) => {
      const orgId = req.auth!.orgId;

      // escopo de clients: filtro explícito > visibilidade do ator
      let clientIds: string[] | undefined;
      if (req.query.client_id) {
        await assertClientAccess(deps, req.auth!, req.query.client_id);
        clientIds = [req.query.client_id];
      } else {
        clientIds = await visibleClientIds(deps, req.auth!);
        if (clientIds === undefined) {
          const { data } = await deps.db.from("clients").select("id").eq("org_id", orgId);
          clientIds = (data ?? []).map((c) => c.id);
        }
      }
      if (clientIds.length === 0) {
        return { totals: emptyTotals(), accounts: [], top_videos: [] };
      }

      const { data: accounts } = await deps.db
        .from("social_accounts")
        .select("id, client_id, display_name, avatar_url, status")
        .in("client_id", clientIds);
      const accountIds = (accounts ?? []).map((a) => a.id);

      // último snapshot por conta
      const latestByAccount = new Map<string, { followers: number; likes: number; video_count: number }>();
      if (accountIds.length > 0) {
        // RPC distinct-on: 1 snapshot (o mais recente) por conta, sem heurística
        const { data: snaps } = await deps.db.rpc("latest_account_snapshots", {
          p_account_ids: accountIds,
        });
        for (const s of snaps ?? []) {
          latestByAccount.set(s.social_account_id, {
            followers: s.followers,
            likes: s.likes,
            video_count: s.video_count,
          });
        }
      }

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const [{ count: publishedThisMonth }, { count: scheduled }] = await Promise.all([
        deps.db
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .in("client_id", clientIds)
          .eq("status", "published")
          .gte("created_at", monthStart.toISOString()),
        deps.db
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .in("client_id", clientIds)
          .eq("status", "scheduled"),
      ]);

      // top vídeos: métricas mais recentes por alvo publicado
      const { data: published } = accountIds.length
        ? await deps.db
            .from("post_targets")
            .select("id, post_id, social_account_id, post_url")
            .in("social_account_id", accountIds)
            .eq("status", "published")
        : { data: [] as never[] };
      const targetIds = (published ?? []).map((t) => t.id);
      const latestMetricByTarget = new Map<string, { views: number; likes: number; comments: number; shares: number }>();
      if (targetIds.length > 0) {
        const { data: metrics } = await deps.db
          .from("video_metrics")
          .select("post_target_id, captured_at, views, likes, comments, shares")
          .in("post_target_id", targetIds)
          .order("captured_at", { ascending: false })
          .limit(500);
        for (const m of metrics ?? []) {
          if (!latestMetricByTarget.has(m.post_target_id)) {
            latestMetricByTarget.set(m.post_target_id, m);
          }
        }
      }
      const topVideos = (published ?? [])
        .map((t) => ({
          post_target_id: t.id,
          post_id: t.post_id,
          social_account_id: t.social_account_id,
          post_url: t.post_url,
          ...(latestMetricByTarget.get(t.id) ?? { views: 0, likes: 0, comments: 0, shares: 0 }),
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

      const totals = (accounts ?? []).reduce(
        (acc, a) => {
          const snap = latestByAccount.get(a.id);
          acc.followers += snap?.followers ?? 0;
          acc.likes += snap?.likes ?? 0;
          acc.videos += snap?.video_count ?? 0;
          return acc;
        },
        {
          followers: 0,
          likes: 0,
          videos: 0,
          accounts: (accounts ?? []).length,
          posts_published_month: publishedThisMonth ?? 0,
          posts_scheduled: scheduled ?? 0,
        },
      );

      return {
        totals,
        accounts: (accounts ?? []).map((a) => ({
          ...a,
          latest: latestByAccount.get(a.id) ?? null,
        })),
        top_videos: topVideos,
      };
    },
  );
}

const emptyTotals = () => ({
  followers: 0,
  likes: 0,
  videos: 0,
  accounts: 0,
  posts_published_month: 0,
  posts_scheduled: 0,
});
