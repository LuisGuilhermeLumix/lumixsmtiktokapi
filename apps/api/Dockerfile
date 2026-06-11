# ── @lsm/api — Fastify ────────────────────────────────────────────
# Build a partir da RAIZ do monorepo:
#   docker build -f apps/api/Dockerfile .

FROM node:22-alpine AS builder
RUN npm install -g pnpm@9.15.9
WORKDIR /repo

# manifestos primeiro (cache de camadas do install)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/tiktok/package.json packages/tiktok/
RUN pnpm install --frozen-lockfile --filter @lsm/api...

COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @lsm/shared build \
  && pnpm --filter @lsm/db build \
  && pnpm --filter @lsm/tiktok build \
  && pnpm --filter @lsm/api build

# pasta standalone com node_modules de produção resolvidos
RUN pnpm --filter @lsm/api deploy --prod /out

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /out .

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "dist/server.js"]
