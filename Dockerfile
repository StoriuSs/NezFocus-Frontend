# syntax=docker/dockerfile:1.10
# ============================================================================
# Multi-Stage Dockerfile for React (Vite + TailwindCSS)
# ============================================================================
# Stages:
#   1. base        — Shared Node.js base, pnpm enabled via corepack
#   2. deps        — Install all dependencies via pnpm (frozen-lockfile)
#   3. build       — Compile React app → static files in /app/dist
#   4. dev         — Development image (Vite dev server with HMR)
#   5. prod        — Production image (unprivileged nginx serving static files)
#
# Usage:
#   Dev:   docker build --target dev  -t react-starter:dev .
#   Prod:  docker build --target prod -t react-starter:prod .
# ============================================================================

# ----- Stage 1: Base -----
# The exact release, as the API's Dockerfile pins it: `node:22-alpine` built
# with whichever Node 22 was newest that day. Renovate proposes the next one.
FROM node:22.23.2-alpine AS base

# Enable pnpm via corepack. The exact pnpm version is pinned in package.json
# via the `packageManager` field — corepack reads it once package.json is
# present in the working dir. Pinning host + container to the same pnpm
# version avoids the "works locally but not in Docker" class of bugs that
# come from pnpm v10 vs v11 install-script-gating differences.
RUN corepack enable

WORKDIR /app

# ----- Stage 2: Dependencies -----
FROM base AS deps

# pnpm-lock.yaml replaces package-lock.json. .npmrc carries pnpm settings,
# pnpm-workspace.yaml the rest (which install scripts may run, overrides):
# without it here, an override added there made the lockfile disagree with
# the install, and --frozen-lockfile failed the build.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# --ignore-scripts skips the `prepare` lifecycle hook (husky), which fails
# inside Docker because there is no .git directory in the build context.
# --frozen-lockfile makes the install fail if pnpm-lock.yaml would need to
# change — guarantees the lockfile is authoritative across host/CI/Docker.
# The pnpm store lives in a BuildKit cache mount, so a lockfile change
# re-downloads only the packages that changed, not all of them.
RUN --mount=type=cache,id=react-starter-pnpm-store,target=/pnpm/store,sharing=locked \
	pnpm install --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

# ----- Stage 3: Build -----
# The addresses this app talks to are NOT built in: the container writes them
# into /config.js when it starts (nginx/40-runtime-config.sh), so one image
# runs in any environment. Only what belongs to the build itself is an ARG.
FROM deps AS build

# Error tracking's release name, so the uploaded sourcemaps and the events the
# browser sends carry the same one. The compose file passes deploy.sh's
# APP_TAG (the commit); the DSN is a runtime setting.
ARG VITE_SENTRY_RELEASE
# Where the sourcemaps go. The auth token is a build secret, not an ARG: an
# ARG's value is kept in the build cache and history.
ARG SENTRY_ORG
ARG SENTRY_PROJECT

COPY . .
# The Content-Security-Policy is generated as a template: the hashes of the
# built pages' inline scripts now, this environment's origins at container
# start. Sourcemaps are uploaded during the build when the sentry_auth_token
# secret is given, then deleted; no .map file may reach the served files.
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN,required=false \
	pnpm run build \
	&& find dist -name '*.map' -delete \
	&& node scripts/csp.mjs dist > /app/csp.conf.template

# ----- Stage 4: Development -----
FROM deps AS dev

COPY . .

EXPOSE 3001

# No "--" before the flag: npm strips it, but pnpm forwards it literally,
# and Vite ignores everything after "--" — so it listened on the
# container's localhost only and the published port answered empty.
CMD ["pnpm", "run", "dev", "--host", "0.0.0.0"]

# ----- Stage 5: Production -----
# Serve static files with nginx — no Node.js runtime needed. The unprivileged
# image runs nginx as a non-root user, so a compromise of the web server
# doesn't start as root; the trade-off is listening on 8080 rather than 80.
FROM nginxinc/nginx-unprivileged:1.30.6-alpine AS prod

# Alpine's security fixes, which land before nginx's image is rebuilt with
# them: without this, a CVE Alpine has already fixed (libexpat's
# CVE-2026-93990, 2026-09) fails the Trivy scan until upstream catches up.
# Root only for the upgrade; the image's own non-root user (101) after.
USER root
RUN apk upgrade --no-cache
USER 101

# Custom nginx config and the header snippet each location includes.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
# The policy's template, and the script that fills it in and writes
# /config.js. nginx's image runs every /docker-entrypoint.d/*.sh before nginx
# starts, so both files exist by the time nginx reads its configuration.
COPY --from=build /app/csp.conf.template /etc/nginx/csp.conf.template
COPY --chmod=755 nginx/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh

# Copy built static files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# 127.0.0.1, not localhost: in Alpine, localhost can resolve to ::1 first,
# and nginx here listens on IPv4 only.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
