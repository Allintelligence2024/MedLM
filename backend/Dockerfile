# syntax=docker/dockerfile:1
#
# MedAnki DZ — image backend NestJS.
#
# Multi-stage :
#   1. deps    — dépendances complètes (dev incluses) pour compiler
#   2. build   — `nest build` → dist/
#   3. runtime — node:22-alpine, deps de prod uniquement, user non-root
#
# Build depuis la RACINE du repo :
#   docker build -f backend/Dockerfile -t medanki/backend:latest .

# ── 1. deps ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# ── 2. build ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json backend/package-lock.json ./
COPY backend/tsconfig.json backend/nest-cli.json ./
COPY backend/src ./src
# nest-cli.json copie ../mobile/assets/content/*.json dans dist/ :
# le contexte de build doit donc contenir ce dossier.
COPY mobile/assets/content /mobile/assets/content
RUN mkdir -p ../mobile/assets && cp -r /mobile/assets/content ../mobile/assets/content
RUN npm run build

# Deps de production seules (arbre allégé pour l'image finale).
RUN npm ci --omit=dev && npm cache clean --force

# ── 3. runtime ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000

# wget sert au HEALTHCHECK ; tini fait office d'init (PID 1 propre).
RUN apk add --no-cache tini wget \
 && addgroup -g 10001 -S medanki \
 && adduser -u 10001 -S medanki -G medanki

WORKDIR /app
COPY --from=build --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/dist ./dist
COPY --chown=10001:10001 backend/package.json ./package.json
# Migrations SQL — nécessaires si le conteneur lance `npm run db:migrate`.
COPY --chown=10001:10001 backend/src/db/migrations ./dist/db/migrations

USER 10001:10001
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/v1/healthz" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
