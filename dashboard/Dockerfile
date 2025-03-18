# docker buildx build --platform linux/amd64 -t registry.rydersel.cloud/dashboard . --push

FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install dependencies required for Prisma with specific OpenSSL version
RUN apk add --no-cache openssl libc6-compat

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for Prisma
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
ENV PRISMA_CLIENT_ENGINE_TYPE=binary

# Generate Prisma client
RUN npx prisma generate

# Set Next.js telemetry to disabled
ENV NEXT_TELEMETRY_DISABLED=1

# Set build-time environment variables directly (minimal set needed just for build)
ENV NEXTAUTH_SECRET=temporary-build-secret-not-used-in-production
ENV NEXTAUTH_URL=http://localhost:3000
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install dependencies required for Prisma with specific OpenSSL version
RUN apk add --no-cache openssl libc6-compat

# Set environment variables for Prisma
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
ENV PRISMA_CLIENT_ENGINE_TYPE=binary
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Copy Prisma client from builder
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# This is optimized for Next.js 15.2.1 with the standalone output format
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"



CMD ["node", "server.js"]
