# docker buildx build --platform linux/amd64 -t registry.rydersel.cloud/terminal . --push

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for node-pty
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for node-pty and kubectl
RUN apk add --no-cache python3 make g++ git procps curl libcap \
    && curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
    && chmod +x kubectl \
    && mv kubectl /usr/local/bin/

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server

# Set environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    # Optimize Node.js for container environment
    NODE_OPTIONS="--max-old-space-size=512" \
    # Disable debugging
    NODE_DEBUG=""

# Expose the port
EXPOSE 3001

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1

# Start the server with optimized flags
CMD ["node", "--use-strict", "--max-old-space-size=512", "server/index.js"]

# Note: Run the container with enhanced security measures:
# docker run \
#   --security-opt seccomp=/etc/docker/seccomp-profile.json \
#   --security-opt no-new-privileges \
#   --read-only \
#   --tmpfs /app/tmp:rw,noexec,nosuid,size=100M \
#   --tmpfs /app/run:rw,noexec,nosuid,size=50M \
#   --mount type=bind,source=/path/to/logs,target=/app/logs,readonly=false \
#   --cap-add=SYS_ADMIN \
#   --cap-add=NET_BIND_SERVICE \
#   --cap-add=SYS_PTRACE \
#   --cpus=1 \
#   --memory=512M \
#   --memory-swap=512M \
#   --pids-limit=100 \
#   --ulimit nofile=1024:1024 \
#   --ulimit nproc=100:100 \
#   --ulimit core=0 \
#   registry.rydersel.cloud/terminal




