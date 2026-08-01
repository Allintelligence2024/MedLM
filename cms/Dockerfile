# syntax=docker/dockerfile:1
#
# MedAnki DZ — image CMS (Next.js 14, output: 'standalone').
#
# Build depuis la RACINE du repo :
#   docker build -f cms/Dockerfile -t medanki/cms:latest .

# ── 1. deps ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY cms/package.json cms/package-lock.json ./
RUN npm ci

# ── 2. build ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY cms/ ./
RUN npm run build

# ── 3. runtime ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache tini wget \
 && addgroup -g 10001 -S medanki \
 && adduser -u 10001 -S medanki -G medanki

WORKDIR /app
COPY --from=build --chown=10001:10001 /app/public ./public
COPY --from=build --chown=10001:10001 /app/.next/standalone ./
COPY --from=build --chown=10001:10001 /app/.next/static ./.next/static

USER 10001:10001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
