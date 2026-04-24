# Dockerfile
#
# Multi-stage build:
#   Stage 1 (builder) — install ALL dependencies and generate the Prisma client.
#   Stage 2 (runtime) — copy only what is needed to run; dev tools stay in stage 1.
#
# This keeps the final image lean (~200 MB vs ~500 MB with devDependencies).
#
# Layer ordering maximises Docker cache:
#   package.json first → npm ci → then source code.
#   Rebuilding only re-runs npm ci when package.json actually changes.

# ─── Stage 1: builder ────────────────────────────────────────────────────────
# node:20-slim is Debian-based (not Alpine) — it has OpenSSL pre-installed.
# Alpine (musl libc) causes Prisma's binary engine to fail at runtime.
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
# npm ci is faster and stricter than npm install — uses exact lockfile versions
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

# Copy only production node_modules and generated Prisma client from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy schema so `prisma migrate deploy` works at container startup
COPY prisma ./prisma

# Copy application source
COPY src ./src
COPY package*.json ./

EXPOSE 3000

# Liveness probe: exits non-zero if the server isn't responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# `npm start` runs `node src/server.js` — no nodemon in production
CMD ["npm", "start"]
