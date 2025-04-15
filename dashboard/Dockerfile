# docker buildx build --platform linux/amd64 -t registry.edurange.cloud/edurange/dashboard . --push

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

# Set only non-sensitive build-time configurations
ARG PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
ARG NEXT_TELEMETRY_DISABLED=1

# Generate Prisma client
RUN npx prisma generate

# Use build arguments for build-time configuration (not sensitive values)
ARG BUILD_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
# Add build arguments for required environment variables
ARG GITHUB_CLIENT_ID=build-placeholder
ARG GITHUB_CLIENT_SECRET=build-placeholder
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000

# Build the application - using only essential build-time variables
RUN NEXT_TELEMETRY_DISABLED=1 \
    PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 \
    DATABASE_URL=${BUILD_DATABASE_URL} \
    NEXTAUTH_SECRET=build-time-only-not-saved-in-image \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    SKIP_ENV_VALIDATION=1 \
    npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install dependencies required for Prisma with specific OpenSSL version
RUN apk add --no-cache openssl libc6-compat

# Set only non-sensitive configuration
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Note: All sensitive environment variables must be provided at runtime
# via Kubernetes deployment config or secrets, including:
# - DATABASE_URL
# - NEXTAUTH_SECRET
# - NEXTAUTH_URL
# - Other sensitive configuration values

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
# Copy the featured packs needed by the API route
COPY --from=builder --chown=nextjs:nodejs /app/featured-packs ./featured-packs

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
