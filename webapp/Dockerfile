# Multi-stage build (STEP 7 item 7). Produces one image used for BOTH the
# web process (`node server.js`, Next's standalone output) and the worker
# process (`node worker.js`, this app's own durable-job worker) - see
# docker-compose.yml, which runs the same image twice with different
# commands. Building here (not copying host-built artifacts) also means
# `prisma generate`'s native query-engine binary is compiled for the
# container's own platform (linux), regardless of what OS this image is
# built on.

FROM node:20-slim AS deps
WORKDIR /app
# openssl is required by Prisma's query engine at runtime on Debian-slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL isn't needed to build (no DB access at build time), but
# `next build` evaluates next.config.mjs/instrumentation.ts's imports, and
# Prisma's generated client needs `npx prisma generate` to have already run
# (done above via deps stage's `npm ci` -> postinstall).
RUN npm run build

# --- Runtime image for the web process --------------------------------
FROM node:20-slim AS web
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# This app has no public/ directory (no static assets) - add a COPY here if
# one is added later.
EXPOSE 3000
CMD ["node", "server.js"]

# --- Runtime image for the worker process ------------------------------
# Reuses the build stage's full node_modules (worker.ts isn't part of
# Next's standalone trace) rather than the trimmed standalone output.
FROM node:20-slim AS worker
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/lib ./lib
COPY --from=build /app/package.json ./package.json
CMD ["node_modules/.bin/tsx", "lib/worker/run.ts"]
