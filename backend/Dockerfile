# Multi-stage production Dockerfile for MeetSpace Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY data/ ./data/

# Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Create non-privileged system user for security
RUN addgroup -S meetspace && adduser -S meetspace -G meetspace

# Create recordings directory with proper permissions
RUN mkdir -p /app/recordings && chown -R meetspace:meetspace /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src

USER meetspace

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health/live || exit 1

CMD ["node", "src/server.js"]
