# docker buildx build --platform linux/amd64 -t registry.edurange.cloud/edurange/webos . --push

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

WORKDIR /app

# Copy only necessary files from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Set environment variables
ENV NODE_ENV=production

# Set ownership of application files to non-root user
RUN chown -R nextjs:nodejs /app

# Use the non-root user for subsequent operations
USER nextjs

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"]
