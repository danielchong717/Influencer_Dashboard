# ── Stage 1: build client + server ────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Build client
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

# Build server
COPY server/package*.json ./server/
RUN cd server && npm install
COPY server/ ./server/
RUN cd server && npm run build

# ── Stage 2: lean production image ────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Production deps only
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Built artifacts
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# SQLite data directory (Fly volume mounts here)
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/dashboard.db

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
