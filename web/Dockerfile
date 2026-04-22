FROM node:20-bullseye-slim AS base
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

# Set correct permissions for nextjs user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Also need to copy node_modules for prisma if using serverExternalPackages
# However, standalone usually bundles most things. 
# But for Prisma, we need the engines.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Note: We can't run prisma db push here easily without full node_modules
# It's better to run it in a pre-deploy hook or during build.
# For now, we'll assume the DB is ready or run it via a script if needed.
CMD ["node", "server.js"]
