# ── @lsm/worker — BullMQ ─────────────────────────────────────────
# Build a partir da RAIZ do monorepo:
#   docker build -f apps/worker/Dockerfile .

FROM node:22-alpine AS builder
RUN npm install -g pnpm@9.15.9
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/tiktok/package.json packages/tiktok/
RUN pnpm install --frozen-lockfile --filter @lsm/worker...

COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm --filter @lsm/shared build \
  && pnpm --filter @lsm/db build \
  && pnpm --filter @lsm/tiktok build \
  && pnpm --filter @lsm/worker build

RUN pnpm --filter @lsm/worker deploy --prod /out

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# FFmpeg + ffprobe p/ a montagem multi-cena (auto-ffmpeg)
RUN apk add --no-cache ffmpeg
COPY --from=builder /out .

# healthcheck HTTP próprio do worker (HEALTH_PORT)
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/health || exit 1
CMD ["node", "dist/main.js"]
