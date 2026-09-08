FROM node:22-bookworm-slim AS base

WORKDIR /app

# Prisma 运行时需要 OpenSSL
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*


# =========================
# Dependencies
# =========================
FROM base AS dependencies

COPY package.json package-lock.json ./
RUN npm ci


# =========================
# Builder
# =========================
FROM base AS builder

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY . .

RUN npx prisma generate
RUN npm run build


# =========================
# Runner
# =========================
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# standalone 已经包含 Next.js 运行所需依赖
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

COPY --from=builder --chown=nextjs:nodejs \
  /app/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs \
  /app/prisma ./prisma

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]